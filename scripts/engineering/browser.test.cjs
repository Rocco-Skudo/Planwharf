'use strict';
const assert = require('node:assert/strict');
const { candidates, discover } = require('./browser.cjs');
assert.deepEqual(candidates('chrome', { PLANWHARF_BROWSER_PATH: '/explicit/chrome' }, 'linux'), ['/explicit/chrome']);
assert.ok(candidates('edge', { PATH: '/fixture/bin' }, 'linux').includes('/fixture/bin/microsoft-edge'));
assert.ok(candidates('chrome', { PROGRAMFILES: 'C:/Programs', PATH: '' }, 'win32').some(x => x.includes('Google')));
assert.ok(candidates('edge', {}, 'darwin')[0].includes('Microsoft Edge.app'));
assert.throws(() => candidates('firefox'), /UNSUPPORTED/);
assert.throws(() => discover('chrome', { PLANWHARF_BROWSER_PATH: '/missing-browser' }), /BROWSER_MISSING/);
console.log('PASS browser discovery fixtures; no real browser coverage');
const { launch } = require('./browser.cjs');
const failureFixture = (async () => {
  const previous = process.env.PLANWHARF_BROWSER_PATH;
  process.env.PLANWHARF_BROWSER_PATH = process.execPath;
  try { await assert.rejects(launch({ timeout: 1000 }), /BROWSER_STARTUP_FAILED/); }
  finally { if (previous === undefined) delete process.env.PLANWHARF_BROWSER_PATH; else process.env.PLANWHARF_BROWSER_PATH = previous; }
  console.log('PASS actual disposable child startup failure classification; this is not a browser test');
})().catch(error => { console.error(error); process.exitCode = 1; });
// A disposable executable emulates DevTools discovery, never a browser renderer.
if (process.platform !== 'win32') (async () => {
  await failureFixture;
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-browser-launch-fixture-'));
  const executable = path.join(dir, 'fake-browser');
  fs.writeFileSync(executable, `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const profile=process.argv.find(x=>x.startsWith('--user-data-dir=')).split('=').slice(1).join('=');
fs.writeFileSync(path.join(profile,'argv.json'),JSON.stringify(process.argv));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/json/version'?{Browser:'Fixture/1.2.3'}:[{type:'page',webSocketDebuggerUrl:'ws://127.0.0.1/fixture'}]));});
server.listen(0,'127.0.0.1',()=>fs.writeFileSync(path.join(profile,'DevToolsActivePort'),String(server.address().port)+'\\n'));
`, { mode: 0o700 });
  const previous = process.env.PLANWHARF_BROWSER_PATH; let browser;
  process.env.PLANWHARF_BROWSER_PATH = executable;
  try {
    browser = await launch({ kind: 'chrome', timeout: 3000 });
    assert.equal(browser.version, 'Fixture/1.2.3');
    const args = JSON.parse(fs.readFileSync(require('node:path').join(browser.profile, 'argv.json'), 'utf8'));
    assert.ok(!args.includes('--no-sandbox'));
    const profile = browser.profile; await browser.close(); browser = undefined;
    assert.equal(fs.existsSync(profile), false);
    console.log('PASS simulated DevTools startup, version, sandbox arguments and owned-profile cleanup; no real browser coverage');
  } finally { await browser?.close(); if (previous === undefined || previous === process.execPath) delete process.env.PLANWHARF_BROWSER_PATH; else process.env.PLANWHARF_BROWSER_PATH = previous; fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
