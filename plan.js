(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Planwharf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const fields = ['direction', 'state', 'closed', 'open'];
  function example() {
    return {
      schema: 1,
      project: { id: 'biblioteca', name: 'Biblioteca di quartiere' },
      revisions: [
        { id: 1, mode: 'manual', title: 'Il punto di partenza', createdAt: '2026-10-06T09:00:00+02:00', direction: 'Aprire una piccola biblioteca di quartiere, accessibile a tutti.', state: 'Individuati due locali possibili. Raccolta iniziale: 120 libri donati.', closed: ['Prestito gratuito per i residenti.', 'Partire con una sola sede.'], open: ['Quale locale scegliamo?', 'Chi segue il primo turno di apertura?'] },
        { id: 2, mode: 'manual', title: 'Una sede, un primo passo', createdAt: '2026-10-07T10:30:00+02:00', direction: 'Aprire la biblioteca in via del Porto, con un primo mese di prova.', state: 'Scelta la sede di via del Porto. Catalogati 120 libri. Il calendario di prova è in preparazione.', closed: ['Prestito gratuito per i residenti.', 'Partire con una sola sede.', 'Usare il locale di via del Porto.'], open: ['Chi segue il primo turno di apertura?', 'Confermiamo l’apertura il sabato mattina?'] }
      ],
      tasks: [{ id: 'calendario', projectId: 'biblioteca', revision_id: 2, title: 'Preparare il calendario del mese di prova', detail: 'Definire quattro turni e raccogliere la disponibilità dei volontari.', status: 'running' }]
    };
  }
  function validateProject(data) {
    if (!data || data.schema !== 1 || typeof data.project?.id !== 'string' || !data.project.id.trim() || typeof data.project.name !== 'string' || !data.project.name.trim() || !Array.isArray(data.revisions) || !data.revisions.length || !Array.isArray(data.tasks)) return false;
    const ids = new Set();
    for (const r of data.revisions) {
      if (!r || !Number.isSafeInteger(r.id) || r.id < 1 || ids.has(r.id) || !['manual', 'grill', 'import'].includes(r.mode) || typeof r.title !== 'string' || !r.title.trim() || typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt)) || typeof r.direction !== 'string' || typeof r.state !== 'string' || !Array.isArray(r.closed) || !Array.isArray(r.open) || ![...r.closed, ...r.open].every(x => typeof x === 'string')) return false;
      ids.add(r.id);
    }
    const activeProjects = new Set();
    const taskIds = new Set();
    for (const t of data.tasks) {
      if (!t || typeof t.id !== 'string' || !t.id.trim() || taskIds.has(t.id) || t.projectId !== data.project.id || !Number.isSafeInteger(t.revision_id) || !ids.has(t.revision_id) || typeof t.title !== 'string' || typeof t.detail !== 'string' || typeof t.status !== 'string') return false;
      taskIds.add(t.id);
      if (t.status === 'running') { if (activeProjects.has(t.projectId)) return false; activeProjects.add(t.projectId); }
    }
    return true;
  }
  function validate(data) {
    if (data?.schema === 1) return validateProject(data);
    if (!data || data.schema !== 2 || !Array.isArray(data.projects) || !data.projects.length) return false;
    const ids = new Set();
    return data.projects.every(project => {
      if (!validateProject(project) || ids.has(project.project.id)) return false;
      ids.add(project.project.id);
      return true;
    });
  }
  function append(data, draft, mode, timestamp = new Date().toISOString()) {
    if (!validateProject(data)) throw new Error('Il quaderno salvato non è valido.');
    if (!draft || !['title', 'direction', 'state'].every(key => typeof draft[key] === 'string' && draft[key].trim()) || !Array.isArray(draft.closed) || !Array.isArray(draft.open) || ![...draft.closed, ...draft.open].every(x => typeof x === 'string')) throw new Error('Compila titolo, direzione e stato dell’arte.');
    const next = clone(data);
    const revision = { id: Math.max(...data.revisions.map(r => r.id)) + 1, mode, title: draft.title.trim(), createdAt: timestamp, direction: draft.direction.trim(), state: draft.state.trim(), closed: draft.closed.map(x => x.trim()).filter(Boolean), open: draft.open.map(x => x.trim()).filter(Boolean) };
    next.revisions.push(revision);
    if (!validate(next)) throw new Error('La nuova revisione non è valida.');
    return next;
  }
  function appendRevision(data, draft, timestamp) { return append(data, draft, 'manual', timestamp); }
  function grill(data, round, timestamp) {
    if (!validateProject(data)) throw new Error('Il quaderno salvato non è valido.');
    const latest = data.revisions.at(-1);
    if (!round || typeof round.title !== 'string' || !round.title.trim() || !Array.isArray(round.answers) || round.answers.length !== latest.open.length || !latest.open.length) throw new Error('Rispondi alle domande aperte della revisione corrente.');
    const draft = clone(latest);
    draft.title = round.title;
    draft.open = [];
    let directionChanges = 0;
    const responses = [];
    for (let i = 0; i < latest.open.length; i++) {
      const response = round.answers[i];
      if (!response || response.question !== latest.open[i] || !['keep', 'close', 'direction'].includes(response.action) || typeof response.answer !== 'string' || (response.action !== 'keep' && !response.answer.trim())) throw new Error('Ogni risposta deve indicare la domanda corrente e una scelta valida.');
      const answer = response.answer.trim();
      responses.push({ question: response.question, action: response.action, answer });
      if (response.action === 'keep') draft.open.push(response.question);
      else {
        draft.closed.push(`${response.question} → ${answer}`);
        if (response.action === 'direction') {
          if (++directionChanges > 1) throw new Error('Scegli una sola nuova direzione per giro.');
          draft.direction = answer;
        }
      }
    }
    const next = append(data, draft, 'grill', timestamp);
    next.revisions.at(-1).responses = responses;
    return next;
  }
  function importRevision(data, json, timestamp) {
    let draft;
    try { draft = JSON.parse(json); } catch { throw new Error('JSON di importazione non valido.'); }
    if (!draft || typeof draft !== 'object' || Array.isArray(draft) || Object.keys(draft).some(key => !['id', 'mode', 'createdAt', 'title', 'direction', 'state', 'closed', 'open'].includes(key)) || ('id' in draft && (!Number.isSafeInteger(draft.id) || draft.id < 1)) || ('mode' in draft && !['manual', 'grill', 'import'].includes(draft.mode)) || ('createdAt' in draft && (typeof draft.createdAt !== 'string' || !Number.isFinite(Date.parse(draft.createdAt))))) throw new Error('Importa un oggetto con titolo, direzione, stato, decisioni chiuse e domande aperte.');
    return append(data, draft, 'import', timestamp);
  }
  function createTask(data, input) {
    if (!validateProject(data)) throw new Error('Il quaderno salvato non è valido.');
    if (data.tasks.some(task => task.status === 'running')) throw new Error('Questo progetto ha già un task in corso. Nessun secondo task è stato creato.');
    if (!input || !Number.isSafeInteger(input.revision_id) || !data.revisions.some(r => r.id === input.revision_id) || typeof input.title !== 'string' || !input.title.trim() || typeof input.detail !== 'string') throw new Error('Il task richiede titolo e una revisione esistente.');
    const next = clone(data);
    let counter = 1;
    while (next.tasks.some(task => task.id === `task-${counter}`)) counter++;
    next.tasks.push({ id: `task-${counter}`, projectId: data.project.id, revision_id: input.revision_id, title: input.title.trim(), detail: input.detail.trim(), status: 'running' });
    return next;
  }
  function diff(previous, current) {
    const changes = fields.filter(key => JSON.stringify(previous?.[key]) !== JSON.stringify(current[key])).map(key => ({ key, before: previous?.[key], after: current[key] }));
    const normalize = value => value.trim().toLocaleLowerCase('it-IT');
    const reopened = (previous?.closed || []).filter(decision => current.open.some(question => normalize(question) === normalize(decision)));
    if (reopened.length) changes.push({ key: 'reopened', before: [], after: reopened });
    return changes;
  }
  return { example, validate, validateProject, appendRevision, grill, importRevision, createTask, diff };
});
