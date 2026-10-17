'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture(offset) {
  const storage = new Map(), notices = [];
  const role = { value: 'all' }, selector = {}, activity = { scrollTop: 0, innerHTML: '' };
  const controls = new Map();
  const history = { querySelector: key => { if (!controls.has(key)) controls.set(key, {}); return controls.get(key); } };
  const elements = new Map([
    ['[data-workspace-role]', role], ['[data-workspace-session]', selector],
    ['[data-workspace-activity]', activity], ['[data-workspace-history]', history], ['[data-workspace-feed]', {}]
  ]);
  const workspace = { scrollTop: 0, querySelector: key => elements.get(key), querySelectorAll: () => [] };
  const window = { dispatchEvent() {} };
  const context = vm.createContext({ window,
    document: { documentElement: { hasAttribute: () => false }, getElementById: () => null, querySelector: () => workspace },
    localStorage: { setItem: (key, value) => storage.set(key, value) }, CustomEvent: class {},
    fetch: () => { throw Error('Inspection must open the current page without fetching history'); }
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'orch.js'), 'utf8');
  const marker = "  workspace?.addEventListener('click', event => {";
  assert.ok(source.includes(marker));
  // Stop before startup; run the real inspection handler, panel selection and
  // renderer with DOM/storage boundaries replaced, without production test hooks.
  const instrumented = source.replace(marker, `
  window.inspectionFixture = input => {
    orchestra = input.snapshot; projectId = input.projectId; workspaceProject = projectId;
    workspacePreferences = input.preferences; notice = input.notice;
    for (const [key, sessions] of input.pages) historyPages.set(key, sessions);
  };
  return;
${marker}`);
  vm.runInContext(instrumented, context);
  const session = (id, projectId, model) => ({ id, projectId, attemptId: id, model,
    provider: 'fixture', role: 'worker', state: 'running', processState: 'running', events: [], warnings: [] });
  const target = session('target-attempt', 'alpha', 'target-model');
  const previous = session('previous-attempt', 'alpha', 'previous-model');
  const historical = session('historical-attempt', 'alpha', 'historical-model');
  const foreign = session('foreign-attempt', 'beta', 'foreign-model');
  const preferences = { panel: 'supervisor', offset, session: previous.id,
    sessionsByPage: { 0: previous.id, 24: historical.id } };
  window.inspectionFixture({ projectId: 'alpha', preferences, notice: message => notices.push(message),
    pages: [['alpha:48:24', [historical]]], snapshot: { projects: [
      { id: 'alpha', name: 'Alpha', activitySessions: [previous, target], activitySessionPagination: { available: true, total: 48, pageSize: 24 } },
      { id: 'beta', name: 'Beta', activitySessions: [foreign] }
    ] }
  });
  return { window, preferences, storage, selector, activity, notices, target };
}
for (const offset of [0, 24]) {
  const f = fixture(offset);
  f.window.PlanwharfInspectAssignment(f.target.attemptId);
  assert.equal(f.selector.value, f.target.id, `Inspect must select its target from history offset ${offset}`);
  assert.match(f.activity.innerHTML, /target-model/);
  assert.doesNotMatch(f.activity.innerHTML, /previous-model|historical-model|foreign-model/);
  const saved = JSON.parse(f.storage.get('planwharf_workspace_v1:alpha'));
  assert.equal(saved.offset, 0);
  assert.equal(saved.panel, 'sessions');
  assert.equal(saved.sessionsByPage[0], f.target.id);
  assert.equal(saved.sessionsByPage[24], 'historical-attempt', 'Other page selections survive inspection');
  const before = JSON.stringify(f.preferences);
  f.window.PlanwharfInspectAssignment('foreign-attempt');
  assert.equal(JSON.stringify(f.preferences), before, 'Foreign project inspection cannot change the active selection');
  assert.equal(f.notices.length, 1);
  assert.equal(f.selector.value, f.target.id);
}
console.log('PASS: real inspection/rendering select the target from current/older history pages, persist preferences and reject foreign-project attempts. VM DOM fixtures only.');
