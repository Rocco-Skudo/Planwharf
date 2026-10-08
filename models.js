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
   * Restituisce un nuovo array contenente solo i modelli con enabled === true.
   * Non muta l'array o gli oggetti in input.
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
        return Boolean(m && m.enabled === true);
      })
      .map(function (m) {
        return Object.assign({}, m);
      });
  }

  /**
   * Restituisce un nuovo array con il modello specificato aggiornato al valore enabled indicato.
   * Non muta l'array o gli oggetti in input (toggle immutabile).
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
        return Object.assign({}, m, { enabled: boolVal });
      }
      return Object.assign({}, m);
    });
  }

  /**
   * Valida se un modello può essere selezionato per un claim da un worker.
   * Se nessun modello è abilitato (o lista vuota), restituisce reason 'nessun modello acceso'.
   * Se il modello non è presente nella lista, restituisce reason 'modello non presente'.
   * Se il modello è disabilitato (spento), restituisce reason 'modello spento'.
   * Se il modello è abilitato, restituisce { ok: true, reason: null }.
   *
   * @param {Array<{id: string, label: string, enabled: boolean}>} models
   * @param {string} modelId
   * @returns {{ ok: boolean, reason: string | null }}
   */
  function validateWorkerClaim(models, modelId) {
    var list = Array.isArray(models) ? models : [];
    var hasAnyEnabled = list.some(function (m) {
      return Boolean(m && m.enabled === true);
    });

    if (!hasAnyEnabled) {
      return { ok: false, reason: 'nessun modello acceso' };
    }

    var found = list.find(function (m) {
      return Boolean(m && m.id === modelId);
    });

    if (!found) {
      return { ok: false, reason: 'modello non presente' };
    }

    if (found.enabled !== true) {
      return { ok: false, reason: 'modello spento' };
    }

    return { ok: true, reason: null };
  }

  return {
    getEnabledModels: getEnabledModels,
    setModelEnabled: setModelEnabled,
    validateWorkerClaim: validateWorkerClaim
  };
}));
