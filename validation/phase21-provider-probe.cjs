'use strict';
// Real Codex diagnostics; no personal source writes and no provider/model fallback.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { executable, launchSpec } = require('../engine/providers.cjs');
const dir = path.join(__dirname, 'provider-check', 'phase21-' + Date.now()); fs.mkdirSync(dir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-phase21-profile-'));
fs.copyFileSync(path.join(os.homedir(), '.codex/auth.json'), path.join(profile, 'auth.json'));
fs.writeFileSync(path.join(profile, 'config.toml'), 'approval_policy="never"\nmodel_reasoning_effort="low"\n');
const plain = path.join(dir, 'plain'), repo = path.join(dir, 'repo'); fs.mkdirSync(plain); fs.mkdirSync(repo);
spawnSync('git', ['init', repo], { windowsHide: true });
const model = { id: 'gpt-6-luna', cli: 'gpt-6-luna', provider: 'codex', label: 'GPT-6 Luna' };
let prompt = 'Do not use tools or read or write files. Reply with exactly MODEL_ACCESS_OK.';
const env = { ...process.env, CODEX_HOME: profile };
const clean = { ...env }; for (const key of Object.keys(clean)) if (/^CODEX_(SESSION_ID|THREAD_ID|CI|DAEMON_SHUTDOWN_SOCKET|MANAGED_BY_NPM|MANAGED_PACKAGE_ROOT|VERSION)$/.test(key)) delete clean[key];
const minimal = folder => ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '-C', folder, '--sandbox', 'read-only', '--json', '-m', model.cli, '-'];
const cases = [
  { name: 'direct-historical-args', args: minimal(plain), cwd: plain, env },
  { name: 'planwharf-worker-args', args: launchSpec(model, plain, prompt).args, cwd: plain, env },
  { name: 'direct-clean-environment', args: minimal(plain), cwd: plain, env: clean },
  { name: 'direct-git-folder', args: minimal(repo), cwd: repo, env: clean }
];
if (process.argv.includes('--transport')) {
  cases.splice(0, cases.length,
    { name: 'native-transport-trace', args: minimal(plain), cwd: plain, env: { ...clean, RUST_LOG: 'reqwest::connect=debug,hyper_util::client::legacy::connect::http=debug,codex_app_server::request_processors::account_processor::workspace_routing=debug' } });
}
if (process.argv.includes('--ca')) {
  const bundle = path.join(dir, 'trusted-roots.pem'); fs.writeFileSync(bundle, require('node:tls').rootCertificates.join('\n'));
  cases.splice(0, cases.length,
    { name: 'explicit-trusted-ca', args: minimal(plain), cwd: plain, env: { ...clean, CODEX_CA_CERTIFICATE: bundle } },
    { name: 'explicit-ssl-ca', args: minimal(plain), cwd: plain, env: { ...clean, SSL_CERT_FILE: bundle } });
}
if (process.argv.includes('--shell')) {
  const bundle = path.join(dir, 'trusted-roots.pem'); fs.writeFileSync(bundle, require('node:tls').rootCertificates.join('\n'));
  prompt = 'Do not read or write files. Use exec_command to run Write-Output SHELL_ACCESS_OK once in your default shell. If it succeeds, reply exactly MODEL_ACCESS_OK. Report any failure honestly.';
  const accessiblePath = clean.PATH.split(path.delimiter).filter(entry => !/WindowsApps/i.test(entry)).join(path.delimiter);
  cases.splice(0, cases.length,
    { name: 'shell-default-store-path', args: [...launchSpec(model, plain, prompt, true).args], cwd: plain, env: { ...clean, CODEX_CA_CERTIFICATE: bundle } },
    { name: 'shell-accessible-path', args: [...launchSpec(model, plain, prompt, true).args], cwd: plain, env: { ...clean, CODEX_CA_CERTIFICATE: bundle, PATH: accessiblePath } });
}
if (process.argv.includes('--runtime')) {
  const runtimeEnv = require('../engine/providers.cjs').providerEnvironment('codex', env);
  cases.splice(0, cases.length,
    { name: 'direct-with-runtime-boundary', args: minimal(plain), cwd: plain, env: runtimeEnv },
    { name: 'planwharf-with-runtime-boundary', args: launchSpec(model, repo, prompt).args, cwd: repo, env: runtimeEnv });
}
function probe(test) { return new Promise(resolve => {
  const started = Date.now(), child = spawn(executable('codex'), test.args, { cwd: test.cwd, env: test.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timedOut = false;
  child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
  child.on('error', e => stderr += e.message); child.stdin.on('error', () => {}); child.stdin.end(prompt);
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60000);
  child.on('close', code => { clearTimeout(timer); fs.writeFileSync(path.join(dir, test.name + '.stdout.txt'), stdout); fs.writeFileSync(path.join(dir, test.name + '.stderr.txt'), stderr);
    const result = { name: test.name, provider: model.provider, model: model.cli, command: executable('codex'), args: test.args, cwd: test.cwd, environmentKeys: Object.keys(test.env).sort(), exitCode: code, timedOut, ms: Date.now() - started, routingFailure: /workspace routing discovery failed/.test(stdout + stderr), success: code === 0 && stdout.includes('MODEL_ACCESS_OK') };
    console.log(JSON.stringify(result)); resolve(result); });
}); }
(async () => {
  try {
    const results = [];
    for (let index = 0; index < cases.length; index += 2) results.push(...await Promise.all(cases.slice(index, index + 2).map(probe)));
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ at: new Date().toISOString(), results, removedEnvironmentKeys: Object.keys(env).filter(key => !(key in clean)) }, null, 2));
    console.log('Evidence:', dir);
  } finally { const target = path.resolve(profile); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('pw-phase21-profile-')) throw new Error('Unexpected profile path'); fs.rmSync(target, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
