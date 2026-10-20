'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAskStream } = require('./runner.cjs');
const { diagnoseProvider } = require('./provider-diagnostics.cjs');
const { createProviderModels } = require('./provider-models.cjs');

test('captured Codex fatal error outranks incidental quota text', () => {
  for (const cli of ['gpt-6-luna', 'gpt-6.1-sol']) {
    const stream = createAskStream();
    stream.push(JSON.stringify({type:'error', status:400, error:{type:'invalid_request_error', message:`The '${cli}' model is not supported when using Codex with a ChatGPT account.`}})+'\n');
    const result = stream.finish();
    assert.equal(result.failure, 'provider');
    assert.equal(diagnoseProvider({provider:'codex',cli}, {error:result.error, stderr:'Warning: quota telemetry request 429'}).code, 'PROVIDER_MODEL_UNAVAILABLE');
  }
  assert.equal(diagnoseProvider({provider:'codex'}, 'HTTP 429: rate limit exceeded').code, 'PROVIDER_USAGE_LIMIT');
});

test('catalog refresh cannot resurrect a rejected inference route', async () => {
  const models=[{id:'exact',providerId:'codex',cli:'gpt-exact',available:true}];
  const providers=[{id:'codex',adapter:'codex',account:{key:'isolated-account'}}];
  const catalog=createProviderModels(models,{providers,discover:async()=>({ok:true,ids:['gpt-exact']})});
  await catalog.refresh(true);
  assert.equal(models[0].inferenceStatus,'unverified');
  assert.match(models[0].availabilityWarning,/inference.*not.*verified/i);
  await catalog.recordInference('exact', {code:'PROVIDER_MODEL_UNAVAILABLE',message:'Exact route rejected'});
  await catalog.refresh(true);
  assert.equal(models[0].available,false);
  assert.equal(models[0].inferenceStatus,'rejected');
  assert.equal(models[0].unavailableReason,'Exact route rejected');
  providers[0].account.key='different-isolated-account';
  const oldScope=catalog.inferenceScope('exact');
  providers[0].account.key='third-isolated-account';
  await catalog.refresh(true);
  await catalog.recordInference('exact',null,oldScope);
  assert.equal(models[0].available,true);
  assert.equal(models[0].inferenceStatus,'unverified');
});

test('real CLI fatal stdout takes priority over incidental stderr', async t => {
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-fatal-stdout-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const fixture=path.join(dir,'cli.cjs');
  fs.writeFileSync(fixture,`process.stdin.resume();process.stdin.on('end',()=>{console.error('Telemetry quota request 429');console.log(JSON.stringify({type:'error',status:400,error:{type:'invalid_request_error',message:"The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account."}}));process.exitCode=1;});`);
  const result=await require('./runner.cjs').askOrchestrator({question:'Isolated diagnostic test.',folder:dir,model:{id:'fixture',provider:'isolated',adapter:'configured-cli',cli:'gpt-6-luna',providerConfig:{cliCommand:process.execPath,cliArgs:[fixture,'{model}'],yoloArgs:[],outputProtocol:'codex-jsonl'}}});
  assert.equal(result.failure,'provider');assert.equal(result.diagnostic.code,'PROVIDER_MODEL_UNAVAILABLE');
  assert.equal(result.processExit,1);
});

test('rejected inference survives restart and an explicit catalog refresh', async t => {
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-inference-cache-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const cacheFile=path.join(dir,'catalog.json'),providers=[{id:'fixture',adapter:'configured-cli',account:{key:'isolated'}}];
  const seed=()=>[{id:'exact',providerId:'fixture',cli:'exact',available:true}];
  const options={providers,cacheFile,discover:async()=>({ok:true,ids:['exact']})};
  const first=createProviderModels(seed(),options);await first.refresh(true);
  await first.recordInference('exact',{code:'PROVIDER_MODEL_UNAVAILABLE',message:'Exact route rejected'});
  const models=seed(),second=createProviderModels(models,options);await second.refresh(true);
  assert.equal(models[0].available,false);assert.equal(models[0].inferenceStatus,'rejected');
  assert.equal(models[0].unavailableReason,'Exact route rejected');
  assert.equal(await second.allowInferenceRetry('exact'),true);
  assert.equal(models[0].available,true);assert.equal(models[0].inferenceStatus,'unverified');
});

test('Codex discovery sends the installed executable version and fails closed when unknown', async t => {
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-catalog-version-'));
  const runtime=require('./provider-runtime.cjs'),originalVersion=runtime.cliVersion,originalFetch=global.fetch,originalHome=process.env.CODEX_HOME;
  t.after(()=>{runtime.cliVersion=originalVersion;global.fetch=originalFetch;if(originalHome===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=originalHome;fs.rmSync(dir,{recursive:true,force:true});});
  fs.writeFileSync(path.join(dir,'auth.json'),JSON.stringify({tokens:{access_token:'isolated-fixture-token',account_id:'isolated-fixture-account'}}));process.env.CODEX_HOME=dir;
  let requested;global.fetch=async url=>{requested=url;return {ok:true,json:async()=>({models:[{slug:'gpt-exact-fixture'}]})};};
  runtime.cliVersion=()=> '0.123.4';
  const adapter=require('./provider-adapters.cjs').adapterFor('codex');
  const catalog=await adapter.discover();assert.equal(catalog.ok,true);assert.equal(new URL(requested).searchParams.get('client_version'),'0.123.4');
  requested=null;runtime.cliVersion=()=>null;assert.equal((await adapter.discover()).ok,false);assert.equal(requested,null);
});
