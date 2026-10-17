'use strict';
const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { inspectDirectory } = require('./release-smoke.cjs');
const root = path.resolve(__dirname, '../..');
assert.equal(inspectDirectory(root).length, 8);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-release-missing-'));
try { assert.throws(() => inspectDirectory(temporary), /RELEASE_MISSING.*planwharf.cmd/); } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log('PASS launcher presence, executable header and missing-file regression');
