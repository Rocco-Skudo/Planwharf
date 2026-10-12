'use strict';
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
function focusNative(view, child, title) {
  if (process.platform !== 'win32') return;
  const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `$shell = New-Object -ComObject WScript.Shell; $null = $shell.AppActivate('${title}')`], { windowsHide: true, stdio: 'ignore' });
  helper.on('error', () => {});
  helper.unref();
}
function createAppWindows({ open, focus = focusNative, now = Date.now, ttl = 15000 } = {}) {
  const clients = new Map(), children = new Map(), requested = new Map(), launching = new Map();
  // A unique native title keeps focus within this notebook's application.
  const instance = randomUUID().slice(0, 8);
  const titleFor = view => `${view === 'planwharf' ? 'Planwharf' : 'Orchestrator'} · ${instance}`;
  let origin;
  let requestedView = 'planwharf';
  function status() {
    const views = { planwharf: false, orchestrator: false };
    for (const [id, client] of clients) {
      if (now() - client.at > ttl) clients.delete(id);
      else { views.planwharf = true; views.orchestrator = true; }
    }
    return views;
  }
  function openView(view, url) {
    if (!['planwharf', 'orchestrator'].includes(view)) throw new Error('Invalid view');
    origin = new URL(url).origin;
    requestedView = view;
    requested.set('planwharf', (requested.get('planwharf') || 0) + 1);
    if (status().planwharf) {
      focus('planwharf', children.get('planwharf'), titleFor('planwharf'));
      return true;
    }
    view = 'planwharf';
    url = origin + (requestedView === 'orchestrator' ? '/#orchestrator' : '/');
    if (now() - (launching.get(view) || -Infinity) < ttl) return true;
    const child = open(url, view);
    if (!child) return false;
    launching.set(view, now());
    children.set(view, child);
    child.on('exit', () => { if (children.get(view) === child) children.delete(view); launching.delete(view); });
    // Browser exit is not application shutdown and is not Stop.
    return true;
  }
  function heartbeat({ id, view, closed, focusSeen = 0 }) {
    view = 'planwharf';
    if (closed) { clients.delete(id); launching.delete(view); }
    else { clients.set(id, { view, at: now() }); launching.delete(view); }
    const focusVersion = requested.get(view) || 0;
    return { views: status(), focus: focusVersion > focusSeen, focusVersion, requestedView, title: titleFor(view) };
  }
  function openApp(url) { openView('planwharf', url + '/'); }
  function closeAll() { for (const child of children.values()) { try { child.kill(); } catch {} } }
  return { openView, openApp, openBoth: openApp, heartbeat, status, closeAll, get origin() { return origin; } };
}
module.exports = { createAppWindows };
