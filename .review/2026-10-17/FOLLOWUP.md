# PR #7 follow-up: failures resolved and remaining source gaps repaired

This follow-up builds on `5568a73b853ec42a137eb5a6c84e95bcdbe3ab01` in the same isolated checkout and review branch. It supersedes the two unresolved-test and unsupported-docs-path entries in the earlier handoff. Prior reports and logs remain historical evidence rather than being rewritten.

## Both reproduced test failures are resolved

**Provider-account catalog access.** A cached catalog for a returning account could overwrite an explicit unavailable state before fresh discovery failed. The repair adds hashed, persisted invalidated scopes; synchronous scope observation before snapshots; generation/scope checks that discard stale discovery responses; and a queued current-scope refresh after an older request completes. Fresh successful discovery clears the block. An unchanged account's freshly verified cache can still support a temporary offline catalog check.

Account invalidation must persist before the server commits its new account binding. The binding is first checked without mutation, invalidation is awaited, and only then is the new binding saved. A failed invalidation write leaves access blocked and the old binding intact so a retry or restart repeats the necessary invalidation. Cache writes use a serialized queue and distinct temporary paths. Existing roles and exact model IDs are preserved; account-scoped role permissions remain separate from availability.

Regressions cover the original account-switch/restart assertion, repeated offline restarts, old-account discovery finishing after a switch, same-key return/generation invalidation, configuration changes, failed cache persistence and server binding durability. This is an independently implemented and independently reviewed repair. Separate contribution `99fe5867b3d04af4fa3a22b604b595188cbb26b1` remains unavailable and was not integrated or represented as reviewed.

**Orchestrator checkpoint fixture.** The existing Stop/relaunch fixture implicitly enabled Skills while providing no cache, ignored its failed approval response and dereferenced the error response. It now explicitly disables Skills for that unrelated checkpoint scenario and asserts approval, Stop and restored-snapshot HTTP statuses before examining response fields. Production Skills approval gates remain unchanged.

## Other master-plan gaps repaired

- Instruction deduplication now compares normalized content rather than path-bearing display headers. Identical local files in different folders, CRLF/LF variants and identical remote/local procedures attach once. Distinct supporting procedures remain distinct. The server accepts the safe duplicate alias rejection in Manual mode instead of treating it as an unavailable required Skill; an actual offline CLI regression verifies one copy is delivered.
- Reviewed candidate metadata can declare bounded explicit conflicts. One-way declarations block both otherwise eligible Skills with an auditable exclusion/disable message. Malformed and self-conflicting declarations are rejected. No conflict pairs are invented for existing candidates, and arbitrary prose is not claimed to be semantically analyzed.
- Delivery details now show why each attached Skill was selected, alongside its content hash and transport stage.
- Fresh idle linked projects distinguish `unknown` document availability from inspected `none` and truly `unlinked`. A linked project can request explicit docs inspection without launching workers or polling every project folder. Explicit inspection remains authoritative and rejects an empty local docs set.
- The model catalog status now distinguishes retained same-account availability from invalidated cached access requiring fresh verification.

## Reviewed Grill-with-docs compatibility path

The native `Skill` calls in the original pinned entry are not executed or claimed supported. The reviewed compatibility adapter supplies the approved grilling procedure separately and bundles domain-modeling plus its glossary/ADR formats. It requests an interview and glossary/ADR **drafts in chat only**, preserves role/approval/no-publication rules, and does not authorize source/document writes or worker dispatch. This is an instruction policy, not a filesystem sandbox guarantee or proof of model compliance.

The adapter is visible as `PLANWHARF-COMPATIBILITY.md` in the content inspection and is included with original source bytes in the approved content hash. The original source remains inspectable. An explicit docs interview is required, respecting the upstream entry's disabled automatic invocation. Ordinary chat omits the docs Skill. Separately approved, selected and eligible `matt/grilling` is required. Changed dependency or policy bytes revoke eligibility until reviewed again. No duplicate grilling procedure is bundled into the docs package.

Reviewed source revision: `mattpocock/skills@49dd158d1076134a641b33efb035946536778336`. Preserved sources and MIT attribution are under [source-review/matt-docs/](source-review/matt-docs/). Upstream Git blob identities:

| Source | Blob SHA |
| --- | --- |
| `skills/engineering/grill-with-docs/SKILL.md` | `62b9efb6f991d1b229adee7506962f13ced0c499` |
| `skills/engineering/domain-modeling/SKILL.md` | `a4438c6879c517d1a08e2b5fbca049b632688dfe` |
| `skills/engineering/domain-modeling/GLOSSARY-FORMAT.md` | `9c0b4c7a2e8507c23cbb5e0baa66d81699321cc6` |
| `skills/engineering/domain-modeling/ADR-FORMAT.md` | `d7e61f30a9fd8ca70d9ee68f019c2a9ebf2d13f7` |
| `skills/productivity/grilling/SKILL.md` | `df69d9936880cd3314c28858c6c52f48db23b856` |
| `LICENSE` | `f1dd2c09108dde1a5f56097cee8461b3ea834499` |

These files were read through GitHub at the exact pinned revision. No imported scripts, hooks, MCP, subagent dispatch or extra permissions were enabled.

## Fresh validation

Final broad command from the isolated checkout:

```powershell
node ..\run-offline-suite.cjs . ..\followup-publish-suite
```

**62/62 engine test files pass, zero failures, zero skips.** The original `provider-accounts.test.cjs` and `orchestrator.test.cjs` now pass. Per-file logs and machine-readable outcomes are in [evidence/followup-suite/](evidence/followup-suite/). This replaces the current result of 59/61; it does not rewrite the earlier baseline evidence of 50/52 or prior checkpoint evidence of 59/61.

The offline runner uses actual local Node/HTTP processes and injected providers, denies external global fetch, and substitutes native executable paths until a test installs its own fixture. No live model/provider execution or real account/credential inspection was used. `skill-docs-delivery.test.cjs` exercises the actual HTTP approval path and runner with a real configured Node CLI fixture; it confirms exact source/policy delivery once, truthful stdin receipts, ordinary-chat omission, separate project state, no fixture documentation writes and safe duplicate-alias dispatch.

Independent review covered the account repair and its failure ordering, docs adaptation/source/dependency/hash gates, deduplication and declared conflicts, Manual selection behavior, error messages and document availability. Reviewer findings were repaired and rechecked. Syntax checks and source whitespace checks pass.

Real in-app browser verification used a fresh isolated backend and reviewed offline source responses:

1. Separate download consent, inspection of original source and compatibility policy, exact-content approval, Manual selections and delivery opt-in.
2. A fresh linked project's explicit Docs action, actual offline CLI response and submitted transport receipt containing both exact Skill hashes and visible selection reasons.
3. Alpha settings and conversation restoration, while beta retains Auto mode, delivery off and no delivery records.
4. Simulated account A -> B with a failing injected catalog. The UI reports cached access is not restored and the model is unavailable. No live login was switched.
5. Own-backend restart and browser reload preserve the unavailable state and prior conversation. Final browser console errors: none.

Screenshots are under `screenshots/followup-*`. The fixture's received input contains each docs adapter, grilling and domain-modeling instruction block once. No source/document file was written by the fixture. This establishes local transport and UI behavior, not successful model procedure execution.

## Acceptance status and remaining limits

Independent source audits found no further concrete missing implementation in the master plan within the current authorization. The unified workspace, four roles, truthful activity, Supervisor metadata, project isolation, Ship behavior, project Skills selection/delivery, manual generation and separately approved Assisted suggestions have mechanisms and tests. Full Auto remains disabled as specified.

Full provider/platform acceptance is still not claimed. Remaining demonstrations require capabilities outside this session's current evidence or authorization:

- Live-provider/native Skill recognition, consumption, compliance and verified real outcomes: unverified; no live calls are authorized.
- Installed Edge/Chrome automated harnesses crash at blank-page smoke. The in-app browser works and was used; browser sandbox protections were not disabled.
- Full browser-process restart and OS reduced-motion emulation remain unverified. Reload and own-backend restart were verified.
- Passing Windows worker/deadline tests does not establish that historical Linux process-termination failures are resolved on Linux.
- Human-reviewed Assisted evidence remains explicitly human review, not autonomous test/procedure proof.

All data, approval, exact-model and original-evidence restrictions remain. This work is for draft PR #7 only; no merge, release, CLA acceptance, history rewrite or live provider call is authorized.
