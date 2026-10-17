'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { projectFacts, createSupervisor } = require('./supervisor.cjs');
function snapshot() {
 return { models: [], projects: [{ id: 'a', name: 'Alpha', status: 'idle', projectSkills: { available: true, projectId: 'a', deliveryEnabled: true, mode: 'manual', enabled: [{ id: 'local/a', name: 'Review fixture', source: 'project-local', body: 'PRIVATE-PROCEDURE', receiptPath: 'PRIVATE-PATH' }], deliveries: [{ recordId: 'record-a', projectId: 'a', taskId: 'task-a', attemptId: 'attempt-a', role: 'reviewer', provider: 'fixture-provider', model: 'exact-model', at: '2026-10-17T10:00:00Z', attached: true, submitted: true, transport: 'api-adapter-stdin-written-http-unverified', skills: [{ id: 'local/a', body: 'PRIVATE-PROCEDURE' }], rejected: [{ id: 'matt/tdd', reason: 'Testing seams need approval.', body: 'PRIVATE-PROCEDURE' }], body: 'PRIVATE-PROCEDURE', receiptPath: 'PRIVATE-PATH', loaded: true, followed: true, verified: true }, { projectId: 'b', recordId: 'foreign-record', skills: [{ id: 'foreign-skill' }] }] } }, { id: 'b', name: 'Beta', status: 'idle' }], execution: {} };
}
test('Supervisor exposes project-isolated bounded Skill metadata without procedures or invented success', () => {
 const input = snapshot(), before = structuredClone(input), facts = projectFacts(input, 'a').projectSkills;
 assert.equal(facts.deliveryEnabled, true); assert.equal(facts.mode, 'manual'); assert.equal(facts.enabled[0].id, 'local/a'); assert.equal(facts.deliveries.length, 1);
 const row = facts.deliveries[0]; assert.equal(row.taskId, 'task-a'); assert.equal(row.attemptId, 'attempt-a'); assert.equal(row.role, 'reviewer'); assert.equal(row.provider, 'fixture-provider'); assert.equal(row.model, 'exact-model'); assert.equal(row.transport, 'api-adapter-stdin-written-http-unverified');
 assert.equal(row.loaded, 'unverified'); assert.equal(row.followed, 'unverified'); assert.equal(row.verified, false); assert.equal(row.rejected[0].reason, 'Testing seams need approval.');
 assert.doesNotMatch(JSON.stringify(facts), /PRIVATE-PROCEDURE|PRIVATE-PATH|receiptPath|foreign-record|foreign-skill/);
 assert.equal(projectFacts(input, 'b').projectSkills.available, false); assert.deepEqual(input, before);
 input.projects[1].projectSkills = input.projects[0].projectSkills; assert.equal(projectFacts(input, 'b').projectSkills.available, false);
});
test('monitoring bounds retained metadata and normalizes unexpected types, control text and transport claims', () => {
 const input = snapshot(), state = input.projects[0].projectSkills, base = state.deliveries[0];
 state.enabled = Array.from({ length: 150 }, (_, n) => ({ id: 'skill-' + n, name: 'X'.repeat(1000) }));
 state.deliveries = Array.from({ length: 40 }, (_, n) => ({ ...base, recordId: 'record-' + n, provider: 'P'.repeat(1000) + '\u0000', model: { body: 'PRIVATE-PROCEDURE' }, transport: 'all-procedures-verified', rejected: Array.from({ length: 50 }, () => ({ id: 'id', reason: '\u0000' + 'R'.repeat(500) })) }));
 const facts = projectFacts(input, 'a').projectSkills; assert.equal(facts.enabled.length, 100); assert.equal(facts.enabled[0].name.length, 120); assert.equal(facts.deliveries.length, 12); assert.equal(facts.deliveries[0].recordId, 'record-28');
 const row = facts.deliveries[0]; assert.equal(row.provider.length, 512); assert.equal(row.model, 'unknown'); assert.equal(row.transport, 'unknown'); assert.equal(row.rejected.length, 30); assert.equal(row.rejected[0].reason.length, 240); assert.doesNotMatch(row.rejected[0].reason, /\u0000/);
});
test('fact-only questions and repeated observations describe Skill stages with zero AI calls', async () => {
 const input = snapshot(); let calls = 0;
 const core = createSupervisor({ review: async () => { calls++; throw Error('No inference authorized'); } });
 for (let n = 0; n < 5; n++) core.observe(input);
 const result = await core.ask(input, 'a', 'Which Skills were sent to the reviewer?');
 assert.equal(calls, 0); const turn = result.projects.find(row => row.projectId === 'a').turns.at(-1);
 assert.equal(turn.mode, 'facts'); assert.equal(turn.status, 'complete'); assert.match(turn.answer, /reviewer fixture-provider\/exact-model/); assert.match(turn.answer, /task task-a, attempt attempt-a/); assert.match(turn.answer, /api-adapter-stdin-written-http-unverified/); assert.match(turn.answer, /remain unverified/);
 assert.doesNotMatch(turn.answer, /PRIVATE-PROCEDURE|PRIVATE-PATH|foreign-record/);
});
