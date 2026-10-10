'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = 'mattpocock/skills';
const REF = 'main';
const COMMIT_URL = `https://api.github.com/repos/${REPO}/commits/${REF}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${REF}/`;
const SKILL_FILES = [
  'skills/productivity/grill-me/SKILL.md',
  'skills/productivity/grilling/SKILL.md',
  'skills/engineering/grill-with-docs/SKILL.md',
  'skills/engineering/domain-modeling/SKILL.md',
  'skills/engineering/domain-modeling/GLOSSARY-FORMAT.md',
  'skills/engineering/domain-modeling/ADR-FORMAT.md'
];

function emptyMeta() {
  return {
    repo: REPO,
    ref: REF,
    sha: null,
    date: null,
    checkedAt: null,
    updated: false,
    behind: false,
    status: 'unknown',
    files: [],
    error: null
  };
}

function readMeta(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyMeta();
    return {
      ...emptyMeta(),
      sha: typeof parsed.sha === 'string' ? parsed.sha : null,
      date: typeof parsed.date === 'string' ? parsed.date : null,
      checkedAt: typeof parsed.checkedAt === 'string' ? parsed.checkedAt : null,
      updated: Boolean(parsed.updated),
      behind: Boolean(parsed.behind),
      status: typeof parsed.status === 'string' ? parsed.status : 'cached',
      files: Array.isArray(parsed.files) ? parsed.files : [],
      error: typeof parsed.error === 'string' ? parsed.error : null
    };
  } catch (_) {
    return emptyMeta();
  }
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temporary, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temporary, file);
}

async function fetchText(fetchImpl, url, timeoutMs) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'Planwharf', Accept: 'application/vnd.github+json' },
      signal: ac ? ac.signal : undefined
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createSkillsCache(options) {
  const opts = options && typeof options === 'object' ? options : {};
  if (typeof opts.dir !== 'string' || !opts.dir.trim()) throw new Error('skills cache directory required');
  const dir = opts.dir;
  const metaFile = path.join(dir, 'meta.json');
  const fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : globalThis.fetch;
  const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 4000;
  let meta = readMeta(metaFile);
  let inflight = null;

  function snapshot() {
    return { ...meta, repo: REPO, ref: REF, behind: Boolean(meta.behind) };
  }

  function read(relative) {
    if (typeof relative !== 'string' || !relative.trim()) return '';
    const root = path.resolve(dir);
    const target = path.resolve(dir, relative);
    if (!target.startsWith(root)) return '';
    try { return fs.readFileSync(target, 'utf8'); } catch (_) { return ''; }
  }

  async function sync() {
    if (typeof fetchImpl !== 'function') {
      meta = { ...meta, status: 'offline', error: 'fetch unavailable', checkedAt: now() };
      return snapshot();
    }
    try {
      const commit = await fetchText(fetchImpl, COMMIT_URL, timeoutMs);
      if (!commit.ok) throw new Error(`github ${commit.status}`);
      const body = JSON.parse(commit.text);
      const sha = body && typeof body.sha === 'string' ? body.sha : '';
      const date = body && body.commit && body.commit.committer && typeof body.commit.committer.date === 'string'
        ? body.commit.committer.date
        : (body && body.commit && body.commit.author && body.commit.author.date) || null;
      if (!sha) throw new Error('github commit missing');
      const same = meta.sha === sha && Array.isArray(meta.files) && SKILL_FILES.every(file => meta.files.includes(file));
      if (!same) {
        const files = [];
        for (const relative of SKILL_FILES) {
          const got = await fetchText(fetchImpl, RAW_BASE + relative, timeoutMs);
          if (!got.ok) continue;
          const target = path.join(dir, relative);
          writeAtomic(target, got.text);
          files.push(relative);
        }
        if (!files.length) throw new Error('no skill files downloaded');
        meta = {
          repo: REPO,
          ref: REF,
          sha,
          date,
          checkedAt: now(),
          updated: true,
          behind: false,
          status: 'current',
          files,
          error: null
        };
      } else {
        meta = {
          ...meta,
          repo: REPO,
          ref: REF,
          date: date || meta.date,
          checkedAt: now(),
          updated: false,
          behind: false,
          status: 'current',
          error: null
        };
      }
      writeAtomic(metaFile, meta);
    } catch (error) {
      const cached = Boolean(meta.sha);
      meta = {
        ...meta,
        checkedAt: now(),
        updated: false,
        behind: cached,
        status: cached ? 'cached' : 'offline',
        error: error && error.message ? error.message : 'skills sync failed'
      };
      try { writeAtomic(metaFile, meta); } catch (_) {}
    }
    return snapshot();
  }

  function ensure() {
    if (!inflight) inflight = sync().finally(() => { inflight = null; });
    return inflight;
  }

  return { snapshot, sync, ensure, read };
}

module.exports = { createSkillsCache, SKILL_FILES, REPO, REF };
