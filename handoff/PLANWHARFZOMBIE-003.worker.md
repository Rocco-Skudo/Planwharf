# PLANWHARFZOMBIE-003 — motore di claim

TASK_ID: PLANWHARFZOMBIE-003
WORKER: grok
STATUS: COMPLETE
FILES_CHANGED:
- engine/claims.js (nuovo)
- engine/claim.test.cjs (nuovo)
- handoff/PLANWHARFZOMBIE-003.worker.md (questo report)

---

## Manifest esatto delle scritture (questo worker)

| path | bytes | SHA256 |
| --- | ---: | --- |
| engine/claims.js | 2965 | 435706B5C0D6AAF164EEDC03AAE890E94231A500BB306A5D18016F11CD61DA6D |
| engine/claim.test.cjs | 12148 | BA555E85E1BE219C066049A426278AF1401060A6585815AA5F181C48E62AFC38 |
| handoff/PLANWHARFZOMBIE-003.worker.md | questo report | hash in calce dopo il salvataggio |

Nessun altro file creato, modificato, rinominato o cancellato da questo worker.
`plan.json` di produzione non è stato mutato.
Nessun commit, reset, checkout o cleanup.

---

## API pubblica (`engine/claims.js`)

UMD: `window.PlanwharfClaims` in browser; `module.exports` in Node.

- `createClaimEngine()` → istanza isolata in memoria
- `claim({ taskId, projectId, modelId, candidates })` → `{ ok, attempt, reason }`
  - successo: `{ ok: true, attempt: { id, taskId, projectId, modelId, status: 'active' } }`
  - rifiuto: `{ ok: false, reason }` (stringa leggibile), `attempt` assente, nessuno stato creato
- `getAttempts()` → copie degli attempt
- `getActiveAttempt({ taskId, projectId })` → copia dell'attempt attivo con quella coppia, oppure `null`

`candidates` è un array di `{ id, enabled }` passato dall'esterno. Nessun import di `models.js`. Nessun IO, provider, processo o esecuzione.

Regole di unicità:
- un solo attempt attivo per `taskId` (anche con `projectId` diverso)
- un solo attempt attivo per `projectId` (anche con `taskId` diverso)
- il secondo claim è rifiutato; il primo resta invariato

Ragioni usate:
- `nessun modello acceso` (lista vuota o tutti `enabled !== true`)
- `modello non presente`
- `modello non candidabile`
- `task già assegnato`
- `progetto già assegnato`
- `dati non validi`

---

## Hash prima / dopo del prototipo esistente

Rilevati prima dell'incarico e ricontrollati dopo. File preesistenti invariati da questo worker:

| file | SHA256 prima | SHA256 dopo |
| --- | --- | --- |
| app.js | E2CDE0DB5DD3B5F77A9CEF44C4BCE461D3006D0B80349C2B5B087A93CECAC19D | identico |
| index.html | 198D36E569C1278840D65FC37295DC6CB12C56829138D24659BCF39E7E8A125A | identico |
| plan.js | 17448AF0250B3CFFFE821E7B756EF4C791BCC125716E30ED8FD22C5F65C7D51C | identico |
| plan.json | 4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469 | identico |
| README.md | 84DEF410363146ECE8FB74EC77CB085E7B1AFAAEFD7BDC82EBB540C6B1953A3F | identico |
| server.cjs | 526037DF49D28DF25F4579A4958E4D967023B509AC41AA26074041FEA18821F4 | identico |
| styles.css | 89E17D8BD37D711BB8AB2DB15DF618C5659A9D1C46B10581EB87C07F65728AF5 | identico |
| verify-browser.cjs | 0A8F50AB5C7A1541468BAFB3014207959C2BA5BDA11E2795101C613F1E786798 | identico |
| verify-file.cjs | 0A914514E8C16E03AB214C436ED8FDEB5298C65F15DBDAF9A19C689D11063ACF | identico |
| verify-jump.cjs | 57DE117BD931CDFE493C92F30FFE476A62FA013A4518E2DE50CE1F7F304D604E | identico |
| verify-round.cjs | 61613089EFDFA7CFA77501AF9D45D78AA5A8E9CED91583C767EF40954D821517 | identico |
| verify-ui.cjs | 6D0686869B792F29D9701888191348EB9F4B707B23F8DCE774BC0DC1A5FE84FB | identico |
| verify.cjs | 173A1BD3DFC50A9ACC84B91992ACEBFBF74CD5E3681DDEF4A5AD8C0494DA73C9 | identico |

Handoff preesistenti invariati:
IMPLEMENTATION-002.md, PLANWHARFZOMBIE-001.json, PLANWHARFZOMBIE-002.json, PLANWHARFZOMBIE-002-R1.json, RESULT.md.

`engine/` non esisteva all'inizio. `engine/claims.js` e `engine/claim.test.cjs` non esistevano: nessuna condizione BLOCKED.

---

## Variazioni di worker paralleli (non mie)

Comparse durante l'incarico, fuori allowlist 003, non toccate:

| path | SHA256 | nota |
| --- | --- | --- |
| models.js | 7F80183388D01EB6A5075ADE7EB1AA8CC5E60A038FBA489C290E494560DFB502 | nuovo in root (probabile PLANWHARFZOMBIE-004) |
| models.json | 93A21AD6B8448B2E86D387C17D6EA53C28B5D97FA8368CAB1CD5E5516483A4AC | nuovo in root (probabile PLANWHARFZOMBIE-004) |
| handoff/RESULT-before-006.md | 3BD5C1BEACC67A51AF5770CCFCF4A03BA3D65EA538AED2429892AAA0047BD035 | stesso hash di RESULT.md; altro incarico |

`engine/models.js` assente al momento del controllo.

---

## TESTS

Comando eseguito:

```
node engine/claim.test.cjs
```

Esito: `RESULT passed=12 failed=0`, exit 0.

Casi:
1. primo claim successo
2. doppio claim stesso task
3. task diverso nello stesso progetto
4. stesso task con altro progetto
5. progetti e task distinti consentiti
6. invarianti e contatore immutati dopo rifiuto
7. modello spento non candidabile
8. lista vuota / tutti spenti → `nessun modello acceso`
9. modello non presente rifiutato
10. copie snapshot non alterano stato interno
11. input invalidi senza corrompere stato
12. UMD `createClaimEngine` esposto dal modulo (extra di isolamento tra istanze)

Esiti numerici del doppio claim (stdout):

```
DOUBLE_CLAIM same_task first.ok=true second.ok=false attempts_before=1 attempts_after=1 first.id=attempt-1 second.attempt=null
DOUBLE_CLAIM same_project first.ok=true second.ok=false attempts_after=1
DOUBLE_CLAIM same_task_other_project first.ok=true second.ok=false attempts_after=1
```

Controlli aggiuntivi eseguiti:
- grep su `engine/` per nomi di provider e `spawn`: nessun match
- `engine/claims.js` senza `require`, `import`, `fs`, `child_process`, `process`, `spawn`
- hash `plan.json` prima = dopo = `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469`

Limiti:
- Test solo in memoria via Node; nessuna fixture scritta nel progetto.
- Non eseguiti `verify.cjs`, `verify-file.cjs`, `verify-round.cjs`, `verify-ui.cjs`, `verify-jump.cjs`, `verify-browser.cjs` (fuori incarico; file di verifica non modificati).
- Caricamento browser di `window.PlanwharfClaims` non esercitato: `index.html` e `server.cjs` sono fuori allowlist.
- Nessun wiring UI o integrazione con `models.js` (incarico parallelo 004).

---

## OPEN_ISSUES

Nessuno sul pezzo 003. L'integrazione schermata + lista modelli resta ad altri incarichi.

## NEXT_ACTION

Il direttore può far verificare 003 in modo indipendente e collegare `createClaimEngine().claim` ai candidati prodotti da `getEnabledModels` (004), senza mutare `plan.json`.
