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
function createProviderModels(models, { discover = listGrok, now = Date.now, ttl = 60000 } = {}) {
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
module.exports = { createProviderModels, listGrok };
