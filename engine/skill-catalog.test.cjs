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

test('prepared prompt-file receipt retains evidence without claiming submission or reading',async t=>{
 const dir=fixture(t),c=createSkillCatalog({dir,fetchImpl:fetchFixture});await c.install('a','ecc/verification-loop',true);enable(c,'a','ecc/verification-loop');const a=c.attach({...context,adapter:'grok',provider:'grok'});fs.mkdirSync(path.dirname(a.receiptPath),{recursive:true});
 const receipt={...a.skillDelivery,submitted:false,transport:'prompt-file-prepared-read-unverified',transportHash:require('./skill-catalog.cjs').hash(a.prompt),loaded:true,followed:true,verified:true};
 fs.writeFileSync(a.receiptPath,JSON.stringify({...receipt,attemptId:'foreign'}));assert.equal(c.reconcile('a').deliveries[0].transport,undefined);
 fs.writeFileSync(a.receiptPath,JSON.stringify(receipt));const row=c.reconcile('a').deliveries[0];assert.equal(row.submitted,false);assert.equal(row.transport,receipt.transport);assert.equal(row.transportHash,receipt.transportHash);assert.match(row.submissionEvidence,/file reading, submission.*unverified/);assert.equal(row.loaded,'unverified');assert.equal(row.followed,'unverified');assert.equal(row.verified,false);
 assert.equal(createSkillCatalog({dir}).reconcile('a').deliveries[0].transport,receipt.transport);
 fs.writeFileSync(a.receiptPath,JSON.stringify({...receipt,submitted:true,transport:'cli-stdin-written-consumption-unverified'}));assert.equal(c.reconcile('a').deliveries[0].submitted,true);
});

test('identical local instructions in different paths attach once after newline normalization',t=>{
 const dir=fixture(t),folder=path.join(dir,'project');fs.mkdirSync(folder);const content=markdown('shared-procedure');local(folder,'first',content);local(folder,'second',content.replace(/\n/g,'\r\n'));
 const c=createSkillCatalog({dir:path.join(dir,'registry')});c.discoverLocal('a',folder);for(const row of c.snapshot('a').catalog.filter(r=>r.source==='project-local'))enable(c,'a',row.id);
 const selected=c.select({...context,projectFolder:folder});assert.equal(selected.selected.length,1);assert.equal(selected.rejected.filter(r=>r.reason==='Duplicate instruction content.').length,1);assert.equal(c.attach({...context,projectFolder:folder}).prompt.split('PROCEDURE-shared-procedure').length-1,1);
});
test('cross-source duplicate entry text deduplicates while distinct supporting files remain eligible',async t=>{
 const dir=fixture(t),folder=path.join(dir,'project');fs.mkdirSync(folder);local(folder,'local-copy',markdown('verification-loop'));
 const base=REVIEWED_SKILLS.find(r=>r.id==='ecc/verification-loop'),multi={...base,id:'ecc/multi-file',files:[...base.files,'skills/verification-loop/extra.md']};
 const c=createSkillCatalog({dir:path.join(dir,'registry'),candidates:[base,multi],fetchImpl:async url=>url.endsWith('/extra.md')?{ok:true,text:async()=> 'Distinct supporting verification steps.'}:fetchFixture(url)});
 for(const id of [base.id,multi.id]){await c.install('a',id,true);enable(c,'a',id);}c.discoverLocal('a',folder);const localRow=c.snapshot('a').catalog.find(r=>r.source==='project-local');enable(c,'a',localRow.id);
 const selected=c.select({...context,projectFolder:folder});assert.deepEqual(selected.selected.map(r=>r.id),[base.id,multi.id]);assert.ok(selected.rejected.some(r=>r.id===localRow.id&&r.reason==='Duplicate instruction content.'));
});

test('docs compatibility requires exact explicit request and separately eligible grilling',async t=>{
 const dir=fixture(t);let calls=0, mutateGrilling=false;const c=createSkillCatalog({dir,fetchImpl:async url=>{calls++;if(mutateGrilling&&url.includes('/productivity/grilling/SKILL.md'))return{ok:true,text:async()=>markdown('changed-grilling')};return fetchFixture(url);}}),id='matt/grill-with-docs';const request={...context,role:'orchestrator',task:'Discuss architecture',requestedSkills:[id]};
 const row=c.snapshot('a').catalog.find(r=>r.id===id);assert.equal(row.validation,'instruction-compatible-docs-drafts');assert.equal(row.reviewed,true);assert.ok(row.dependencies.find(d=>d.id==='matt/domain-modeling').bundled);assert.equal(row.files.some(f=>f.includes('/grilling/')),false);
 await assert.rejects(c.install('a',id,false),/Explicit approval/);assert.equal(calls,0);await c.install('a',id,true);assert.equal(c.select(request).selected.length,0);enable(c,'a',id);
 assert.equal(c.select(request).selected.length,0);assert.match(c.select(request).rejected.find(r=>r.id===id).reason,/grilling dependency/);
 await c.install('a','matt/grilling',true);enable(c,'a','matt/grilling');assert.deepEqual(c.select(request).selected.map(r=>r.id),['matt/grilling',id]);
 const inspected=c.inspect('a',id);assert.match(inspected.texts['PLANWHARF-COMPATIBILITY.md'],/DRAFTS IN CHAT ONLY/);assert.match(inspected.texts['PLANWHARF-COMPATIBILITY.md'],/do not write project documentation or source/);assert.equal(inspected.contentHash,require('./skill-catalog.cjs').hash(JSON.stringify(inspected.texts)));
 assert.ok(c.select({...request,requestedSkills:[]}).rejected.some(r=>r.id===id&&r.reason==='Explicit docs interview required.'));
 assert.equal(c.select({...request,role:'worker'}).selected.some(r=>r.id===id),false);
 c.configure('a',{disabled:['matt/grilling']});assert.equal(c.select(request).selected.some(r=>r.id===id),false);
 c.configure('a',{disabled:[],mode:'manual',selected:[id]});assert.equal(c.select(request).selected.length,0);
 c.configure('a',{selected:[id,'matt/grilling']});assert.equal(c.select(request).selected.length,2);
 const attached=c.attach(request);assert.equal(attached.prompt.split('SKILL matt/grilling@').length-1,1);assert.equal(attached.prompt.split('SKILL matt/grill-with-docs@').length-1,1);assert.equal(attached.delivery.nativeSupport,'unverified');
 c.approve('a','matt/grilling',false);assert.equal(c.select(request).selected.some(r=>r.id===id),false);
 enable(c,'a','matt/grilling');mutateGrilling=true;await c.install('a','matt/grilling',true);assert.equal(c.select(request).selected.some(r=>r.id===id),false);
});
test('docs port policy bytes are bound to inspected approval and invalidate refreshed consent',async t=>{
 const candidate=REVIEWED_SKILLS.find(r=>r.id==='matt/grill-with-docs'),dir=fixture(t);const c=createSkillCatalog({dir,fetchImpl:fetchFixture});await c.install('a',candidate.id,true);const inspected=enable(c,'a',candidate.id);
 const changed=createSkillCatalog({dir,candidates:[{...candidate,adapterInstructions:candidate.adapterInstructions+' Clarify draft provenance.'}],fetchImpl:fetchFixture});await changed.install('a',candidate.id,true);assert.notEqual(changed.inspect('a',candidate.id).contentHash,inspected.contentHash);assert.equal(changed.snapshot('a').catalog.find(r=>r.id===candidate.id).approved,false);
 assert.throws(()=>changed.approve('a',candidate.id,true,inspected.contentHash),/content hash/);
});

test('reviewed declared conflicts block both eligible instructions until one is explicitly excluded',async t=>{
 const base=REVIEWED_SKILLS.find(r=>r.id==='ecc/verification-loop'),first={...base,id:'ecc/first',conflicts:['ecc/second']},second={...base,id:'ecc/second',entry:'skills/second/SKILL.md',files:['skills/second/SKILL.md','LICENSE']};
 const c=createSkillCatalog({dir:fixture(t),candidates:[first,second],fetchImpl:async url=>url.includes('/second/')?{ok:true,text:async()=>markdown('distinct-second')}:fetchFixture(url)});
 for(const candidate of [first,second]){await c.install('a',candidate.id,true);enable(c,'a',candidate.id);}const selection=c.select(context);assert.equal(selection.selected.length,0);for(const id of [first.id,second.id])assert.match(selection.rejected.find(r=>r.id===id).reason,/Declared instruction conflict/);
 assert.deepEqual(c.snapshot('a').catalog.find(r=>r.id===first.id).conflicts,['ecc/second']);assert.equal(c.attach(context).prompt,'');
 c.configure('a',{exclusions:[second.id]});assert.deepEqual(c.select(context).selected.map(r=>r.id),[first.id]);
 c.configure('a',{exclusions:[],disabled:[first.id]});assert.deepEqual(c.select(context).selected.map(r=>r.id),[second.id]);
});
test('malformed conflict declarations are rejected before registry or instruction use',t=>{
 const candidate=REVIEWED_SKILLS.find(r=>r.id==='ecc/verification-loop');
 for(const conflicts of [candidate.id,[candidate.id],['../escape'],['ecc/peer','ecc/peer'],Array.from({length:31},(_,i)=>'ecc/peer-'+i),[null]])assert.throws(()=>createSkillCatalog({dir:fixture(t),candidates:[{...candidate,conflicts}]}),/conflicts/);
});
