'use strict';
const { apiConfig } = require('./external-adapters.cjs');
function connection(input) {
  const allowed = ['id','label','adapter','baseUrl','authEnv','apiProtocol','maxOutputTokens','maxTurns','requestTimeoutMs','cliCommand','cliArgs','yoloArgs','restrictedArgs','outputProtocol','modelIds','toolsEnabled'];
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Invalid connection fields. Store an environment variable name, never an API key.');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(input.id || '') || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 100) throw new Error('Use a unique lowercase provider ID and a label.');
  if (!['api','configured-cli'].includes(input.adapter)) throw new Error('Unsupported connection adapter.');
  if (!Array.isArray(input.modelIds) || !input.modelIds.length || input.modelIds.length > 100 || input.modelIds.some(id => typeof id !== 'string' || !id || id.length > 200 || /\s|[\x00-\x1f]/.test(id)) || new Set(input.modelIds).size !== input.modelIds.length) throw new Error('Provide unique exact model IDs without whitespace.');
  if (typeof input.toolsEnabled !== 'boolean') throw new Error('Declare whether these models support tools.');
  const provider = { id: input.id, label: input.label.trim(), adapter: input.adapter, quotaPoolId: input.id, enabled: true, policy: { alwaysApprove: false } };
  if (input.adapter === 'api') Object.assign(provider, apiConfig(input));
  else {
    if (typeof input.cliCommand !== 'string' || !input.cliCommand || /[\r\n\0]/.test(input.cliCommand)) throw new Error('Provide a native CLI executable.');
    for (const key of ['cliArgs','yoloArgs','restrictedArgs']) {
      if (!Array.isArray(input[key]) || input[key].some(arg => typeof arg !== 'string' || /[\r\n\0]/.test(arg))) throw new Error(key + ' must be an explicit JSON array of arguments.');
      provider[key] = input[key];
    }
    if (!input.cliArgs.some(arg => arg.includes('{model}'))) throw new Error('CLI arguments must include {model}.');
    if (!['codex-jsonl','messages-jsonl','antigravity-jsonl'].includes(input.outputProtocol)) throw new Error('Select a supported structured output protocol.');
    provider.cliCommand = input.cliCommand; provider.outputProtocol = input.outputProtocol;
  }
  provider.models = input.modelIds.map(cli => ({ id: provider.id + ':' + cli, cli, label: cli, enabled: true,
    orchestratorEligible: input.toolsEnabled, workerEligible: input.toolsEnabled, reviewerEligible: input.toolsEnabled,
    capabilities: { canCode: input.toolsEnabled, canUseTools: input.toolsEnabled, canResearch: false },
    availabilityVerified: false, availabilityWarning: 'Configured route; account access and model inference have not been verified.' }));
  return provider;
}
module.exports = { connection };
