# P3 Ship implementation worker receipt

Status: implemented in isolated `coord/p3-ship` / `worktrees/p3-ship`; frozen for independent review. P3 product acceptance is pending reviewer and integrated P1/P2/P3 Chrome rerun.

## Independent-review correction

Reviewer identified that the later wave-path `transition:d 12s` declaration could override earlier reduced/off rules. Added explicit `transition:none !important` on `.harbor-water path` for off/reduced/suspended and OS reduced-motion, without changing normal gradual motion. Chrome assertions now verify reduced=0s, full=12s, OS reduced=0s and off=0s. Full isolated Chrome harness rerun **PASS, child exit 0** with sandbox enabled: `p3-ship-motion-review/report.json`. `harbor-ui.js` and unit fixture hashes remain unchanged; updated CSS/browser-harness hashes are recorded by the coordinator's final review. All four files refrozen after this correction. No evidence-branch files mixed into this worktree.

## Base, ownership and safety

Base SHA `d3fae01fa183b00780620dd47a0598f28c9058a6`. Exact current accepted integration changes were copied uncommitted into this worktree before editing; recorded in `p3-seeded-dependencies.json`, and all seed hashes rechecked unchanged. No cherry-picks, commits or history changes. Read complete authoritative specification earlier; reread existing ship implementation, pure helpers, original real-browser harness, execution lifecycle and Supervisor facts/alerts. Requirements applied: spec sections 6–8, 12–13 and current Chrome-only steering.

Owned product files only:

| File | Frozen SHA-256 |
|---|---|
| harbor-ui.js | FA7FF3C38A8D23F27ECE61F662B38497402D72A61FEE548F28DADEAFAFEE3A1D |
| harbor.css | 8349D938311865B4E1E65ADB402448CBDAF68313E67792F7F7BE60C4214E9519 |
| engine/ship.test.cjs | 85875C3E1D313D1C5369599A5F7516C1908B82B00F235725E79840CD19D30BE6 |
| verify-ship-browser.cjs | E07F4CD5C78F17F5D008CBF271CE35D4AE501D267EA57D2070D416DCE1EB8DB8 |

No edits to held P1 UI/HTML/app files or P2 server/permissions files; no new route, dependency or provider permission. No credentials, personal notebook/profile/folders, real workers or production processes accessed or changed. All Chrome runs use fresh fixture-local profiles, real localhost HTTP backend and injected worker transport/liveness fixtures. Chrome's sandbox stays enabled. No live CLI/provider inference, no commits (including fixture commits), push, publication, release or CLA acceptance.

## Behavior

- Retains original SVG ship/artwork/five flags, ensign storage key, existing execution lifecycle and full fixed inert pointer-transparent background. Product-facing controls say Ship/Sailing Ship/Ship View, while historical storage/DOM identifiers remain compatible.
- Injects Ship View button, accessible exit/settings controls and dedicated notifications from existing served script. Reversibly hides/inerts persistent workspace DOM; no session destruction, worker call, reset, draft clear or layout rewrite. Restores prior inert state, focus and window scroll. Escape exits unless the Ship settings dialog is open. Works idle and temporarily reveals the ship even if background is disabled.
- Notification facts come only from existing authoritative snapshots, never weather/timers: completion (with live-worker guard), worker/assignment failure, reviewer result, blocked execution, checkpoint, approval required and active nonignored Supervisor anomaly. Initial old history is quiet except actionable facts; approval/anomaly notices resolve when corresponding facts disappear. Notifications use textContent for project names and fixed labels. Current fact keys deduplicate; new controls stay stable under identical polling to preserve keyboard focus.
- All/Important/Action-required density keeps critical notices visible. Explicit dismissal affects presentation only. Displays at most 12 notices, stores at most 200, explicitly announces older omitted counts and execution-history source; no silent truncation. In Ship View the existing duplicate Supervisor notice surface is hidden because the same backend anomaly is represented in the dedicated region with contextual return, avoiding overlapping fixed notices on phones.
- Context return uses actual `#project-select`/change only when switching projects; prefers agreed `PlanwharfShowView('orchestrator')` and feature-detected `PlanwharfSelectWorkspacePanel` (Supervisor for anomalies, sessions for failure/review, overview otherwise). Falls back to current baseline controls. New P1 panel API still needs integrated review, not claimed as standalone proven.
- Independent visual weather: Adaptive bounds variety from retained SubTask count/dependency metadata; Random is local variation; Manual selects calm/light/moderate/rough/storm. Sea wave path amplitude, light cloud/rain overlay and slight ship bob vary; no flashing, lightning, camera movement or heavy rendering. Automatic updates at most once a minute, gradual 12-second weather transitions. Health/failure/progress do not enter selection. Labels explicitly call weather decorative.
- Existing full/reduced/off motion plus OS preference are respected. Hidden-tab suspension pauses CSS and cancels the weather timer; manual/off create no recurring weather timer. Settings preserve existing flag/animation preferences and persist new controls in the existing key. Legacy `settingsFrom` helper shape is unchanged; `shipSettingsFrom` safely extends it.

## Validation

All focused commands pass:

```text
node verify-harbor.cjs
node engine/ship.test.cjs
node --check harbor-ui.js
node --check verify-ship-browser.cjs
git diff --check
```

**2/2 focused pure/fixture files pass**, including original helper expectations unchanged. New tests verify all five flags, old settings/storage compatibility, weather/health separation, bounded complexity/random selection, all seven notification classes, project/result filtering, critical/density gates, active-worker/ambiguous-PID completion guard, and timer cancellation/bounds with controlled globals. No provider or Git commands in these tests.

Final frozen actual browser command from this worktree:

```powershell
$env:PLANWHARF_TEST_BROWSER='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PLANWHARF_VALIDATION_DIR=Join-Path (Get-Location) '..\..\evidence\p3-ship-frozen'
node verify-ship-browser.cjs
exit $LASTEXITCODE
```

Used approved unrestricted execution-tool context needed for local Chrome startup; Chrome browser sandbox is enabled (no `--no-sandbox` argument exists in this new harness). Result: **PASS** actual Chrome + real HTTP/backend lifecycle with fixture worker transport. Exact structured report: `p3-ship-frozen/report.json`; screenshots: `ship-dark-running-storm.png`, `ship-light-moderate.png`, `ship-mobile-light.png`. Inspected screenshots from preceding equivalent visual run `p3-ship-reviewed/`; final run differs only in agreed feature-detected workspace-return routing.

Actual Chrome assertions cover:

- Ship View running, full background pointer transparency, hidden inert workspace, focused keyboard exit, unchanged unsent input/project/layout/window scroll, continued actual backend active state.
- Real backend propose/approve → running → pause/drain → checkpoint → resume → Reviewer result/completion; result file while fixture worker remains alive never completes the ship. Completion retains Ship View; notification returns to selected project.
- Actual failed fixture result/anomaly, explicit resume and blocked fixture result; critical notifications survive action-only density. No synthetic UI event snapshots are dispatched to invent these facts; application polling receives actual server snapshots.
- All five flags, Manual storm/calm/moderate, Adaptive/Random mode controls, reduced/off motion and OS reduced-motion, actual hidden-tab suspension/resume, light/dark rendering, mobile no horizontal overflow and visible exit, persisted weather/flag after reload.
- No JS exceptions/console errors or failed HTTP/network requests, zero AI calls, untouched isolated project source folders and empty notes.

Earlier attempts preserved: `p3-ship-run1/failure.json` rejected the test fixture's invalid model CLI identifier; fixed to an existing recognized route with fully mocked transport. `p3-ship-run2/failure.json` proved backend rejects proposing a new task over failed unfinished work; test corrected to explicit checkpoint Resume. These were fixture setup mistakes, not product PASS results or defects. Run3 and later runs pass. No failing evidence was erased.

## Remaining scope and integration gates

Independent reviewer pending. Root must re-run with integrated new P1 UI and P2 backend because isolated worktree intentionally freezes earlier accepted seeds. No live provider compatibility, real provider delivery or P6-wide acceptance is established. Existing original `verify-harbor-browser.cjs` expects a personal `plan.json` and global browser discovery; it was read but not run, and the new harness explicitly avoids that dependency. No full performance benchmark, all-theme contrast calculation, multi-window feature or full-master-spec success is claimed. Adaptive uses only planning metadata actually retained; unknown complexity stays calm/light. Weather is visual, not execution truth.
