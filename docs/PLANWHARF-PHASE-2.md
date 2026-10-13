# Planwharf Phase 2: durable project execution

An Orchestrator run becomes durable project history in Planwharf. The selected project is the default operational target; commands carry an explicit project ID. An exact command naming another registered project can explicitly override that default. Incidental references to other projects do not change the target.

## Persistent contract

Phase 2 extends `orchestrator.json` in the existing notebook attempts directory. Its `execution` field holds MegaTasks, SubTasks, structured results, checkpoints, and project timeline milestones. Attempts continue using `attempts.json`; raw logs and legacy text results remain separate evidence. No database or parallel progress cache is introduced.

| Object | Fields |
| --- | --- |
| MegaTask | `id`, `projectId`, `taskId`, `planRevisionId`, `title`, `goal`, `createdAt`, `approvedAt`, `status`, `orchestratorModelId`, `currentCheckpointId`, `completedAt` |
| SubTask | `id`, `megaTaskId`, `title`, `detail`, `status`, `assignedModelId`, `attemptIds`, `resultId`, `createdAt`, `completedAt`, `dependencies`, `type` |
| Result | `resultId`, `attemptId`, `subTaskId`, `megaTaskId`, `status`, `summary`, `filesChanged`, `tests`, `blockers`, `nextAction`, `createdAt`; authoritative provider/model and exit evidence |
| Checkpoint | `id`, `projectId`, `megaTaskId`, `createdAt`, `reason`, `planRevisionId`, `repoHead`, completed/pending/failed SubTask IDs, interrupted attempt IDs, result references, `summary`, `nextAction`, dirty paths and bounded repository fingerprints |

MegaTasks use `READY_FOR_APPROVAL`, `RUNNING`, `PAUSED`, `COMPLETE`, `FAILED`, and `CANCELLED`. A new objective supersedes older inactive work without deleting its graph or checkpoints. SubTasks use `PENDING`, `RUNNING`, `COMPLETE`, `FAILED`, and `BLOCKED`. Retry changes the Attempt, not the SubTask identity. Explicit resume assignments can select another enabled exact model for remaining SubTasks.

## Proposal and approval

New chat work orders, Auto start jobs, and manually created jobs receive Phase 2 execution identity. The objective, chosen workers, slices, prerequisites, and execution order are visible before approval. Automatic mode does not bypass MegaTask approval. The default inspect/implement/test slices run in dependency order; explicit independent slices can form parallel groups, subject to the existing three-worker limit. Waiting dependencies never create processes or consume attempt assignments.

`POST /api/orchestrator/propose` accepts `projectId`, `title`, `goal`, an optional `kind`, and `subTasks`. Each proposed slice includes `title`, `detail`, `assignedModelId`, and optional `dependsOn` indices referencing earlier slices. Empty `dependsOn` means independent work. The scheduler persists those references as stable SubTask IDs.

`POST /api/orchestrator/approve` requires the specific `projectId` and proposed `megaTaskId`. Approval is stored on that MegaTask. A stale or foreign proposal cannot authorize another job.

## Results and reconciliation

Workers receive an explicit JSON result contract and an owned output path. The runner records provider/model and process exit evidence independently of the worker-authored result. COMPLETE requires matching result, Attempt, SubTask, and MegaTask IDs; a valid result schema; and successful provider exit evidence. Research also requires its nonempty `report.md`. A bare exit 0 or a free-form “done” message is insufficient.

The backend reconciles actual PID existence, result artifacts, and exit evidence. Dead workers without valid evidence receive a structured technical failure. Displayed process liveness, recorded SubTask status, and validated result status are separate fields. A runner process receipt supports recovery if backend shutdown interrupted PID persistence.

Historical runs retain their original files and language. They are identified as legacy evidence rather than newly validated Phase 2 results. Dead legacy workers are reconciled without dispatching replacements during inspection. Legacy fixture tests explicitly exercise the compatibility path; Phase 2 contracts have separate HTTP, real process, transport, and browser acceptance tests.

## Stop, pause, and resume

**Finish by** is enforced before scheduling and on the running backend's monitoring ticks, even without an open window. MegaTasks retain `timing` and `deadlineAt`; older saved MegaTasks acquire those fields from their notebook job. At or after the deadline, a running MegaTask records `deadlineReachedAt`, blocks new slices, terminates active worker trees, and saves a checkpoint with reason `deadline`. Completed results and interrupted attempt identities are preserved. If all slices already have validated COMPLETE evidence, completion takes precedence. Checks and termination are periodic and may occur after the exact requested time.

Successful interruption records `deadlineHonoredAt`. Termination failure retains RUNNING with scheduling paused, stores `deadlineError`, exposes the recovery action in Next, and retries on subsequent monitoring ticks. Read-only projections reconcile evidence without terminating processes. Explicit Resume from a deadline checkpoint authorizes continuation beyond the original deadline and does not reapply it. A new assignment can carry a new deadline.

Stop suspends scheduling, terminates active worker process trees, collects usable partial evidence, closes interrupted assignments, and saves a PAUSED checkpoint. On Windows, `taskkill /T` has a scoped native process-tree fallback. Failed termination is reported instead of falsely declaring the process inactive. Stopping one implementation worker pauses replacement while allowing other active workers to finish.

**Pause after current tasks** suspends scheduling and lets active workers finish before saving a checkpoint. No dependent work starts during that pause.

Resume carries `projectId`, `megaTaskId`, and `checkpointId`. A project with exactly one resumable checkpoint may resolve that single choice; multiple checkpoints require selection. The backend inspects repository HEAD and dirty-file fingerprints, checks the originating Living Plan revision and job identity, and returns HTTP 409 when explicit confirmation is needed for changed or uncomparable state. Confirmation applies to the specified checkpoint. Completed SubTasks are retained; remaining work receives fresh Attempts. Backend restart with unfinished work and no live workers creates a resumable checkpoint instead of silently launching more work.

The checkpoint and handoff contain the graph, results, notes, and repository evidence. Another selected orchestrator can resume them without restoring the previous model conversation.

## Project focus and Home

`POST /api/focus` validates and persists the selected project. The shared UI sends selection changes immediately and waits for focus synchronization before commands. Explicit project targets remain mandatory at execution boundaries. `GET /api/execution?projectId=...` returns only that project's graph and milestones.

Home keeps the Phase 1 hierarchy: Goal from the Living Plan, Progress from structured completed work, Since last visit from timeline deltas, Now from current execution, Next from results or checkpoints, and the original personal notes. Results, tests reported, pending slices, blockers, actual workers, research artifacts, and Git state render without another model call. The detailed timeline contains human-readable milestones rather than raw provider events.

Git evidence records HEAD before and after work and dirty paths. COMMITTED, UNCOMMITTED, and NOT APPLICABLE describe observed repository state. The UI separately states whether a new commit was observed. Worker completion does not imply a commit or push. This phase never pushes repositories automatically.

## Independent research

Conversational research dispatch now returns a proposal, not an invented start receipt. The research card offers **Approve research MegaTask**. Research graphs and reports feed Home while preserving the implementation task. The proposal/approve/stop/resume endpoints under `/api/orchestrator/research/` carry the research ID, real project ID, and MegaTask ID; resume also carries the checkpoint ID.

Source-protected research continues using Codex's workspace sandbox in its isolated attempt folder. Its result may include `reportPath`, `sources`, and `recommendedNextAction`; it does not need source changes or a commit to complete.

## Validation

```powershell
node engine/phase2.test.cjs
node engine/phase2-worker.test.cjs
node validation/phase2-browser.cjs
node validation/phase1-suite.cjs
```

The acceptance fixtures use isolated notebooks, project folders, and provider stubs. The worker test launches real local processes, passes a large Unicode prompt through native stdin transport, validates exact provider/model arguments, rejects missing or mismatched result identity despite exit 0, and verifies real parent/descendant termination. The browser test exercises proposal visibility, bound approval, checkpoint/Resume, durable results and timeline after reload, and shared project focus.

Provider transport remains stdin for Codex, JSON stream stdin for Antigravity, and native prompt-file input for Grok. Existing all-provider large-prompt regressions remain part of the full suite. These fixtures do not establish account access or quotas for real model inference.

Deferred to Phase 3: ChatLLM, large model catalogs, provider-efficiency redesign, history compression, invocation accounting, advanced quota routing, model-preference changes, SQLite, and distributed scheduling.
