'use strict';
// Real generated scheduler + dashboard, with deterministic local jobs; no AI in HarborQueue.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
const out = path.resolve(process.argv[2]), source = path.resolve(process.argv[3]);
const { HarborQueue } = require(path.join(source, 'scheduler.cjs')), { createServer } = require(path.join(source, 'server.cjs'));
let queue, server, browser; const checks = [], errors = [], record = name => { checks.push(name); console.log('PASS ' + name); };
(async () => {
  queue = new HarborQueue({ file: path.join(out, 'dashboard-acceptance-' + Date.now() + '.json'), run: async job => ({ completed: job.id }) });
  queue.add({ id: 'unload' }); queue.add({ id: 'inspect', dependsOn: ['unload'] }); queue.start(); await queue.idle();
  assert.deepEqual(queue.snapshot().jobs.map(j => j.status), ['completed', 'completed']); record('Actual dependency-aware scheduler completed both jobs');
  server = createServer({ queue }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.PLANWHARF_TEST_BROWSER, headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }); page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText(/Updated at/).waitFor(); record('Actual Refresh fetches real scheduler state');
  assert.match(await page.locator('body').innerText(), /unload/); assert.match(await page.locator('body').innerText(), /inspect/);
  assert.ok(await page.getByRole('cell', { name: 'completed', exact: true }).count() >= 2); record('Dashboard displays completed job states and execution history');
  await page.screenshot({ path: path.join(out, 'harborqueue-dashboard.png') });
  await new Promise(r => server.close(r));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await page.getByText(/Failed to load HarborQueue state/).waitFor(); record('Failed state request is displayed as a failure');
  assert.deepEqual(errors, []); record('No uncaught dashboard browser errors');
  fs.writeFileSync(path.join(out, 'harborqueue-browser.json'), JSON.stringify({ checks, errors }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); if (server?.listening) await new Promise(r => server.close(r)); await queue?.close(); });
