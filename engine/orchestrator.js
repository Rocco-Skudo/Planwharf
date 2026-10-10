'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Plan = require('../plan.js');
const { planExhausted, emptyPlans } = require('./planUsage.js');
const { createRepositoryInspector } = require('./repository.cjs');

const LABELS = {
  waiting_on_you: 'Waiting on you',
  propose_grill: 'Grill first',
  idle: 'Idle',
  blocked_no_folder: 'Needs a folder',
  blocked_no_worker: 'No eligible worker',
  needs_approval: 'Plan ready',
  watching: 'Watching',
  complete: 'Evidence complete',
  failed: 'Stopped',
  checkpointed: 'Paused'
};

const PIPELINE_STEPS = [
  { id: 'check', label: 'Check' },
  { id: 'grill', label: 'Grill' },
  { id: 'plan', label: 'Plan' },
  { id: 'approve', label: 'Approve' },
  { id: 'assign', label: 'Assign' },
  { id: 'watch', label: 'Watch' }
];

function stepOf(row) {
  if (!row) return 'idle';
  switch (row.status) {
    case 'blocked_no_folder': return 'check';
    case 'propose_grill':
    case 'waiting_on_you': return 'grill';
    case 'idle': return row.pendingAutoStart ? 'plan' : 'idle';
    case 'needs_approval': return 'approve';
    case 'blocked_no_worker': return 'assign';
    case 'watching':
    case 'checkpointed':
    case 'failed': return 'watch';
    case 'complete': return 'done';
    default: return row.status || 'idle';
  }
}

function pipelineOf(row) {
  const step = stepOf(row);
  const order = PIPELINE_STEPS.map(item => item.id);
  const nowIndex = step === 'done' ? order.length : order.indexOf(step);
  return PIPELINE_STEPS.map((item, i) => {
    let state = 'todo';
    if (step === 'idle') state = 'todo';
    else if (step === 'done' || (nowIndex >= 0 && i < nowIndex)) state = 'done';
    else if (i === nowIndex) state = 'now';
    if (item.id === 'grill' && row && row.grillSkipped && state !== 'now') {
      state = nowIndex > i ? 'skip' : 'todo';
    }
    return { id: item.id, label: item.label, state };
  });
}

const ORCH_NAME = 'Orchestrator';

function orchestratorDoing(row) {
  if (!row) return 'Idle.';
  const n = Array.isArray(row.dispatch) && row.dispatch.length ? row.dispatch.length : (row.workerLabel ? 1 : 0);
  if (row.status === 'watching') {
    const alive = Array.isArray(row.dispatch)
      ? row.dispatch.filter(part => part && part.alive).length
      : (row.workerAlive ? 1 : 0);
    const files = row.facts && Number.isFinite(row.facts.fileCount) ? row.facts.fileCount : null;
    const folder = files == null ? 'project folder' : `${files} files in the project folder`;
    if (/Hit an error/i.test(row.workerActivity || '')) {
      return `Worker looks unhealthy. Monitoring for recovery; I will switch models if it stalls or dies.`;
    }
    return `Monitoring ${n} worker${n === 1 ? '' : 's'} (${alive} alive). Watching process, worker log, and ${folder}.`;
  }
  if (row.status === 'needs_approval') {
    return n > 1
      ? `Split the job into ${n} slices across available workers. Waiting for Approve.`
      : 'Picked a worker. Waiting for Approve.';
  }
  if (row.status === 'propose_grill' || row.status === 'waiting_on_you') return 'Holding assign until grill is closed.';
  if (row.status === 'complete') return 'Verified STATUS: COMPLETE and folder output.';
  if (row.status === 'failed') return 'Stopped monitoring. No remaining worker, or every slice failed.';
  if (row.status === 'checkpointed') return checkpointTalk(row.checkpoint && row.checkpoint.reason).orch;
  if (row.status === 'blocked_no_folder') return 'Cannot inspect: no local folder.';
  if (row.status === 'blocked_no_worker') return 'No eligible worker. Turn a model on, or wait until its provider usage resets.';
  if (row.status === 'idle') return 'Reading the notebook. No job to split.';
  return LABELS[row.status] || 'Idle.';
}

function crewOf(row, leadLabel) {
  const crew = [{
    role: 'Orchestrator',
    name: leadLabel || (row && row.orchestratorLabel) || ORCH_NAME,
    doing: (row && row.orchestratorDoing) || orchestratorDoing(row)
  }];
  const liveWorkers = row && row.status !== 'idle' && row.status !== 'propose_grill' && row.status !== 'waiting_on_you' && row.status !== 'blocked_no_folder';
  const dispatch = liveWorkers && Array.isArray(row.dispatch) ? row.dispatch : [];
  if (dispatch.length) {
    dispatch.forEach(part => {
      let doing = part.slice || 'On the plan';
      if (row.status === 'needs_approval') doing = `${part.slice || 'Whole job'}. Waiting for Approve.`;
      if (row.status === 'watching') doing = part.activity || row.workerActivity
        || `${part.slice || 'Whole job'}. ${part.pid ? `Process ${part.pid}${part.alive ? ' running' : ' stopped'}.` : 'Claimed.'}`;
      if (row.status === 'complete') doing = 'Evidence complete.';
      if (row.status === 'checkpointed') doing = checkpointTalk(row.checkpoint && row.checkpoint.reason).orch;
      if (row.status === 'blocked_no_worker') doing = 'No remaining provider usage.';
      crew.push({ role: 'Worker', name: part.label || part.modelId, doing });
    });
  } else if (row && row.workerLabel && !String(row.workerLabel).includes(' + ')) {
    crew.push({
      role: 'Worker',
      name: row.workerLabel,
      doing: row.status === 'watching'
        ? (row.workerActivity
          || (row.workerPid
            ? `Process ${row.workerPid}${row.workerAlive ? ' running' : ' stopped'}.`
            : 'Claimed.'))
        : row.status === 'needs_approval'
          ? 'Picked. Waiting for Approve.'
          : (row.waitingFor || '')
    });
  } else if (!(row && row.workerLabel)) {
    crew.push({
      role: 'Worker',
      name: 'None yet',
      doing: row && (row.status === 'propose_grill' || row.status === 'waiting_on_you')
        ? 'Not assigned until grill is closed.'
        : 'Not assigned yet.'
    });
  }
  return crew;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function notebookProjects(plan) {
  if (!plan) return [];
  return plan.schema === 2 ? plan.projects : [plan];
}

function normalizeModels(models) {
  return (Array.isArray(models) ? models : []).filter(item => item && typeof item.id === 'string').map(item => ({
    id: item.id,
    label: typeof item.label === 'string' && item.label.trim() ? item.label : item.id,
    enabled: item.enabled === true && item.available !== false,
    available: item.available !== false,
    unavailableReason: item.unavailableReason || null,
    provider: item.provider,
    plan: typeof item.plan === 'string' && item.plan.trim() ? item.plan : 'Unnamed plan',
    kind: item.kind === 'premium' || item.kind === 'local' ? item.kind : 'default',
    cost: Number.isFinite(item.cost) && item.cost >= 0 ? item.cost : 1,
    limit: Number.isFinite(item.limit) && item.limit > 0 ? item.limit : 50,
    cli: typeof item.cli === 'string' && item.cli.trim() ? item.cli.trim() : undefined
  }));
}

function usedOf(usage, id) {
  const row = usage && usage[id];
  return row && Number.isFinite(row.used) ? row.used : 0;
}

function usageOf(item) {
  const used = item && Number.isFinite(item.used) ? item.used : 0;
  const limit = item && Number.isFinite(item.limit) && item.limit > 0 ? item.limit : 0;
  const remaining = item && Number.isFinite(item.remaining) ? item.remaining : Math.max(0, limit - used);
  const pct = limit ? Math.min(100, Math.round((used * 100) / limit)) : 0;
  const leftPct = limit ? Math.max(0, 100 - pct) : 100;
  return { used, limit, remaining, pct, leftPct };
}

function canOrchestrate(item) {
  return Boolean(item && item.enabled && (item.kind === 'premium' || item.kind === 'default'));
}

function jobKind(job) {
  const text = `${job && job.title ? job.title : ''} ${job && job.detail ? job.detail : ''}`.toLowerCase();
  if (/\b(hard|difficult|escalat\w*|premium|complex)\b/.test(text)) return 'hard';
  if (/\b(implement|code|fix|bug|test|build|write)\b/.test(text)) return 'build';
  return 'inspect';
}

function pickWorker(models, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const usage = opts.usage || {};
  const plans = Array.isArray(opts.plans) ? opts.plans : [];
  const kind = jobKind(opts.job);
  const skip = new Set(Array.isArray(opts.skip) ? opts.skip.filter(Boolean) : []);
  const rank = {
    inspect: { local: 3, default: 2, premium: 1 },
    build: { default: 3, premium: 2, local: 1 },
    hard: { premium: 3, default: 2, local: 1 }
  };
  const pool = normalizeModels(models)
    .map((item, index) => ({ ...item, index }))
    .filter(item => item.enabled && !skip.has(item.id) && usedOf(usage, item.id) + item.cost <= item.limit && !planExhausted(plans, item.plan));
  if (!pool.length) return null;
  pool.sort((a, b) => {
    const ra = (rank[kind] || {})[a.kind] || 0;
    const rb = (rank[kind] || {})[b.kind] || 0;
    if (rb !== ra) return rb - ra;
    if (kind === 'hard' && a.kind === b.kind && b.cost !== a.cost) return b.cost - a.cost;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.index - b.index;
  });
  const chosen = pool[0];
  chosen.why = `${kind} job · ${chosen.label} on ${chosen.plan}; ${usedOf(usage, chosen.id)}/${chosen.limit} used`;
  return chosen;
}

function sliceCount(job, facts, eligible) {
  const kind = jobKind(job);
  const dirty = facts && Array.isArray(facts.dirty) ? facts.dirty.length : 0;
  const pool = Number.isFinite(eligible) && eligible > 0 ? eligible : 1;
  if (pool <= 1) return 1;
  if (kind === 'hard') return Math.min(3, pool);
  if (kind === 'build') return Math.min(3, pool);
  if (dirty >= 4) return Math.min(2, pool);
  return 1;
}

function pickWorkers(models, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const skip = new Set(Array.isArray(opts.skip) ? opts.skip.filter(Boolean) : []);
  const baseUsage = opts.usage || {};
  const eligible = normalizeModels(models).filter(item => (
    item.enabled && !skip.has(item.id) && usedOf(baseUsage, item.id) + item.cost <= item.limit && !planExhausted(opts.plans, item.plan)
  )).length;
  const want = Math.max(1, Number(opts.count) || sliceCount(opts.job, opts.facts, eligible));
  const workers = [];
  const usage = { ...baseUsage };
  let pool = Array.isArray(models) ? models.slice() : [];
  for (let i = 0; i < want; i++) {
    const chosen = pickWorker(pool, { ...opts, usage });
    if (!chosen) break;
    workers.push(chosen);
    pool = pool.filter(item => item && item.id !== chosen.id);
    usage[chosen.id] = { used: usedOf(usage, chosen.id) + chosen.cost };
  }
  return workers;
}

function dispatchPlan(workers, job, facts) {
  const list = Array.isArray(workers) ? workers.filter(Boolean) : [];
  if (!list.length) return [];
  const dirty = facts && Array.isArray(facts.dirty) ? facts.dirty.length : 0;
  const slices = list.length === 1
    ? ['Whole job']
    : list.length === 2
      ? [
        dirty ? 'Inspect uncommitted changes, docs, and pin the slice' : 'Inspect the folder, git, and docs. Pin the slice.',
        'Implement the bounded slice and add tests.'
      ]
      : [
        dirty ? 'Inspect uncommitted changes, docs, and pin the slice' : 'Inspect the folder, git, and docs. Pin the slice. Do not implement yet.',
        'Implement the bounded slice in the project folder.',
        'Add and run tests for the slice. Fix what fails.'
      ];
  return list.map((worker, index) => ({
    modelId: worker.id,
    label: worker.label || worker.id,
    slice: slices[index] || `Parallel slice ${index + 1}`,
    why: worker.why || '',
    pid: null,
    logPath: null,
    resultPath: null,
    alive: false,
    activity: ''
  }));
}

function isDocName(name) {
  const value = String(name || '').replace(/\\/g, '/');
  const base = value.split('/').pop();
  if (/^docs\/.+\.md$/i.test(value)) return true;
  return /^(readme(\.md)?|agents\.md|claude\.md|skill\.md|contributing\.md)$/i.test(base);
}

function listDocs(folder) {
  const found = [];
  if (!folder || typeof folder !== 'string') return found;
  try {
    for (const name of fs.readdirSync(folder)) {
      if (name === '.' || name === '..') continue;
      if (isDocName(name)) found.push(name);
    }
    const docsDir = path.join(folder, 'docs');
    try {
      if (fs.statSync(docsDir).isDirectory()) {
        for (const name of fs.readdirSync(docsDir)) {
          if (/\.md$/i.test(name)) found.push('docs/' + name);
        }
      }
    } catch (_) {}
  } catch (_) {}
  return found.slice(0, 12);
}

function collectDocs(facts) {
  if (facts && Array.isArray(facts.docs) && facts.docs.length) {
    return facts.docs.map(name => String(name).trim()).filter(Boolean).slice(0, 12);
  }
  const names = facts && Array.isArray(facts.names) ? facts.names : [];
  return names.filter(isDocName).slice(0, 12);
}

function parseGrillQuestions(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const raw = text.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map(item => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') {
            const title = String(item.title || item.question || '').trim();
            const body = String(item.body || '').trim();
            const recommend = String(item.recommend || item.recommended || '').trim();
            const line = [title, body].filter(Boolean).join(': ');
            return recommend ? `${line} Recommended: ${recommend}` : line;
          }
          return '';
        }).filter(Boolean).slice(0, 8);
      }
    } catch (_) {}
  }
  const lines = raw.split(/\r?\n/).map(line => line.replace(/^\s*(?:\d+[.)]|[-*]|❓\s*\*\*Q\d+\*\*\s*[-—–]?)\s*/i, '').replace(/\*\*/g, '').trim()).filter(Boolean);
  return lines.filter(line => /recommended:/i.test(line) || /\?/.test(line)).slice(0, 8);
}

function grillPrompt(item, facts, skillText, docs) {
  const latest = item.revisions.at(-1);
  return [
    'You are running Matt Pocock grilling for this Planwharf project.',
    skillText ? `Skill:\n${skillText}` : 'Ask the frontier in one round. Word each question so yes accepts your recommended answer.',
    `Project: ${item.project.name}`,
    latest && latest.direction ? `Goal: ${latest.direction}` : '',
    item.project.folder ? `Folder: ${item.project.folder}` : '',
    facts && facts.lastCommit ? `Latest commit: ${facts.lastCommit}` : '',
    facts && Array.isArray(facts.names) && facts.names.length ? `Top files: ${facts.names.slice(0, 12).join(', ')}` : '',
    docs && docs.length ? `Docs: ${docs.join(', ')}` : '',
    'Return ONLY a JSON array of 3 to 6 strings.',
    'Each string is one frontier question about THIS project, with "Recommended: ..." in the same string.',
    'Do not ask for facts listed above. Do not implement.'
  ].filter(Boolean).join('\n\n');
}

function grillDone(item) {
  return (item && Array.isArray(item.revisions) ? item.revisions : []).some(revision => (
    revision
    && (revision.mode === 'grill' || revision.title === 'Grill me' || revision.title === 'Grill with the docs')
  ));
}

function clip(text, n) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= n) return value;
  return value.slice(0, n - 1) + '…';
}

function tailLog(file, maxChars) {
  if (typeof file !== 'string' || !file.trim()) return '';
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw.slice(-Math.max(200, maxChars || 1600)).replace(/\r/g, '').trim();
  } catch (_) {
    return '';
  }
}

function lastActivity(tail) {
  const lines = String(tail || '').split('\n').map(line => line.trim()).filter(Boolean);
  if (!lines.length) return '';
  return clip(lines[lines.length - 1], 180);
}

function interpretActivity(tail, facts, alive) {
  const files = facts && Number.isFinite(facts.fileCount) ? facts.fileCount : 0;
  const text = String(tail || '');
  const last = lastActivity(text);
  if (/\b(test|unittest|pytest|assert|ok:)\b/i.test(text)) {
    return clip(`Running tests.${last ? ` ${last}` : ''}`, 180);
  }
  if (/\b(wrote|writing|created|creating|edit|saving)\b/i.test(text) || /\.(py|js|ts|cjs|md|json)\b/i.test(last)) {
    return clip(`Writing project files (${files} in folder).${last ? ` ${last}` : ''}`, 180);
  }
  if (/\berror\b|\bfail/i.test(text)) {
    return clip(`Hit an error.${last ? ` ${last}` : ''}`, 180);
  }
  if (last) return clip(alive ? `Working. ${last}` : `Stopped. Last: ${last}`, 180);
  if (alive) return files ? `Working. ${files} top-level names in the folder. Log still quiet.` : 'Working. No output yet.';
  return '';
}

function pickAskedProject(snap, projectId, question) {
  const rows = snap && Array.isArray(snap.projects) ? snap.projects : [];
  if (!rows.length) return null;
  if (typeof projectId === 'string' && projectId.trim()) {
    return rows.find(row => row.id === projectId) || null;
  }
  const q = String(question || '').toLowerCase();
  const named = rows.find(row => q.includes(String(row.name || '').toLowerCase()) || q.includes(String(row.id || '').toLowerCase()));
  if (named) return named;
  const order = ['watching', 'needs_approval', 'failed', 'checkpointed', 'blocked_no_worker', 'blocked_no_folder', 'propose_grill', 'waiting_on_you', 'complete', 'idle'];
  return [...rows].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0];
}

function packState(snap, row) {
  const facts = row && row.facts ? row.facts : null;
  const checkpoint = row && row.checkpoint ? {
    reason: row.checkpoint.reason || null,
    at: row.checkpoint.at || null,
    path: row.checkpoint.path || null,
    jobTitle: row.checkpoint.jobTitle || null,
    plan: Array.isArray(row.checkpoint.plan) ? row.checkpoint.plan.slice(0, 12) : []
  } : null;
  return {
    orchestrator: (snap && snap.orchestratorLabel) || ORCH_NAME,
    orchestratorId: snap && snap.orchestratorId,
    mode: snap && snap.mode,
    grill: {
      propose: snap && snap.grillPropose !== false,
      kind: snap && snap.grillKind ? snap.grillKind : (snap && snap.grillPropose === false ? 'off' : 'me')
    },
    focus: row ? {
      id: row.id,
      name: row.name,
      folder: row.folder || (facts && facts.folder) || null,
      github: row.github || null,
      repository: row.repository || null,
      status: row.status,
      label: row.label,
      goal: row.goal || '',
      state: row.stateArt || '',
      open: Array.isArray(row.open) ? row.open.slice(0, 12) : [],
      analysis: row.analysis || '',
      job: row.jobTitle || null,
      plan: Array.isArray(row.plan) ? row.plan.slice(0, 16) : [],
      checkpoint,
      orchestratorDoing: row.orchestratorDoing || '',
      waitingFor: row.waitingFor || '',
      next: row.next || '',
      files: facts && facts.fileCount,
      git: facts ? Boolean(facts.git) : null,
      lastCommit: facts && facts.lastCommit || '',
      dirty: facts && Array.isArray(facts.dirty) ? facts.dirty.slice(0, 12) : [],
      workers: (row.dispatch || []).map(part => ({
        id: part.modelId,
        name: part.label,
        slice: part.slice,
        pid: part.pid || null,
        alive: Boolean(part.alive),
        activity: part.activity || '',
        log: lastActivity(part.logPath ? tailLog(part.logPath) : '')
      })),
      monitoring: row.monitoring || null,
      lastLog: lastActivity(row.workerTail)
    } : null,
    others: (snap && Array.isArray(snap.projects) ? snap.projects : [])
      .filter(item => !row || item.id !== row.id)
      .map(item => ({ id: item.id, name: item.name, folder: item.folder || null, github: item.github || null, repository: item.repository || null, status: item.status, job: item.jobTitle || null })),
    fleet: (snap && Array.isArray(snap.fleet) ? snap.fleet : []).map(item => ({
      id: item.id,
      label: item.label,
      role: item.role,
      plan: item.plan,
      exhausted: Boolean(item.exhausted),
      enabled: item.enabled,
      lead: Boolean(item.lead)
    })),
    plans: (snap && Array.isArray(snap.plans) ? snap.plans : []).map(item => ({
      id: item.id,
      label: item.label,
      readable: Boolean(item.readable),
      exhausted: Boolean(item.exhausted),
      pct: item.pct,
      leftPct: item.leftPct,
      windows: item.windows || []
    }))
  };
}

function briefRow(row, lead) {
  if (!row) return 'No project.';
  const who = lead || ORCH_NAME;
  const bits = [
    `Speaking as ${who}. ${row.name} is ${row.label}.`,
    row.orchestratorDoing || '',
    row.jobTitle ? `Job: ${row.jobTitle}.` : 'No running job.',
  ];
  const parts = Array.isArray(row.dispatch) ? row.dispatch : [];
  if (parts.length) {
    parts.forEach((part, index) => {
      bits.push(`Worker ${index + 1} ${part.label || part.modelId}: ${part.slice || 'slice'}. ${part.activity || (part.pid ? `Process ${part.pid}${part.alive ? ' alive' : ' stopped'}` : 'Not started.')}`);
    });
  } else {
    bits.push(row.workerLabel ? `Worker: ${row.workerLabel}.` : 'No worker assigned.');
  }
  if (row.monitoring) {
    bits.push(`I am monitoring processes, worker logs, and the project folder: ${row.monitoring.alive}/${row.monitoring.workers} alive, ${row.monitoring.folderFiles} files.`);
  }
  if (row.waitingFor) bits.push(`Waiting for: ${row.waitingFor}.`);
  if (row.next) bits.push(`Next: ${row.next}`);
  const last = lastActivity(row.workerTail);
  if (last) bits.push(`Last worker output: ${last}`);
  return bits.map(item => String(item || '').trim()).filter(Boolean).join(' ');
}

function answerQuestion(question, snap, projectId) {
  const q = String(question || '').trim();
  if (!q) return { ok: false, reason: 'empty question', answer: '', projectId: null };
  const lead = (snap && snap.orchestratorLabel) || ORCH_NAME;
  const rows = snap && Array.isArray(snap.projects) ? snap.projects : [];
  const all = /\b(all projects|tutti|fleet|ogni progetto)\b/i.test(q);
  if (all && rows.length) {
    return { ok: true, answer: rows.map(row => briefRow(row, lead)).join('\n'), projectId: null };
  }
  const row = pickAskedProject(snap, projectId, q);
  if (!row) return { ok: true, answer: `${lead}: no projects in the notebook.`, projectId: null };
  const ql = q.toLowerCase();
  const workerHit = (row.dispatch || []).find(part => {
    const label = String(part.label || '').toLowerCase();
    const id = String(part.modelId || '').toLowerCase();
    return (label && ql.includes(label)) || (id && ql.includes(id));
  });
  if (workerHit) {
    return {
      ok: true,
      projectId: row.id,
      answer: `${lead} on ${row.name}: ${workerHit.label || workerHit.modelId} has slice "${workerHit.slice || 'whole job'}". ${workerHit.activity || 'No interpreted activity yet.'} Process ${workerHit.pid || 'none'} is ${workerHit.alive ? 'alive' : 'stopped'}.`
    };
  }
  if (/\b(split|spacchett|slice|why two|perch[eé]|quanti worker)\b/i.test(q)) {
    const parts = row.dispatch || [];
    return {
      ok: true,
      projectId: row.id,
      answer: parts.length > 1
        ? `${lead} split ${row.name} into ${parts.length} slices: ${parts.map(part => `${part.label} — ${part.slice}`).join('; ')}.`
        : `${lead} did not split ${row.name}. One worker on the whole job.`
    };
  }
  if (/\b(quota|remaining|residu|left|utilizzo|usage|percent)\b/i.test(q)) {
    const plans = snap && Array.isArray(snap.plans) ? snap.plans : [];
    const list = plans.length
      ? plans.map(item => {
        if (!item.readable) return `${item.label}: ${item.reason || 'not readable'}`;
        const windows = Array.isArray(item.windows) && item.windows.length
          ? item.windows.map(win => `${win.name} ${win.pct}% used (${win.leftPct}% left)`).join(', ')
          : `${item.pct}% used (${item.leftPct}% left)`;
        return item.exhausted ? `${item.label}: exhausted (${windows})` : `${item.label}: ${windows}`;
      })
      : (snap && Array.isArray(snap.models) ? snap.models : []).map(item => {
        const used = usageOf(item);
        return `${item.label}: ${used.pct}% used (${used.leftPct}% left)`;
      });
    return {
      ok: true,
      projectId: row.id,
      answer: list.length ? `${lead} usage: ${list.join('; ')}.` : `${lead}: no plans loaded.`
    };
  }
  if (/\b(monitor|vivo|alive|stall|watch|controll)\b/i.test(q)) {
    return {
      ok: true,
      projectId: row.id,
      answer: `${lead}: ${row.orchestratorDoing || 'not monitoring a run.'} ${row.monitoring ? `${row.monitoring.alive}/${row.monitoring.workers} processes alive, ${row.monitoring.folderFiles} files.` : ''} Waiting for: ${row.waitingFor || 'nothing named'}.`
    };
  }
  if (/\b(next|prossimo|waiting|aspet)\b/i.test(q)) {
    return { ok: true, projectId: row.id, answer: `${lead} on ${row.name}: waiting for ${row.waitingFor || 'nothing'}. Next: ${row.next || 'nothing queued.'}` };
  }
  if (/\b(log|output|detto|said)\b/i.test(q)) {
    const last = lastActivity(row.workerTail);
    return { ok: true, projectId: row.id, answer: last ? `${lead} last worker output on ${row.name}: ${last}` : `${lead}: no worker log yet on ${row.name}.` };
  }
  return { ok: true, projectId: row.id, answer: briefRow(row, lead) };
}

function looksLikeQuestion(question) {
  const t = String(question || '').trim();
  if (/\?$/.test(t)) return true;
  return /^(how |what |why |who |where |when |which |quanto |quale |come sta|come mai|che (ne |sta |fa )|chi |perch|status\b|quota\b|how far)/i.test(t);
}

function looksLikeWork(question) {
  const t = String(question || '').trim();
  if (/^(do it|fallo|procedi|smista|go)$/i.test(t)) return true;
  return /\b(implement(?:a|are)?|smista|dispatch|assign(?:a)? |metti i worker|dai il lavoro|do the (?:job|task|work)|fai (?:il |la )(?:job|task|lavoro)|fallo(?: fare)?|lavora(?:ci)?(?: su)?|procedi|esegui|costruisci|continua(?:re)?|continue\b|go ahead|vai avanti|fix (?:the |this )|sistema )\b/i.test(t);
}

function checkpointTalk(reason) {
  const why = reason || 'deadline';
  if (why === 'stop' || why === 'shutdown') {
    return {
      activity: 'Stopped. Checkpoint saved.',
      note: 'Stopped. Checkpoint saved. Press Resume to continue.',
      orch: 'Stopped. Checkpoint saved.',
      doing: (name, title) => `Stopped ${name} · ${title}. Checkpoint saved.`
    };
  }
  if (why === 'deadline') {
    return {
      activity: 'Deadline reached. Checkpoint saved.',
      note: 'Deadline reached. Checkpoint saved. Resume next session.',
      orch: 'Paused at deadline. Checkpoint saved.',
      doing: (name, title) => `Deadline reached on ${name} · ${title}. Checkpoint saved.`
    };
  }
  return {
    activity: 'Job ended without completing. Checkpoint saved.',
    note: `Job ended (${why}). Checkpoint saved. Press Resume to continue.`,
    orch: 'Job ended without completing. Checkpoint saved.',
    doing: (name, title) => `${name} · ${title} ended without completing (${why}). Checkpoint saved.`
  };
}

function workOrderFor(row) {
  const status = row && row.status;
  if (status === 'watching') return 'watching';
  if (status === 'needs_approval') return 'approve';
  if (status === 'checkpointed' || (row && row.checkpoint && (status === 'failed' || status === 'blocked_no_worker'))) return 'resume';
  return 'start';
}

function parseOrder(question, snap, projectId) {
  const q = String(question || '').trim();
  if (!q) return null;
  const ql = q.toLowerCase();
  const row = pickAskedProject(snap, projectId, q);
  const models = snap && Array.isArray(snap.models) ? snap.models : [];
  const named = models.find(item => {
    const label = String(item.label || '').toLowerCase();
    const id = String(item.id || '').toLowerCase();
    return (label.length > 2 && ql.includes(label)) || (id && ql.includes(id));
  });
  const off = /\b(off|disable|spegni|disattiva|turn off)\b/i.test(q);
  const on = /\b(on|enable|accendi|attiva|turn on)\b/i.test(q);
  if (named && off && !on) return { action: 'model', id: named.id, enabled: false, label: named.label };
  if (named && on && !off) return { action: 'model', id: named.id, enabled: true, label: named.label };
  if (named && /\b(orchestrator|as lead|use as|usa come)\b/i.test(ql)) {
    return { action: 'lead', id: named.id, label: named.label };
  }
  if (/\b(stop|ferma|kill|arresta)\b/i.test(ql)) {
    return { action: 'stop', projectId: row && row.id, name: row && row.name };
  }
  if (/\b(resume|riprendi)\b/i.test(ql)) {
    return { action: 'resume', projectId: row && row.id, name: row && row.name };
  }
  if (/\b(approve run|approva|approve)\b/i.test(ql)) {
    return { action: 'approve', projectId: row && row.id, name: row && row.name };
  }
  if (/\b(skip grill|salta grill|skip the grill)\b/i.test(ql)) {
    return { action: 'skip', projectId: row && row.id, name: row && row.name };
  }
  if (/\bgrill\b/i.test(ql) && /\b(off|disable|spegni|disattiva)\b/i.test(ql)) {
    return { action: 'grillPropose', enabled: false };
  }
  if (/\bgrill with the docs\b/i.test(ql)) {
    return { action: 'grillPropose', enabled: true, kind: 'docs' };
  }
  if (/\bgrill me\b/i.test(ql) && !/\bskip\b/i.test(ql)) {
    return { action: 'grillPropose', enabled: true, kind: 'me' };
  }
  if (/\bgrill\b/i.test(ql) && /\b(on|enable|accendi|attiva)\b/i.test(ql) && !named) {
    return { action: 'grillPropose', enabled: true };
  }
  if (/\b(auto start|avvia|start)\b/i.test(ql)) {
    return { action: 'start', projectId: row && row.id, name: row && row.name };
  }
  const wantsMode = /\b(mode|modalit|switch to|set to|passa a)\b/i.test(ql);
  if (wantsMode && /\b(automatic|auto)\b/i.test(ql) && !/\bauto start\b/i.test(ql)) {
    return { action: 'mode', mode: 'auto' };
  }
  if (wantsMode && /\b(manual|manuale)\b/i.test(ql)) {
    return { action: 'mode', mode: 'manual' };
  }
  if (looksLikeWork(q) && !looksLikeQuestion(q) && !/\b(do not|don't|non)\s+(implement|edit|write|implementare|modificare|scrivere)\b/i.test(q)) {
    const action = workOrderFor(row);
    return { action, projectId: row && row.id, name: row && row.name, work: true };
  }
  return null;
}

function fleetOf(models, projects, leadId, plans) {
  const list = Array.isArray(models) ? models : [];
  const rows = Array.isArray(projects) ? projects : [];
  return list.map(item => {
    const assignments = [];
    rows.forEach(row => {
      const parts = Array.isArray(row.dispatch) ? row.dispatch : [];
      const hits = parts.filter(part => part && part.modelId === item.id);
      if (hits.length) {
        hits.forEach(part => {
          assignments.push({
            projectId: row.id,
            project: row.name,
            status: row.status,
            slice: part.slice || '',
            pid: part.pid || null,
            alive: Boolean(part.alive),
            activity: part.activity || row.workerActivity || ''
          });
        });
      } else if (row.modelId === item.id) {
        assignments.push({
          projectId: row.id,
          project: row.name,
          status: row.status,
          slice: '',
          pid: row.workerPid || null,
          alive: Boolean(row.workerAlive),
          activity: row.workerActivity || ''
        });
      }
    });
    const working = assignments.some(job => job.status === 'watching');
    const state = !item.enabled ? 'off' : working ? 'working' : assignments.length ? 'assigned' : 'idle';
    const eligible = Boolean(item.enabled && (item.kind === 'premium' || item.kind === 'default') && !planExhausted(plans, item.plan));
    const lead = Boolean(leadId && item.id === leadId);
    const exhausted = planExhausted(plans, item.plan);
    return {
      id: item.id,
      label: item.label,
      plan: item.plan || '',
      kind: item.kind,
      enabled: Boolean(item.enabled),
      available: item.available !== false,
      unavailableReason: item.unavailableReason || null,
      provider: item.provider || null,
      cli: item.cli || null,
      exhausted,
      role: lead ? 'Lead' : (eligible ? 'Eligible' : 'Worker'),
      eligible,
      lead,
      state: exhausted && item.enabled ? 'exhausted' : state,
      busy: working,
      assignments
    };
  });
}

function collectInterventions(projects) {
  const items = [];
  (projects || []).forEach(row => {
    (row.log || []).forEach(line => {
      const text = String((line && line.text) || '');
      if (/Switched from|No remaining worker|worker failed|stalled|\bstall\b|no verdict|Checkpoint saved/i.test(text)) {
        items.push({ at: line.at, projectId: row.id, project: row.name, text });
      }
    });
  });
  return items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 12);
}

function analysisOf(row) {
  if (!row) return '';
  const bits = [];
  if (row.orchestratorDoing) bits.push(row.orchestratorDoing);
  if (row.workerActivity && row.workerActivity !== row.orchestratorDoing) bits.push(row.workerActivity);
  if (/Hit an error/i.test(row.workerActivity || '')) {
    bits.push('This worker looks inefficient or unhealthy. I will switch if it stalls or dies.');
  }
  if (Array.isArray(row.tried) && row.tried.length) bits.push(`Already tried: ${row.tried.join(', ')}.`);
  if (row.waitingFor) bits.push(`Waiting for: ${row.waitingFor}.`);
  return bits.join(' ');
}

function resultStatus(file) {
  if (!file) return 'MISSING';
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (/(^|\n)\s*STATUS:\s*COMPLETE\b/i.test(raw)) return 'COMPLETE';
    if (/(^|\n)\s*STATUS:\s*FAILED\b/i.test(raw)) return 'FAILED';
    if (/(^|\n)\s*STATUS:\s*WATCHING\b/i.test(raw)) return 'WATCHING';
    return 'OTHER';
  } catch (_) {
    return 'MISSING';
  }
}

function logStat(file) {
  if (!file) return '0|0';
  try {
    const st = fs.statSync(file);
    return `${st.size}|${Math.floor(st.mtimeMs)}`;
  } catch (_) {
    return '0|0';
  }
}

function progressKey(facts, logPath, dispatch) {
  const fileCount = facts && Number.isFinite(facts.fileCount) ? facts.fileCount : 0;
  const names = facts && Array.isArray(facts.names) ? facts.names.join(',') : '';
  const dirty = facts && Array.isArray(facts.dirty) ? facts.dirty.length : 0;
  const logs = Array.isArray(dispatch) && dispatch.length
    ? dispatch.map(part => logStat(part && part.logPath)).join(';')
    : logStat(logPath);
  return `${fileCount}|${names}|${dirty}|${logs}`;
}

function runGit(folder, args) {
  try {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync('git', ['-C', folder, ...args], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true,
      maxBuffer: 65536
    });
    if (result.error || result.status !== 0) return '';
    return String(result.stdout || '').trim();
  } catch (_) {
    return '';
  }
}

function defaultInspect(folder) {
  if (!folder || typeof folder !== 'string') return { error: 'no folder' };
  try {
    const st = fs.statSync(folder);
    if (!st.isDirectory()) return { error: 'not a directory', folder };
    const names = fs.readdirSync(folder).filter(name => name !== '.' && name !== '..');
    const gitDir = path.join(folder, '.git');
    const git = fs.existsSync(gitDir);
    let head = '';
    if (git) {
      try { head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim(); } catch (_) {}
    }
    const branch = git ? (runGit(folder, ['rev-parse', '--abbrev-ref', 'HEAD']) || '') : '';
    const lastCommit = git ? runGit(folder, ['log', '-1', '--format=%h %s']) : '';
    const lastSubject = git ? runGit(folder, ['log', '-1', '--format=%s']) : '';
    const recent = git ? runGit(folder, ['log', '-5', '--oneline']).split(/\r?\n/).filter(Boolean).slice(0, 5) : [];
    const dirty = git ? runGit(folder, ['status', '--porcelain']).split(/\r?\n/).filter(Boolean).slice(0, 20) : [];
    const diffStat = git ? runGit(folder, ['diff', '--stat', 'HEAD']) : '';
    const docs = listDocs(folder);
    return {
      folder,
      fileCount: names.length,
      names: names.slice(0, 24),
      docs,
      git,
      head,
      branch,
      lastCommit,
      lastSubject,
      recent,
      dirty,
      diffStat: clip(diffStat, 400)
    };
  } catch (_) {
    return { error: 'folder not found', folder };
  }
}

function jobFromFacts(revision, facts) {
  const goal = revision && typeof revision.direction === 'string' ? revision.direction.trim() : '';
  const git = Boolean(facts && facts.git);
  const subject = (facts && facts.lastSubject) || 'latest repo changes';
  const title = git
    ? (clip(`Continue: ${subject}`, 120) || 'Continue from the repo')
    : (clip(goal, 120) || clip(`Continue: ${subject}`, 120) || 'Continue from the repo');
  const dirty = facts && Array.isArray(facts.dirty) ? facts.dirty.slice(0, 12) : [];
  const recent = facts && Array.isArray(facts.recent) ? facts.recent.slice(0, 5) : [];
  const detail = [
    goal ? `Goal: ${clip(goal, 400)}` : '',
    facts && facts.lastCommit ? `Latest commit: ${facts.lastCommit}` : (facts && facts.git ? 'Git present.' : 'No git history.'),
    recent.length ? `Recent:\n${recent.join('\n')}` : '',
    dirty.length ? `Uncommitted:\n${dirty.join('\n')}` : 'Working tree clean.',
    'Read the repo, take the latest changes, and proceed with the notebook plan.'
  ].filter(Boolean).join('\n\n');
  return { title, detail };
}

function planLines(item, facts, shown, active, extras) {
  const extra = extras && typeof extras === 'object' ? extras : {};
  const latest = item.revisions.at(-1);
  const goal = latest && latest.direction ? clip(latest.direction, 180) : '';
  const lines = [`Stay inside ${item.project.folder}.`];
  if (goal) lines.push(`Notebook goal: ${goal}`);
  if (facts && facts.git) {
    lines.push(`Latest git: ${facts.lastCommit || facts.head || 'present'}${facts.branch ? ` on ${facts.branch}` : ''}.`);
    if (facts.dirty && facts.dirty.length) lines.push(`Uncommitted: ${facts.dirty.length} path(s). Read those changes.`);
    else lines.push('Working tree clean. Proceed from the latest commit.');
  } else {
    lines.push(`Read-only inspect (${facts && facts.fileCount ? facts.fileCount : 0} top-level names).`);
  }
  lines.push('Proceed with the plan from those changes.');
  const dispatch = Array.isArray(extra.dispatch) ? extra.dispatch : [];
  if (dispatch.length > 1) {
    lines.push(`Split into ${dispatch.length} slices for parallel workers.`);
    dispatch.forEach((part, index) => {
      lines.push(`Slice ${index + 1}: ${part.label || part.modelId} — ${part.slice}.`);
    });
  } else {
    lines.push(`${active ? 'Assigned' : 'Pick'} ${shown.label || shown.id}${shown.why ? ` (${shown.why})` : ''}.`);
  }
  const job = extra.job || (item.tasks || []).find(task => task.status === 'running');
  if (job && job.timing === 'deadline' && job.deadlineAt) {
    lines.push(`Finish by ${job.deadlineAt}. At that time the orchestrator delivers the output or writes a checkpoint.`);
  } else {
    lines.push('Timing is at the worker’s discretion.');
  }
  if (extra.checkpoint && extra.checkpoint.path) {
    lines.push(`Resume from checkpoint ${extra.checkpoint.path}.`);
  }
  lines.push('Watch the worker process, the result file (STATUS: COMPLETE), and the project folder.');
  return lines;
}

function emptyEntry() {
  return {
    status: 'idle',
    doing: '',
    plan: [],
    facts: null,
    jobId: null,
    jobTitle: null,
    attemptId: null,
    modelId: null,
    approved: false,
    waitingFor: '',
    next: '',
    workerLabel: null,
    resultPath: null,
    watchingSince: null,
    holdApproval: false,
    grillSkipped: false,
    docs: [],
    log: [],
    pendingAutoStart: null,
    checkpoint: null,
    dispatch: [],
    resumeRequested: false,
    deadlineHonored: false,
    workerPid: null,
    workerLog: null,
    workerAlive: false,
    tried: [],
    progressAt: null,
    progressKey: null,
    workerTail: '',
    workerActivity: ''
  };
}

function jobFingerprint(job) {
  return crypto.createHash('sha256').update(JSON.stringify([job.id, job.title, job.detail, job.revision_id || null])).digest('hex');
}
function checkpointMatches(checkpoint, job) {
  if (!checkpoint || !job) return false;
  if (checkpoint.jobId && checkpoint.jobId !== job.id) return false;
  if (checkpoint.jobFingerprint) return checkpoint.jobFingerprint === jobFingerprint(job);
  if (checkpoint.jobTitle && checkpoint.jobTitle !== job.title) return false;
  if (typeof checkpoint.detail === 'string' && checkpoint.detail !== job.detail) return false;
  return true;
}

function createOrchestrator(options) {
  const opts = options && typeof options === 'object' ? options : {};
  if (typeof opts.readPlan !== 'function') throw new Error('orchestrator requires readPlan');
  if (!opts.attempts) throw new Error('orchestrator requires attempts');
  const attempts = opts.attempts;
  const sentinel = opts.sentinel || null;
  const models = Array.isArray(opts.models) ? opts.models : [];
  const inspect = typeof opts.inspectFolder === 'function' ? opts.inspectFolder : defaultInspect;
  const readRepository = typeof opts.readRepository === 'function' ? opts.readRepository : createRepositoryInspector();
  const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
  const dir = typeof opts.dir === 'string' && opts.dir.trim() ? opts.dir : null;
  const stateFile = dir ? path.join(dir, 'orchestrator.json') : null;
  let store = { mode: 'manual', grillPropose: true, grillKind: 'me', usage: {}, enabled: {}, projects: {}, asks: [], orchestratorId: null };
  let thinkingLive = null;
  let askToken = 0;
  let plansLive = emptyPlans();
  let plansAt = 0;
  let plansInflight = null;
  const loadPlans = typeof opts.fetchPlans === 'function' ? opts.fetchPlans : null;
  const plansTtl = Number.isFinite(opts.plansTtl) && opts.plansTtl >= 0 ? opts.plansTtl : 45000;
  if (stateFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        store = {
          mode: parsed.mode === 'auto' ? 'auto' : 'manual',
          grillPropose: parsed.grillPropose === false ? false : true,
          grillKind: parsed.grillKind === 'docs' ? 'docs' : (parsed.grillPropose === false || parsed.grillKind === 'off' ? 'off' : 'me'),
          usage: parsed.usage && typeof parsed.usage === 'object' ? parsed.usage : {},
          enabled: parsed.enabled && typeof parsed.enabled === 'object' ? parsed.enabled : {},
          projects: parsed.projects && typeof parsed.projects === 'object'
            ? Object.fromEntries(Object.entries(parsed.projects).map(([id, row]) => [
              id,
              row && typeof row === 'object' ? { ...emptyEntry(), ...row } : emptyEntry()
            ]))
            : {},
          asks: Array.isArray(parsed.asks) ? parsed.asks : [],
          orchestratorId: typeof parsed.orchestratorId === 'string' && parsed.orchestratorId.trim() ? parsed.orchestratorId : null
        };
      }
    } catch (_) {}
  }
  if (!Array.isArray(store.asks)) store.asks = [];

  function persist() {
    if (!stateFile) return;
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const temporary = stateFile + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(store) + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, stateFile);
  }

  function entry(id) {
    if (!store.projects[id]) store.projects[id] = emptyEntry();
    return store.projects[id];
  }

  function note(id, text) {
    const row = entry(id);
    const line = { at: now(), text };
    row.log = [line, ...(Array.isArray(row.log) ? row.log : [])].slice(0, 12);
  }

  function resultPathFor(attemptId) {
    if (!dir) return '';
    return path.join(dir, 'results', `${attemptId}.txt`);
  }

  function writeWatchFile(file, body) {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body, 'utf8');
  }

  function collectPids(row) {
    const pids = Array.isArray(row.dispatch)
      ? row.dispatch.map(part => part && part.pid).filter(pid => Number.isInteger(pid))
      : [];
    if (row.workerPid && !pids.includes(row.workerPid)) pids.push(row.workerPid);
    return pids;
  }

  function killDispatch(row) {
    collectPids(row).forEach(pid => {
      if (typeof opts.killWorker === 'function') {
        try { opts.killWorker(pid); } catch (_) {}
      } else {
        try { process.kill(pid); } catch (_) {}
      }
    });
    if (Array.isArray(row.dispatch)) {
      row.dispatch.forEach(part => {
        if (!part) return;
        part.pid = null;
        part.alive = false;
      });
    }
    row.workerPid = null;
    row.workerAlive = false;
  }

  function checkpointFile(id) {
    return dir ? path.join(dir, 'checkpoints', `${id}.json`) : null;
  }

  function readCheckpointFile(id) {
    const file = checkpointFile(id);
    if (!file) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return null;
      return { ...parsed, path: file, projectId: parsed.projectId || id };
    } catch (_) {
      return null;
    }
  }

  function paintCheckpoint(row, name, title) {
    const talk = checkpointTalk(row.checkpoint && row.checkpoint.reason);
    const jobTitle = title || (row.checkpoint && row.checkpoint.jobTitle) || row.jobTitle || 'job';
    row.status = 'checkpointed';
    row.doing = talk.doing(name || 'project', jobTitle);
    row.waitingFor = 'Resume from checkpoint';
    row.next = 'Press Resume to continue from the checkpoint.';
    row.orchestratorDoing = talk.orch;
    row.workerAlive = false;
    row.workerActivity = talk.activity;
    row.workerLabel = null;
    row.watchingSince = null;
    return row.checkpoint;
  }

  function hydrateCheckpoints() {
    if (!dir) return;
    const folder = path.join(dir, 'checkpoints');
    let names = [];
    try { names = fs.readdirSync(folder); } catch (_) { names = []; }
    const ids = new Set(Object.keys(store.projects || {}));
    names.forEach(name => {
      if (name.endsWith('.json')) ids.add(name.slice(0, -5));
    });
    let restored = false;
    ids.forEach(id => {
      const row = entry(id);
      const disk = readCheckpointFile(id);
      if (!row.checkpoint && disk) {
        row.checkpoint = disk;
        restored = true;
      } else if (row.checkpoint && disk && !row.checkpoint.path) {
        row.checkpoint.path = disk.path;
        restored = true;
      }
      if (row.checkpoint && !row.resumeRequested && row.status !== 'watching' && row.status !== 'complete' && row.status !== 'needs_approval') {
        paintCheckpoint(row, id, row.checkpoint.jobTitle);
        restored = true;
      }
    });
    if (restored) persist();
  }

  hydrateCheckpoints();

  function liveAttempt(id, job) {
    return attempts.getActiveAttempt({ projectId: id, taskId: job && job.id })
      || attempts.getActiveAttempt({ projectId: id });
  }

  function holdSavedCheckpoint(item, job) {
    const id = item.project.id;
    const row = entry(id);
    if (!row.checkpoint) {
      const disk = readCheckpointFile(id);
      if (disk && checkpointMatches(disk, job)) row.checkpoint = disk;
    }
    if (row.checkpoint && !checkpointMatches(row.checkpoint, job)) row.checkpoint = null;
    if (!row.checkpoint || row.resumeRequested) return false;
    if (liveAttempt(id, job)) return false;
    paintCheckpoint(row, item.project.name, (job && job.title) || row.checkpoint.jobTitle);
    return true;
  }

  function writeCheckpoint(id, item, job, facts, reason) {
    const row = entry(id);
    const why = reason || 'deadline';
    killDispatch(row);
    const payload = {
      at: now(),
      projectId: id,
      jobId: job && job.id,
      jobFingerprint: job ? jobFingerprint(job) : null,
      jobTitle: job && job.title,
      detail: job && job.detail,
      facts: facts || row.facts,
      plan: clone(row.plan || []),
      dispatch: clone(row.dispatch || []),
      reason: why,
      deadlineAt: job && job.deadlineAt || null
    };
    const file = checkpointFile(id);
    if (file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = file + '.' + crypto.randomUUID() + '.tmp';
      const fd = fs.openSync(temporary, 'wx');
      try { fs.writeFileSync(fd, JSON.stringify(payload, null, 2) + '\n', 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temporary, file);
    }
    row.checkpoint = { ...payload, path: file };
    const live = attempts.getActiveAttempt({ projectId: id, taskId: job && job.id })
      || attempts.getActiveAttempt({ projectId: id });
    if (live && typeof attempts.closeAttempt === 'function') {
      attempts.closeAttempt({ attemptId: live.id, reason: why });
    }
    row.attemptId = null;
    row.modelId = null;
    row.approved = false;
    row.resumeRequested = false;
    row.watchingSince = null;
    const talk = checkpointTalk(why);
    row.workerActivity = talk.activity;
    note(id, talk.note);
    return row.checkpoint;
  }

  function applyCheckpoint(id, item, job, facts, reason) {
    const row = entry(id);
    writeCheckpoint(id, item, job, facts, reason);
    return paintCheckpoint(row, item.project.name, (job && job.title) || 'job');
  }

  function markProgress(row, facts) {
    const key = progressKey(facts, row.workerLog, row.dispatch);
    const at = now();
    if (row.progressKey !== key) {
      row.progressKey = key;
      row.progressAt = at;
    } else if (!row.progressAt) {
      row.progressAt = at;
    }
    return key;
  }

  function refreshActivity(row, facts) {
    const parts = Array.isArray(row.dispatch) ? row.dispatch : [];
    parts.forEach(part => {
      if (!part) return;
      part.alive = Boolean(part.pid) && typeof opts.isProcessAlive === 'function'
        ? Boolean(opts.isProcessAlive(part.pid))
        : Boolean(part.pid && row.workerAlive);
      const tail = tailLog(part.logPath);
      part.activity = interpretActivity(tail, facts, part.alive);
    });
    row.workerLog = (parts[0] && parts[0].logPath) || row.workerLog;
    row.workerPid = (parts[0] && parts[0].pid) || row.workerPid;
    row.workerAlive = parts.length
      ? parts.some(part => part.alive)
      : (Boolean(row.workerPid) && typeof opts.isProcessAlive === 'function'
        ? Boolean(opts.isProcessAlive(row.workerPid))
        : Boolean(row.workerPid));
    const tails = parts.map(part => tailLog(part.logPath)).filter(Boolean);
    row.workerTail = tails.join('\n---\n') || tailLog(row.workerLog);
    row.workerActivity = parts.map(part => part.activity).filter(Boolean).join(' · ')
      || interpretActivity(row.workerTail, facts, row.workerAlive);
    const files = facts && Number.isFinite(facts.fileCount) ? facts.fileCount : 0;
    row.monitoring = {
      workers: parts.length || (row.workerPid ? 1 : 0),
      alive: parts.filter(part => part.alive).length || (row.workerAlive ? 1 : 0),
      logMoving: Boolean(row.progressAt && row.progressKey && !String(row.progressKey).endsWith('|0|0')),
      folderFiles: files,
      lastProgress: row.progressAt || null
    };
    row.orchestratorDoing = orchestratorDoing(row);
    return row.workerActivity;
  }

  function launchAssigned(item, job, facts, chosen) {
    const id = item.project.id;
    const row = entry(id);
    const claimed = attempts.claim({
      taskId: job.id,
      projectId: id,
      modelId: chosen.id,
      candidates: roster()
    });
    if (!claimed || !claimed.ok) {
      row.status = 'blocked_no_worker';
      row.doing = `Could not assign a worker: ${claimed && claimed.reason ? claimed.reason : 'claim failed'}.`;
      row.waitingFor = 'A successful claim';
      row.next = claimed && claimed.reason ? claimed.reason : 'Claim failed.';
      row.workerLabel = null;
      return false;
    }
    row.attemptId = claimed.attempt.id;
    row.modelId = claimed.attempt.modelId;
    if (!Array.isArray(row.dispatch) || !row.dispatch.length) {
      row.dispatch = dispatchPlan([chosen], job, facts);
    }
    row.workerLabel = row.dispatch.map(part => part.label).join(' + ');
    const file = resultPathFor(claimed.attempt.id);
    row.resultPath = file || null;
    if (file) {
      attempts.attachResult({ attemptId: claimed.attempt.id, resultPath: file });
      const names = (facts.names || []).join(', ');
      writeWatchFile(file, [
        `PROJECT: ${item.project.name}`,
        `JOB: ${job.title}`,
        `WORKER: ${row.workerLabel}`,
        row.dispatch.length > 1 ? `SLICES:\n${row.dispatch.map((part, index) => `${index + 1}. ${part.label} — ${part.slice}`).join('\n')}` : '',
        job.timing === 'deadline' && job.deadlineAt ? `DEADLINE: ${job.deadlineAt}` : 'TIMING: discretion',
        row.checkpoint && row.checkpoint.path ? `CHECKPOINT: ${row.checkpoint.path}` : '',
        `FOLDER: ${item.project.folder}`,
        `GIT: ${facts.git ? facts.lastCommit || facts.head || 'yes' : 'no'}`,
        facts.branch ? `BRANCH: ${facts.branch}` : '',
        facts.dirty && facts.dirty.length ? `DIRTY: ${facts.dirty.length}` : 'DIRTY: 0',
        `FILES: ${facts.fileCount}`,
        names ? `TOP: ${names}` : '',
        'STATUS: WATCHING',
        ''
      ].filter(Boolean).join('\n'));
    }
    row.dispatch.forEach((part, index) => {
      const model = roster().find(itemModel => itemModel.id === part.modelId);
      if (model) {
        if (!store.usage[model.id]) store.usage[model.id] = { used: 0 };
        if (index > 0 || model.id !== chosen.id) store.usage[model.id].used += model.cost;
        else if (index === 0) store.usage[model.id].used += model.cost;
      }
      part.resultPath = index === 0 ? file : (dir ? path.join(dir, 'results', `${claimed.attempt.id}-s${index + 1}.txt`) : null);
      part.logPath = dir ? path.join(dir, 'logs', `${claimed.attempt.id}-s${index + 1}.log`) : null;
      if (index === 0 && dir) part.logPath = path.join(dir, 'logs', `${claimed.attempt.id}.log`);
      if (part.resultPath && index > 0) {
        writeWatchFile(part.resultPath, [
          `PROJECT: ${item.project.name}`,
          `JOB: ${job.title}`,
          `SLICE: ${part.slice}`,
          `WORKER: ${part.label}`,
          'STATUS: WATCHING',
          ''
        ].join('\n'));
      }
    });
    note(id, `Assigned ${row.workerLabel} to ${job.title} (${row.dispatch.length} slice${row.dispatch.length === 1 ? '' : 's'}). Watching for COMPLETE.`);
    row.watchingSince = now();
    row.progressAt = now();
    row.workerTail = '';
    row.workerActivity = 'Assigned. Waiting for the first worker output.';
    if (typeof opts.spawnWorker === 'function') {
      try {
        for (let index = 0; index < row.dispatch.length; index++) {
          const part = row.dispatch[index];
          const launched = opts.spawnWorker({
            folder: item.project.folder,
            resultPath: part.resultPath,
            job: {
              title: job.title,
              detail: [
                job.detail,
                `Slice: ${part.slice}`,
                row.checkpoint && row.checkpoint.path
                  ? `Resume from checkpoint ${row.checkpoint.path} (${row.checkpoint.reason || 'saved'} at ${row.checkpoint.at || 'unknown'}).${Array.isArray(row.checkpoint.plan) && row.checkpoint.plan.length ? `\n${row.checkpoint.plan.join('\n')}` : ''}`
                  : ''
              ].filter(Boolean).join('\n\n')
            },
            worker: roster().find(model => model.id === part.modelId) || { id: part.modelId, label: part.label },
            attemptId: `${claimed.attempt.id}-s${index + 1}`,
            logPath: part.logPath,
            slice: part.slice
          });
          if (!launched || !Number.isInteger(launched.pid) || launched.pid <= 0) throw new Error('worker did not start');
          part.pid = launched.pid;
          part.logPath = launched.logPath || part.logPath;
          part.alive = true;
          note(id, `Started ${part.label} process ${launched.pid} on slice: ${part.slice}`);
        }
        row.workerPid = row.dispatch[0].pid;
        row.workerLog = row.dispatch[0].logPath;
      } catch (error) {
        row.workerPid = null;
        row.workerLog = null;
        if (file) {
          const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
          writeWatchFile(file, (raw.replace(/(^|\n)\s*STATUS:\s*\S+/i, '$1STATUS: FAILED') || `STATUS: FAILED\n`) + `REASON: ${error.message || 'worker did not start'}\n`);
        }
        note(id, `Worker failed to start: ${error.message || 'worker did not start'}.`);
        return false;
      }
    }
    row.progressKey = progressKey(facts, row.workerLog, row.dispatch);
    return true;
  }

  function failover(item, job, facts, reason) {
    const id = item.project.id;
    const row = entry(id);
    const fromId = row.modelId;
    const fromLabel = row.workerLabel || fromId || 'worker';
    killDispatch(row);
    const live = attempts.getActiveAttempt({ projectId: id, taskId: job.id })
      || attempts.getActiveAttempt({ projectId: id });
    if (live && typeof attempts.closeAttempt === 'function') {
      attempts.closeAttempt({ attemptId: live.id, reason: reason || 'stalled' });
    }
    const usedIds = [fromId, ...((row.dispatch || []).map(part => part && part.modelId))].filter(Boolean);
    row.tried = Array.from(new Set([...(row.tried || []), ...usedIds]));
    row.workerPid = null;
    row.workerAlive = false;
    row.attemptId = null;
    const next = pickWorker(roster(), { job, usage: store.usage, facts, skip: row.tried, plans: plansLive });
    if (!next) {
      note(id, `Stopped. No remaining worker after ${reason || 'stall'}.`);
      applyCheckpoint(id, item, job, facts, reason || 'failed');
      return false;
    }
    const replacements = pickWorkers(roster(), { job, usage: store.usage, facts, skip: row.tried, plans: plansLive });
    const nextCrew = replacements.length ? replacements : [next];
    row.dispatch = dispatchPlan(nextCrew, job, facts);
    row.plan = planLines(item, facts, nextCrew[0] || next, false, { dispatch: row.dispatch, job, checkpoint: row.checkpoint });
    const lead = nextCrew[0] || next;
    const ok = launchAssigned(item, job, facts, lead);
    if (ok) note(id, `Switched from ${fromLabel} to ${lead.label || lead.id}: ${reason || 'stall'}.`);
    return ok;
  }

  function leadModel() {
    const list = roster();
    if (store.orchestratorId) {
      const picked = list.find(item => item.id === store.orchestratorId);
      if (picked && canOrchestrate(picked)) return picked;
    }
    return null;
  }

  function roster() {
    return normalizeModels(models).map(item => {
      if (typeof store.enabled[item.id] === 'boolean') item.enabled = store.enabled[item.id] && item.available !== false;
      const used = usedOf(store.usage, item.id);
      return { ...item, used, remaining: Math.max(0, item.limit - used) };
    });
  }

  function snapshot(plan) {
    const projects = notebookProjects(plan);
    const lead = leadModel();
    const view = {
      updatedAt: now(),
      mode: store.mode === 'auto' ? 'auto' : 'manual',
      grillPropose: store.grillPropose !== false,
      grillKind: store.grillPropose === false ? 'off' : (store.grillKind === 'docs' ? 'docs' : 'me'),
      models: roster(),
      asks: clone(store.asks || []),
      thinking: thinkingLive ? clone(thinkingLive) : null,
      asking: Boolean(thinkingLive),
      orchestratorId: lead ? lead.id : null,
      orchestratorLabel: lead ? lead.label : ORCH_NAME,
      orchestrators: roster().filter(canOrchestrate).map(item => ({ id: item.id, label: item.label, kind: item.kind, plan: item.plan })),
      projects: projects.map(item => {
        const row = entry(item.project.id);
        const latest = item.revisions.at(-1);
        const docs = Array.isArray(row.docs) && row.docs.length ? row.docs : collectDocs(row.facts);
        return {
          id: item.project.id,
          name: item.project.name,
          folder: item.project.folder || null,
          github: item.project.github || null,
          repository: row.repository && row.repository.folder === (item.project.folder || null) && row.repository.github === (item.project.github || null) ? clone(row.repository) : null,
          goal: latest && latest.direction ? latest.direction : '',
          stateArt: latest && latest.state ? latest.state : '',
          open: clone((latest && latest.open) || []),
          status: row.status,
          label: LABELS[row.status] || row.status,
          doing: row.doing,
          plan: clone(row.plan || []),
          facts: row.facts ? clone(row.facts) : null,
          jobTitle: row.jobTitle,
          jobId: row.jobId,
          attemptId: row.attemptId,
          modelId: row.modelId,
          workerLabel: row.workerLabel || null,
          waitingFor: row.waitingFor || '',
          next: row.next || '',
          step: stepOf(row),
          pipeline: pipelineOf(row),
          crew: crewOf({ ...row, orchestratorDoing: orchestratorDoing(row), orchestratorLabel: lead ? lead.label : ORCH_NAME }, lead ? lead.label : ORCH_NAME),
          resultPath: row.resultPath || null,
          watchingSince: row.watchingSince || null,
          approved: Boolean(row.approved),
          canStart: true,
          canResume: Boolean(row.checkpoint && (item.tasks || []).some(task => task.status === 'running' && checkpointMatches(row.checkpoint, task))),
          canStop: Boolean(
            row.status === 'watching'
            && (item.tasks || []).some(task => task.status === 'running')
          ),
          pendingAutoStart: Boolean(row.pendingAutoStart),
          dispatch: clone(row.dispatch || []),
          checkpoint: row.checkpoint ? clone(row.checkpoint) : null,
          timing: ((item.tasks || []).find(task => task.status === 'running') || {}).timing || (row.pendingAutoStart && row.pendingAutoStart.timing) || null,
          deadlineAt: ((item.tasks || []).find(task => task.status === 'running') || {}).deadlineAt || (row.pendingAutoStart && row.pendingAutoStart.deadlineAt) || null,
          canGrillDocs: docs.length > 0,
          docs: clone(docs),
          grillSkipped: Boolean(row.grillSkipped),
          log: clone(row.log || []),
          workerPid: row.workerPid || null,
          workerAlive: Array.isArray(row.dispatch) && row.dispatch.length && typeof opts.isProcessAlive === 'function'
            ? row.dispatch.some(part => part && part.pid && opts.isProcessAlive(part.pid))
            : (Boolean(row.workerPid) && typeof opts.isProcessAlive === 'function'
              ? Boolean(opts.isProcessAlive(row.workerPid))
              : Boolean(row.workerAlive)),
          workerLog: row.workerLog || null,
          workerTail: row.workerTail || '',
          workerActivity: row.workerActivity || '',
          orchestratorDoing: orchestratorDoing(row),
          orchestratorId: lead ? lead.id : null,
          orchestratorLabel: lead ? lead.label : ORCH_NAME,
          monitoring: row.monitoring ? clone(row.monitoring) : null,
          progressAt: row.progressAt || null,
          tried: clone(row.tried || [])
        };
      })
    };
    view.projects.forEach(row => {
      row.analysis = analysisOf(row);
    });
    view.plans = clone(plansLive);
    view.fleet = fleetOf(view.models, view.projects, view.orchestratorId, plansLive);
    view.interventions = collectInterventions(view.projects);
    return view;
  }

  async function refreshPlans(force) {
    if (!loadPlans) return plansLive;
    const age = Date.now() - plansAt;
    if (!force && plansAt && age < plansTtl) return plansLive;
    if (plansInflight) return plansInflight;
    plansInflight = Promise.resolve()
      .then(() => loadPlans())
      .then(list => {
        if (Array.isArray(list) && list.length) plansLive = list;
        plansAt = Date.now();
        plansInflight = null;
        return plansLive;
      })
      .catch(() => {
        plansInflight = null;
        if (!plansAt) plansLive = emptyPlans();
        return plansLive;
      });
    return plansInflight;
  }

  function decide(item) {
    const id = item.project.id;
    const row = entry(id);
    const latest = item.revisions.at(-1);
    const job = (item.tasks || []).find(task => task.status === 'running') || null;
    const open = latest && Array.isArray(latest.open) ? latest.open : [];
    const stallMs = Number.isFinite(opts.stallMs) && opts.stallMs >= 0 ? opts.stallMs : 90 * 1000;
    const worker = pickWorker(roster(), { job, usage: store.usage, facts: row.facts, skip: row.tried, plans: plansLive });

    if (job && row.jobId && (row.jobId !== job.id || (row.jobFingerprint && row.jobFingerprint !== jobFingerprint(job)))) {
      row.approved = false;
      row.holdApproval = false;
      row.attemptId = null;
      row.modelId = null;
      row.plan = [];
      row.dispatch = [];
      row.tried = [];
      row.resumeRequested = false;
      note(id, 'Job changed. Approval reset.');
    }
    row.jobId = job ? job.id : null;
    row.jobFingerprint = job ? jobFingerprint(job) : null;
    row.jobTitle = job ? job.title : null;
    row.jobDetail = job ? job.detail : null;
    row.jobRevisionId = job ? job.revision_id : null;

    if (job && holdSavedCheckpoint(item, job)) return row;

    if (!job) {
      const leftover = attempts.getActiveAttempt({ projectId: id });
      if (leftover && leftover.status === 'active' && typeof attempts.closeAttempt === 'function') {
        attempts.closeAttempt({ attemptId: leftover.id, reason: 'no running job' });
        note(id, 'Closed a leftover claim. No running job on this project.');
      }
      row.workerPid = null;
      row.workerLog = null;
      row.workerAlive = false;
      row.tried = [];
      row.progressAt = null;
      row.progressKey = null;
      row.workerTail = '';
      row.workerActivity = '';
    }

    if (open.length) {
      row.status = 'waiting_on_you';
      row.doing = `${open.length} open question${open.length === 1 ? '' : 's'} on ${item.project.name}. Grill me first. The orchestrator does not assign a worker yet.`;
      row.waitingFor = 'Grill me answers';
      row.next = row.pendingAutoStart
        ? 'In For you open Grill me, answer, Save answers. Or Skip grill on this Monitor row to plan anyway.'
        : 'In For you open Grill me, answer the questions, then Save answers.';
      row.workerLabel = null;
      row.watchingSince = null;
      row.facts = null;
      row.dispatch = [];
      row.approved = false;
      row.holdApproval = false;
      return row;
    }
    if (!job && row.pendingAutoStart && store.grillPropose !== false && !row.grillSkipped && !grillDone(item)) {
      let docs = [];
      if (item.project.folder) {
        const facts = inspect(item.project.folder);
        if (facts && !facts.error) {
          row.facts = facts;
          docs = collectDocs(facts);
        } else {
          row.facts = facts || null;
        }
      } else {
        row.facts = null;
      }
      row.docs = docs;
      row.status = 'propose_grill';
      row.doing = docs.length
        ? `Auto start on ${item.project.name} proposes grill first. Grill me, or Grill with the docs (${docs.join(', ')}). Skip if you will not rely on it.`
        : `Auto start on ${item.project.name} proposes grill first. Grill me, or set a folder to Grill with the docs. Skip if you will not rely on it.`;
      row.waitingFor = 'Grill me, Grill with the docs, or skip';
      row.next = docs.length ? 'Grill with the docs, or Grill me.' : 'Grill me. Set a folder to grill with the docs.';
      row.workerLabel = null;
      row.attemptId = null;
      row.watchingSince = null;
      row.dispatch = [];
      row.approved = false;
      row.holdApproval = false;
      return row;
    }
    if (!job) {
      row.status = 'idle';
      row.doing = row.pendingAutoStart
        ? `Auto start is waiting to plan ${item.project.name} after grill.`
        : `No job on ${item.project.name}. Auto start to check the project${store.grillPropose !== false ? ', grill if Grill me or Grill with the docs is on,' : ''} then approve the plan.`;
      row.waitingFor = 'Auto start';
      row.next = store.grillPropose !== false
        ? 'Grill me or Grill with the docs starts the orchestrator with that grill. Auto start skips grill when both are off.'
        : 'Auto start skips grill. Turn Grill me or Grill with the docs on to grill first.';
      row.workerLabel = null;
      row.attemptId = null;
      row.watchingSince = null;
      row.facts = null;
      row.docs = [];
      row.dispatch = [];
      row.approved = false;
      row.holdApproval = false;
      return row;
    }
    if (!item.project.folder) {
      row.status = 'blocked_no_folder';
      row.doing = `${item.project.name} has a job (${job.title}) but no local folder. Set place so the orchestrator can inspect the repo.`;
      row.waitingFor = 'A local folder';
      row.next = 'Set place with a folder on this PC.';
      row.workerLabel = null;
      return row;
    }
    const facts = inspect(item.project.folder);
    row.facts = facts;
    const workers = pickWorkers(roster(), { job, usage: store.usage, facts, plans: plansLive });
    if (facts && facts.error) {
      row.status = 'blocked_no_folder';
      row.doing = `Cannot inspect ${item.project.name}: ${facts.error}.`;
      row.waitingFor = 'A readable folder';
      row.next = `Fix the folder: ${facts.error}.`;
      row.workerLabel = null;
      return row;
    }
    if (!worker) {
      row.status = 'blocked_no_worker';
      row.doing = 'No eligible worker. Turn a model on, or wait until ChatGPT, Grok, or Gemini usage resets.';
      row.waitingFor = 'An enabled model whose provider still has usage';
      row.next = 'Turn a model on, or wait until a plan limit resets.';
      row.workerLabel = null;
      return row;
    }
    const active = attempts.getActiveAttempt({ projectId: id, taskId: job.id })
      || attempts.getActiveAttempt({ projectId: id });
    const assigned = active ? roster().find(itemModel => itemModel.id === active.modelId) : null;
    const shown = assigned || worker;
    const keepDispatch = Array.isArray(row.dispatch) && row.dispatch.some(part => part && (part.pid || part.resultPath));
    if (!keepDispatch) {
      row.dispatch = dispatchPlan(workers.length ? workers : (worker ? [worker] : []), job, facts);
    }
    row.plan = planLines(item, facts, shown, Boolean(active), { dispatch: row.dispatch, job, checkpoint: row.checkpoint });
    if (store.mode === 'auto' && !row.holdApproval) row.approved = true;

    const deadlineDue = job.timing === 'deadline' && job.deadlineAt && Date.parse(now()) >= Date.parse(job.deadlineAt) && !row.deadlineHonored;
    if (!row.approved) {
      row.status = 'needs_approval';
      const who = row.dispatch.length > 1
        ? row.dispatch.map(part => part.label).join(' + ')
        : (worker.label || worker.id);
      row.doing = `Execution plan ready for ${item.project.name} · ${job.title}. Approve to assign ${who}${worker.why ? ` (${worker.why})` : ''}.`;
      row.waitingFor = 'Your Approve run';
      row.next = `Approve to assign ${who}.`;
      row.workerLabel = who;
      row.watchingSince = null;
      return row;
    }
    if (deadlineDue && !active) {
      applyCheckpoint(id, item, job, facts, 'deadline');
      row.workerLabel = null;
      return row;
    }

    if (!active) {
      if (!launchAssigned(item, job, facts, worker)) return row;
    } else {
      row.attemptId = active.id;
      row.modelId = active.modelId;
      row.workerLabel = (assigned && (assigned.label || assigned.id)) || active.modelId;
      row.resultPath = active.resultPath || row.resultPath || resultPathFor(active.id) || null;
      if (!row.watchingSince) row.watchingSince = now();
    }

    const watching = attempts.getActiveAttempt({ projectId: id, taskId: job.id })
      || attempts.getActiveAttempt({ projectId: id });
    const sentinelTick = watching && sentinel && typeof sentinel.tick === 'function' ? sentinel.tick(watching) : null;
    const sliceFiles = (row.dispatch || []).map(part => part && part.resultPath).filter(Boolean);
    const allSlicesDone = sliceFiles.length
      ? sliceFiles.every(file => resultStatus(file) === 'COMPLETE')
      : resultStatus(row.resultPath) === 'COMPLETE';
    if (allSlicesDone || (sentinelTick && sentinelTick.complete && sliceFiles.length <= 1)) {
      row.status = 'complete';
      row.doing = `Evidence complete for ${job.title} on ${item.project.name}.`;
      row.waitingFor = 'Nothing. Evidence is complete.';
      row.next = 'Read the result, or add a new job.';
      row.workerActivity = 'Evidence complete.';
      row.orchestratorDoing = 'Verified STATUS: COMPLETE and folder output.';
      note(id, sliceFiles.length > 1 ? 'All worker slices reported STATUS: COMPLETE.' : 'Sentinel saw STATUS: COMPLETE.');
      return row;
    }
    const modelName = (roster().find(itemModel => itemModel.id === row.modelId) || {}).label || row.modelId || (worker && worker.label);
    if (deadlineDue) {
      applyCheckpoint(id, item, job, facts, 'deadline');
      row.workerLabel = modelName;
      return row;
    }
    row.workerAlive = Boolean(row.workerPid) && typeof opts.isProcessAlive === 'function'
      ? Boolean(opts.isProcessAlive(row.workerPid))
      : Boolean(row.workerPid);
    markProgress(row, facts);
    refreshActivity(row, facts);
    const sliceResults = (row.dispatch || []).map(part => part && part.resultPath).filter(Boolean);
    const failedFile = (sliceResults.length ? sliceResults : [row.resultPath]).some(file => resultStatus(file) === 'FAILED');
    const progressAge = row.progressAt ? Date.parse(now()) - Date.parse(row.progressAt) : 0;
    const stalled = Number.isFinite(progressAge) && progressAge >= stallMs;
    const dead = Array.isArray(row.dispatch) && row.dispatch.length
      ? row.dispatch.some(part => (
        part && part.pid
        && typeof opts.isProcessAlive === 'function'
        && !opts.isProcessAlive(part.pid)
        && resultStatus(part.resultPath) !== 'COMPLETE'
      ))
      : Boolean(row.workerPid) && typeof opts.isProcessAlive === 'function' && !row.workerAlive;
    const noVerdict = Boolean(sentinelTick && sentinelTick.closed);
    if (failedFile || dead || stalled || noVerdict) {
      const reason = failedFile ? 'worker failed' : (dead || noVerdict ? 'no verdict' : 'stall');
      if (failover(item, job, facts, reason)) {
        row.workerAlive = Boolean(row.workerPid) && typeof opts.isProcessAlive === 'function'
          ? Boolean(opts.isProcessAlive(row.workerPid))
          : Boolean(row.workerPid);
        markProgress(row, facts);
        refreshActivity(row, facts);
      } else {
        if (row.status !== 'checkpointed') applyCheckpoint(id, item, job, facts, reason);
        return row;
      }
    }
    row.status = 'watching';
    const gitBit = facts.git ? ` git ${facts.head || 'yes'}` : '';
    const crew = row.dispatch.length > 1 ? ` Dispatch: ${row.dispatch.map(part => part.label).join(' + ')}.` : '';
    const proc = row.workerPid
      ? ` Worker process ${row.workerPid}${row.workerAlive ? ' is running' : ' stopped'}.`
      : '';
    const activity = row.workerActivity ? ` ${row.workerActivity}` : '';
    row.orchestratorDoing = orchestratorDoing(row);
    row.doing = `${row.orchestratorDoing} ${modelName} on ${item.project.name} · ${job.title}.${proc}${activity} Inspected ${facts.fileCount} top-level names${gitBit}.${crew}`;
    row.waitingFor = row.workerActivity || (row.workerAlive
      ? 'Worker process, result file, project files'
      : 'A result file with STATUS: COMPLETE');
    row.next = row.workerAlive
      ? 'Keep watching the worker. Stall switches to the next model.'
      : (row.workerPid ? 'Worker process stopped. Switching if another model remains.' : 'Keep watching.');
    row.workerLabel = row.dispatch.length > 1 ? row.dispatch.map(part => part.label).join(' + ') : modelName;
    return row;
  }

  let shuttingDown = false;
  async function tick() {
    await refreshPlans(false);
    const plan = await opts.readPlan();
    if (!shuttingDown) for (const item of notebookProjects(plan)) decide(item);
    persist();
    return snapshot(plan);
  }

  async function setMode(mode) {
    store.mode = mode === 'auto' ? 'auto' : 'manual';
    persist();
    return tick();
  }

  async function setGrillPropose(enabled, kind) {
    store.grillPropose = enabled !== false;
    if (!store.grillPropose) store.grillKind = 'off';
    else if (kind === 'docs' || kind === 'me') store.grillKind = kind;
    else if (store.grillKind === 'off' || !store.grillKind) store.grillKind = 'me';
    persist();
    return tick();
  }

  async function skipGrill(projectId) {
    if (typeof projectId !== 'string' || !projectId.trim()) return { ok: false, reason: 'project not found' };
    const plan = await opts.readPlan();
    const item = notebookProjects(plan).find(row => row.project.id === projectId);
    if (!item) return { ok: false, reason: 'project not found' };
    const row = entry(projectId);
    row.grillSkipped = true;
    row.grillAsked = true;
    note(projectId, 'Skipped grill proposal for this project.');
    persist();
    return { ok: true, snapshot: await tick() };
  }

  function docsFor(folder) {
    return collectDocs(inspect(folder));
  }

  async function runOrder(order) {
    if (!order || !order.action) return { ok: false, reason: 'invalid order' };
    if (order.action === 'model') return setModelEnabled(order.id, order.enabled);
    if (order.action === 'lead') return setOrchestrator(order.id);
    if (order.action === 'mode') {
      const snapshot = await setMode(order.mode);
      return { ok: true, snapshot };
    }
    if (order.action === 'grillPropose') {
      const snapshot = await setGrillPropose(order.enabled, order.kind);
      return { ok: true, snapshot };
    }
    if (!order.projectId) return { ok: false, reason: 'project not found' };
    if (order.action === 'stop') return stop(order.projectId);
    if (order.action === 'resume') return resume(order.projectId);
    if (order.action === 'approve') return approve(order.projectId);
    if (order.action === 'skip') {
      if (typeof opts.applySkip === 'function') return opts.applySkip(order.projectId);
      return skipGrill(order.projectId);
    }
    if (order.action === 'start') {
      if (typeof opts.applyStart === 'function') return opts.applyStart(order.projectId, { timing: 'discretion' });
      const prepared = await startAutoTask(order.projectId, { timing: 'discretion' });
      return { ...prepared, snapshot: prepared.snapshot || await tick() };
    }
    if (order.action === 'watching') {
      return { ok: true, snapshot: await tick() };
    }
    return { ok: false, reason: 'unknown order' };
  }

  async function finishCancelled() {
    thinkingLive = null;
    return {
      ok: true,
      cancelled: true,
      asks: clone(store.asks || []),
      snapshot: await tick()
    };
  }

  async function abortAsk() {
    askToken += 1;
    const live = thinkingLive;
    thinkingLive = null;
    if (typeof opts.abortAsk === 'function') {
      try { opts.abortAsk(); } catch (_) {}
    }
    if (live && live.question) {
      const lead = leadModel();
      const started = live.startedAt ? Date.parse(live.startedAt) : NaN;
      const item = {
        at: now(),
        question: live.question,
        answer: 'Stopped.',
        thinking: live.thinking || null,
        ms: Number.isFinite(live.ms) ? live.ms : (Number.isFinite(started) ? Date.now() - started : null),
        projectId: null,
        orchestratorId: lead ? lead.id : null,
        order: 'abort'
      };
      store.asks = [item, ...(Array.isArray(store.asks) ? store.asks : [])].slice(0, 40);
      persist();
    }
    return { ok: true, aborted: Boolean(live), asks: clone(store.asks || []), snapshot: await tick() };
  }

  async function ask(question, projectId) {
    const q = String(question || '').trim();
    if (!q) return { ok: false, reason: 'empty question' };
    if (q.length > 2000) return { ok: false, reason: 'message too long' };
    const token = ++askToken;
    const askedAt = Date.now();
    let snap = await tick();
    if (token !== askToken) return finishCancelled();
    const order = parseOrder(q, snap, projectId);
    let answer;
    let thinking = '';
    let ms = null;
    if (order) {
      const acted = await runOrder(order);
      snap = acted.snapshot || await tick();
      const who = (snap && snap.orchestratorLabel) || ORCH_NAME;
      if (acted.ok && order.action === 'model') {
        answer = `${who}: ${order.label || order.id} is now ${order.enabled ? 'on' : 'off'}.`;
      } else if (acted.ok && order.action === 'lead') {
        answer = `${who}: orchestrator lead is now ${order.label || order.id}.`;
      } else if (acted.ok && order.action === 'mode') {
        answer = `${who}: mode is now ${order.mode === 'auto' ? 'Automatic' : 'Manual'}.`;
      } else if (acted.ok && order.action === 'grillPropose') {
        const kind = order.kind === 'docs' ? 'Grill with the docs' : (order.kind === 'me' ? 'Grill me' : 'Grill');
        answer = `${who}: ${kind} is now ${order.enabled ? 'on' : 'off'}. The orchestrator skips grill when both are off.`;
      } else if (acted.ok && order.action === 'start') {
        const phase = acted.phase === 'grill'
          ? 'Grill first, then workers can start'
          : (acted.phase === 'plan' ? 'Plan ready. Approve to assign workers' : 'started');
        answer = `${who}: ${phase} on ${order.name || order.projectId}. I dispatch; I do not do the job.`;
      } else if (acted.ok && order.action === 'approve') {
        const rowNow = (snap.projects || []).find(item => item.id === order.projectId);
        const crew = rowNow && Array.isArray(rowNow.dispatch) && rowNow.dispatch.length
          ? rowNow.dispatch.map(part => part.label).join(' + ')
          : (rowNow && rowNow.workerLabel) || 'workers';
        answer = `${who}: assigned ${crew} on ${order.name || order.projectId}. I dispatch; I do not do the job.`;
      } else if (acted.ok && order.action === 'watching') {
        const rowNow = (snap.projects || []).find(item => item.id === order.projectId);
        const crew = rowNow && Array.isArray(rowNow.dispatch) && rowNow.dispatch.length
          ? rowNow.dispatch.map(part => part.label).join(' + ')
          : (rowNow && rowNow.workerLabel) || 'workers';
        answer = `${who}: ${order.name || order.projectId} is already with ${crew}. I dispatch; I do not do the job.`;
      } else if (acted.ok && order.action === 'skip') {
        answer = `${who}: skipped grill on ${order.name || order.projectId}.`;
      } else if (acted.ok) {
        answer = `${who}: ${order.action} on ${order.name || order.projectId}.`;
      } else {
        answer = `${who}: could not ${order.action}: ${acted.reason || 'failed'}.`;
      }
    } else {
      const row = pickAskedProject(snap, projectId, q);
      if (row) {
        const inspected = await inspectRepository(row.id);
        if (token !== askToken) return finishCancelled();
        if (inspected.ok) {
          snap = inspected.snapshot;
          Object.assign(row, snap.projects.find(item => item.id === row.id));
        }
      }
      const fallback = answerQuestion(q, snap, projectId);
      const lead = leadModel();
      const history = (store.asks || []).slice(0, 16).slice().reverse().map(turn => ({
        user: turn.question,
        orchestrator: turn.answer
      }));
      if (typeof opts.askModel === 'function' && !lead) {
        answer = 'Pick an orchestrator model first (GPT-6 Astra, Grok 4.7, …). I coordinate workers; I do not do the job.';
      } else if (typeof opts.askModel === 'function' && lead) {
        if (token !== askToken) return finishCancelled();
        const started = Date.now();
        thinkingLive = {
          question: q,
          lead: lead.label,
          thinking: '',
          draft: '',
          startedAt: now(),
          ms: 0
        };
        try {
          const spoken = await opts.askModel({
            question: q,
            model: lead,
            projectId: (row && row.id) || fallback.projectId,
            folder: row && (row.folder || (row.facts && row.facts.folder)) || null,
            github: row && row.github || null,
            state: Object.assign({}, packState(snap, row), { history }),
            onProgress: part => {
              if (!part || typeof part !== 'object') return;
              thinkingLive = {
                question: q,
                lead: lead.label,
                thinking: typeof part.thinking === 'string' ? part.thinking : (thinkingLive && thinkingLive.thinking) || '',
                draft: typeof part.answer === 'string' ? part.answer : (thinkingLive && thinkingLive.draft) || '',
                startedAt: thinkingLive && thinkingLive.startedAt,
                ms: Number.isFinite(part.ms) ? part.ms : Date.now() - started
              };
            }
          });
          const unpacked = spoken && typeof spoken === 'object' && !Array.isArray(spoken)
            ? {
              answer: typeof spoken.answer === 'string' ? spoken.answer.trim() : '',
              thinking: typeof spoken.thinking === 'string' ? spoken.thinking.trim() : '',
              ms: Number.isFinite(spoken.ms) ? spoken.ms : Date.now() - started
            }
            : {
              answer: typeof spoken === 'string' ? spoken.trim() : '',
              thinking: '',
              ms: Date.now() - started
            };
          thinking = unpacked.thinking;
          ms = unpacked.ms;
          if (unpacked.answer) answer = unpacked.answer;
          else answer = `${lead.label} returned no answer. The provider CLI in the project folder produced nothing.`;
        } catch (error) {
          if (token !== askToken) return finishCancelled();
          ms = Date.now() - started;
          answer = `${lead.label} failed: ${(error && error.message) || 'CLI error'}.`;
        }
        thinkingLive = null;
        if (token !== askToken) return finishCancelled();
      } else {
        answer = fallback.answer;
      }
    }
    if (token !== askToken) return finishCancelled();
    if (!Number.isFinite(ms)) ms = Date.now() - askedAt;
    const row = pickAskedProject(snap, projectId, q);
    const lead = leadModel();
    const item = {
      at: now(),
      question: q,
      answer,
      thinking: thinking || null,
      ms: Number.isFinite(ms) ? ms : null,
      projectId: (row && row.id) || null,
      orchestratorId: lead ? lead.id : null,
      order: order ? order.action : null
    };
    store.asks = [item, ...(Array.isArray(store.asks) ? store.asks : [])].slice(0, 40);
    persist();
    snap = await tick();
    return {
      ok: true,
      question: q,
      answer,
      thinking: item.thinking,
      ms: item.ms,
      projectId: item.projectId,
      at: item.at,
      orchestratorId: item.orchestratorId,
      asks: clone(store.asks),
      snapshot: snap,
      order: order ? order.action : null
    };
  }

  async function setOrchestrator(id) {
    if (typeof id !== 'string' || !id.trim()) {
      store.orchestratorId = null;
      persist();
      return { ok: true, snapshot: await tick() };
    }
    const found = roster().find(item => item.id === id);
    if (!found) return { ok: false, reason: 'model not present' };
    if (!canOrchestrate(found)) return { ok: false, reason: 'model not eligible' };
    store.orchestratorId = found.id;
    persist();
    return { ok: true, snapshot: await tick() };
  }

  async function setModelEnabled(id, enabled) {
    if (typeof id !== 'string' || !id.trim()) return { ok: false, reason: 'invalid data' };
    const model = roster().find(item => item.id === id);
    if (!model) return { ok: false, reason: 'model not present' };
    if (enabled && !model.available) return { ok: false, reason: model.unavailableReason || 'model unavailable' };
    store.enabled[id] = Boolean(enabled);
    persist();
    return { ok: true, snapshot: await tick() };
  }

  async function approve(projectId) {
    if (typeof projectId !== 'string' || !projectId.trim()) return { ok: false, reason: 'invalid data' };
    const plan = await opts.readPlan();
    const item = notebookProjects(plan).find(row => row.project.id === projectId);
    if (!item) return { ok: false, reason: 'project not found' };
    const latest = item.revisions.at(-1);
    if (latest.open && latest.open.length) return { ok: false, reason: 'open questions remain' };
    if (!(item.tasks || []).some(task => task.status === 'running')) return { ok: false, reason: 'no running job' };
    if (!item.project.folder) return { ok: false, reason: 'no folder' };
    const row = entry(projectId);
    row.approved = true;
    row.holdApproval = false;
    note(projectId, 'User approved the execution plan. Passing the job to the worker.');
    persist();
    const view = await tick();
    return { ok: true, snapshot: view };
  }

  function readTiming(input) {
    const src = input && typeof input === 'object' ? input : {};
    if (src.timing === 'deadline') {
      if (typeof src.deadlineAt !== 'string' || !Number.isFinite(Date.parse(src.deadlineAt))) {
        return { ok: false, reason: 'deadline required' };
      }
      return { ok: true, timing: 'deadline', deadlineAt: new Date(src.deadlineAt).toISOString() };
    }
    return { ok: true, timing: 'discretion', deadlineAt: null };
  }

  async function composeGrillRound(item, facts, kind) {
    const latest = item.revisions.at(-1);
    const docs = kind === 'docs' ? collectDocs(facts) : [];
    const skillText = typeof opts.readSkill === 'function'
      ? (opts.readSkill('skills/productivity/grilling/SKILL.md') || '')
      : '';
    const docsSkill = kind === 'docs' && typeof opts.readSkill === 'function'
      ? (opts.readSkill('skills/engineering/grill-with-docs/SKILL.md') || '')
      : '';
    const lead = leadModel();
    if (typeof opts.askModel === 'function' && lead) {
      try {
        const spoken = await opts.askModel({
          question: grillPrompt(item, facts, [docsSkill, skillText].filter(Boolean).join('\n\n'), docs),
          model: lead,
          projectId: item.project.id,
          folder: item.project.folder || null,
          state: { name: item.project.name, goal: latest && latest.direction, folder: item.project.folder, docs }
        });
        const text = spoken && typeof spoken === 'object' && !Array.isArray(spoken) ? spoken.answer : spoken;
        const parsed = parseGrillQuestions(text);
        if (parsed.length) return parsed;
      } catch (_) {}
    }
    return Plan.grillFrontier({
      name: item.project.name,
      goal: latest && latest.direction,
      folder: item.project.folder,
      docs
    });
  }

  function releaseRunningJob(id, item, facts) {
    const job = (item.tasks || []).find(task => task.status === 'running');
    if (!job) return false;
    const row = entry(id);
    const livePids = Array.isArray(row.dispatch) && row.dispatch.some(part => part && part.pid);
    if (row.status === 'watching' || livePids) {
      writeCheckpoint(id, item, job, facts && !facts.error ? facts : row.facts, 'stop');
    } else {
      killDispatch(row);
      const live = attempts.getActiveAttempt({ projectId: id, taskId: job.id })
        || attempts.getActiveAttempt({ projectId: id });
      if (live && typeof attempts.closeAttempt === 'function') {
        attempts.closeAttempt({ attemptId: live.id, reason: 'restart' });
      }
    }
    row.jobId = null;
    row.attemptId = null;
    row.modelId = null;
    row.approved = false;
    row.holdApproval = false;
    row.resumeRequested = false;
    row.watchingSince = null;
    return true;
  }

  async function startAutoTask(projectId, options) {
    if (typeof projectId !== 'string' || !projectId.trim()) return { ok: false, reason: 'project not found' };
    const plan = await opts.readPlan();
    const item = notebookProjects(plan).find(row => row.project.id === projectId);
    if (!item) return { ok: false, reason: 'project not found' };
    if (!item.project.folder) return { ok: false, reason: 'no folder' };
    const row = entry(projectId);
    const source = options && options.timing ? options : (row.pendingAutoStart || options);
    const timing = readTiming(source);
    if (!timing.ok) return timing;
    const facts = inspect(item.project.folder);
    if (facts && facts.error) return { ok: false, reason: facts.error };
    const clearJob = releaseRunningJob(projectId, item, facts);
    const latest = item.revisions.at(-1);
    const continuing = Boolean(row.pendingAutoStart);
    row.pendingAutoStart = { timing: timing.timing, deadlineAt: timing.deadlineAt };
    row.facts = facts;
    if (!continuing) row.grillAsked = false;
    const open = latest && Array.isArray(latest.open) ? latest.open : [];
    const genericOpen = Plan.isGenericFrontier(open);
    const liveOpen = open.length && !genericOpen;
    const sessionGrill = store.grillPropose !== false && store.grillKind !== 'off' && !row.grillSkipped;
    if (liveOpen) {
      note(projectId, 'Auto start: waiting on Matt grilling answers.');
      persist();
      await tick();
      return { ok: true, phase: 'grill', job: null, facts, clearJob };
    }
    if (sessionGrill && !row.grillAsked) {
      const docs = collectDocs(facts);
      const wanted = store.grillKind === 'docs' || store.grillKind === 'me' ? store.grillKind : null;
      if (wanted === 'docs' && !docs.length) return { ok: false, reason: 'No docs in the folder to grill with' };
      const kind = wanted === 'me' ? 'me' : (wanted === 'docs' || docs.length ? 'docs' : 'me');
      const questions = await composeGrillRound(item, facts, kind);
      row.grillAsked = true;
      note(projectId, `Auto start: Matt grilling (${kind}) from mattpocock/skills main.`);
      persist();
      await tick();
      return {
        ok: true,
        phase: 'grill',
        job: null,
        facts,
        questions,
        title: kind === 'docs' ? 'Grill with the docs' : 'Grill me',
        kind,
        replace: genericOpen,
        clearJob
      };
    }
    const job = jobFromFacts(latest, facts);
    row.jobId = null;
    row.holdApproval = true;
    row.approved = false;
    row.pendingAutoStart = null;
    note(projectId, 'Read the repo and latest changes. Plan ready for approval.');
    persist();
    const payload = { title: job.title, detail: job.detail, revision_id: latest.id, timing: timing.timing };
    if (timing.timing === 'deadline') payload.deadlineAt = timing.deadlineAt;
    return { ok: true, phase: 'plan', job: payload, facts, clearJob };
  }

  async function resume(projectId) {
    if (typeof projectId !== 'string' || !projectId.trim()) return { ok: false, reason: 'invalid data' };
    const plan = await opts.readPlan();
    const item = notebookProjects(plan).find(row => row.project.id === projectId);
    if (!item) return { ok: false, reason: 'project not found' };
    if (!(item.tasks || []).some(task => task.status === 'running')) return { ok: false, reason: 'no running job' };
    const row = entry(projectId);
    if (!row.checkpoint) {
      const disk = readCheckpointFile(projectId);
      if (disk) row.checkpoint = disk;
    }
    if (!row.checkpoint) return { ok: false, reason: 'no checkpoint' };
    if (!item.tasks.some(task => task.status === 'running' && checkpointMatches(row.checkpoint, task))) return { ok: false, reason: 'checkpoint belongs to a different job' };
    killDispatch(row);
    row.dispatch = [];
    row.tried = [];
    row.attemptId = null;
    row.modelId = null;
    row.workerLog = null;
    row.resumeRequested = true;
    if (row.checkpoint.reason === 'deadline') row.deadlineHonored = true;
    row.approved = true;
    row.holdApproval = false;
    note(projectId, 'Resuming from checkpoint.');
    persist();
    return { ok: true, snapshot: await tick() };
  }

  async function stop(projectId) {
    if (typeof projectId !== 'string' || !projectId.trim()) return { ok: false, reason: 'invalid data' };
    const plan = await opts.readPlan();
    const item = notebookProjects(plan).find(row => row.project.id === projectId);
    if (!item) return { ok: false, reason: 'project not found' };
    const job = (item.tasks || []).find(task => task.status === 'running') || null;
    if (!job) return { ok: false, reason: 'no running job' };
    const row = entry(projectId);
    if (row.status !== 'watching') return { ok: false, reason: 'nothing to stop' };
    const facts = item.project.folder ? inspect(item.project.folder) : (row.facts || {});
    applyCheckpoint(projectId, item, job, facts && !facts.error ? facts : row.facts, 'stop');
    persist();
    return { ok: true, snapshot: await tick() };
  }

  async function shutdown() {
    shuttingDown = true;
    askToken += 1;
    thinkingLive = null;
    if (typeof opts.abortAsk === 'function') opts.abortAsk();
    const watching = Object.entries(store.projects).filter(([, row]) => row.status === 'watching');
    if (!watching.length) { persist(); return; }
    let plan;
    try { plan = await opts.readPlan(); }
    catch (_) {
      // Preserve the last known job even when the notebook becomes unreadable during shutdown.
      plan = { schema: 2, projects: watching.map(([id, row]) => ({
        project: { id, name: id },
        tasks: [{ id: row.jobId, title: row.jobTitle, detail: row.jobDetail, revision_id: row.jobRevisionId, status: 'running' }]
      })) };
    }
    for (const item of notebookProjects(plan)) {
      const row = entry(item.project.id);
      const job = (item.tasks || []).find(task => task.status === 'running');
      if (job && row.status === 'watching') applyCheckpoint(item.project.id, item, job, row.facts, 'shutdown');
    }
    persist();
  }

  function pidFor(attempt) {
    if (!attempt || typeof attempt !== 'object') return null;
    const attemptId = attempt.id;
    if (typeof attemptId !== 'string' || !attemptId) return null;
    for (const id of Object.keys(store.projects)) {
      const row = store.projects[id];
      if (row && row.attemptId === attemptId) return row.workerPid || null;
    }
    return null;
  }

  async function inspectRepository(projectId, options) {
    const plan = await opts.readPlan();
    const item = notebookProjects(plan).find(item => item.project.id === projectId);
    if (!item) return { ok: false, reason: 'project not found' };
    const repository = await readRepository(item.project, options);
    const row = entry(projectId);
    row.repository = repository;
    if (item.project.folder) row.facts = inspect(item.project.folder);
    persist();
    return { ok: true, repository, snapshot: snapshot(plan) };
  }

  return { tick, shutdown, approve, startAutoTask, resume, stop, setMode, setGrillPropose, skipGrill, docsFor, inspectRepository, setModelEnabled, setOrchestrator, ask, abortAsk, pidFor, snapshot: async () => snapshot(await opts.readPlan()) };
}

module.exports = { createOrchestrator, pickWorker, pickWorkers, normalizeModels, jobKind, defaultInspect, jobFromFacts, planLines, dispatchPlan, listDocs, collectDocs, grillDone, tailLog, lastActivity, interpretActivity, progressKey, sliceCount, answerQuestion, parseOrder, looksLikeWork, looksLikeQuestion, packState, canOrchestrate, usageOf, planExhausted, ORCH_NAME, LABELS, stepOf, pipelineOf, crewOf, PIPELINE_STEPS, parseGrillQuestions, grillPrompt };
