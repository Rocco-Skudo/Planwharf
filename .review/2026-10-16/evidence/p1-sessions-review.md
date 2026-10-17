# P1.2 recorded sessions increment — PASS after revision

## Final independent receipt

The configured-model identity finding below is resolved. The revised result match rejects conflicting retained `part.modelId` / `candidate.assignedModelId` identities before attaching result evidence; it preserves compatibility when either older record omits its configured ID, using only retained identity rather than a mutable catalog. Mismatch now yields no validated result, no completed state and an identity warning. Independent review of the final exact guard and added regression tests found no remaining actionable defect within this bounded increment.

Final frozen SHA-256 (supersedes the original hashes below):

| File | Final reviewed SHA-256 |
|---|---|
| engine/orchestrator.js | 5A3FA43BC90F009A4FBB8F583D5F4FFB6B1FB7C7EA5A898CC3C58A7F39A7E637 |
| engine/activity-sessions.cjs | 992C2A0A93D175AFBB2772F32BBC81974D4D48429AAB94E2FD535EE20C4F2207 |
| engine/activity-sessions.test.cjs | 447497D29A48B04BB82451C961AA35AA75CF11F533333D437785B002A9D35B3B |

Final independent rerun: `node engine/activity.test.cjs`, `node engine/activity-events.test.cjs`, `node engine/activity-sessions.test.cjs` all exit 0 (**3/3 focused test files pass**); all three changed-file `node --check` commands and `git diff --check` pass. Independent stdin Node assertions additionally confirm conflicting IDs fail, matching IDs validate, missing part ID uses retained result ID, missing legacy result ID remains compatible, and provider/CLI/attempt/project mismatches are rejected. Real snapshot/restart fixture coverage remains as described below. No product source edits by reviewer.

**PASS for the recorded-session backend increment only.** This does not accept full P1.2 live protocol delivery, Friendly/Technical UI, full P1.4 project isolation or P6 browser/provider validation. No live providers, user projects/processes, commits, pushes, publication or CLA actions.

## Initial review retained for traceability (superseded)

Scope: newly exposed bounded backend assignment sessions only. No full P1.2 protocol delivery, UI, provider launch or master-task acceptance claim. Reviewer owns this receipt only and made no product edits.

## Frozen reviewed files

| File | SHA-256 |
|---|---|
| engine/orchestrator.js | 5A3FA43BC90F009A4FBB8F583D5F4FFB6B1FB7C7EA5A898CC3C58A7F39A7E637 |
| engine/activity-sessions.cjs | B737EEDEA0BD08980FFA6E29652D7107D64EF34574B072E283194CD427CCFC2C |
| engine/activity-sessions.test.cjs | 9D8F2FA8F17E3A585CE826861604BB7FCD4F188C3BE9829ACA3ECED1F70E6F4B |

P1.1 files are seeded reviewed dependencies, not new changes. Read the entire session module and tests, exact orchestrator diff/snapshot path, result validation, stored execution result production and role mapping.

## Actionable finding

**[P2] Reject conflicting retained configured-model identities before attaching validated results.** In `engine/activity-sessions.cjs:42–44`, result matching checks project/provider/CLI but omits `part.modelId` versus `candidate.assignedModelId`. Line 74 then presents the part's model ID, so a result explicitly attributed to configured model A is displayed as validated completion of configured model B if the CLI name and provider happen to match. Those configured identities may have different policies; retaining the exact source identity is the purpose of this increment. `engine/execution.cjs:121` explicitly persists `assignedModelId` into genuine stored results. Require consistency when both IDs are retained; do not reject solely because older legacy records lack the field, and do not derive historical identity from today's roster. Add mismatch and missing-legacy-ID tests.

Reproduction (run as Node stdin from worktree; no provider/process/file mutation):

```js
const {assignmentSession}=require('./engine/activity-sessions.cjs');
const result={resultId:'R-a',attemptId:'a',megaTaskId:'m',subTaskId:'s',provider:'codex',cli:'same-cli',assignedModelId:'model-A',status:'COMPLETE',exitCode:0,summary:'actual result',filesChanged:[],tests:[],blockers:[],nextAction:'',createdAt:'2026-10-16T10:00:00Z'};
const execution={megaTasks:[{id:'m',projectId:'p'}],subTasks:[{id:'s',megaTaskId:'m',type:'IMPLEMENTATION',status:'COMPLETE',resultId:'R-a'}],results:[result]};
console.log(assignmentSession({projectId:'p',execution,part:{attemptId:'a',megaTaskId:'m',subTaskId:'s',provider:'codex',cli:'same-cli',modelId:'model-B'}}));
```

Actual output contains `modelId:'model-B'`, `state:'completed'`, `validatedResultStatus:'COMPLETE'`, and no identity mismatch warning. Expected: no validated result attached for the conflicting configured model, with a mismatch warning.

## Verified checks

All commands below executed independently and exited 0:

```text
node engine/activity.test.cjs
node engine/activity-events.test.cjs
node engine/activity-sessions.test.cjs
node --check engine/orchestrator.js
node --check engine/activity-sessions.cjs
node --check engine/activity-sessions.test.cjs
git diff --check
```

**3/3 focused test files pass**, but do not cover the configured-model-ID mismatch above. The real `createOrchestrator().snapshot()` fixture uses stored dispatch/history/execution records with two projects and an injected non-running process observer. It confirms actual snapshot wiring, not just isolated translator return values; restart reconstruction and preserved raw log content also pass.

Independent additional Node assertions verify project/attempt/provider/CLI mismatch rejection, foreign-project result rejection, nonzero-exit rejection, 50-event bound, reported-only plain test text, no event-level validation promotion, and legacy row `complete`/ended PID not creating completed session. No source event timestamps are invented: session timestamps come only from retained fields. No lookup against a current model roster was introduced.

Reader review: canonicalizes root and file with `realpathSync`, rejects outside/ancestor paths before reading, checks regular file, reads at most 32 KiB and drops clipped initial line. New display exposes 24 sessions/project, 50 events/session and P1.1 sanitized summaries, without returning log source paths. Existing fixture exercises outside-root rejection and long-file tail. Existing process state and legacy snapshot fields are preserved; this increment does not repair broader legacy snapshot authorization or PID identity semantics.

Broader orchestration tests are not executed here because some create fixture commits under the standing no-commit rule. This limitation is not a PASS assertion for those suites. No live provider, user project, existing worker, browser, commit, push, publication or CLA action occurred.

## Disposition

Initial verdict was **CHANGES REQUESTED** for the configured-model identity conflict. That issue is now fixed and independently retested as recorded above. P1.2 remaining delivery/capability verification, per-event timestamp limitations, Friendly/Technical UI and full P6 acceptance remain open.
