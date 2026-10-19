'use strict';
// Real backend with three independent live worker-transport fixtures; real browser media.
// No provider processes, credentials, personal notebooks or personal profiles are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright');
const { createServer } = require('./server.cjs');
const out = path.resolve(process.env.PLANWHARF_VALIDATION_DIR || '.review/soundtrack-concurrency/latest');
fs.mkdirSync(out, { recursive: true });
const fixture = fs.mkdtempSync(path.join(out, 'fixture-'));
const ids = ['concurrency-alpha', 'concurrency-beta', 'concurrency-gamma'];
const seed = require('./fixtures/starter-notebook.json').projects[0];
const plan = { schema: 2, projects: ids.map(id => ({ ...structuredClone(seed), project: { id, name: id, folder: path.join(fixture, id) }, tasks: [] })) };
for (const item of plan.projects) fs.mkdirSync(item.project.folder);
const planFile = path.join(fixture, 'notebook.json');
fs.writeFileSync(planFile, JSON.stringify(plan));
let pid = 99000, aiCalls = 0, context, base;
const live = new Set(), launches = [], checks = [], errors = [], failedRequests = [], evidence = [];
const server = createServer({ planFile, attemptsDir: path.join(fixture, 'attempts'),
  models: [{ id: 'concurrency-fixture', label: 'Local transport fixture', provider: 'codex', cli: 'gpt-6-luna', kind: 'default', enabled: true, available: true }],
  fetchPlans: null, skillsEnabled: false, syncSkills: false, refreshModels: false, monitorIntervalMs: 300,
  inspectFolder: folder => ({ folder, git: false, names: [], fileCount: 0, dirty: [] }),
  spawnWorker: info => { const id = ++pid; launches.push({ ...info, pid: id }); live.add(id); return { pid: id }; },
  isProcessAlive: id => live.has(id), killWorker: id => live.delete(id),
  askModel: () => { aiCalls++; throw Error('No AI calls permitted'); }
});
async function request(route, data) {
  const response = await fetch(base + route, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await response.json(); assert.ok(response.ok, JSON.stringify(body)); return body;
}
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
const player = page => page.evaluate(() => window.PlanwharfSoundtrackUI.controller.snapshot());
async function ready(page) { await page.waitForFunction(() => window.PlanwharfSoundtrackUI?.controller && document.body.dataset.orchReady === '1'); }
async function playing(page) { await page.waitForFunction(() => !window.PlanwharfSoundtrackUI.audio.paused && window.PlanwharfSoundtrackUI.audio.currentTime > .15); }
async function select(page, id, state = 'running') {
  await page.locator('#project-select').selectOption(id);
  await page.waitForFunction(({ id, state }) => { const s = window.PlanwharfSoundtrackUI.controller.snapshot(); return s.projectId === id && s.state === state; }, { id, state });
}
async function allPlaying(pages) { return Promise.all(pages.map(p => p.evaluate(() => window.createdAudio.filter(a => !a.paused).length))); }
async function configure(page) {
  await page.locator('#workspace-settings-button').click();
  await page.locator('[data-soundtrack-state=running]').selectOption('ocean-trance');
  await page.locator('[data-soundtrack-state=pausing]').selectOption('deeper-sea');
  await page.locator('[data-soundtrack-fade]').selectOption('500');
  await page.keyboard.press('Escape');
}
(async () => { try {
  assert.ok(process.env.PLANWHARF_TEST_BROWSER, 'Explicit installed browser required');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
  for (const id of ids) {
    const proposed = await request('/api/orchestrator/propose', { projectId: id, title: 'Independent concurrency fixture', goal: 'Observe live selected-project playback', subTasks: [{ title: 'Remain live', detail: 'Local transport fixture, no provider', assignedModelId: 'concurrency-fixture', type: 'IMPLEMENTATION', dependsOn: [] }] });
    const megaTaskId = proposed.snapshot.projects.find(row => row.id === id).megaTaskId;
    await request('/api/orchestrator/approve', { projectId: id, megaTaskId });
  }
  const initial = await request('/api/orchestrator?readOnly=1');
  for (const id of ids) { const row = initial.projects.find(row => row.id === id); assert.equal(row.workerAlive, true); assert.equal(row.status, 'watching'); }
  assert.equal(launches.length, 3); evidence.push({ stage: 'three-running', projects: initial.projects });
  if (process.env.PLANWHARF_MANUAL_BROWSER === '1') {
    fs.writeFileSync(path.join(out, 'manual-backend.json'), JSON.stringify({ base, evidence, scope: 'Three independently approved live worker-transport fixtures; no providers' }, null, 2));
    console.log('Manual browser fixture: ' + base);
    await new Promise(() => {});
  }
  console.log('Three independent backend fixtures running; launching installed browser');
  context = await chromium.launchPersistentContext(path.join(fixture, 'browser-profile'), { executablePath: process.env.PLANWHARF_TEST_BROWSER, timeout: 20000, headless: true, chromiumSandbox: true, viewport: { width: 1440, height: 1000 }, args: ['--disable-gpu', '--disable-software-rasterizer', '--autoplay-policy=document-user-activation-required'] });
  context.setDefaultTimeout(20000);
  await context.addInitScript(() => {
    window.createdAudio = []; const NativeAudio = window.Audio;
    window.Audio = function (...args) { const audio = new NativeAudio(...args); window.createdAudio.push(audio); return audio; }; window.Audio.prototype = NativeAudio.prototype;
    window.mediaLoads = 0; window.mediaStarts = 0;
    document.addEventListener('loadstart', () => window.mediaLoads++, true);
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) { window.mediaStarts++; return original.apply(this, args); };
  });
  context.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failedRequests.push({ url: r.url(), status: r.status() }); });
    page.on('requestfailed', r => { if (!/ERR_ABORTED/.test(r.failure()?.errorText || '')) failedRequests.push({ url: r.url(), error: r.failure() }); });
  });
  console.log('Browser launched; opening application');
  const first = await context.newPage(); await first.goto(base + '/#orchestrator'); await ready(first); await configure(first); await select(first, ids[0]);
  await check('three backend projects simultaneously RUNNING; one selected-project player', async () => {
    assert.equal((await player(first)).playing, false); await first.locator('[data-soundtrack-play]').click(); await playing(first);
    assert.equal((await player(first)).currentTrackId, 'ocean-trance'); assert.deepEqual(await allPlaying([first]), [1]);
    assert.equal(await first.evaluate(() => createdAudio.length), 1);
    await first.evaluate(() => { window.initialController = PlanwharfSoundtrackUI.controller; window.initialAudio = PlanwharfSoundtrackUI.audio; });
  });
  await check('rapid switches and repeated backend snapshots preserve track position and controller', async () => {
    const before = await first.evaluate(() => ({ time: PlanwharfSoundtrackUI.audio.currentTime, starts: mediaStarts }));
    await first.evaluate(ids => { const select = document.getElementById('project-select'); for (let i = 0; i < 60; i++) { select.value = ids[i % ids.length]; select.dispatchEvent(new Event('change', { bubbles: true })); } }, ids);
    for (const id of ids) await select(first, id);
    await first.waitForTimeout(2400);
    assert.equal((await player(first)).state, 'running'); assert.equal((await player(first)).projectId, ids[2]);
    const after = await first.evaluate(() => ({ time: PlanwharfSoundtrackUI.audio.currentTime, starts: mediaStarts, same: initialController === PlanwharfSoundtrackUI.controller && initialAudio === PlanwharfSoundtrackUI.audio, count: createdAudio.length }));
    assert.ok(after.time > before.time); assert.equal(after.starts, before.starts); assert.equal(after.same, true); assert.equal(after.count, 1);
  });
  await check('Overview, Workspace and Ship View retain one advancing playback instance', async () => {
    const before = (await player(first)).currentTime;
    await first.locator('[data-workspace-view=planwharf]').click(); await first.locator('[data-workspace-view=orchestrator]').click();
    await first.locator('#ship-view-button').click(); await first.waitForTimeout(500);
    await first.screenshot({ path: path.join(out, 'three-running-ship.png') }); await first.locator('#ship-view-exit').click();
    assert.ok((await player(first)).currentTime > before); assert.deepEqual(await allPlaying([first]), [1]);
    assert.equal(await first.evaluate(() => initialController === PlanwharfSoundtrackUI.controller && initialAudio === PlanwharfSoundtrackUI.audio), true);
  });
  const second = await context.newPage(); await second.goto(base + '/#orchestrator'); await ready(second); await select(second, ids[1]);
  await check('two tabs cannot overlap; first active player keeps ownership', async () => {
    await second.locator('[data-soundtrack-play]').click(); await second.waitForTimeout(700);
    assert.deepEqual(await allPlaying([first, second]), [1, 0]);
    assert.match((await player(second)).notice, /another.*tab|another.*window/i);
    for (const id of ids) await select(second, id);
    await second.waitForTimeout(300); assert.deepEqual(await allPlaying([first, second]), [1, 0]);
    await second.screenshot({ path: path.join(out, 'second-tab-denied.png') });
  });
  await check('Pause releases ownership; explicit Play transfers it without autoplay', async () => {
    await first.locator('[data-soundtrack-play]').click(); await first.waitForTimeout(150);
    assert.deepEqual(await allPlaying([first, second]), [0, 0]);
    await second.locator('[data-soundtrack-play]').click(); await playing(second);
    assert.deepEqual(await allPlaying([first, second]), [0, 1]);
    await first.locator('[data-soundtrack-play]').click(); await first.waitForTimeout(400);
    assert.deepEqual(await allPlaying([first, second]), [0, 1]);
    await second.close(); await first.waitForTimeout(200); assert.equal((await player(first)).playing, false);
    await first.locator('[data-soundtrack-play]').click(); await playing(first);
  });
  await check('state changes follow only selection; rapid interrupted fades never overlap', async () => {
    const current = await request('/api/orchestrator?readOnly=1');
    const alpha = current.projects.find(row => row.id === ids[0]);
    await request('/api/orchestrator/pause', { projectId: ids[0], megaTaskId: alpha.megaTaskId });
    await first.waitForTimeout(1400); assert.equal((await player(first)).projectId, ids[2]); assert.equal((await player(first)).currentTrackId, 'ocean-trance');
    await select(first, ids[0], 'pausing');
    await first.waitForFunction(() => PlanwharfSoundtrackUI.controller.snapshot().currentTrackId === 'deeper-sea' && !PlanwharfSoundtrackUI.controller.snapshot().loading);
    await first.evaluate(ids => { const select = document.getElementById('project-select'); for (let i = 0; i < 31; i++) { select.value = ids[i % ids.length]; select.dispatchEvent(new Event('change', { bubbles: true })); } }, ids);
    await select(first, ids[1]); await first.waitForTimeout(1400);
    assert.equal((await player(first)).currentTrackId, 'ocean-trance'); assert.deepEqual(await allPlaying([first]), [1]);
    await first.locator('[data-soundtrack-play]').click(); await select(first, ids[0], 'pausing'); await select(first, ids[2]);
    assert.equal((await player(first)).playing, false); assert.equal((await player(first)).manualPaused, true);
  });
  assert.equal(aiCalls, 0); assert.equal(launches.length, 3); assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  for (const item of plan.projects) assert.deepEqual(fs.readdirSync(item.project.folder), []);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks, browser: await context.browser().version(), sandboxEnabled: true, aiCalls, workerTransportFixtureCount: launches.length, errors, failedRequests, evidence, limitations: 'Real HTTP backend and HTMLAudio playback, local worker transport/liveness fixtures. No live providers or physical speaker listening. Ownership is limited to a shared browser profile and origin.' }, null, 2));
} catch (error) { fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack, checks, errors, failedRequests, evidence }, null, 2)); console.error(error); process.exitCode = 1;
} finally { await context?.close(); await new Promise(resolve => server.close(resolve)); } })();
