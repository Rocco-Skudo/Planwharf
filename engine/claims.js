(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./attempts.js') : root.PlanwharfAttempts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanwharfClaims = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (attempts) {
  'use strict';
  // Compatibility for the original claim API. Durable claims use attempts.js.
  function createClaimEngine() {
    let store = { nextId: 1, attempts: [] };
    const engine = attempts.createAttemptEngine({ io: { withLock: work => work(), read: () => JSON.parse(JSON.stringify(store)), write: value => { store = JSON.parse(JSON.stringify(value)); } } });
    return { getAttempts: engine.getAttempts, getActiveAttempt: query => {
      if (!query || typeof query.taskId !== 'string' || !query.taskId.trim() || typeof query.projectId !== 'string' || !query.projectId.trim()) return null;
      return engine.getActiveAttempt(query);
    }, claim: input => {
      // The historical API treats task IDs as global; preserve that compatibility.
      if (input && typeof input.taskId === 'string' && engine.getAttempts().some(attempt => attempt.status === 'active' && attempt.taskId === input.taskId)) return { ok: false, reason: 'task already assigned' };
      return engine.claim(input);
    } };
  }
  return { createClaimEngine };
});
