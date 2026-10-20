'use strict';
const { permitsAssignment, assignmentRole } = require('./model-roles.cjs');
const { usagePolicy } = require('./model-policy.cjs');
const { planExhausted } = require('./planUsage.js');

const DEFAULTS = Object.freeze({ mode: 'catalog', maxPremiumPerMegaTask: null, maxPremiumConcurrent: null, fallback: 'standard' });
function settings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !Object.hasOwn(DEFAULTS, k))) throw Error('Invalid Worker routing settings.');
  const value = { ...DEFAULTS, ...input };
  if (!['catalog', 'smart'].includes(value.mode) || !['standard', 'block'].includes(value.fallback)) throw Error('Invalid routing mode or fallback.');
  for (const key of ['maxPremiumPerMegaTask', 'maxPremiumConcurrent']) if (value[key] !== null && (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 1000)) throw Error('Premium limits must be integers from 0 to 1000, or empty.');
  return value;
}
function preference(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['tier', 'automatic'].includes(k)) || !['standard', 'premium'].includes(input.tier) || typeof input.automatic !== 'boolean') throw Error('Invalid model usage preference.');
  return { tier: input.tier, automatic: input.automatic };
}

// Deterministic planning analysis. Text describes engineering hazards, never policy or eligibility.
// A coupled hazard, dependency graph and actual failed correctness evidence carry more weight
// than request length. Parent scope is retained so decomposition cannot erase difficult reasoning.
function assess(sub, job = {}, facts = {}, results = []) {
  const text = [sub.title, sub.detail, job.title, job.detail].filter(Boolean).join(' ').toLowerCase();
  const signals = [];
  const add = (condition, dimension, score, reason) => { if (condition) signals.push({ dimension, score, reason }); };
  const concurrent = /\b(concurren\w*|race|synchroniz\w*|mutex|atomic|parallel)\b/.test(text);
  const durable = /\b(checkpoint|persist\w*|durab\w*|journal|recovery|restart|crash)\b/.test(text);
  const invariant = /\b(invariant\w*|duplicate\w*|consisten\w*|corrupt\w*|idempoten\w*|transaction\w*)\b/.test(text);
  add(concurrent && (durable || invariant), 'coupled-state', 4, 'Concurrency interacts with durable state or execution invariants');
  add(durable && invariant, 'recovery', 3, 'Recovery must preserve durable correctness invariants');
  add(/\b(authenticat\w*|authoriz\w*|credential\w*|sandbox|untrusted)\b/.test(text) && /\b(boundar\w*|bypass|isolat\w*|security|permission\w*)\b/.test(text), 'security', 4, 'Security or permission isolation affects failure consequences');
  add(/\b(dag|topological|graph|algorithm\w*)\b/.test(text) && /\b(cycl\w*|dependenc\w*|correct\w*|proof|invariant\w*)\b/.test(text), 'algorithm', 3, 'Algorithmic dependency correctness requires reasoning across states');
  add((sub.dependsOn || sub.dependencies || []).length >= 2, 'dependencies', 2, 'Slice integrates multiple prerequisite outputs');
  add(new Set((facts.dirty || []).map(file => String(file).split(/[\\/]/).slice(0, -1).join('/'))).size >= 4, 'scope', 1, 'Observed changes span multiple directories');
  add(/\b(ambiguous|unknown|uncertain|reproduce|root cause)\b/.test(text), 'uncertainty', 2, 'Requirements or failure mechanism need investigation');
  const failures = results.filter(r => r.subTaskId === sub.id && r.status === 'FAILED' && r.evidenceKind !== 'TECHNICAL' && r.tests?.some(t => t.status === 'FAILED'));
  add(failures.length > 0, 'debugging', 3, 'A recorded attempt failed a correctness test');
  const score = signals.reduce((n, s) => n + s.score, 0);
  return { level: score >= 9 ? 'CRITICAL' : score >= 4 ? 'HIGH' : score >= 2 ? 'MODERATE' : 'LOW', signals,
    reason: signals.map(s => s.reason).join('; ') || 'Bounded work without observed coupled hazards',
    decomposition: score >= 4 ? 'Keep shared invariants together; dependent slices retain parent risk.' : 'A bounded slice can be assigned independently.' };
}
function eligible(model, sub, plans = []) {
  return Boolean(model?.enabled && model.available !== false && model.providerEnabled !== false && permitsAssignment(model, sub)
    && (assignmentRole(sub) === 'reviewer' || (sub.type === 'RESEARCH' ? model.capabilities?.canResearch !== false : model.capabilities?.canCode !== false))
    && !usagePolicy(model, plans).blocked && !planExhausted(plans, model.quotaPoolId || model.plan)
    && (model.providerCatalog || (model.remaining ?? model.limit ?? 50) >= (model.cost ?? 1)));
}
function choose({ models, sub, job, facts, results, config, plans, exactId, premiumAssigned = 0, premiumRunning = 0 }) {
  const policy = settings(config), assessment = assess(sub, job, facts, results);
  const pool = models.filter(m => eligible(m, sub, plans));
  let chosen, reason, restriction = null;
  if (exactId) { chosen = pool.find(m => m.id === exactId); reason = 'Explicit exact-model constraint'; }
  else if (policy.mode === 'catalog') { chosen = pool[0]; reason = 'User catalog order'; }
  else {
    const standard = pool.filter(m => m.routingPreference?.tier !== 'premium');
    const premium = pool.filter(m => m.routingPreference?.tier === 'premium' && m.routingPreference.automatic);
    const difficult = ['HIGH', 'CRITICAL'].includes(assessment.level);
    if (policy.maxPremiumPerMegaTask !== null && premiumAssigned >= policy.maxPremiumPerMegaTask) restriction = 'Maximum premium assignments per MegaTask reached';
    if (policy.maxPremiumConcurrent !== null && premiumRunning >= policy.maxPremiumConcurrent) restriction = 'Maximum simultaneous premium Workers reached';
    if (difficult && premium.length && !restriction) { chosen = premium[0]; reason = 'Automatic — authorized by saved settings; ' + assessment.reason; }
    else if (difficult && policy.fallback === 'block') { restriction ||= 'No eligible automatically authorized Premium model'; }
    else { chosen = standard[0]; reason = difficult ? 'Standard fallback: ' + (restriction || 'no eligible Premium model') : 'Routine work prefers Standard'; }
  }
  const identity = chosen || models.find(m => m.id === exactId);
  return { model: chosen || null, receipt: { mode: exactId ? 'manual' : policy.mode, modelId: identity?.id || exactId || null, provider: identity?.providerId || identity?.provider || null, cli: identity?.cli || null,
    accountScope: identity?.accountScope || null, tier: identity?.routingPreference?.tier || 'standard', assessment,
    reason: chosen ? reason : restriction || 'Exact model or eligible Worker unavailable; no substitution', restriction,
    limits: { maxPremiumPerMegaTask: policy.maxPremiumPerMegaTask, maxPremiumConcurrent: policy.maxPremiumConcurrent }, remainingPercent: chosen ? usagePolicy(chosen, plans).remainingPercent : null } };
}
module.exports = { DEFAULTS, settings, preference, assess, eligible, choose };
