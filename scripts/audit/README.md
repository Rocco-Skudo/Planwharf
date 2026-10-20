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

## Real coding-model workflow

Use a new evidence directory; this path makes actual inference requests using the existing CLI login and account limits. It never registers the deterministic fixture provider.

1. Start `node scripts/audit/start.cjs ../real-audit` in its own terminal.
2. Explicitly select a listed exact model: `node scripts/audit/real-model.cjs init ../real-audit EXACT_MODEL_ID`. Initialization verifies actual inference and keeps restricted workspace writes and provider usage thresholds.
3. Create the blank project with `node scripts/audit/real-provider-probe.cjs create ../real-audit`.
4. Run `node scripts/audit/real-model.cjs STAGE ../real-audit` for `setup`, `build`, `review`, `reject`, `correct`, `review`, in order. `reject` intentionally introduces a defect in the disposable calculator; `correct` requests new work and approves the MegaTask prepared by the lead. It does not bypass an active-task guard by proposing a duplicate task.
5. Run `node scripts/audit/real-model-browser.cjs ../real-audit` for actual inference through Send plus independent logic/browser checks. Chat explicitly selects its recipient after the initial snapshot loads. `--calculator-only` repeats the non-inference checks after correction without making another model request.
6. Optional concurrency: run real-model stage `concurrency`. A burst may return provider 429; preserve the failure evidence. After an appropriate cooldown, `concurrency-retry` admits each saved project after the preceding real receipt arrives. The completed run must still have three owned live workers, each with its own project receipt.
7. While those workers wait, run `real-model-browser.cjs ../real-audit --concurrency-only`, then real-model stages `stop-concurrency` and `shutdown`.
8. Restart the same directory with `start.cjs`, then run stage `resume-concurrency`. It releases one controlled worker and checks actual completion after restart. Provider failures remain failures, with no silent model substitution. Run `shutdown` when no owned worker is alive; use `stop-concurrency` first if needed.

`resume-build` is only for investigating the original failed restricted-result transport; it resumes the failed build checkpoint using the selected real model. Do not rewrite retained failed attempts to make a run appear successful.
