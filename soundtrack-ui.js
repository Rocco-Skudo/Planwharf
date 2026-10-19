'use strict';
(() => {
  const KEY = 'planwharf_soundtrack_v1';
  async function boot() {
    if (window.PlanwharfSoundtrackUI || !window.PlanwharfSoundtrack || !window.PlanwharfSoundtrackLibrary) return;
    const host = document.querySelector('#workspace-settings .workspace-settings-body'); if (!host) return;
    window.PlanwharfSoundtrackUI = { loading:true };
    let projectId=null, snapshot=null, available=false, controller;
    function observe() { if(!controller)return;const row=snapshot?.projects?.find(item=>(item.projectId||item.id)===projectId);Promise.resolve(controller.observe(window.PlanwharfShipState?.(row,available)||'neutral',projectId)).catch(()=>{}); }
    window.addEventListener('planwharf-orchestrator',event=>{snapshot=event.detail.snapshot;projectId=event.detail.projectId;available=event.detail.available;observe();});
    window.addEventListener('planwharf-project',event=>{projectId=event.detail;observe();});
    const make = (tag, text, parent, attributes = {}) => {
      const node = document.createElement(tag); if (text) node.textContent = text;
      for (const [key,value] of Object.entries(attributes)) node.setAttribute(key, value);
      parent?.append(node); return node;
    };
    const section = make('section', '', host, { class:'soundtrack-settings', 'aria-labelledby':'soundtrack-heading', 'data-soundtrack-settings':'' });
    make('h2','Soundtrack',section,{id:'soundtrack-heading'});
    make('p','Optional browser-local music. Adaptive mode follows only the selected project; weather does not control audio.',section,{class:'muted'});
    const feedback = make('p','Loading local audio library…',section,{role:'status','aria-live':'polite','data-soundtrack-notice':''});
    let manifest = {};
    try { const response = await fetch('/assets/soundtrack/manifest.json'); if (response.ok) manifest = await response.json(); } catch { /* Music remains optional when the manifest is unavailable. */ }
    const audio = new Audio(); audio.preload = 'metadata';
    const library = window.PlanwharfSoundtrackLibrary.createLibrary({audio,manifest}); await library.ready;
    let config = {};
    try { config = JSON.parse(localStorage.getItem(KEY) || '{}'); if (!config || typeof config !== 'object' || Array.isArray(config)) config = {}; } catch { /* A corrupt preference cannot enable playback. */ }
    if (!config.mappings) config.mappings = manifest.defaults || {};
    const save = value => { try { localStorage.setItem(KEY,JSON.stringify(value)); } catch { feedback.textContent = 'Audio preferences could not be saved in this browser.'; } };
    const ownership = window.PlanwharfSoundtrack.createPlaybackOwnership();
    controller = window.PlanwharfSoundtrack.createController({audio,library,ownership,catalog:library.list(),playlists:library.playlists,config,save});
    const run = action => { try { Promise.resolve(action()).catch(error=>{ feedback.textContent = error.message || 'Audio is unavailable. Select a track again.'; }); } catch(error) { feedback.textContent = error.message; } };
    function label(text, parent = section) { return make('label',text,parent,{class:'soundtrack-field'}); }
    function checkbox(text,key) { const wrap=label(text), input=make('input','',wrap,{type:'checkbox',['data-soundtrack-'+key]:''}); input.addEventListener('change',()=>controller.configure({[key]:input.checked})); return input; }
    const enabled=checkbox('Enable Soundtrack','enabled');
    const mode=make('select','',label('Playback mode'),{'data-soundtrack-mode':''});
    for(const [id,name] of [['adaptive','Adaptive'],['continuous','Continuous playlist'],['manual','Manual']]) make('option',name,mode,{value:id});
    mode.addEventListener('change',()=>controller.configure({mode:mode.value}));
    const selectedPlaylist=make('select','',label('Playback playlist'),{'data-soundtrack-playlist':''});
    selectedPlaylist.addEventListener('change',()=>controller.configure({selectedPlaylistId:selectedPlaylist.value}));
    const trackSelect=make('select','',label('Track'),{'data-soundtrack-track':''});
    trackSelect.addEventListener('change',()=>run(()=>controller.selectTrack(trackSelect.value)));
    const shuffle=checkbox('Shuffle','shuffle');
    const repeat=make('select','',label('Repeat'),{'data-soundtrack-repeat':''});
    for(const [id,name] of [['off','Off'],['track','Track'],['playlist','Playlist']]) make('option',name,repeat,{value:id});
    repeat.addEventListener('change',()=>controller.configure({repeat:repeat.value}));
    const fade=make('select','',label('State transition fade'),{'data-soundtrack-fade':''});
    for(const [id,name] of [['0','Off'],['500','Short (0.5 seconds)'],['1500','Gentle (1.5 seconds)']]) make('option',name,fade,{value:id});
    fade.addEventListener('change',()=>controller.configure({fadeMs:Number(fade.value)}));
    const mappingGroup=make('fieldset','',section); make('legend','Adaptive state mapping',mappingGroup);
    const mappings = {};
    for(const state of window.PlanwharfSoundtrack.STATES) {
      const select=make('select','',label(state[0].toUpperCase()+state.slice(1),mappingGroup),{'data-soundtrack-state':state}); mappings[state]=select;
      select.addEventListener('change',()=>controller.configure({mappings:{...controller.snapshot().config.mappings,[state]:select.value}}));
    }
    const files=make('input','',label('Select personal audio'),{type:'file',multiple:'',accept:'.mp3,.ogg,.wav,.flac,audio/mpeg,audio/ogg,audio/wav,audio/flac','data-soundtrack-files':''});
    const remember=make('input','',label('Store selected audio in this browser for later sessions'),{type:'checkbox','data-soundtrack-remember':''});
    make('p','Unchecked: files are temporary and must be selected again after reload. Checked: an independent browser copy remains playable if the original is moved or deleted. Nothing is uploaded or included in project exports.',section,{class:'muted'});
    files.addEventListener('change',()=>run(async()=>{
      const errors=[];
      for(const file of Array.from(files.files || [])) { try { await library.add(file,remember.checked); } catch(error) { errors.push(error.message); } }
      controller.setCatalog(library.list(),library.playlists); files.value='';
      feedback.textContent=errors.length?errors.join(' '):remember.checked?'Audio stored in this browser.':'Temporary audio selected. Reselect it after reload.';
    }));
    const libraryList=make('ul','',section,{'data-soundtrack-library':''});
    const editor=make('fieldset','',section); make('legend','User playlists',editor);
    const editorSelect=make('select','',label('Playlist to edit',editor),{'data-soundtrack-edit-playlist':''});
    const name=make('input','',label('Playlist name',editor),{type:'text',maxlength:'100','data-soundtrack-playlist-name':''});
    function button(text,parent,action,attrs={}) { const node=make('button',text,parent,{type:'button',class:'secondary compact',...attrs});node.addEventListener('click',()=>run(action)); return node; }
    const actions=make('div','',editor,{class:'soundtrack-actions'});
    button('Create',actions,()=>{const id=controller.createPlaylist(name.value);editorSelect.value=id;renderEditor(controller.snapshot());});
    button('Rename',actions,()=>controller.renamePlaylist(editorSelect.value,name.value));
    button('Copy',actions,()=>{const id=controller.copyPlaylist(editorSelect.value,name.value);editorSelect.value=id;renderEditor(controller.snapshot());});
    button('Delete',actions,()=>controller.deletePlaylist(editorSelect.value));
    button('Add selected track',actions,()=>controller.addToPlaylist(editorSelect.value,trackSelect.value));
    const playlistTracks=make('ul','',editor,{'data-soundtrack-playlist-tracks':''});
    const player=make('aside','',document.body,{class:'soundtrack-player','aria-label':'Soundtrack player','data-soundtrack-player':''});
    const title=make('span','No track selected',player,{class:'soundtrack-current','data-soundtrack-title':''});
    button('Previous',player,()=>controller.previous(),{'data-soundtrack-previous':''});
    const play=button('Play',player,()=>controller.snapshot().playing?controller.pause():controller.play(),{'data-soundtrack-play':''});
    button('Stop',player,()=>controller.stop(),{'data-soundtrack-stop':''});
    button('Next',player,()=>controller.next(),{'data-soundtrack-next':''});
    const seek=make('input','',label('Seek',player),{type:'range',min:'0',max:'0',step:'.1',value:'0','data-soundtrack-seek':''});
    seek.addEventListener('input',()=>controller.seek(Number(seek.value)));
    const time=make('span','0:00 / 0:00',player,{'data-soundtrack-time':''});
    const volume=make('input','',label('Volume',player),{type:'range',min:'0',max:'1',step:'.01','data-soundtrack-volume':''});
    volume.addEventListener('input',()=>controller.configure({volume:Number(volume.value)}));
    const mute=button('Mute',player,()=>controller.configure({muted:!controller.snapshot().config.muted}),{'data-soundtrack-mute':'','aria-pressed':'false'});
    button('Soundtrack settings',player,()=>{document.getElementById('workspace-settings').showModal();section.scrollIntoView({block:'start'});enabled.focus();},{'data-soundtrack-open-settings':''});
    const options = (select, values, value, empty) => {
      const signature=JSON.stringify(values);
      if(select.dataset.signature!==signature) { select.replaceChildren();if(empty)make('option',empty,select,{value:''}); for(const item of values)make('option',item.name||item.title,select,{value:item.id});select.dataset.signature=signature; }
      if(document.activeElement!==select)select.value=value||'';
    };
    let lastEditorSignature='';
    function renderEditor(snapshot) {
      const selected=snapshot.playlists.find(item=>item.id===editorSelect.value), signature=JSON.stringify([selected, snapshot.tracks]);
      if(signature===lastEditorSignature)return; lastEditorSignature=signature;playlistTracks.replaceChildren();
      for(const id of selected?.trackIds || []) { const track=snapshot.tracks.find(item=>item.id===id), row=make('li',track?.title||'Missing audio — select the file again',playlistTracks);if(!selected.protected)button('Remove',row,()=>controller.removeFromPlaylist(selected.id,id),{'aria-label':'Remove '+(track?.title||'missing audio')+' from playlist'}); }
    }
    editorSelect.addEventListener('change',()=>{lastEditorSignature='';renderEditor(controller.snapshot());});
    let librarySignature='';
    const format=value=>{const n=Number.isFinite(value)?Math.max(0,value):0;return Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');};
    controller.subscribe(snapshot=>{
      enabled.checked=snapshot.config.enabled;mode.value=snapshot.config.mode;shuffle.checked=snapshot.config.shuffle;repeat.value=snapshot.config.repeat;fade.value=String(snapshot.config.fadeMs||0);
      options(selectedPlaylist,snapshot.playlists,snapshot.config.selectedPlaylistId,'Select playlist');
      options(trackSelect,snapshot.tracks,snapshot.currentTrackId||snapshot.config.selectedTrackId,'Select track');
      const previousEditor=editorSelect.value;options(editorSelect,snapshot.playlists,previousEditor||snapshot.playlists[0]?.id);
      for(const [state,select]of Object.entries(mappings))options(select,[...snapshot.playlists,...snapshot.tracks],snapshot.config.mappings?.[state],'Silence');
      title.textContent=snapshot.currentTrack?.title||'No track selected';play.textContent=snapshot.playing?'Pause':'Play';
      play.setAttribute('aria-label',snapshot.playing?'Pause soundtrack':'Play soundtrack');
      mute.textContent=snapshot.config.muted?'Unmute':'Mute';mute.setAttribute('aria-pressed',String(snapshot.config.muted));volume.value=String(snapshot.config.volume);
      seek.max=String(Number.isFinite(snapshot.duration)?snapshot.duration:0);seek.disabled=Boolean(snapshot.loading)||!(snapshot.duration>0);if(document.activeElement!==seek)seek.value=String(snapshot.currentTime||0);time.textContent=format(snapshot.currentTime)+' / '+format(snapshot.duration);
      if(snapshot.notice)feedback.textContent=snapshot.notice;
      const signature=JSON.stringify(snapshot.tracks);
      if(signature!==librarySignature) { librarySignature=signature;libraryList.replaceChildren();for(const track of snapshot.tracks){const row=make('li',track.title+(track.bundled?' — bundled':track.remembered?' — browser copy':' — temporary'),libraryList);if(!track.bundled)button('Remove audio',row,async()=>{if(controller.snapshot().currentTrackId===track.id)controller.stop();await library.remove(track.id);controller.setCatalog(library.list(),library.playlists);},{'aria-label':'Remove audio '+track.title});} }
      renderEditor(snapshot);
    });
    feedback.textContent=library.notice||'Soundtrack starts only after you press Play. Temporary files must be selected again after reload.';
    observe();
    window.addEventListener('pagehide',()=>{controller.stop();library.dispose();},{once:true});
    window.PlanwharfSoundtrackUI={controller,library,audio};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
