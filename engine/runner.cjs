'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { launchSpec } = require('./providers.cjs');

function which(cmd) {
  const pathEnv = process.env.PATH || '';
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try { if (fs.existsSync(full)) return full; } catch (_) {}
    }
  }
  return null;
}

function whichGrok() {
  const env = process.env.PLANWHARF_GROK;
  if (env && fs.existsSync(env)) return env;
  const home = os.homedir();
  const pinned = [
    path.join(home, '.grok', 'bin', 'grok.exe'),
    path.join(home, '.grok', 'bin', 'grok')
  ];
  const found = pinned.find(file => {
    try { return fs.existsSync(file); } catch (_) { return false; }
  });
  if (found) return found;
  return which('grok');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { folder: '', result: '', title: '', detail: '', worker: '', attempt: '', slice: '' };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--folder') opts.folder = args[++i] || '';
    else if (token === '--result') opts.result = args[++i] || '';
    else if (token === '--title') opts.title = args[++i] || '';
    else if (token === '--detail') opts.detail = args[++i] || '';
    else if (token === '--worker') opts.worker = args[++i] || '';
    else if (token === '--attempt') opts.attempt = args[++i] || '';
    else if (token === '--model-json') opts.model = JSON.parse(args[++i]);
    else if (token === '--slice') opts.slice = args[++i] || '';
    else throw new Error('Unknown argument: ' + token);
  }
  return opts;
}

function promptFor(opts) {
  return [
    'You are the Planwharf worker for this project folder.',
    'Implement the job in this folder. Add tests. Do not wait for the user.',
    'Stay inside this folder. Do not rewrite unrelated files.',
    opts.title ? `Job: ${opts.title}` : '',
    opts.slice ? `Your slice: ${opts.slice}` : '',
    opts.detail ? opts.detail : '',
    'When the slice is done, leave working files and tests on disk, then stop.'
  ].filter(Boolean).join('\n\n');
}

function patchStatus(file, status, extra) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let body = '';
  try { body = fs.readFileSync(file, 'utf8'); } catch (_) {}
  if (!body.trim()) {
    body = [
      optsLine('WORKER', extra && extra.worker),
      optsLine('ATTEMPT', extra && extra.attempt),
      `STATUS: ${status}`,
      extra && extra.reason ? `REASON: ${extra.reason}` : '',
      extra && extra.exitCode != null ? `EXIT: ${extra.exitCode}` : '',
      ''
    ].filter(item => item !== '').join('\n');
  } else if (/(^|\n)\s*STATUS:\s*\S+/i.test(body)) {
    body = body.replace(/(^|\n)\s*STATUS:\s*\S+/i, `$1STATUS: ${status}`);
    if (extra && extra.reason) body += (body.endsWith('\n') ? '' : '\n') + `REASON: ${extra.reason}\n`;
    if (extra && extra.exitCode != null) body += `EXIT: ${extra.exitCode}\n`;
  } else {
    body += (body.endsWith('\n') ? '' : '\n') + `STATUS: ${status}\n`;
  }
  fs.writeFileSync(file, body, 'utf8');
}

function optsLine(key, value) {
  return value ? `${key}: ${value}` : '';
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function killWorker(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (!isProcessAlive(pid)) return false;
  if (process.platform === 'win32') {
    const { spawnSync } = require('node:child_process');
    spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true, timeout: 8000 });
    return !isProcessAlive(pid);
  }
  try { process.kill(-pid, 'SIGTERM'); } catch (_) {
    try { process.kill(pid, 'SIGTERM'); } catch (_) {}
  }
  return !isProcessAlive(pid);
}

function cliModelOf(model) {
  if (!model || typeof model !== 'object') return null;
  if (typeof model.cli === 'string' && model.cli.trim()) {
    const provider = model.provider || (String(model.id || '').startsWith('grok') ? 'grok' : '');
    const prefix = { grok: /^grok-/, codex: /^gpt-/, antigravity: /^(gemini-|claude-|gpt-oss-)/ }[provider];
    return prefix && prefix.test(model.cli) ? model.cli.trim() : null;
  }
  return null;
}

function askPrompt(info) {
  const model = info && info.model && (info.model.label || info.model.id) ? (info.model.label || info.model.id) : 'orchestrator';
  const folder = info && typeof info.folder === 'string' && info.folder.trim() ? info.folder.trim() : '';
  const focus = info && info.state && info.state.focus ? info.state.focus.name : '';
  const github = info && (info.github || info.state?.focus?.github) || '';
  return [
    `You are ${model}, the Planwharf orchestrator lead.`,
    'You coordinate. You do not implement. Workers write code, tests, and files. You never edit the project, never apply patches, never run the job yourself, never spawn subagents that change the repo.',
    'You have full local tool access, network access and noninteractive CLI permissions. Use them to inspect the linked project files, git history, diffs, worker logs and GitHub repository. The coordinator role is a responsibility, not a filesystem or network restriction.',
    'Use the existing gh login for private GitHub repositories (gh api / gh repo view / gh api contents). Git can use it with -c credential.helper= -c "credential.helper=!gh auth git-credential". Never print tokens or copy credentials into prompts, files or logs.',
    'Fetching git objects and updating inspection refs is allowed. Do not implement the job yourself. Do not push, merge, reset, checkout or overwrite work unless that specific action is requested. Report authentication or access failures precisely; do not claim a linked repo is unreadable without checking.',
    folder ? `Project folder: ${folder}. Inspect the complete project, including nested files and git worktrees.` : 'No accessible local folder is linked. GitHub inspection can still use the linked repository.',
    github ? `GitHub repository: ${github}. Use authenticated access, including when it is private.` : 'No GitHub repository is linked.',
    'The briefing includes every registered project folder and GitHub URL. You may inspect those linked locations for coordination. Local uncommitted changes are separate from commits ahead/behind GitHub. Compare the stated branch and refreshed remote SHA; never use old tracking refs as proof of current GitHub state.',
    focus ? `They are asking about ${focus}.` : '',
    'LIVE STATE is a briefing of what the notebook already thinks. Do not recite STATUS labels, file counts, or waiting-for lines as the answer.',
    'Put inspection, tool use, and "I will read…" narration in thinking. The visible answer is only the final assessment. Do not start the answer with I will inspect.',
    'If they want work done, say which workers you would assign and that the notebook dispatches jobs. Do not start implementing.',
    'Do not invent workers that are not in the briefing.',
    'Keyword orders are already executed before you speak: stop, resume, approve, start, skip grill, lead, model on/off, automatic/manual, and work orders (implement/fix/continue) which start or approve a worker job.',
    'BRIEFING:',
    JSON.stringify((info && info.state) || {}, null, 2),
    'RECENT CHAT:',
    JSON.stringify((info && info.state && info.state.history) || [], null, 2),
    'USER:',
    info && info.question ? String(info.question).trim() : ''
  ].filter(item => item !== '').join('\n\n');
}

function askCliArgs(info) {
  const cwd = askCwd(info);
  const work = cwd || (info && info.folder) || '';
  const prompt = askPrompt(Object.assign({}, info, { folder: cwd || info.folder || '' }));
  const args = [
    '-p', prompt,
    '--cwd', work || '.',
    '--output-format', 'streaming-messages-json',
    '--include-partial-messages',
    '--max-turns', '8',
    '--permission-mode', 'auto',
    '--always-approve',
    '--no-subagents'
  ];
  const cli = cliModelOf(info && info.model);
  if (cli) args.push('-m', cli);
  return { cwd, work, args, prompt };
}

function askCwd(info) {
  const folder = info && typeof info.folder === 'string' ? info.folder.trim() : '';
  if (folder) {
    try { if (fs.statSync(folder).isDirectory()) return folder; } catch (_) {}
  }
  const fromState = info && info.state && info.state.focus && info.state.focus.folder;
  if (typeof fromState === 'string' && fromState.trim()) {
    try { if (fs.statSync(fromState).isDirectory()) return fromState.trim(); } catch (_) {}
  }
  return '';
}

function dropThinkingPrefix(answer, thinking) {
  let text = String(answer || '').trim();
  const think = String(thinking || '').trim();
  if (think && text.startsWith(think)) text = text.slice(think.length).trim();
  return text;
}

function parseAskLine(acc, row) {
  if (!acc || typeof acc !== 'object') return acc;
  if (!row || typeof row !== 'object') return acc;
  if (row.event === 'step_update' && row.step_update) {
    const step = row.step_update;
    if (step.step_type === 'agent_response' && typeof step.text_delta === 'string') acc.answer += step.text_delta;
    if (step.step_type === 'tool' || step.step_type === 'tool_call') acc.thinking += '\ntool: ' + (step.tool_name || 'Antigravity tool');
  }
  if (row.event === 'result' && row.result && typeof row.result.response === 'string') {
    acc.answer = row.result.response;
    acc.ms = Math.round((row.result.duration_seconds || 0) * 1000);
  }
  if (row.type === 'item.completed' && row.item && row.item.type === 'agent_message') acc.answer = row.item.text || '';
  if (row.type === 'result') {
    if (Number.isFinite(row.duration_ms)) acc.ms = row.duration_ms;
    if (typeof row.result === 'string' && row.result.trim()) {
      const text = dropThinkingPrefix(row.result, acc.thinking);
      if (!String(acc.answer || '').trim()) acc.answer = text;
    }
    return acc;
  }
  const event = row.event && typeof row.event === 'object' ? row.event : row;
  const delta = event.delta && typeof event.delta === 'object' ? event.delta : null;
  if (delta) {
    if (typeof delta.thinking === 'string' && delta.thinking) acc.thinking += delta.thinking;
    if (delta.type === 'text_delta' && typeof delta.text === 'string') acc.answer += delta.text;
  }
  const block = event.content_block && typeof event.content_block === 'object' ? event.content_block : null;
  if (block) {
    if (block.type === 'thinking' && typeof block.thinking === 'string') acc.thinking += block.thinking;
    if (block.type === 'tool_use') {
      const name = block.name || 'tool';
      acc.thinking += `${acc.thinking ? '\n' : ''}tool: ${name}`;
    }
  }
  if (row.type === 'assistant' && row.message && Array.isArray(row.message.content)) {
    const texts = [];
    row.message.content.forEach(part => {
      if (!part || typeof part !== 'object') return;
      if (part.type === 'thinking' && typeof part.thinking === 'string') acc.thinking += part.thinking;
      if (part.type === 'text' && typeof part.text === 'string') texts.push(part.text);
    });
    if (texts.length) acc.answer = texts.join('');
  }
  return acc;
}

function createAskStream() {
  const acc = { thinking: '', answer: '', ms: null, rest: '' };
  function push(chunk) {
    acc.rest += String(chunk || '');
    const lines = acc.rest.split(/\r?\n/);
    acc.rest = lines.pop() || '';
    lines.forEach(line => {
      if (!line.trim()) return;
      try { parseAskLine(acc, JSON.parse(line)); } catch (_) {}
    });
    return acc;
  }
  function finish() {
    if (acc.rest.trim()) {
      try { parseAskLine(acc, JSON.parse(acc.rest)); } catch (_) {
        if (!acc.answer) acc.answer = acc.rest.trim();
      }
      acc.rest = '';
    }
    const thinking = String(acc.thinking || '').trim();
    const answer = dropThinkingPrefix(acc.answer, thinking);
    return { thinking, answer, ms: acc.ms };
  }
  return { push, finish, acc };
}

let askChild = null;

function abortAsk() {
  const child = askChild;
  askChild = null;
  if (!child) return false;
  const pid = child.pid;
  if (Number.isInteger(pid) && pid > 0) {
    try { killWorker(pid); } catch (_) {}
  }
  try { child.kill(); } catch (_) {}
  return true;
}

function askOrchestrator(info) {
  if (!info || typeof info.question !== 'string' || !info.question.trim()) {
    return Promise.resolve({ answer: '', thinking: '', ms: 0 });
  }
  const cwd = askCwd(info);
  const work = cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ask-'));
  let spec;
  try { spec = launchSpec(info.model, work, askPrompt(info), true); }
  catch (error) { return Promise.resolve({ answer: error.message, thinking: '', ms: 0 }); }
  const onProgress = typeof info.onProgress === 'function' ? info.onProgress : null;
  const started = Date.now();
  return new Promise(resolve => {
    abortAsk();
    const child = spawn(spec.command, spec.args, { cwd: work, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    askChild = child;
    const stream = createAskStream();
    let settled = false;
    let stderr = '';
    const tick = () => {
      if (!onProgress) return;
      try {
        onProgress({
          thinking: stream.acc.thinking,
          answer: stream.acc.answer,
          ms: Date.now() - started
        });
      } catch (_) {}
    };
    child.stdout.on('data', chunk => {
      stream.push(chunk);
      tick();
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
    }, cwd ? 180000 : 90000);
    const done = errorOrCode => {
      if (settled) return;
      settled = true;
      if (askChild === child) askChild = null;
      clearTimeout(timer);
      const out = stream.finish();
      if (!out.answer && (errorOrCode || stderr)) out.answer = `${spec.provider} CLI failed: ${stderr.trim() || String(errorOrCode)}`;
      if (!Number.isFinite(out.ms)) out.ms = Date.now() - started;
      resolve(out);
    };
    child.on('error', done);
    child.on('close', done);
  });
}

function spawnWorker(info) {
  if (!info || typeof info !== 'object') throw new Error('worker launch requires job info');
  if (!info.folder || !info.resultPath) throw new Error('worker launch requires folder and resultPath');
  const logPath = info.logPath || path.join(path.dirname(info.resultPath), '..', 'logs', `${info.attemptId || 'worker'}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, 'a');
  const args = [
    __filename,
    '--folder', info.folder,
    '--result', info.resultPath,
    '--title', (info.job && info.job.title) || '',
    '--detail', (info.job && info.job.detail) || '',
    '--worker', (info.worker && (info.worker.label || info.worker.id)) || 'worker',
    '--attempt', info.attemptId || '',
    '--slice', info.slice || (info.job && info.job.slice) || '',
    '--model-json', JSON.stringify(info.worker)
  ];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    env: { ...process.env }
  });
  child.unref();
  try { fs.closeSync(logFd); } catch (_) {}
  return { pid: child.pid, logPath };
}

function run(argv = process.argv) {
  const opts = parseArgs(argv);
  if (!opts.folder || !opts.result) {
    console.error('runner requires --folder and --result');
    process.exitCode = 1;
    return;
  }
  let spec;
  try { spec = launchSpec(opts.model, opts.folder, promptFor(opts)); }
  catch (error) {
    patchStatus(opts.result, 'FAILED', { worker: opts.worker, attempt: opts.attempt, reason: error.message });
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ event: 'provider-launch', at: new Date().toISOString(), provider: spec.provider, model: spec.model, executable: spec.command, cwd: spec.cwd, attempt: opts.attempt }));
  let finalStatus = null;
  let settled = false;
  let pending = '';
  const child = spawn(spec.command, spec.args, { cwd: spec.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    if (spec.provider !== 'antigravity') return;
    pending += String(chunk);
    const lines = pending.split(/\r?\n/); pending = lines.pop() || '';
    for (const line of lines) {
      try { const row = JSON.parse(line); if (row.event === 'result' && row.result) finalStatus = row.result.status; } catch (_) {}
    }
  });
  child.on('error', error => {
    if (settled) return;
    settled = true;
    patchStatus(opts.result, 'FAILED', { worker: opts.worker, attempt: opts.attempt, reason: error.message || 'spawn failed' });
    process.exitCode = 1;
  });
  child.on('close', (code, signal) => {
    if (settled) return;
    settled = true;
    if (pending.trim()) { try { const row = JSON.parse(pending); if (row.event === 'result' && row.result) finalStatus = row.result.status; } catch (_) {} }
    const reportedFailure = spec.provider === 'antigravity' && finalStatus !== 'SUCCESS';
    const exitCode = code == null || (code === 0 && reportedFailure) ? 1 : code;
    if (exitCode === 0) {
      patchStatus(opts.result, 'COMPLETE', { worker: opts.worker, attempt: opts.attempt, exitCode, reason: signal ? `signal ${signal}` : 'worker exit 0' });
      process.exitCode = 0;
      return;
    }
    patchStatus(opts.result, 'FAILED', { worker: opts.worker, attempt: opts.attempt, exitCode, reason: signal ? `signal ${signal}` : (reportedFailure ? `Antigravity result ${finalStatus || 'missing'}` : `worker exit ${exitCode}`) });
    process.exitCode = exitCode;
  });
}

if (require.main === module) run();

module.exports = { parseArgs, promptFor, whichGrok, isProcessAlive, killWorker, spawnWorker, askOrchestrator, abortAsk, askPrompt, askCliArgs, cliModelOf, parseAskLine, createAskStream, dropThinkingPrefix, run, patchStatus };
