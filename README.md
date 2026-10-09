# Planwharf zombie — quaderno e Grillbench locali

**plan.json**, accanto a index.html, è l'unico quaderno salvato e l'unica fonte autorevole. Nel repository è uno **scheletro** (`First project`, vuoto): ognuno aggiunge i propri progetti. Il selettore Progetto cambia il quaderno mostrato, conservando la stessa schermata. Nessun quaderno parallelo o salvataggio del piano in localStorage.

All'apertura e riapertura della schermata, l'applicazione ricorda l'ultima revisione vista per ciascun progetto separatamente. Se nel frattempo è nata una o più revisioni, l'area **Cosa è cambiato** mostra il salto cumulativo dall'ultima revisione vista alla corrente, aggiornando il marker per le riaperture successive senza perdere il confronto corrente. Se non ci sono novità (o al primo accesso, senza inventare revisioni viste o diff di esempio), mostra "nessuna novità".

Serve Node.js, senza dipendenze da installare. È un’app locale: un processo Node tiene `plan.json` e gli attempt, e apre una finestra Chromium (`--app`: Edge, Chrome o Chromium).

**Avvio**

Windows — doppio clic su `planwharf.cmd`, oppure:

```powershell
node "D:\benit\Desktop\Projects\Planwharf-zombie\planwharf.cjs"
```

Linux e macOS — dalla cartella del repo:

```bash
node planwharf.cjs
```

Oppure `sh planwharf.sh`. Serve Node.js e un browser Chromium (Edge, Chrome o Chromium). Se il browser non c’è, il processo stampa l’URL `http://127.0.0.1:4173` da aprire a mano.

iPhone e iPad non possono ospitare Planwharf: serve un computer con Node.

Ctrl+C (o chiudere la finestra) spegne tutto. Se la porta 4173 è occupata, ne prende una libera. Il doppio clic su index.html non scrive `plan.json`.

Cartella locale: su Windows un percorso tipo `D:\benit\Desktop\Projects\RaceEngineer`; su Linux/macOS tipo `/home/tuo/Projects/RaceEngineer` o `/Users/tuo/Projects/RaceEngineer`.

**Grill me** (Matt Pocock) sta in For you su ogni progetto, anche se lo hai appena aggiunto e non ha ancora domande. Se For you è vuoto, il tasto scrive il primo giro di domande e apre il round. **Grill with the docs** fa lo stesso e aggiunge domande sui README/AGENTS/docs della cartella. L’orchestratore **propone** Grill me o Grill with the docs su un progetto nuovo o mai grigliato. **Propose grill** / **Skip grill** in Workers and plans spegne la proposta per tutti; **Skip grill** sul progetto la spegne solo lì. Non lancia modelli.

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
- **Running**: in cima il **Monitor** (ultimo sguardo, job, worker, cosa aspetta, prossimo passo, log). **Start auto task** legge la cartella git (ultimo commit, log recente, file non committati), crea il job dal piano e aspetta **Approve run**; dopo l’approvazione assegna il worker adatto. Anche in Auto, un job partito da Start auto task aspetta Approve. Sotto **Workers and plans**. **Manual** / **Auto**. I consumi sono conteggi locali dei claim. Non chiama API a pagamento.

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

L’orchestratore è il nucleo: gira nello stesso processo Node. **Start auto task** fa un inspect read-only (`git log` / `status` / `diff`) della cartella collegata, scrive un job e si ferma su **Approve run**. Dopo Approve, `pickWorker` assegna un modello del catalogo (inspect → economico, build → default, hard → flagship) e scrive il file attempt WATCHING. Non lancia Grok né API a pagamento. Un job aggiunto a mano in Auto può essere claimed senza Approve; un job da Start auto task aspetta sempre Approve (`holdApproval`).

La cartella è locale: nessuna pubblicazione, provider, spawn di modelli o discovery dal PC. La finestra e il CLI parlano agli stessi file su 127.0.0.1.

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
```

Le prove verificano schema, storico immutabile, modi, riferimenti task, secondo running rifiutato, grill chiusura/cambio direzione, diff della riapertura esplicita, import valido e invalidi senza scrittura, stato a due progetti dopo riavvio ed errori disco. Usano un file temporaneo isolato: non aggiungono revisioni a plan.json.

verify-ui.cjs simula gli eventi DOM: **non è un controllo visivo**. verify-browser.cjs tenta una verifica reale con Edge in modalità headless e un quaderno isolato; produce eventuali screenshot in validation. Un timeout di Edge significa controllo visivo **NON FATTO**, anche quando le altre prove passano.