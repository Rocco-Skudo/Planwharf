# Planwharf quick start

Planwharf is a local project notebook and coordinator for coding AIs. **Planwharf** shows your project's goal, progress, history and next step. **Orchestrator** shows the models, approved assignments, running workers and remaining quota.

## 1. Open the application

Download or clone the complete repository. Install Node.js and a Chromium browser, such as Edge or Chrome. Keep `Planwharf.exe` with the other application files and double-click it on Windows. Alternatively, run `node planwharf.cjs`. No `npm install` is required.

Normal desktop launch opens one full-screen window. **Show Orchestrator** / **Show Planwharf** switches views in that window. Both views share one backend.

## 2. Create a harmless first project

Choose **Add project**, enter a name and a concrete goal, and link its folder. Set **Projects folder** if you want Planwharf to create a new subfolder. For your first experiment, use a new folder rather than an important existing repository.

Example goal: "Build a local HTML counter with increment and reset buttons. Keep it dependency-free and test both buttons."

## 3. Choose providers, models and allowed roles

Install and authenticate the coding CLIs you want to use: **Codex / ChatGPT**, **Grok CLI**, or **Antigravity / Gemini**. Provider/account availability determines which exact models you can actually run.

In Orchestrator, enable your provider and select the desired model roles. Each model has three independent **Allowed roles** checkboxes:

| Role | Permission |
| --- | --- |
| Orchestrator | Coordinate and reason about the project. Select this model as the lead. Unsupported models have a disabled checkbox. |
| Worker | Perform approved implementation or supported research work. |
| Reviewer | Perform an approved review/audit. |

A model can have several roles. A model with only Reviewer selected cannot receive implementation work. A model with only Orchestrator selected cannot be dispatched as a worker or reviewer. There is no separate model On/Off switch. A selected role permits assignment when the provider/model is available and quota is not exhausted. With no roles selected, the model receives no assignments. Settings survive restart. Availability is checked at backend startup; **Refresh models** repeats the catalog check. **Availability unread** means the check failed or no reliable listing is available, not that quota is exhausted.

Use **Find models** to search by provider, name or exact ID. **Model role** filters by Orchestrator, Worker or Reviewer; **All roles** clears that filter. **Show all models** expands a provider's catalog. Select an enabled, compatible model in **Orchestrator model** to choose your lead.

## 4. Prepare and approve work

Select the project recipient. Use **Grill me** to clarify the goal, or **Grill with the docs** to use its documentation. Save the answers, then use **Auto start** or send a concrete new work request in chat.

Review the proposed **MegaTask**: goal, smaller **SubTasks**, exact models and dependencies. Choose **Approve MegaTask**. New work needs approval in Manual and Automatic modes. Preparing a plan is not evidence that a worker has started.

## 5. Follow the actual result

Home shows **Progress**, **Now**, **Next**, project history and changes since your last visit. Orchestrator shows running processes and **AI usage**. Workers modify files in the linked project folder; Planwharf does not automatically commit, push or publish them.

Quota always means **REMAINING**, shared by all models on that provider pool. Zero is **EXHAUSTED**. **REMAINING UNREAD** means no reliable quota reading is available. Usage counts and durations are operational evidence, not estimated monetary cost.

## 6. Pause, resume, export and quit

- **Pause after current tasks** lets active work finish and prevents new slices from starting.
- **Stop** terminates current work and saves a checkpoint. Partial file changes remain available.
- **Resume** continues remaining work from the chosen checkpoint. Review the checkpoint comparison and confirm detected changes when requested. Completed slices are retained.
- Add personal notes on Home. **AI relevant: Yes** includes a note in AI briefings; the default is No. Notes never automatically become tasks.
- **Export project** downloads readable JSON metadata, including a Markdown summary. Keep the original notebook and attempts directory for complete recovery; automatic import is not supported.
- Optional **Notifications: On** requests local browser permission. Notifications require an open UI and platform support.
- **Quit application** checkpoints and shuts down properly. Closing the desktop window uses the same checkpoint and shutdown path.

For every feature, workflow and troubleshooting detail, see the [complete user guide](USER-GUIDE.md). For verified environments and limitations, see [project status](PROJECT-STATUS.md).
