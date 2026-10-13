'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('../server.cjs');
const { findBrowser } = require('../planwharf.cjs');
const dir = process.env.PLANWHARF_VALIDATION_DIR || path.join(__dirname, 'folder-ui-' + Date.now());
fs.mkdirSync(dir, { recursive: true });
const projectsRoot = path.join(dir, 'Projects');
fs.mkdirSync(projectsRoot);
const planFile = path.join(dir, 'notebook.json');
fs.copyFileSync(path.join(__dirname, '../fixtures/notebook.json'), planFile);
const server = createServer({ skillsEnabled: false, planFile, models: [], fetchPlans: async () => [] });
const profile = path.join(dir, 'edge-profile-folders-' + Date.now());
let browser;
let ws, command;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', ...(process.env.PLANWHARF_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), '--disable-extensions', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}`], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let n = 0; n < 100 && !port; n++) {
    try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
    if (!port) await pause(100);
  }
  assert.ok(port, 'Browser did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    const row = pending.get(reply.id);
    if (row) { clearTimeout(row.timer); pending.delete(reply.id); reply.error ? row.reject(new Error(reply.error.message)) : row.resolve(reply.result); }
  });
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const seq = ++id;
    pending.set(seq, { resolve, reject, timer: setTimeout(() => { pending.delete(seq); reject(new Error(method + ' timed out')); }, 30000) });
    ws.send(JSON.stringify({ id: seq, method, params }));
  });
  const evaluate = async expression => {
    const value = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
    return value.result.value;
  };
  async function waitFor(expression) {
    for (let n = 0; n < 100; n++) { if (await evaluate(expression)) return; await pause(50); }
    const state = await evaluate("JSON.stringify({error: document.getElementById('project-error')?.textContent, toast: document.getElementById('toast')?.textContent, root: document.getElementById('projects-root')?.value, dialog: document.getElementById('project-dialog')?.open, badge: document.getElementById('revision-badge')?.textContent})");
    throw new Error('UI condition timed out: ' + expression + ' ' + state);
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 1365, height: 1100, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.getElementById('revision-badge')?.textContent.includes('R2')");
  await evaluate("document.getElementById('new-project').click()");
  await pause(150);
  await evaluate(`document.getElementById('projects-root').value = ${JSON.stringify(projectsRoot)}; document.getElementById('save-projects-root').click()`);
  await waitFor("document.getElementById('toast').textContent === 'Projects folder saved.'");
  await evaluate("document.getElementById('project-cancel').click(); document.getElementById('new-project').click()");
  await waitFor("document.getElementById('project-create-folder').checked");
  assert.equal(await evaluate("document.getElementById('projects-root').value"), projectsRoot);
  assert.equal(await evaluate("document.getElementById('project-form').elements.folder.disabled"), true);
  const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(dir, 'project-folder-dialog.png'), Buffer.from(shot.data, 'base64'));
  for (const leaf of ['Browser calculator', 'Browser calculator-2']) {
    await evaluate("(() => { const form = document.getElementById('project-form'); form.elements.name.value = 'Browser calculator'; form.elements.direction.value = 'Verify project folder creation'; form.requestSubmit(); })()");
    await waitFor("!document.getElementById('project-dialog').open");
    const notebook = JSON.parse(fs.readFileSync(planFile));
    assert.equal(notebook.projects.at(-1).project.folder, path.join(projectsRoot, leaf));
    assert.ok(fs.statSync(path.join(projectsRoot, leaf)).isDirectory());
    await evaluate("document.querySelector('[data-place=check]').click()");
    await waitFor("document.querySelector('.repository-status')?.textContent.includes('Local: read/write')");
    assert.ok(await evaluate("document.querySelector('.repository-status').textContent.includes('No GitHub repository linked')"));
    await evaluate("document.getElementById('new-project').click()");
    await waitFor("document.getElementById('project-create-folder').checked");
  }
  await evaluate("document.getElementById('project-create-folder').click()");
  assert.equal(await evaluate("document.getElementById('project-form').elements.folder.disabled"), false);
  fs.writeFileSync(path.join(dir, 'project-folder-ui-results.json'), JSON.stringify({ at: new Date().toISOString(), passed: true, planFile, projectsRoot, cases: ['Save base folder', 'Restore saved default', 'Create folder from UI', 'Preserve collision', 'Enable existing-folder input'] }, null, 2));
  console.log('PASS: real browser saves projects folder, restores default, creates unique folders, supports existing folders, and checks repository access.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (command) try { await command('Browser.close'); } catch {}
  if (ws) ws.close();
  if (browser) browser.kill();
  if (server.listening) await new Promise(resolve => server.close(resolve));
});
