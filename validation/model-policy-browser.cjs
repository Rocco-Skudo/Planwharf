'use strict';
// Static browser fixture: no provider processes or personal notebooks are opened.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { findBrowser } = require('../planwharf.cjs');
const policy = { minRemainingPercent: 20, warningRemainingPercent: 30, fallbackProviderId: 'grok', alwaysApprove: false };
const model = { id: 'lead', label: 'Fixture lead', provider: 'codex', cli: 'gpt-fixture', enabled: true, policy, usagePolicy: { ...policy, state: 'warning', usedPercent: 75 }, roles: { orchestrator: true, worker: true, reviewer: true }, roleEligibility: { orchestrator: true, worker: true, reviewer: true } };
const grokPolicy = { minRemainingPercent: 40, warningRemainingPercent: 50, fallbackProviderId: null, alwaysApprove: false };
const secondGptPolicy = { minRemainingPercent: 5, warningRemainingPercent: 10, fallbackProviderId: null, alwaysApprove: true };
const fixture = { providerPolicySupported: true, modelRolesSupported: true, providers: [{ id: 'codex', label: 'ChatGPT', adapter: 'codex', models: [], policy }, { id: 'grok', label: 'Grok', adapter: 'grok', models: [], policy: grokPolicy }, { id: 'antigravity', label: 'Gemini', adapter: 'antigravity', models: [], policy: secondGptPolicy }, { id: 'future-provider', label: 'Future provider', adapter: 'configured-cli', models: [], policy: { ...grokPolicy, minRemainingPercent: 35 } }], models: [model,
  { ...model, id: 'fallback', label: 'Fixture Grok', provider: 'grok', cli: 'grok-fixture', policy: grokPolicy },
  { ...model, id: 'second-gpt', label: 'Another ChatGPT model', policy: secondGptPolicy }], projects: [], asks: [], usageAlerts: [{ modelId: 'lead', label: model.label, ...model.usagePolicy }] };
let saved, savedConnection;
const probe = `<script>
  let stage = 0, polls = 0;
  const choose = id => { const select = document.querySelector('[data-policy-provider-select]'); select.value = id; select.dispatchEvent(new Event('change', {bubbles:true})); };
  const current = () => document.querySelector('form[data-provider-policy]');
  const check = (id, max, yolo) => {
    const form = current();
    if (document.querySelectorAll('form[data-provider-policy]').length !== 1 || document.querySelector('.dash-zone-models form[data-provider-policy]')) throw Error('Policy editor is not a separate single section');
    if (form.dataset.providerPolicy !== id || form.elements.minRemainingPercent.value !== max || form.elements.alwaysApprove.checked !== yolo) throw Error('Wrong settings loaded for ' + id);
    return form;
  };
  const edit = (form, max, yolo) => { form.elements.minRemainingPercent.value = max; form.elements.alwaysApprove.checked = yolo; form.elements.minRemainingPercent.dispatchEvent(new Event('input', {bubbles:true})); };
  const probeTimer = setInterval(() => {
    try {
      if (!current()) return;
      if (stage === 0) {
        if (!document.getElementById('usage-policy-alert')?.open) throw Error('Usage popup missing');
        document.getElementById('usage-policy-alert').close();
        const form = check('codex', '20', false);
        if (form.elements.fallbackProviderId.value !== 'grok') throw Error('Fallback missing');
        edit(form, '15', true); choose('grok'); check('grok', '40', false);
        edit(current(), '45', false); choose('antigravity'); check('antigravity', '5', true);
        choose('codex'); check('codex', '15', true);
        if (!current().textContent.includes('Unsaved changes')) throw Error('Draft not identified');
        current().querySelector('[data-policy-discard]').click(); check('codex', '20', false);
        edit(current(), '15', true); stage = 1; return;
      }
      if (stage === 1 && ++polls > 50) {
        check('codex', '15', true);
        if (document.getElementById('usage-policy-alert').open) throw Error('Popup repeated on polling');
        current().elements.fallbackProviderId.value = '@automatic';
        current().elements.fallbackProviderId.dispatchEvent(new Event('input', {bubbles:true}));
        stage = 2; current().requestSubmit(); return;
      }
      if (stage === 2 && document.getElementById('toast')?.textContent.includes('saved')) {
        check('codex', '15', true);
        if (!current().textContent.includes('Showing saved settings')) throw Error('Save still marked unsaved');
        choose('grok'); check('grok', '45', false);
        current().querySelector('[data-policy-discard]').click(); check('grok', '40', false);
        choose('antigravity'); check('antigravity', '5', true); choose('codex'); check('codex', '15', true);
        choose('future-provider'); check('future-provider', '35', false); choose('codex');
        document.querySelector('[data-add-provider]').click();
        const connection = document.querySelector('.provider-connection-dialog form');
        connection.elements.id.value = 'deepseek-api'; connection.elements.label.value = 'DeepSeek';
        connection.elements.baseUrl.value = 'https://api.deepseek.com'; connection.elements.authEnv.value = 'DEEPSEEK_API_KEY';
        connection.elements.modelIds.value = 'exact-deepseek'; connection.elements.toolsEnabled.checked = true;
        stage = 3; connection.requestSubmit(); return;
      }
      if (stage === 3 && !document.querySelector('.provider-connection-dialog')) {
        check('deepseek-api', '', false);
        document.body.dataset.policyProbe = 'passed'; current().scrollIntoView({block:'center'}); clearInterval(probeTimer);
      }
    } catch(error) { document.body.dataset.policyProbe = error.message; clearInterval(probeTimer); }
  }, 100);
</script>`;
const server = http.createServer((req, res) => {
  if (req.url === '/api/providers/connections') {
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      savedConnection = JSON.parse(body);
      fixture.providers.push({ ...savedConnection, models: [], policy: { minRemainingPercent: null, warningRemainingPercent: null, fallbackProviderId: null, alwaysApprove: false } });
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixture));
    }); return;
  }
  if (req.url === '/api/providers/policy') {
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      saved = JSON.parse(body); fixture.providers.find(provider => provider.id === saved.id).policy = saved.policy;
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixture));
    }); return;
  }
  if (req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url === '/api/plan' ? { plan: {}, version: 'fixture' } : fixture)); return; }
  const file = { '/': 'orchestrator.html', '/orch.js': 'orch.js', '/styles.css': 'styles.css', '/quota.js': 'quota.js', '/notifications.js': 'notifications.js', '/model-policy-ui.js': 'model-policy-ui.js', '/window-ui.js': 'window-ui.js' }[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  if (file === 'orchestrator.html') source = source.replace('</body>', probe + '</body>');
  res.end(source);
});
const outputDir = process.env.PLANWHARF_VALIDATION_DIR || path.join(__dirname, 'model-policy-' + Date.now());
fs.mkdirSync(outputDir, { recursive: true });
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const html = await new Promise((resolve, reject) => {
    browser = spawn(findBrowser(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--window-size=1440,1100', '--virtual-time-budget=9000', '--timeout=15000', '--screenshot=' + path.join(outputDir, 'model-policy.png'), '--dump-dom', '--user-data-dir=' + path.join(outputDir, 'profile'), 'http://127.0.0.1:' + server.address().port], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    browser.stdout.on('data', chunk => output += chunk); browser.stderr.on('data', chunk => errors += chunk);
    const timer = setTimeout(() => { browser.kill(); reject(Error('Browser fixture timed out: ' + errors.slice(-1000))); }, 30000);
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(Error(errors.slice(-1000))); });
  });
  fs.writeFileSync(path.join(outputDir, 'rendered.html'), html);
  assert.match(html, /data-policy-probe="passed"/);
  assert.deepEqual(saved, { id: 'codex', policy: { ...policy, minRemainingPercent: 15, fallbackProviderId: '@automatic', alwaysApprove: true } });
  assert.deepEqual(savedConnection, { id: 'deepseek-api', label: 'DeepSeek', adapter: 'api', baseUrl: 'https://api.deepseek.com', authEnv: 'DEEPSEEK_API_KEY', apiProtocol: 'openai', maxOutputTokens: 4096, maxTurns: 30, modelIds: ['exact-deepseek'], toolsEnabled: true });
  assert.deepEqual(fixture.providers[1].policy, grokPolicy); assert.deepEqual(fixture.providers[2].policy, secondGptPolicy);
  console.log('PASS: provider selector loads ChatGPT/Grok/Gemini and future providers, preserves independent drafts, saves only the selected provider and survives polling.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) browser.kill(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
