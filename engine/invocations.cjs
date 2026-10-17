'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Metadata only: prompts, output, environment and credentials never enter this file.
function createInvocationLedger(dir, { now = () => new Date().toISOString() } = {}) {
  const file = path.join(dir, 'invocations.jsonl');
  const records = new Map();
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    try { const record = JSON.parse(line); if (record.id) records.set(record.id, record); } catch { /* Preserve a truncated historical line. */ }
  }
  if (fs.existsSync(file) && fs.statSync(file).size) {
    const fd = fs.openSync(file, 'r'); const last = Buffer.alloc(1);
    try { fs.readSync(fd, last, 0, 1, fs.statSync(file).size - 1); } finally { fs.closeSync(fd); }
    if (last[0] !== 10) fs.appendFileSync(file, '\n');
  }
  function write(record) {
    fs.appendFileSync(file, JSON.stringify(record) + '\n', { mode: 0o600 });
    records.set(record.id, record);
    return record.id;
  }
  function start(info) {
    const startTime = now();
    return write({ id: crypto.randomUUID(), timestamp: startTime, startTime, role: info.role,
      projectId: info.projectId || null, megaTaskId: info.megaTaskId || null, subTaskId: info.subTaskId || null,
      attemptId: info.attemptId || null, provider: info.provider || null, model: info.model || null,
      modelId: info.modelId || null, accountKey: info.accountKey || null, accountType: info.accountType || 'unread', reason: info.reason, status: 'RUNNING', durationMs: null, processExit: null });
  }
  function update(id, fields) {
    const row = records.get(id);
    if (!row || row.status !== 'RUNNING') return;
    const metadata = {};
    for (const key of ['pid', 'exitPath', 'resultPath']) if (fields[key] !== undefined) metadata[key] = fields[key];
    write({ ...row, ...metadata });
  }
  function finish(id, status, processExit = null, tokens = null) {
    const row = records.get(id);
    if (!row || row.status !== 'RUNNING') return;
    const endTime = now();
    write({ ...row, status, endTime, durationMs: Math.max(0, Date.parse(endTime) - Date.parse(row.startTime)),
      processExit: Number.isInteger(processExit) ? processExit : null, ...(tokens && Number.isSafeInteger(tokens.input) && Number.isSafeInteger(tokens.output) ? { tokens: { input: tokens.input, output: tokens.output, ...(Number.isSafeInteger(tokens.cachedInput) ? { cachedInput: tokens.cachedInput } : {}) } } : {}) });
  }
  function reconcile(snapshot, isAlive) {
    for (const row of records.values()) {
      if (row.role !== 'worker' || row.status !== 'RUNNING') continue;
      let tokens = null;
      try { tokens = JSON.parse(fs.readFileSync(row.resultPath + '.usage.json', 'utf8')); } catch {}
      const result = snapshot?.execution?.results?.find(result => result.attemptId === row.attemptId);
      if (result) { finish(row.id, result.status, result.exitCode, tokens); continue; }
      if (!row.pid || typeof isAlive !== 'function' || isAlive(row.pid)) continue;
      let exit = null, text = '';
      try { exit = JSON.parse(fs.readFileSync(row.exitPath, 'utf8')); } catch {}
      try { text = fs.readFileSync(row.resultPath, 'utf8').slice(0, 8192); } catch {}
      const status = text.match(/^STATUS:\s*(COMPLETE|FAILED|BLOCKED|CHECKPOINTED)\b/m)?.[1];
      finish(row.id, status === 'CHECKPOINTED' ? 'BLOCKED' : status || 'BLOCKED', exit?.exitCode, tokens);
    }
  }
  // A lead or advisory response cannot survive backend replacement. Worker state is reconciled separately.
  for (const row of records.values()) if (['orchestrator', 'reviewer', 'supervisor'].includes(row.role) && row.status === 'RUNNING') finish(row.id, 'BLOCKED');
  function view(projectId) {
    const rows = [...records.values()].filter(row => !projectId || row.projectId === projectId);
    const groups = role => {
      const totals = new Map();
      for (const row of rows.filter(row => row.role === role)) {
        const key = JSON.stringify([row.provider, row.model]);
        const group = totals.get(key) || { provider: row.provider, model: row.model, calls: 0, durationMs: 0, COMPLETE: 0, FAILED: 0, BLOCKED: 0, RUNNING: 0 };
        group.calls++; group.durationMs += row.durationMs || 0; group[row.status] = (group[row.status] || 0) + 1;
        if (row.tokens) { group.inputTokens = (group.inputTokens || 0) + row.tokens.input; group.outputTokens = (group.outputTokens || 0) + row.tokens.output; group.tokenReadings = (group.tokenReadings || 0) + 1; }
        totals.set(key, group);
      }
      return [...totals.values()];
    };
    return { orchestrator: groups('orchestrator'), workers: groups('worker'), supervisors: groups('supervisor'), recent: rows.slice(-20).reverse() };
  }
  return { start, update, finish, reconcile, view, file };
}
module.exports = { createInvocationLedger };
