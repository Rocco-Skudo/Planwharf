'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createServer } = require('../server.cjs');
const runner = require('./runner.cjs');
test('approved project Skill travels from HTTP approval through real runner to isolated CLI once', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-skill-execution-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, 'fixture-cli.cjs');
  fs.writeFileSync(script, `let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>{const fs=require('node:fs');require('node:assert/strict').ok(text.includes('UNIQUE-PROJECT-SKILL-MARKER'));fs.writeFileSync('received.txt',text);const destination=text.match(/Write one UTF-8 JSON object to (.+?)\\. If a write_result/)[1];const result=JSON.parse(text.match(/Use these exact identity fields:\\n([\\s\\S]+?)\\nUse one status/)[1]);Object.assign(result,{status:'COMPLETE',summary:'Isolated fixture observed its actual received instructions.',tests:[],filesChanged:['received.txt'],blockers:[],nextAction:'Review fixture evidence',createdAt:new Date().toISOString()});fs.writeFileSync(destination,JSON.stringify(result));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Fixture inspected local input.'}}));});`);
  const seed = require('../fixtures/starter-notebook.json').projects[0];
  const plan = { schema: 2, projects: ['alpha', 'beta'].map(id => ({ ...structuredClone(seed), project: { id, name: id, folder: path.join(dir, id) }, tasks: [] })) };
  for (const project of plan.projects) { fs.mkdirSync(project.project.folder); fs.writeFileSync(path.join(project.project.folder, 'README.md'), 'Stable isolated procedure reference.'); }
  const local = path.join(dir, 'alpha', '.planwharf', 'skills', 'inspect-fixture', 'SKILL.md');
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, '---\nname: inspect-fixture\ndescription: Inspect fixture evidence\n---\nUNIQUE-PROJECT-SKILL-MARKER');
  const planFile = path.join(dir, 'notebook.json'); fs.writeFileSync(planFile, JSON.stringify(plan));
  let legacyReads = 0, launches = 0, reusedHistoricalPid = false;
  const server = createServer({ planFile, attemptsDir: path.join(dir, 'attempts'), syncSkills: false, refreshModels: false, monitorIntervalMs: 60000,
    skills: { snapshot: () => ({ sha: 'fixture' }), ensure: () => { throw Error('No downloads permitted'); }, prompt: () => { legacyReads++; return 'LEGACY-SKILL-MARKER'; }, read: () => '' },
    providers: [{ id: 'fixture-provider', adapter: 'configured-cli', cliCommand: process.execPath, cliArgs: [script, '{model}'], yoloArgs: [], restrictedArgs: [], outputProtocol: 'codex-jsonl', models: [{ id: 'fixture-worker', cli: 'exact-fixture', enabled: true, available: true, roles: { worker: true, reviewer: true, orchestrator: true, supervisor: false } }] }],
    fetchPlans: async () => [], inspectFolder: () => ({ git: false, names: [], dirty: [] }), readRepository: () => ({ local: {}, remote: {}, comparison: {} }),
    spawnWorker: info => { launches++; return runner.spawnWorker(info); }, isProcessAlive: pid => reusedHistoricalPid || runner.isProcessAlive(pid), killWorker: () => { throw Error('No process termination needed'); }, askModel: runner.askOrchestrator });
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, input, expected = 200) { const response = await fetch(base + route, input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data; }
  const found = await request('/api/project-skills/discover', { projectId: 'alpha' }); const skill = found.catalog.find(row => row.source === 'project-local');
  await request('/api/project-skills/approve', { projectId: 'alpha', id: skill.id, enabled: true, contentHash: skill.contentHash });
  await request('/api/project-skills/settings', { projectId: 'alpha', settings: { deliveryEnabled: true, mode: 'manual', selected: [skill.id] } });
  const proposed = await request('/api/orchestrator/propose', { projectId: 'alpha', title: 'Inspect fixture', goal: 'Observe local prompt only', subTasks: [{ title: 'Inspect fixture evidence', detail: 'No source modification', type: 'IMPLEMENTATION', assignedModelId: 'fixture-worker', dependsOn: [] }] }, 201);
  const megaTaskId = proposed.snapshot.projects.find(row => row.id === 'alpha').megaTaskId;
  await request('/api/orchestrator/approve', { projectId: 'alpha', megaTaskId });
  const receivedFile = path.join(dir, 'alpha', 'received.txt');
  const deadline = Date.now() + 10000; while (!fs.existsSync(receivedFile) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(fs.existsSync(receivedFile), 'Actual isolated CLI must receive worker input');
  const received = fs.readFileSync(receivedFile, 'utf8'); assert.equal(received.split('UNIQUE-PROJECT-SKILL-MARKER').length - 1, 1); assert.doesNotMatch(received, /LEGACY-SKILL-MARKER/); assert.equal(legacyReads, 0);
  const state = await request('/api/project-skills?projectId=alpha'); const delivered = state.deliveries.find(row => row.attached);
  assert.ok(delivered); assert.equal(delivered.provider, 'fixture-provider'); assert.equal(delivered.model, 'exact-fixture'); assert.equal(delivered.role, 'worker'); assert.ok(delivered.attemptId); assert.equal(delivered.submitted, true);
  assert.equal(delivered.transport, 'cli-stdin-written-consumption-unverified'); assert.equal(delivered.loaded, 'unverified'); assert.equal(delivered.followed, 'unverified'); assert.equal(delivered.verified, false);
  const snapshot = await request('/api/orchestrator?readOnly=1'); assert.equal(snapshot.projects.find(row => row.id === 'alpha').projectSkills.deliveries.some(row => row.id === delivered.id), true);
  assert.equal((await request('/api/project-skills?projectId=beta')).deliveries.length, 0);
  const accepted = [];
  async function reviewAttempt(attemptId) {
    const exitFile = path.join(dir, 'attempts', 'results', attemptId + '.exit.json');
    const deadline = Date.now() + 10000; while (!fs.existsSync(exitFile) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(fs.existsSync(exitFile));
    // The exit receipt is written just before runner shutdown. Reconciliation
    // requires the process to have exited and the backend to validate its result.
    let complete = false;
    const reconcileDeadline = Date.now() + 10000;
    while (!complete && Date.now() < reconcileDeadline) {
      await request('/api/orchestrator');
      const execution = await request('/api/execution?projectId=alpha');
      const result = execution.results.find(row => row.attemptId === attemptId);
      const sub = execution.subTasks.find(row => row.id === result?.subTaskId);
      complete = result?.status === 'COMPLETE' && result.exitCode === 0 && sub?.status === 'COMPLETE' && sub.resultId === result.resultId;
      if (!complete) await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(complete, true, 'Backend must validate the completed assignment before procedure review');
    const candidate = await request('/api/project-skills/procedures/prepare', { projectId: 'alpha', attemptId, skillId: skill.id, referencePaths: ['README.md'] });
    assert.equal(candidate.testExecutionVerified, false);
    await request('/api/project-skills/procedures/accept', { projectId: 'alpha', candidateId: candidate.candidateId, expectedHash: candidate.reviewHash, approved: true, reviewNote: 'Fixture simulates a human inspecting exact local input and source evidence; no automated procedure proof is claimed.' });
    accepted.push(candidate);
  }
  await reviewAttempt(delivered.attemptId);
  for (let index = 0; index < 2; index++) {
    const next = await request('/api/orchestrator/propose', { projectId: 'alpha', title: 'Repeat fixture observation', goal: 'Observe actual isolated input', subTasks: [{ title: 'Inspect fixture input again', detail: 'No project work', type: 'IMPLEMENTATION', assignedModelId: 'fixture-worker', dependsOn: [] }] }, 201);
    await request('/api/orchestrator/approve', { projectId: 'alpha', megaTaskId: next.snapshot.projects.find(row => row.id === 'alpha').megaTaskId });
    const state = await request('/api/project-skills?projectId=alpha'); await reviewAttempt(state.deliveries.at(-1).attemptId);
  }
  const reviews = await request('/api/project-skills/procedures?projectId=alpha'); assert.equal(reviews.accepted.length, 3); assert.equal(reviews.suggestions.length, 1);
  reusedHistoricalPid = true; // Harmless fixture observation simulates PID reuse; no process is touched.
  const historySnapshot = await request('/api/orchestrator?readOnly=1');
  reusedHistoricalPid = false;
  const firstAssignment = historySnapshot.projects.find(row => row.id === 'alpha').dispatch.find(part => part.attemptId === delivered.attemptId);
  assert.equal(firstAssignment.assignmentJobTitle, 'Inspect fixture'); assert.equal(firstAssignment.historicalAssignment, true);
  assert.equal(firstAssignment.activity, 'Isolated fixture observed its actual received instructions.');
  assert.equal(firstAssignment.alive, false);
  assert.equal(firstAssignment.observedAlive, true, 'Raw PID observation remains inspectable');
  assert.equal(firstAssignment.activitySession.historical, true);
  assert.equal(firstAssignment.activitySession.processState, 'recorded');
  assert.equal(firstAssignment.activitySession.state, 'completed', 'Historical validated result survives reused PID');
  const firstFleetAssignment = historySnapshot.fleet.find(model => model.id === 'fixture-worker').assignments.find(part => part.attemptId === delivered.attemptId);
  assert.equal(firstFleetAssignment.taskTitle, 'Inspect fixture');
  assert.equal(firstFleetAssignment.alive, false);
  const assisted = await request('/api/project-skills/drafts/create-assisted', { projectId: 'alpha', proposalId: reviews.suggestions[0].id, name: 'reusable-fixture', description: 'Repeat the reviewed isolated observation', procedure: 'Read README.md, inspect the isolated received input and report facts.', requested: true });
  assert.equal(assisted.mode, 'assisted-human-reviewed'); assert.equal(assisted.status, 'draft');
  const saved = await request('/api/project-skills/drafts/approve', { projectId: 'alpha', id: assisted.id, revision: assisted.revision, approved: true }); assert.equal(saved.activated, false);
  assert.equal(legacyReads, 0, 'Opted-in project execution must never prepare legacy Skills');
  assert.equal(launches, 3);
  fs.appendFileSync(local, '\nChanged local procedure requires fresh review.');
  const blocked = await request('/api/orchestrator/propose', { projectId: 'alpha', title: 'Check stale selection', goal: 'Do not launch without the selected current Skill', subTasks: [{ title: 'Inspect fixture', detail: 'Stale Skill must block launch', type: 'IMPLEMENTATION', assignedModelId: 'fixture-worker', dependsOn: [] }] }, 201);
  const blockedMega = blocked.snapshot.projects.find(row => row.id === 'alpha').megaTaskId;
  await request('/api/orchestrator/approve', { projectId: 'alpha', megaTaskId: blockedMega });
  assert.equal(launches, 3, 'Changed required Manual Skill must prevent actual provider launch');
  const blockedExecution = await request('/api/execution?projectId=alpha');
  assert.ok(blockedExecution.results.some(result => result.megaTaskId === blockedMega && /Manually selected Skills are unavailable/.test(result.summary)));
  await request('/api/project-skills/settings', { projectId: 'alpha', settings: { deliveryEnabled: false } });
  assert.equal((await request('/api/project-skills?projectId=alpha')).preferences.deliveryEnabled, false);
});
