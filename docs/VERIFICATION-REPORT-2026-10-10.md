# Planwharf verification report

Date: 10 October 2026. Environment: Windows, Node.js 22.23.3, PowerShell, .NET Framework 4, and installed Codex, Grok, Antigravity, and GitHub CLIs.

## Results

- Persistent checkpoints survive repeated ticks, simulated decades, and server restarts. Resume checks the job identity and makes a fresh assignment.
- Models launch their declared provider and exact CLI ID. GPT/Gemini labels are not aliases for Grok.
- Six GPT models completed real inference checks. A real isolated job used Astra as lead and Luna as worker.
- Gemini workers produced a working calculator through the actual orchestrator. It passed 15 independent GUI checks and five engine self-tests before the owner removed the calculator project.
- Project base-directory settings survive restarts, create unique subfolders, and preserve existing folders.
- Authenticated inspection accesses a linked private GitHub repository and compares refreshed commit history with the local branch.
- The lead now has full local/network tool permissions while retaining its coordination role.

The existing workspace changes were preserved. Personal notebook data was not reset, and personal projects were not dispatched for these checks. Historical raw evidence retains its recorded language; this report and current user documentation are in English.

## Persistent checkpoints

Stop, exhausted alternatives after failure, inactivity, missed deadlines, and normal shutdown save a checkpoint in the attempts directory. Checkpoint files have no expiry. The UI preserves **Paused**, **Checkpoint saved**, and **Resume** after reopening.

Tests cover repeated ticks without overwriting saved checkpoints, reopening in 2056, HTTP shutdown saving before the close callback, unreadable notebook recovery during shutdown, and Resume selecting a different eligible model. A different job, including a reused ID with changed task details, cannot silently inherit the previous checkpoint.

Resume restores the saved plan and existing files through a new worker assignment. It does not restore a model's internal conversation state. Filesystem loss, forced process termination, or power loss can lose information not yet written. Local persistence is not a substitute for backups.

## Providers and exact model routing

The earlier runner launched Grok regardless of the displayed model label. Old configuration entries also mapped GPT/Gemini names to Grok IDs. The explicit provider adapter now validates each pairing and passes the complete worker model to the runner.

| Exact CLI model | Observed result |
| --- | --- |
| `gpt-6-astra` | Expected inference response, exit 0; actual lead in an isolated orchestrator check |
| `gpt-6-luna` | Expected inference response, exit 0; actual worker produced a marker and passing test |
| `gpt-6-sol` | Expected inference response, exit 0 |
| `gpt-6.1-sol` | Expected inference response, exit 0 |
| `gpt-5.6-luna` | Expected inference response, exit 0; historical UI ID `luna` |
| `gpt-5.5` | Expected inference response, exit 0 |
| `gpt-5` / `gpt-5-mini` | Codex explicitly rejected both with HTTP 400 for this ChatGPT account |
| `gemini-3.1-pro-high` | Real calculator implementation and completed correction run |
| `gemini-3.8-flash-high` | Real review attempt; stopped and resumed with Pro |
| `grok-4.6` | Listed by the CLI; real attempt failed with HTTP 403 for credit/spending limits |

These are account/date-specific checks. An installed executable or model catalog alone does not prove request entitlement. Enabled models are scheduling candidates; every job does not need every model.

The Windows resolver initially picked npm's extensionless shell launcher, producing ENOENT. A PATH proxy then rejected the multiline lead prompt with `InvalidBatchScriptArg`. Discovery now prioritizes the actual native executable in the npm package. Regression tests distinguish native binaries from those wrappers.

The original “GPT unverified” status described an incomplete access check. It has been replaced by observed successful inference or a concrete rejection reason. Grok remains switched off by default after its 403; the logs do not prove the precise cause of credit exhaustion.

## Lead permissions and project context

The previous lead configuration imposed `plan` mode for Grok/Antigravity and a `read-only` sandbox for Codex. Its briefing omitted the GitHub URL and provided no refreshed remote comparison. These restrictions explained the reported inability to inspect the project fully.

Lead and worker CLIs now use the supported noninteractive/full-access flags. The lead still receives a coordination prompt: it inspects evidence and assigns work rather than implementing jobs itself. That role instruction is distinct from filesystem permissions.

The briefing now includes the focused project's folder, GitHub URL, current repository check, and paths/URLs for every registered project. The lead can inspect nested files and use the existing authenticated `gh` session for private GitHub contents. Credentials are not put into prompts or notebooks.

Full CLI permissions do not grant access beyond the Windows user's permissions or GitHub account entitlement. Missing credentials and denied repository access remain explicit errors.

## Current local versus GitHub comparison

**Check repository** invokes authenticated metadata inspection and fetches branch objects into dedicated `refs/planwharf/inspection/*` refs. It does not push, merge, checkout, reset, or overwrite project source files. The check endpoint never dispatches workers.

Commit counts use `git rev-list --left-right --count` against the refreshed ref. Uncommitted paths are counted separately. If the local branch is unpublished, the GitHub default branch is the explicitly labelled baseline. A different origin produces a warning; comparison uses the linked repository. Network failures, missing permissions, unrelated histories, and inadequate shallow history are not reported as an up-to-date match.

Real checks on both projects registered in the local notebook succeeded, including the private repository. The public project was one commit ahead and had five uncommitted paths. The private project's unpublished local branch was three commits ahead of its default branch and had 37 uncommitted paths at inspection time. These counts are snapshots, not permanent project properties. Private project identifiers and source contents are not required for the distributed fixtures.

A real Astra lead invocation also executed GitHub API and local-root checks through its own tools and returned the private flag and correct local root. Its working-tree status was unchanged before and after. This establishes actual CLI reachability in addition to server-side metadata access and argument tests.

The check is cached for about one minute. The UI button forces refresh. Inspection time, branches, and errors are visible. [Git comparison documentation](https://git-scm.com/docs/git-rev-list) and [GitHub CLI credential documentation](https://cli.github.com/manual/gh_auth_setup-git) support the mechanism.

Tests create actual temporary Git repositories with common history, local-only commits, remote-only commits, and divergence. They verify authenticated private metadata, an unpublished branch, offline fetches, denied access, cache behavior, missing local folders, and full context passed to the lead.

## Persistent project folder settings

The owner can set **Add project → Projects folder → Save projects folder**. New projects optionally create a named subfolder there. Collisions receive numbered suffixes. Existing project folders can still be linked directly.

Settings are stored atomically in `<notebook>.settings.json`, independently of the notebook schema. Existing absolute directories are required. Names are adapted for Windows, including reserved names and path separators. Stale notebook versions cannot create new folders. Failed notebook saves remove only the new directory when it is still empty.

Tests cover persistence after restart, collisions, safe names, preservation of old projects, stale requests, and failed-save rollback. A real headless-browser check exercises saving/restoring the setting, two colliding project creations, and enabling the existing-folder field.

The first browser run caught a client bug: settings responses were validated as notebook responses. The server saved successfully while the UI displayed “The plan file is invalid.” The response validator now checks the correct settings shape.

## Historical calculator run

The implementation was produced through the actual chain:

```text
createOrchestrator.approve / resume
  → worker assignment
  → runner.spawnWorker
  → node engine/runner.cjs with serialized model
  → agy.exe --model gemini-3.1-pro-high
  → calculator source, build script, Windows executable, engine tests
  → CLI result, completion evidence, and final orchestrator state
```

The verifying agent wrote the dispatch harness and independent checks, not the calculator implementation. The notebook and attempts were isolated from personal projects.

Initial Grok attempts failed with HTTP 403. An early Resume chose a new model but reused stale Grok dispatch data; the implementation now clears old dispatch before reassignment. Gemini Pro completed the calculator. Flash later ran a review but was stopped before a complete delivery; a saved checkpoint resumed with Pro.

The independent checks exercised addition, subtraction, multiplication, division, decimal dot/comma, unary negative numbers, division by zero, Escape, Backspace, C/c clearing, precedence, native executable launch, and a stable display accessibility identity. The worker fixed clipped error text, keyboard clearing, and the display provider. Final results were **15/15 GUI checks** and **5/5 engine self-tests**, with self-test exit 0.

The executable and source hashes were unchanged when moved to a sibling project folder. Both calculator project folders were later removed at the owner's explicit request. The old GUI harness cannot now run without restoring its target. No current executable download or launch is implied by this historical report.

The native GUI test did not automate Explorer's mouse double-click, certify SmartScreen/signing, or test another Windows installation. The executable was unsigned. Keyboard checks depended on a desktop session and focus. The arithmetic used .NET decimal rather than unlimited precision.

## Independence from earlier orchestration projects

NPC-Orchestra-v5 dispatched historical work for both AI-Orchestrator and Planwharf. AI-Orchestrator used it as a reference prototype. Those links were historical, not current runtime dependencies of Planwharf.

Both sibling directories were temporarily renamed so their original paths were absent throughout the full 15-suite verification. Every suite passed, including app startup, interface, orchestration, and checkpoints. The folders were restored before the owner authorized removing them. They were then moved to the Windows Recycle Bin. Planwharf notebook hashes were unchanged.

## Strengths, weaknesses, and priorities

| Area | Finding and next step |
| --- | --- |
| Persistence | Durable local notebook and checkpoints; add a process journal and stronger orphan recovery |
| Routing | Exact provider/model pairing and real access checks; add automatic versioned capability discovery |
| Remote context | Authenticated private inspection and explicit branch comparison; expand tests for enterprise GitHub and complex remote layouts |
| Monitoring | Browser polling drives monitoring/deadlines; add an independent serialized server loop |
| Chat commands | Keyword interpretation can be ambiguous; implement a stricter intent parser |
| Acceptance | CLI success/completion evidence is not product correctness; add project-defined acceptance gates |
| Parallel slices | Generic slices share a filesystem; add file ownership, dependencies, or isolated worktrees |
| Quotas | Real usage readings are separate from local counters; invalidate access after provider entitlement failures |
| Distribution | Windows verified; other operating systems, signed binaries, and packaged installation require further checks |

Antigravity usage reads real numeric weekly/five-hour Gemini buckets through `/usage`. Rounded display percentages do not decide exhaustion; the original fraction does. Malformed, missing, or inaccessible usage produces unread/null values. Separate Antigravity groups are not treated as Gemini quota.

Normal shutdown is tested, but forced termination and power loss have practical limits. Access checks do not prove unrestricted reachability of every repository or file. No remote push or project-source modification was needed to inspect the linked projects. Preserve backups and review generated products independently.

See the [beginner guide](HOW-TO.md) for installation and operation. Historical raw logs and owner-specific access snapshots are retained locally; distributed tests use isolated fixtures.

The final application validation runs **16 suites**. The real browser also checks project folder creation and the repository access status. Model probes and the private-repository lead check are separate real execution evidence, rather than mocked unit tests.
