'use strict';
// Small, read-only inference probes: a catalog alone is not an access check.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { executable } = require('../engine/providers.cjs');
const dir = path.join(__dirname, 'provider-check');
fs.mkdirSync(dir, { recursive: true });
const models = process.argv.slice(2);
async function probe(model) {
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '-C', dir,
    '--sandbox', 'read-only', '--json', '-m', model,
    'This is a model access check. Do not use tools, inspect files or change anything. Reply with exactly MODEL_ACCESS_OK.'];
  const start = Date.now();
  return new Promise(resolve => {
    const child = spawn(executable('codex'), args, { cwd: dir, windowsHide: true });
    child.stdin.end();
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 90000);
    child.on('error', error => stderr += error.message);
    child.on('close', code => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(dir, model + '.jsonl'), stdout);
      fs.writeFileSync(path.join(dir, model + '.stderr.txt'), stderr);
      const events = stdout.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return {}; } });
      const reply = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').map(e => e.item.text).join('\n');
      const result = { model, at: new Date().toISOString(), exitCode: code, timedOut, durationMs: Date.now() - start,
        verified: code === 0 && reply.trim() === 'MODEL_ACCESS_OK', reply,
        errors: events.filter(e => e.type === 'error' || e.type === 'turn.failed'), stderr };
      console.log(JSON.stringify(result));
      resolve(result);
    });
  });
}
(async () => {
  const results = await Promise.all(models.map(probe));
  fs.writeFileSync(path.join(dir, 'codex-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
