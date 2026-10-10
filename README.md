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

The server binds to `127.0.0.1`, normally on port 4173, and chooses another port when necessary. Ctrl+C or closing the main app requests shutdown and checkpoint saving. The Orchestrator window shares the same server.

## Start a project

Choose **Add project**, enter a name and goal, and set **Projects folder** to an existing absolute base directory. Click **Save projects folder**. With **Create a new subfolder using the project name** selected, Planwharf creates and links a new folder. Existing names receive a numbered suffix. Uncheck the option to link an existing project folder instead.

**Set place** updates a project's local folder and `https://github.com/owner/repo` URL. The base-directory setting persists in `<notebook>.settings.json`. Changing it affects future projects and does not move existing folders. **Remove project** removes the notebook entry while keeping its filesystem folder.

Use a separate notebook for experiments:

```powershell
node .\planwharf.cjs --plan .\my-notebook.json --attempts-dir .\my-attempts --port 4180
```

The selected notebook must already contain valid Planwharf data. The shipped `plan.json` is a starter notebook; your local copy may contain personal projects. Preserve that local data when updating the application.

## Notebook, revisions, and Grill

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

On the verified account, GPT-6 Astra, GPT-6 Luna, GPT-6 Sol, GPT-6.1 Sol, GPT-5.6 Luna, and GPT-5.5 completed inference checks. Gemini Pro and Flash were used through Antigravity. GPT-5 and GPT-5 mini were explicitly rejected by Codex with this ChatGPT account and remain **Unavailable**. Grok 4.6 is switched off after a credit/spending-limit HTTP 403. These checks describe one account and date, rather than universal model availability.

Choose a lead in **Functions** or the Orchestrator window. **Auto start** inspects the project, proposes Grill when configured, prepares a job, and waits for **Approve run**. Auto-start jobs require that approval even in Automatic mode. Manually added tasks can dispatch automatically when Automatic is selected. Worker tool permissions do not require repeated interactive confirmation.

Enabled models are candidates, not a requirement to use every model for every task. Selection considers task type, provider quota, local counters, and failures. Implementation/difficult work may be split across up to three workers. Slice ownership and integration still require care.

The dashboard reports process IDs, logs, interpreted activity, and provider usage. Chat supports coordination questions and keyword commands such as stop, resume, approve, start, skip grill, and changing the lead. Prefer explicit buttons for actions when possible.

## Stop, Resume, and quotas

Stop terminates worker process trees and saves a checkpoint. Failure without usable alternatives, inactivity, a missed deadline, and normal shutdown also preserve state. Checkpoints have no expiry and remain **Paused / Checkpoint saved / Resume** across restarts. Resume verifies the job identity and creates a fresh assignment from the saved plan and existing files. It does not restore the interrupted model's internal memory.

Keep the notebook, settings, attempts directory, and project files together in backups. Forced termination or power loss cannot guarantee saving the last unsaved operation. Monitoring and deadlines currently depend on client polling.

Provider quota readings are separate from synthetic model assignment counters. ChatGPT uses local Codex usage windows; Grok uses local billing; Antigravity reads numeric Gemini buckets through `agy -p /usage --output-format json`. Missing or invalid readings show **Unread**, rather than an invented percentage.

## Validation and historical evidence

```powershell
node .\validation\verify-work.cjs
node .\validation\project-folder-ui.cjs
```

Tests cover notebook persistence, revisions, Grill, task references, filesystem settings, provider routing, checkpoints, shutdown/restart, Git comparison graphs, and errors. Test notebooks and attempts are isolated from personal projects. `verify-ui.cjs` is a DOM simulation; the folder UI check uses a real headless browser.

A previous real orchestrator run produced a Windows calculator through Gemini workers and passed 15 GUI checks plus five engine self-tests. Its project was subsequently removed at the owner's request. Preserved local execution evidence documents that historical run; it is not a currently installed calculator.

Historical `handoff` payloads and execution logs preserve their original language as evidence. Current product documentation is in English. Personal notebook content and test fixture text are user/sample data, rather than translated product documentation.
