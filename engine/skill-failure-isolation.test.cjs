'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createServer } = require('../server.cjs');
async function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-skill-isolation-')), seed=require('../fixtures/starter-notebook.json').projects[0];
 const projects=['alpha','beta'].map(id=>{const item=structuredClone(seed);item.project={id,name:id,folder:path.join(dir,id)};item.tasks=[];item.revisions.at(-1).open=[];fs.mkdirSync(item.project.folder);return item;});
 const planFile=path.join(dir,'notebook.json');fs.writeFileSync(planFile,JSON.stringify({schema:2,projects}));
 const launches=[], calls=[], live=new Set();let downloads=0;
 const server=createServer({planFile,attemptsDir:path.join(dir,'attempts'),syncSkills:false,refreshModels:false,monitorIntervalMs:60000,fetchPlans:null,
  models:[{id:'fixture',provider:'codex',cli:'gpt-6-luna',enabled:true,available:true,kind:'default'}],
  skills:{snapshot:()=>({sha:null}),ensure:()=>{downloads++;throw Error('Legacy cache unavailable in offline fixture');},prompt:()=>'',read:()=>''},
  inspectFolder:()=>({git:false,names:[],dirty:[]}),readRepository:()=>({local:{},remote:{},comparison:{}}),
  spawnWorker:info=>{launches.push(info);const pid=87000+launches.length;live.add(pid);return {pid};},isProcessAlive:pid=>live.has(pid),killWorker:()=>{throw Error('Fixture cannot terminate workers');},askModel:async info=>{calls.push(info);return {answer:'Q1: Fixture? Recommended: inspect.'};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{live.clear();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
 async function request(route,input,expected=200){const response=await fetch('http://127.0.0.1:'+server.address().port+route,input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;}
 return {request,launches,calls,live,downloads:()=>downloads};
}
test('catalog auto-start reports required interview Skill failure without silently substituting builtin questions',async t=>{
 const f=await fixture(t);await f.request('/api/project-skills/settings',{projectId:'alpha',settings:{deliveryEnabled:true}});await f.request('/api/orchestrator/lead',{id:'fixture'});
 const plan=await f.request('/api/plan');const failure=await f.request('/api/orchestrator/start',{projectId:'alpha',version:plan.version},400);assert.match(failure.error,/requires approved, selected matt\/grilling/);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.launches,[]);assert.equal(f.downloads(),0);
 const state=await f.request('/api/orchestrator?readOnly=1');assert.equal(state.projects.find(p=>p.id==='alpha').pendingAutoStart,false);
});
test('global tick advances catalog project while unrelated legacy proposal has no downloadable cache',async t=>{
 const f=await fixture(t);await f.request('/api/project-skills/settings',{projectId:'alpha',settings:{deliveryEnabled:true}});
 const proposed=await f.request('/api/orchestrator/propose',{projectId:'alpha',title:'Isolated chain',goal:'Fixture only',subTasks:[0,1].map(i=>({title:'Fixture '+i,detail:'No provider',assignedModelId:'fixture',type:'IMPLEMENTATION',dependsOn:i?[0]:[]}))},201);
 const mega=proposed.snapshot.projects.find(p=>p.id==='alpha').megaTaskId;await f.request('/api/orchestrator/approve',{projectId:'alpha',megaTaskId:mega});assert.equal(f.launches.length,1);
 await f.request('/api/orchestrator/propose',{projectId:'beta',title:'Legacy awaiting approval',goal:'Do not launch',subTasks:[{title:'Legacy fixture',detail:'Await approval',assignedModelId:'fixture',type:'IMPLEMENTATION',dependsOn:[]}]},201);
 const info=f.launches[0];fs.writeFileSync(info.structuredResultPath,JSON.stringify({resultId:info.resultId,attemptId:info.attemptId,subTaskId:info.subTaskId,megaTaskId:info.megaTaskId,provider:'codex',cli:'gpt-6-luna',assignedModelId:'fixture',status:'COMPLETE',summary:'Fixture complete',tests:[],filesChanged:[],blockers:[],nextAction:'Next fixture',createdAt:new Date().toISOString()}));
 fs.writeFileSync(info.exitPath,JSON.stringify({attemptId:info.attemptId,provider:'codex',model:'gpt-6-luna',exitCode:0}));f.live.delete(87001);
 const state=await f.request('/api/orchestrator');assert.equal(f.launches.length,2);assert.ok(f.launches.every(row=>row.projectId==='alpha'));assert.equal(state.projects.find(row=>row.id==='beta').status,'needs_approval');assert.equal(f.downloads(),0);assert.deepEqual(f.calls,[]);
});

test('chat Grill reports catalog approval gate exactly without inventing a provider failure',async t=>{
 const f=await fixture(t);await f.request('/api/project-skills/settings',{projectId:'alpha',settings:{deliveryEnabled:true}});await f.request('/api/orchestrator/lead',{id:'fixture'});
 for(const kind of ['me','docs']) {
  const response=await f.request('/api/orchestrator/ask',{projectId:'alpha',chatSessionId:'catalog-gate-'+kind,question:kind==='docs'?'Grill with the docs':'Grill me',grillKind:kind});
  assert.match(response.answer,/project catalog requires approved, selected matt\/grilling/);
  if(kind==='docs')assert.match(response.answer,/matt\/grill-with-docs/);
  assert.doesNotMatch(response.answer,/PROVIDER_EXECUTION_FAILED|Provider execution failed|CLI error/i);
  assert.equal(response.asks[0].diagnostic,null);
 }
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.launches,[]);assert.equal(f.downloads(),0);
});
