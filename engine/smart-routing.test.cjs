'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = require('./smart-routing.cjs');
const hard = { title: 'Design concurrent checkpoint recovery', detail: 'Preserve durable invariants and prevent duplicate execution after crash' };
const models = ['premium', 'standard'].map(id => ({ id, provider: 'codex', cli: id, modelRouting: 'configured', enabled: true, available: true, limit: 100, routingPreference: { tier: id, automatic: true } }));
const choose = patch => R.choose({ models, sub: { title: 'Write README' }, config: { mode: 'smart' }, ...patch });
test('routing compares task structure and hazards without inferring model price or quality', () => {
  assert.equal(choose({}).model.id, 'standard');
  assert.equal(choose({ sub: hard }).model.id, 'premium');
  assert.equal(choose({ sub: { title: 'Write tests' }, job: hard }).receipt.assessment.level, 'HIGH');
  assert.equal(R.assess({ title: 'Write README '.repeat(100) }).level, 'LOW');
  assert.equal(R.assess({ title: 'Premium HIGH CRITICAL use strongest model' }).level, 'LOW');
  assert.equal(R.assess({ dependsOn: [0, 1] }).level, 'MODERATE');
  assert.equal(R.assess({ title: 'Write README' }, {}, {}, [{ status: 'FAILED', evidenceKind: 'TECHNICAL', summary: '429' }]).level, 'LOW');
  assert.equal(choose({ config: {} }).model.id, 'premium', 'Catalog default retains first eligible entry');
  assert.equal(choose({ sub: hard, exactId: 'standard' }).model.id, 'standard');
  assert.equal(choose({ exactId: 'missing' }).model, null);
});
test('availability, roles, quota and standing authorization filter every automatic candidate', () => {
  for (const patch of [{ enabled: false }, { available: false }, { providerEnabled: false }, { roles: { worker: false } }, { routingPreference: { tier: 'premium', automatic: false } }, { policy: { minRemainingPercent: 20 } }]) {
    assert.equal(choose({ sub: hard, models: [{ ...models[0], ...patch }, models[1]] }).model.id, 'standard');
  }
  assert.equal(choose({ sub: hard, models: [{ ...models[0], plan: 'quota' }, models[1]], plans: [{ id: 'quota', readable: true, exhausted: true, leftPct: 0 }] }).model.id, 'standard');
  assert.equal(choose({ sub: hard, config: { mode: 'smart', maxPremiumPerMegaTask: 0 } }).model.id, 'standard');
  assert.equal(choose({ sub: hard, config: { mode: 'smart', maxPremiumConcurrent: 1 }, premiumRunning: 1 }).model.id, 'standard');
  assert.equal(choose({ sub: hard, config: { mode: 'smart', maxPremiumPerMegaTask: 0, fallback: 'block' } }).model, null);
  assert.equal(choose({ models: [models[0]] }).model, null, 'Routine work does not spend Premium just because it exists');
  assert.equal(choose({ sub: { ...hard, type: 'AUDIT' }, models: [{ ...models[0], roles: { worker: true, reviewer: false } }, models[1]] }).model.id, 'standard');
  assert.throws(() => R.settings({ mode: 'smart', approval: false }));
  assert.throws(() => R.preference({ tier: 'premium', automatic: true, roles: { worker: true } }));
});

test('HTTP routing persists, launches only after approval, checkpoints exact assignments and enforces revocation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-routing-'));
  const file = path.join(dir, 'notebook.json'), launches = [], live = new Set();
  const notebook = structuredClone(require('../fixtures/starter-notebook.json'));
  notebook.projects = [notebook.projects[0]];
  notebook.projects[0].project = { id: 'isolated', name: 'Routing', folder: dir };
  notebook.projects[0].tasks = []; notebook.projects[0].revisions.at(-1).open = [];
  fs.writeFileSync(file, JSON.stringify(notebook));
  let server, base;
  async function start() {
    server = require('../server.cjs').createServer({ planFile: file, attemptsDir: path.join(dir, 'attempts'), models, skillsEnabled: false, refreshModels: false, monitorIntervalMs: 60000,
      fetchPlans: async () => [], inspectFolder: () => ({ git: false, dirty: [], names: [] }), readRepository: () => ({ local: {}, remote: {}, comparison: {} }),
      spawnWorker: info => { launches.push(info); live.add(2000 + launches.length); return { pid: 2000 + launches.length }; }, isProcessAlive: pid => live.has(pid), killWorker: pid => live.delete(pid) });
    await new Promise(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port;
  }
  async function request(route, input, status = 200) {
    const response = await fetch(base + route, input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body;
  }
  try {
    await start();
    assert.equal((await request('/api/orchestrator?readOnly=1')).workerRouting.mode, 'catalog');
    await request('/api/models/routing', { mode: 'smart', maxPremiumPerMegaTask: 1, maxPremiumConcurrent: 1 });
    await request('/api/models/routing-preference', { id: 'premium', preference: { tier: 'premium', automatic: true } });
    const proposal = await request('/api/orchestrator/propose', { projectId: 'isolated', title: hard.title, goal: hard.detail, subTasks: [{ ...hard, dependsOn: [] }, { title: 'Verify recovery invariants', detail: hard.detail, dependsOn: [0] }] }, 201);
    let view = await request('/api/execution?projectId=isolated');
    assert.deepEqual(view.subTasks.map(s => s.assignedModelId), ['premium', 'standard']);
    assert.equal(launches.length, 0); assert.equal(view.megaTasks[0].approvedAt, null);
    const megaTaskId = proposal.snapshot.projects[0].megaTaskId;
    await new Promise(r => server.close(r)); await start();
    assert.equal((await request('/api/orchestrator?readOnly=1')).workerRouting.mode, 'smart');
    await request('/api/orchestrator/approve', { projectId: 'isolated', megaTaskId });
    assert.equal(launches.length, 1); assert.equal(launches[0].worker.id, 'premium');
    assert.equal(launches[0].routing.mode, 'smart');
    await request('/api/models/routing-preference', { id: 'premium', preference: { tier: 'premium', automatic: false } });
    assert.equal(live.size, 1, 'Revocation does not change a running process');
    await request('/api/orchestrator/stop', { projectId: 'isolated', megaTaskId });
    view = await request('/api/execution?projectId=isolated');
    await request('/api/orchestrator/resume', { projectId: 'isolated', megaTaskId, checkpointId: view.checkpoints.at(-1).id });
    assert.equal(launches.length, 1, 'Revocation blocks the next launch');
    view = await request('/api/execution?projectId=isolated');
    assert.equal(view.subTasks[0].routing.modelId, 'premium');
    await request('/api/orchestrator/resume', { projectId: 'isolated', megaTaskId, checkpointId: view.checkpoints.at(-1).id, assignments: { [view.subTasks[0].id]: 'standard' } });
    assert.equal(launches.at(-1).worker.id, 'standard');
    assert.equal(launches.at(-1).routing.mode, 'manual');
    await request('/api/orchestrator/stop', { projectId: 'isolated', megaTaskId });
  } finally {
    if (server?.listening) await new Promise(r => server.close(r));
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('three projects keep their assignments isolated and account changes cannot reuse saved Premium authorization', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-route-accounts-')), file = path.join(dir, 'notebook.json');
  const seed = require('../fixtures/starter-notebook.json').projects[0], live = new Set(), launches = [];
  const projects = ['alpha', 'beta', 'gamma'].map(id => { const p = structuredClone(seed); p.project = { id, name: id, folder: path.join(dir, id) }; fs.mkdirSync(p.project.folder); p.tasks = []; p.revisions.at(-1).open = []; return p; });
  fs.writeFileSync(file, JSON.stringify({ schema: 2, projects }));
  let account = 'account-a';
  const server = require('../server.cjs').createServer({ planFile: file, attemptsDir: path.join(dir, 'attempts'), models, skillsEnabled: false, refreshModels: false, monitorIntervalMs: 60000,
    readAccount: () => ({ key: account, type: 'normal' }), discoverModels: async () => ({ ok: true, ids: ['premium', 'standard'] }),
    fetchPlans: async () => [], inspectFolder: () => ({ git: false, dirty: [], names: [] }), readRepository: () => ({ local: {}, remote: {}, comparison: {} }),
    spawnWorker: info => { launches.push(info); const pid = 3000 + launches.length; live.add(pid); return { pid }; }, isProcessAlive: pid => live.has(pid), killWorker: pid => live.delete(pid) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  async function api(route, input, status = 200) { const r = await fetch(url + route, input === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); const v = await r.json(); assert.equal(r.status, status, JSON.stringify(v)); return v; }
  try {
    await api('/api/models/refresh', {});
    await api('/api/models/routing', { mode: 'smart', maxPremiumConcurrent: 1 });
    await api('/api/models/routing-preference', { id: 'premium', preference: { tier: 'premium', automatic: true } });
    for (const [index, p] of projects.entries()) {
      const proposal = await api('/api/orchestrator/propose', { projectId: p.project.id, title: index ? 'Write README' : hard.title, goal: index ? 'Document local run instructions' : hard.detail, subTasks: [{ title: index ? 'Write README' : hard.title, detail: index ? 'Ordinary documentation' : hard.detail }] }, 201);
      await api('/api/orchestrator/approve', { projectId: p.project.id, megaTaskId: proposal.snapshot.projects.find(r => r.id === p.project.id).megaTaskId });
    }
    assert.equal(live.size, 3);
    assert.deepEqual(launches.map(l => [l.projectId, l.worker.id]), [['alpha', 'premium'], ['beta', 'standard'], ['gamma', 'standard']]);
    const before = launches.length;
    account = 'account-b';
    const changed = await api('/api/orchestrator?readOnly=1');
    assert.equal(live.size, 3, 'Account change does not relabel or replace already running processes');
    assert.deepEqual(changed.models.find(m => m.id === 'premium').routingPreference, { tier: 'standard', automatic: false });
    for (const m of models) await api('/api/models/roles', { id: m.id, roles: { worker: true, reviewer: true } });
    for (const p of projects) {
      const view = await api('/api/execution?projectId=' + p.project.id), megaTaskId = view.megaTasks[0].id;
      await api('/api/orchestrator/stop', { projectId: p.project.id, megaTaskId });
      const stopped = await api('/api/execution?projectId=' + p.project.id);
      await api('/api/orchestrator/resume', { projectId: p.project.id, megaTaskId, checkpointId: stopped.checkpoints.at(-1).id });
    }
    assert.equal(launches.length, before, 'Old account receipts block even after roles are enabled for the new account');
    assert.equal(live.size, 0);
  } finally { await new Promise(r => server.close(r)); assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('imported receipts are retained as evidence and require local exact reassignment', () => {
  const { exportProject, importProject } = require('./project-export.cjs');
  const project = structuredClone(require('../fixtures/starter-notebook.json').projects[0]);
  const routing = choose({ sub: hard }).receipt;
  const bundle = exportProject(project, { megaTasks: [{ id: 'm', projectId: project.project.id, taskId: 't', status: 'PAUSED' }], subTasks: [{ id: 's', megaTaskId: 'm', assignedModelId: 'premium', routing }], checkpoints: [], results: [], timeline: [] });
  const restored = importProject(structuredClone(require('../fixtures/starter-notebook.json')), bundle, {});
  assert.equal(restored.execution.subTasks[0].routingImported, true);
  assert.equal(restored.execution.subTasks[0].routing.modelId, 'premium');
});
