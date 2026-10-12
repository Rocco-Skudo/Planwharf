'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { jobFingerprint } = require('../engine/orchestrator.js');
const Plan = require('../plan.js');

function reconcile(plan, state, attempts, readResult) {
  const projects = plan.schema === 2 ? plan.projects : [plan];
  const completed = [];
  const nextPlan = structuredClone(plan), nextState = structuredClone(state), nextAttempts = structuredClone(attempts);
  for (const item of nextPlan.schema === 2 ? nextPlan.projects : [nextPlan]) {
    const row = nextState.projects?.[item.project.id];
    if (!row) continue;
    const task = item.tasks.find(task => task.id === row.jobId && ['running', 'complete'].includes(task.status));
    const files = (row.dispatch || []).map(part => part?.resultPath).filter(Boolean);
    if (!files.length && row.resultPath) files.push(row.resultPath);
    if (!task || row.jobFingerprint !== jobFingerprint(task) || !files.length
      || (row.dispatch || []).some(part => part?.stoppedByUser)
      || !files.every(file => /^STATUS:\s*COMPLETE\s*$/mi.test(readResult(file)) && /^EXIT:\s*0\s*$/m.test(readResult(file)))) continue;
    task.status = 'complete';
    task.attemptId = row.attemptId;
    row.status = 'complete';
    row.workerAlive = false;
    row.monitoring = { ...row.monitoring, alive: 0 };
    for (const part of row.dispatch || []) if (part) part.alive = false;
    row.waitingFor = 'Nothing. Evidence is complete.';
    row.next = 'Read the result, or add a new job.';
    const attempt = nextAttempts.attempts.find(attempt => attempt.id === row.attemptId && attempt.projectId === item.project.id && attempt.taskId === task.id);
    if (attempt?.status === 'active') { attempt.status = 'closed'; attempt.closedReason = 'complete'; }
    completed.push({ projectId: item.project.id, taskId: task.id, attemptId: row.attemptId });
  }
  const ids = new Set(projects.map(item => item.project.id));
  const archived = [];
  for (const [id, row] of Object.entries(nextState.projects || {})) {
    if (ids.has(id)) continue;
    nextState.archivedProjects ||= {};
    nextState.archivedProjects[id] = row;
    delete nextState.projects[id];
    archived.push(id);
  }
  if (!Plan.validate(nextPlan)) throw new Error('Reconciled notebook failed validation.');
  return { plan: nextPlan, state: nextState, attempts: nextAttempts, completed, archived };
}

function main(argv) {
  const planArg = argv.indexOf('--plan'), attemptsArg = argv.indexOf('--attempts-dir');
  if (planArg < 0 || attemptsArg < 0) throw new Error('Usage: node validation/reconcile-attempts.cjs --plan FILE --attempts-dir DIRECTORY [--apply]');
  const planFile = path.resolve(argv[planArg + 1]), dir = path.resolve(argv[attemptsArg + 1]);
  const apply = argv.includes('--apply');
  const ownerFile = path.join(dir, 'app-instance.json');
  if (apply && fs.existsSync(ownerFile)) {
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    if (Number.isInteger(owner.pid)) {
      try { process.kill(owner.pid, 0); throw new Error('The notebook backend may be running. Quit the application before applying reconciliation.'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
  const stateFile = path.join(dir, 'orchestrator.json'), attemptsFile = path.join(dir, 'attempts.json');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = reconcile(read(planFile), read(stateFile), read(attemptsFile), file => {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(dir + path.sep)) return '';
    try { return fs.readFileSync(resolved, 'utf8'); } catch (_) { return ''; }
  });
  if (apply) {
    const backup = fs.mkdtempSync(path.join(dir, 'maintenance-backup-'));
    const writes = [[planFile, result.plan], [stateFile, result.state], [attemptsFile, result.attempts]];
    for (const [file] of writes) fs.copyFileSync(file, path.join(backup, path.basename(file)), fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), files: writes.map(([file]) => file) }, null, 2));
    for (const [file, value] of writes) {
      const temporary = file + '.maintenance-' + process.pid + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
      fs.renameSync(temporary, file);
    }
    console.log('Backup:', backup);
  }
  console.log(JSON.stringify({ applied: apply, completed: result.completed, archived: result.archived }, null, 2));
}

if (require.main === module) { try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { reconcile };
