'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createSkillGeneration, safeText } = require('./skill-generation.cjs');
function fixture(t) {
 const root = path.resolve(__dirname, '../work'); fs.mkdirSync(root, { recursive: true });
 const dir = fs.mkdtempSync(path.join(root, 'generation-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 const folder = path.join(dir, 'project'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'README.md'), 'Use approved fixture validation.\n');
 return { dir, folder, g: createSkillGeneration({ dir: path.join(dir, 'drafts') }), input: { projectId: 'a', folder, name: 'verify-package', description: 'Verify package behavior', procedure: 'Read requirements and run approved fixture checks.', references: ['README.md'], requested: true } };
}
test('manual drafts require evidence and request; forged assisted outcomes cannot create proposals', t => {
 const { g, input, folder } = fixture(t);
 assert.throws(() => g.create({ ...input, requested: false }), /manual request/);
 assert.throws(() => g.create({ ...input, mode: 'assisted' }), /disabled/);
 assert.throws(() => g.create({ ...input, outcomes: [{ validated: true }] }), /manual draft fields/);
 assert.throws(() => g.create({ ...input, references: [] }), /authorized project references/);
 assert.throws(() => g.create({ ...input, references: ['../outside.md'] }), /Invalid project-local path|not Skill evidence/);
 for (const name of ['../escape', 'con', 'nul']) assert.throws(() => g.create({ ...input, name }), /safe Skill name/);
 const draft = g.create(input); assert.equal(g.create(input).id, draft.id); assert.equal(draft.status, 'draft');
 assert.equal(fs.existsSync(path.join(folder, '.planwharf')), false);
 assert.deepEqual(g.suggest({ procedures: [1, 2, 3].map(resultId => ({ resultId, validated: true })) }).proposals, []);
 assert.equal(g.snapshot('a').assistedGeneration, false); assert.equal(g.snapshot('b').drafts.length, 0);
});
test('current revision and authorized folder approval create local provenance without activation', t => {
 const { dir, folder, g, input } = fixture(t), draft = g.create(input);
 assert.throws(() => g.edit('b', draft.id, draft.revision, draft.content), /selected project/);
 const edited = g.edit('a', draft.id, draft.revision, draft.content + '\nReport exact observed outcomes.\n');
 assert.throws(() => g.approve({ projectId: 'a', folder, id: draft.id, revision: draft.revision, approved: true }), /revision changed/);
 const approval = { projectId: 'a', folder, id: draft.id, revision: edited.revision, approved: true };
 assert.throws(() => g.approve({ ...approval, approved: false }), /Explicit approval/);
 const other = path.join(dir, 'other'); fs.mkdirSync(other); assert.throws(() => g.approve({ ...approval, folder: other }), /folder changed/);
 const result = g.approve(approval); assert.equal(result.activated, false); assert.equal(result.status, 'approved');
 const target = path.join(folder, '.planwharf', 'skills', input.name); assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), edited.content);
 const provenance = JSON.parse(fs.readFileSync(path.join(target, 'provenance.json'), 'utf8')); assert.equal(provenance.revision, edited.revision); assert.equal(provenance.projectId, 'a');
 assert.equal(g.approve(approval).activated, false);
 assert.equal(createSkillGeneration({ dir: path.join(dir, 'drafts') }).snapshot('a').drafts[0].status, 'approved');
});
test('changed or oversized references are bounded and revalidated at approval', t => {
 const { folder, g, input } = fixture(t), draft = g.create(input), file = path.join(folder, 'README.md');
 const approve = () => g.approve({ projectId: 'a', folder, id: draft.id, revision: draft.revision, approved: true });
 fs.writeFileSync(file, Buffer.alloc(65537, 65)); assert.throws(approve, /64 KiB/); assert.throws(() => g.create({ ...input, name: 'oversized' }), /64 KiB/);
 fs.writeFileSync(file, 'Changed evidence'); assert.throws(approve, /evidence changed/); assert.equal(fs.existsSync(path.join(folder, '.planwharf')), false);
});
test('existing differing skill or provenance is never overwritten', t => {
 const { folder, g, input } = fixture(t), draft = g.create(input), directory = path.join(folder, '.planwharf', 'skills', input.name);
 fs.mkdirSync(directory, { recursive: true }); const skill = path.join(directory, 'SKILL.md'); fs.writeFileSync(skill, 'User-authored original');
 const approve = () => g.approve({ projectId: 'a', folder, id: draft.id, revision: draft.revision, approved: true });
 assert.throws(approve, /no overwrite/); assert.equal(fs.readFileSync(skill, 'utf8'), 'User-authored original');
 fs.unlinkSync(skill); const provenance = path.join(directory, 'provenance.json'); fs.writeFileSync(provenance, 'User-authored provenance');
 assert.throws(approve, /no overwrite/); assert.equal(fs.existsSync(skill), false); assert.equal(fs.readFileSync(provenance, 'utf8'), 'User-authored provenance');
});
test('credentials rejected in drafts, edits and referenced evidence without echoing content', t => {
 const { folder, g, input } = fixture(t);
 const secrets = ['{"api_key":"synthetic-fixture-value"}', '{"access_token": "synthetic-fixture-value"}', '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----', 'password=x', 'Bearer synthetic-token'];
 for (const secret of secrets) { assert.throws(() => safeText(secret), /Potential credentials/); assert.throws(() => g.create({ ...input, procedure: secret }), /Potential credentials/); }
 assert.throws(() => safeText('{"api\\u005fkey":"fixture-value"}'), /Potential credentials/);
 const draft = g.create(input); assert.throws(() => g.edit('a', draft.id, draft.revision, draft.content + '\n' + secrets[0]), /Potential credentials/);
 fs.writeFileSync(path.join(folder, 'README.md'), secrets[0]); assert.throws(() => g.create({ ...input, name: 'secret-reference' }), /Potential credentials/);
 assert.throws(() => g.approve({ projectId: 'a', folder, id: draft.id, revision: draft.revision, approved: true }), /Potential credentials/);
 assert.equal(safeText('Use existing provider credentials without copying their contents.'), 'Use existing provider credentials without copying their contents.');
});
function assistedFixture(t) {
 const state = fixture(t), { hash } = require('./skill-catalog.cjs');
 const proposal = { id: 'proposal-a', projectId: 'a', projectRoot: fs.realpathSync(state.folder), referencePaths: ['README.md'], skillId: 'local/verified-package', contentHash: hash('assigned skill fixture'), acceptance: 'human-reviewed', testExecutionVerified: false, procedureComplianceVerified: false,
 evidence: [1, 2, 3].map(n => ({ candidateId: 'candidate-' + n, attemptId: 'attempt-' + n, reviewHash: hash('review-' + n) })) };
 proposal.sourceFingerprint = hash(JSON.stringify([proposal.projectRoot, [{ relative: 'README.md', contentHash: hash(fs.readFileSync(path.join(state.folder, 'README.md'), 'utf8')) }]]));
 const g = createSkillGeneration({ dir: path.join(state.dir, 'assisted'), resolveProcedureProposal: (projectId, proposalId) => { if (projectId !== proposal.projectId || proposalId !== proposal.id) throw Error('Foreign proposal'); return structuredClone(proposal); } });
 const input = { projectId: 'a', folder: state.folder, proposalId: proposal.id, name: 'assisted-validation', description: 'Human-reviewed package validation', procedure: 'Read the authorized requirements and run only approved fixture checks.', requested: true };
 return { ...state, g, proposal, input };
}
test('assisted draft uses backend proposal reviews, exact edit approval and inert provenance', t => {
 const { g, input, folder, proposal } = assistedFixture(t), draft = g.createAssisted(input);
 assert.equal(g.snapshot('a').assistedGeneration, true); assert.equal(draft.mode, 'assisted-human-reviewed'); assert.equal(draft.testExecutionVerified, false); assert.equal(draft.procedureComplianceVerified, false); assert.equal(draft.procedureProposal.reviews.length, 3); assert.equal(draft.procedureProposal.proposalId, proposal.id); assert.equal(fs.existsSync(path.join(folder, '.planwharf')), false);
 assert.equal(g.createAssisted(input).id, draft.id);
 const edited = g.edit('a', draft.id, draft.revision, draft.content + '\nReport limitations explicitly.\n');
 assert.throws(() => g.approve({ projectId: 'a', folder, id: draft.id, revision: draft.revision, approved: true }), /revision changed/);
 const approved = g.approve({ projectId: 'a', folder, id: draft.id, revision: edited.revision, approved: true }); assert.equal(approved.activated, false);
 const provenance = JSON.parse(fs.readFileSync(path.join(folder, '.planwharf', 'skills', input.name, 'provenance.json'), 'utf8'));
 assert.equal(provenance.mode, 'assisted-human-reviewed'); assert.equal(provenance.procedureProposal.proposalId, proposal.id); assert.equal(provenance.procedureProposal.reviews[0].reviewHash, proposal.evidence[0].reviewHash); assert.equal(provenance.testExecutionVerified, false); assert.equal(provenance.procedureComplianceVerified, false);
 assert.deepEqual(g.suggest({ outcomes: [{ validated: true }] }).proposals, []);
});
test('assisted requests cannot spoof outcomes, reference paths, foreign identity or duplicate accepted attempts', t => {
 const { g, input, proposal } = assistedFixture(t);
 assert.throws(() => g.createAssisted({ ...input, outcomes: [{ validated: true }] }), /assisted draft fields/);
 assert.throws(() => g.createAssisted({ ...input, references: ['README.md'] }), /assisted draft fields/);
 assert.throws(() => g.createAssisted({ ...input, projectId: 'b' }), /Foreign proposal/);
 assert.throws(() => g.createAssisted({ ...input, requested: false }), /Explicit request/);
 proposal.evidence[2].attemptId = proposal.evidence[1].attemptId; assert.throws(() => g.createAssisted(input), /distinct human-reviewed attempts/);
 proposal.evidence = proposal.evidence.slice(0, 2); assert.throws(() => g.createAssisted(input), /human-reviewed project proposal/);
});
test('assisted approval rejects changed review joins, changed sources and unavailable resolver', t => {
 const { dir, g, input, folder, proposal } = assistedFixture(t), draft = g.createAssisted(input), { hash } = require('./skill-catalog.cjs');
 const approval = { projectId: 'a', folder, id: draft.id, revision: draft.revision, approved: true };
 const originalHash = proposal.evidence[0].reviewHash; proposal.evidence[0].reviewHash = hash('changed review');
 assert.throws(() => g.approve(approval), /proposal changed/); proposal.evidence[0].reviewHash = originalHash;
 fs.writeFileSync(path.join(folder, 'README.md'), 'Mutated source evidence'); assert.throws(() => g.approve(approval), /source evidence changed/);
 assert.equal(fs.existsSync(path.join(folder, '.planwharf')), false);
 const noResolver = createSkillGeneration({ dir: path.join(dir, 'assisted') }); assert.equal(noResolver.snapshot('a').assistedGeneration, false); assert.throws(() => noResolver.approve(approval), /unavailable/); assert.throws(() => noResolver.createAssisted(input), /unavailable/);
});
