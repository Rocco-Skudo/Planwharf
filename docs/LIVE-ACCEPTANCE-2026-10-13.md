# Live acceptance: 13 October 2026

The requested complete real-provider workflow is **not verified**. Planwharf launched the exact Codex worker, but the provider could not complete inference in this execution environment. No simulated result was promoted to real-provider completion evidence.

Validation used a separate notebook containing a harmless Git project and copies of the existing personal notebook entries. Personal source folders were used only for read-only recipient inspection and before/after verification. The personal notebook, existing workspace modifications, and historical raw logs were preserved. No personal project worker was dispatched. Provider credentials were used in disposable CLI profiles and removed after the exercises; they are absent from retained evidence.

## Observations

| Requested action | Observed result |
| --- | --- |
| Restart Planwharf | Isolated backend processes were quit and relaunched. The normal launcher was subsequently started; PID 25372 responded with HTTP 200 at `http://127.0.0.1:4173/api/app`. |
| Select harmless test project | The real Edge UI selected `live-acceptance`, an isolated project folder. |
| Create and approve small MegaTask | A two-slice graph was visible before approval. Clicking the Home approval action launched `codex/gpt-6-luna`. |
| Real worker execution | CLI process launched, but inference ended with `workspace routing discovery failed`; no arithmetic source or successful structured result was produced. |
| Progress / Now / Next | Failure and checkpoint state were exposed by the real Home endpoint. Successful progress propagation passed the separate browser fixture, which uses simulated provider results. |
| Stop during second task | **Not reached with real inference.** The first slice never completed. Stop was verified on a resumed real first-slice process, and separately on a second-slice browser fixture. |
| Close and reopen | A failed checkpoint survived backend process replacement without dispatching another attempt. A stopped checkpoint subsequently survived another replacement. |
| Resume explicit checkpoint | Checkpoint `CP-3e8b84e7-9a23-4287-b58b-43a3aaa0b9f1` resumed the same first SubTask with fresh `attempt-2`, PID 16776. The untouched dependent SubTask retained zero attempts. Stop terminated PID 16776 and saved `CP-81aabb78-8097-4f8a-8efa-0b4f0d4a58f5`. |
| Change orchestrator | Both `codex/gpt-6-sol` and `codex/gpt-6.1-sol` were actually invoked and received the exact durable checkpoint and both SubTasks. Both calls failed to connect. **Model understanding remains unverified.** |
| Order to AI-Companion-Desktop | The real UI selected that recipient; an exact read-only audit order created its own MegaTask awaiting approval. The lead call failed, but notebook preparation and recipient routing were observed independently. |
| RaceEngineer isolation | During the AI order, backend inspection traced only the AI-Companion-Desktop folder. There were zero worker launches. RaceEngineer source file hashes, HEAD, refs, Git status, notebook entry, and execution graph remained unchanged. AI source and the personal notebook also remained unchanged. |

## Retained evidence

- Real worker, proposal screenshot, raw provider log, structured failure, and durable checkpoint: `validation/phase2-browser-live-1791842252044/`.
- Explicit recovery, Stop, backend replacement, and both actual lead inputs/outputs: `validation/phase2-browser-live-1791842252044/failure-recovery.json` and `backend.jsonl`.
- AI recipient order, isolation assertions, screenshot, and normal app launch log: `validation/phase2-browser-live-1791842347437/`.
- Earlier failed setup attempts remain intact in their separate `validation/phase2-browser-live-*` folders. They encountered Git ownership, Edge renderer sandbox, missing CLI home, and denied access to the owner's writable Codex state. Scoped Git configuration, the browser fixture's launch flags, and disposable authenticated CLI profiles resolved setup; provider connectivity remained blocked.

## Reproduction

```powershell
node validation/live-acceptance.cjs
node validation/live-acceptance.cjs --recipient-only
# Continue only a retained isolated failed acceptance run:
node validation/live-failure-recovery.cjs validation/phase2-browser-live-1791842252044
```

The first command exits unsuccessfully if real inference cannot complete. Recipient-only success establishes routing and preservation, not successful model inference. The recovery command establishes failure recovery, not completed implementation or checkpoint comprehension.

Separate existing checks passed: `engine/phase2.test.cjs`, `engine/phase2-worker.test.cjs` (actual parent and descendant termination), `validation/phase2-browser.cjs`, `engine/phase2-git.test.cjs`, and `engine/project-recipient.test.cjs`. Their provider fixtures do not establish real account inference.
