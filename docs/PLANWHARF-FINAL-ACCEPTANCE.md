# PLANWHARF-FINAL acceptance

Date: 13 October 2026. Scope: final local notebook/coordinator completion, preserving the verified Phase 1, 2, 2.1 and 2.2 behavior and historical evidence.

## Product changes

Deterministic Stop, Resume, approval, model toggles and mode commands retain local execution paths. Explicit quota, provider/model status, process state, checkpoint and selected-project inquiries now bypass model reasoning and repository inspection. New work, clarification and reasoning still use the selected lead when necessary. Targeted actions schedule and inspect only their recipient; unapproved or paused proposals do not repeatedly inspect source during idle polling.

Briefings contain the selected goal, current work, pending slices, three recent relevant results, checkpoint identity/completed/pending IDs, AI-relevant notes, repository delta, exact roster and inspectable paths. Six bounded recent turns replace full conversation replay. Full original conversation history remains archived on disk, with the archive path supplied to the lead.

`invocations.jsonl` records invocation identity, role, project/task/attempt links, provider, exact CLI model, reason, start, duration, outcome and available process exit. Whitelisted metadata excludes prompts, raw output, environments and credentials. Reliable Codex lead token events are retained when present; unknown worker/provider counts remain absent. Orchestrator displays per-model counts, total durations, terminal worker outcomes and recent calls without billing estimates.

Provider execution is behind the adapter registry/facade. Capability exclusions and explicit eligibility control routing; catalog order remains user configuration. Quota stays shared by provider pool and always communicates REMAINING. Large catalogs have search, provider toggles and persisted expansion controls.

Home groups execution milestones while retaining technical timeline events. Changes since last visit use deterministic aggregation. Checkpoint previews summarize repository/plan changes; Resume confirmation remains conservative and completed work is preserved. Graceful pause and existing deadline policies are retained. Notes gain optional AI relevance, defaulting to user-only. Local notifications are optional and require supported browser permission.

Export downloads readable schema 1 JSON with metadata, Living Plan revisions, notes, tasks, results, checkpoints, summarized/raw structured timeline events, selected operational settings and Markdown summary. Source contents, raw execution logs and provider credentials are excluded. Automatic import/restore is intentionally outside this completed scope.

Normal desktop launch now opens Planwharf and Orchestrator windows sharing one backend. Direct browser access retains the unified view. Native window focus, reopen, independent close and proper application Quit use the existing backend/checkpoint lifecycle.

## Real provider workflow

Retained evidence: `validation/phase2-browser-live-1791924168802/`. Its `acceptance.json`, `backend.jsonl`, `attempts/`, structured results, `project-export.json`, `final-usage.json` and screenshots record the observed run.

- MegaTask: `MT-6cd1ee4b-6d89-4505-a9c8-48badf037140`.
- Checkpoint: `CP-740f58be-4884-4b44-be60-be672b16b409`.
- Workers: exact `codex/gpt-6-luna`; three Attempts, two COMPLETE and one deliberate Stop recorded as BLOCKED.
- Real leads: exact `codex/gpt-6-sol` and `codex/gpt-6.1-sol`. Both identified the checkpoint and answered `RERUN_COMPLETED=no` from the compact briefing.
- Selected isolated project, proposed and approved work, real worker-created arithmetic module/tests, updated Home, started dependent work, Stop/checkpoint, backend restart, explicit Resume, changed lead, completed dependent verification, rendered timeline/usage/quota, and exported metadata.
- First SubTask kept exactly one Attempt. Resume created a fresh Attempt only for the interrupted second SubTask. `node sum.test.cjs` passed against real generated files.
- Observed quota: **78% REMAINING**, reset `2026-10-14T01:17:58.000Z`. This is a timestamped observation, not a promise about current quota. Asking for quota did not add a lead invocation.
- At the usage checkpoint: worker duration 47,886 ms; lead durations 6,453 ms and 9,314 ms. Durations come from the local ledger, not cost estimates.
- Both AI-Companion-Desktop → RaceEngineer and RaceEngineer → AI-Companion-Desktop isolation assertions passed. Explicit read-only recipient checks launched zero workers and preserved both personal source trees and the unrelated execution graph.
- Personal notebook SHA-256 remained `282c10efcd8d2bd525b03a6fa633cd3dbd189e11a6546894cd3265ff191e6973`.

Earlier failed or partial validation runs remain intact. A reverse-recipient probe exposed repeated inspection of an unrelated unapproved proposal; scoped actions and idle proposal inspection were corrected before the final successful run. No historical failure evidence was rewritten into success.

## Automated and desktop checks

`node validation/phase1-suite.cjs` includes all previous regression files and the new final-scope test file. The final run passed **47/47 regression files**, with the personal notebook unchanged. Its evidence directory is `validation/phase1-suite-1791924522683/`. Focused final tests cover fast paths/no lead calls, exact scoped actions in both directions, idle proposals, ledger persistence, capabilities/registry, shared quota, timeline, checkpoint diff, export, notes, notifications and separate windows. Conversation tests retain full archived history while asserting bounded model context.

The browser execution check renders 55 models, searches the last catalog model, expands all models, disables a provider and verifies persistence across reload. The compiled Windows launcher passed three rounds with one backend, repeated-launch reuse and both real window heartbeats: `validation/launcher-smoke-1791924035078/results.json`. Unit/HTTP checks verify that closing one UI does not stop workers or the other UI.

One Edge verification harness timed out during DevTools initialization. Its isolated browser now starts against the already-listening local URL, disables test extensions/background networking and allows 30 seconds for DevTools replies. Production browser defaults are unchanged. The restricted test environment still uses the existing test-only sandbox opt-out.

## Cleanup and security

`validation/final-cleanup.json` records zero RUNNING SubTasks, zero active Attempts, zero RUNNING invocations and the unchanged personal notebook hash for real acceptance. All acceptance worker PIDs (22976, 19424 and 844) were checked dead. The normal notebook's stored projects are COMPLETE with no running SubTasks or live worker receipts.

Tracked-file credential-pattern and auth-path scans found no credential files, private keys or provider-token patterns. New ledger/export artifacts contain no copied provider authentication. The disposable real-provider authentication profile was outside retained evidence and removed by the harness. Public CA bundle behavior was moved intact behind the provider facade; tests preserve explicit operator CA settings, TLS verification and child-only environment changes.

Duplicate legacy claim implementation was replaced by a compatibility facade using the durable attempt engine; all original claim tests remain. The unreachable legacy claims static route and unused server import were removed. Live legacy notebook/browser compatibility paths remain because their regression tests still exercise them. No ChatLLM implementation or speculative provider was added or found in current executable routing. Historical reports/raw evidence remain intact.

`git diff --check` passes. Existing uncommitted Phase 1/2 workspace changes, launcher binary and reports were preserved. The release candidate intentionally remains a reviewable working tree; no commit, tag, push, reset or publication was performed.

## Release conclusion

Recommend **v0.1.0** for the completed current product scope. Owner action is to review the prepared diff and create the release checkpoint. Export-only restore, provider-account availability, optional browser notifications and unverified non-Windows desktop platforms remain documented limitations. Development stops here; no next phase or roadmap is created.

## Files changed for final scope

- Engine: `briefing.cjs`, `invocations.cjs`, `project-history.cjs`, `project-export.cjs`, `final.test.cjs`, `provider-runtime.cjs`, `provider-adapters.cjs`, `provider-catalog.cjs`, `providers.cjs`, `orchestrator.js`, `execution.cjs`, `project-home.cjs`, `runner.cjs`, `app-windows.cjs`, `claims.js`, `conversation-history.test.cjs`.
- Backend/desktop: `server.cjs`, `planwharf.cjs`.
- UI/data validation: `home-ui.js`, `orch.js`, `window-ui.js`, `notifications.js`, `quota.js`, `plan.js`, `index.html`, `orchestrator.html`.
- Validation: `verify-browser.cjs`, `validation/project-recipient-browser.cjs`, `validation/phase2-browser.cjs`, `validation/live-acceptance.cjs`, `validation/launcher-smoke.cjs`.
- Documentation: `README.md`, `docs/HOW-TO.md`, `docs/PROJECT-STATUS.md`, `docs/PROVIDER-ADAPTERS.md`, this report.

Other files already modified at task entry remain preserved as part of the existing Phase 1/2 workspace. Final-scope work did not rebuild or replace the pre-existing launcher binary.
