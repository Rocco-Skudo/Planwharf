'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Planwharf = require('./plan.js');

const copy = val => JSON.parse(JSON.stringify(val));
const flush = () => new Promise(resolve => setImmediate(resolve));

function createHarness({ initialPlan, initialStore = new Map() }) {
  const store = new Map(initialStore);
  const disk = { plan: copy(initialPlan), version: 'v1' };

  async function openApp() {
    const nodes = new Map();
    class MockNode {
      constructor() {
        this._innerHTML = '';
        this._textContent = '';
        this.hidden = true;
        this.disabled = true;
        this.listeners = {};
      }
      get innerHTML() { return this._innerHTML; }
      set innerHTML(val) {
        this._innerHTML = String(val);
        this._textContent = String(val).replace(/<[^>]*>/g, '');
      }
      get textContent() { return this._textContent; }
      set textContent(val) {
        this._textContent = String(val);
        this._innerHTML = String(val);
      }
      addEventListener(event, handler) { this.listeners[event] = handler; }
      showModal() { this.open = true; }
      close() { this.open = false; }
    }
    function node(id) {
      if (!nodes.has(id)) nodes.set(id, new MockNode());
      return nodes.get(id);
    }

    for (const [kind, fields] of Object.entries({
      revision: ['title', 'direction', 'state', 'closed', 'open'],
      grill: ['title'],
      import: ['json'],
      task: ['title', 'detail'],
      project: ['name', 'direction', 'folder', 'github'],
      place: ['folder', 'github']
    })) {
      node(kind + '-form').elements = Object.fromEntries(fields.map(key => [key, { value: '' }]));
    }

    const localStorageMock = {
      getItem(key) {
        if (key === 'plan' || key === 'notebook') {
          throw new Error('Authoritative notebook in localStorage forbidden');
        }
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        if (key === 'plan' || key === 'notebook') {
          throw new Error('Authoritative notebook in localStorage forbidden');
        }
        store.set(key, String(value));
      }
    };

    const context = vm.createContext({
      Planwharf,
      document: { getElementById: node },
      localStorage: localStorageMock,
      fetch: async (url, options) => {
        if (url === '/api/plan') {
          return {
            ok: true,
            json: async () => ({ plan: copy(disk.plan), version: disk.version })
          };
        }
        const input = JSON.parse(options.body);
        const field = { '/api/revisions': 'draft', '/api/grill': 'round', '/api/import': 'json', '/api/tasks': 'task' }[url];
        const operation = { draft: Planwharf.appendRevision, round: Planwharf.grill, json: Planwharf.importRevision, task: Planwharf.createTask }[field];
        const project = disk.plan.projects.find(p => p.project.id === input.projectId);
        const next = operation(project, input[field]);
        disk.plan.projects = disk.plan.projects.map(p => p === project ? next : p);
        disk.version = 'v' + (Number(disk.version.slice(1)) + 1);
        return { ok: true, json: async () => ({ plan: copy(disk.plan), version: disk.version }) };
      },
      FormData: class {
        constructor(form) {
          this.entries = Object.entries(form.elements).map(([k, f]) => [k, f.value]);
        }
        [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
      },
      setTimeout: () => 1,
      clearTimeout: () => {}
    });

    vm.runInContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), context);
    await flush();
    return { node, store, disk };
  }

  return { openApp, store, disk };
}

(async () => {
  const basePlan = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'notebook.json'), 'utf8'));

  // Test 1: First access on a project with multiple revisions (biblioteca has R1 and R2).
  // - No seen revision marker exists in store.
  // - Shows "nothing new" (does NOT show the example diff between R1 and R2).
  // - Does not invent a seen revision.
  // - Updates marker to R2.
  {
    const harness = createHarness({ initialPlan: basePlan });
    assert.equal(harness.store.get('planwharf_seen_biblioteca'), undefined);

    const app = await harness.openApp();
    assert.equal(app.node('revision-badge').textContent, 'R2 · manual · Current');
    assert.ok(app.node('change-context').textContent.toLowerCase().includes('nothing new'));
    assert.ok(app.node('changes-content').textContent.toLowerCase().includes('nothing new'));
    assert.equal(app.node('changes-content').innerHTML.includes('diff-item'), false, 'First access must not show any diff items');
    assert.equal(app.node('changes-content').innerHTML.includes('Harbor Street'), false, 'First access must not show the example diff');

    // Marker must now be stored as 2
    assert.equal(harness.store.get('planwharf_seen_biblioteca'), '2');
  }

  // Test 2: Reopen without changes (same revision).
  // - Closing and reopening preserves marker = 2.
  // - Shows "nothing new" and no diff items.
  {
    const store = new Map([['planwharf_seen_biblioteca', '2']]);
    const harness = createHarness({ initialPlan: basePlan, initialStore: store });
    const app = await harness.openApp();

    assert.equal(app.node('revision-badge').textContent, 'R2 · manual · Current');
    assert.ok(app.node('change-context').textContent.toLowerCase().includes('nothing new'));
    assert.ok(app.node('changes-content').textContent.toLowerCase().includes('nothing new'));
    assert.equal(app.node('changes-content').innerHTML.includes('diff-item'), false);
    assert.equal(harness.store.get('planwharf_seen_biblioteca'), '2');
  }

  // Test 3: Reopen with 1 revision jump.
  // - Stored marker is 1, but current revision is 2.
  // - Reopening shows the jump from R1 to R2!
  // - Marker in storage is updated to 2 without losing the comparison shown during reopening.
  {
    const store = new Map([['planwharf_seen_biblioteca', '1']]);
    const harness = createHarness({ initialPlan: basePlan, initialStore: store });
    const app = await harness.openApp();

    assert.equal(app.node('revision-badge').textContent, 'R2 · manual · Current');
    assert.ok(app.node('change-context').textContent.includes('From R1 to R2'));
    assert.ok(app.node('changes-content').textContent.includes('Harbor Street'));
    assert.ok(app.node('changes-content').innerHTML.includes('diff-item'));

    // Marker in store is updated to 2
    assert.equal(harness.store.get('planwharf_seen_biblioteca'), '2');

    // Clicking R1 and clicking back to R2 preserves the jump comparison during this view
    app.node('revision-select').listeners.change({ target: { value: '1' } });
    assert.equal(app.node('revision-badge').textContent, 'R1 · manual · Historical');
    assert.ok(app.node('change-context').textContent.includes('The initial snapshot'));

    app.node('revision-select').listeners.change({ target: { value: '2' } });
    assert.equal(app.node('revision-badge').textContent, 'R2 · manual · Current');
    assert.ok(app.node('change-context').textContent.includes('From R1 to R2'));
    assert.ok(app.node('changes-content').textContent.includes('Harbor Street'));
  }

  // Test 4: Subsequent reopen after jump shows "nothing new".
  {
    const store = new Map([['planwharf_seen_biblioteca', '2']]);
    const harness = createHarness({ initialPlan: basePlan, initialStore: store });
    const app = await harness.openApp();

    assert.ok(app.node('changes-content').textContent.toLowerCase().includes('nothing new'));
    assert.equal(app.node('changes-content').innerHTML.includes('diff-item'), false);
  }

  // Test 5: Reopen with MULTIPLE revisions jump (e.g. jump of 3 revisions: from R1 to R4).
  // - Verifies it does NOT limit itself to the last two revisions (R3 to R4).
  // - Shows cumulative diff from R1 to R4!
  {
    const multiPlan = copy(basePlan);
    const lib = multiPlan.projects.find(p => p.project.id === 'biblioteca');
    // Add R3 and R4
    const r3 = Planwharf.appendRevision(lib, {
      title: 'R3 Terzo passo',
      direction: 'Direzione R3 ampliata.',
      state: 'Stato R3 intermedio.',
      closed: [...lib.revisions[1].closed, 'Decisione R3 chiusa.'],
      open: ['Domanda R3 aperta?']
    });
    const r4 = Planwharf.appendRevision(r3, {
      title: 'R4 Quarto passo',
      direction: 'Direzione R4 finale.',
      state: 'Stato R4 completato.',
      closed: [...r3.revisions[2].closed, 'Decisione R4 chiusa.'],
      open: []
    });
    multiPlan.projects[0] = r4;

    const store = new Map([['planwharf_seen_biblioteca', '1']]);
    const harness = createHarness({ initialPlan: multiPlan, initialStore: store });
    const app = await harness.openApp();

    assert.equal(app.node('revision-badge').textContent, 'R4 · manual · Current');
    assert.ok(app.node('change-context').textContent.includes('From R1 to R4'));

    // Check that changes from intermediate revisions are present:
    // "Harbor Street" from R2
    assert.ok(app.node('changes-content').textContent.includes('Harbor Street'));
    // "Decisione R3 chiusa" from R3
    assert.ok(app.node('changes-content').textContent.includes('Decisione R3 chiusa'));
    // "Decisione R4 chiusa" from R4
    assert.ok(app.node('changes-content').textContent.includes('Decisione R4 chiusa'));
    // "Direzione R4 finale"
    assert.ok(app.node('changes-content').textContent.includes('Direzione R4 finale'));

    // Marker in store updated to 4
    assert.equal(harness.store.get('planwharf_seen_biblioteca'), '4');

    // Reopen immediately: must show "nothing new"
    const nextHarness = createHarness({ initialPlan: multiPlan, initialStore: harness.store });
    const nextApp = await nextHarness.openApp();
    assert.ok(nextApp.node('changes-content').textContent.toLowerCase().includes('nothing new'));
    assert.equal(nextApp.node('changes-content').innerHTML.includes('diff-item'), false);
  }

  // Test 6: Project isolation.
  // - biblioteca and orto keep completely independent markers in localStorage.
  // - Jumping orto does not affect biblioteca, and vice versa.
  {
    const store = new Map([
      ['planwharf_seen_biblioteca', '2'],
      ['planwharf_seen_orto', '1']
    ]);
    const multiPlan = copy(basePlan);
    const orto = multiPlan.projects.find(p => p.project.id === 'orto');
    // Add R2 and R3 to orto
    const ortoR2 = Planwharf.appendRevision(orto, {
      title: 'Orto R2',
      direction: 'Orto esteso.',
      state: 'Due ortolani trovati.',
      closed: [...orto.revisions[0].closed, 'Pozzo installato.'],
      open: []
    });
    const ortoR3 = Planwharf.appendRevision(ortoR2, {
      title: 'Orto R3',
      direction: 'Orto concluso.',
      state: 'Tre ortolani.',
      closed: [...ortoR2.revisions[1].closed, 'Raccolto pronto.'],
      open: []
    });
    multiPlan.projects[1] = ortoR3;

    const harness = createHarness({ initialPlan: multiPlan, initialStore: store });
    const app = await harness.openApp();

    // Active project is biblioteca: marker is 2, current is 2 -> nothing new
    assert.equal(app.node('project-name').textContent, 'Neighborhood library');
    assert.ok(app.node('changes-content').textContent.toLowerCase().includes('nothing new'));
    assert.equal(harness.store.get('planwharf_seen_biblioteca'), '2');

    // Switch to orto: lastSeen was 1, current is 3 -> jump from R1 to R3!
    app.node('project-select').listeners.change({ target: { value: 'orto' } });
    assert.equal(app.node('project-name').textContent, 'Community garden');
    assert.equal(app.node('revision-badge').textContent, 'R3 · manual · Current');
    assert.ok(app.node('change-context').textContent.includes('From R1 to R3'));
    assert.ok(app.node('changes-content').textContent.includes('Pozzo installato'));
    assert.ok(app.node('changes-content').textContent.includes('Raccolto pronto'));

    // Marker for orto is now updated to 3
    assert.equal(harness.store.get('planwharf_seen_orto'), '3');
    // Marker for biblioteca is still 2
    assert.equal(harness.store.get('planwharf_seen_biblioteca'), '2');

    // Switch back to biblioteca: still nothing new
    app.node('project-select').listeners.change({ target: { value: 'biblioteca' } });
    assert.equal(app.node('project-name').textContent, 'Neighborhood library');
    assert.ok(app.node('changes-content').textContent.toLowerCase().includes('nothing new'));
  }

  // Test 7: The existing notebook is valid; personal projects must remain intact.
  {
    const prodFile = path.join(__dirname, 'plan.json');
    const content = fs.readFileSync(prodFile, 'utf8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.schema, 2);
    assert.ok(parsed.projects.length >= 1);
    assert.equal(Planwharf.validate(parsed), true);
  }

  // Test 8: Corrupted marker in localStorage is handled gracefully without errors.
  {
    for (const badValue of ['abc', '-1', '0', '99999', 'null', 'undefined']) {
      const store = new Map([['planwharf_seen_biblioteca', badValue]]);
      const harness = createHarness({ initialPlan: basePlan, initialStore: store });
      const app = await harness.openApp();
      assert.equal(app.node('revision-badge').textContent, 'R2 · manual · Current');
      assert.ok(app.node('changes-content').textContent.toLowerCase().includes('nothing new'));
      assert.equal(harness.store.get('planwharf_seen_biblioteca'), '2');
    }
  }

  console.log('PASS: verify-jump.cjs — salto revisioni, salti multipli, nothing new, riapertura, primo accesso pulito, isolamento progetti, robustezza store.');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
