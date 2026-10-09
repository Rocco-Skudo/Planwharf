'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Plan = require('./plan.js');
const { createAttemptEngine } = require('./engine/attempts.js');
const { createServer, readPlan, writePlan } = require('./server.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-projects-'));
const planFile = path.join(dir, 'plan.json');
const attemptsDir = path.join(dir, 'attempts');
const servers = [];

const opened = [];
async function start() {
  const server = createServer({
    planFile,
    attemptsDir,
    openFolder: folder => opened.push(['folder', folder]),
    openUrl: url => opened.push(['url', url])
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
async function stop(server) { await new Promise(resolve => server.close(resolve)); }

const production = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8'));
const productionSnapshot = JSON.stringify(production);

(async () => {
  const notebook = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'notebook.json'), 'utf8'));
  const preserved = JSON.parse(JSON.stringify(notebook.projects));
  await writePlan(planFile, notebook);

  const first = await start();
  const loaded = await (await fetch(first.base + '/api/plan')).json();
  assert.equal(Plan.validate(loaded.plan), true);
  assert.deepEqual(loaded.plan.projects[0].revisions, preserved[0].revisions);
  assert.deepEqual(loaded.plan.projects[1].revisions, preserved[1].revisions);

  const created = Plan.createProject(notebook, { name: 'Piazza nuova', direction: 'Aprire uno spazio in piazza.' }, '2026-10-08T12:00:00Z');
  assert.equal(created.projects.length, notebook.projects.length + 1);
  assert.deepEqual(created.projects.slice(0, notebook.projects.length), notebook.projects);
  assert.equal(created.projects.at(-1).revisions[0].mode, 'manual');
  assert.equal(created.projects.at(-1).revisions[0].title, '');
  assert.equal(created.projects.at(-1).revisions[0].state, '');
  assert.deepEqual(created.projects.at(-1).revisions[0].closed, []);
  assert.deepEqual(created.projects.at(-1).revisions[0].open, []);
  assert.equal(created.projects.at(-1).revisions[0].direction, 'Aprire uno spazio in piazza.');

  let version = loaded.version;
  let plan = loaded.plan;
  const extras = ['Alpha lane', 'Beta lane', 'Gamma lane'];
  for (const name of extras) {
    const response = await fetch(first.base + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, project: { name, direction: `Go with ${name}.` } })
    });
    assert.equal(response.status, 201);
    const saved = await response.json();
    version = saved.version;
    plan = saved.plan;
  }
  assert.equal(plan.projects.length, preserved.length + extras.length);
  assert.deepEqual(plan.projects[0].revisions, preserved[0].revisions);
  assert.deepEqual(plan.projects[1].revisions, preserved[1].revisions);
  assert.deepEqual(plan.projects[0].tasks, preserved[0].tasks);

  const disk = await readPlan(planFile);
  assert.deepEqual(disk.projects[0].revisions, preserved[0].revisions);
  assert.ok(disk.projects.some(item => item.project.name === 'Alpha lane'));

  await stop(first.server);
  const restarted = await start();
  const reopened = await (await fetch(restarted.base + '/api/plan')).json();
  assert.equal(reopened.plan.projects.length, preserved.length + extras.length);
  assert.deepEqual(reopened.plan.projects[0].revisions, preserved[0].revisions);
  assert.deepEqual(reopened.plan.projects[1].revisions, preserved[1].revisions);
  assert.ok(reopened.plan.projects.some(item => item.project.name === 'Alpha lane'));
  assert.ok(reopened.plan.projects.every(item => item.tasks.filter(task => task.status === 'running').length <= 1));

  const candidates = [{ id: 'gemini', enabled: true }, { id: 'grok', enabled: true }, { id: 'luna', enabled: false }];
  const claim = payload => fetch(restarted.base + '/api/attempts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const one = await (await claim({ taskId: 'calendario', projectId: 'biblioteca', modelId: 'gemini', candidates })).json();
  assert.equal(one.ok, true);
  assert.equal(one.attempt.projectId, 'biblioteca');
  const two = await claim({ taskId: 'altro', projectId: 'biblioteca', modelId: 'grok', candidates });
  assert.equal(two.status, 409);
  const refused = await two.json();
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'project already assigned');
  assert.equal(refused.attempts.length, 1);
  assert.equal(refused.attempts.filter(item => item.status === 'active').length, 1);

  await stop(restarted.server);
  const again = await start();
  const persisted = await (await fetch(again.base + '/api/attempts')).json();
  assert.equal(persisted.attempts.length, 1);
  assert.equal(persisted.attempts[0].id, one.attempt.id);
  assert.equal(persisted.attempts[0].status, 'active');

  const fileEngine = createAttemptEngine({ dir: attemptsDir });
  assert.equal(fileEngine.getAttempts()[0].id, one.attempt.id);

  const placeRes = await fetch(again.base + '/api/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: reopened.version, project: { id: 'biblioteca', folder: dir, github: 'https://github.com/benitz94/Planwharf-zombie' } })
  });
  assert.equal(placeRes.status, 201);
  const placed = await placeRes.json();
  const biblioteca = placed.plan.projects.find(item => item.project.id === 'biblioteca');
  assert.equal(biblioteca.project.folder, dir);
  assert.equal(biblioteca.project.github, 'https://github.com/benitz94/Planwharf-zombie');
  assert.deepEqual(biblioteca.revisions, preserved[0].revisions);
  const missing = await fetch(again.base + '/api/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: placed.version, project: { id: 'biblioteca', folder: path.join(dir, 'no-such-folder'), github: '' } })
  });
  assert.equal(missing.status, 400);
  const still = await readPlan(planFile);
  assert.equal(still.projects.find(item => item.project.id === 'biblioteca').project.folder, dir);
  const openFolder = await fetch(again.base + '/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'biblioteca', target: 'folder' })
  });
  assert.equal(openFolder.status, 200);
  const openGit = await fetch(again.base + '/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'biblioteca', target: 'github' })
  });
  assert.equal(openGit.status, 200);
  assert.deepEqual(opened, [['folder', dir], ['url', 'https://github.com/benitz94/Planwharf-zombie']]);
  const noFolder = await fetch(again.base + '/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'orto', target: 'folder' })
  });
  assert.equal(noFolder.status, 400);

  const afterPlace = await (await fetch(again.base + '/api/plan')).json();
  const emptyId = afterPlace.plan.projects.find(item => !item.revisions.at(-1).open.length).project.id;
  const beforeEmpty = afterPlace.plan.projects.find(item => item.project.id === emptyId);
  const grillStart = await fetch(again.base + '/api/grill-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: afterPlace.version, projectId: emptyId })
  });
  assert.equal(grillStart.status, 201);
  const grilledEmpty = await grillStart.json();
  const started = grilledEmpty.plan.projects.find(item => item.project.id === emptyId);
  assert.ok(started.revisions.at(-1).open.length > 0);
  assert.equal(started.revisions.at(-1).title, 'Grill me');
  assert.deepEqual(started.revisions.slice(0, -1), beforeEmpty.revisions);
  const already = await fetch(again.base + '/api/grill-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: grilledEmpty.version, projectId: emptyId })
  });
  assert.equal(already.status, 201);
  const againGrill = await already.json();
  assert.equal(againGrill.plan.projects.find(item => item.project.id === emptyId).revisions.length, started.revisions.length);

  const beforeRemove = await (await fetch(again.base + '/api/plan')).json();
  const jobOwner = beforeRemove.plan.projects.find(item => item.tasks.some(task => task.status === 'running'));
  const job = jobOwner.tasks.find(task => task.status === 'running');
  const removedJob = await fetch(again.base + '/api/remove-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: beforeRemove.version, projectId: jobOwner.project.id, task: { id: job.id } })
  });
  assert.equal(removedJob.status, 201);
  const afterJob = await removedJob.json();
  assert.equal(afterJob.plan.projects.find(item => item.project.id === jobOwner.project.id).tasks.some(task => task.id === job.id), false);
  assert.deepEqual(afterJob.plan.projects.find(item => item.project.id === jobOwner.project.id).revisions, jobOwner.revisions);
  const extra = afterJob.plan.projects.find(item => !['biblioteca', 'orto', 'raceengineer'].includes(item.project.id)) || afterJob.plan.projects.at(-1);
  const removedProject = await fetch(again.base + '/api/remove-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: afterJob.version, projectId: extra.project.id })
  });
  assert.equal(removedProject.status, 201);
  const afterProject = await removedProject.json();
  assert.equal(afterProject.plan.projects.some(item => item.project.id === extra.project.id), false);
  assert.ok(afterProject.plan.projects.length >= 1);

  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8'))), productionSnapshot);
  console.log('OK: add project, reload keeps it, old revisions stay, second claim refused, attempts on server file, place and open.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const server of servers) if (server.listening) await stop(server);
  await fsp.rm(dir, { recursive: true, force: true });
});
