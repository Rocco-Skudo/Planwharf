'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = hash(path.join(root, 'plan.json'));
const tests = ['engine/attempts.test.cjs', 'engine/claim.test.cjs', 'engine/runner.test.cjs', 'engine/providers.test.cjs', 'engine/project-folders.test.cjs', 'engine/repository.test.cjs', 'engine/lifecycle.test.cjs', 'engine/skills.test.cjs', 'engine/orchestrator.test.cjs', 'verify.cjs', 'verify-file.cjs', 'verify-round.cjs', 'verify-projects.cjs', 'verify-ui.cjs', 'verify-jump.cjs', 'verify-app.cjs'];
const results = [];
const output = path.join(__dirname, 'calculator-run');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'verification-log.txt'), '');
for (const file of tests) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000 });
  const row = { file, exitCode: result.status, error: result.error && result.error.message, elapsedMs: Date.now() - started };
  results.push(row);
  fs.appendFileSync(path.join(output, 'verification-log.txt'), `${file}\n${result.stdout || ''}${result.stderr || ''}\n`);
  console.log(result.status === 0 ? 'PASS' : 'FAIL', file);
}
const after = hash(path.join(root, 'plan.json'));
fs.writeFileSync(path.join(output, 'verification-results.json'), JSON.stringify({ at: new Date().toISOString(), tests: results, personalPlan: { before, after, unchanged: before === after } }, null, 2));
if (results.some(row => row.exitCode !== 0) || before !== after) process.exitCode = 1;
