'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createController, createPlaybackOwnership, normalizeConfig } = require('../soundtrack.js');
// Simulated media boundary: these tests do not establish audible playback.
class AudioFixture extends EventTarget {
  constructor() { super(); this.paused = true; this.currentTime = 0; this.duration = 120; this.volume = 1; this.muted = false; this.starts = []; }
  play() { this.starts.push(this.src); if (this.reject) return Promise.reject(Error('NotAllowedError')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute(name) { if (name === 'src') this.src = ''; }
}
function fixture(options = {}) {
  const audio = new AudioFixture(), saved = [];
  const controller = createController({ audio, catalog: [{ id: 'calm', title: 'Calm' }, { id: 'ocean', title: 'Ocean' }], playlists: [{ id: 'bundled', name: 'Default', trackIds: ['calm', 'ocean'], protected: true }], library: { resolve: async id => `blob:fixture-${id}` }, save: value => saved.push(value), config: { mappings: { neutral: 'calm' } }, ...options });
  return { audio, saved, controller };
}

// Browser API boundary: ifAvailable cannot enqueue or preempt an existing owner.
function lockFixture() {
  let held = false;
  return { request: async (_name, options, callback) => {
    assert.equal(options.ifAvailable, true);
    if (held) return callback(null);
    held = true;
    try { return await callback({ name: 'planwharf-soundtrack-player' }); } finally { held = false; }
  } };
}

test('one owner across controllers; pause, disable, silence and disposal permit explicit transfer', async () => {
  for (const action of ['pause', 'disable', 'silence', 'dispose']) {
    const locks = lockFixture();
    const one = fixture({ ownership: createPlaybackOwnership(locks) });
    const two = fixture({ ownership: createPlaybackOwnership(locks) });
    await one.controller.play(); await two.controller.play();
    assert.equal(one.audio.paused, false); assert.equal(two.audio.paused, true);
    if (action === 'disable') one.controller.configure({ enabled: false });
    else if (action === 'silence') await one.controller.observe('failed', 'alpha');
    else one.controller[action]();
    await new Promise(setImmediate);
    assert.equal(two.audio.paused, true, 'Release does not auto-start a waiting tab');
    await two.controller.play(); assert.equal(two.audio.paused, false);
    one.controller.dispose(); two.controller.dispose();
  }
});

test('cancelling a pending ownership claim cannot resurrect playback or block another tab', async () => {
  const callbacks = [];
  const locks = { request: (_name, _options, callback) => new Promise(resolve => callbacks.push(() => resolve(callback({})))) };
  const ownership = createPlaybackOwnership(locks);
  const { controller: c, audio } = fixture({ ownership });
  const pending = c.play(); c.pause(); callbacks.shift()(); await pending;
  assert.equal(audio.paused, true); assert.deepEqual(audio.starts, []);
  const retry = c.play(); callbacks.shift()(); await retry;
  assert.equal(audio.paused, false); c.dispose();
});

test('unavailable or failing Web Locks prevents unsafe audio and gives actionable feedback', async () => {
  for (const locks of [{}, { request() { throw Error('unavailable'); } }]) {
    const { controller: c, audio } = fixture({ ownership: createPlaybackOwnership(locks) });
    await c.play(); assert.equal(audio.paused, true); assert.deepEqual(audio.starts, []);
    assert.match(c.snapshot().notice, /Web Locks|another.*tab/); c.dispose();
  }
});

test('catalog refresh cancels an acquired pending load and frees the other player', async () => {
  const locks = lockFixture(); let finish;
  const one = fixture({ ownership: createPlaybackOwnership(locks), library: { resolve: () => new Promise(resolve => { finish = resolve; }) } });
  const two = fixture({ ownership: createPlaybackOwnership(locks) });
  const pending = one.controller.play();
  await new Promise(setImmediate); one.controller.setCatalog(one.controller.snapshot().tracks);
  await new Promise(setImmediate); await two.controller.play();
  assert.equal(two.audio.paused, false); finish('blob:cancelled'); await pending;
  assert.equal(one.audio.paused, true); one.controller.dispose(); two.controller.dispose();
});
test('fresh and restored installations never start audio without a Play gesture', async () => {
  assert.equal(normalizeConfig().enabled, false);
  const { controller, audio } = fixture({ config: { enabled: true, selectedTrackId: 'calm', mappings: { running: 'calm' } } });
  await controller.observe('running', 'alpha');
  assert.deepEqual(audio.starts, []);
  await controller.play();
  assert.equal(audio.paused, false);
  controller.dispose();
});

test('another active tab denies Play without snapshot retries, and Pause releases ownership', async () => {
  let available = false, claims = 0, releases = 0;
  const ownership = { supported: true, acquire: async () => { claims++; return available; }, release: () => { releases++; } };
  const { controller: c, audio } = fixture({ ownership, config: { mappings: { running: 'ocean' } } });
  await c.observe('running', 'alpha'); await c.play();
  assert.equal(audio.paused, true); assert.deepEqual(audio.starts, []);
  assert.match(c.snapshot().notice, /another.*tab|another.*window/i);
  for (const id of ['beta', 'gamma', 'alpha']) await c.observe('running', id);
  assert.equal(claims, 1);
  available = true; await c.play(); assert.equal(audio.paused, false);
  c.pause(); assert.ok(releases > 0); assert.equal(audio.paused, true); c.dispose();
});
test('adaptive playback follows confirmed selected-project states, unchanged snapshots do not restart', async () => {
  const { controller: c, audio } = fixture({ config: { mappings: { idle: 'calm', preparing: 'calm', running: 'ocean', pausing: 'calm', checkpoint: 'calm', failed: '', completed: 'ocean' } } });
  await c.observe('idle', 'alpha'); await c.play(); assert.equal(c.snapshot().currentTrackId, 'calm');
  await c.observe('running', 'alpha'); assert.equal(c.snapshot().currentTrackId, 'ocean');
  await c.observe('running', 'alpha'); assert.equal(audio.starts.length, 2);
  await c.observe('running', 'beta'); assert.equal(audio.starts.length, 2);
  await c.observe('checkpoint', 'beta'); assert.equal(c.snapshot().currentTrackId, 'calm');
  await c.observe('failed', 'beta'); assert.equal(audio.paused, true);
  await c.observe('completed', 'beta'); assert.equal(c.snapshot().currentTrackId, 'ocean'); c.dispose();
});
test('manual Pause and Stop survive state and project changes until explicit Play', async () => {
  const { controller: c, audio } = fixture({ config: { mappings: { idle: 'calm', running: 'ocean' } } });
  await c.observe('idle', 'alpha'); await c.play(); c.pause();
  await c.observe('running', 'beta'); c.configure({ selectedTrackId: 'ocean', volume: .2 });
  assert.equal(audio.paused, true); assert.equal(audio.starts.length, 1);
  await c.play(); assert.equal(c.snapshot().currentTrackId, 'ocean');
  c.stop(); await c.observe('idle', 'alpha'); assert.equal(audio.paused, true); assert.equal(audio.currentTime, 0); c.dispose();
});
test('autoplay and unsupported media failures require an explicit retry, never snapshot loops', async () => {
  const { controller: c, audio } = fixture(); audio.reject = true; await c.play();
  assert.match(c.snapshot().notice, /press Play/i);
  for (const state of ['idle', 'running', 'failed']) await c.observe(state, 'alpha');
  assert.equal(audio.starts.length, 1); audio.reject = false; await c.observe('neutral', 'alpha'); await c.play(); assert.equal(audio.paused, false);
  audio.dispatchEvent(new Event('error')); assert.match(c.snapshot().notice, /unsupported/); assert.equal(audio.paused, true); c.dispose();
});
test('disabled playback cancels a resolving track without old-promise resurrection', async () => {
  let resolve;
  const { controller: c, audio } = fixture({ library: { resolve: () => new Promise(done => { resolve = done; }) } });
  const pending = c.play(); c.configure({ enabled: false }); resolve('blob:late'); await pending;
  assert.deepEqual(audio.starts, []); assert.equal(c.snapshot().loading, false); c.dispose();
});
test('continuous playlists advance, repeat, shuffle and ignore execution changes', async () => {
  const { controller: c, audio } = fixture({ config: { mode: 'continuous', selectedPlaylistId: 'bundled', repeat: 'playlist' }, random: () => 0 });
  await c.play(); await c.next(); assert.equal(c.snapshot().currentTrackId, 'ocean');
  await c.observe('failed', 'beta'); assert.equal(c.snapshot().currentTrackId, 'ocean');
  await c.next(); assert.equal(c.snapshot().currentTrackId, 'calm');
  c.configure({ shuffle: true }); await c.next(); assert.equal(c.snapshot().currentTrackId, 'ocean');
  c.configure({ repeat: 'track', shuffle: false }); audio.dispatchEvent(new Event('ended')); await new Promise(setImmediate); assert.equal(c.snapshot().currentTrackId, 'ocean');
  c.configure({ repeat: 'off' }); audio.dispatchEvent(new Event('ended')); await new Promise(setImmediate); assert.equal(audio.paused, true); c.dispose();
});
test('volume/mute and seek are bounded and saved without playback activation', () => {
  const { controller: c, audio, saved } = fixture(); c.configure({ volume: .23, muted: true }); c.seek(500);
  assert.equal(audio.volume, .23); assert.equal(audio.muted, true); assert.equal(audio.currentTime, 120);
  assert.equal(saved.at(-1).volume, .23); assert.equal(saved.at(-1).muted, true); assert.deepEqual(audio.starts, []); c.dispose();
});
test('user playlist editing is inert and protects bundled playlists', () => {
  const { controller: c } = fixture(); const id = c.createPlaylist('  <img onerror=evil()>  ', ['calm', 'calm', 'missing']);
  assert.equal(c.snapshot().playlists.find(row => row.id === id).name, '<img onerror=evil()>');
  assert.deepEqual(c.snapshot().playlists.find(row => row.id === id).trackIds, ['calm']);
  assert.throws(() => c.deletePlaylist('bundled'), /protected/); assert.throws(() => c.renamePlaylist('bundled', 'No'), /protected/);
  c.renamePlaylist(id, 'Rest'); c.setPlaylistTracks(id, ['ocean']); assert.deepEqual(c.snapshot().config.playlists[0].trackIds, ['ocean']);
  c.deletePlaylist(id); assert.equal(c.snapshot().config.playlists.length, 0); c.dispose();
});
test('missing file resolution gives safe actionable feedback without leaking exception paths', async () => {
  const { controller: c } = fixture({ library: { resolve: async () => { throw Error('/private/music/secret.mp3'); } } });
  await c.play(); assert.match(c.snapshot().notice, /local file/); assert.doesNotMatch(c.snapshot().notice, /private/); c.dispose();
});
test('explicit Silence stays silent even when pressing Play in adaptive mode', async () => {
  const { controller: c, audio } = fixture(); await c.observe('failed', 'alpha'); await c.play(); assert.deepEqual(audio.starts, []); c.dispose();
});
test('catalog refresh and manual selection expose newly imported tracks without another controller', async () => {
  const { controller: c, audio } = fixture({ config: { mode: 'manual' } });
  c.setCatalog([{ id: 'local', title: 'Personal song' }], []); await c.selectTrack('local');
  assert.equal(audio.starts.length, 0); await c.play(); assert.equal(c.snapshot().currentTrackId, 'local');
  const id = c.createPlaylist('Personal', ['local']); const copy = c.copyPlaylist(id, 'Copy');
  c.removeFromPlaylist(copy, 'local'); c.addToPlaylist(copy, 'local'); assert.deepEqual(c.snapshot().playlists.find(row => row.id === copy).trackIds, ['local']); c.dispose();
});
test('rapid state changes cancel bounded fades and settle obsolete requests', async () => {
  const pending = new Map(); let serial = 0;
  const { controller: c, audio } = fixture({ config: { fadeMs: 100, mappings: { idle: 'calm', running: 'ocean', completed: 'calm' } }, setTimeout: fn => { pending.set(++serial, fn); return serial; }, clearTimeout: id => pending.delete(id) });
  await c.observe('idle', 'alpha'); await c.play();
  const old = c.observe('running', 'alpha'); await Promise.resolve();
  c.configure({ enabled: false }); await old;
  assert.equal(pending.size, 0); assert.equal(audio.paused, true); assert.equal(audio.starts.length, 1); c.dispose();
});
test('invalid restored configuration cannot enable Soundtrack or inject protected playlists', () => {
  assert.equal(normalizeConfig(null).enabled, false);
  const { controller: c } = fixture({ config: { enabled: 'true', volume: 900, fadeMs: 9000, playlists: [{ id: 'bundled', name: 'Forged', trackIds: ['ocean'], protected: false }] } });
  assert.equal(c.snapshot().config.enabled, false); assert.equal(c.snapshot().config.volume, 1); assert.equal(c.snapshot().config.fadeMs, 2000);
  assert.equal(c.snapshot().playlists[0].name, 'Default'); c.dispose();
});
test('a newer project track wins when asynchronous resolution completes out of order', async () => {
  const requests = [];
  const { controller: c, audio } = fixture({ config: { mappings: { idle: 'calm', running: 'ocean' } }, library: { resolve: id => new Promise(resolve => requests.push({ id, resolve })) } });
  await c.observe('idle', 'alpha'); const first = c.play();
  const second = c.observe('running', 'beta'); requests[1].resolve('blob:ocean'); await second;
  requests[0].resolve('blob:calm'); await first;
  assert.equal(c.snapshot().currentTrackId, 'ocean'); assert.deepEqual(audio.starts, ['blob:ocean']); c.dispose();
});
test('fade volume changes preserve current gain and use the latest volume on remaining steps', async () => {
  const pending = new Map(); let serial = 0;
  const { controller: c, audio } = fixture({ config: { volume: .6, fadeMs: 100, mappings: { idle: 'calm', running: 'ocean' } }, setTimeout: fn => { pending.set(++serial, fn); return serial; }, clearTimeout: id => pending.delete(id) });
  await c.observe('idle', 'alpha'); await c.play(); const transition = c.observe('running', 'alpha'); await Promise.resolve();
  assert.ok(audio.volume < .6); const ratio = audio.volume / .6; c.configure({ volume: .2, muted: true });
  assert.ok(Math.abs(audio.volume - ratio * .2) < .00001); assert.equal(audio.muted, true);
  c.pause(); await transition; assert.equal(audio.volume, .2); assert.equal(pending.size, 0); c.dispose();
});
test('restoring user playlists and volume is separate from restoring playback authorization', async () => {
  const first = fixture(); const id = first.controller.createPlaylist('Personal', ['ocean']); first.controller.configure({ enabled: true, mode: 'continuous', selectedPlaylistId: id, volume: .31, muted: true });
  const config = first.controller.snapshot().config; first.controller.dispose();
  const { controller: c, audio } = fixture({ config }); await c.observe('running', 'beta'); assert.equal(audio.volume, .31); assert.equal(audio.muted, true); assert.deepEqual(audio.starts, []);
  await c.play(); assert.equal(c.snapshot().currentTrackId, 'ocean'); c.dispose();
});
test('Manual next and previous select individual tracks while respecting Pause', async () => {
  const { controller: c, audio } = fixture({ config: { mode: 'manual', selectedTrackId: 'calm' } });
  await c.play(); c.pause(); await c.next(); assert.equal(c.snapshot().currentTrackId, 'ocean'); assert.equal(audio.paused, true); assert.equal(audio.starts.length, 1);
  await c.play(); assert.equal(audio.starts.at(-1), 'blob:fixture-ocean'); await c.previous(); assert.equal(c.snapshot().currentTrackId, 'calm'); c.dispose();
});
test('catalog refresh and returning to the current track cancel attenuation instead of leaving muted playback', async () => {
  for (const action of ['catalog', 'state']) {
    const pending = new Map(); let serial = 0;
    const { controller: c, audio } = fixture({ config: { volume: .6, fadeMs: 100, mappings: { idle: 'calm', running: 'ocean' } }, setTimeout: fn => { pending.set(++serial, fn); return serial; }, clearTimeout: id => pending.delete(id) });
    await c.observe('idle', 'alpha'); await c.play(); const transition = c.observe('running', 'alpha'); await Promise.resolve();
    assert.ok(audio.volume < .6);
    if (action === 'catalog') c.setCatalog(c.snapshot().tracks);
    else await c.observe('idle', 'alpha');
    await transition; assert.equal(pending.size, 0); assert.equal(audio.volume, .6); assert.equal(audio.paused, false); c.dispose();
  }
});
test('Pause and Play preserve position when the browser expands relative source URLs', async () => {
  const audio = new AudioFixture(); let assigned = '';
  Object.defineProperty(audio, 'src', { get() { return assigned ? new URL(assigned, 'http://localhost:1234').href : ''; }, set(value) { assigned = value; } });
  const { controller: c } = fixture({ audio, library: { resolve: async () => '/assets/soundtrack/calm.ogg' } });
  await c.play(); c.seek(37); c.pause(); await c.play(); assert.equal(audio.currentTime, 37); c.dispose();
});
test('Pause and Disable abort an outstanding media Play without restoring authorization', async () => {
  for (const action of ['pause', 'disable']) {
    const audio = new AudioFixture(); let resolvePlay;
    // Model the browser boundary: pause synchronously stops media while an old play Promise is outstanding.
    audio.play = function () { this.starts.push(this.src); this.paused = false; return new Promise(resolve => { resolvePlay = resolve; }); };
    const { controller: c } = fixture({ audio }); const pending = c.play(); await Promise.resolve();
    if (action === 'pause') c.pause(); else c.configure({ enabled: false });
    resolvePlay(); await pending;
    assert.equal(audio.paused, true); assert.equal(c.snapshot().loading, false);
    await c.observe('running', 'beta'); assert.equal(audio.starts.length, 1); c.dispose();
  }
});
