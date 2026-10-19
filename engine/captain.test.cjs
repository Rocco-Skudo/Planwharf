'use strict';
const assert = require('node:assert/strict');
const H = require('../harbor-ui.js');

// The browser suite verifies rendered poses and moving frames. This small DOM
// boundary fixture checks which project's execution facts/name reach that view.
const saved = { window: global.window, document: global.document };
try {
  global.window = { matchMedia: () => ({ matches: false }) };
  global.document = { hidden: false };
  const ui = new H.HarborUI(), title = { textContent: '' }, status = {}, sceneLabel = {};
  const route = { getBoundingClientRect() {} }, water = { setAttribute() {} };
  ui.root = { dataset: { motion: 'full' }, querySelector(selector) {
    if (selector === '.harbor-captain title') return title;
    if (selector === '.harbor-water path') return water;
    return route;
  } };
  ui.dialog = { querySelector: () => status }; ui.sceneLabel = sceneLabel;
  ui.settings = H.shipSettingsFrom({ weatherMode: 'manual', seaCondition: 'storm' });
  ui.available = true; ui.projectId = 'working';
  ui.snapshot = { supervisor: { name: ' Captain <Rocco & crew> ' }, projects: [
    { id: 'working', name: 'Working', status: 'watching', workerAlive: true },
    { id: 'paused', name: 'Paused', status: 'checkpointed' }
  ] };
  ui.update();
  assert.equal(ui.root.dataset.state, 'running', 'Selected live project stays running even in a storm');
  assert.equal(title.textContent, 'Captain <Rocco & crew>', 'Supervisor identity is trimmed text, never markup');
  ui.settings.seaCondition = 'calm'; ui.applyWeather();
  assert.equal(ui.root.dataset.state, 'running', 'Decorative calm weather cannot change helm lifecycle');
  ui.projectId = 'paused'; ui.update();
  assert.equal(ui.root.dataset.state, 'checkpoint', 'Another live project cannot steer a selected paused project');
  assert.equal(ui.root.dataset.captainReaction, 'none', 'Ordinary checkpoint holds the wheel calmly');
  const paused = ui.snapshot.projects[1]; paused.megaTaskId = 'current';
  paused.checkpoint = { megaTaskId: 'current', reason: 'blocked worker' };
  paused.subTasks = [{ megaTaskId: 'old', status: 'BLOCKED' }]; ui.update();
  assert.equal(ui.root.dataset.captainReaction, 'none', 'Foreign historical slices cannot trigger concern');
  paused.subTasks.push({ megaTaskId: 'current', status: 'BLOCKED' }); ui.update();
  assert.equal(ui.root.dataset.captainReaction, 'concerned', 'Current blocked slice distinguishes blocked checkpoint');
  paused.checkpoint.reason = 'user stop'; ui.update();
  assert.equal(ui.root.dataset.captainReaction, 'none', 'Technical BLOCKED results from Stop retain the resting checkpoint pose');
  paused.checkpoint.reason = 'pause after current tasks'; ui.update();
  assert.equal(ui.root.dataset.captainReaction, 'none', 'Waiting dependencies during a requested pause do not signal a blocked outcome');
  paused.checkpoint.reason = 'blocked worker'; paused.checkpoint.megaTaskId = 'old'; ui.update();
  assert.equal(ui.root.dataset.captainReaction, 'none', 'Old checkpoint reason cannot affect the current MegaTask');
  paused.status = 'watching'; paused.workerAlive = true; ui.update();
  assert.equal(ui.root.dataset.state, 'resuming');
  assert.equal(ui.root.dataset.captainReaction, 'none', 'A resumed live worker steers despite a previous blocked slice');
  paused.status = 'complete'; paused.workerAlive = false; ui.update();
  assert.equal(ui.root.dataset.captainReaction, 'none', 'Historical blockers do not follow completion');
  ui.projectId = 'working'; ui.settings.animations = 'off'; ui.applyMotion(); ui.update();
  assert.equal(ui.root.dataset.state, 'running', 'Disabled animation preserves the truthful running pose');
  assert.equal(ui.root.dataset.motion, 'off');
  ui.snapshot.supervisor.name = '  '; ui.update(); assert.equal(title.textContent, 'Supervisor');
  ui.available = false; ui.update(); assert.equal(ui.root.dataset.state, 'neutral');
  console.log('PASS Captain selected-project lifecycle, decorative weather independence, text-only Supervisor identity and disabled-motion state. Rendered animation is covered separately in the browser suite.');
} finally {
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete global[key]; else global[key] = value;
}
