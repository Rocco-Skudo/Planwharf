'use strict';
// Static fixtures only: no backend orchestration, personal notebooks, or provider calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { findBrowser } = require('../planwharf.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'worker-board-' + Date.now());
fs.mkdirSync(output, { recursive: true });
const models = Array.from({ length: 5 }, (_, n) => ({ id: 'fixture-' + n, label: n === 0 ? 'GPT-6.1 Sol Business - long account label' : 'Fixture model ' + n,
  cli: 'gpt-fixture-long-explicit-model-identifier-' + n, provider: 'codex', providerId: 'codex', plan: 'ChatGPT', kind: 'default', enabled: true,
  roles: { orchestrator: true, worker: true, reviewer: true }, roleEligibility: { orchestrator: true, worker: true, reviewer: true },
  policy: { minRemainingPercent: 20 - n, warningRemainingPercent: 30, fallbackModelId: n ? null : 'fixture-1', alwaysApprove: false }, usagePolicy: { state: 'ok' } }));
const fixture = { providerPolicySupported: true, providers: [{ id: 'codex', label: 'ChatGPT', adapter: 'codex', models, policy: { minRemainingPercent: 20, warningRemainingPercent: 30, fallbackProviderId: 'grok', alwaysApprove: false } }, { id: 'grok', label: 'Grok', adapter: 'grok', models: [], policy: { minRemainingPercent: 16, warningRemainingPercent: 30, fallbackProviderId: null, alwaysApprove: true } }], mode: 'manual', models, orchestrators: models, orchestratorId: models[0].id, orchestratorLabel: models[0].label,
  plans: [{ id: 'ChatGPT', label: 'ChatGPT Business', readable: true, leftPct: 60 }], projects: [{ id: 'demo', name: 'Layout fixture', status: 'watching', label: 'Watching',
    dispatch: [{ modelId: models[0].id, label: models[0].label, pid: 123, alive: true, slice: 'Check worker and model layout', activity: 'Reading a long nested file path and checking the isolated fixture output.' }], workerTail: 'Fixture output only.' }], asks: [], researches: [] };
const plan = require('../plan.js').example(); plan.project = { id: 'demo', name: 'Layout fixture' }; plan.tasks = [];
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/plan' ? { plan, version: 'fixture' } : req.url === '/api/attempts' ? { attempts: [] } : fixture)); return;
  }
  const name = req.url === '/' ? 'orchestrator.html' : req.url.slice(1).split('?')[0];
  if (!['orchestrator.html', 'index.html', 'orch.js', 'app.js', 'plan.js', 'models.js', 'styles.css', 'quota.js', 'notifications.js', 'model-policy-ui.js', 'window-ui.js', 'home-ui.js', 'engine/attempts.js', 'engine/sentinel.js'].includes(name)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(path.join(root, name)));
});
let browser;
const sockets = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(url) {
  const socket = new WebSocket(url); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  socket.addEventListener('message', event => { const row = JSON.parse(event.data), call = pending.get(row.id); if (call) { clearTimeout(call.timer); pending.delete(row.id); row.error ? call.reject(Error(JSON.stringify(row.error))) : call.resolve(row.result); } });
  return (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 10000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(command, expression) {
  const row = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (row.exceptionDetails) throw Error(JSON.stringify(row.exceptionDetails)); return row.result.value;
}
async function until(command, expression) {
  for (let n = 0; n < 100; n++) { if (await evaluate(command, expression)) return; await pause(50); } throw Error('UI not ready: ' + expression);
}
const measure = `(() => {
  const board = document.querySelector('.orch-board');
  const issues = [];
  if (!board.getBoundingClientRect().width || !board.checkVisibility()) issues.push('Dashboard is hidden');
  if (board.scrollWidth > board.clientWidth + 2) issues.push('Board horizontal overflow: ' + board.scrollWidth + ' > ' + board.clientWidth);
  const sections = [...board.querySelectorAll('.dash-section')];
  for (let i=1;i<sections.length;i++) if(sections[i].getBoundingClientRect().top < sections[i-1].getBoundingClientRect().bottom - 1) issues.push('Sections overlap');
  for (const card of board.querySelectorAll('.dash-model,.dash-worker,.dash-zone-policy')) {
    const box = card.getBoundingClientRect();
    for (const child of card.querySelectorAll('header,strong,p,fieldset,label,input,select,button')) {
      if (!child.getClientRects().length || child.closest('details:not([open])')) continue;
      const b = child.getBoundingClientRect();
      if (b.left < box.left - 1 || b.right > box.right + 1 || b.bottom > box.bottom + 1) issues.push('Outside card: ' + child.tagName + ' ' + child.textContent.slice(0,40));
    }
    const header = card.querySelector(':scope > header');
    if(header?.children.length === 2) {
      const a=header.children[0].getBoundingClientRect(), b=header.children[1].getBoundingClientRect();
      if(a.right > b.left+1 && a.bottom > b.top+1 && b.bottom > a.top+1) issues.push('Header text overlaps badge');
    }
  }
  return {issues, width:innerWidth, workers:board.querySelectorAll('.dash-worker').length, models:board.querySelectorAll('form[data-provider-policy]').length};
})()`;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = path.join(output, 'profile');
  browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let n=0;n<100;n++) { try { port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]); } catch {} if(port) break; await pause(50); }
  assert.ok(port, 'Browser debugging endpoint required');
  const pages = await fetch('http://127.0.0.1:' + port + '/json/list').then(r=>r.json());
  const command = await connect(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await command('Page.enable');
  for (const embedded of [false,true]) for (const width of [1440,1024,390]) {
    const name = (embedded ? 'embedded' : 'standalone') + '-' + width;
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: origin + (embedded ? '/index.html#orchestrator' : '/') });
    if (embedded) await until(command, "document.body.dataset.appView === 'orchestrator'");
    const prefix = embedded ? 'dashboard-' : '';
    await until(command, "document.querySelectorAll('.orch-board form[data-provider-policy]').length === 1");
    await evaluate(command, `for(const id of ['worker-project-filter','worker-session-filter']) {const c=document.getElementById('${prefix}'+id); c.value='all';c.dispatchEvent(new Event('change'));}`);
    await until(command, "document.querySelector('.orch-board .dash-worker')");
    for (const expanded of [false,true]) {
      const selected = expanded ? 'grok' : 'codex';
      await evaluate(command, `(() => {const c=document.querySelector('[data-policy-provider-select]'); c.value='${selected}'; c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await evaluate(command, "document.querySelector('form[data-provider-policy]').elements.minRemainingPercent.value"), expanded ? '16' : '20');
      const metrics = await evaluate(command, measure);
      fs.writeFileSync(path.join(output, name + (expanded ? '-other-model' : '') + '.json'), JSON.stringify(metrics,null,2));
      await evaluate(command, "document.querySelector('.dash-zone-policy').scrollIntoView({block:'start'})");
      const shot = await command('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output,name+(expanded?'-other-model':'')+'.png'),Buffer.from(shot.data,'base64'));
      assert.deepEqual(metrics.issues, [], name + (expanded ? ' expanded' : '') + ': ' + JSON.stringify(metrics.issues));
    }
  }
  console.log('PASS: workers and models fit cards without overlap at 1440, 1024 and 390px, standalone and embedded, with independent selected-provider settings. Evidence: ' + output);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{for(const socket of sockets)socket.close();if(browser)browser.kill();if(server.listening)await new Promise(resolve=>server.close(resolve));});
