(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanwharfSoundtrack = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STATES = ['idle', 'preparing', 'running', 'pausing', 'checkpoint', 'failed', 'completed', 'neutral'];
  const text = (value, limit = 120) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  function normalizeConfig(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    const mappings = {};
    for (const state of STATES) mappings[state] = text(value.mappings?.[state]);
    return { enabled: value.enabled === true, mode: ['adaptive', 'continuous', 'manual'].includes(value.mode) ? value.mode : 'adaptive', volume: number(value.volume ?? 0.6, 0.6, 0, 1), muted: value.muted === true, shuffle: value.shuffle === true, repeat: ['off', 'track', 'playlist'].includes(value.repeat) ? value.repeat : 'off', fadeMs: number(value.fadeMs ?? 0, 0, 0, 2000), selectedPlaylistId: text(value.selectedPlaylistId), selectedTrackId: text(value.selectedTrackId), mappings, playlists: (Array.isArray(value.playlists) ? value.playlists : []).slice(0, 100).map(row => ({ id: text(row?.id), name: text(row?.name) || 'Playlist', trackIds: [...new Set((Array.isArray(row?.trackIds) ? row.trackIds : []).map(id => text(id)).filter(Boolean))].slice(0, 1000), protected: false })).filter(row => row.id) };
  }
  function createController(options) {
    const audio = options.audio, library = options.library;
    if (!audio || typeof library?.resolve !== 'function') throw Error('Soundtrack requires one audio element and a local library.');
    let config = normalizeConfig(options.config), state = 'neutral', projectId = '', currentTrackId = '', currentResolvedURL = '', loading = false, notice = '', manualPaused = false, armed = false, disposed = false, generation = 0, gain = 1;
    let tracks = (options.catalog || []).map(row => ({ ...row, id: text(row.id), title: text(row.title, 240) || 'Untitled track' })).filter(row => row.id);
    let bundled = (options.playlists || []).map(row => ({ id: text(row.id), name: text(row.name), trackIds: (row.trackIds || []).filter(id => tracks.some(track => track.id === id)), protected: true }));
    config.playlists = config.playlists.filter(row => !bundled.some(item => item.id === row.id));
    const listeners = new Set(), timers = new Map(), schedule = options.setTimeout || setTimeout, cancelTimer = options.clearTimeout || clearTimeout;
    let playlistSerial = 0;
    const lists = () => [...bundled, ...config.playlists];
    const clone = value => JSON.parse(JSON.stringify(value));
    const snapshot = () => ({ config: clone(config), tracks: clone(tracks), playlists: clone(lists()), currentTrackId, currentTrack: clone(tracks.find(row => row.id === currentTrackId) || null), playing: !audio.paused, paused: !!audio.paused, manualPaused, loading, notice, duration: Number.isFinite(audio.duration) ? audio.duration : 0, currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0, state, projectId });
    const emit = () => { if (!disposed) for (const fn of listeners) fn(snapshot()); };
    const persist = () => { try { options.save?.(clone(config)); } catch { notice = 'Soundtrack preferences could not be saved. Check browser storage.'; } emit(); };
    const volume = nextGain => { gain = nextGain; audio.volume = config.volume * gain; audio.muted = config.muted; };
    const invalidate = () => { generation++; for (const [timer, resolve] of timers) { cancelTimer(timer); resolve(); } timers.clear(); loading = false; };
    function sequence() {
      if (config.mode === 'manual') return tracks.map(row => row.id);
      const choice = config.mode === 'adaptive' ? config.mappings[state] : config.mode === 'continuous' ? config.selectedPlaylistId : config.selectedTrackId;
      const playlist = lists().find(row => row.id === choice);
      return playlist ? playlist.trackIds.filter(id => tracks.some(row => row.id === id)) : tracks.some(row => row.id === choice) ? [choice] : [];
    }
    function fade(from, to, token) {
      if (!config.fadeMs) { volume(to); return Promise.resolve(); }
      return new Promise(resolve => {
        const steps = 10, delay = config.fadeMs / steps;
        let step = 0;
        function tick() {
          if (token !== generation || disposed) return resolve();
          volume(from + (to - from) * (++step / steps));
          if (step >= steps) return resolve();
          const timer = schedule(() => { timers.delete(timer); tick(); }, delay); timers.set(timer, resolve);
        }
        tick();
      });
    }
    async function select(id, transition = false) {
      invalidate(); const token = generation;
      if (!id || !armed || !config.enabled || manualPaused || disposed) { audio.pause(); emit(); return snapshot(); }
      if (id === currentTrackId && !audio.paused) { volume(1); return snapshot(); }
      loading = true; notice = ''; emit();
      try {
        const url = await library.resolve(id);
        if (token !== generation || disposed) return snapshot();
        if (typeof url !== 'string' || !url) throw Error('missing');
        if (transition && !audio.paused) await fade(1, 0, token);
        if (token !== generation || disposed) return snapshot();
        audio.pause();
        if (id !== currentTrackId || currentResolvedURL !== url) { audio.src = url; currentResolvedURL = url; currentTrackId = id; audio.currentTime = 0; audio.load?.(); }
        volume(transition && config.fadeMs ? 0 : 1);
        await audio.play();
        if (token !== generation || disposed) return snapshot();
        loading = false; emit();
        if (transition) await fade(0, 1, token);
      } catch {
        if (token !== generation || disposed) return snapshot();
        audio.pause(); armed = false; loading = false;
        notice = 'Playback unavailable or blocked. Check the local file and format, then press Play to retry.'; emit();
      }
      return snapshot();
    }
    const reconcile = () => select(config.mode === 'manual' ? config.selectedTrackId || sequence()[0] : sequence()[0], true);
    function pause() { invalidate(); manualPaused = true; audio.pause(); volume(1); emit(); return snapshot(); }
    function stop() { invalidate(); armed = false; manualPaused = true; audio.pause(); try { audio.currentTime = 0; } catch {} volume(1); emit(); return snapshot(); }
    async function play() { if (disposed) return snapshot(); config.enabled = true; armed = true; manualPaused = false; persist(); return select(config.mode === 'manual' && sequence().includes(config.selectedTrackId) ? config.selectedTrackId : currentTrackId && sequence().includes(currentTrackId) ? currentTrackId : sequence()[0]); }
    function configure(partial = {}) {
      const previous = config;
      config = normalizeConfig({ ...config, ...partial, mappings: { ...config.mappings, ...(partial.mappings || {}) } });
      config.playlists = config.playlists.filter(row => !bundled.some(item => item.id === row.id));
      if (config.mode !== previous.mode) manualPaused = false;
      if (!config.enabled) { invalidate(); armed = false; audio.pause(); volume(1); }
      else { volume(gain); if (armed && !manualPaused && (config.mode !== previous.mode || config.selectedTrackId !== previous.selectedTrackId || config.selectedPlaylistId !== previous.selectedPlaylistId || JSON.stringify(config.mappings) !== JSON.stringify(previous.mappings))) void reconcile(); }
      persist(); return snapshot();
    }
    async function move(direction, ended = false) {
      if (ended && (!config.enabled || manualPaused || !armed)) return snapshot();
      const ids = sequence(); if (!ids.length) return stop();
      let index = ids.indexOf(currentTrackId);
      if (ended && config.repeat === 'track') { audio.currentTime = 0; return select(currentTrackId); }
      if (config.shuffle && ids.length > 1) { const remaining = ids.filter(id => id !== currentTrackId); return select(remaining[Math.min(remaining.length - 1, Math.floor((options.random || Math.random)() * remaining.length))]); }
      index += direction;
      if (ended && index >= ids.length && config.repeat !== 'playlist') { audio.pause(); armed = false; emit(); return snapshot(); }
      const id = ids[(index + ids.length) % ids.length];
      if (config.mode === 'manual') config.selectedTrackId = id;
      if (!config.enabled || manualPaused || !armed) { invalidate(); currentTrackId = id; notice = ''; persist(); return snapshot(); }
      persist(); return select(id);
    }
    const ended = () => { void move(1, true); };
    const mediaError = () => { invalidate(); audio.pause(); armed = false; notice = 'This audio file is missing or unsupported. Select a compatible file and press Play.'; emit(); };
    const time = () => emit();
    audio.addEventListener('ended', ended); audio.addEventListener('error', mediaError);
    for (const name of ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause']) audio.addEventListener(name, time);
    volume(1);
    function editable(id) { const row = config.playlists.find(item => item.id === id); if (!row || bundled.some(item => item.id === id)) throw Error('Bundled playlists are protected. Create a copy to customize.'); return row; }
    function trackIds(ids) { return [...new Set((Array.isArray(ids) ? ids : []).filter(id => tracks.some(row => row.id === id)))].slice(0, 1000); }
    return {
      snapshot,
      setCatalog(nextTracks, nextPlaylists) {
        invalidate(); volume(1);
        tracks = (Array.isArray(nextTracks) ? nextTracks : []).slice(0, 10000).map(row => ({ ...row, id: text(row.id), title: text(row.title, 240) || 'Untitled track' })).filter(row => row.id);
        if (Array.isArray(nextPlaylists)) bundled = nextPlaylists.slice(0, 100).map(row => ({ id: text(row.id), name: text(row.name), trackIds: trackIds(row.trackIds), protected: true }));
        config.playlists = config.playlists.filter(row => !bundled.some(item => item.id === row.id));
        if (currentTrackId && !tracks.some(row => row.id === currentTrackId)) { audio.pause(); currentTrackId = ''; notice = 'The selected track is unavailable. Select a local file.'; }
        persist(); return snapshot();
      },
      selectTrack(id) { if (!tracks.some(row => row.id === id)) { notice = 'The selected track is unavailable.'; emit(); return Promise.resolve(snapshot()); } config.selectedTrackId = id; if (!armed || manualPaused || !config.enabled) currentTrackId = id; persist(); return armed && !manualPaused && config.enabled ? select(id) : Promise.resolve(snapshot()); },
      copyPlaylist(id, name) { const row = lists().find(item => item.id === id); if (!row) throw Error('Playlist unavailable.'); return this.createPlaylist(name || `${row.name} copy`, row.trackIds); },
      addToPlaylist(id, trackId) { return this.setPlaylistTracks(id, [...editable(id).trackIds, trackId]); },
      removeFromPlaylist(id, trackId) { return this.setPlaylistTracks(id, editable(id).trackIds.filter(value => value !== trackId)); },
      subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); }, play, pause, stop, next: () => move(1), previous: () => move(-1), configure,
      seek(value) { if (Number.isFinite(audio.duration) && audio.duration > 0 && Number.isFinite(Number(value))) { try { audio.currentTime = number(value, 0, 0, audio.duration); } catch {} } emit(); return snapshot(); },
      observe(next, project) { const normalized = STATES.includes(next) ? next : 'neutral', key = text(project, 512); if (normalized === state && key === projectId) return Promise.resolve(snapshot()); state = normalized; projectId = key; emit(); return armed && config.enabled && !manualPaused && config.mode === 'adaptive' ? reconcile() : Promise.resolve(snapshot()); },
      createPlaylist(name, ids) { if (config.playlists.length >= 100) throw Error('Playlist limit reached.'); let id; do { id = `user-${Date.now().toString(36)}-${(++playlistSerial).toString(36)}`; } while (lists().some(row => row.id === id)); config.playlists.push({ id, name: text(name) || 'Playlist', trackIds: trackIds(ids), protected: false }); persist(); return id; },
      renamePlaylist(id, name) { editable(id).name = text(name) || 'Playlist'; persist(); return snapshot(); },
      deletePlaylist(id) { editable(id); config.playlists = config.playlists.filter(row => row.id !== id); if (config.selectedPlaylistId === id) config.selectedPlaylistId = ''; for (const key of STATES) if (config.mappings[key] === id) config.mappings[key] = ''; persist(); if (armed && !manualPaused) void reconcile(); return snapshot(); },
      setPlaylistTracks(id, ids) { editable(id).trackIds = trackIds(ids); persist(); if (armed && !manualPaused) void reconcile(); return snapshot(); },
      dispose() { stop(); disposed = true; audio.removeAttribute?.('src'); audio.load?.(); audio.removeEventListener('ended', ended); audio.removeEventListener('error', mediaError); for (const name of ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause']) audio.removeEventListener(name, time); listeners.clear(); }
    };
  }
  return { createController, normalizeConfig, STATES };
});
