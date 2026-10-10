'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function executable(provider) {
  const names = { grok: 'grok', codex: 'codex', antigravity: 'agy' };
  const name = names[provider];
  if (!name) return null;
  const override = process.env['PLANWHARF_' + provider.toUpperCase()];
  if (override && fs.existsSync(override)) return override;
  const pinned = provider === 'grok' ? path.join(os.homedir(), '.grok', 'bin', 'grok.exe')
    : provider === 'antigravity' ? path.join(os.homedir(), '.gemini', 'bin', 'agy.exe') : '';
  if (pinned && fs.existsSync(pinned)) return pinned;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (provider === 'codex' && process.platform === 'win32') {
      // Resolve npm's actual binary before PATH proxies (.cmd wrappers reject multiline prompts).
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
      const packageRoot = path.join(dir, 'node_modules', '@openai', 'codex');
      const candidates = [
        path.join(packageRoot, 'node_modules', '@openai', 'codex-win32-' + arch, 'vendor', triple, 'bin', 'codex.exe'),
        path.join(dir, 'node_modules', '@openai', 'codex-win32-' + arch, 'vendor', triple, 'bin', 'codex.exe'),
        path.join(packageRoot, 'vendor', triple, 'bin', 'codex.exe')
      ];
      for (const file of candidates) if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
    // npm's extensionless launcher is a shell script, not a Windows executable.
    for (const ext of process.platform === 'win32' ? ['.exe'] : ['']) {
      const file = path.join(dir, name + ext);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
  }
  return null;
}

function launchSpec(model, folder, prompt, lead = false) {
  if (!model || model.available === false) throw new Error(model && model.unavailableReason || 'Model unavailable');
  const provider = model.provider;
  const cli = model.cli;
  const prefixes = { grok: /^grok-/, codex: /^gpt-/, antigravity: /^(gemini-|claude-|gpt-oss-)/ };
  if (!prefixes[provider] || typeof cli !== 'string' || !prefixes[provider].test(cli)) {
    throw new Error('Provider/model mismatch: ' + provider + '/' + cli);
  }
  const command = executable(provider);
  if (!command) throw new Error(provider + ' executable not found (native executable required)');
  let args;
  if (provider === 'grok') {
    args = ['--cwd', folder, '-m', cli, '--no-subagents', '--max-turns', lead ? '8' : '50',
      '--permission-mode', 'auto', '--always-approve', '--output-format', lead ? 'streaming-messages-json' : 'plain'];
    if (lead) args.push('--include-partial-messages');
    args.push('-p', prompt);
  } else if (provider === 'antigravity') {
    args = ['--model', cli, '--mode', 'accept-edits', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--print-timeout', '30m'];
    args.push('-p', prompt);
  } else {
    args = ['exec', '--skip-git-repo-check', '-C', folder, '-m', cli];
    args.push('--dangerously-bypass-approvals-and-sandbox');
    if (lead) args.push('--json');
    args.push(prompt);
  }
  return { command, args, cwd: folder, provider, model: cli };
}

module.exports = { executable, launchSpec };
