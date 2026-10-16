# P0.3 browser portability worker evidence

Branch: `coord/p0-browser`. Worktree: `worktrees/p0-browser`. Base HEAD: `d3fae01fa183b00780620dd47a0598f28c9058a6`. Only changed source: `verify-layout.cjs`; uncommitted diff is available for independent review.

The harness now requires an explicit absolute existing file in `PLANWHARF_TEST_BROWSER`. It has no hardcoded browser vendor/default. Missing/relative/control-character/nonexistent/directory configuration is rejected before creating test output, notebook or browser processes. `spawn` receives the executable and argument array directly, without a shell. Existing fresh isolated profile/notebook/model-free validation remains. Messages and report identify Chromium and the actual executable because this harness uses Chromium DevTools. Product browser compatibility is not restricted by this test selection.

User steering to use Chrome only superseded the earlier request to preserve Edge default. No Edge launch occurred during this increment. The original read-only baseline Edge ENOENT remains unchanged at `baseline/browser-layout/command.json`.

Validation:

- `node --check verify-layout.cjs`: PASS.
- `git diff --check`: PASS.
- Five invalid/missing configuration cases: correctly rejected, output directory never created. Exact stderr in `p0-browser/configuration-checks.json`.
- Real browser fixture: **PASS in installed Chrome**, exit 0. `PLANWHARF_TEST_BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe`. `PLANWHARF_TEST_NO_SANDBOX` explicitly unset. Actual command/environment/stdout/stderr in `p0-browser/command.json`, success report in `p0-browser/report.txt`.
- Existing harness exercised width/height dragging, keyboard resizing, Escape cancellation, reload/dashboard persistence, reset, malformed local preference recovery, mobile layout, legacy route compatibility, and unchanged isolated notebook project content/notes.
- Desktop and mobile screenshots generated and visually inspected (`p0-browser/desktop-layout.png`, `p0-browser/mobile-layout.png`): expected dashboard layout and mobile stacking; no horizontal overflow assertion failures. No claim about other browser engines; they remain unverified and are not a blocker for this Chrome-only increment.

All output, fresh Chrome profile and temporary attempt state were confined to `evidence/p0-browser/`; no personal profile or default plan was used. The harness closes only its own spawned browser child. No provider calls, fixture Git commits, repository commits, pushes, publication, CLA actions, dependency installs, sandbox disabling or product source changes occurred. Await independent review before integrating the uncommitted diff.
