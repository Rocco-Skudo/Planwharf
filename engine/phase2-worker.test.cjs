'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { spawnWorker, promptFor, parseArgs, isProcessAlive, killWorker } = require('./runner.cjs');
const { readValidatedResult } = require('./worker-result.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-phase2-worker-'));
const previous = process.env.PLANWHARF_CODEX;
const pids = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const model = { id: 'fixture-luna', label: 'Fixture Luna', provider: 'codex', cli: 'gpt-6-luna' };
async function until(check) { for (let n = 0; n < 200; n++) { if (check()) return; await pause(50); } throw new Error('Isolated worker timed out'); }
(async () => {
  process.env.PLANWHARF_CODEX = process.execPath;
  for (const mode of ['valid', 'bom', 'missing', 'wrong-identity', 'bom-wrong-identity', 'failed', 'blocked']) {
    const folder = path.join(dir, mode); fs.mkdirSync(folder);
    const resultPath = path.join(folder, 'result.txt'), structuredResultPath = path.join(folder, 'result.json'), exitPath = path.join(folder, 'exit.json');
    const info = { linkedFolder: folder, folder, resultPath, structuredResultPath, exitPath, logPath: path.join(folder, 'worker.log'), worker: model, megaTaskId: 'MT-fixture', subTaskId: 'MT-fixture-ST-01', attemptId: 'attempt-' + mode, resultId: 'R-' + mode,
      job: { title: 'Isolated structured worker', detail: 'Unicode telemetry è 日本語\n'.repeat(18000) } };
    const expected = { resultId: info.resultId, attemptId: info.attemptId, subTaskId: info.subTaskId, megaTaskId: info.megaTaskId,
      status: mode === 'blocked' ? 'BLOCKED' : mode === 'failed' ? 'FAILED' : 'COMPLETE', summary: 'Isolated provider wrote its structured findings.', filesChanged: [], tests: [], blockers: [], nextAction: 'Review findings.', createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(folder, 'fixture.json'), JSON.stringify({ mode, expected, structuredResultPath }));
    fs.writeFileSync(path.join(folder, 'exec'), `const fs=require('fs'); const fixture=JSON.parse(fs.readFileSync('fixture.json')); let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{fs.writeFileSync('received.json',JSON.stringify({prompt,args:process.argv.slice(2)}));if(fixture.mode!=='missing'){if(fixture.mode.includes('wrong-identity'))fixture.expected.megaTaskId='MT-wrong-project';fs.writeFileSync(fixture.structuredResultPath,(fixture.mode.startsWith('bom')?'\uFEFF':'')+JSON.stringify(fixture.expected));}console.log('Isolated provider finished');});`);
    const launched = spawnWorker(info); pids.push(launched.pid);
    const opts = parseArgs(['node', 'runner', '--job-file', launched.inputPath]);
    await until(() => fs.existsSync(exitPath) && fs.existsSync(resultPath) && /STATUS: (COMPLETE|FAILED|BLOCKED)/.test(fs.readFileSync(resultPath, 'utf8')));
    const received = JSON.parse(fs.readFileSync(path.join(folder, 'received.json')));
    assert.ok(received.prompt.length > 32767);
    assert.equal(received.prompt, promptFor(opts));
    assert.equal(received.args[received.args.indexOf('-m') + 1], 'gpt-6-luna');
    assert.ok(received.args.every(arg => arg.length < 32767));
    const status = ['valid', 'bom'].includes(mode) ? 'COMPLETE' : mode === 'blocked' ? 'BLOCKED' : 'FAILED';
    assert.match(fs.readFileSync(resultPath, 'utf8'), new RegExp('STATUS: ' + status));
    const actual = readValidatedResult(structuredResultPath, { ...expected, provider: model.provider, cli: model.cli }, exitPath);
    assert.equal(Boolean(actual), !['missing', 'wrong-identity', 'bom-wrong-identity'].includes(mode));
    assert.equal(JSON.parse(fs.readFileSync(exitPath)).exitCode, 0, 'Exit 0 alone cannot complete a missing or invalid result');
    await until(() => !isProcessAlive(launched.pid));
  }
  // Real operating-system process tree, using only isolated Node fixtures.
  const treeFolder = path.join(dir, 'tree'); fs.mkdirSync(treeFolder);
  const parentFile = path.join(treeFolder, 'parent.cjs'), childFile = path.join(treeFolder, 'child.cjs');
  fs.writeFileSync(childFile, 'setInterval(()=>{},1000);');
  fs.writeFileSync(parentFile, `const fs=require('fs'),{spawn}=require('child_process');const child=spawn(process.execPath,[${JSON.stringify(childFile)}],{stdio:'ignore',windowsHide:true});fs.writeFileSync(${JSON.stringify(path.join(treeFolder, 'child-pid.txt'))},String(child.pid));setInterval(()=>{},1000);`);
  const parent = spawn(process.execPath, [parentFile], { detached: true, windowsHide: true, stdio: 'ignore' }); pids.push(parent.pid); parent.unref();
  await until(() => fs.existsSync(path.join(treeFolder, 'child-pid.txt')));
  const childPid = Number(fs.readFileSync(path.join(treeFolder, 'child-pid.txt'))); pids.push(childPid);
  assert.ok(isProcessAlive(parent.pid) && isProcessAlive(childPid));
  const terminated = killWorker(parent.pid);
  if (!terminated && process.platform === 'win32') {
    const evidence = spawnSync('taskkill', ['/F', '/T', '/PID', String(parent.pid)], { windowsHide: true, encoding: 'utf8', timeout: 2000 });
    if (!/Access.*denied|Accesso negato/i.test(evidence.stderr || '')) throw new Error('Worker tree termination failed: ' + evidence.stderr);
    console.log('SKIP ENVIRONMENT: Windows denies taskkill /T. Actual process-tree termination requires verification in the owner desktop session.');
    for (const processId of [childPid, parent.pid]) { try { process.kill(processId); } catch {} }
  } else {
    assert.equal(terminated, true);
    await until(() => !isProcessAlive(parent.pid) && !isProcessAlive(childPid));
    console.log('PASS: actual parent and descendant processes terminated.');
  }
  console.log('PASS Phase 2 worker: large UTF-8 stdin prompt intact, exact Codex/model argv, structured status/identity validation, exit 0 insufficient.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (previous === undefined) delete process.env.PLANWHARF_CODEX; else process.env.PLANWHARF_CODEX = previous;
  for (const pid of pids) if (isProcessAlive(pid)) { try { process.kill(pid); } catch {} }
  const resolved = path.resolve(dir); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('pw-phase2-worker-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
