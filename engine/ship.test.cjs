'use strict';
const assert = require('node:assert/strict');
const H = require('../harbor-ui.js');
assert.equal(Object.keys(H.FLAGS).length, 5);
assert.equal(H.SETTINGS_KEY, 'planwharf_harbor_v2');
assert.equal(H.shipSettingsFrom({flag:'pirate',animations:'off'}).flag,'pirate');
assert.equal(H.shipSettingsFrom({weatherMode:'untrusted',seaCondition:'<script>',notificationDensity:'quiet'}).weatherMode,'adaptive');
assert.equal(H.shipSettingsFrom().notificationDensity,'important');
assert.ok(H.WEATHER_INTERVAL >= 60000);
for(const condition of H.CONDITIONS) assert.equal(H.weatherCondition(H.shipSettingsFrom({weatherMode:'manual',seaCondition:condition}),{status:'failed'}),condition);
const complex={subTasks:Array.from({length:12},(_,i)=>({dependencies:i?['previous']:[]}))};
for(const mode of ['adaptive','random']) {
  const settings=H.shipSettingsFrom({weatherMode:mode});
  for(const status of ['idle','watching','failed','complete']) assert.equal(H.weatherCondition(settings,{...complex,status},()=>.7),H.weatherCondition(settings,complex,()=>.7),'Weather must not consume task health');
  assert.ok(H.CONDITIONS.includes(H.weatherCondition(settings,complex,()=>.999)));
  assert.equal(H.weatherCondition(settings,complex,()=>0),'calm','Complexity never requires permanent storms');
}
assert.equal(H.weatherCondition(H.shipSettingsFrom(),{},()=>.999),'light','Unknown complexity remains bounded');
const snapshot={projects:[
 {id:'a',megaTaskId:'m',status:'complete',subTasks:[{id:'review',megaTaskId:'m',type:'AUDIT'}]},
 {id:'b',megaTaskId:'n',status:'failed',attemptId:'b1'},
 {id:'c',status:'blocked_no_worker'}, {id:'d',status:'checkpointed',checkpointId:'cp'}, {id:'e',status:'needs_approval'}
],execution:{results:[{resultId:'R-r',megaTaskId:'m',subTaskId:'review',status:'COMPLETE'},{resultId:'foreign',megaTaskId:'foreign',subTaskId:'review',status:'FAILED'}]},supervisor:{projects:[{projectId:'a',alerts:[{id:'alert',active:true},{id:'ignored',ignored:true}]}]}};
const notices=H.snapshotNotices(snapshot), kinds=new Set(notices.map(n=>n.kind));
assert.deepEqual([...kinds].sort(),['completed','worker-failed','blocked','checkpoint','approval','review-result','anomaly'].sort());
assert.ok(!notices.some(n=>n.key.includes('foreign')||n.key.includes('ignored')));
assert.ok(notices.filter(n=>n.critical).every(n=>H.visibleNotice(n,'action')),'Critical notices never suppressed');
assert.equal(H.visibleNotice({kind:'completed'},'action'),false);
assert.equal(H.visibleNotice({kind:'checkpoint'},'important'),false);
assert.equal(H.visibleNotice({kind:'checkpoint'},'all'),true);
assert.ok(!H.snapshotNotices({projects:[{id:'active',status:'complete',workerAlive:true}]}).some(n=>n.kind==='completed'));
assert.ok(!H.snapshotNotices({projects:[{id:'ambiguous',status:'complete',dispatch:[{observedAlive:true}]}]}).some(n=>n.kind==='completed'));
assert.equal(H.resolveState({status:'watching',workerAlive:true,megaTask:{pauseRequested:true}}),'pausing');
assert.equal(H.resolveState({status:'resuming',workerAlive:false}),'preparing');
const savedGlobals={window:global.window,document:global.document,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
try {
  global.window={matchMedia:()=>({matches:false})};global.document={hidden:false};let scheduled=0,cleared=0;
  global.setTimeout=(callback,delay)=>{assert.equal(delay,H.WEATHER_INTERVAL);scheduled++;return 42;};global.clearTimeout=()=>{cleared++;};
  const ui=new H.HarborUI();ui.root={dataset:{state:'running'},querySelector:()=>null};ui.settings=H.shipSettingsFrom({weatherMode:'random'});
  ui.applyWeather();assert.equal(scheduled,1);assert.equal(ui.root.dataset.state,'running','Weather never changes execution state');
  global.document.hidden=true;ui.scheduleWeather();assert.equal(ui.weatherTimer,null);assert.equal(scheduled,1);
  global.document.hidden=false;ui.settings.animations='off';ui.scheduleWeather();assert.equal(scheduled,1);
  ui.settings.animations='full';ui.settings.weatherMode='manual';ui.scheduleWeather();assert.equal(scheduled,1);assert.ok(cleared>=4);
} finally { for(const [key,value]of Object.entries(savedGlobals)) if(value===undefined)delete global[key];else global[key]=value; }
console.log('PASS: five flags/storage compatibility, weather/health separation and bounded selection, seven fact-based notification classes, density/critical gates and live-worker completion guard. Fixtures only.');
