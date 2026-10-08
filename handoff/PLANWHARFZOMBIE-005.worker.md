# REPORT DI HANDOFF — PLANWHARFZOMBIE-005

- **TASK_ID**: `PLANWHARFZOMBIE-005`
- **WORKER**: Gemini 3.8 Flash (High) del pool esterno NPC Orchestra (slot `gemini-2`). Nessun agente nativo Codex, nessun dispatcher/CLI Orchestra avviato, nessun processo/spawn/provider runtime nel prodotto.
- **STATUS**: COMPLETE
- **PROJECT**: PLANWHARFZOMBIE
- **ROOT**: [`D:/benit/Desktop/Projects/Planwharf-zombie`](file:///D:/benit/Desktop/Projects/Planwharf-zombie)

---

## 1. GATE OBBLIGATORIO PRE-MODIFICA

Prima di qualsiasi modifica ai sorgenti della allowlist (`app.js`, `index.html`), è stata verificata con successo la conclusione terminale delle dipendenze:
1. `D:\benit\Desktop\Projects\NPC-Orchestra-v5\results\PLANWHARFZOMBIE-003.meta.json` (exit_code: 0, status: COMPLETE)
2. `D:\benit\Desktop\Projects\NPC-Orchestra-v5\results\PLANWHARFZOMBIE-003.result.txt` (STATUS: COMPLETE)
3. `handoff/PLANWHARFZOMBIE-003.worker.md` (presente, SHA256: `b5b2267d561abbe1f35ff4469d9a4c9a96921727a78fd3e504257cdb919345fa`)
4. `D:\benit\Desktop\Projects\NPC-Orchestra-v5\results\PLANWHARFZOMBIE-004.meta.json` (exit_code: 0, status: COMPLETE)
5. `D:\benit\Desktop\Projects\NPC-Orchestra-v5\results\PLANWHARFZOMBIE-004.result.txt` (STATUS: COMPLETE)
6. `handoff/PLANWHARFZOMBIE-004.worker.md` (presente, SHA256: `8ffbf24599657046467971247adabefec2745a08dee4d9f471528367d2a6faf0`)

Nessun sostituto del motore né della lista modelli è stato inventato: sono state integrate le API consegnate dai worker 003 e 004 (`window.PlanwharfClaims` / `window.PlanwharfModels`).

---

## 2. FILES_CHANGED

### Manifest esatto delle scritture (questo worker)
1. [`app.js`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/app.js) — Integrazione in memoria del claim engine (`PlanwharfClaims`) e della gestione modelli (`PlanwharfModels`), caricamento iniziale di `models.json`, rendering reattivo di attempt, ragioni di rifiuto, toggle dei modelli, ed esecuzione claim in memoria.
2. [`index.html`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/index.html) — Inclusione degli script `models.js` ed `engine/claims.js` con attributo `defer`; estensione dell'area 03 esistente ("Cosa gira") con il pannello modelli e claim locale in memoria.
3. [`handoff/PLANWHARFZOMBIE-005.worker.md`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/handoff/PLANWHARFZOMBIE-005.worker.md) — Questo report di handoff.

### Rilevazione variazioni hash (Prima / Dopo)

| Percorso | SHA-256 Prima | SHA-256 Dopo | Origine / Variazione |
|---|---|---|---|
| [`plan.json`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/plan.json) | `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469` | `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469` | **Prototipo — INVARIATO** |
| [`styles.css`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/styles.css) | `89E17D8BD37D711BB8AB2DB15DF618C5659A9D1C46B10581EB87C07F65728AF5` | `89E17D8BD37D711BB8AB2DB15DF618C5659A9D1C46B10581EB87C07F65728AF5` | Prototipo — INVARIATO |
| [`server.cjs`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/server.cjs) | `526037DF49D28DF25F4579A4958E4D967023B509AC41AA26074041FEA18821F4` | `526037DF49D28DF25F4579A4958E4D967023B509AC41AA26074041FEA18821F4` | Prototipo — INVARIATO |
| [`plan.js`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/plan.js) | `17448AF0250B3CFFFE821E7B756EF4C791BCC125716E30ED8FD22C5F65C7D51C` | `17448AF0250B3CFFFE821E7B756EF4C791BCC125716E30ED8FD22C5F65C7D51C` | Prototipo — INVARIATO |
| [`README.md`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/README.md) | `84DEF410363146ECE8FB74EC77CB085E7B1AFAAEFD7BDC82EBB540C6B1953A3F` | `84DEF410363146ECE8FB74EC77CB085E7B1AFAAEFD7BDC82EBB540C6B1953A3F` | Prototipo — INVARIATO |
| `verify*.cjs` (tutti) | *Identici* | *Identici* | Prototipo — INVARIATI |
| [`index.html`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/index.html) | `198D36E569C1278840D65FC37295DC6CB12C56829138D24659BCF39E7E8A125A` | `7DA5E6E507D4A58DC208375E5E8AAE79653467DD0ABF340A52AB11B0D7AC6C7C` | **Worker 005 (questo task)** |
| [`app.js`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/app.js) | `E2CDE0DB5DD3B5F77A9CEF44C4BCE461D3006D0B80349C2B5B087A93CECAC19D` | `D3F6C9ABFD4DEE02625F26C62F56FE1E7A859FF4C07E1314A9F89CC041D39149` | **Worker 005 (questo task)** |
| [`handoff/PLANWHARFZOMBIE-005.worker.md`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/handoff/PLANWHARFZOMBIE-005.worker.md) | *Non esistente* | *Creato ora* | **Worker 005 (questo task)** |
| `engine/claims.js` | *Non esistente prima di 003* | `435706B5C0D6AAF164EEDC03AAE890E94231A500BB306A5D18016F11CD61DA6D` | Worker parallelo 003 — non toccato |
| `engine/claim.test.cjs` | *Non esistente prima di 003* | `BA555E85E1BE219C066049A426278AF1401060A6585815AA5F181C48E62AFC38` | Worker parallelo 003 — non toccato |
| `handoff/PLANWHARFZOMBIE-003.worker.md` | *Non esistente prima di 003* | `B5B2267D561ABBE1F35FF4469D9A4C9A96921727A78FD3E504257CDB919345FA` | Worker parallelo 003 — non toccato |
| [`models.json`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/models.json) | *Non esistente prima di 004* | `93A21AD6B8448B2E86D387C17D6EA53C28B5D97FA8368CAB1CD5E5516483A4AC` | Worker parallelo 004 — non toccato |
| [`models.js`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/models.js) | *Non esistente prima di 004* | `7F80183388D01EB6A5075ADE7EB1AA8CC5E60A038FBA489C290E494560DFB502` | Worker parallelo 004 — non toccato |
| [`handoff/PLANWHARFZOMBIE-004.worker.md`](file:///D:/benit/Desktop/Projects/Planwharf-zombie/handoff/PLANWHARFZOMBIE-004.worker.md) | *Non esistente prima di 004* | `8FFBF24599657046467971247ADABEFEC2745A08DEE4D9F471528367D2A6FAF0` | Worker parallelo 004 — non toccato |

Nessuna sovrapposizione o scrittura su file di altri incarichi. Nessun commit, reset o checkout.

---

## 3. DETTAGLI DELL'IMPLEMENTAZIONE UI

1. **Esattamente quattro aree principali**:
   La dashboard (`<div class="dashboard">`) mantiene esattamente le 4 sezioni storiche:
   - `01 Quaderno di adesso` (`.card.notebook`)
   - `02 Cosa è cambiato` (`.card.changes`)
   - `03 Cosa gira` (`.card.running`)
   - `04 Cosa aspetta l’utente` (`.card.waiting`)
   Nessuna quinta card introdotta.

2. **Pannello Modelli & Claim in area 03 "Cosa gira"**:
   - **Avviso esplicito**: "Prova locale in memoria: non scrive plan.json e non avvia alcun processo o esecuzione esterna."
   - **Elenco modelli**: Visualizza sia modelli accesi che spenti (`Gemini`, `Grok`, `Luna`), con badge di stato (`acceso`/`spento`) e pulsante di toggle in memoria (`Accendi`/`Spegni`).
   - **Toggle immutabile**: Il clic chiama `PlanwharfModels.setModelEnabled(models, id, enabled)` senza mutare l'array sorgente e aggiorna la UI in tempo reale.
   - **Tutti spenti / lista vuota**: Se nessun modello è abilitato o la lista è vuota, appare esattamente la dicitura `'nessun modello acceso'`.
   - **Modelli spenti non selezionabili**: I modelli con `enabled === false` risultano disabilitati nel selettore per il claim (`disabled`), impedendone la selezione per il claim.
   - **Engine reale e Attempt attivo**: L'esecuzione del claim invoca l'istanza `PlanwharfClaims.createClaimEngine().claim({ taskId, projectId, modelId, candidates: models })`. L'attempt attivo è letto direttamente con `getActiveAttempt({ taskId, projectId })` e mostrato come card attiva con ID attempt, task, progetto e stato `active`.
   - **Motivo di rifiuto esposto**: Il secondo claim sullo stesso task mostra la ragione `'task già assegnato'`. Un claim su task diverso nello stesso progetto mostra `'progetto già assegnato'`. Tentativi non validi o con modelli spenti espongono le relative ragioni.
   - **Prova locale ripetibile**: Presenti i controlli "Esegui claim", "Prova doppio claim" (per testare immediatamente il rifiuto) e "Ripeti prova" (che re-inizializza l'istanza in memoria del motore senza toccare `plan.json`).
   - **Preservazione funzionalità storiche**: Revisioni precedenti, navigazione per progetto, storico, grillbench, import JSON e creazione task restano completamente funzionanti e inalterati.

---

## 4. TESTS

### Test in memoria dedicati (`scratch/test_screen_claims.js`)
- **Comando**:
  `node C:\Users\benit\.gemini\antigravity-cli\brain\0211c60f-0d27-4d6d-a8ef-f62b4e1043b0\scratch\test_screen_claims.js`
- **Asserzioni eseguite (11/11 PASS)**:
  1. Hash di produzione `plan.json` rilevato (`4b0cde6de531bdb0861415638b37f2092ae5169c3dfbc7c1c8aeef3aaeea1469`).
  2. Verifica delle quattro aree principali e presenza script `models.js` ed `engine/claims.js` in `index.html`.
  3. Presenza simultanea a schermo di modelli accesi e spenti (Gemini, Grok, Luna) con badge di stato.
  4. Modello spento (Luna) disabilitato nel selettore e validato non candidabile (`modello spento`).
  5. Primo claim eseguito con successo e visualizzazione dell'attempt attivo (`attempt-1`, `biblioteca`, `gemini`).
  6. Doppio claim sullo stesso task rifiutato ed esposizione della ragione `task già assegnato`.
  7. Claim su task diverso nello stesso progetto rifiutato ed esposizione della ragione `progetto già assegnato`.
  8. Progetto distinto (`orto`) consentito, con registrazione dell'attempt attivo `attempt-2`.
  9. Toggle di tutti i modelli a spenti: visualizzazione esatta dell'avviso `nessun modello acceso`.
  10. Azzeramento del motore di prova ("Ripeti prova"): reset completo in memoria senza effetti collaterali.
  11. Verifica integrità dell'hash di produzione `plan.json` dopo tutti i test: **100% IDENTICO**.

### Suite preesistenti del prototipo
- **Comando**:
  `node verify.cjs; node verify-file.cjs; node verify-round.cjs; node verify-jump.cjs; node verify-ui.cjs; node engine/claim.test.cjs`
- **Esiti**:
  - `verify.cjs`: OK
  - `verify-file.cjs`: OK
  - `verify-round.cjs`: PASS
  - `verify-jump.cjs`: PASS
  - `verify-ui.cjs`: PASS (simulazione DOM revisioni, grill, import, navigazione intatte)
  - `engine/claim.test.cjs`: RESULT passed=12 failed=0

### Limiti delle prove
Le verifiche sono state eseguite esclusivamente in memoria e tramite harness DOM mock/computazionale, senza generare screenshot o cartelle fuori allowlist (evitato `verify-browser.cjs` diretto per non scrivere file runtime in `validation/`).

---

## 5. OPEN_ISSUES

Nessuna issue aperta. I contratti dei claim e della lista modelli sono pienamente integrati nella schermata nel rispetto rigoroso dei vincoli.

---

## 6. NEXT_ACTION

L'incarico `PLANWHARFZOMBIE-005` è terminato. Il verificatore terminale `PLANWHARFZOMBIE-006` può ora validare la consegna, i report canonici in `results/` e generare il report finale `RESULT.md`.
