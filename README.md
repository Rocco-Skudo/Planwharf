# Planwharf zombie — quaderno e Grillbench locali

**plan.json**, accanto a index.html, è l'unico quaderno salvato e l'unica fonte autorevole. Contiene due progetti: **Biblioteca di quartiere** (R1/R2 manual, task calendario nato da R2) e **Orto condiviso** (R1 import, nessun task iniziale). Il selettore Progetto cambia il quaderno mostrato, conservando la stessa schermata con quattro aree. Nessun quaderno parallelo o salvataggio del piano in localStorage.

All'apertura e riapertura della schermata, l'applicazione ricorda l'ultima revisione vista per ciascun progetto separatamente. Se nel frattempo è nata una o più revisioni, l'area **Cosa è cambiato** mostra il salto cumulativo dall'ultima revisione vista alla corrente, aggiornando il marker per le riaperture successive senza perdere il confronto corrente. Se non ci sono novità (o al primo accesso, senza inventare revisioni viste o diff di esempio), mostra "nessuna novità".

Serve Node.js, senza dipendenze da installare. Da PowerShell:

```powershell
node "D:\benit\Desktop\Projects\Planwharf-zombie\server.cjs"
```

Apri **http://127.0.0.1:4173**. Lascia il server aperto mentre usi la pagina; Ctrl+C lo chiude. Per una porta occupata, imposta ad esempio `$env:PORT = '4174'` e usa l'indirizzo stampato. Il doppio clic su index.html non permette di scrivere plan.json: usa l'indirizzo locale.

## Le quattro aree

- **Quaderno di adesso**: piano della revisione letta, modo manual/grill/import, selettore revisioni e importazione JSON.
- **Cosa è cambiato**: differenze della revisione vista rispetto alla precedente o salto dall'ultima visita (o "nessuna novità"); storico conservato.
- **Cosa gira**: task del progetto selezionato, con revision_id visibile; puoi creare un task dalla revisione che stai leggendo.
- **Cosa aspetta l’utente**: domande aperte della revisione letta; Grillbench apre sempre le domande della revisione corrente.

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

La cartella è locale: nessuna pubblicazione, repository remoto, CLI di lavoro, provider, spawn, claim, quota o esecuzione di task. Il server serve la schermata e il file soltanto su 127.0.0.1.

## Verifica

```powershell
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-file.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-round.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-ui.cjs"
node "D:\benit\Desktop\Projects\Planwharf-zombie\verify-jump.cjs"
```

Le prove verificano schema, storico immutabile, modi, riferimenti task, secondo running rifiutato, grill chiusura/cambio direzione, diff della riapertura esplicita, import valido e invalidi senza scrittura, stato a due progetti dopo riavvio ed errori disco. Usano un file temporaneo isolato: non aggiungono revisioni a plan.json.

verify-ui.cjs simula gli eventi DOM: **non è un controllo visivo**. verify-browser.cjs tenta una verifica reale con Edge in modalità headless e un quaderno isolato; produce eventuali screenshot in validation. Un timeout di Edge significa controllo visivo **NON FATTO**, anche quando le altre prove passano.