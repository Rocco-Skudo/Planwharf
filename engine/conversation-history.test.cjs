'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Plan = require('../plan.js');
const { createAttemptEngine } = require('./attempts.js');
const { createOrchestrator } = require('./orchestrator.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-conversation-history-'));
const stateFile = path.join(dir, 'orchestrator.json');
const chronological = Array.from({ length: 45 }, (_, index) => ({
  at: new Date(Date.UTC(2026, 9, 10, 10, index)).toISOString(),
  question: `Retained discussion ${index}: \u00e8 \u65e5\u672c\u8a9e`,
  answer: `Retained answer ${index}.`,
  thinking: null,
  projectId: null,
  orchestratorId: 'astra-fixture',
  order: null
}));
const plan = Plan.example();
plan.tasks = [];
plan.project = { id: 'isolated-history', name: 'Isolated history' };
fs.writeFileSync(stateFile, JSON.stringify({ mode: 'manual', orchestratorId: 'astra-fixture', asks: chronological.slice().reverse() }));
const models = [{ id: 'astra-fixture', label: 'GPT-6 Astra', provider: 'codex', cli: 'gpt-6-astra', kind: 'premium', enabled: true, available: true, limit: 200 }];
const captured = [];
let blocked = false;
let notifyProvider;
let releaseProvider;
const providerEntered = new Promise(resolve => { notifyProvider = resolve; });
const providerRelease = new Promise(resolve => { releaseProvider = resolve; });
const make = () => createOrchestrator({
  dir,
  models,
  readPlan: async () => plan,
  attempts: createAttemptEngine({ dir }),
  fetchPlans: async () => [],
  inspectFolder: () => ({ fileCount: 0, names: [], git: false }),
  spawnWorker: () => { throw new Error('Conversation validation must not dispatch workers'); },
  askModel: async info => {
    captured.push(info);
    if (blocked) { notifyProvider(); await providerRelease; }
    return { answer: 'Fixture answer.', ms: 1 };
  },
  abortAsk: () => releaseProvider()
});
let orchestra;

async function main() {
  orchestra = make();
  const asked = await orchestra.ask('A conversation followup.');
  assert.equal(asked.ok, true);
  assert.deepEqual(captured[0].state.history, chronological.slice(-6).map(turn => ({ user: turn.question, orchestrator: turn.answer })), 'Latest six exchanges reach the lead chronologically; the archive remains complete');
  let saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(saved.asks.length, 46, 'A new answer preserves every exchange beyond 40');
  assert.deepEqual(saved.asks.slice(1), chronological.slice().reverse());

  blocked = true;
  const pending = orchestra.ask('A pending conversation followup.');
  await providerEntered;
  assert.equal(captured[1].state.history.length, 6);
  const stopped = await orchestra.abortAsk();
  assert.equal(stopped.aborted, true);
  assert.equal((await pending).cancelled, true);
  saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(saved.asks.length, 47, 'Cancellation preserves the full existing conversation');
  assert.equal(saved.asks[0].order, 'abort');
  assert.equal(saved.asks[0].answer, 'Stopped.');
  assert.deepEqual(saved.asks.slice(2), chronological.slice().reverse());
  await orchestra.shutdown();

  blocked = false;
  orchestra = make();
  await orchestra.ask('A conversation followup after reload.');
  assert.equal(captured[2].state.history.length, 6, 'Bounded context survives reload while full history remains archived');
  assert.equal(captured[2].state.history[0].user, chronological[41].question);
  assert.equal(captured[2].state.history.at(-1).orchestrator, 'Stopped.');
  saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(saved.asks.length, 48);
  assert.deepEqual(saved.asks.slice(3), chronological.slice().reverse());
  console.log('OK: all 45+ conversation exchanges preserved, with six recent turns sent chronologically across answer, cancellation, and reload.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (orchestra) await orchestra.shutdown();
  fs.rmSync(dir, { recursive: true, force: true });
});
