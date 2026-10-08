'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => new Date(value).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const labels = { direction: 'Where this goes', state: 'Where it stands', closed: 'Decided', open: 'Still open' };
  let data = null;
  let projectId = null;
  const project = () => data.schema === 2 ? data.projects.find(p => p.project.id === projectId) : data;
  let version = null;
  let selected = null;
  let saving = false;

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
    'Compila titolo, direzione e stato dell’arte.': 'Fill in title, where this goes, and where it stands.',
    'La nuova revisione non è valida.': 'The new revision is invalid.',
    'Rispondi alle domande aperte della revisione corrente.': 'Answer the open questions of the current revision.',
    'Ogni risposta deve indicare la domanda corrente e una scelta valida.': 'Each answer must indicate the current question and a valid choice.',
    'Scegli una sola nuova direzione per giro.': 'Choose only one new direction per round.',
    'JSON di importazione non valido.': 'Invalid import JSON.',
    'Importa un oggetto con titolo, direzione, stato, decisioni chiuse e domande aperte.': 'Import an object with title, where this goes, where it stands, decided decisions, and open questions.',
    'Questo progetto ha già un task in corso. Nessun secondo task è stato creato.': 'This project already has a running task. No second task was created.',
    'Il task richiede titolo e una revisione esistente.': 'The task requires a title and an existing revision.',
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
    'Compila nome e direzione.': 'Fill in name and where this goes.'
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
    if (!response.ok) throw new Error(translateError(result.error) || 'Save failed.');
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

  function render() {
    const projects = data.schema === 2 ? data.projects : [data];
    $('project-select').innerHTML = projects.map(p => `<option value="${escape(p.project.id)}" ${p.project.id === projectId ? 'selected' : ''}>${escape(p.project.name)}</option>`).join('');
    for (const id of ['project-select', 'new-task', 'import-revision', 'new-project']) $(id).disabled = false;
    $('grill-open').disabled = !project().revisions.at(-1).open.length;
    $('project-name').textContent = project().project.name;
    const index = project().revisions.findIndex(r => r.id === selected);
    const revision = project().revisions[index];
    const previous = project().revisions[index - 1];
    const newest = index === project().revisions.length - 1;
    $('revision-select').innerHTML = [...project().revisions].reverse().map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>R${r.id} · ${escape(r.title)}</option>`).join('');
    $('revision-badge').textContent = `R${revision.id} · ${revision.mode} · ${newest ? 'Current' : 'Historical'}`;
    $('plan-content').innerHTML = Object.keys(labels).map(key => `<div class="plan-block ${key}"><h3>${labels[key]}</h3>${Array.isArray(revision[key]) ? list(revision[key]) : `<p>${escape(revision[key])}</p>`}</div>`).join('');
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
    const running = project().tasks.filter(t => t.status === 'running');
    $('running-count').textContent = `${running.length} ${running.length === 1 ? 'task' : 'tasks'}`;
    $('task-content').innerHTML = running.map(t => `<article class="task"><div class="task-top"><span>● Running · R${t.revision_id}</span><span>${escape(project().project.name)}</span></div><h3>${escape(t.title)}</h3><p>${escape(t.detail)}</p></article>`).join('');
    $('waiting-count').textContent = `${revision.open.length} ${revision.open.length === 1 ? 'decision' : 'decisions'}`;
    $('waiting-content').innerHTML = revision.open.length ? revision.open.map(x => `<div class="waiting-item"><span>↳</span><p>${escape(x)}</p></div>`).join('') : '<p class="muted">No decisions waiting.</p>';
    renderClaims();
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
        ? '<span class="badge green" style="padding:2px 6px;font-size:10px;">enabled</span>'
        : '<span class="badge" style="padding:2px 6px;font-size:10px;background:#f0e5e5;color:#854d4d;">disabled</span>';
      return `<div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--border);border-radius:6px;padding:6px 10px;">` +
        `<div style="display:flex;align-items:center;gap:8px;">` +
        `<span style="font-weight:600;font-size:12px;">${escape(m.label || m.id)}</span>` +
        statusBadge +
        `</div>` +
        `<button type="button" class="secondary" data-toggle-model="${escape(m.id)}" style="padding:4px 8px;font-size:10px;">` +
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
    if (runningAttemptEl) {
      const curTaskId = taskInput ? taskInput.value.trim() : '';
      const active = engine ? engine.getActiveAttempt({ taskId: curTaskId, projectId }) : null;
      const allAttempts = engine ? engine.getAttempts() : [];
      const anyActiveInProject = allAttempts.find(a => a.status === 'active' && a.projectId === projectId);
      const toShow = active || anyActiveInProject;

      if (toShow) {
        runningAttemptEl.innerHTML =
          `<article class="task">` +
          `<div class="task-top"><span>● Running</span><span>${escape(toShow.id)}</span></div>` +
          `<h3>Model: ${escape(toShow.modelId)}</h3>` +
          `<p>Task: <b>${escape(toShow.taskId)}</b> · Project: <b>${escape(toShow.projectId)}</b> · Status: <b>${escape(toShow.status)}</b></p>` +
          `</article>`;
      } else if (engineError) {
        runningAttemptEl.innerHTML = `<p class="muted">${escape(engineError)}</p>`;
      } else {
        runningAttemptEl.innerHTML = '<p class="muted">No active attempt for this project.</p>';
      }
    }

    const reasonEl = $('claim-rejection-reason');
    if (reasonEl) {
      if (lastClaimResult && !lastClaimResult.ok && lastClaimResult.reason) {
        reasonEl.textContent = `Claim refused: ${translateClaimReason(lastClaimResult.reason)}`;
        reasonEl.hidden = false;
      } else {
        reasonEl.hidden = true;
      }
    }
  }

  $('project-select').addEventListener('change', event => {
    projectId = event.target.value;
    if (!projectReturnState.has(projectId)) {
      initProjectReturnState(projectId);
    }
    selected = project().revisions.at(-1).id;
    const taskInput = $('claim-task-input');
    if (taskInput) {
      if (taskInput.dataset) taskInput.dataset.autoFilled = 'true';
      taskInput._autoFilled = true;
    }
    render();
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

  for (const kind of ['grill', 'import', 'task', 'project']) {
    $(`${kind}-cancel`).addEventListener('click', () => $(`${kind}-dialog`).close());
  }
  $('new-project').addEventListener('click', () => {
    $('project-form').elements.name.value = '';
    $('project-form').elements.direction.value = '';
    $('project-error').hidden = true;
    $('project-dialog').showModal();
  });
  $('project-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || saving) return;
    saving = true;
    $('project-error').hidden = true;
    try {
      const form = $('project-form');
      const saved = await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, project: { name: form.elements.name.value, direction: form.elements.direction.value } }) });
      const added = saved.plan.projects.at(-1);
      data = saved.plan;
      version = saved.version;
      projectId = added.project.id;
      initProjectReturnState(projectId);
      selected = added.revisions.at(-1).id;
      render();
      $('project-dialog').close();
      $('toast').textContent = `${added.project.name} added. Earlier projects and revisions stay.`;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
    } catch (error) { $('project-error').textContent = translateError(error.message); $('project-error').hidden = false; }
    finally { saving = false; }
  });
  $('grill-open').addEventListener('click', () => {
    const latest = project().revisions.at(-1);
    if (!latest.open.length) return;
    $('grill-form').elements.title.value = `Grillbench from R${latest.id}`;
    $('grill-context').textContent = `A round on the open questions of current revision R${latest.id}.`;
    $('grill-questions').innerHTML = latest.open.map((question, i) => `<div class="plan-block"><h3>${escape(question)}</h3><label>Action<select name="action-${i}"><option value="keep">Keep open</option><option value="close">Close with this decision</option><option value="direction">Close and change direction</option></select></label><label>Answer / new direction<textarea name="answer-${i}" rows="2" maxlength="1500"></textarea></label></div>`).join('');
    $('grill-error').hidden = true;
    $('grill-dialog').showModal();
  });
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
    render();
    $('new-revision').disabled = false;
    $('revision-select').disabled = false;
  }).catch(error => notice(translateError(error.message)));
})();
