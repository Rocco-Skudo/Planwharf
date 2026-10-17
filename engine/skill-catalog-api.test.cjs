'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createServer } = require('../server.cjs');
test('project catalog HTTP gates bind inspection and approval to existing projects and current bytes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-catalog-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const seed = require('../fixtures/starter-notebook.json').projects[0];
  const plan = { schema: 2, projects: ['alpha', 'beta'].map(id => ({ ...structuredClone(seed), project: { id, name: id, folder: path.join(dir, id) }, tasks: [] })) };
  for (const item of plan.projects) fs.mkdirSync(item.project.folder);
  const file = path.join(dir, 'alpha', '.planwharf', 'skills', 'fixture', 'SKILL.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\nname: fixture\ndescription: Verify fixture tests\n---\nInspect fixture only.');
  const planFile = path.join(dir, 'notebook.json'); fs.writeFileSync(planFile, JSON.stringify(plan));
  let downloads = 0, executionCalls = 0, releaseDownload, downloadStarted;
  const started = new Promise(resolve => { downloadStarted = resolve; });
  const server = createServer({ planFile, attemptsDir: path.join(dir, 'attempts'), models: [], skillsEnabled: false, syncSkills: false, refreshModels: false, fetchPlans: null,
    fetchSkills: async () => { downloads++; downloadStarted(); await new Promise(resolve => { releaseDownload = resolve; }); throw Error('Offline fixture download ended'); },
    spawnWorker: () => { executionCalls++; throw Error('No workers authorized'); }, askModel: () => { executionCalls++; throw Error('No provider calls authorized'); } });
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, input, status = 200) {
    const response = await fetch(base + '/api/project-skills' + route, input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  await request('?projectId=missing', undefined, 404);
  await request('/discover', { projectId: 'alpha', folder: dir }, 400);
  const discovered = await request('/discover', { projectId: 'alpha' });
  const local = discovered.catalog.find(row => row.source === 'project-local'); assert.ok(local); assert.equal(local.approved, false);
  const inspected = await request('/content?projectId=alpha&id=' + encodeURIComponent(local.id));
  assert.match(Object.values(inspected.texts).join(''), /Inspect fixture only/);
  await request('/content?projectId=beta&id=' + encodeURIComponent(local.id), undefined, 400);
  await request('/approve', { projectId: 'beta', id: local.id, enabled: true, contentHash: inspected.contentHash }, 400);
  await request('/approve', { projectId: 'alpha', id: local.id, enabled: true, contentHash: 'stale' }, 400);
  const approved = await request('/approve', { projectId: 'alpha', id: local.id, enabled: true, contentHash: inspected.contentHash });
  assert.equal(approved.catalog.find(row => row.id === local.id).approved, true);
  await request('/settings', { projectId: 'alpha', settings: { mode: 'manual', selected: [local.id] } });
  assert.equal((await request('?projectId=beta')).preferences.mode, 'auto');
  const staged = await request('?projectId=alpha&source=project-local'); assert.equal(staged.executionIntegration, true); assert.equal(staged.preferences.deliveryEnabled, false); assert.equal(staged.catalog.length, 1);
  fs.writeFileSync(path.join(dir, 'alpha', 'README.md'), 'Fixture project validation instructions.');
  const draftInput = { projectId: 'alpha', name: 'manual-fixture', description: 'Verify fixture project', procedure: 'Read README.md and report observed fixture results.', references: ['README.md'], requested: true };
  await request('/drafts/create', { ...draftInput, folder: dir }, 400);
  await request('/drafts/create', { ...draftInput, outcomes: [{ validated: true }] }, 400);
  const draft = await request('/drafts/create', draftInput);
  assert.equal(draft.status, 'draft');
  await request('/drafts/approve', { projectId: 'beta', id: draft.id, revision: draft.revision, approved: true }, 400);
  await request('/drafts/approve', { projectId: 'alpha', id: draft.id, revision: 'stale', approved: true }, 400);
  const savedDraft = await request('/drafts/approve', { projectId: 'alpha', id: draft.id, revision: draft.revision, approved: true });
  assert.equal(savedDraft.activated, false);
  assert.equal(fs.readFileSync(path.join(dir, 'alpha', '.planwharf', 'skills', 'manual-fixture', 'SKILL.md'), 'utf8'), draft.content);
  assert.equal((await request('/drafts?projectId=beta')).drafts.length, 0);
  fs.unlinkSync(file);
  // A missing SKILL.md withdraws cached approvals even if discovery reports the malformed directory.
  await request('/discover', { projectId: 'alpha' }, 400);
  assert.equal((await request('?projectId=alpha')).catalog.some(row => row.id === local.id), false);
  await request('/install', { projectId: 'alpha', id: 'ecc/verification-loop', approved: false }, 400);
  assert.equal(downloads, 0); assert.equal(executionCalls, 0);
  const installing = request('/install', { projectId: 'alpha', id: 'ecc/verification-loop', approved: true }, 400);
  await started;
  try {
    const stopResponse = await fetch(base + '/api/orchestrator/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'alpha' }), signal: AbortSignal.timeout(1500) });
    // No task is running, but the real Stop handler must answer while download is pending.
    assert.equal(stopResponse.status, 400);
    assert.deepEqual(await stopResponse.json(), { error: 'no running job' });
  } finally { releaseDownload(); await installing; }
  assert.equal(executionCalls, 0);
});
test('corrupt optional catalog preserves existing notebook endpoints and registry bytes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-catalog-corrupt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const planFile = path.join(dir, 'notebook.json');
  fs.writeFileSync(planFile, JSON.stringify(require('../fixtures/starter-notebook.json')));
  const registry = path.join(dir, 'attempts', 'project-skills', 'registry.json');
  fs.mkdirSync(path.dirname(registry), { recursive: true }); fs.writeFileSync(registry, '{broken');
  const server = createServer({ planFile, attemptsDir: path.join(dir, 'attempts'), models: [], skillsEnabled: false, refreshModels: false, fetchPlans: null });
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/api/plan')).status, 200);
  assert.equal((await fetch(base + '/api/project-skills?projectId=any')).status, 503);
  assert.equal(fs.readFileSync(registry, 'utf8'), '{broken');
});
