'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.join(__dirname);
const profile = path.join(output, `edge-profile-live-${Date.now()}`);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2] || 'http://127.0.0.1:4173';
const outFile = process.argv[3] || path.join(output, 'live-dummycalculator.png');
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
(async () => {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      if (port) break;
    } catch (_) {}
    await pause(100);
  }
  if (!port) throw new Error('Edge DevTools did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(target => target.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const waiting = new Map();
  ws.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    const pending = waiting.get(response.id);
    if (pending) {
      clearTimeout(pending.timer);
      waiting.delete(response.id);
      response.error ? pending.reject(new Error(response.error.message)) : pending.resolve(response.result);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error(`Timeout: ${method}`));
    }, 20000);
    waiting.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await command('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1200, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url });
  for (let i = 0; i < 80; i++) {
    if (await evaluate("Boolean(document.getElementById('orchestrator') && document.getElementById('orchestrator').textContent)")) break;
    await pause(100);
  }
  await evaluate(`(() => { const btn = [...document.querySelectorAll('.yard-row')].find(el => el.textContent.includes('DummyCalculator')); if (btn) btn.click(); })()`);
  await pause(800);
  const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  const text = await evaluate("document.getElementById('orchestrator') ? document.getElementById('orchestrator').innerText.slice(0, 2500) : ''");
  console.log('SHOT ' + outFile);
  console.log(text);
  ws.close();
  browser.kill();
  process.exit(0);
})().catch(error => {
  console.error(error.message || error);
  try { browser.kill(); } catch (_) {}
  process.exit(1);
});
