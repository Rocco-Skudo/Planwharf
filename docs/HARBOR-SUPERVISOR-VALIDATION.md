# Harbor and Supervisor delivery evidence

## Repairs and changes

The earlier integration failed to serve/load all assets and did not bind scene,
flags and execution states consistently; its source-only verifier could pass
without loading the actual app. The GitHub restore removed that implementation.
The first background implementation then followed the explicit instruction to
provide a Supervisor label only. The latest owner request authorizes monitoring,
questions and alerts; these are now implemented separately from Harbor settings.

The small vessel is replaced by a large three-masted sailing ship. Flag choices
change its hull, sails and trim. A browser contrast check caught insufficient
secondary-text contrast when Orchestrator panels were made more transparent;
restoring sufficient panel opacity repaired it while retaining the larger ship.

Existing snapshots, selection events, backend execution gates, local SVG/CSS,
three model roles, palette and window/view navigation are reused. Supervisor adds
a dedicated view, project-scoped evidence, persistent alerts and separate
read-only Reviewer answers. It does not create a fourth model role.

## Automatic and browser verification

- `validation/harbor-supervisor-suites-1792107946576/results.json`: 51 files run.
  The initial run had 49 passes, the known baseline provider-account failure,
  and a DevTools timeout in `verify-app.cjs`.
- `verify-app-rerun.log` in the same directory: PASS on rerun with the browser
  sandbox test flag. CLI, browser chat command and unchanged notebook verified.
- Final targeted tests for Supervisor, Orchestrator, runner and runtime integration:
  8/8 PASS, including restart recovery, real HTTP endpoints, malicious tool-call
  rejection, exact model identity and concurrent lead/advisory child processes.
- `validation/harbor-supervisor-workflows-1792108044739/results.json`: 6/6 PASS
  for existing browser, layout, grill chat, project recipient, worker board and
  application-window workflows.
- `validation/harbor-v2-1792108027816/results.json`: real Edge Harbor/Supervisor
  acceptance PASS. Screenshots retained in the same directory. Checks include
  both views/themes, state lifecycle, false-completion prevention, settings,
  real questions, evidence dialogs, alert acknowledgement, project isolation,
  reduced motion, viewport geometry and browser-restart persistence. Zero
  JavaScript errors or unexpected HTTP failures; personal notebook unchanged.
  One explicitly requested fixture Reviewer answer, no autonomous AI calls.

- `validation/harbor-v2-1792108257191/results.json`: targeted real Edge
  contextual-action acceptance PASS. Two independent assignments (Worker and
  Reviewer) actually launched; one failed while the other remained live. The
  alert offered Pause and Stop. UI Pause set backend drain state; accepting
  Stop confirmation killed the fixture worker and saved a real checkpoint.
  This run uses `PLANWHARF_SUPERVISOR_ACTIONS_ONLY=1` with the same browser harness.

Failed intermediate runs remain on disk. A separate browser automation issue was corrected by handling the native Stop
confirmation before awaiting its mouse event. The test for Ignore was corrected to
acknowledge each individual alert: failed execution and its failed assignment
are distinct alerts, and ignoring one must not acknowledge the other.

## Limitations

`engine/provider-accounts.test.cjs:84` still fails, as on the pristine GitHub
baseline: account changes while the backend is stopped are not invalidated as
expected. The suite is therefore not fully green.

AI transport was validated with local HTTP fixtures and real child processes;
no paid model was called. Advisory transports are restricted to Codex and API.
Other adapters remain explicitly unavailable. Monitoring updates at the existing
snapshot interval, normally four seconds, and detects the documented conditions;
it cannot guarantee detection of every semantic mistake. See
[Supervisor](SUPERVISOR.md) for details. The owner's running backend was not
restarted or used to dispatch validation projects. Restart the app backend to
load its new routes. No commit or push was performed.

## Changed files against the restored GitHub archive

Added: `harbor-ui.js`, `harbor.css`, `supervisor-ui.js`, `supervisor.css`,
`engine/supervisor.cjs`, `engine/supervisor.test.cjs`, `verify-harbor.cjs`,
`verify-harbor-browser.cjs`, and the Harbor/Supervisor documentation.

Updated: `.gitignore`, `engine/api-agent.cjs`, `engine/external-adapters.cjs`,
`engine/invocations.cjs`, `engine/orchestrator.js`, `engine/runner.cjs`,
`index.html`, `orch.js`, `orchestrator.html`, `planwharf.cjs`, `server.cjs`,
`validation/phase1-browser.cjs`, and `window-ui.js`.

Local Git HEAD remains older than the restored GitHub archive; its wider diff
is not a reliable list of changes introduced by this work.
