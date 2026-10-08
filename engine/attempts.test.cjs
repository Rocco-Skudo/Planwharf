'use strict';

const assert = require('assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createAttemptEngine } = require('./attempts.js');
const { createSentinel } = require('./sentinel.js');

let passed = 0;
let failed = 0;
const failures = [];
const dirs = [];

function list(items) {
  return items.map(item => ({ id: item[0], enabled: item[1] }));
}

const on = list([['mod-a', true], ['mod-b', false], ['mod-c', true]]);

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-attempts-'));
  dirs.push(dir);
  return dir;
}

function storeFile(dir) {
  return path.join(dir, 'attempts.json');
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (err) {
    failed += 1;
    failures.push(name + ': ' + (err && err.message ? err.message : String(err)));
    console.log('FAIL ' + name);
    console.log('  ' + (err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n  ') : err));
  }
}

test('first claim writes a file row', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const result = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.attempt.id, 'attempt-1');
  assert.strictEqual(result.attempt.status, 'active');
  const raw = JSON.parse(fs.readFileSync(storeFile(dir), 'utf8'));
  assert.strictEqual(raw.attempts.length, 1);
  assert.strictEqual(raw.attempts[0].id, result.attempt.id);
  assert.deepStrictEqual(engine.getActiveAttempt({ taskId: 'task-1', projectId: 'biblioteca' }), result.attempt);
});

test('second claim same task fails and writes no extra row', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const first = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  const before = fs.readFileSync(storeFile(dir), 'utf8');
  const second = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-c', candidates: on });
  const after = fs.readFileSync(storeFile(dir), 'utf8');
  console.log('DOUBLE_CLAIM same_task first.ok=' + first.ok + ' second.ok=' + second.ok + ' first.id=' + first.attempt.id + ' second.attempt=' + (second.attempt == null ? 'null' : typeof second.attempt) + ' reason=' + second.reason);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, 'task already assigned');
  assert.strictEqual(second.attempt, undefined);
  assert.strictEqual(after, before);
  assert.strictEqual(JSON.parse(after).attempts.length, 1);
});

test('second claim same project different task fails and writes no extra row', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const first = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  const before = fs.readFileSync(storeFile(dir), 'utf8');
  const second = engine.claim({ taskId: 'task-2', projectId: 'biblioteca', modelId: 'mod-c', candidates: on });
  const after = fs.readFileSync(storeFile(dir), 'utf8');
  console.log('DOUBLE_CLAIM same_project first.ok=' + first.ok + ' second.ok=' + second.ok + ' reason=' + second.reason);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, 'project already assigned');
  assert.strictEqual(second.attempt, undefined);
  assert.strictEqual(after, before);
  assert.strictEqual(JSON.parse(after).attempts.length, 1);
  assert.strictEqual(JSON.parse(after).attempts[0].id, first.attempt.id);
});

test('reconstructed engine finds the same attempt', () => {
  const dir = tempDir();
  const first = createAttemptEngine({ dir }).claim({ taskId: 'calendario', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  const again = createAttemptEngine({ dir });
  const active = again.getActiveAttempt({ taskId: 'calendario', projectId: 'biblioteca' });
  assert.strictEqual(active.id, first.attempt.id);
  assert.strictEqual(active.modelId, 'mod-a');
  assert.strictEqual(active.status, 'active');
});

test('distinct project and task may claim', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const first = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  const second = engine.claim({ taskId: 'task-2', projectId: 'orto', modelId: 'mod-c', candidates: on });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(engine.getAttempts().length, 2);
});

test('disabled and missing models are refused without a row', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const disabled = engine.claim({ taskId: 't', projectId: 'p', modelId: 'mod-b', candidates: on });
  const missing = engine.claim({ taskId: 't', projectId: 'p', modelId: 'mod-z', candidates: on });
  const none = engine.claim({ taskId: 't', projectId: 'p', modelId: 'mod-a', candidates: [] });
  assert.strictEqual(disabled.reason, 'model not eligible');
  assert.strictEqual(missing.reason, 'model not present');
  assert.strictEqual(none.reason, 'no model enabled');
  assert.strictEqual(fs.existsSync(storeFile(dir)), false);
});

test('close releases the claim so another model may take it', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const first = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  const closed = engine.closeAttempt({ attemptId: first.attempt.id, reason: 'no verdict' });
  assert.strictEqual(closed.ok, true);
  assert.strictEqual(closed.attempt.status, 'closed');
  const second = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-c', candidates: on });
  assert.strictEqual(second.ok, true);
  assert.notStrictEqual(second.attempt.id, first.attempt.id);
  assert.strictEqual(engine.getAttempts().length, 2);
});

test('sentinel: written COMPLETE ends waiting even if process is alive', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const claimed = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  const resultPath = path.join(dir, 'task.result.txt');
  fs.writeFileSync(resultPath, 'STATUS: COMPLETE\n', 'utf8');
  engine.attachResult({ attemptId: claimed.attempt.id, resultPath, status: 'COMPLETE', exitCode: 0 });
  const sentinel = createSentinel(engine, { isAlive: () => true });
  const tick = sentinel.tick(claimed.attempt);
  assert.strictEqual(tick.waiting, false);
  assert.strictEqual(tick.complete, true);
  assert.strictEqual(engine.getActiveAttempt({ taskId: 'task-1', projectId: 'biblioteca' }).status, 'active');
});

test('sentinel: missing verdict closes the attempt', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const claimed = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  const sentinel = createSentinel(engine, { isAlive: () => false });
  const tick = sentinel.tick(claimed.attempt);
  assert.strictEqual(tick.waiting, false);
  assert.strictEqual(tick.closed, true);
  assert.strictEqual(engine.getActiveAttempt({ taskId: 'task-1', projectId: 'biblioteca' }), null);
  assert.strictEqual(engine.getResult(claimed.attempt.id).status, 'closed');
  assert.strictEqual(engine.getResult(claimed.attempt.id).closedReason, 'no verdict');
});

test('sentinel: does not open a second attempt while the first is active', () => {
  const dir = tempDir();
  const engine = createAttemptEngine({ dir });
  const first = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-a', candidates: on });
  const sentinel = createSentinel(engine, { isAlive: () => true });
  const tick = sentinel.tick(first.attempt, { candidates: on, modelId: 'mod-c' });
  assert.strictEqual(tick.waiting, true);
  assert.strictEqual(tick.reassigned, false);
  const second = engine.claim({ taskId: 'task-1', projectId: 'biblioteca', modelId: 'mod-c', candidates: on });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(JSON.parse(fs.readFileSync(storeFile(dir), 'utf8')).attempts.length, 1);
});

for (const dir of dirs) {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  process.exitCode = 1;
}
