'use strict';
// Render isolated snapshots without opening a notebook or launching providers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodes = new Map();
const intervals = [];
let snapshot = { models: [{ id: 'luna', label: 'GPT-6 Luna', cli: 'gpt-6-luna', provider: 'codex', enabled: true }], projects: [], asks: [] };
function node(id) {
  if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '', childElementCount: 0, addEventListener() {}, setAttribute() {}, querySelectorAll() { return []; } });
  return nodes.get(id);
}
const context = vm.createContext({ document: { getElementById: node, documentElement: { getAttribute() { return 'dark'; }, setAttribute() {} }, querySelector() { return null; }, body: { setAttribute() {} } }, localStorage: { setItem() {} }, fetch: async url => ({ ok: true, json: async () => url === '/api/plan' ? { version: 'isolated', plan: {} } : snapshot }), setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {}, setTimeout() {}, clearTimeout() {}, Date });
const flush = () => new Promise(resolve => setImmediate(resolve));
const workerSection = () => node('orchestrator').innerHTML.split('<section class="dash-section dash-zone-plans">')[0];
node('worker-project-filter').value = 'all';
node('worker-session-filter').value = 'all';
node('worker-state-filter').value = 'all';
(async () => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'quota.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'orch.js'), 'utf8'), context);
  await flush();
  assert.match(workerSection(), /No workers launched/);
  snapshot.projects = [{ id: 'test', name: '<RaceEngineer>', status: 'needs_approval', label: 'Plan ready', modelId: 'luna', jobTitle: 'Research only', plan: ['Use Luna'] }];
  await intervals[0]();
  assert.match(workerSection(), /No workers launched/); // A plan is not a worker.
  snapshot.projects[0] = { ...snapshot.projects[0], status: 'watching', label: 'Watching', dispatch: [{ modelId: 'luna', pid: 123, alive: true, slice: 'Inspect telemetry', activity: 'Reading <repository>' }], workerTail: '<script>untrusted log</script>', progressAt: '2026-10-10T20:32:17Z' };
  await intervals[0]();
  assert.match(workerSection(), /1 running/);
  assert.match(workerSection(), /Provider: codex · Model: gpt-6-luna/);
  assert.match(workerSection(), /PID 123 · alive/);
  assert.match(workerSection(), /&lt;RaceEngineer&gt;/);
  assert.match(workerSection(), /&lt;script&gt;untrusted log&lt;\/script&gt;/);
  assert.match(workerSection(), /data-worker-log=/);
  snapshot.projects[0].dispatch[0].alive = false;
  await intervals[0]();
  assert.match(workerSection(), /0 running/);
  assert.match(workerSection(), /data-worker-state="Exited"/); // Watching does not prove a live process.
  snapshot.projects[0].status = 'checkpointed';
  await intervals[0]();
  assert.match(workerSection(), /data-worker-state="Paused"/);
  snapshot.projects[0].status = 'complete';
  snapshot.projects[0].dispatch[0].alive = true; // A reused PID cannot reopen a finished job.
  await intervals[0]();
  assert.match(workerSection(), /data-worker-state="Finished"/);
  assert.match(workerSection(), /0 running/);
  snapshot.projects[0].dispatch[0].alive = false;
  snapshot.projects[0].dispatch[0].pid = null;
  snapshot.projects[0].status = 'watching';
  await intervals[0]();
  assert.match(workerSection(), /No workers launched/);
  snapshot.researches = [{ id: 'research-1', projectName: 'RaceEngineer', title: 'Read GT7 telemetry repositories', modelId: 'luna', workerLabel: 'GPT-6 Luna', provider: 'codex', cli: 'gpt-6-luna', status: 'watching', pid: 456, alive: true, activity: 'Searching GitHub', workerTail: 'Research output', updatedAt: '2026-10-10T20:35:00Z' }, { id: 'research-2', title: 'Completed research', status: 'complete', reportAvailable: true, alive: false }];
  await intervals[0]();
  assert.match(workerSection(), /1 running/);
  assert.match(workerSection(), /Read GT7 telemetry repositories/);
  assert.match(workerSection(), /data-research-stop="research-1"/);
  assert.match(workerSection(), /data-research-report="research-2"/);
  assert.match(workerSection(), /Research · No live process · Project: complete/);
  console.log('Workers UI isolated snapshot checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
