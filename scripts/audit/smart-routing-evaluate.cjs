'use strict';
// Deterministic policy comparison, not provider execution or a model-quality benchmark.
const { choose } = require('../../engine/smart-routing.cjs');
const models = ['standard', 'premium'].map(tier => ({ id: 'fixture-' + tier, provider: 'codex', cli: 'fixture-' + tier, modelRouting: 'configured', enabled: true, available: true, limit: 100, routingPreference: { tier, automatic: tier === 'premium' } }));
const parent = { title: 'Concurrent scheduler', detail: 'Crash recovery preserves durable invariants and prevents duplicate execution' };
const cases = [
  { title: 'Create HTML markup', detail: 'Basic dashboard heading and Refresh button', expected: 'standard' },
  { title: 'Write README', detail: 'Document run and test commands', job: parent, expected: 'standard' },
  { title: 'CSS formatting', detail: 'Adjust heading spacing', job: parent, expected: 'standard' },
  { title: 'Validate input', detail: 'Reject an empty job ID', expected: 'standard' },
  { title: 'Implement crash recovery', detail: parent.detail, job: parent, expected: 'premium' },
  { title: 'Verify scheduler invariants', detail: 'Independently check concurrent state and duplicate execution after restart', type: 'AUDIT', expected: 'premium' },
  { title: 'Enforce security boundary', detail: 'Prevent authorization bypass from untrusted input', expected: 'premium' },
  { title: 'Write tests', detail: 'Verify shared execution behavior', job: parent, expected: 'premium' }
];
const rows = cases.map(({ job, expected, ...sub }) => {
  const start = performance.now(), catalog = choose({ models, sub, job, config: { mode: 'catalog' } }), smart = choose({ models, sub, job, config: { mode: 'smart' } });
  return { task: sub.title, expectedPreference: expected, complexity: smart.receipt.assessment.level, catalogModel: catalog.model?.id, smartModel: smart.model?.id, rationale: smart.receipt.reason, evaluationMs: performance.now() - start };
});
console.log(JSON.stringify({ kind: 'DETERMINISTIC_POLICY_FIXTURE', rows,
  unnecessaryPremiumAssignments: rows.filter(r => r.expectedPreference === 'standard' && r.smartModel === 'fixture-premium').length,
  missedDifficultAssignments: rows.filter(r => r.expectedPreference === 'premium' && r.smartModel !== 'fixture-premium').length,
  providerExecution: false, monetarySavingsMeasured: false }, null, 2));
