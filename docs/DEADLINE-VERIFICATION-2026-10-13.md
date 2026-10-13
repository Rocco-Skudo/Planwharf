# Phase 2 Finish by verification — 2026-10-13

The Phase 2 execution branch previously bypassed the legacy deadline check. An isolated regression reproduced a worker launching even when its assignment was approved at an already expired deadline.

The execution bridge now persists MegaTask timing, checks it before dispatch and between parallel launches, and handles expiration through worker-tree termination and a durable checkpoint. It preserves completed slices, partial result evidence, and interrupted attempt identities. A fully completed assignment remains COMPLETE, including a completion racing with termination. Failed termination stays visible, blocks scheduling, and retries; a live worker is never reported as successfully checkpointed. Older persisted MegaTasks acquire timing from their job. Explicit Resume from a deadline checkpoint continues beyond the original expired time with fresh attempts for remaining slices.

The default backend monitoring interval is four seconds. Expiration is checked on a scheduling/monitoring tick and process termination can take longer; this is not an exact-time guarantee. The backend must remain running. Read-only Home and Orchestrator projections do not terminate workers.

## Verification

`node --test engine/phase2-deadline.test.cjs` passes all 11 cases covering overdue approval, incomplete work, retained completed results, no dispatch of dependencies after expiry, checkpoint idempotence, explicit Resume after restart, complete evidence at the deadline, completion racing with termination, discretion mode, unapproved proposals, failed/throwing termination with retry, older persisted metadata, explicit Stop resolving a previous termination failure, and a deadline crossing during parallel dispatch.

The background integration case starts actual isolated Node parent/descendant processes through the server with no application window. After approval it observes only persisted state, without any API polling to drive scheduling. The backend timer terminates the deadline project's process tree, saves the deadline checkpoint, and leaves a second project's actual worker tree alive. No model inference or personal project dispatch is involved.

Additional regression checks use the existing Phase 2 HTTP, execution Next, process transport, lifecycle, and browser suites. Raw historical acceptance reports remain unchanged; current user instructions in README and HOW-TO now describe deadline enforcement.

The first broad run, `validation/phase1-suite-1791849191688`, passed the deadline regression and exposed an unrelated browser-test startup race: it tried to change a still-disabled revision selector before its options loaded. The browser check now waits for that control to be enabled, and revision selection ignores invalid IDs rather than crashing. `verify-ui.cjs` covers rejected empty/invalid/missing revision IDs. This run's failure output remains unchanged. A fresh complete run verifies the final changes.

Final evidence: `validation/phase1-suite-1791849421051/results.json` — all **46/46** validation scripts pass, including all **11** deadline cases, actual parent/descendant termination, Phase 2 HTTP and browser checks, and the corrected Phase 1 browser test. `personalNotebookUnchanged` is `true`. JavaScript syntax checks and `git diff --check` also pass. Use **Quit application** and relaunch to load the updated execution bridge in an already running application.
