'use strict';
// Opt-in acceptance exercise: real provider processes, isolated notebook and retained evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runner = require('../engine/runner.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
if (process.argv[2] === '--backend') {
  const dir = process.argv[3];
  const { createServer } = require('../server.cjs');
  const { defaultInspect } = require('../engine/orchestrator.js');
  const record = (event, data) => fs.appendFileSync(path.join(dir, 'backend.jsonl'), JSON.stringify({ at: new Date().toISOString(), backendPid: process.pid, event, ...data }) + '\n');
  const server = createServer({ planFile: path.join(dir, 'notebook.json'), attemptsDir: path.join(dir, 'attempts'),
    models: require("../engine/provider-catalog.cjs").loadCatalog(require("../models.json")).models.filter(m => ['gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol'].includes(m.id)),
    skillsEnabled: false, syncSkills: false, refreshModels: false,
    inspectFolder: folder => { record('inspect', { folder }); return defaultInspect(folder); },
    spawnWorker: info => { const launch = runner.spawnWorker(info); record('launch', { ...info, launch }); return launch; },
    isProcessAlive: runner.isProcessAlive, killWorker: pid => { const ok = runner.killWorker(pid); record('kill', { pid, ok, alive: runner.isProcessAlive(pid) }); return ok; },
    askModel: async info => { record('lead-input', { ...info, onProgress: undefined }); const reply = await runner.askOrchestrator(info); record('lead-output', { projectId: info.projectId, modelId: info.model.id, reply }); return reply; },
    abortAsk: runner.abortAsk, quitApp: () => server.close(() => process.exit(0)) });
  server.listen(0, '127.0.0.1', () => fs.writeFileSync(path.join(dir, 'backend-ready.json'), JSON.stringify({ pid: process.pid, origin: `http://127.0.0.1:${server.address().port}` })));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
} else {
  main().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
async function main() {
  const recipientOnly = process.argv.includes('--recipient-only');
  const resumeIndex = process.argv.indexOf('--resume-run');
  const retained = resumeIndex >= 0;
  const runStamp = Date.now();
  const dir = retained ? path.resolve(process.argv[resumeIndex + 1] || '') : path.join(__dirname, 'phase2-browser-live-' + runStamp);
  assert.ok(dir.startsWith(path.resolve(__dirname) + path.sep) && path.basename(dir).startsWith('phase2-browser-live-'));
  if (!retained) { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'backend.jsonl'), ''); }
  const testFolder = path.join(dir, 'safe-project'); if (!retained) fs.mkdirSync(testFolder);
  const personalBytes = fs.readFileSync(path.join(root, 'plan.json'));
  const personal = JSON.parse(personalBytes);
  const notebook = retained ? JSON.parse(fs.readFileSync(path.join(dir, 'notebook.json'))) : structuredClone(personal);
  const safe = retained ? notebook.projects.find(p => p.project.id === 'live-acceptance') : structuredClone(require('../fixtures/starter-notebook.json').projects[0]);
  if (retained) assert.equal(path.resolve(safe.project.folder), testFolder);
  else {
  safe.project = { id: 'live-acceptance', name: 'Live acceptance test', folder: testFolder };
  safe.revisions[0].direction = 'Build and verify a two-step isolated arithmetic probe.';
  notebook.projects.unshift(safe); fs.writeFileSync(path.join(dir, 'notebook.json'), JSON.stringify(notebook, null, 2));
  }
  const git = (folder, args) => { const r = spawnSync('git', ['--no-optional-locks', '-c', 'safe.directory=' + folder, '-C', folder, ...args], { encoding: 'utf8', windowsHide: true }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  if (!retained) { git(testFolder, ['init']); git(testFolder, ['config', 'user.name', 'Planwharf validation']); git(testFolder, ['config', 'user.email', 'validation@localhost']);
  fs.writeFileSync(path.join(testFolder, 'README.md'), 'Isolated Planwharf acceptance project.\n'); git(testFolder, ['add', 'README.md']); git(testFolder, ['commit', '-m', 'Initialize isolated acceptance project']);
  }
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  function sourceSnapshot(folder) {
    const names = [...new Set(git(folder, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
    return { head: git(folder, ['rev-parse', 'HEAD']).trim(), status: git(folder, ['status', '--porcelain=v1', '-uall']), refs: git(folder, ['show-ref']),
      files: names.map(name => { try { return [name, hash(fs.readFileSync(path.join(folder, name)))]; } catch { return [name, 'missing']; } }) };
  }
  const raceFolder = personal.projects.find(p => p.project.id === 'raceengineer').project.folder;
  const raceBefore = sourceSnapshot(raceFolder);
  const aiFolder = personal.projects.find(p => p.project.id === 'ai-companion-desktop').project.folder;
  const aiBefore = sourceSnapshot(aiFolder);
  const os = require('node:os');
  const providerProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-live-provider-'));
  // Reuse the existing authenticated account in a disposable writable CLI profile.
  // Credentials never enter the notebook, prompts, logs, or retained evidence.
  fs.copyFileSync(path.join(os.homedir(), '.codex', 'auth.json'), path.join(providerProfile, 'auth.json'));
  fs.writeFileSync(path.join(providerProfile, 'config.toml'), 'approval_policy="never"\nmodel_reasoning_effort="low"\n');
  const backendEnv = { ...process.env, CODEX_HOME: providerProfile, GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: raceFolder, GIT_CONFIG_KEY_1: 'safe.directory', GIT_CONFIG_VALUE_1: aiFolder };
  let backend, origin, browser, socket, command, browserSequence = 0;
  const evidence = [];
  const record = (stage, details) => { const item = { at: new Date().toISOString(), stage, ...details }; evidence.push(item); fs.writeFileSync(path.join(dir, retained ? 'acceptance-continued-' + runStamp + '.json' : 'acceptance.json'), JSON.stringify(evidence, null, 2)); console.log(stage, JSON.stringify(details).slice(0, 600)); };
  async function request(route, data, status = 200) {
    const response = await fetch(origin + route, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) });
    const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body;
  }
  async function start() {
    const ready = path.join(dir, 'backend-ready.json'); if (fs.existsSync(ready)) fs.unlinkSync(ready);
    const fd = fs.openSync(path.join(dir, 'backend.log'), 'a');
    backend = spawn(process.execPath, [__filename, '--backend', dir], { windowsHide: true, stdio: ['ignore', fd, fd], env: backendEnv }); fs.closeSync(fd);
    for (let n = 0; n < 100 && !fs.existsSync(ready); n++) { assert.equal(backend.exitCode, null, 'Backend exited'); await pause(100); }
    const info = JSON.parse(fs.readFileSync(ready)); origin = info.origin; record('backend-start', info);
  }
  async function quit() { const oldPid = backend.pid; await request('/api/app/quit', {}); for (let n = 0; n < 100 && runner.isProcessAlive(oldPid); n++) await pause(100); assert.equal(runner.isProcessAlive(oldPid), false); record('backend-quit', { pid: oldPid }); backend = null; }
  async function connectBrowser() {
    const profile = path.join(dir, 'browser-profile-' + runStamp + '-' + browserSequence++);
    browser = spawn(require('../planwharf.cjs').findBrowser(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let port; for (let n = 0; n < 100 && !port; n++) { try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {} await pause(100); }
    assert.ok(port, 'Browser DevTools unavailable');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0; const waiting = new Map();
    socket.addEventListener('message', event => { const reply = JSON.parse(event.data), p = waiting.get(reply.id); if (p) { waiting.delete(reply.id); clearTimeout(p.timer); reply.error ? p.reject(new Error(reply.error.message)) : p.resolve(reply.result); } });
    command = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => { waiting.delete(key); reject(new Error('CDP timeout ' + method)); }, 15000); waiting.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params })); });
    await command('Page.navigate', { url: origin });
  }
  async function evaluate(expression) { const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; }
  async function uiUntil(expression) { for (let n = 0; n < 200; n++) { if (await evaluate(expression)) return; await pause(150); } throw new Error('UI condition failed: ' + expression); }
  async function screenshot(name) { const r = await command('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(dir, name + (retained ? '-continued-' + runStamp : '') + '.png'), Buffer.from(r.data, 'base64')); }
  async function home(stage) {
    const data = await request('/api/project-home', { projectId: safe.project.id });
    if (data.progressDetails.megaTask?.status === 'RUNNING') assert.doesNotMatch(data.next, /approv/i, 'Running Home must never reuse proposal approval instructions');
    record(stage, { progress: data.progress, now: data.now, next: data.next, progressDetails: data.progressDetails }); return data;
  }
  async function execution() { return request('/api/execution?projectId=' + safe.project.id); }
  try {
    await start(); await quit(); await start(); await connectBrowser();
    await uiUntil("document.getElementById('project-select')?.options.length === 3");
    await evaluate("document.getElementById('project-select').value='live-acceptance';document.getElementById('project-select').dispatchEvent(new Event('change'));window.PlanwharfFocusReady");
    await request('/api/orchestrator/lead', { id: 'gpt-6-sol' });
    if (!recipientOnly) {
    let megaTaskId, cp, state, secondAttemptsBefore;
    if (!retained) {
    const proposal = await request('/api/orchestrator/propose', { projectId: safe.project.id, title: 'Two-step real worker acceptance', goal: 'Only work in this isolated project. Do not inspect or modify any parent or sibling project. Do not commit or push.', subTasks: [
      { title: 'Create arithmetic module', detail: 'Create sum.cjs exporting (a,b)=>a+b and sum.test.cjs using node:assert/strict to check 2+3=5 and -2+2=0. Run node sum.test.cjs. Do only this slice. In your structured result use summary "Arithmetic module created and tests passed", nextAction "Resume the dependent verification slice". Stop promptly after writing the required result.', assignedModelId: 'gpt-6-luna', dependsOn: [] },
      { title: 'Verify checkpoint recovery', detail: 'Only on the FIRST attempt of this SubTask (your durable handoff shows this SubTask has exactly one attemptId): first write second-task-started.txt with "waiting for Stop" then run a PowerShell command Start-Sleep -Seconds 120. This intentional wait allows the acceptance harness to issue Stop. On a resumed attempt (more than one attemptId), skip the wait, read sum.cjs and run node sum.test.cjs. Write recovery.txt stating "Checkpoint resumed; completed first slice retained; arithmetic tests passed". Produce a valid COMPLETE result and nextAction "Review completed acceptance evidence". Do not repeat or rewrite the first slice.', assignedModelId: 'gpt-6-luna', dependsOn: [0] }
    ] }, 201);
    megaTaskId = proposal.snapshot.projects.find(p => p.id === safe.project.id).megaTaskId;
    assert.equal((await execution()).subTasks.every(s => s.attemptIds.length === 0), true);
    await uiUntil("document.getElementById('home-progress-details')?.textContent.includes('Two-step real worker acceptance')"); await screenshot('proposal');
    record('proposal-awaiting-approval', { megaTaskId });
    await evaluate("document.getElementById('home-next-action').click()");
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      await request('/api/orchestrator'); state = await execution();
      if (state.subTasks[0].status === 'FAILED' || state.megaTasks[0].status === 'FAILED') throw new Error('Real worker failed: ' + JSON.stringify(state.results));
      if (state.subTasks[0].status === 'COMPLETE' && state.subTasks[1].status === 'RUNNING' && fs.existsSync(path.join(testFolder, 'second-task-started.txt'))) break;
      await pause(1500);
    }
    assert.equal(state.subTasks[0].status, 'COMPLETE'); assert.equal(state.subTasks[1].status, 'RUNNING'); assert.ok(fs.existsSync(path.join(testFolder, 'second-task-started.txt')));
    const activeHome = await home('first-real-result-second-running'); assert.match(activeHome.next, /Work in progress: Verify checkpoint recovery/);
    assert.equal(activeHome.next, (await request('/api/orchestrator?readOnly=1')).projects.find(p => p.id === safe.project.id).next);
    await uiUntil("document.getElementById('home-next').textContent.includes('Work in progress: Verify checkpoint recovery')");
    await uiUntil("document.getElementById('home-progress').textContent.includes('Arithmetic module')"); await screenshot('second-running');
    const snap = await request('/api/orchestrator?readOnly=1'); const active = snap.projects.find(p => p.id === safe.project.id).dispatch.find(p => p.subTaskId === state.subTasks[1].id);
    assert.ok(runner.isProcessAlive(active.pid)); record('second-live-process', { pid: active.pid, attemptId: active.attemptId, subTaskId: active.subTaskId });
    await request('/api/orchestrator/stop', { projectId: safe.project.id, megaTaskId }); assert.equal(runner.isProcessAlive(active.pid), false);
    state = await execution(); cp = state.checkpoints.at(-1); assert.deepEqual(cp.completedSubTaskIds, [state.subTasks[0].id]);
    const pausedHome = await home('stopped-checkpoint'); assert.equal(pausedHome.next, cp.nextAction);
    await uiUntil("document.getElementById('home-now').textContent.includes('Paused')"); await screenshot('paused');
    socket.close(); browser.kill(); socket = null; browser = null;
    await quit(); await start(); await connectBrowser();
    } else {
      state = await execution(); cp = state.checkpoints.at(-1); megaTaskId = cp.megaTaskId;
      assert.equal(state.subTasks[0].status, 'COMPLETE'); assert.deepEqual(cp.completedSubTaskIds, [state.subTasks[0].id]);
      record('retained-checkpoint-selected', { megaTaskId, checkpointId: cp.id, completedSubTaskIds: cp.completedSubTaskIds });
    }
    state = await execution(); assert.ok(['PAUSED', 'FAILED'].includes(state.megaTasks[0].status)); assert.equal(state.subTasks[0].attemptIds.length, 1); secondAttemptsBefore = state.subTasks[1].attemptIds.length;
    await home('restored-without-dispatch');
    const checkQuestion = `Using only the durable briefing, explain checkpoint ${cp.id}: identify completed and remaining SubTasks AT THAT CHECKPOINT, and whether Resume must rerun completed work. Do not use tools or dispatch work. Include separate plain-text lines CHECKPOINT=<exact checkpoint ID>, COMPLETED=<completed SubTask IDs>, REMAINING_AT_CHECKPOINT=<remaining SubTask IDs>, RERUN_COMPLETED=yes or no. Then explain what to continue and distinguish the saved checkpoint from current execution. No JSON action envelope is needed.`;
    const checkAssessment = answer => { assert.ok(!/CLI failed|returned no answer/.test(answer)); assert.ok(answer.includes(cp.id)); assert.ok(answer.includes(state.subTasks[0].id)); assert.ok(answer.includes(state.subTasks[1].id)); assert.match(answer, /RERUN_COMPLETED\s*=\s*no/i); };
    const firstLead = await request('/api/orchestrator/ask', { projectId: safe.project.id, chatSessionId: 'first-lead', question: checkQuestion });
    record('original-lead-checkpoint', { answer: firstLead.answer }); checkAssessment(firstLead.answer);
    await request('/api/orchestrator/resume', { projectId: safe.project.id, megaTaskId, checkpointId: cp.id });
    const resumed = await execution(); assert.equal(resumed.subTasks[1].attemptIds.length, secondAttemptsBefore + 1); assert.equal(resumed.subTasks[0].attemptIds.length, 1);
    record('explicit-resume', { megaTaskId, checkpointId: cp.id, subTaskId: resumed.subTasks[1].id, attempts: resumed.subTasks[1].attemptIds });
    const resumedHome = await home('resumed-real-next'); assert.match(resumedHome.next, /Work in progress: Verify checkpoint recovery/);
    await request('/api/orchestrator/lead', { id: 'gpt-6.1-sol' });
    const otherLead = await request('/api/orchestrator/ask', { projectId: safe.project.id, chatSessionId: 'different-lead', question: checkQuestion });
    record('different-real-lead-checkpoint', { answer: otherLead.answer }); checkAssessment(otherLead.answer);
    const finishDeadline = Date.now() + 180000;
    while (Date.now() < finishDeadline) { await request('/api/orchestrator'); state = await execution(); if (['COMPLETE', 'FAILED', 'PAUSED'].includes(state.megaTasks[0].status)) break; await pause(1500); }
    assert.equal(state.megaTasks[0].status, 'COMPLETE', JSON.stringify(state.results)); assert.equal(state.subTasks[0].attemptIds.length, 1); assert.equal(state.subTasks[1].attemptIds.length, secondAttemptsBefore + 1);
    assert.equal(spawnSync(process.execPath, ['sum.test.cjs'], { cwd: testFolder }).status, 0); assert.ok(fs.readFileSync(path.join(testFolder, 'recovery.txt'), 'utf8').includes('Checkpoint resumed'));
    const completedHome = await home('completed-real-resume'); assert.equal(completedHome.now, 'Completed'); assert.equal(completedHome.next, state.results.filter(r => r.status === 'COMPLETE').at(-1).nextAction);
    for (const result of state.results.filter(r => r.status === 'COMPLETE')) assert.ok(completedHome.progress.includes(result.summary));
    assert.ok(completedHome.progressDetails.tests.some(t => t.status === 'PASSED'));
    await command('Page.reload'); await uiUntil("document.getElementById('home-now').textContent.includes('Completed')"); await screenshot('completed');
    const usage = (await request('/api/orchestrator?readOnly=1')).aiUsage;
    assert.equal(usage.workers.reduce((sum, group) => sum + group.calls, 0), 3);
    assert.equal(usage.workers.reduce((sum, group) => sum + group.COMPLETE, 0), 2);
    assert.equal(usage.workers.reduce((sum, group) => sum + group.BLOCKED, 0), 1);
    assert.equal(usage.recent.some(call => call.status === 'RUNNING'), false);
    const leadCalls = usage.orchestrator.reduce((sum, group) => sum + group.calls, 0);
    const statusReply = await request('/api/orchestrator/ask', { projectId: safe.project.id, question: 'quota remaining' });
    assert.match(statusReply.answer, /REMAINING/);
    assert.equal(statusReply.snapshot.aiUsage.orchestrator.reduce((sum, group) => sum + group.calls, 0), leadCalls);
    const bundle = await request('/api/project-export?projectId=' + safe.project.id);
    assert.equal(bundle.project.id, safe.project.id); assert.equal(bundle.execution.megaTasks[0].status, 'COMPLETE');
    assert.equal(bundle.execution.checkpoints.length > 0, true); assert.equal(bundle.timeline.length < bundle.execution.timeline.length, true);
    fs.writeFileSync(path.join(dir, 'project-export.json'), JSON.stringify(bundle, null, 2));
    fs.writeFileSync(path.join(dir, 'final-usage.json'), JSON.stringify(usage, null, 2));
    await evaluate("document.getElementById('watch-window').click()");
    await uiUntil("document.querySelector('[aria-label=\"AI usage\"]')?.textContent.includes('gpt-6-luna')");
    await uiUntil("document.body.textContent.includes('REMAINING')"); await screenshot('final-usage-quota');
    record('final-ledger-quota-export', { workers: usage.workers, orchestrator: usage.orchestrator, remaining: statusReply.answer, exportSchema: bundle.schema });

    }
    const raceExecutionBefore = await request('/api/execution?projectId=raceengineer');
    const raceNotebookBefore = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'notebook.json'))).projects.find(p => p.project.id === 'raceengineer'));
    const traceOffset = fs.readFileSync(path.join(dir, 'backend.jsonl'), 'utf8').length;
    await evaluate("document.getElementById('project-select').value='ai-companion-desktop';document.getElementById('project-select').dispatchEvent(new Event('change'));window.PlanwharfFocusReady");
    assert.equal((await request('/api/orchestrator?readOnly=1')).selectedProjectId, 'ai-companion-desktop');
    const order = 'Audit AI-Companion-Desktop: propose a tiny read-only audit of its README. Do not modify source, run implementation, or inspect any other project. Leave the audit awaiting my approval. Use only the selected project.';
    const reply = await request('/api/orchestrator/ask', { projectId: 'ai-companion-desktop', chatSessionId: 'recipient-isolation', question: order });
    record('ai-companion-order', { order, answer: reply.answer });
    const afterAI = JSON.parse(fs.readFileSync(path.join(dir, 'notebook.json'))).projects.find(p => p.project.id === 'ai-companion-desktop');
    assert.equal(afterAI.tasks.at(-1).status, 'running'); assert.equal(afterAI.tasks.at(-1).detail, order);
    const aiExecution = await request('/api/execution?projectId=ai-companion-desktop'); assert.equal(aiExecution.megaTasks.at(-1).status, 'READY_FOR_APPROVAL'); assert.ok(aiExecution.subTasks.every(s => s.attemptIds.length === 0));
    const trace = fs.readFileSync(path.join(dir, 'backend.jsonl'), 'utf8').slice(traceOffset).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.ok(trace.filter(e => e.event === 'lead-input').every(e => e.projectId === 'ai-companion-desktop'));
    assert.ok(!trace.some(e => e.event === 'launch'));
    assert.deepEqual(await request('/api/execution?projectId=raceengineer'), raceExecutionBefore);
    assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'notebook.json'))).projects.find(p => p.project.id === 'raceengineer')), raceNotebookBefore);
    assert.deepEqual(sourceSnapshot(raceFolder), raceBefore); assert.deepEqual(sourceSnapshot(aiFolder), aiBefore); assert.deepEqual(fs.readFileSync(path.join(root, 'plan.json')), personalBytes);
    await screenshot('ai-companion-target');
    record('recipient-isolation-verified', { raceSourceUnchanged: true, raceNotebookUnchanged: true, raceExecutionUnchanged: true, personalNotebookUnchanged: true, aiSourceUnchanged: true, workerLaunchesDuringOrder: 0, inspectedFolders: [...new Set(trace.filter(e => e.event === 'inspect').map(e => e.folder))] });
    const aiExecutionBefore = await request('/api/execution?projectId=ai-companion-desktop');
    const reverseOffset = fs.readFileSync(path.join(dir, 'backend.jsonl'), 'utf8').length;
    await evaluate("document.getElementById('project-select').value='raceengineer';document.getElementById('project-select').dispatchEvent(new Event('change'));window.PlanwharfFocusReady");
    const reverse = await request('/api/orchestrator/ask', { projectId: 'raceengineer', chatSessionId: 'reverse-recipient-isolation', question: 'Audit RaceEngineer: propose a tiny read-only audit of its README. Do not modify source, run implementation, or inspect any other project. Leave the audit awaiting my approval. Use only the selected project.' });
    const reverseTrace = fs.readFileSync(path.join(dir, 'backend.jsonl'), 'utf8').slice(reverseOffset).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.equal(reverseTrace.filter(event => event.event === 'launch').length, 0);
    assert.ok(reverseTrace.filter(event => event.event === 'inspect').every(event => path.resolve(event.folder) === path.resolve(raceFolder)));
    assert.deepEqual(await request('/api/execution?projectId=ai-companion-desktop'), aiExecutionBefore);
    assert.deepEqual(sourceSnapshot(raceFolder), raceBefore); assert.deepEqual(sourceSnapshot(aiFolder), aiBefore);
    assert.deepEqual(fs.readFileSync(path.join(root, 'plan.json')), personalBytes);
    record('reverse-recipient-isolation-verified', { answer: reverse.answer, aiExecutionUnchanged: true, personalNotebookUnchanged: true, bothSourceTreesUnchanged: true, workerLaunches: 0 });
    const finalExecution = await execution();
    const actualLeads = [...new Set(fs.readFileSync(path.join(dir, 'backend.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => e.event === 'lead-input').map(e => e.model.provider + '/' + e.model.cli))];
    record(recipientOnly ? 'PASS_RECIPIENT_ISOLATION' : 'PASS', { dir, workerProvider: recipientOnly ? null : 'codex', workerModel: recipientOnly ? null : 'gpt-6-luna', invokedLeads: actualLeads, checkpoints: finalExecution.checkpoints.map(cp => cp.id), realResults: finalExecution.results.map(r => ({ attemptId: r.attemptId, status: r.status, provider: r.provider, cli: r.cli })) });
  } catch (error) { record('FAIL', { error: error.stack }); throw error; }
  finally { if (socket) socket.close(); if (browser) browser.kill(); if (backend && runner.isProcessAlive(backend.pid)) { try { await request('/api/orchestrator/ask/cancel', {}); await quit(); } catch (error) { record('cleanup-error', { error: error.message }); } }
    const profileTarget = path.resolve(providerProfile); assert.ok(profileTarget.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(profileTarget).startsWith('pw-live-provider-'));
    fs.rmSync(profileTarget, { recursive: true, force: true }); console.log('Evidence:', dir); }
}
