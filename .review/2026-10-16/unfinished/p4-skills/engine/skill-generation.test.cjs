'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSkillGeneration,safeText}=require('./skill-generation.cjs');const {createSkillCatalog}=require('./skill-catalog.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pw-skill-generation-'));
test('draft evidence rejects JSON-quoted credentials and multiline private key material',()=>{
 assert.throws(()=>safeText('{"api_key":"synthetic-fixture-value"}'),/Potential credentials/);
 assert.throws(()=>safeText('Project text\n-----BEGIN PRIVATE KEY-----\nsynthetic fixture only\n-----END PRIVATE KEY-----'),/Potential credentials/);
 assert.throws(()=>safeText('{"access_token": "synthetic-fixture-value"}'),/Potential credentials/);
 assert.equal(safeText('Use existing provider credentials without copying their contents.'),'Use existing provider credentials without copying their contents.');
});
test('project drafts are inspectable/editable, exact-revision approved, idempotent and never auto-active',()=>{
 const dir=temp();try{
 const folder=path.join(dir,'project');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'README.md'),'Run the approved validation fixtures.');const g=createSkillGeneration({dir:path.join(dir,'store')});
 const input={projectId:'a',folder,name:'validate-package',description:'Validate project package behavior',procedure:'Read authorized project requirements and run only approved fixture validation.',references:['README.md'],requested:true};
 const draft=g.create(input);assert.equal(draft.status,'draft');assert.equal(fs.existsSync(path.join(folder,'.planwharf')),false);assert.equal(g.create(input).id,draft.id);
 assert.throws(()=>g.approve({projectId:'b',folder,id:draft.id,revision:draft.revision,approved:true}),/selected project/);
 const edited=g.edit('a',draft.id,draft.revision,draft.content+'\nReport the exact observed outcome.\n');assert.throws(()=>g.approve({projectId:'a',folder,id:draft.id,revision:draft.revision,approved:true}),/revision changed/);
 assert.throws(()=>g.approve({projectId:'a',folder,id:draft.id,revision:edited.revision,approved:false}),/Explicit approval/);
 const approved=g.approve({projectId:'a',folder,id:draft.id,revision:edited.revision,approved:true});assert.equal(approved.activated,false);g.approve({projectId:'a',folder,id:draft.id,revision:edited.revision,approved:true});
 const c=createSkillCatalog({dir:path.join(dir,'catalog')});c.discoverLocal('a',folder);const local=c.snapshot('a').catalog.find(row=>row.source==='project-local');assert.equal(local.enabled,false);c.approve('a',local.id,true);assert.equal(c.select({projectId:'a',role:'worker',adapter:'codex',task:'Validate project package behavior'}).selected.length,1);assert.equal(c.snapshot('b').catalog.some(row=>row.id===local.id),false);
 assert.throws(()=>g.create({...input,name:'../../escape'}),/safe Skill name/);assert.throws(()=>g.create({...input,name:'escape',references:['../outside.md']}),/Invalid project-local path|not Skill evidence/);
 const fresh=g.create({...input,name:'changed-evidence'});fs.writeFileSync(path.join(folder,'README.md'),'Changed reference');assert.throws(()=>g.approve({projectId:'a',folder,id:fresh.id,revision:fresh.revision,approved:true}),/evidence changed/);
 const existing=path.join(folder,'.planwharf','skills','existing');fs.mkdirSync(existing);fs.writeFileSync(path.join(existing,'SKILL.md'),'User-authored existing source');const conflict=g.create({...input,name:'existing'});assert.throws(()=>g.approve({projectId:'a',folder,id:conflict.id,revision:conflict.revision,approved:true}),/no overwrite/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('assisted proposals need three distinct validated same-project outcomes, stay quiet and require approval',()=>{
 const dir=temp();try{const g=createSkillGeneration({dir});const row={projectId:'a',validated:true,procedureKey:'validate-packages',procedure:'Use authorized package validation fixtures.'};const list=[1,2,3].map(n=>({...row,resultId:'result-'+n}));
 assert.deepEqual(g.suggest({projectId:'a',folder:dir,procedures:list.slice(0,2)}),[]);assert.deepEqual(g.suggest({projectId:'b',folder:dir,procedures:list}),[]);assert.deepEqual(g.suggest({projectId:'a',folder:dir,procedures:list.map(r=>({...r,validated:false}))}),[]);
 const suggested=g.suggest({projectId:'a',folder:dir,procedures:list});assert.equal(suggested.length,1);assert.equal(suggested[0].status,'draft');assert.equal(fs.existsSync(path.join(dir,'.planwharf')),false);assert.deepEqual(g.suggest({projectId:'a',folder:dir,procedures:list}),[]);assert.equal(g.snapshot('a').fullAuto,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

