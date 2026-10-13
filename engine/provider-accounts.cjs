'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');

// Only display metadata leaves this module. Never return credentials or email addresses.
function json(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } }
function claims(token) { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { return {}; } }
function accountType(plan) {
  const value = String(plan || '').toLowerCase();
  if (/^(business|team|enterprise|edu|self_serve_business(?:_[a-z_]+)?|enterprise_cbp(?:_[a-z_]+)?)$/.test(value)) return 'business';
  if (['free', 'go', 'plus', 'pro', 'prolite', 'personal', 'individual', 'user'].includes(value)) return 'normal';
  return 'unread';
}
function metadata(providerId, identity, type, source) {
  return { key: identity ? createHash('sha256').update(providerId + ':' + identity).digest('hex') : null,
    type, source, checkedAt: new Date().toISOString() };
}
function codexAccount(provider, { home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex') } = {}) {
  const auth = json(path.join(home, 'auth.json'));
  const token = claims(auth?.tokens?.id_token || auth?.tokens?.access_token || '');
  const info = token['https://api.openai.com/auth'] || {};
  const selected = auth?.tokens?.account_id || info.chatgpt_account_id;
  const matches = !info.chatgpt_account_id || info.chatgpt_account_id === selected;
  return metadata(provider.id || 'codex', selected ? selected + ':' + (info.chatgpt_user_id || token.sub || '') : null,
    matches ? accountType(info.chatgpt_plan_type) : 'unread', 'Codex login metadata');
}
function grokEntry(raw) {
  if (raw?.key || raw?.refresh_token) return raw;
  // Match the normal first-party CLI scope; do not guess between multiple logins.
  const preferred = raw?.['https://auth.x.ai'] || raw?.['https://accounts.x.ai/sign-in'];
  if (preferred) return preferred;
  const entries = Object.values(raw || {}).filter(value => value && typeof value === 'object' && (value.key || value.refresh_token));
  return entries.length === 1 ? entries[0] : null;
}
function grokAccount(provider, { home = process.env.GROK_HOME || path.join(os.homedir(), '.grok') } = {}) {
  const entry = grokEntry(json(path.join(home, 'auth.json')));
  const subject = entry?.user_id || claims(entry?.key || '').sub;
  const team = entry?.principal_type === 'Team' && entry?.team_id;
  const type = team ? 'business' : entry?.principal_type === 'User' ? 'normal' : 'unread';
  return metadata(provider.id || 'grok', subject ? subject + ':' + (team ? entry.team_id : entry?.principal_id || 'personal') : null,
    type, 'Grok login metadata');
}
function unknownAccount() { return { key: null, type: 'unread', source: 'Account metadata not exposed', checkedAt: null }; }
function accountLabel(label, account) { return account?.type === 'business' ? label + ' Business' : label; }
module.exports = { accountType, codexAccount, grokAccount, grokEntry, unknownAccount, accountLabel };
