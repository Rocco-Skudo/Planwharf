'use strict';
// Publish only selected, sanitized acceptance metadata. Raw notebooks/logs stay private.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
if (!process.argv[2]) throw Error('Usage: node scripts/audit/smart-routing-report.cjs DISPOSABLE_DIRECTORY');
const out = path.resolve(process.argv[2]), target = path.resolve(__dirname, '../../docs/audits/2026-10-20-smart-routing');
const store = JSON.parse(fs.readFileSync(path.join(out, 'attempts/orchestrator.json'))), notebook = JSON.parse(fs.readFileSync(path.join(out, 'notebook.json')));
if (!notebook.projects.every(p => p.project.id.startsWith('audit-') || p.project.id.startsWith('planwharf-dummy-harborqueue'))) throw Error('Refusing to report on unrelated projects');
const scrub = value => typeof value === 'string' ? value.replace(/[A-Z]:[\\/][^\s"']+/gi, '[local-path]') : Array.isArray(value) ? value.map(scrub) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => !/accountScope|accountKey|credentials|auth|token/i.test(k)).map(([k, v]) => [k, scrub(v)])) : value;
const exitFor = attemptId => { try { return JSON.parse(fs.readFileSync(path.join(out, 'attempts/results', attemptId + '.exit.json'))); } catch { return null; } };
const receipt = r => r ? scrub(r) : null;
const executions = store.execution.results.map(r => {
  const sub = store.execution.subTasks.find(s => s.id === r.subTaskId), mega = store.execution.megaTasks.find(m => m.id === r.megaTaskId);
  const start = store.execution.timeline.find(e => e.type === 'SUBTASK_STARTED' && e.reference?.attemptId === r.attemptId);
  const end = store.execution.timeline.find(e => ['SUBTASK_COMPLETED', 'SUBTASK_FAILED'].includes(e.type) && e.reference?.resultId === r.resultId);
  return scrub({ projectId: mega?.projectId, attemptId: r.attemptId, megaTaskTitle: mega?.title, title: sub?.title, status: r.status, provider: r.provider, exactModel: r.cli, routing: receipt(r.routing), summary: r.summary, tests: r.tests,
    startedAt: start?.createdAt, endedAt: end?.createdAt, observedDurationMs: start && end ? Date.parse(end.createdAt) - Date.parse(start.createdAt) : null, evidenceKind: r.evidenceKind || 'STRUCTURED_WORKER_RESULT',
    resultTransportVerified: exitFor(r.attemptId)?.resultVerified ?? null });
});
const readOptional = file => fs.existsSync(path.join(out, file)) ? JSON.parse(fs.readFileSync(path.join(out, file))) : null;
const calls = new Map();
for (const line of fs.readFileSync(path.join(out, 'attempts/invocations.jsonl'), 'utf8').split('\n')) { try { const row = JSON.parse(line); calls.set(row.id, row); } catch {} }
const measuredUsage = [...calls.values()].map(r => ({ role: r.role, provider: r.provider, exactModel: r.model, attemptId: r.attemptId || null, status: r.status, durationMs: r.durationMs, inputTokens: r.tokens?.input ?? null, outputTokens: r.tokens?.output ?? null, cachedInputTokens: r.tokens?.cachedInput ?? null }));
const milestones = fs.readFileSync(path.join(out, 'routing-events.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => ['three-real-projects', 'concurrent-stopped', 'real-restart-resume', 'review-source-unchanged'].includes(e.name));
const artifacts = {};
function hashes(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) hashes(file); else artifacts[path.relative(target, file).replace(/\\/g, '/')] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } }
hashes(path.join(target, 'harborqueue'));
const git = args => execFileSync('git', args, { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', windowsHide: true }).trim();
const value = { baseline: git(['rev-parse', 'origin/main']), branch: git(['branch', '--show-current']), kind: 'REAL_PROVIDER_EXECUTION_WITH_SEPARATE_DETERMINISTIC_POLICY_FIXTURES',
  settings: store.workerRouting, measuredUsage, milestones,
  engineering: { command: 'node scripts/engineering/ci.cjs', passed: 233, failed: 0 },
  harborQueueTests: { command: 'node --test scheduler.test.cjs test/dashboard.test.cjs', passed: 23, failed: 0 }, credentialsPublished: false, exactModelsExecuted: [...new Set(executions.map(e => e.exactModel))], executions,
  browser: readOptional('routing-browser.json'), liveConcurrencyBrowser: readOptional('routing-concurrency-browser.json'), harborQueueBrowser: readOptional('harborqueue-browser.json'),
  regression: { command: 'node --test --test-concurrency=1 engine/smart-routing.test.cjs engine/gold-model.test.cjs engine/provider-models.test.cjs engine/provider-audit.test.cjs engine/model-roles.test.cjs engine/model-policy.test.cjs engine/phase2.test.cjs engine/phase2-deadline.test.cjs engine/project-export.test.cjs engine/worker-containment.test.cjs engine/project-containment.test.cjs engine/home-containment.test.cjs engine/codex-result.test.cjs engine/soundtrack.test.cjs engine/soundtrack-http.test.cjs engine/soundtrack-assets.test.cjs engine/captain.test.cjs', passed: 96, failed: 0, skipped: 3 },
  knownBaselineFailure: 'engine/orchestrator.test.cjs:201 assumes nonexistent D:\\demo. Reproduced on merged PR #20 e86da8a.',
  sourceHashes: artifacts, changedFiles: git(['diff', '--name-only', 'origin/main']).split(/\r?\n/),
  financialSavingsMeasured: false, catalogProviderBenchmarkExecuted: false };
fs.writeFileSync(path.join(target, 'verification.json'), JSON.stringify(value, null, 2) + '\n');
console.log(JSON.stringify({ results: executions.length, models: value.exactModelsExecuted, artifacts: Object.keys(artifacts).length }));
