'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => new Date(value).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const labels = { direction: 'Goal', state: 'Where it stands', closed: 'Decided', open: 'Still open' };
  let data = null;
  let projectId = null;
  const project = () => data.schema === 2 ? data.projects.find(p => p.project.id === projectId) : data;
  let version = null;
  let selected = null;
  let saving = false;

  const themeKey = 'planwharf_theme';
  function currentTheme() {
    const root = document.documentElement;
    if (!root || typeof root.getAttribute !== 'function') return 'dark';
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    const root = document.documentElement;
    if (root && typeof root.setAttribute === 'function') root.setAttribute('data-theme', next);
    const meta = document.querySelector && document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', next);
    const btn = $('theme-toggle');
    if (btn) {
      btn.textContent = next === 'light' ? 'Dark' : 'Light';
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
        btn.setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      }
    }
    try { localStorage.setItem(themeKey, next); } catch {}
  }
  applyTheme(currentTheme());
  if ($('theme-toggle') && typeof $('theme-toggle').addEventListener === 'function') {
    $('theme-toggle').addEventListener('click', () => {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  const seenKey = id => `planwharf_seen_${id}`;
  function getSeenRevision(pId) {
    try {
      const raw = localStorage.getItem(seenKey(pId));
      if (raw === null) return null;
      const num = Number(raw);
      return Number.isSafeInteger(num) && num > 0 ? num : null;
    } catch {
      return null;
    }
  }
  function setSeenRevision(pId, revId) {
    try {
      localStorage.setItem(seenKey(pId), String(revId));
    } catch {}
  }

  const projectReturnState = new Map();

  function initProjectReturnState(pId) {
    const p = data.schema === 2 ? data.projects.find(x => x.project.id === pId) : data;
    if (!p || !p.revisions.length) return null;
    const current = p.revisions.at(-1);
    const lastSeenId = getSeenRevision(pId);

    let state;
    if (lastSeenId === null) {
      // First access: no invented diff, define first access without inventing a seen revision
      setSeenRevision(pId, current.id);
      state = {
        type: 'first_access',
        lastSeenId: null,
        currentId: current.id,
        fromRevision: null,
        toRevision: current,
        changes: []
      };
    } else if (lastSeenId === current.id) {
      // Nothing new since last visit
      state = {
        type: 'no_changes',
        lastSeenId,
        currentId: current.id,
        fromRevision: null,
        toRevision: current,
        changes: []
      };
    } else if (lastSeenId < current.id) {
      // Jump from previously seen revision to current (even across multiple revisions)
      const fromRevision = p.revisions.find(r => r.id === lastSeenId);
      if (fromRevision) {
        const changes = Planwharf.diff(fromRevision, current);
        // Update seen marker to current without losing comparison shown during reopen
        setSeenRevision(pId, current.id);
        state = {
          type: 'jump',
          lastSeenId,
          currentId: current.id,
          fromRevision,
          toRevision: current,
          changes
        };
      } else {
        setSeenRevision(pId, current.id);
        state = {
          type: 'first_access',
          lastSeenId: null,
          currentId: current.id,
          fromRevision: null,
          toRevision: current,
          changes: []
        };
      }
    } else {
      setSeenRevision(pId, current.id);
      state = {
        type: 'no_changes',
        lastSeenId: current.id,
        currentId: current.id,
        fromRevision: null,
        toRevision: current,
        changes: []
      };
    }

    projectReturnState.set(pId, state);
    return state;
  }

  const claimReasonTranslations = {
    'dati non validi': 'invalid data',
    'nessun modello acceso': 'no model enabled',
    'modello non presente': 'model not present',
    'modello spento': 'model disabled',
    'modello non candidabile': 'model not eligible',
    'task già assegnato': 'task already assigned',
    'progetto già assegnato': 'project already assigned',
    'motore claim non disponibile': 'claim engine not available'
  };

  function translateClaimReason(reason) {
    if (!reason || typeof reason !== 'string') return '';
    const clean = reason.trim().toLowerCase();
    return claimReasonTranslations[clean] || reason;
  }

  const errorTranslations = {
    'Il file locale non è raggiungibile. Avvia server.cjs e apri il suo indirizzo locale.': 'The local file is unreachable. Start server.cjs and open its local address.',
    'Salvataggio non riuscito.': 'Save failed.',
    'Il file del piano non è valido.': 'The plan file is invalid.',
    'Il quaderno salvato non è valido.': 'The saved notebook is invalid.',
    'Il quaderno aggiornato non è valido.': 'The updated notebook is invalid.',
    'Compila titolo, direzione e stato dell’arte.': 'Fill in title, goal, and where it stands.',
    'La nuova revisione non è valida.': 'The new revision is invalid.',
    'Rispondi alle domande aperte della revisione corrente.': 'Answer the open questions of the current revision.',
    'Ogni risposta deve indicare la domanda corrente e una scelta valida.': 'Each answer must indicate the current question and a valid choice.',
    'Scegli una sola nuova direzione per giro.': 'Choose only one new direction per round.',
    'JSON di importazione non valido.': 'Invalid import JSON.',
    'Importa un oggetto con titolo, direzione, stato, decisioni chiuse e domande aperte.': 'Import an object with title, goal, where it stands, decided decisions, and open questions.',
    'Questo progetto ha già un task in corso. Nessun secondo task è stato creato.': 'This project already has a running task. No second task was created.',
    'open questions remain': 'Grill me first. Open questions block Start auto task.',
    'Nessun documento nella cartella.': 'No docs in the folder to grill with.',
    'job already running': 'This project already has a job.',
    'no folder': 'Set place with a folder first.',
    'folder not found': 'The folder on disk was not found.',
    'not a directory': 'The place is not a folder.',
    'Il task richiede titolo e una revisione esistente.': 'The task requires a title and an existing revision.',
    'Il quaderno deve contenere almeno un progetto.': 'The notebook must keep at least one project.',
    'Task non trovato.': 'Job not found.',
    'Il piano è cambiato. Ricarica la pagina prima di salvare.': 'The plan has changed. Reload the page before saving.',
    'Progetto non trovato.': 'Project not found.',
    'Usa JSON per la revisione.': 'Use JSON for the revision.',
    'Dati non validi.': 'Invalid data.',
    'Apri la schermata dal suo indirizzo locale.': 'Open the interface from its local address.',
    'Risorsa non disponibile.': 'Resource unavailable.',
    'Lettura o salvataggio del file non riuscito. Nessuna revisione è stata aggiunta.': 'Failed to read or save file. No revision was added.',
    'Revisione troppo grande.': 'Revision too large.',
    'Richiesta non leggibile.': 'Request unreadable.',
    'File non leggibile.': 'File unreadable.',
    'Disco non disponibile.': 'Disk unavailable.',
    'Compila nome e direzione.': 'Fill in name and goal.',
    'Percorso cartella non valido.': 'Folder must be an absolute path on this PC.',
    'GitHub deve essere un URL https://github.com/proprietario/repo.': 'GitHub must be an https://github.com/owner/repo URL.',
    'Cartella non trovata.': 'Folder not found.',
    'Nessuna cartella per questo progetto.': 'No folder for this project.',
    'Nessun GitHub per questo progetto.': 'No GitHub for this project.'
  };

  function translateError(msg) {
    if (!msg || typeof msg !== 'string') return '';
    const trimmed = msg.trim();
    if (errorTranslations[trimmed]) return errorTranslations[trimmed];
    return msg;
  }

  function notice(message) { $('storage-notice').textContent = translateError(message); $('storage-notice').hidden = false; }
  async function request(url, options) {
    let response;
    try { response = await fetch(url, options); }
    catch { throw new Error('The local file is unreachable. Start server.cjs and open its local address.'); }
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 404 && (url === '/api/place' || url === '/api/open')) {
        throw new Error('This Planwharf window is old. Close it and run node planwharf.cjs again.');
      }
      throw new Error(translateError(result.error) || 'Save failed.');
    }
    if (!Planwharf.validate(result.plan) || typeof result.version !== 'string') throw new Error('The plan file is invalid.');
    return result;
  }
  const list = items => items.length ? `<ul>${items.map(x => `<li>${escape(x)}</li>`).join('')}</ul>` : '<p>No items.</p>';

  function renderChanges(changes, emptyMessage = 'The plan is unchanged. A new revision preserves the current point.') {
    if (!changes || !changes.length) return `<p class="muted">${escape(emptyMessage)}</p>`;
    return changes.map(change => {
      if (change.key === 'reopened') return `<div class="diff-item"><h3>Decision explicitly reopened</h3>${list(change.after)}</div>`;
      if (Array.isArray(change.after)) {
        const added = change.after.filter(x => !change.before.includes(x));
        const removed = change.before.filter(x => !change.after.includes(x));
        return `<div class="diff-item"><h3>${labels[change.key]}</h3>${removed.map(x => `<p class="diff-old"><b>REMOVED</b> · ${escape(x)}</p>`).join('')}${added.map(x => `<p class="diff-new"><b>ADDED</b> · ${escape(x)}</p>`).join('')}${!added.length && !removed.length ? '<p>Item order updated.</p>' : ''}</div>`;
      }
      return `<div class="diff-item"><h3>${labels[change.key]}</h3><p class="diff-old"><b>BEFORE</b> · ${escape(change.before)}</p><p class="diff-new"><b>NOW</b> · ${escape(change.after)}</p></div>`;
    }).join('');
  }

  function notebookProjects() {
    return data.schema === 2 ? data.projects : [data];
  }

  function openProject(id) {
    if (!data || !notebookProjects().some(item => item.project.id === id)) return;
    projectId = id;
    if (!projectReturnState.has(projectId)) initProjectReturnState(projectId);
    selected = project().revisions.at(-1).id;
    const taskInput = $('claim-task-input');
    if (taskInput) {
      if (taskInput.dataset) taskInput.dataset.autoFilled = 'true';
      taskInput._autoFilled = true;
    }
    render();
  }

  function render() {
    const projects = notebookProjects();
    $('project-select').innerHTML = projects.map(p => `<option value="${escape(p.project.id)}" ${p.project.id === projectId ? 'selected' : ''}>${escape(p.project.name)}</option>`).join('');
    for (const id of ['project-select', 'new-task', 'import-revision', 'new-project']) $(id).disabled = false;
    $('remove-project').disabled = projects.length < 2;
    $('grill-open').disabled = false;
    if ($('grill-docs')) $('grill-docs').disabled = !project().project.folder;
    $('project-name').textContent = project().project.name;
    const meta = project().project;
    const folderLine = meta.folder ? escape(meta.folder) : 'No local folder.';
    const githubLine = meta.github ? `<a href="${escape(meta.github)}" target="_blank" rel="noopener noreferrer">${escape(meta.github)}</a>` : 'No GitHub.';
    $('project-place').innerHTML = `<span class="place-item"><small>Folder</small>${folderLine}</span><span class="place-item"><small>GitHub</small>${githubLine}</span><span class="place-actions"><button type="button" class="secondary" data-place="set">Set place</button><button type="button" class="secondary" data-place="folder" ${meta.folder ? '' : 'disabled'}>Open folder</button><button type="button" class="secondary" data-place="github" ${meta.github ? '' : 'disabled'}>Open GitHub</button></span>`;
    const index = project().revisions.findIndex(r => r.id === selected);
    const revision = project().revisions[index];
    const previous = project().revisions[index - 1];
    const newest = index === project().revisions.length - 1;
    const lede = $('project-lede');
    if (lede) lede.textContent = revision.title ? `R${revision.id} · ${revision.title}` : `R${revision.id}`;
    $('revision-select').innerHTML = [...project().revisions].reverse().map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>R${r.id} · ${escape(r.title)}</option>`).join('');
    $('revision-badge').textContent = `R${revision.id} · ${revision.mode} · ${newest ? 'Current' : 'Historical'}`;
    $('plan-content').innerHTML = Object.keys(labels).map(key => {
      let body;
      if (Array.isArray(revision[key])) body = list(revision[key]);
      else {
        const text = typeof revision[key] === 'string' ? revision[key].trim() : '';
        body = text ? `<p>${escape(text)}</p>` : '<p class="empty">Not written.</p>';
      }
      return `<div class="plan-block ${key}"><h3>${labels[key]}</h3>${body}</div>`;
    }).join('');
    $('revision-footer').textContent = `${revision.title} · ${date(revision.createdAt)} · Preserved revision`;

    if (newest) {
      const returnState = projectReturnState.get(projectId);
      if (!returnState || returnState.type === 'first_access') {
        $('change-context').textContent = `R${revision.id} · Nothing new.`;
        $('changes-content').innerHTML = '<p class="muted">Nothing new. First visit to the project: no revision seen previously.</p>';
      } else if (returnState.type === 'no_changes') {
        $('change-context').textContent = `R${revision.id} · Nothing new.`;
        $('changes-content').innerHTML = '<p class="muted">Nothing new since your last visit.</p>';
      } else if (returnState.type === 'jump' || returnState.type === 'created') {
        const from = returnState.fromRevision;
        $('change-context').textContent = `From R${from.id} to R${revision.id} · ${revision.title}`;
        $('changes-content').innerHTML = renderChanges(returnState.changes, 'Nothing new: the plan is unchanged from the seen revision.');
      }
    } else {
      $('change-context').textContent = previous ? `From R${previous.id} to R${revision.id} · ${revision.title}` : 'R1 · The initial snapshot of the project.';
      const changes = Planwharf.diff(previous, revision);
      $('changes-content').innerHTML = previous ? renderChanges(changes) : '<p class="muted">Project history starts here. Subsequent revisions show what changes.</p>';
    }

    $('history-list').innerHTML = [...project().revisions].reverse().map(r => `<button type="button" class="history-row ${r.id === selected ? 'active' : ''}" data-revision="${r.id}" ${r.id === selected ? 'aria-current="true"' : ''}><span>R${r.id}</span><span>${escape(r.title)}</span><time datetime="${escape(r.createdAt)}">${date(r.createdAt)}</time></button>`).join('');
    fillRunningCount();
    $('task-content').innerHTML = '';
    const waiting = projects.flatMap(item => item.revisions.at(-1).open.map(question => ({ item, question })));
    $('waiting-count').textContent = `${waiting.length} ${waiting.length === 1 ? 'decision' : 'decisions'}`;
    $('waiting-content').innerHTML = waiting.length ? waiting.map(({ item, question }) => `<div class="waiting-item" data-open-project="${escape(item.project.id)}"><span>↳</span><p><b>${escape(item.project.name)}</b> · ${escape(question)}</p></div>`).join('') : '<p class="muted">Nothing waiting.</p>';
    const orchRow = (orchestra.projects || []).find(row => row.id === projectId);
    const grillOnMonitor = orchRow && orchRow.status === 'propose_grill';
    if ($('waiting-actions')) $('waiting-actions').hidden = Boolean(grillOnMonitor);
    fillYard();
    renderOrchestra();
    renderClaims();
  }

  function fillYard() {
    if (!data || !$('yard-list')) return;
    const projects = notebookProjects();
    const engine = getEngine();
    const attempts = engine ? engine.getAttempts() : [];
    $('yard-count').textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`;
    $('yard-list').innerHTML = projects.map(item => {
      const latest = item.revisions.at(-1);
      const job = item.tasks.find(t => t.status === 'running');
      const attempt = attempts.find(a => a.status === 'active' && a.projectId === item.project.id);
      const selectedClass = item.project.id === projectId ? ' selected' : '';
      const orch = (orchestra.projects || []).find(row => row.id === item.project.id);
      const workerText = orch ? orch.label : (attempt ? 'claimed, not started' : 'worker idle');
      return `<button type="button" class="yard-row${selectedClass}" data-open-project="${escape(item.project.id)}"><strong>${escape(item.project.name)}</strong><span>R${latest.id} · ${latest.open.length} waiting</span><span>${job ? escape(job.title) : 'no job'} · ${escape(workerText)}</span></button>`;
    }).join('');
  }

  let orchestra = { mode: 'manual', models: [], projects: [] };

  function renderFleet() {
    const el = $('fleet');
    const modesEl = $('run-modes');
    if (!el) return;
    const mode = orchestra.mode === 'auto' ? 'auto' : 'manual';
    const list = orchestra.models || [];
    const propose = orchestra.grillPropose !== false;
    const onCount = list.filter(item => item.enabled).length;
    if (modesEl) {
      modesEl.innerHTML = `<button type="button" class="${mode === 'manual' ? 'primary' : 'secondary'}" data-mode="manual">Manual</button><button type="button" class="${mode === 'auto' ? 'primary' : 'secondary'}" data-mode="auto">Auto</button>`;
    }
    const groups = [];
    const seen = new Map();
    list.forEach(item => {
      const plan = item.plan || 'Unnamed plan';
      if (!seen.has(plan)) {
        seen.set(plan, []);
        groups.push(plan);
      }
      seen.get(plan).push(item);
    });
    const cards = groups.length ? groups.map(plan => {
      const rows = seen.get(plan);
      const on = rows.some(item => item.enabled);
      const modelsHtml = rows.map(item => {
        const used = item.used || 0;
        const limit = item.limit || 0;
        const remaining = Number.isFinite(item.remaining) ? item.remaining : Math.max(0, limit - used);
        const pct = limit ? Math.min(100, Math.round(used * 100 / limit)) : 0;
        return `<div class="fleet-model${item.enabled ? '' : ' off'}"><div class="fleet-model-top"><strong>${escape(item.label)}</strong><button type="button" class="secondary" data-model="${escape(item.id)}" data-enabled="${item.enabled ? '0' : '1'}">${item.enabled ? 'On' : 'Off'}</button></div><p>${used} of ${limit} used · ${remaining} left · cost ${item.cost}</p><div class="fleet-bar" role="progressbar" aria-valuemin="0" aria-valuenow="${used}" aria-valuemax="${limit}"><span style="width:${pct}%"></span></div></div>`;
      }).join('');
      return `<div class="fleet-plan-card${on ? '' : ' off'}"><h3>${escape(plan)}</h3>${modelsHtml}</div>`;
    }).join('') : '<p class="muted">No models registered.</p>';
    const open = el.open;
    el.innerHTML = `<summary>Workers and plans <span class="badge">${onCount} on</span></summary>
      <div class="fleet-head"><button type="button" class="${propose ? 'primary' : 'secondary'}" data-grill-propose="1">Propose grill</button><button type="button" class="${propose ? 'secondary' : 'primary'}" data-grill-propose="0">Grill off</button></div>
      <p class="muted fleet-hint">${mode === 'auto' ? 'Auto assigns an enabled model.' : 'Manual waits for Approve run.'} Usage is a local claim count.</p>
      <div class="fleet-plans">${cards}</div>`;
    el.open = open;
  }

  function clock(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function fillRunningCount() {
    const el = $('running-count');
    if (!el) return;
    const rows = orchestra.projects || [];
    const watching = rows.filter(row => row.status === 'watching').length;
    const attention = rows.filter(row => row.status === 'needs_approval' || row.status === 'propose_grill' || row.status === 'blocked_no_folder' || row.status === 'blocked_no_worker' || row.status === 'failed').length;
    if (watching) el.textContent = watching === 1 ? '1 watching' : `${watching} watching`;
    else if (attention) el.textContent = 'attention';
    else el.textContent = 'idle';
  }

  function monitorNow(rows, mode) {
    const order = ['failed', 'blocked_no_worker', 'blocked_no_folder', 'needs_approval', 'propose_grill', 'watching', 'waiting_on_you', 'complete', 'idle'];
    const top = [...rows].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0];
    if (!top) return 'No projects in the notebook.';
    if (top.status === 'watching') return `Watching ${top.workerLabel || 'the worker'} on ${top.name} for STATUS: COMPLETE.`;
    if (top.status === 'needs_approval') return `Plan ready on ${top.name}. Waiting for Approve run.`;
    if (top.status === 'propose_grill') return `New on ${top.name}: Grill me or Grill with the docs.`;
    if (top.status === 'waiting_on_you') return `Paused on ${top.name}: Grill me first.`;
    if (top.status === 'blocked_no_folder') return `Blocked on ${top.name}: needs a folder.`;
    if (top.status === 'blocked_no_worker') return `Blocked on ${top.name}: no eligible worker.`;
    if (top.status === 'failed') return `Watch stopped on ${top.name}.`;
    if (top.status === 'complete') return `Evidence complete on ${top.name}.`;
    return 'Idle. Start auto task to read the repo and propose a plan.';
  }

  function renderOrchestra() {
    renderFleet();
    fillRunningCount();
    const el = $('orchestrator');
    if (!el) return;
    const rows = orchestra.projects || [];
    const mode = orchestra.mode === 'auto' ? 'auto' : 'manual';
    const looked = clock(orchestra.updatedAt);
    const head = `<div class="monitor-now"><div class="monitor-now-top"><strong>Monitor</strong><span class="badge">${mode === 'auto' ? 'Auto' : 'Manual'}</span><span class="muted">Last look ${looked || '—'}</span></div><p>${escape(monitorNow(rows, mode))}</p></div>`;
    if (!rows.length) {
      el.innerHTML = `${head}<p class="muted">Orchestrator will read the notebook on this computer.</p>`;
      return;
    }
    const body = rows.map(row => {
      const start = row.canStart && row.status !== 'propose_grill' ? `<button type="button" class="primary" data-start="${escape(row.id)}">Start auto task</button>` : '';
      const grillMe = row.status === 'propose_grill' ? `<button type="button" class="primary" data-grill-me="${escape(row.id)}">Grill me</button>` : '';
      const grillDocs = row.status === 'propose_grill' ? `<button type="button" class="secondary" data-grill-docs="${escape(row.id)}" ${row.canGrillDocs ? '' : 'disabled'}>Grill with the docs</button>` : '';
      const grillSkip = row.status === 'propose_grill' ? `<button type="button" class="secondary" data-grill-skip="${escape(row.id)}">Skip grill</button>` : '';
      const approve = row.status === 'needs_approval' ? `<button type="button" class="primary" data-approve="${escape(row.id)}">Approve run</button>` : '';
      const remove = row.jobId ? `<button type="button" class="secondary" data-remove-task="${escape(row.jobId)}" data-project="${escape(row.id)}">Remove job</button>` : '';
      const showPlan = row.plan && row.plan.length && (row.status === 'needs_approval' || row.status === 'watching' || row.status === 'complete');
      const plan = showPlan ? `<details class="orch-plan"${row.status === 'needs_approval' ? ' open' : ''}><summary>What it will do</summary><ol>${row.plan.map(step => `<li>${escape(step)}</li>`).join('')}</ol></details>` : '';
      const logItems = (row.log || []).slice(0, 4);
      const log = logItems.length ? `<details class="monitor-log"><summary>Log</summary><ol>${logItems.map(line => `<li><time>${escape(clock(line.at))}</time> ${escape(line.text)}</li>`).join('')}</ol></details>` : '';
      const since = row.watchingSince ? ` since ${escape(clock(row.watchingSince))}` : '';
      const latestBit = row.facts && row.facts.lastCommit ? row.facts.lastCommit : (row.facts && row.facts.git ? 'git' : '');
      const dirtyBit = row.facts && row.facts.dirty && row.facts.dirty.length ? `${row.facts.dirty.length} uncommitted` : '';
      const facts = row.facts && !row.facts.error ? [latestBit, dirtyBit, `${row.facts.fileCount} files`].filter(Boolean).join(' · ') : '';
      const compact = row.status === 'idle' || row.status === 'propose_grill';
      const sameNext = !row.next || !row.waitingFor || row.next.toLowerCase().includes(row.waitingFor.toLowerCase()) || row.waitingFor.toLowerCase().includes(row.next.toLowerCase());
      const grid = compact ? '' : `<dl class="monitor-grid">
          <div><dt>Job</dt><dd>${row.jobTitle ? escape(row.jobTitle) : 'None'}</dd></div>
          <div><dt>Worker</dt><dd>${row.workerLabel ? escape(row.workerLabel) : 'None yet'}</dd></div>
          <div><dt>Waiting for</dt><dd>${escape(row.waitingFor || row.doing)}</dd></div>
          ${sameNext ? '' : `<div><dt>Next</dt><dd>${escape(row.next)}</dd></div>`}
        </dl>`;
      const line = '';
      return `<article class="task orch ${escape(row.status)}" data-open-project="${escape(row.id)}">
        <div class="task-top"><span>${escape(row.name)}</span><span class="orch-status">${escape(row.label)}</span></div>
        ${line}${grid}
        ${facts || since ? `<p class="muted">${escape(facts)}${since}</p>` : ''}
        ${plan}${grillMe}${grillDocs}${grillSkip}${start}${approve}${remove}
        ${log}
      </article>`;
    }).join('');
    el.innerHTML = `${head}<div class="monitor-rows">${body}</div>`;
  }

  async function refreshOrchestra() {
    try {
      const response = await fetch('/api/orchestrator');
      if (!response.ok) return;
      orchestra = await response.json();
      renderOrchestra();
      fillYard();
    } catch (_) {}
  }

  let models = [
    { id: 'gemini', label: 'Gemini', enabled: true },
    { id: 'grok', label: 'Grok', enabled: true },
    { id: 'luna', label: 'Luna', enabled: false }
  ];

  function getModelsApi() {
    if (typeof window !== 'undefined' && window.PlanwharfModels) return window.PlanwharfModels;
    if (typeof globalThis !== 'undefined' && globalThis.PlanwharfModels) return globalThis.PlanwharfModels;
    if (typeof PlanwharfModels !== 'undefined') return PlanwharfModels;
    return null;
  }

  let claimEngine = null;
  let engineError = '';
  function getEngine() {
    return claimEngine;
  }

  function createServerAttemptEngine() {
    let cache = [];
    function getAttempts() { return cache.slice(); }
    function getActiveAttempt(query) {
      if (!query || typeof query !== 'object') return null;
      return cache.find(item => {
        if (item.status !== 'active') return false;
        if (query.taskId && item.taskId !== query.taskId) return false;
        if (query.projectId && item.projectId !== query.projectId) return false;
        return Boolean(query.taskId || query.projectId);
      }) || null;
    }
    async function load() {
      const response = await fetch('/api/attempts');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'attempt file store is unavailable');
      cache = Array.isArray(body.attempts) ? body.attempts : [];
      return cache;
    }
    async function claim(input) {
      const response = await fetch('/api/attempts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const body = await response.json();
      if (Array.isArray(body.attempts)) cache = body.attempts;
      return { ok: Boolean(body.ok), reason: body.reason, attempt: body.attempt };
    }
    return { load, claim, getAttempts, getActiveAttempt };
  }

  async function openEngine() {
    if (claimEngine) return claimEngine;
    try {
      claimEngine = createServerAttemptEngine();
      await claimEngine.load();
      engineError = '';
    } catch (error) {
      engineError = error && error.message ? error.message : 'attempt file store is unavailable';
      claimEngine = null;
    }
    return claimEngine;
  }

  let lastClaimResult = null;

  async function fetchModels() {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    try {
      const res = await fetch('models.json');
      if (res && res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          models = list;
          renderClaims();
        }
      }
    } catch (_) {}
  }

  async function executeClaim(taskId, pId, modelId) {
    const engine = getEngine();
    const modelsApi = getModelsApi();
    if (!engine) {
      lastClaimResult = { ok: false, reason: engineError || 'claim engine not available', taskId, projectId: pId, modelId };
      renderClaims();
      return lastClaimResult;
    }

    if (modelsApi && typeof modelsApi.validateWorkerClaim === 'function') {
      const val = modelsApi.validateWorkerClaim(models, modelId);
      if (!val.ok) {
        lastClaimResult = { ok: false, reason: val.reason, taskId, projectId: pId, modelId };
        renderClaims();
        return lastClaimResult;
      }
    }

    const res = await engine.claim({
      taskId,
      projectId: pId,
      modelId,
      candidates: models
    });
    lastClaimResult = Object.assign({}, res, { taskId, projectId: pId, modelId });
    renderClaims();
    return lastClaimResult;
  }

  function renderClaims() {
    const modelsListEl = $('models-list');
    if (!modelsListEl) return;

    const modelsApi = getModelsApi();
    const engine = getEngine();

    const enabledList = modelsApi ? modelsApi.getEnabledModels(models) : models.filter(m => m && m.enabled === true);
    const allDisabled = enabledList.length === 0;

    const summaryEl = $('models-summary');
    if (summaryEl) {
      summaryEl.textContent = allDisabled ? 'no model enabled' : `${enabledList.length} enabled of ${models.length}`;
    }
    const noModelsNotice = $('no-models-notice');
    if (noModelsNotice) {
      if (allDisabled) {
        noModelsNotice.textContent = 'no model enabled';
        noModelsNotice.hidden = false;
      } else {
        noModelsNotice.hidden = true;
      }
    }

    modelsListEl.innerHTML = models.map(m => {
      const isEnabled = Boolean(m && m.enabled === true);
      const statusBadge = isEnabled
        ? '<span class="badge green compact">enabled</span>'
        : '<span class="badge compact off">disabled</span>';
      return `<div class="claim-row">` +
        `<div class="claim-row-meta">` +
        `<span>${escape(m.label || m.id)}</span>` +
        statusBadge +
        `</div>` +
        `<button type="button" class="secondary compact" data-toggle-model="${escape(m.id)}">` +
        `${isEnabled ? 'Disable' : 'Enable'}` +
        `</button>` +
        `</div>`;
    }).join('');

    const modelSelect = $('claim-model-select');
    if (modelSelect) {
      const currentSelected = modelSelect.value;
      if (models.length === 0) {
        modelSelect.innerHTML = '<option value="" disabled selected>No models available</option>';
        modelSelect.disabled = true;
      } else {
        modelSelect.disabled = allDisabled;
        modelSelect.innerHTML = models.map(m => {
          const isEnabled = Boolean(m && m.enabled === true);
          const sel = (m.id === currentSelected && isEnabled) ? 'selected' : '';
          return `<option value="${escape(m.id)}" ${isEnabled ? '' : 'disabled'} ${sel}>` +
            `${escape(m.label || m.id)} ${isEnabled ? '(enabled)' : '(disabled)'}` +
            `</option>`;
        }).join('');
        if (!enabledList.some(m => m.id === modelSelect.value) && enabledList.length > 0) {
          modelSelect.value = enabledList[0].id;
        }
      }
    }

    const taskInput = $('claim-task-input');
    const isAuto = taskInput && (typeof taskInput._autoFilled !== 'undefined' ? taskInput._autoFilled : (taskInput.dataset && taskInput.dataset.autoFilled === 'true'));
    if (taskInput && (!taskInput.value || isAuto)) {
      const curTask = project()?.tasks?.find(t => t.status === 'running');
      taskInput.value = curTask ? curTask.id : `task-${projectId || '1'}`;
      if (taskInput.dataset) taskInput.dataset.autoFilled = 'true';
      taskInput._autoFilled = true;
    }

    const runningAttemptEl = $('running-attempt');
    if (runningAttemptEl) runningAttemptEl.innerHTML = engineError ? `<p class="muted">${escape(engineError)}</p>` : '';

    const reasonEl = $('claim-rejection-reason');
    if (reasonEl) {
      if (lastClaimResult && !lastClaimResult.ok && lastClaimResult.reason) {
        reasonEl.textContent = `Claim refused: ${translateClaimReason(lastClaimResult.reason)}`;
        reasonEl.hidden = false;
      } else {
        reasonEl.hidden = true;
      }
    }
    fillYard();
  }

  $('project-select').addEventListener('change', event => { openProject(event.target.value); });
  const openFrom = event => {
    const hit = event.target.closest && event.target.closest('[data-open-project]');
    if (hit) openProject(hit.getAttribute('data-open-project'));
  };
  $('yard-list').addEventListener('click', openFrom);
  $('waiting-content').addEventListener('click', openFrom);
  async function removeJob(btn) {
    if (!data || saving || !btn) return;
    if (!window.confirm('Remove this job from Running? The rest of the notebook stays.')) return;
    saving = true;
    try {
      const saved = await request('/api/remove-task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, projectId: btn.getAttribute('data-project'), task: { id: btn.getAttribute('data-remove-task') } }) });
      data = saved.plan;
      version = saved.version;
      render();
      await refreshOrchestra();
      $('toast').textContent = 'Job removed.';
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 4000);
    } catch (error) {
      notice(translateError(error.message));
    } finally { saving = false; }
  }
  $('task-content').addEventListener('click', async event => {
    const btn = event.target && event.target.closest && event.target.closest('[data-remove-task]');
    if (!btn) {
      openFrom(event);
      return;
    }
    event.stopPropagation();
    await removeJob(btn);
  });
  $('running-attempt').addEventListener('click', openFrom);
  $('remove-project').addEventListener('click', async () => {
    if (!data || saving || notebookProjects().length < 2) return;
    if (!window.confirm('Remove this project from the notebook? The folder on disk stays.')) return;
    saving = true;
    try {
      const removed = projectId;
      const saved = await request('/api/remove-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, projectId: removed }) });
      data = saved.plan;
      version = saved.version;
      const nextId = notebookProjects()[0].project.id;
      openProject(nextId);
      await refreshOrchestra();
      $('toast').textContent = 'Project removed from the notebook.';
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 4000);
    } catch (error) {
      notice(translateError(error.message));
    } finally { saving = false; }
  });
  $('run-tools').addEventListener('click', async event => {
    const mode = event.target && event.target.getAttribute && event.target.getAttribute('data-mode');
    const proposeFlag = event.target && event.target.getAttribute && event.target.getAttribute('data-grill-propose');
    const modelId = event.target && event.target.getAttribute && event.target.getAttribute('data-model');
    try {
      if (proposeFlag === '0' || proposeFlag === '1') {
        const response = await fetch('/api/orchestrator/grill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propose: proposeFlag === '1' }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Save failed.');
        orchestra = body;
        render();
        $('toast').textContent = proposeFlag === '1' ? 'Grill proposal on for new projects.' : 'Grill proposal off for every project.';
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 5000);
        return;
      }
      if (mode) {
        const response = await fetch('/api/orchestrator/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Save failed.');
        orchestra = body;
        renderOrchestra();
        fillYard();
        $('toast').textContent = mode === 'auto' ? 'Auto on. The orchestrator picks a worker from enabled plans with remaining quota.' : 'Manual on. Approve run before a claim.';
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 5000);
        return;
      }
      if (modelId) {
        const enabled = event.target.getAttribute('data-enabled') === '1';
        const response = await fetch('/api/orchestrator/model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modelId, enabled }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Save failed.');
        orchestra = body;
        renderOrchestra();
        fillYard();
      }
    } catch (error) {
      notice(translateError(error.message));
    }
  });
  $('orchestrator').addEventListener('click', async event => {
    const removeBtn = event.target && event.target.closest && event.target.closest('[data-remove-task]');
    if (removeBtn) {
      event.stopPropagation();
      await removeJob(removeBtn);
      return;
    }
    const skipId = event.target && event.target.getAttribute && event.target.getAttribute('data-grill-skip');
    if (skipId) {
      event.stopPropagation();
      try {
        const response = await fetch('/api/orchestrator/grill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: skipId, skip: true }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Save failed.');
        orchestra = body;
        render();
        $('toast').textContent = 'Grill skipped on this project.';
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 4000);
      } catch (error) {
        notice(translateError(error.message));
      }
      return;
    }
    const grillDocsId = event.target && event.target.getAttribute && event.target.getAttribute('data-grill-docs');
    if (grillDocsId) {
      event.stopPropagation();
      openProject(grillDocsId);
      await beginGrillRound('docs');
      return;
    }
    const grillMeId = event.target && event.target.getAttribute && event.target.getAttribute('data-grill-me');
    if (grillMeId) {
      event.stopPropagation();
      openProject(grillMeId);
      await beginGrillRound('me');
      return;
    }
    const startId = event.target && event.target.getAttribute && event.target.getAttribute('data-start');
    if (startId) {
      event.stopPropagation();
      if (!data || saving) return;
      saving = true;
      try {
        const response = await fetch('/api/orchestrator/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, projectId: startId }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Save failed.');
        if (!Planwharf.validate(body.plan) || typeof body.version !== 'string') throw new Error('The plan file is invalid.');
        data = body.plan;
        version = body.version;
        orchestra = body.snapshot;
        render();
        fillYard();
        $('toast').textContent = 'Repo read. Approve the plan to pass the job to a worker.';
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
      } catch (error) {
        notice(translateError(error.message));
      } finally { saving = false; }
      return;
    }
    const id = event.target && event.target.getAttribute && event.target.getAttribute('data-approve');
    if (!id) {
      openFrom(event);
      return;
    }
    event.stopPropagation();
    try {
      const response = await fetch('/api/orchestrator/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Save failed.');
      orchestra = body;
      renderOrchestra();
      fillYard();
      await openEngine();
      renderClaims();
      $('toast').textContent = 'Run approved. The orchestrator assigned a worker and is watching for evidence.';
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
    } catch (error) {
      notice(translateError(error.message));
    }
  });
  $('revision-select').addEventListener('change', event => { selected = Number(event.target.value); render(); });
  $('history-list').addEventListener('click', event => { const button = event.target.closest('[data-revision]'); if (button) { selected = Number(button.dataset.revision); render(); } });

  const modelsListEl = $('models-list');
  if (modelsListEl) {
    modelsListEl.addEventListener('click', event => {
      const btn = event.target.closest ? event.target.closest('[data-toggle-model]') : null;
      if (!btn) return;
      const modelId = (btn.dataset && btn.dataset.toggleModel) || (btn.getAttribute && btn.getAttribute('data-toggle-model'));
      if (!modelId) return;
      const modelsApi = getModelsApi();
      const current = models.find(m => m.id === modelId);
      if (!current) return;
      const newEnabled = !current.enabled;
      if (modelsApi && typeof modelsApi.setModelEnabled === 'function') {
        models = modelsApi.setModelEnabled(models, modelId, newEnabled);
      } else {
        models = models.map(m => m.id === modelId ? Object.assign({}, m, { enabled: newEnabled }) : Object.assign({}, m));
      }
      renderClaims();
    });
  }

  const claimTaskInput = $('claim-task-input');
  if (claimTaskInput) {
    claimTaskInput.addEventListener('input', () => {
      if (claimTaskInput.dataset) delete claimTaskInput.dataset.autoFilled;
      claimTaskInput._autoFilled = false;
      renderClaims();
    });
  }

  const claimExecBtn = $('claim-execute-btn');
  if (claimExecBtn) {
    claimExecBtn.addEventListener('click', async () => {
      const modelSelect = $('claim-model-select');
      const taskInput = $('claim-task-input');
      const modelId = modelSelect ? modelSelect.value : '';
      const taskId = taskInput ? taskInput.value.trim() : `task-${projectId}`;
      await executeClaim(taskId, projectId, modelId);
    });
  }

  const claimDoubleBtn = $('claim-double-btn');
  if (claimDoubleBtn) {
    claimDoubleBtn.addEventListener('click', async () => {
      const modelSelect = $('claim-model-select');
      const taskInput = $('claim-task-input');
      const modelId = modelSelect ? modelSelect.value : '';
      const taskId = taskInput ? taskInput.value.trim() : `task-${projectId}`;
      await executeClaim(taskId, projectId, modelId);
      await executeClaim(taskId, projectId, modelId);
    });
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.PlanwharfApp = {
      getModels: () => models,
      getEngine: () => getEngine(),
      executeClaim
    };
  }

  const dialog = $('revision-dialog');
  const form = $('revision-form');
  $('new-revision').addEventListener('click', () => {
    if (!data) return;
    const latest = project().revisions[project().revisions.length - 1];
    form.elements.title.value = '';
    for (const key of Object.keys(labels)) form.elements[key].value = Array.isArray(latest[key]) ? latest[key].join('\n') : latest[key];
    $('form-error').hidden = true;
    dialog.showModal();
  });
  $('close-dialog').addEventListener('click', () => dialog.close());
  $('cancel-dialog').addEventListener('click', () => dialog.close());
  let toastTimer;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || saving) return;
    const submittedProjectId = projectId;
    saving = true;
    $('save-revision').disabled = true;
    $('form-error').hidden = true;
    try {
      const draft = Object.fromEntries(new FormData(form));
      draft.closed = draft.closed.split('\n');
      draft.open = draft.open.split('\n');
      // Check draft locally, then accept the new revision only after its disk save.
      Planwharf.appendRevision(project(), draft);
      const prevLatest = project().revisions.at(-1);
      const saved = await request('/api/revisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, projectId, draft }) });
      data = saved.plan;
      version = saved.version;
      projectId = submittedProjectId;
      const newLatest = project().revisions.at(-1);
      selected = newLatest.id;
      setSeenRevision(projectId, newLatest.id);
      projectReturnState.set(projectId, {
        type: 'created',
        lastSeenId: prevLatest.id,
        currentId: newLatest.id,
        fromRevision: prevLatest,
        toRevision: newLatest,
        changes: Planwharf.diff(prevLatest, newLatest)
      });
      render(); dialog.close();
      $('toast').textContent = `R${selected} saved to file. The ${project().revisions.length - 1} earlier revisions remain in history.`;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
    } catch (error) { $('form-error').textContent = translateError(error.message); $('form-error').hidden = false; }
    finally { saving = false; $('save-revision').disabled = false; }
  });

  async function mutate(endpoint, field, payload, dialogId, errorId, preserveSelection = false) {
    if (saving) return;
    const submittedProjectId = projectId;
    saving = true;
    $(errorId).hidden = true;
    try {
      const prevLatest = project().revisions.at(-1);
      const saved = await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, projectId, [field]: payload }) });
      data = saved.plan;
      version = saved.version;
      projectId = submittedProjectId;
      if (!preserveSelection) {
        const newLatest = project().revisions.at(-1);
        selected = newLatest.id;
        setSeenRevision(projectId, newLatest.id);
        projectReturnState.set(projectId, {
          type: 'created',
          lastSeenId: prevLatest.id,
          currentId: newLatest.id,
          fromRevision: prevLatest,
          toRevision: newLatest,
          changes: Planwharf.diff(prevLatest, newLatest)
        });
      }
      render(); $(dialogId).close();
      $('toast').textContent = field === 'task' ? `Task saved from R${payload.revision_id}.` : `R${selected} saved to file. History is preserved.`;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
    } catch (error) { $(errorId).textContent = translateError(error.message); $(errorId).hidden = false; }
    finally { saving = false; }
  }

  for (const kind of ['grill', 'import', 'task', 'project', 'place']) {
    $(`${kind}-cancel`).addEventListener('click', () => $(`${kind}-dialog`).close());
  }
  $('new-project').addEventListener('click', () => {
    $('project-form').elements.name.value = '';
    $('project-form').elements.direction.value = '';
    $('project-form').elements.folder.value = '';
    $('project-form').elements.github.value = '';
    $('project-error').hidden = true;
    $('project-dialog').showModal();
  });
  $('project-place').addEventListener('click', async event => {
    const action = event.target && event.target.getAttribute && event.target.getAttribute('data-place');
    if (!action || saving) return;
    if (action === 'set') {
      $('place-form').elements.folder.value = project().project.folder || '';
      $('place-form').elements.github.value = project().project.github || '';
      $('place-error').hidden = true;
      $('place-dialog').showModal();
      return;
    }
    try {
      let response;
      try { response = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, target: action }) }); }
      catch { throw new Error('The local file is unreachable. Start server.cjs and open its local address.'); }
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 404) throw new Error('This Planwharf window is old. Close it and run node planwharf.cjs again.');
        throw new Error(translateError(result.error) || 'Save failed.');
      }
      $('toast').textContent = action === 'folder' ? 'Opening folder.' : 'Opening GitHub.';
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 4000);
    } catch (error) {
      notice(error.message);
    }
  });
  $('place-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || saving) return;
    saving = true;
    $('place-error').hidden = true;
    try {
      const form = $('place-form');
      const saved = await request('/api/place', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, project: { id: projectId, folder: form.elements.folder.value, github: form.elements.github.value } }) });
      data = saved.plan;
      version = saved.version;
      render();
      $('place-dialog').close();
      $('toast').textContent = 'Place saved. Revisions stay.';
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
    } catch (error) { $('place-error').textContent = translateError(error.message); $('place-error').hidden = false; }
    finally { saving = false; }
  });
  $('project-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || saving) return;
    saving = true;
    $('project-error').hidden = true;
    try {
      const form = $('project-form');
      const saved = await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, project: { name: form.elements.name.value, direction: form.elements.direction.value, folder: form.elements.folder.value, github: form.elements.github.value } }) });
      const added = saved.plan.projects.at(-1);
      data = saved.plan;
      version = saved.version;
      projectId = added.project.id;
      initProjectReturnState(projectId);
      selected = added.revisions.at(-1).id;
      render();
      $('project-dialog').close();
      await refreshOrchestra();
      $('toast').textContent = `${added.project.name} added. Grill me or Grill with the docs is proposed until you skip.`;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
    } catch (error) { $('project-error').textContent = translateError(error.message); $('project-error').hidden = false; }
    finally { saving = false; }
  });
  function openGrillDialog(latest) {
    $('grill-form').elements.title.value = `${latest.title && /grill/i.test(latest.title) ? latest.title : 'Grill me'} from R${latest.id}`;
    $('grill-context').textContent = `A round on the open questions of current revision R${latest.id}.`;
    $('grill-questions').innerHTML = latest.open.map((question, i) => `<div class="plan-block"><h3>${escape(question)}</h3><label>Action<select name="action-${i}"><option value="keep">Keep open</option><option value="close">Close with this decision</option><option value="direction">Close and change direction</option></select></label><label>Answer / new direction<textarea name="answer-${i}" rows="2" maxlength="1500"></textarea></label></div>`).join('');
    $('grill-error').hidden = true;
    $('grill-dialog').showModal();
  }
  async function beginGrillRound(kind) {
    if (!data || saving) return;
    let latest = project().revisions.at(-1);
    if (!latest.open.length) {
      saving = true;
      try {
        const payload = { version, projectId };
        if (kind === 'docs') payload.kind = 'docs';
        const saved = await request('/api/grill-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const prevLatest = latest;
        data = saved.plan;
        version = saved.version;
        latest = project().revisions.at(-1);
        selected = latest.id;
        setSeenRevision(projectId, latest.id);
        projectReturnState.set(projectId, {
          type: 'created',
          lastSeenId: prevLatest.id,
          currentId: latest.id,
          fromRevision: prevLatest,
          toRevision: latest,
          changes: Planwharf.diff(prevLatest, latest)
        });
        render();
        await refreshOrchestra();
      } catch (error) {
        notice(translateError(error.message));
        return;
      } finally { saving = false; }
    }
    if (!latest.open.length) return;
    openGrillDialog(latest);
  }
  $('grill-open').addEventListener('click', () => beginGrillRound('me'));
  if ($('grill-docs')) $('grill-docs').addEventListener('click', () => beginGrillRound('docs'));
  $('grill-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = $('grill-form');
    const answers = project().revisions.at(-1).open.map((question, i) => ({ question, action: form.elements[`action-${i}`].value, answer: form.elements[`answer-${i}`].value }));
    await mutate('/api/grill', 'round', { title: form.elements.title.value, answers }, 'grill-dialog', 'grill-error');
  });
  $('import-revision').addEventListener('click', () => {
    $('import-form').elements.json.value = '';
    $('import-error').hidden = true;
    $('import-dialog').showModal();
  });
  $('import-form').addEventListener('submit', async event => {
    event.preventDefault();
    await mutate('/api/import', 'json', $('import-form').elements.json.value, 'import-dialog', 'import-error');
  });
  let taskRevision;
  $('new-task').addEventListener('click', () => {
    taskRevision = selected;
    $('task-context').textContent = `The task originates from R${taskRevision}, the revision you are reading.`;
    $('task-form').elements.title.value = '';
    $('task-form').elements.detail.value = '';
    $('task-error').hidden = true;
    $('task-dialog').showModal();
  });
  $('task-form').addEventListener('submit', async event => {
    event.preventDefault();
    await mutate('/api/tasks', 'task', { revision_id: taskRevision, title: $('task-form').elements.title.value, detail: $('task-form').elements.detail.value }, 'task-dialog', 'task-error', true);
  });
  request('/api/plan').then(async saved => {
    data = saved.plan;
    version = saved.version;
    projectId = data.schema === 2 ? data.projects[0].project.id : data.project.id;
    initProjectReturnState(projectId);
    selected = project().revisions[project().revisions.length - 1].id;
    await fetchModels();
    await openEngine();
    renderFleet();
    render();
    await refreshOrchestra();
    setInterval(refreshOrchestra, 4000);
    $('new-revision').disabled = false;
    $('revision-select').disabled = false;
  }).catch(error => notice(translateError(error.message)));
})();
