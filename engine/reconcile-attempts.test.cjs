'use strict';
const assert = require('node:assert/strict');
const { reconcile } = require('../validation/reconcile-attempts.cjs');
const { jobFingerprint } = require('./orchestrator.js');
const plan = structuredClone(require('../fixtures/starter-notebook.json'));
const item = plan.projects[0];
const task = { id: 'task-1', projectId: item.project.id, revision_id: 1, title: 'Isolated task', detail: 'Fixture', status: 'running' };
item.tasks.push(task);
const state = { projects: { [item.project.id]: { status: 'complete', jobId: task.id, jobFingerprint: jobFingerprint(task), attemptId: 'attempt-1', workerAlive: true, dispatch: [{ resultPath: 'first.txt', pid: 123, alive: true }, { resultPath: 'second.txt', pid: 456, alive: true }] }, removed: { workerAlive: true, log: ['Historical evidence'] } }, asks: [{ answer: 'Personal conversation' }], researches: [{ id: 'historical-research' }] };
const attempts = { nextId: 2, attempts: [{ id: 'attempt-1', taskId: task.id, projectId: item.project.id, status: 'active' }] };
const original = JSON.stringify({ plan, state, attempts });
for (const text of ['STATUS: WATCHING\n', 'STATUS: COMPLETE\n', 'STATUS: COMPLETE\nEXIT: 1\n']) {
  const result = reconcile(plan, state, attempts, file => file === 'first.txt' ? 'STATUS: COMPLETE\nEXIT: 0\n' : text);
  assert.equal(result.completed.length, 0);
  assert.equal(result.attempts.attempts[0].status, 'active');
}
const result = reconcile(plan, state, attempts, () => 'STATUS: COMPLETE\nEXIT: 0\n');
assert.equal(result.plan.projects[0].tasks[0].status, 'complete');
assert.equal(result.attempts.attempts[0].status, 'closed');
assert.equal(result.state.projects[item.project.id].workerAlive, false);
assert.deepEqual(result.state.archivedProjects.removed, state.projects.removed);
assert.deepEqual(result.state.asks, state.asks);
assert.deepEqual(result.state.researches, state.researches);
assert.deepEqual(result.plan.projects[0].revisions, item.revisions);
assert.equal(JSON.stringify({ plan, state, attempts }), original, 'Dry run leaves all input data unchanged');
const changedPlan = structuredClone(plan);
changedPlan.projects[0].tasks[0].detail = 'Reused ID with a new request';
assert.equal(reconcile(changedPlan, state, attempts, () => 'STATUS: COMPLETE\nEXIT: 0\n').completed.length, 0);
console.log('PASS: reconciliation requires every slice and successful exit, checks job identity, archives without losing history, and keeps dry runs immutable.');
