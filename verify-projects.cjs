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

async function start() {
  const server = createServer({ planFile, attemptsDir });
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
async function stop(server) { await new Promise(resolve => server.close(resolve)); }

const production = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8'));
const productionSnapshot = JSON.stringify(production);

(async () => {
  const notebook = JSON.parse(JSON.stringify(production));
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

  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8'))), productionSnapshot);
  console.log('OK: add project, reload keeps it, old revisions stay, second claim refused, attempts on server file.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const server of servers) if (server.listening) await stop(server);
  await fsp.rm(dir, { recursive: true, force: true });
});
