'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const Plan = require('./plan.js');

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
function createServer({ planFile = path.join(__dirname, 'plan.json'), save = writePlan } = {}) {
  let queue = Promise.resolve();
  const staticFiles = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/plan.js': ['plan.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/models.js': ['models.js', 'text/javascript'], '/models.json': ['models.json', 'application/json'], '/engine/claims.js': ['engine/claims.js', 'text/javascript'], '/engine/attempts.js': ['engine/attempts.js', 'text/javascript'], '/engine/sentinel.js': ['engine/sentinel.js', 'text/javascript'] };
  return http.createServer(async (request, response) => {
    const json = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    };
    try {
      const expectedHost = `127.0.0.1:${request.socket.localPort}`;
      if (request.headers.host !== expectedHost || (request.headers.origin && request.headers.origin !== `http://${expectedHost}`)) throw new RequestError(403, 'Apri la schermata dal suo indirizzo locale.');
      const pathname = new URL(request.url, `http://${expectedHost}`).pathname;
      if (request.method === 'GET' && pathname === '/api/plan') {
        const plan = await readPlan(planFile);
        return json(200, { plan, version: version(plan) });
      }
      if (request.method === 'POST' && ['/api/revisions', '/api/grill', '/api/import', '/api/tasks'].includes(pathname)) {
        if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Usa JSON per la revisione.');
        const input = await body(request);
        const field = { '/api/revisions': 'draft', '/api/grill': 'round', '/api/import': 'json', '/api/tasks': 'task' }[pathname];
        if (!input || typeof input.version !== 'string' || input[field] === undefined || Object.keys(input).some(key => !['version', 'projectId', field].includes(key))) throw new RequestError(400, 'Dati non validi.');
        const keys = { draft: ['title', 'direction', 'state', 'closed', 'open'], round: ['title', 'answers'], task: ['title', 'detail', 'revision_id'] };
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
      const server = createServer();
      server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `La porta ${port} è occupata. Scegli un altro PORT.` : `Server non avviato: ${error.message}`); process.exitCode = 1; });
      server.listen(port, '127.0.0.1', () => console.log(`Planwharf zombie: http://127.0.0.1:${port}\nPiano: ${path.join(__dirname, 'plan.json')}\nCtrl+C per chiudere.`));
    }).catch(error => { console.error(`Impossibile aprire plan.json: ${error.message}`); process.exitCode = 1; });
  }
}
module.exports = { createServer, readPlan, writePlan };
