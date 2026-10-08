'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  const labels = { direction: 'Dove si va', state: 'Stato dell’arte', closed: 'Decisioni chiuse', open: 'Cosa è aperto' };
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
      // Primo accesso: nessun diff inventato, definisci primo accesso senza inventare una revisione vista
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
      // Nessuna novità dall'ultima visita
      state = {
        type: 'no_changes',
        lastSeenId,
        currentId: current.id,
        fromRevision: null,
        toRevision: current,
        changes: []
      };
    } else if (lastSeenId < current.id) {
      // Salto dalla revisione precedentemente vista alla corrente (anche di più revisioni)
      const fromRevision = p.revisions.find(r => r.id === lastSeenId);
      if (fromRevision) {
        const changes = Planwharf.diff(fromRevision, current);
        // Aggiorna il marker visto a quella corrente senza perdere il confronto da mostrare durante la riapertura
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

  function notice(message) { $('storage-notice').textContent = message; $('storage-notice').hidden = false; }
  async function request(url, options) {
    let response;
    try { response = await fetch(url, options); }
    catch { throw new Error('Il file locale non è raggiungibile. Avvia server.cjs e apri il suo indirizzo locale.'); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Salvataggio non riuscito.');
    if (!Planwharf.validate(result.plan) || typeof result.version !== 'string') throw new Error('Il file del piano non è valido.');
    return result;
  }
  const list = items => items.length ? `<ul>${items.map(x => `<li>${escape(x)}</li>`).join('')}</ul>` : '<p>Nessuna voce.</p>';

  function renderChanges(changes, emptyMessage = 'Il piano è invariato. Una nuova revisione ne conserva il punto attuale.') {
    if (!changes || !changes.length) return `<p class="muted">${escape(emptyMessage)}</p>`;
    return changes.map(change => {
      if (change.key === 'reopened') return `<div class="diff-item"><h3>Decisione riaperta esplicitamente</h3>${list(change.after)}</div>`;
      if (Array.isArray(change.after)) {
        const added = change.after.filter(x => !change.before.includes(x));
        const removed = change.before.filter(x => !change.after.includes(x));
        return `<div class="diff-item"><h3>${labels[change.key]}</h3>${removed.map(x => `<p class="diff-old"><b>RIMOSSO</b> · ${escape(x)}</p>`).join('')}${added.map(x => `<p class="diff-new"><b>AGGIUNTO</b> · ${escape(x)}</p>`).join('')}${!added.length && !removed.length ? '<p>Ordine delle voci aggiornato.</p>' : ''}</div>`;
      }
      return `<div class="diff-item"><h3>${labels[change.key]}</h3><p class="diff-old"><b>PRIMA</b> · ${escape(change.before)}</p><p class="diff-new"><b>ADESSO</b> · ${escape(change.after)}</p></div>`;
    }).join('');
  }

  function render() {
    const projects = data.schema === 2 ? data.projects : [data];
    $('project-select').innerHTML = projects.map(p => `<option value="${escape(p.project.id)}" ${p.project.id === projectId ? 'selected' : ''}>${escape(p.project.name)}</option>`).join('');
    for (const id of ['project-select', 'new-task', 'import-revision']) $(id).disabled = false;
    $('grill-open').disabled = !project().revisions.at(-1).open.length;
    $('project-name').textContent = project().project.name;
    const index = project().revisions.findIndex(r => r.id === selected);
    const revision = project().revisions[index];
    const previous = project().revisions[index - 1];
    const newest = index === project().revisions.length - 1;
    $('revision-select').innerHTML = [...project().revisions].reverse().map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>R${r.id} · ${escape(r.title)}</option>`).join('');
    $('revision-badge').textContent = `R${revision.id} · ${revision.mode} · ${newest ? 'Attuale' : 'Storico'}`;
    $('plan-content').innerHTML = Object.keys(labels).map(key => `<div class="plan-block ${key}"><h3>${labels[key]}</h3>${Array.isArray(revision[key]) ? list(revision[key]) : `<p>${escape(revision[key])}</p>`}</div>`).join('');
    $('revision-footer').textContent = `${revision.title} · ${date(revision.createdAt)} · Revisione conservata`;

    if (newest) {
      const returnState = projectReturnState.get(projectId);
      if (!returnState || returnState.type === 'first_access') {
        $('change-context').textContent = `R${revision.id} · Nessuna novità.`;
        $('changes-content').innerHTML = '<p class="muted">Nessuna novità. Primo accesso al progetto: nessuna revisione vista in precedenza.</p>';
      } else if (returnState.type === 'no_changes') {
        $('change-context').textContent = `R${revision.id} · Nessuna novità.`;
        $('changes-content').innerHTML = '<p class="muted">Nessuna novità dall’ultima visita.</p>';
      } else if (returnState.type === 'jump' || returnState.type === 'created') {
        const from = returnState.fromRevision;
        $('change-context').textContent = `Da R${from.id} a R${revision.id} · ${revision.title}`;
        $('changes-content').innerHTML = renderChanges(returnState.changes, 'Nessuna novità: il piano è invariato dalla revisione vista.');
      }
    } else {
      $('change-context').textContent = previous ? `Da R${previous.id} a R${revision.id} · ${revision.title}` : 'R1 · La prima fotografia del progetto.';
      const changes = Planwharf.diff(previous, revision);
      $('changes-content').innerHTML = previous ? renderChanges(changes) : '<p class="muted">Da qui inizia lo storico. Le revisioni successive mostrano cosa cambia.</p>';
    }

    $('history-list').innerHTML = [...project().revisions].reverse().map(r => `<button type="button" class="history-row ${r.id === selected ? 'active' : ''}" data-revision="${r.id}" ${r.id === selected ? 'aria-current="true"' : ''}><span>R${r.id}</span><span>${escape(r.title)}</span><time datetime="${escape(r.createdAt)}">${date(r.createdAt)}</time></button>`).join('');
    const running = project().tasks.filter(t => t.status === 'running');
    $('running-count').textContent = `1 progetto · ${running.length} task`;
    $('task-content').innerHTML = running.map(t => `<article class="task"><div class="task-top"><span>● IN CORSO · R${t.revision_id}</span><span>${escape(project().project.name)}</span></div><h3>${escape(t.title)}</h3><p>${escape(t.detail)}</p></article>`).join('');
    $('waiting-count').textContent = `${revision.open.length} ${revision.open.length === 1 ? 'decisione' : 'decisioni'}`;
    $('waiting-content').innerHTML = revision.open.length ? revision.open.map(x => `<div class="waiting-item"><span>↳</span><p>${escape(x)}</p></div>`).join('') : '<p class="muted">Nessuna decisione in attesa.</p>';
    renderClaims();
  }

  // --- Modelli worker & Claim engine in memoria ---
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

  function getClaimsApi() {
    if (typeof window !== 'undefined' && window.PlanwharfClaims) return window.PlanwharfClaims;
    if (typeof globalThis !== 'undefined' && globalThis.PlanwharfClaims) return globalThis.PlanwharfClaims;
    if (typeof PlanwharfClaims !== 'undefined') return PlanwharfClaims;
    return null;
  }

  let claimEngine = null;
  function getEngine() {
    if (!claimEngine) {
      const api = getClaimsApi();
      if (api && typeof api.createClaimEngine === 'function') {
        claimEngine = api.createClaimEngine();
      }
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

  function executeClaim(taskId, pId, modelId) {
    const engine = getEngine();
    const modelsApi = getModelsApi();
    if (!engine) {
      lastClaimResult = { ok: false, reason: 'motore claim non disponibile', taskId, projectId: pId, modelId };
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

    const res = engine.claim({
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
      summaryEl.textContent = allDisabled ? 'nessun modello acceso' : `${enabledList.length} accesi su ${models.length}`;
    }
    const noModelsNotice = $('no-models-notice');
    if (noModelsNotice) {
      if (allDisabled) {
        noModelsNotice.textContent = 'nessun modello acceso';
        noModelsNotice.hidden = false;
      } else {
        noModelsNotice.hidden = true;
      }
    }

    modelsListEl.innerHTML = models.map(m => {
      const isEnabled = Boolean(m && m.enabled === true);
      const statusBadge = isEnabled
        ? '<span class="badge green" style="padding:2px 6px;font-size:10px;">acceso</span>'
        : '<span class="badge" style="padding:2px 6px;font-size:10px;background:#f0e5e5;color:#854d4d;">spento</span>';
      return `<div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--border);border-radius:6px;padding:6px 10px;">` +
        `<div style="display:flex;align-items:center;gap:8px;">` +
        `<span style="font-weight:600;font-size:12px;">${escape(m.label || m.id)}</span>` +
        statusBadge +
        `</div>` +
        `<button type="button" class="secondary" data-toggle-model="${escape(m.id)}" style="padding:4px 8px;font-size:10px;">` +
        `${isEnabled ? 'Spegni' : 'Accendi'}` +
        `</button>` +
        `</div>`;
    }).join('');

    const modelSelect = $('claim-model-select');
    if (modelSelect) {
      const currentSelected = modelSelect.value;
      if (models.length === 0) {
        modelSelect.innerHTML = '<option value="" disabled selected>Nessun modello disponibile</option>';
        modelSelect.disabled = true;
      } else {
        modelSelect.disabled = allDisabled;
        modelSelect.innerHTML = models.map(m => {
          const isEnabled = Boolean(m && m.enabled === true);
          const sel = (m.id === currentSelected && isEnabled) ? 'selected' : '';
          return `<option value="${escape(m.id)}" ${isEnabled ? '' : 'disabled'} ${sel}>` +
            `${escape(m.label || m.id)} ${isEnabled ? '(acceso)' : '(spento)'}` +
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

    const activeAttemptEl = $('claim-active-attempt');
    if (activeAttemptEl) {
      const curTaskId = taskInput ? taskInput.value.trim() : '';
      const active = engine ? engine.getActiveAttempt({ taskId: curTaskId, projectId }) : null;
      const allAttempts = engine ? engine.getAttempts() : [];
      const anyActiveInProject = allAttempts.find(a => a.status === 'active' && a.projectId === projectId);
      const toShow = active || anyActiveInProject;

      if (toShow) {
        activeAttemptEl.innerHTML =
          `<article class="task" style="border-color:#b4cfbb;background:#edf5ee;">` +
          `<div class="task-top"><span>● ATTEMPT ENGINE ATTIVO (IN MEMORIA)</span><span>${escape(toShow.id)}</span></div>` +
          `<h3>Modello: ${escape(toShow.modelId)}</h3>` +
          `<p style="font-size:11px;">Task: <b>${escape(toShow.taskId)}</b> · Progetto: <b>${escape(toShow.projectId)}</b> · Status: <b>${escape(toShow.status)}</b></p>` +
          `</article>`;
      } else {
        activeAttemptEl.innerHTML = '<p class="muted" style="margin:0;font-size:11px;">Nessun attempt attivo per questo progetto nell’engine in memoria.</p>';
      }
    }

    const reasonEl = $('claim-rejection-reason');
    if (reasonEl) {
      if (lastClaimResult && !lastClaimResult.ok && lastClaimResult.reason) {
        reasonEl.textContent = `Claim rifiutato: ${lastClaimResult.reason}`;
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
    claimExecBtn.addEventListener('click', () => {
      const modelSelect = $('claim-model-select');
      const taskInput = $('claim-task-input');
      const modelId = modelSelect ? modelSelect.value : '';
      const taskId = taskInput ? taskInput.value.trim() : `task-${projectId}`;
      executeClaim(taskId, projectId, modelId);
    });
  }

  const claimDoubleBtn = $('claim-double-btn');
  if (claimDoubleBtn) {
    claimDoubleBtn.addEventListener('click', () => {
      const modelSelect = $('claim-model-select');
      const taskInput = $('claim-task-input');
      const modelId = modelSelect ? modelSelect.value : '';
      const taskId = taskInput ? taskInput.value.trim() : `task-${projectId}`;
      executeClaim(taskId, projectId, modelId);
      executeClaim(taskId, projectId, modelId);
    });
  }

  const claimResetBtn = $('claim-reset-btn');
  if (claimResetBtn) {
    claimResetBtn.addEventListener('click', () => {
      const claimsApi = getClaimsApi();
      if (claimsApi && typeof claimsApi.createClaimEngine === 'function') {
        claimEngine = claimsApi.createClaimEngine();
      } else {
        claimEngine = null;
      }
      lastClaimResult = null;
      renderClaims();
    });
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.PlanwharfApp = {
      getModels: () => models,
      getEngine: () => getEngine(),
      executeClaim,
      resetEngine: () => {
        const claimsApi = getClaimsApi();
        claimEngine = claimsApi && typeof claimsApi.createClaimEngine === 'function' ? claimsApi.createClaimEngine() : null;
        lastClaimResult = null;
        renderClaims();
      }
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
      $('toast').textContent = `R${selected} salvata nel file. Le ${project().revisions.length - 1} revisioni precedenti restano nello storico.`;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
    } catch (error) { $('form-error').textContent = error.message; $('form-error').hidden = false; }
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
      $('toast').textContent = field === 'task' ? `Task salvato da R${payload.revision_id}.` : `R${selected} salvata nel file. Lo storico è conservato.`;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
    } catch (error) { $(errorId).textContent = error.message; $(errorId).hidden = false; }
    finally { saving = false; }
  }

  for (const kind of ['grill', 'import', 'task']) {
    $(`${kind}-cancel`).addEventListener('click', () => $(`${kind}-dialog`).close());
  }
  $('grill-open').addEventListener('click', () => {
    const latest = project().revisions.at(-1);
    if (!latest.open.length) return;
    $('grill-form').elements.title.value = `Grillbench da R${latest.id}`;
    $('grill-context').textContent = `Un giro sulle domande aperte della revisione corrente R${latest.id}.`;
    $('grill-questions').innerHTML = latest.open.map((question, i) => `<div class="plan-block"><h3>${escape(question)}</h3><label>Azione<select name="action-${i}"><option value="keep">Lascia aperta</option><option value="close">Chiudi con questa decisione</option><option value="direction">Chiudi e cambia direzione</option></select></label><label>Risposta / nuova direzione<textarea name="answer-${i}" rows="2" maxlength="1500"></textarea></label></div>`).join('');
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
    $('task-context').textContent = `Il task nasce da R${taskRevision}, la revisione che stai leggendo.`;
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
    render();
    $('new-revision').disabled = false;
    $('revision-select').disabled = false;
  }).catch(error => notice(error.message));
})();
