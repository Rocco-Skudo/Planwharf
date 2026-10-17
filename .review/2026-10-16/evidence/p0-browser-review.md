# P0.3 Chrome harness portability — independent PASS

Scope: the existing layout browser harness's executable selection and messages only; no product UI redesign, full browser acceptance, console/network audit or live-provider claim.

Reviewed file: `worktrees/p0-browser/verify-layout.cjs`.

SHA-256: `4CD7145D4364043C5DA02D42F3CC22382A032907D2456C20D71F2AEC937E0CC4`.

## Source review

- Exact diff changes only the hardcoded Edge executable into required explicit `PLANWHARF_TEST_BROWSER`, validates absolute existing regular-file path and rejects whitespace/control characters, uses browser-neutral Chromium wording/profile names, and identifies the selected executable in the report.
- Path validation precedes output/profile/notebook creation and server/browser startup. Spawn passes the path as executable with a separate argument array and no shell; no downloaded script or additional permission added to product code.
- Fresh output-specific Chrome profile and model-free fixture notebook remain. The harness closes its own DevTools browser connection and child only. Existing cleanup removes its own fixture notebook; no user profile, actual project or worker is targeted.
- Existing assertions remain unchanged. No Edge execution occurred in this review. Product browser compatibility is unchanged; this is a Chrome-only validation run at current user direction.
- No actionable defect found in this bounded portability increment. Existing `PLANWHARF_TEST_NO_SANDBOX` support predates the patch; it was explicitly unset in review and Chrome's sandbox remained enabled.

## Independent checks

`node --check verify-layout.cjs` and `git diff --check` pass. Exactly one tracked source file is modified: `verify-layout.cjs`.

Five separately spawned Node configuration-negative cases (missing executable, relative path, nonexistent file, existing directory, embedded newline) exited nonzero before creating their configured output directory: **5/5 pass**. The executable path was never interpolated into a shell.

Initial independent Chrome attempt under the default execution-tool filesystem/process restrictions failed with:

```text
AssertionError [ERR_ASSERTION]: Chromium DevTools did not start: C:\Program Files\Google\Chrome\Application\chrome.exe
```

That attempt is a recorded failed browser startup, not PASS. Its outer PowerShell invocation later ran hash/status checks and therefore returned 0; the Node assertion is the authoritative failure. Attempt output directory: `evidence/p0-browser-independent/`. No success report exists for that attempt.

A bounded automatic-approval escalation then reran the same reviewed harness with the same installed Chrome path, isolated output/profile, and Chrome sandbox enabled. This uses the execution tool's approved unrestricted context, not Chrome `--no-sandbox`. The command immediately propagated Node's exit via `exit $LASTEXITCODE`:

```powershell
$env:PLANWHARF_TEST_BROWSER='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PLANWHARF_VALIDATION_DIR=Join-Path (Get-Location) '..\..\evidence\p0-browser-independent-unrestricted'
Remove-Item Env:PLANWHARF_TEST_NO_SANDBOX -ErrorAction SilentlyContinue
node verify-layout.cjs
exit $LASTEXITCODE
```

**Real Chrome layout harness PASS, actual child exit 0**:

```text
PASS: real Chromium (C:\Program Files\Google\Chrome\Application\chrome.exe) width and height drag, keyboard resizing, Escape cancellation, persistence across reload and dashboard refresh, reset, nested responsiveness, mobile and legacy route compatibility.
```

Independent screenshot evidence: `p0-browser-independent-unrestricted/desktop-layout.png` and `mobile-layout.png`, both inspected. Desktop shows the real isolated Layout probe dashboard with split panels; mobile shows stacked panels and no horizontal-overflow assertion failure. The fixture has no models or running workers. Existing harness also checks malformed layout preference recovery and unchanged project content/notes. This proves those existing layout interactions in actual Chrome; it does not prove forthcoming unified workspace, four roles, event delivery, immersive weather or skills functionality.

## Disposition

**PASS for P0.3 browser harness portability**, with the restricted-startup limitation preserved above. No Edge, personal browser profile, user data/process modification, provider calls, repository commits, pushes, publication or CLA actions. Full P6 real-browser acceptance and JavaScript/network error monitoring remain future work.
