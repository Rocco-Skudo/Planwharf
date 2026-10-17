'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function candidates(kind, env = process.env, platform = process.platform) {
  if (!['edge', 'chrome'].includes(kind)) throw Error('BROWSER_UNSUPPORTED: choose edge or chrome');
  const explicit = env.PLANWHARF_BROWSER_PATH || env.PLANWHARF_TEST_BROWSER;
  if (explicit) return [path.resolve(explicit)];
  const names = kind === 'edge' ? ['msedge', 'microsoft-edge', 'microsoft-edge-stable'] : ['chrome', 'google-chrome', 'google-chrome-stable'];
  const locations = platform === 'win32'
    ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).map(base => path.join(base, kind === 'edge' ? 'Microsoft/Edge/Application/msedge.exe' : 'Google/Chrome/Application/chrome.exe'))
    : platform === 'darwin' ? [kind === 'edge' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : kind === 'edge' ? ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge'] : ['/opt/google/chrome/chrome', '/usr/bin/google-chrome'];
  for (const base of (env.PATH || '').split(platform === 'win32' ? ';' : ':').filter(Boolean)) for (const name of names) locations.push(path.join(base, name + (platform === 'win32' ? '.exe' : '')));
  return [...new Set(locations)];
}
function discover(kind = process.env.PLANWHARF_BROWSER || 'edge', env = process.env) {
  const executable = candidates(kind, env).find(file => { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; } });
  if (!executable) throw Error(`BROWSER_MISSING: ${kind}; install it or set PLANWHARF_BROWSER_PATH to an executable`);
  const basename = path.basename(executable).toLowerCase();
  const detectedKind = /msedge|microsoft-edge/.test(basename) ? 'edge' : /chrome/.test(basename) ? 'chrome' : kind;
  return { kind: detectedKind, executable, version: 'unavailable until DevTools starts' };
}
async function launch(options = {}) {
  const detected = discover(options.kind);
  const timeout = options.timeout ?? 10000;
  if (!Number.isFinite(timeout) || timeout < 100 || timeout > 60000) throw Error('Invalid browser startup timeout');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-browser-'));
  const child = spawn(detected.executable, ['--headless=new', '--disable-extensions', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '', spawnError;
  child.stdout.resume();
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
  child.on('error', error => { spawnError = error; });
  async function close() {
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: 3000, windowsHide: true, stdio: 'ignore' });
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
      for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await pause(100);
      if (child.exitCode === null && child.signalCode === null) { if (process.platform === 'win32') child.kill('SIGKILL'); else { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } } }
      await Promise.race([new Promise(resolve => child.once('close', resolve)), pause(1000)]);
    }
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  try {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) break;
      try {
        const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
        if (port > 0 && port < 65536) {
          const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(Math.min(1000, timeout)) });
          const page = (await response.json()).find(item => item.type === 'page');
          if (page?.webSocketDebuggerUrl) {
            let version = 'unavailable';
            try { const metadata = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) })).json(); version = String(metadata.Browser || 'unavailable').slice(0, 160); } catch {}
            return { ...detected, version, child, profile, page, close, startupLog: () => stderr };
          }
        }
      } catch {}
      await pause(100);
    }
    throw Error(`BROWSER_STARTUP_FAILED: ${detected.kind} ${detected.version}; ${spawnError?.message || stderr || 'DevTools timeout'}`);
  } catch (error) { await close(); throw error; }
}
async function connect(browser) {
  const ws = new WebSocket(browser.page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { const timer = setTimeout(() => { ws.close(); reject(Error('BROWSER_CONNECTION_FAILED: timeout')); }, 5000); ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true }); ws.addEventListener('error', () => { clearTimeout(timer); reject(Error('BROWSER_CONNECTION_FAILED')); }, { once: true }); });
  const pending = new Map(), consoleFailures = []; let sequence = 0;
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown' || (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error')) consoleFailures.push(data);
    const item = pending.get(data.id);
    if (item) { clearTimeout(item.timer); pending.delete(data.id); data.error ? item.reject(Error(data.error.message)) : item.resolve(data.result); }
  });
  ws.addEventListener('close', () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('Browser disconnected')); } pending.clear(); });
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error(`APPLICATION_CHECK_TIMEOUT: ${method}`)); }, 10000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
  await command('Runtime.enable');
  return { command, consoleFailures, close: () => ws.close() };
}
if (require.main === module) (async () => { let browser, session; try { browser = await launch(); session = await connect(browser); console.log(JSON.stringify({ kind: browser.kind, version: browser.version, result: 'PASS: real blank-page startup only' })); } finally { session?.close(); await browser?.close(); } })().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { candidates, discover, launch, connect };
