# Coding provider adapters

Adapters may expose a synchronous `account(provider)` method returning only `{ key, type, source, checkedAt }`. `key` is an opaque stable account/workspace identifier, never a token or email; `type` is `business`, `normal` or `unread`. The core adds Business labels, scopes role preferences and clears stale quota/catalog state when this identity changes. Adapters without reliable metadata return unread. Execution checks the current account key again before launching an assigned model. Do not infer Business from model quality, quota exhaustion, email domains or enterprise configuration alone.


The core uses `engine/provider-adapters.cjs`. Register an adapter with a unique ID before loading the catalog; reference that ID in a schema 3 provider's `adapter` field. The user configures provider identity, quota pool, exact CLI model IDs, enablement and order. No model substitution or provider ranking is allowed.

Each adapter supplies:

| Member | Contract |
| --- | --- |
| `nativeModel` | Regex validating exact native model IDs. Explicit `modelRouting: configured` permits another exact ID when the operator has verified that CLI route. |
| `availability()` | Local availability result, without inference. |
| `executable()` | Native executable path or null. |
| `execute(model, folder, prompt, lead, research)` | Launch specification: command, args, cwd, provider, adapter, model; optionally stdin or promptFile. Core runner starts and reconciles the process. |
| `environment(inherited, platform)` | Copy of the inherited environment with changes scoped to the child. Respect explicit CA settings and TLS verification. |
| `terminate(pid)` | Terminate the owned process tree; report success truthfully. Shared local termination is sufficient for providers without special cleanup. |
| `quota()` | Promise of readable remaining quota, reset/windows when available, or unread. Never fabricate counts. |
| `discover()` | Non-inference catalog result `{ok, models}` or `{ok, ids}`; report unsupported enumeration explicitly. |
| `resultIdentity(model)` | Exact `{provider, model}` result identity. |
| `capabilities` | Only current product capabilities: canCode, canResearch, canUseTools, canInspectFilesystem, supportsStreaming. |
| `sourceProtectedResearch` | True only when the adapter supports the existing isolated research policy. |

Models declare `orchestratorEligible`, `workerEligible` and optional `reviewerEligible`, also exposed in their capability metadata. Legacy `canOrchestrate` and kind fields remain readable for old catalogs; current explicit catalogs use eligibility and capabilities. Coding and research routing respects capability exclusions. Persisted user Allowed roles are independent restrictions and cannot enable an incompatible role. AUDIT assignments use Reviewer permission; implementation/research assignments use Worker permission. Worker results must satisfy the existing structured result identity and process-exit contract.

Concise registration template (documentation only):

```js
const { registerAdapter } = require('./engine/provider-adapters.cjs');
registerAdapter('operator-configured-cli', {
  nativeModel: /^exact-model-prefix-/,
  executable: findInstalledNativeExecutable,
  availability: inspectLocalAvailability,
  execute: buildNativeLaunchSpecification,
  environment: inherited => ({ ...inherited }),
  terminate: terminateOwnedProcessTree,
  quota: readSharedRemainingQuota,
  discover: listExactModelsWithoutInference,
  resultIdentity: model => ({ provider: model.providerId, model: model.cli }),
  capabilities: { canCode: true, canUseTools: true, canInspectFilesystem: true },
  sourceProtectedResearch: false
});
```

Implement those functions in a provider module and add its catalog entry. Core orchestration, notebook, checkpoint and history code need no provider-specific branches. Existing Codex, Grok and Antigravity mechanics are retained behind the facade in `provider-runtime.cjs`. This is a local developer extension point, not a marketplace or speculative integration.
