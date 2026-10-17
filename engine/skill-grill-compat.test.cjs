'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Plan = require('../plan.js');
const { createAttemptEngine } = require('./attempts.js');
const { createOrchestrator } = require('./orchestrator.js');
function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skill-grill-'));
  const plan = { schema: 2, projects: ['alpha', 'beta'].map(id => {
    const item = Plan.example(); item.project = { id, name: id, folder: dir }; item.tasks = [];
    item.revisions = [item.revisions[0]]; item.revisions[0].open = []; return item;
  }) };
  const calls = [], reads = [], enabled = [];
  const orchestra = createOrchestrator({ dir, readPlan: async () => plan, attempts: createAttemptEngine({ dir: path.join(dir, 'attempts') }),
    models: [{ id: 'lead-fixture', provider: 'codex', cli: 'gpt-6-luna', enabled: true, available: true, kind: 'default' }],
    inspectFolder: () => ({ git: false, names: ['README.md'], docs: ['README.md'], fileCount: 1 }),
    readRepository: () => ({ local: {}, remote: {}, comparison: {} }), fetchPlans: null,
    mattSkillsEnabled: id => { enabled.push(id); return id !== 'beta'; },
    readSkill: (relative, id) => { reads.push({ relative, id }); return relative.includes('grill-with-docs') ? 'DOCS_PROCEDURE_FIXTURE' : 'GRILL_PROCEDURE_FIXTURE'; },
    askModel: async info => { calls.push(info); return { answer: 'Q1: Which outcome? Recommended: a bounded prototype.' }; },
    spawnWorker: () => { throw Error('Clarification must not dispatch workers'); }, ...extra });
  t.after(async () => { await orchestra.shutdown(); assert.ok(dir.startsWith(os.tmpdir() + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); });
  return { orchestra, calls, reads, enabled };
}
test('legacy clarification threads project identity and carries each required procedure once', async t => {
  const f = fixture(t); await f.orchestra.setOrchestrator('lead-fixture'); await f.orchestra.setGrillPropose(true, 'docs');
  const result = await f.orchestra.startAutoTask('alpha'); assert.equal(result.phase, 'grill');
  assert.deepEqual(f.reads.map(row => row.id), ['alpha', 'alpha']);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].projectId, 'alpha'); assert.equal(f.calls[0].clarificationKind, 'docs'); assert.equal(f.calls[0].allowActions, false);
  for (const marker of ['DOCS_PROCEDURE_FIXTURE', 'GRILL_PROCEDURE_FIXTURE']) assert.equal(f.calls[0].question.split(marker).length, 2);
  assert.ok(f.enabled.length && f.enabled.every(id => id === 'alpha'));
});
test('disabled project uses deterministic built-in clarification without reading or calling a model', async t => {
  const f = fixture(t); await f.orchestra.setOrchestrator('lead-fixture');
  const result = await f.orchestra.startAutoTask('beta'); assert.equal(result.phase, 'grill'); assert.ok(result.questions.length);
  assert.deepEqual(f.reads, []); assert.deepEqual(f.calls, []); assert.ok(f.enabled.every(id => id === 'beta'));
});
test('catalog wrapper can provide the required clarification procedure once without legacy injection', async t => {
  const transported = [], reads = [];
  const f = fixture(t, { readSkill: (relative, projectId) => { reads.push({ relative, projectId }); return ''; },
    askModel: async info => { assert.equal(info.clarificationKind, 'me'); assert.equal(info.projectId, 'alpha'); assert.doesNotMatch(info.question, /GRILL_PROCEDURE_FIXTURE/); transported.push(info.question + '\nCATALOG_APPROVED_GRILL'); return { answer: 'Q1: First outcome? Recommended: a prototype.' }; } });
  await f.orchestra.setOrchestrator('lead-fixture'); const result = await f.orchestra.startAutoTask('alpha'); assert.equal(result.phase, 'grill');
  assert.equal(transported.length, 1); assert.equal(transported[0].split('CATALOG_APPROVED_GRILL').length, 2); assert.equal(reads[0].projectId, 'alpha');
});
test('chat Grill permission check receives its explicit recipient project', async t => {
  const f = fixture(t); await f.orchestra.setOrchestrator('lead-fixture');
  const result = await f.orchestra.ask('Grill me', 'beta', 'beta-chat', 'default', 'me');
  assert.match(result.answer, /skills are disabled/i); assert.deepEqual(f.calls, []); assert.ok(f.enabled.length && f.enabled.every(id => id === 'beta'));
});

test('project snapshots expose callback metadata per project without model calls', async t => {
  const seen = [];
  const f = fixture(t, { projectSkillState: projectId => { seen.push(projectId); return { projectId, enabled: ['local/' + projectId], deliveries: [], loaded: 'unverified' }; } });
  const snapshot = await f.orchestra.snapshot();
  for (const project of snapshot.projects) { assert.equal(project.projectSkills.projectId, project.id); assert.deepEqual(project.projectSkills.enabled, ['local/' + project.id]); }
  assert.deepEqual(new Set(seen), new Set(['alpha', 'beta'])); assert.deepEqual(f.calls, []); assert.deepEqual(f.reads, []);
});
