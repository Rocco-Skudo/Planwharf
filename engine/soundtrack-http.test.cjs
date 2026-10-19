'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server.cjs');

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-soundtrack-http-'));
  const planFile = path.join(dir, 'notebook.json');
  fs.writeFileSync(planFile, JSON.stringify(require('../fixtures/starter-notebook.json')));
  fs.writeFileSync(path.join(dir, 'private-music.wav'), 'PRIVATE_MUSIC_SENTINEL');
  const server = createServer({ planFile, attemptsDir: path.join(dir, 'attempts'), models: [], refreshModels: false, skillsEnabled: false, syncSkills: false, fetchPlans: async () => [], monitorIntervalMs: 60000 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${server.address().port}`, dir };
}

test('Soundtrack modules and verified manifest are explicitly served by the existing app', async t => {
  const { base } = await fixture(t);
  for (const route of ['/soundtrack.js', '/soundtrack-library.js', '/soundtrack-ui.js', '/soundtrack.css', '/assets/soundtrack/manifest.json']) {
    assert.equal((await fetch(base + route)).status, 200, route);
  }
  const html = await (await fetch(base)).text();
  assert.match(html, /src="soundtrack-ui.js"/);
  assert.match(html, /href="soundtrack.css"/);
});

test('bundled audio has a binary media type and bounded seek ranges', async t => {
  const { base } = await fixture(t);
  const manifest = await (await fetch(base + '/assets/soundtrack/manifest.json')).json();
  const url = base + '/assets/soundtrack/' + manifest.tracks[0].file;
  const whole = await fetch(url);
  assert.match(whole.headers.get('content-type'), /^audio\//);
  assert.doesNotMatch(whole.headers.get('content-type'), /charset/i);
  const bytes = Buffer.from(await whole.arrayBuffer());
  const partial = await fetch(url, { headers: { Range: 'bytes=20-39' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), `bytes 20-39/${bytes.length}`);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(20, 40));
  for (const range of ['bytes=999999999999-', 'bytes=0-4,8-10', 'bytes=../../notebook.json', 'bytes=20-10']) {
    assert.equal((await fetch(url, { headers: { Range: range } })).status, 416);
  }
});

test('media routes cannot expose personal files, traversal or file paths', async t => {
  const { base, dir } = await fixture(t);
  for (const route of ['/api/soundtrack?path=' + encodeURIComponent(path.join(dir, 'private-music.wav')), '/assets/soundtrack/private-music.wav', '/assets/soundtrack/%2e%2e/%2e%2e/server.cjs', '/assets/soundtrack/..%2f..%2fserver.cjs', '/assets/soundtrack/file%3A%2F%2Fetc%2Fpasswd']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    assert.ok(!(await response.text()).includes('PRIVATE_MUSIC_SENTINEL'));
  }
  const exported = await (await fetch(base + '/api/project-export?projectId=first-project')).json();
  assert.ok(!JSON.stringify(exported).includes('soundtrack'));
});
