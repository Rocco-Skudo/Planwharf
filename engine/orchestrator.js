'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LABELS = {
  waiting_on_you: 'Waiting on you',
  propose_grill: 'Grill first',
  idle: 'Idle',
  blocked_no_folder: 'Needs a folder',
  blocked_no_worker: 'No eligible worker',
  needs_approval: 'Plan ready',
  watching: 'Watching',
  complete: 'Evidence complete',
  failed: 'Stopped'
};

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
    enabled: item.enabled === true,
    plan: typeof item.plan === 'string' && item.plan.trim() ? item.plan : 'Unnamed plan',
    kind: item.kind === 'premium' || item.kind === 'local' ? item.kind : 'default',
    cost: Number.isFinite(item.cost) && item.cost >= 0 ? item.cost : 1,
    limit: Number.isFinite(item.limit) && item.limit > 0 ? item.limit : 50
  }));
}

function usedOf(usage, id) {
  const row = usage && usage[id];
  return row && Number.isFinite(row.used) ? row.used : 0;
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
  const kind = jobKind(opts.job);
  const rank = {
    inspect: { local: 3, default: 2, premium: 1 },
    build: { default: 3, premium: 2, local: 1 },
    hard: { premium: 3, default: 2, local: 1 }
  };
  const pool = normalizeModels(models)
    .map((item, index) => ({ ...item, index }))
    .filter(item => item.enabled && usedOf(usage, item.id) + item.cost <= item.limit);
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
  const subject = (facts && facts.lastSubject) || 'latest repo changes';
  const title = clip(`Continue: ${subject}`, 120) || 'Continue from the repo';
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

function planLines(item, facts, shown, active) {
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
  lines.push(`${active ? 'Assigned' : 'Pick'} ${shown.label || shown.id}${shown.why ? ` (${shown.why})` : ''}.`);
  lines.push('Watch for a result file with STATUS: COMPLETE. Do not start a paid API.');
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
    log: []
  };
}

function createOrchestrator(options) {
  const opts = options && typeof options === 'object' ? options : {};
  if (typeof opts.readPlan !== 'function') throw new Error('orchestrator requires readPlan');
  if (!opts.attempts) throw new Error('orchestrator requires attempts');
  const attempts = opts.attempts;
  const sentinel = opts.sentinel || null;
  const models = Array.isArray(opts.models) ? opts.models : [];
  const inspect = typeof opts.inspectFolder === 'function' ? opts.inspectFolder : defaultInspect;
  const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
  const dir = typeof opts.dir === 'string' && opts.dir.trim() ? opts.dir : null;
  const stateFile = dir ? path.join(dir, 'orchestrator.json') : null;
  let store = { mode: 'manual', grillPropose: true, usage: {}, enabled: {}, projects: {} };
  if (stateFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        store = {
          mode: parsed.mode === 'auto' ? 'auto' : 'manual',
          grillPropose: parsed.grillPropose === false ? false : true,
          usage: parsed.usage && typeof parsed.usage === 'object' ? parsed.usage : {},
          enabled: parsed.enabled && typeof parsed.enabled === 'object' ? parsed.enabled : {},
          projects: parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {}
        };
      }
    } catch (_) {}
  }

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

  function roster() {
    return normalizeModels(models).map(item => {
      if (typeof store.enabled[item.id] === 'boolean') item.enabled = store.enabled[item.id];
      const used = usedOf(store.usage, item.id);
      return { ...item, used, remaining: Math.max(0, item.limit - used) };
    });
  }

  function snapshot(plan) {
    const projects = notebookProjects(plan);
    return {
      updatedAt: now(),
      mode: store.mode === 'auto' ? 'auto' : 'manual',
      grillPropose: store.grillPropose !== false,
      models: roster(),
      projects: projects.map(item => {
        const row = entry(item.project.id);
        const latest = item.revisions.at(-1);
        const docs = Array.isArray(row.docs) && row.docs.length ? row.docs : collectDocs(row.facts);
        return {
          id: item.project.id,
          name: item.project.name,
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
          resultPath: row.resultPath || null,
          watchingSince: row.watchingSince || null,
          approved: Boolean(row.approved),
          canStart: Boolean(
            item.project.folder
            && !(latest && Array.isArray(latest.open) && latest.open.length)
            && !(item.tasks || []).some(task => task.status === 'running')
          ),
          canGrillDocs: docs.length > 0,
          docs: clone(docs),
          grillSkipped: Boolean(row.grillSkipped),
          log: clone(row.log || [])
        };
      })
    };
  }

  function decide(item) {
    const id = item.project.id;
    const row = entry(id);
    const latest = item.revisions.at(-1);
    const job = (item.tasks || []).find(task => task.status === 'running') || null;
    const open = latest && Array.isArray(latest.open) ? latest.open : [];
    const worker = pickWorker(roster(), { job, usage: store.usage });

    if (job && row.jobId && row.jobId !== job.id) {
      row.approved = false;
      row.holdApproval = false;
      row.attemptId = null;
      row.modelId = null;
      row.plan = [];
      note(id, 'Job changed. Approval reset.');
    }
    row.jobId = job ? job.id : null;
    row.jobTitle = job ? job.title : null;

    if (open.length) {
      row.status = 'waiting_on_you';
      row.doing = `${open.length} open question${open.length === 1 ? '' : 's'} on ${item.project.name}. Grill me first. The orchestrator does not assign a worker yet.`;
      row.waitingFor = 'Grill me answers';
      row.next = 'Open Grill me on this project.';
      row.workerLabel = null;
      row.watchingSince = null;
      row.facts = null;
      row.approved = false;
      row.holdApproval = false;
      return row;
    }
    if (!job && store.grillPropose !== false && !row.grillSkipped && !grillDone(item)) {
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
        ? `${item.project.name} has not been grilled. Grill me, or Grill with the docs (${docs.join(', ')}). Skip if you will not rely on it.`
        : `${item.project.name} has not been grilled. Grill me, or set a folder to Grill with the docs. Skip if you will not rely on it.`;
      row.waitingFor = 'Grill me, Grill with the docs, or skip';
      row.next = docs.length ? 'Grill with the docs, or Grill me.' : 'Grill me. Set a folder to grill with the docs.';
      row.workerLabel = null;
      row.attemptId = null;
      row.watchingSince = null;
      row.approved = false;
      row.holdApproval = false;
      return row;
    }
    if (!job) {
      row.status = 'idle';
      row.doing = `No job on ${item.project.name}. Start auto task to read the repo and latest changes, then approve the plan.`;
      row.waitingFor = 'Start auto task';
      row.next = 'Start auto task to read the repo and latest changes.';
      row.workerLabel = null;
      row.attemptId = null;
      row.watchingSince = null;
      row.facts = null;
      row.docs = [];
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
      row.doing = 'No eligible worker with remaining quota. Turn a model on or wait for the plan limit.';
      row.waitingFor = 'An enabled model with remaining quota';
      row.next = 'Turn a model on, or wait until a plan limit resets.';
      row.workerLabel = null;
      return row;
    }
    const active = attempts.getActiveAttempt({ projectId: id, taskId: job.id })
      || attempts.getActiveAttempt({ projectId: id });
    const assigned = active ? roster().find(itemModel => itemModel.id === active.modelId) : null;
    const shown = assigned || worker;
    row.plan = planLines(item, facts, shown, active);
    if (store.mode === 'auto' && !row.holdApproval) row.approved = true;
    if (!row.approved) {
      row.status = 'needs_approval';
      row.doing = `Execution plan ready for ${item.project.name} · ${job.title}. Approve to assign ${worker.label || worker.id} (${worker.why}).`;
      row.waitingFor = 'Your Approve run';
      row.next = `Approve to assign ${worker.label || worker.id}.`;
      row.workerLabel = worker.label || worker.id;
      row.watchingSince = null;
      return row;
    }

    if (!active) {
      const claimed = attempts.claim({
        taskId: job.id,
        projectId: id,
        modelId: worker.id,
        candidates: roster()
      });
      if (!claimed || !claimed.ok) {
        row.status = 'blocked_no_worker';
        row.doing = `Could not assign a worker: ${claimed && claimed.reason ? claimed.reason : 'claim failed'}.`;
        row.waitingFor = 'A successful claim';
        row.next = claimed && claimed.reason ? claimed.reason : 'Claim failed.';
        row.workerLabel = null;
        return row;
      }
      row.attemptId = claimed.attempt.id;
      row.modelId = claimed.attempt.modelId;
      row.workerLabel = worker.label || worker.id;
      const file = resultPathFor(claimed.attempt.id);
      row.resultPath = file || null;
      if (file) {
        attempts.attachResult({ attemptId: claimed.attempt.id, resultPath: file });
        const names = (facts.names || []).join(', ');
        writeWatchFile(file, [
          `PROJECT: ${item.project.name}`,
          `JOB: ${job.title}`,
          `WORKER: ${worker.label || worker.id}`,
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
      if (!store.usage[worker.id]) store.usage[worker.id] = { used: 0 };
      store.usage[worker.id].used += worker.cost;
      note(id, `Assigned ${worker.label || worker.id} (${worker.why}) to ${job.title}. Watching for COMPLETE.`);
      row.watchingSince = now();
    } else {
      row.attemptId = active.id;
      row.modelId = active.modelId;
      row.workerLabel = (assigned && (assigned.label || assigned.id)) || active.modelId;
      row.resultPath = active.resultPath || row.resultPath || resultPathFor(active.id) || null;
      if (!row.watchingSince) row.watchingSince = now();
    }

    const watching = attempts.getActiveAttempt({ projectId: id, taskId: job.id })
      || attempts.getActiveAttempt({ projectId: id });
    if (watching && sentinel && typeof sentinel.tick === 'function') {
      const tick = sentinel.tick(watching);
      if (tick && tick.complete) {
        row.status = 'complete';
        row.doing = `Evidence complete for ${job.title} on ${item.project.name}.`;
        row.waitingFor = 'Nothing. Evidence is complete.';
        row.next = 'Read the result, or add a new job.';
        note(id, 'Sentinel saw STATUS: COMPLETE.');
        return row;
      }
      if (tick && tick.closed) {
        row.status = 'failed';
        row.doing = `Watch stopped for ${job.title}: ${tick.reason || 'no verdict'}.`;
        row.waitingFor = 'A new run';
        row.next = tick.reason || 'Watch stopped.';
        row.approved = false;
        row.watchingSince = null;
        return row;
      }
    }
    const modelName = (roster().find(itemModel => itemModel.id === row.modelId) || {}).label || row.modelId || worker.label;
    const gitBit = facts.git ? ` git ${facts.head || 'yes'}` : '';
    row.status = 'watching';
    row.doing = `${modelName} claimed ${job.title} on ${item.project.name}. Inspected ${facts.fileCount} top-level names${gitBit}. Waiting for a result file with STATUS: COMPLETE. Nothing is executing a model process.`;
    row.waitingFor = 'A result file with STATUS: COMPLETE';
    row.next = 'Keep watching. Planwharf is not running a model process.';
    row.workerLabel = modelName;
    return row;
  }

  async function tick() {
    const plan = await opts.readPlan();
    for (const item of notebookProjects(plan)) decide(item);
    persist();
    return snapshot(plan);
  }

  async function setMode(mode) {
    store.mode = mode === 'auto' ? 'auto' : 'manual';
    persist();
    return tick();
  }

  async function setGrillPropose(enabled) {
    store.grillPropose = enabled !== false;
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
    note(projectId, 'Skipped grill proposal for this project.');
    persist();
    return { ok: true, snapshot: await tick() };
  }

  function docsFor(folder) {
    return collectDocs(inspect(folder));
  }

  async function setModelEnabled(id, enabled) {
    if (typeof id !== 'string' || !id.trim()) return { ok: false, reason: 'invalid data' };
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

  async function startAutoTask(projectId) {
    if (typeof projectId !== 'string' || !projectId.trim()) return { ok: false, reason: 'project not found' };
    const plan = await opts.readPlan();
    const item = notebookProjects(plan).find(row => row.project.id === projectId);
    if (!item) return { ok: false, reason: 'project not found' };
    const latest = item.revisions.at(-1);
    if (latest.open && latest.open.length) return { ok: false, reason: 'open questions remain' };
    if ((item.tasks || []).some(task => task.status === 'running')) return { ok: false, reason: 'job already running' };
    if (!item.project.folder) return { ok: false, reason: 'no folder' };
    const facts = inspect(item.project.folder);
    if (facts && facts.error) return { ok: false, reason: facts.error };
    const job = jobFromFacts(latest, facts);
    const row = entry(projectId);
    row.jobId = null;
    row.holdApproval = true;
    row.approved = false;
    row.facts = facts;
    note(projectId, 'Read the repo and latest changes. Plan ready for approval.');
    persist();
    return { ok: true, job: { title: job.title, detail: job.detail, revision_id: latest.id }, facts };
  }

  return { tick, approve, startAutoTask, setMode, setGrillPropose, skipGrill, docsFor, setModelEnabled, snapshot: async () => snapshot(await opts.readPlan()) };
}

module.exports = { createOrchestrator, pickWorker, normalizeModels, jobKind, defaultInspect, jobFromFacts, planLines, listDocs, collectDocs, grillDone, LABELS };
