# Technical evidence and paged assignment history — worker receipt

Frozen for independent review in `coord/p1-evidence`, `worktrees/p1-evidence`. Base `d3fae01fa183b00780620dd47a0598f28c9058a6`; all 17 current root integration changes, including reviewed P2, seeded exactly before editing (`p1-evidence-seeded-dependencies.json`). Unowned seed hashes verified unchanged. No server/orchestrator/UI or P3 files edited here. No new work after the freeze; coordinator owns review/integration and any later authorized publication.

Independent-review security correction: result-only fallback explicitly strips untrusted `result.logPath` before enumeration. Worker result schemas allow extra fields, so those fields cannot authorize a log read. New adversarial fixture injects another project's logPath into a valid result and confirms zero reader calls, unavailable technical evidence and no foreign source in output; matching trusted stored dispatch/history still reads its exact assignment log. All four focused tests/four syntax checks/diff check rerun PASS after correction; manifest and hashes below reflect refrozen files.

## Exact allowed files

| File | Frozen SHA-256 |
|---|---|
| engine/activity-evidence.cjs | 39B6F72685BD3EEBF6CFA79C75B541E4E7B7729CF86A0A49509A16D536FF952C |
| engine/activity-evidence.test.cjs | C3FB73D9D29FF4AAB04F3459062FFB1C5CA38F1351DE55EECF698769325D35C9 |
| engine/activity-sessions.cjs | 6512467818A5786AA0562A2F9F4E44B2E9194E6E0D482BEEC1A6E61017F43529 |
| engine/activity-sessions.test.cjs | 5A791E23E87E991A3EF94A165B4EAC4B5E8EF942124A0A41D1B8E5CBFFB1AE52 |

Machine-readable sizes/hashes: `p1-evidence-final-manifest.json`. Only these four files are to be copied to integration after review; other worktree changes are seeded dependencies, not this patch.

## Technical evidence API

`assignmentSession` adds optional `technicalEvidence` from its **exact supplied assignment tail**, never the project-wide `row.workerTail`:

```text
technicalEvidence = {
  entries: [{protocol, provenance, eventType?, command?, output?, exitCode?,
             tool?, state?, sourceTimestamp?}],
  truncated: boolean,
  warnings: string[]
}
```

UI worker agreed to render original values through literal textContent in stable preformatted text and use only the selected session. Provider/adapter context is the same retained trusted context used for activity normalization.

- Codex item command-execution whitelist retains exact sanitized `command`, `aggregated_output`, integer `exit_code`, known event type, and an original parseable `timestamp` only if actually present. No command classifier, invented Friendly text, success assertion, generated timestamp or source path.
- API bridge's same item shape is explicitly identified as `planwharf-api-bridge`; warning explains its command field may only hold a tool name and arguments/output may be unavailable.
- Antigravity tool records expose only source tool name/state and whitelisted run-command parameter string. File-writing `CodeContent`, patches, arbitrary tool outputs/results, agent responses and file-change payloads are excluded. Warning explicitly states detailed output is not verified.
- Explicit incompatible known adapter/protocol combinations are omitted with warning. Unknown context can expose only the same narrow whitelist with unknown provenance; no native-provider verification claim. Plain original stdout is grouped with newlines, provenance `reported`, without interpreting tests or actions. Unknown/malformed structured payloads are not dumped.
- Redaction covers common quoted/unquoted and escaped nested credential keys, Bearer values, CLI credential arguments, provider tokens, URL user-info/query credentials, multiline private keys and long encoded fragments; strips ANSI/OSC/control sequences and escapes HTML brackets. Redaction occurs before clipping. Raw source logs are never rewritten. This is bounded sanitized evidence, not a claim that arbitrary secrets can be perfectly identified.
- Bounds: supplied input at most 32 KiB, source record 16 KiB, command 2 KiB, field 4 KiB, at most 20 entries and 16 KiB serialized entry payload. Explicit truncation/omission warnings, plus unconditional retained-tail limitation and zero-exit/output-is-not-validation warning. Original newlines remain readable.

## Paged retained-history API

Exported from `activity-sessions.cjs`:

```text
pagedProjectActivitySessions({
  projectId, row = {}, currentParts = row.dispatch || [], history = [],
  execution = {}, offset = 0, limit = 24, readTail = () => ''
}) -> { sessions, total, offset, limit }
```

Enumerates only metadata from current dispatch, exact project-matching stored history and project-owned MegaTask results. Validates project/MegaTask/SubTask membership, deduplicates by exact retained MegaTask/SubTask/attempt identity and preserves legacy missing-ID warnings. Does not retrofit current roster identity or invent timestamps. No log read while enumerating total/count or off-page records. Builds assignment sessions and calls readTail only for the selected bounded page. Finite safe offset clamps to zero; limit clamps 1–24. Existing 24-session snapshot and 50-event bounds remain unchanged; callers must opt into the paging helper.

**Caller contract:** use `readTail: file => readRecordedTail(file, notebookRoot)` for source containment and the existing 32 KiB cap; no raw log paths are returned. Root/P4 owns endpoint authorization/wiring, UI owns advertised-endpoint paging. This helper alone does not prove endpoint/UI acceptance. Metadata pages remain views of current retained records, not an immutable complete archive; missing historical logs remain explicitly unavailable.

## Validation

All commands exited 0:

```text
node engine/activity-evidence.test.cjs
node engine/activity.test.cjs
node engine/activity-events.test.cjs
node engine/activity-sessions.test.cjs
node --check engine/activity-evidence.cjs
node --check engine/activity-evidence.test.cjs
node --check engine/activity-sessions.cjs
node --check engine/activity-sessions.test.cjs
git diff --check
```

**4/4 focused fixture files pass; four syntax checks and diff check pass.** New evidence fixtures use real source protocol shapes and exercise original command/output/exit and newlines; explicit adapter mismatch and unknown context; excluded source-code/result payloads; nested escaped credentials/private keys/flags/URL/ANSI/HTML; malformed/oversized data; field/entry/total bounds; exact assignment tail versus a distinct project-wide tail; zero exit never creates validated success.

Paging fixture retains **60 distinct attempts** plus current/history/result duplicates and a foreign project. Pages at offsets 0/24/48 reach all 60 exactly once. Log-reader spy verifies only selected-page paths are read; offset beyond total performs zero reads; foreign project and foreign current row never trigger reads; result payload exposes no `logPath`. Actual `createOrchestrator().snapshot()` session fixture additionally asserts original `npm test` command appears under its own session and never under another project's session.

No browser run in this worktree, because no UI/server files are owned. Integration must rerun actual Chrome Technical view and pager after root/P4/UI accepts and seeds these files. No live provider verification, package install, real worker process, personal project/profile, commit, push, publication or CLA action occurred. Full P1/P6 acceptance remains unproven until integrated gates pass.
