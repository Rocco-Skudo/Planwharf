'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSkillsCache,REF}=require('./skills.js');
const {REVIEWED_SKILLS}=require('./skill-catalog.cjs');
const license='MIT License\nPermission is hereby granted, free of charge, to any person obtaining a copy.';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pw-selective-skills-'));
test('legacy facade does not download on startup; approved refresh is selective, atomic and preserves project choices',async()=>{
 const dir=temp();let calls=[],broken=false;
 try{
 const candidate=REVIEWED_SKILLS.find(s=>s.id==='matt/tdd');
 const fetchImpl=async url=>{calls.push(url);if(broken&&url.endsWith('mocking.md'))throw Error('Fixture offline');return {ok:true,text:async()=>url.endsWith('LICENSE')?license:url.endsWith('SKILL.md')?'---\nname: tdd\ndescription: Test-first fixtures\n---\nFixture TDD marker':'# Fixture supporting reference'};};
 const cache=createSkillsCache({dir,fetchImpl});await cache.ensure();await cache.sync();assert.equal(calls.length,0);assert.equal(cache.snapshot().automaticDownloads,false);assert.equal(cache.prompt('worker','test'), '');
 await assert.rejects(()=>cache.registry.install('a','matt/tdd',false),/approval/);assert.equal(calls.length,0);
 await cache.registry.install('a','matt/tdd',true);assert.equal(calls.length,candidate.files.length);assert.ok(calls.every(url=>url.includes(REF)));assert.ok(calls.every(url=>url.endsWith('.md')||url.endsWith('LICENSE')));
 cache.registry.configure('a',{mode:'manual',selected:['matt/tdd'],testingSeamsApproved:true});assert.match(cache.prompt('worker','test',{projectId:'a',adapter:'codex',provider:'codex',model:'gpt-fixture'}),/Fixture TDD marker/);assert.equal(cache.prompt('worker','test',{projectId:'b',adapter:'codex'}),'');
 const before=cache.registry.snapshot('a');broken=true;await assert.rejects(()=>cache.registry.install('a','matt/tdd',true),/offline/);assert.deepEqual(cache.registry.snapshot('a').catalog,before.catalog);
 const restarted=createSkillsCache({dir,fetchImpl});assert.equal(restarted.snapshot('a').preferences.mode,'manual');assert.equal(restarted.snapshot('a').catalog.find(s=>s.id==='matt/tdd').enabled,true);assert.equal(restarted.read('../outside','a'),'');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
