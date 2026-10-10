# Planwharf zombie — quaderno e Grillbench locali

**plan.json**, accanto a index.html, è l'unico quaderno salvato e l'unica fonte autorevole. Nel repository è uno **scheletro** (`First project`, vuoto): ognuno aggiunge i propri progetti. Il selettore Progetto cambia il quaderno mostrato, conservando la stessa schermata. Nessun quaderno parallelo o salvataggio del piano in localStorage.

All'apertura e riapertura della schermata, l'applicazione ricorda l'ultima revisione vista per ciascun progetto separatamente. Se nel frattempo è nata una o più revisioni, l'area **Cosa è cambiato** mostra il salto cumulativo dall'ultima revisione vista alla corrente, aggiornando il marker per le riaperture successive senza perdere il confronto corrente. Se non ci sono novità (o al primo accesso, senza inventare revisioni viste o diff di esempio), mostra "nessuna novità".

Serve Node.js, senza dipendenze da installare. È un’app locale: un processo Node tiene `plan.json` e gli attempt, e apre una finestra Chromium (`--app`: Edge, Chrome o Chromium).

**Avvio**

Windows — doppio clic su **Planwharf.exe** (nella cartella del progetto). Serve Node.js. Se Node manca, una finestra lo dice. In alternativa doppio clic su `planwharf.cmd`, oppure:

```powershell
node "D:\benit\Desktop\Projects\Planwharf-zombie\planwharf.cjs"
```

Per ricostruire l’exe: doppio clic su `launch\build-exe.cmd` (serve .NET Framework 4).

Linux e macOS — dalla cartella del repo:

```bash
node planwharf.cjs
```

Oppure `sh planwharf.sh`. Serve Node.js e un browser Chromium (Edge, Chrome o Chromium). Se il browser non c’è, il processo stampa l’URL `http://127.0.0.1:4173` da aprire a mano.

iPhone e iPad non possono ospitare Planwharf: serve un computer con Node.

Ctrl+C (o chiudere la finestra) spegne tutto. Se la porta 4173 è occupata, ne prende una libera. Il doppio clic su index.html non scrive `plan.json`.

Cartella locale: su Windows un percorso tipo `D:\benit\Desktop\Projects\RaceEngineer`; su Linux/macOS tipo `/home/tuo/Projects/RaceEngineer` o `/Users/tuo/Projects/RaceEngineer`.

**Grill me** (Matt Pocock) sta in For you su ogni progetto, anche se lo hai appena aggiunto e non ha ancora domande. Se For you è vuoto, il tasto scrive il primo giro di domande e apre il round. **Grill with the docs** fa lo stesso e aggiunge domande sui README/AGENTS/docs della cartella. L’orchestratore **propone** Grill me o Grill with the docs solo al momento di **Auto start**, se **Grill on Auto start** è acceso (default) e il progetto non è ancora stato grigliato. **Grill off** spegne la proposta su Auto start; **Skip grill** sul progetto la salta solo lì. Non lancia modelli.

Stessi file, senza aprire la finestra:

```powershell
node "D:\benit\Desktop\Projects\Planwharf-zombie\planwharf.cjs" projects
node "D:\benit\Desktop\Projects\Planwharf-zombie\planwharf.cjs" status
```

`server.cjs` resta disponibile per le prove automatiche.

## Le quattro aree

- **All projects**: colonna a sinistra. Un clic apre quel piano. **Remove project** toglie il progetto dal quaderno (la cartella sul disco resta); deve restare almeno un progetto. **Remove job** toglie il job da Running.
- **The plan**: foglio principale (Goal, stato, decisioni, domande aperte) della revisione letta, con importazione JSON.
- **What changed**: differenze rispetto alla precedente o salto dall'ultima visita; storico conservato.
- **For you**: domande aperte di tutti i progetti; Grill me gira sul progetto aperto.
- **Now** (su Planwharf): stato del lavoro sul progetto aperto (Your turn / Working / Done / Ready / Stuck) e l’azione primaria (Answer, Skip, Start, Go, Stop, Resume). **Functions** accende o spegne Manual / Automatic, Grill on Auto start, e i modelli, e lascia scegliere il **modello orchestratore**. **Auto start** è sempre disponibile, anche con domande aperte o un job già in corso: ferma i worker, salva un checkpoint se stavano lavorando, e riparte la pipeline. **Orchestrator** apre una finestra a parte (`/orchestrator.html`, profilo `.planwharf-watch`) sullo stesso processo Node: chat a sinistra, dashboard a destra. All’avvio Planwharf confronta `mattpocock/skills` con GitHub **main** (sha); **Check skills** in Functions rifà il fetch. **Provider usage** (ChatGPT, Grok, Gemini) è l’utilizzo reale del piano, in percentuale, letto dai login locali (Codex/ChatGPT e grok CLI). L’elenco modelli è una sezione a parte: se ChatGPT è esaurito, tutti i modelli ChatGPT sono esauriti. Gemini resta unread se sul PC non c’è un login quota-leggibile.

## Orchestrator

La finestra Orchestrator (`/orchestrator.html`) è una chat con dashboard: si cambia il lead quando si vuole, si vedono stato / utilizzo residuo / processi, e l’analisi di cosa stanno facendo. Interventi (stall / processo morto / FAILED → switch al prossimo modello). **Ask** parla con l’orchestratore e dà ordini (stop, resume, approve, turn a model on or off, use X as orchestrator). I dettagli sul lavoro arrivano in tempo reale (poll ~4s). **Manual** / **Automatic** scelgono se un job aggiunto a mano aspetta Approve. Dopo **Approve run** l’orchestratore smista il job a un worker, o lo spezza su più worker se è più efficiente. Un job da Auto start aspetta sempre Approve. In pianificazione si sceglie **Worker discretion** o **Finish by** (es. 18:00): a quell’ora l’orchestratore consegna l’output o salva un checkpoint da riprendere. **Stop** interrompe i worker e salva un checkpoint; **Resume** riparte. Non chiama API a pagamento.

## Manuale, Grillbench, importazione

**Nuova revisione** parte sempre dalla revisione corrente del progetto, anche quando stai leggendo lo storico. Puoi modificare dove si va, stato dell'arte, decisioni chiuse e domande aperte. Salva aggiunge una revisione **manual**, senza modificare quelle precedenti. Il diff mostra aggiunte, rimozioni e cambiamenti. Spostare una decisione chiusa nelle domande aperte è segnalato con **Decisione riaperta esplicitamente** (confronto normalizzato per maiuscole e spazi esterni).

**Grillbench · un giro** presenta soltanto le domande aperte correnti, mai le decisioni già chiuse. Per ogni domanda scegli:

- **Lascia aperta**: mantiene la domanda; la risposta è conservata nei dati del giro.
- **Chiudi con questa decisione**: rimuove la domanda da open e aggiunge a closed la domanda con la risposta.
- **Chiudi e cambia direzione**: chiude la domanda e usa la risposta come nuova direzione, visibile nel diff. Una sola nuova direzione per giro.

Il titolo e le risposte vengono salvati in una nuova revisione **grill**. Tutte le decisioni già chiuse restano. Il giro raccoglie decisioni dell'utente: non invoca processi, provider o modelli.

**Importa revisione JSON** accetta un oggetto completo incollato nel modulo, senza copiare a mano i singoli campi:

```json
{
  "title": "Primo mese pronto",
  "direction": "Aprire la biblioteca due mattine a settimana.",
  "state": "Due volontari confermati.",
  "closed": ["Prestito gratuito."],
  "open": ["Quale giorno aggiungiamo?"]
}
```

Puoi anche incollare una revisione completa con id, mode e createdAt validi: vengono assegnati un nuovo id, la data corrente e il modo **import**. Il formato richiede i cinque campi di piano sopra; campi sconosciuti, JSON malformato e tipi errati vengono rifiutati senza scrivere nulla. L'importazione aggiunge una fotografia completa, preservando storico e task.

## Task e persistenza

**Crea task dalla revisione letta** richiede titolo e conserva la sua revision_id anche quando aggiungi altre revisioni. Al massimo un task running per progetto: un secondo tentativo mostra un rifiuto, senza creare una coda. Il task è soltanto una riga di dati; nessuna esecuzione.

Il server rilegge plan.json, serializza le modifiche e scrive un file temporaneo che sostituisce l'originale solo dopo una scrittura riuscita. Se un'altra pagina ha già salvato, ricarica prima di riprovare. Errori di lettura/scrittura non generano salvataggi in memoria dichiarati riusciti. Chiudere il browser e riavviare il server lascia intatto il quaderno.

Il file ora usa schema 2 con `projects`, un elenco di quaderni progetto (schema 1, project/revisions/tasks). La biblioteca originale e il task R2 sono conservati. Ogni task deve riferirsi a una revisione esistente del suo progetto. Il server accetta anche i vecchi quaderni singoli schema 1; l'esempio consegnato è già il file a due progetti.

Ogni progetto può avere una **cartella locale** (percorso assoluto sul PC) e un URL **GitHub** (`https://github.com/owner/repo`). Li incolli tu in Add project o Set place: Planwharf non scansiona il disco e non chiama l’API GitHub. Open folder apre Esplora file sulla cartella salvata; Open GitHub apre l’URL salvato.

Planwharf è il quaderno (stato dell’arte, lavoro, funzioni). L’**orchestratore** è la dashboard e gira nello stesso processo Node. All’avvio confronta `mattpocock/skills` con GitHub **main** (sha) e in Functions mostra current/update; **Check skills** rifà il fetch. **Auto start** resta sempre cliccabile. Fa un inspect read-only (`git log` / `status` / `diff`) della cartella collegata; se c’è un job in corso lo ferma (checkpoint se i worker erano attivi) e riparte. Se Grill on Auto start è acceso, apre un round di grilling Matt sul progetto (domande con recommended, non il vecchio template generico); poi scrive un job e aspetta **Approve run**. Nella chat e in Functions scegli il **modello orchestratore** (`POST /api/orchestrator/lead`) tra flagship e default (GPT-6 Astra, GPT-5, GPT-5.5, Grok Build, Grok 4.20, Grok 4.7). Si può cambiare in qualsiasi momento. Luna, mini, Fast e Flash restano worker. Poi la **chat** (`POST /api/orchestrator/ask`, CLI `node planwharf.cjs ask "…"`): conversazione vera (Send, Invio, storico) per domande live e ordini. Mentre il lead lavora compare **Thinking** con il tempo in corso; a fine turno resta il tempo impiegato e, se c’è, il testo di thinking. **Stop** (o Escape) interrompe la risposta in corso, riapre la casella e permette un nuovo messaggio. Con un lead (Astra, Grok 4.7, …) la chat è **solo coordinamento**: ispezione in sola lettura (permission-mode plan, niente `--always-approve`). I comandi di lavoro (implement, fix, continua, smista) diventano job per i **worker**, non una sessione in cui il lead scrive il codice. L’ispezione resta in thinking; in chat si vede solo la valutazione. Senza lead chiede di sceglierne uno. Ordini: stop, resume, approve, start, skip grill, automatic/manual, turn a model on or off, change lead. L’orchestratore spacchetta il job sui worker abilitati con quota: inspect 1, build/hard fino a 3 slice in parallelo. Dopo Approve lancia un `engine/runner.cjs` per slice. La dashboard mostra ogni modello (stato, utilizzo, processi), cosa sta facendo ogni worker (interpretazione del log), e gli interventi. Se un processo muore senza COMPLETE, FAILED, o 90s senza progresso, switch al prossimo modello. **Stop** (o un termine **Finish by** a scadenza non completa) uccide i worker e scrive un checkpoint; **Resume from checkpoint** continua. Il tasto **Orchestrator** (`POST /api/orchestrator/window`) apre `/orchestrator.html` nello stesso server. `/?watch=1` reindirizza lì. Un job aggiunto a mano in Automatic può essere claimed senza Approve; un job da Auto start aspetta sempre Approve (`holdApproval`).

La cartella è locale. La finestra e il CLI parlano agli stessi file su 127.0.0.1.

## Verifica

```powershell
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-file.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-round.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-ui.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-jump.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-projects.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-app.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\engine\orchestrator.test.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\engine\skills.test.cjs"
```

Le prove verificano schema, storico immutabile, modi, riferimenti task, secondo running rifiutato, grill chiusura/cambio direzione, diff della riapertura esplicita, import valido e invalidi senza scrittura, stato a due progetti dopo riavvio ed errori disco. Usano un file temporaneo isolato: non aggiungono revisioni a plan.json.

verify-ui.cjs simula gli eventi DOM: **non è un controllo visivo**. verify-browser.cjs tenta una verifica reale con Edge in modalità headless e un quaderno isolato; produce eventuali screenshot in validation. Un timeout di Edge significa controllo visivo **NON FATTO**, anche quando le altre prove passano.