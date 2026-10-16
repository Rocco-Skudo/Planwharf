# P1 activity translator worker report

Status: bounded backend increment implemented, pending independent review and coordinator integration. This is not acceptance of complete P1.

## Isolation and ownership

- Source baseline: `d3fae01fa183b00780620dd47a0598f28c9058a6`.
- Original repository inspection: clean status and diff; HEAD matched documented baseline.
- Branch: `coord/p1-activity`; worktree: `worktrees/p1-activity`.
- Only owned code files changed: `engine/activity.cjs`, new `engine/activity-events.cjs`, new `engine/activity-events.test.cjs`.
- Original `engine/activity.test.cjs` remains unchanged.
- No commits, pushes, publication, CLA acceptance, external packages, live providers, UI/server/runner changes, personal data or process changes.
- This work neither incorporates nor overwrites the separate Rocco bugfix commit.

## Specification and audited sources

Read authoritative specification sections 3, 12 and 13, and coordination requirements authority/security restrictions. Inspected repository AGENTS.md, activity translator and tests, direct call sites in orchestrator/project-home, provider runtime and adapter registry, API agent event emission, and runner parsing and protocol fixture examples.

Important protocol limitations: Codex and Grok workers currently launch with plain output by default, while lead launches request structured output. Antigravity uses stream-json. The API agent emits item events and only a tool name as command metadata for tool starts; it does not emit tool completion/results to activity. Its protocol overlaps Codex, so identity is supplied from trusted caller context and never inferred from an item event. No new provider protocol invented; no live delivery verified.

## Concrete implementation

- New `activityEvents(tail, context)` API produces provider/adapter/model, observed protocol family, deterministic classification, provenance (`observed`, `reported`, `unknown`), state, friendly summary, whitelisted technical metadata, and `validated: false`.
- Existing `activityMessages` and `interpretActivity` use the bounded translator and retain existing exact-output assertions. `workerReport` remains unchanged to preserve original report behavior/evidence.
- `activityCapabilities(context)` reports known launcher output format, conservative detailed-event expectation, and explicit false live-delivery/result-validation flags. Unknown and configured CLI adapters remain unknown.
- Tool completion and exit zero never establish validated assignment/test success. Reported passing output stays reported evidence.
- Unknown/malformed/truncated protocol produces an unclassified state rather than guessing from an incomplete tool name.
- Display bounded to 128 KiB input tail, 16 KiB per line, 200 events and 260-character summaries; adjacent legacy messages still deduplicate.
- Sanitization handles common credential fields, bearer and common service tokens, URL credentials, private-key blocks, terminal controls and HTML markup. Technical metadata omits raw command arguments, source contents, full paths, provider error bodies and output blobs. This is a conservative display whitelist, not a guarantee that arbitrary natural-language text can never contain a secret. Existing raw evidence is not rewritten.

## Evidence

Before edits: original `node engine/activity.test.cjs` passed at the source baseline.

After final edits, all passed:

- `node --check engine/activity.cjs`
- `node --check engine/activity-events.cjs`
- `node --check engine/activity-events.test.cjs`
- `node engine/activity.test.cjs` (unchanged original regression fixture)
- `node engine/activity-events.test.cjs` (new behavior, provenance, protocol identity, capabilities, failure/completion boundary, redaction, malformed input, history limits)
- `git diff --check` (only normal Windows LF/CRLF advisory)

Initial development assertions found and fixed: existing partial-protocol test rejected the literal word `event`; malformed file-change collections needed explicit shape validation; quoted credential keys needed redaction coverage. Final fixtures pass.

## Deliberate remaining gates

- Independent reviewer pending; coordinator integration pending.
- UI Friendly/Technical switch, per-assignment session ownership, persistence and session timestamps not implemented in this increment.
- No complete technical raw-log inspector or authorization boundary added; only sanitized metadata exported for later wiring.
- No real browser validation or live provider execution; fixture results do not prove either.
- Orchestrator and progress-detail suites were inspected but not run by this worker because they explicitly create Git fixture commits; the user's no-commit rule remains in force. Coordinator owns broader baseline/regression analysis.
- Larger P1/P6 acceptance remains open.

## Independent review turnaround

Reviewer requested changes for (1) explicit incompatible adapter/protocol input accepted as observed and (2) unanchored command keyword matching classifying `echo npm test` as an observed test run.

Both addressed: known Codex/API, Antigravity and Grok adapter contexts restrict accepted protocol families; an incompatible event stays unknown. Command summaries now classify only recognized executable/subcommand prefixes, with shell wrappers/echo/source arguments left generic. Focused tests cover both mismatch directions, API mismatch, echo/printf/node-e false positives and genuine test executables. Unchanged legacy tests, new fixtures, three syntax checks and diff check pass after these repairs. Awaiting reviewer recheck; files refrozen for review.
