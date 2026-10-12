'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { activityMessages, workerReport } = require('./activity.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function git(folder, args) {
  return new Promise(resolve => execFile('git', ['--no-optional-locks', '-C', folder, ...args], { windowsHide: true, timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : args.includes('-z') ? stdout : stdout.trim())));
}
async function localGit(folder, { planFile } = {}) {
  if (!folder) return { readable: false, reason: 'No local folder linked.' };
  const root = await git(folder, ['rev-parse', '--show-toplevel']);
  if (!root) return { readable: false, reason: 'Local Git history unavailable.' };
  const relative = planFile ? path.relative(root, path.resolve(planFile)).replace(/\\/g, '/') : null;
  const scope = path.relative(root, path.resolve(folder)).replace(/\\/g, '/') || '.';
  // Visit-marker persistence must not manufacture a local source change.
  // Notebook revisions and jobs are compared separately from source files.
  const files = ['--', scope];
  if (relative && !relative.startsWith('../') && !path.isAbsolute(relative)) files.push(`:(exclude,literal)${relative}`);
  const [head, status, diff] = await Promise.all([git(root, ['rev-parse', '--verify', 'HEAD']), git(root, ['status', '--porcelain=v1', '-uall', ...files]), git(root, ['diff', '--no-ext-diff', '--no-textconv', 'HEAD', ...(files.length ? files : ['--'])])]);
  // Include untracked contents so edits to an already-dirty file are visible.
  const untracked = await git(root, ['ls-files', '--others', '--exclude-standard', '-z', ...files]);
  let fingerprint = null;
  if (status !== null && diff !== null && untracked !== null) {
    try {
      const contents = [];
      let bytes = 0;
      if (untracked.split('\0').length > 2000) throw new Error('Too many files for reliable comparison');
      for (const name of untracked.split('\0').filter(Boolean)) {
        const file = path.resolve(root, name);
        if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('Outside repository');
        const stat = await fs.lstat(file);
        bytes += stat.size;
        if (bytes > 8 * 1024 * 1024) throw new Error('Files too large for reliable comparison');
        contents.push([name, hash(stat.isSymbolicLink() ? await fs.readlink(file) : await fs.readFile(file))]);
      }
      fingerprint = hash(JSON.stringify([status, diff, contents]));
    } catch { /* Unknown is preferable to a fabricated comparison. */ }
  }
  const paths = await git(root, ['status', '--porcelain=v1', '-z', '-uall', ...files]);
  const changed = [];
  const records = (paths || '').split('\0');
  let detailBytes = 0;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record) continue;
    const statusCode = record.slice(0, 2), name = record.slice(3);
    const from = /R|C/.test(statusCode) ? records[++index] : null;
    let fileFingerprint = null;
    try {
      const target = path.resolve(root, name);
      if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Outside repository');
      const stat = await fs.lstat(target);
      detailBytes += stat.size;
      if (detailBytes <= 8 * 1024 * 1024) fileFingerprint = hash(stat.isSymbolicLink() ? await fs.readlink(target) : await fs.readFile(target));
    } catch { if (/D/.test(statusCode)) fileFingerprint = 'deleted'; }
    changed.push({ path: name, from, status: statusCode.trim(), fingerprint: fileFingerprint });
  }
  return { readable: status !== null, root, scope, head, changedFiles: status === null ? null : status.split(/\r?\n/).filter(Boolean).length, fingerprint, files: changed };
}
async function recentActions(row) {
  const messages = [], reports = [];
  for (const part of row.dispatch || []) {
    if (!part.logPath) continue;
    try {
      const file = await fs.open(part.logPath, 'r');
      let text;
      try {
        const stat = await file.stat(), bytes = Math.min(stat.size, 1024 * 1024), buffer = Buffer.alloc(bytes);
        await file.read(buffer, 0, bytes, stat.size - bytes);
        text = buffer.toString('utf8');
      } finally { await file.close(); }
      for (const action of activityMessages(text).slice(-12)) messages.push({ worker: part.label || part.modelId, text: action });
      const report = workerReport(text);
      if (report) reports.push({ worker: part.label || part.modelId, text: report });
    } catch {}
  }
  if (!messages.length) for (const text of activityMessages(row.workerTail || '').slice(-12)) messages.push({ worker: row.workerLabel || 'Worker', text });
  return { actions: messages, reports };
}
async function execution(row, researches = []) {
  if (!row) return null;
  let result = null;
  if (row.resultPath) try {
    const stat = await fs.stat(row.resultPath);
    if (stat.isFile() && stat.size > 0 && stat.size <= 8 * 1024 * 1024) result = hash(Buffer.concat([Buffer.from(row.resultPath + '\0'), await fs.readFile(row.resultPath)]));
  } catch { /* An assigned output path is not evidence of an execution result. */ }
  return { status: row.status, jobId: row.jobId || null, jobTitle: row.jobTitle || '', activity: row.workerActivity || '', ...await recentActions(row), attemptId: row.attemptId || null, checkpoint: row.checkpoint ? hash(JSON.stringify(row.checkpoint)) : null, result,
    research: researches.map(r => ({ id: r.id, status: r.status, attemptId: r.attemptId || null, reportAvailable: Boolean(r.reportAvailable) })).sort((a, b) => a.id.localeCompare(b.id)) };
}
async function compare(previous, current) {
  if (!previous) return { firstVisit: true, changes: [], unavailable: [], details: [] };
  const changes = [], unavailable = [], details = [];
  const revisions = current.revisionIds.filter(id => !previous.revisionIds.includes(id)).length;
  if (revisions) changes.push(`${revisions} new Living Plan revision${revisions === 1 ? '' : 's'}`);
  const a = previous.git, b = current.git;
  if (a?.head && b?.head && a.root === b.root && a.scope === b.scope && a.head !== b.head) {
    const ancestor = await git(b.root, ['merge-base', '--is-ancestor', a.head, b.head]);
    const count = ancestor !== null ? await git(b.root, ['rev-list', '--count', `${a.head}..${b.head}`, '--', b.scope || '.']) : null;
    if (count && /^\d+$/.test(count)) {
      if (Number(count) > 0) {
        changes.push(`${count} commit${count === '1' ? '' : 's'} added`);
        const log = await git(b.root, ['log', '-100', '--format=%h%x09%s', `${a.head}..${b.head}`, '--', b.scope || '.']);
        for (const line of (log || '').split('\n').filter(Boolean)) { const split = line.indexOf('\t'); details.push(`Commit ${line.slice(0, split)}: ${line.slice(split + 1)}`); }
        if (Number(count) > 100) details.push('Showing the latest 100 commit subjects.');
      }
    }
    else unavailable.push('Git history changed; a reliable commit count is unavailable.');
  } else if (a?.head !== b?.head || a?.root !== b?.root || a?.scope !== b?.scope) unavailable.push('No comparable Git baseline.');
  if (a?.fingerprint && b?.fingerprint && a.root === b.root && a.scope === b.scope) {
    if (a.fingerprint !== b.fingerprint) changes.push(b.changedFiles ? `${b.changedFiles} file${b.changedFiles === 1 ? '' : 's'} changed locally` : 'Local changes cleared');
  } else if (a?.readable || b?.readable) unavailable.push('Local file comparison unavailable.');
  for (const file of b?.files || []) {
    const before = (a?.files || []).find(item => item.path === file.path);
    if (!before || before.status !== file.status || file.fingerprint && before.fingerprint !== file.fingerprint) {
      const verb = file.status === '??' || /A/.test(file.status) ? 'Added locally' : /D/.test(file.status) ? 'Deleted locally' : /R/.test(file.status) ? 'Renamed locally' : 'Edited locally';
      details.push(`${verb}: ${file.path}${file.from ? ` (from ${file.from})` : ''}`);
    }
  }
  const latest = current.revisions?.at(-1), beforeRevision = previous.revisions?.at(-1);
  if (latest && beforeRevision && latest.id !== beforeRevision.id) {
    details.push(`Living Plan R${latest.id}: ${latest.title}`);
    if (latest.state !== beforeRevision.state) details.push(`Recorded progress: ${latest.state}`);
    if (latest.direction !== beforeRevision.direction) details.push(`Updated goal: ${latest.direction}`);
    for (const decision of latest.closed || []) if (!(beforeRevision.closed || []).includes(decision)) details.push(`Decision recorded: ${decision}`);
  }
  const old = previous.execution, now = current.execution;
  if (now && old) {
    if (old.status !== now.status || old.jobId !== now.jobId || old.attemptId !== now.attemptId) changes.push(`Project work ${now.status === 'complete' ? 'completed' : 'changed'}`);
    if (now.checkpoint && old.checkpoint !== now.checkpoint) changes.push('New checkpoint saved');
    if (now.result && old.result !== now.result) changes.push(old.result ? 'Execution result updated' : 'New execution result available');
    const oldActions = new Set((old.actions || []).map(action => `${action.worker}: ${action.text}`));
    const newActions = (now.actions || []).filter(action => !oldActions.has(`${action.worker}: ${action.text}`));
    if (newActions.length) changes.push('New worker activity recorded');
    if (old.status !== now.status || old.jobId !== now.jobId || old.result !== now.result || newActions.length) {
      if (now.jobTitle) details.push(`Work item: ${now.jobTitle} (${now.status})`);
      for (const action of newActions) details.push(`${action.worker}: ${action.text}`);
    }
    for (const research of now.research || []) {
      const before = (old.research || []).find(r => r.id === research.id);
      if (!before || before.status !== research.status || before.attemptId !== research.attemptId || before.reportAvailable !== research.reportAvailable) changes.push(`Research ${research.status === 'complete' ? 'completed' : 'changed'}`);
    }
  } else if (now && !old) unavailable.push('No comparable execution baseline.');
  return { firstVisit: false, changes, unavailable, details };
}
async function projectHome(project, snapshot, baseline, options) {
  const revision = project.revisions.at(-1);
  const row = snapshot.projects.find(r => r.id === project.project.id);
  const researches = (snapshot.researches || []).filter(r => r.projectId === project.project.id);
  const local = await localGit(project.project.folder, options);
  const evidence = await execution(row, researches);
  const { reports = [], ...executionBaseline } = evidence || {};
  const current = { viewedAt: new Date().toISOString(), revisionIds: project.revisions.map(r => r.id), revisions: [{ id: revision.id, title: revision.title, state: revision.state, direction: revision.direction, closed: revision.closed }], git: local, execution: evidence ? { ...executionBaseline, reportFingerprint: hash(JSON.stringify(reports)) } : null };
  const running = (row?.dispatch || []).filter(p => p.alive).length + researches.filter(r => r.alive && r.status === 'watching').length;
  const labels = { watching: running ? 'Workers running' : 'Waiting for worker progress', needs_approval: 'Waiting for approval', waiting_on_you: 'Waiting for your answer', propose_grill: 'Waiting for your answer', checkpointed: 'Paused — checkpoint saved', complete: 'Completed', failed: 'Blocked', blocked_no_worker: 'Blocked', blocked_no_folder: 'Blocked', idle: 'Idle' };
  const next = row?.status === 'needs_approval' ? 'Approve the prepared job' : row?.canResume ? 'Resume from checkpoint' : revision.open.length ? `Answer the current Grill question: ${revision.open[0]}` : row?.next || 'No next action defined';
  const action = row?.status === 'needs_approval' ? 'approve' : row?.canResume ? 'resume' : revision.open.length ? 'grill' : null;
  return { projectId: project.project.id, goal: revision.direction, progress: revision.state || 'No progress summary recorded.', progressDetails: { jobTitle: row?.jobTitle || '', status: row?.status || 'idle', actions: current.execution?.actions || [], reports, files: local.files || [] }, local, now: running ? 'Workers running' : labels[row?.status] || 'Idle', running, jobTitle: row?.jobTitle || '', next, action,
    notes: project.home?.notes || [], baseline: baseline === undefined ? project.home?.lastVisit || null : baseline, current,
    since: await compare(baseline === undefined ? project.home?.lastVisit : baseline, current) };
}
module.exports = { projectHome, compare, localGit };
