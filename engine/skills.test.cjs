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
    if (url.includes('/git/trees/')) return { ok: true, status: 200, text: async () => JSON.stringify({ truncated: false, tree: [...SKILL_FILES, 'LICENSE'].map(path => ({ path, type: 'blob' })) }) };
    const name = [...SKILL_FILES, 'LICENSE'].find(item => url.endsWith(item));
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
  assert.equal(first.files.length, SKILL_FILES.length + 1);
  assert.ok(cache.read('LICENSE'), 'Downloaded skills retain their upstream license notice');
  assert.ok(cache.read(SKILL_FILES[0]));
  assert.ok(cache.prompt('worker', 'Implement fixture').includes(REPO));
  assert.equal(cache.read('../outside'), '');
  const second = await cache.sync();
  assert.equal(second.updated, false);
  assert.equal(second.sha, 'abc123def456');
  assert.equal(second.installedAt, first.installedAt, 'Checking the same revision does not change the installation date');
  const completeMeta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ...completeMeta, catalog: [] }));
  const missingCatalog = createSkillsCache({ dir, fetchImpl });
  assert.equal(missingCatalog.snapshot().status, 'incomplete', 'Matching SHA alone cannot verify an empty catalog');
  assert.equal(missingCatalog.snapshot().catalogComplete, false);
  assert.equal(missingCatalog.prompt('worker'), '', 'Incomplete catalog cannot be supplied to models');
  const repaired = await missingCatalog.ensure();
  assert.equal(repaired.status, 'current');
  assert.equal(repaired.catalogComplete, true);
  assert.equal(repaired.skillCount, SKILL_FILES.filter(file => file.endsWith('/SKILL.md')).length);
  assert.equal(repaired.updated, true, 'An incomplete catalog is rebuilt even when the remote SHA is unchanged');

  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-legacy-'));
  fs.writeFileSync(path.join(legacyDir, 'meta.json'), JSON.stringify({ sha: first.sha, status: 'current', files: SKILL_FILES }));
  const legacy = createSkillsCache({ dir: legacyDir, fetchImpl });
  assert.equal(legacy.snapshot().status, 'incomplete');
  assert.equal((await legacy.ensure()).catalogComplete, true, 'Legacy six-file cache migrates to a complete revision');

  const offline = createSkillsCache({
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skills-off-')),
    fetchImpl: async () => { throw new Error('network down'); }
  });
  const missed = await offline.sync();
  assert.equal(missed.status, 'offline');
  console.log('OK: complete Matt skill catalog, same-SHA repair, legacy cache migration and honest offline status.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
