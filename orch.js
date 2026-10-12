'use strict';
(() => {
  const embedded = document.documentElement.hasAttribute?.('data-unified-app') || false;
  const $ = id => document.getElementById(embedded && id !== 'toast' ? `dashboard-${id}` : id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const themeKey = 'planwharf_theme';
  let orchestra = { mode: 'manual', models: [], projects: [], asks: [], fleet: [] };
  let version = null;
  let projectId = null;
  let toastTimer;
  let chatSig = '';
  let sending = false;
  let pendingText = '';
  let pendingStarted = 0;
  let thinkTimer = null;
  let askAbort = null;
  let sendGen = 0;
  const researchReports = new Map();
  const workerSessionStartedAt = Date.now();

  function formatMs(ms) {
    const n = Math.max(0, Number(ms) || 0);
    if (n < 1000) return `${Math.round(n)} ms`;
    const s = n / 1000;
    if (s < 60) return (s < 10 ? s.toFixed(1) : String(Math.round(s))) + 's';
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}m ${r}s`;
  }

  function thinkHtml(thinking, ms, open) {
    const hasThink = Boolean(thinking && String(thinking).trim());
    const hasMs = Number.isFinite(ms);
    if (!open && !hasThink && !hasMs) return '';
    if (open) {
      const body = hasThink
        ? `<pre class="chat-think-body">${escape(thinking)}</pre>`
        : '<p class="chat-think-body is-wait">Working…</p>';
      return `<div class="chat-think is-live"><p class="chat-think-head">Thinking · ${escape(formatMs(ms || 0))}</p>${body}</div>`;
    }
    if (hasThink) {
      return `<details class="chat-think"><summary>Thought for ${escape(formatMs(ms || 0))}</summary><pre class="chat-think-body">${escape(thinking)}</pre></details>`;
    }
    return `<p class="chat-elapsed">Answered in ${escape(formatMs(ms || 0))}</p>`;
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', next);
    const btn = $('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
      btn.setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      btn.setAttribute('title', next === 'light' ? 'Dark' : 'Light');
    }
    try { localStorage.setItem(themeKey, next); } catch {}
  }
  applyTheme(currentTheme());
  if ($('theme-toggle')) {
    $('theme-toggle').addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  }

  function clock(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function planById(id) {
    return (orchestra.plans || []).find(item => item && item.id === id) || null;
  }

  function formatReset(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function quotaHtml(plan) {
    const summary = PlanwharfQuota.html(plan);
    if (!plan || !plan.readable) return summary + (plan?.reason ? `<p class="muted">${escape(plan.reason)}</p>` : '');
    const windows = Array.isArray(plan.windows) && plan.windows.length ? plan.windows : [{ name: 'Provider quota', pct: plan.pct, leftPct: plan.leftPct }];
    return summary + windows.map(win => {
      const q = PlanwharfQuota.describe({ ...win, readable: true });
      const reset = formatReset(win.resetAt);
      return `<div class="quota quota-${q.band}"><p class="quota-window">${escape(win.name)}</p><div class="fleet-bar" role="progressbar" aria-valuemin="0" aria-valuenow="${q.remaining}" aria-valuemax="100" aria-label="${q.text}"><span style="width:${q.remaining}%"></span></div><p class="quota-line"><strong>${q.text}</strong><span>${reset ? `Resets ${escape(reset)}` : ''}</span></p></div>`;
    }).join('');
  }

  function notice(text) {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.textContent = ''; }, 6000);
  }

  function fillLead() {
    const el = $('orch-lead');
    if (!el) return;
    if (document.activeElement === el) return;
    const models = Array.isArray(orchestra.orchestrators) && orchestra.orchestrators.length
      ? orchestra.orchestrators
      : (orchestra.models || []).filter(item => item.enabled && (item.kind === 'premium' || item.kind === 'default'));
    const current = orchestra.orchestratorId || '';
    if (typeof el.setAttribute === 'function') el.setAttribute('data-quota-band', PlanwharfQuota.describe((orchestra.plans || []).find(p => p.id === (orchestra.models || []).find(m => m.id === current)?.plan)).band);
    const groups = [];
    const seen = new Map();
    models.forEach(item => {
      const plan = item.plan || 'Models';
      if (!seen.has(plan)) {
        seen.set(plan, []);
        groups.push(plan);
      }
      seen.get(plan).push(item);
    });
    const roster = orchestra.models || [];
    const options = groups.map(plan => `<optgroup label="${escape(plan)} | ${PlanwharfQuota.describe(planById(plan)).text}">${seen.get(plan).map(item => {
      const meter = planById(item.plan || plan);
      const tag = ` | ${PlanwharfQuota.describe(meter).text}`;
      return `<option class="quota-${PlanwharfQuota.describe(meter).band}" value="${escape(item.id)}"${item.id === current ? ' selected' : ''}>${escape(item.label)}${escape(tag)}</option>`;
    }).join('')}</optgroup>`).join('');
    el.innerHTML = `<option value="">Choose orchestrator</option>${options}`;
    const now = $('orch-lead-now');
    if (now) {
      const lead = roster.find(item => item.id === current);
      const meter = lead ? planById(lead.plan) : null;
      const tag = ` | ${PlanwharfQuota.describe(meter).text}`;
      now.textContent = lead ? `Lead: ${lead.label}${tag}` : 'Lead: none yet. Pick a model.';
    }
  }

  function chatSignature(asks) {
    const live = orchestra.thinking || {};
    const elapsed = sending && pendingStarted ? Math.floor((Date.now() - pendingStarted) / 250) : 0;
    return JSON.stringify((asks || []).map(item => [item.at, item.question, item.answer, item.ms, item.thinking]))
      + (sending ? `|pending:${pendingText}|${elapsed}|${live.thinking || ''}|${live.draft || ''}|${live.ms || 0}` : '');
  }

  function renderChat() {
    const el = $('orch-ask-thread');
    if (!el) return;
    const sessionFilter = $('worker-session-filter')?.value || 'current';
    const turns = (orchestra.asks || []).filter(item => sessionFilter === 'all' || sessionFilter === 'legacy' && !item.sessionId || sessionFilter === 'current' && Date.parse(item.at) >= workerSessionStartedAt || item.sessionId === sessionFilter);
    const items = turns.slice().reverse();
    const sig = sessionFilter + chatSignature(turns);
    if (sig === chatSig && el.childElementCount) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    chatSig = sig;
    if (!items.length && !sending) {
      el.innerHTML = '<div class="chat-empty"><p>Select a project recipient, then discuss the work or give an explicit command.</p><ul><li>Start</li><li>Resume</li><li>Stop</li><li>Skip grill</li><li>Switch to automatic</li><li>How much quota is left?</li></ul></div>';
      return;
    }
    const live = orchestra.thinking;
    const liveMs = live && Number.isFinite(live.ms) ? live.ms : (pendingStarted ? Date.now() - pendingStarted : 0);
    const pending = sending
      ? `<article class="chat-turn is-pending"><div class="chat-you"><p>${escape(pendingText)}</p></div><div class="chat-bot">${thinkHtml((live && live.thinking) || '', liveMs, true)}${live && live.draft ? `<p class="chat-draft">${escape(live.draft)}</p>` : ''}</div></article>`
      : '';
    el.innerHTML = items.map(item => {
      const order = item.order ? `<span class="chat-order">${escape(item.order)}</span>` : '';
      const elapsed = Number.isFinite(item.ms) ? ` · ${formatMs(item.ms)}` : '';
      return `<article class="chat-turn${item.order ? ' is-order' : ''}"><div class="chat-you"><p>${escape(item.question)}</p></div><div class="chat-bot">${order}${thinkHtml(item.thinking, item.ms, false)}<p data-chat-output>${escape(item.answer)}</p><button type="button" class="secondary compact chat-copy-output" data-copy-output>Copy output</button><time>${escape(clock(item.at))}${elapsed}</time></div></article>`;
    }).join('') + pending;
    if (nearBottom || sending || !items.length) el.scrollTop = el.scrollHeight;
  }

  function checkpointBanner(row) {
    if (!row || !row.checkpoint) return '';
    const why = row.checkpoint.reason;
    const line = why === 'stop'
      ? 'You stopped this job.'
      : (why === 'deadline' ? 'Time ran out.' : 'The job ended without completing.');
    return `<p class="checkpoint-flag" role="status"><span class="badge">Checkpoint saved</span> ${escape(line)} Resume continues from the last plan.</p>`;
  }

  function projectActions(row) {
    if (!row) return '';
    const id = row.id;
    const approve = row.status === 'needs_approval' ? `<button type="button" class="primary" data-approve="${escape(id)}">Go</button>` : '';
    const resume = row.canResume && row.status === 'checkpointed' ? `<button type="button" class="primary" data-resume="${escape(id)}">Resume</button>` : '';
    const stop = row.canStop ? `<button type="button" class="primary" data-stop="${escape(id)}">Stop</button>` : '';
    const propose = orchestra.grillPropose !== false;
    const kind = orchestra.grillKind === 'docs' ? 'docs' : (propose ? 'me' : 'off');
    const docsOk = row.canGrillDocs !== false;
    const busy = row.status === 'watching' || row.status === 'waiting_on_you' || row.status === 'propose_grill';
    const grillTriggers = approve || resume || stop || busy
      ? ''
      : `<button type="button" class="${kind === 'me' ? 'primary' : 'secondary'}" data-grill-kind="me" data-grill-start="${escape(id)}">Grill me</button><button type="button" class="${kind === 'docs' ? 'primary' : 'secondary'}" data-grill-kind="docs" data-grill-start="${escape(id)}"${docsOk ? '' : ' disabled'}>Grill with the docs</button>`;
    return `${approve}${grillTriggers}${resume}${stop}`;
  }

  function workerState(row, part) {
    if (part.stoppedByUser) return 'Paused';
    if (row.status === 'complete') return 'Finished';
    if (row.status === 'checkpointed') return 'Paused';
    if (row.status === 'failed') return 'Stopped';
    if (part.pid && part.alive) return 'Running';
    if (part.pid) return 'Exited';
    return 'Awaiting launch';
  }

  function workersHtml(rows) {
    const models = orchestra.models || orchestra.fleet || [];
    const workers = [...rows, ...(orchestra.workerHistory || [])].flatMap(row => {
      const parts = Array.isArray(row.dispatch) ? row.dispatch.filter(part => part && (part.pid || part.startedAt || part.resultPath)) : [];
      if (parts.length) return parts.map((part, index) => ({ row, part, index }));
      return row.workerPid ? [{ row, part: { modelId: row.modelId, label: row.workerLabel, pid: row.workerPid, alive: row.workerAlive, activity: row.workerActivity }, index: 0 }] : [];
    });
    (orchestra.researches || []).forEach(job => {
      const row = { id: job.id, projectId: job.projectId, research: true, name: job.projectName || 'Research', jobTitle: job.title, attemptId: job.attemptId, status: job.status, label: job.status, workerTail: job.workerTail || '', progressAt: job.updatedAt, reportAvailable: job.reportAvailable };
      workers.push({ row, part: { modelId: job.modelId, label: job.workerLabel, provider: job.provider, cli: job.cli, pid: job.pid, alive: job.alive, activity: job.activity || job.reason || '', slice: 'Research', sessionId: job.sessionId, startedAt: job.startedAt || job.createdAt }, index: 0 });
    });
    const globalRunning = workers.filter(({ row, part }) => workerState(row, part) === 'Running').length;
    const projectFilter = $('worker-project-filter')?.value || (projectId ? 'current' : 'all');
    const sessionFilter = $('worker-session-filter')?.value || 'current';
    const stateFilter = $('worker-state-filter')?.value || 'all';
    const visible = workers.filter(({ row, part }) =>
      (projectFilter === 'all' || (row.projectId || row.id) === (projectFilter === 'current' ? projectId : projectFilter)) &&
      (sessionFilter === 'all' || sessionFilter === 'legacy' && !part.sessionId || sessionFilter === 'current' && (orchestra.sessionId ? part.sessionId === orchestra.sessionId && Date.parse(part.startedAt) >= workerSessionStartedAt : false) || part.sessionId === sessionFilter) &&
      (stateFilter === 'all' || workerState(row, part) === stateFilter));
    const running = visible.filter(({ row, part }) => workerState(row, part) === 'Running').length;
    const paused = visible.filter(({ row, part }) => workerState(row, part) === 'Paused').length;
    const finished = visible.filter(({ row, part }) => workerState(row, part) === 'Finished').length;
    visible.sort((a, b) => Number(workerState(b.row, b.part) === 'Running') - Number(workerState(a.row, a.part) === 'Running'));
    return `<section class="dash-section dash-zone-workers" aria-label="Workers"><div class="workers-heading"><h3>Workers</h3><span class="badge${running ? ' green' : ''}">${running} running</span></div><p class="worker-legend" role="status">${globalRunning} active across all projects and sessions | ${running} running, ${paused} paused, ${finished} finished in this view. Previous sessions are hidden by default.</p><div class="dash-workers">${visible.map(({ row, part, index }) => {
      const model = models.find(item => item.id === part.modelId) || {};
      const state = workerState(row, part);
      const key = `${row.id}:${row.attemptId || ''}:${index}`;
      const progress = clock(row.monitoring && row.monitoring.lastProgress || row.progressAt);
      const activity = part.activity || row.workerActivity || 'No worker output yet.';
      const log = row.workerTail ? `<details class="monitor-log" data-worker-log="${escape(key)}"><summary>${(row.dispatch || []).length > 1 ? 'Project worker logs (all slices)' : 'Worker output'}</summary><pre class="worker-tail">${escape(row.workerTail)}</pre></details>` : '<p class="muted">No log output yet.</p>';
      const report = researchReports.get(row.id);
      const actions = row.research ? `<div class="now-actions">${row.reportAvailable || row.status === 'complete' ? `<button type="button" class="secondary compact" data-research-report="${escape(row.id)}">Read research report</button>` : ''}${state === 'Running' ? `<button type="button" class="secondary compact" data-research-stop="${escape(row.id)}">Stop</button>` : ''}${row.status === 'checkpointed' ? `<button type="button" class="secondary compact" data-research-resume="${escape(row.id)}">Resume</button>` : ''}</div>${report != null ? `<details class="monitor-log" data-worker-log="${escape(key)}:report" open><summary>Research report</summary><pre class="worker-tail">${escape(report)}</pre></details>` : ''}` : (state === 'Running' ? `<div class="now-actions"><button type="button" class="secondary compact" data-worker-stop="${escape(row.id)}" data-worker-pid="${escape(part.pid)}">Stop worker</button></div>` : '');
      return `<article class="dash-worker${state === 'Running' ? ' is-running' : ''}" data-worker-state="${escape(state)}"><header><strong>${escape(part.label || model.label || part.modelId || 'Unknown worker')}</strong><span class="badge${state === 'Running' ? ' green' : ''}">${escape(state)}</span></header><p class="worker-model">Provider: ${escape(part.provider || model.provider || 'unknown')} · Model: ${escape(part.cli || model.cli || part.modelId || 'unknown')} · ID: ${escape(part.modelId || 'unknown')}</p><p><strong>${escape(row.name)}</strong>${row.jobTitle ? ` · ${escape(row.jobTitle)}` : ''}</p><p class="muted">${escape(part.slice || 'Whole job')} · ${part.pid ? `PID ${escape(part.pid)} · ${part.alive ? 'alive' : 'not alive'}` : (state === 'Awaiting launch' ? 'No process launched' : 'No live process')} · Project: ${escape(row.label || row.status || 'unknown')}</p><p class="worker-activity">${escape(activity)}</p>${progress ? `<p class="muted">Last ${row.research ? 'research update' : 'project progress'}: ${escape(progress)}</p>` : ''}${log}${actions}</article>`;
    }).join('') || '<p class="workers-empty">No workers launched in the selected filters. Previous sessions remain available under All sessions.</p>'}</div></section>`;
  }

  function renderBoard() {
    const live = $('orch-live');
    const el = $('orchestrator');
    if (!el) return;
    const rows = orchestra.projects || [];
    const sessionControl = $('worker-session-filter');
    if (sessionControl) {
      const selectedSession = sessionControl.value || 'current';
      sessionControl.innerHTML = '<option value="current">Current view session</option><option value="all">All sessions</option><option value="legacy">Earlier sessions (before tracking)</option>' + (orchestra.sessions || []).slice().reverse().map(session => `<option value="${escape(session.id)}">${escape(session.startedAt ? new Date(session.startedAt).toLocaleString('en-GB') : 'Date not recorded')} (${escape(session.id.slice(0, 8))})</option>`).join('');
      sessionControl.value = ['current', 'all', 'legacy', ...(orchestra.sessions || []).map(session => session.id)].includes(selectedSession) ? selectedSession : 'current';
    }
    const projectFilter = $('worker-project-filter');
    if (projectFilter) {
      const selectedFilter = projectFilter.value || 'current';
      projectFilter.innerHTML = '<option value="current">Selected project</option><option value="all">All projects</option>' + rows.map(row => `<option value="${escape(row.id)}">${escape(row.name)}</option>`).join('');
      projectFilter.value = ['current', 'all', ...rows.map(row => row.id)].includes(selectedFilter) ? selectedFilter : 'current';
    }
    const fleet = Array.isArray(orchestra.fleet) && orchestra.fleet.length ? orchestra.fleet : (orchestra.models || []);
    const interventions = Array.isArray(orchestra.interventions) ? orchestra.interventions : [];
    const looked = clock(orchestra.updatedAt);
    const lead = orchestra.orchestratorLabel || 'Orchestrator';
    if (live) live.textContent = `${lead} · updated ${looked || 'just now'}. I intervene on stall, death, or FAILED.`;
    const plans = Array.isArray(orchestra.plans) ? orchestra.plans : [];
    const planCards = `<section class="dash-section dash-zone-plans"><h3>Provider quota remaining</h3><p class="muted">Shared across every model on that provider. If ChatGPT is exhausted, every ChatGPT model is exhausted.</p><div class="dash-models">${plans.map(item => {
      const badge = item.exhausted ? '<span class="badge off">Exhausted</span>' : (item.readable ? '<span class="badge green">Live</span>' : '<span class="badge">Unread</span>');
      return `<article class="dash-model${item.exhausted ? ' state-off' : ''}"><header><strong>${escape(item.label)}</strong>${badge}</header>${quotaHtml(item)}</article>`;
    }).join('') || '<p class="muted">Provider usage loads from the local Grok and ChatGPT logins.</p>'}</div></section>`;
    const models = `<section class="dash-section dash-zone-models"><h3>Models</h3><div class="dash-models">${fleet.map(item => {
      const jobs = item.assignments || [];
      const doing = jobs.map(job => `${job.project}: ${job.activity || job.slice || item.state}`).join(' · ') || (item.enabled ? 'Idle' : 'Off');
      const pids = jobs.map(job => `pid ${job.pid || '—'} ${job.alive ? 'alive' : 'stopped'}`).join(' · ');
      const leadBtn = item.eligible && !item.lead
        ? `<button type="button" class="secondary compact" data-lead="${escape(item.id)}">Use as orchestrator</button>`
        : '';
      const leadBadge = item.lead ? '<span class="badge green">Lead</span>' : (item.exhausted ? '<span class="badge off">Exhausted</span>' : `<span class="badge">${escape(item.state || 'idle')}</span>`);
      return `<article class="dash-model state-${escape(item.state || 'idle')}${item.lead ? ' is-lead' : ''}"><header><strong>${escape(item.label)}</strong>${leadBadge}</header><p class="muted">${escape(item.plan || '—')} · ${escape(item.role || 'Worker')}</p>${PlanwharfQuota.html(planById(item.plan))}<p>${escape(item.available === false ? item.unavailableReason : doing)}</p>${pids ? `<p class="muted">${escape(pids)}</p>` : ''}<div class="now-actions">${leadBtn}<button type="button" class="secondary compact" title="${escape(item.unavailableReason || item.cli || '')}" ${item.available === false ? 'disabled' : ''} data-model="${escape(item.id)}" data-enabled="${item.enabled ? '0' : '1'}">${item.available === false ? 'Unavailable' : (item.enabled ? 'On' : 'Off')}</button></div></article>`;
    }).join('')}</div></section>`;
    const processes = `<section class="dash-section dash-zone-procs"><h3>Processes</h3><div class="dash-procs">${rows.map(row => {
      const parts = row.dispatch || [];
      const slices = parts.length
        ? parts.map(part => `<li><strong>${escape(part.label || part.modelId)}</strong> · ${escape(part.slice || 'whole job')} · pid ${escape(String(part.pid || '—'))} ${part.alive ? 'alive' : 'stopped'} · ${escape(part.activity || row.workerActivity || 'quiet')}</li>`).join('')
        : `<li class="muted">${row.workerLabel ? escape(row.workerLabel) : 'No process yet.'}</li>`;
      const log = row.workerTail ? `<details class="monitor-log"><summary>Live log</summary><pre class="worker-tail">${escape(row.workerTail)}</pre></details>` : '';
      const monitor = row.monitoring ? `<p class="muted">${row.monitoring.alive}/${row.monitoring.workers} alive · ${row.monitoring.folderFiles} files</p>` : '';
      return `<article class="dash-proc ${escape(row.status)}"><header><strong>${escape(row.name)}</strong><span class="orch-status">${escape(row.label)}</span></header>${checkpointBanner(row)}<p>${escape(row.analysis || row.orchestratorDoing || row.doing || '')}</p>${monitor}<ol class="dash-slices">${slices}</ol>${log}<div class="now-actions">${projectActions(row)}</div></article>`;
    }).join('') || '<p class="muted">No projects in the notebook.</p>'}</div></section>`;
    const iv = `<section class="dash-section dash-zone-iv"><h3>Interventions</h3>${interventions.length
      ? `<ol class="dash-iv">${interventions.map(item => `<li><time>${escape(clock(item.at))}</time> ${escape(item.project)} · ${escape(item.text)}</li>`).join('')}</ol>`
      : '<p class="muted">No interventions yet. I switch workers on stall, death, or FAILED.</p>'}</section>`;
    const openLogs = new Set(Array.from(el.querySelectorAll('details[data-worker-log][open]')).map(detail => detail.getAttribute('data-worker-log')));
    el.innerHTML = `${workersHtml(rows)}${planCards}${models}${processes}${iv}`;
    el.querySelectorAll('details[data-worker-log]').forEach(detail => {
      if (openLogs.has(detail.getAttribute('data-worker-log'))) detail.open = true;
    });
  }

  function render() {
    const recipient = $('orch-project');
    const projects = orchestra.projects || [];
    try { projectId = localStorage.getItem('planwharf_chat_project') || projectId; } catch (_) {}
    if (!projects.some(row => row.id === projectId)) projectId = null;
    if (recipient) recipient.innerHTML = '<option value="">Select a project</option>' + projects.map(row => `<option value="${escape(row.id)}"${row.id === projectId ? ' selected' : ''}>${escape(row.name)}</option>`).join('');
    fillLead();
    renderChat();
    renderBoard();
  }

  async function refresh() {
    try {
      const response = await fetch('/api/orchestrator');
      if (!response.ok) return;
      const snap = await response.json();
      const keep = sending ? orchestra.thinking : null;
      orchestra = snap;
      if (keep && !orchestra.thinking) orchestra.thinking = keep;
      render();
    } catch (_) {}
  }

  async function loadPlan() {
    const response = await fetch('/api/plan');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Save failed.');
    version = body.version;
  }

  async function post(url, payload, signal) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}), signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Save failed.');
    return body;
  }

  function setComposer(busy) {
    const input = $('orch-ask-input');
    const submit = $('orch-ask-submit');
    const stop = $('orch-ask-stop');
    if (input) input.disabled = false;
    if (submit) {
      submit.disabled = false;
      submit.hidden = Boolean(busy);
    }
    if (stop) stop.hidden = !busy;
  }

  function stopThinkTimers() {
    if (!thinkTimer) return;
    clearInterval(thinkTimer.clock);
    clearInterval(thinkTimer.poll);
    thinkTimer = null;
  }

  function endSend() {
    stopThinkTimers();
    sending = false;
    pendingText = '';
    pendingStarted = 0;
    orchestra.thinking = null;
    askAbort = null;
    setComposer(false);
    chatSig = '';
    render();
  }

  if ($('orch-lead')) {
    $('orch-lead').addEventListener('change', async event => {
      const id = event.target.value;
      try {
        orchestra = await post('/api/orchestrator/lead', { id });
        render();
        notice(id ? `Orchestrator is now ${(orchestra.orchestratorLabel || id)}.` : 'Orchestrator lead cleared.');
      } catch (error) {
        notice(error.message);
      }
    });
  }

  async function cancelAsk() {
    if (!sending) return;
    sendGen += 1;
    const previous = pendingText;
    try {
      const body = await post('/api/orchestrator/ask/cancel', {});
      if (body.snapshot) orchestra = Object.assign(orchestra, body.snapshot);
      if (Array.isArray(body.asks)) orchestra.asks = body.asks;
    } catch (_) {}
    if (askAbort) {
      try { askAbort.abort(); } catch (_) {}
    }
    endSend();
    const input = $('orch-ask-input');
    if (input && !input.value && previous) input.value = previous;
    if (input) input.focus();
  }

  async function sendChat() {
    const input = $('orch-ask-input');
    const question = input && input.value ? input.value.trim() : '';
    if (sending) {
      const next = question;
      await cancelAsk();
      if (next && input) input.value = next;
      if (!next) return;
    }
    if (!question && !(input && input.value.trim())) return;
    const text = (input && input.value ? input.value.trim() : question);
    if (!text) return;
    const myGen = ++sendGen;
    sending = true;
    pendingText = text;
    pendingStarted = Date.now();
    orchestra.thinking = { question: text, thinking: '', draft: '', ms: 0 };
    askAbort = typeof AbortController === 'function' ? new AbortController() : null;
    setComposer(true);
    if (input) input.value = '';
    chatSig = '';
    renderChat();
    const pollThink = async () => {
      if (myGen !== sendGen) return;
      try {
        const response = await fetch('/api/orchestrator');
        if (!response.ok) return;
        const snap = await response.json();
        const keepThinking = orchestra.thinking;
        orchestra = snap;
        if (!orchestra.thinking) orchestra.thinking = keepThinking;
        render();
      } catch (_) {}
    };
    stopThinkTimers();
    thinkTimer = {
      clock: setInterval(() => { renderChat(); }, 250),
      poll: setInterval(pollThink, 500)
    };
    pollThink();
    try {
      try { projectId = localStorage.getItem('planwharf_chat_project') || projectId; } catch (_) {}
      if (!projectId || !(orchestra.projects || []).some(row => row.id === projectId)) throw new Error('Select the project recipient before sending.');
      const body = await post('/api/orchestrator/ask', { question: text, projectId, ...(typeof window !== 'undefined' && window.PlanwharfChatSessionId ? { chatSessionId: window.PlanwharfChatSessionId } : {}) }, askAbort ? askAbort.signal : undefined);
      if (myGen !== sendGen) return;
      if (body.snapshot) orchestra = Object.assign(orchestra, body.snapshot);
      orchestra.asks = body.asks || orchestra.asks || [];
      orchestra.thinking = null;
    } catch (error) {
      if (myGen !== sendGen) return;
      if (!error || error.name !== 'AbortError') notice(error.message);
      if (input && !input.value) input.value = text;
    } finally {
      if (myGen !== sendGen) return;
      endSend();
      if (input) input.focus();
    }
  }

  if ($('orch-ask-form')) {
    $('orch-ask-form').addEventListener('submit', event => {
      event.preventDefault();
      sendChat();
    });
  }
  if ($('orch-ask-stop')) {
    $('orch-ask-stop').addEventListener('click', event => {
      event.preventDefault();
      cancelAsk();
    });
  }
  if ($('orch-ask-input')) {
    $('orch-ask-input').addEventListener('keydown', event => {
      if (event.key === 'Escape' && sending) {
        event.preventDefault();
        cancelAsk();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });
  }

  if ($('orchestrator')) {
    $('orchestrator').addEventListener('click', async event => {
      const researchReport = event.target && event.target.getAttribute && event.target.getAttribute('data-research-report');
      const researchStop = event.target && event.target.getAttribute && event.target.getAttribute('data-research-stop');
      const researchResume = event.target && event.target.getAttribute && event.target.getAttribute('data-research-resume');
      const leadId = event.target && event.target.getAttribute && event.target.getAttribute('data-lead');
      const modelId = event.target && event.target.getAttribute && event.target.getAttribute('data-model');
      const stopId = event.target && event.target.getAttribute && event.target.getAttribute('data-stop');
      const resumeId = event.target && event.target.getAttribute && event.target.getAttribute('data-resume');
      const approveId = event.target && event.target.getAttribute && event.target.getAttribute('data-approve');
      const grillStartId = event.target && event.target.getAttribute && event.target.getAttribute('data-grill-start');
      const grillStartKind = event.target && event.target.getAttribute && event.target.getAttribute('data-grill-kind');
      try {
        const workerStop = event.target.closest('[data-worker-stop]');
        if (workerStop) {
          workerStop.disabled = true;
          try {
            const body = await post('/api/orchestrator/worker/stop', { projectId: workerStop.dataset.workerStop, pid: Number(workerStop.dataset.workerPid) });
            orchestra = body.snapshot;
            render();
            notice('Worker stopped. Other slices continue.');
          } finally { workerStop.disabled = false; }
          return;
        }
        if (researchReport) {
          const response = await fetch(`/api/orchestrator/research/report?id=${encodeURIComponent(researchReport)}`);
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'Report unavailable.');
          researchReports.set(researchReport, body.report || 'No report output yet.');
          renderBoard();
          return;
        }
        if (researchStop || researchResume) {
          const body = await post(`/api/orchestrator/research/${researchStop ? 'stop' : 'resume'}`, { id: researchStop || researchResume });
          if (body.ok === false) throw new Error(body.reason || 'Research action failed.');
          if (body.snapshot) orchestra = body.snapshot;
          render();
          return;
        }
        if (leadId) {
          orchestra = await post('/api/orchestrator/lead', { id: leadId });
          render();
          notice(`Orchestrator is now ${(orchestra.orchestratorLabel || leadId)}.`);
          return;
        }
        if (modelId) {
          const enabled = event.target.getAttribute('data-enabled') === '1';
          orchestra = await post('/api/orchestrator/model', { id: modelId, enabled });
          render();
          return;
        }
        if (stopId) {
          orchestra = await post('/api/orchestrator/stop', { projectId: stopId });
          render();
          notice('Stopped. Checkpoint saved. Press Resume to continue from the last plan.');
          return;
        }
        if (resumeId) {
          orchestra = await post('/api/orchestrator/resume', { projectId: resumeId });
          render();
          notice('Resumed from checkpoint.');
          return;
        }
        if (approveId) {
          orchestra = await post('/api/orchestrator/approve', { projectId: approveId });
          render();
          notice('Run approved.');
          return;
        }
        if (grillStartId && (grillStartKind === 'me' || grillStartKind === 'docs')) {
          orchestra = await post('/api/orchestrator/grill', { propose: true, kind: grillStartKind });
          if (!version) await loadPlan();
          const body = await post('/api/orchestrator/start', { version, projectId: grillStartId, timing: 'discretion' });
          if (body.snapshot) orchestra = body.snapshot;
          if (body.version) version = body.version;
          render();
          notice(body.phase === 'grill' ? 'Grill first, then work can start.' : 'Plan ready. Approve to assign.');
        }
      } catch (error) {
        notice(error.message);
      }
    });
  }

  ['worker-project-filter', 'worker-session-filter', 'worker-state-filter'].forEach(id => { if ($(id)) $(id).addEventListener('change', () => { renderChat(); renderBoard(); }); });
  if ($('orch-project')) $('orch-project').addEventListener('change', event => {
    projectId = event.target.value || null;
    try { localStorage.setItem('planwharf_chat_project', projectId || ''); } catch (_) {}
    if (embedded && projectId) window.dispatchEvent(new CustomEvent('planwharf-select-project', { detail: projectId }));
    render();
  });
  if (embedded) window.addEventListener('planwharf-project', event => {
    projectId = event.detail;
    render();
  });
  if (embedded) window.addEventListener('planwharf-view', event => {
    if (event.detail === 'orchestrator') refresh();
  });
  if (typeof window !== 'undefined') window.addEventListener('storage', event => {
    if (event.key === 'planwharf_chat_project') { projectId = event.newValue || null; render(); }
  });
  loadPlan().catch(() => {});
  refresh();
  setInterval(refresh, 4000);
  document.body.setAttribute('data-orch-ready', '1');
})();
