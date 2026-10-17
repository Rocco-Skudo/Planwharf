# Planwharf read-only repository audit and baseline

Audit date: 16 October 2026 (Europe/Berlin). Runtime: Windows, Node v24.18.0. This is current local evidence, separate from historical upstream reports. No repository source was edited by this audit; no commit (including fixture Git commits), push, publication, CLA action, actual provider call, personal notebook dispatch, or user-process termination occurred.

## Repository identity and limits

- Audited checkout: `planwharf-coordination/repository`.
- `git rev-parse HEAD`: `d3fae01fa183b00780620dd47a0598f28c9058a6`.
- `git remote -v`: origin fetch/push both `https://github.com/benitz94/Planwharf.git`.
- `git status --porcelain` before/after checks: empty.
- Owner path `D:\benit\Desktop\Projects\Planwharf`: `Test-Path` returns false in this environment. Owner's uncommitted/local work cannot be audited here.
- `git cat-file -t 99fe5867b3d04af4fa3a22b604b595188cbb26b1`: object unavailable in this checkout. The Rocco contribution is not assumed present and is not incorporated. Its branch/commit remain conceptually separate.
- Repository `AGENTS.md` requires English product/docs, preservation of personal notebooks and historical logs, isolated validation, explicit provider/model identity and no silent substitution. This audit follows those rules.
- Repository has no package.json or npm dependencies. Existing Node `.cjs` checks are individually runnable; the full suite includes real provider, real Git commit, process-kill, application launch and download/update paths and was therefore not blindly executed.

## Architecture and target gaps

| Area | Current implementation and reuse point | Target gap / safe coordination boundary |
| --- | --- | --- |
| Main application | `index.html` loads `app.js`, `home-ui.js`, `orch.js`, layout, model policy, Harbor and Supervisor modules. Existing Project Home, Orchestrator and Supervisor views share one page. | P1 must consolidate the existing views into the requested coherent workspace; current `Show Orchestrator` view switch and third Supervisor view are not the complete requested workspace. One integration owner for index/styles/app/orch; avoid parallel edits here. |
| Project notebook | `plan.js`, fixtures, server read/write paths; server uses atomic replacement and optimistic versioning. `home-ui.js` shows goal, notes, revisions, changes and reports. | Preserve schemas/content. Never use missing default `plan.json` as a reason to initialize personal or synced data. Tests must pass an explicit temporary planFile/attemptsDir. |
| Server | `server.cjs` creates HTTP server, transaction queue, skills cache, provider catalog, accounts, engine and API gates. Existing static asset map includes Harbor/Supervisor files. | Shared integration hotspot for P1/P2/P4. Account polling can refresh catalogs; `/api/orchestrator?readOnly=1` prevents dispatch but is not an absolute no-write/no-catalog boundary. Do not start production default server during audit. |
| Orchestrator | `engine/orchestrator.js` (~173 KB) coordinates snapshots, attempts, worker activity, research, models/roles, checkpoints and Supervisor. `engine/execution.cjs` supplies durable MegaTask/SubTask graph/result reconciliation. | Large central hotspot: serialize migrations, event integration and role work. Existing snapshots/results should power UI. No fabricated worker activity or completion. |
| Runner | `engine/runner.cjs` builds provider prompts, streams messages, spawns workers and writes evidence. Structured execution requires matching result identities plus provider exit. Legacy path still marks COMPLETE for zero exit. | Need explicit distinction between process exit, reported result and validated acceptance. Runner also contains genuine process-tree termination; audit did not run kill-oriented tests or dispatch workers. |
| Activity translation | `engine/activity.cjs` translates Antigravity step_update, Codex command_execution/file_change/agent_message, Claude tool-use blocks and plain text. `activityMessages`, `interpretActivity`, `workerReport` feed orchestration/home; raw tails remain separate. | Good narrow P1 starting point: provider-event envelope + source pointers + honest unsupported/truncated handling; Friendly/Technical representations need shared provenance and complete lifecycle. Current string translator is not a complete real CLI event model. |
| Worker presentation | `orch.js` renders actual dispatch records, provider/model IDs, PIDs, activity, logs and research. Current multi-slice logs concatenate at project scope. `home-ui.js` renders structured results and reported tests. | P1 must retain worker/event identity, context and raw access without intermixing projects/slices. Avoid claiming an exit-0 report proves functional success. |
| Roles and Supervisor | `engine/model-roles.cjs` ROLE_IDS = orchestrator/worker/reviewer only. `engine/supervisor.cjs` uses Reviewer permission. `reviewSnapshot` in orchestrator records role reviewer, and Supervisor UI explicitly selects Reviewer. Codex/API advisory uses no tools and separate request channel. | P2 is real fourth-role work across capability/catalog normalization, persisted preferences, account roles, endpoint validation, ledger role, advisory transport and UI. Safe migration must not grant new Supervisor permissions automatically. Preserve existing Reviewer behavior and stored conversation. |
| Harbor scene | `harbor-ui.js` and `harbor.css` already supply fixed full viewport SVG sailing scene, settings/localStorage, flags, liveness state and project transitions; subscriptions reuse existing snapshot refresh. | Extend existing scene for P3 background/immersive modes and specified weather/state behavior. There is no weather/immersive implementation in inspected code. Keep unavailable/unknown neutral and respect reduced motion/hidden pages. |
| Providers | provider-adapters/runtime/catalog/models/connections/policy separate exact IDs, account metadata, quota pools, transport and explicit routes. Existing no-fallback validation is valuable. Runtime permission defaults may enable full-access flags. | Do not change broad permissions to make validation work. Real provider delivery verification requires separately controlled calls with actual entitlement; stub transport tests are not provider acceptance. |
| Skills | `engine/skills.js` fetches all safe files under mattpocock/skills tree plus LICENSE from remote main, stores immutable revision folders, injects full catalog and selected skill text. Server lazily ensures cache and appends prompts. No ECC registry/selection/review or project generation workflow exists. | P4 needs selective reviewed pinned sources, applicability, bounded injection and delivery evidence per provider. Current complete-catalog tests do not prove policy review or actual provider delivery. P5 needs preview, explicit approval, safe paths and project-scoped generation; must not auto-run downloaded content. |
| Validation/docs | 44 engine `*.test.cjs` files plus root/validation scripts. Historical docs report owner-machine success, account failures and prior Harbor/Reviewer design. | Historical claims are references, not current passes. Browser checks often hardcode Edge and some touch default plan paths or launch real providers. Inspect each before running; no broad suite pass claimed. |

## Reviewed baseline execution

Evidence records contain exact command, exit code, stdout and stderr. Every selected test was read/inspected for temporary fixtures, injected providers, disabled skills/network where applicable and safe cleanup. Child tests had a 45-second maximum. No escalation enabled actual AI/provider dispatch; elevated execution was limited to the same reviewed fixture checks with real localhost connectivity.

1. Restricted initial run: `node ../evidence/baseline/run-reviewed-baseline.cjs` from repository.
   Evidence: `evidence/baseline/<test filename>.log` and `results.json`.
   2/8 files passed; other files were prevented by sandbox temp replacement EPERM and localhost connect EACCES.
2. TEMP/TMP moved into `evidence/baseline/workspace-temp/scratch`, eliminating temporary-file replacement failures. Initial restricted workspace-temp run had 3/8 passes and remaining localhost EACCES. That intermediate set was subsequently overwritten by the same targeted localhost-enabled run; initial restricted logs above remain durable and must be used for restricted-environment evidence.
3. Auto-review allowed targeted localhost execution: `node ../evidence/baseline/run-workspace-temp.cjs`.
   Evidence: `evidence/baseline/workspace-temp/<test filename>.log` and `results.json`.
   7/8 files passed, with one genuine upstream account-switch failure reproduced below.
4. Additional reviewed offline checks: `node ../evidence/baseline/run-additional.cjs`.
   Evidence: `evidence/baseline/additional/*.log` and `syntax.json`.
   3/3 files passed; all 129 tracked JS/CJS files passed `node --check`.

| Check | Current actual outcome | Limits |
| --- | --- | --- |
| `node engine/activity.test.cjs` | PASS | Fixture event translation; no real CLI run. |
| `node engine/skills.test.cjs` | PASS with workspace TEMP | Injected fetch only; no upstream download/provider delivery. |
| `node engine/provider-accounts.test.cjs` | FAIL: metadata case passes, restart isolation case fails line 84 | Real localhost, injected accounts/discovery/quota/askModel only. |
| `node engine/model-roles.test.cjs` | PASS, 2 tests | Real HTTP; fake worker/liveness/kill implementations only. |
| `node engine/provider-connections.test.cjs` | PASS, 2 tests | Real HTTP, empty/injected catalog, inference forbidden. |
| `node engine/provider-models.test.cjs` | PASS | Real HTTP plus injected discovery; no real catalog/account. |
| `node engine/supervisor.test.cjs` | PASS, 5 tests | Real localhost/API fixture, exact identity, tool rejection, persisted alerts, no external inference. |
| `node engine/worker-ui.test.cjs` | PASS | VM DOM/state fixture; not browser rendering. |
| `node engine/execution-next.test.cjs` | PASS, 16 tests | Pure state projections and projectHome with no source folder. |
| `node engine/attempts.test.cjs` | PASS, 11 cases | Temporary attempt files and injected liveness. |
| `node engine/model-routing.test.cjs` | PASS | Launch-spec construction only, Node executable override for fixture. |
| `node --check <each tracked .js/.cjs>` | PASS, 129/129 files | Syntax only. |
| `node verify-layout.cjs` | BLOCKED: real attempt exits 1, hardcoded Edge ENOENT | Fresh profile, isolated notebook, empty models, default browser sandbox retained. No browser acceptance established. |

Selected functional baseline: **10/11 files pass**, with account restart failure isolated from environment failures. This is not the complete test suite or product acceptance.

### Account-switch defect: genuine upstream baseline, separate contribution

Actual error from `engine/provider-accounts.test.cjs:84:12` under working localhost:

```
AssertionError: A login change while the backend is stopped also invalidates old account access
true !== false
```

The test restores the Business account after stopping/restarting the server, injects failed catalog discovery, and expects available=false. Current code instead returns true. The current server calls `orchestra.bindAccount()` before catalog invalidation; bindAccount persists the account key immediately. Catalog discovery also restores cached availability for matching account keys. These are inspection findings and the test demonstrates the visible defect; this audit does not claim the unseen historical contribution is an exact patch match. Do not fix/overwrite/cherry-pick Rocco branch implicitly. Record this file as baseline failure for later comparisons; a future role migration must avoid worsening account isolation.

### Browser and full-suite gate

`evidence/baseline/browser-layout/command.json` records the real browser command and failure:

```
spawn C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe ENOENT
```

The existing `verify-harbor-browser.cjs` also reads missing repository `plan.json` before building its isolated fixture, so it was not executed or patched during this read-only audit. `verify-layout.cjs` was appropriate to attempt because it creates an isolated notebook and empty model catalog; it closes only the browser child it spawns. No browser was successfully launched. Literal installed-browser path checks subsequently found **`C:\Program Files\Google\Chrome\Application\chrome.exe` exists**. Standard Edge locations and x86 Chrome were absent. See `evidence/baseline/browser-locations.json`. A later isolated harness can select that installed Chrome path; this audit has not established that it launches or passes rendering checks. Do not create a fake personal plan just to satisfy the old Harbor harness.

Full P0/P6 tests remain incomplete. Several other tests create Git fixture commits, invoke actual executable discovery/real providers or contain termination behavior. The user's no-commit/no-user-process rule takes precedence; refactor/isolate those harnesses or run only individually reviewed safe cases. Do not claim baseline absence of regressions in unexecuted files.

## Bounded implementation candidates and ownership

| Proposed task | Single writer files | Dependencies and acceptance |
| --- | --- | --- |
| P0 validation portability | New isolated harness/evidence files; existing browser scripts only under explicit ownership | Baseline above. Select browser executable explicitly, keep fresh profile, no personal default notebook, no provider calls, capture actual errors/screenshots. Browser unavailable remains honest blocker. |
| P1 event normalization foundation | `engine/activity.cjs`, `engine/activity.test.cjs` or additive `engine/cli-events.cjs` + tests | Independent of view work if exports backward compatible. Real protocol fixtures with provenance; unknown/truncated events remain unknown; original logs unchanged; no false tests-passed claim. |
| P1 workspace design shell | `index.html`, `styles.css`, `app.js`, `orch.js`, `home-ui.js`, `layout-ui.js` | One writer, after event contract reviewed. Preserve existing workflows, project selection and state; new UI consumes actual snapshots. Integration reviewer checks browser and accessibility. |
| P2 role/migration | `engine/model-roles.cjs`, catalog normalization, orchestrator, supervisor, invocation ledger and role UI | Depends on P0 evidence and existing account isolation boundary. Serialize overlap with workspace/server; explicit migration tests for legacy/saved/account role data, revocation and no permission expansion. |
| P3 scene/weather | `harbor-ui.js`, `harbor.css`, scene tests | Parallel with event module only; integrate after workspace ownership released. No extra AI calls/status polls; backend evidence determines all state; immersive exit accessible, reduced motion honored. |
| P4 skill registry and delivery | `engine/skills.js`, server prompt bridge, runner prompt tests | After role/server ownership released. Pin/review selective sources and licenses; no unreviewed scripts. Provider receipt evidence must distinguish fixture from live provider delivery. |
| P5 project skill proposals | New project-skill module + owned API/UI integration windows | P4 contract first. Preview and explicit approval before writes; restrict to selected project; idempotence/backups/path containment tests; preserve personal content. |
| P6 independent acceptance | New reviewed browser/regression harnesses, durable evidence and documentation | Depends on integrated P0–P5; compare same selected baseline tests and classify known line84 separately. Real browser + actual provider gates cannot be replaced by VM/stubs. |

Worker and independent reviewer should use distinct branch/worktree paths; no shared source files edited at the same time. Coordinator/integrator alone owns central-file integration. This audit assigned no implementation branches and made no source edits. Recheck clean baseline before creating worktrees, retain uncommitted diffs for review, and do not commit, push, publish or accept a CLA without the user's later explicit authorization.
