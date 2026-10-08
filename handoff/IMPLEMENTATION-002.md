# IMPLEMENTATION-002 — Planwharf-zombie: il ritorno

- **TASK_ID**: PLANWHARFZOMBIE-002
- **PROJECT**: PLANWHARFZOMBIE
- **ROLE**: Implementatore Gemini del pool esterno
- **MODELLO**: Gemini 3.8 Flash (High)
- **ROOT**: `D:\benit\Desktop\Projects\Planwharf-zombie`

---

## File toccati

1. [app.js](file:///D:/benit/Desktop/Projects/Planwharf-zombie/app.js)
   - Implementato tracciamento client-side dell'ultima revisione effettivamente vista dall'utente per ciascun progetto tramite storage locale (`planwharf_seen_<projectId>`).
   - Definizione del primo accesso senza inventare una revisione vista fittizia: mostra "nessuna novità" ed evita il diff di esempio preesistente (tra R1 e R2).
   - Gestione della riapertura della schermata con salto: se nel frattempo sono nate revisioni, confronta l'ultima vista con la corrente, supportando salti cumulativi di più revisioni (non solo le ultime due).
   - Aggiornamento del marker visto alla corrente senza perdere il confronto durante la sessione di riapertura (`projectReturnState`).
   - Caso "nessuna novità": se nulla è cambiato dall'ultima visita, mostra esplicitamente "nessuna novità" e nessun diff inventato.
   - Pieno isolamento per progetto (biblioteca e orto conservano i propri marker indipendenti).
   - Preservata la navigazione storica (selezionando una revisione passata viene mostrato il relativo diff).

2. [README.md](file:///D:/benit/Desktop/Projects/Planwharf-zombie/README.md)
   - Aggiornata la documentazione su memoria dell'ultima revisione vista per progetto, gestione del salto cumulativo, assenza di diff inventati al primo accesso e persistenza.

3. [verify-browser.cjs](file:///D:/benit/Desktop/Projects/Planwharf-zombie/verify-browser.cjs)
   - Aggiornato per verificare il comportamento reale con Microsoft Edge headless:
     - Primo accesso: visualizzazione di "nessuna novità", nessun diff di esempio ("via del Porto" non presente).
     - Creazione R3 manuale con diff.
     - Reload a parità di revisione: mostra "nessuna novità".
     - Salto di più revisioni: introduzione simulata di R4 e R5, reload di Edge, verifica del salto cumulativo `Da R3 a R5` con cambiamenti di R4 e R5.
     - Reload successivo: ritorno a "nessuna novità".
     - Isolamento del progetto "orto" e generazione screenshot in `validation/`.

4. [verify-ui.cjs](file:///D:/benit/Desktop/Projects/Planwharf-zombie/verify-ui.cjs)
   - Aggiornato il mock di `localStorage` per supportare le chiavi dei marker visti (`planwharf_seen_*`), continuando a vietare espressamente il salvataggio del quaderno/piano in `localStorage`.
   - Verificato che al primo accesso `changes-content` contenga "nessuna novità" e non il diff di esempio.

5. [verify-jump.cjs](file:///D:/benit/Desktop/Projects/Planwharf-zombie/verify-jump.cjs)
   - Nuovo test automatizzato dedicato e approfondito per i requisiti di PLANWHARFZOMBIE-002:
     - Test 1: Primo accesso su progetto a più revisioni (nessuna novità, marker aggiornato).
     - Test 2: Riapertura a revisione invariata (nessuna novità, nessun diff inventato).
     - Test 3: Salto di 1 revisione (confronto R1->R2, marker aggiornato a R2 senza perdere il diff durante la sessione).
     - Test 4: Reopen successivo dopo il salto (mostra nessuna novità).
     - Test 5: Salto cumulativo di più revisioni (R1->R4, inclusione cambiamenti intermedi R2, R3, R4, non limitato alle ultime due).
     - Test 6: Isolamento tra progetti (`biblioteca` vs `orto`).
     - Test 7: Integrità immutabile di `plan.json` di produzione.
     - Test 8: Tolleranza a marker non validi o corrotti in storage.

---

## Cambiamenti rispetto al preesistente

- **Preesistente**:
  - All'apertura della pagina su `biblioteca`, veniva sempre mostrato il diff tra R1 e R2 (`via del Porto`), anche alla prima visita assoluta dell'utente o dopo un ricaricamento senza nuove revisioni.
  - Non veniva memorizzata l'ultima revisione vista: se venivano aggiunte più revisioni, la schermata confrontava solo `index - 1` con `index` (le ultime due), perdendo eventuali salti cumulativi dall'ultima visita reale dell'utente.
  - `localStorage` era completamente bloccato/non utilizzato, anche per lo stato di visualizzazione client.

- **Nuovo**:
  - `plan.json` resta l'unico quaderno autorevole: nessun dato di quaderno o progetto risiede in `localStorage`.
  - `localStorage` memorizza esclusivamente il marker dell'ultima revisione vista per ciascun progetto (`planwharf_seen_<projectId>`).
  - Al primo accesso, non si inventa una revisione vista: viene mostrato "nessuna novità" e il marker viene inizializzato alla revisione corrente.
  - Alla riapertura con nuove revisioni nate nel frattempo: viene calcolato e mostrato il salto cumulativo dall'ultima vista alla corrente; il marker è salvato per le visite successive ma il confronto resta visibile per tutta la sessione.
  - Alla riapertura senza modifiche: viene mostrato "nessuna novità" e nessun diff inventato.
  - Layout a quattro aree intatto, nessuna modifica di layout o quinto pannello.

---

## Esito verifiche e comandi eseguiti

1. `node verify.cjs`
   - **Esito**: PASS / OK
   - **Dettaglio**: Schema valido, 2 progetti, 3 modi ammessi, task legati a revisioni esistenti, immutabilità storico.
2. `node verify-file.cjs`
   - **Esito**: PASS / OK
   - **Dettaglio**: Lettura/scrittura file, riavvio server, append immutabile, conflitti concorrenti gestiti, errori disco gestiti.
3. `node verify-round.cjs`
   - **Esito**: PASS
   - **Dettaglio**: Due progetti reali, manual immutabile, Grillbench chiude e cambia direzione, diff riapertura esplicita, import valido/invalido, persistenza.
4. `node verify-ui.cjs`
   - **Esito**: PASS
   - **Dettaglio**: Simulazione DOM completa, primo accesso "nessuna novità", nuova revisione, grill, import, reload API, nessun quaderno in localStorage.
5. `node verify-jump.cjs`
   - **Esito**: PASS
   - **Dettaglio**: 8 scenari automatizzati dedicati su salto di revisione, salti multipli, nessuna novità, primo accesso, riapertura e isolamento progetti.
6. `node verify-browser.cjs`
   - **Esito**: PASS
   - **Dettaglio**: Verifica reale con Microsoft Edge headless su porta locale: quattro aree, primo accesso nessuna novità, manual R3, salto R3->R5, reload nessuna novità, grill R6, mobile responsive, screenshot desktop e mobile catturati in `validation/`.

---

## Limiti noti

- Il tracciamento dell'ultima revisione vista è legato al client/browser locale dell'utente tramite `localStorage` (chiave con prefisso `planwharf_seen_`), in conformità con l'architettura locale senza autenticazione o backend multiutente.

---

## Istruzioni per verificare

1. Avviare il server locale:
   ```powershell
   node "D:\benit\Desktop\Projects\Planwharf-zombie\server.cjs"
   ```
2. Aprire `http://127.0.0.1:4173` con un browser pulito:
   - Notare che "Cosa è cambiato" mostra "nessuna novità" (non il diff di esempio R1->R2).
   - Ricaricare la pagina: mostra "nessuna novità dall'ultima visita".
   - Aggiungere una nuova revisione: mostra il diff della nuova revisione.
   - Ricaricare: mostra "nessuna novità".
3. Eseguire la suite di test automatizzati:
   ```powershell
   node "D:\benit\Desktop\Projects\Planwharf-zombie\verify.cjs"
   node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-file.cjs"
   node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-round.cjs"
   node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-ui.cjs"
   node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-jump.cjs"
   node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-browser.cjs"
   ```
