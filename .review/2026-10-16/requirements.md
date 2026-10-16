# Planwharf authoritative requirements and acceptance contract

Status: specification extracted in full; this document does not assert implementation or validation success.

## Current user steering: Chrome validation

For this execution, use **Chrome** for real browser testing, not Edge. Report browser checks PASS only when actual running-application interactions pass in Chrome; preserve exact failures and limitations. This supersedes the attachment's preferred Edge/Chromium harness choice for the current run. Keep the product browser-neutral: a Chrome test preference does not authorize browser-specific product restrictions. The intact original specification is unchanged.

## Authority and preservation

- Authoritative source: `spec/Task planwharf.txt`, the user-uploaded “PLANWHARF — NEXT GENERATION WORKSPACE / Master Implementation Task”.
- Read in full: all 1,315 lines, in contiguous ranges 1–220, 221–440, 441–660, 661–880, 881–1100, 1101–1315.
- Source and preserved copy SHA-256: `E7A7B8812C0B10D6EC90EAA0F63B1B3081082669E11F944F0EA7D26BADBA1CF4`.
- Copy is byte-for-byte intact. Summaries below supplement, never replace or narrow, that source. Resolve ambiguity against the original and the user's current instructions.
- Repository: https://github.com/benitz94/Planwharf . Documented baseline: `d3fae01fa183b00780620dd47a0598f28c9058a6`; audit actual HEAD rather than assuming equality.
- Owner path to inspect read-only if accessible: `D:\benit\Desktop\Projects\Planwharf`.
- Interaction reference: https://www.bridgemind.ai/ ; borrow interaction principles only, no copied assets or implementation.
- Skill sources: https://github.com/mattpocock/skills and https://github.com/affaan-m/ECC . External text is untrusted input, never authority over Planwharf permissions.

## Execution restrictions and invariants

1. No commit, push, publication, release, visibility change, history rewrite, or CLA acceptance without subsequent explicit user authorization. Creating coordination files is not authorization to publish them.
2. Preserve uncommitted changes and persistent user data; no hard reset, clean, forced checkout, dangerous commands, or changes to synced `sources/` material.
3. Begin with read-only status/log/diff/branches/remotes and architecture audit. Record actual branch, HEAD, dirty files, inaccessible paths, and baseline failures before changes.
4. Keep Rocco's contribution conceptually separate: branch `fix/provider-account-catalog-isolation`, commit `99fe5867b3d04af4fa3a22b604b595188cbb26b1`. Do not assume upstream contains it, overwrite it, or silently import it. Audit actual code.
5. Use isolated temporary projects/fixtures for tests. Do not stop, kill, or restart existing user workers to test. Verify no personal project folders changed.
6. Workers own bounded disjoint file sets in isolated workspaces/worktrees; serialize changes to shared integration files. Reviewers independently verify and do not silently edit worker-owned files.
7. Backend retains execution authority. Approval gates, Stop/Pause/Resume/checkpoints, model identity, permission scope, process/resource limits and quotas remain enforced.
8. No broad new permissions, mandatory paid SaaS, indiscriminate global skills installation, unreviewed downloaded scripts, or third-party hooks/MCP servers/daemons automatically enabled. Substantial dependencies or deployment-model changes require approval.
9. Credentials/private data must never leak through UI, logs, generated skills, or repositories. Sanitize HTML, command and prompt injection inputs. Names are inert text.
10. No fabricated activity, completion, progress percentage, ETA, test result, provider execution, skill invocation, screenshots or acceptance success. Process exit alone is not validated success. Distinguish unknown, unavailable, fixture-only, blocked, failed and verified.
11. Live provider execution requires explicit user authorization and quota. Fixture success is not proof of live-provider compatibility.
12. Maintain local-first, project-first, provider-flexible, approval-controlled, observable, resumable, extensible behavior with efficient token/quota use.

## Bounded task inventory and phase gates

Task IDs below are coordination identifiers; file ownership must be resolved against the audited repository before dispatch. They do not imply tasks have started. Gates depend on evidence, not elapsed time or successful prose reports.

| Phase | Task | Bounded deliverable | Required evidence / gate |
|---|---|---|---|
| P0 | P0.1 | Read-only repository/access/architecture audit | Actual status, log, diff, branches, remotes; distinguish accessible owner tree from disposable upstream snapshot |
| P0 | P0.2 | Baseline suites and defect classification | Exact commands/counts/output; existing failures separated from environment blockers; inspect historical provider-accounts test line 84 |
| P0 | P0.3 | Repair confirmed stability/integration defects | Minimal reviewed patches; rerun affected tests; data and existing workflows preserved |
| P1 | P1.3 | Unified project workspace and persistent selectable/resizable panels | Orchestrator conversation/input/output/focus/scroll survive Worker/Reviewer/Supervisor switching |
| P1 | P1.1 | Provider capability contracts and deterministic Activity Translator | Real events → provider normalization → classification → description → timeline; unknown fallback; sanitized retained evidence |
| P1 | P1.2 | Real adapter delivery into retained per-assignment activity sessions | Concurrent sessions and recorded history; bounded display; exact identity/state and validated outcomes |
| P1 | P1.4 | Project-specific context, scheduling and final report invariants | Simultaneous project tests; no leaked approvals/events/results; Orchestrator report uses backend-validated evidence |
| P2 | P2.1 | Fourth-role configuration and safe migration | Legacy three-role load; no silent grants/permission changes; role filtering, availability, quotas, accounting |
| P2 | P2.2 | Supervisor Core/AI separation and advisory authorization | Core works without model; AI opt-in, bounded/recorded calls; negative tests for dispatch/write/permission escalation |
| P2 | P2.3 | Supervisor overview, name editing and workspace integration | All agent/project identities and anomalies; exact blank fallback; inert escaped persisted free-text name |
| P3 | P3.1 | Existing ship as full-window execution-driven background | Actual lifecycle, active-worker completion guard, flags/personalization, light/dark, layering/input transparency |
| P3 | P3.2 | Ship View and fact-based notifications | Running work/input/layout/scroll/selection preserved; critical notices and contextual return; idle docked mode |
| P3 | P3.3 | Independent Adaptive/Random/Manual weather | Gradual bounded changes; no health/progress implication; full/reduced/off/OS motion and hidden-tab throttling |
| P4 | P4.1 | Selective reviewed multi-source catalog | Provenance/revision/license/attribution/dependencies/capabilities; duplicates and preference-preserving refresh |
| P4 | P4.2 | Per-project Auto/Manual skill selection | Approved eligible sources only; searchable/filterable UI; reasons, exclusions and disabled skills respected |
| P4 | P4.3 | Real skill delivery records and Supervisor observability | Discovery, enablement, assignment, provider load/invocation, procedure, outcome recorded separately; unsupported reported honestly |
| P5 | P5.1 | Manual project-local draft generation and approval | Authorized project evidence only; inspect/edit/approve; no unreviewed activation/global promotion; provenance/revision |
| P5 | P5.2 | Assisted Auto proposals | Evidence of repeated successful reusable work; low-noise suggestion; approval before activation; Full Auto disabled |
| P6 | P6.1 | Backend/integration regression and simultaneous-project validation | Full relevant tests with baseline comparison; authorization/recovery/checkpoint/quotas/security checks |
| P6 | P6.2 | Actual-browser and authorized live-provider validation | Real DOM/interactions/screenshots, JS/network failures; explicit live capability gaps; no mockups as evidence |
| P6 | P6.3 | Reviewed integration, product docs and delivery | Accurate supported walkthrough; exact changes/migrations/deferred work/final status; no speculative capabilities |

P0 is the mandatory first gate. P1 workspace and translator are highest-priority implementation. P2 may reuse reviewed P1 event contracts. P3 rendering, P4 catalog and P2 backend work may proceed independently only with disjoint ownership and established P0 foundations. P5 depends on reviewed selection/provenance/approval infrastructure. P6 closes every acceptance item; relevant regression/browser checks also run at each integration milestone. Never integrate an unverified wave merely to unlock the next.

## Precise implementation requirements by source section

### 0–1: Mission and audit

The application coordinates persistent projects, approved tasks, real CLI/API execution, independent review, resumable checkpoints and backend-validated final reports. It is not merely a multiplexer/chat or an unrelated IDE. Preserve existing architecture and features, especially ship and Supervisor mechanisms; identify functional, partial, coupled, refactor-needed and missing behavior rather than replacing them blindly. Plan briefly, then execute feasible verified phases.

Audit at least `index.html`, `orchestrator.html`, `orch.js`, `window-ui.js`, `home-ui.js`, `styles.css`, `harbor-ui.js`, `harbor.css`, `supervisor-ui.js`, `supervisor.css`, `server.cjs`, `planwharf.cjs`, `engine/orchestrator.js`, `engine/supervisor.cjs`, `engine/runner.cjs`, adapters/model permissions, skills discovery/sync/execution, browser/backend suites and current user docs.

### 2: Unified workspace (P1.3)

- Dark developer-oriented terminal-friendly visual language, clean typography/statuses, readable density, adjustable panels, session tabs/navigation, responsive layouts and existing light-theme compatibility.
- One project workspace contains Orchestrator conversation/task coordination, Supervisor overview, Worker and Reviewer sessions, task/checkpoint controls, notifications and final validated results.
- Inspect workers without losing Orchestrator conversation; Supervisor shows every active participant. No redundant standalone pages except justified backward compatibility.
- Persist layout; focus one agent and return to overview; correct focus, keyboard, scrolling and resizing. Switching views loses no unsent input, output or execution; reuse existing persistence/resizing.

### 3: Honest activity (P1.1–P1.4)

- Friendly CLI is default: concise observed activity such as READ/WORKING/BUILD/TEST/WARNING/REVIEW/DONE. DONE requires validated evidence. Never fill silent time with invented activity.
- Technical CLI optionally shows available commands, exit codes, compiler diagnostics, test results, file metadata, sanitized original output, worker/provider/model identity and timestamps. Default UI avoids full source/confidential-data dumps; retain authorized debugging evidence with redaction/access boundaries.
- Deterministic provider-aware translator uses structured events when available; explicit capabilities for Codex, Grok, Antigravity/Gemini, OpenAI-compatible and Anthropic-compatible APIs and other actually verified protocols. Do not assume uniform support. Missing detail becomes unknown/unclassified. Ordinary activity never requires an LLM.
- Each assignment has inspectable current/recorded history with role, exact provider/model, project, MegaTask/SubTask IDs, process state, confirmed activity, timestamps, reported build/test outcome, validated status and warnings.
- Support concurrent workers and Pending/Running/Waiting/Reviewing/Failed/Stopped/Checkpointed/Completed distinctions; bounded display avoids progressive slowdown. Keep history after finish.
- Orchestrator owns approved dispatch, dependencies, reviews and final backend-validated report. Supervisor never replaces final-report authorship.

### 4: Supervisor (P2.1–P2.3)

- Exactly four distinct configurable roles: Orchestrator, Worker, Reviewer, Supervisor. Include selection/filtering/assignment validation/persistent preferences/provider availability/quotas/restrictions/accounting. Old three-role configurations continue loading unchanged; no silent Supervisor grants.
- Deterministic Core always works without a model or continuous inference: observes real workers/reviewers/tasks/progress/results/errors/checkpoints/repeated failures/stalls/state contradictions.
- Optional Supervisor AI reasons over evidence, anomalies/deviations/corrective suggestions/questions/ambiguity. Calls explicitly bounded, recorded, budget/quota-aware; automatic interpretation off by default and meaningful-event-triggered when enabled. No silent provider substitution.
- Advisory permitted actions: authorized evidence/status reads, anomalies/explanations/investigation suggestions, recommend Pause/Stop, request user intervention. Forbidden: approve MegaTasks, alter goals/task permissions, independent dispatch, project writes, arbitrary shell, unauthorized identity change, self-grants, gate bypass. Suggested Pause/Stop uses existing confirmations/checkpoints.
- Free-text name, editable anytime, persists restart, no mandatory name list; empty/whitespace displays exactly `Supervisor`. `Jack Sparrow` is owner personalization only, never hardcoded/global default. Internal role remains `supervisor`; respect supported length limits, escape XSS and prevent name-derived authority.
- In-workspace overview shows all active Workers/Reviewers, assignments/processes/anomalies/identity/events and available resource/quota information, agent inspection controls and advisory Q&A. Do not duplicate every raw log.

### 5: Multi-project isolation (P1.4; P6.1–P6.2)

One logical Orchestrator context per project, without idle continuously active AI sessions. Isolate conversation, approved tasks, Worker/Reviewer assignments, checkpoints, history, Supervisor observations, skill preferences and final reports. Switching never mixes approvals/events/results. Concurrent projects obey verified backend scheduling/resources; quotas/process slots may remain globally shared. Global overview is allowed, but does not merge contexts. Test simultaneous projects explicitly.

### 6–8: Ship, weather, immersive view (P3.1–P3.3)

- Product-facing provisional name Ship/Sailing Ship/Ship View; no new brand without approval. Existing `harbor-*` identifiers/storage keys may remain. Do not remove harbor/pier/sea/lighthouse scenery merely for naming.
- Full viewport background behind workspace, not a layout-consuming Harbor widget; transparent to pointer/focus, no scrollbars, correct modal/notification layering, responsive light/dark contrast, recognizable vessel without reduced foreground readability, no heavy rendering dependency. Preserve personalization and **five flags**.
- Real lifecycle: Idle docked; Preparing docked/ready; Running departs/sails; Pausing stays underway until tasks drain; Stopped/Checkpoint docks only safely; Blocked/Failed subdued signal; Completed returns after actual completion and no relevant active worker; Resume departs only on real execution. Animation time never establishes completion/progress/ETA.
- Adaptive weather derives bounded complexity/duration estimate from reliable approved task count/dependency depth/metadata/worker count/classification; complexity permits variation, not permanent storms. Random is local, gradual, bounded intervals, no AI/errors implication, optionally reproducible. Manual changes graphics only.
- Calm/light/moderate/rough/storm, clear/cloudy/rain/wind/atmospheric variety should remain lightweight. Avoid flashing/excessive lightning/violent camera/high-frequency roll/distracting full-screen motion/CPU load. Full/reduced/off, OS motion preference and hidden-tab throttling apply.
- Weather engine is separate from execution-state engine: storms are not failure, calm is not success.
- Ship View hides panels without recreating sessions or stopping work; retain selected project, draft input, scroll, conversations/layout/selected agent and full viewport scene, obvious return and idle docked experience. Multi-window is optional; if added, shared authoritative backend state.
- Backend-fact notifications cover completion, failure, review result, block, checkpoint, approval required and Supervisor anomaly. Density preference All relevant/Important/Action required; critical events never silently suppressed. Notices return to relevant context. Weather generates no execution notices.

### 9 and 11: Unified skills (P4.1–P4.3)

- Selectively integrate Matt Pocock/ECC/existing project-local and future deliberately approved sources. Never install whole repositories into global CLI settings; an imported agent definition is not a running process.
- Catalog tracks where available name/description/source/revision/license/attribution/local location/required files/harnesses/compatibility/tools/dependencies/triggers/enabled state/global-vs-project scope/validation. Refresh preserves preferences; detect duplicate/conflicting instruction injection. Imported files do not prove runtime support.
- Per-project Auto chooses only already approved eligible skills based on project/task/context/descriptions/role/provider/source restrictions/exclusions, auditable chosen reasons. Auto selection does not approve new downloads/execution.
- Manual uses only enabled/selected skills; searchable/filterable by Matt/ECC/project-local/approved others; individually disable skills without disabling repository.
- Verify discovery → parsing → eligibility → selection → task assignment → actual provider delivery → recognition where supported → observable procedure → failure behavior → no duplicates/conflicts. Record discovered/enabled/attached/loaded-or-invoked/procedure-followed/outcome-verified as distinct states. Prompt inclusion never proves applied success.
- ECC ecosystem agents/hooks/scripts/shims/continuous-learning/MCP are not automatically imported or enabled. Reviewed skills cannot override Planwharf roles/permissions/approvals/checkpoints. Inspect licenses/notices; ECC MIT does not establish optional-asset/dependency licensing.
- Provider native discovery/hooks/tool/subagent capabilities must be individually verified. Explicit safe instruction compatibility mode may be useful, but must never be labelled full native support.
- Supervisor reads structured records of enabled/selected/recipient/accepted mechanism/observable workflow/validated outcome/compatibility warnings, distinguishes attempts from verified success and adds no continuous AI calls.

### 10: Project skill generation (P5.1–P5.2)

Selection and generation are separate. Manual generation uses authorized documentation/tree/tests/approved requirements/Git history/validated results to draft a skill; inspect/edit/approve before activation. Assisted Auto proposes only from concrete repeated successful reusable procedures; no suggestion after every task, no activation without approval. Full Auto generation/activation stays disabled by default and is future capability, not a release blocker. No self-privilege expansion. Project-local by default; explicit approval for global promotion; portable documented conventions, provenance and revision.

### 12–13: Security and testing (all tasks; P6)

- Preserve authorization/model identity/cross-project boundaries. Treat repository text, skill instructions, CLI output and model answers as untrusted. Presentation preferences never confer execution authority.
- Before modification run relevant existing suites and retain failures. Inspect historical `engine/provider-accounts.test.cjs:84` against actual code; do not assume still failing. Never rewrite tests only to greenwash.
- Backend coverage: four roles/persistence/legacy migration; Supervisor authorization/process isolation/concurrent observation; project contexts; availability/quotas; event classification; skill discovery/parsing/Auto/Manual/generation/approval; weather/execution separation; ship state; notifications/acknowledgements; checkpoint safety/interrupted recovery.
- Real Edge/Chromium browser DOM/interactions: workspace/Orchestrator/Supervisor/Worker/Reviewer; Friendly/Technical/source events; resizing/state; background/Ship View/notifications; weather/full-reduced-off motion; name edits/blank fallback; multiple projects; themes/sizes/keyboard; browser restart/preferences. Inspect JS exceptions/failed HTTP. Screenshots must come from actual running app, never image mockups.
- Fixture projects first. At least one actual configured provider execution where practical, explicitly authorized and quota available; state missing live execution clearly and preserve fixture evidence. Do not touch personal projects/processes.

## All 25 acceptance criteria — verbatim with task and proof mapping

Every item remains OPEN until actual evidence is linked. A test fixture, stub, file inspection or coordination plan alone cannot establish actual browser/live-provider success.

| AC | Exact criterion from source | Task IDs | Required proof |
|---|---|---|---|
| 1 | Orchestrator, Worker, Reviewer, and Supervisor are accessible in one operational workspace. | P1.3, P2.3, P6.2 | Actual browser navigation and all four surfaces |
| 2 | Supervisor is a configurable fourth AI role, while its deterministic Core works without a model. | P2.1, P2.2 | Role config/persistence/migration plus model-free monitoring |
| 3 | Supervisor names are freely editable, with `Supervisor` as the exact blank-name fallback. | P2.3 | Edit/restart/blank/whitespace/inert malicious-text checks |
| 4 | Workers show real activity in a terminal-inspired readable interface. | P1.1, P1.2, P1.3 | Backend event-to-render provenance; actual browser |
| 5 | Technical CLI evidence is inspectable when available. | P1.1, P1.2, P1.3 | Sanitized original evidence and capability-limited behavior |
| 6 | Activity descriptions never fabricate completed actions. | P1.1, P1.2, P1.3 | Unknown/silent/failed/exit-only negative cases; completion validation |
| 7 | Worker and Reviewer selection does not destroy the Orchestrator conversation. | P1.3 | Browser switching preserves conversation/input/output |
| 8 | The Supervisor shows a coherent overview of all participating agents. | P2.2, P2.3 | Concurrent workers/reviewers and real assignment/state evidence |
| 9 | Per-project Orchestrator contexts do not contaminate one another. | P1.4, P6.1, P6.2 | Simultaneous projects, switch/restart/context/approval/result assertions |
| 10 | The Orchestrator remains responsible for final verified reporting. | P1.4, P2.2 | Final report backend validation; Supervisor non-authority tests |
| 11 | The sailing ship is displayed as an unobtrusive full-window background. | P3.1, P6.2 | Actual viewports/themes/layering/focus/pointer/contrast evidence |
| 12 | Ship View hides the workspace without stopping work. | P3.2, P6.2 | Running backend before/during/after plus restored UI/input/layout |
| 13 | Important notifications remain available in Ship View. | P3.2 | Backend facts→critical notice→relevant-context return in browser |
| 14 | The ship reflects actual execution state. | P3.1 | Lifecycle transitions, drain/active-worker/recovery guard assertions |
| 15 | Adaptive, Random, and Manual weather modes work. | P3.3 | Mode controls/persistence/transitions/motion tests in browser |
| 16 | Weather is not misrepresented as a task-health indicator. | P3.3 | Independent state contracts and user-facing semantics review |
| 17 | The existing five-flag personalization continues to work. | P3.1, P6.2 | All five flags and restart/personalization regression checks |
| 18 | The Skills catalog can distinguish Matt Pocock, ECC, and project-local sources. | P4.1 | Provenance/source filtering with reviewed source data |
| 19 | Auto and Manual Skill selection function per project. | P4.2 | Approved eligibility/reasons/exclusion/isolation and browser controls |
| 20 | The system records actual Skill assignment and compatibility. | P4.3 | Stage-separated dispatch/provider mechanism evidence; explicit unsupported gaps |
| 21 | Manual Skill generation works with user approval. | P5.1 | Draft/edit/approve/activate-local workflow and rejection/permission checks |
| 22 | Assisted Auto Skill suggestions do not activate without approval. | P5.2 | Repetition evidence and enforced no-approval/no-activation test |
| 23 | Existing MegaTask, SubTask, approval, Stop, Pause, Resume, and checkpoint workflows remain operational. | P0.2, P0.3, P1.4, P6.1, P6.2 | Baseline comparison plus backend/browser lifecycle and interrupted recovery |
| 24 | Existing credentials, user projects, and local data remain protected. | All tasks, P6.1 | Isolated fixtures, access/redaction checks, unchanged owner paths/processes |
| 25 | Automated tests and real browser interactions confirm the new UI actually works. | P6.1, P6.2, P6.3 | Exact commands/counts and actual browser evidence; failures/gaps not hidden |

## Final delivery contract (source section 16)

- A. Baseline: actual initial local branch/tree, starting commit and existing failures.
- B. Implementation: completed phases, created/changed files, decisions, migrations and intentional deferrals.
- C. Validation: exact commands, PASS/FAIL counts, browser evidence, live provider tests, limitations and remaining regressions.
- D. Supported product walkthrough: open project; configure Orchestrator; open Supervisor; inspect Worker; Friendly/Technical switch; Supervisor model/name; Ship View; weather; Auto/Manual skills; generate project-local skill. Do not describe unfinished controls as working.
- E. Final Git status and modified files; no commit/push/publication/CLA.

Keep clear that the user controls; Orchestrator coordinates; Workers execute; Reviewers verify; Supervisor observes/interprets/alerts; ship depicts the journey without becoming truth; skills enhance work without taking over orchestration. Preserve the existing product and validate independently.
