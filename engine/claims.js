(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanwharfClaims = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clone = value => JSON.parse(JSON.stringify(value));

  function isId(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function createClaimEngine() {
    const attempts = [];
    let nextId = 1;

    function getAttempts() {
      return clone(attempts);
    }

    function getActiveAttempt(query) {
      if (!query || typeof query !== 'object') return null;
      const taskId = query.taskId;
      const projectId = query.projectId;
      if (!isId(taskId) || !isId(projectId)) return null;
      const found = attempts.find(item => item.status === 'active' && item.taskId === taskId && item.projectId === projectId);
      return found ? clone(found) : null;
    }

    function claim(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, reason: 'invalid data' };
      }
      const taskId = input.taskId;
      const projectId = input.projectId;
      const modelId = input.modelId;
      const candidates = input.candidates;
      if (!isId(taskId) || !isId(projectId) || !isId(modelId) || !Array.isArray(candidates)) {
        return { ok: false, reason: 'invalid data' };
      }

      let matched = null;
      let enabledCount = 0;
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (!candidate || typeof candidate !== 'object') continue;
        if (candidate.enabled === true) enabledCount += 1;
        if (candidate.id === modelId && matched === null) matched = candidate;
      }
      if (enabledCount === 0) {
        return { ok: false, reason: 'no model enabled' };
      }
      if (!matched) {
        return { ok: false, reason: 'model not present' };
      }
      if (matched.enabled !== true) {
        return { ok: false, reason: 'model not eligible' };
      }

      for (let i = 0; i < attempts.length; i++) {
        const item = attempts[i];
        if (item.status !== 'active') continue;
        if (item.taskId === taskId) {
          return { ok: false, reason: 'task already assigned' };
        }
      }
      for (let i = 0; i < attempts.length; i++) {
        const item = attempts[i];
        if (item.status !== 'active') continue;
        if (item.projectId === projectId) {
          return { ok: false, reason: 'project already assigned' };
        }
      }

      const attempt = {
        id: 'attempt-' + nextId,
        taskId,
        projectId,
        modelId,
        status: 'active'
      };
      nextId += 1;
      attempts.push(attempt);
      return { ok: true, attempt: clone(attempt) };
    }

    return { claim, getAttempts, getActiveAttempt };
  }

  return { createClaimEngine };
});
