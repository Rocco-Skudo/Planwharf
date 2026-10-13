# Startup verification — 2026-10-13

The reported symptom was double-clicking `Planwharf.exe` without seeing a window. Inspection found the existing notebook backend alive on port 4173 with both window views inactive. The personal backend was left running.

## Reproduced defects and changes

- A native browser exit left its heartbeat active for up to 15 seconds. Immediate relaunch tried to focus a closed window. Running the same isolated close/relaunch sequence against the previous code launched one browser; the corrected code launches two, reopening the application.
- Native focus previously ignored whether Windows found the window. Failed focus now requests a browser window, with duplicate launch suppression. Pending focus cannot reopen the application after Quit.
- Browser spawn errors did not clear the launch suppression state. Spawn errors and exits now release that state; an old browser exit cannot clear a newer launch. Unexpected nonzero browser exits and spawn errors attempt the default browser. Intentional Quit does not trigger this fallback.
- Malformed or partial startup locks could permanently block launch. Old invalid locks are retained in unique `.invalid-*` files before recovery. Dead owners recover; live owners remain protected. Identity probes include a total deadline and tolerate malformed responses. Ready-instance metadata is published through an atomic rename, and lock release checks a unique owner ID.
- The Windows launcher incorrectly quoted argument paths ending in a backslash. Its quoting now follows Windows backslash/quote rules. The compiled launcher was tested with spaces and a trailing separator in the attempts path.
- Each executable invocation now records a separate startup log, normally under `%LOCALAPPDATA%\Planwharf\logs`. Errors include that path. Diagnostic failures do not prevent startup; in-memory error output is bounded.
- Broad validation exposed an integration fixture that replaced only Grok discovery and still queried the real Codex account. Injected catalog discovery now receives each provider explicitly and replaces discovery for all providers. The fixture supplies its exact isolated IDs, without using live account catalogs.

## Validation

```powershell
cmd /c launch\build-exe.cmd
node --test engine/startup.test.cjs engine/phase1.test.cjs
node validation/launcher-smoke.cjs
node validation/phase1-suite.cjs
```

The targeted startup/Phase 1 tests pass all 18 cases, including closing every owned browser after focus recovery. The executable smoke check passes three complete backend start/quit cycles with three simultaneous repeated invocations per cycle: 12 executable launches total. It checks one backend per notebook, a real application window heartbeat, HTTP page/notebook availability, clean lock release, per-launch logs, and unchanged personal/test notebooks.

Latest executable evidence: `validation/launcher-smoke-1791848170146/results.json`. An earlier failed attempt remains in `validation/launcher-smoke-1791847795396`: Chromium exited with code 2147483651 under the validation sandbox. As with the existing browser tests, the successful executable validation explicitly uses `PLANWHARF_TEST_NO_SANDBOX=1` for the test browser only. Normal launch retains Chromium's default sandbox settings. A separate attempt at `validation/launcher-smoke-1791848127176` encountered a local HTTP probe timeout during parallel browser validation. Smoke-test readiness polling now retries transient probe timeouts within its existing overall deadline; the final standalone run passes.

The real browser workflow also verifies project selection, current goal, note persistence/isolation, switching between Planwharf and Orchestrator, close/reopen, and mobile layout. Launcher validation does not run coding workers or prove access to any real provider/model. Existing raw execution evidence and personal notebook content are preserved.

The first broad suite run is retained at `validation/phase1-suite-1791847847550/results.json`; its account-dependent runtime fixture failed before the discovery isolation fix. A fresh complete suite is run after that correction; its final evidence is recorded below.

Final broad suite: `validation/phase1-suite-1791848033884/results.json`, all 45 validation scripts pass, with `personalNotebookUnchanged: true`. The final owned-browser cleanup refinement was additionally verified by all 18 targeted cases and the final executable smoke run above. `git diff --check` passes.
