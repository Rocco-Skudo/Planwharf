'use strict';
// This harness only dispatches work. Calculator source must be written by CLI workers.
const fs = require('node:fs');
const path = require('node:path');
const { createOrchestrator } = require('../engine/orchestrator.js');
const { createAttemptEngine } = require('../engine/attempts.js');
const { createSentinel } = require('../engine/sentinel.js');
const runner = require('../engine/runner.cjs');
const Plan = require('../plan.js');
const dir = path.join(__dirname, 'calculator-run');
const reviewing = process.argv.includes('--review');
const attemptsDir = path.join(dir, reviewing ? 'review-attempts' : 'attempts');
const file = path.join(dir, reviewing ? 'review-notebook.json' : 'notebook.json');
const folder = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).project.folder : path.join(dir, 'app');
fs.mkdirSync(folder, { recursive: true });
const detail = reviewing ? `Review the existing worker-generated calculator in this folder. Keep the existing features. Fix the long division-by-zero message so it is fully readable in the GUI (font adaptation or a separate status label); independent native keyboard tests pass but current font can clip errors. README advertises keyboard C to clear, but current code only handles Escape: implement C/c as clear and verify it. Improve Windows accessibility for the display: UIAutomation did not expose Name=Display despite AccessibleName. Record review decisions, build output and extra test results in review-evidence.json and run self tests. Compile Calculator.exe using build.ps1. Do not touch any parent/sibling file. You are the sole review worker for the whole job.` : `Create a complete Windows desktop calculator using C# WinForms and .NET Framework 4, compiled with C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe. Deliver Calculator.exe runnable by double click, source, build.ps1, README in Italian and automated tests. No npm, no browser dependency. Implement + - * /, decimals, unary negative numbers, division by zero with a clear Italian error, clear/backspace and keyboard (digits, operators, decimal dot and comma, Enter, Escape). Make the display accessible with AutomationId or a stable name. Provide Calculator.exe --self-test that runs the real calculation engine and exits nonzero on failures; write self-test-results.json with individual cases. Include exact decimal 0.1+0.2=0.3, -5*-2=10, 10/0 error, precedence or clearly documented immediate evaluation. Verify build and tests yourself. All files and logs stay in this project folder. Do not touch any parent or sibling files. You are the sole implementation worker for the whole job.`;
if (!fs.existsSync(file)) {
  let notebook = { schema: 1, project: { id: 'calculator-validation', name: 'Calcolatrice di verifica', folder }, revisions: [{ id: 1, mode: 'manual', title: 'Specifica', createdAt: new Date().toISOString(), direction: 'Build a Windows graphical calculator', state: 'Isolated real orchestrator test', closed: ['C# WinForms, standalone exe, keyboard, decimal arithmetic'], open: [] }], tasks: [] };
  notebook = Plan.createTask(notebook, { title: 'Build Windows graphical calculator and executable', detail, revision_id: 1 });
  if (!Plan.validate(notebook)) throw new Error('Invalid isolated notebook');
  fs.writeFileSync(file, JSON.stringify(notebook, null, 2));
}
const attempts = createAttemptEngine({ dir: attemptsDir });
const models = require('../models.json').filter(m => m.id === 'gemini').map(m => ({ ...m, enabled: true, kind: 'default' }));
let orchestra;
const events = path.join(dir, 'chain.jsonl');
function record(event, data) { fs.appendFileSync(events, JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n'); }
orchestra = createOrchestrator({ dir: attemptsDir, readPlan: async () => JSON.parse(fs.readFileSync(file)), models, attempts,
  sentinel: createSentinel(attempts, { isAlive: attempt => runner.isProcessAlive(orchestra.pidFor(attempt)) }),
  spawnWorker: info => { const launched = runner.spawnWorker(info); record('orchestrator-dispatch', { ...info, launched }); return launched; },
  isProcessAlive: runner.isProcessAlive, killWorker: runner.killWorker, askModel: runner.askOrchestrator,
  stallMs: 10 * 60 * 1000 });
(async () => {
  await orchestra.setOrchestrator('gemini');
  if (process.argv.includes('--resume')) { record('resume', await orchestra.resume('calculator-validation')); }
  else {
    const lead = await orchestra.ask('What is your coordination role here?', 'calculator-validation');
    fs.writeFileSync(path.join(dir, reviewing ? 'review-lead.json' : 'lead.json'), JSON.stringify(lead, null, 2));
    record('approval', await orchestra.approve('calculator-validation'));
  }
  let prior = '';
  for (let n = 0; n < 450; n++) {
    const snapshot = await orchestra.tick();
    fs.writeFileSync(path.join(dir, reviewing ? 'review-latest.json' : 'latest.json'), JSON.stringify(snapshot, null, 2));
    const row = snapshot.projects[0];
    const status = row.status + ':' + row.workerActivity;
    if (status !== prior) { console.log(row.status, row.workerActivity || row.doing); record('monitor', { project: row }); prior = status; }
    if (['complete', 'checkpointed', 'blocked_no_worker'].includes(row.status)) { record('finished', { status: row.status }); process.exitCode = row.status === 'complete' ? 0 : 1; return; }
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
  record('harness-timeout', await orchestra.stop('calculator-validation'));
  process.exitCode = 1;
})().catch(error => { record('error', { message: error.stack }); console.error(error); process.exitCode = 1; });

