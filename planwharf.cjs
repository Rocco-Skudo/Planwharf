'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Plan = require('./plan.js');
const { createServer, readPlan } = require('./server.cjs');
const { createAttemptEngine } = require('./engine/attempts.js');
const { spawnWorker, isProcessAlive, killWorker, askOrchestrator, abortAsk } = require('./engine/runner.cjs');

const root = __dirname;
const defaultPlan = path.join(root, 'plan.json');

function attemptsDirFor(planFile) {
  return path.join(path.dirname(planFile), `.attempts-${path.basename(planFile, path.extname(planFile))}`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    command: null,
    planFile: process.env.PLANWHARF_PLAN || defaultPlan,
    attemptsDir: process.env.PLANWHARF_ATTEMPTS || null,
    noWindow: process.env.PLANWHARF_NO_WINDOW === '1',
    port: Number(process.env.PORT || 4173),
    portExplicit: Boolean(process.env.PORT)
  };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === 'status' || token === 'projects') opts.command = token;
    else if (token === 'ask') {
      opts.command = 'ask';
      opts.question = args.slice(i + 1).join(' ').trim();
      break;
    }
    else if (token === '--no-window') opts.noWindow = true;
    else if (token === '--plan') opts.planFile = path.resolve(args[++i] || '');
    else if (token === '--attempts-dir') opts.attemptsDir = path.resolve(args[++i] || '');
    else if (token === '--port') {
      opts.port = Number(args[++i]);
      opts.portExplicit = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  if (!opts.attemptsDir) opts.attemptsDir = attemptsDirFor(opts.planFile);
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    throw new Error('PORT must be an integer from 0 to 65535.');
  }
  return opts;
}

function notebookProjects(plan) {
  return plan.schema === 2 ? plan.projects : [plan];
}

function loadAttempts(dir) {
  const file = path.join(dir, 'attempts.json');
  if (!fs.existsSync(file)) return [];
  return createAttemptEngine({ dir }).getAttempts();
}

function formatProjects(plan) {
  return notebookProjects(plan).map(item => `${item.project.id}\t${item.project.name}`).join('\n') + '\n';
}

function formatStatus(plan, attempts) {
  const lines = [];
  const projects = notebookProjects(plan);
  lines.push(`Projects: ${projects.length}`);
  for (const item of projects) {
    const current = item.revisions.at(-1);
    const running = item.tasks.filter(task => task.status === 'running');
    const runningText = running.length ? running.map(task => task.id).join(', ') : 'none';
    const active = attempts.find(attempt => attempt.status === 'active' && attempt.projectId === item.project.id);
    const attemptText = active ? `${active.id} (${active.modelId})` : 'none';
    lines.push(`${item.project.id}\t${item.project.name}\tR${current.id} ${current.mode}\trunning: ${runningText}\tattempt: ${attemptText}`);
  }
  return lines.join('\n') + '\n';
}

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

function findBrowser() {
  const homeApps = path.join(os.homedir(), 'Applications');
  const candidates = [
    process.env.PLANWHARF_BROWSER,
    process.env.PLANWHARF_EDGE,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    path.join(homeApps, 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    path.join(homeApps, 'Google Chrome.app/Contents/MacOS/Google Chrome')
  ].filter(Boolean);
  const found = candidates.find(file => {
    try { return fs.existsSync(file); } catch (_) { return false; }
  });
  if (found) return found;
  for (const cmd of ['msedge', 'microsoft-edge', 'microsoft-edge-stable', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser']) {
    const resolved = which(cmd);
    if (resolved) return resolved;
  }
  return null;
}
function findEdge() { return findBrowser(); }

function listen(opts) {
  let watchChild = null;
  const openWatchWindow = watchUrl => {
    if (watchChild && watchChild.exitCode == null && !watchChild.killed) return watchChild;
    watchChild = openWindow(watchUrl, path.join(root, '.planwharf-watch'));
    if (watchChild) watchChild.on('exit', () => { watchChild = null; });
    return watchChild;
  };
  const server = createServer({ planFile: opts.planFile, attemptsDir: opts.attemptsDir, syncSkills: true, spawnWorker, isProcessAlive, killWorker, askModel: askOrchestrator, abortAsk, openWatchWindow });
  server.on('close', () => {
    if (watchChild && !watchChild.killed) {
      try { watchChild.kill(); } catch (_) {}
    }
  });
  const start = opts.port;
  const last = opts.portExplicit && start !== 0 ? start : (start === 0 ? 0 : start + 20);
  return new Promise((resolve, reject) => {
    const tryPort = port => {
      const onError = error => {
        server.removeListener('listening', onListening);
        if (error.code === 'EADDRINUSE' && !opts.portExplicit && port !== 0 && port < last) {
          tryPort(port + 1);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        const address = server.address();
        resolve({ server, port: address.port, url: `http://127.0.0.1:${address.port}` });
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    };
    tryPort(start);
  });
}

function openWindow(url, profileDir) {
  const browser = findBrowser();
  if (!browser) return null;
  fs.mkdirSync(profileDir, { recursive: true });
  const opts = { stdio: 'ignore' };
  if (process.platform === 'win32') opts.windowsHide = false;
  return spawn(browser, ['--app=' + url, `--user-data-dir=${profileDir}`], opts);
}

async function runCli(opts) {
  if (opts.command === 'ask') {
    if (!opts.question) throw new Error('ask needs a question.');
    const origin = `http://127.0.0.1:${opts.port}`;
    const response = await fetch(origin + '/api/orchestrator/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ question: opts.question })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Ask failed. Start Planwharf first.');
    process.stdout.write((body.answer || '') + '\n');
    return;
  }
  const plan = await readPlan(opts.planFile);
  const attempts = loadAttempts(opts.attemptsDir);
  if (opts.command === 'projects') process.stdout.write(formatProjects(plan));
  else process.stdout.write(formatStatus(plan, attempts));
}

async function runApp(opts) {
  await readPlan(opts.planFile);
  const { server, url } = await listen(opts);
  const profileDir = path.join(root, '.planwharf-window');
  let child = null;
  const shutdown = () => {
    if (child && !child.killed) child.kill();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  if (!opts.noWindow) {
    child = openWindow(url, profileDir);
    if (child) {
      child.on('exit', () => shutdown());
      console.log(`Planwharf\nWindow: browser --app\n${url}\nPlan: ${opts.planFile}\nCtrl+C to close.`);
    } else {
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      }
      console.log(`Planwharf\nNo Chromium browser found. Open ${url}\nPlan: ${opts.planFile}\nCtrl+C to close.`);
    }
  } else {
    console.log(`Planwharf\n${url}\nPlan: ${opts.planFile}\nCtrl+C to close.`);
  }
  return { server, url, child };
}

async function main(argv = process.argv) {
  const opts = parseArgs(argv);
  if (opts.command) return runCli(opts);
  return runApp(opts);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  attemptsDirFor,
  formatProjects,
  formatStatus,
  loadAttempts,
  findEdge,
  findBrowser,
  listen,
  main
};
