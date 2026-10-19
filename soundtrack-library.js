'use strict';
(function (root) {
  const MIME = { mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', flac:'audio/flac' };
  const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
  function normalizeManifest(input) {
    const seen = new Set(), tracks = [];
    for (const item of Array.isArray(input?.tracks) ? input.tracks.slice(0, 100) : []) {
      if (!item || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || seen.has(item.id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*\.(mp3|ogg|wav|flac)$/i.test(item.file)) continue;
      seen.add(item.id); tracks.push({ id:item.id, title:clean(item.title || item.id), creator:clean(item.creator), file:item.file, mime:MIME[item.file.split('.').pop().toLowerCase()], url:'/assets/soundtrack/' + item.file, bundled:true });
    }
    const playlists = (Array.isArray(input?.playlists) ? input.playlists : []).filter(p=>p && /^[a-zA-Z0-9_-]{1,80}$/.test(p.id)).slice(0, 30).map(p=>({ id:p.id, name:clean(p.name || p.title || p.id), trackIds:(Array.isArray(p.trackIds) ? p.trackIds : []).filter(id=>seen.has(id)).slice(0,100), bundled:true }));
    return { tracks, playlists };
  }
  function browserStore(indexedDB = root.indexedDB) {
    let db;
    async function open() {
      if (!indexedDB) throw new Error('Browser storage is unavailable. Uncheck storage and select the files again.');
      if (!db) db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('planwharf_soundtrack_media_v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath:'id' });
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Browser audio storage could not open. Try temporary selection.'));
      });
      return db;
    }
    async function operation(mode, action) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('tracks', mode), request = action(transaction.objectStore('tracks'));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () => reject(new Error('Audio could not be saved. Browser storage may be full; remove stored tracks or use temporary selection.'));
      });
    }
    return { all:()=>operation('readonly', store=>store.getAll()), put:row=>operation('readwrite', store=>store.put(row)), remove:id=>operation('readwrite', store=>store.delete(id)) };
  }
  function createLibrary(options = {}) {
    const audio = options.audio || new root.Audio(), urls = options.urls || root.URL;
    const store = options.store || browserStore(), entries = new Map(), objectUrls = new Map();
    const bundled = normalizeManifest(options.manifest || {});
    let notice = '';
    function check(file) {
      const extension = String(file?.name || '').split('.').pop().toLowerCase(), mime = MIME[extension];
      if (!mime || !audio.canPlayType(mime)) throw new Error('This audio format is not supported by this browser. Select a compatible MP3, OGG, WAV or FLAC file.');
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 256 * 1024 * 1024) throw new Error('Select a nonempty audio file smaller than 256 MB.');
      return mime;
    }
    const ready = store.all().then(rows=>{
      for (const row of rows.slice(0, 200)) {
        if (!/^local-[a-zA-Z0-9_-]{1,100}$/.test(row?.id) || !row.blob || !MIME[row.extension]) continue;
        entries.set(row.id, { id:row.id, title:clean(row.title), mime:MIME[row.extension], remembered:true, blob:row.blob });
      }
    }).catch(error=>{ notice = error.message; });
    return {
      ready,
      get notice() { return notice; },
      list() { return [...bundled.tracks, ...Array.from(entries.values(), ({blob,...track})=>track)]; },
      playlists:bundled.playlists,
      async add(file, remember = false) {
        await ready; const mime = check(file);
        if (entries.size >= 200) throw new Error('The audio library has reached 200 files. Remove a track first.');
        const id = options.id ? options.id() : 'local-' + root.crypto.randomUUID();
        const track = { id, title:clean(file.name), mime, remembered:remember === true, blob:file };
        if (remember === true) await store.put({ id, title:track.title, extension:String(file.name).split('.').pop().toLowerCase(), blob:file });
        entries.set(id, track); const {blob,...metadata} = track; return metadata;
      },
      async resolve(id) {
        await ready; const standard = bundled.tracks.find(track=>track.id === id);
        if (standard) {
          if (!audio.canPlayType(standard.mime)) throw new Error('This bundled audio format is not supported by this browser. Select a compatible track or browser.');
          return standard.url;
        }
        const track = entries.get(id); if (!track) throw new Error('Select this local audio file again; temporary selections are unavailable after reload.');
        if (!audio.canPlayType(track.mime)) throw new Error('This stored audio format is not supported by this browser.');
        if (!objectUrls.has(id)) objectUrls.set(id, urls.createObjectURL(track.blob));
        return objectUrls.get(id);
      },
      async remove(id) {
        if (!entries.has(id)) return;
        if (entries.get(id).remembered) await store.remove(id);
        entries.delete(id); if (objectUrls.has(id)) urls.revokeObjectURL(objectUrls.get(id)); objectUrls.delete(id);
      },
      dispose() { for (const url of objectUrls.values()) urls.revokeObjectURL(url); objectUrls.clear(); }
    };
  }
  const api = { normalizeManifest, createLibrary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PlanwharfSoundtrackLibrary = api;
})(typeof window !== 'undefined' ? window : globalThis);
