# Planwharf isolated cloud engineering delivery

The uncommitted-delivery status below records the first checkpoint. The owner subsequently requested a PR to benitz94/Planwharf, authorizing a separate branch, commit and draft PR. That publication keeps PR #7 unchanged; no merge, release or CLA acceptance is authorized.

## Baseline and isolation

Executed in fresh Linux cloud container 1ae5092206d2, x86_64, Node v24.19.0, Git 2.51.1. Fresh clone: /workspace/scratch/c463660c7589/Planwharf-cloud. Started and finished on main at d3fae01fa183b00780620dd47a0598f28c9058a6; origin https://github.com/benitz94/Planwharf.git. Initial working tree clean. Current PR #7 was inspected through GitHub and fetched read-only to origin/pr-7-inspection at 7b70ea6881b1fd5fd48c920ba4fd22cadb5efca9, still draft at inspection. Its 383-file ownership map is in ownership.json.

Final source status: one tracked modification (verify-browser.cjs), plus new workflow, scripts/engineering and docs/engineering files. Generated engineering-logs are separate evidence. No modified tracked file intersects PR #7. Main HEAD is unchanged, no commits or branches created, no push/PR/merge/publication/settings changes. Rocco's checkout was never accessed. No personal desktop path or notebook was used; no provider login/call, global install or mandatory runtime dependency was introduced. README/AGENTS/CONTRIBUTING and relevant validation guidance were read. Existing release workflow and production engine/UI are untouched. No CLA was accepted.

## Implemented workstreams

| Task | Reviewable implementation | Validation and boundary |
| --- | --- | --- |
| P0-A CI | New PR/main and dispatch workflow; Node 24; read-only permission; credential persistence off; timeouts; per-command retained logs; explicit offline test allowlist; syntax and patch checks | Runner PASS, 138 syntax checks and five test files, zero failed checks. Deliberate failing-test fixture returns exit 1, keeps its failure log and reports later tests. Hosted GitHub Actions not executed because changes remain uncommitted. |
| P0-B browsers | Shared Edge/Chrome discovery, explicit path/legacy alias, standard locations/PATH, isolated profile, version from DevTools, bounded errors and connection, owned-child cleanup, console capture; verify-browser.cjs integration | Discovery and simulated startup/version/cleanup fixtures PASS. Actual Edge and Chrome checks each exit 1 with BROWSER_MISSING. No real browser coverage. PR7 harness proposal applies and syntax-checks against exact head, but is not applied or runtime-tested. |
| P1-A diagnostics | Separate opt-in generator/preview/export CLI and API, categorical allowlist, no raw collection, exact-preview confirmation and no-overwrite export | Representative credentials, prompts, paths and unknown fields omitted; incorrect/tampered confirmations and forged extra-field payload rejected. Focused privacy tests PASS. UI/Orchestrator integration deferred because PR-owned. |
| P1-B accessibility | Main/PR7 source inventories, token contrast calculation and prioritized reproduction/fix report | Seven unnamed static dialogs; light primary token contrast 3.968:1. Positive source evidence and runtime questions documented separately. No browser/screen reader/zoom conformance claim and no overlapping UI edit. |
| P2 release | Directory/ZIP checks; required files, manifest hashes and safe names; Windows executable header; disposable package smoke; isolated CLI/backend startup | Generated ZIP PASS; incomplete ZIP rejected; packaged Linux Node CLI status and HTTP startup PASS, notebook unchanged. Windows/macOS launch execution, shell execution and missing-Node UI unverified. No release generated outside temporary test output or published. |

## Exact repeatable checks

All commands run from the cloud clone root:

```
node engine/claim.test.cjs
node engine/attempts.test.cjs
node scripts/engineering/ci.cjs
node scripts/engineering/browser.test.cjs
node scripts/engineering/diagnostics.test.cjs
node scripts/engineering/release.test.cjs
node scripts/engineering/release-smoke.cjs
node scripts/engineering/package-smoke.cjs
node scripts/engineering/accessibility-audit.cjs
node scripts/engineering/accessibility-audit.cjs 7b70ea6881b1fd5fd48c920ba4fd22cadb5efca9
PLANWHARF_BROWSER=edge node scripts/engineering/browser.cjs
PLANWHARF_BROWSER=chrome node scripts/engineering/browser.cjs
git diff --check
git rev-parse HEAD
git status --short --branch
```

Existing baseline claim and attempt tests passed before edits: 12 and 11 cases respectively. Final CI runner repeats them plus three new focused test files. Browser commands deliberately report unavailable prerequisites, not passing renderer checks. Per-check logs and complete CI summary are in the delivery archive.

Additional executed validation: workflow parsed with Python yaml.BaseLoader and asserted PR/main/dispatch triggers, read-only permissions and timeout. A temporary clone of the unchanged main baseline, with new scripts copied in and an intentional failing claim assertion appended, demonstrated CI failure propagation and retained logs (negative-ci.log). Integration proposal was generated from exact PR7 source, node --check executed on all three proposed files, and git apply --check passed in a disposable directory containing those exact source files. The delivery main patch is separately checked against a clean temporary clone before handoff.

## Scope limits and security

The current CI allowlist includes two of 44 engine files. The remaining 42 are named in ci-test-inventory.json and blocked from admission pending full transitive provider/process/filesystem fixture review. They were not run, counted as passing, or claimed to be product failures. Root/validation/historical/browser suites are excluded as described in README.md. This initial workflow detects syntax and required tested regressions; it does not establish whole-engine coverage. Newly admitted tests require review of their fixtures and imported behavior.

Diagnostic data collection is opt-in and structural, rather than sanitizing raw logs. There is no automatic upload. Categorical test results and adapter versions must be explicitly supplied by a future UI caller; adapters are not invoked to discover account state. Only safe metadata is emitted; unknown app versions remain unknown. The browser helper's startup logs are validation evidence and are not automatically included in support bundles.

The release ZIP checker does not execute supplied ZIPs. Disposable package startup uses only freshly generated output from inspected source. Existing shell/cmd launchers rely on OS Node errors; C# contains explicit Node detection. Static packaging inspection cannot establish platform runtime compatibility. CI test child environments are minimal, but the runner is not an OS network sandbox and must not be expanded to unreviewed live-provider tests.

## Integration and owner decisions

Recommended review order: CI first; shared browser helper and verify-browser integration second; diagnostics third; release smoke scripts fourth. Audit findings may be addressed by PR7 owner alongside its UI. Workstream patches are separate, with a combined patch for convenience; all remain uncommitted.

The optional PR7 browser patch depends on the shared helper and exact inspected head. Coordinate and recheck its application after PR7 changes or merges; do not apply it blindly to main, which lacks workspace/ship harnesses. Other existing browser harnesses still require migration. Actual installed Edge/Chrome execution with sandbox retained remains required before claiming browser portability acceptance.

Owner actions outstanding: review/approve integration, authorize commits/push/PR creation if desired, coordinate PR7 UI fixes/integration and arrange real Edge/Chrome plus Windows/macOS validation. These are handoff boundaries; no new authorization was required or requested to produce this reviewable work.
