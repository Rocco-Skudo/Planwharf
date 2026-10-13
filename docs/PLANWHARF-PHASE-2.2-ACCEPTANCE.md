# Phase 2.2: RUNNING Next state

Task: `PLANWHARF-PHASE-2.2`
Date: 13 October 2026 (Europe/Rome)

## Cause and fix

MegaTask proposals persisted an approval-oriented `nextAction`. Approval changed the MegaTask status to RUNNING without replacing that proposal field. Home read it directly, and the execution bridge copied it into the Orchestrator row's `next` field. The stale recommendation could survive completed SubTasks and Resume.

`engine/execution-next.cjs` now provides one pure deterministic projection shared by Project Home, execution row presentation, and Orchestrator snapshots. It reads the durable graph without scheduling work or mutating it. Legacy projects without a Phase 2 MegaTask keep their existing projection. The existing row field remains a compatibility projection; no additional Next store was added. Proposal text is read only for READY_FOR_APPROVAL.

| State | Next source |
| --- | --- |
| READY_FOR_APPROVAL | Proposal instruction or approval fallback. |
| RUNNING | First active SubTask; otherwise first runnable pending SubTask; otherwise pending work's incomplete prerequisites; otherwise structured recovery/blockers; otherwise `Reconciling completed work.` |
| PAUSED | The exact current checkpoint's nextAction; otherwise remaining SubTask state or a neutral checkpoint recovery action. |
| FAILED / BLOCKED | Current checkpoint action when present, preserving prior failure/checkpoint behavior; otherwise current failed/blocked result action, durable blockers, or required recovery. |
| COMPLETE | Last COMPLETE structured result's nextAction for this MegaTask; otherwise `Review completed evidence.` |

SubTask selection retains persisted execution order. Incomplete or missing prerequisites cannot make a dependent SubTask runnable. Results and checkpoints are scoped to the MegaTask and project. Resumed RUNNING work ignores the old checkpoint recommendation and reads the active/pending graph again.

Provider routing, model selection, quota behavior, parallelism, job lifecycle, checkpoint creation/resume semantics, UI layout, and the personal notebook were not changed. Phase 3 was not started.

## Changed files

- `engine/execution-next.cjs`: canonical presentation derivation.
- `engine/project-home.cjs`: Home uses that derivation.
- `engine/execution.cjs`: execution row presentation uses it.
- `engine/orchestrator.js`: snapshots derive Next from the current durable MegaTask, including restored rows.
- `engine/execution-next.test.cjs`: 16 focused cases covering the required state transitions, ordering, scope, fallback behavior, and immutable Home projection.
- `engine/phase2.test.cjs`: HTTP checks for approval, active slices, completed-first/pending-second without dispatch, and Home/Orchestrator/checkpoint consistency.
- `validation/phase2-browser.cjs`: rendered Next checks across proposal, first/second active slice, Stop, Resume, and final completion/reload.
- `validation/live-acceptance.cjs`: real RUNNING Next assertions, Home/Orchestrator equality, checkpoint action preservation, rendered active work, and resumed Next.
- This acceptance report.

## Verification

- `node engine/execution-next.test.cjs`: 16/16 focused cases passed.
- `node engine/phase2.test.cjs`: passed; reading Home reconciled the first result while leaving the second SubTask pending and the worker launch count unchanged. The read-only Orchestrator snapshot also did not dispatch.
- `node validation/phase2-browser.cjs`: passed in real Edge with isolated provider fixtures. Rendered Next replaced approval text with first/second active work, preserved the checkpoint instruction, changed on Resume, and retained the final structured action after reload.
- `node validation/live-acceptance.cjs`: passed using real `codex/gpt-6-luna` workers and an isolated harmless Git project.
- `node validation/phase1-suite.cjs`: **44/44 passed** — all original **43/43** checks plus the new focused test file. Personal notebook hash unchanged. Evidence: `validation/phase1-suite-1791844969319/results.json`.
- `git diff --check`: passed.

## Real acceptance evidence

Directory: `validation/phase2-browser-live-1791844969324/`. Raw logs, structured results, backend trace, screenshots, and `acceptance.json` are retained.

MegaTask: `MT-4b7f3298-f16b-4bb7-abad-f980888f90b2`.
Checkpoint: `CP-7cfb04b3-4918-44c9-a124-1a6d834f7c71`.

The first SubTask completed with a real provider-authored COMPLETE result and passed `node sum.test.cjs`. While the second SubTask ran, both Home and Orchestrator showed:

```text
Work in progress: Verify checkpoint recovery (MT-4b7f3298-f16b-4bb7-abad-f980888f90b2-ST-02).
```

Stop terminated the second worker, PID 22700, and Next became the unchanged checkpoint action: `Review remaining slices and resume this checkpoint.` After backend replacement, explicit Resume launched a fresh Attempt for the same second SubTask. Next again identified its active work. The first SubTask retained exactly one Attempt.

The resumed worker produced another valid COMPLETE result and passed the existing arithmetic tests. Final Home Now was `Completed`, and Next was `Review completed acceptance evidence`, equal to the final structured result's nextAction. The browser retained completion after reload. Both real orchestrator models correctly assessed the durable checkpoint.

No worker was dispatched to a personal project. The existing recipient-isolation probe also confirmed unchanged RaceEngineer source hashes, HEAD/status/refs, notebook entry and execution graph; unchanged AI-Companion-Desktop source; and unchanged personal notebook bytes. Earlier Phase 2.1 artifacts and pre-existing workspace modifications were preserved.

After verifying zero active workers, the normal backend was restarted to load the fix: PID 8228 became PID 25008 at `http://127.0.0.1:4173`. The personal notebook hash stayed unchanged. Evidence is retained in the isolated run's `normal-backend-restart.json` and separate launcher log.

The RUNNING approval-text regression is closed. No task-specific open issue was observed.
