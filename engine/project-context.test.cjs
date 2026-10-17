'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Plan = require('../plan.js');
const { createOrchestrator } = require('./orchestrator.js');
const { createAttemptEngine } = require('./attempts.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-project-context-'));
const stateFile = path.join(dir, 'orchestrator.json');
const plan = { schema: 2, projects: ['alpha', 'beta'].map(id => {
  const item = Plan.example(); item.project = { id, name: id }; item.tasks = []; return item;
}) };
const original = [
  { projectId: 'beta', chatSessionId: 'shared-chat', question: 'beta-private-marker', answer: 'beta-private-answer' },
  { projectId: 'alpha', chatSessionId: 'shared-chat', question: 'alpha-private-marker', answer: 'alpha-private-answer' },
  { projectId: null, question: 'legacy-unscoped-marker', answer: 'legacy-unscoped-answer' }
];
fs.writeFileSync(stateFile, JSON.stringify({ orchestratorId: 'fixture', asks: original, projects: { beta: { jobTitle: 'beta-private-job' } }, researches: [
  { id: 'research-alpha', projectId: 'alpha', title: 'alpha-research-marker', status: 'complete' },
  { id: 'research-beta', projectId: 'beta', title: 'beta-research-marker', status: 'complete' }
] }));
const captured = [];
let blocked = false, release, entered;
let launches = 0;
let orchestra;
const make = () => createOrchestrator({ dir, models: [{ id: 'fixture', label: 'Fixture', provider: 'codex', cli: 'gpt-6-luna', kind: 'premium', enabled: true, available: true, limit: 200 }],
  readPlan: async () => plan, attempts: createAttemptEngine({ dir }), fetchPlans: async () => [],
  inspectFolder: () => ({ git: false, names: [], fileCount: 0 }),
  spawnWorker: () => { launches++; throw Error('Fixture must not dispatch'); },
  askModel: async info => { captured.push(info); info.onProgress?.({ answer: 'Partial fixture answer' }); if (blocked) { entered(); await new Promise(resolve => { release = resolve; }); } return { answer: 'Fixture answer.', actions: [] }; },
  abortAsk: () => release?.()
});
(async () => {
  orchestra = make();
  await orchestra.ask('Please explain the current discussion.', 'alpha');
  const first = captured.at(-1);
  if (process.argv.includes('--baseline')) {
    assert.ok(first.state.history.some(turn => turn.user === 'beta-private-marker'));
    assert.ok(first.state.others.some(project => project.job === 'beta-private-job'));
    console.log('BASELINE: focused alpha provider receives beta history/job and global archive path. Fixture only.'); return;
  }
  assert.deepEqual(first.state.history.map(turn => turn.user), ['alpha-private-marker']);
  assert.equal(first.state.contextArchive, null);
  assert.deepEqual(first.state.others, []);
  assert.deepEqual(first.state.researches.map(item => item.id), ['research-alpha']);
  assert.doesNotMatch(JSON.stringify(first.state), /beta-private|beta-research|legacy-unscoped/);
  await orchestra.ask('Please explain the recent discussion.', 'beta', 'shared-chat');
  assert.deepEqual(captured.at(-1).state.history.map(turn => turn.user), ['beta-private-marker']);
  await orchestra.ask('Please explain the other discussion.', 'alpha', 'shared-chat');
  assert.deepEqual(captured.at(-1).state.history.map(turn => turn.user), ['alpha-private-marker']);
  await orchestra.ask('Please explain again.', 'beta', 'new-chat');
  assert.equal(captured.at(-1).state.history.length, 0);
  await orchestra.ask('What does alpha need?', undefined);
  assert.doesNotMatch(JSON.stringify(captured.at(-1).state.history), /beta-private|legacy-unscoped/);
  // The global overview remains backward-compatible and can read legacy unscoped history.
  await orchestra.ask('Please describe the overall workspace.');
  assert.ok(captured.at(-1).state.history.length > 0);
  await orchestra.shutdown(); orchestra = make();
  await orchestra.ask('Please explain after restart.', 'beta');
  assert.doesNotMatch(JSON.stringify(captured.at(-1).state.history), /alpha-private|legacy-unscoped/);
  const waiting = new Promise(resolve => { entered = resolve; }); blocked = true;
  const pending = orchestra.ask('Please keep this cancellation scoped.', 'alpha', 'cancel-chat');
  await waiting;
  await orchestra.abortAsk();
  assert.equal((await pending).cancelled, true); blocked = false;
  const cancelled = JSON.parse(fs.readFileSync(stateFile, 'utf8')).asks.find(turn => turn.order === 'abort');
  assert.equal(cancelled.projectId, 'alpha'); assert.equal(cancelled.chatSessionId, 'cancel-chat');
  await orchestra.ask('Please continue this cancelled discussion.', 'alpha', 'cancel-chat');
  assert.equal(captured.at(-1).state.history.at(-1).orchestrator, 'Stopped.');
  await orchestra.ask('Please explain this separate discussion.', 'beta', 'cancel-chat');
  assert.equal(captured.at(-1).state.history.length, 0);
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.deepEqual(saved.asks.slice(-original.length), original, 'Existing archive records preserved byte-for-value');
  assert.equal(launches, 0);
  console.log('OK: project history/context isolation with absent/shared/new chat IDs, inferred recipients, preserved global history, restart, scoped cancellation and no worker dispatch. Mock providers only.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (orchestra) await orchestra.shutdown();
  const target = path.resolve(dir);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('pw-project-context-'));
  fs.rmSync(target, { recursive: true, force: true });
});
