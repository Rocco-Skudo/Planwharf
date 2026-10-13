'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let projectId, baseline, current, action, actionTarget, resumeTargets = [], busy = false, generation = 0;
  async function post(url, value) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || result.reason || 'Project home unavailable.'); error.confirmation = result.requiresConfirmation ? result : null; throw error; }
    return result;
  }
  function notes(items) {
    $('home-notes').innerHTML = [...items].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))).map(n => `<article class="home-note"><p>${escape(n.text)}</p><footer><time datetime="${escape(n.createdAt)}">${escape(new Date(n.createdAt).toLocaleString())}</time>${n.pinned ? '<span class="badge">Pinned</span>' : ''}<button class="secondary compact" data-note-pin="${escape(n.id)}" data-pinned="${!n.pinned}">${n.pinned ? 'Unpin' : 'Pin'}</button><button class="secondary compact" data-note-relevance="${escape(n.id)}" data-ai-relevant="${!n.aiRelevant}">AI relevant: ${n.aiRelevant ? 'Yes' : 'No'}</button><button class="secondary compact" data-note-delete="${escape(n.id)}">Delete</button></footer></article>`).join('') || '<p class="muted">No notes yet.</p>';
  }
  function render(home) {
    current = home.current;
    window.dispatchEvent(new CustomEvent('planwharf-evidence', { detail: home.technicalTimeline || home.timeline || [] }));
    $('home-goal').textContent = home.goal;
    $('home-progress').textContent = home.progress;
    const progressDetails = $('home-progress-details'), recorded = home.progressDetails;
    if (progressDetails) progressDetails.innerHTML = recorded ? `${recorded.jobTitle ? `<h3>Last recorded work</h3><p>${escape(recorded.jobTitle)} · ${escape(recorded.status)}</p>` : ''}${recorded.actions?.length ? `<h3>Latest recorded worker actions</h3><ol>${recorded.actions.map(action => `<li><strong>${escape(action.worker)}</strong>: ${escape(action.text)}</li>`).join('')}</ol>` : ''}${recorded.reports?.length ? `<h3>Worker reports</h3>${recorded.reports.map(report => `<details open><summary>${escape(report.worker)} ? reported findings</summary><pre class="home-work-report">${escape(report.text)}</pre></details>`).join('')}` : ''}${recorded.files?.length ? `<details><summary>Files currently changed (${recorded.files.length})</summary><ul>${recorded.files.map(file => `<li>${escape(file.path)} · ${escape(file.status)}</li>`).join('')}</ul></details>` : ''}` : '';
    if (progressDetails && recorded?.megaTask) {
      const mega = recorded.megaTask;
      progressDetails.innerHTML = `<h3>MegaTask: ${escape(mega.title)}</h3><p>${escape(mega.goal)}</p><p>${escape(mega.status)} · ${recorded.subTasks.filter(sub => sub.status === 'COMPLETE').length}/${recorded.subTasks.length} slices complete</p><ol>${recorded.subTasks.map(sub => `<li>${escape(sub.title)} — ${escape(sub.status)} · ${escape(sub.assignedModelId)}${sub.dependencies.length ? ' · after prerequisites' : ' · parallel-ready'}</li>`).join('')}</ol>`;
      if (recorded.workers.length) progressDetails.innerHTML += `<h3>Workers that ran</h3><ul>${recorded.workers.map(worker => `<li>${escape(worker.modelId)} · ${escape(worker.provider)} / ${escape(worker.cli)}</li>`).join('')}</ul>`;
      if (recorded.results.length) progressDetails.innerHTML += `<h3>Results</h3><ul>${recorded.results.map(result => `<li><strong>${escape(result.status)}</strong>: ${escape(result.summary)}${result.filesChanged.length ? ' · Files: ' + result.filesChanged.map(escape).join(', ') : ''}${result.reportPath ? ' · Report: ' + escape(result.reportPath) : ''}</li>`).join('')}</ul>`;
      if (recorded.tests.length) progressDetails.innerHTML += `<details><summary>Tests reported</summary><ul>${recorded.tests.map(test => `<li>${escape(test.command)}: ${escape(test.status)} — ${escape(test.evidence)}</li>`).join('')}</ul></details>`;
      if (recorded.blockers.length) progressDetails.innerHTML += `<h3>Blockers</h3><ul>${recorded.blockers.map(text => `<li>${escape(text)}</li>`).join('')}</ul>`;
      if (recorded.gitProgress) {
        const git = recorded.gitProgress;
        progressDetails.innerHTML += `<p>Repository: ${escape(git.disposition)}${git.dirtyFiles.length ? ' · Changes remain uncommitted.' : git.commitIds?.length ? ' · Commit observed: ' + git.commitIds.map(escape).join(', ') : ' · No new commit observed.'}${git.sourceChangesObserved === false ? ' No source changes observed.' : ''}</p>`;
      }
    }
    if (home.timelineSummary?.length) progressDetails.innerHTML += `<details><summary>Project timeline</summary><ol>${home.timelineSummary.map(event => `<li>${escape(event.summary)}${event.evidence ? `<details><summary>Technical evidence (${event.evidenceCount})</summary><ul>${event.evidence.map(item => `<li>${escape(item.summary)}</li>`).join('')}</ul></details>` : ''} <time>${escape(new Date(event.createdAt).toLocaleString())}</time></li>`).join('')}</ol></details>`;
    if (home.checkpointDiffs?.length) progressDetails.innerHTML += `<details open><summary>Since this checkpoint</summary>${home.checkpointDiffs.map(diff => `<p>${escape(diff.checkpointId)}</p><ul>${(diff.changes.length ? diff.changes : ['No repository or plan changes detected.']).map(text => `<li>${escape(text)}</li>`).join('')}</ul>`).join('')}</details>`;
    let exportButton = $('home-export'); if (!exportButton) { exportButton = document.createElement('a'); exportButton.id = 'home-export'; exportButton.className = 'secondary compact'; exportButton.textContent = 'Export project'; $('home-next-action').after(exportButton); }
    exportButton.href = '/api/project-export?projectId=' + encodeURIComponent(home.projectId); exportButton.setAttribute('download', 'planwharf-project.json');
    actionTarget = home.actionTarget || { projectId: home.projectId }; resumeTargets = home.resumeTargets || [];
    let checkpointSelect = $('home-checkpoint-select');
    if (!checkpointSelect && resumeTargets.length > 1) {
      checkpointSelect = document.createElement('select'); checkpointSelect.id = 'home-checkpoint-select'; checkpointSelect.setAttribute('aria-label', 'Choose checkpoint');
      $('home-next-action').before(checkpointSelect);
    }
    if (checkpointSelect) {
      const selected = checkpointSelect.value; checkpointSelect.hidden = resumeTargets.length <= 1;
      checkpointSelect.innerHTML = '<option value="">Choose checkpoint</option>' + resumeTargets.map(cp => `<option value="${escape(cp.id)}"${cp.id === selected ? ' selected' : ''}>${escape(cp.summary)} · ${escape(cp.createdAt)}</option>`).join('');
    }
    $('home-local').textContent = home.local.readable ? home.local.changedFiles ? `${home.local.changedFiles} files with local changes.` : 'Local working tree is clean.' : home.local.reason;
    $('home-now').textContent = home.now;
    $('home-now-detail').textContent = home.running ? `${home.running} worker${home.running === 1 ? '' : 's'} active${home.jobTitle ? ` · ${home.jobTitle}` : ''}` : '';
    $('home-next').textContent = home.next;
    action = home.action;
    $('home-next-action').hidden = !action;
    $('home-next-action').textContent = action === 'approve' ? home.actionTarget?.megaTaskId ? 'Approve MegaTask' : 'Approve prepared job' : action === 'resume' ? 'Resume from checkpoint' : 'Answer Grill question';
    const since = home.since;
    $('home-since').innerHTML = since.firstVisit ? '<p class="muted">First visit. A comparison will be available when you return.</p>' : since.changes.length ? `<ul>${since.changes.map(text => `<li>${escape(text)}</li>`).join('')}</ul>` : `<p>${since.unavailable.length ? 'No changes detected in comparable project data.' : 'No project changes since your last visit.'}</p>`;
    if (since.unavailable.length) $('home-since').innerHTML += `<p class="muted">${since.unavailable.map(escape).join(' ')}</p>`;
    if (since.details?.length) $('home-since').innerHTML += `<details><summary>What changed</summary><ul>${since.details.map(text => `<li>${escape(text)}</li>`).join('')}</ul></details>`;
    notes(home.notes);
  }
  async function activate(id) {
    if (!id || id === projectId) return;
    projectId = id; baseline = undefined; current = null;
    const ticket = ++generation;
    $('home-error').hidden = true;
    for (const field of ['home-goal', 'home-progress', 'home-now', 'home-next']) $(field).textContent = 'Loading…';
    $('home-since').textContent = ''; $('home-notes').textContent = '';
    try {
      const home = await post('/api/project-home', { projectId: id, visit: true });
      if (ticket !== generation) return;
      baseline = home.baseline;
      render(home);
    } catch (error) { if (ticket === generation) fail(error); }
  }
  function fail(error) { $('home-error').textContent = error.message; $('home-error').hidden = false; }
  async function refresh() {
    if (!projectId || busy) return;
    const ticket = generation;
    busy = true;
    try {
      const home = await post('/api/project-home', { projectId, baseline, visit: baseline === undefined });
      if (ticket === generation) { if (baseline === undefined) baseline = home.baseline; render(home); $('home-error').hidden = true; }
    } catch (error) { if (ticket === generation) fail(error); }
    finally { busy = false; }
  }
  window.addEventListener('planwharf-project', event => activate(event.detail));
  $('home-note-form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = projectId, text = $('home-note-text').value;
    const button = $('home-note-add'); button.disabled = true;
    try {
      const result = await post('/api/notes', { projectId: id, action: 'add', text });
      if (id === projectId) { notes(result.notes); $('home-note-text').value = ''; }
    } catch (error) { fail(error); }
    finally { button.disabled = false; }
  });
  $('home-notes').addEventListener('click', async event => {
    const pin = event.target.closest('[data-note-pin]'), del = event.target.closest('[data-note-delete]'), relevance = event.target.closest('[data-note-relevance]');
    if (!pin && !del && !relevance) return;
    const id = projectId;
    try {
      const result = await post('/api/notes', { projectId: id, action: relevance ? 'relevance' : pin ? 'pin' : 'delete', id: relevance ? relevance.dataset.noteRelevance : pin ? pin.dataset.notePin : del.dataset.noteDelete, aiRelevant: relevance ? relevance.dataset.aiRelevant === 'true' : undefined, pinned: pin ? pin.dataset.pinned === 'true' : undefined });
      if (id === projectId) notes(result.notes);
    } catch (error) { fail(error); }
  });
  $('home-next-action').addEventListener('click', async () => {
    if (action === 'grill') { $('grill-open').click(); return; }
    if (!['approve', 'resume'].includes(action)) return;
    const submittedAction = action, submittedTarget = { ...actionTarget }, choices = [...resumeTargets], selectedCheckpoint = $('home-checkpoint-select')?.value;
    const button = $('home-next-action'); button.disabled = true;
    try {
      await window.PlanwharfFocusReady;
      const selected = choices.find(cp => cp.id === selectedCheckpoint);
      if (submittedAction === 'resume' && choices.length > 1 && !selected) throw new Error('Choose the checkpoint to resume.');
      const target = { ...submittedTarget, ...(selected ? { megaTaskId: selected.megaTaskId, checkpointId: selected.id, researchId: selected.researchId } : {}) };
      if (!target.researchId) delete target.researchId;
      const route = target.researchId ? `/api/orchestrator/research/${submittedAction}` : `/api/orchestrator/${submittedAction}`;
      if (target.researchId) { target.id = target.researchId; delete target.researchId; }
      try { await post(route, target); }
      catch (error) {
        if (!error.confirmation || !window.confirm(`${error.message}\n${(error.confirmation.diff?.changes || []).join('\n')}\nContinue the remaining work?`)) throw error;
        await post(route, { ...target, confirmChanges: true });
      }
      await refresh();
    }
    catch (error) { fail(error); }
    finally { button.disabled = false; }
  });
  setInterval(refresh, 4000);
})();
