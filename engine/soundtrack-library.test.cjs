'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeManifest, createLibrary } = require('../soundtrack-library.js');
test('bundled library permits fixed local audio filenames and rejects traversal or remote URLs', () => {
  const manifest = { tracks: [{ id:'calm', title:'Calm', file:'calm.wav', mime:'audio/wav' }, ...['../secret.wav','https://evil.test/a.wav','%2e%2e.wav','a/b.wav','file:///a.wav'].map((file,i)=>({id:'bad'+i,file}))] };
  assert.deepEqual(normalizeManifest(manifest).tracks.map(t=>t.id), ['calm']);
  assert.equal(normalizeManifest(manifest).tracks[0].url, '/assets/soundtrack/calm.wav');
});
test('selected personal audio stays local, unsupported formats fail clearly and object URLs revoke', async () => {
  const revoked = [], library = createLibrary({ audio:{canPlayType:mime=>mime==='audio/wav'?'probably':''}, urls:{createObjectURL:()=> 'blob:owned', revokeObjectURL:url=>revoked.push(url)}, id:()=> 'local-one', store:{all:async()=>[],put:async()=>{},remove:async()=>{}} });
  await library.ready;
  await assert.rejects(library.add({name:'private.mp3',size:10,type:'audio/mpeg'},false), /not supported/);
  const track = await library.add({name:'<img onerror=alert(1)>.wav',size:10,type:'audio/wav'},false);
  assert.equal(track.title,'<img onerror=alert(1)>.wav');
  assert.equal(await library.resolve(track.id), 'blob:owned');
  await assert.rejects(library.resolve('file:///secret'), /Select/);
  await library.remove(track.id);
  assert.deepEqual(revoked,['blob:owned']);
});
test('only consented files persist and a browser copy survives original removal', async () => {
  const rows=[],urls={createObjectURL:blob=>'blob:'+blob.name,revokeObjectURL:()=>{}}, audio={canPlayType:()=> 'probably'};
  const store={all:async()=>rows.slice(),put:async row=>rows.push(row),remove:async id=>{rows.splice(rows.findIndex(row=>row.id===id),1);}};
  let count=0;
  const library=createLibrary({audio,urls,store,id:()=> 'local-'+(++count)});
  const temporary=await library.add({name:'temporary.wav',type:'audio/wav',size:10},false);
  const kept=await library.add({name:'kept.wav',type:'audio/wav',size:10},true);
  assert.equal(rows.length,1);
  const restarted=createLibrary({audio,urls,store});await restarted.ready;
  assert.equal(await restarted.resolve(kept.id),'blob:kept.wav');
  await assert.rejects(restarted.resolve(temporary.id),/select.*again/i);
  assert.equal(restarted.list()[0].remembered,true);
});
test('storage quota failures do not imply a file was persisted',async()=>{
  const library=createLibrary({audio:{canPlayType:()=> 'probably'},urls:{},id:()=> 'local-quota',store:{all:async()=>[],put:async()=>{throw Error('Browser storage full');},remove:async()=>{}}});
  await assert.rejects(library.add({name:'a.wav',size:10},true),/storage full/);
  assert.deepEqual(library.list(),[]);
});
test('untrusted manifest metadata is plain bounded text and does not become a media URL',async()=>{
  const manifest=normalizeManifest({tracks:[{id:'safe',title:'<script>alert(1)</script>',creator:'X\u0000Y',file:'safe.wav',url:'https://evil.test'}]});
  assert.equal(manifest.tracks[0].creator,'XY');
  assert.equal(manifest.tracks[0].url,'/assets/soundtrack/safe.wav');
  assert.equal(manifest.tracks[0].title,'<script>alert(1)</script>');
});
test('stored records cannot borrow bundled track identities',async()=>{
 const library=createLibrary({audio:{canPlayType:()=> 'probably'},urls:{createObjectURL:()=>{throw Error('untrusted');}},manifest:{tracks:[{id:'calm',file:'calm.wav'}]},store:{all:async()=>[{id:'calm',title:'spoofed',extension:'wav',blob:{name:'evil'}}]}});
 await library.ready;assert.deepEqual(library.list().map(t=>t.id),['calm']);assert.equal(await library.resolve('calm'),'/assets/soundtrack/calm.wav');
});
test('bundled audio is rejected clearly when the browser does not support its format', async () => {
  const library = createLibrary({
    audio: { canPlayType: () => '' },
    manifest: { tracks: [{ id: 'calm', title: 'Calm Seas', file: 'calm.mp3' }] },
    store: { all: async () => [] }
  });
  await library.ready;
  await assert.rejects(library.resolve('calm'), /not supported by this browser.*compatible/i);
});
