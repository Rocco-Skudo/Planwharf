'use strict';
const assert = require('node:assert/strict');
const { createProviderModels } = require('./provider-models.cjs');
(async () => {
  const models = [{ id: 'grok-fixture', provider: 'grok', cli: 'grok-fixture', available: true, enabled: true }, { id: 'other', provider: 'grok', cli: 'grok-other', available: false }];
  let result = { ok: true, ids: ['grok-fixture'] };
  const discovery = createProviderModels(models, { discover: async () => result });
  await discovery.refresh(true);
  assert.equal(models[0].availabilityVerified, true);
  result = { ok: false, reason: 'Fixture temporary quota or policy failure.' };
  const failed = await discovery.refresh(true);
  assert.equal(failed.status, 'unread');
  assert.equal(models[0].available, true, 'Failed check cannot revoke previously verified exact-model availability');
  assert.equal(models[0].enabled, true);
  assert.equal(models[0].availabilityVerified, false);
  assert.equal(models[1].available, false, 'Failed check cannot fabricate access to an unverified model');
  assert.equal(models[0].cli, 'grok-fixture');
  result = { ok: true, ids: ['grok-other'] };
  await discovery.refresh(true);
  assert.equal(models[0].available, false);
  assert.equal(models[1].available, true);
  const catalogModels = [
    { id: 'codex-isolated', providerId: 'codex-test', cli: 'gpt-isolated', available: false, unavailableReason: 'Old rejected model probe', roles: { worker: false, reviewer: true } },
    { id: 'grok-isolated', providerId: 'grok-test', cli: 'grok-isolated', available: false }
  ];
  const catalogProviders = [{ id: 'codex-test', adapter: 'codex' }, { id: 'grok-test', adapter: 'grok' }];
  const inspected = [];
  let catalogReadFails = false;
  const isolated = createProviderModels(catalogModels, { providers: catalogProviders, discover: async provider => {
    inspected.push(provider.id);
    if (catalogReadFails) return { ok: false, reason: 'Fixture catalog temporarily unavailable.' };
    return { ok: true, ids: catalogModels.filter(model => model.providerId === provider.id).map(model => model.cli) };
  } });
  await isolated.refresh(true);
  assert.deepEqual(inspected, ['codex-test', 'grok-test'], 'Injected discovery must isolate every provider from real accounts');
  assert.ok(catalogModels.every(model => model.available));
  assert.equal(catalogModels.length, 2, 'Catalogs must not mix exact model IDs between providers');
  assert.equal(catalogModels[0].unavailableReason, null, 'Fresh startup catalog supersedes an old model rejection');
  assert.equal(catalogModels[0].availabilityVerified, true);
  assert.ok(catalogModels[0].availabilityCheckedAt);
  assert.deepEqual(catalogModels[0].roles, { worker: false, reviewer: true }, 'Discovery never changes user role permissions');
  await isolated.refresh(); assert.equal(inspected.length, 2, 'Status cache avoids repeated provider invocations');
  catalogReadFails = true;
  await isolated.refresh(true);
  assert.equal(catalogModels[0].available, true, 'Failed check retains the last known availability');
  assert.equal(catalogModels[0].availabilityVerified, false);
  assert.match(catalogModels[0].availabilityWarning, /temporarily unavailable/);
  assert.equal(isolated.snapshot().providers[0].status, 'unread');

  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { createServer } = require('../server.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-startup-models-'));
  const planFile = path.join(dir, 'notebook.json');
  fs.copyFileSync(path.join(__dirname, '../fixtures/notebook.json'), planFile);
  let releaseDiscovery, startupCalls = 0;
  const pending = new Promise(resolve => { releaseDiscovery = resolve; });
  const server = createServer({ planFile, attemptsDir: path.join(dir, 'attempts'), skillsEnabled: false, fetchPlans: null, refreshModels: true,
    models: [{ id: 'gpt-5', cli: 'gpt-5', provider: 'codex', enabled: false, available: false, unavailableReason: 'Old rejected model probe' }],
    discoverModels: () => { startupCalls++; return pending; } });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    for (let n = 0; n < 3; n++) assert.equal((await (await fetch(origin + '/api/models/status')).json()).checking, true);
    let snapshotReturned = false;
    const response = fetch(origin + '/api/orchestrator?readOnly=1').then(value => { snapshotReturned = true; return value.json(); });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(snapshotReturned, false, 'Initial snapshot must wait for the fresh startup check');
    releaseDiscovery({ ok: true, ids: ['gpt-5'] });
    const checked = await response;
    const model = checked.models.find(item => item.id === 'gpt-5');
    assert.equal(model.available, true); assert.equal(model.unavailableReason, null);
    assert.equal(model.availabilityVerified, true);
    assert.equal(checked.providerModels.checking, false);
    assert.equal(startupCalls, 1, 'Startup and UI polling perform only one catalog check');
  } finally {
    releaseDiscovery({ ok: false, reason: 'Test cleanup' });
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log('OK: exact Grok model discovery, preserved access on failed checks and no invented provider/model substitutions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
