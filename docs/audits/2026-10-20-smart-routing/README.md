# Smart Worker routing acceptance

Baseline: upstream `benitz94/Planwharf` main `1b895f3` (merged PR #20).
Branch: `feat/smart-worker-routing`. This is a draft for owner review; no merge or release.

## Architecture and settings

```text
existing task planning
  -> explicit Gold / exact-model constraint, or saved routing mode
  -> complexity evidence + eligible model roster + quota/resource restrictions
  -> durable SubTask routing receipt
  -> existing MegaTask approval
  -> recheck account, identity, roles, eligibility, quotas and concurrency
  -> existing attempt claim / Worker launch / structured result
```

`engine/smart-routing.cjs` owns deterministic assessment and selection. It uses coupled technical hazards, prerequisite count, observed changed-directory scope and recorded failed correctness tests. Request length and the words “premium” or “HIGH” do not increase complexity. Coupled concurrency/recovery/security/algorithmic risks receive stronger weight. Implementation and critical verification slices retain shared parent risks; bounded README/CSS/markup slices do not inherit unrelated parent complexity. No new inference or background evaluation call is introduced. Smart mode keeps an unsliced task coherent instead of using broad job classification to launch three generic slices. Explicit proposed dependency graphs retain their slices.

Catalog Order remains the default for existing installations. Models keep catalog order within a preference tier; the application does not invent model rankings or prices. Explicit model IDs and Gold stay exact, including research and Resume. A manually selected model can be used without automatic Premium eligibility, subject to roles, quota and configured resource restrictions. Automatic Premium decisions require both Smart mode and saved eligibility for the current account. There is no separate Premium consent state, modal or approval.

Open **Settings → Worker routing and model usage** (also **Workspace → Models & usage**). Save:

| Setting | Default | Behavior |
| --- | --- | --- |
| Automatic routing | Catalog Order | Smart Routing is opt-in |
| Model usage preference | Standard | Premium is a user preference, separate from roles |
| Automatic Premium eligibility | Off | Standing authorization for automatic Premium assignments |
| Maximum Premium assignments per MegaTask | Empty | Optional 0–1000; proposals reserve capacity and launches recheck distinct attempted slices |
| Maximum simultaneous Premium Workers | Empty | Optional 0–1000; existing execution limits still apply |
| Premium fallback | Use eligible Standard | Alternative: block difficult work |

Settings are stored in the isolated attempt store's `orchestrator.json` as `workerRouting` and account-scoped `routingPreferences`; they contain no credentials. Models without an identifiable account use their configured scope. Account changes retain old evidence but start with Standard/no automatic Premium authorization and disabled old-account roles. A receipt binds exact model, provider, CLI ID and account scope. Account or model changes block subsequent launches until an explicit local reassignment. Running processes retain their original identities when settings change.

New Smart and exact SubTasks, attempts and Results retain routing receipts (tier, level, signals, rationale, quota sample and configured restrictions). Automatic fallback/reassessment records prior receipts and timeline events. Provider 429/technical failures do not increase reasoning complexity or select a stronger model. A validated failed correctness test can contribute to reassessment on explicit Resume; exact/manual constraints remain pinned. Stop/restart/Resume retain assignment identity. Imported receipts are historical evidence; relinking alone grants no automatic execution authorization, and local exact reassignment is required. Malformed historical receipt metadata renders safely.

## Changed files

- `engine/smart-routing.cjs` and its regression tests: policy, assessment and selection.
- `engine/orchestrator.js`, `engine/execution.cjs`: routing integration, receipt identity, resource checks and history.
- `server.cjs`: validated routing settings/preferences endpoints and optional automatic proposal assignments.
- `engine/project-export.cjs` and tests: imported receipts remain historical evidence.
- `model-policy-ui.js`, `orch.js`, `workspace-ui.js`, `home-ui.js`: settings navigation, model preferences and decision details.
- `scripts/audit/*routing*`, `scripts/audit/harborqueue-browser.cjs`, `scripts/engineering/ci.cjs`: opt-in reproduction, evaluation and regression integration.
- This directory: real generated source, sanitized Results, hashes and UI evidence.

## Evidence

- [Policy comparison](policy-comparison.json): eight deterministic representative tasks, clearly labeled fixtures, with Catalog versus Smart assignments and rationales. Smart produced zero unnecessary Premium assignments and zero missed demanding assignments **within these labeled fixtures**. This is not a provider-quality benchmark.
- Actual CLI-backed Standard assignment: `codex / gpt-5.6-luna`, LOW, created the HarborQueue dashboard and run instructions after ordinary approval.
- Actual CLI-backed Premium assignment: `codex / gpt-5.6-sol`, CRITICAL, implemented the concurrent DAG scheduler, crash recovery, exclusive ownership and fault injection after ordinary approval. Selection was observed; neither task supplied an exact model ID or a forced complexity label.
- Real independent HarborQueue review initially **FAILED** despite 14 passing tests. It reproduced lossy JSON payload acceptance and inconsistent persisted attempt histories. The first correction passed 21 tests; a second real review then reproduced two simultaneous owners during stale-lock reclamation. A further real Premium correction added an atomic acquisition guard, authoritative revalidation and two deterministic ownership regressions. The delivered artifact passes **23 tests**. A final focused real-model verification accepted the lock correction, ordinary dead-owner recovery, and documented abandoned-guard behavior; source hashes were unchanged by review. Both review failures and corrections are retained in the sanitized evidence.
- Three actual `gpt-5.6-luna` Workers ran together in distinct disposable projects, each with its own receipt. Chrome verified all three running Ship states. Stop killed all three owned process trees and saved checkpoints. A clean backend restart retained Smart settings and the saved Standard assignment; explicit Resume completed with the same exact `gpt-5.6-luna` model. The app then quit normally with no owned live Workers.
- Chrome settings/receipt checks: seven passed; three additional live-concurrency Ship checks passed. No unexpected Premium approval modal and no uncaught browser errors in these checks. [UI evidence](routing-ui.png), [saved settings](routing-settings.png), [concurrency evidence](routing-concurrency.png). The real HarborQueue scheduler/dashboard also passes five browser checks, including visible HTTP failure handling: [dashboard](harborqueue-dashboard.png).
- Focused routing/orchestration/provider/import/containment/Gold/Codex-result/Soundtrack/Captain regressions: **96 passed, 3 skipped, 0 failed**; see [verification.json](verification.json) for the command and evidence.
- Engineering CI initially timed out in the existing native Codex fixture while actual workers were active; the isolated rerun passed all 225 checks; the final delivery run, including newly tracked harness and HarborQueue syntax checks, passed all 233 checks. The earlier failure is not rewritten as a pass.

The actual catalog was queried using installed Codex CLI 0.144.3. Both exact test IDs were listed and subsequently executed successfully. Grok's account was unread, so no Grok execution is claimed. Model tiers are saved acceptance-test choices, not verified monetary or quality classifications. Raw account metadata, notebook files, prompts and CLI/HTTP logs remain private outside the repository.

## Independent implementation review

Two independent reviewers checked Standards and Spec against the pinned baseline and rechecked the corrections.

### Standards

The reviewer found substitution of an explicitly selected research model, contrary to AGENTS.md, and restoration crashes on malformed imported receipts. Both were corrected with HTTP regressions. The reviewer confirmed the research selection remains exact, malformed receipts restore safely, and no further concrete Standards findings remained in the recheck.

### Spec

The reviewer found excessive parent-risk propagation into routine slices and missing live concurrency in configured Standard fallback selection. Both were corrected. Recheck also found the zero-concurrency-limit fallback edge; that was fixed and exercised by proposing before approval, changing the cap while a Worker runs, and observing the remaining automatic assignment fall back to Standard. The reviewer confirmed no remaining findings within this requested recheck.

## Reproduction

Use a fresh disposable directory and an installed authenticated CLI. The real harness verifies the notebook path and requires the exact catalog-listed test IDs; it never substitutes a fixture provider.

```sh
node scripts/audit/start.cjs NEW_DISPOSABLE_DIRECTORY
node scripts/audit/smart-routing-real.cjs init NEW_DISPOSABLE_DIRECTORY
node scripts/audit/smart-routing-real.cjs scaffold NEW_DISPOSABLE_DIRECTORY
node scripts/audit/smart-routing-real.cjs core NEW_DISPOSABLE_DIRECTORY
node scripts/audit/smart-routing-real.cjs review NEW_DISPOSABLE_DIRECTORY
# If an independent review finds a defect, inspect it before using the documented correction stage.
node scripts/audit/smart-routing-real.cjs concurrency NEW_DISPOSABLE_DIRECTORY
node scripts/audit/smart-routing-browser.cjs NEW_DISPOSABLE_DIRECTORY --concurrency
node scripts/audit/smart-routing-real.cjs stop-concurrency NEW_DISPOSABLE_DIRECTORY
node scripts/audit/smart-routing-real.cjs shutdown NEW_DISPOSABLE_DIRECTORY
# Restart start.cjs with the same disposable directory, then:
node scripts/audit/smart-routing-real.cjs resume-concurrency NEW_DISPOSABLE_DIRECTORY
node scripts/audit/smart-routing-real.cjs shutdown NEW_DISPOSABLE_DIRECTORY
```

Browser scripts require Playwright through `CODEX_PRIMARY_RUNTIME_NODE_MODULES` and a browser executable through `PLANWHARF_TEST_BROWSER`. They operate the real controls and observe backend execution. Localhost/native-process tests may need execution outside a restricted host sandbox. Nothing in this harness installs dependencies, changes the user's global account or provider configuration, or merges/releases.

## Limits and comparison interpretation

Assessment is a transparent deterministic English-language engineering heuristic, not a semantic guarantee. Ambiguous tasks can still be misclassified; exact Gold selection and saved preferences remain available. Actual tests demonstrate successful execution, not inherent superiority of one model. The Catalog comparison is deterministic policy evaluation; the same difficult project was not independently rebuilt with Catalog mode, so no comparative provider correctness, latency advantage or monetary savings are claimed. Real completion times and reported provider usage are retained separately where available.

The initial acceptance run exposed a legacy fixture failure on unchanged merged PR #20: `engine/orchestrator.test.cjs:201` assumed a nonexistent developer-specific folder. The follow-up fix replaces every hard-coded source folder with a real disposable workspace, puts all fixture stores under an owned temporary root with cleanup, and updates two obsolete Home action-text assertions. The full legacy workflow now passes and is required by engineering CI. The expanded regression run passes **97 tests, with 3 Windows file-symlink skips and 0 failures**; HarborQueue still passes **23 tests**, and engineering CI passes **234 checks**. See [the fixture-fix verification](legacy-fixture-fix.json). Original acceptance evidence above and in verification.json remains historical; its earlier failure is preserved.

[Delivered HarborQueue source and run instructions](harborqueue/README.md) document at-least-once crash recovery and cooperative cancellation. An interrupted ownership-acquisition guard fails closed and may require documented manual intervention after all contenders are stopped; ordinary steady-state owner death remains recoverable. It does not promise exactly-once external side effects or universal power-loss durability across filesystems. See its delivered README and deterministic tests for the precise contract.

## Follow-up: skipped tests and full-suite coverage

All three formerly skipped containment cases now execute locally using real Windows junctions; Linux CI also covers actual file symlinks. This exposed and fixed Git for Windows traversing a foreign-project junction during inspection. Git now fails closed before launch when bounded source inspection finds an external redirect (or cannot safely complete within 100,000 entries).

The full active suite passes **309 tests, 0 failures, 0 skips across 84 files**, including HarborQueue. Both standalone and embedded Worker UI checks pass. Additional stale transport fixtures now supply the linked workspace and use the current Codex final-response contract. The Models panel again shows escaped assignment summaries. Soundtrack nested tests execute rather than silently inheriting the parent test context. Required engineering CI now discovers every active test file; historical `.review` snapshots retain their original bytes and are excluded. Reproduce with `node scripts/engineering/ci.cjs`; [follow-up verification](skipped-tests-fix.json) records the exact inventory and log hash. Earlier acceptance and fixture-fix counts above remain historical.
