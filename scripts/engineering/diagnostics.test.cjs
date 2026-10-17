'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { preview, exportPreview } = require('./diagnostics.cjs');
const secret = 'SECRET_TOKEN /home/private/user C:\\Users\\private api-key cookie password conversation';
const input = { appVersion: secret, state: secret, errorCategory: secret, browser: { kind: secret, path: secret }, adapters: { codex: { version: secret, token: secret } }, configuration: { password: secret }, tests: { claims: secret }, prompt: secret, env: secret, source: secret };
const report = preview(input);
assert.ok(!report.text.includes(secret)); assert.ok(!report.text.includes('private'));
assert.equal(JSON.parse(report.text).errorCategory, 'unknown');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-diagnostic-test-')); const destination = path.join(dir, 'support.json');
try {
  assert.throws(() => exportPreview(report, 'yes', destination), /Confirm/);
  assert.equal(fs.existsSync(destination), false);
  exportPreview(report, report.confirmation, destination);
  assert.equal(fs.readFileSync(destination, 'utf8'), report.text);
  assert.throws(() => exportPreview(report, report.confirmation, destination), /EEXIST/);
  const forgedText = JSON.stringify({ ...JSON.parse(report.text), token: secret });
  const forgedHash = require('node:crypto').createHash('sha256').update(forgedText).digest('hex');
  assert.throws(() => exportPreview({ text: forgedText, confirmation: forgedHash }, forgedHash, path.join(dir, 'forged.json')), /non-allowlisted/);
  assert.equal(fs.existsSync(path.join(dir, 'forged.json')), false);
  const tampered = { ...report, text: report.text + secret };
  assert.throws(() => exportPreview(tampered, report.confirmation, destination), /Confirm/);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('PASS diagnostic allowlist, exact-preview confirmation, no overwrite');
