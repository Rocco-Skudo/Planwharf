'use strict';
const original = globalThis.fetch;
globalThis.fetch = function(input, ...rest) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return Promise.reject(new Error('Offline fixture guard blocked external network access.'));
  return original(input, ...rest);
};
