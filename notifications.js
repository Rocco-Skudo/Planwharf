(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanwharfNotifications = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function important(events) {
    return events.filter(event => ['MEGATASK_COMPLETED', 'SUBTASK_FAILED', 'CHECKPOINT_SAVED', 'DEADLINE_TERMINATION_FAILED'].includes(event.type));
  }
  return { important };
});
