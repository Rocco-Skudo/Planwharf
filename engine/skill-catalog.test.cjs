'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createSkillCatalog, REVIEWED_SKILLS } = require('./skill-catalog.cjs');
const root = path.resolve(__dirname, '../work');
fs.mkdirSync(root, { recursive: true });
function fixture(t) { const dir = fs.mkdtempSync(path.join(root, 'catalog-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
const markdown = name => `---\nname: ${name}\ndescription: Verify fixture tests\n---\nPROCEDURE-${name}`;
const fetchFixture = async url => ({ ok: true, text: async () => url.endsWith('/LICENSE') ? 'MIT License\nPermission is hereby granted to fixture authors.' : markdown('verification-loop') });
function enable(c, projectId, id) { const view = c.inspect(projectId, id); c.approve(projectId, id, true, view.contentHash); return view; }
function local(folder, name, content = markdown(name)) { const file = path.join(folder, '.planwharf', 'skills', name, 'SKILL.md'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
const context = { projectId: 'a', role: 'worker', adapter: 'codex', provider: 'codex', model: 'fixture', task: 'verify tests', attemptId: 'attempt' };
test('pinned downloads require approval; inspected bytes require separate content approval', async t => {
 const dir = fixture(t); let calls = 0;
 const c = createSkillCatalog({ dir, fetchImpl: async url => { calls++; return fetchFixture(url); } });
 await assert.rejects(c.install('a', 'ecc/verification-loop', false), /Explicit approval/); assert.equal(calls, 0);
 await c.install('a', 'ecc/verification-loop', true);
 assert.equal(c.select(context).selected.length, 0);
 assert.throws(() => c.approve('a', 'ecc/verification-loop', true), /content hash/);
 assert.throws(() => c.approve('a', 'ecc/verification-loop', true, 'stale'), /content hash/);
 const view = enable(c, 'a', 'ecc/verification-loop'); assert.match(Object.values(view.texts).join(''), /PROCEDURE/);
 assert.equal(c.select(context).selected.length, 1); assert.equal(c.select({ ...context, projectId: 'b' }).selected.length, 0);
 assert.equal(c.select({ ...context, adapter: 'unknown' }).selected.length, 0);
 c.configure('a', { mode: 'manual', selected: [] }); assert.equal(c.select(context).selected.length, 0);
 c.configure('a', { selected: ['ecc/verification-loop'], sources: ['ecc'] }); assert.equal(c.select(context).selected.length, 1);
 c.configure('a', { disabled: ['ecc/verification-loop'] }); assert.equal(c.select(context).selected.length, 0);
});
test('local rescan preserves unchanged approval, revokes mutations, deletions and renames', t => {
 const dir = fixture(t), folder = path.join(dir, 'project'); fs.mkdirSync(folder);
 const c = createSkillCatalog({ dir: path.join(dir, 'registry') }); const file = local(folder, 'first');
 c.discoverLocal('a', folder); const id = c.snapshot('a').catalog.find(r => r.source === 'project-local').id;
 const inspected = enable(c, 'a', id); c.discoverLocal('a', folder); assert.equal(c.select({ ...context, projectFolder: folder }).selected.length, 1);
 assert.throws(() => c.inspect('b', id), /unavailable/);
 fs.writeFileSync(file, markdown('changed')); c.discoverLocal('a', folder); assert.equal(c.select(context).selected.length, 0);
 assert.throws(() => c.approve('a', id, true, inspected.contentHash), /content hash/);
 enable(c, 'a', id); fs.renameSync(path.dirname(file), path.join(path.dirname(path.dirname(file)), 'second'));
 c.discoverLocal('a', folder); assert.equal(c.select(context).selected.length, 0); assert.equal(c.snapshot('a').catalog.some(r => r.id === id), false);
 const renamed = c.snapshot('a').catalog.find(r => r.source === 'project-local'); enable(c, 'a', renamed.id);
 fs.rmSync(path.join(folder, '.planwharf', 'skills'), { recursive: true }); c.discoverLocal('a', folder);
 assert.equal(c.select(context).selected.length, 0); assert.equal(c.snapshot('a').catalog.some(r => r.source === 'project-local'), false);
 assert.equal(createSkillCatalog({ dir: path.join(dir, 'registry') }).select(context).selected.length, 0);
});
test('oversized and invalid local skills fail closed without preserving cached approval', t => {
 const dir = fixture(t), folder = path.join(dir, 'project'); fs.mkdirSync(folder);
 const c = createSkillCatalog({ dir: path.join(dir, 'registry') }); const file = local(folder, 'first');
 c.discoverLocal('a', folder); const id = c.snapshot('a').catalog.find(r => r.source === 'project-local').id; enable(c, 'a', id);
 fs.writeFileSync(file, Buffer.alloc(65537, 65)); assert.throws(() => c.discoverLocal('a', folder), /64 KiB/);
 assert.equal(c.select(context).selected.length, 0);
 fs.writeFileSync(file, 'not a skill'); c.discoverLocal('a', folder); assert.equal(c.snapshot('a').catalog.some(r => r.id === id), false);
});
test('duplicate text is attached once; receipts establish transport submission only', async t => {
 const dir = fixture(t), candidate = REVIEWED_SKILLS.find(r => r.id === 'ecc/verification-loop');
 const c = createSkillCatalog({ dir, candidates: [candidate, { ...candidate, id: 'ecc/duplicate' }], fetchImpl: fetchFixture });
 for (const id of ['ecc/verification-loop', 'ecc/duplicate']) { await c.install('a', id, true); enable(c, 'a', id); }
 assert.equal(c.select(context).selected.length, 1); assert.ok(c.select(context).rejected.some(r => /Duplicate/.test(r.reason)));
 const a = c.attach(context); assert.equal(a.prompt.split('PROCEDURE-').length - 1, 1); assert.equal(a.delivery.submitted, false);
 fs.mkdirSync(path.dirname(a.receiptPath), { recursive: true });
 fs.writeFileSync(a.receiptPath, JSON.stringify({ ...a.skillDelivery, projectId: 'b', submitted: true })); assert.equal(c.reconcile('a').deliveries[0].submitted, false);
 fs.writeFileSync(a.receiptPath, JSON.stringify({ ...a.skillDelivery, submitted: true })); const row = c.reconcile('a').deliveries[0];
 assert.equal(row.submitted, true); assert.equal(row.loaded, 'unverified'); assert.equal(row.followed, 'unverified'); assert.equal(row.verified, false);
 assert.equal(c.snapshot('b').deliveries.length, 0);
});

test('delivery preference is explicit and local content is revalidated at dispatch', t => {
 const dir = fixture(t), folder = path.join(dir, 'project'), other = path.join(dir, 'other'); fs.mkdirSync(folder); fs.mkdirSync(other);
 const c = createSkillCatalog({ dir: path.join(dir, 'registry') });
 assert.equal(c.snapshot('a').preferences.deliveryEnabled, false);
 assert.throws(() => c.configure('a', { deliveryEnabled: 'true' }), /boolean/);
 c.configure('a', { deliveryEnabled: true }); assert.equal(c.snapshot('a').preferences.deliveryEnabled, true);
 const file = local(folder, 'fixture'); c.discoverLocal('a', folder); const id = c.snapshot('a').catalog.find(r => r.source === 'project-local').id; enable(c, 'a', id);
 assert.equal(c.select(context).selected.length, 0);
 assert.equal(c.select({ ...context, projectFolder: other }).selected.length, 0);
 assert.equal(c.select({ ...context, projectFolder: folder }).selected.length, 1);
 fs.writeFileSync(file, markdown('mutated'));
 assert.equal(c.attach({ ...context, projectFolder: folder }).delivery.attached, false);
});
test('receipts require exact assignment identity, bounded storage and registry-owned destination', async t => {
 const dir = fixture(t), c = createSkillCatalog({ dir, fetchImpl: fetchFixture });
 await c.install('a', 'ecc/verification-loop', true); enable(c, 'a', 'ecc/verification-loop');
 const a = c.attach({ ...context, receiptPath: path.join(dir, 'untrusted.json') });
 assert.notEqual(a.receiptPath, path.join(dir, 'untrusted.json')); assert.equal(a.promptHash, a.skillDelivery.assignedPromptHash);
 fs.mkdirSync(path.dirname(a.receiptPath), { recursive: true });
 for (const patch of [{recordId:'wrong'}, {attemptId:'wrong'}, {provider:'wrong'}, {model:'wrong'}, {assignedPromptHash:'wrong'}, {skills:[]}, {skills:[{id:'ecc/verification-loop',contentHash:'wrong'}]}]) {
  fs.writeFileSync(a.receiptPath, JSON.stringify({...a.skillDelivery, submitted:true, ...patch}));
  assert.equal(c.reconcile('a').deliveries[0].submitted, false);
 }
 fs.writeFileSync(a.receiptPath, ' '.repeat(65537)); assert.equal(c.reconcile('a').deliveries[0].submitted, false);
 fs.writeFileSync(a.receiptPath, JSON.stringify({...a.skillDelivery, submitted:true, loaded:true, followed:true, verified:true}));
 const row=c.reconcile('a').deliveries[0]; assert.equal(row.submitted,true); assert.equal(row.loaded,'unverified'); assert.equal(row.followed,'unverified'); assert.equal(row.verified,false);
});

test('native Grill with docs is visible metadata only and cannot download or execute',async t=>{
 const c=createSkillCatalog({dir:fixture(t),fetchImpl:()=>{throw Error('No downloads');}}), row=c.snapshot('a').catalog.find(r=>r.id==='matt/grill-with-docs');
 assert.equal(row.validation,'unsupported-native-dependencies');assert.equal(row.reviewed,false);assert.equal(row.downloadable,false);assert.equal(row.installed,false);assert.ok(row.dependencies.some(d=>d.id==='matt/domain-modeling'&&d.reviewed===false));
 await assert.rejects(c.install('a',row.id,true),/reviewed pinned/); c.configure('a',{mode:'manual',selected:[row.id]});const selection=c.select({...context,role:'orchestrator',task:'grill with docs'});assert.equal(selection.selected.length,0);assert.match(selection.rejected.find(r=>r.id===row.id).reason,/Unsupported native dependencies/);
});
test('prepared prompt-file receipt retains evidence without claiming submission or reading',async t=>{
 const dir=fixture(t),c=createSkillCatalog({dir,fetchImpl:fetchFixture});await c.install('a','ecc/verification-loop',true);enable(c,'a','ecc/verification-loop');const a=c.attach({...context,adapter:'grok',provider:'grok'});fs.mkdirSync(path.dirname(a.receiptPath),{recursive:true});
 const receipt={...a.skillDelivery,submitted:false,transport:'prompt-file-prepared-read-unverified',transportHash:require('./skill-catalog.cjs').hash(a.prompt),loaded:true,followed:true,verified:true};
 fs.writeFileSync(a.receiptPath,JSON.stringify({...receipt,attemptId:'foreign'}));assert.equal(c.reconcile('a').deliveries[0].transport,undefined);
 fs.writeFileSync(a.receiptPath,JSON.stringify(receipt));const row=c.reconcile('a').deliveries[0];assert.equal(row.submitted,false);assert.equal(row.transport,receipt.transport);assert.equal(row.transportHash,receipt.transportHash);assert.match(row.submissionEvidence,/file reading, submission.*unverified/);assert.equal(row.loaded,'unverified');assert.equal(row.followed,'unverified');assert.equal(row.verified,false);
 assert.equal(createSkillCatalog({dir}).reconcile('a').deliveries[0].transport,receipt.transport);
 fs.writeFileSync(a.receiptPath,JSON.stringify({...receipt,submitted:true,transport:'cli-stdin-written-consumption-unverified'}));assert.equal(c.reconcile('a').deliveries[0].submitted,true);
});
