'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
require('../engine/notebook-file.cjs').ensureDefaultNotebook(path.join(root, 'plan.json'));
const output = path.join(__dirname, 'phase1-suite-' + Date.now());
fs.mkdirSync(output);
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'plan.json'))).digest('hex');
const before = hash();
const tests = [...fs.readdirSync(path.join(root, 'engine')).filter(f => f.endsWith('.test.cjs')).map(f => 'engine/' + f), ...fs.readdirSync(root).filter(f => /^verify.*\.cjs$/.test(f)), 'validation/project-folder-ui.cjs', 'validation/worker-board-browser.cjs', 'validation/project-recipient-browser.cjs', 'validation/phase1-browser.cjs', 'validation/phase2-browser.cjs'];
const results = [];
for (const file of tests) {
  const evidence = path.join(output, path.basename(file, '.cjs'));
  fs.mkdirSync(evidence);
  const start = Date.now();
  const r = spawnSync(process.execPath, [file], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 180000, env: { ...process.env, PLANWHARF_VALIDATION_DIR: evidence, PLANWHARF_TEST_NO_SANDBOX: '1' } });
  fs.writeFileSync(path.join(evidence, 'output.txt'), (r.stdout || '') + (r.stderr || ''));
  results.push({ file, code: r.status, error: r.error?.message, ms: Date.now() - start });
  console.log(r.status === 0 ? 'PASS' : 'FAIL', file);
}
const report = { at: new Date().toISOString(), results, personalNotebookUnchanged: before === hash() };
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
console.log('Evidence:', output);
if (results.some(r => r.code !== 0) || !report.personalNotebookUnchanged) process.exitCode = 1;
