# Planwharf local app (Edge --app)

STATUS: COMPLETE  
VERDICT/GATE: **ACCEPT / PASS**

## Files touched

| File | Change |
|------|--------|
| `planwharf.cjs` | App entry: opens Edge `--app` on 127.0.0.1; CLI `status` and `projects` read the same `plan.json` and attempt file. |
| `planwharf.cmd` | Windows launcher. |
| `.gitignore` | `.planwharf-window/` |
| `README.md` | One command to open the app; CLI; four English areas. |
| `verify-app.cjs` | CLI, loopback bind, four areas, production plan hash. |
| `handoff/RESULT.md` | This report. |

`server.cjs`, `app.js`, `index.html`, `plan.js`, `engine/*` unchanged in this round. No npm. No model spawn.

## How to run

```
node planwharf.cjs
node planwharf.cjs projects
node planwharf.cjs status
```

Ctrl+C closes the process and the window. If Edge is missing, the URL is printed.

## Tests

```
node verify-app.cjs
node verify-projects.cjs
node engine/attempts.test.cjs
```

All exit 0. Live check: `planwharf.cjs` printed `Window: Edge --app` on `http://127.0.0.1:4174`; HTML contains For you, Running, The plan, What changed, Add project.

Production `plan.json` SHA256 unchanged: `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469`.

## OPEN_ISSUES

None for this shell. Next (not this round): spawn models, drop HTTP, installer.
