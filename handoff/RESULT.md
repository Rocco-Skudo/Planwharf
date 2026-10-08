# Notebook for any number of projects

STATUS: COMPLETE  
VERDICT/GATE: **ACCEPT / PASS**

Work only in `D:\benit\Desktop\Projects\Planwharf-zombie`. No NPC-Orchestra-v5, no inbox, no model spawn.

## Files touched

| File | Change |
|------|--------|
| `plan.js` | `createProject({ name, direction })` appends a project with an empty `manual` R1. Existing projects and revisions are cloned, not rewritten. Project ids are derived from the name; collisions add `-2`, `-3`, … with no fixed N. Empty revision titles are valid. |
| `server.cjs` | `POST /api/projects`. Attempts live in a directory next to the plan file (`GET`/`POST /api/attempts`), not in memory or OPFS. |
| `app.js` | Add-project flow; menu lists every project; claims go to the server file; Running badge is the current project's task count. |
| `index.html` | Add project button and dialog. Four areas: For you, Running, The plan, What changed. |
| `verify-projects.cjs` | Add project, reload, old revisions stay, second claim refused, attempts survive a new server. |
| `verify-file.cjs` | Isolated attempt dir, cleaned after the run. |
| `.gitignore` | `.attempts-*/` |
| `handoff/RESULT.md` | This report. |

`plan.json` of production was not rewritten by these tests.

## Tests

```
node verify.cjs
node verify-file.cjs
node engine/attempts.test.cjs
node verify-projects.cjs
```

All exit 0.

- Adding Alpha/Beta/Gamma does not change Biblioteca or Orto revisions or the R2 `calendario` task.
- After server restart the new projects are still there.
- Second claim on the same project: HTTP 409, `project already assigned`, still one active row.
- After another server restart the same attempt id is still on disk.

Edge (isolated plan copy): add Piazza nuova, reload, it remains; second claim shows `Claim refused:`; original revisions unchanged.

## OPEN_ISSUES

None.

## NEXT_ACTION

Push this branch to `origin/main`.
