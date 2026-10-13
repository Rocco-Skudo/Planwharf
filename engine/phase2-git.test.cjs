'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createAttemptEngine } = require('./attempts.js');
const { createExecutionBridge } = require('./execution.cjs');
const { projectHome } = require('./project-home.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-phase2-git-'));
const repo = path.join(dir, 'repo'), attemptsDir = path.join(dir, 'attempts'); fs.mkdirSync(repo);
const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true }).trim();
const commit = text => { fs.writeFileSync(path.join(repo, 'source.txt'), text); git(['add', 'source.txt']); git(['commit', '-qm', text]); return git(['rev-parse', 'HEAD']); };
(async () => {
  git(['init', '-q']); git(['config', 'user.name', 'Isolated fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  const before = commit('baseline');
  const item = structuredClone(require('../fixtures/starter-notebook.json').projects[0]); item.project = { id: 'fixture', name: 'Git fixture', folder: repo };
  const job = { id: 'job-1', projectId: 'fixture', title: 'Complete bounded work', detail: 'Isolated Git fixture', revision_id: 1, status: 'running' }; item.tasks = [job];
  const store = { usage: {} }, row = { id: 'fixture', jobTitle: job.title, dispatch: [] }, model = { id: 'fixture-luna', provider: 'codex', cli: 'gpt-6-luna', enabled: true, available: true, cost: 1 };
  let alive = true, launched;
  const bridge = createExecutionBridge({ store, dir: attemptsDir, attempts: createAttemptEngine({ dir: attemptsDir }), rowFor: () => row, models: () => [model], leadId: () => null, sessionId: 'fixture-session', now: () => new Date().toISOString(), persist: () => {},
    inspect: () => ({ git: true, commitId: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']).split('\n').filter(Boolean), names: [] }),
    spawnWorker: info => { launched = info; return { pid: 123 }; }, isProcessAlive: () => alive });
  const mega = bridge.propose(item, job, [{ modelId: model.id, slice: 'Bounded source change' }]); bridge.approve('fixture', mega.id); bridge.advance(item, job, []);
  const first = commit('first worker change'), second = commit('second worker change');
  fs.writeFileSync(path.join(repo, 'source.txt'), 'Uncommitted change remains');
  fs.writeFileSync(launched.structuredResultPath, JSON.stringify({ resultId: launched.resultId, attemptId: launched.attemptId, subTaskId: launched.subTaskId, megaTaskId: launched.megaTaskId, status: 'COMPLETE', summary: 'Work completed; remaining local changes preserved.', filesChanged: ['source.txt'], tests: [], blockers: [], nextAction: 'Review uncommitted changes', createdAt: new Date().toISOString() }));
  fs.writeFileSync(launched.exitPath, JSON.stringify({ attemptId: launched.attemptId, exitCode: 0, provider: model.provider, model: model.cli })); alive = false; bridge.advance(item, job, []);
  assert.equal(mega.status, 'COMPLETE'); assert.equal(mega.repoBefore.repoHead, before); assert.equal(mega.repoAfter.repoHead, second);
  assert.deepEqual(new Set(mega.repoAfter.commitIds), new Set([first, second]));
  assert.equal(mega.repoAfter.disposition, 'UNCOMMITTED'); assert.equal(mega.repoAfter.sourceChangesObserved, true);
  assert.equal(fs.readFileSync(path.join(repo, 'source.txt'), 'utf8'), 'Uncommitted change remains');
  const home = await projectHome(item, { projects: [row], researches: [], execution: store.execution }, null, {});
  assert.match(home.progress, /Work completed/); assert.equal(home.progressDetails.gitProgress.disposition, 'UNCOMMITTED'); assert.equal(home.local.changedFiles, 1);
  console.log('PASS Phase 2 Git: persisted completed work, before/after HEAD, both observed commit IDs, uncommitted changes kept distinct and displayed without AI.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  const resolved = path.resolve(dir); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('pw-phase2-git-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
