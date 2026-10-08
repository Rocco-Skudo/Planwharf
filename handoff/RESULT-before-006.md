# PLANWHARFZOMBIE-002-R1 — verifica indipendente: il ritorno

STATUS: COMPLETE  
VERDICT/GATE: **ACCEPT / PASS**

- **TASK_ID**: PLANWHARFZOMBIE-002 (verifica PLANWHARFZOMBIE-002-R1)
- **Implementatore effettivo**: Gemini del pool esterno, slot `gemini-2` (COMPLETE, rc=0, 2026-10-08T01:10:25 → 01:23:54). Modello dichiarato dall’implementatore: **Gemini 3.8 Flash (High)**. Non è lavoro del direttore né di un subagente Codex.
- **Verificatore indipendente**: Grok del pool esterno, **Grok 4.6** (xAI). Eseguito in questa sessione. Nessun worker lanciato, nessun agente nativo Codex, nessuna modifica a NPC-Orchestra-v5/CERP/altri progetti.

## Distinzione preesistente vs worker Gemini

Lavoro **preesistente** (task 001 e prototipo, timestamp anteriori a 01:10): `index.html`, `styles.css`, `server.cjs`, `plan.js`, `plan.json`, `verify.cjs`, `verify-file.cjs`, `verify-round.cjs`, `fixtures/`, layout a quattro aree.

Modifiche del **worker Gemini (002)**:
- Applicative: `app.js` (marker `planwharf_seen_<projectId>`, `projectReturnState`, salto cumulativo, primo accesso senza diff inventato), `README.md`.
- Test: `verify-jump.cjs` (nuovo), `verify-ui.cjs` (mock localStorage dei marker), `verify-browser.cjs` (primo accesso / salto R3→R5 / reload).
- Report: `handoff/IMPLEMENTATION-002.md`, `handoff/RESULT.md` (preliminare Gemini, poi questo verdetto Grok).

File **non toccati** dal 002 e restati intatti in verifica: `plan.json` (SHA256 `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469`, mtime 2026-10-08T00:48:55, 2455 byte, invariato prima e dopo i test), `server.cjs`, `plan.js`, `styles.css`, `index.html`.

Buste conservate in `handoff/`: `PLANWHARFZOMBIE-001.json`, `PLANWHARFZOMBIE-002.json`, `PLANWHARFZOMBIE-002-R1.json`.

## Criteri di accettazione

| # | Criterio | Esito | Evidenza |
|---|----------|-------|----------|
| 1 | Chiudere/riaprire ricorda l’ultima revisione vista, per progetto | **PASS** | `app.js` chiavi `planwharf_seen_<id>`; `verify-jump` test 2/4/6; Edge reload in `verify-browser.cjs` |
| 2 | Salto vista precedente → corrente, anche saltando intermedie; marker aggiornato senza cancellare il confronto di sessione | **PASS** | `projectReturnState` tipo `jump`; `verify-jump` test 3 (R1→R2, marker a 2, confronto ancora visibile) e test 5 (R1→R4, via del Porto + decisioni R3/R4, contesto `Da R1 a R4`); Edge `Da R3 a R5` con Passo 4 e Passo 5 |
| 3 | Nessuna revisione nata → "nessuna novità", nessun diff inventato | **PASS** | Primo accesso e reload a parità di revisione; test 1/2/4; screenshot Edge: «Nessuna novità. Primo accesso…» e «Nessuna novità dall’ultima visita»; assente il diff di esempio «via del Porto» al primo accesso |
| 4 | Quattro aree; `plan.json` unico quaderno; niente quaderno parallelo in localStorage | **PASS** | `index.html` 4 `<section class="card">`; localStorage solo marker stringa; mock test vieta chiavi `plan`/`notebook`; hash `plan.json` produzione immutato |
| 5 | Test automatici reali: salto, nessuna novità, riapertura, isolamento; rieseguiti; production `plan.json` non mutato | **PASS** | Suite sotto, tutte EXIT=0; SHA256 invariato |

## Test rieseguiti dal verificatore (2026-10-08, fixture isolate)

Comandi da `D:\benit\Desktop\Projects\Planwharf-zombie`:

1. `node verify.cjs` — **PASS** (`OK: due progetti, tre modi ammessi…`)
2. `node verify-file.cjs` — **PASS** (file temporaneo isolato)
3. `node verify-round.cjs` — **PASS** (copia isolata, non scrive production)
4. `node verify-ui.cjs` — **PASS** (simulazione DOM; **non** è verifica visiva)
5. `node verify-jump.cjs` — **PASS** (8 scenari: primo accesso, nessuna novità, salto 1, salto R1→R4, isolamento biblioteca/orto, immutabilità `plan.json`, marker corrotti)
6. `node verify-browser.cjs` — **PASS** (Microsoft Edge reale, DevTools protocol, fixture `validation/browser-plan-*.json`)

`plan.json` produzione: SHA256 identico prima e dopo (`4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469`).

## Verifica visiva Edge

**ESEGUITA** (non simulazione DOM). `verify-browser.cjs` ha avviato Microsoft Edge (`msedge.exe`, profilo isolato in `validation/`), aperto localhost, esercitato primo accesso, creazione R3, salto R3→R5, reload, grill, mobile, progetto orto.

Screenshot ispezionati dal verificatore:
- `validation/desktop-example.png` — quattro aree; R2 attuale; «Nessuna novità. Primo accesso al progetto»; nessun diff di esempio.
- `validation/desktop-new-revision.png` — R5 dopo reload successivo al salto; «Nessuna novità dall’ultima visita»; storico R1–R5; quattro aree.
- `validation/mobile-new-revision.png` — stesso stato, viewport mobile, quattro aree impilate.
- `validation/report.txt` — `PASS: real Edge opens localhost; four areas; first access nessuna novità; manual R3; jump R3->R5; reload nessuna novità; grill R6; mobile layout; orto isolated.`

Il salto `Da R3 a R5` (Passo 4 chiuso / Passo 5 chiuso) è asserito sul DOM di Edge prima dello screenshot post-reload; lo screenshot cattura lo stato «nessuna novità» dopo aver consumato il salto, coerente col requisito del marker.

## File toccati

- **Implementazione Gemini (non modificata da Grok)**: `app.js`, `README.md`, `verify-jump.cjs`, `verify-ui.cjs`, `verify-browser.cjs`.
- **Report Grok (questa verifica)**: `handoff/RESULT.md`.
- **Evidenze test (output di `verify-browser.cjs` rieseguito)**: `validation/desktop-example.png`, `validation/desktop-new-revision.png`, `validation/mobile-new-revision.png`, `validation/report.txt`, profili `validation/edge-profile-*` (artefatti del test, fixture isolate).

## Problemi aperti

Nessun blocco funzionale sui criteri 1–5.

Nota non bloccante: gli screenshot Edge del salto cumulativo in sé non sono salvati (lo script fotografa dopo il reload che deve mostrare «nessuna novità»); il salto è comunque verificato sul DOM Edge nella stessa sessione.

Nota di processo: `gemini-3` ha registrato FAILED rc=999 sullo stesso TASK_ID in parallelo a `gemini-2`; l’esecuzione riuscita è `gemini-2` rc=0. Non attribuire il codice a Codex.

## NEXT_ACTION

Accettare PLANWHARFZOMBIE-002. Task chiuso dal punto di vista della verifica indipendente. Nessun redispatch, nessuna correzione da implementare.
