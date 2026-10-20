# Real coding-model end-to-end verification

Follow-up validation for [PR #20](https://github.com/benitz94/Planwharf/pull/20), starting at `3a21ffd7477af09738efe7e61205480a551673b2`. This run used the actual installed **Codex CLI 0.144.3 with exact model gpt-5.6-sol**. No deterministic provider was registered for this run. The earlier fixture-based evidence remains unchanged.

## Failures reproduced and fixed

1. **Restricted worker cannot save completion metadata.** A real worker built the calculator and passed seven tests, then received “writing outside of the project; rejected by user approval settings” while writing the assigned result JSON. Its CLI exited zero, but Planwharf correctly refused completion without the result. Native Codex workers now return their result as a schema-constrained final response using `--output-schema` and `--output-last-message`. The trusted runner validates identity, status, tests and exit evidence before publishing it. Audit findings use this final-result channel too. Project writable roots remain unchanged.
2. **Stale result could survive rejected new output.** The native-boundary regression demonstrated that malformed fresh output plus an older valid result could still look complete to the graph reader. Exit evidence now records `resultVerified`; explicitly rejected output is never accepted, including after reload. Older historical exit evidence without this field stays readable.
3. **Valid negative review mislabeled as provider failure.** A valid FAILED review with provider exit zero remains a failed review, with its actual blockers and tests. It no longer receives a fabricated provider-execution diagnostic.
4. **Real rate limit mislabeled as protocol failure.** Nonzero native exits retain their provider diagnostic, including the observed HTTP 429. A zero exit with missing/invalid structured output remains a protocol error. Genuine rate limits and unsupported models remain distinct.
5. **Native worker inherited subagent fan-out.** One correction worker inherited the local CLI’s enabled multi-agent feature and delegated internally. Native Codex workers now explicitly set `features.multi_agent=false`, preserving Planwharf’s own dispatch, approval and process ownership. The final independent review and three-project run used this setting.

## Observed real-model workflow

- Exact-model connection and read-only lead planning succeeded. The blank calculator had no implementation files before approval.
- After the transport fix, the failed build resumed and completed with a valid real-model result; seven calculator tests passed and the selected project Skill marker was present.
- An independent real audit passed without editing calculator source.
- A deliberately injected CommonJS division-by-zero defect was rejected by a real audit: six tests passed and one failed. The audit identified the precise override and actionable correction, without modifying source.
- The real lead prepared a correction behind approval. A real implementation worker removed the defect and improved edge coverage. A subsequent independent real audit passed all seven tests, with no source edits or blockers. The host independently reran the same seven tests successfully.
- Browser/host checks: **34 passed** before fault injection, including an ordinary Send click that received an actual model response. After correction, **33 passed** with no additional inference request, zero JavaScript errors and zero failed HTTP requests. These check arithmetic, malformed input, Skill receipt, exact-model identity, actual keyboard operations, zero-division feedback, Escape reset and mobile reflow.
- An initial simultaneous three-session burst hit genuine provider HTTP 429. A later staggered run succeeded: three real workers each wrote a distinct project receipt and remained alive together; **four browser checks passed** for their receipts/processes and running Ship states. Stop killed all three owned process trees and saved checkpoints.
- The application restarted from disk successfully. Two resume attempts hit provider HTTP 429, including a retry after a 45-second cooldown; both preserved the checkpoint and recorded PROVIDER_USAGE_LIMIT. After a longer cooldown, the final real resume **completed successfully** with provider exit zero, exact result identity and resultVerified=true. All earlier failures remain retained. This clean-restart resume-to-completion scenario and the earlier real build resume both passed. Provider admission still required staggered starts and backoff; the application did not silently substitute models or fabricate success.
- The test application shut down normally with no owned live workers. No model was silently substituted, quota threshold relaxed, dependency installed, PR merged or release published.

The repository engineering checks pass **220 checks**; the new native result regression is included in CI.

The focused suite passes **103 tests: 100 passed, zero failed, three Windows symlink capability skips**. Native-boundary regressions cover valid final output, malformed output, wrong identity, nonzero exit, legitimate failed review, real-form 429 text and stale result rejection. `verification.json` contains sanitized results, generated-file hashes and hashes of retained private evidence. Raw prompts, local paths, account keys and authentication data are excluded.

## Reproduction

Use the opt-in commands in [scripts/audit/README.md](../../../scripts/audit/README.md). Select an exact currently listed model explicitly; catalogs do not prove inference access. Provider rate limits can block completion, and the harness must report that outcome rather than manufacture a passing run. Raw evidence belongs in a fresh disposable directory outside the repository.
