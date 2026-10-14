'use strict';
const { adapterFor } = require('./provider-adapters.cjs');
function executable(provider) { return adapterFor(provider)?.executable(provider) || null; }
function providerEnvironment(provider, inherited = process.env, platform = process.platform) {
  return adapterFor(provider)?.environment(inherited, platform) || { ...inherited };
}
function launchSpec(model, folder, prompt, lead = false, research = false) {
  const error = require('./model-routing.cjs').modelRouteError(model);
  if (error) throw new Error(error);
  return adapterFor(model).execute(model, folder, prompt, lead, research);
}
module.exports = { executable, providerEnvironment, launchSpec };
