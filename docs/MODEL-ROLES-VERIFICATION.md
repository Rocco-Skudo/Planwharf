# Model roles and English publication guides

Owner-requested additions following the retained `PLANWHARF-FINAL` acceptance. No new phase or roadmap is introduced.

## Behavior

Models now expose independent persisted Orchestrator, Worker and Reviewer flags. Technical eligibility remains separate from user permission. Unsupported Orchestrator roles cannot be selected or enabled through the API. Removing that role from the selected lead clears the selection without substitution.

Implementation/research requires Worker permission. AUDIT work requires Reviewer permission, including reviewers that can inspect but cannot code. Orchestrator-only models cannot be dispatched for implementation or review. All roles can be combined or disabled. Changes restrict future assignments; existing work is interrupted through Stop rather than a role toggle.

Restrictions are enforced during selection, proposal validation, launch, explicit Resume reassignment and the legacy launch path. The lead briefing includes role permissions and explicitly instructs the model to respect them. Audit proposals use review-oriented slices rather than implementation-oriented slice labels.

The UI provides role checkboxes, disabled unsupported choices and an All roles / Orchestrator / Worker / Reviewer filter. Search, provider expansion and model On/Off remain available. Role changes require no model invocation and are included in metadata exports.

## Validation

- `engine/model-roles.test.cjs`: role-restricted selection, non-coding reviewers, incompatible-role rejection, clearing the selected lead, persistence across backend restart, rejected exact implementation assignment, accepted exact audit assignment, exported settings and zero lead calls.
- `validation/phase2-browser.cjs`: 55-model rendering, disabled unsupported Orchestrator flag, Worker flag toggle, Worker/Reviewer/All filters and persistence after reload.
- Complete regression: **48/48 files passed**, personal notebook unchanged during validation. Evidence: `validation/phase1-suite-1791926338772/results.json`.
- `git diff --check`: passed.

Validation used isolated notebooks and mocked provider processes. No new real-provider dispatch was necessary for these deterministic permission/UI changes. Prior real-provider acceptance evidence remains intact.

## Publication documentation and language

`docs/QUICKSTART.md` is the short first-use guide. `docs/USER-GUIDE.md` describes the current functions, role restrictions, execution/recovery, history, notes, providers, usage, quota, notifications, export, backup and troubleshooting. README links both directly.

Current public guides and interface text were reviewed in English. Two remaining Italian task-timing errors in `plan.js` and two comments in `models.js` were translated. A keyword scan of thirteen current documentation/interface files found no remaining Italian terms, and guide links resolve locally. Manual inspection distinguished English product text from compatibility keys and accepted multilingual input.

Personal notebooks, sample/user content, historical handoff/report evidence and raw logs retain their original language. Existing Italian-to-English compatibility dictionary keys and Italian command aliases remain because they accept old data or input; their product-facing output is English. Historical reports have not been rewritten as translated original evidence.

Changes are prepared locally for owner review. No commit, tag, push or publication was performed.

## Follow-up: model-card controls and running backend

The owner reported duplicated Orchestrator controls and role flags that would not save. The running backend (PID 8800) returned neither role permissions nor role eligibility; it preceded the role-settings API, while its frontend files were newer. That mismatch caused role changes to fail rather than persist.

The model-card "Use as orchestrator" button was removed from both dashboard renderers. Cards now contain only allowed-role checkboxes; the selector above chooses the active lead. Old backends display an explicit update notice instead of simulated role flags. Browser checks verify that an incompatible Orchestrator flag does not disable independent Worker/Reviewer flags, and both of those flags can be changed and retained after reload.

The idle backend was shut down through its normal application Quit path and replaced by PID 13020. Its API now reports role metadata, with zero active workers and preserved notebook content (excluding the normal visit marker). Evidence: `validation/role-ui-backend-upgrade.json`. Native Chromium launch from the restricted tool environment failed and attempted the existing default-browser fallback; the updated backend remains available at `http://127.0.0.1:4173` without disabling production browser security.

The corrected build passed **48/48 regression files**. Evidence: `validation/phase1-suite-1791927093904/results.json`. Personal notebook bytes remained unchanged during that isolated regression run. No personal project was dispatched.

## Single-window launch, close-to-quit and role-only controls

The owner subsequently requested one full-screen desktop window, with the button switching between Planwharf and Orchestrator. Closing the owned desktop window now invokes the same checkpoint/shutdown path as Quit application. Browser launch failures do not request Quit, and an old window's exit cannot shut down a newer window. External browser tab close uses a five-second reconnect grace period so normal reloads do not quit the app.

Model cards no longer expose On/Off buttons. Allowed-role flags determine assignment permissions without a second enablement gate. Previously disabled models retain empty role permissions until a role is selected; explicit saved role permissions override obsolete enablement values. Availability, exhausted shared quota, provider disablement and no roles assigned have separate status labels.

The updated build passed **48/48 regression files**, including browser role filtering with 55 models and a real isolated backend shutdown on desktop-close notification. Evidence: `validation/phase1-suite-1791928982515/results.json`. The personal notebook remained unchanged. The earlier run's browser navigation timeout is preserved in `validation/phase1-suite-1791928775348/`; the test now launches at its actual application URL after its server is ready. No personal project was dispatched and no push was performed.

## Fresh startup model catalogs

Backend startup forces a fresh catalog check. Initial orchestrator snapshots and model execution wait for that check; local Quit and catalog-status polling remain available. Successful discovery supersedes historical rejection messages. Failed discovery retains previous availability, labels it unread, and records the check time and warning. User role flags remain unchanged. The refresh button and status text now cover all configured providers rather than claiming every catalog belongs to Grok.

Focused tests verify startup waiting, recovery from an old rejection, exact provider isolation, preserved role flags and last known availability on failed checks, and a single discovery invocation despite repeated status polling. The complete regression passed **48/48 files** with unchanged personal notebook bytes: `validation/phase1-suite-1791929802254/results.json`.

A read-only real Codex catalog check at `2026-10-13T22:16:53.527Z` succeeded with 10 listed models. Exact IDs `gpt-5` and `gpt-5-mini` were absent for the current account. This was catalog discovery, not a coding invocation; no credential contents were logged and no worker was dispatched.
