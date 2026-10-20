'use strict';
// Explicit real-model audit: never substitutes a provider or installs a fixture CLI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const stage=process.argv[2],out=path.resolve(process.argv[3]||'');
if(!process.argv[3])throw Error('Usage: node scripts/audit/real-model.cjs STAGE DISPOSABLE_DIRECTORY');
const {url}=JSON.parse(fs.readFileSync(path.join(out,'server.json')));
const model=stage==='init'?null:JSON.parse(fs.readFileSync(path.join(out,'real-model.json')));
const project=stage==='init'?null:JSON.parse(fs.readFileSync(path.join(out,'calculator-project.json')));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function record(name,data){fs.appendFileSync(path.join(out,'real-events.jsonl'),JSON.stringify({at:new Date().toISOString(),name,...data})+'\n');console.log(name,JSON.stringify(data));}
async function api(route,input,expected){const r=await fetch(url+route,input===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});const v=await r.json();fs.appendFileSync(path.join(out,'real-http.jsonl'),JSON.stringify({at:new Date().toISOString(),route,status:r.status,input,value:v})+'\n');if(expected!==undefined)assert.equal(r.status,expected,v.error);else if(!r.ok)throw Error(route+': '+r.status+' '+v.error);return v;}
async function snapshot(){return api('/api/orchestrator');}
async function wait(id,limit=600000){let status;for(const end=Date.now()+limit;Date.now()<end;){const s=await snapshot(),r=s.projects.find(p=>p.id===id);if(r.status!==status){status=r.status;record('status',{projectId:id,status,megaTaskId:r.megaTaskId});}if(['complete','failed','checkpointed'].includes(r.status))return {row:r,s};await delay(1500);}throw Error('Real model timed out; inspect its owned process before stopping.');}
async function propose(id,title,detail,type='IMPLEMENTATION',extra=[]){const r=await api('/api/orchestrator/propose',{projectId:id,title,goal:detail.slice(0,1500),subTasks:[{title,detail,assignedModelId:model.id,type,dependsOn:[]},...extra]},201);return r.snapshot.projects.find(p=>p.id===id);}
async function approve(id,row){return api('/api/orchestrator/approve',{projectId:id,megaTaskId:row.megaTaskId});}
const requirements='Build a lightweight calculator with index.html, calculator.js, calculator.test.cjs and README.md. calculator.js must export calculate(expression) using CommonJS for Node and expose Calculator.calculate to the browser. Use an expression input #expression and status #status; Enter calculates and Escape clears. Support + - * / decimals parentheses and unary signs; reject invalid input and division by zero; avoid eval and dependencies. Tests must run with node --test calculator.test.cjs. Keep all source files inside the linked project; use the assigned structured result path for execution metadata. Do not install anything, call external services, push, or spawn subagents.';
(async()=>{const app=await api('/api/app');assert.equal(path.resolve(app.planFile),path.join(out,'notebook.json'));
if(stage==='init'){
 const exact=process.argv[4];assert.ok(exact,'Pass an exact listed Codex model ID explicitly.');
 const selected=(await api('/api/orchestrator?readOnly=1')).models.find(m=>m.cli===exact&&m.adapter==='codex'&&m.available!==false&&!m.catalogExcluded);assert.ok(selected,'Exact model is not in the installed CLI catalog');
 for(const role of ['orchestrator','worker','reviewer','supervisor'])await api('/api/models/roles/bulk',{role,enabled:false});
 await api('/api/models/roles',{id:selected.id,roles:{orchestrator:true,worker:true,reviewer:true,supervisor:false}});await api('/api/providers/policy',{id:selected.provider,policy:{alwaysApprove:false,minRemainingPercent:20,warningRemainingPercent:30,fallbackProviderId:null}});await api('/api/orchestrator/lead',{id:selected.id});
 const response=await api('/api/orchestrator/ask',{projectId:'audit-control',question:'Reply with exactly REAL_CODEX_CONNECTION_OK. Do not use tools, change files, start work or delegate.'});assert.equal(response.diagnostic?.code,undefined);assert.match(response.answer,/REAL_CODEX_CONNECTION_OK/);
 fs.writeFileSync(path.join(out,'real-model.json'),JSON.stringify({id:selected.id,provider:selected.provider,cli:selected.cli}));record('real-connection',{model:selected.cli,status:'PASS'});return;
}
assert.equal(path.resolve(project.folder),path.join(out,'Planwharf-Dummy-Calculator'));
const m=(await api('/api/orchestrator?readOnly=1')).models.find(m=>m.id===model.id);assert.equal(m.cli,model.cli);assert.equal(m.provider,model.provider);assert.equal(m.adapter,'codex');
if(stage==='setup'){
 assert.equal(fs.existsSync(path.join(project.folder,'calculator.js')),false,'Use a fresh disposable calculator project.');
 const git=args=>execFileSync('git',['-C',project.folder,...args],{windowsHide:true});fs.writeFileSync(path.join(project.folder,'README.md'),'Blank disposable real-model calculator project.');git(['init','-q']);git(['add','README.md']);git(['-c','user.name=Audit fixture','-c','user.email=audit@example.invalid','commit','-qm','Blank real-model audit project']);
 const skillFile=path.join(project.folder,'.planwharf/skills/real-audit/SKILL.md');fs.mkdirSync(path.dirname(skillFile),{recursive:true});fs.writeFileSync(skillFile,'---\nname: real-audit\ndescription: Real model audit evidence\n---\nREAL-MODEL-SKILL-20261020\nFor implementation jobs, write this exact marker to skill-receipt.txt in the linked folder. Audit jobs must not modify source files. Report only actual observed tests.\n');
 const found=await api('/api/project-skills/discover',{projectId:project.id});const skill=found.catalog.find(s=>s.source==='project-local'&&s.name==='real-audit');assert.ok(skill);await api('/api/project-skills/approve',{projectId:project.id,id:skill.id,enabled:true,contentHash:skill.contentHash});await api('/api/project-skills/settings',{projectId:project.id,settings:{deliveryEnabled:true,mode:'manual',selected:[skill.id]}});
 const r=await api('/api/orchestrator/ask',{projectId:project.id,question:'Plan this request without editing files or starting workers: '+requirements});record('real-lead',{model:model.cli,diagnostic:r.diagnostic?.code||null,answer:r.answer});assert.equal(r.diagnostic?.code,undefined);assert.equal(fs.existsSync(path.join(project.folder,'calculator.js')),false);
}else if(stage==='build'){
 const row=await propose(project.id,'Build the real-model calculator',requirements);assert.equal(fs.existsSync(path.join(project.folder,'calculator.js')),false);await approve(project.id,row);const done=await wait(project.id);record('real-build',{model:model.cli,status:done.row.status,next:done.row.next});assert.equal(done.row.status,'complete');
}else if(stage==='resume-build'){
 const current=(await snapshot()).projects.find(p=>p.id===project.id);assert.equal(current.status,'failed');await api('/api/orchestrator/resume',{projectId:project.id,megaTaskId:current.megaTaskId,checkpointId:current.checkpoint.id,confirmChanges:true});const done=await wait(project.id);record('real-resumed-build',{model:model.cli,status:done.row.status,next:done.row.next});assert.equal(done.row.status,'complete');
}else if(stage==='review'||stage==='reject'){
 const source=path.join(project.folder,'calculator.js');
 if(stage==='reject'){const pristine=fs.readFileSync(source);fs.writeFileSync(path.join(out,'calculator-before-deliberate-defect.js'),pristine);fs.appendFileSync(source,"\n// Deliberate real-model audit defect; the model must detect and correct this.\nif(typeof module==='object'){const original=module.exports.calculate;module.exports.calculate=expression=>String(expression).replace(/\\s+/g,'')==='1/0'?0:original(expression); }\n");record('deliberate-defect',{description:'Return zero for division by zero in the exported calculator.'});}
 const before=fs.readFileSync(source);
 const row=await propose(project.id,'Independently review the calculator','Independently inspect all calculator files and execute node --test calculator.test.cjs. Verify addition, subtraction, multiplication, division, decimals, unary signs, parentheses, keyboard Enter/Escape, invalid expressions and division-by-zero handling. Do not modify source. Return FAILED with actionable blockers if any requirement or test fails; COMPLETE only when actual evidence passes. Record the audit report in the final structured result, which the runner saves.', 'AUDIT');await approve(project.id,row);const done=await wait(project.id);assert.deepEqual(fs.readFileSync(source),before,'Audit worker must not edit calculator source');record('real-review',{model:model.cli,status:done.row.status,next:done.row.next});assert.equal(done.row.status,stage==='reject'?'failed':'complete');
}else if(stage==='correct'){
 let row=(await snapshot()).projects.find(p=>p.id===project.id);
 if(row.status!=='needs_approval'){
  const requested=await api('/api/orchestrator/ask',{projectId:project.id,question:'Fix the calculator division-by-zero defect identified by the failed review, run its tests, and wait for separate review. Coordinate a worker and wait for approval; do not edit source yourself.'});assert.equal(requested.diagnostic?.code,undefined);
  row=(await snapshot()).projects.find(p=>p.id===project.id);
 }
 assert.equal(row.status,'needs_approval','The normal new-work request must prepare an approval gate');
 await approve(project.id,row);const done=await wait(project.id);record('real-correction',{model:model.cli,status:done.row.status,next:done.row.next});assert.equal(done.row.status,'complete');
}else if(stage==='concurrency'){
 const projects=[];
 for(let i=1;i<=3;i++){
  const name='Audit-Real-'+i,folder=path.join(out,name);fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'README.md'),'Disposable real-model concurrency project.');
  const git=args=>execFileSync('git',['-C',folder,...args],{windowsHide:true});git(['init','-q']);git(['add','README.md']);git(['-c','user.name=Audit fixture','-c','user.email=audit@example.invalid','commit','-qm','Blank concurrent project']);
  const created=await api('/api/projects',{version:(await api('/api/plan')).version,project:{name,folder,direction:'Real-model concurrency and checkpoint test only.'}},201);projects.push(created.plan.projects.at(-1).project);
 }
 fs.writeFileSync(path.join(out,'concurrent-projects.json'),JSON.stringify(projects));
 for(const p of projects){const row=await propose(p.id,'Real model wait and checkpoint','Write REAL_MODEL_PROJECT='+p.id+' to real-receipt.txt in this linked folder. Then run a PowerShell loop that waits until a file named release exists in this folder, sleeping one second between checks, for at most 240 seconds. Once released, return COMPLETE after verifying your receipt. If waiting expires, return BLOCKED. Do not edit other files, install anything, call external services, push or spawn subagents. Report only actual observations in your final structured response.');await approve(p.id,row);}
 let previous=0;
 for(const end=Date.now()+180000;Date.now()<end;){const ready=projects.filter(p=>fs.existsSync(path.join(p.folder,'real-receipt.txt')));const current=await api('/api/orchestrator?readOnly=1');if(projects.some(p=>current.projects.find(r=>r.id===p.id).status==='failed'))throw Error('A real concurrency worker failed; inspect its provider diagnostic before retrying.');if(ready.length!==previous){previous=ready.length;record('real-concurrency-ready',{count:ready.length});}if(ready.length===3){const snap=await snapshot();for(const p of projects){assert.ok(fs.readFileSync(path.join(p.folder,'real-receipt.txt'),'utf8').includes(p.id));assert.ok(snap.projects.find(r=>r.id===p.id).dispatch.some(d=>d.alive&&d.cli===model.cli));}record('real-three-projects',{model:model.cli,projects:projects.map(p=>p.id),status:'PASS'});return;}await delay(1500);}throw Error('Real concurrency receipts timed out');
}else if(stage==='concurrency-retry'){
 const projects=JSON.parse(fs.readFileSync(path.join(out,'concurrent-projects.json')));
 for(const [index,p]of projects.entries()){
  const row=(await snapshot()).projects.find(r=>r.id===p.id);assert.equal(row.status,'failed');await api('/api/orchestrator/resume',{projectId:p.id,megaTaskId:row.megaTaskId,checkpointId:row.checkpoint.id,confirmChanges:true});
  let ready=false;
  for(const end=Date.now()+120000;Date.now()<end;){const current=(await snapshot()).projects.find(r=>r.id===p.id);if(current.status==='failed')throw Error('Real provider rejected staggered concurrency: '+p.id);if(fs.existsSync(path.join(p.folder,'real-receipt.txt'))){ready=true;break;}await delay(1500);}
  assert.ok(ready,'Real concurrency receipt missing');record('real-staggered-ready',{count:index+1,model:model.cli});
 }
 const snap=await snapshot();assert.ok(projects.every(p=>snap.projects.find(r=>r.id===p.id).dispatch.some(d=>d.alive&&d.cli===model.cli)));record('real-three-projects',{model:model.cli,projects:projects.map(p=>p.id),status:'PASS',admission:'staggered after observed provider burst rate limits'});
}else if(stage==='stop-concurrency'){
 const projects=JSON.parse(fs.readFileSync(path.join(out,'concurrent-projects.json'))),pids=[];
 for(const p of projects){const row=(await snapshot()).projects.find(r=>r.id===p.id);pids.push(...row.dispatch.filter(d=>d.alive).map(d=>d.pid));if(row.dispatch.some(d=>d.alive))await api('/api/orchestrator/stop',{projectId:p.id,megaTaskId:row.megaTaskId});}
 for(let i=0;i<40&&pids.some(pid=>require('../../engine/runner.cjs').isProcessAlive(pid));i++)await delay(100);
 assert.ok(pids.every(pid=>!require('../../engine/runner.cjs').isProcessAlive(pid)));const snap=await snapshot();assert.ok(projects.every(p=>snap.projects.find(r=>r.id===p.id).status==='checkpointed'||snap.projects.find(r=>r.id===p.id).status==='failed'));record('real-concurrency-stopped',{count:pids.length,ownedPidsDead:true});
}else if(stage==='resume-concurrency'){
 const p=JSON.parse(fs.readFileSync(path.join(out,'concurrent-projects.json')))[0],row=(await snapshot()).projects.find(r=>r.id===p.id);fs.writeFileSync(path.join(p.folder,'release'),'Explicit real-model checkpoint resumption.');await api('/api/orchestrator/resume',{projectId:p.id,megaTaskId:row.megaTaskId,checkpointId:row.checkpoint.id,confirmChanges:true});const done=await wait(p.id);assert.equal(done.row.status,'complete');record('real-restart-resume',{projectId:p.id,model:model.cli,status:done.row.status});
}else if(stage==='shutdown'){
 const snap=await api('/api/orchestrator?readOnly=1');assert.ok(snap.projects.every(p=>p.dispatch.every(d=>!d.alive)),'Stop owned workers before shutdown');await api('/api/app/quit',{});record('real-app-quit',{status:'PASS'});
}else if(stage==='snapshot'){const s=await api('/api/orchestrator?readOnly=1');record('snapshot',{projects:s.projects.map(p=>({id:p.id,status:p.status,next:p.next,parts:p.dispatch.map(d=>({modelId:d.modelId,pid:d.pid,alive:d.alive,diagnostic:d.diagnostic?.code}))}))});
}else throw Error('Unknown stage');
})().catch(error=>{record('harness-error',{stage,message:error.message});process.exitCode=1;});
