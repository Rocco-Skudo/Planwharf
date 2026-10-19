'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..', 'assets', 'soundtrack');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
test('bundled music has complete CC0 provenance and exact local audio hashes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.schema, 1);
  assert.ok(manifest.tracks.length >= 4 && manifest.tracks.length <= 6);
  const ids = new Set(); const hashes = new Set(); let total = 0;
  for (const track of manifest.tracks) {
    assert.ok(!ids.has(track.id)); ids.add(track.id);
    for (const field of ['title', 'creator', 'source', 'licenseUrl', 'attribution']) assert.ok(typeof track[field] === 'string' && track[field].trim());
    assert.equal(track.license, 'CC0-1.0');
    assert.match(track.source, /^https:\/\/opengameart\.org\/content\/[a-z0-9-]+$/);
    assert.equal(track.licenseUrl, 'https://creativecommons.org/publicdomain/zero/1.0/');
    assert.match(track.file, /^[a-z0-9-]+\.(ogg|mp3)$/);
    const bytes = fs.readFileSync(path.join(root, track.file)); total += bytes.length;
    assert.equal(sha(bytes), track.verification.sha256);
    assert.ok(!hashes.has(track.verification.sha256)); hashes.add(track.verification.sha256);
    assert.ok(bytes.length > 100000, 'real music, not a placeholder');
    if (track.mime === 'audio/ogg') assert.equal(bytes.subarray(0, 4).toString(), 'OggS');
    else { assert.equal(track.mime, 'audio/mpeg'); assert.ok(bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff); }
    assert.match(track.verification.sourcePageSha256, /^[a-f0-9]{64}$/);
    assert.match(track.verification.originalSha256, /^[a-f0-9]{64}$/);
    assert.ok(track.verification.durationSeconds > 30);
    assert.equal(track.verification.rightsScope, 'composition-and-recording');
    assert.equal(track.verification.attributionRequired, false);
    assert.match(track.verification.downloadUrl, /^https:\/\/opengameart\.org\/sites\/default\/files\//);
  }
  assert.ok(total < 20 * 1024 * 1024);
  const playlists = new Map(manifest.playlists.map(row => [row.id, row]));
  for (const list of playlists.values()) { assert.equal(list.protected, true); assert.ok(list.trackIds.length); for (const id of list.trackIds) assert.ok(ids.has(id)); }
  for (const key of ['idle', 'preparing', 'running', 'pausing', 'checkpoint', 'failed', 'completed']) assert.ok(playlists.has(manifest.defaults[key]));
  assert.equal(manifest.defaults.neutral, '');
  assert.ok(fs.readFileSync(path.join(root, 'NOTICE.md'), 'utf8').includes('composition'));
});
