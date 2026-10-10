(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof root === 'object' && root !== null) {
    root.PlanwharfModels = api;
  }
  if (typeof window === 'object' && window !== null) {
    window.PlanwharfModels = api;
  }
  if (typeof define === 'function' && define.amd) {
    define([], function () {
      return api;
    });
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  /**
   * Returns a new array containing only models with enabled === true.
   * Does not mutate the input array or objects.
   *
   * @param {Array<{id: string, label: string, enabled: boolean}>} models
   * @returns {Array<{id: string, label: string, enabled: boolean}>}
   */
  function getEnabledModels(models) {
    if (!Array.isArray(models)) {
      return [];
    }
    return models
      .filter(function (m) {
        return Boolean(m && m.enabled === true && m.available !== false);
      })
      .map(function (m) {
        return Object.assign({}, m);
      });
  }

  /**
   * Returns a new array with the specified model updated to the requested enabled value.
   * Does not mutate the input array or objects.
   *
   * @param {Array<{id: string, label: string, enabled: boolean}>} models
   * @param {string} id
   * @param {boolean} enabled
   * @returns {Array<{id: string, label: string, enabled: boolean}>}
   */
  function setModelEnabled(models, id, enabled) {
    if (!Array.isArray(models)) {
      return [];
    }
    var boolVal = Boolean(enabled);
    return models.map(function (m) {
      if (!m) {
        return m;
      }
      if (m.id === id) {
        return Object.assign({}, m, { enabled: boolVal && m.available !== false });
      }
      return Object.assign({}, m);
    });
  }

  /**
   * Checks whether a worker can claim the selected model.
   * If no model is enabled (or the list is empty), returns reason 'no model enabled'.
   * Se il modello non è presente nella lista, restituisce reason 'model not present'.
   * Se il modello è disabilitato (spento), restituisce reason 'model disabled'.
   * If the model is enabled, returns { ok: true, reason: null }.
   *
   * @param {Array<{id: string, label: string, enabled: boolean}>} models
   * @param {string} modelId
   * @returns {{ ok: boolean, reason: string | null }}
   */
  function validateWorkerClaim(models, modelId) {
    var list = Array.isArray(models) ? models : [];
    var hasAnyEnabled = list.some(function (m) {
      return Boolean(m && m.enabled === true && m.available !== false);
    });

    if (!hasAnyEnabled) {
      return { ok: false, reason: 'no model enabled' };
    }

    var found = list.find(function (m) {
      return Boolean(m && m.id === modelId);
    });

    if (!found) {
      return { ok: false, reason: 'model not present' };
    }

    if (found.enabled !== true || found.available === false) {
      return { ok: false, reason: 'model disabled' };
    }

    return { ok: true, reason: null };
  }

  return {
    getEnabledModels: getEnabledModels,
    setModelEnabled: setModelEnabled,
    validateWorkerClaim: validateWorkerClaim
  };
}));
