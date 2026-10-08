# HANDOFF REPORT — PLANWHARFZOMBIE-004

- **TASK_ID**: PLANWHARFZOMBIE-004
- **WORKER**: Gemini del pool esterno NPC Orchestra (Gemini 3.8 Flash). Nessun agente nativo Codex, nessun servizio Orchestra avviato, nessun processo/spawn/provider runtime nel prodotto.
- **STATUS**: COMPLETE
- **PROJECT**: PLANWHARFZOMBIE
- **ROOT**: `D:\benit\Desktop\Projects\Planwharf-zombie`

---

## 1. MANIFEST DELLE SCRITTURE (ALLOWLIST ESCLUSIVA)

Scritture consentite ed eseguite per questo incarico:
1. `models.json` — Nuovo file JSON con array dei modelli del pool worker (Gemini, Grok, Luna), ciascuno con `id`, `label`, ed `enabled` booleano esplicito.
2. `models.js` — Nuovo modulo UMD puro per gestione elenco modelli, toggle immutabile e validazione claim.
3. `handoff/PLANWHARFZOMBIE-004.worker.md` — Questo report di handoff.

Nessun file al di fuori dell'allowlist esclusiva è stato toccato o creato. Non è stato toccato `engine/` in scrittura.

---

## 2. RILEVAZIONE HASH: PRIMA / DOPO E SEPARAZIONE WORKER

### File Preesistenti del Prototipo (Invariati)
| File | Hash SHA-256 Prima | Hash SHA-256 Dopo | Variazione |
|---|---|---|---|
| `app.js` | `E2CDE0DB5DD3B5F77A9CEF44C4BCE461D3006D0B80349C2B5B087A93CECAC19D` | `E2CDE0DB5DD3B5F77A9CEF44C4BCE461D3006D0B80349C2B5B087A93CECAC19D` | Nessuna (Invariato) |
| `index.html` | `198D36E569C1278840D65FC37295DC6CB12C56829138D24659BCF39E7E8A125A` | `198D36E569C1278840D65FC37295DC6CB12C56829138D24659BCF39E7E8A125A` | Nessuna (Invariato) |
| `plan.js` | `17448AF0250B3CFFFE821E7B756EF4C791BCC125716E30ED8FD22C5F65C7D51C` | `17448AF0250B3CFFFE821E7B756EF4C791BCC125716E30ED8FD22C5F65C7D51C` | Nessuna (Invariato) |
| `plan.json` | `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469` | `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469` | **Nessuna (Invariato)** |
| `README.md` | `84DEF410363146ECE8FB74EC77CB085E7B1AFAAEFD7BDC82EBB540C6B1953A3F` | `84DEF410363146ECE8FB74EC77CB085E7B1AFAAEFD7BDC82EBB540C6B1953A3F` | Nessuna (Invariato) |
| `server.cjs` | `526037DF49D28DF25F4579A4958E4D967023B509AC41AA26074041FEA18821F4` | `526037DF49D28DF25F4579A4958E4D967023B509AC41AA26074041FEA18821F4` | Nessuna (Invariato) |
| `styles.css` | `89E17D8BD37D711BB8AB2DB15DF618C5659A9D1C46B10581EB87C07F65728AF5` | `89E17D8BD37D711BB8AB2DB15DF618C5659A9D1C46B10581EB87C07F65728AF5` | Nessuna (Invariato) |
| `verify-browser.cjs` | `0A8F50AB5C7A1541468BAFB3014207959C2BA5BDA11E2795101C613F1E786798` | `0A8F50AB5C7A1541468BAFB3014207959C2BA5BDA11E2795101C613F1E786798` | Nessuna (Invariato) |
| `verify-file.cjs` | `0A914514E8C16E03AB214C436ED8FDEB5298C65F15DBDAF9A19C689D11063ACF` | `0A914514E8C16E03AB214C436ED8FDEB5298C65F15DBDAF9A19C689D11063ACF` | Nessuna (Invariato) |
| `verify-jump.cjs` | `57DE117BD931CDFE493C92F30FFE476A62FA013A4518E2DE50CE1F7F304D604E` | `57DE117BD931CDFE493C92F30FFE476A62FA013A4518E2DE50CE1F7F304D604E` | Nessuna (Invariato) |
| `verify-round.cjs` | `61613089EFDFA7CFA77501AF9D45D78AA5A8E9CED91583C767EF40954D821517` | `61613089EFDFA7CFA77501AF9D45D78AA5A8E9CED91583C767EF40954D821517` | Nessuna (Invariato) |
| `verify-ui.cjs` | `6D0686869B792F29D9701888191348EB9F4B707B23F8DCE774BC0DC1A5FE84FB` | `6D0686869B792F29D9701888191348EB9F4B707B23F8DCE774BC0DC1A5FE84FB` | Nessuna (Invariato) |
| `verify.cjs` | `173A1BD3DFC50A9ACC84B91992ACEBFBF74CD5E3681DDEF4A5AD8C0494DA73C9` | `173A1BD3DFC50A9ACC84B91992ACEBFBF74CD5E3681DDEF4A5AD8C0494DA73C9` | Nessuna (Invariato) |
| `fixtures/second-project.json` | `9B2BFE1C47AA474E352877E23DB7A9A7793421A7665F6495066BBA1DBEAB053F` | `9B2BFE1C47AA474E352877E23DB7A9A7793421A7665F6495066BBA1DBEAB053F` | Nessuna (Invariato) |

### File Creati dal Presente Worker (PLANWHARFZOMBIE-004)
- `models.json` — SHA-256: `93A21AD6B8448B2E86D387C17D6EA53C28B5D97FA8368CAB1CD5E5516483A4AC`
- `models.js` — SHA-256: `7F80183388D01EB6A5075ADE7EB1AA8CC5E60A038FBA489C290E494560DFB502`
- `handoff/PLANWHARFZOMBIE-004.worker.md` — Questo file.

### File Creati dal Worker Parallelo (PLANWHARFZOMBIE-003)
- `engine/claims.js` — SHA-256: `435706B5C0D6AAF164EEDC03AAE890E94231A500BB306A5D18016F11CD61DA6D`
- `engine/claim.test.cjs` — SHA-256: `BA555E85E1BE219C066049A426278AF1401060A6585815AA5F181C48E62AFC38`
- `handoff/RESULT-before-006.md` — SHA-256: `3BD5C1BEACC67A51AF5770CCFCF4A03BA3D65EA538AED2429892AAA0047BD035`

---

## 3. STATO INIZIALE DEI MODELLI (`models.json`)

Il file `models.json` definisce una configurazione dimostrativa pura (nessun login, autenticazione o discovery provider):
```json
[
  {
    "id": "gemini",
    "label": "Gemini",
    "enabled": true
  },
  {
    "id": "grok",
    "label": "Grok",
    "enabled": true
  },
  {
    "id": "luna",
    "label": "Luna",
    "enabled": false
  }
]
```
- Modelli accesi: `gemini` (true), `grok` (true).
- Modello spento: `luna` (false).
- Ogni entry possiede un valore booleano esplicito per `enabled`.

---

## 4. CONTRATTO API (`models.js`)

Modulo esportato in formato UMD:
- CommonJS: `module.exports`
- Browser: `window.PlanwharfModels` (e fallback su `root.PlanwharfModels`)

Funzioni pure esposte:
1. `getEnabledModels(models)`:
   - Restituisce un nuovo array con i soli modelli che hanno `enabled === true`.
   - Non muta l'array né gli oggetti di input.
2. `setModelEnabled(models, id, enabled)`:
   - Toggle immutabile: restituisce un nuovo array in cui il modello con `id` corrispondente ha il flag `enabled` aggiornato a `Boolean(enabled)`.
   - Non muta l'array né gli oggetti di input originari.
3. `validateWorkerClaim(models, modelId)`:
   - Restituisce `{ ok, reason }`.
   - Se la lista è vuota o tutti i modelli sono spenti: restituisce esattamente `{ ok: false, reason: 'nessun modello acceso' }`.
   - Se `modelId` non è presente nella lista: restituisce `{ ok: false, reason: 'modello non presente' }`.
   - Se il modello è presente ma ha `enabled !== true`: restituisce `{ ok: false, reason: 'modello spento' }`.
   - Se il modello è abilitato (`enabled === true`): restituisce `{ ok: true, reason: null }`.
   - Operazione pura in memoria, senza side-effect.

---

## 5. TESTS ESEGUITI

Nessun file di test è stato creato fuori dall'allowlist. I test sono stati eseguiti in memoria e inline mediante comandi Node.js.

### 5.1 Test Unitari e di Contratto Inline
Comando:
```powershell
node -e "
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// TEST 1: Parsing models.json e enabled su ogni entry
const rawJson = fs.readFileSync(path.join(__dirname, 'models.json'), 'utf8');
const models = JSON.parse(rawJson);
assert(Array.isArray(models));
assert(models.length >= 3);
for (const m of models) {
  assert(typeof m.id === 'string' && m.id.length > 0);
  assert(typeof m.label === 'string' && m.label.length > 0);
  assert(typeof m.enabled === 'boolean');
}

// TEST 2: CommonJS export
const cjs = require('./models.js');
assert.strictEqual(typeof cjs.getEnabledModels, 'function');
assert.strictEqual(typeof cjs.setModelEnabled, 'function');
assert.strictEqual(typeof cjs.validateWorkerClaim, 'function');

// TEST 3: Browser UMD (window.PlanwharfModels)
const code = fs.readFileSync(path.join(__dirname, 'models.js'), 'utf8');
const sandbox = { window: {} };
sandbox.globalThis = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
assert(sandbox.window.PlanwharfModels);
assert.strictEqual(typeof sandbox.window.PlanwharfModels.getEnabledModels, 'function');

// TEST 4: Esclusione spenti
const enabledModels = cjs.getEnabledModels(models);
assert(enabledModels.every(m => m.enabled === true));
assert(!enabledModels.some(m => m.id === 'luna'));
assert(enabledModels.some(m => m.id === 'gemini'));

// TEST 5: Toggle immutabile
const toggled = cjs.setModelEnabled(models, 'luna', true);
assert.notStrictEqual(toggled, models);
assert.strictEqual(toggled.find(m => m.id === 'luna').enabled, true);
assert.strictEqual(models.find(m => m.id === 'luna').enabled, false);

// TEST 6: Lista vuota e tutti spenti
assert.strictEqual(cjs.validateWorkerClaim([], 'gemini').reason, 'nessun modello acceso');
assert.strictEqual(cjs.validateWorkerClaim([{ id: 'a', enabled: false }], 'a').reason, 'nessun modello acceso');

// TEST 7: Modello non presente
assert.strictEqual(cjs.validateWorkerClaim(models, 'sconosciuto').reason, 'modello non presente');

// TEST 8: Modello spento non candidabile
assert.strictEqual(cjs.validateWorkerClaim(models, 'luna').reason, 'modello spento');

// TEST 9: Candidabilità modello acceso
const claimGemini = cjs.validateWorkerClaim(models, 'gemini');
assert.strictEqual(claimGemini.ok, true);
assert.strictEqual(claimGemini.reason, null);

console.log('TUTTI I TEST SUPERATI CON SUCCESSO!');
"
```
**Esito**: PASS (Tutti i 10 scenari asseriti e superati).

### 5.2 Test di Interoperabilità con Claims Engine (Worker 003)
Comando:
```powershell
node -e "
const modelsApi = require('./models.js');
const claimsApi = require('./engine/claims.js');
const fs = require('fs');

const models = JSON.parse(fs.readFileSync('./models.json', 'utf8'));
const engine = claimsApi.createClaimEngine();

const claimGemini = engine.claim({ taskId: 'task-test', projectId: 'biblioteca', modelId: 'gemini', candidates: models });
const claimLuna = engine.claim({ taskId: 'task-test-2', projectId: 'biblioteca', modelId: 'luna', candidates: models });
assert(claimGemini.ok === true && claimGemini.attempt.modelId === 'gemini');
assert(claimLuna.ok === false && claimLuna.reason === 'modello non candidabile');
"
```
**Esito**: PASS.

### 5.3 Test Suite Esistente di Progetto
Comandi:
- `node verify.cjs` — **PASS**
- `node verify-file.cjs` — **PASS**
- `node verify-round.cjs` — **PASS**
- `node verify-jump.cjs` — **PASS**
**Esito**: Nessuna regressione.

### 5.4 Verifica Immutabilità `plan.json`
- Hash prima: `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469`
- Hash dopo: `4B0CDE6DE531BDB0861415638B37F2092AE5169C3DFBC7C1C8AEEF3AAEEA1469`
- **Esito**: Invariato al 100%.

### Limiti delle verifiche
Verifiche puramente computazionali e in memoria, conformemente al mandato. Nessun browser reale né server HTTP avviato o modificato in questo task, poiché `app.js` e `index.html` sono riservati ai passi di integrazione successivi.

---

## 6. OPEN ISSUES
Nessuna issue aperta per PLANWHARFZOMBIE-004. Contratto e file implementati in totale conformità.

---

## 7. NEXT ACTION
Il direttore può procedere con i task successivi per integrare claims engine (`engine/claims.js`) e selezione modelli (`models.js`, `models.json`) nell'interfaccia utente (`index.html`, `app.js`).
