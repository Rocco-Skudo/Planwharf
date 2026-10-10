'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Plan = require('./plan.js');
const { createAttemptEngine } = require('./engine/attempts.js');
const { createSentinel } = require('./engine/sentinel.js');
const { createOrchestrator } = require('./engine/orchestrator.js');
const { createSkillsCache } = require('./engine/skills.js');
const { fetchPlanUsage } = require('./engine/planUsage.js');
const defaultModels = require('./models.json');

const version = plan => crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function readPlan(file) {
  const plan = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!Plan.validate(plan)) throw new Error('Il file del piano non è valido.');
  return plan;
}
async function writePlan(file, plan) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx');
    await handle.writeFile(JSON.stringify(plan, null, 2) + '\n', 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, file);
  } finally {
    if (handle) await handle.close();
    await fs.rm(temporary, { force: true });
  }
}
async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new RequestError(413, 'Revisione troppo grande.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, 'Richiesta non leggibile.'); }
}
function defaultOpenFolder(folder) {
  const opts = { detached: true, stdio: 'ignore' };
  if (process.platform === 'win32') spawn('explorer.exe', [folder], opts).unref();
  else if (process.platform === 'darwin') spawn('open', [folder], opts).unref();
  else spawn('xdg-open', [folder], opts).unref();
}
function defaultOpenUrl(url) {
  if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}
async function assertFolder(folder) {
  if (!folder) return;
  let st;
  try { st = await fs.stat(folder); } catch { throw new RequestError(400, 'Cartella non trovata.'); }
  if (!st.isDirectory()) throw new RequestError(400, 'Cartella non trovata.');
}
function createServer({ planFile = path.join(__dirname, 'plan.json'), save = writePlan, attemptsDir, openFolder = defaultOpenFolder, openUrl = defaultOpenUrl, models = defaultModels, inspectFolder, skills, fetchSkills, syncSkills, spawnWorker, isProcessAlive, killWorker, askModel, abortAsk, openWatchWindow } = {}) {
  let queue = Promise.resolve();
  const enqueue = work => {
    const pending = queue.then(work);
    queue = pending.catch(() => {});
    return pending;
  };
  const storeDir = attemptsDir || path.join(path.dirname(planFile), `.attempts-${path.basename(planFile, path.extname(planFile))}`);
  const attempts = createAttemptEngine({ dir: storeDir });
  let orchestra;
  const sentinel = createSentinel(attempts, {
    isAlive: attempt => {
      if (typeof spawnWorker === 'function' && typeof isProcessAlive === 'function') {
        const pid = orchestra && typeof orchestra.pidFor === 'function' ? orchestra.pidFor(attempt) : null;
        if (Number.isInteger(pid) && pid > 0) return Boolean(isProcessAlive(pid));
        return false;
      }
      return Boolean(attempt && attempt.status === 'active');
    }
  });
  const skillsCache = skills || createSkillsCache({ dir: path.join(storeDir, 'matt-skills'), fetchImpl: fetchSkills });
  orchestra = createOrchestrator({
    readPlan: () => readPlan(planFile),
    attempts,
    sentinel,
    models,
    dir: storeDir,
    inspectFolder,
    spawnWorker,
    isProcessAlive,
    killWorker,
    askModel,
    abortAsk,
    fetchPlans: fetchPlanUsage,
    readSkill: relative => (typeof skillsCache.read === 'function' ? skillsCache.read(relative) : ''),
    applyStart: (projectId, options) => enqueue(async () => {
      const current = await readPlan(planFile);
      return executeStart(current, projectId, options);
    }),
    applySkip: projectId => enqueue(async () => {
      const current = await readPlan(planFile);
      return executeSkip(current, projectId);
    })
  });
  async function executeSkip(current, projectId) {
    const project = current.schema === 2 ? current.projects.find(item => item.project.id === projectId) : current;
    if (!project || (current.schema === 1 && projectId !== project.project.id)) return { ok: false, reason: 'project not found' };
    const latest = project.revisions.at(-1);
    let next = current;
    if (latest && Array.isArray(latest.open) && latest.open.length) {
      const draft = {
        title: 'Skip grill',
        direction: latest.direction,
        state: (latest.state && latest.state.trim()) ? latest.state : 'Skipped grill so Auto start can plan.',
        closed: Array.isArray(latest.closed) ? latest.closed : [],
        open: []
      };
      const updated = Plan.appendRevision(project, draft);
      next = current.schema === 2 ? { ...current, projects: current.projects.map(item => item.project.id === project.project.id ? updated : item) } : updated;
      if (!Plan.validate(next)) return { ok: false, reason: 'Il quaderno aggiornato non è valido.' };
      await save(planFile, next);
    }
    const result = await orchestra.skipGrill(projectId);
    if (!result.ok) return { ok: false, reason: result.reason || 'failed' };
    return { ok: true, plan: next, version: version(next), snapshot: result.snapshot };
  }
  async function executeStart(current, projectId, options) {
    const prepared = await orchestra.startAutoTask(projectId, options || { timing: 'discretion' });
    if (!prepared.ok) return prepared;
    let project = current.schema === 2 ? current.projects.find(item => item.project.id === projectId) : current;
    if (!project || (current.schema === 1 && projectId !== project.project.id)) return { ok: false, reason: 'project not found' };
    let updated = project;
    try {
      if (prepared.clearJob) {
        const running = (updated.tasks || []).find(task => task.status === 'running');
        if (running) updated = Plan.removeTask(updated, { id: running.id });
      }
      if (Array.isArray(prepared.questions) && prepared.questions.length) {
        const ctx = { questions: prepared.questions, replace: Boolean(prepared.replace) };
        const grilled = prepared.kind === 'docs'
          ? Plan.startGrillDocs(updated, orchestra.docsFor(updated.project.folder), undefined, ctx)
          : Plan.startGrill(updated, undefined, ctx);
        if (grilled !== updated) updated = grilled;
      }
      if (prepared.job) updated = Plan.createTask(updated, prepared.job);
    } catch (error) {
      return { ok: false, reason: error.message };
    }
    if (updated === project) {
      const snapshot = await orchestra.tick();
      return { ok: true, plan: current, version: version(current), snapshot, phase: prepared.phase || 'grill' };
    }
    const next = current.schema === 2 ? { ...current, projects: current.projects.map(item => item.project.id === project.project.id ? updated : item) } : updated;
    if (!Plan.validate(next)) return { ok: false, reason: 'Il quaderno aggiornato non è valido.' };
    await save(planFile, next);
    const snapshot = await orchestra.tick();
    return { ok: true, plan: next, version: version(next), snapshot, phase: prepared.phase || (prepared.job ? 'plan' : 'grill') };
  }
  if (syncSkills) {
    Promise.resolve().then(() => skillsCache.ensure()).catch(() => {});
  }
  const staticFiles = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/orchestrator.html': ['orchestrator.html', 'text/html'], '/orch.js': ['orch.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'], '/plan.js': ['plan.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/models.js': ['models.js', 'text/javascript'], '/models.json': ['models.json', 'application/json'], '/engine/claims.js': ['engine/claims.js', 'text/javascript'], '/engine/attempts.js': ['engine/attempts.js', 'text/javascript'], '/engine/sentinel.js': ['engine/sentinel.js', 'text/javascript'] };
  return http.createServer(async (request, response) => {
    const json = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    };
    try {
      const expectedHost = `127.0.0.1:${request.socket.localPort}`;
      if (request.headers.host !== expectedHost || (request.headers.origin && request.headers.origin !== `http://${expectedHost}`)) throw new RequestError(403, 'Apri la schermata dal suo indirizzo locale.');
      const loc = new URL(request.url, `http://${expectedHost}`);
      const pathname = loc.pathname;
      if (request.method === 'GET' && pathname === '/' && (loc.searchParams.get('watch') === '1' || loc.searchParams.get('view') === 'watch')) {
        response.writeHead(302, { Location: '/orchestrator.html' });
        response.end();
        return;
      }
      if (request.method === 'GET' && pathname === '/api/plan') {
        const plan = await readPlan(planFile);
        return json(200, { plan, version: version(plan) });
      }
      if (request.method === 'GET' && pathname === '/api/attempts') {
        return json(200, { attempts: attempts.getAttempts() });
      }
      if (request.method === 'GET' && pathname === '/api/orchestrator') {
        const snapshot = await orchestra.tick();
        snapshot.skills = skillsCache.snapshot();
        return json(200, snapshot);
      }
      if (request.method === 'GET' && pathname === '/api/skills') {
        return json(200, skillsCache.snapshot());
      }
      if (request.method === 'POST' && pathname === '/api/skills') {
        const snapshot = await skillsCache.ensure();
        return json(200, snapshot);
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/lead') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || Object.keys(input).some(key => key !== 'id') || (input.id != null && typeof input.id !== 'string')) throw new RequestError(400, 'Dati non validi.');
        const result = await orchestra.setOrchestrator(input.id || '');
        if (!result.ok) throw new RequestError(400, result.reason || 'Dati non validi.');
        return json(200, result.snapshot);
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/ask/cancel') {
        return json(200, await orchestra.abortAsk());
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/ask') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.question !== 'string' || Object.keys(input).some(key => !['question', 'projectId'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const asked = await orchestra.ask(input.question, typeof input.projectId === 'string' ? input.projectId : undefined);
        if (!asked.ok) throw new RequestError(400, asked.reason || 'Dati non validi.');
        return json(200, asked);
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/mode') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || (input.mode !== 'auto' && input.mode !== 'manual') || Object.keys(input).some(key => key !== 'mode')) throw new RequestError(400, 'Dati non validi.');
        return json(200, await orchestra.setMode(input.mode));
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/grill') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (input && typeof input.propose === 'boolean' && Object.keys(input).every(key => key === 'propose')) {
          return json(200, await orchestra.setGrillPropose(input.propose));
        }
        if (input && typeof input.projectId === 'string' && input.skip === true && Object.keys(input).every(key => ['projectId', 'skip', 'version'].includes(key))) {
          const skipped = await enqueue(async () => {
            const current = await readPlan(planFile);
            if (input.version && input.version !== version(current)) throw new RequestError(409, 'Il piano è cambiato. Ricarica la pagina prima di salvare.');
            const result = await executeSkip(current, input.projectId);
            if (!result.ok) throw new RequestError(400, result.reason || 'Dati non validi.');
            return { plan: result.plan, version: result.version, snapshot: result.snapshot };
          });
          return json(200, skipped);
        }
        throw new RequestError(400, 'Dati non validi.');
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/model') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.id !== 'string' || typeof input.enabled !== 'boolean' || Object.keys(input).some(key => !['id', 'enabled'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const result = await orchestra.setModelEnabled(input.id, input.enabled);
        if (!result.ok) throw new RequestError(400, result.reason || 'Dati non validi.');
        return json(200, result.snapshot);
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/approve') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.projectId !== 'string' || Object.keys(input).some(key => key !== 'projectId')) throw new RequestError(400, 'Dati non validi.');
        const result = await orchestra.approve(input.projectId);
        if (!result.ok) throw new RequestError(400, result.reason || 'Dati non validi.');
        return json(200, result.snapshot);
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/resume') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.projectId !== 'string' || Object.keys(input).some(key => key !== 'projectId')) throw new RequestError(400, 'Dati non validi.');
        const result = await orchestra.resume(input.projectId);
        if (!result.ok) throw new RequestError(400, result.reason || 'Dati non validi.');
        return json(200, result.snapshot);
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/stop') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.projectId !== 'string' || Object.keys(input).some(key => key !== 'projectId')) throw new RequestError(400, 'Dati non validi.');
        const result = await orchestra.stop(input.projectId);
        if (!result.ok) throw new RequestError(400, result.reason || 'Dati non validi.');
        return json(200, result.snapshot);
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/window') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (input && typeof input === 'object' && Object.keys(input).length) throw new RequestError(400, 'Dati non validi.');
        const watchUrl = `http://127.0.0.1:${request.socket.localPort}/orchestrator.html`;
        let opened = false;
        if (typeof openWatchWindow === 'function') {
          try {
            opened = Boolean(openWatchWindow(watchUrl));
          } catch (_) {
            opened = false;
          }
        }
        return json(200, { ok: true, url: watchUrl, opened });
      }
      if (request.method === 'POST' && pathname === '/api/orchestrator/start') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.version !== 'string' || typeof input.projectId !== 'string' || Object.keys(input).some(key => !['version', 'projectId', 'timing', 'deadlineAt'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const created = await enqueue(async () => {
          const current = await readPlan(planFile);
          if (input.version !== version(current)) throw new RequestError(409, 'Il piano è cambiato. Ricarica la pagina prima di salvare.');
          const result = await executeStart(current, input.projectId, { timing: input.timing, deadlineAt: input.deadlineAt });
          if (!result.ok) throw new RequestError(400, result.reason || 'Dati non validi.');
          return result;
        });
        return json(created.phase === 'plan' ? 201 : 200, created);
      }
      if (request.method === 'POST' && pathname === '/api/attempts') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        const result = attempts.claim(input);
        return json(result.ok ? 201 : 409, { ...result, attempts: attempts.getAttempts() });
      }
      if (request.method === 'POST' && pathname === '/api/projects') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.version !== 'string' || input.project === undefined || Object.keys(input).some(key => !['version', 'project'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        if (!input.project || typeof input.project !== 'object' || Array.isArray(input.project) || Object.keys(input.project).some(key => !['name', 'direction', 'folder', 'github'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const pending = queue.then(async () => {
          const current = await readPlan(planFile);
          if (input.version !== version(current)) throw new RequestError(409, 'Il piano è cambiato. Ricarica la pagina prima di salvare.');
          let next;
          try {
            next = Plan.createProject(current, input.project);
            if (!Plan.validate(next)) throw new Error('Il quaderno aggiornato non è valido.');
          } catch (error) { throw new RequestError(400, error.message); }
          await assertFolder(next.projects.at(-1).project.folder);
          await save(planFile, next);
          return { plan: next, version: version(next) };
        });
        queue = pending.catch(() => {});
        return json(201, await pending);
      }
      if (request.method === 'POST' && pathname === '/api/remove-project') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.version !== 'string' || typeof input.projectId !== 'string' || Object.keys(input).some(key => !['version', 'projectId'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const pending = queue.then(async () => {
          const current = await readPlan(planFile);
          if (input.version !== version(current)) throw new RequestError(409, 'Il piano è cambiato. Ricarica la pagina prima di salvare.');
          let next;
          try {
            next = Plan.removeProject(current, { id: input.projectId });
            if (!Plan.validate(next)) throw new Error('Il quaderno aggiornato non è valido.');
          } catch (error) { throw new RequestError(400, error.message); }
          for (const item of attempts.getAttempts()) {
            if (item.status === 'active' && item.projectId === input.projectId) attempts.closeAttempt({ attemptId: item.id, reason: 'removed' });
          }
          await save(planFile, next);
          return { plan: next, version: version(next) };
        });
        queue = pending.catch(() => {});
        return json(201, await pending);
      }
      if (request.method === 'POST' && pathname === '/api/remove-task') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.version !== 'string' || typeof input.projectId !== 'string' || !input.task || typeof input.task !== 'object' || Array.isArray(input.task) || Object.keys(input.task).some(key => key !== 'id') || Object.keys(input).some(key => !['version', 'projectId', 'task'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const pending = queue.then(async () => {
          const current = await readPlan(planFile);
          if (input.version !== version(current)) throw new RequestError(409, 'Il piano è cambiato. Ricarica la pagina prima di salvare.');
          const project = current.schema === 2 ? current.projects.find(item => item.project.id === input.projectId) : current;
          if (!project || (current.schema === 1 && input.projectId !== project.project.id)) throw new RequestError(400, 'Progetto non trovato.');
          let updated;
          try { updated = Plan.removeTask(project, input.task); }
          catch (error) { throw new RequestError(400, error.message); }
          const next = current.schema === 2 ? { ...current, projects: current.projects.map(item => item.project.id === project.project.id ? updated : item) } : updated;
          if (!Plan.validate(next)) throw new RequestError(400, 'Il quaderno aggiornato non è valido.');
          for (const item of attempts.getAttempts()) {
            if (item.status === 'active' && item.taskId === input.task.id) attempts.closeAttempt({ attemptId: item.id, reason: 'removed' });
          }
          await save(planFile, next);
          return { plan: next, version: version(next) };
        });
        queue = pending.catch(() => {});
        return json(201, await pending);
      }
      if (request.method === 'POST' && pathname === '/api/place') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.version !== 'string' || input.project === undefined || Object.keys(input).some(key => !['version', 'project'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        if (!input.project || typeof input.project !== 'object' || Array.isArray(input.project) || Object.keys(input.project).some(key => !['id', 'folder', 'github'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const pending = queue.then(async () => {
          const current = await readPlan(planFile);
          if (input.version !== version(current)) throw new RequestError(409, 'Il piano è cambiato. Ricarica la pagina prima di salvare.');
          let next;
          try {
            next = Plan.setPlace(current, input.project);
            if (!Plan.validate(next)) throw new Error('Il quaderno aggiornato non è valido.');
          } catch (error) { throw new RequestError(400, error.message); }
          const updated = next.schema === 2 ? next.projects.find(item => item.project.id === input.project.id) : next;
          await assertFolder(updated.project.folder);
          await save(planFile, next);
          return { plan: next, version: version(next) };
        });
        queue = pending.catch(() => {});
        return json(201, await pending);
      }
      if (request.method === 'POST' && pathname === '/api/open') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.projectId !== 'string' || !['folder', 'github'].includes(input.target) || Object.keys(input).some(key => !['projectId', 'target'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const current = await readPlan(planFile);
        const project = current.schema === 2 ? current.projects.find(item => item.project.id === input.projectId) : (current.project.id === input.projectId ? current : null);
        if (!project) throw new RequestError(400, 'Progetto non trovato.');
        if (input.target === 'folder') {
          if (!project.project.folder) throw new RequestError(400, 'Nessuna cartella per questo progetto.');
          await assertFolder(project.project.folder);
          openFolder(project.project.folder);
        } else {
          if (!project.project.github) throw new RequestError(400, 'Nessun GitHub per questo progetto.');
          if (!Plan.isGithubUrl(project.project.github)) throw new RequestError(400, 'GitHub deve essere un URL https://github.com/proprietario/repo.');
          openUrl(project.project.github);
        }
        return json(200, { ok: true });
      }
      if (request.method === 'POST' && pathname === '/api/grill-start') {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        if (!input || typeof input.version !== 'string' || typeof input.projectId !== 'string' || (input.kind !== undefined && input.kind !== 'me' && input.kind !== 'docs') || Object.keys(input).some(key => !['version', 'projectId', 'kind'].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const pending = queue.then(async () => {
          const current = await readPlan(planFile);
          if (input.version !== version(current)) throw new RequestError(409, 'Il piano è cambiato. Ricarica la pagina prima di salvare.');
          const project = current.schema === 2 ? current.projects.find(item => item.project.id === input.projectId) : current;
          if (!project || (current.schema === 1 && input.projectId !== project.project.id)) throw new RequestError(400, 'Progetto non trovato.');
          let updated;
          try {
            if (input.kind === 'docs') {
              if (!project.project.folder) throw new Error('no folder');
              const docs = orchestra.docsFor(project.project.folder);
              updated = Plan.startGrillDocs(project, docs, undefined, {
                name: project.project.name,
                goal: project.revisions.at(-1).direction,
                folder: project.project.folder
              });
            } else {
              updated = Plan.startGrill(project, undefined, {
                name: project.project.name,
                goal: project.revisions.at(-1).direction,
                folder: project.project.folder
              });
            }
          }
          catch (error) { throw new RequestError(400, error.message); }
          if (updated === project) return { plan: current, version: version(current) };
          const next = current.schema === 2 ? { ...current, projects: current.projects.map(item => item.project.id === project.project.id ? updated : item) } : updated;
          if (!Plan.validate(next)) throw new RequestError(400, 'Il quaderno aggiornato non è valido.');
          await save(planFile, next);
          return { plan: next, version: version(next) };
        });
        queue = pending.catch(() => {});
        return json(201, await pending);
      }
      if (request.method === 'POST' && ['/api/revisions', '/api/grill', '/api/import', '/api/tasks'].includes(pathname)) {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        const field = { '/api/revisions': 'draft', '/api/grill': 'round', '/api/import': 'json', '/api/tasks': 'task' }[pathname];
        if (!input || typeof input.version !== 'string' || input[field] === undefined || Object.keys(input).some(key => !['version', 'projectId', field].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const keys = { draft: ['title', 'direction', 'state', 'closed', 'open'], round: ['title', 'answers'], task: ['title', 'detail', 'revision_id', 'timing', 'deadlineAt'] };
        if (field !== 'json' && (!input[field] || typeof input[field] !== 'object' || Array.isArray(input[field]) || Object.keys(input[field]).some(key => !keys[field].includes(key)))) throw new RequestError(400, 'Dati non validi.');
        if (field === 'json' && typeof input.json !== 'string') throw new RequestError(400, 'JSON di importazione non valido.');
        // Serialize disk reads and writes: a second browser cannot replace history.
        const pending = queue.then(async () => {
          const current = await readPlan(planFile);
          if (input.version !== version(current)) throw new RequestError(409, 'Il piano è cambiato. Ricarica la pagina prima di salvare.');
          let next;
          try {
            const project = current.schema === 2 ? current.projects.find(p => p.project.id === input.projectId) : current;
            if (!project || (current.schema === 1 && input.projectId && input.projectId !== project.project.id)) throw new Error('Progetto non trovato.');
            const operations = { draft: Plan.appendRevision, round: Plan.grill, json: Plan.importRevision, task: Plan.createTask };
            const updated = operations[field](project, input[field]);
            next = current.schema === 2 ? { ...current, projects: current.projects.map(p => p.project.id === project.project.id ? updated : p) } : updated;
            if (!Plan.validate(next)) throw new Error('Il quaderno aggiornato non è valido.');
          }
          catch (error) { throw new RequestError(400, error.message); }
          await save(planFile, next);
          return { plan: next, version: version(next) };
        });
        queue = pending.catch(() => {});
        return json(201, await pending);
      }
      if (request.method === 'GET' && staticFiles[pathname]) {
        const [file, type] = staticFiles[pathname];
        const content = await fs.readFile(path.join(__dirname, file));
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
        return response.end(content);
      }
      throw new RequestError(404, 'Risorsa non disponibile.');
    } catch (error) {
      json(error.status || 500, { error: error.status ? error.message : 'Lettura o salvataggio del file non riuscito. Nessuna revisione è stata aggiunta.' });
    }
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT deve essere un numero da 1 a 65535.');
    process.exitCode = 1;
  } else {
    readPlan(path.join(__dirname, 'plan.json')).then(() => {
      const server = createServer({ syncSkills: true });
      server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `La porta ${port} è occupata. Scegli un altro PORT.` : `Server non avviato: ${error.message}`); process.exitCode = 1; });
      server.listen(port, '127.0.0.1', () => console.log(`Planwharf zombie: http://127.0.0.1:${port}\nPiano: ${path.join(__dirname, 'plan.json')}\nCtrl+C per chiudere.`));
    }).catch(error => { console.error(`Impossibile aprire plan.json: ${error.message}`); process.exitCode = 1; });
  }
}
module.exports = { createServer, readPlan, writePlan };
