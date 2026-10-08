const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Plan = require('./plan.js');
const original = Plan.example();
const originalSnapshot = JSON.stringify(original);
assert.equal(Plan.validate(original), true);
assert.equal(original.revisions.length, 2);
assert.ok(Plan.diff(original.revisions[0], original.revisions[1]).length > 0);
const draft = { ...original.revisions[1], title: 'Turni confermati', state: 'Calendario completato; quattro volontari confermati.', closed: [...original.revisions[1].closed, 'Apertura il sabato mattina.'], open: ['Chi segue il primo turno di apertura?'] };
const updated = Plan.appendRevision(original, draft, '2026-10-08T08:00:00Z');
assert.equal(updated.revisions.length, 3);
assert.equal(updated.revisions[2].id, 3);
assert.equal(updated.revisions[2].mode, 'manual');
assert.deepEqual(updated.tasks, original.tasks);
assert.equal(updated.tasks[0].revision_id, 2);
assert.deepEqual(updated.revisions.slice(0, 2), original.revisions);
assert.equal(JSON.stringify(original), originalSnapshot);
draft.closed.push('Modifica esterna');
assert.equal(updated.revisions[2].closed.includes('Modifica esterna'), false);
const restored = JSON.parse(JSON.stringify(updated));
assert.equal(Plan.validate(restored), true);
assert.deepEqual(restored.revisions, updated.revisions);
const duplicateTask = Plan.example();
duplicateTask.tasks.push({ ...duplicateTask.tasks[0], id: 'secondo-task' });
assert.equal(Plan.validate(duplicateTask), false);
assert.throws(() => Plan.appendRevision(original, { ...draft, title: '  ' }));
const invalidHistory = Plan.example();
invalidHistory.revisions[1].id = 1;
assert.equal(Plan.validate(invalidHistory), false);
const fourth = Plan.appendRevision(restored, { ...restored.revisions[2], title: 'Controllo finale' });
assert.equal(fourth.revisions[3].id, 4);
assert.deepEqual(fourth.revisions.slice(0, 3), restored.revisions);
assert.equal(Plan.validate(JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8'))), true);
const second = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/second-project.json'), 'utf8'));
assert.equal(Plan.validate(second), true);
const secondNext = Plan.appendRevision(second, { ...second.revisions[0], title: 'Turni raccolti' });
assert.deepEqual(secondNext.revisions[0], second.revisions[0]);
assert.equal(secondNext.revisions[1].mode, 'manual');
assert.equal(secondNext.tasks[0].revision_id, 1);
for (const mode of ['manual', 'grill', 'import']) {
  const candidate = Plan.example();
  candidate.revisions[0].mode = mode;
  assert.equal(Plan.validate(candidate), true);
}
for (const mode of [undefined, 'chat', '', null]) {
  const candidate = Plan.example();
  candidate.revisions[0].mode = mode;
  assert.equal(Plan.validate(candidate), false);
}
for (const revision_id of [undefined, null, 0, 3, '2']) {
  const candidate = Plan.example();
  candidate.tasks[0].revision_id = revision_id;
  assert.equal(Plan.validate(candidate), false);
}
const wrongProject = Plan.example();
wrongProject.tasks[0].projectId = 'altro';
assert.equal(Plan.validate(wrongProject), false);
assert.equal(Plan.validate({ ...original, project: { id: '', name: 'Vuoto' } }), false);
assert.equal(Plan.appendRevision(original, { ...draft, mode: 'grill' }).revisions[2].mode, 'manual');
console.log('OK: due progetti, tre modi ammessi, task legati a revisioni esistenti, append manual immutabile e task R2 conservato.');
