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
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(projectId = id) {
  for (const end = Date.now() + 900000; Date.now() < end;) {
    const s = await snapshot(), row = s.projects.find(p => p.id === projectId);
    if (['complete', 'failed', 'checkpointed'].includes(row.status)) {
      const execution = await api('/api/execution?projectId=' + projectId);
      journal(stage, { projectId, status: row.status, next: row.next, subTasks: execution.subTasks.map(t => ({ title: t.title, status: t.status, model: t.assignedModelId, routing: t.routing })), results: execution.results.map(r => ({ status: r.status, summary: r.summary, tests: r.tests, provider: r.provider, cli: r.cli })) });
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
  if (stage === 'scaffold' || stage === 'core' || stage === 'review') {
    const title = stage === 'scaffold' ? 'Create basic dashboard markup and run instructions' : stage === 'core' ? 'Implement concurrent scheduler with crash-consistent recovery invariants' : 'Independently verify concurrent recovery and duplicate-execution invariants';
    const detail = stage === 'scaffold' ? `${rules} Create index.html with an accessible lightweight HarborQueue dashboard. Fetch GET /api/state on Refresh, show job IDs, statuses and history. Clearly report failed HTTP requests. Include README.md with placeholder run instructions for a future server.cjs. Do not implement a scheduler in this task. Validate browser JavaScript syntax.` : stage === 'core' ? requirements : `${rules} Independently inspect all HarborQueue source and run node --test scheduler.test.cjs. Validate the ten invariants in README plus cancellation, atomic checkpoint durability, recovery, exclusive ownership, three slots, graph errors and per-attempt history. Add no source edits. Report FAILED with actionable precise findings if correctness is not demonstrated; COMPLETE only if actual evidence passes. Do not assume passing existing tests prove the critical invariants. Record findings in the final structured result.`;
    const before = (await snapshot()).execution?.subTasks?.length || 0;
    const p = await api('/api/orchestrator/propose', { projectId, title, goal: detail.slice(0, 1500), subTasks: [{ title, detail, type: stage === 'review' ? 'AUDIT' : 'IMPLEMENTATION', dependsOn: [] }] });
    const row = p.snapshot.projects.find(p => p.id === projectId), e = await api('/api/execution?projectId=' + projectId), sub = e.subTasks.at(-1);
    journal('observed-assignment', { stage, title, routing: sub.routing, model: sub.assignedModelId });
    assert.equal(e.megaTasks.at(-1).approvedAt, null); assert.equal(sub.attemptIds.length, 0);
    // Observe actual routing, never demand a preferred model from the planner.
    await api('/api/orchestrator/approve', { projectId, megaTaskId: row.megaTaskId }); await wait(projectId);
  } else if (stage === 'resume') {
    const row = (await snapshot()).projects.find(p => p.id === projectId);
    await api('/api/orchestrator/resume', { projectId, megaTaskId: row.megaTaskId, checkpointId: row.checkpoint.id, confirmChanges: true }); await wait(projectId);
  } else if (stage === 'shutdown') await api('/api/app/quit', {});
  else throw Error('Unknown stage');
})().catch(error => { journal('failure', { stage, error: error.message }); process.exitCode = 1; });
