'use strict';
// A static fixture server: no notebooks or provider processes are opened.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { findBrowser } = require('../planwharf.cjs');
const fixture = { updatedAt: new Date().toISOString(), models: [{ id: 'luna', label: 'GPT-6 Luna', cli: 'gpt-6-luna', provider: 'codex', enabled: true }], projects: [{ id: 'demo', name: 'Demo implementation', jobTitle: 'Validate UI fixture', status: 'watching', label: 'Watching', dispatch: [{ modelId: 'luna', pid: 123, alive: true, slice: 'Render worker board', activity: 'Checking isolated UI fixtures.' }], workerTail: 'Fixture output only. No real worker launched.' }], researches: [{ id: 'r1', projectName: 'RaceEngineer', title: 'Find PS5 telemetry repositories', modelId: 'luna', workerLabel: 'GPT-6 Luna', provider: 'codex', cli: 'gpt-6-luna', status: 'watching', pid: 456, alive: true, activity: 'Reading GT7 and F1 repository documentation.', workerTail: 'Example research output.' }, { id: 'r2', projectName: 'Research demo', title: 'Summarize findings', modelId: 'luna', workerLabel: 'GPT-6 Luna', provider: 'codex', cli: 'gpt-6-luna', status: 'complete', alive: false, reportAvailable: true, activity: 'Research report ready.' }], asks: [] };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url === '/api/plan' ? { plan: {}, version: 'fixture' } : req.url.startsWith('/api/orchestrator/research/report') ? { report: 'Example report: https://github.com/example/telemetry' } : fixture)); return; }
  const file = { '/': 'orchestrator.html', '/orch.js': 'orch.js', '/styles.css': 'styles.css', '/quota.js': 'quota.js', '/window-ui.js': 'window-ui.js' }[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  let content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  if (file === 'orchestrator.html') content = content.replace('</body>', `<script>
    const fixtureTimer = setInterval(() => {
      if (!document.querySelector('.worker-legend')?.textContent.includes('2 active across')) return;
      document.body.dataset.startupWorkerCount = document.querySelectorAll('[data-worker-state]').length;
      for (const id of ['worker-project-filter', 'worker-session-filter']) {
        const filter = document.getElementById(id);
        filter.value = 'all'; filter.dispatchEvent(new Event('change'));
      }
      clearInterval(fixtureTimer);
    }, 50);
  </script></body>`);
  res.end(content);
});
const outputDir = process.env.PLANWHARF_VALIDATION_DIR || path.join(__dirname, 'worker-board-' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });
const profile = path.join(outputDir, 'profile');
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const screenshotPath = path.join(outputDir, 'worker-board.png');
  const rendered = await new Promise((resolve, reject) => {
    browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--window-size=1440,1100', '--virtual-time-budget=5000', '--timeout=15000', `--screenshot=${screenshotPath}`, '--dump-dom', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    browser.stdout.on('data', chunk => { output += chunk; });
    browser.stderr.on('data', chunk => { errors += chunk; });
    const timer = setTimeout(() => { browser.kill(); reject(new Error('Browser fixture timed out: ' + errors.slice(-1000))); }, 30000);
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error('Browser exited ' + code + ': ' + errors.slice(-1000))); });
  });
  assert.equal((rendered.match(/data-worker-state=/g) || []).length, 3);
  assert.match(rendered, /data-startup-worker-count="0"/, 'Historical workers remain hidden until All projects and All sessions are selected');
  assert.match(rendered, /2 running/);
  assert.match(rendered, /data-research-report="r2"/);
  assert.match(rendered, /Provider: codex/);
  assert.ok(fs.statSync(screenshotPath).size > 1000);
  console.log('Workers real browser fixture passed: implementation, research, finished workers and report action; screenshot saved.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) browser.kill(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
