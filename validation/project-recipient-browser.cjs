'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('../server.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-recipient-browser-'));
const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/notebook.json'), 'utf8')).projects[0];
const plan = { schema: 2, projects: ['alpha', 'beta'].map(id => {
  const item = structuredClone(source);
  item.project = { id, name: `Fixture ${id}`, folder: path.join(dir, id) };
  fs.mkdirSync(item.project.folder);
  item.revisions.forEach(revision => { revision.open = []; });
  item.tasks = [{ id: `${id}-job`, projectId: id, revision_id: item.revisions.at(-1).id, title: 'Implement parser', detail: 'Isolated fixture', status: 'running' }];
  return item;
}) };
const planFile = path.join(dir, 'notebook.json');
fs.writeFileSync(planFile, JSON.stringify(plan));
const models = [1, 2, 3].map(n => ({ id: `fixture-${n}`, label: `Fixture model ${n}`, provider: 'codex', cli: 'gpt-6-luna', enabled: true, available: true, kind: n === 1 ? 'premium' : 'default', cost: 1, limit: 200 }));
const live = new Set(), killed = [], calls = [];
let pid = 1000;
const attemptsDir = path.join(dir, 'attempts');
fs.mkdirSync(attemptsDir);
fs.writeFileSync(path.join(attemptsDir, 'orchestrator.json'), JSON.stringify({ mode: 'manual', asks: [{ at: '2026-10-10T00:00:00Z', question: 'Historical old conversation', answer: 'Historical reply' }], projects: { alpha: { status: 'complete', dispatch: [{ modelId: 'fixture-1', pid: 999, alive: false, sessionId: 'previous-session', startedAt: '2026-10-10T00:00:00Z' }] } } }));
const skillsSnapshot = { repo: 'mattpocock/skills', ref: 'main', sha: 'aaaaaaaaaaaa', status: 'current', skillCount: 38, updated: true, date: '2026-10-09T10:56:49Z', installedAt: '2026-10-12T01:00:00Z', checkedAt: '2026-10-12T01:05:00Z' };
const skills = { snapshot: () => skillsSnapshot, ensure: async () => skillsSnapshot, read: () => '', prompt: () => 'MATT SKILLS: browser fixture catalog.' };
const server = createServer({ skills, syncSkills: true, discoverModels: async () => ({ ok: true, ids: ['grok-fixture'] }), planFile, attemptsDir, models, fetchPlans: async () => [],
  inspectFolder: folder => ({ folder, fileCount: 0, names: [], git: false }),
  spawnWorker: () => { live.add(++pid); return { pid }; }, isProcessAlive: pid => live.has(pid),
  killWorker: pid => { killed.push(pid); return live.delete(pid); },
  askModel: async info => { calls.push(info); return { answer: 'Fixture answer with Unicode: è 日本語.', ms: 1 }; }
});
let browser;
const sockets = [];
async function connect(url) {
  const socket = new WebSocket(url); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const waiting = new Map();
  socket.addEventListener('message', event => {
    const reply = JSON.parse(event.data), pending = waiting.get(reply.id);
    if (pending) { clearTimeout(pending.timer); waiting.delete(reply.id); reply.error ? pending.reject(new Error(reply.error.message)) : pending.resolve(reply.result); }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { waiting.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
    waiting.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(command, expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(command, expression) {
  for (let n = 0; n < 100; n++) { if (await evaluate(command, expression)) return; await pause(100); }
  throw new Error(`UI condition not met: ${expression}; toast: ${await evaluate(command, "document.getElementById('toast')?.textContent")}; view: ${await evaluate(command, "document.body.dataset.appView")}`);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, data) => {
    const response = await fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  await post('/api/orchestrator/lead', { id: 'fixture-1' });
  const binary = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file => fs.existsSync(file));
  assert.ok(binary, 'Chromium browser required');
  browser = spawn(binary, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${path.join(dir, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let n = 0; n < 100; n++) { try { port = Number(fs.readFileSync(path.join(dir, 'profile/DevToolsActivePort'), 'utf8').split('\n')[0]); } catch (_) {} if (port) break; await pause(100); }
  assert.ok(port, 'Browser DevTools did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const home = await connect(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await home('Page.navigate', { url: origin });
  await until(home, "document.getElementById('project-select')?.disabled === false");
  assert.equal(await evaluate(home, "document.querySelectorAll('.dash-worker').length"), 0, 'Startup worker section starts clean');
  const approved = await post('/api/orchestrator/approve', { projectId: 'beta' });
  const parts = approved.projects.find(row => row.id === 'beta').dispatch;
  assert.equal(parts.length, 3);

  await until(home, "document.getElementById('matt-skills-status').textContent.includes('latest main revision')");
  await evaluate(home, "window.fixtureOriginalFetch = window.fetch; window.fetch = async (url, options) => url === '/api/skills' ? new Response(JSON.stringify({ status: 'current', sha: '49dd158', files: ['skills/productivity/grill-me/SKILL.md'] }), { status: 200, headers: { 'Content-Type': 'application/json' } }) : window.fixtureOriginalFetch(url, options); document.getElementById('matt-skills-refresh').click()");
  await until(home, "document.getElementById('matt-skills-status').textContent.includes('Previous Planwharf backend detected')");
  assert.equal(await evaluate(home, "document.getElementById('matt-skills-enabled').disabled"), true);
  assert.doesNotMatch(await evaluate(home, "document.getElementById('matt-skills-status').textContent"), /0 skills|verified at latest/);
  await evaluate(home, "window.fetch = window.fixtureOriginalFetch; delete window.fixtureOriginalFetch; document.getElementById('matt-skills-refresh').click()");
  await until(home, "document.getElementById('matt-skills-status').textContent.includes('latest main revision')");
  assert.equal(await evaluate(home, "document.getElementById('matt-skills-enabled').checked"), true);
  assert.match(await evaluate(home, "document.getElementById('matt-skills-status').textContent"), /Revision date:.*Installed locally:.*Last checked:/);
  await evaluate(home, "document.getElementById('matt-skills-enabled').click()");
  await until(home, "document.getElementById('matt-skills-status').textContent.includes('Matt skills OFF')");
  await evaluate(home, "document.getElementById('matt-skills-enabled').click()");
  await until(home, "document.getElementById('matt-skills-status').textContent.includes('Matt skills ON for all models')");
  assert.equal(await evaluate(home, "(() => { const ids = Array.from(document.querySelectorAll('[id]'), el => el.id); return new Set(ids).size === ids.length; })()"), true, 'Each UI control must have a unique ID');
  await evaluate(home, "document.getElementById('project-select').value = 'beta'; document.getElementById('project-select').dispatchEvent(new Event('change'))");
  const chat = home;
  await evaluate(home, "document.getElementById('watch-window').click()");
  await until(chat, "document.getElementById('dashboard-orch-project')?.value === 'beta'");
  assert.doesNotMatch(await evaluate(chat, "document.getElementById('dashboard-orch-ask-thread').textContent"), /Historical old conversation/);
  assert.ok(await evaluate(chat, "document.getElementById('dashboard-worker-session-filter').options.length > 3"), 'Session selector includes dated backend sessions');
  assert.equal(await evaluate(chat, "document.getElementById('project-view').hidden"), true);
  await evaluate(chat, "document.getElementById('dashboard-orch-project').value = 'alpha'; document.getElementById('dashboard-orch-project').dispatchEvent(new Event('change'))");
  await until(home, "document.getElementById('project-select')?.value === 'alpha'");
  await evaluate(home, "document.getElementById('project-select').value = 'beta'; document.getElementById('project-select').dispatchEvent(new Event('change'))");
  await until(chat, "document.getElementById('dashboard-orch-project')?.value === 'beta'");
  await evaluate(chat, "document.getElementById('dashboard-orch-ask-input').value = 'Explain the parser.'; document.getElementById('dashboard-orch-ask-form').requestSubmit()");
  await until(chat, "document.getElementById('dashboard-orch-ask-thread').innerText.includes('Fixture answer')");
  assert.equal(await evaluate(chat, "(() => { const answer = document.querySelector('#dashboard-orch-ask-thread [data-chat-output]'); const copy = answer.parentElement.querySelector('[data-copy-output]'); return copy.getBoundingClientRect().top >= answer.getBoundingClientRect().bottom; })()"), true, 'Copy belongs directly below the generated output');
  assert.equal(calls.at(-1).projectId, 'beta');
  await chat('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await chat('Page.bringToFront');
  await evaluate(chat, "document.querySelector('#dashboard-orch-ask-thread [data-copy-output]').click()");
  await until(chat, "document.getElementById('toast').textContent === 'Output copied.'");
  const copied = await evaluate(chat, 'navigator.clipboard.readText()');
  assert.doesNotMatch(copied, /Explain the parser/); assert.match(copied, /è 日本語/);
  await evaluate(chat, "document.getElementById('dashboard-orch-ask-input').value = 'Explain another detail.'; document.getElementById('dashboard-orch-ask-form').requestSubmit()");
  await until(chat, "document.querySelectorAll('#dashboard-orch-ask-thread [data-copy-output]').length === 2");
  await evaluate(chat, "document.getElementById('dashboard-copy-conversation').click()");
  await until(chat, "document.getElementById('toast').textContent === 'Output copied.'");
  const wholeConversation = await evaluate(chat, 'navigator.clipboard.readText()');
  assert.match(wholeConversation, /Explain the parser/);
  assert.match(wholeConversation, /Explain another detail/);
  assert.doesNotMatch(wholeConversation, /Historical old conversation/);
  await evaluate(chat, `document.querySelector('[data-worker-stop="beta"][data-worker-pid="${parts[0].pid}"]').click()`);
  await until(chat, "document.querySelectorAll('[data-worker-stop=\"beta\"]').length === 2");
  assert.deepEqual(killed, [parts[0].pid]);
  assert.equal(live.size, 2);
  await evaluate(chat, "document.getElementById('dashboard-worker-state-filter').value = 'Paused'; document.getElementById('dashboard-worker-state-filter').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate(chat, "document.querySelectorAll('.dash-worker').length"), 1);
  await evaluate(chat, "document.getElementById('dashboard-worker-state-filter').value = 'all'; document.getElementById('dashboard-worker-state-filter').dispatchEvent(new Event('change')); document.getElementById('dashboard-worker-project-filter').value = 'all'; document.getElementById('dashboard-worker-project-filter').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate(chat, "document.querySelectorAll('.dash-worker').length"), 3, 'Previous session hidden by default');
  await evaluate(chat, "document.getElementById('dashboard-worker-session-filter').value = 'all'; document.getElementById('dashboard-worker-session-filter').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate(chat, "document.querySelectorAll('.dash-worker').length"), 4, 'History available through explicit filters');
  assert.match(await evaluate(chat, "document.querySelector('.worker-legend').textContent"), /2 active across all projects and sessions/);
  const invalid = await fetch(origin + '/api/orchestrator/worker/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'alpha', pid: parts[1].pid }) });
  assert.equal(invalid.status, 400);
  assert.equal(live.size, 2);
  await evaluate(chat, "document.getElementById('dashboard-orch-ask-input').value = 'Preserve this draft'; document.getElementById('watch-window').click()");
  assert.equal(await evaluate(chat, "document.getElementById('project-view').hidden"), false);
  await evaluate(chat, "document.getElementById('watch-window').click()");
  assert.equal(await evaluate(chat, "document.getElementById('dashboard-orch-ask-input').value"), 'Preserve this draft');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  assert.equal(tabs.filter(target => target.type === 'page').length, 1, 'Switching views must keep one browser page');
  const legacy = await fetch(origin + '/orchestrator.html', { redirect: 'manual' });
  assert.equal(legacy.status, 302); assert.equal(legacy.headers.get('location'), '/#orchestrator');
  await chat('Page.reload');
  await until(chat, "document.getElementById('dashboard-orch-project')?.value === 'beta'");
  assert.equal(await evaluate(chat, "document.getElementById('orchestrator-view').hidden"), false, 'Reload preserves the active view');
  assert.doesNotMatch(await evaluate(chat, "document.getElementById('dashboard-orch-ask-thread').textContent"), /Fixture answer|Historical old conversation/, 'Reopened chat starts clean without deleting history');
  await chat('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(chat, 'document.documentElement.scrollWidth <= window.innerWidth'), true, 'Orchestrator view fits a mobile screen');
  if (process.env.PLANWHARF_VALIDATION_DIR) {
    fs.mkdirSync(process.env.PLANWHARF_VALIDATION_DIR, { recursive: true });
    await chat('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate(chat, 'window.scrollTo(0, 0)');
    await pause(100);
    const screenshot = await chat('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(process.env.PLANWHARF_VALIDATION_DIR, 'single-page-orchestrator.png'), Buffer.from(screenshot.data, 'base64'));
  }
  console.log('OK: single browser page, view switching preserves draft and recipient, legacy redirects, reload, Unicode clipboard and individual worker stop via HTTP.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  sockets.forEach(socket => socket.close());
  if (browser) { browser.kill(); await pause(500); }
  await server.shutdown();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  const resolved = path.resolve(dir);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('pw-recipient-browser-'));
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
});
