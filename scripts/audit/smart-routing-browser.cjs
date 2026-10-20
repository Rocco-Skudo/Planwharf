'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
const out = path.resolve(process.argv[2]), { url } = JSON.parse(fs.readFileSync(path.join(out, 'server.json')));
const project = JSON.parse(fs.readFileSync(path.join(out, 'harborqueue-project.json'))), checks = [], errors = [];
let browser;
const record = name => { checks.push(name); console.log('PASS ' + name); };
(async () => {
  browser = await chromium.launch({ executablePath: process.env.PLANWHARF_TEST_BROWSER, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.waitForFunction(() => document.body.dataset.orchReady === '1');
  if (process.argv[3] === '--concurrency') {
    const projects = JSON.parse(fs.readFileSync(path.join(out, 'routing-concurrent-projects.json')));
    const s = await (await page.request.get(url + '/api/orchestrator?readOnly=1')).json();
    for (const p of projects) {
      assert.ok(s.projects.find(r => r.id === p.id).dispatch.some(d => d.alive && d.cli === 'gpt-5.6-luna'));
      await page.locator('#project-select').selectOption(p.id);
      await page.waitForFunction(id => { const ship = document.querySelector('#harbor-background'); return ship.dataset.project === id && ship.dataset.state === 'running'; }, p.id);
      record('Actual running Ship state: ' + p.id);
    }
    await page.locator('#ship-view-button').click();
    await page.screenshot({ path: path.join(out, 'routing-concurrency.png') }); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'routing-concurrency-browser.json'), JSON.stringify({ checks, errors }, null, 2)); return;
  }
  await page.locator('#project-select').selectOption(project.id);
  await page.locator('#workspace-settings-button').click();
  await page.getByRole('button', { name: 'Worker routing and model usage', exact: true }).click();
  await page.locator('#dashboard-orch-project').selectOption(project.id);
  const form = page.locator('form[data-worker-routing]'); await form.waitFor();
  assert.equal(await form.locator('[name=mode]').inputValue(), 'smart'); record('Saved Smart Routing visible in actual UI');
  await form.locator('[name=mode]').selectOption('smart');
  const save = page.waitForResponse(r => r.url().endsWith('/api/models/routing') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Save Worker routing', exact: true }).click(); assert.equal((await save).status(), 200);
  record('User saves routing with no extra consent prompt');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  const premium = page.locator('form[data-routing-preference="codex:gpt-5.6-sol"]');
  assert.equal(await premium.locator('[name=tier]').inputValue(), 'premium'); assert.ok(await premium.locator('[name=automatic]').isChecked());
  const pref = page.waitForResponse(r => r.url().endsWith('/api/models/routing-preference') && r.request().method() === 'POST');
  await premium.getByRole('button', { name: 'Save model usage', exact: true }).click(); assert.equal((await pref).status(), 200); record('Standing Premium authorization saves through actual controls');
  await page.reload(); await page.waitForFunction(() => document.body.dataset.orchReady === '1');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('#dashboard-orch-project').selectOption(project.id);
  await page.getByRole('button', { name: 'Models & usage', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('form[data-worker-routing] [name=mode]')?.value === 'smart'); record('Browser reload retains routing settings');
  await page.locator('form[data-worker-routing]').screenshot({ path: path.join(out, 'routing-settings.png') });
  await page.getByRole('button', { name: 'Workers', exact: true }).click();
  await page.locator('.workspace-worker-filters').evaluate(e => { e.open = true; });
  await page.locator('#dashboard-worker-session-filter').selectOption('all');
  const receipts = page.locator('#dashboard-orchestrator .routing-receipt:visible'); await receipts.first().waitFor();
  assert.match(await receipts.allTextContents().then(x => x.join(' ')), /premium|standard/i); record('Routing rationale is inspectable alongside actual assignments');
  await receipts.first().evaluate(e => { e.open = true; });
  await page.screenshot({ path: path.join(out, 'routing-ui.png'), fullPage: true });
  assert.equal(await page.locator('dialog[open]').count(), 0); record('No unexpected Premium approval modal');
  assert.deepEqual(errors, []); record('No uncaught browser errors');
  fs.writeFileSync(path.join(out, 'routing-browser.json'), JSON.stringify({ checks, errors }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
