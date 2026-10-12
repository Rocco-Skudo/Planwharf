'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOrchestrator } = require('./orchestrator.js');
const { createAttemptEngine } = require('./attempts.js');
const { createSentinel } = require('./sentinel.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-worker-snapshot-'));
const project = id => ({ schema: 1, project: { id, name: id }, revisions: [{ id: 1, direction: 'Isolated fixture', state: '', open: [] }], tasks: [] });
const plan = { schema: 2, projects: ['dead-complete', 'reused-complete', 'running', 'dead-watching', 'paused'].map(project) };
const projects = Object.fromEntries(plan.projects.map(item => [item.project.id, {
  status: item.project.id === 'paused' ? 'checkpointed' : item.project.id.includes('complete') ? 'complete' : 'watching',
  modelId: 'fixture', workerPid: item.project.id.startsWith('dead') ? 111 : 222, workerAlive: true,
  monitoring: { workers: 1, alive: 1, lastProgress: '2026-10-10T20:00:00Z' },
  dispatch: [{ modelId: 'fixture', pid: item.project.id.startsWith('dead') ? 111 : 222, alive: true, slice: 'Fixture' }]
}]));
const file = path.join(dir, 'orchestrator.json');
const evidence = JSON.stringify({ projects, mode: 'manual', researches: [] });
fs.writeFileSync(file, evidence);
(async () => {
  let launches = 0;
  const attempts = createAttemptEngine({ dir });
  const sentinel = createSentinel(attempts, { isAlive: () => false });
  const orchestrator = createOrchestrator({ dir, attempts, sentinel, readPlan: async () => plan, models: [{ id: 'fixture', label: 'Fixture', provider: 'codex', cli: 'gpt-6-luna', enabled: true }], isProcessAlive: pid => pid === 222, spawnWorker() { launches++; throw new Error('Snapshot must not launch'); } });
  const snapshot = await orchestrator.snapshot();
  const byId = id => snapshot.projects.find(row => row.id === id);
  for (const id of ['dead-complete', 'reused-complete', 'dead-watching', 'paused']) {
    assert.equal(byId(id).dispatch[0].alive, false, id);
    assert.equal(byId(id).workerAlive, false, id);
    assert.equal(byId(id).monitoring.alive, 0, id);
  }
  assert.equal(byId('running').dispatch[0].alive, true);
  assert.equal(byId('running').workerAlive, true);
  assert.equal(byId('reused-complete').dispatch[0].pid, 222, 'Historical PID retained');
  assert.equal(launches, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), evidence, 'Snapshot does not rewrite persisted evidence');
  console.log('Worker snapshots refresh liveness and keep terminal jobs inactive, including reused PIDs.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  const resolved = path.resolve(dir);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('pw-worker-snapshot-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
