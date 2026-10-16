'use strict';
const assert = require('node:assert/strict');
const H = require('./harbor-ui.js');
assert.equal(H.nameLabel('  '), 'Supervisor');
assert.equal(H.nameLabel(''), 'Supervisor');
assert.equal(H.nameLabel('  Captain <&>  '), 'Captain <&>');
assert.equal(H.nameLabel('x'.repeat(150)).length, 80);
assert.deepEqual(H.settingsFrom({ enabled: false, animations: 'off', flag: 'pirate', effects: false, supervisorName: '' }), { enabled: false, animations: 'off', flag: 'pirate', effects: false });
assert.equal(H.settingsFrom({ animations: 'broken', flag: 'broken' }).animations, 'full');
assert.equal(H.settingsFrom({ flag: 'broken' }).flag, 'random');
assert.equal(H.settingsFrom({ flag: '__proto__' }).flag, 'random');
assert.equal(Object.keys(H.FLAGS).length, 5);
for (const flag of Object.keys(H.FLAGS)) assert.match(H.flagSvg(flag), /viewBox="0 0 96 64"/);
const cases = [
  [null, 'neutral'], [{ status: 'unknown' }, 'neutral'], [{ status: 'idle' }, 'idle'],
  [{ status: 'needs_approval' }, 'preparing'], [{ status: 'watching' }, 'preparing'],
  [{ status: 'watching', workerAlive: true }, 'running'],
  [{ status: 'watching', dispatch: [{ alive: true }], megaTask: { pauseRequested: true } }, 'pausing'],
  [{ status: 'checkpointed' }, 'checkpoint'], [{ status: 'failed' }, 'failed'],
  [{ status: 'blocked_no_worker' }, 'failed'], [{ status: 'complete' }, 'completed'],
  [{ status: 'complete', workerAlive: true }, 'running'],
  [{ status: 'checkpointed', dispatch: [{ alive: true }] }, 'pausing'],
  [{ status: 'complete', dispatch: [{ observedAlive: true }] }, 'neutral'],
  [{ status: 'resuming', workerAlive: false }, 'preparing'],
  [{ status: 'resuming', workerAlive: true }, 'running']
];
for (const [row, state] of cases) assert.equal(H.resolveState(row), state, JSON.stringify(row));
assert.equal(H.resolveState({ status: 'complete' }, false), 'neutral');
console.log('PASS Harbor pure helpers. Actual UI acceptance is verify-harbor-browser.cjs.');
