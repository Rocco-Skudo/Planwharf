'use strict';
(() => {
  const view = 'planwharf';
  const id = crypto.randomUUID();
  window.PlanwharfChatSessionId = crypto.randomUUID();
  const control = document.getElementById('watch-window');
  const projectView = document.getElementById('project-view');
  const orchestratorView = document.getElementById('orchestrator-view');
  let activeView = 'planwharf';
  const scrollPositions = { planwharf: 0, orchestrator: 0 };
  function showView(next, initial = false) {
    if (!projectView || !orchestratorView) return;
    scrollPositions[activeView] = window.scrollY;
    activeView = next === 'orchestrator' ? 'orchestrator' : 'planwharf';
    projectView.hidden = activeView !== 'planwharf';
    orchestratorView.hidden = activeView !== 'orchestrator';
    document.body.dataset.appView = activeView;
    const intro = document.getElementById('project-lede');
    if (intro) intro.textContent = activeView === 'orchestrator' ? 'Orchestrator chat, workers, and provider usage.' : 'Goal, progress, current work, next action, and your notes.';
    if (control) {
      control.textContent = activeView === 'planwharf' ? 'Show Orchestrator' : 'Show Planwharf';
      control.setAttribute('aria-pressed', String(activeView === 'orchestrator'));
    }
    if (!initial) {
      history.replaceState(null, '', activeView === 'orchestrator' ? '#orchestrator' : '#project');
      window.scrollTo(0, scrollPositions[activeView]);
    }
    window.dispatchEvent(new CustomEvent('planwharf-view', { detail: activeView }));
  }
  control?.addEventListener('click', () => showView(activeView === 'planwharf' ? 'orchestrator' : 'planwharf'));
  window.addEventListener('hashchange', () => showView(location.hash === '#orchestrator' ? 'orchestrator' : 'planwharf', true));
  showView(location.hash === '#orchestrator' ? 'orchestrator' : 'planwharf', true);
  const header = document.querySelector('.topbar');
  if (header && typeof ResizeObserver !== 'undefined') {
    const controls = document.querySelector('.runtime-controls');
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height + (controls?.getBoundingClientRect().height || 0)}px`);
    });
    observer.observe(header);
    if (controls) observer.observe(controls);
  }
  let focusSeen = 0;
  window.addEventListener('planwharf-project', event => {
    try { localStorage.setItem('planwharf_chat_project', event.detail); } catch { /* The recipient can also be selected in chat. */ }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-output], [data-copy-conversation]');
    if (!button) return;
    const text = button.dataset.copyConversation ? Array.from(document.getElementById(button.dataset.copyConversation).querySelectorAll('.chat-turn:not(.is-pending)')).map(turn => `You: ${turn.querySelector('.chat-you p')?.textContent || ''}\nOrchestrator: ${turn.querySelector('[data-chat-output]')?.textContent || ''}`).join('\n\n') : button.parentElement.querySelector('[data-chat-output]')?.textContent || '';
    const toast = document.getElementById('toast');
    if (!text.trim()) { if (toast) toast.textContent = 'No chat output to copy yet.'; return; }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement('textarea');
        field.value = text;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        try { field.select(); if (!document.execCommand('copy')) throw new Error('Clipboard unavailable.'); }
        finally { field.remove(); }
      }
      if (toast) toast.textContent = 'Output copied.';
    } catch (error) { if (toast) toast.textContent = `Could not copy chat: ${error.message}`; }
  });
  let skillsSaving = false, skillsVersion = 0;
  const skillsDate = value => {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'not recorded';
  };
  function displaySkills(data) {
    const control = document.getElementById('matt-skills-enabled');
    const status = document.getElementById('matt-skills-status');
    if (!Number.isSafeInteger(data.skillCount) || data.skillCount < 0) {
      if (control) { control.disabled = true; control.dataset.legacyBackend = 'true'; }
      if (status) status.textContent = 'Previous Planwharf backend detected. Its legacy cache does not report a complete skill catalog or confirm use by all models. Use Quit application, then relaunch Planwharf; reopening the window reuses the old backend.';
      return;
    }
    if (control?.dataset.legacyBackend) { control.disabled = false; delete control.dataset.legacyBackend; }
    if (control && !control.disabled) control.checked = data.enabled !== false;
    if (!status) return;
    const revision = data.sha ? data.sha.slice(0, 7) : 'unavailable';
    const usage = data.enabled === false ? 'Matt skills OFF for new model requests.' : 'Matt skills ON for all models.';
    const dates = `Revision date: ${skillsDate(data.date)}. Installed locally: ${skillsDate(data.installedAt)}. Last checked: ${skillsDate(data.checkedAt)}.`;
    status.textContent = data.checking ? `${usage} Checking for updates... ${dates}` : data.status === 'current' && data.skillCount > 0 && data.catalogComplete !== false
      ? `${usage} ${data.skillCount} skills. ${data.updated ? 'Installed' : 'Up to date with'} latest main revision ${revision}. ${dates}`
      : data.status === 'current' || data.status === 'incomplete' ? `Matt skills catalog incomplete at revision ${revision}. Check skills updates before running models with Matt skills enabled.`
      : `${usage} Update status: ${data.status || 'unknown'}; revision ${revision}. ${dates} ${data.error || ''}`;
  }
  async function refreshSkills() {
    if (skillsSaving) return;
    const version = skillsVersion;
    try { const response = await fetch('/api/skills'); const data = response.ok ? await response.json() : null; if (data && !skillsSaving && version === skillsVersion) displaySkills(data); } catch {}
  }
  async function refreshProviderStatus() {
    const status = document.getElementById('provider-models-status');
    if (!status || document.getElementById('provider-models-refresh')?.disabled) return;
    try {
      const response = await fetch('/api/models/status');
      if (!response.ok) return;
      const data = await response.json();
      status.textContent = data.checking ? 'Checking Grok models for the active CLI login...' : data.status === 'current' ? `Grok exact models verified for the active CLI login: ${data.ids.join(', ')}.` : data.reason || 'Grok model availability has not been verified yet.';
    } catch {}
  }
  document.getElementById('matt-skills-enabled')?.addEventListener('change', async event => {
    const control = event.target, enabled = control.checked;
    skillsSaving = true; skillsVersion += 1;
    control.disabled = true;
    try { const data = await post('/api/skills/settings', { enabled }); control.disabled = false; displaySkills(data); }
    catch (error) { control.checked = !enabled; document.getElementById('matt-skills-status').textContent = error.message; }
    finally { skillsSaving = false; control.disabled = false; }
  });
  document.getElementById('matt-skills-refresh')?.addEventListener('click', async event => {
    event.target.disabled = true;
    try { displaySkills(await post('/api/skills', undefined)); }
    catch (error) { document.getElementById('matt-skills-status').textContent = error.message; }
    finally { event.target.disabled = false; }
  });
  document.getElementById('provider-models-refresh')?.addEventListener('click', async event => {
    event.target.disabled = true;
    const status = document.getElementById('provider-models-status');
    status.textContent = 'Checking exact Grok models for the active CLI login...';
    try {
      const data = await post('/api/models/refresh', {});
      status.textContent = data.providerModels.status === 'current' ? `Grok model list refreshed: ${data.providerModels.ids.join(', ')}. Availability and model enablement are separate.` : data.providerModels.reason;
      window.dispatchEvent(new CustomEvent('planwharf-view', { detail: activeView }));
    } catch (error) { status.textContent = error.message; }
    finally { event.target.disabled = false; }
  });
  if (document.getElementById('matt-skills-status')) { refreshSkills(); refreshProviderStatus(); setInterval(() => { refreshSkills(); refreshProviderStatus(); }, 4000); }
  async function post(url, value) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Window request failed.');
    return data;
  }
  async function pulse() {
    try {
      const data = await post('/api/app/heartbeat', { id, view, focusSeen });
      if (data.title) document.title = data.title;
      focusSeen = data.focusVersion || 0;
      if (data.focus) { window.focus(); if (data.requestedView) showView(data.requestedView); }
    } catch { /* A disconnected UI is not a request to stop work. */ }
  }
  document.getElementById('app-quit')?.addEventListener('click', async () => {
    if (!confirm('Quit Planwharf? Active work will follow the shutdown and checkpoint policy.')) return;
    try { await post('/api/app/quit', {}); window.close(); }
    catch (error) { document.getElementById('toast').textContent = error.message; }
  });
  window.addEventListener('pagehide', () => { navigator.sendBeacon('/api/app/heartbeat', new Blob([JSON.stringify({ id, view, closed: true })], { type: 'application/json' })); });
  window.addEventListener('pageshow', pulse);
  pulse();
  setInterval(pulse, 3000);
})();
