'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAttemptEngine } = require('./attempts.js');
const { createSentinel } = require('./sentinel.js');
const { spawnSync } = require('node:child_process');
const { createOrchestrator, pickWorker, jobKind } = require('./orchestrator.js');

const models = [
  { id: 'gemini', label: 'Gemini', enabled: true },
  { id: 'grok', label: 'Grok', enabled: true },
  { id: 'luna', label: 'Luna', enabled: false }
];

function notebook(overrides) {
  const folder = overrides && overrides.folder;
  const open = overrides && 'open' in overrides ? overrides.open : [];
  const tasks = overrides && 'tasks' in overrides ? overrides.tasks : [{ id: 'job-1', projectId: 'demo', revision_id: 1, title: 'Check the repo', detail: 'Inspect.', status: 'running' }];
  const fresh = Boolean(overrides && overrides.fresh);
  const r1 = { id: 1, mode: 'manual', title: 'R1', createdAt: '2026-10-09T10:00:00Z', direction: 'Ship the core.', state: 'Ready.', closed: [], open: fresh ? open : [] };
  const revisions = fresh
    ? [r1]
    : [r1, { id: 2, mode: 'grill', title: 'Grill me from R1', createdAt: '2026-10-09T10:05:00Z', direction: 'Ship the core.', state: 'Ready.', closed: [], open }];
  return {
    schema: 2,
    projects: [{
      schema: 1,
      project: { id: 'demo', name: 'Demo', ...(folder ? { folder } : {}) },
      revisions,
      tasks
    }]
  };
}

function make(plan, inspectFolder) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-orch-'));
  const attempts = createAttemptEngine({ dir });
  const sentinel = createSentinel(attempts, { isAlive: attempt => Boolean(attempt && attempt.status === 'active') });
  const orchestra = createOrchestrator({
    readPlan: async () => plan,
    attempts,
    sentinel,
    models,
    dir,
    inspectFolder: inspectFolder || (() => ({ folder: plan.projects[0].project.folder, fileCount: 3, names: ['README.md', 'src', '.git'], git: true, head: 'ref: refs/heads/main' }))
  });
  return { dir, attempts, orchestra };
}

(async () => {
  assert.equal(jobKind({ title: 'Continue: latest repo changes' }), 'inspect');
  assert.equal(pickWorker(models, { job: { title: 'Check the repo', detail: 'Inspect.' } }).id, 'gemini');
  const full = require('../models.json');
  assert.equal(pickWorker(full, { job: { title: 'Check the repo' } }).id, 'luna');
  assert.equal(pickWorker(full, { job: { title: 'Implement the parser', detail: 'Write code.' } }).kind, 'default');
  assert.equal(pickWorker(full, { job: { title: 'Hard escalation', detail: 'complex premium fix' } }).kind, 'premium');
  assert.equal(pickWorker(full, { job: { title: 'Hard escalation', detail: 'complex' }, usage: { grok: { used: 20 } } }).id, 'gpt-5.5');
  assert.ok(full.filter(item => item.plan === 'ChatGPT').length > 1);
  assert.ok(full.filter(item => item.plan === 'Grok').length > 1);
  assert.ok(full.filter(item => item.plan === 'Gemini').every(item => item.enabled === false));

  const questions = make(notebook({ folder: 'D:\\demo', open: ['What is in scope?'] }));
  let snap = await questions.orchestra.tick();
  assert.equal(snap.projects[0].status, 'waiting_on_you');
  assert.equal(questions.attempts.getAttempts().length, 0);

  const idle = make(notebook({ folder: 'D:\\demo', open: [], tasks: [] }));
  snap = await idle.orchestra.tick();
  assert.equal(snap.projects[0].status, 'idle');
  assert.equal(snap.projects[0].waitingFor, 'Start auto task');
  assert.match(snap.projects[0].next, /Start auto task/);
  assert.equal(snap.projects[0].canStart, true);

  const fresh = make(notebook({ folder: 'D:\\demo', open: [], tasks: [], fresh: true }));
  snap = await fresh.orchestra.tick();
  assert.equal(snap.grillPropose, true);
  assert.equal(snap.projects[0].status, 'propose_grill');
  assert.equal(snap.projects[0].canGrillDocs, true);
  assert.ok(snap.projects[0].docs.includes('README.md'));
  assert.match(snap.projects[0].doing, /Grill with the docs/);
  const skipped = await fresh.orchestra.skipGrill('demo');
  assert.equal(skipped.ok, true);
  assert.equal(skipped.snapshot.projects[0].status, 'idle');
  assert.equal(skipped.snapshot.projects[0].grillSkipped, true);

  const flagged = make(notebook({ folder: 'D:\\demo', open: [], tasks: [], fresh: true }));
  snap = await flagged.orchestra.setGrillPropose(false);
  assert.equal(snap.grillPropose, false);
  assert.equal(snap.projects[0].status, 'idle');

  const noFolder = make(notebook({ open: [] }));
  snap = await noFolder.orchestra.tick();
  assert.equal(snap.projects[0].status, 'blocked_no_folder');

  const ready = make(notebook({ folder: 'D:\\demo', open: [] }));
  snap = await ready.orchestra.tick();
  assert.equal(snap.projects[0].status, 'needs_approval');
  assert.match(snap.projects[0].doing, /Approve/);
  assert.equal(snap.projects[0].waitingFor, 'Your Approve run');
  assert.match(snap.projects[0].next, /Approve to assign/);
  assert.equal(ready.attempts.getAttempts().length, 0);

  const approved = await ready.orchestra.approve('demo');
  assert.equal(approved.ok, true);
  assert.equal(approved.snapshot.projects[0].status, 'watching');
  assert.equal(approved.snapshot.projects[0].modelId, 'gemini');
  assert.match(approved.snapshot.projects[0].waitingFor, /COMPLETE/);
  assert.ok(approved.snapshot.projects[0].workerLabel);
  assert.equal(ready.attempts.getAttempts().length, 1);
  assert.equal(ready.attempts.getAttempts()[0].modelId, 'gemini');
  const again = await ready.orchestra.tick();
  assert.equal(again.projects[0].status, 'watching');
  assert.equal(ready.attempts.getAttempts().length, 1);

  const grokOnly = make(notebook({ folder: 'D:\\demo', open: [] }));
  const grokOrchestra = createOrchestrator({
    readPlan: async () => notebook({ folder: 'D:\\demo', open: [] }),
    attempts: grokOnly.attempts,
    sentinel: createSentinel(grokOnly.attempts, { isAlive: () => true }),
    models: [{ id: 'grok', label: 'Grok', enabled: true }],
    dir: grokOnly.dir,
    inspectFolder: () => ({ folder: 'D:\\demo', fileCount: 1, names: ['a'], git: false, head: '' })
  });
  snap = await grokOrchestra.tick();
  assert.equal(snap.projects[0].status, 'needs_approval');
  assert.equal(snap.projects[0].doing.includes('Grok') || snap.mode === 'manual', true);

  const autoRun = make(notebook({ folder: 'D:\\demo', open: [] }));
  snap = await autoRun.orchestra.setMode('auto');
  assert.equal(snap.mode, 'auto');
  assert.equal(snap.projects[0].status, 'watching');
  assert.equal(autoRun.attempts.getAttempts().length, 1);
  assert.ok(snap.models.some(item => item.id === 'gemini' && item.used > 0));

  const startPlan = notebook({ folder: 'D:\\demo', open: [], tasks: [] });
  const startBox = make(startPlan);
  await startBox.orchestra.setMode('auto');
  assert.equal((await questions.orchestra.startAutoTask('demo')).reason, 'open questions remain');
  assert.equal((await ready.orchestra.startAutoTask('demo')).reason, 'job already running');
  const noFolderIdle = make(notebook({ open: [], tasks: [] }));
  assert.equal((await noFolderIdle.orchestra.startAutoTask('demo')).reason, 'no folder');
  const missing = await startBox.orchestra.startAutoTask('nope');
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'project not found');
  const prepared = await startBox.orchestra.startAutoTask('demo');
  assert.equal(prepared.ok, true);
  assert.match(prepared.job.title, /Continue/);
  assert.match(prepared.job.detail, /proceed with the notebook plan/);
  startPlan.projects[0].tasks.push({
    id: 'job-auto',
    projectId: 'demo',
    revision_id: prepared.job.revision_id,
    title: prepared.job.title,
    detail: prepared.job.detail,
    status: 'running'
  });
  snap = await startBox.orchestra.tick();
  assert.equal(snap.mode, 'auto');
  assert.equal(snap.projects[0].status, 'needs_approval');
  assert.equal(startBox.attempts.getAttempts().length, 0);
  assert.match(snap.projects[0].plan.join('\n'), /Proceed with the plan/);
  const startedRun = await startBox.orchestra.approve('demo');
  assert.equal(startedRun.ok, true);
  assert.equal(startedRun.snapshot.projects[0].status, 'watching');
  assert.equal(startedRun.snapshot.projects[0].modelId, 'gemini');
  assert.equal(startBox.attempts.getAttempts().length, 1);

  const completeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-orch-'));
  const completeAttempts = createAttemptEngine({ dir: completeDir });
  const completeSentinel = createSentinel(completeAttempts, { isAlive: attempt => Boolean(attempt && attempt.status === 'active') });
  const completePlan = notebook({ folder: 'D:\\demo', open: [] });
  const completeOrch = createOrchestrator({
    readPlan: async () => completePlan,
    attempts: completeAttempts,
    sentinel: completeSentinel,
    models,
    dir: completeDir,
    inspectFolder: () => ({ folder: 'D:\\demo', fileCount: 1, names: ['README.md'], git: false, head: '' })
  });
  await completeOrch.approve('demo');
  const attempt = completeAttempts.getAttempts()[0];
  fs.writeFileSync(attempt.resultPath, 'STATUS: COMPLETE\n');
  snap = await completeOrch.tick();
  assert.equal(snap.projects[0].status, 'complete');

  const { createServer } = require('../server.cjs');
  const httpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-orch-http-'));
  const httpPlan = path.join(httpDir, 'plan.json');
  const httpFolder = path.join(httpDir, 'repo');
  fs.mkdirSync(httpFolder);
  fs.writeFileSync(path.join(httpFolder, 'README.md'), 'demo\n');
  fs.writeFileSync(httpPlan, JSON.stringify(notebook({ folder: httpFolder, open: [] })) + '\n');
  const httpServer = createServer({ planFile: httpPlan, attemptsDir: path.join(httpDir, 'attempts') });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  try {
    const listed = await (await fetch(base + '/api/orchestrator')).json();
    assert.equal(listed.mode, 'manual');
    assert.equal(listed.projects[0].status, 'needs_approval');
    assert.ok(listed.models.some(item => item.id === 'luna' && item.enabled && item.plan === 'ChatGPT'));
    assert.ok(listed.models.filter(item => item.plan === 'ChatGPT').length > 1);
    assert.ok(listed.models.filter(item => item.plan === 'Grok').length > 1);
    assert.ok(listed.models.some(item => item.id === 'grok' && item.plan === 'Grok'));
    assert.ok(listed.models.filter(item => item.plan === 'Gemini').every(item => item.enabled === false));
    const run = await fetch(base + '/api/orchestrator/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'demo' }) });
    assert.equal(run.status, 200);
    const after = await run.json();
    assert.equal(after.projects[0].status, 'watching');
    assert.equal(after.projects[0].modelId, 'luna');
    assert.ok(after.models.some(item => item.id === 'luna' && item.used >= 1 && item.remaining < item.limit));
    const autoHttp = createServer({ planFile: httpPlan, attemptsDir: path.join(httpDir, 'attempts-auto') });
    await new Promise(resolve => autoHttp.listen(0, '127.0.0.1', resolve));
    const autoBase = `http://127.0.0.1:${autoHttp.address().port}`;
    try {
      const switched = await fetch(autoBase + '/api/orchestrator/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'auto' }) });
      assert.equal(switched.status, 200);
      const autoBody = await switched.json();
      assert.equal(autoBody.mode, 'auto');
      assert.equal(autoBody.projects[0].status, 'watching');
      assert.equal(autoBody.projects[0].modelId, 'luna');
      const toggled = await fetch(autoBase + '/api/orchestrator/model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'luna', enabled: false }) });
      assert.equal(toggled.status, 200);
      const offBody = await toggled.json();
      assert.equal(offBody.models.find(item => item.id === 'luna').enabled, false);
    } finally {
      await new Promise(resolve => autoHttp.close(resolve));
    }
  } finally {
    await new Promise(resolve => httpServer.close(resolve));
  }

  const gitHttpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-orch-start-'));
  const gitRepo = path.join(gitHttpDir, 'repo');
  fs.mkdirSync(gitRepo);
  fs.writeFileSync(path.join(gitRepo, 'README.md'), 'demo\n');
  function git(args) {
    const result = spawnSync('git', ['-C', gitRepo, ...args], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(result.status, 0, String(result.stderr || (result.error && result.error.message) || ''));
    return result.stdout;
  }
  git(['init']);
  git(['config', 'user.email', 'planwharf@example.com']);
  git(['config', 'user.name', 'Planwharf']);
  git(['add', '.']);
  git(['commit', '-m', 'Add README']);
  const startPlanFile = path.join(gitHttpDir, 'plan.json');
  fs.writeFileSync(startPlanFile, JSON.stringify(notebook({ folder: gitRepo, open: [], tasks: [] })) + '\n');
  const startServer = createServer({ planFile: startPlanFile, attemptsDir: path.join(gitHttpDir, 'attempts') });
  await new Promise(resolve => startServer.listen(0, '127.0.0.1', resolve));
  const startBase = `http://127.0.0.1:${startServer.address().port}`;
  try {
    const switched = await fetch(startBase + '/api/orchestrator/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'auto' }) });
    assert.equal(switched.status, 200);
    const idleBody = await switched.json();
    assert.equal(idleBody.mode, 'auto');
    assert.equal(idleBody.projects[0].status, 'idle');
    assert.equal(idleBody.projects[0].canStart, true);
    const planBody = await (await fetch(startBase + '/api/plan')).json();
    const started = await fetch(startBase + '/api/orchestrator/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: planBody.version, projectId: 'demo' }) });
    assert.equal(started.status, 201);
    const startedBody = await started.json();
    assert.equal(startedBody.snapshot.mode, 'auto');
    assert.equal(startedBody.snapshot.projects[0].status, 'needs_approval');
    assert.match(startedBody.snapshot.projects[0].plan.join('\n'), /Latest git/);
    assert.match(startedBody.snapshot.projects[0].plan.join('\n'), /Add README/);
    assert.match(startedBody.plan.projects[0].tasks[0].title, /Add README/);
    assert.match(startedBody.plan.projects[0].tasks[0].detail, /proceed with the notebook plan/);
    assert.equal(startedBody.snapshot.projects[0].canStart, false);
    const refused = await fetch(startBase + '/api/orchestrator/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: startedBody.version, projectId: 'demo' }) });
    assert.equal(refused.status, 400);
    const approvedStart = await fetch(startBase + '/api/orchestrator/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'demo' }) });
    assert.equal(approvedStart.status, 200);
    const approvedBody = await approvedStart.json();
    assert.equal(approvedBody.projects[0].status, 'watching');
    assert.equal(approvedBody.projects[0].modelId, 'luna');
  } finally {
    await new Promise(resolve => startServer.close(resolve));
  }

  const grillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-orch-grill-'));
  const grillRepo = path.join(grillDir, 'repo');
  fs.mkdirSync(grillRepo);
  fs.writeFileSync(path.join(grillRepo, 'README.md'), '# Demo\n');
  const grillPlanFile = path.join(grillDir, 'plan.json');
  fs.writeFileSync(grillPlanFile, JSON.stringify(notebook({ folder: grillRepo, open: [], tasks: [], fresh: true })) + '\n');
  const grillServer = createServer({ planFile: grillPlanFile, attemptsDir: path.join(grillDir, 'attempts') });
  await new Promise(resolve => grillServer.listen(0, '127.0.0.1', resolve));
  const grillBase = `http://127.0.0.1:${grillServer.address().port}`;
  try {
    const proposed = await (await fetch(grillBase + '/api/orchestrator')).json();
    assert.equal(proposed.grillPropose, true);
    assert.equal(proposed.projects[0].status, 'propose_grill');
    assert.equal(proposed.projects[0].canGrillDocs, true);
    const planBody = await (await fetch(grillBase + '/api/plan')).json();
    const docsStart = await fetch(grillBase + '/api/grill-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: planBody.version, projectId: 'demo', kind: 'docs' }) });
    assert.equal(docsStart.status, 201);
    const docsBody = await docsStart.json();
    assert.equal(docsBody.plan.projects[0].revisions.at(-1).title, 'Grill with the docs');
    assert.match(docsBody.plan.projects[0].revisions.at(-1).open.join('\n'), /README\.md/);
    const afterDocs = await (await fetch(grillBase + '/api/orchestrator')).json();
    assert.equal(afterDocs.projects[0].status, 'waiting_on_you');
    const off = await fetch(grillBase + '/api/orchestrator/grill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propose: false }) });
    assert.equal(off.status, 200);
    assert.equal((await off.json()).grillPropose, false);
  } finally {
    await new Promise(resolve => grillServer.close(resolve));
  }

  const skipDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-orch-skip-'));
  const skipRepo = path.join(skipDir, 'repo');
  fs.mkdirSync(skipRepo);
  const skipPlanFile = path.join(skipDir, 'plan.json');
  fs.writeFileSync(skipPlanFile, JSON.stringify(notebook({ folder: skipRepo, open: [], tasks: [], fresh: true })) + '\n');
  const skipServer = createServer({ planFile: skipPlanFile, attemptsDir: path.join(skipDir, 'attempts') });
  await new Promise(resolve => skipServer.listen(0, '127.0.0.1', resolve));
  const skipBase = `http://127.0.0.1:${skipServer.address().port}`;
  try {
    const beforeSkip = await (await fetch(skipBase + '/api/orchestrator')).json();
    assert.equal(beforeSkip.projects[0].status, 'propose_grill');
    const skippedHttp = await fetch(skipBase + '/api/orchestrator/grill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'demo', skip: true }) });
    assert.equal(skippedHttp.status, 200);
    const skippedBody = await skippedHttp.json();
    assert.equal(skippedBody.projects[0].status, 'idle');
    assert.equal(skippedBody.projects[0].grillSkipped, true);
  } finally {
    await new Promise(resolve => skipServer.close(resolve));
  }

  console.log('OK: orchestrator gates, grill proposal, Start auto task holds Approve, Auto picks a plan worker, usage counts, COMPLETE watched.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
