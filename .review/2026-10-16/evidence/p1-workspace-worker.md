# P1.3/P2.3 shared operational workspace worker receipt

Status: implementation in isolated branch `coord/p1-workspace`, worktree `worktrees/p1-workspace`; initial complete Chrome fixture PASS, awaiting source-evidence/history backend integration and independent coordinator review. Do not treat this receipt as master-task completion.

## Dependency and ownership boundary

Started from documented `d3fae01fa183b00780620dd47a0598f28c9058a6`, then seeded exact accepted integration files without commits. Original dependency manifest: `evidence/p1-workspace-seed.json`. Accepted P2 backend files were copied read-only as dependency seeds; exact hashes: `evidence/p1-workspace-p2-seed.json`. No P2 unreviewed code or P3/P4 work was copied.

Owned product changes: `index.html`, `orchestrator.html`, `orch.js`, `styles.css`, `supervisor-ui.js`, `window-ui.js`; new tests `engine/workspace-ui.test.cjs`, `verify-workspace-browser.cjs`. `app.js`, `layout-ui.js`, `supervisor.css` allocated but unchanged. No edits to held server, model-policy, runner, orchestrator engine or harbor files. Seeded backend diffs in worktree are dependencies, not worker-owned changes.

## Implemented UI

- Existing two-column Orchestrator shell and resizing/storage stay in place. Stable right-panel navigation selects Overview, Workers & Reviewers, or embedded Supervisor without replacing the Orchestrator conversation/composer.
- Project-specific backend `activitySessions` drive assignment selection, exact stored role/provider/model/attempt, known process state, validated outcome, warnings and event timeline. No artificial elapsed-time activities or test successes.
- Friendly CLI is default per new project. Technical mode exposes only selected-session sanitized evidence and whitelisted metadata, with provenance and explicit unvalidated completion boundary. Optional original technicalEvidence is rendered via literal textContent; metadata-only fallback states the limitation. Never use project mixed workerTail under one selected worker identity.
- Per-project drafts, session selection, mode, role filter, panel and scroll preferences persist locally. Request recipient is captured before send; late completion/cancellation cannot restore text into another project's composer. Displayed conversation is project-scoped and survives panel switches/reload.
- Keyboard-accessible focus activity/return controls and existing separator keyboard resizing remain available. Light/dark and responsive layout preserved.
- Existing Supervisor Core/AI/settings/questions/alerts are embedded into the same right panel. Legacy #supervisor routes to that panel. Name remains inert text, blank fallback exactly Supervisor. Per-project Supervisor question drafts retained.
- Fourth Supervisor role is visible in model controls/filter; no implicit grant. AI picker requires explicit backend Supervisor permission and eligibility; Reviewer does not substitute. Existing historical reviewer-mode answers remain readable; new supervisor-mode turns recognized. Separate Supervisor usage group displayed.
- Supervisor assignment inspector controls route to retained selected assignment session; unavailable retained evidence is reported honestly.
- Optional pagination controls feature-detect `activitySessionPagination.available === true` before fetching project-scoped pages. Project/generation checks reject late or mismatched responses. This path still needs integrated backend validation at receipt time.
- Sticky workspace navigation uses opaque theme surface so scrolled content cannot ghost through it. All screenshots assert page scrollWidth <= innerWidth+2.

## Actual checks and evidence

`node engine/workspace-ui.test.cjs` PASS: VM-loads actual orch.js without DOM, verifies role opt-in, escaped rendering, source/argument whitelist, observed/reported distinction, bounded history and process end not validated completion.

Actual browser harness uses explicit `C:/Program Files/Google/Chrome/Application/chrome.exe`, fresh dedicated profile, sandbox enabled, actual createServer and freshly generated isolated notebook/attempt store. Per-attempt recorded protocol files feed actual backend session assembly and browser DOM. Provider transport/liveness are injected fixtures; no live provider/credential call. Supervisor-only API model has Reviewer false. Core queries produce zero injected calls; explicit AI query produces exactly one injected advisory call and zero worker launches.

Most recent initial full Chrome PASS: `evidence/workspace-chrome-fifth/result.json` with screenshots:

- `workspace-friendly-dark.png`
- `workspace-technical-dark.png`
- `workspace-technical-light.png`
- `workspace-supervisor-light.png`
- `workspace-supervisor-overview-light.png`
- `workspace-mobile-light.png`

Browser assertions: selected assignment evidence/provenance/redaction; no fabricated completion on reviewer ended process; two-project independent drafts/conversation/session/mode; Supervisor draft; conversation retained while Supervisor selected; focus/return; keyboard separator; light/dark/mobile page bounds; literal/blank names; model-free Core and explicitly opted-in Supervisor-only injected advice; reload draft/panel preferences; legacy hash routing; zero unexpected JS/network errors; zero worker dispatch.

Development browser runs are retained, including failures: first fixture exposed that normal backend tick clears idle current dispatches, so genuine existing workerHistory now retains those fixture attempts. Second run found real focus-control selector collision (shell acquired same selector as button and got replaced); repaired using distinct state attribute and reran full harness PASS. These were not hidden or reported as initial success.

## Remaining gates and limitations

- Integrated optional original-evidence/paging backend changes awaiting coordinator acceptance/seed at receipt time; current browser PASS covers honestly labeled metadata fallback and <=24 records only.
- Browser page reload tested; restarting the entire Chrome process with same profile has not been verified here.
- Existing Supervisor pending-subtask report may print undefined identity; backend owner is separately repairing this. Frontend does not rewrite historical reports.
- No live-provider execution or real personal project workers used; fixtures do not prove live protocol delivery.
- Shared P3 Ship View/weather integration is a later combined rerun; .app DOM remains persistent for its reversible hide/inert contract.
- No commits, pushes, publication, CLA, installs, broad permission changes, personal notebook writes or user-process changes performed by worker.
- User deadline: freeze current work by 18:10–18:12 Europe/Berlin on 2026-10-16, implementation stops by 18:15; coordinator handles any later explicitly authorized publication and home handoff.

## Frozen frontend handoff (18:03 Europe/Berlin)

Eight owned files are frozen. Exact SHA-256 manifest `evidence/p1-workspace-owned-manifest.json`. Final source check: VM test, four JavaScript syntax checks and diff check PASS. Final actual Chrome run after all frontend changes: `evidence/workspace-chrome-frozen/result.json` PASS with six actual screenshots and no unexpected JS/HTTP errors. This supersedes the earlier fifth run as the final frontend-only browser receipt.

Root can integrate ONLY these eight owned paths, preserving all backend/P3/P4 files. Optional technicalEvidence renderer and advertised paging controls are ready, but accepted backend field/endpoint has not yet been seeded and tested against this frozen candidate. Core pending-identity correction remains a separately reviewed backend change. No further frontend edits without an explicit coordinator review finding; implementation stop deadline remains 18:15 local.

## Accepted technical-evidence integration (harness-only update)

After root independently accepted/integrated the source-evidence helper, runtime frontend remained frozen. Coordinator explicitly authorized harness-only assertions. Updated `verify-workspace-browser.cjs` supports an explicit accepted source root and requires original source evidence when `PLANWHARF_EXPECT_TECHNICAL_EVIDENCE=1`.

Actual Chrome run against coordinator repository with that requirement: PASS, `evidence/workspace-original-evidence-root/result.json`. It asserts selected Technical original command is exactly `npm test` and original credential marker is redacted. This closes the earlier metadata-only acceptance gap for retained source excerpts. Same no-live-provider/sandbox-enabled/zero-worker-launch boundaries apply. Updated harness-only SHA256 receipt: `evidence/p1-workspace-harness-update.json`; other seven owned file hashes remain frozen.

The harness now optionally creates 30 distinct archived attempts and verifies retained history beyond 24 using `PLANWHARF_EXPECT_ACTIVITY_PAGING=1`. That flag is not yet run because the reviewed route has not been integrated at this moment. It fails explicitly if backend advertisement is missing rather than ignoring 404s. The feature-detected frontend path remains honestly pending integrated paging validation.
