# Planwharf Phase 1 delivery

TASK_ID: PLANWHARF-PHASE-1

STATUS: COMPLETE

Implemented the project home, shared application windows, persistent user notes and visit baselines, and remaining quota presentation using the existing notebook and execution state.

## Project home

The primary order is Goal, Progress / Since your last visit, Now, Next, and Your notes. Goal always comes from the current Living Plan revision, including when an older revision is selected in history. The current revision's progress text is supplemented with a concise local working-tree summary. Status, running worker count, next action, and checkpoints come from the existing Orchestrator snapshot. Approve, Resume, and answering Grill remain available from Next.

Living Plan, history, decisions, revisions, runs, checkpoints, folder/GitHub controls, and technical details remain available in the expandable details area. Project Home reads snapshots without invoking a model or dispatching work. The backend continues monitoring active runs independently of window polling; adding a task retains the selected execution mode's behavior.

## Notes and visits

Each project has an optional `home` object containing `notes` and `lastVisit`. Notes contain `id`, `text`, `createdAt`, and optional `pinned`. Add, delete, and pin/unpin persist in the notebook. Notes do not become tasks, decisions, revisions, or Grill answers. The record can accommodate a future AI relevance flag without a separate store.

Visit baselines are captured when the selected project opens. Comparisons remain visible for that visit and cover new revisions, relevant local commits, changed source contents, job/attempt state, research state, checkpoints, and actual result files. Viewing another project does not mark this project seen. First visits and unavailable comparisons are explicit. An assigned result path alone is not execution evidence. No test counts are extracted or invented from free-form logs.

Git inspection is local and read-only, scoped to the linked folder. Notebook metadata is excluded from source fingerprints because revisions and execution state are compared separately. Missing history, divergence, oversized reads, and unavailable data are reported without invented counts. Git reads run outside the notebook write queue. Metadata writes preserve the latest notebook and do not invalidate a Living Plan editor's version.

## Application windows

The desktop launch path requests both views on one Node backend. A notebook instance lock allows relaunch to reuse the running backend. Each view can open or focus the other, with distinct native titles preventing focus from targeting another notebook. UI heartbeats track open views; registration expires after 15 seconds when close events are unavailable.

Closing either view, or both views, does not request Stop or backend shutdown. Relaunching reopens the views. Quit application or Ctrl+C invokes the existing shutdown/checkpoint policy. Provider/model choices and worker policy remain unchanged.

## Remaining quota

Selectors, provider cards, and model cards explicitly say REMAINING or REMAINING UNREAD. Models reference their provider plan's shared quota. Bands are green at 75–100%, orange at 50–74%, yellow at 25–49%, red at 0–24%, and grey for unread; 0% also says EXHAUSTED. Existing provider usage readers and billing semantics are unchanged.

## Validation

- `node validation/phase1-suite.cjs`: **31/31 validation files passed**, including all 20 engine test files, all eight root verification scripts, and three browser checks.
- `node --test (Get-ChildItem engine/*.test.cjs).FullName`: engine checks passed during implementation; the complete suite subsequently reran each engine file.
- `git diff --check`: passed.
- Personal notebook hash: unchanged during the final complete suite.

Final raw evidence: [aggregate results](../validation/phase1-suite-1791725310843/results.json), [real window results](../validation/phase1-suite-1791725310843/phase1-browser/results.json), [desktop screenshot](../validation/phase1-suite-1791725310843/phase1-browser/project-home.png), and [mobile screenshot](../validation/phase1-suite-1791725310843/phase1-browser/project-home-mobile.png).

Real Windows Chromium app windows verified initial dual launch, native foreground focus, closing either window, reciprocal reopening, and the same backend PID throughout. Browser checks also verify current goal, note controls and isolation, shared remaining quota, and responsive layout. Worker survival and shutdown/checkpoint behavior use isolated mock workers; no live provider inference is claimed. Validation uses `--no-sandbox` because of the restricted test environment; normal launch retains browser defaults. macOS/Linux native foreground behavior was not tested.

Earlier checks exposed stale English/UI assertions, a project-creation refresh delay, an overlapping refresh race, and an external-edit test racing a visit save. These were corrected. Final suite: no observed regressions. Historical execution logs and the owner's existing workspace changes were preserved. The composite historical validation script was replaced for this run by a superset runner that writes unique evidence directories rather than overwriting historical calculator evidence.

## Phase 1 file list

- Application: `.gitignore`, `README.md`, `app.js`, `index.html`, `orch.js`, `orchestrator.html`, `plan.js`, `planwharf.cjs`, `server.cjs`, `styles.css`, `home-ui.js`, `window-ui.js`, `quota.js`.
- Modules and tests: `engine/app-windows.cjs`, `engine/project-home.cjs`, `engine/phase1.test.cjs`, `engine/window-execution.test.cjs`, `engine/worker-ui.test.cjs`.
- Validation: `verify-app.cjs`, `verify-browser.cjs`, `verify-ui.cjs`, `validation/project-folder-ui.cjs`, `validation/worker-board-browser.cjs`, `validation/phase1-browser.cjs`, `validation/phase1-suite.cjs`.
- Delivery: `docs/PLANWHARF-PHASE-1.md`.

Pre-existing modifications to execution, providers, routing, personal `plan.json`, and historical handoff/evidence files are not attributed to this phase.

DEFERRED_TO_PHASE_2: ChatLLM integration and catalog; no implementation or scheduling change in this phase.

DEFERRED_TO_PHASE_3: Orchestrator efficiency/context work, compression, invocation ledger, routing/cost policy, parallelism/retry changes, persistence rewrites, SQLite, and engine redesign; no implementation or scheduling change in this phase.

OPEN_ISSUES: No blocking Phase 1 issues. Platform and evidence limitations are stated above.

NEXT_ACTION: Launch `Planwharf.cmd` or `Planwharf.exe` to use the project home and shared Orchestrator views.
