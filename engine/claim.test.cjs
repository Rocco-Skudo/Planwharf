'use strict';

const assert = require('assert');
const { createClaimEngine } = require('./claims.js');

let passed = 0;
let failed = 0;
const failures = [];

function list(items) {
  return items.map(item => ({ id: item[0], enabled: item[1] }));
}

const on = list([['mod-a', true], ['mod-b', false], ['mod-c', true]]);

function snapshot(engine) {
  return {
    attempts: engine.getAttempts(),
    count: engine.getAttempts().length
  };
}

function sameAttempts(a, b) {
  assert.deepStrictEqual(a, b);
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
    console.log('  ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n  ') : err));
  }
}

test('primo claim successo', () => {
  const engine = createClaimEngine();
  const result = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  assert.strictEqual(result.ok, true);
  assert.ok(result.attempt);
  assert.strictEqual(typeof result.attempt.id, 'string');
  assert.ok(result.attempt.id);
  assert.strictEqual(result.attempt.taskId, 'task-1');
  assert.strictEqual(result.attempt.projectId, 'proj-1');
  assert.strictEqual(result.attempt.modelId, 'mod-a');
  assert.strictEqual(result.attempt.status, 'active');
  assert.strictEqual(engine.getAttempts().length, 1);
  const active = engine.getActiveAttempt({ taskId: 'task-1', projectId: 'proj-1' });
  assert.deepStrictEqual(active, result.attempt);
});

test('doppio claim stesso task', () => {
  const engine = createClaimEngine();
  const first = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  const before = snapshot(engine);
  const second = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-c', candidates: on });
  const after = snapshot(engine);
  console.log('DOUBLE_CLAIM same_task first.ok=' + first.ok + ' second.ok=' + second.ok + ' attempts_before=' + before.count + ' attempts_after=' + after.count + ' first.id=' + first.attempt.id + ' second.attempt=' + (second.attempt == null ? 'null' : typeof second.attempt));
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(typeof second.reason, 'string');
  assert.ok(second.reason);
  assert.strictEqual(second.attempt, undefined);
  assert.strictEqual(after.count, 1);
  sameAttempts(before.attempts, after.attempts);
  assert.strictEqual(after.attempts[0].id, first.attempt.id);
  assert.strictEqual(after.attempts[0].status, 'active');
  assert.deepStrictEqual(engine.getActiveAttempt({ taskId: 'task-1', projectId: 'proj-1' }), first.attempt);
});

test('task diverso nello stesso progetto', () => {
  const engine = createClaimEngine();
  const first = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  const before = snapshot(engine);
  const second = engine.claim({ taskId: 'task-2', projectId: 'proj-1', modelId: 'mod-c', candidates: on });
  const after = snapshot(engine);
  console.log('DOUBLE_CLAIM same_project first.ok=' + first.ok + ' second.ok=' + second.ok + ' attempts_after=' + after.count);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(typeof second.reason, 'string');
  assert.ok(second.reason);
  assert.strictEqual(after.count, 1);
  sameAttempts(before.attempts, after.attempts);
  assert.strictEqual(after.attempts[0].id, first.attempt.id);
});

test('stesso task con altro progetto', () => {
  const engine = createClaimEngine();
  const first = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  const before = snapshot(engine);
  const second = engine.claim({ taskId: 'task-1', projectId: 'proj-2', modelId: 'mod-c', candidates: on });
  const after = snapshot(engine);
  console.log('DOUBLE_CLAIM same_task_other_project first.ok=' + first.ok + ' second.ok=' + second.ok + ' attempts_after=' + after.count);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(typeof second.reason, 'string');
  assert.ok(second.reason);
  assert.strictEqual(after.count, 1);
  sameAttempts(before.attempts, after.attempts);
  assert.strictEqual(engine.getActiveAttempt({ taskId: 'task-1', projectId: 'proj-2' }), null);
  assert.deepStrictEqual(engine.getActiveAttempt({ taskId: 'task-1', projectId: 'proj-1' }), first.attempt);
});

test('progetti e task distinti consentiti', () => {
  const engine = createClaimEngine();
  const first = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  const second = engine.claim({ taskId: 'task-2', projectId: 'proj-2', modelId: 'mod-c', candidates: on });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(engine.getAttempts().length, 2);
  assert.notStrictEqual(first.attempt.id, second.attempt.id);
  assert.deepStrictEqual(engine.getActiveAttempt({ taskId: 'task-1', projectId: 'proj-1' }), first.attempt);
  assert.deepStrictEqual(engine.getActiveAttempt({ taskId: 'task-2', projectId: 'proj-2' }), second.attempt);
});

test('invarianti e contatore immutati dopo rifiuto', () => {
  const engine = createClaimEngine();
  const first = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  const before = JSON.stringify(engine.getAttempts());
  const beforeCount = engine.getAttempts().length;
  const rejects = [
    engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on }),
    engine.claim({ taskId: 'task-9', projectId: 'proj-1', modelId: 'mod-a', candidates: on }),
    engine.claim({ taskId: 'task-1', projectId: 'proj-9', modelId: 'mod-a', candidates: on }),
    engine.claim({ taskId: 'task-3', projectId: 'proj-3', modelId: 'mod-b', candidates: on }),
    engine.claim({ taskId: 'task-3', projectId: 'proj-3', modelId: 'mod-z', candidates: on }),
    engine.claim({ taskId: 'task-3', projectId: 'proj-3', modelId: 'mod-a', candidates: [] })
  ];
  rejects.forEach(item => {
    assert.strictEqual(item.ok, false);
    assert.strictEqual(item.attempt, undefined);
  });
  const after = engine.getAttempts();
  assert.strictEqual(after.length, beforeCount);
  assert.strictEqual(after.length, 1);
  assert.strictEqual(JSON.stringify(after), before);
  assert.strictEqual(after[0].id, first.attempt.id);
  const third = engine.claim({ taskId: 'task-2', projectId: 'proj-2', modelId: 'mod-c', candidates: on });
  assert.strictEqual(third.ok, true);
  assert.strictEqual(engine.getAttempts().length, 2);
  assert.notStrictEqual(third.attempt.id, first.attempt.id);
});

test('modello spento non candidabile', () => {
  const engine = createClaimEngine();
  const beforeCount = engine.getAttempts().length;
  const result = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-b', candidates: on });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(typeof result.reason, 'string');
  assert.ok(result.reason);
  assert.notStrictEqual(result.reason, 'nessun modello acceso');
  assert.strictEqual(engine.getAttempts().length, beforeCount);
});

test('lista vuota e tutti spenti con nessun modello acceso', () => {
  const engine = createClaimEngine();
  const empty = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: [] });
  const off = engine.claim({
    taskId: 'task-1',
    projectId: 'proj-1',
    modelId: 'mod-a',
    candidates: list([['mod-a', false], ['mod-b', false]])
  });
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.reason, 'nessun modello acceso');
  assert.strictEqual(off.ok, false);
  assert.strictEqual(off.reason, 'nessun modello acceso');
  assert.strictEqual(engine.getAttempts().length, 0);
});

test('modello non presente rifiutato', () => {
  const engine = createClaimEngine();
  const result = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-missing', candidates: on });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(typeof result.reason, 'string');
  assert.ok(result.reason);
  assert.notStrictEqual(result.reason, 'nessun modello acceso');
  assert.strictEqual(engine.getAttempts().length, 0);
});

test('copie snapshot non alterano stato interno', () => {
  const engine = createClaimEngine();
  const created = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  const copies = engine.getAttempts();
  copies[0].status = 'changed';
  copies[0].modelId = 'mod-x';
  copies[0].id = 'forged';
  copies.push({ id: 'extra', taskId: 'task-x', projectId: 'proj-x', modelId: 'mod-a', status: 'active' });
  const active = engine.getActiveAttempt({ taskId: 'task-1', projectId: 'proj-1' });
  active.status = 'changed';
  active.taskId = 'task-x';
  created.attempt.status = 'changed';
  const later = engine.getAttempts();
  assert.strictEqual(later.length, 1);
  assert.strictEqual(later[0].status, 'active');
  assert.strictEqual(later[0].modelId, 'mod-a');
  assert.strictEqual(later[0].id, 'attempt-1');
  assert.strictEqual(engine.getActiveAttempt({ taskId: 'task-1', projectId: 'proj-1' }).status, 'active');
  assert.strictEqual(engine.getActiveAttempt({ taskId: 'task-x', projectId: 'proj-x' }), null);
});

test('input invalidi senza corrompere stato', () => {
  const engine = createClaimEngine();
  const first = engine.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  const frozen = JSON.stringify(engine.getAttempts());
  const frozenCount = engine.getAttempts().length;
  const source = list([['mod-a', true]]);
  const invalids = [
    undefined,
    null,
    12,
    'task-1',
    [],
    {},
    { taskId: 'task-2', projectId: 'proj-2', modelId: 'mod-a' },
    { taskId: '', projectId: 'proj-2', modelId: 'mod-a', candidates: source },
    { taskId: '   ', projectId: 'proj-2', modelId: 'mod-a', candidates: source },
    { taskId: 'task-2', projectId: '', modelId: 'mod-a', candidates: source },
    { taskId: 'task-2', projectId: 'proj-2', modelId: '', candidates: source },
    { taskId: 1, projectId: 'proj-2', modelId: 'mod-a', candidates: source },
    { taskId: 'task-2', projectId: 'proj-2', modelId: 'mod-a', candidates: null },
    { taskId: 'task-2', projectId: 'proj-2', modelId: 'mod-a', candidates: { id: 'mod-a', enabled: true } }
  ];
  invalids.forEach(item => {
    const result = engine.claim(item);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(typeof result.reason, 'string');
    assert.ok(result.reason);
    assert.strictEqual(result.attempt, undefined);
  });
  assert.strictEqual(JSON.stringify(source), JSON.stringify(list([['mod-a', true]])));
  assert.strictEqual(engine.getAttempts().length, frozenCount);
  assert.strictEqual(JSON.stringify(engine.getAttempts()), frozen);
  assert.strictEqual(engine.getAttempts()[0].id, first.attempt.id);
  const candidatesCopy = list([['mod-a', true], ['mod-b', false]]);
  engine.claim({ taskId: 'task-2', projectId: 'proj-2', modelId: 'mod-a', candidates: candidatesCopy });
  candidatesCopy[0].enabled = false;
  candidatesCopy.pop();
  assert.strictEqual(engine.getAttempts().length, 2);
  assert.strictEqual(engine.getAttempts()[1].modelId, 'mod-a');
});

test('UMD createClaimEngine esposto dal modulo', () => {
  const api = require('./claims.js');
  assert.strictEqual(typeof api.createClaimEngine, 'function');
  const a = api.createClaimEngine();
  const b = api.createClaimEngine();
  assert.strictEqual(typeof a.claim, 'function');
  assert.strictEqual(typeof a.getAttempts, 'function');
  assert.strictEqual(typeof a.getActiveAttempt, 'function');
  a.claim({ taskId: 'task-1', projectId: 'proj-1', modelId: 'mod-a', candidates: on });
  assert.strictEqual(b.getAttempts().length, 0);
});

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failures.length) {
  failures.forEach(item => console.log('DETAIL ' + item));
}
if (failed) process.exit(1);
