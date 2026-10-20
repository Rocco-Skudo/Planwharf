'use strict';
// Opt-in actual provider execution against a disposable notebook. No fixture substitution.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const stage = process.argv[2], out = path.resolve(process.argv[3] || '');
if (!process.argv[3]) throw Error('Usage: node scripts/audit/smart-routing-real.cjs STAGE DISPOSABLE_DIRECTORY');
const { url } = JSON.parse(fs.readFileSync(path.join(out, 'server.json'))), id = 'audit-harborqueue', folder = path.join(out, 'Planwharf-Dummy-HarborQueue');
const journal = (name, data) => { const value = { at: new Date().toISOString(), name, ...data }; fs.appendFileSync(path.join(out, 'routing-events.jsonl'), JSON.stringify(value) + '\n'); console.log(JSON.stringify(value)); };
async function api(route, input) {
  const r = await fetch(url + route, input === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const body = await r.json(); fs.appendFileSync(path.join(out, 'routing-http-private.jsonl'), JSON.stringify({ route, status: r.status, input, body }) + '\n');
  if (!r.ok) throw Error(`${route}: ${r.status} ${body.error}`); return body;
}
const snapshot = () => api('/api/orchestrator');
function sourceDigest() {
  const hash = require('node:crypto').createHash('sha256');
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { if (entry.name === '.git' || entry.name === '.agents' || entry.name === '.planwharf') continue; const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(md|html|cjs|js)$/.test(file)) { hash.update(path.relative(folder, file)); hash.update(fs.readFileSync(file)); } } }
  walk(folder); return hash.digest('hex');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(projectId = id) {
  for (const end = Date.now() + 900000; Date.now() < end;) {
    const s = await snapshot(), row = s.projects.find(p => p.id === projectId);
    if (['complete', 'failed', 'checkpointed'].includes(row.status)) {
      const execution = await api('/api/execution?projectId=' + projectId);
      journal(stage, { projectId, status: row.status, next: row.next, subTasks: execution.subTasks.filter(t => t.megaTaskId === row.megaTaskId).map(t => ({ title: t.title, status: t.status, model: t.assignedModelId, routing: t.routing })), results: execution.results.filter(r => r.megaTaskId === row.megaTaskId).map(r => ({ status: r.status, summary: r.summary, tests: r.tests, provider: r.provider, cli: r.cli })) });
      assert.equal(row.status, 'complete'); return row;
    }
    await sleep(1500);
  }
  throw Error('Worker timed out; inspect and stop its owned process explicitly.');
}
const rules = 'Work only in the linked project. No dependencies, external services, publishing, or subagents. Use Node built-ins. Execute actual tests and report truthful structured results.';
const requirements = `Implement HarborQueue, a local job scheduler and recovery simulator. Keep the existing dashboard if possible. Create scheduler.cjs, server.cjs, scheduler.test.cjs and README.md. No AI in this project. ${rules}
Public interface: export { HarborQueue } from scheduler.cjs. new HarborQueue({ file, run, concurrency:3, maxRetries:1, fault }) where run(job, context) returns a Promise, context.signal aborts cancellation. Methods add({id,dependsOn:[],payload}), start(), cancel(id), snapshot(), idle() and async close(). You may extend this documented interface. Use deterministic injected run functions and no real sleeps in core tests. Dashboard server serves index.html and GET /api/state; start with node server.cjs PORT.
Support DAG dependencies and queued, ready, running, completed, failed, cancelled states; three execution slots; bounded retries; durable state; execution history with unique per-execution attempt IDs. Validate missing dependencies and reject cycles, including malformed durable input. A failed prerequisite must never release descendants. Cancelled work never restarts. Never run one job in two slots. Maximum three active jobs. Reject duplicate IDs and invalid operations without reporting success.
Crash/restart: explicitly define at-least-once semantics and require exclusive ownership for a state file (fail closed if another live scheduler owns it). Old running attempts become interrupted records on restart and are only retried when prior ownership is proved dead. Do not claim exactly-once external side effects. Every terminal result must be tied to its specific attempt. Cancel signals must not free the physical slot before the old run has settled. Protect stale completions from resurrecting cancellation or newer attempts. No unsafe eval/shell job execution.
Persistence: write a temporary checkpoint, fsync it, rename atomically; preserve the previous durable checkpoint on interrupted writes. Roll back in-memory mutations or explicitly fail closed on persistence failure. Provide fault injection at before-rename and deterministic tests verifying previous durable state remains valid and operations fail honestly. Ensure first durable initialization and restart lock release work on Windows. Tests must exercise all ten invariants above, retries, stale callbacks, cancellations, invalid graph, crash recovery and exclusive ownership. Use child processes only for deterministic crash/ownership tests if necessary. Document filesystem/durability limits honestly. Run node --test scheduler.test.cjs and fix failures.`;
(async () => {
  assert.equal(path.resolve((await api('/api/app')).planFile), path.join(out, 'notebook.json'));
  if (stage === 'init') {
    const s = await api('/api/orchestrator?readOnly=1');
    const standard = s.models.find(m => m.cli === 'gpt-5.6-luna' && m.adapter === 'codex' && m.available && !m.catalogExcluded);
    const premium = s.models.find(m => m.cli === 'gpt-5.6-sol' && m.adapter === 'codex' && m.available && !m.catalogExcluded);
    assert.ok(standard && premium, 'Both exact CLI models must be listed; do not substitute');
    for (const role of ['orchestrator', 'worker', 'reviewer', 'supervisor']) await api('/api/models/roles/bulk', { role, enabled: false });
    for (const m of [standard, premium]) await api('/api/models/roles', { id: m.id, roles: { orchestrator: m.id === premium.id, worker: true, reviewer: true, supervisor: false } });
    await api('/api/providers/policy', { id: premium.provider, policy: { alwaysApprove: false, minRemainingPercent: 20, warningRemainingPercent: 30, fallbackProviderId: null } });
    await api('/api/orchestrator/lead', { id: premium.id });
    await api('/api/models/routing-preference', { id: standard.id, preference: { tier: 'standard', automatic: false } });
    await api('/api/models/routing-preference', { id: premium.id, preference: { tier: 'premium', automatic: true } });
    await api('/api/models/routing', { mode: 'smart', maxPremiumPerMegaTask: 2, maxPremiumConcurrent: 1, fallback: 'block' });
    fs.mkdirSync(folder, { recursive: true });
    if (!fs.existsSync(path.join(folder, '.git'))) { fs.writeFileSync(path.join(folder, 'README.md'), '# Planwharf-Dummy-HarborQueue\nDisposable acceptance project.\n'); execFileSync('git', ['init', '-q', folder]); execFileSync('git', ['-C', folder, 'add', 'README.md']); execFileSync('git', ['-C', folder, '-c', 'user.name=Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '-qm', 'Blank HarborQueue project']); }
    if (!fs.existsSync(path.join(out, 'harborqueue-project.json'))) { const p = await api('/api/plan'); await api('/api/projects', { version: p.version, project: { name: 'Planwharf-Dummy-HarborQueue', direction: 'Disposable job scheduler lab', folder } });
      // Record the server-generated identity rather than assume the display-name slug.
      const next = await api('/api/plan'); const project = next.plan.projects.find(p => p.project.folder === folder); fs.writeFileSync(path.join(out, 'harborqueue-project.json'), JSON.stringify(project.project));
    }
    journal('configured', { standard: standard.cli, premium: premium.cli, premiumIsUserPreference: true }); return;
  }
  const project = JSON.parse(fs.readFileSync(path.join(out, 'harborqueue-project.json'))), projectId = project.id;
  if (stage === 'scaffold' || stage === 'core' || stage === 'review' || stage === 'verify-lock') {
    const title = stage === 'scaffold' ? 'Create basic dashboard markup and run instructions' : stage === 'core' ? 'Implement concurrent scheduler with crash-consistent recovery invariants' : stage === 'verify-lock' ? 'Verify stale-lock concurrency and crash recovery invariants' : 'Independently verify concurrent recovery and duplicate-execution invariants';
    const detail = stage === 'scaffold' ? `${rules} Create index.html with an accessible lightweight HarborQueue dashboard. Fetch GET /api/state on Refresh, show job IDs, statuses and history. Clearly report failed HTTP requests. Include README.md with placeholder run instructions for a future server.cjs. Do not implement a scheduler in this task. Validate browser JavaScript syntax.` : stage === 'core' ? requirements : stage === 'verify-lock' ? `${rules} Independently verify the correction to the previously reproduced stale-lock ownership race. Inspect acquisition/reclamation and guard cleanup. Run node --test scheduler.test.cjs test/dashboard.test.cjs, including the deterministic child-process stale-read barrier regression. Confirm exactly one owner/job execution while a replacement owner remains alive; a slow contender must not remove the replacement lock. Confirm ordinary steady-state owner death still permits recovery, and interrupted guard acquisition fails closed with documented manual intervention. Do not modify source. Report FAILED if these scoped requirements fail, otherwise COMPLETE with observed evidence. This is a focused correction verification, not a new unrelated feature audit.` : `${rules} Independently inspect all HarborQueue source and run node --test scheduler.test.cjs. Validate the ten invariants in README plus cancellation, atomic checkpoint durability, recovery, exclusive ownership, three slots, graph errors and per-attempt history. Add no source edits. Report FAILED with actionable precise findings if correctness is not demonstrated; COMPLETE only if actual evidence passes. Do not assume passing existing tests prove the critical invariants. Record findings in the final structured result.`;
    const before = ['review', 'verify-lock'].includes(stage) ? sourceDigest() : null;
    const p = await api('/api/orchestrator/propose', { projectId, title, goal: detail.slice(0, 1500), subTasks: [{ title, detail, type: ['review', 'verify-lock'].includes(stage) ? 'AUDIT' : 'IMPLEMENTATION', dependsOn: [] }] });
    const row = p.snapshot.projects.find(p => p.id === projectId), e = await api('/api/execution?projectId=' + projectId), sub = e.subTasks.at(-1);
    journal('observed-assignment', { stage, title, routing: sub.routing, model: sub.assignedModelId });
    assert.equal(e.megaTasks.at(-1).approvedAt, null); assert.equal(sub.attemptIds.length, 0);
    // Observe actual routing, never demand a preferred model from the planner.
    await api('/api/orchestrator/approve', { projectId, megaTaskId: row.megaTaskId });
    try { await wait(projectId); } finally { if (before) { assert.equal(sourceDigest(), before, 'Independent review must not edit project source'); journal('review-source-unchanged', { sha256: before }); } }
  } else if (stage === 'correct' || stage === 'correct-lock') {
    await api('/api/orchestrator/grill', { propose: false });
    const question = stage === 'correct-lock' ? 'Fix HarborQueue exclusive ownership during crash recovery. Independent review reproduced a stale-lock reclamation race: two processes read the same dead-owner lock; the fast process unlinks it and acquires a new live lock; the slow process unlinks that live replacement based on its stale read, acquires ownership too and starts the same cargo job. Prevent simultaneous owners and untracked duplicate execution. Serialize acquisition and stale-owner reclamation across processes; never delete a live replacement or rely on a time-only lease. Fail closed if ownership cannot be proved, document any recovery-intervention requirement honestly, preserve ordinary restart recovery after a steady-state owner dies. Add a deterministic child-process regression with barriers forcing two stale-read contenders and verify one winner, one rejected contender and no overlapping execution. Preserve all 21 existing tests, cancellation and payload/history semantics. Run the full tests and report actual evidence. ' + rules : 'Fix HarborQueue scheduler correctness: reject lossy JSON payload members including nested functions, undefined, symbols, nonfinite numbers and cycles instead of silently discarding them. Strengthen persistent checkpoint validation so per-job attempt numbers are unique and sequential, running attempts belong only to running jobs with matching currentAttemptId, and terminal jobs match their latest terminal attempt. Preserve cancelled in-flight semantics and honest recovery behavior. Add adversarial regression tests for each independent review finding and run all tests. Keep concurrent crash recovery invariants correct. ' + rules;
    await api('/api/orchestrator/ask', { projectId, question });
    const row = (await snapshot()).projects.find(p => p.id === projectId); assert.equal(row.status, 'needs_approval');
    await api('/api/orchestrator/approve', { projectId, megaTaskId: row.megaTaskId }); await wait(projectId);
  } else if (stage === 'resume') {
    const row = (await snapshot()).projects.find(p => p.id === projectId);
    await api('/api/orchestrator/resume', { projectId, megaTaskId: row.megaTaskId, checkpointId: row.checkpoint.id, confirmChanges: true }); await wait(projectId);
  } else if (stage === 'concurrency') {
    const projects = [];
    for (let index = 1; index <= 3; index++) {
      const folder = path.join(out, 'audit-smart-' + index); fs.mkdirSync(folder, { recursive: true });
      const p = await api('/api/plan');
      await api('/api/projects', { version: p.version, project: { name: 'audit-smart-' + index, direction: 'Disposable real-model project isolation', folder } });
      const saved = (await api('/api/plan')).plan.projects.find(p => p.project.folder === folder).project;
      projects.push(saved); fs.writeFileSync(path.join(out, 'routing-concurrent-projects.json'), JSON.stringify(projects));
      const detail = `${rules} Write ${saved.id} followed by your exact model name to real-receipt.txt. Then run a local Node command that polls for a file named release every second for up to 240 seconds. Keep the command running until release exists. Do not create release yourself. This tests explicit Stop and Resume. Once released, read the original receipt and finish without changing its project ID.`;
      const proposed = await api('/api/orchestrator/propose', { projectId: saved.id, title: 'Write isolated project receipt and wait', goal: 'Simple local file receipt', subTasks: [{ title: 'Write isolated project receipt', detail }] });
      const row = proposed.snapshot.projects.find(p => p.id === saved.id);
      await api('/api/orchestrator/approve', { projectId: saved.id, megaTaskId: row.megaTaskId });
      let ready = false;
      for (const end = Date.now() + 120000; Date.now() < end;) {
        const current = (await snapshot()).projects.find(p => p.id === saved.id);
        if (['failed', 'checkpointed'].includes(current.status)) throw Error('Real admission failed: ' + current.next);
        if (fs.existsSync(path.join(folder, 'real-receipt.txt'))) { ready = true; break; }
        await sleep(1500);
      }
      assert.ok(ready, 'Actual provider receipt not created');
      journal('concurrent-ready', { projectId: saved.id, count: projects.length });
    }
    const s = await snapshot();
    for (const p of projects) { const row = s.projects.find(r => r.id === p.id); assert.ok(row.dispatch.some(d => d.alive && d.cli === 'gpt-5.6-luna')); assert.match(fs.readFileSync(path.join(p.folder, 'real-receipt.txt'), 'utf8'), new RegExp(p.id)); }
    journal('three-real-projects', { status: 'PASS', models: ['gpt-5.6-luna'], count: 3 });
  } else if (stage === 'stop-concurrency') {
    const projects = JSON.parse(fs.readFileSync(path.join(out, 'routing-concurrent-projects.json'))), pids = [];
    for (const p of projects) { const row = (await snapshot()).projects.find(r => r.id === p.id); pids.push(...row.dispatch.filter(d => d.alive).map(d => d.pid)); if (row.dispatch.some(d => d.alive)) await api('/api/orchestrator/stop', { projectId: p.id, megaTaskId: row.megaTaskId }); }
    for (let i = 0; i < 30 && pids.some(pid => require('../../engine/runner.cjs').isProcessAlive(pid)); i++) await sleep(100);
    assert.ok(pids.every(pid => !require('../../engine/runner.cjs').isProcessAlive(pid)));
    journal('concurrent-stopped', { ownedPidsDead: true, count: pids.length });
  } else if (stage === 'resume-concurrency') {
    const p = JSON.parse(fs.readFileSync(path.join(out, 'routing-concurrent-projects.json')))[0], row = (await snapshot()).projects.find(r => r.id === p.id);
    fs.writeFileSync(path.join(p.folder, 'release'), 'Explicit restart and checkpoint resume.');
    await api('/api/orchestrator/resume', { projectId: p.id, megaTaskId: row.megaTaskId, checkpointId: row.checkpoint.id, confirmChanges: true });
    const done = await wait(p.id); assert.equal(done.dispatch.at(-1).cli, 'gpt-5.6-luna');
    journal('real-restart-resume', { model: 'gpt-5.6-luna', status: 'PASS' });
  } else if (stage === 'shutdown') {
    const s = await api('/api/orchestrator?readOnly=1'); assert.ok(s.projects.every(p => p.dispatch.every(d => !d.alive)), 'Stop owned workers before quitting'); await api('/api/app/quit', {});
  }
  else throw Error('Unknown stage');
})().catch(error => { journal('failure', { stage, error: error.message }); process.exitCode = 1; });
