# Opt-in disposable end-to-end audit

These tools exercise the production HTTP server, Chromium and real child processes. `dogfood-fixture.cjs` is explicitly a deterministic fixture, not an AI provider. Use a fresh evidence directory outside the repository. Raw output may contain local paths and account metadata; keep it private.

Set `CODEX_PRIMARY_RUNTIME_NODE_MODULES` to the installed Node modules containing Playwright and `PLANWHARF_TEST_BROWSER` to the Chromium/Chrome executable. No npm install is required when Playwright is already supplied by the host.

1. Run `node scripts/audit/start.cjs ../audit-run` in a separate terminal. It uses a disposable notebook and attempts store and binds a random loopback port.
2. Run `node scripts/audit/real-provider-probe.cjs create ../audit-run` to add the blank calculator project through the browser. The other stages of this script explicitly access installed commercial provider routes; they are optional and are not necessary for the deterministic workflow.
3. Run `node scripts/audit/dogfood.cjs STAGE ../audit-run` for each stage in order: `setup`, `build`, `review`, `faults`, `concurrency`.
4. Run `node scripts/audit/browser-audit.cjs ../audit-run`. Ordinary Send clicks must work; no keyboard fallback or forced click is used.
5. Run dogfood stages `checkpoint`, `quit`, then restart the same evidence directory with `start.cjs`.
6. Run dogfood stages `resume`, `advanced`, `containment`, `deadline`.
7. Run `node scripts/audit/state-audit.cjs ../audit-run` while the calculator is still complete.
8. Run dogfood stages `controls`, `quit`. Missing-Skill and other fault cases intentionally produce failed/checkpointed projects. Preserve their evidence; start a new evidence directory for a fresh full run.

The checkpoint stage initializes and commits a tiny owned Git fixture, required for its changed-repository confirmation assertion. The fixture processes never represent commercial inference. The browser audit fails on assertion failures, JavaScript errors or HTTP errors. The state audit tests live production state rather than replacing responses or events.
