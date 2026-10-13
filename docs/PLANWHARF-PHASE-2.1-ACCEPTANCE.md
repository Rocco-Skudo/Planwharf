# Planwharf Phase 2.1: real provider acceptance

Task: `PLANWHARF-PHASE-2.1`
Date: 13 October 2026 (Europe/Rome)

The retained two-slice MegaTask completed through the real `codex/gpt-6-luna` provider path. There was no provider or model substitution. The first slice produced working arithmetic source, ran its Node tests, and wrote a validated COMPLETE result. A later slice was interrupted by Stop, survived backend replacement, resumed from an explicit checkpoint, ran the tests, and produced another validated COMPLETE result. Both `codex/gpt-6-sol` and `codex/gpt-6.1-sol` actually answered checkpoint questions correctly.

## Root cause and controlled comparisons

The routing error occurred inside the installed Codex CLI 0.162.1, before model inference, even outside Planwharf. It was not caused by a project folder, Git repository, a substituted model, or Planwharf prompt transport.

| Comparison | Observation |
| --- | --- |
| Small direct invocation using the historically successful probe arguments | `workspace routing discovery failed`, exit 1. |
| Planwharf worker arguments, same credentials and writable CLI profile | Same routing failure. |
| Remove inherited Codex session/CI/managed-package variables | Same routing failure. |
| Empty non-Git folder versus isolated Git repository | Same routing failure. |
| Node HTTPS, same existing ChatGPT credentials | Model catalog and usage endpoints returned HTTP 200; the catalog included `gpt-6-luna`. No credentials were printed. |
| Native transport trace | TCP connections reached the server; HTTPS requests failed. A separate native `curl.exe` request reported Schannel `SEC_E_NO_CREDENTIALS`. |
| Same CLI/account/model with an explicit trusted CA bundle | Real inference completed with `MODEL_ACCESS_OK`, exit 0, no routing error. Both `CODEX_CA_CERTIFICATE` and `SSL_CERT_FILE` worked. |
| Direct historical arguments and Planwharf arguments with the corrected runtime environment | Both completed real inference without routing errors. |

The controlled change isolates the routing failure to the native TLS trust path in this restricted Windows session. The Schannel error is corroborating evidence; the CLI did not expose that same underlying native error directly. Earlier missing-home and denied-home-write errors were separate setup failures, handled by disposable authenticated CLI profiles for acceptance. Authentication, model compatibility, and network reachability were established independently without changing account or endpoints.

Two further runtime boundaries became visible once inference worked:

- Codex selected an installed Windows Store PowerShell executable denied to the current account. Its user execution alias was also denied, despite `existsSync` returning false for the alias target. A direct command using system PowerShell succeeded. Codex's command execution also succeeded after unavailable Store shell paths were removed from the child environment.
- A real resumed worker wrote a correctly identified COMPLETE result using Windows PowerShell `Set-Content -Encoding utf8`. The resulting UTF-8 BOM made `JSON.parse` reject the artifact. The raw artifact and independently recorded successful provider exit were retained. A fresh resumed attempt subsequently completed after the parser correction.

## Fix scope

Only provider/runtime boundaries and acceptance validation changed:

- `engine/providers.cjs` builds the Codex Windows child environment. When neither `CODEX_CA_CERTIFICATE` nor `SSL_CERT_FILE` is configured, it supplies Node's trusted CA certificates through the supported Codex CA environment setting. Certificate verification stays enabled. Explicit operator CA settings remain unchanged; other providers and non-Windows environments retain their environment. The helper removes a WindowsApps PATH entry only when that entry contains a discoverable `pwsh.exe` or execution alias that fails a direct no-op launch check. Host environment variables and global configuration remain unchanged.
- `engine/runner.cjs` uses that environment for the actual lead and worker CLI processes. Exact provider/model arguments, stdin transport, and permission modes are unchanged.
- `engine/worker-result.cjs` tolerates one leading UTF-8 BOM when decoding result and exit JSON. Size, schema, identity, provider/model, and successful-exit requirements remain in force. No raw artifact is rewritten.
- Existing provider and native worker tests now cover the CA settings, environment preservation, inaccessible Store shell aliases, valid BOM results, and foreign-identity BOM rejection.
- The retained live harness uses distinct browser profiles on reopening to avoid stale DevTools port files. Its explicit `--resume-run` option continues an isolated retained acceptance graph and creates separate continuation evidence, preserving prior logs and failed-run reports. Checkpoint assessments require both exact SubTask IDs and an explicit statement that completed work must not be replayed. Home completion is checked against actual validated worker results.

Codex officially supports `CODEX_CA_CERTIFICATE` and the `SSL_CERT_FILE` fallback for HTTPS and secure WebSocket trust configuration. [Official OpenAI authentication documentation](https://learn.chatgpt.com/docs/auth#custom-ca-bundles).

No feature, UI redesign, provider replacement, automatic personal-project dispatch, push, merge, reset, or Phase 3 work was introduced.

## Real execution evidence

Retained workspace: `validation/phase2-browser-live-1791843660879/`.

MegaTask: `MT-dae57ed0-c415-4910-b48d-e71c26679a2a`.

| Attempt | SubTask | Observed result |
| --- | --- | --- |
| `attempt-1`, PID 14740 | ST-01, arithmetic module | Real provider-authored COMPLETE; `node sum.test.cjs` passed; independent provider exit 0. |
| `attempt-2`, PID 13680 | ST-02, recovery verification | Real Codex worker entered its PowerShell wait; Stop terminated the process tree and saved a checkpoint with ST-01 complete. BLOCKED interruption evidence retained. |
| `attempt-3`, PID 25996 | ST-02, explicit recovery | Real inference ran the tests and wrote COMPLETE with a UTF-8 BOM. The pre-fix decoder rejected it; the recorded failure, raw result, and exit 0 remain unchanged as historical evidence. |
| `attempt-4`, PID 25844 | ST-02, explicit retry after boundary fix | Real provider-authored COMPLETE; tests passed; independent provider exit 0. MegaTask and notebook task became terminal COMPLETE. ST-01 still has exactly its original one Attempt. |

Stop checkpoint: `CP-dbf649a8-d7e5-4ff8-8d23-a1603df3ff0f`.
Subsequent failure checkpoint: `CP-fe314102-e0c5-46eb-9491-a97801bfad0e`.

Both checkpoints identify ST-01 as complete and ST-02 as remaining work. Backend restart did not launch replacement work. Explicit Resume used the selected checkpoint and generated a fresh Attempt for the same ST-02.

The alternate real `codex/gpt-6.1-sol` lead identified both exact SubTask IDs, said `RERUN_COMPLETED=no`, explained the failed versus pending checkpoint lists, and specified continuing only ST-02 by skipping its initial wait, running the existing tests, writing recovery evidence, and producing a result. It distinguished saved checkpoint state from the current resumed attempt. Its full assessment is in `acceptance-continued-1791843871040.json` and the appended backend trace.

Final Home evidence:

- Progress includes both real COMPLETE summaries.
- Now is `Completed`.
- Next is `Review completed acceptance evidence`, matching the last real result.
- Test evidence includes actual PASSED commands.
- A browser reload retains the Completed state; the completion screenshot is retained.

The final AI-Companion-Desktop order produced a real lead answer and an unapproved audit MegaTask. No worker was launched for either personal project. During that order, inspection traced only AI-Companion-Desktop. RaceEngineer source hashes, Git HEAD/status/refs, notebook entry, and execution graph were unchanged; AI source and the personal notebook were unchanged as well.

## Validation and evidence locations

- Original failure matrix: `validation/provider-check/phase21-1791843189595/results.json`.
- Native transport trace: `validation/provider-check/phase21-1791843260082/`.
- Successful direct trusted-CA probes: `validation/provider-check/phase21-1791843299426/`.
- Store versus system shell comparison: `validation/provider-check/phase21-1791843499296/`.
- Successful direct and Planwharf boundary comparison: `validation/provider-check/phase21-1791843686136/results.json`.
- Original real first completion, Stop, and its browser locator failure: `validation/phase2-browser-live-1791843660879/acceptance.json`.
- First continuation, correct lead handoff, and BOM discovery: `acceptance-continued-1791843802188.json` in that retained workspace.
- Successful continuation, final Home, correct alternate assessment, and isolation checks: `acceptance-continued-1791843871040.json` in that retained workspace.
- Final regression suite: `validation/phase1-suite-1791843889670/results.json`.

The final suite passed **43/43**, including the extended native worker BOM cases and provider environment checks. Its personal notebook hash remained unchanged. No regression was observed in the suite. The real live acceptance also exited successfully and preserved the personal project snapshots. `git diff --check` passed.

After checking that the normal backend had zero active workers, it was quit and relaunched to load the runtime fix: PID 25372 became PID 8228 at `http://127.0.0.1:4173`. The personal notebook hash stayed unchanged. Startup evidence is in `validation/provider-check/phase21-1791843686136/normal-backend-restart.json` and its separate launcher log. No personal project was authorized or dispatched.

All acceptance credentials stayed in temporary CLI profiles removed after use. The evidence folders contain no copied authentication files. Historical raw logs and the earlier acceptance report remain intact. Workspace changes that existed before Phase 2.1 remain in place.

To reproduce a new isolated run:

```powershell
node validation/phase21-provider-probe.cjs --runtime
node validation/live-acceptance.cjs
node validation/phase1-suite.cjs
```

To continue a nonterminal isolated acceptance graph after a test interruption, use `node validation/live-acceptance.cjs --resume-run <retained-directory>`. Do not use this option on the completed graph above.

## Existing observation outside this fix

While a MegaTask is RUNNING, Home's Next text can remain the proposal's approval instruction after the first result. Checkpoint and final completion Next text update correctly. This behavior was recorded in the live run; the Phase 2.1 change leaves execution/UI recommendation logic unchanged as required by the adapter/runtime-only scope.
