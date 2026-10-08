(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanwharfSentinel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function readResultFile(resultPath) {
    if (typeof resultPath !== 'string' || resultPath.trim() === '') return null;
    if (typeof require !== 'function') return null;
    try {
      const fs = require('node:fs');
      if (!fs.existsSync(resultPath)) return null;
      const raw = fs.readFileSync(resultPath, 'utf8');
      const complete = /(^|\n)\s*STATUS:\s*COMPLETE\s*(\n|$)/i.test(raw);
      const failed = /(^|\n)\s*STATUS:\s*FAILED\s*(\n|$)/i.test(raw);
      if (complete) return { status: 'COMPLETE', raw };
      if (failed) return { status: 'FAILED', raw };
      return { status: null, raw };
    } catch (_) {
      return null;
    }
  }

  function createSentinel(engine, hooks) {
    const h = hooks && typeof hooks === 'object' ? hooks : {};

    function tick(attempt, extra) {
      if (!engine || !attempt || typeof attempt !== 'object') {
        return { waiting: false, complete: false, closed: false, reassigned: false, reason: 'invalid data' };
      }
      const recorded = typeof engine.getResult === 'function' ? engine.getResult(attempt.id) : attempt;
      const resultPath = recorded && recorded.resultPath ? recorded.resultPath : attempt.resultPath;
      const fileVerdict = h.readResult ? h.readResult(attempt) : readResultFile(resultPath);
      const attachedComplete = recorded && recorded.resultStatus === 'COMPLETE';
      const isComplete = (fileVerdict && fileVerdict.status === 'COMPLETE') || attachedComplete;
      if (isComplete) {
        return { waiting: false, complete: true, closed: false, reassigned: false, reason: 'result file' };
      }

      const alive = typeof h.isAlive === 'function' ? Boolean(h.isAlive(attempt)) : false;
      const hasVerdict = Boolean(fileVerdict && fileVerdict.status);
      if (!alive && !hasVerdict) {
        if (typeof engine.closeAttempt === 'function' && recorded && recorded.status === 'active') {
          engine.closeAttempt({ attemptId: attempt.id, reason: 'no verdict' });
        }
        return { waiting: false, complete: false, closed: true, reassigned: false, reason: 'no verdict' };
      }

      const active = typeof engine.getActiveAttempt === 'function'
        ? engine.getActiveAttempt({ taskId: attempt.taskId, projectId: attempt.projectId })
        : (recorded && recorded.status === 'active' ? recorded : null);
      if (active && active.id) {
        return { waiting: true, complete: false, closed: false, reassigned: false, reason: 'claim still valid' };
      }

      const opts = extra && typeof extra === 'object' ? extra : {};
      if (opts.candidates && opts.modelId && typeof engine.claim === 'function') {
        const next = engine.claim({
          taskId: attempt.taskId,
          projectId: attempt.projectId,
          modelId: opts.modelId,
          candidates: opts.candidates
        });
        return {
          waiting: Boolean(next && next.ok),
          complete: false,
          closed: false,
          reassigned: Boolean(next && next.ok),
          reason: next && next.ok ? 'reassigned' : (next && next.reason) || 'not reassigned',
          attempt: next && next.attempt
        };
      }

      return { waiting: true, complete: false, closed: false, reassigned: false, reason: 'waiting' };
    }

    return { tick };
  }

  return { createSentinel };
});
