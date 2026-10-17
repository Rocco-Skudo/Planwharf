# Planwharf review checkpoint — 17 October 2026

**Current follow-up:** [FOLLOWUP.md](FOLLOWUP.md) records the resolved baseline failures, reviewed draft-only Docs compatibility, additional safeguards and fresh **62/62** passing engine files. The earlier checkpoint results and remaining-work list below are preserved as historical evidence.

This branch saves all implemented source changes and review evidence for Benito. It is a draft review checkpoint, not a merge-ready or fully accepted release.

## Scope and provenance

The user explicitly authorized committing and pushing all progress to a separate branch for Benito's review, then requested details of all work completed so far. This permission supersedes the earlier no-commit/no-push restriction for this review checkpoint only. No merge, release, CLA acceptance, personal-data changes or live provider execution is authorized.

The branch includes the complete earlier checkpoint `3b74f5e1b90c3fbbe3c9248d5cc0ea2849d8d081`, whose parent is upstream baseline `d3fae01fa183b00780620dd47a0598f28c9058a6`, plus the subsequent isolated implementation. PR #6 remains unchanged as the earlier checkpoint. The original 1,315-line specification, all 25 criteria, audit, coordinator tracker and earlier evidence remain under [the previous review directory](../2026-10-16/). Its `unfinished/` files remain historical review material and must not be copied into runtime indiscriminately.

Execution took place on Windows 10.0.19045 in the session's isolated `work/planwharf-audit` checkout. The desktop project, existing workers and personal notebook were not used. The prior cloud environment was offline; its uncommitted work and claimed test results were not adopted. Fixture servers were session-owned and have been stopped; fixture CLI children exited naturally.

## Implemented work

- **Shared workspace and truthful activity:** preserves the earlier unified project-first workspace, per-project conversation, Friendly/Technical activity sessions and paged history. Repairs historical task/result attribution in worker cards, model summaries, Processes and crew; historical PID reuse cannot create false live nested sessions or suppress current completion notices. Reviewer assignments retain the Reviewer label.
- **Supervisor:** preserves the earlier explicit fourth opt-in role, configurable name with exact `Supervisor` fallback, model-free Core and bounded advisory path. Adds project-scoped assigned Skill metadata without procedure bodies or additional model polling. Exact identities and unverified loading/compliance remain visible.
- **Ship:** preserves immersive Ship View, actual lifecycle state, retained notifications, independent decorative weather, five flags and motion settings. Repairs current-versus-historical PID handling. Verifies the real browser presentation and fixes narrow-screen catalog overflow.
- **Catalog:** selectively reviewed pinned Matt grilling/TDD and ECC verification-loop candidates; project-local discovery; separate download/content approval; explicit per-project execution opt-in; Auto/Manual selection, source restrictions, exclusions, disable controls, role compatibility, instruction budget and TDD seam consent. Changed required local content prevents launch. Imported instructions never authorize hooks, scripts, MCP, permissions or publication.
- **Actual delivery:** joins project/task/attempt/provider/model/content hashes and assigned-prompt identity through the server, runner and receipt. Avoids duplicate legacy injection. CLI stdin, local API bridge input and Grok prompt-file preparation remain distinct evidence stages. Native loading, remote acceptance and procedure compliance are not inferred.
- **Clarification and scheduling:** required catalog interview Skills produce an actionable error instead of silent fallback or a fabricated provider failure. Intentionally disabled Skills keep built-in clarification. Catalog projects no longer wait behind unrelated legacy cache failures; actual legacy launches retain their gate. Downloads do not occupy the notebook mutation queue.
- **Manual generation:** explicit reference-based draft, inspection/edit, exact-revision approval, freshness recheck and inactive local Skill/provenance files. Rejects unsafe paths, symlinks, likely credentials, oversized/foreign evidence and differing existing-file overwrite. Activation is a separate later decision.
- **Human-reviewed Assisted generation:** joins backend completed assignment/result/exit/log evidence and exact delivered Skill revision to project references. Three distinct fresh human-accepted attempts may create a weekly-limited suggestion. Stale evidence invalidates eligibility. An assisted draft still needs separate approval and cannot activate itself. Human acceptance is not automated test/compliance proof; Full Auto remains disabled.
- **Documentation and tests:** product instructions updated in README; focused catalog/API/delivery/failure-isolation/generation/evidence/transport/Supervisor tests added. Browser harness diagnostics distinguish a browser startup failure from an application failure without disabling the sandbox.

No notebook-schema migration or new package dependency was introduced. Additive catalog/draft/evidence registries live under attempts storage; optional-store corruption does not prevent recovery/Stop/Pause. Only approved local Skill generation writes project files.

## Validation

| Current evidence | Result |
| --- | --- |
| Untouched checkpoint, same offline guard | 50/52 engine test files pass, 2 fail |
| Final reviewed source | **59/61 engine test files pass, same 2 fail, zero skips** |
| Additional isolated notebook/presentation checks | 7/7 pass |
| Syntax and whitespace checks | Pass; Git line-ending notices only |
| Real local CLI and loopback API transport | Pass with actual offline fixture child processes |
| Real application UI | Verified in the in-app browser against the isolated backend |
| Installed Edge/Chrome automated harnesses | Blocked at blank-page smoke by browser subprocess crashes |
| Live providers/native Skill loading | Not executed; unverified |

The exact commands, architecture decisions, detailed product walkthrough, modified file list and limits are in [IMPLEMENTATION-AND-VALIDATION.txt](IMPLEMENTATION-AND-VALIDATION.txt). Machine-readable outcomes and full per-file logs are in [evidence/](evidence/). Offline harnesses are in [validation/](validation/). Actual browser screenshots are in [screenshots/](screenshots/).

The offline runner executes each engine test file separately, blocks external global fetch and substitutes native executable paths with Node until a test installs its own fixture. It must only be used with isolated notebooks/attempts. DOM simulations are not counted as browser acceptance.

The real browser exercised separate project settings/drafts, source/content/activation gates, three actual offline assignments and transport receipts, three human review acceptances, an assisted inactive Skill, Supervisor metadata, Friendly/Technical evidence, historical titles after backend restart, required-Skill errors without provider calls, Ship View, lifecycle notices, Manual storm/Adaptive/Random weather, all five flags, reduced/off motion, theme/reload, keyboard resizing and 390x844 layout. Temporary browser viewport overrides were reset. The final console check reported no errors.

## Known failures and remaining work

1. **Provider account isolation:** `engine/provider-accounts.test.cjs:84` reproduces the existing restart/access invalidation defect. Separate contribution `99fe5867b3d04af4fa3a22b604b595188cbb26b1` has not been integrated. It is absent locally; GitHub commit lookup returned “No commit found” in both `benitz94/Planwharf` and `Rocco-Skudo/Planwharf`. The named upstream branch was also absent. Do not claim this unseen contribution was reviewed or recreate its history. Locate it, or transparently review an independent repair before integration.
2. **Older orchestrator fixture:** `engine/orchestrator.test.cjs:1182` leaves Skills enabled without a complete cache, ignores its failed approval response, then dereferences an error response. It fails in the untouched checkpoint under the same offline guard. Resolve the fixture/setup and check the HTTP responses while preserving the production required-Skill gate.
3. **Native Grill-with-docs:** the pinned original invokes native Skill-tool dependencies, including unreviewed domain-modeling. Catalog metadata is visible but downloading/execution are blocked. Missing required approvals must stay explicit; do not claim its procedure ran.
4. **Provider/platform acceptance:** no live/native compatibility or remote HTTP acceptance established. Edge/Chrome smoke checks crash before app load (Edge GPU subprocess exit `-1073741790`, `Inspector.targetCrashed`). Preserve sandbox protections. Real browser-process restart and OS reduced-motion emulation remain unverified; reload and own-backend restart were verified.
5. **Full master-plan acceptance:** the source mechanisms are implemented progressively, but the two baseline failures and external verification gaps prevent declaring all 25 criteria fully accepted. Human-reviewed fixture evidence does not prove autonomous procedure compliance. Historical Linux process-termination failures are not declared resolved by passing Windows worker/deadline tests.

Continue with bounded independent review and one writer per file. Preserve exact model IDs, personal data, approval gates, original raw evidence and explicit restrictions. This branch does not authorize merging, releases, CLA acceptance, history rewriting or live-provider calls.
