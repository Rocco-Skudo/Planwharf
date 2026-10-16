# Harbor background — implementation and validation

Implemented against the restored GitHub snapshot
`ed3721e7c1e1d9a36ab50cbb9132609a46a76680`, following specification v0.2.
No commit, push, release or model substitution was performed. Supervisor advice uses the existing Reviewer role, separate from dispatch.

## What changed

Harbor is a fixed SVG layer covering the available viewport, below the existing
application. It creates no card, dashboard section or layout track. The vessel,
illuminated pier and sea remain visible in open workspace areas; existing panels
attenuate them. The layer is inert, hidden from assistive technology, unfocusable
and uses `pointer-events: none` throughout. Native dialogs retain their top layer.

The anchor button beside the theme control opens the settings dialog. Preferences
include visibility, Full/Reduced/Off motion, effects and five original local flag
designs. The three-masted sailing ship changes hull colors, sail patterns and
trim with its flag: classic, technology, exploration, merchant or pirate.

The **Supervisor** button beside Harbor opens a separate workspace, alongside
Project Home and Orchestrator. Its name is edited in **Name and Reviewer
settings**, never in boat settings. See [Supervisor](SUPERVISOR.md) for operating
boundaries, advisory model selection, alerts and persistence.

Preferences use localStorage; random flags use sessionStorage and stay stable
across reloads in the same visual session. Disabling Harbor restores the existing
grid background and surfaces. With Harbor enabled, card surfaces are slightly
more opaque to protect secondary text against the brightest flag artwork.

## Previous failures and components reused

The earlier Harbor implementation had a missing static-file route, no standalone
Orchestrator viewport, incomplete project/state wiring, invalid motion-off CSS,
an unbound Cancel control and incorrectly positioned flags. Its source/helper
verifier could pass without the application actually loading the feature. Its
independent card also did not meet the full-background requirement.

The requested GitHub rollback removed those Harbor files. This implementation
reuses the current application's native SVG/CSS approach, palette variables,
panel surfaces, native dialogs, project-selection events, Orchestrator snapshot
polling, view switching and layout controls. It does not recreate the old card.
The main stylesheet and home UI retain their existing behavior. Supervisor integration adds separate observation and advisory endpoints to the execution engine.

## Execution synchronization

`orch.js` publishes its actual backend snapshot and normalized selected recipient
after existing refreshes. Harbor adds no HTTP polling, timer or inference call.
Failed refreshes publish an unavailable state. Older refresh responses cannot
overwrite a newer refresh. Unknown data or no selected project produces a neutral
vessel, rather than choosing the first project or inventing an operational state.

Underway visuals require backend worker liveness. Pause uses
`megaTask.pauseRequested`. Terminal snapshots with live workers cannot display
completion. Ambiguous terminal snapshots containing an observed raw PID remain
neutral, because PID existence alone does not establish current attempt identity.

Full motion uses a six-second visual departure/return, a small vessel bob, relative
water motion and wake. The pier recedes during navigation. A backend-confirmed
restart after a checkpoint initiates the resuming visual; a CSS transition ending
does not complete the backend task. Completion comes exclusively from backend
facts and can produce one short arrival highlight. Project/execution changes snap
to their own facts instead of inheriting another voyage. Reduced/Off and the OS
reduced-motion preference use static state changes. Hidden pages pause animations.

## Original background validation (before the Supervisor extension)

Tests used the installed Node v22.23.3 executable (the default `node` shim has no
active configured version), fresh Edge profiles, isolated notebooks/attempts and
fixture worker transport/liveness. Rendering and lifecycle tests used the real
HTTP server and execution engine, not source-string checks or an injected UI
state. Fixture workers make no provider calls and do not touch personal projects.
`PLANWHARF_TEST_NO_SANDBOX=1` was used for browser tests only.

| Verification | Result |
| --- | --- |
| `verify-harbor.cjs` helper/edge cases | PASS |
| `verify-harbor-browser.cjs` real browser acceptance | PASS |
| 43 engine test files + 7 root verification files | 49/50 PASS; existing provider-account failure remains |
| Existing `verify-browser.cjs`, `verify-layout.cjs`, `verify-grill-chat.cjs` | PASS |
| Existing project-recipient and worker-board browser suites | PASS |
| Real application-window suite `validation/phase1-browser.cjs` | PASS after waiting for mobile layout to settle |
| Syntax checks and whitespace check | PASS |
| Personal notebook SHA-256 before/after | Unchanged |

The Harbor browser suite verifies:

- Actual JS/CSS HTTP responses, rendered SVG, vessel/pier geometry and exact
  background bounds. Scrollbars are excluded from available viewport width.
- No layout displacement between Harbor On/Off, no background focus targets,
  real hit testing, mouse controls, text entry, note submission, existing plan
  dialog and project details controls.
- Both themes and both application views, the legacy Orchestrator redirect, and
  the retained standalone Orchestrator HTML through a test-only proxy. Every API
  still reaches the same real isolated backend.
- All five flags, previews, random-session stability, blank-name fallback,
  special-character names, persistence across reload and complete Edge shutdown
  and relaunch using the same profile.
- Computed Off/Reduced and OS reduced-motion behavior. Opening another real tab
  makes the application hidden: its CSS animation play state becomes paused;
  bringing it forward resumes it.
- Backend proposal, approval, actual launch, pause/drain, checkpoint, resume,
  explicit stop, resume, completion and failure. A completed result file while
  the worker remains live does **not** show completion. Actual vessel movement is
  checked between rendered frames, not inferred from a class name alone.
- A deliberate HTTP 503 outage changes the scene to neutral and recovery restores
  the actual running state. This expected outage is separate from unexpected
  network failures; it produces no JavaScript exceptions.
- Desktop, medium and 390×844 CSS viewports, 2× pixel density and 150% DevTools
  page scaling. No background-generated horizontal overflow.
- Computed text contrast over every tested scene palette color and the brightest
  local flag artwork, covering animation positions rather than one static frame.
  Minimum primary/secondary text contrast in tested card/chat/board surfaces was
  **5.045:1**. Semantic state colors were preserved.
- Zero JavaScript exceptions/console errors, zero unexpected HTTP failures, zero
  additional API requests initiated by Harbor, and zero fixture AI inference calls.

Evidence is preserved under `validation/`:

- `harbor-v2-1792105577926/results.json` and its screenshots: final browser run,
  including visibility suspension, restart persistence and contrast measurements.
- `harbor-v2-suites-1792105237035/`: all 50 automatic test-file logs and results.
- `harbor-v2-workflows-1792105332299/`: the existing browser workflow logs.
- `harbor-v2-workflows-1792105332299/phase1-browser-settled/results.json`: passing
  real application-window run, including close/reopen on the same backend.
- Earlier `harbor-v2-*` directories retain failed attempts and intermediate runs;
  they have not been rewritten as successful evidence.

## Remaining limitations

`engine/provider-accounts.test.cjs:84` fails on the restored GitHub baseline too:
changing login while the backend is stopped does not invalidate old model access
as expected. No provider-account code was changed here; the overall suite is not
completely green.

The original desktop browser test checked mobile geometry immediately after
DevTools resize and failed identically in an isolated, unmodified GitHub copy at
`validation/harbor-v2-baseline-probe/`. The test now waits for the real mobile
geometry to settle and retains its original assertions. Initial failures remain
in the workflow evidence.

Browser acceptance covers Edge and the real app-window harness, with fixture
workers rather than paid AI execution. It is not a claim of universal browser,
WCAG or performance certification. Native browser-menu/OS zoom was not automated;
the explicit DevTools scaling/density/viewport cases above were tested. Harbor settings
are local to the browser origin/profile; Supervisor settings and conversations
are persisted by the backend in its attempts directory. The ordinary four-second snapshot poll
sets update latency; a never-resolving network request is not a fresh snapshot.

An already-running backend must restart to serve the new JS/CSS routes. This
validation did not stop or restart the owner's personal backend or executions.

## Files changed relative to the restored GitHub snapshot

- Added `harbor-ui.js`, `harbor.css`, `verify-harbor.cjs`,
  `verify-harbor-browser.cjs`, and this document.
- Updated `index.html`, `orchestrator.html`, `orch.js`, `server.cjs`,
  `validation/phase1-browser.cjs`, and `.gitignore`.

The root Git metadata still references the older local revision, as established
during the requested rollback. The changed-file list above was compared against
the exact restored GitHub archive, not inferred from the broader `git diff`.
