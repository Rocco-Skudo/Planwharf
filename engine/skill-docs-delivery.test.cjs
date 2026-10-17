'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createServer } = require('../server.cjs');
const runner = require('./runner.cjs');
const { MATT_REV } = require('./skill-catalog.cjs');

test('explicit docs interview delivers approval-hashed draft-only adapter and reviewed dependencies once through an actual offline CLI', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-docs-delivery-'));
  const seed = require('../fixtures/starter-notebook.json').projects[0];
  const projects = ['alpha', 'beta'].map(id => {
    const folder = path.join(dir, id); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'README.md'), 'Isolated docs interview reference.');
    return { ...structuredClone(seed), project: { id, name: id, folder }, tasks: [] };
  });
  const planFile = path.join(dir, 'notebook.json'); fs.writeFileSync(planFile, JSON.stringify({ schema: 2, projects }));
  const executable = path.join(dir, 'offline-cli.cjs');
  fs.writeFileSync(executable, `let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',value=>text+=value);process.stdin.on('end',()=>{require('node:fs').writeFileSync('received-docs.txt',text);console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Offline CLI fixture received the docs interview instructions. No model procedure was executed.'}}));});`);
  let launches = 0, downloads = 0;
  const sourceRoot = path.join(__dirname, '../.review/2026-10-17/source-review/matt-docs');
  const server = createServer({ planFile, attemptsDir: path.join(dir, 'attempts'), skillsEnabled: false, syncSkills: false, refreshModels: false, fetchPlans: async () => [],
    providers: [{ id: 'offline-docs', adapter: 'configured-cli', label: 'Offline docs fixture', cliCommand: process.execPath, cliArgs: [executable, '{model}'], restrictedArgs: [], yoloArgs: [], outputProtocol: 'codex-jsonl',
      models: [{ id: 'docs-lead', cli: 'exact-docs-fixture', label: 'Offline docs lead', enabled: true, available: true, roles: { orchestrator: true, worker: false, reviewer: false, supervisor: false } }] }],
    fetchSkills: async url => { downloads++; const prefix = `https://raw.githubusercontent.com/mattpocock/skills/${MATT_REV}/`; assert.ok(url.startsWith(prefix)); const relative = url.slice(prefix.length); assert.ok(!relative.includes('..')); const text = fs.readFileSync(path.join(sourceRoot, relative), 'utf8'); return { ok: true, text: async () => text }; },
    askModel: info => { launches++; return runner.askOrchestrator(info); }, spawnWorker: () => { throw Error('Interview cannot dispatch a worker'); },
    inspectFolder: () => ({ git: false, names: ['README.md'], docs: ['README.md'], fileCount: 1 }), readRepository: () => ({ local: {}, remote: {}, comparison: {} }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); });
  async function request(route, input, status = 200) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + route, input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  await request('/api/project-skills/settings', { projectId: 'alpha', settings: { deliveryEnabled: true, mode: 'manual', selected: ['matt/grilling', 'matt/grill-with-docs'] } });
  await request('/api/orchestrator/lead', { id: 'docs-lead' });
  await request('/api/project-skills/install', { projectId: 'alpha', id: 'matt/grill-with-docs', approved: false }, 400); assert.equal(downloads, 0);
  for (const id of ['matt/grilling', 'matt/grill-with-docs']) {
    await request('/api/project-skills/install', { projectId: 'alpha', id, approved: true });
    const inspected = await request('/api/project-skills/content?projectId=alpha&id=' + encodeURIComponent(id));
    if (id.endsWith('grill-with-docs')) { assert.match(inspected.texts['PLANWHARF-COMPATIBILITY.md'], /DRAFTS IN CHAT ONLY/); assert.match(inspected.texts['skills/engineering/grill-with-docs/SKILL.md'], /Call the Skill tool twice/); }
    await request('/api/project-skills/approve', { projectId: 'alpha', id, enabled: true, contentHash: 'uninspected' }, 400);
    await request('/api/project-skills/approve', { projectId: 'alpha', id, enabled: true, contentHash: inspected.contentHash });
  }
  const reply = await request('/api/orchestrator/ask', { projectId: 'alpha', chatSessionId: 'docs-cli-fixture', question: 'Grill with the docs', grillKind: 'docs' });
  assert.match(reply.answer, /Offline CLI fixture received/); assert.equal(launches, 1);
  const input = fs.readFileSync(path.join(dir, 'alpha', 'received-docs.txt'), 'utf8');
  for (const marker of ['PLANWHARF DOCS INTERVIEW ADAPTER v1', 'FILE skills/productivity/grilling/SKILL.md', 'FILE skills/engineering/domain-modeling/SKILL.md']) assert.equal(input.split(marker).length - 1, 1, marker);
  assert.match(input, /DRAFTS IN CHAT ONLY/); assert.match(input, /do not write project documentation or source/);
  let state = await request('/api/project-skills?projectId=alpha');
  const delivered = state.deliveries.at(-1); assert.equal(delivered.submitted, true); assert.equal(delivered.transport, 'cli-stdin-written-consumption-unverified'); assert.equal(delivered.loaded, 'unverified'); assert.equal(delivered.verified, false);
  assert.deepEqual(delivered.skills.map(row => row.id), ['matt/grilling', 'matt/grill-with-docs']);
  await request('/api/orchestrator/ask', { projectId: 'alpha', chatSessionId: 'ordinary-chat-fixture', question: 'Discuss the already approved project.' });
  state = await request('/api/project-skills?projectId=alpha'); assert.ok(!state.deliveries.at(-1).skills.some(row => row.id === 'matt/grill-with-docs'));
  assert.ok(state.deliveries.at(-1).rejected.some(row => row.id === 'matt/grill-with-docs' && row.reason === 'Explicit docs interview required.'));
  assert.deepEqual((await request('/api/project-skills?projectId=beta')).deliveries, []);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'alpha')).sort(), ['README.md', 'received-docs.txt']);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'beta')), ['README.md']);
  // Distinct approved aliases with identical instructions are safe to deliver
  // once; the server must not turn a deduplication record into a launch failure.
  const duplicateText = '---\nname: identical-fixture\ndescription: Inspect this fixture only\n---\nUNIQUE-ALIAS-PROCEDURE';
  for (const alias of ['one', 'two']) {
    const location = path.join(dir, 'alpha', '.planwharf', 'skills', alias); fs.mkdirSync(location, { recursive: true }); fs.writeFileSync(path.join(location, 'SKILL.md'), duplicateText);
  }
  const discovered = await request('/api/project-skills/discover', { projectId: 'alpha' });
  const local = discovered.catalog.filter(row => row.source === 'project-local'); assert.equal(local.length, 2);
  for (const row of local) await request('/api/project-skills/approve', { projectId: 'alpha', id: row.id, enabled: true, contentHash: row.contentHash });
  await request('/api/project-skills/settings', { projectId: 'alpha', settings: { selected: local.map(row => row.id) } });
  const deduplicated = await request('/api/orchestrator/ask', { projectId: 'alpha', chatSessionId: 'duplicate-cli-fixture', question: 'Inspect fixture instructions.' });
  assert.match(deduplicated.answer, /Offline CLI fixture received/);
  assert.equal(fs.readFileSync(path.join(dir, 'alpha', 'received-docs.txt'), 'utf8').split('UNIQUE-ALIAS-PROCEDURE').length - 1, 1);
  const dedupeDelivery = (await request('/api/project-skills?projectId=alpha')).deliveries.at(-1);
  assert.equal(dedupeDelivery.submitted, true); assert.equal(dedupeDelivery.skills.length, 1); assert.ok(dedupeDelivery.rejected.some(row => row.reason === 'Duplicate instruction content.'));
});
