// Legacy provider and transport fixtures; Phase 2 approval/result contracts are covered by phase2 tests.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Plan = require('../plan.js');
const { createServer } = require('../server.cjs');
const { createSkillsCache, SKILL_FILES } = require('./skills.js');
const { askPrompt, promptFor } = require('./runner.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-runtime-'));
const attemptsDir = path.join(dir, 'attempts');
const planFile = path.join(dir, 'notebook.json');
const plan = { schema: 2, projects: ['alpha', 'beta'].map(id => {
  const item = Plan.example();
  item.project = { id, name: `Fixture ${id}`, folder: path.join(dir, id) };
  fs.mkdirSync(item.project.folder);
  item.revisions.forEach(revision => { revision.open = []; });
  item.tasks = [{ id: `${id}-npc`, projectId: id, revision_id: item.revisions.at(-1).id, title: 'Previous NPC orchestration', detail: 'Historical NPC task.', status: 'running' }];
  return item;
}) };
fs.writeFileSync(planFile, JSON.stringify(plan));
const files = [...SKILL_FILES, 'skills/engineering/tdd/SKILL.md', 'skills/engineering/implement/SKILL.md', 'skills/engineering/research/SKILL.md'];
let revision = 'aaaaaaaaaaaa', broken = false;
const fetchSkills = async url => ({ ok: !(broken && url.endsWith('/tdd/SKILL.md')), status: broken ? 503 : 200, text: async () => url.includes('/commits/') ? JSON.stringify({ sha: revision, commit: { committer: { date: '2026-10-12T00:00:00Z' } } }) : url.includes('/git/trees/') ? JSON.stringify({ tree: files.map(path => ({ path, type: 'blob' })), truncated: false }) : `---\nname: ${url.split('/').at(-2)}\ndescription: Fixture Matt skill\n---\n# Fixture skill ${revision}\n` });
const skills = createSkillsCache({ dir: path.join(dir, 'skills'), fetchImpl: fetchSkills });
const models = [
  { id: 'codex-fixture', label: 'Codex fixture', provider: 'codex', cli: 'gpt-fixture', enabled: true, kind: 'premium' },
  { id: 'grok-fixture', label: 'Grok fixture', provider: 'grok', cli: 'grok-fixture', enabled: true, available: false, kind: 'premium' },
  { id: 'gemini-fixture', label: 'Gemini fixture', provider: 'antigravity', cli: 'gemini-fixture', enabled: true, kind: 'premium' }
];
let grokIds = ['grok-fixture'], nextPid = 1000;
const launches = [], calls = [], alive = new Set();
const options = { phase2: false, planFile, attemptsDir, models, skills, syncSkills: true, refreshModels: true,
  discoverModels: async provider => ({ ok: true, ids: provider.adapter === 'grok' ? grokIds : models.filter(model => model.provider === provider.id).map(model => model.cli) }), fetchPlans: async () => [],
  inspectFolder: folder => ({ folder, fileCount: 1, names: [], git: false }),
  spawnWorker: info => { launches.push(info); alive.add(++nextPid); return { pid: nextPid }; },
  isProcessAlive: pid => alive.has(pid), killWorker: pid => alive.delete(pid),
  askModel: async info => { calls.push(info); return { answer: 'Fixture assessment.', actions: [] }; }
};
let server;
async function start() { server = createServer(options); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); }
const base = () => `http://127.0.0.1:${server.address().port}`;
async function post(route, data) {
  const response = await fetch(base() + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal(response.status, 200, await response.clone().text()); return response.json();
}
async function stopServer() { await new Promise(resolve => server.close(resolve)); }
(async () => {
  await start();
  const status = await (await fetch(base() + '/api/skills')).json();
  assert.equal(status.enabled, true);
  await skills.ensure();
  const refreshed = await post('/api/models/refresh', {});
  assert.equal(refreshed.models.find(model => model.id === 'grok-fixture').available, true, 'New CLI login must replace stale account availability');
  for (const model of models) {
    await post('/api/orchestrator/lead', { id: model.id });
    await post('/api/orchestrator/ask', { question: 'Explain the current state.', projectId: 'alpha' });
    const info = calls.at(-1);
    assert.equal(info.model.provider, model.provider);
    assert.match(info.skillsPrompt, /MATT SKILLS/);
    assert.match(askPrompt(info), /aaaaaaaaaaaa/);
  }
  await post('/api/orchestrator/ask', { question: 'Explain the first detail.', projectId: 'alpha', chatSessionId: 'view-a' });
  assert.equal(calls.at(-1).state.history.length, 0, 'A newly opened chat cannot inherit prior session prompts');
  await post('/api/orchestrator/ask', { question: 'Explain the second detail.', projectId: 'alpha', chatSessionId: 'view-a' });
  assert.equal(calls.at(-1).state.history.length, 1);
  await post('/api/orchestrator/ask', { question: 'Explain a different detail.', projectId: 'alpha', chatSessionId: 'view-b' });
  assert.equal(calls.at(-1).state.history.length, 0, 'Reopening creates an independent lead context while preserving history');
  await post('/api/skills/settings', { enabled: false });
  await post('/api/orchestrator/ask', { question: 'Explain the current state.', projectId: 'alpha' });
  assert.doesNotMatch(calls.at(-1).skillsPrompt, /CATALOG/);
  assert.match(calls.at(-1).skillsPrompt, /disabled/);
  await post('/api/skills/settings', { enabled: true });
  const goodText = skills.read(files[0]);
  revision = 'bbbbbbbbbbbb'; broken = true;
  const failed = await skills.ensure();
  assert.equal(failed.status, 'cached'); assert.equal(failed.sha, 'aaaaaaaaaaaa');
  assert.equal(skills.read(files[0]), goodText, 'Partial update cannot replace a complete revision');
  broken = false;
  assert.equal((await skills.ensure()).sha, 'bbbbbbbbbbbb');
  const restoredCache = createSkillsCache({ dir: path.join(dir, 'skills'), fetchImpl: fetchSkills });
  assert.equal(restoredCache.snapshot().sha, 'bbbbbbbbbbbb');
  assert.match(restoredCache.prompt('lead'), /bbbbbbbbbbbb/);

  await post('/api/orchestrator/approve', { projectId: 'alpha' });
  await post('/api/orchestrator/stop', { projectId: 'alpha' });
  const checkpoint = path.join(attemptsDir, 'checkpoints/alpha.json');
  const oldCheckpoint = fs.readFileSync(checkpoint, 'utf8');
  const count = launches.length;
  const question = 'Audit Sayaku behavior and document the current implementation.';
  const prepared = await post('/api/orchestrator/ask', { question, projectId: 'alpha' });
  assert.equal(launches.length, count, 'Fresh request prepares a task without resuming old workers');
  const current = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  assert.equal(current.projects[0].tasks[0].status, 'superseded');
  assert.equal(current.projects[0].tasks[0].detail, 'Historical NPC task.');
  assert.equal(current.projects[0].tasks.at(-1).detail, question);
  assert.deepEqual(current.projects[1], plan.projects[1], 'Other project remains unchanged');
  assert.equal(calls.at(-1).state.currentRequest.taskId, current.projects[0].tasks.at(-1).id);
  assert.equal(prepared.snapshot.projects[0].canResume, false);
  const archives = fs.readdirSync(path.join(attemptsDir, 'checkpoints/history'));
  assert.equal(fs.readFileSync(path.join(attemptsDir, 'checkpoints/history', archives[0]), 'utf8'), oldCheckpoint);
  await post('/api/orchestrator/approve', { projectId: 'alpha' });
  assert.match(launches.at(-1).job.detail, /Audit Sayaku/);
  assert.doesNotMatch(launches.at(-1).job.detail, /Historical NPC task/);
  assert.match(promptFor({ title: launches.at(-1).job.title, detail: launches.at(-1).job.detail }), /MATT SKILLS/);
  await post('/api/orchestrator/stop', { projectId: 'alpha' });
  for (const selected of models) {
    for (const model of models) await post('/api/orchestrator/model', { id: model.id, enabled: model.id === selected.id });
    await post('/api/orchestrator/lead', { id: selected.id });
    await post('/api/orchestrator/ask', { question: `Audit Sayaku with ${selected.label}.`, projectId: 'alpha' });
    await post('/api/orchestrator/approve', { projectId: 'alpha' });
    assert.equal(launches.at(-1).worker.provider, selected.provider);
    assert.match(launches.at(-1).job.detail, /MATT SKILLS/);
    assert.equal(launches.at(-1).job.kind, 'audit');
    assert.doesNotMatch(promptFor({ kind: 'audit', detail: launches.at(-1).job.detail }), /Implement the job in this folder/);
    await post('/api/orchestrator/stop', { projectId: 'alpha' });
  }
  grokIds = [];
  const switched = await post('/api/models/refresh', {});
  assert.equal(switched.models.find(model => model.id === 'grok-fixture').available, false);
  await post('/api/skills/settings', { enabled: false });
  await stopServer();
  const stateFile = path.join(attemptsDir, 'orchestrator.json');
  const stored = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  stored.mode = 'auto'; stored.projects.beta = { status: 'watching', approved: true, dispatch: [] };
  fs.writeFileSync(stateFile, JSON.stringify(stored));
  const beforeRestart = launches.length;
  await start();
  assert.equal((await (await fetch(base() + '/api/skills')).json()).enabled, false, 'Global skill switch survives restart');
  const startup = await (await fetch(base() + '/api/orchestrator')).json();
  assert.equal(launches.length, beforeRestart, 'Startup cannot dispatch old tasks, even with saved Automatic mode');
  assert.equal(startup.projects.find(row => row.id === 'beta').status, 'needs_approval');
  console.log('OK: all-provider Matt skills, persistent opt-out, atomic updates, exact Grok refresh, fresh current-request tasks, preserved history and startup dispatch barrier.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server?.listening) await stopServer();
  const resolved = path.resolve(dir);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('pw-runtime-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
