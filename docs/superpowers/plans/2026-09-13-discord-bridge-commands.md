# Discord Bridge Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a BotGhost Discord bot add points, add notes, and read the leaderboard/notes of top-des-tops through 4 slash commands, backed by a new GAS bridge deployed only on the test copy (never on "Site tops"/"Tops RDS" until validated).

**Écart documenté :** la session de brainstorming du 2026-09-13 a validé une V1 incluant aussi la notification sortante (l'app prévient Discord quand des points sont ajoutés depuis le site). Ce plan la laisse de côté : elle touche `apiAddBulkPlan` dans `Code.gs` (code partagé par les 2 vraies instances) et mérite son propre cycle test/validation une fois que ces 4 commandes entrantes sont éprouvées sur la copie de test — conformément au plafond "≥ 6 phases = sur-scope" du projet. Elle fera l'objet d'un plan séparé après livraison de celui-ci.

**Architecture:** A new file `DiscordBridge.gs` exposes `DiscordBridgeService`, reached through a single new branch at the top of `doGet(e)`: when `e.parameter.bgAction` is present, the request is routed to the bridge and answered as JSON (`ContentService`); otherwise `doGet` serves `Index.html` exactly as before. Every call is a plain HTTP GET (GAS Web Apps expose no custom request headers to `doGet`/`doPost`, and do not reliably follow 302 redirects on POST), authenticated by a shared secret carried as a URL parameter and checked against a Script Property. A Discord user is resolved to a top-des-tops player through a "Discord ID" column added by hand to the `Players` sheet (no UI, no password check for this path — the linked Discord account IS the identity proof, a decision made explicitly during brainstorming on 2026-09-13).

**Tech Stack:** Google Apps Script (`.gs`), Node `node --test` harness (`tests/harness.js`) that loads the real `.gs` sources into a `vm` sandbox.

## Global Constraints

- Toujours passer par `_readDataRows`/`_firstDataRow`/`_headerOffsetFromValues` pour lire une feuille — jamais `data.slice(1)` ni un index de ligne en dur (context.md §3).
- Toute écriture doit rester journalisée via `AuditService.log(author, action, entity, before, after, detail, snapshot)` (context.md §7).
- Aucun `TODO`/placeholder — tout code écrit est intégralement implémenté (context.md §8).
- `npm test` puis `npm run verify` doivent être au vert avant tout commit (context.md §8).
- Ce code est partagé avec "Site tops" et "Tops RDS" : au prochain `git push` sur `main`, `DiscordBridge.gs` sera aussi déployé sur les deux vraies instances (même dépôt, même CI). Comme aucune n'aura de Script Property `DISCORD_BRIDGE_SECRET` configurée, le bridge doit **refuser par défaut** (`checkSecret_` renvoie `false` quand la propriété est absente ou vide) — testé explicitement (Task 1).
- Toujours GET, jamais POST, pour cette intégration (redirection 302 des Web Apps GAS non fiable en écriture, en-têtes HTTP non exposés à `doGet`).
- Points ajoutés via Discord doivent respecter la même règle que le reste de l'app : entier ≥ 1 (`StorageService.appendBulkPlan` lève une erreur sinon).

---

### Task 1: Harness support + DiscordBridge.gs skeleton + doGet wiring

**Files:**
- Create: `DiscordBridge.gs`
- Modify: `Code.gs:2990-2999` (doGet)
- Modify: `tests/harness.js` (load the new file, export `DiscordBridgeService`, mock `ContentService`)
- Test: `tests/discord-bridge.test.js`

**Interfaces:**
- Produces: `DiscordBridgeService.handleRequest(e)` → `ContentService` JSON output `{ ok: boolean, message: string, ...extra }`. `DiscordBridgeService.resolvePlayerByDiscordId(discordId)` → player name (`string`) or `null`. Both are relied on by Task 2 and Task 3.
- Consumes: `ConfigService.getSheets()`, `_readDataRows`, `PropertiesService`, `ContentService` (new mock).

- [ ] **Step 1: Write the failing tests**

Create `tests/discord-bridge.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet, injectSheets } = require('./harness.js');

/** propStore lets each test control DISCORD_BRIDGE_SECRET, same pattern as tests/cache.test.js. */
function makeContext(secret) {
  const propStore = {};
  if (secret !== undefined) propStore.DISCORD_BRIDGE_SECRET = secret;
  const gas = loadGas({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in propStore ? propStore[k] : null),
        getProperties: () => Object.assign({}, propStore),
        setProperty: (k, v) => { propStore[k] = String(v); }
      })
    }
  });
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre', 'Discord ID'],
    ['Alex', '', '', '', '1', '111111111111111111'],
    ['Sam', '', '', '', '2', '']
  ]);
  const categories = makeSheet([
    ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'],
    ['Mario Kart', '', '🏎️', '#ff0000', '1']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  const notes = makeSheet([['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe']]);
  const auditLog = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  const settings = makeSheet([['Key', 'Value']]);
  injectSheets(gas, { players, categories, history, notes, auditLog, settings });
  return gas;
}

test('handleRequest denies when DISCORD_BRIDGE_SECRET is unset (default-deny)', () => {
  const gas = makeContext();
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getLeaderboard' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
});

test('handleRequest denies when the provided secret does not match', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getLeaderboard', secret: 'wrong-secret' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
});

test('handleRequest rejects an unknown bgAction with the right secret', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'doSomethingElse', secret: 'right-secret' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /inconnue/);
});

test('resolvePlayerByDiscordId finds the linked player and returns null when unlinked', () => {
  const gas = makeContext('right-secret');
  assert.strictEqual(gas.DiscordBridgeService.resolvePlayerByDiscordId('111111111111111111'), 'Alex');
  assert.strictEqual(gas.DiscordBridgeService.resolvePlayerByDiscordId('999999999999999999'), null);
  assert.strictEqual(gas.DiscordBridgeService.resolvePlayerByDiscordId(''), null);
});

test('doGet delegates to DiscordBridgeService when bgAction is present', () => {
  const gas = makeContext('right-secret');
  // getLeaderboard_ doesn't exist yet at this task's stage — an unrecognized
  // action still proves doGet routed into the bridge (JSON out, not HTML).
  const out = gas.doGet({ parameter: { bgAction: 'unknown', secret: 'right-secret' } });
  assert.strictEqual(out._mime, 'JSON');
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /inconnue/);
});

test('doGet still serves Index.html when bgAction is absent', () => {
  const gas = makeContext('right-secret');
  const out = gas.doGet({ parameter: {} });
  assert.strictEqual(out._file, 'Index');
});
```

(this supersedes the initial default-mock approach — `PropertiesService` is passed per-test through `loadGas(extraMocks)`, matching the existing convention in `tests/cache.test.js`, rather than exported globally.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/discord-bridge.test.js`
Expected: FAIL — `gas.DiscordBridgeService is undefined` (the file/service does not exist yet).

- [ ] **Step 3: Update the test harness**

In `tests/harness.js`, add a `ContentService` mock inside `gasMocks()` (after the existing `HtmlService` block, before `ScriptApp`):

```js
    ContentService: {
      createTextOutput: text => ({
        _text: text,
        _mime: null,
        setMimeType(m) { this._mime = m; return this; }
      }),
      MimeType: { JSON: 'JSON' }
    },
```

Add `'DiscordBridgeService'` to `EXPORTED_GLOBALS` (the array starting at line 243):

```js
const EXPORTED_GLOBALS = [
  'CONFIG', 'Logger', 'ConfigService', 'AuditService', 'SettingsService', 'StorageService',
  'NotesService', 'AnalyticsService', 'BaremeService', 'PhrasesService', 'SettingsSheetService',
  'AltSettingsService', 'AltStorageService', 'AutoPointsService', 'ChatService', 'AggregatesService',
  'DiscordBridgeService',
  'withLock', 'NAV_PAGES', 'doGet', 'ScriptApp', 'requireAuthor', 'runAutoPoints',
  '_byteLength', '_cachePutChunked', '_cacheGetChunked',
  '_ensureSheetHeaders', 'CANONICAL_SHEET_HEADERS', '_fetchSheetValues', '_parseDateCell', '_parseLocalDateWithNow'
];
```

Change `loadGas` (around line 268-277) to also read and concatenate `DiscordBridge.gs`:

```js
function loadGas(extraMocks) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const autoPointsCode = fs.readFileSync(path.join(__dirname, '..', 'AutoPoints.gs'), 'utf8');
  const discordBridgeCode = fs.readFileSync(path.join(__dirname, '..', 'DiscordBridge.gs'), 'utf8');
  const sandbox = Object.assign(gasMocks(), extraMocks || {});
  vm.createContext(sandbox);
  const source = code + '\n' + autoPointsCode + '\n' + discordBridgeCode;
  vm.runInContext(source + buildEpilogue(source), sandbox, { filename: 'Code.gs+AutoPoints.gs+DiscordBridge.gs' });
  return sandbox.__exports;
}
```

- [ ] **Step 4: Create `DiscordBridge.gs`**

```js
// ─── DISCORD BRIDGE (BotGhost) ──────────────────────────────────────────────
// Pont HTTP GET entre les commandes Discord (BotGhost, bloc "Send an API
// Request") et l'app. doGet(e) délègue ici quand e.parameter.bgAction est
// présent. Toujours en GET : les Web Apps GAS ne suivent pas fiablement la
// redirection 302 en écriture (POST), et n'exposent de toute façon aucun
// en-tête HTTP personnalisé à doGet/doPost — le secret voyage donc en
// paramètre d'URL, jamais en header.
//
// Identité : un joueur lié à un compte Discord (colonne "Discord ID" dans
// Players, remplie à la main dans le Sheet, jamais ajoutée à
// CANONICAL_SHEET_HEADERS pour ne rien changer au parsing Players existant)
// est authentifié par cet ID seul, sans mot de passe — décision prise en
// session de brainstorming (2026-09-13) : le compte Discord lié est déjà la
// preuve d'identité, requireAuthor()/le mot de passe joueur ne s'appliquent
// pas à ce canal.
const DiscordBridgeService = {

  json_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  },

  ok_(message, extra) {
    return this.json_(Object.assign({ ok: true, message }, extra || {}));
  },

  err_(message) {
    return this.json_({ ok: false, message });
  },

  _discordIdColumnIndex(headerRow) {
    for (let i = 0; i < headerRow.length; i++) {
      if (String(headerRow[i]).trim().toLowerCase() === 'discord id') return i;
    }
    return -1;
  },

  /** Résout un discordId vers un nom de joueur exact, ou null si non lié / colonne absente. */
  resolvePlayerByDiscordId(discordId) {
    const id = String(discordId || '').trim();
    if (!id) return null;
    const sheet = ConfigService.getSheets().players;
    if (!sheet) return null;
    const width = sheet.getLastColumn();
    const headerRow = sheet.getRange(1, 1, 1, width).getValues()[0];
    const colIdx = this._discordIdColumnIndex(headerRow);
    if (colIdx === -1) return null;
    const { values } = _readDataRows('players', sheet, width);
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row[colIdx] && String(row[colIdx]).trim() === id) {
        return row[0] ? String(row[0]).trim() : null;
      }
    }
    return null;
  },

  checkSecret_(e) {
    const expected = PropertiesService.getScriptProperties().getProperty('DISCORD_BRIDGE_SECRET');
    const provided = (e && e.parameter) ? e.parameter.secret : '';
    return !!(expected && provided && expected === provided);
  },

  handleRequest(e) {
    try {
      if (!this.checkSecret_(e)) return this.err_("Non autorisé.");
      const action = e.parameter.bgAction;
      switch (action) {
        case 'addPoints':      return this.addPoints_(e);
        case 'getLeaderboard': return this.getLeaderboard_(e);
        case 'addNote':        return this.addNote_(e);
        case 'getNotes':       return this.getNotes_(e);
        default:               return this.err_("Action inconnue : " + action);
      }
    } catch (err) {
      return this.err_(err && err.message ? err.message : String(err));
    }
  },
};
```

(trailing comma after `handleRequest` kept on purpose — Task 2 and Task 3 each insert new methods right before the closing `};`, and a trailing comma is valid JavaScript on the V8 runtime this project targets.)

- [ ] **Step 5: Wire `doGet` in `Code.gs`**

Replace (`Code.gs:2990-2999`):

```js
function doGet(e) {
  // createHtmlOutputFromFile (pas de rendu templaté) : Index.html ne contient
  // plus aucun scriptlet <?  ?> à évaluer, et le moteur de template de GAS
  // corrompt silencieusement les très gros fichiers HTML qui en contiennent
  // (constaté en v3.5.0 : ~28 000 caractères tronqués côté serveur, provoquant
  // une SyntaxError au chargement et une interface totalement vide).
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Tops des Tops')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
```

with:

```js
function doGet(e) {
  if (e && e.parameter && e.parameter.bgAction) {
    return DiscordBridgeService.handleRequest(e);
  }
  // createHtmlOutputFromFile (pas de rendu templaté) : Index.html ne contient
  // plus aucun scriptlet <?  ?> à évaluer, et le moteur de template de GAS
  // corrompt silencieusement les très gros fichiers HTML qui en contiennent
  // (constaté en v3.5.0 : ~28 000 caractères tronqués côté serveur, provoquant
  // une SyntaxError au chargement et une interface totalement vide).
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Tops des Tops')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
```

(the closing `}` and the rest of the function body already present stay untouched).

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/discord-bridge.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all existing tests still pass (no regression from the `doGet` change or the harness update).

- [ ] **Step 8: Commit**

```bash
git add DiscordBridge.gs Code.gs tests/harness.js tests/discord-bridge.test.js
git commit -m "feat(discord): add BotGhost bridge skeleton with secret check and Discord ID resolution"
```

---

### Task 2: Write actions — addPoints and addNote

**Files:**
- Modify: `DiscordBridge.gs`
- Test: `tests/discord-bridge.test.js`

**Interfaces:**
- Consumes: `DiscordBridgeService.resolvePlayerByDiscordId` (Task 1), `SettingsService.getEntities('Categories')`, `StorageService.appendBulkPlan(plan)`, `NotesService.addNote(player, text, dateStr, author)`, `AuditService.log(...)`, `withLock(fn)`, `_dayKey(date)`.
- Produces: `DiscordBridgeService.addPoints_(e)`, `DiscordBridgeService.addNote_(e)` — both reachable through `handleRequest`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/discord-bridge.test.js`:

```js
test('addPoints writes a history row for the linked player and audits it', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '111111111111111111',
    top: 'Mario Kart', points: '5', desc: 'via test'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  const historyRows = gas.ConfigService.getSheets().history._grid;
  assert.strictEqual(historyRows.length, 2);
  assert.strictEqual(historyRows[1][1], 'Alex');
  assert.strictEqual(historyRows[1][2], 'Mario Kart');
  assert.strictEqual(historyRows[1][3], 5);
  const auditRows = gas.ConfigService.getSheets().auditLog._grid;
  assert.strictEqual(auditRows.length, 2);
  assert.strictEqual(auditRows[1][1], 'Alex');
});

test('addPoints refuses an unlinked Discord account', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '000000000000000000',
    top: 'Mario Kart', points: '5'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /lié/);
});

test('addPoints refuses an unknown top', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '111111111111111111',
    top: 'Top Inexistant', points: '5'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /inconnu/);
});

test('addPoints refuses zero or negative points', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '111111111111111111',
    top: 'Mario Kart', points: '0'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /≥ 1/);
});

test('addNote writes a note for the linked player', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addNote', secret: 'right-secret', discordId: '111111111111111111', text: 'ping via discord'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  const noteRows = gas.ConfigService.getSheets().notes._grid;
  assert.strictEqual(noteRows.length, 2);
  assert.strictEqual(noteRows[1][1], 'Alex');
  assert.strictEqual(noteRows[1][2], 'ping via discord');
});

test('addNote refuses an unlinked Discord account', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addNote', secret: 'right-secret', discordId: '000000000000000000', text: 'ping'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/discord-bridge.test.js`
Expected: FAIL — `TypeError: this.addPoints_ is not a function` (and same for `addNote_`).

- [ ] **Step 3: Implement `addPoints_` and `addNote_`**

Add inside the `DiscordBridgeService` object literal in `DiscordBridge.gs`, right after `handleRequest(e) { ... },`:

```js
  addPoints_(e) {
    const discordId = e.parameter.discordId;
    const top = e.parameter.top;
    const pointsRaw = e.parameter.points;
    const desc = e.parameter.desc || '';

    const player = this.resolvePlayerByDiscordId(discordId);
    if (!player) return this.err_("Ton compte Discord n'est lié à aucun joueur. Demande à l'admin d'ajouter ton ID Discord dans la colonne 'Discord ID' de la feuille Players.");

    if (!top || !top.trim()) return this.err_("Le paramètre 'top' est obligatoire.");
    const categories = SettingsService.getEntities('Categories').map(c => c.name);
    const matchedTop = categories.find(c => c.toLowerCase() === top.trim().toLowerCase());
    if (!matchedTop) return this.err_("Top inconnu : '" + top + "'. Vérifie l'orthographe exacte.");

    const points = parseInt(pointsRaw, 10);
    if (isNaN(points) || points < 1) return this.err_("Les points doivent être un entier ≥ 1.");

    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const startRow = history.getLastRow() + 1;
      const todayStr = _dayKey(new Date());
      StorageService.appendBulkPlan([{
        date: todayStr,
        entries: [{ player, category: matchedTop, points, times: 1, description: desc }]
      }]);
      const endRow = history.getLastRow();
      const addedRows = endRow >= startRow ? history.getRange(startRow, 1, endRow - startRow + 1, 7).getValues() : [];
      AuditService.log(player, 'Saisie de points', 'History', '', '1 entrée',
        player + ' +' + points + ' pts · ' + matchedTop + (desc ? ' — "' + desc.slice(0, 40) + '"' : '') + ' (via Discord)',
        addedRows.length ? { sheet: 'history', op: 'insertMany', rows: addedRows } : null);
      return this.ok_('✅ ' + player + ' +' + points + ' pts sur ' + matchedTop + (desc ? ' (' + desc + ')' : ''));
    });
  },

  addNote_(e) {
    const discordId = e.parameter.discordId;
    const text = e.parameter.text;
    const player = this.resolvePlayerByDiscordId(discordId);
    if (!player) return this.err_("Ton compte Discord n'est lié à aucun joueur. Demande à l'admin d'ajouter ton ID Discord dans la colonne 'Discord ID' de la feuille Players.");
    if (!text || !text.trim()) return this.err_("Le paramètre 'texte' est obligatoire.");

    return withLock(() => {
      const note = NotesService.addNote(player, text, '', player);
      const sheet = ConfigService.getSheets().notes;
      AuditService.log(player, 'Note ajoutée', 'Note: ' + player, '', player + ' : ' + text.trim(),
        'note:' + note.noteId + ' (via Discord)',
        { sheet: 'notes', op: 'insert', rowIndex: note.rowIndex, after: sheet.getRange(note.rowIndex, 1, 1, 7).getValues()[0] });
      return this.ok_('✅ Note ajoutée pour ' + player);
    });
  },
```

Update `handleRequest`'s `switch` cases for `addPoints`/`addNote` to call `this.addPoints_(e)` / `this.addNote_(e)` if not already wired that way in Task 1 (they already are — no change needed here).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/discord-bridge.test.js`
Expected: PASS — all tests green, including Task 1's.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add DiscordBridge.gs tests/discord-bridge.test.js
git commit -m "feat(discord): implement addPoints and addNote bridge actions"
```

---

### Task 3: Read actions — getLeaderboard and getNotes

**Files:**
- Modify: `DiscordBridge.gs`
- Test: `tests/discord-bridge.test.js`

**Interfaces:**
- Consumes: `apiGetPlayerTotals(players, startDate, endDate)` (existing global function), `NotesService.getAllNotes()`.
- Produces: `DiscordBridgeService.getLeaderboard_(e)`, `DiscordBridgeService.getNotes_(e)` — reachable through `handleRequest`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/discord-bridge.test.js`:

```js
test('getLeaderboard returns a ranked, formatted list of all players', () => {
  const gas = makeContext('right-secret');
  gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '111111111111111111', top: 'Mario Kart', points: '10'
  } });
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getLeaderboard', secret: 'right-secret' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  assert.match(body.message, /Alex/);
  assert.match(body.message, /10 pts/);
});

test("getNotes lists a player's notes, most recent first", () => {
  const gas = makeContext('right-secret');
  gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addNote', secret: 'right-secret', discordId: '111111111111111111', text: 'premiere note'
  } });
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getNotes', secret: 'right-secret', player: 'Alex' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  assert.match(body.message, /premiere note/);
});

test('getNotes reports no notes for a player with none', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getNotes', secret: 'right-secret', player: 'Sam' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  assert.match(body.message, /Aucune note/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/discord-bridge.test.js`
Expected: FAIL — `TypeError: this.getLeaderboard_ is not a function` (and same for `getNotes_`).

- [ ] **Step 3: Implement `getLeaderboard_` and `getNotes_`**

Add inside the `DiscordBridgeService` object literal, after `addNote_(e) { ... },`:

```js
  getLeaderboard_(e) {
    const totals = apiGetPlayerTotals(null, null, null);
    if (!totals.success) return this.err_(totals.error || "Impossible de lire le classement.");
    const labels = totals.chartData.labels || [];
    const data = (totals.chartData.datasets[0] || {}).data || [];
    const ranking = labels.map((name, i) => ({ name, points: data[i] || 0 }))
      .sort((a, b) => b.points - a.points);
    if (!ranking.length) return this.ok_("Aucun joueur enregistré pour l'instant.");
    const medals = ['🥇', '🥈', '🥉'];
    const lines = ranking.map((r, i) => (medals[i] || (i + 1) + '.') + ' ' + r.name + ' — ' + r.points + ' pts');
    return this.ok_(lines.join('\n'));
  },

  getNotes_(e) {
    const playerParam = e.parameter.player;
    if (!playerParam || !playerParam.trim()) return this.err_("Le paramètre 'joueur' est obligatoire.");
    const all = NotesService.getAllNotes().notes;
    const matches = all.filter(n => n.player.toLowerCase() === playerParam.trim().toLowerCase());
    if (!matches.length) return this.ok_("Aucune note pour " + playerParam + ".");
    const lines = matches.slice(0, 10).map(n => {
      const d = n.timestamp ? new Date(n.timestamp) : null;
      const dateLabel = d ? _pad2(d.getDate()) + '/' + _pad2(d.getMonth() + 1) + '/' + d.getFullYear() : '?';
      return dateLabel + ' — ' + n.text;
    });
    return this.ok_(lines.join('\n'));
  }
```

(this closes the object literal — make sure the preceding method, `addNote_`, keeps its trailing comma and this is the last entry, or adjust commas if Task 2 already added a trailing one).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/discord-bridge.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full suite and verify**

Run: `npm run verify`
Expected: 100% pass, no regression.

- [ ] **Step 6: Commit**

```bash
git add DiscordBridge.gs tests/discord-bridge.test.js
git commit -m "feat(discord): implement getLeaderboard and getNotes bridge actions"
```

---

### Task 4: Deploy to the test copy

**Files:** none (operational task — Script Properties, Google Sheet, local `.clasp.json`, `.gitignore`).

This task is manual/operational, not TDD — it wires the already-tested code (Tasks 1-3) to the throwaway test project (scriptId `1fiBPQDpb9KGmdjtHzamK9JNmqypsgpXgzQpVztDp3IDYH4Cd_WAgqsdd`, sheet `1IpnM_k7sicaktxtvwaYMiMnFbnJz6nhsELmagF1WS78`), reusing one fixed `/exec` URL forever (no short.io, no immutable redeploy dance — explicitly requested).

- [ ] **Step 1: Seed the test Google Sheet by hand**

Open the test Sheet (`1IpnM_k7sicaktxtvwaYMiMnFbnJz6nhsELmagF1WS78`):
- `Players` tab: header row `Name | Avatar URL | Hex color | Password | Ordre | Discord ID`, then a couple of fake rows (e.g. `TestPlayer1 | | | | 1 | <ton propre Discord ID pour tester>`).
- `Categories` tab: header row `Name | Description | Emoji | Hex color | Ordre`, then a couple of fake Tops (e.g. `Mario Kart | | 🏎️ | #ff0000 | 1`).
- `History` tab: header row only (`Date | Player | Category | Points | Description | GroupId | Saiseur`) — stays empty, the app fills it.

- [ ] **Step 2: Set Script Properties on the test Apps Script project**

In [script.google.com](https://script.google.com), open the project with id `1fiBPQDpb9KGmdjtHzamK9JNmqypsgpXgzQpVztDp3IDYH4Cd_WAgqsdd` → **Paramètres du projet** (icône engrenage) → **Propriétés du script** → **Ajouter une propriété**, twice:

| Propriété | Valeur |
|---|---|
| `SPREADSHEET_ID` | `1IpnM_k7sicaktxtvwaYMiMnFbnJz6nhsELmagF1WS78` |
| `DISCORD_BRIDGE_SECRET` | `7a791f74704bd965e36907975bf3377fad8408be` |

- [ ] **Step 3: Point local clasp at the test project and stop tracking `.clasp.json`**

`.clasp.json` currently holds an untouched placeholder (`REPLACE_WITH_YOUR_SCRIPT_ID`) and is committed to the repo. Since it's about to hold a real, machine-specific script id for manual pushes, stop tracking it (per context.md's gitignore rule for machine-specific local config):

```bash
git rm --cached .clasp.json
```

Add to `.gitignore` (append a new line):

```
.clasp.json
```

Edit the local `.clasp.json` (not committed anymore) to:

```json
{
  "scriptId": "1fiBPQDpb9KGmdjtHzamK9JNmqypsgpXgzQpVztDp3IDYH4Cd_WAgqsdd",
  "rootDir": "."
}
```

Commit the `.gitignore` change and the removal:

```bash
git add .gitignore
git commit -m "chore: stop tracking machine-specific .clasp.json"
```

- [ ] **Step 4: Push and create one fixed deployment**

```bash
clasp login
```

(only if `~/.clasprc.json` isn't already present/valid — skip otherwise, same account as the two production copies).

```bash
clasp push
clasp deploy --description "Test - Discord bridge"
```

Expected: `clasp push` lists `Code.gs`, `AutoPoints.gs`, `DiscordBridge.gs`, `Index.html`, `appsscript.json` pushed; `clasp deploy` prints a deployment id (e.g. `AKfycb...`) and a `/exec` URL — this URL is now fixed.

- [ ] **Step 5: Redeploy in place after any future change (same URL, no new link)**

Note the deployment id printed in Step 4 (`clasp deployments` lists it again if needed). For every subsequent change to this test copy:

```bash
clasp push
clasp deploy -i <deploymentId> --description "Test - Discord bridge (update)"
```

This updates the existing deployment instead of creating a new one — the `/exec` URL never changes. (This in-place pattern is intentionally reserved for this throwaway test copy — `DEPLOIEMENT.md` §10 still forbids it for "Site tops"/"Tops RDS".)

- [ ] **Step 6: Hand the final URL to the BotGhost bot builder**

Replace `<URL_A_VENIR>` in the 4 command definitions already given to the bot builder with the `/exec` URL from Step 4, unchanged from there on.
