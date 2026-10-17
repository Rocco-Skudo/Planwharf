# Isolated engineering ownership

Baseline: main d3fae01fa183b00780620dd47a0598f28c9058a6. Fresh cloud clone, initially clean. Origin is benitz94/Planwharf. PR #7 inspected through GitHub: draft, head 7b70ea6881b1fd5fd48c920ba4fd22cadb5efca9, 383 files changed.

1. CI owns only new pull-request-checks.yml and scripts/engineering/ci.cjs. Existing release workflow remains untouched.
2. Browser portability owns new scripts/engineering/browser.cjs plus fixtures. PR owns verify-layout.cjs, verify-workspace-browser.cjs and verify-ship-browser.cjs; integration must be a separate patch after those files settle.
3. Diagnostics owns a separate opt-in module and tests; no server/UI/Orchestrator edits.
4. Accessibility is source audit plus suggested fixes; PR owns index.html, styles.css, harbor UI, window UI and Supervisor/Skills UI. No overlapping edits.
5. Release verification owns separate scripts; packaging and launchers remain untouched.

Dependencies: CI first, browser helper next, remaining additive modules after targeted checks. Nothing requires importing PR #7 implementation. PR-specific UI integration and runtime acceptance require its head or merge. No commits, remote writes, provider calls or CLA acceptance.
