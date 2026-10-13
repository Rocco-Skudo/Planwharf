'use strict';
// Exercise the compiled Windows launcher with an isolated notebook, never dispatch workers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const output = process.env.PLANWHARF_VALIDATION_DIR || path.join(__dirname, 'launcher-smoke-' + Date.now());
const hash = file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const personalFile = path.join(root, 'plan.json');
const before = hash(personalFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [], urls = [];
fs.mkdirSync(output, { recursive: true });
const logs = path.resolve(output, 'logs');
const planFile = path.resolve(output, 'notebook with spaces.json');
const attemptsDir = path.resolve(output, 'attempts with spaces');
fs.copyFileSync(path.join(root, 'fixtures/notebook.json'), planFile);
const notebookHash = hash(planFile);
fs.mkdirSync(attemptsDir);
fs.writeFileSync(path.join(attemptsDir, 'skills-policy.json'), '{"enabled":false}');
async function waitFor(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; }
    catch (error) {
      if (!['TimeoutError', 'AbortError'].includes(error.name) && error.cause?.code !== 'ECONNREFUSED') throw error;
    }
    await pause(100);
  }
  throw new Error('Timeout: ' + label);
}
function launch(showWindows = false) {
  // A trailing backslash used to escape the closing Windows argument quote.
  const child = spawn(path.join(root, 'Planwharf.exe'), [...(showWindows ? [] : ['--no-window']), '--plan', planFile, '--attempts-dir', attemptsDir + path.sep, '--port', '0'], {
    cwd: output, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, PLANWHARF_LAUNCH_LOG_DIR: logs, PLANWHARF_TEST_NO_SANDBOX: '1' }
  });
  children.push(child);
  child.on('error', error => { child.launchError = error; });
  return child;
}
async function exited(child) {
  await waitFor(() => {
    if (child.launchError) throw child.launchError;
    return child.exitCode !== null;
  }, 'launcher exits');
  assert.equal(child.exitCode, 0);
}
async function state(url) { return (await fetch(url + '/api/app', { signal: AbortSignal.timeout(2000) })).json(); }
(async () => {
  assert.equal(process.platform, 'win32', 'This check requires the Windows executable.');
  const rounds = [];
  for (let round = 0; round < 3; round++) {
    const owner = launch(round === 0);
    const lock = await waitFor(() => {
      if (owner.launchError) throw owner.launchError;
      try { const value = JSON.parse(fs.readFileSync(path.join(attemptsDir, 'app-instance.json'))); return value.url && value; } catch { return false; }
    }, 'compiled launcher starts backend');
    const url = lock.url; urls.push(url);
    assert.equal((await state(url)).pid, lock.pid);
    assert.equal((await fetch(url + '/')).status, 200);
    const notebook = await (await fetch(url + '/api/plan')).json();
    assert.ok(notebook.plan.projects.length > 0);
    await Promise.all([launch(), launch(), launch()].map(exited));
    assert.equal((await state(url)).pid, lock.pid, 'Repeated launches must reuse one backend');
    if (round === 0) {
      assert.ok((await fetch(url + '/api/planwharf/window', { method: 'POST', headers: { Origin: url } })).ok);
      await waitFor(async () => { const views = (await state(url)).views; return views.planwharf && views.orchestrator; }, 'both real desktop windows send heartbeat', 40000);
      const backendPid = (await state(url)).pid;
      await fetch(url + '/api/orchestrator/window', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: '{}' });
      assert.equal((await state(url)).pid, backendPid, 'Opening either window reuses the same backend');
    }
    assert.ok((await fetch(url + '/api/app/quit', { method: 'POST', headers: { Origin: url } })).ok);
    await exited(owner);
    assert.equal(fs.existsSync(path.join(attemptsDir, 'app-instance.json')), false);
    rounds.push({ round: round + 1, backendPid: lock.pid, repeatedLaunches: 3, realWindow: round === 0 });
    console.log('PASS: compiled launcher round', round + 1);
  }
  assert.equal(hash(personalFile), before, 'Personal notebook must remain unchanged');
  assert.equal(hash(planFile), notebookHash, 'Startup must not rewrite the test notebook');
  assert.equal(fs.readdirSync(logs).length, 12, 'Each launcher invocation keeps its own log');
  const report = { passed: true, rounds, personalNotebookUnchanged: true, notebookUnchanged: true, noWorkerDispatch: true };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log('Evidence:', output);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const url of urls) {
    try { await fetch(url + '/api/app/quit', { method: 'POST', headers: { Origin: url }, signal: AbortSignal.timeout(1000) }); } catch {}
  }
  for (const child of children) if (child.exitCode === null && child.pid) {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
  }
});
