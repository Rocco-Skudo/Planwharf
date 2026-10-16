'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {createSkillCatalog,REVIEWED_SKILLS}=require('./skill-catalog.cjs');
const {projectFacts}=require('./supervisor.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pw-skill-catalog-'));
const fixtureFetch=async url=>({ok:true,text:async()=>url.endsWith('LICENSE')?'MIT License\nPermission is hereby granted to fixture authors.':url.endsWith('SKILL.md')?'---\nname: verification-loop\ndescription: Verify fixture behavior with tests\n---\nUNIQUE-APPROVED-PROCEDURE':'# Supporting fixture'});
test('approved scoped selection supports filters, exclusions, dedupe and truthful delivery stages',async()=>{
 const dir=temp();try{
 const candidate=REVIEWED_SKILLS.find(s=>s.id==='ecc/verification-loop');const c=createSkillCatalog({dir,fetchImpl:fixtureFetch,candidates:[candidate,{...candidate,id:'ecc/duplicate'}]});
 await c.install('a',candidate.id,true);await c.install('a','ecc/duplicate',true);
 const context={projectId:'a',role:'worker',adapter:'codex',provider:'codex',model:'gpt-fixture',task:'verify tests',taskId:'task-a',attemptId:'attempt-a'};
 assert.equal(c.select(context).selected.length,1);assert.ok(c.select(context).rejected.some(s=>s.reason.includes('Duplicate')));
 assert.equal(c.select({...context,projectId:'b'}).selected.length,0);assert.equal(c.select({...context,adapter:'unknown'}).selected.length,0);
 c.configure('a',{mode:'manual',selected:[candidate.id],sources:['ecc']});assert.equal(c.snapshot('a',{query:'verify',source:'ecc'}).catalog.length,2);
 c.configure('a',{exclusions:[candidate.id]});assert.equal(c.select(context).selected.length,0);c.configure('a',{exclusions:[]});
 const attachment=c.attach(context);assert.equal(attachment.delivery.attached,true);assert.equal(attachment.delivery.submitted,false);assert.equal(attachment.delivery.loaded,'unverified');assert.equal(attachment.delivery.verified,false);assert.match(attachment.prompt,/instruction compatibility/);
 fs.mkdirSync(path.dirname(attachment.receiptPath),{recursive:true});fs.writeFileSync(attachment.receiptPath,JSON.stringify({...attachment.delivery,submitted:true,projectId:'b'}));assert.equal(c.reconcile('a').deliveries.at(-1).submitted,false,'Foreign project receipt cannot promote a delivery');
 fs.writeFileSync(attachment.receiptPath,JSON.stringify({...attachment.delivery,submitted:true}));const row=c.reconcile('a').deliveries.at(-1);assert.equal(row.submitted,true);assert.equal(row.loaded,'unverified');assert.equal(row.followed,'unverified');assert.equal(row.verified,false);
 const facts=projectFacts({projects:[{id:'a',name:'A',status:'idle',skills:c.snapshot('a')}],models:[],execution:{subTasks:[],results:[],timeline:[]}},'a');assert.equal(facts.skills.deliveries[0].verified,false);assert.equal(facts.skills.catalog.find(s=>s.id===candidate.id).enabled,true);
 const other=projectFacts({projects:[{id:'b',name:'B',status:'idle',skills:c.snapshot('a')}],models:[],execution:{}},'b');assert.equal(other.skills.deliveries.length,0);
 const pending=projectFacts({projects:[{id:'a',name:'A',megaTaskId:'mt',status:'idle'}],models:[],execution:{subTasks:[{id:'st',megaTaskId:'mt',type:'AUDIT',status:'PENDING'}]}},'a');assert.equal(pending.workers[0].provider,'unknown');assert.equal(pending.workers[0].model,'unassigned');assert.doesNotMatch(JSON.stringify(pending),/undefined/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real isolated Codex transport receives selected instructions exactly once without claiming native loading',async()=>{
 const dir=temp();try{
 const c=createSkillCatalog({dir:path.join(dir,'registry'),fetchImpl:fixtureFetch});await c.install('a','ecc/verification-loop',true);
 const result=path.join(dir,'result.txt');const attached=c.attach({projectId:'a',task:'verify test behavior',taskId:'task-a',attemptId:'attempt-a',role:'worker',adapter:'codex',provider:'codex',model:'gpt-fixture',receiptPath:result+'.skills.json'});
 fs.writeFileSync(path.join(dir,'exec'),`let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>{require('node:fs').writeFileSync('received.txt',text);console.log('Fixture transport received instructions, no product work performed');});`);
 const job=path.join(dir,'job.json');fs.writeFileSync(job,JSON.stringify({folder:dir,result,title:'Isolated transport fixture',detail:attached.prompt,attempt:'attempt-a',model:{id:'fixture',provider:'codex',cli:'gpt-fixture'},skillDelivery:{...attached.delivery,receiptPath:attached.receiptPath}}));
 const execution=cp.spawnSync(process.execPath,[path.join(__dirname,'runner.cjs'),'--job-file',job],{encoding:'utf8',timeout:15000,windowsHide:true,env:{...process.env,PLANWHARF_CODEX:process.execPath}});assert.equal(execution.status,0,execution.stderr);
 const received=fs.readFileSync(path.join(dir,'received.txt'),'utf8');assert.equal(received.split('UNIQUE-APPROVED-PROCEDURE').length-1,1);assert.doesNotMatch(received,/matt\/tdd/);
 const observed=c.reconcile('a').deliveries[0];assert.equal(observed.submitted,true);assert.equal(observed.provider,'codex');assert.equal(observed.attemptId,'attempt-a');assert.equal(observed.loaded,'unverified');assert.equal(observed.followed,'unverified');assert.equal(observed.verified,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
