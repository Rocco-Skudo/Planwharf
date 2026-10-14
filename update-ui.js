'use strict';
(() => {
  const toolbar = document.querySelector('.top-end, .orch-top-actions');
  if (!toolbar) return;
  const group = document.createElement('span'); group.className = 'app-update-controls';
  const check = document.createElement('button'); check.type = 'button'; check.className = 'secondary compact'; check.textContent = 'Check updates';
  const available = document.createElement('button'); available.type = 'button'; available.className = 'secondary compact'; available.hidden = true;
  group.append(check, available); toolbar.prepend(group);
  let state = {}, busy = false, reportedFailure = null;
  const warning = 'One or more tasks are still running. If you proceed, Planwharf will save a checkpoint for each unfinished task before updating and restarting. Are you sure you want to update? You can always do this later.';
  const toast = text => { const node = document.getElementById('toast'); if (node) node.textContent = text; };
  async function request(route, input) {
    const response = await fetch(route, input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const data = await response.json();
    if (!response.ok && !data.requiresConfirmation) throw new Error(data.error || 'Update request failed.');
    return data;
  }
  function display(data) {
    state = data;
    if (data.lastUpdateError && data.lastUpdateError !== reportedFailure) { reportedFailure = data.lastUpdateError; toast('Previous update failed: ' + data.lastUpdateError); }
    const inProgress = ['downloading', 'checkpointing', 'restarting'].includes(data.state);
    check.disabled = busy || inProgress || data.state === 'checking';
    available.hidden = !data.available;
    available.disabled = busy || inProgress;
    available.textContent = inProgress ? data.state === 'checkpointing' ? 'Saving checkpoints...' : data.state === 'restarting' ? 'Restarting...' : 'Downloading update...'
      : `${data.currentVersion ? 'Update available' : 'Latest release'}: ${data.latestVersion || ''}`;
    check.title = data.state === 'error' ? data.reason : data.currentVersion ? `Installed: ${data.currentVersion}` : 'Check the latest Planwharf release';
  }
  async function refresh() {
    if (busy) return;
    try { display(await request('/api/app/updates')); } catch { /* Offline checks do not interrupt task work. */ }
  }
  async function checkNow() {
    if (busy) return;
    busy = true; check.disabled = true;
    try { display(await request('/api/app/updates/check', {})); toast(state.state === 'error' ? state.reason : state.available ? `Latest release: ${state.latestVersion}` : `Planwharf ${state.currentVersion || ''} is up to date.`); }
    catch (error) { toast(error.message); }
    finally { busy = false; display(state); }
  }
  check.addEventListener('click', checkNow);
  available.addEventListener('click', async () => {
    if (busy) return;
    busy = true; available.disabled = true;
    try {
      const fresh = await request('/api/app/updates'); display(fresh);
      const dialog = document.createElement('dialog'); dialog.className = 'app-update-dialog';
      const title = document.createElement('h2'); title.textContent = `Planwharf ${fresh.latestVersion || ''}`;
      const message = document.createElement('p'), error = document.createElement('p'); error.setAttribute('role', 'alert');
      const notes = document.createElement('a'); notes.textContent = 'Release notes and download'; notes.href = fresh.releaseUrl; notes.target = '_blank'; notes.rel = 'noopener noreferrer';
      const actions = document.createElement('div'); actions.className = 'dialog-actions';
      const update = document.createElement('button'); update.type = 'button'; update.className = 'primary';
      const later = document.createElement('button'); later.type = 'button'; later.className = 'secondary'; later.textContent = "No, I'll do it later";
      let confirmRunning = fresh.activeTasks > 0;
      const describe = () => {
        message.textContent = fresh.canInstall ? confirmRunning ? warning : 'Update Planwharf and restart? Your notebooks, settings and execution evidence will be preserved.' : fresh.reason || 'Download this release to update Planwharf.';
        update.textContent = confirmRunning ? 'Update anyway' : 'Update and restart'; update.hidden = !fresh.canInstall;
      };
      describe(); actions.append(update, later); dialog.append(title, message, notes, error, actions); document.body.append(dialog);
      later.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => { dialog.remove(); busy = false; display(state); });
      update.addEventListener('click', async () => {
        update.disabled = true; later.disabled = true; error.textContent = '';
        dialog.oncancel = event => event.preventDefault();
        try {
          const result = await request('/api/app/updates/install', { confirmRunning });
          if (result.requiresConfirmation) { confirmRunning = true; describe(); }
          else { message.textContent = 'Checkpoints saved. Planwharf is updating and restarting. Unfinished tasks can be resumed after restart.'; return; }
        } catch (failure) { error.textContent = failure.message; }
        update.disabled = false; later.disabled = false; dialog.oncancel = null;
      });
      dialog.showModal(); later.focus();
    } catch (error) { busy = false; toast(error.message); display(state); }
  });
  refresh(); setInterval(refresh, 5000);
})();
