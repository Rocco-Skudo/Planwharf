'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
if(!process.argv[2])throw Error('Usage: node scripts/audit/real-model-browser.cjs DISPOSABLE_DIRECTORY');
const out=path.resolve(process.argv[2]),{url}=JSON.parse(fs.readFileSync(path.join(out,'server.json'))),project=JSON.parse(fs.readFileSync(path.join(out,'calculator-project.json'))),model=JSON.parse(fs.readFileSync(path.join(out,'real-model.json'))),checks=[],errors=[],failedRequests=[];
let browser;const record=(name)=>{checks.push({name,status:'PASS'});console.log('PASS '+name);};
(async()=>{
 const app=await(await fetch(url+'/api/app')).json();assert.equal(path.resolve(app.planFile),path.join(out,'notebook.json'));assert.equal(path.resolve(project.folder),path.join(out,'Planwharf-Dummy-Calculator'));
 if(process.argv[3]==='--concurrency-only'){
  const projects=JSON.parse(fs.readFileSync(path.join(out,'concurrent-projects.json'))),snap=await(await fetch(url+'/api/orchestrator?readOnly=1')).json();
  for(const p of projects){const row=snap.projects.find(r=>r.id===p.id);assert.ok(row.dispatch.some(d=>d.alive&&d.cli===model.cli));assert.ok(fs.readFileSync(path.join(p.folder,'real-receipt.txt'),'utf8').includes(p.id));}record('Three real coding workers have distinct project receipts and live processes');
  browser=await chromium.launch({executablePath:process.env.PLANWHARF_TEST_BROWSER,headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.PlanwharfSoundtrackUI?.controller&&document.body.dataset.orchReady==='1');
  for(const p of projects){await page.locator('#project-select').selectOption(p.id);await page.waitForFunction(id=>{const e=document.querySelector('#harbor-background');return e.dataset.project===id&&e.dataset.state==='running';},p.id);record('Live running Ship state: '+p.id);}
  await page.locator('#ship-view-button').click();await page.screenshot({path:path.join(out,'real-three-workers-ship.png')});assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'real-concurrency-browser.json'),JSON.stringify({model:model.cli,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors:errors.length}));return;
 }
 const {calculate}=require(path.join(project.folder,'calculator.js'));
 const vectors=[['2+3',5],['9-4',5],['6*7',42],['8/2',4],['0.1+0.2',.3],['.5+1.25',1.75],['(2+3)*4',20],['-2*3',-6],['--4',4],['2*-(-3)',6],['10/4',2.5],['2+3*4',14]];
 for(const [expression,expected] of vectors){assert.ok(Math.abs(calculate(expression)-expected)<1e-10,expression);record('Independent arithmetic: '+expression);}
 for(const expression of ['1/0','10/(3-3)','2+','bad','2(3)','(2+3','1..2','']){assert.throws(()=>calculate(expression),undefined,expression);record('Independent invalid input: '+JSON.stringify(expression));}
 assert.equal(fs.readFileSync(path.join(project.folder,'skill-receipt.txt'),'utf8').trim(),'REAL-MODEL-SKILL-20261020');record('Actual real-worker Skill marker receipt');
 browser=await chromium.launch({executablePath:process.env.PLANWHARF_TEST_BROWSER,headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failedRequests.push({status:r.status(),path:new URL(r.url()).pathname});});
 await page.goto(url);await page.waitForFunction(()=>document.body.dataset.orchReady==='1');await page.locator('#project-select').selectOption(project.id);await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.locator('#dashboard-orch-project').selectOption(project.id);await page.waitForFunction(id=>document.querySelector('#dashboard-orch-project').value===id,project.id);
 const s=await(await page.request.get(url+'/api/orchestrator?readOnly=1')).json();assert.equal(s.models.find(m=>m.id===model.id).cli,model.cli);assert.equal(s.models.find(m=>m.id===model.id).inferenceStatus,'verified');record('Production UI snapshot retains verified exact real model');
 if(process.argv[3]!=='--calculator-only'){
 await page.locator('#dashboard-orch-ask-input').fill('Reply with exactly REAL_BROWSER_SEND_OK. Do not use tools, change files, start work or delegate.');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/orchestrator/ask')&&r.request().method()==='POST',{timeout:200000});await page.locator('#dashboard-orch-ask-submit').click({timeout:3000});const answer=await(await response).json();assert.match(answer.answer,/REAL_BROWSER_SEND_OK/);assert.equal(answer.diagnostic?.code,undefined);record('Ordinary Send click reaches actual coding-model inference');
 }
 const calc=await context.newPage();calc.on('pageerror',e=>errors.push(e.message));await calc.goto(pathToFileURL(path.join(project.folder,'index.html')).href);
 for(const [expression,expected]of vectors.slice(0,8)){await calc.locator('#expression').fill(expression);await calc.locator('#expression').press('Enter');const values=[await calc.locator('#expression').inputValue(),await calc.locator('#status').innerText()];assert.ok(values.some(value=>value.trim()!==''&&Math.abs(Number(value)-expected)<1e-10),JSON.stringify({expression,values}));record('Actual calculator keyboard: '+expression);}
 await calc.locator('#expression').fill('1/0');await calc.locator('#expression').press('Enter');assert.match(await calc.locator('#status').innerText(),/divi.*zero/i);record('Actual calculator shows division-by-zero error');await calc.locator('#expression').press('Escape');assert.equal(await calc.locator('#expression').inputValue(),'');assert.equal(await calc.locator('#status').innerText(),'');record('Actual calculator Escape clears input and status');
 await calc.setViewportSize({width:390,height:844});assert.ok(await calc.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2);await calc.screenshot({path:path.join(out,'real-calculator-mobile.png')});record('Real calculator mobile reflow');
 assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);const files={};for(const name of ['calculator.js','calculator.test.cjs','index.html','README.md','skill-receipt.txt'])files[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(project.folder,name))).digest('hex');
 fs.writeFileSync(path.join(out,'real-browser-results.json'),JSON.stringify({model:model.cli,provider:model.provider,browser:browser.version(),checks,errors,failedRequests,files},null,2));
 console.log(JSON.stringify({passed:checks.length,errors:errors.length,failedRequests:failedRequests.length}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
