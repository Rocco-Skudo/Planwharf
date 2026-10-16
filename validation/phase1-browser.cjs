'use strict';
// Real Chromium application, isolated notebook, mocked quota readings, no AI dispatch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runApp, findBrowser } = require('../planwharf.cjs');
const { createAppWindows } = require('../engine/app-windows.cjs');
const output = process.env.PLANWHARF_VALIDATION_DIR || path.join(__dirname, 'phase1-browser-' + Date.now());
fs.mkdirSync(output, { recursive: true });
const planFile = path.join(output, 'notebook.json');
fs.copyFileSync(path.join(__dirname, '../fixtures/notebook.json'), planFile);
const pause = ms => new Promise(r => setTimeout(r, ms));
const opened = [], connections = [], errors = [];
let app;
const windows = createAppWindows({ open: (url, view) => {
  const profileDir = path.join(output, 'profile-' + opened.length);
  const child = spawn(findBrowser(), ['--headless=new', '--app=' + url, '--disable-gpu', '--no-sandbox', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--window-size=1100,900', '--user-data-dir=' + profileDir], { stdio: 'ignore', windowsHide: true });
  child.profileDir = profileDir; child.on('error', e => errors.push(e.message));
  opened.push({ child, profileDir, view, url }); return child;
} });
async function waitFor(check, label, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await pause(100); }
  throw new Error('Timeout: ' + label + (errors.length ? ': ' + errors.join(', ') : ''));
}
async function connect(record) {
  let port, target;
  await waitFor(async () => {
    try {
      port = Number(fs.readFileSync(path.join(record.profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = pages.find(p => p.type === 'page' && p.url.startsWith(record.url));
      return Boolean(target);
    } catch { return false; }
  }, record.view + ' app window opens');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (process.env.PLANWHARF_CDP_TRACE) console.log(record.view, 'CDP', data.id || data.method);
    if (data.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(data.params.exceptionDetails));
    if (pending.has(data.id)) { const job = pending.get(data.id); pending.delete(data.id); clearTimeout(job.timer); data.error ? job.reject(new Error(JSON.stringify(data.error))) : job.resolve(data.result); }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  console.log('Connected real app window:', record.view);
  await command('Runtime.enable');
  const connection = { ws, command, evaluate, record, port, target };
  connections.push(connection); return connection;
}
async function appState() { return (await fetch(app.url + '/api/app')).json(); }
async function closeView(connection) {
  // Close the actual window; heartbeat expiry also covers browsers without pagehide.
  await fetch(`http://127.0.0.1:${connection.port}/json/close/${connection.target.id}`);
  connection.ws.close();
  await waitFor(async () => !(await appState()).views[connection.record.view], connection.record.view + ' closes');
}
(async () => {
  const models = require("../engine/provider-catalog.cjs").loadCatalog(require("../models.json")).models.filter(m => m.plan === 'ChatGPT' && ['premium', 'default'].includes(m.kind)).slice(0, 2).map(m => ({ ...m, enabled: true, available: true }));
  app = await runApp({ skillsEnabled: false, planFile, attemptsDir: path.join(output, 'attempts'), port: 0, portExplicit: true, noWindow: false, syncSkills: false, windows, models,
    fetchPlans: async () => [{ id: 'ChatGPT', label: 'ChatGPT', readable: true, pct: 18, leftPct: 82, exhausted: false, windows: [{ name: 'weekly', pct: 18, leftPct: 82 }] }] });
  assert.deepEqual(opened.map(r => r.view), ['planwharf']);
  let home = await connect(opened[0]), orch = home;
  await waitFor(async () => (await appState()).views.planwharf && (await appState()).views.orchestrator, 'application registers both available views');
  const pid = (await appState()).pid;
  await waitFor(() => home.evaluate("document.getElementById('home-goal')?.textContent.includes('Harbor Street')"), 'current Living Plan goal');
  await waitFor(() => home.evaluate("(() => { const select = document.getElementById('revision-select'); return select && !select.disabled && Array.from(select.options).some(option => option.value === '1'); })()"), 'revision selector is loaded and enabled');
  assert.equal(await home.evaluate("document.getElementById('project-details').open"), false);
  assert.equal(await home.evaluate("document.getElementById('project-lede').textContent.includes('R2')"), false);
  assert.ok(await home.evaluate("document.getElementById('home-since').textContent.includes('First visit')"));
  await home.evaluate("document.getElementById('revision-select').value = '1'; document.getElementById('revision-select').dispatchEvent(new Event('change'))");
  assert.ok(await home.evaluate("document.getElementById('home-goal').textContent.includes('Harbor Street')"), 'home goal stays current while history shows an older revision');
  await home.evaluate("document.getElementById('home-note-text').value = 'Browser note <script>'; document.getElementById('home-note-form').requestSubmit()");
  await waitFor(() => home.evaluate("document.getElementById('home-notes')?.textContent.includes('Browser note')"), 'note added');
  assert.equal(await home.evaluate("document.querySelector('#home-notes script') === null"), true);
  await home.evaluate("document.querySelector('[data-note-pin]').click()");
  await waitFor(() => home.evaluate("document.querySelector('[data-note-pin]').textContent === 'Unpin'"), 'note pinned');
  await home.evaluate("document.getElementById('project-select').value = 'orto'; document.getElementById('project-select').dispatchEvent(new Event('change'))");
  await waitFor(() => home.evaluate("document.getElementById('home-goal')?.textContent.includes('community garden')"), 'other project opens');
  assert.equal(await home.evaluate("document.getElementById('home-notes')?.textContent.includes('Browser note')"), false);
  await home.evaluate("document.getElementById('project-select').value = 'biblioteca'; document.getElementById('project-select').dispatchEvent(new Event('change'))");
  await waitFor(() => home.evaluate("document.getElementById('home-notes')?.textContent.includes('Browser note')"), 'return retains note');
  await waitFor(() => orch.evaluate("document.getElementById('dashboard-orchestrator').textContent.includes('82% REMAINING')"), 'quota renders');
  const options = await orch.evaluate("Array.from(document.getElementById('dashboard-orch-lead').options).filter(o => o.value).map(o => o.textContent)");
  assert.equal(options.length, 2); assert.ok(options.every(s => s.includes('82% REMAINING')));
  const modelQuota = await orch.evaluate("Array.from(document.querySelectorAll('.dash-zone-models .quota-remaining')).map(el => el.textContent)");
  assert.deepEqual(modelQuota, ['82% REMAINING', '82% REMAINING']);
  assert.equal(await orch.evaluate("document.getElementById('dashboard-orchestrator').textContent.includes('% used')"), false);
  await home.evaluate("document.getElementById('watch-window').click()");
  assert.equal(await home.evaluate("document.getElementById('project-view').hidden"), true);
  assert.equal(await home.evaluate("document.getElementById('orchestrator-view').hidden"), false);
  await home.evaluate("document.getElementById('watch-window').click()");
  assert.equal(await home.evaluate("document.getElementById('project-view').hidden"), false);
  assert.equal(opened.length, 1, 'switching views creates no duplicate windows');
  const shot = await home.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(output, 'project-home.png'), Buffer.from(shot.data, 'base64'));
  await home.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFor(() => home.evaluate("innerWidth === 390 && document.querySelector('.topbar .heading').getBoundingClientRect().width > 300"), 'mobile layout settles after DevTools resize');
  assert.equal(await home.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile has no horizontal overflow');
  assert.ok(await home.evaluate("document.querySelector('.topbar .heading').getBoundingClientRect().width > 300"), 'mobile project heading remains readable beside window controls');
  await home.evaluate("document.getElementById('toast').textContent = ''");
  const fullHeight = await home.evaluate('document.documentElement.scrollHeight');
  await home.command('Emulation.setDeviceMetricsOverride', { width: 390, height: fullHeight, deviceScaleFactor: 1, mobile: true });
  await pause(200);
  const mobile = await home.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(output, 'project-home-mobile.png'), Buffer.from(mobile.data, 'base64'));
  await closeView(home);
  assert.equal((await appState()).views.orchestrator, false); assert.equal((await appState()).pid, pid);
  const reopened = await fetch(app.url + '/api/planwharf/window', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(reopened.status, 200);
  await waitFor(() => opened.length === 2, 'application reopens its single window');
  home = await connect(opened[1]); orch = home;
  await waitFor(() => home.evaluate("document.getElementById('home-notes')?.textContent.includes('Browser note')"), 'reopened notes persist');
  assert.equal((await appState()).pid, pid);
  await home.evaluate("document.querySelector('[data-note-delete]').click()");
  await waitFor(() => home.evaluate("!document.getElementById('home-notes')?.textContent.includes('Browser note')"), 'delete note');
  assert.deepEqual(errors, [], 'no browser JavaScript exceptions');
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, backendPid: pid, realAppWindow: true, switchingVerified: true, launches: opened.map(r => ({ view: r.view, url: r.url })), cases: ['Goal from current revision', 'Notes add/pin/delete and project isolation', 'Shared provider quota in selector and model cards', 'Single launch window', 'Switch both views without reload', 'Close without backend shutdown', 'Reopen on same backend', 'Mobile layout'], noModelInference: true }, null, 2));
  console.log('PASS: one real application window, view switching, close/reopen on the same backend, project home and shared remaining quota.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const connection of connections) { try { await connection.command('Browser.close'); } catch {} connection.ws.close(); }
  if (app?.server.listening) await new Promise(r => app.server.close(r));
  for (const record of opened) { try { record.child.kill(); } catch {} }
  // runApp installs a process exit hook to release this isolated notebook lock.
  process.exit(process.exitCode || 0);
});
