# PLANWHARFZOMBIE — chiudi il motore

STATUS: COMPLETE  
VERDICT/GATE: **ACCEPT / PASS**

Implementer: this session, files written directly in `D:\benit\Desktop\Projects\Planwharf-zombie`. No NPC-Orchestra-v5, no inbox envelopes, no native agent spawn, no model discovery from the PC.

## Files written

| File | Role |
|------|------|
| `engine/attempts.js` | File-backed attempt store (Node directory + browser OPFS). One active attempt per task, one per project. Second claim fails and does not append a row. |
| `engine/attempts.test.cjs` | Isolated disk tests for claims, reconstruction, and sentinel. |
| `engine/sentinel.js` | COMPLETE is a result file. Missing verdict closes the attempt. No second attempt while the first is active. |
| `app.js` | English interface copy and Running integration with the file engine. |
| `index.html` | Four areas; attempt and Claim refused in Running; technical proof closed. |
| `server.cjs` | Static whitelist only: serve `models.js`, `models.json`, `engine/attempts.js`, `engine/sentinel.js`, `engine/claims.js`. Plan read/write path unchanged. |
| `handoff/RESULT.md` | This report. |

Untouched notebook data: `plan.json`, `plan.js`, `models.js`, `models.json`, `engine/claims.js`, `styles.css`. Example plan text stays Italian.

## English copy

Present in `app.js` / `index.html`: Where this goes, Where it stands, Decided, Still open, Nothing new, Running, Claim refused.

## Tests

Command (run twice, both exit 0, `passed=10 failed=0`):

```
node engine/attempts.test.cjs
node engine/attempts.test.cjs
```

Outcomes:

- First claim writes `attempts.json`.
- Second claim same task: `ok=false`, reason `task already assigned`, file unchanged, no extra row. Winner `attempt-1`.
- Second claim same project, different task: `ok=false`, reason `project already assigned`, no extra row.
- New engine on the same directory reconstructs the same attempt id.
- COMPLETE result file ends waiting while a simulated process is still alive.
- Missing verdict closes the attempt (`closedReason=no verdict`).
- While the first claim is active, a second claim is refused.

Screen (real Edge, isolated plan copy, not production `plan.json`): four areas; English labels; attempt visible in Running; `Claim refused:` after a second claim; `details.claim-panel` stays closed.

No real model spawn.

## plan.json hash

| | SHA256 | bytes | mtime |
|--|--------|-------|-------|
| Before | `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469` | 2455 | 2026-10-07T22:48:55.923Z |
| After | `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469` | 2455 | 2026-10-07T22:48:55.923Z |

Production plan is unchanged.

## OPEN_ISSUES

None on the requested gate. The next round (real spawn / PC discovery / unregister) stays closed.

## NEXT_ACTION

Use `node server.cjs` and http://127.0.0.1:4173. Claim from Running's technical panel (leave it closed). The attempt and refusal stay visible in Running.
