'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { executionNext } = require('./execution-next.cjs');
const { projectHome } = require('./project-home.cjs');

function graph(status = 'RUNNING', first = 'RUNNING', second = 'PENDING') {
  const mega = { id: 'MT-test', projectId: 'isolated', status, nextAction: 'Review the proposed slices and approve this MegaTask.', currentCheckpointId: 'CP-test' };
  return { megaTasks: [mega], subTasks: [
    { id: 'ST-first', megaTaskId: mega.id, title: 'Create module', status: first, dependencies: [], attemptIds: [], resultId: 'R-first' },
    { id: 'ST-second', megaTaskId: mega.id, title: 'Verify recovery', status: second, dependencies: ['ST-first'], attemptIds: [], resultId: 'R-second' }
  ], results: [], checkpoints: [] };
}
const next = durable => executionNext(durable.megaTasks[0], durable);
const cases = [
  ['A proposal permits approval', graph('READY_FOR_APPROVAL', 'PENDING'), /approve this MegaTask/],
  ['B approval immediately replaces proposal text', graph('RUNNING', 'PENDING'), /^Next SubTask: Create module \(ST-first\)\.$/],
  ['C active first slice', graph(), /^Work in progress: Create module \(ST-first\)\.$/],
  ['D first complete and second pending', graph('RUNNING', 'COMPLETE'), /^Next SubTask: Verify recovery \(ST-second\)\.$/],
  ['E active second slice', graph('RUNNING', 'COMPLETE', 'RUNNING'), /^Work in progress: Verify recovery \(ST-second\)\.$/],
  ['F dependency waiting identifies prerequisite', graph('RUNNING', 'BLOCKED'), /^Waiting for prerequisite Create module \(ST-first\) before Verify recovery \(ST-second\)\.$/],
  ['H resumed work ignores saved checkpoint nextAction', { ...graph('RUNNING', 'COMPLETE', 'RUNNING'), checkpoints: [{ id: 'CP-test', megaTaskId: 'MT-test', projectId: 'isolated', nextAction: 'Resume the saved checkpoint.' }] }, /^Work in progress: Verify recovery/],
  ['reconciliation never reuses proposal', graph('RUNNING', 'COMPLETE', 'COMPLETE'), /^Reconciling completed work\.$/],
  ['G paused fallback uses remaining work', graph('PAUSED', 'COMPLETE'), /^Next SubTask: Verify recovery/],
  ['I completion without a result action is neutral', graph('COMPLETE', 'COMPLETE', 'COMPLETE'), /^Review completed evidence\.$/],
  ['J failed without structured recovery is neutral', graph('FAILED', 'FAILED'), /^Review Create module \(ST-first\) and resume from an explicit checkpoint\.$/],
  ['J blocked MegaTask uses durable blockers', { ...graph('BLOCKED', 'COMPLETE', 'BLOCKED'), megaTasks: [{ ...graph().megaTasks[0], status: 'BLOCKED', blockers: ['Resolve missing test dependency'] }] }, /^Resolve blockers: Resolve missing test dependency$/]
];
for (const [name, durable, expected] of cases) test(name, async () => {
  const before = JSON.stringify(durable);
  assert.match(next(durable), expected);
  if (durable.megaTasks[0].status !== 'READY_FOR_APPROVAL') assert.doesNotMatch(next(durable), /approv/i);
  const project = { project: { id: 'isolated' }, revisions: [{ id: 1, title: '', direction: 'Isolated goal', state: '', open: [], closed: [] }] };
  const snapshot = { execution: durable, projects: [{ id: 'isolated', next: 'Approve the prepared job', status: 'watching', dispatch: [] }], researches: [] };
  const home = await projectHome(project, snapshot);
  assert.equal(home.next, next(durable), 'Home uses the canonical projection even with stale row text');
  assert.equal(JSON.stringify(durable), before, 'Derivation does not mutate durable state');
});
test('G checkpoint action stays authoritative; absent/empty actions use remaining state', () => {
  const durable = graph('PAUSED', 'COMPLETE');
  const cp = { id: 'CP-test', megaTaskId: 'MT-test', projectId: 'isolated', nextAction: 'Review checkpoint evidence, then resume verification.' };
  durable.checkpoints.push(cp);
  assert.equal(next(durable), cp.nextAction);
  cp.nextAction = '  '; assert.match(next(durable), /^Next SubTask: Verify recovery/);
  cp.projectId = 'other'; cp.nextAction = 'Foreign checkpoint'; assert.match(next(durable), /^Next SubTask: Verify recovery/);
});
test('I final structured result wins, with a neutral fallback rather than an older action', () => {
  const durable = graph('COMPLETE', 'COMPLETE', 'COMPLETE');
  durable.results.push({ megaTaskId: 'MT-test', status: 'COMPLETE', nextAction: 'Old recommendation' }, { megaTaskId: 'MT-test', status: 'COMPLETE', nextAction: 'Review final arithmetic evidence.' }, { megaTaskId: 'MT-other', status: 'COMPLETE', nextAction: 'Foreign result' });
  assert.equal(next(durable), 'Review final arithmetic evidence.');
  durable.results[1].nextAction = ''; assert.equal(next(durable), 'Review completed evidence.');
});
test('J failed/blocked slices use current structured recovery and retain checkpoint behavior', () => {
  const durable = graph('FAILED', 'FAILED');
  durable.results.push({ megaTaskId: 'MT-test', subTaskId: 'ST-first', resultId: 'R-first', status: 'FAILED', nextAction: 'Install the missing test dependency.', blockers: ['Missing dependency'] });
  assert.equal(next(durable), 'Install the missing test dependency.');
  durable.megaTasks[0].status = 'RUNNING'; durable.subTasks[1].status = 'BLOCKED';
  assert.equal(next(durable), 'Install the missing test dependency.');
  durable.results[0].nextAction = ''; assert.equal(next(durable), 'Resolve blockers: Missing dependency');
  durable.megaTasks[0].status = 'FAILED'; durable.checkpoints.push({ id: 'CP-test', megaTaskId: 'MT-test', projectId: 'isolated', nextAction: 'Review the failed checkpoint.' });
  assert.equal(next(durable), 'Review the failed checkpoint.');
});
test('active work has priority; runnable pending work retains graph order and never selects a blocked dependent', () => {
  const durable = graph('RUNNING', 'BLOCKED');
  durable.subTasks.push({ id: 'ST-third', megaTaskId: 'MT-test', title: 'Z independent', status: 'PENDING', dependencies: [] }, { id: 'ST-fourth', megaTaskId: 'MT-test', title: 'A independent', status: 'PENDING', dependencies: [] });
  assert.equal(next(durable), 'Next SubTask: Z independent (ST-third).');
  durable.subTasks[3].status = 'RUNNING'; assert.equal(next(durable), 'Work in progress: A independent (ST-fourth).');
  durable.subTasks[3].status = 'COMPLETE'; durable.subTasks[2].status = 'COMPLETE';
  durable.subTasks[1].dependencies = ['ST-missing']; assert.match(next(durable), /Waiting for prerequisite ST-missing/);
});
