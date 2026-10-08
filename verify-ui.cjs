// Event/state harness; not a visual browser check. verify-round.cjs checks actual disk persistence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Planwharf = require('./plan.js');
const copy = value => JSON.parse(JSON.stringify(value));
const disk = { plan: JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8')), version: 'v1', failLoad: false, failSave: false };
const initial = copy(disk.plan);
const seenStore = new Map();
const flush = () => new Promise(resolve => setImmediate(resolve));
async function openApp() {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', hidden: true, disabled: true, listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; }, showModal() { this.open = true; }, close() { this.open = false; } });
    return nodes.get(id);
  }
  for (const [kind, fields] of Object.entries({ revision: ['title', 'direction', 'state', 'closed', 'open'], grill: ['title'], import: ['json'], task: ['title', 'detail'] })) {
    node(kind + '-form').elements = Object.fromEntries(fields.map(key => [key, { value: '' }]));
  }
  const context = vm.createContext({ Planwharf, document: { getElementById: node },
    localStorage: {
      getItem(key) {
        if (key === 'plan' || key === 'notebook') throw new Error('localStorage forbidden');
        return seenStore.get(key) || null;
      },
      setItem(key, value) {
        if (key === 'plan' || key === 'notebook') throw new Error('localStorage forbidden');
        seenStore.set(key, String(value));
      }
    },
    fetch: async (url, options) => {
      if (url === '/api/plan') return { ok: !disk.failLoad, json: async () => disk.failLoad ? { error: 'File non leggibile.' } : { plan: copy(disk.plan), version: disk.version } };
      const input = JSON.parse(options.body);
      assert.equal(input.version, disk.version);
      if (disk.failSave) return { ok: false, json: async () => ({ error: 'Disco non disponibile.' }) };
      try {
        const field = { '/api/revisions': 'draft', '/api/grill': 'round', '/api/import': 'json', '/api/tasks': 'task' }[url];
        const operation = { draft: Planwharf.appendRevision, round: Planwharf.grill, json: Planwharf.importRevision, task: Planwharf.createTask }[field];
        const project = disk.plan.projects.find(p => p.project.id === input.projectId);
        const next = operation(project, input[field]);
        disk.plan.projects = disk.plan.projects.map(p => p === project ? next : p);
        disk.version = 'v' + (Number(disk.version.slice(1)) + 1);
        return { ok: true, json: async () => ({ plan: copy(disk.plan), version: disk.version }) };
      } catch (error) { return { ok: false, json: async () => ({ error: error.message }) }; }
    }, FormData: class { constructor(form) { this.entries = Object.entries(form.elements).map(([key, field]) => [key, field.value]); } [Symbol.iterator]() { return this.entries[Symbol.iterator](); } }, setTimeout: () => 1, clearTimeout: () => {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), context);
  await flush();
  return { node, form: node('revision-form') };
}
const submit = form => form.listeners.submit({ preventDefault() {} });
const selectRevision = (app, id) => app.node('revision-select').listeners.change({ target: { value: String(id) } });
const selectProject = (app, id) => app.node('project-select').listeners.change({ target: { value: id } });
(async () => {
  const app = await openApp();
  assert.equal(app.node('revision-badge').textContent, 'R2 · manual · Attuale');
  assert.ok(app.node('changes-content').innerHTML.toLowerCase().includes('nessuna novità'));
  assert.equal(app.node('changes-content').innerHTML.includes('via del Porto'), false);
  assert.ok(app.node('project-select').innerHTML.includes('orto'));
  assert.ok(app.node('task-content').innerHTML.includes('IN CORSO · R2'));
  selectRevision(app, 1);
  app.node('new-revision').listeners.click();
  assert.ok(app.form.elements.state.value.includes('Scelta la sede'));
  app.form.elements.title.value = 'Turni confermati';
  app.form.elements.state.value = 'Quattro volontari confermati.';
  disk.failSave = true;
  await submit(app.form);
  assert.equal(app.node('revision-badge').textContent, 'R1 · manual · Storico');
  assert.equal(disk.plan.projects[0].revisions.length, 2);
  assert.equal(app.node('revision-dialog').open, true);
  assert.equal(app.node('form-error').hidden, false);
  assert.equal(app.node('toast').textContent, '');
  disk.failSave = false;
  await submit(app.form);
  assert.equal(app.node('revision-badge').textContent, 'R3 · manual · Attuale');
  assert.deepEqual(disk.plan.projects[0].revisions.slice(0, 2), initial.projects[0].revisions);
  assert.ok(app.node('changes-content').innerHTML.includes('Quattro volontari confermati'));
  selectRevision(app, 1);
  app.node('grill-open').listeners.click();
  const current = disk.plan.projects[0].revisions.at(-1);
  assert.ok(app.node('grill-context').textContent.includes('R3'));
  for (const question of current.open) assert.ok(app.node('grill-questions').innerHTML.includes(question));
  for (const decision of current.closed) assert.equal(app.node('grill-questions').innerHTML.includes(decision), false);
  assert.equal(app.node('grill-questions').innerHTML.includes('Quale locale scegliamo?'), false);
  const grillForm = app.node('grill-form');
  grillForm.elements['action-0'] = { value: 'close' };
  grillForm.elements['answer-0'] = { value: 'Il primo turno sarà di Marta.' };
  grillForm.elements['action-1'] = { value: 'direction' };
  grillForm.elements['answer-1'] = { value: 'Aprire la biblioteca due giorni a settimana.' };
  await submit(grillForm);
  assert.equal(app.node('revision-badge').textContent, 'R4 · grill · Attuale');
  assert.equal(app.node('waiting-count').textContent, '0 decisioni');
  assert.ok(app.node('changes-content').innerHTML.includes('Aprire la biblioteca due giorni'));
  assert.ok(app.node('task-content').innerHTML.includes('IN CORSO · R2'));
  selectProject(app, 'orto');
  assert.equal(app.node('revision-badge').textContent, 'R1 · import · Attuale');
  app.node('new-revision').listeners.click();
  app.form.elements.title.value = 'Un orto pronto';
  app.form.elements.state.value = 'Due vicini disponibili.';
  await submit(app.form);
  selectRevision(app, 1);
  app.node('new-task').listeners.click();
  assert.ok(app.node('task-context').textContent.includes('R1'));
  const taskForm = app.node('task-form');
  taskForm.elements.title.value = 'Definire irrigazione';
  await submit(taskForm);
  assert.equal(disk.plan.projects[1].tasks[0].revision_id, 1);
  assert.equal(app.node('revision-badge').textContent, 'R1 · import · Storico');
  app.node('new-task').listeners.click();
  taskForm.elements.title.value = 'Secondo task';
  const beforeSecond = JSON.stringify(disk.plan);
  await submit(taskForm);
  assert.equal(app.node('task-error').hidden, false);
  assert.ok(app.node('task-error').textContent.includes('già un task'));
  assert.equal(JSON.stringify(disk.plan), beforeSecond);
  app.node('task-cancel').listeners.click();
  app.node('import-revision').listeners.click();
  const importForm = app.node('import-form');
  importForm.elements.json.value = '{';
  await submit(importForm);
  assert.equal(app.node('import-error').hidden, false);
  assert.equal(JSON.stringify(disk.plan), beforeSecond);
  const lastOrto = disk.plan.projects[1].revisions.at(-1);
  const reopenedDecision = lastOrto.closed[0];
  importForm.elements.json.value = JSON.stringify({ title: 'Una decisione da rivedere', direction: 'Coltivare erbe aromatiche.', state: 'Confronto da riaprire.', closed: [], open: [reopenedDecision] });
  await submit(importForm);
  assert.equal(app.node('revision-badge').textContent, 'R3 · import · Attuale');
  assert.ok(app.node('changes-content').innerHTML.includes('Decisione riaperta esplicitamente'));
  assert.equal(disk.plan.projects[1].tasks[0].revision_id, 1);
  const reopened = await openApp();
  selectProject(reopened, 'orto');
  assert.equal(reopened.node('revision-badge').textContent, 'R3 · import · Attuale');
  assert.ok(reopened.node('changes-content').innerHTML.toLowerCase().includes('nessuna novità'));
  assert.ok(reopened.node('task-content').innerHTML.includes('IN CORSO · R1'));
  disk.failLoad = true;
  const unavailable = await openApp();
  assert.equal(unavailable.node('new-revision').disabled, true);
  assert.equal(unavailable.node('revision-badge').textContent, '');
  assert.equal(unavailable.node('storage-notice').textContent, 'File non leggibile.');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.equal((html.match(/<section class="card /g) || []).length, 4);
  for (const id of ['project-select', 'grill-dialog', 'import-dialog', 'task-dialog']) assert.ok(html.includes(`id="${id}"`));
  console.log('PASS: UI eventi, due progetti/quattro aree, manual corrente, grill solo domande correnti, cambio direzione, task storico, secondo running visibilmente rifiutato, import invalido intatto/valido, diff riapertura, reload API e errore save. Simulazione DOM; non verifica visiva.');
})().catch(error => { console.error(error); process.exitCode = 1; });