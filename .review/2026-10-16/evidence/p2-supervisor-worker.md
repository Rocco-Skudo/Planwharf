# P2.1/P2.2 Supervisor backend worker — frozen for independent review

Authoritative sections read: spec 4, 12 and 13, plus coordinator master plan and repository AGENTS.md. Worktree `worktrees/p2-supervisor`, branch `coord/p2-supervisor`, base `d3fae01fa183b00780620dd47a0598f28c9058a6`; all changes uncommitted. No user configs/notebooks/credentials touched.

Exact P2-only changed paths: engine/model-roles.cjs, engine/supervisor.cjs, engine/runner.cjs, engine/invocations.cjs, engine/orchestrator.js, engine/model-roles.test.cjs, engine/supervisor.test.cjs, engine/provider-accounts.test.cjs. New P2 paths: engine/supervisor-role.test.cjs, engine/supervisor-transport.test.cjs. Coordinator authorized provider-accounts.test.cjs only to add supervisor:false to the two expected role object literals; historical assertion is retained at line84. Allocated server.cjs/model-policy-ui.js/models.js remain unchanged: server already rejects unknown advisory request fields, actual role picker/filter is in orch.js (frontend owner).

Implemented foundation:

- Fourth technical role supervisor, false by default for legacy/new models, existing three permissions preserved. Unsupported advisory transports remain ineligible, with no fallback or provider identity change.
- Core remains model-free and continues observing while an advisory response is pending. AI auto interpretation is off by default; schema1 Supervisor preferences migrate to schema2 with legacy selected ID retained as historical metadata, active model selection/auto cleared. Names/alerts/history preserved; blank name exactly Supervisor.
- Supervisor settings/requests check Supervisor rather than Reviewer permission, exact model/provider availability and quota before calling. Meaningful-event auto budget retained (at most3/hour); blocked models do not consume automatic calls.
- Only API no-tool advisory is supported. Codex read-only filesystem sandbox still permits arbitrary read-only shell, so it does not meet the specification's no-shell authority; Codex/Grok/Antigravity/configured CLI advisory fail closed. No guessed flags, extra permissions or live provider calls. API requests omit tool declarations and reject model tool calls instead of executing them.
- Usage ledger separates supervisor group and marks interrupted supervisor calls BLOCKED after restart.

Focused pre-edit baseline (`p2-supervisor/baseline/*.json`, temporary fixtures, real localhost): existing model roles2/2 PASS, Supervisor5/5 PASS, provider-accounts1/2 with established upstream line84 failure.

Foundation verification (`p2-supervisor/foundation/*.json`): existing roles2/2 PASS; existing Supervisor4/5 (Supervisor-only HTTP fixture correctly exposes held orchestrator's obsolete Reviewer check); new initial role cases4/4 PASS; transport2/2 PASS; historical accounts line84 still fails identically.

Additional pre-integration reproduction (`p2-supervisor/pre-integration/*.json`): role cases5/6 PASS, with real HTTP failure showing existing generic enable silently grants supervisor=true after extension of ROLE_IDS. This is required repair in held engine/orchestrator.js, not a test weakened for green output. New no-tool transport cases2/2 PASS. Syntax/diff checks pass for touched foundation files.

Orchestrator integration completed after explicit coordinator release following P1.4 review:

1. reviewSnapshot checks exact Supervisor role, retains availability/quota/no-fallback gates, records ledger role supervisor and account metadata.
2. Generic setModelEnabled and setCatalogSettings(allModelsEnabled) preserve current opt-in flag on enable and clear on disable; new eligibility never implicitly grants permission.
3. Validation text lists four roles. Fleet snapshot exposes Supervisor eligibility.
4. Exact reviewed P1 activity/session/history files were seeded before editing. Orchestrator seed SHA256 verified `68D5EFD28B9B31D414D331E3CF204B786F8CAEA39AB088A5A366C006576D385E`; dependency hashes in `p2-supervisor/seeded-dependencies.json`. P2-only patch compares against this integration seed, so no P1 hunks are replayed.

## Final actual verification

Command: `node ../../evidence/p2-supervisor/integrated.cjs` from this worktree; every child command is individually recorded in `p2-supervisor/integrated/<filename>.json`, timeout45seconds, TEMP/TMP under evidence scratch, real localhost allowed, only injected/model-free fixture providers. **8/9 selected files PASS**:

- model-roles.test.cjs:2/2 PASS.
- supervisor.test.cjs:5/5 PASS, including real HTTP Supervisor-only (Reviewer false) authorization/revocation, exact provider/model, independent concurrent local API transport, no tool execution, persisted alerts/restart.
- supervisor-role.test.cjs:7/7 PASS: default/legacy no grant, schema migration preserving names/history, call-time permission/availability/quota enforcement, dedicated usage/restart, Core observing pending advisory, real HTTP legacy/account role persistence and generic enable no-grant, and internal usage budget enforcement/debit/restart/catalog exemption.
- supervisor-transport.test.cjs:2/2 PASS, with both OpenAI and Anthropic API fixture protocol branches refusing shell/write/dispatch/approval tool attempts. CLI adapters fail before executable discovery/launch.
- activity.test.cjs, activity-events.test.cjs, activity-sessions.test.cjs, project-context.test.cjs:PASS. Reviewed P1 session and project isolation preserved.
- provider-accounts.test.cjs:1/2 as baseline; same established upstream assertion at84 reports true versus false after backend-stopped login change. No Rocco behavior imported/fixed, no other account failures.

Final `node --check` for all10 P2 changed/new files:PASS. `git diff --check`:PASS. P2-only `p2-supervisor/p2-supervisor.patch` passes `git apply --check` against coordinator integration source (exit0); `p2-supervisor/patch-check.json` records this. Exact base/new file hashes and patch SHA256 in `p2-supervisor/manifest.json`. Source now frozen pending independent reviewer; no self-approval.

Independent coordinator review identified a missing internal model-cost budget gate/debit. Meaningful new HTTP regression reproduced exhausted-budget advisory incorrectly completing (`internal-budget-before.json`, child exit1). Fixed both Core advisoryError and call-time reviewSnapshot checks to block remaining<cost unless providerCatalog is exempt under established worker semantics. Accepted bounded calls debit and persist store.usage before dispatch, including costs for attempted failing calls. Reproduction now passes: exhausted budget creates no invocation, final affordable call debits exact cost, next call and restart remain blocked, catalog models retain percentage quota gates with internal-cost exemption. Final integrated receipts above were rerun after this fix; all8/9 selected files retain expected outcomes, only historical account84 fails.

P2 UI integration is a later task (actual picker/filter in orch.js; embedded Supervisor in Supervisor UI/HTML). Frontend must recognize new mode `supervisor` while preserving historical `reviewer` turns, show API-only no-tool transport availability and usage group `aiUsage.supervisors`. No full P2 or live provider acceptance claimed. Actual Codex advisory is intentionally unsupported until a verified no-shell/no-tool transport exists; this does not disable Codex's other three existing roles. No commits (including fixture Git commits), pushes, publication, CLA actions, installs or user-process operations.
