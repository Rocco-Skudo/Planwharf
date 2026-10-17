# P1.4 focused project context worker receipt

Status: narrow isolation fix implemented, frozen pending independent review. This is not complete project-wide execution/security acceptance.

## Base, seed and ownership

Baseline `d3fae01fa183b00780620dd47a0598f28c9058a6`; branch `coord/p1-isolation`, worktree `worktrees/p1-isolation`. Seeded exact coordinator integration files without commits:

| Dependency | SHA-256 |
| --- | --- |
| engine/activity.cjs | 69D6E019AF79E576E8D966BE0F14DC8DDD2BBB91AA9FFF0FB62DF9D314B3A08A |
| engine/activity-events.cjs | 907A5012D50379926ADBD10086994D55C804790381662203D472FD70BC784A0B |
| engine/activity-events.test.cjs | 8656B941D05B6ECB971B6CFF47A42104D23A7361D4F3F6D3E519DF51C50B0846 |
| engine/activity-sessions.cjs | 992C2A0A93D175AFBB2772F32BBC81974D4D48429AAB94E2FD535EE20C4F2207 |
| engine/activity-sessions.test.cjs | 447497D29A48B04BB82451C961AA35AA75CF11F533333D437785B002A9D35B3B |
| engine/orchestrator.js | 5A3FA43BC90F009A4FBB8F583D5F4FFB6B1FB7C7EA5A898CC3C58A7F39A7E637 |
| verify-layout.cjs | 4CD7145D4364043C5DA02D42F3CC22382A032907D2456C20D71F2AEC937E0CC4 |

Owned changes ONLY `engine/orchestrator.js` and new `engine/project-context.test.cjs`. Existing conversation-history test unchanged. Other seeded dependency hashes verified unchanged after edits.

## Baseline and proven defect

Root evidence `context-baseline.json` independently records actual provider fixture context crossing from alpha discussion to beta when chat ID is absent.

Worker ran original conversation-history and project-recipient fixtures before edits. Both initially hit sandbox `EPERM` atomic file replacement, then both passed when rerun narrowly through approved outside-sandbox fixture execution. Inspected tests use mocks for providers/launches/killWorker; no real process or Git commit occurs.

New `node engine/project-context.test.cjs --baseline` passed BEFORE product edits, asserting focused alpha input actually received beta-private history, beta job metadata and global archive access. This fixture uses real orchestrator ask/persistence code with injected provider recording, not a synthetic helper only.

## Fix

- Filter focused provider conversation by selected or uniquely named project, even when chat ID is omitted.
- Apply chat ID as an additional boundary, so reusing a chat ID in another project cannot share history.
- Exclude legacy unscoped/null-project exchanges from explicitly focused project conversations, preserving full historical store records unchanged.
- Preserve global unscoped overview/history behavior; no destructive archive migration.
- Focused `packState` excludes other-project research and private project metadata, folders/job titles/repository fields. Existing execution handoff was already filtered by project and remains so.
- Focused provider state no longer exposes the global `orchestrator.json` archive path; it receives already-scoped bounded history and count.
- Active progress/cancellation stores project/chat identity so a cancelled project discussion does not become an unscoped exchange or disappear from its proper chat.
- Shared model/quota metadata and global snapshot UI remain unchanged; this change bounds focused provider context rather than claiming a new account-level permission system.

## Final verification

All 6 focused files pass (exit 0), after narrow approved outside-sandbox execution to avoid the demonstrated atomic-rename environment limitation:

- `node engine/project-context.test.cjs`
- `node engine/conversation-history.test.cjs`
- `node engine/project-recipient.test.cjs`
- `node engine/activity.test.cjs`
- `node engine/activity-events.test.cjs`
- `node engine/activity-sessions.test.cjs`

Also `node --check engine/orchestrator.js`, `node --check engine/project-context.test.cjs`, and `git diff --check` pass. Normal Windows line-ending advisory applies to existing seeded dependency only.

New context fixture covers interleaved two-project history with absent/shared/new chat IDs, uniquely named recipient, project-private research/job exclusion, withheld archive path, global history, restart, cancellation after progress update, original archive record equality and zero worker dispatch. Existing fixtures verify full 45+ exchange retention/cancellation/reload and injected project-recipient/stop routing behavior.

No external provider, browser, existing worker, user project, commit, push, publish or CLA action occurred. No synced sources or unrelated files changed. Tests do not establish live-provider/browser behavior or prove every cross-project path throughout the product. P2 may own orchestrator only after coordinator integration and lock release.
