'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]); fs.mkdirSync(out, { recursive: true });
const files = fs.readdirSync(path.join(root, 'engine')).filter(name => name.endsWith('.test.cjs')).sort();
const guard = path.join(__dirname, 'offline-test-guard.cjs');
const env = { ...process.env, PLANWHARF_CODEX: process.execPath, PLANWHARF_GROK: process.execPath, PLANWHARF_ANTIGRAVITY: process.execPath, NODE_OPTIONS: (process.env.NODE_OPTIONS || '') + ' --require=' + JSON.stringify(guard) };
const results = [];
for (const file of files) {
  const start = Date.now(); const row = cp.spawnSync(process.execPath, ['--test', '--test-concurrency=1', path.join('engine', file)], { cwd: root, env, encoding: 'utf8', timeout: 60000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const output = (row.stdout || '') + (row.stderr || ''); fs.writeFileSync(path.join(out, file + '.log'), output);
  results.push({ file, exitCode: row.status, signal: row.signal, error: row.error?.message, elapsedMs: Date.now() - start, skipped: /(?:SKIP:|# SKIP|ℹ skipped [1-9])/.test(output) });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ root, guard: 'No external fetch; native provider executables replaced by Node until each test installs its own fixture.', results }, null, 2));
  console.log((row.status === 0 ? 'PASS' : 'FAIL') + ' ' + file + (results.at(-1).skipped ? ' (contains skip)' : ''));
}
console.log(JSON.stringify({ files: results.length, pass: results.filter(r=>r.exitCode===0).length, fail: results.filter(r=>r.exitCode!==0).length, containsSkips:results.filter(r=>r.skipped).length }));
