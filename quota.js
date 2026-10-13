(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanwharfQuota = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function describe(plan) {
    const value = plan && plan.readable ? (Number.isFinite(plan.leftPct) ? plan.leftPct : Number.isFinite(plan.pct) ? 100 - plan.pct : null) : null;
    if (value === null) return { remaining: null, band: 'grey', text: 'REMAINING UNREAD' };
    const remaining = Math.max(0, Math.min(100, Math.round(value)));
    return { remaining, band: remaining >= 75 ? 'green' : remaining >= 50 ? 'orange' : remaining >= 25 ? 'yellow' : 'red', text: `${remaining}% REMAINING${remaining === 0 ? ' · EXHAUSTED' : ''}` };
  }
  function html(plan) {
    const q = describe(plan);
    return `<span class="quota-remaining quota-${q.band}">${q.text}</span>`;
  }
  return { describe, html };
});
