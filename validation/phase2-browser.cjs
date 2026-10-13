'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('../server.cjs');
const { findBrowser } = require('../planwharf.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-phase2-browser-'));
const starter = require('../fixtures/starter-notebook.json').projects[0];
const plan = { schema: 2, projects: ['raceengineer', 'ai-companion-desktop'].map(id => {
  const item = structuredClone(starter); item.project = { id, name: id, folder: path.join(dir, id) }; item.revisions[0].direction = `${id} isolated goal`; fs.mkdirSync(item.project.folder); return item;
}) };
const file = path.join(dir, 'notebook.json'); fs.writeFileSync(file, JSON.stringify(plan));
const models = [1, 2, 3].map(n => ({ id: 'fixture-' + n, label: 'Fixture ' + n, provider: 'codex', cli: 'gpt-6-luna', enabled: true, available: true, kind: 'default', cost: 1, limit: 50 }));
models.push(...Array.from({ length: 52 }, (_, n) => ({ id: 'catalog-' + n, label: 'Catalog model ' + n, provider: 'codex', cli: 'gpt-6-luna', enabled: false, roles: { orchestrator: n !== 51, worker: true, reviewer: true }, available: true, orchestratorEligible: n !== 51, workerEligible: true })));
const live = new Set(), launches = []; let pid = 1000, origin, browser;
const sockets = [];
const server = createServer({ planFile: file, attemptsDir: path.join(dir, 'attempts'), models, skillsEnabled: false, syncSkills: false, refreshModels: false, fetchPlans: null, monitorIntervalMs: 60000,
  inspectFolder: folder => ({ folder, git: false, names: [], dirty: [], fileCount: 0 }),
  spawnWorker: info => { const processId = ++pid; launches.push({ ...info, pid: processId }); live.add(processId); return { pid: processId }; }, isProcessAlive: processId => live.has(processId), killWorker: processId => live.delete(processId),
  askModel: () => { throw new Error('Home rendering must not invoke AI.'); } });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(url) {
  const socket = new WebSocket(url); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const waiting = new Map(); let sequence = 0;
  socket.addEventListener('message', event => { const reply = JSON.parse(event.data), pending = waiting.get(reply.id); if (pending) { clearTimeout(pending.timer); waiting.delete(reply.id); reply.error ? pending.reject(new Error(reply.error.message)) : pending.resolve(reply.result); } });
  return (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { waiting.delete(id); reject(new Error('Browser timeout: ' + method)); }, 10000); waiting.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(command, expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
}
async function until(command, expression) { for (let n = 0; n < 150; n++) { if (await evaluate(command, expression)) return; await pause(100); } throw new Error('UI condition failed: ' + expression + '; error: ' + await evaluate(command, "document.getElementById('home-error')?.textContent")); }
async function post(route, data) { const response = await fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); assert.ok(response.ok, await response.clone().text()); return response.json(); }
function finish(info) {
  fs.writeFileSync(info.structuredResultPath, JSON.stringify({ resultId: info.resultId, attemptId: info.attemptId, subTaskId: info.subTaskId, megaTaskId: info.megaTaskId, status: 'COMPLETE', summary: 'Durable completed fixture ' + info.job.title,
    filesChanged: ['fixture.txt'], tests: [{ command: 'Fixture check', status: 'PASSED', evidence: 'Observed isolated test result' }], blockers: [], nextAction: 'Run the next real probe', createdAt: new Date().toISOString() }));
  fs.writeFileSync(info.exitPath, JSON.stringify({ attemptId: info.attemptId, exitCode: 0, provider: info.worker.provider, model: info.worker.cli }));
  fs.writeFileSync(info.resultPath, 'STATUS: COMPLETE\nEXIT: 0\n'); live.delete(info.pid);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  const proposal = await post('/api/orchestrator/propose', { projectId: 'raceengineer', title: 'Browser durable objective', goal: 'Verify readable project history', subTasks: [0, 1].map(index => ({ title: 'Browser slice ' + (index + 1), detail: 'Isolated browser fixture', assignedModelId: 'fixture-1', dependsOn: index ? [index - 1] : [] })) });
  const mt = proposal.snapshot.projects.find(row => row.id === 'raceengineer').megaTaskId;
  browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${path.join(dir, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port; for (let n = 0; n < 100; n++) { try { port = Number(fs.readFileSync(path.join(dir, 'profile/DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {} if (port) break; await pause(100); }
  assert.ok(port, 'Browser DevTools unavailable');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(), command = await connect(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await command('Page.navigate', { url: origin });
  await until(command, "document.getElementById('home-progress-details')?.textContent.includes('Browser durable objective')");
  assert.equal(launches.length, 0);
  assert.match(await evaluate(command, "document.getElementById('home-progress-details').textContent"), /PENDING/);
  assert.match(await evaluate(command, "document.getElementById('home-next').textContent"), /approve/i);
  await evaluate(command, "document.getElementById('home-next-action').click()");
  for (let n = 0; n < 100 && !launches.length; n++) await pause(50);
  assert.equal(launches.length, 1);
  await until(command, "document.getElementById('home-next').textContent.includes('Work in progress: Browser slice 1')");
  assert.doesNotMatch(await evaluate(command, "document.getElementById('home-next').textContent"), /approv/i);
  finish(launches[0]); await (await fetch(origin + '/api/orchestrator')).json(); assert.equal(launches.length, 2);
  await until(command, "document.getElementById('home-next').textContent.includes('Work in progress: Browser slice 2')");
  await post('/api/orchestrator/stop', { projectId: 'raceengineer', megaTaskId: mt });
  await until(command, "document.getElementById('home-now').textContent.includes('Paused')");
  assert.match(await evaluate(command, "document.getElementById('home-next-action').textContent"), /Resume/);
  assert.equal(await evaluate(command, "document.getElementById('home-next').textContent"), 'Review remaining slices and resume this checkpoint.');
  await evaluate(command, "document.getElementById('home-next-action').click()");
  for (let n = 0; n < 100 && launches.length < 3; n++) await pause(50);
  assert.equal(launches.length, 3); assert.equal(launches[2].subTaskId, launches[1].subTaskId);
  await until(command, "document.getElementById('home-next').textContent.includes('Work in progress: Browser slice 2')");
  assert.doesNotMatch(await evaluate(command, "document.getElementById('home-next').textContent"), /approv/i);
  finish(launches[2]); await (await fetch(origin + '/api/orchestrator')).json();
  await command('Page.reload');
  await until(command, "document.getElementById('home-progress').textContent.includes('Durable completed fixture')");
  assert.match(await evaluate(command, "document.getElementById('home-since').textContent"), /Completed Browser durable objective/);
  assert.match(await evaluate(command, "document.getElementById('home-progress-details').textContent"), /Tests reported/);
  assert.equal(await evaluate(command, "document.getElementById('home-next').textContent"), 'Run the next real probe');
  await evaluate(command, "document.getElementById('project-select').value='ai-companion-desktop';document.getElementById('project-select').dispatchEvent(new Event('change'));window.PlanwharfFocusReady");
  const focused = await (await fetch(origin + '/api/orchestrator?readOnly=1')).json(); assert.equal(focused.selectedProjectId, 'ai-companion-desktop');
  await until(command, "document.getElementById('home-goal').textContent.includes('ai-companion-desktop')");
  assert.doesNotMatch(await evaluate(command, "document.getElementById('home-progress').textContent"), /Durable completed fixture/);
  await evaluate(command, "document.getElementById('watch-window').click()");
  await until(command, "document.querySelector('[aria-label=\"AI usage\"]')?.textContent.includes('COMPLETE')");
  await until(command, "document.querySelector('[aria-label=\"Find models\"]')");
  await evaluate(command, "var search=document.querySelector('[aria-label=\"Find models\"]');search.value='catalog-51';search.dispatchEvent(new Event('input'))");
  await until(command, "document.querySelector('[data-model-role=\"catalog-51\"]')");
  await evaluate(command, "var search=document.querySelector('[aria-label=\"Find models\"]');search.value='';search.dispatchEvent(new Event('input'));document.querySelector('[data-provider-show]').click()");
  await until(command, "document.querySelectorAll('#dashboard-orchestrator [data-model-role][data-role=worker]').length === 55");
  assert.equal(await evaluate(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"orchestrator\"]').disabled"), true);
  assert.equal(await evaluate(command, "document.querySelectorAll('#dashboard-orchestrator [data-lead], #dashboard-orchestrator [data-model]').length"), 0);
  assert.equal(await evaluate(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"worker\"]').disabled"), false);
  assert.equal(await evaluate(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"reviewer\"]').disabled"), false);
  await evaluate(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"worker\"]').click()");
  await until(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"worker\"]')?.checked === false && document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"worker\"]')?.disabled === false");
  await evaluate(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"reviewer\"]').click()");
  await until(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"reviewer\"]')?.checked === false && document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"reviewer\"]')?.disabled === false");
  await evaluate(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"reviewer\"]').click()");
  await until(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"reviewer\"]')?.checked === true && document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"reviewer\"]')?.disabled === false");
  await evaluate(command, "var filter=document.querySelector('[aria-label=\"Filter models by role\"]');filter.value='worker';filter.dispatchEvent(new Event('change'))");
  assert.equal(await evaluate(command, "Boolean(document.querySelector('#dashboard-orchestrator [data-model-role=\"catalog-51\"]'))"), false);
  await evaluate(command, "var filter=document.querySelector('[aria-label=\"Filter models by role\"]');filter.value='reviewer';filter.dispatchEvent(new Event('change'))");
  assert.equal(await evaluate(command, "Boolean(document.querySelector('#dashboard-orchestrator [data-model-role=\"catalog-51\"]'))"), true);
  await evaluate(command, "var filter=document.querySelector('[aria-label=\"Filter models by role\"]');filter.value='all';filter.dispatchEvent(new Event('change'))");
  await evaluate(command, "document.querySelector('[data-provider]').click()");
  await until(command, "document.querySelector('[data-provider]').textContent.includes('Enable provider')");
  await command('Page.reload');
  await until(command, "document.querySelector('[data-provider]')?.textContent.includes('Enable provider')");
  assert.equal(await evaluate(command, "document.querySelector('[data-model-role=\"catalog-51\"][data-role=\"worker\"]').checked"), false);
  assert.equal((await (await fetch(origin + '/api/orchestrator?readOnly=1')).json()).providers[0].enabled, false);
  const output = process.env.PLANWHARF_VALIDATION_DIR || path.join(__dirname, 'phase2-browser-' + Date.now()); fs.mkdirSync(output, { recursive: true });
  const screenshot = await command('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, 'project-home.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('PASS Phase 2 real browser: proposal visible before approval, exact MegaTask approval, Next follows first/second active slices, checkpoint and resumed work, final structured Next after reload, durable results/tests/timeline, shared project focus and isolated Home.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const socket of sockets) socket.close(); if (browser) browser.kill();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  const resolved = path.resolve(dir); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('pw-phase2-browser-'));
  try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { /* Browser profile may still be closing; only this isolated directory remains. */ }
});
