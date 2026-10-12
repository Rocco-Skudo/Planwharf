# Planwharf

A local project notebook and coordinator for real coding workers. Keep decisions and revisions, clarify an idea with Grill, approve a plan, and monitor execution across Codex, Antigravity, and Grok.

[Beginner guide](docs/HOW-TO.md) · [Verification report](docs/VERIFICATION-REPORT-2026-10-10.md)

## Requirements and launch

Install Node.js and a Chromium browser such as Edge or Chrome. Planwharf has no npm dependencies. Install and authenticate the coding CLIs you want to use separately.

On Windows, double-click `Planwharf.exe` or `planwharf.cmd`, or run:

```powershell
node .\planwharf.cjs
```

To rebuild the Windows launcher, run `launch\build-exe.cmd`; it requires the .NET Framework compiler. On Linux/macOS, run `node planwharf.cjs` or `sh planwharf.sh`. Windows is the verified platform. If a browser cannot be launched, open the printed local address. Opening `index.html` directly does not start file persistence.

The server binds to `127.0.0.1`, normally on port 4173, and chooses another port when necessary. The desktop launcher opens one application window. Use **Show Orchestrator** / **Show Planwharf** to switch views on the same page; the selected project, conversation, and unsent chat draft remain in place. Older Orchestrator links open this page with the dashboard selected. Relaunching the same notebook reuses its backend and focuses or reopens the application. Closing the window keeps the backend and workers alive. **Quit application** or Ctrl+C requests shutdown and checkpoint saving. Browser heartbeats expire after 15 seconds if close events are unavailable.

## Start a project

Choose **Add project**, enter a name and goal, and set **Projects folder** to an existing absolute base directory. Click **Save projects folder**. With **Create a new subfolder using the project name** selected, Planwharf creates and links a new folder. Existing names receive a numbered suffix. Uncheck the option to link an existing project folder instead.

**Set place** updates a project's local folder and `https://github.com/owner/repo` URL. The base-directory setting persists in `<notebook>.settings.json`. Changing it affects future projects and does not move existing folders. **Remove project** removes the notebook entry while keeping its filesystem folder.

Use a separate notebook for experiments:

```powershell
node .\planwharf.cjs --plan .\my-notebook.json --attempts-dir .\my-attempts --port 4180
```

Explicit notebook paths must already contain valid Planwharf data. The default `plan.json` is local data, excluded from Git. On first launch only, the application creates it from `fixtures/starter-notebook.json` if it does not exist. Existing notebooks are never replaced. Preserve the notebook and its attempts directory when updating the application.

## Notebook, revisions, and Grill

- **Project Home** shows the current Living Plan goal, progress, changes since your last visit, current work, next known action, and personal notes. It renders without model inference.
- **Your notes** supports add, delete, and pin. Notes and per-project visit snapshots persist inside each project?s optional `home` field in the notebook; they are never converted into tasks, revisions, or decisions.
- **Living Plan / History / Decisions / Revisions / Runs / Checkpoints / Technical details** expands the existing controls and history.
- **The plan** shows the selected revision's goal, current state, decisions, and open questions.
- **What changed** shows revision differences or the cumulative change since your last visit. Previous revisions remain immutable.
- **For you** contains questions awaiting answers. **Grill me** refines the goal; **Grill with the docs** includes project documentation.
- **Now** shows progress and actions such as Approve, Stop, and Resume. **All projects** switches the active notebook project.

An edit starts from the current revision and appends a new one. A Grill answer can leave a question open, close it with a decision, or close it and change direction. Existing decisions are preserved. Import accepts a complete revision object:

```json
{
  "title": "First month ready",
  "direction": "Open the library two mornings each week.",
  "state": "Two volunteers confirmed.",
  "closed": ["Loans are free."],
  "open": ["Which extra day should we add?"]
}
```

Malformed JSON, unknown fields, and invalid types are rejected without changing the notebook. Supported revision modes are `manual`, `grill`, and `import`. A task keeps its originating `revision_id` even after later edits. Each project can have at most one running task.

## Local files and private GitHub repositories

**Check repository** verifies local read/write access and authenticated GitHub access. It shows the compared branches, commits ahead/behind, uncommitted paths, and the time of the check. GitHub authentication uses the existing `gh` login, including private repositories accessible to that account.

The comparison fetches the linked repository's current branch history into dedicated inspection refs. It does not merge, push, switch branches, or overwrite working files. When the local branch is unpublished, the comparison explicitly uses GitHub's default branch as its baseline. Diverged histories and failures remain visible; old tracking refs are not reported as a current GitHub check.

The lead receives local paths and GitHub URLs for registered projects, plus an updated check for the focused project before answering. Its CLI has full filesystem/network permissions and runs without interactive approvals. Its prompt keeps it in a coordination role: workers implement jobs. A role instruction is not a filesystem sandbox.

The account must already have repository access. A URL alone cannot grant it. Check `gh auth status` or use `gh auth login` if authentication is missing. Credentials are not embedded in notebooks or model prompts.

## Providers and execution

`models.json` declares the exact provider and CLI model ID for every entry. The runner launches that CLI and model; it rejects incompatible combinations and never silently routes GPT or Gemini labels to Grok.

Model recognition is extensible through configuration. The installed adapters are `codex`, `antigravity`, and `grok`; a model name such as Claude, Qwen, or Kimi is not an adapter. Native model families retain their compatibility guard. For a different exact model ID that your selected CLI has explicitly been configured to accept, add `"modelRouting": "configured"`. This removes the family-name restriction while retaining the exact provider and CLI ID. It does not install a provider, verify account access, or change a CLI's supported models. Unknown adapters remain unavailable with a clear error.

For example, this is a disabled template for a Qwen route through a separately configured compatible Antigravity CLI. Replace the placeholder with the exact ID accepted by your CLI; use the same pattern for Kimi or any future model. Claude IDs already match Antigravity's native family guard, but still require actual account access. Leave unverified entries disabled and unavailable until you have checked the selected CLI and account:

```json
{
  "id": "my-qwen",
  "label": "Qwen (configured route)",
  "provider": "antigravity",
  "cli": "EXACT_MODEL_ID_FROM_YOUR_CLI",
  "modelRouting": "configured",
  "enabled": false,
  "available": false,
  "unavailableReason": "This exact provider/model route has not been verified.",
  "plan": "My configured account",
  "kind": "default",
  "cost": 1,
  "limit": 50
}
```

Labels are for display; they never select a provider. Configuration errors disable the roster entry and show the reason. A compatible declaration permits dispatch only after you enable the entry and mark it available; the CLI may still reject model access at runtime, and Planwharf reports that failure without substituting another model.

On the verified account, GPT-6 Astra, GPT-6 Luna, GPT-6 Sol, GPT-6.1 Sol, GPT-5.6 Luna, and GPT-5.5 completed inference checks. Gemini Pro and Flash were used through Antigravity. GPT-5 and GPT-5 mini were explicitly rejected by Codex with this ChatGPT account and remain **Unavailable**. Grok 4.6 is switched off after a credit/spending-limit HTTP 403. These checks describe one account and date, rather than universal model availability.

Choose a lead in **Functions** or the Orchestrator view. **Auto start** inspects the project, proposes Grill when configured, prepares a job, and waits for **Approve run**. Auto-start jobs require that approval even in Automatic mode. Manually added tasks can dispatch automatically when Automatic is selected. Worker tool permissions do not require repeated interactive confirmation.

Enabled models are candidates, not a requirement to use every model for every task. Selection considers task type, provider quota, local counters, and failures. Implementation/difficult work may be split across up to three workers. Slice ownership and integration still require care.

The dashboard reports process IDs, logs, interpreted activity, and provider usage. The **Project recipient** in the Orchestrator view stays synchronized with project selection in Planwharf, including after reload. Each chat request carries that project's explicit ID. A missing or deleted recipient, or a message naming a different project, cannot execute a project command. Chat never chooses a project based on which one is busiest.

Project actions require an explicit command such as **Start**, **Resume**, **Stop**, **Approve**, or **Skip grill**, optionally followed by the selected project's name. A new work request such as “Audit Sayaku” creates a fresh task with the exact current prompt and waits for approval. Previous inactive tasks are retained as superseded; their checkpoints are archived unchanged. An active job must be stopped before replacing it. Questions do not create tasks, and a new request never implicitly resumes a previous checkpoint. Research assignments are also checked against the selected recipient. **Copy output** sits directly below each generated answer and copies that answer.

Matt skills are checked at startup against the latest `main` revision of `mattpocock/skills`. The visible status reports the revision, update result and skill count. Planwharf downloads the complete skills tree into an immutable revision folder before activating it; a failed update keeps the prior complete version and reports the failure. Every Codex, Grok and Antigravity lead/worker prompt receives the catalog and applicable skill instructions. **Use Matt skills for all models** is on by default and persists per notebook; turning it off applies to subsequent requests and launches. If enabled skills have no complete cache, model execution waits for a successful check or an explicit opt-out.

After updating Planwharf code, use **Quit application** and relaunch to load the new backend. Closing and reopening the window reuses the existing process. The UI identifies older backends that lack a catalog count and never presents a missing count as “0 skills” verified successfully. A matching commit SHA is insufficient: the complete catalog and its files must also be present; incomplete caches are rebuilt even when the SHA has not changed.

The skills status separates the upstream revision date, local installation time and last check time. Checking an unchanged revision does not overwrite its installation time. The switch saves the setting on the backend, and an older polling response cannot revert the displayed choice.

**Refresh Grok models** queries the active CLI login and validates each configured exact model ID, replacing old account availability without substituting models or automatically enabling them. Startup and periodic API checks also refresh the list. Authentication and policy failures are shown as verification failures, not as invented account access.

A failed model-list check preserves previously known availability and shows a warning; it does not fabricate access to other IDs. An unreadable Grok quota endpoint is separate from access to the Grok CLI and does not itself disable models.

Chat requests accept up to 1 MiB of JSON. Provider prompts avoid the Windows command-line length limit: Codex uses standard input, Antigravity uses its documented JSON user-event stream on standard input, and Grok reads a unique UTF-8 prompt file through its native `--prompt-file` option. Prompt files are kept outside linked project folders. Saved exchanges are retained without a fixed turn limit. Each lead answer receives the full retained history once in chronological order, together with the current notebook briefing. The provider's context limit still applies; automatic history compaction is not implemented.

You can ask the lead to delegate a research task conversationally, naming a worker such as GPT-6 Luna. The lead proposes a structured research assignment; the notebook validates the exact enabled model and its usage, then returns the real process ID or a launch failure. Research uses a separate attempt folder, preserves existing implementation tasks, and writes findings and citations to `report.md`. The Workers view shows its process, activity, report, Stop, and Resume actions. A completed report requires both the report artifact and successful provider exit evidence.

Source-protected research currently uses Codex with its workspace write sandbox and network access. Linked project files are available for reading; only the isolated research workspace is writable. Other providers are rejected for this workflow until equivalent source protection is supported. Resume creates a new attempt while keeping prior research evidence. A lead's proposed assignment is not evidence that a worker has started; the notebook's dispatch receipt is authoritative.

## Stop, Resume, and quotas

Stop terminates worker process trees and saves a checkpoint. Failure without usable alternatives, inactivity, a missed deadline, and normal shutdown also preserve state. Checkpoints have no expiry and remain **Paused / Checkpoint saved / Resume** across restarts. Resume verifies the job identity and creates a fresh assignment from the saved plan and existing files. It does not restore the interrupted model's internal memory.

**Stop worker** on a running implementation worker card terminates only that process tree. Other slices continue. Automatic replacement for that project is suspended until an explicit resume; when the other slices finish, Planwharf saves a checkpoint instead of declaring the stopped slice complete. This pause survives backend restoration. Research cards have their own independent **Stop** action.

The Workers section starts clean on each page opening. Default filters show the selected project and workers launched during the current view session. Project, session and state filters expose previous attempts when wanted; the legend always reports the total number of active processes, including hidden sessions. Existing tasks cannot start automatically after backend startup, even when Automatic mode was saved; they require fresh authorization. Workers already running continue to be monitored.

The session selector lists recorded sessions by date and ID, with a separate entry for historical records from before session tracking. Chat also opens clean and passes a new conversation ID to the lead; old conversations remain available through the session selector. Each answer has **Copy output**, and **Copy displayed conversation** beneath the thread copies every visible exchange.

Running activity translates structured Codex, Grok and Antigravity events into readable actions such as “Reading Sayaku.ts” or “Running tests for Sayaku.test.ts”. It follows the latest action and distinguishes a completed command from proof that tests passed. Raw logs remain unchanged in the output details. Project Progress supplements the original Living Plan text with the last work item, recent readable worker actions, full reported findings and changed file names. Since your last visit includes commit subjects, edited files and newly recorded decisions rather than counts alone.

Keep the notebook, settings, attempts directory, and project files together in backups. Forced termination or power loss cannot guarantee saving the last unsaved operation. Monitoring and deadlines currently depend on client polling.

When all worker slices report completion, Planwharf closes the assignment and marks the notebook task `complete`. Later polls and restarts retain that terminal state. Historical process IDs remain recorded, with inactive worker flags; completed tasks cannot resume from an older checkpoint.

To inspect older inconsistent state without dispatching workers, run:

```powershell
node validation/reconcile-attempts.cjs --plan plan.json --attempts-dir .attempts-plan
```

After quitting the application, add `--apply` to repair verified completions. The tool requires matching job identity and `STATUS: COMPLETE` plus `EXIT: 0` for every recorded slice. It backs up the notebook, registry, and orchestrator state before writing, archives state for removed projects, and preserves raw logs, results, and checkpoints. Browser profiles under `windows/` and validation artifacts stay local and are excluded from Git.

Provider quota readings are separate from synthetic model assignment counters. ChatGPT uses local Codex usage windows; Grok uses local billing; Antigravity reads numeric Gemini buckets through `agy -p /usage --output-format json`. All quota UI reports **REMAINING**, shared by every model on the same provider plan. Bands are green at 75?100%, orange at 50?74%, yellow at 25?49%, and red at 0?24%; 0% also says **EXHAUSTED**. Missing or invalid readings show grey **REMAINING UNREAD**, rather than an invented percentage.

## Validation and historical evidence

```powershell
node .\engine\prompt-transport.test.cjs
node .\engine\provider-transport.test.cjs
node .\engine\chat-request.test.cjs
node .\engine\conversation-history.test.cjs
node .\engine\research-dispatch.test.cjs
node .\engine\project-recipient.test.cjs
node .\engine\runtime-integration.test.cjs
node .\engine\worker-ui.test.cjs
node .\engine\worker-startup.test.cjs
node .\validation\worker-board-browser.cjs
node .\validation\project-recipient-browser.cjs
node .\validation\verify-work.cjs
node .\validation\project-folder-ui.cjs
```

Tests cover notebook persistence, revisions, Grill, task references, filesystem settings, provider routing, checkpoints, shutdown/restart, Git comparison graphs, and errors. Test notebooks and attempts are isolated from personal projects. `verify-ui.cjs` is a DOM simulation; the folder UI check uses a real headless browser.

A previous real orchestrator run produced a Windows calculator through Gemini workers and passed 15 GUI checks plus five engine self-tests. Its project was subsequently removed at the owner's request. Preserved local execution evidence documents that historical run; it is not a currently installed calculator.

Historical `handoff` payloads and execution logs preserve their original language as evidence. Current product documentation is in English. Personal notebook content and test fixture text are user/sample data, rather than translated product documentation.

Phase 1 validation: `node validation/phase1-suite.cjs` runs every engine test, root verification script, browser folder/worker checks, and real app-window checks. Each run writes a new evidence directory and verifies that the personal notebook is unchanged. The isolated browser tests use mocked quotas and no model dispatch. Chromium sandbox restrictions in the validation environment require `--no-sandbox` for tests only; normal launch retains browser defaults.
