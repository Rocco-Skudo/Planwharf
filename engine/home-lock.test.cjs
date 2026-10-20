'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { atomicReplace } = require('./atomic-replace.cjs');

test('atomic replacement retries only bounded Windows sharing failures', async () => {
  let attempts=0; const delays=[];
  await atomicReplace('new','old',{platform:'win32',delay:async ms=>delays.push(ms),rename:async()=>{if(++attempts<3)throw Object.assign(Error('locked'),{code:'EPERM'});}});
  assert.equal(attempts,3);assert.deepEqual(delays,[20,40]);
  attempts=0;
  await assert.rejects(atomicReplace('new','old',{platform:'win32',delay:async()=>{},rename:async()=>{attempts++;throw Object.assign(Error('locked'),{code:'EBUSY'});}}),/locked/);
  assert.equal(attempts,6);
  attempts=0;
  await assert.rejects(atomicReplace('new','old',{platform:'win32',rename:async()=>{attempts++;throw Object.assign(Error('missing'),{code:'ENOENT'});}}),/missing/);
  assert.equal(attempts,1);
});

test('Home visit survives a real brief Windows read lock without losing concurrent notes', {skip:process.platform!=='win32'}, async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-home-lock-'));
  const plan=require('../plan.js').example();plan.project.id='lock-fixture';plan.project.folder=dir;plan.tasks=[];
  const file=path.join(dir,'notebook.json');fs.writeFileSync(file,JSON.stringify(plan));
  const server=require('../server.cjs').createServer({planFile:file,attemptsDir:path.join(dir,'attempts'),models:[],monitorIntervalMs:100000});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
  const url='http://127.0.0.1:'+server.address().port;
  async function lock(milliseconds) {
    const locker=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',`$h=[IO.File]::Open($env:PLANWHARF_LOCK_FILE,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{[Console]::WriteLine('LOCKED');Start-Sleep -Milliseconds ${milliseconds}}finally{$h.Dispose()}`],{env:{...process.env,PLANWHARF_LOCK_FILE:file},windowsHide:true});
    t.after(()=>{if(locker.exitCode===null)locker.kill();});
    await new Promise((resolve,reject)=>{locker.stdout.on('data',s=>{if(String(s).includes('LOCKED'))resolve();});locker.on('error',reject);locker.on('exit',code=>{if(code)reject(Error('Lock fixture failed: '+code));});});
    return locker;
  }
  await lock(250);
  const post=(route,input)=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  const [home,note]=await Promise.all([post('/api/project-home',{projectId:plan.project.id,visit:true}),post('/api/notes',{projectId:plan.project.id,action:'add',text:'Preserve this concurrent note.'})]);
  assert.equal(home.status,200,await home.text());assert.equal(note.status,200,await note.text());
  const saved=JSON.parse(fs.readFileSync(file));assert.ok(saved.home.lastVisit.viewedAt);assert.equal(saved.home.notes[0].text,'Preserve this concurrent note.');
  assert.ok(require('../plan.js').validate(saved));assert.deepEqual(fs.readdirSync(dir).filter(x=>x.endsWith('.tmp')),[]);
  const before=fs.readFileSync(file),persistent=await lock(1200);
  const blocked=await post('/api/project-home',{projectId:plan.project.id,visit:true});
  assert.equal(blocked.status,503);assert.match((await blocked.json()).error,/locked or not writable/);
  assert.deepEqual(fs.readFileSync(file),before,'A failed save must leave the old notebook intact');
  if(persistent.exitCode===null)await new Promise(resolve=>persistent.once('exit',resolve));
  assert.deepEqual(fs.readdirSync(dir).filter(x=>x.endsWith('.tmp')),[]);
});
