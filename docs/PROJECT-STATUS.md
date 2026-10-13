# Planwharf project status

Task: `PLANWHARF-FINAL`. The final-scope acceptance is retained. The owner subsequently requested model role permissions and English publication guides; these additions do not introduce a new development phase or roadmap.

## Purpose

Planwharf is a local project notebook and AI coding coordinator. Planwharf explains project goal, progress, history and next action. Orchestrator explains approved AI work, processes, exact model identities, quota and invocation usage. One backend owns durable state.

## Implemented capabilities

- Living Plan revisions, Grill, project folders, personal notes with optional AI relevance.
- Approved MegaTasks, dependent SubTasks, real local coding workers and structured Results.
- Stop, graceful pause, existing deadlines, checkpoints, changed-repository confirmation and Resume without replaying completed work.
- Business labels from provider-reported login metadata, account-scoped roles and account-change cache invalidation.
- User-controlled provider/model catalogs, independent persisted Orchestrator/Worker/Reviewer permission flags, role filtering, eligibility, coding/research/tool capabilities and shared REMAINING quota pools.
- Adapter execution facade and documented developer registration contract.
- Deterministic command/status paths, compact selected-project briefings and six bounded recent chat turns with full archived history.
- Persistent metadata-only invocation ledger and operational AI usage view, including reliable provider-reported lead tokens when available.
- Grouped timeline with technical evidence, deterministic changes since last visit and checkpoint previews.
- Readable JSON export containing metadata and Markdown summary; optional local browser notifications.
- Normal desktop launch opens one window with Planwharf and Orchestrator views sharing one backend. Desktop window close and application Quit both follow the checkpoint/shutdown policy.

## Verified environment

Windows, Node.js 22 and Edge are exercised by the regression and browser harnesses. Real final workers use `codex/gpt-6-luna`; real checkpoint assessments use `codex/gpt-6-sol` and `codex/gpt-6.1-sol`. Earlier retained Phase 2.1 reports document real Codex and Antigravity probes and Grok account/CLI limitations. Provider availability belongs to the user's installed CLI/account; these checks do not promise model access for other accounts.

## Known limitations

- Export-only: there is no automatic import or portable restore. Preserve notebook plus attempts directory for full recovery. Export omits source and large raw logs.
- Local notifications depend on OS/browser support and permission, and require an open UI. Notification preference is local to a browser profile.
- Quota and catalogs depend on provider interfaces. Unread values remain explicit. Antigravity uses configured exact models when non-inference enumeration is unavailable.
- Antigravity retains its normal display names because no verified account metadata interface is available; automatic per-account role separation is unavailable there.
- Source-protected research remains supported only by the verified Codex adapter.
- Full conversation/evidence archives grow with intentional work. Context sent to AI and recent usage rendering are bounded; historical evidence is preserved. There is no billing estimator.
- Windows is the verified desktop platform. Linux/macOS launcher paths exist but were not validated in this Windows acceptance.
- Repository comparison is conservative; incomplete baselines require confirmation. It cannot automatically prove that arbitrary external edits satisfy a pending slice without valid structured evidence.

## Tests and release state

Run `node validation/phase1-suite.cjs` for the complete local regression suite, including browser checks. Run `node engine/final.test.cjs` for focused final-scope checks. `node validation/live-acceptance.cjs` opts into real providers against an isolated harmless project; it reads personal projects solely for explicit recipient-isolation verification and checks unchanged source/notebook hashes. `node validation/launcher-smoke.cjs` validates the compiled Windows launcher with an isolated notebook.

Published checkpoint: [v0.1.0](https://github.com/benitz94/Planwharf/releases/tag/v0.1.0), an initial development prerelease. Business account labels, account-scoped role preferences and attribution notices are on `main` in this source commit. The v0.1.0 release ZIP does not include these later source changes. The existing release/tag is preserved as the rollback checkpoint. See `PLANWHARF-FINAL-ACCEPTANCE.md`, `MODEL-ROLES-VERIFICATION.md` and `ACCOUNT-METADATA-VERIFICATION.md` for acceptance evidence and limitations.
