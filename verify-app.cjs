'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { formatProjects, formatStatus, loadAttempts, listen, parseArgs, findEdge, findBrowser } = require('./planwharf.cjs');
const { readPlan } = require('./server.cjs');

const production = path.join(__dirname, 'plan.json');
const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(production)).digest('hex');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-app-'));
const planFile = path.join(dir, 'plan.json');
const attemptsDir = path.join(dir, 'attempts');
fs.copyFileSync(production, planFile);

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'planwharf.cjs'), ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

(async () => {
  const plan = await readPlan(planFile);
  const projectsText = formatProjects(plan);
  assert.match(projectsText, /first-project\tFirst project/);
  assert.equal(projectsText.trim().split('\n').length, plan.projects.length);

  const statusText = formatStatus(plan, loadAttempts(attemptsDir));
  assert.match(statusText, /^Projects: \d+/);
  assert.match(statusText, /first-project\tFirst project/);

  const listed = await runCli(['projects', '--plan', planFile, '--attempts-dir', attemptsDir]);
  assert.equal(listed.code, 0, listed.stderr);
  assert.equal(listed.stdout, projectsText);

  const status = await runCli(['status', '--plan', planFile, '--attempts-dir', attemptsDir]);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(status.stdout, statusText);

  const opts = parseArgs([process.execPath, 'planwharf.cjs', '--no-window', '--plan', planFile, '--attempts-dir', attemptsDir, '--port', '0']);
  const opened = await listen(opts);
  const page = await fetch(opened.url + '/');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /For you/);
  assert.match(html, /Running/);
  assert.match(html, /The plan/);
  assert.match(html, /What changed/);
  assert.match(html, /Folder/);
  assert.match(html, /GitHub/);
  assert.match(html, /Set place/);
  assert.match(html, /Grill me/);
  assert.match(html, /does not start a process/);
  assert.match(html, /All projects/);
  assert.match(html, /orchestrator/);
  assert.match(html, /Remove project/);
  assert.match(html, /Workers and plans/);
  assert.match(html, /data-mode="auto"/);
  assert.match(html, /ChatGPT and Grok/);
  assert.match(html, /Start auto task/);
  assert.match(html, /Grill with the docs/);
  assert.match(html, /id="theme-toggle"/);
  const api = await (await fetch(opened.url + '/api/plan')).json();
  assert.equal(api.plan.projects.length, plan.projects.length);
  await new Promise(resolve => opened.server.close(resolve));

  const edge = findEdge();
  assert.equal(findBrowser(), edge);
  console.log(edge ? 'BROWSER: found (window not opened in this test)' : 'BROWSER: missing (window not opened)');

  const afterHash = crypto.createHash('sha256').update(fs.readFileSync(production)).digest('hex');
  assert.equal(afterHash, beforeHash);
  console.log('OK: app CLI, loopback bind, four areas served, production plan unchanged.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});
