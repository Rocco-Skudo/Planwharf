# Priority audit fixes — 20 October 2026

Follow-up to [audit PR #19](https://github.com/benitz94/Planwharf/pull/19), based directly on Benito’s main at `d6c49d0952ded776a45b444e81788ce0ae435fbe`.

| Finding | Change | Evidence |
| --- | --- | --- |
| I-01: Soundtrack covers Send | Measure the fixed player and reserve its height in desktop chat; put the player in document flow for single-column/mobile layouts. | Ordinary pointer clicks and successful actual HTTP submissions at 1440×1000, 720×500 (200% reflow equivalent), and 390×844, with audio enabled and disabled. No forced clicks or keyboard fallback. |
| I-02: Listed models fail inference | Query the Codex catalog with the installed native CLI version. Distinguish catalog membership from successful inference. Retain rejected routes across refresh/restart, scoped to account, CLI version and configuration. An explicit exact-model retry clears rejection without claiming inference success or launching work. | Installed CLI is 0.144.3; the old code queried as 0.162.1. The correctly versioned real catalog excludes gpt-6.1-sol. Regression checks cover version query, unknown-version failure, durable rejection, account changes, late old-account responses and explicit retry. |
| I-03: Unsupported models shown as quota failures | Prefer the structured fatal response over incidental stderr and recognize “not supported” model errors. | Both captured exact-model errors classify as PROVIDER_MODEL_UNAVAILABLE. A real owned CLI child emits the captured error plus misleading quota/429 stderr and receives the correct diagnostic. Genuine 429 remains a usage-limit error. |
| I-04: Intermittent Home 500 | Retry Windows sharing-denied atomic replacements with a bounded 620ms backoff; persistent lock/permission failures return an actionable 503. Retain atomic replacement and the notebook edit queue. | A real Windows read lock reproduces the exact Home 500 and traces to EPERM at rename. The HTTP regression succeeds when the lock clears after 250ms and preserves a concurrent note. A persistent real lock returns 503 and leaves the old notebook bytes intact. Retry bounds and non-retryable errors are tested. |
| I-05: Eight unnamed dialogs | Reference a unique visible heading from each native dialog. | Chrome accessibility tree gives all eight dialogs nonempty computed names; Escape restores trigger focus. |

## Validation

- Focused provider, Home, execution, containment, Supervisor and Soundtrack suite: **102 tests, 99 passed, 0 failed, 3 skipped** (Windows file symlink capability unavailable).
- Repository engineering CI: **216 checks passed, zero failed**.
- Production-server browser audit: **14 passed**, zero JavaScript errors and zero failed browser HTTP requests.
- Live state audit: **8 passed**, including idle/completed/checkpoint/running, real helm animation, reduced motion, animations off and reload preserving the backend worker.
- Fresh disposable workflow: calculator build; deliberate division-by-zero defect rejected by review; correction and separate accepted review; nonzero exit, malformed result and absent result correctly fail; hanging workers stop; three concurrent projects; clean app restart; changed-repository confirmation; completed prerequisite not replayed (one attempt) and pending slice resumed (two attempts); import/relink/moved folders; missing executable; deadline checkpoint and PID termination; approval and missing-Skill controls. App shuts down normally with no owned workers left.
- The E2E harness now creates its required owned Git baseline before asserting changed-repository confirmation. It runs state checks before the deliberate missing-Skill control, which intentionally leaves the calculator project failed. Earlier failed runs remain private and preserved.
- One concurrent focused run hit a transient Windows cleanup lock in the existing containment fixture. Its isolated rerun and the final serial focused run passed. Browser geometry checks wait for normal Playwright pointer actionability after responsive reflow; requests still use ordinary clicks.

`verification.json` contains sanitized results and hashes of retained private evidence. No prompts, credentials, account keys, notebook paths or raw local HTTP logs are published.

## Limits

The original uninstrumented intermittent Home failure had no retained stack. This change fixes a reproduced Windows failure with the same endpoint/status/body; it cannot prove every historical 500 had that cause. Another cause would need its own reproduction.

The calculator workflow uses an explicitly labeled deterministic CLI fixture through the real runner. This is not evidence that a commercial AI completed the calculator. The correctly versioned installed Codex catalog excludes the previously rejected exact model; no replacement model was selected and no successful commercial inference is claimed. Workers still have their existing OS permissions; the application containment checks do not create an OS sandbox. Physical speaker output is not measured.
