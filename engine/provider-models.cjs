'use strict';
const { execFile } = require('node:child_process');
const { executable } = require('./providers.cjs');
function listGrok() {
  return new Promise(resolve => {
    const command = executable('grok');
    if (!command) return resolve({ ok: false, reason: 'Grok CLI executable not found.' });
    execFile(command, ['models'], { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const policy = /policy lock file[\s\S]*not accessible/i.test(stdout + stderr);
        return resolve({ ok: false, reason: policy ? 'Grok CLI cannot access its managed policy lock file. Check the CLI permissions and sign-in, then refresh models.' : 'Grok CLI could not list models for the active login. Check CLI sign-in and refresh models.' });
      }
      const ids = [...new Set((stdout.replace(/\x1b\[[0-9;]*m/g, '').match(/\bgrok-[a-zA-Z0-9][a-zA-Z0-9._:-]*/g) || []))];
      resolve(ids.length ? { ok: true, ids } : { ok: false, reason: 'Grok CLI returned no exact model IDs for the active login.' });
    });
  });
}
function createProviderModels(models, { discover = listGrok, providers, now = Date.now, ttl = 60000 } = {}) {
  if (providers) return createCatalogDiscovery(models, providers, { discover, now, ttl });
  let state = { status: 'unknown', checkedAt: null, reason: null, ids: [] }, inflight;
  async function refresh(force = false) {
    if (inflight) return inflight;
    if (!force && state.checkedAt && now() - Date.parse(state.checkedAt) < ttl) return state;
    inflight = (async () => {
      let result;
      try { result = await discover(); } catch { result = { ok: false, reason: 'Grok model discovery failed. Check CLI sign-in and refresh models.' }; }
      const ids = result.ok && Array.isArray(result.ids) ? result.ids.filter(id => typeof id === 'string' && /^grok-[\w.:-]+$/.test(id)) : [];
      for (const model of models.filter(model => model.provider === 'grok')) {
        model.availabilityVerified = Boolean(result.ok);
        model.availabilityWarning = result.ok ? null : result.reason;
        if (result.ok) {
          model.available = ids.includes(model.cli);
          model.unavailableReason = model.available ? null : `The active Grok login does not list the exact model ${model.cli}. No substitute was selected.`;
        }
      }
      state = { status: result.ok ? 'current' : 'unread', checkedAt: new Date(now()).toISOString(), reason: result.ok ? null : result.reason, ids: result.ok ? ids : state.ids, preservingPreviousAvailability: !result.ok };
      return state;
    })().finally(() => { inflight = null; });
    return inflight;
  }
  return { refresh, snapshot: () => ({ ...state, checking: Boolean(inflight) }) };
}
function createCatalogDiscovery(models, providers, { discover, now, ttl }) {
  const states = new Map(); let inflight;
  async function refresh(force = false, providerId) {
    if (inflight) return inflight;
    inflight = (async () => {
      for (const provider of providers.filter(p => (!providerId || p.id === providerId) && p.enabled !== false)) {
        const previous = states.get(provider.id);
        if (!force && previous && now() - Date.parse(previous.checkedAt) < ttl) continue;
        let result;
        try {
          const adapter = require('./provider-adapters.cjs').adapterFor(provider);
          result = discover !== listGrok ? await discover(provider) : await adapter?.discover?.(provider);
        } catch { result = { ok: false, reason: 'Provider catalog could not be read; previous model configuration is preserved.' }; }
        result ||= { ok: false, reason: 'Model enumeration unavailable for this adapter.' };
        const checkedAt = new Date(now()).toISOString();
        for (const model of models.filter(m => m.providerId === provider.id)) {
          model.availabilityVerified = result.ok === true;
          model.availabilityCheckedAt = checkedAt;
          model.availabilityWarning = result.ok ? null : result.reason || 'Model catalog check failed; previous availability is retained.';
        }
        const entries = (result.models || (result.ids || []).map(cli => ({ cli }))).filter(m => typeof m.cli === 'string' && m.cli.trim() === m.cli && m.cli && !/[\x00-\x1f\x7f]/.test(m.cli));
        if (result.ok) {
          for (const model of models.filter(m => m.providerId === provider.id)) {
            model.available = entries.some(m => m.cli === model.cli);
            model.unavailableReason = model.available ? null : `The ${provider.label} catalog does not list exact model ${model.cli}. Configuration retained; no substitute selected.`;
          }
          for (const entry of entries) if (!models.some(m => m.providerId === provider.id && m.cli === entry.cli)) {
            models.push({ ...entry, id: provider.id + ':' + entry.cli, providerId: provider.id, provider: provider.id, adapter: provider.adapter, quotaPoolId: provider.quotaPoolId, plan: provider.quotaPoolId,
              label: entry.label || entry.cli, enabled: false, available: true, availabilityVerified: true, availabilityCheckedAt: checkedAt, availabilityWarning: null, providerCatalog: true, orchestratorEligible: entry.orchestratorEligible ?? entry.capabilities?.canOrchestrate ?? true,
              workerEligible: entry.workerEligible ?? entry.capabilities?.canCode ?? true, capabilities: { ...entry.capabilities }, providerConfig: require('./provider-catalog.cjs').providerConfiguration(provider) });
          }
        }
        states.set(provider.id, { providerId: provider.id, label: provider.label || provider.id, status: result.ok ? 'current' : 'unread', checkedAt, reason: result.ok ? null : result.reason, preservingPreviousAvailability: !result.ok, ids: result.ok ? entries.map(m => m.cli) : previous?.ids || [] });
      }
      return snapshot();
    })().finally(() => { inflight = null; });
    return inflight;
  }
  function snapshot() { const list = providers.map(p => states.get(p.id) || { providerId: p.id, label: p.label || p.id, status: p.enabled === false ? 'disabled' : 'unknown', checkedAt: null, ids: [] }); return { providers: list, checking: Boolean(inflight), status: list.every(s => ['current', 'disabled'].includes(s.status)) ? 'current' : 'unread' }; }
  return { refresh, snapshot };
}
module.exports = { createProviderModels, listGrok };
