'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let projectId, baseline, current, action, busy = false, generation = 0;
  async function post(url, value) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Project home unavailable.');
    return result;
  }
  function notes(items) {
    $('home-notes').innerHTML = [...items].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))).map(n => `<article class="home-note"><p>${escape(n.text)}</p><footer><time datetime="${escape(n.createdAt)}">${escape(new Date(n.createdAt).toLocaleString())}</time>${n.pinned ? '<span class="badge">Pinned</span>' : ''}<button class="secondary compact" data-note-pin="${escape(n.id)}" data-pinned="${!n.pinned}">${n.pinned ? 'Unpin' : 'Pin'}</button><button class="secondary compact" data-note-delete="${escape(n.id)}">Delete</button></footer></article>`).join('') || '<p class="muted">No notes yet.</p>';
  }
  function render(home) {
    current = home.current;
    $('home-goal').textContent = home.goal;
    $('home-progress').textContent = home.progress;
    const progressDetails = $('home-progress-details'), recorded = home.progressDetails;
    if (progressDetails) progressDetails.innerHTML = recorded ? `${recorded.jobTitle ? `<h3>Last recorded work</h3><p>${escape(recorded.jobTitle)} · ${escape(recorded.status)}</p>` : ''}${recorded.actions?.length ? `<h3>Latest recorded worker actions</h3><ol>${recorded.actions.map(action => `<li><strong>${escape(action.worker)}</strong>: ${escape(action.text)}</li>`).join('')}</ol>` : ''}${recorded.reports?.length ? `<h3>Worker reports</h3>${recorded.reports.map(report => `<details open><summary>${escape(report.worker)} ? reported findings</summary><pre class="home-work-report">${escape(report.text)}</pre></details>`).join('')}` : ''}${recorded.files?.length ? `<details><summary>Files currently changed (${recorded.files.length})</summary><ul>${recorded.files.map(file => `<li>${escape(file.path)} · ${escape(file.status)}</li>`).join('')}</ul></details>` : ''}` : '';
    $('home-local').textContent = home.local.readable ? home.local.changedFiles ? `${home.local.changedFiles} files with local changes.` : 'Local working tree is clean.' : home.local.reason;
    $('home-now').textContent = home.now;
    $('home-now-detail').textContent = home.running ? `${home.running} worker${home.running === 1 ? '' : 's'} active${home.jobTitle ? ` · ${home.jobTitle}` : ''}` : '';
    $('home-next').textContent = home.next;
    action = home.action;
    $('home-next-action').hidden = !action;
    $('home-next-action').textContent = action === 'approve' ? 'Approve prepared job' : action === 'resume' ? 'Resume from checkpoint' : 'Answer Grill question';
    const since = home.since;
    $('home-since').innerHTML = since.firstVisit ? '<p class="muted">First visit. A comparison will be available when you return.</p>' : since.changes.length ? `<ul>${since.changes.map(text => `<li>${escape(text)}</li>`).join('')}</ul>` : `<p>${since.unavailable.length ? 'No changes detected in comparable project data.' : 'No project changes since your last visit.'}</p>`;
    if (since.unavailable.length) $('home-since').innerHTML += `<p class="muted">${since.unavailable.map(escape).join(' ')}</p>`;
    if (since.details?.length) $('home-since').innerHTML += `<h3>What changed</h3><ul>${since.details.map(text => `<li>${escape(text)}</li>`).join('')}</ul>`;
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
    const pin = event.target.closest('[data-note-pin]'), del = event.target.closest('[data-note-delete]');
    if (!pin && !del) return;
    const id = projectId;
    try {
      const result = await post('/api/notes', { projectId: id, action: pin ? 'pin' : 'delete', id: pin ? pin.dataset.notePin : del.dataset.noteDelete, pinned: pin ? pin.dataset.pinned === 'true' : undefined });
      if (id === projectId) notes(result.notes);
    } catch (error) { fail(error); }
  });
  $('home-next-action').addEventListener('click', async () => {
    if (action === 'grill') { $('grill-open').click(); return; }
    if (!['approve', 'resume'].includes(action)) return;
    const button = $('home-next-action'); button.disabled = true;
    try { await post(`/api/orchestrator/${action}`, { projectId }); await refresh(); }
    catch (error) { fail(error); }
    finally { button.disabled = false; }
  });
  setInterval(refresh, 4000);
})();
