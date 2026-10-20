const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(html, /<title>HarborQueue dashboard<\/title>/i);
assert.match(html, /aria-live="polite"/i);
assert.match(html, /id="refresh"/);
assert.match(html, /id="jobs"/);
assert.match(html, /id="history"/);
assert.match(html, /fetch\(['"]\/api\/state['"]\)/);
assert.match(html, /response\.ok/);
assert.match(html, /Failed to load HarborQueue state/);

const script = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(script, 'dashboard should contain an inline browser script');
new vm.Script(script[1], { filename: 'index.html:inline-script' });

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert.match(readme, /node server\.cjs/);
assert.match(readme, /GET \/api\/state/);

console.log('dashboard artifact checks passed');
