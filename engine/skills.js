'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const REPO = 'mattpocock/skills', REF = 'main';
const API = `https://api.github.com/repos/${REPO}`;
const SKILL_FILES = ['skills/productivity/grill-me/SKILL.md', 'skills/productivity/grilling/SKILL.md', 'skills/engineering/grill-with-docs/SKILL.md', 'skills/engineering/domain-modeling/SKILL.md', 'skills/engineering/domain-modeling/GLOSSARY-FORMAT.md', 'skills/engineering/domain-modeling/ADR-FORMAT.md'];
const emptyMeta = () => ({ repo: REPO, ref: REF, sha: null, date: null, installedAt: null, checkedAt: null, updated: false, behind: false, status: 'unknown', files: [], catalog: [], error: null });
function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temporary, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temporary, file);
}
function createSkillsCache(options = {}) {
  if (!options.dir) throw new Error('skills cache directory required');
  const dir = path.resolve(options.dir), metaFile = path.join(dir, 'meta.json');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date().toISOString());
  let meta = emptyMeta(), inflight = null, checking = false;
  try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaFile, 'utf8')) }; } catch {}
  function catalogComplete() {
    if (!meta.revisionDir || !Array.isArray(meta.files) || !Array.isArray(meta.catalog)) return false;
    const skills = meta.files.filter(file => typeof file === 'string' && file.endsWith('/SKILL.md'));
    if (!skills.length || skills.length !== meta.catalog.length) return false;
    if (!meta.files.every(relative => { try { const file = fileFor(relative); return Boolean(file && fs.statSync(file).isFile()); } catch { return false; } })) return false;
    return skills.every(relative => meta.catalog.some(item => item && item.relative === relative) && (() => { try { const file = fileFor(relative); return Boolean(file && fs.statSync(file).size > 0); } catch { return false; } })());
  }
  const snapshot = () => {
    const complete = catalogComplete();
    return { ...meta, status: meta.status === 'current' && !complete ? 'incomplete' : meta.status, checking, catalogComplete: complete, skillCount: Array.isArray(meta.catalog) ? meta.catalog.length : 0 };
  };
  const safePath = relative => typeof relative === 'string' && (relative === 'LICENSE' || /^skills\/(?:[\w.-]+\/)*[\w.-]+$/.test(relative)) && !relative.split('/').includes('..');
  function fileFor(relative) {
    if (!safePath(relative)) return null;
    const target = path.resolve(dir, meta.revisionDir || '', relative);
    return target.startsWith(dir + path.sep) ? target : null;
  }
  function read(relative) { try { const file = fileFor(relative); return file ? fs.readFileSync(file, 'utf8') : ''; } catch { return ''; } }
  async function get(url) {
    const response = await fetchImpl(url, { headers: { 'User-Agent': 'Planwharf', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(options.timeoutMs || 8000) });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    return response.text();
  }
  async function sync() {
    checking = true;
    try {
      const commit = JSON.parse(await get(`${API}/commits/${REF}`));
      const sha = commit.sha;
      if (typeof sha !== 'string' || !/^[a-f0-9]{12,40}$/i.test(sha)) throw new Error('GitHub commit missing or invalid');
      const tree = JSON.parse(await get(`${API}/git/trees/${sha}?recursive=1`));
      if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('GitHub skill catalog incomplete');
      const files = tree.tree.filter(item => item.type === 'blob' && safePath(item.path)).map(item => item.path);
      if (!files.some(file => file.endsWith('/SKILL.md'))) throw new Error('No skills found at the latest revision');
      const same = meta.sha === sha && catalogComplete() && files.length === meta.files.length && files.every(file => meta.files.includes(file) && fs.existsSync(fileFor(file)));
      if (!same) {
        // Each complete revision is immutable; a failed update keeps the previous cache intact.
        const revisionDir = `revisions/${sha}-${crypto.randomUUID()}`;
        const catalog = [];
        let next = 0;
        const downloads = await Promise.allSettled(Array.from({ length: Math.min(6, files.length) }, async () => {
          while (next < files.length) {
            const relative = files[next++];
            const text = await get(`https://raw.githubusercontent.com/${REPO}/${sha}/${relative}`);
            writeAtomic(path.join(dir, revisionDir, relative), text);
            if (relative.endsWith('/SKILL.md')) {
              const description = text.match(/^description:\s*(.+)$/m)?.[1] || '';
              catalog.push({ name: relative.split('/').at(-2), relative, description });
            }
          }
        }));
        const failure = downloads.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        catalog.sort((a, b) => a.relative.localeCompare(b.relative));
        meta = { ...emptyMeta(), sha, revisionDir, files, catalog, installedAt: now(), updated: true };
      } else meta.updated = false;
      meta = { ...meta, date: commit.commit?.committer?.date || commit.commit?.author?.date || null, checkedAt: now(), status: 'current', behind: false, error: null };
      writeAtomic(metaFile, meta);
    } catch (error) {
      meta = { ...meta, checkedAt: now(), updated: false, status: meta.sha ? 'cached' : 'offline', behind: false, error: error.message };
      try { writeAtomic(metaFile, meta); } catch {}
    } finally { checking = false; }
    return snapshot();
  }
  function ensure() { if (!inflight) inflight = sync().finally(() => { inflight = null; }); return inflight; }
  function prompt(role, context = '') {
    if (!catalogComplete()) return '';
    const selected = role === 'research' ? ['research'] : role === 'audit' ? ['code-review'] : /\b(bug|fix|error|fail|debug)\b/i.test(context) ? ['diagnosing-bugs', 'tdd'] : role === 'worker' ? ['implement', 'tdd'] : /grill|question|plan/i.test(context) ? ['grilling', 'domain-modeling'] : [];
    return [
      `MATT SKILLS: ${REPO}@${meta.sha} (${meta.status}). Enabled for every provider and model.`,
      'Before doing the requested work, select, read and apply the relevant Matt skills from the catalog below. Follow their supporting references when relevant. Skills do not expand the user authorization or override your lead/worker role. Do not run setup, publish, push or create issues unless the user authorized that action.',
      'CATALOG (read the exact local SKILL.md path; all supporting files share its revision folder):',
      ...meta.catalog.map(item => `${item.name}: ${item.description}\n${fileFor(item.relative)}`),
      ...meta.catalog.filter(item => selected.includes(item.name)).map(item => `APPLICABLE SKILL ${item.name}:\n${read(item.relative)}`)
    ].join('\n\n');
  }
  return { snapshot, sync, ensure, read, prompt };
}
module.exports = { createSkillsCache, SKILL_FILES, REPO, REF };
