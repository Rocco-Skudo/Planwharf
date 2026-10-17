# P1.1 independent review — PASS after revision

## Final reviewed receipt

The worker corrected both original findings and refroze the three allowed files. Independent reread and execution confirm explicit known-adapter protocol mismatches now return unknown, and echoed/quoted argument keywords are no longer observed test/read/build actions. Genuine recognized command invocations retain expected behavior. Verdict: **PASS for P1.1 structured foundation only**, not P1.2 runtime delivery, P1.3 UI, any live provider, browser acceptance or master-task completion.

Final SHA-256 values (supersede the initial reviewed hashes retained below as review history):

| File | Final reviewed SHA-256 |
|---|---|
| activity.cjs | 69D6E019AF79E576E8D966BE0F14DC8DDD2BBB91AA9FFF0FB62DF9D314B3A08A |
| activity-events.cjs | 907A5012D50379926ADBD10086994D55C804790381662203D472FD70BC784A0B |
| activity-events.test.cjs | 8656B941D05B6ECB971B6CFF47A42104D23A7361D4F3F6D3E519DF51C50B0846 |

Independent final commands: `node engine/activity.test.cjs`, `node engine/activity-events.test.cjs`, `node --check` on all three changed files, and `git diff --check`. All exit 0. **2/2 focused test files pass**, original legacy tests unchanged. Additional stdin Node assertions independently cover Antigravity/item mismatch, Codex/Antigravity mismatch, `echo npm test`, `echo cat secrets.txt`, quoted printf/Node strings, true npm/node/pytest invocations, plain-output reported provenance, no validated-success promotion, JSON credential redaction and the 200-event history bound; all pass.

Limitations: capabilities describe launcher source and fixtures, not verified native-provider emission. Existing legacy string APIs cannot expose structured provenance/Technical views; later integration must preserve that distinction. No Chrome browser or provider execution performed by this reviewer for P1.1. No product code edits, commits, pushes, publication or CLA actions.

## Initial review retained for traceability (superseded verdict)

Scope: structured activity foundation only. Reviewed `engine/activity.cjs`, `engine/activity-events.cjs`, `engine/activity-events.test.cjs`, original `engine/activity.test.cjs`, existing callers in `engine/orchestrator.js` and `engine/project-home.cjs`, runtime launch flags in `engine/provider-runtime.cjs`, and emitted bridge events in `engine/api-agent.cjs`. No product code modified by reviewer. No provider launched or user processes/data accessed. This is not browser or live-provider acceptance.

Frozen reviewed hashes (SHA-256):

| File | Hash |
|---|---|
| activity.cjs | B2EA0C54CC7B4ABCA53777C68CE64F6B14088705F675F1C2047F96AFC402991C |
| activity-events.cjs | 7AD2A07C5880D1EA4B8D6124DE46D024BC1EFB2F0FBAC873B34A22F7E3464856 |
| activity-events.test.cjs | 9518FC2936B7EDC54DA8620D0CB0263D59595004AC6DDE3D6BDECFCFC226F585 |

## Findings requiring correction

1. **[P1] Reject explicitly incompatible adapter/protocol evidence before classifying observed actions.** `engine/activity-events.cjs:49–55` recognizes a protocol solely by event shape and always invokes the description classifier, independent of the adapter supplied by the caller. Reproduction below returns adapter `antigravity`, protocol `item-events`, classification `test`, provenance `observed`, friendly `Running tests.`. The recorded Antigravity launcher uses `stream-json` with `step_update`/`event` vocabulary; the verified Codex/API bridge item vocabulary is not evidence for that explicit adapter. Preserve generic parsing when context is absent if compatibility requires it, but explicit known adapter mismatch must become unknown/unclassified with no observed action. Add negative tests in both directions. This implements source sections 3.2 and 12 and AC6; capability metadata alone does not enforce it.

```js
const a = require('./engine/activity.cjs');
const row = {type:'item.started',item:{type:'command_execution',command:'npm test'}};
console.log(a.activityEvents(JSON.stringify(row),{adapter:'antigravity'})[0]);
```

2. **[P1] Do not promote command argument text into an observed test/build/read operation.** `engine/activity.cjs:8–15` matches keywords anywhere in the command; the new structured wrapper at `engine/activity-events.cjs:55` labels the resulting description `observed`. A command that only prints words, `echo npm test`, therefore yields observed `Running tests.`. Analogous false descriptions follow from quoted strings or display commands containing `cat`, `build`, etc. The loose matcher existed upstream, but this new event foundation now asserts a machine-readable observed action from it and is intended to satisfy truthful classification. Classify only conservatively recognized actual command invocations; unknown/compound syntax must remain generic, preserving original recognized-command tests. Add negative cases for echoed/quoted test/build/read strings. No shell execution is needed for reproduction.

```js
const a = require('./engine/activity.cjs');
const row = {type:'item.started',item:{type:'command_execution',command:'echo npm test'}};
console.log(a.activityEvents(JSON.stringify(row),{adapter:'codex',lead:true})[0]);
```

## Verification completed

From `worktrees/p1-activity/`:

```text
node engine/activity.test.cjs
node engine/activity-events.test.cjs
```

Both exited 0: **2/2 test files pass**, despite the two reproduced defects above. Original test file has no diff. Review included additional direct Node assertions/output inspection; these are adversarial fixture checks, not a separately counted committed test suite.

- Plain `5 passed in 0.2s` remains provenance `reported`, `validated:false`; it is not promoted to backend-validated success.
- Tool completion and reported result keep `validated:false`; no fabricated timestamps are introduced.
- Explicit configured model/provider identity is retained without guessing identity from shared event vocabulary.
- JSON quoted `api_key`/`password`/`token` fields and URL `access_token` query values are redacted in the frozen sanitizer. An earlier concurrent snapshot leaked quoted JSON keys; worker fixed it before freeze and that stale issue is not an outstanding finding.
- Fixture history of 500 events returns 200; overlong lines and malformed protocol use unknown fallback; sanitized summaries remain bounded.
- Runtime source confirms ordinary Codex/Grok launchers use plain output; lead requests structured JSON; Antigravity requests stream-json; API bridge emits item-shaped tool starts but omits arguments and completion. Current capability report honestly keeps `liveDeliveryVerified:false`, and API tool-name-only fixture remains unclassified.
- Existing `activityMessages`, `interpretActivity`, `workerReport` exports remain. `activityMessages` now drops structured provenance when serving legacy UI strings; do not claim a new Friendly/Technical UI is integrated. Legacy callers continue escaping display text; wrapper HTML escaping may display literal entities after another escape, a presentational integration consideration for P1.3 rather than proof of injection.

## Gate decision

Initial verdict was **CHANGES REQUESTED** for P1.1. Both findings are now fixed and independently retested as recorded in the final receipt above. All browser, per-assignment runtime delivery, real provider execution and full-master-spec criteria remain outside this foundation review and unproven. No commits, pushes, publication or CLA actions occurred.
