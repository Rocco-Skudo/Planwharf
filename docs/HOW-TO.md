# Planwharf: a practical guide for beginners and vibe coders

Planwharf turns an idea into a project notebook, asks questions to clarify it, prepares work for coding workers, and shows their progress. Workers write files in the project's linked folder. The lead coordinates assignments and reviews results.

This guide describes the version checked on 10 October 2026. The [verification report](VERIFICATION-REPORT-2026-10-10.md) includes successes, failures, logs, and the limits of those checks.

## What you can do

- Keep several projects and a history of decisions in one notebook.
- Refine an idea with Grill, approve a plan, and dispatch actual coding workers.
- Choose supported models from different providers and watch their processes and logs.
- Stop work, keep a checkpoint on disk, and resume later.
- Read provider quotas when the installed CLI and account return usable data.

Project selection and task splitting use local rules. Planwharf does not guarantee that a generated application works. **Evidence complete** means the execution produced completion evidence; test the resulting product yourself.

## Requirements and installation

On Windows, install Node.js and a Chromium browser such as Edge. There is no `npm install` step for Planwharf. Rebuilding `Planwharf.exe` requires the .NET Framework compiler used by `launch/build-exe.cmd`.

1. Clone or copy this repository into a folder you can write to.
2. Open PowerShell there and run `node --version`.
3. Install and sign in to at least one supported coding CLI.
4. Check its available models and try a small request before using it for a project.

Commands checked on this PC:

```powershell
& "$env:USERPROFILE\.grok\bin\grok.exe" --help
& "$env:USERPROFILE\.grok\bin\grok.exe" models
& "$env:USERPROFILE\.gemini\bin\agy.exe" --help
& "$env:USERPROFILE\.gemini\bin\agy.exe" models
& "$env:USERPROFILE\.gemini\bin\agy.exe" -p /usage --output-format json
codex exec --help
```

Use each CLI's sign-in procedure. Planwharf does not create accounts or buy credits. It checks `%USERPROFILE%\.grok\bin\grok.exe` and `%USERPROFILE%\.gemini\bin\agy.exe`. For Codex, it resolves the actual native executable, including the Windows npm package binary, rather than using a batch or shell wrapper. You can override these locations with `PLANWHARF_GROK`, `PLANWHARF_ANTIGRAVITY`, and `PLANWHARF_CODEX`.

## Launch and your first project

Double-click `Planwharf.exe` or `planwharf.cmd`, or run:

```powershell
node .\planwharf.cjs
```

The launcher opens a local window. If a supported browser is missing, open the printed local address, usually `http://127.0.0.1:4173`. Opening `index.html` directly does not start the server that saves your work.

Select **Add project**. Enter a name and a concrete goal. In **Projects folder**, enter an existing absolute base directory, for example `D:\benit\Desktop\Projects`, and click **Save projects folder**. The choice is kept on disk for this notebook and survives restarts.

Leave **Create a new subfolder using the project name** checked to create the project's folder under that directory. For example, a project called `Weather app` gets `D:\benit\Desktop\Projects\Weather app`. If that name already exists, Planwharf creates `Weather app-2` and preserves the existing folder. Characters Windows cannot use in folder names are replaced. Saving the project creates and links the folder; it does not start workers.

To use an existing project instead, uncheck that option and fill in **Existing project folder**. **Set place** changes the folder or GitHub link for an existing notebook project. Changing the base directory affects future projects; it does not move existing ones. To clear the saved default, empty **Projects folder** and save it. The settings live in `plan.json.settings.json`, or `<your-notebook-file>.settings.json` for a separate notebook.

A useful goal describes both the product and acceptance criteria: “A Windows calculator with buttons, keyboard input, decimal arithmetic, division-by-zero handling, and a standalone executable.” Include technology constraints, files to preserve, and tests to run.

Your `plan.json` may already contain personal projects. To inspect the calculator's isolated notebook instead:

```powershell
node .\planwharf.cjs --plan .\validation\calculator-run\notebook.json --attempts-dir .\validation\calculator-run\attempts --port 4180
```

That notebook points to the relocated calculator. **Auto start** prepares a new job; do not press it if you only want to read existing evidence.

## Planning, Grill, and approval

**The plan** stores direction, current state, closed decisions, and open questions. Each saved revision preserves a snapshot. **What changed** shows the difference between revisions.

**Grill me** asks questions to define the project. **Grill with the docs** also uses documents from its linked folder. In **For you**, answer questions and decide whether to keep them open, close them with a decision, or change direction. Save your answers to create a revision.

The notebook and answer round work locally. Auto start can ask the lead to formulate questions, with local fallback behavior if the lead cannot respond. Saved answers are planning records, rather than technical verification of your code.

**Auto start** inspects the folder, proposes Grill when required, and prepares a job. Review the proposed plan and workers, then choose **Approve run**. Jobs prepared by Auto start require that approval even in Automatic mode. Use **Skip grill** for a project or change the Grill settings in Functions when appropriate.

**Manual** waits for job approval. **Automatic** can dispatch a manually added task without that wait. Approval of the plan in Planwharf is separate from permission prompts inside coding CLIs: workers run without interactive confirmations.

## Lead, providers, and workers

Choose the lead in Functions or the Orchestrator window. It receives a coordination prompt and full local/network tool access, without interactive permission prompts. Worker processes receive their own implementation prompts. The lead coordinates; its role no longer imposes a CLI plan/read-only restriction.

Every entry in `models.json` declares an exact `provider` and `cli` model ID. The runner launches the corresponding CLI with that ID. It rejects incompatible combinations and never silently replaces a GPT or Gemini model with Grok.

Current configuration on this PC:

| Provider | Verified models and status |
| --- | --- |
| Codex / ChatGPT | GPT-6 Astra, GPT-6 Luna, GPT-6 Sol, GPT-6.1 Sol, GPT-5.6 Luna, and GPT-5.5 completed small inference checks and are enabled. A real isolated orchestrator job used Astra as lead and Luna as worker. |
| Antigravity / Gemini | Gemini 3.1 Pro High created and corrected the calculator; Gemini 3.8 Flash High participated in its review. Both are enabled. |
| Grok | Grok 4.6 is listed by the CLI, but the calculator attempt received HTTP 403 for credits/spending limits. It is switched off by default. |
| Unsupported older entries | GPT-5 and GPT-5 mini were explicitly rejected by Codex with this ChatGPT account. Other old Grok names were absent from its model listing. These entries show **Unavailable**. |

“Verified” describes requests made with this account on that date. It is not a promise of future quota or entitlement. A catalog alone cannot prove model access: [official OpenAI documentation](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) distinguishes a model catalog from a completed inference check. Probe logs are in `validation/provider-check`.

Enabled models are eligible choices, rather than a requirement to run every model on every job. Selection considers task type, local assignment counters, provider quotas, and previous failed attempts. Simple inspection favors local models; implementation favors default models; difficult work favors premium models. Existing saved on/off choices override defaults. Use Functions to change those choices or select Astra as the lead.

CLI options checked locally:

| CLI | Worker | Lead |
| --- | --- | --- |
| Grok | `--always-approve --permission-mode auto --no-subagents -m MODEL` | Same permissions; coordination prompt and streamed response |
| Antigravity | `--dangerously-skip-permissions --mode accept-edits --model MODEL` | Same permissions; coordination prompt |
| Codex | `exec --dangerously-bypass-approvals-and-sandbox -m MODEL` | Same permissions; coordination prompt and JSON response |

These flags have different effects. The Codex worker flag disables the sandbox as well as approvals. A worker prompt saying “stay inside this folder” does not create filesystem isolation. Link the intended project folder before approving a job.

## Monitoring and chat

### Check local and GitHub access

Use **Check repository** next to the project's folder/GitHub links. It checks the local directory and the linked GitHub repository using the existing GitHub CLI login. Private repositories work when that account has access. Run `gh auth status` to check the login, or `gh auth login` to authenticate.

The status shows filesystem read/write access, GitHub visibility and account permissions, commits ahead/behind, and uncommitted paths. An uncommitted change is not a commit ahead of GitHub. The comparison fetches current objects into `refs/planwharf/inspection/*` without merging, pushing, checking out branches, or changing source files. If the local branch has never been published, the default GitHub branch is the explicitly labelled baseline. Offline/authentication failures, unrelated histories, and insufficient shallow history remain unknown rather than becoming false “in sync” results.

Before answering, the lead receives updated repository facts for the selected project and paths/URLs for all registered projects. It can inspect nested files, private GitHub contents, diffs, and remote metadata through its tools. The coordinator role remains separate from job implementation; it does not imply restricted filesystem access. Checks are cached for about one minute; the button forces a refresh. [Git's comparison documentation](https://git-scm.com/docs/git-rev-list) explains the commit counts. [GitHub CLI credential documentation](https://cli.github.com/manual/gh_auth_setup-git) describes authenticated Git access.

The dashboard shows assignments, PIDs, log paths, interpreted activity, quotas, and interventions. Ask the lead about progress. Explicit **Stop**, **Resume**, and **Approve** buttons make actions clear; the chat also recognizes commands through keyword rules.

Activity descriptions are inferred from logs and can be inaccurate. Some CLIs stay quiet until they finish. Check the actual process, log, and output files when a status looks doubtful. Dashboard monitoring currently depends on page polling; there is no independent always-running monitoring service.

**Worker discretion** leaves duration to the worker. **Finish by** sets a deadline. The next monitoring tick checks it and saves a checkpoint if work is incomplete. It is not a guaranteed timer while the server or monitoring is off.

## Stop, Resume, and persistent checkpoints

**Stop** terminates the worker process tree and saves the job, plan, and assignment in `checkpoints/ID.json`, alongside `orchestrator.json` in the attempts directory. Failure with no usable alternatives, inactivity, a deadline, and normal server shutdown also save checkpoints.

The UI shows **Paused**, **Checkpoint saved**, and **Resume**. Saved checkpoints have no expiry. Tests simulate decades, repeated ticks, and server restarts. Keep the disk files: deleting the attempts directory or losing the linked project folder removes information needed for recovery.

**Resume** checks that the checkpoint belongs to the current job, creates a fresh assignment using eligible models, and passes the saved plan. It resumes from existing files and instructions; it does not restore the interrupted CLI's internal memory or cursor. A missing model or exhausted quota can prevent progress.

Closing only the Orchestrator window leaves the main server running. Closing the main app or pressing Ctrl+C asks the launcher to save state and shut down. A power failure or forced process kill cannot execute normal shutdown; recovery can only use information already available on disk.

Back up the notebook, its `.settings.json` file, the attempts directory, and the project folder together. A checkpoint already saved does not require an open browser.

## Real quotas and local counters

**Provider usage** comes from provider responses. ChatGPT uses the local Codex login's usage windows; Grok reads billing through its local login; Gemini runs `agy -p /usage --output-format json` and reads numeric buckets from the Gemini Models group. The checked usage request reported `num_turns: 0` and no token use.

Gemini displays weekly and five-hour windows and their reset times. Its headline quota uses the more restrictive window. Displayed percentages are rounded; exhaustion checks use the original numeric fraction. Antigravity's Claude/GPT-OSS group is separate from Gemini and is not treated as Gemini quota.

**Unread / Not readable** means no verifiable reading is available. It does not mean 0% or 100%. Login problems, timeouts, or a changed response format can cause it. Usage is refreshed with a cache of roughly 45 seconds during updates.

Model `cost`, `limit`, and `used` fields are local assignment counters, not money, tokens, or subscription percentages. A readable quota does not guarantee that a request will be accepted; the Grok 403 demonstrated that limitation.

## Historical calculator example

Workers created a Windows calculator through `createOrchestrator → spawnWorker → runner → agy`. It passed 15 independent GUI checks and five engine self-tests. Failed Grok attempts and the successful Gemini chain remain in the local `validation/calculator-run` evidence directory.

The owner subsequently removed both calculator project folders. The executable is no longer installed. The preserved GUI harness requires restoring the calculator to the folder recorded in its isolated notebook before it can run again. Historical results do not imply a current executable download.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Planwharf will not launch | Check `node --version`; start it from PowerShell to read the error. |
| Port occupied | The launcher searches for a free port; you can request `--port 4180`. |
| Cannot save projects folder | Use an existing absolute directory accessible to this Windows user. |
| A project name already exists | A numbered sibling folder is created; existing content is preserved. |
| Needs a folder | Link an existing absolute path with Set place, or create a new project subfolder. |
| Waiting on you | Answer and save Grill, or use Skip grill. |
| Plan ready | Review the plan and choose Approve run. |
| No eligible worker | Enable an available model; check provider quotas and local counters. |
| Unavailable | Inspect the stated reason. GPT-5 and GPT-5 mini are rejected with this account; enabling a label cannot grant access. |
| Codex ENOENT / InvalidBatchScriptArg | Use the actual native Codex binary, not an npm shell script or batch proxy. Set `PLANWHARF_CODEX` if automatic discovery misses your installation. |
| Grok HTTP 403 | Resolve account credits or spending limits before switching Grok on again. |
| Gemini unread | Run `agy -p /usage --output-format json`; check login and CLI version. |
| Paused after an error | Read attempts logs, fix the cause, then Resume. |
| Resume rejected | Use the original notebook, project, and matching job; do not reuse a checkpoint for a different task. |
| Worker appears idle | Check its log, process, and files; print-mode silence is not proof of a hang. |
| Evidence complete but product broken | Run tests and try the product. Create a correction job with the observed failure. |

When asking for help, provide the error, CLI/model, and attempts directory. Keep login tokens and authentication files private.
