'use strict';
// Actual Chromium browser + isolated HTTP backend. Worker transport/liveness are fixtures;
// no live provider, installed CLI, personal notebook or personal profile is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createServer} = require('./server.cjs');
const executable=process.env.PLANWHARF_TEST_BROWSER;
assert.ok(executable && path.isAbsolute(executable) && !/[\x00-\x1f]/.test(executable) && fs.statSync(executable).isFile(),'Explicit existing Chrome or Edge executable required');
assert.match(path.basename(executable),/^(?:chrome|msedge)(?:\.exe)?$/i,'Explicit installed Chromium browser required');
const out=path.resolve(process.env.PLANWHARF_VALIDATION_DIR || path.join(__dirname,'validation','ship-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
assert.notEqual(process.env.PLANWHARF_TEST_NO_SANDBOX, '1', 'Browser sandbox must stay enabled');
const browserStderr=fs.openSync(path.join(out,'browser-stderr.log'),'a'),browserDiagnostics=[];let browserStage='not-started';
const fixture=fs.mkdtempSync(path.join(out,'fixture-'));
const seed=require('./fixtures/starter-notebook.json').projects[0];
const plan={schema:2,projects:['ship-alpha','ship-beta'].map(id=>({...structuredClone(seed),project:{id,name:id,folder:path.join(fixture,id)},tasks:[]}))};
for(const item of plan.projects)fs.mkdirSync(item.project.folder);
const planFile=path.join(fixture,'notebook.json');fs.writeFileSync(planFile,JSON.stringify(plan));
let aiCalls=0,pid=98000;const live=new Set(),launches=[],errors=[],httpErrors=[],evidence=[];
const server=createServer({planFile,attemptsDir:path.join(fixture,'attempts'),models:[{id:'ship-fixture',label:'Ship transport fixture',provider:'codex',cli:'gpt-6-luna',kind:'default',enabled:true,available:true}],fetchPlans:null,skillsEnabled:false,refreshModels:false,monitorIntervalMs:1000,
 inspectFolder:folder=>({folder,git:false,names:[],fileCount:0,dirty:[]}),
 spawnWorker:info=>{const id=++pid;launches.push({...info,pid:id});live.add(id);return {pid:id};},isProcessAlive:id=>live.has(id),killWorker:id=>live.delete(id),askModel:()=>{aiCalls++;throw Error('No AI calls authorized by ship test');}});
let browser,ws,cdp,evaluate,base;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=18000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await pause(100);}throw Error('Timeout: '+label);}
async function request(route,data,status=200){const response=await fetch(base+route,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
async function shot(name){const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));}
async function settings(values){await click('#harbor-settings-button');await evaluate(`(()=>{const f=document.getElementById('harbor-settings-form');for(const [k,v]of Object.entries(${JSON.stringify(values)})){if(typeof v==='boolean')f.elements[k].checked=v;else f.elements[k].value=v;}f.requestSubmit();})()`);assert.equal(await evaluate("document.getElementById('harbor-dialog').open"),false);}
async function state(value){await until(()=>evaluate(`document.getElementById('harbor-background')?.dataset.state===${JSON.stringify(value)}`),'state '+value);const snapshot=await request('/api/orchestrator?readOnly=1');evidence.push({expected:value,projects:snapshot.projects.map(row=>({id:row.id,status:row.status,workerAlive:row.workerAlive}))});}
async function notice(kind){await until(()=>evaluate(`!!document.querySelector('#ship-notifications [data-kind=${JSON.stringify(kind)}]')`),'notice '+kind);}
async function propose(count=2){const result=await request('/api/orchestrator/propose',{projectId:'ship-alpha',title:'Ship fixture lifecycle',goal:'Isolated browser verification',subTasks:Array.from({length:count},(_,i)=>({title:'Fixture slice '+i,detail:'No provider',assignedModelId:'ship-fixture',type:i?'AUDIT':'IMPLEMENTATION',dependsOn:i?[i-1]:[]}))},201);return result.snapshot.projects.find(row=>row.id==='ship-alpha').megaTaskId;}
function finish(info,status='COMPLETE',keepAlive=false){fs.writeFileSync(info.structuredResultPath,JSON.stringify({resultId:info.resultId,attemptId:info.attemptId,subTaskId:info.subTaskId,megaTaskId:info.megaTaskId,status,summary:'Explicit local transport fixture result',filesChanged:[],tests:[],blockers:status==='COMPLETE'?[]:['Fixture blocker'],nextAction:'Review fixture',createdAt:new Date().toISOString()}));fs.writeFileSync(info.exitPath,JSON.stringify({attemptId:info.attemptId,exitCode:status==='FAILED'?1:0,provider:info.worker.provider,model:info.worker.cli}));fs.writeFileSync(info.resultPath,'STATUS: '+status+'\n');if(!keepAlive)live.delete(info.pid);}
async function launchBrowser(){browserStage='launch';const profile=path.join(fixture,'chrome-profile');browser=spawn(executable,['--headless=new','--disable-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore',browserStderr]});browser.on('error',error=>errors.push(error.message));let port;await until(()=>{try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);return port;}catch{return false;}},'Chrome DevTools');const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});let sequence=0;const waiting=new Map();ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method==='Inspector.targetCrashed')browserDiagnostics.push({stage:browserStage,event:msg.method});if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push(msg.params.args);if(msg.method==='Network.responseReceived'&&msg.params.response.status>=400&&!msg.params.response.url.endsWith('/favicon.ico'))httpErrors.push(msg.params.response);if(msg.method==='Network.loadingFailed'&&!msg.params.canceled)httpErrors.push(msg.params);const pending=waiting.get(msg.id);if(pending){clearTimeout(pending.timer);waiting.delete(msg.id);msg.error?pending.reject(Error(JSON.stringify(msg.error))):pending.resolve(msg.result);}});cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},15000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};browserStage='blank-page-smoke';await cdp('Inspector.enable');assert.equal(await evaluate('1 + 1'),2,'Blank page renderer must respond before application navigation');await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 await launchBrowser();await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});browserStage='application-navigation';await cdp('Page.navigate',{url:base+'/#orchestrator'});
 await until(()=>evaluate("document.getElementById('project-select')?.options.length===2 && !!document.getElementById('ship-view-button')"),'actual app ready');
 await evaluate("(()=>{const select=document.getElementById('project-select');select.value='ship-alpha';select.dispatchEvent(new Event('change',{bubbles:true}));})()");await state('idle');
 await settings({weatherMode:'manual',seaCondition:'storm',notificationDensity:'all'});
 assert.equal(await evaluate("document.getElementById('harbor-background').dataset.weather"),'storm');
 assert.equal((await request('/api/orchestrator?readOnly=1')).projects.find(row=>row.id==='ship-alpha').status,'idle','Manual weather cannot launch execution');
 for(const flag of ['classic','tech','exploration','merchant','pirate']){await settings({flag});assert.equal(await evaluate("document.getElementById('harbor-background').dataset.flag"),flag);}
 const mega=await propose();await state('preparing');await notice('approval');
 await request('/api/orchestrator/approve',{projectId:'ship-alpha',megaTaskId:mega});await state('running');assert.equal(launches.length,1);
 await evaluate("(()=>{const input=document.querySelector('#dashboard-orch-ask-form textarea')||document.getElementById('dashboard-orch-ask');input.value='Unsent ship fixture draft';input.dataset.shipDraft='yes';input.focus();})()");
 const draftSelector='[data-ship-draft=yes]';const saved=await evaluate("({selected:document.getElementById('project-select').value,layout:localStorage.getItem('planwharf_layout_v1'),scroll:scrollY})");
 await click('#ship-view-button');assert.equal(await evaluate("document.body.classList.contains('ship-view') && document.querySelector('.app').inert"),true);
 assert.equal(await evaluate("document.activeElement.id"),'ship-view-exit');assert.equal(await evaluate("getComputedStyle(document.querySelector('.app')).visibility"),'hidden');
 assert.equal(await evaluate("getComputedStyle(document.getElementById('harbor-background')).pointerEvents"),'none');
 assert.equal(await evaluate("document.querySelector('[data-ship-draft=yes]').value"),'Unsent ship fixture draft');
 assert.equal((await request('/api/orchestrator?readOnly=1')).projects.find(row=>row.id==='ship-alpha').workerAlive,true,'Execution remains active in Ship View');
 await shot('ship-dark-running-storm');
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 assert.equal(await evaluate("document.body.classList.contains('ship-view')"),false);
 assert.equal(await evaluate("document.querySelector('[data-ship-draft=yes]').value"),'Unsent ship fixture draft');
 assert.deepEqual(await evaluate("({selected:document.getElementById('project-select').value,layout:localStorage.getItem('planwharf_layout_v1'),scroll:scrollY})"),saved);
 await settings({weatherMode:'adaptive',animations:'reduced'});assert.equal(await evaluate("document.getElementById('harbor-background').dataset.weatherMode"),'adaptive');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.harbor-ship')).animationName"),'none');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.harbor-water path')).transitionDuration"),'0s','Reduced disables wave geometry transitions');
 await settings({weatherMode:'random',animations:'full'});assert.equal(await evaluate("document.getElementById('harbor-background').dataset.weatherMode"),'random');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.harbor-water path')).transitionDuration"),'12s','Full motion enables gradual wave transitions');
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate("getComputedStyle(document.querySelector('.harbor-ship')).animationName"),'none');assert.equal(await evaluate("getComputedStyle(document.querySelector('.harbor-water path')).transitionDuration"),'0s','OS reduced motion disables wave geometry transitions');await cdp('Emulation.setEmulatedMedia',{features:[]});
 const otherTab=await cdp('Target.createTarget',{url:'about:blank',background:false});await until(()=>evaluate("document.hidden && document.getElementById('harbor-background').dataset.suspended==='true'"),'background tab suspension');await cdp('Page.bringToFront');await until(()=>evaluate("!document.hidden && document.getElementById('harbor-background').dataset.suspended==='false'"),'visible tab resume');await cdp('Target.closeTarget',{targetId:otherTab.targetId});
 await settings({animations:'off',weatherMode:'manual',seaCondition:'calm'});assert.equal(await evaluate("getComputedStyle(document.querySelector('.harbor-water')).animationName"),'none');assert.equal(await evaluate("getComputedStyle(document.querySelector('.harbor-water path')).transitionDuration"),'0s','Off disables manual wave transitions');
 await click('#ship-view-button');await request('/api/orchestrator/pause',{projectId:'ship-alpha',megaTaskId:mega});await state('pausing');finish(launches[0]);await state('checkpoint');await notice('checkpoint');
 let cp=(await request('/api/execution?projectId=ship-alpha')).checkpoints.at(-1);await request('/api/orchestrator/resume',{projectId:'ship-alpha',megaTaskId:mega,checkpointId:cp.id});await state('running');
 finish(launches.at(-1),'COMPLETE',true);await pause(4500);assert.equal(await evaluate("document.getElementById('harbor-background').dataset.state"),'running','Result file is not completion while worker active');live.delete(launches.at(-1).pid);await state('completed');await notice('review-result');await notice('completed');
 assert.equal(await evaluate("document.body.classList.contains('ship-view')"),true,'Completion does not exit Ship View');
 await click('#ship-notifications [data-kind=completed] button');assert.equal(await evaluate("document.body.classList.contains('ship-view')"),false,'Notice returns to relevant project');
 assert.equal(await evaluate("document.getElementById('project-select').value"),'ship-alpha');
 const failure=await propose(1);await request('/api/orchestrator/approve',{projectId:'ship-alpha',megaTaskId:failure});await state('running');await settings({notificationDensity:'action'});await click('#ship-view-button');finish(launches.at(-1),'FAILED');await state('failed');await notice('worker-failed');await notice('anomaly');
 cp=(await request('/api/execution?projectId=ship-alpha')).checkpoints.at(-1);await request('/api/orchestrator/resume',{projectId:'ship-alpha',megaTaskId:failure,checkpointId:cp.id});await state('running');finish(launches.at(-1),'BLOCKED');await state('checkpoint');await notice('blocked');
 await click('#ship-view-exit');await click('#theme-toggle');assert.equal(await evaluate("document.documentElement.dataset.theme"),'light');await settings({weatherMode:'manual',seaCondition:'moderate'});assert.match(await evaluate("document.getElementById('ship-scene-label').textContent"),/moderate/);await click('#ship-view-button');await shot('ship-light-moderate');
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await shot('ship-mobile-light');
 assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);assert.equal(await evaluate("(()=>{const r=document.getElementById('ship-view-exit').getBoundingClientRect();return r.width>0&&r.right<=innerWidth;})()"),true);
 await click('#ship-view-exit');assert.equal(await evaluate("document.querySelector('[data-ship-draft=yes]').value"),'Unsent ship fixture draft');
 await cdp('Page.reload');await until(()=>evaluate("document.getElementById('harbor-background')?.dataset.weather==='moderate'"),'persisted weather after reload');
 assert.equal(await evaluate("document.getElementById('harbor-background').dataset.flag"),'pirate');assert.equal(await evaluate("document.body.classList.contains('ship-view')"),false);
 assert.equal(aiCalls,0);assert.deepEqual(errors,[],'No JS exceptions/console errors');assert.deepEqual(httpErrors,[],'No failed HTTP/network requests');
 for(const item of plan.projects)assert.deepEqual(fs.readdirSync(item.project.folder),[],'Project fixture folders untouched');
 const after=JSON.parse(fs.readFileSync(planFile,'utf8'));for(const item of after.projects)assert.deepEqual(item.home?.notes||[],[],'Notes untouched');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({result:'PASS',browser:executable,sandboxEnabled:true,browserDiagnostics,scope:'Actual browser and HTTP backend; worker transport/liveness fixtures only, no providers',launchCount:launches.length,aiCalls,errors,httpErrors,evidence},null,2));
 console.log('PASS Ship actual '+path.basename(executable)+' interactions, real backend fixture lifecycle and seven notification classes, draft preservation, weather/motion/flags/themes/mobile/reload. No live provider. Evidence: '+out);
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,browser:executable,stage:browserStage,browserDiagnostics,errors,httpErrors,evidence},null,2));process.exitCode=1;}).finally(async()=>{if(cdp)try{await cdp('Browser.close');}catch{}if(ws)ws.close();if(browser)browser.kill();if(server.listening)await new Promise(resolve=>server.close(resolve));fs.closeSync(browserStderr);});
