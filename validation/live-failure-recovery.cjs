'use strict';
// Continue only a retained, isolated acceptance checkpoint. Never dispatch personal projects.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const runner = require('../engine/runner.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const dir = path.resolve(process.argv[2] || '');
  assert.ok(dir.startsWith(path.resolve(__dirname) + path.sep) && path.basename(dir).startsWith('phase2-browser-live-'));
  const notebook = JSON.parse(fs.readFileSync(path.join(dir, 'notebook.json')));
  const project = notebook.projects.find(p => p.project.id === 'live-acceptance');
  assert.ok(path.resolve(project.project.folder).startsWith(dir + path.sep));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-live-recovery-'));
  fs.copyFileSync(path.join(os.homedir(), '.codex/auth.json'), path.join(profile, 'auth.json'));
  fs.writeFileSync(path.join(profile, 'config.toml'), 'approval_policy="never"\nmodel_reasoning_effort="low"\n');
  let backend, origin;
  const evidence = [];
  const record = (stage, details) => { evidence.push({ at: new Date().toISOString(), stage, ...details }); fs.writeFileSync(path.join(dir, 'failure-recovery.json'), JSON.stringify(evidence, null, 2)); console.log(stage, JSON.stringify(details).slice(0, 450)); };
  async function request(route, data) { const r = await fetch(origin + route, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) }); const body = await r.json(); assert.ok(r.ok, JSON.stringify(body)); return body; }
  async function start() {
    const ready = path.join(dir, 'backend-ready.json'); if (fs.existsSync(ready)) fs.unlinkSync(ready);
    const fd = fs.openSync(path.join(dir, 'backend.log'), 'a');
    backend = spawn(process.execPath, [path.join(__dirname, 'live-acceptance.cjs'), '--backend', dir], { windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, CODEX_HOME: profile } }); fs.closeSync(fd);
    for (let n = 0; n < 100 && !fs.existsSync(ready); n++) await pause(100);
    const info = JSON.parse(fs.readFileSync(ready)); origin = info.origin; record('backend-reopened', info);
  }
  async function quit() { const pid = backend.pid; await request('/api/app/quit', {}); for (let n = 0; n < 100 && runner.isProcessAlive(pid); n++) await pause(100); assert.equal(runner.isProcessAlive(pid), false); backend = null; }
  const view = () => request('/api/execution?projectId=live-acceptance');
  try {
    await start(); const state = await view(), mega = state.megaTasks[0], cp = state.checkpoints.at(-1);
    assert.equal(mega.status, 'FAILED'); assert.equal(state.subTasks[0].attemptIds.length, 1);
    const restored = await request('/api/project-home', { projectId: project.project.id });
    record('failed-checkpoint-restored-without-launch', { megaTaskId: mega.id, checkpointId: cp.id, now: restored.now, next: restored.next, attemptIds: state.subTasks[0].attemptIds });
    await request('/api/orchestrator/resume', { projectId: project.project.id, megaTaskId: mega.id, checkpointId: cp.id });
    const resumed = await view(); assert.equal(resumed.subTasks[0].attemptIds.length, 2); assert.equal(resumed.subTasks[1].attemptIds.length, 0);
    const snap = await request('/api/orchestrator?readOnly=1'), part = snap.projects.find(p => p.id === project.project.id).dispatch.find(p => p.subTaskId === resumed.subTasks[0].id);
    assert.ok(runner.isProcessAlive(part.pid)); record('explicit-failed-checkpoint-resume', { checkpointId: cp.id, subTaskId: resumed.subTasks[0].id, freshAttemptId: part.attemptId, pid: part.pid });
    await request('/api/orchestrator/stop', { projectId: project.project.id, megaTaskId: mega.id }); assert.equal(runner.isProcessAlive(part.pid), false);
    const stopped = await view(), stopCP = stopped.checkpoints.at(-1); assert.equal(stopped.megaTasks[0].status, 'PAUSED'); record('stop-real-provider-process', { pid: part.pid, checkpointId: stopCP.id, summary: stopCP.summary });
    await quit(); await start(); const reopened = await view(); assert.equal(reopened.megaTasks[0].status, 'PAUSED'); assert.equal(reopened.subTasks[0].attemptIds.length, 2);
    const question = `Using only the durable briefing, explain checkpoint ${stopCP.id}, its completed and pending work. Do not use tools or dispatch anything. Quote the checkpoint ID.`;
    for (const modelId of ['gpt-6-sol', 'gpt-6.1-sol']) {
      await request('/api/orchestrator/lead', { id: modelId });
      const reply = await request('/api/orchestrator/ask', { projectId: project.project.id, chatSessionId: 'checkpoint-' + modelId.replaceAll('.', '-'), question });
      const trace = fs.readFileSync(path.join(dir, 'backend.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
      const input = trace.filter(e => e.event === 'lead-input').at(-1);
      assert.equal(input.model.id, modelId); assert.ok(input.state.executionHandoff.checkpoints.some(c => c.id === stopCP.id)); assert.equal(input.state.executionHandoff.subTasks.length, 2);
      record('real-lead-handoff', { provider: 'codex', modelId, checkpointId: stopCP.id, exactCheckpointDelivered: true, answer: reply.answer, understandingVerified: !/CLI failed|failed:|no answer|returned no answer/.test(reply.answer) && reply.answer.includes(stopCP.id) });
    }
    record('PASS_FAILURE_RECOVERY_ONLY', { successfulTaskExecution: false, secondSubTaskStarted: false, limitation: 'Provider connectivity prevented successful inference. Recovery and targeting are observed; model checkpoint understanding remains unverified.' });
  } finally {
    if (backend && runner.isProcessAlive(backend.pid)) { await request('/api/orchestrator/ask/cancel', {}); await quit(); }
    assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(profile).startsWith('pw-live-recovery-')); fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
