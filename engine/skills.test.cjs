'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSkillsCache, SKILL_FILES, REPO, REF } = require('./skills.js');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-'));
  const files = {};
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          sha: 'abc123def456',
          commit: { committer: { date: '2026-10-09T10:56:49Z' }, author: { date: '2026-10-09T10:56:49Z' } }
        })
      };
    }
    const name = SKILL_FILES.find(item => url.endsWith(item));
    if (!name) return { ok: false, status: 404, text: async () => '' };
    files[name] = `# ${name}\n`;
    return { ok: true, status: 200, text: async () => files[name] };
  };
  const cache = createSkillsCache({ dir, fetchImpl, now: () => '2026-10-09T12:00:00.000Z' });
  const first = await cache.sync();
  assert.equal(first.repo, REPO);
  assert.equal(first.ref, REF);
  assert.equal(first.sha, 'abc123def456');
  assert.equal(first.date, '2026-10-09T10:56:49Z');
  assert.equal(first.status, 'current');
  assert.equal(first.updated, true);
  assert.equal(first.files.length, SKILL_FILES.length);
  assert.equal(fs.existsSync(path.join(dir, SKILL_FILES[0])), true);
  const second = await cache.sync();
  assert.equal(second.updated, false);
  assert.equal(second.sha, 'abc123def456');

  const offline = createSkillsCache({
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-off-')),
    fetchImpl: async () => { throw new Error('network down'); }
  });
  const missed = await offline.sync();
  assert.equal(missed.status, 'offline');
  console.log('OK: mattpocock/skills main cache updates from GitHub and keeps a snapshot.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
