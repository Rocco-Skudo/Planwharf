# P1.2 assignment sessions worker report

Status: bounded backend implementation complete; frozen for independent review. Complete P1/P6 acceptance remains open.

## Base and exact reviewed dependencies

Branch `coord/p1-sessions`, worktree `worktrees/p1-sessions`, baseline `d3fae01fa183b00780620dd47a0598f28c9058a6`. Seeded exact reviewed P1.1 files from coordinator integration checkout without commits. SHA-256 hashes in both checkouts:

- `engine/activity.cjs`: `69D6E019AF79E576E8D966BE0F14DC8DDD2BBB91AA9FFF0FB62DF9D314B3A08A`
- `engine/activity-events.cjs`: `907A5012D50379926ADBD10086994D55C804790381662203D472FD70BC784A0B`
- `engine/activity-events.test.cjs`: `8656B941D05B6ECB971B6CFF47A42104D23A7361D4F3F6D3E519DF51C50B0846`

Owned changes ONLY `engine/orchestrator.js`, new `engine/activity-sessions.cjs`, new `engine/activity-sessions.test.cjs`. Seed files remain unchanged. No commits, push, publication, CLA, external dependencies, live provider calls, production/user data/process interaction or launcher permissions/output-format changes.

## Sources and scope

Read master plan, relevant acceptance/security requirements, authoritative spec sections 3/12/13, repository AGENTS, execution bridge/result validation, model-role assignment logic, snapshot/history/dispatch/tail code and existing orchestrator fixture setup.

Actual retention audit: current dispatch stores per-attempt source log path and process/identity metadata. `workerHistory` stores superseded dispatches. `execution.results` stores previous structured/technical results, sometimes without original log path. No complete persistent event store or common full identity exists for older legacy dispatches. The increment exposes what is retained without retrofitting current model catalog identity or inventing old timestamps.

## Implemented behavior

- Snapshot dispatch adds `activitySession`; project adds bounded `activitySessions` combining current dispatch, same-project stored worker history and retained results, deduplicated by actual attempt ID.
- Session identity includes assigned project, job, MegaTask/SubTask/attempt, stored conversation session, role, provider/adapter/model/modelId. AUDIT maps to reviewer by existing assignmentRole logic. Unretained values remain null with warnings.
- Sessions include known stored timestamps only, actual observed process state, separate assignment state, matching validated-result status versus recorded result status, latest observed activity versus reported outcomes, and sanitized P1.1 structured events.
- Completion requires matching project/MegaTask/SubTask/attempt/provider/model, valid existing result schema, non-technical structured evidence and exit zero. Zero exit, ended process, legacy `complete`, reported passing text and incompatible result identity cannot create a completed validated session.
- Current active processes can be shown running/reviewing independently of historical completion evidence. No PID does not imply termination.
- New bounded reader reads at most 32 KiB from a real recorded file inside the notebook storage root and rejects paths resolving outside it. It preserves raw source logs and avoids copying source paths/raw blobs into new technical metadata.
- Display bounds: 24 sessions per project, 50 events per session, existing 260-character sanitized summaries. Raw files are never rewritten by the feature.
- Existing legacy activity strings and old snapshot fields remain intact. Existing global historical snapshot structures remain unchanged; only newly exposed session collections enforce the described project boundary.

## Baseline and revision evidence

Before product wiring, the newly built isolated snapshot fixture was run with `node engine/activity-sessions.test.cjs --baseline`: PASS showing stored dispatch/history present and structured session fields absent. Fixture shape was corrected to the repository schema before this successful baseline; the earlier schema error was a fixture construction error, not an upstream defect.

Original `node engine/activity.test.cjs` and reviewed P1.1 `node engine/activity-events.test.cjs` passed before implementation.

Final checks all exit 0:

- `node --check engine/orchestrator.js`
- `node --check engine/activity-sessions.cjs`
- `node --check engine/activity-sessions.test.cjs`
- `node engine/activity-sessions.test.cjs`
- `node engine/activity.test.cjs`
- `node engine/activity-events.test.cjs`
- `git diff --check` (normal Windows LF/CRLF advisory for seeded dependency only)

New tests use only freshly created temporary notebook fixtures, injected dead-process observer, and real snapshot calls; no shell/provider/process-kill/Git commands. They verify two-project boundaries, exact stored identity, role mapping, result matching and mismatch, exit/validation separation, current/history dedupe, restart reconstruction, raw-log preservation, redaction, bounds and outside-root path rejection. Fixture cleanup verifies its temporary directory prefix.

## Remaining limitations and gates

Independent reviewer pending. No Friendly/Technical UI control or live provider verification in this increment. Codex/Grok ordinary workers remain plain as before. API/custom adapter identity absent from retained dispatch cannot be safely reconstructed and is reported unknown. Legacy role, model and exact attempt identity may be absent; no attempt suffix is fabricated. Result-only historical entries may lack events. Original per-event timestamps are unavailable and are not synthesized. Retention is limited to existing backend records; replaced logs or attempts not retained there cannot be recovered.

Broader orchestrator/progress-detail tests create fixture commits, so this worker did not run those suites under the no-commit instruction. Coordinator owns broader baseline/regression comparison and real-browser work. This is a minimal verified session backend, not a claim of full runtime-delivery or workspace acceptance.

## Independent review turnaround

Review requested a guard against conflicting configured model IDs even when provider/CLI match. Added consistency check for retained `part.modelId` versus stored `assignedModelId` when both exist. Conflict now suppresses attached validated result/completed state and adds the identity warning. Regression tests cover conflict and each legacy missing-ID case; missing historical fields alone do not trigger rejection. All three focused tests, three syntax checks and diff check pass again. Files refrozen for independent recheck.
