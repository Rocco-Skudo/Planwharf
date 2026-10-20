'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { exportProject, importProject } = require('./project-export.cjs');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'model-policy-ui.js'), 'utf8'), context);
const render = context.PlanwharfModelPolicyUI.routingReceipt;

function importedReceipt(limits) {
  const notebook = structuredClone(require('../fixtures/starter-notebook.json'));
  const project = notebook.projects[0];
  const routing = { mode: 'smart', tier: 'premium', assessment: { level: 'HIGH', reason: 'Fixture', decomposition: 'Fixture' }, remainingPercent: null, limits };
  const bundle = exportProject(project, {
    megaTasks: [{ id: 'm', projectId: project.project.id, status: 'PAUSED' }],
    subTasks: [{ id: 's', megaTaskId: 'm', assignedModelId: 'fixture', routing }],
    results: [], checkpoints: [], timeline: []
  });
  const restored = importProject(notebook, JSON.parse(JSON.stringify(bundle)), {});
  const sub = restored.execution.subTasks[0];
  assert.equal(sub.routingImported, true, 'Historical routing must retain the local reassignment guard');
  return sub.routing;
}

for (const field of ['maxPremiumPerMegaTask', 'maxPremiumConcurrent']) {
  test(`imported routing receipt escapes ${field} at the HTML rendering boundary`, () => {
    const payload = '<img src=x onerror="throw 1"> & \'audit\'';
    const receipt = importedReceipt({ maxPremiumPerMegaTask: null, maxPremiumConcurrent: null, [field]: payload });
    assert.equal(receipt.limits[field], payload, 'Import preserves historical evidence');
    const html = render(receipt);
    assert.ok(html.includes('&lt;img src=x onerror=&quot;throw 1&quot;&gt; &amp; &#39;audit&#39;'));
    assert.doesNotMatch(html, /<img\b/i, 'Receipt values cannot create an element in Home or Worker innerHTML');
  });
}

test('routing receipt retains zero, numeric limits and unlimited descriptions', () => {
  assert.match(render(importedReceipt({ maxPremiumPerMegaTask: 0, maxPremiumConcurrent: 12 })), /Limits: 0 per MegaTask; 12 simultaneous\./);
  assert.match(render(importedReceipt({ maxPremiumPerMegaTask: null, maxPremiumConcurrent: null })), /Limits: no extra per MegaTask; existing simultaneous\./);
});
