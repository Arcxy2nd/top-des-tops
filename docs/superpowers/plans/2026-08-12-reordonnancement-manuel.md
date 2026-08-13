# Réordonnancement manuel (Joueurs, Catégories, Barème, Phrases) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag-and-drop reorder Players, Categories, Bareme rules (per category), and Phrases (per preset+pool) — with the new order persisted in a Google Sheets "Ordre" column and reflected everywhere the app already reads `cachedPlayers`/`cachedCategories`/Bareme/Phrases.

**Architecture:** Add a numeric `Ordre` column to the `Players`, `Categories`, `Bareme`, `Phrases` sheets. The three server-side read functions (`SettingsService.getEntities`, `BaremeService.getEntries`, `PhrasesService.getAll`) sort by `Ordre` when every visible row has a valid number, and silently fall back to raw sheet-row order otherwise (never throws, never blocks the UI). Four new mutating actions persist a drag result or repair a corrupted/missing column: `apiReorderEntities`, `apiReorderBareme`, `apiReorderPhrases`, `apiRepairOrder` — all follow the codebase's existing `requireAuthor → withLock → mutate → AuditService.log → ConfigService.clearCache` shape. On the client, one new shared Pointer-Events-based drag component (mouse **and** touch, unlike the existing HTML5-DnD "Saisir un Lot" row dragging, which stays untouched) is wired into the four editable list renderers; two read-only Bareme views just stop client-side sorting by points, since the server now returns the right order.

**Tech Stack:** Google Apps Script (`Code.gs`, monolithic backend), single responsive `Index.html` (858 KB, desktop+mobile in one file — there is no separate `Mobile.html`, it was merged back in commit `08938f5`), Node's built-in `node --test` runner against a VM-sandboxed `Code.gs` (`tests/harness.js`).

## Global Constraints

- Every mutating action must call `requireAuthor(author)` then run inside `withLock(...)`, then call `AuditService.log(...)`, then `ConfigService.clearCache()` — copy the exact shape of `apiAddBaremeEntry` (`Code.gs:2033-2047`). Never skip this for a new action, per project rule (all edits go through identity + audit trail).
- Keep `Code.gs` and `Index.html` monolithic — do not split them into new files. This is a deliberate project constraint, not an oversight.
- `Index.html` is the **only** client file — desktop and mobile share it via a `body.mobile-layout` CSS/JS branch (`initLayoutModeToggle`, `Index.html:16011`). Any UI change here automatically applies to both; there is no second file to keep in sync.
- Do **not** touch `attachRowDragEvents` / `#entryContainer` (`Index.html:12369-12446`, the existing "Saisir un Lot" drag-and-drop). It is mouse-only HTML5 Drag-and-Drop by design and serves a different purpose (temporary in-memory row ordering before submit, not persisted). The new reorder feature is a separate, shared component.
- Run `npm test` (Node's built-in test runner, no Jest/Mocha) after every backend task; run `npm run verify` (adds an HTML-syntax check) before the final commit.
- Update `CHANGELOG.md` (Keep a Changelog format, French, **Humanisé**/**Technique** paired bullets) as part of the final task — non-negotiable project rule.
- Commit + push at the end (push triggers the auto-deploy) — only after the user confirms, per standing safety rule for this session.
- A reorder/repair action must **validate** that the client's proposed new order is an exact permutation of the existing rows before writing anything (protects against a stale client silently dropping or duplicating a row — this app has been burned by exactly this kind of silent data loss before).

---

## Design notes (read before starting — these resolve ambiguity the summary above didn't spell out)

1. **The "Ordre" auto-fill is in-memory only, never a write-on-read.** `getEntities`/`getEntries`/`getAll` are read functions called constantly, including from inside other actions' `withLock(...)` blocks (e.g. `apiAddBaremeEntry` calls `BaremeService.getEntries()` as very its last line, already inside its own lock). Google Apps Script's `LockService` is not documented as safely re-entrant, so a read function must never itself acquire a lock. Instead: if every visible row has a valid finite `Ordre` number, sort by it; otherwise, return rows in raw sheet order (today's behavior, unchanged) until the "Réparer l'ordre" tool button — a real, lock-guarded, mutating action — persists clean values.
2. **`Ordre` is scoped per group for Bareme and Phrases, but a single shared numeric column works anyway.** Bareme rules only need a unique-enough order *within their Top*; Phrases only need one *within their preset+pool*. Every consumer already filters by that group before using the array (`entries.filter(e => e.top === cat.name)`, `_customPhrases.filter(p => p.preset === presetName && p.pool === pool)`), and `Array.prototype.filter` preserves relative order — so a single flat, stable sort of the whole sheet by `Ordre` is sufficient; two different groups are free to reuse the same `Ordre` numbers without conflict.
3. **Every row-insert path must assign a valid `Ordre` immediately**, or a single new Player/Bareme rule/Phrase would leave one row's `Ordre` blank — which (per note 1) silently reverts the **entire list** to raw-row order until repaired. This is a visible regression on every single "Add", not an edge case, so it is handled in this plan (Tasks 1-3), not deferred.
4. **`apiRepairOrder` must preserve the current effective order, not raw row order.** Rows aren't physically moved by a reorder action — only their `Ordre` value changes. So "repair" must sort each group by *current effective order* (valid `Ordre` if present, else raw order — the exact same rule as note 1) and rewrite clean sequential integers reflecting that same order. Rewriting `Ordre` from raw sheet-row position instead would silently discard any already-valid custom order — precisely the kind of silent data loss this project's audit trail exists to prevent.
5. **Column indices (1-based, matching `sheet.getRange` conventions):** Players → column 5 (after Name/Avatar/Color/Password). Categories → column 5 (after Name/Description/Emoji/Color). Bareme → column 4 (after Top/Action/Points). Phrases → column 4 (after Preset/Pool/Phrase). Players and Categories sheets are **not** auto-created by the app (`ConfigService.getSheets()` throws if either is missing), so their header row is not written by this code — `apiRepairOrder` opportunistically writes the header label `Ordre` into row 1 col 5 if that cell is blank, as a convenience for anyone opening the raw spreadsheet, but the user does not need to do anything manually for the feature to work.
6. **Bareme's `getEntries()`/Phrases' `getAll()` currently compute `rowIndex` from the row's position in the *filtered* array**, not a value carried alongside the raw row. Sorting by `Ordre` before that computation would corrupt `rowIndex` (every `apiUpdateBaremeEntry`/`apiDeleteBaremeEntry`/`apiUpdatePhrase`/`apiDeletePhrase` call trusts this value to address the correct physical sheet row). Tasks 2 and 3 fix this by attaching the true sheet row number to each row **before** filtering/sorting, never re-deriving it from array position afterward.

---

### Task 1: Ordre for Players & Categories (`SettingsService`, `apiReorderEntities`)

**Files:**
- Modify: `Code.gs:382-421` (insert shared sort helper, update `SettingsService.getEntities`)
- Modify: `Code.gs:423-439` (`SettingsService.addEntity`)
- Modify: `Code.gs:2154` area (add `apiReorderEntities` after `apiManageEntity`, which ends at `Code.gs:2154`)
- Test: `tests/reorder.test.js` (new file)

**Interfaces:**
- Produces: `_sortByOrdreOrOriginal(items, getOrdre)` — a top-level helper. `items`: any array. `getOrdre(item)`: function returning that item's raw `Ordre` cell value. Returns `items` re-sorted ascending by numeric `Ordre` (stable) if every item has a finite `Ordre`, else returns `items` unchanged.
- Produces: `SettingsService.reorderEntities(type, orderedNames)` — `type` ∈ `'Players'|'Categories'`, `orderedNames`: array of every existing name in the sheet, in the desired new order. Throws if it isn't an exact permutation of current names.
- Produces: `apiReorderEntities(type, orderedNames, author)` — client-callable wrapper.
- Consumes: nothing from other tasks (this task is self-contained).

- [ ] **Step 1: Write the failing tests**

Create `tests/reorder.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

test('getEntities sorts Players by the Ordre column when every row has one', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
      ['Bob',   '', '', '', 2],
      ['Alice', '', '', '', 1],
      ['Carl',  '', '', '', 3]
    ])
  });
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Alice', 'Bob', 'Carl']);
});

test('getEntities falls back to raw sheet order when Ordre is missing on some rows', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
      ['Bob',   '', '', '', 2],
      ['Alice', '', '', '', ''] // no Ordre yet
    ])
  });
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Bob', 'Alice']); // unchanged, raw order
});

test('getEntities falls back to raw sheet order when the Ordre column is entirely absent', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name', 'Avatar URL', 'Hex color', 'Password'],
      ['Bob', '', '', ''],
      ['Alice', '', '', '']
    ])
  });
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Bob', 'Alice']);
});

test('addEntity assigns the next sequential Ordre value', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.addEntity('Players', 'Carl', '', '');
  const row = players._grid[3];
  assert.strictEqual(row[0], 'Carl');
  assert.strictEqual(row[4], 3);
});

test('reorderEntities persists a full permutation of names as sequential Ordre', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2],
    ['Carl',  '', '', '', 3]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.reorderEntities('Players', ['Carl', 'Alice', 'Bob']);
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Carl', 'Alice', 'Bob']);
});

test('reorderEntities rejects a list that is not an exact permutation of existing names', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  assert.throws(() => gas.SettingsService.reorderEntities('Players', ['Alice']));
  assert.throws(() => gas.SettingsService.reorderEntities('Players', ['Alice', 'Bob', 'Ghost']));
});

test('apiReorderEntities requires an author and logs to AuditLog', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, auditLog });
  gas.ConfigService.clearCache = () => {};

  const noAuthor = gas.apiReorderEntities('Players', ['Bob', 'Alice'], '');
  assert.strictEqual(noAuthor.success, false);

  const res = gas.apiReorderEntities('Players', ['Bob', 'Alice'], 'Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(auditLog._grid.length, 2); // header + 1 log row
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="Ordre|reorderEntities"`
Expected: FAIL — `_sortByOrdreOrOriginal`/`reorderEntities`/`apiReorderEntities` are not defined yet, and `addEntity` doesn't write a 5th column.

- [ ] **Step 3: Add the shared sort helper**

In `Code.gs`, insert immediately before the `// ─── SETTINGS SERVICE ──` comment (currently `Code.gs:383`):

```js
// ─── ORDRE (manual reorder) HELPER ──────────────────────────────────────────────
/**
 * Sorts `items` by a numeric Ordre value if every item has one (stable sort,
 * ties broken by original position); otherwise returns `items` unchanged. Never
 * writes anything — callers that need to persist a repaired Ordre do so
 * themselves, inside their own withLock() (see apiRepairOrder).
 */
function _sortByOrdreOrOriginal(items, getOrdre) {
  const parsed = items.map((item, i) => ({ item, i, ordre: Number(getOrdre(item)) }));
  const allValid = parsed.every(x => Number.isFinite(x.ordre));
  if (!allValid) return items;
  return parsed.sort((a, b) => (a.ordre - b.ordre) || (a.i - b.i)).map(x => x.item);
}
```

- [ ] **Step 4: Wire the helper into `SettingsService.getEntities` and assign Ordre in `addEntity`**

In `Code.gs`, replace the body of `getEntities` (`Code.gs:388-421`):

```js
  getEntities(type) {
    const cache = CacheService.getScriptCache();
    const key   = 'ent_' + type.toLowerCase() + '_v' + _settingsVersion();
    const raw   = cache.get(key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    if (!sheet) return [];
    const data  = sheet.getDataRange().getValues();
    let rows = data.slice(1).filter(r => r[0]);
    rows = _sortByOrdreOrOriginal(rows, r => r[4]);
    const result = rows.map(r => {
      if (type === 'Players') {
        // Players : [0] Name | [1] Avatar URL | [2] Hex color | [3] Password (never sent to client) | [4] Ordre
        return {
          name:  r[0].toString(),
          meta:  r[1] ? r[1].toString() : "",
          icon:  "",
          color: r[2] ? r[2].toString() : "",
          hasPassword: !!(r[3] && r[3].toString().trim())
        };
      } else {
        // Categories : [0] Name | [1] Description | [2] Emoji icon | [3] Hex color | [4] Ordre
        return {
          name:  r[0].toString(),
          meta:  r[1] ? r[1].toString() : "",
          icon:  r[2] ? r[2].toString() : "",
          color: r[3] ? r[3].toString() : ""
        };
      }
    });
    const serial = JSON.stringify(result);
    if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
    return result;
  },
```

Replace the body of `addEntity` (`Code.gs:423-439`):

```js
  addEntity(type, name, meta, icon) {
    if (!name) throw new Error("Le nom ne peut pas être vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    // A duplicate name isn't just cosmetic here: deleteEntity() removes every
    // row matching a name, so two entities sharing one would both vanish on
    // what looks like a single, unitary deletion.
    if (data.some((row, i) => i > 0 && row[0] === name)) {
      throw new Error(`${name} existe déjà.`);
    }
    const nextOrdre = data.slice(1).filter(r => r[0]).length + 1;
    if (type === 'Players') {
      sheet.appendRow([name, meta || "", "", "", nextOrdre]);
    } else {
      sheet.appendRow([name, meta || "", icon || "", "", nextOrdre]);
    }
    _bumpSettingsVersion();
  },
```

- [ ] **Step 5: Add `reorderEntities` to `SettingsService`**

In `Code.gs`, right after the closing `},` of `renameEntity` and its helper `_renameInColumn` (i.e. right before the closing `};` of the `SettingsService` object literal — locate it by searching for the line `};` that closes `const SettingsService = {`), add:

```js
  reorderEntities(type, orderedNames) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    const names = data.slice(1).filter(r => r[0]).map(r => r[0]);
    const isPermutation = orderedNames.length === names.length &&
      names.every(n => orderedNames.includes(n)) &&
      new Set(orderedNames).size === orderedNames.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux éléments existants.");
    orderedNames.forEach((name, i) => {
      const rowIdx0 = data.findIndex(r => r[0] === name);
      if (rowIdx0 === -1) return;
      sheet.getRange(rowIdx0 + 1, 5).setValue(i + 1);
    });
    _bumpSettingsVersion();
  },
```

- [ ] **Step 6: Add `apiReorderEntities`**

In `Code.gs`, right after `apiManageEntity` ends (`Code.gs:2154`, the line `}`), add:

```js

function apiReorderEntities(type, orderedNames, author) {
  try {
    requireAuthor(author);
    if (!SettingsService.VALID_TYPES.includes(type)) throw new Error("Type invalide.");
    if (!Array.isArray(orderedNames) || !orderedNames.length) throw new Error("Liste d'ordre invalide.");
    return withLock(() => {
      SettingsService.reorderEntities(type, orderedNames);
      const label = type === 'Players' ? 'Joueurs' : 'Tops';
      AuditService.log(author, 'Ordre modifié', label, '', orderedNames.join(' → '), '', null);
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="Ordre|reorderEntities"`
Expected: PASS (7 tests). Also run the full suite to catch regressions: `npm test`
Expected: all existing tests still PASS (in particular `tests/settings.test.js`, which asserts `getEntities` behavior with 4-column fixtures — those fixtures have no `Ordre` column at all, which must hit the raw-order fallback and keep passing unchanged).

- [ ] **Step 8: Commit**

```bash
git add Code.gs tests/reorder.test.js
git commit -m "feat(ordre): add manual Ordre column support for Players & Categories"
```

---

### Task 2: Ordre for Bareme (`BaremeService`, `apiReorderBareme`)

**Files:**
- Modify: `Code.gs:1877-1932` (`BaremeService`: `_getOrCreateSheet`, `getEntries`, `addEntry`)
- Modify: `Code.gs:2047` area (add `apiReorderBareme` after `apiAddBaremeEntry`)
- Test: `tests/reorder.test.js` (append)

**Interfaces:**
- Consumes: `_sortByOrdreOrOriginal` from Task 1.
- Produces: `BaremeService.reorderEntries(topName, orderedRowIndexes)` — `orderedRowIndexes`: array of sheet row numbers (the `rowIndex` field `getEntries()` already returns) covering every current entry of that Top, in the new order.
- Produces: `apiReorderBareme(topName, orderedRowIndexes, author)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reorder.test.js`:

```js
test('BaremeService.getEntries sorts by Ordre and keeps rowIndex pointing at the real sheet row', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux', 'Gagne',  5, 2],
    ['Jeux', 'Perd',  -2, 1]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  const entries = gas.BaremeService.getEntries();
  assert.deepStrictEqual(entries.map(e => e.action), ['Perd', 'Gagne']);
  assert.strictEqual(entries[0].rowIndex, 3); // "Perd" is physically on sheet row 3
  assert.strictEqual(entries[1].rowIndex, 2); // "Gagne" is physically on sheet row 2
});

test('BaremeService.addEntry assigns Ordre scoped to its own Top group', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux',  'Gagne', 5, 1],
    ['Défis', 'Réussi', 3, 1]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  gas.BaremeService.addEntry('Jeux', 'Perd', -2);
  const row = bareme._grid[3];
  assert.deepStrictEqual(row, ['Jeux', 'Perd', -2, 2]); // 2nd entry within "Jeux", not 3rd overall
});

test('BaremeService.reorderEntries only touches rows within the given Top group', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux',  'A', 1, 1],
    ['Jeux',  'B', 2, 2],
    ['Défis', 'C', 3, 1]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  gas.BaremeService.reorderEntries('Jeux', [3, 2]); // rowIndex 3 = "B", rowIndex 2 = "A" -> new order B, A
  const entries = gas.BaremeService.getEntries();
  assert.deepStrictEqual(entries.filter(e => e.top === 'Jeux').map(e => e.action), ['B', 'A']);
  assert.strictEqual(entries.find(e => e.top === 'Défis').action, 'C'); // untouched
});

test('apiReorderBareme rejects a rowIndex list that does not match the Top group', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux', 'A', 1, 1],
    ['Jeux', 'B', 2, 2]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ bareme, auditLog });
  gas.ConfigService.clearCache = () => {};
  const res = gas.apiReorderBareme('Jeux', [2], 'Alice'); // missing row 3
  assert.strictEqual(res.success, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="BaremeService|apiReorderBareme"`
Expected: FAIL (`reorderEntries`/`apiReorderBareme` undefined; `getEntries`/`addEntry` don't handle Ordre yet).

- [ ] **Step 3: Update `BaremeService`**

In `Code.gs`, replace the whole `BaremeService` object (`Code.gs:1877-1932`):

```js
const BaremeService = {
  _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.bareme) return cache.bareme;
    const sheet = cache.spreadsheet.insertSheet('Bareme');
    sheet.appendRow(['Top', 'Action', 'Points', 'Ordre']);
    ConfigService.clearCache();
    return ConfigService.getSheets().bareme;
  },

  /** Returns all entries with 1-based row indices (row 1 = header). */
  getEntries() {
    const cache = CacheService.getScriptCache();
    const key   = 'bareme_entries_v' + _baremeVersion();
    const raw   = cache.get(key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    let rows = data.slice(1)
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(x => x.r[0] !== "" && x.r[0] !== undefined);
    rows = _sortByOrdreOrOriginal(rows, x => x.r[3]);
    const result = rows.map(x => ({
      rowIndex: x.rowIndex,
      top:      x.r[0].toString(),
      action:   x.r[1] ? x.r[1].toString() : "",
      pts:      x.r[2] !== "" && x.r[2] !== undefined ? Number(x.r[2]) : 0
    }));
    const serial = JSON.stringify(result);
    if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
    return result;
  },

  addEntry(top, action, pts) {
    if (!top   || !top.trim())    throw new Error("Top manquant.");
    if (!action || !action.trim()) throw new Error("Action vide.");
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    const nextOrdre = data.slice(1).filter(r => r[0] === top.trim()).length + 1;
    sheet.appendRow([top.trim(), action.trim(), Number(pts) || 0, nextOrdre]);
    _bumpBaremeVersion();
  },

  updateEntry(rowIndex, action, pts) {
    if (!action || !action.trim()) throw new Error("Action vide.");
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    sheet.getRange(rowIndex, 2, 1, 2).setValues([[action.trim(), Number(pts) || 0]]);
    _bumpBaremeVersion();
  },

  deleteEntry(rowIndex) {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    sheet.deleteRow(rowIndex);
    _bumpBaremeVersion();
  },

  reorderEntries(topName, orderedRowIndexes) {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    const data = sheet.getDataRange().getValues();
    const groupRows = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === topName) groupRows.push(i + 1);
    }
    const wanted = orderedRowIndexes.map(Number);
    const isPermutation = wanted.length === groupRows.length &&
      groupRows.every(r => wanted.includes(r)) &&
      new Set(wanted).size === wanted.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux règles existantes de ce Top.");
    wanted.forEach((rowIndex, i) => sheet.getRange(rowIndex, 4).setValue(i + 1));
    _bumpBaremeVersion();
  }
};
```

- [ ] **Step 4: Add `apiReorderBareme`**

In `Code.gs`, right after `apiAddBaremeEntry` ends (`Code.gs:2047`, the line `}`), add:

```js

function apiReorderBareme(topName, orderedRowIndexes, author) {
  try {
    requireAuthor(author);
    if (!topName) throw new Error("Top manquant.");
    if (!Array.isArray(orderedRowIndexes) || !orderedRowIndexes.length) throw new Error("Liste d'ordre invalide.");
    return withLock(() => {
      BaremeService.reorderEntries(topName, orderedRowIndexes);
      AuditService.log(author, 'Ordre modifié', 'Barème: ' + topName, '', orderedRowIndexes.join(' → '), '', null);
      ConfigService.clearCache();
      return { success: true, entries: BaremeService.getEntries() };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS, including `tests/autopoints.test.js` and any other suite touching Bareme fixtures (their fixtures use 3-column rows without `Ordre` — confirm they still pass via the raw-order fallback).

- [ ] **Step 6: Commit**

```bash
git add Code.gs tests/reorder.test.js
git commit -m "feat(ordre): add manual Ordre column support for Bareme (per Top group)"
```

---

### Task 3: Ordre for Phrases (`PhrasesService`, `apiReorderPhrases`)

**Files:**
- Modify: `Code.gs:1936-2025` (`PhrasesService`: `_getOrCreateSheet`, `getAll`, `addPhrase`, `saveBatch`)
- Modify: `Code.gs:3672` area (add `apiReorderPhrases` after `apiGetPhrases`)
- Test: `tests/reorder.test.js` (append)

**Interfaces:**
- Consumes: `_sortByOrdreOrOriginal` from Task 1.
- Produces: `PhrasesService.reorderPhrases(preset, pool, orderedRowIndexes)`.
- Produces: `apiReorderPhrases(preset, pool, orderedRowIndexes, author)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reorder.test.js`:

```js
test('PhrasesService.getAll sorts by Ordre within preset+pool and keeps rowIndex accurate', () => {
  const gas = loadGas();
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'B', 2],
    ['Défaut', 'first', 'A', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ phrases });
  const all = gas.PhrasesService.getAll();
  assert.deepStrictEqual(all.map(p => p.text), ['A', 'B']);
  assert.strictEqual(all[0].rowIndex, 3); // "A" is physically on sheet row 3
});

test('PhrasesService.addPhrase assigns Ordre scoped to its preset+pool group', () => {
  const gas = loadGas();
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'A', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ phrases });
  gas.PhrasesService.addPhrase('Défaut', 'first', 'B');
  assert.deepStrictEqual(phrases._grid[2], ['Défaut', 'first', 'B', 2]);
});

test('PhrasesService.saveBatch assigns sequential Ordre per group across a multi-group batch', () => {
  const gas = loadGas();
  const phrases = makeSheet([['Preset', 'Pool', 'Phrase', 'Ordre']]);
  gas.ConfigService.getSheets = () => ({ phrases });
  gas.PhrasesService.saveBatch([
    { preset: 'Défaut', pool: 'first', text: 'A' },
    { preset: 'Défaut', pool: 'first', text: 'B' },
    { preset: 'Défaut', pool: 'last',  text: 'C' }
  ]);
  assert.deepStrictEqual(phrases._grid.slice(1), [
    ['Défaut', 'first', 'A', 1],
    ['Défaut', 'first', 'B', 2],
    ['Défaut', 'last',  'C', 1]
  ]);
});

test('PhrasesService.reorderPhrases only touches rows within the given preset+pool group', () => {
  const gas = loadGas();
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'A', 1],
    ['Défaut', 'first', 'B', 2],
    ['Défaut', 'last',  'C', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ phrases });
  gas.PhrasesService.reorderPhrases('Défaut', 'first', [3, 2]);
  const all = gas.PhrasesService.getAll();
  assert.deepStrictEqual(all.filter(p => p.pool === 'first').map(p => p.text), ['B', 'A']);
  assert.strictEqual(all.find(p => p.pool === 'last').text, 'C');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="PhrasesService"`
Expected: FAIL.

- [ ] **Step 3: Update `PhrasesService`**

In `Code.gs`, replace `_getOrCreateSheet`, `getAll`, `addPhrase`, `saveBatch` (`Code.gs:1943-1992`):

```js
  _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.phrases) return cache.phrases;
    const sheet = cache.spreadsheet.insertSheet('Phrases');
    sheet.appendRow(['Preset', 'Pool', 'Phrase', 'Ordre']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    ConfigService.clearCache();
    return ConfigService.getSheets().phrases;
  },

  getAll() {
    const cache = CacheService.getScriptCache();
    const key   = 'phrases_all_v' + _phrasesVersion();
    const raw   = cache.get(key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    let rows = data.slice(1)
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(x => x.r[0] !== '' && x.r[2] !== '');
    rows = _sortByOrdreOrOriginal(rows, x => x.r[3]);
    const result = rows.map(x => ({
      rowIndex: x.rowIndex,
      preset:   x.r[0].toString(),
      pool:     x.r[1].toString(),
      text:     x.r[2].toString()
    }));
    const serial = JSON.stringify(result);
    if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
    return result;
  },

  addPhrase(preset, pool, text) {
    if (!preset || !pool || !text || !text.trim()) throw new Error("Champs manquants.");
    if (!this._isValidPool(pool)) throw new Error("Pool invalide : " + pool);
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    const nextOrdre = data.slice(1).filter(r => r[0] === preset.trim() && r[1] === pool).length + 1;
    sheet.appendRow([preset.trim(), pool, text.trim(), nextOrdre]);
    _bumpPhrasesVersion();
  },

  saveBatch(entries) {
    if (!entries || !entries.length) return;
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    const groupCounts = {};
    data.slice(1).forEach(r => {
      if (r[0] === '' || r[0] === undefined) return;
      const key = r[0] + '|' + r[1];
      groupCounts[key] = (groupCounts[key] || 0) + 1;
    });
    const rows = entries.map(e => {
      if (!this._isValidPool(e.pool)) throw new Error("Pool invalide : " + e.pool);
      const key = e.preset.trim() + '|' + e.pool;
      groupCounts[key] = (groupCounts[key] || 0) + 1;
      return [e.preset.trim(), e.pool, e.text.trim(), groupCounts[key]];
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    _bumpPhrasesVersion();
  },
```

Then, still inside `PhrasesService`, add `reorderPhrases` right after `deletePreset` (currently the last method, ending at `Code.gs:2024` with `}` before the object's closing `};`):

```js
,

  reorderPhrases(preset, pool, orderedRowIndexes) {
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    const data = sheet.getDataRange().getValues();
    const groupRows = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === preset && data[i][1] === pool) groupRows.push(i + 1);
    }
    const wanted = orderedRowIndexes.map(Number);
    const isPermutation = wanted.length === groupRows.length &&
      groupRows.every(r => wanted.includes(r)) &&
      new Set(wanted).size === wanted.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux phrases existantes de ce pool.");
    wanted.forEach((rowIndex, i) => sheet.getRange(rowIndex, 4).setValue(i + 1));
    _bumpPhrasesVersion();
  }
```

(Remove the trailing comma that used to follow `deletePreset`'s closing `}` before the object's own closing `};` — there should be exactly one comma between `deletePreset(...) {...}` and this new method, and no comma after it.)

- [ ] **Step 4: Add `apiReorderPhrases`**

In `Code.gs`, right after `apiGetPhrases` ends (`Code.gs:3672`, the line `}`), add:

```js

function apiReorderPhrases(preset, pool, orderedRowIndexes, author) {
  try {
    requireAuthor(author);
    if (!preset || !pool) throw new Error("Preset ou pool manquant.");
    if (!Array.isArray(orderedRowIndexes) || !orderedRowIndexes.length) throw new Error("Liste d'ordre invalide.");
    return withLock(() => {
      PhrasesService.reorderPhrases(preset, pool, orderedRowIndexes);
      AuditService.log(author, 'Ordre modifié', 'Phrases: ' + preset + '/' + pool, '', orderedRowIndexes.join(' → '), '', null);
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add Code.gs tests/reorder.test.js
git commit -m "feat(ordre): add manual Ordre column support for Phrases (per preset+pool group)"
```

---

### Task 4: `apiRepairOrder` — the "Réparer l'ordre" backstop

**Files:**
- Modify: `Code.gs` (add `apiRepairOrder`, placed after `apiReorderPhrases` from Task 3)
- Test: `tests/reorder.test.js` (append)

**Interfaces:**
- Consumes: `_sortByOrdreOrOriginal` (Task 1).
- Produces: `apiRepairOrder(author)` → `{ success: true, players, categories, bareme, phrases }` (counts of rows normalized per sheet).

- [ ] **Step 1: Write the failing tests**

Append to `tests/reorder.test.js`:

```js
test('apiRepairOrder normalizes Players/Categories to sequential Ordre in current effective order', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Bob',   '', '', '', 2],
    ['Alice', '', '', '', 1],
    ['Carl',  '', '', '', ''] // hole -> whole list currently falls back to raw order
  ]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color']]); // no Ordre column at all
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiRepairOrder('Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.players, 3);
  // Effective order before repair (raw, since Carl had no Ordre) was Bob, Alice, Carl —
  // repair must persist exactly that order as clean 1..3, not re-sort by the old partial values.
  assert.deepStrictEqual(players._grid.slice(1).map(r => [r[0], r[4]]), [['Bob', 1], ['Alice', 2], ['Carl', 3]]);
});

test('apiRepairOrder normalizes Bareme per Top group and Phrases per preset+pool group', () => {
  const gas = loadGas();
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre']]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color', 'Ordre']]);
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux', 'A', 1, ''],
    ['Défis', 'X', 5, 1],
    ['Jeux', 'B', 2, '']
  ]);
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'Z', ''],
    ['Défaut', 'first', 'Y', '']
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, bareme, phrases, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiRepairOrder('Alice');
  assert.strictEqual(res.bareme, 3);
  assert.strictEqual(res.phrases, 2);
  assert.deepStrictEqual(bareme._grid.slice(1).map(r => [r[0], r[1], r[3]]), [
    ['Jeux', 'A', 1], ['Défis', 'X', 1], ['Jeux', 'B', 2]
  ]);
  assert.deepStrictEqual(phrases._grid.slice(1).map(r => [r[2], r[3]]), [['Z', 1], ['Y', 2]]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="apiRepairOrder"`
Expected: FAIL — `apiRepairOrder` is not defined.

- [ ] **Step 3: Implement `apiRepairOrder`**

In `Code.gs`, right after `apiReorderPhrases` (added in Task 3), add:

```js

function apiRepairOrder(author) {
  try {
    requireAuthor(author);
    return withLock(() => {
      const result = { players: 0, categories: 0, bareme: 0, phrases: 0 };

      ['Players', 'Categories'].forEach(type => {
        const sheet = ConfigService.getSheets()[type.toLowerCase()];
        const data  = sheet.getDataRange().getValues();
        let rows = data.slice(1)
          .map((r, i) => ({ r, sheetRow: i + 2 }))
          .filter(x => x.r[0]);
        rows = _sortByOrdreOrOriginal(rows, x => x.r[4]);
        rows.forEach((x, idx) => sheet.getRange(x.sheetRow, 5).setValue(idx + 1));
        if (sheet.getRange(1, 5).getValue() === '') sheet.getRange(1, 5).setValue('Ordre');
        result[type.toLowerCase()] = rows.length;
      });

      const baremeSheet = ConfigService.getSheets().bareme;
      if (baremeSheet) {
        const data = baremeSheet.getDataRange().getValues();
        const rows = data.slice(1)
          .map((r, i) => ({ r, sheetRow: i + 2 }))
          .filter(x => x.r[0] !== '' && x.r[0] !== undefined);
        const groups = {};
        rows.forEach(x => { (groups[x.r[0]] = groups[x.r[0]] || []).push(x); });
        Object.keys(groups).forEach(key => {
          const ordered = _sortByOrdreOrOriginal(groups[key], x => x.r[3]);
          ordered.forEach((x, idx) => baremeSheet.getRange(x.sheetRow, 4).setValue(idx + 1));
          result.bareme += ordered.length;
        });
      }

      const phrasesSheet = ConfigService.getSheets().phrases;
      if (phrasesSheet) {
        const data = phrasesSheet.getDataRange().getValues();
        const rows = data.slice(1)
          .map((r, i) => ({ r, sheetRow: i + 2 }))
          .filter(x => x.r[0] !== '' && x.r[2] !== '');
        const groups = {};
        rows.forEach(x => {
          const key = x.r[0] + '|' + x.r[1];
          (groups[key] = groups[key] || []).push(x);
        });
        Object.keys(groups).forEach(key => {
          const ordered = _sortByOrdreOrOriginal(groups[key], x => x.r[3]);
          ordered.forEach((x, idx) => phrasesSheet.getRange(x.sheetRow, 4).setValue(idx + 1));
          result.phrases += ordered.length;
        });
      }

      AuditService.log(author, 'Ordre réparé', 'Ordre', '',
        result.players + ' joueur(s), ' + result.categories + ' top(s), ' + result.bareme + ' règle(s), ' + result.phrases + ' phrase(s)',
        '', null);
      _bumpSettingsVersion();
      _bumpBaremeVersion();
      _bumpPhrasesVersion();
      ConfigService.clearCache();
      return Object.assign({ success: true }, result);
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/reorder.test.js
git commit -m "feat(ordre): add apiRepairOrder backstop for missing/corrupted Ordre values"
```

Backend is now complete and fully tested. Tasks 5-9 are frontend and are verified manually in the browser (no Node test harness exists for `Index.html` beyond syntax checking).

---

### Task 5: Shared drag-and-drop component (mouse + touch)

**Files:**
- Modify: `Index.html:924-930` (CSS, add reorder-handle rules alongside the existing `.row-drag-handle` block)
- Modify: `Index.html:8704-8729` (JS, add `attachReorderHandle`/`buildReorderHandle` right after `callServer`)

**Interfaces:**
- Produces: `buildReorderHandle()` → a detached `<span class="reorder-handle">⠿</span>` element, ready to insert as the first child of a row.
- Produces: `attachReorderHandle(handleEl, itemEl, container, itemSelector, onDrop, canStart)` — wires pointer-based drag on `handleEl` that moves `itemEl` among its `container.querySelectorAll(itemSelector)` siblings live during drag, and calls `onDrop()` once the pointer is released. `canStart` (optional): a `() => boolean` guard checked on pointerdown; if it returns falsy, no drag starts (used to gate on `requireIdentity()`).

- [ ] **Step 1: Add CSS**

In `Index.html`, right after the existing block (`Index.html:924-930`):

```css
.entry-row.row-drop-target { border-top: 2px solid var(--accent); }
```

add:

```css
.reorder-handle {
  cursor: grab; color: var(--text-muted); font-size: 1rem; user-select: none;
  padding: 0 6px; display: flex; align-items: center; flex-shrink: 0;
  touch-action: none;
}
.reorder-handle:active { cursor: grabbing; }
.reorder-dragging { opacity: 0.5; }
body.reorder-active { cursor: grabbing; }
```

(`touch-action: none` is required on the handle — without it, the browser intercepts the pointer for page-scroll on touch devices and the drag never starts.)

- [ ] **Step 2: Add the JS component**

In `Index.html`, right after the `callServer` function closes (`Index.html:8704-8729`), add:

```js
  // ── REORDER (glisser-déposer manuel, souris + tactile) ──────────────────
  // Composant partagé pour Joueurs, Catégories, Barème (par Top) et Phrases (par
  // pool). Distinct du drag&drop de "Saisir un Lot" (attachRowDragEvents) : celui-ci
  // unifie souris et tactile via les Pointer Events, et déplace des lignes issues
  // de listes indépendantes plutôt que des lignes d'un même tableau de saisie.
  function buildReorderHandle() {
    const h = document.createElement('span');
    h.className = 'reorder-handle';
    h.textContent = '⠿';
    h.title = 'Glisser pour réorganiser';
    return h;
  }

  function attachReorderHandle(handleEl, itemEl, container, itemSelector, onDrop, canStart) {
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const siblings = Array.from(container.querySelectorAll(itemSelector)).filter(el => el !== itemEl);
      const y = e.clientY;
      let target = null;
      for (const el of siblings) {
        const rect = el.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) { target = el; break; }
      }
      if (target) container.insertBefore(itemEl, target);
      else container.appendChild(itemEl);
    };
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      itemEl.classList.remove('reorder-dragging');
      document.body.classList.remove('reorder-active');
      try { handleEl.releasePointerCapture(e.pointerId); } catch (_) {}
      onDrop();
    };
    handleEl.addEventListener('pointerdown', (e) => {
      if (canStart && !canStart()) return;
      e.preventDefault();
      dragging = true;
      itemEl.classList.add('reorder-dragging');
      document.body.classList.add('reorder-active');
      try { handleEl.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handleEl.addEventListener('pointermove', onMove);
    handleEl.addEventListener('pointerup', finish);
    handleEl.addEventListener('pointercancel', finish);
  }
```

- [ ] **Step 3: Verify (manual — no automated test for this step alone)**

Run: `npm run check:html` (HTML/script-syntax check only, no behavior yet to exercise since nothing calls these functions until Task 6-8)
Expected: passes (no syntax errors introduced).

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "feat(ordre): add shared pointer-based reorder drag component"
```

---

### Task 6: Wire reorder into Players & Categories lists

**Files:**
- Modify: `Index.html:9766-9876` (`renderEntityList`)

**Interfaces:**
- Consumes: `buildReorderHandle`, `attachReorderHandle` (Task 5); `apiReorderEntities` (Task 1).

- [ ] **Step 1: Edit `renderEntityList`**

In `Index.html`, inside `renderEntityList` (`Index.html:9766-9876`), change the `items.forEach(item => { ... })` block:

Replace:
```js
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'entity-item';
      const left = document.createElement('div');
```
with:
```js
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'entity-item';
      li.dataset.name = item.name;
      li.appendChild(buildReorderHandle());
      const left = document.createElement('div');
```

Replace the end of the function (from `btns.appendChild(editBtn); btns.appendChild(delBtn);` to the closing `}` of the `forEach`):
```js
      btns.appendChild(editBtn); btns.appendChild(delBtn);
      li.appendChild(left); li.appendChild(btns);
      container.appendChild(li);
    });
  }
```
with:
```js
      btns.appendChild(editBtn); btns.appendChild(delBtn);
      li.appendChild(left); li.appendChild(btns);
      container.appendChild(li);
      attachReorderHandle(li.querySelector('.reorder-handle'), li, container, '.entity-item', () => {
        const orderedNames = Array.from(container.querySelectorAll('.entity-item')).map(el => el.dataset.name);
        callServer('apiReorderEntities', [type, orderedNames, _whoAmI || ''], () => {
          loadEntities(); applyFilters();
        }, 'Réordonner', () => { loadEntities(); });
      }, () => requireIdentity());
    });
  }
```

- [ ] **Step 2: Verify in the browser**

Start the app preview (see the project's normal dev workflow — this is a Google Apps Script web app, so verification happens against the deployed test/dev URL or `tests/frontend/serve.js` static preview, per however this project is normally previewed), open Paramètres → the Players list, and:
- Confirm each row shows a `⠿` handle on the left.
- Press-and-drag a row (mouse) to a new position; on release, confirm the list re-renders in the new order and stays that way after a page reload.
- Repeat with touch (resize the browser tool to a mobile viewport, or use an actual touch device) — confirm the page does not scroll instead of dragging.
- Repeat both checks for the Categories list.
- Confirm dragging without an identity selected shows the "Sélectionne ton identité" toast and does not move the row.

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "feat(ordre): drag-and-drop reorder for Players and Categories lists"
```

---

### Task 7: Wire reorder into Bareme Settings; strip client-side point sorting elsewhere

**Files:**
- Modify: `Index.html:17901-17939` (`renderBaremeSettings` — remove sort)
- Modify: `Index.html:17941-18000` (`buildBsectRow` — add handle + wiring)
- Modify: `Index.html:18101` (`renderBaremeDrawer` — remove sort only, read-only view)
- Modify: `Index.html:13038` (`renderBaremeQuickBtns` — remove sort only, it's a picker, not an editor)

**Interfaces:**
- Consumes: `buildReorderHandle`, `attachReorderHandle` (Task 5); `apiReorderBareme` (Task 2).

- [ ] **Step 1: Stop sorting in `renderBaremeSettings`**

In `Index.html:17906`, replace:
```js
      const catEntries = entries.filter(e => e.top === cat.name).sort((a, b) => b.pts - a.pts);
```
with:
```js
      const catEntries = entries.filter(e => e.top === cat.name);
```

- [ ] **Step 2: Add the drag handle and wiring in `buildBsectRow`**

In `Index.html`, replace the whole `buildBsectRow` function (`Index.html:17941-18000`):

```js
  function buildBsectRow(entry, entriesCont, allEntries) {
    const col = categoryColor(entry.top);
    const row = document.createElement('div');
    row.className = 'bsect-entry';
    row.dataset.rowIndex = entry.rowIndex;
    row.style.borderLeft = '3px solid ' + tint(col, 0.5);
    row.style.background = tint(col, 0.05);

    const handle = buildReorderHandle();

    const pts = document.createElement('span');
    pts.className = 'bsect-pts';
    pts.style.background = col;
    pts.textContent = entry.pts + ' pt' + (Math.abs(entry.pts) !== 1 ? 's' : '');

    const action = document.createElement('span');
    action.className = 'bsect-action'; action.textContent = entry.action;

    const btns = document.createElement('div');
    btns.className = 'bsect-btns';

    const editBtn = document.createElement('button');
    editBtn.className = 'small'; editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => {
      row.innerHTML = '';
      row.style.flexWrap = 'wrap';
      const ptsIn = document.createElement('input');
      ptsIn.type = 'number'; ptsIn.value = entry.pts; ptsIn.style.cssText = 'width:64px;padding:4px 6px;font-size:0.82rem;text-align:center;';
      const actIn = document.createElement('input');
      actIn.type = 'text'; actIn.value = entry.action; actIn.style.cssText = 'flex:1;min-width:120px;padding:4px 8px;font-size:0.84rem;';
      const ok = document.createElement('button');
      ok.className = 'small primary'; ok.textContent = '✓';
      ok.addEventListener('click', () => {
        if (!requireIdentity()) return;
        if (!actIn.value.trim()) { showToast('Action vide.', 'error'); return; }
        const restore = startBtnLoading(ok, '…');
        callServer('apiUpdateBaremeEntry', [entry.rowIndex, actIn.value.trim(), ptsIn.value, _whoAmI || ''], res => {
          restore();
          baremeEntries = res.entries; renderBaremeSettings(res.entries); renderBaremeDrawer(res.entries);
        }, 'Update barème', () => restore());
      });
      const cancel = document.createElement('button');
      cancel.className = 'small'; cancel.textContent = '✕';
      cancel.addEventListener('click', () => row.replaceWith(buildBsectRow(entry, entriesCont, allEntries)));
      row.appendChild(ptsIn); row.appendChild(actIn); row.appendChild(ok); row.appendChild(cancel);
      actIn.focus();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'small danger'; delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => {
      if (!requireIdentity()) return;
      const restore = startBtnLoading(delBtn, '…');
      callServer('apiDeleteBaremeEntry', [entry.rowIndex, _whoAmI || ''], res => {
        restore();
        baremeEntries = res.entries; renderBaremeSettings(res.entries); renderBaremeDrawer(res.entries);
      }, 'Suppr. barème', () => restore());
    });

    btns.appendChild(editBtn); btns.appendChild(delBtn);
    row.appendChild(handle); row.appendChild(pts); row.appendChild(action); row.appendChild(btns);
    attachReorderHandle(handle, row, entriesCont, '.bsect-entry', () => {
      const orderedRowIndexes = Array.from(entriesCont.querySelectorAll('.bsect-entry')).map(el => Number(el.dataset.rowIndex));
      callServer('apiReorderBareme', [entry.top, orderedRowIndexes, _whoAmI || ''], res => {
        baremeEntries = res.entries; renderBaremeSettings(res.entries); renderBaremeDrawer(res.entries);
      }, 'Réordonner barème', () => renderBaremeSettings(baremeEntries));
    }, () => requireIdentity());
    return row;
  }
```

- [ ] **Step 3: Stop sorting in the read-only Bareme drawer**

In `Index.html:18101`, replace:
```js
      catEntries.sort((a, b) => b.pts - a.pts);
```
with:
```js
      // Ordre déjà fourni par le serveur (BaremeService.getEntries) — pas de tri client ici.
```
(delete the line entirely is equally correct; the comment documents why there's no `.sort(...)` where one used to be, for the next reader.)

- [ ] **Step 4: Stop sorting in the quick-pick buttons**

In `Index.html:13038`, replace:
```js
      const matching = entries.filter(e => e.top === topName).sort((a, b) => b.pts - a.pts);
```
with:
```js
      const matching = entries.filter(e => e.top === topName);
```

- [ ] **Step 5: Verify in the browser**

Open Paramètres → Barème settings:
- Confirm each rule row shows a `⠿` handle.
- Drag a rule to a new position within its Top's group; confirm it persists after reload, and confirm dragging a rule from one Top's group is impossible (the handle only reorders within `entriesCont`, which is scoped per Top block).
- Open the Barème drawer (quick reference) and the "Saisir un Lot" quick-pick buttons for a Top with several rules; confirm both reflect the same order now shown in Settings (no more automatic points-descending order).
- Add a brand-new rule to a Top that already has a custom order; confirm it appears at the end, not reshuffling the rest.

- [ ] **Step 6: Commit**

```bash
git add Index.html
git commit -m "feat(ordre): drag-and-drop reorder for Bareme; stop client-side points sort"
```

---

### Task 8: Wire reorder into Phrases pools

**Files:**
- Modify: `Index.html:6104-6205` (`renderPoolList`, `buildPhraseEditRow`, `buildPoolBlock`)

**Interfaces:**
- Consumes: `buildReorderHandle`, `attachReorderHandle` (Task 5); `apiReorderPhrases` (Task 3); `loadCustomPhrases`, `renderPoolList` (existing).

- [ ] **Step 1: Thread the pool container through `buildPhraseEditRow` and add the handle**

In `Index.html`, replace `buildPhraseEditRow` (`Index.html:6114-6128`):

```js
  function buildPhraseEditRow(entry, presetName, pool, displayLabel, poolContainer) {
    const row = document.createElement('div');
    row.className = 'phrase-edit-item';
    row.dataset.rowIndex = entry.rowIndex;
    row.innerHTML =
      '<span class="reorder-handle" title="Glisser pour réorganiser">⠿</span>' +
      '<span class="phrase-edit-text">' + escapeHtml(entry.text) + '</span>' +
      '<div class="phrase-edit-btns">' +
        '<button class="secondary small" title="Modifier">✏️</button>' +
        '<button class="danger small" title="Supprimer">🗑️</button>' +
      '</div>';
    row.querySelector('[title="Modifier"]').addEventListener('click', () =>
      openPhraseModal(entry, presetName, pool, displayLabel));
    row.querySelector('[title="Supprimer"]').addEventListener('click', () =>
      deletePhraseWithUndo(entry, presetName));
    attachReorderHandle(row.querySelector('.reorder-handle'), row, poolContainer, '.phrase-edit-item', () => {
      const orderedRowIndexes = Array.from(poolContainer.querySelectorAll('.phrase-edit-item')).map(el => Number(el.dataset.rowIndex));
      callServer('apiReorderPhrases', [presetName, pool, orderedRowIndexes, _whoAmI || ''], res => {
        _customPhrases = res.phrases;
        renderPoolList(presetName);
      }, 'Réordonner phrases', () => renderPoolList(presetName));
    }, () => requireIdentity());
    return row;
  }
```

- [ ] **Step 2: Pass the pool container (`block`) into the call site**

In `Index.html`, inside `buildPoolBlock` (`Index.html:6130-6205`), replace:
```js
    } else {
      entries.forEach(entry =>
        block.appendChild(buildPhraseEditRow(entry, presetName, pool)));
    }
```
with:
```js
    } else {
      entries.forEach(entry =>
        block.appendChild(buildPhraseEditRow(entry, presetName, pool, undefined, block)));
    }
```

- [ ] **Step 3: Verify in the browser**

Open Paramètres → Phrases, pick a preset with at least two phrases in one pool ("Premier", "Dernier", etc.):
- Confirm each phrase row shows a `⠿` handle.
- Drag a phrase to reorder within its pool; confirm the order persists after switching presets and back, and after a full reload.
- Confirm dragging a phrase out of its own pool block is impossible (the handle only reorders within `block`).
- Add a new phrase to a pool that already has a custom order; confirm it lands at the end.

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "feat(ordre): drag-and-drop reorder for Phrases pools"
```

---

### Task 9: "Réparer l'ordre" button in 🔧 Outils

**Files:**
- Modify: `Index.html:4575-4582` (add a new `.tool-action` block inside `#toolHealthCard`)
- Modify: `Index.html:16405-16412` (add the click handler next to `backfillNoteAuthorsBtn`'s)

**Interfaces:**
- Consumes: `apiRepairOrder` (Task 4).

- [ ] **Step 1: Add the button markup**

In `Index.html`, right after the `backfillNoteAuthorsBtn` block and before `#toolHealthCard`'s closing `</div>` (`Index.html:4575-4582`):

```html
        <div class="tool-action">
          <div class="tool-action-info">
            <strong>Rattacher l'auteur des notes anciennes</strong>
            <span>Retrouve dans le Journal l'auteur des notes antérieures au suivi Créé par/Modifié par — uniquement quand la note n'a jamais été modifiée depuis (correspondance certaine, sans devinette). Les autres deviendront traçables dès leur prochaine modification.</span>
          </div>
          <button class="secondary small" id="backfillNoteAuthorsBtn">Rattacher</button>
        </div>
        <div class="tool-action">
          <div class="tool-action-info">
            <strong>Réparer l'ordre</strong>
            <span>Recalcule et enregistre l'ordre manuel (Joueurs, Tops, Barème, Phrases) sans rien réorganiser visuellement — corrige seulement les colonnes Ordre manquantes ou incomplètes.</span>
          </div>
          <button class="secondary small" id="repairOrderBtn">Réparer</button>
        </div>
      </div>
```

(this replaces the existing two closing lines `</div>` + `      </div>` at the end of that block with the same two lines, now preceded by the new `.tool-action`.)

- [ ] **Step 2: Add the click handler**

In `Index.html`, right after the `backfillNoteAuthorsBtn` handler (`Index.html:16405-16412`):

```js
    document.getElementById('backfillNoteAuthorsBtn').addEventListener('click', () => {
      if (!requireIdentity()) return;
      buzz();
      callServer('apiBackfillNoteAuthors', [_whoAmI || ''], res => {
        showToast(`${res.matched} note(s) rattachée(s), ${res.skipped} sans correspondance certaine.`, 'success');
        if (res.matched) loadNotes();
      }, 'Rattachement auteurs notes');
    });

    document.getElementById('repairOrderBtn').addEventListener('click', () => {
      if (!requireIdentity()) return;
      buzz();
      callServer('apiRepairOrder', [_whoAmI || ''], res => {
        showToast(`Ordre réparé : ${res.players} joueur(s), ${res.categories} top(s), ${res.bareme} règle(s), ${res.phrases} phrase(s).`, 'success');
        loadEntities(); applyFilters();
        loadBaremeSettings();
        loadCustomPhrases(() => renderPhrasesEditorSection());
      }, 'Réparation ordre');
    });
```

- [ ] **Step 3: Verify in the browser**

Open Paramètres → 🔧 Outils → 🔧 Santé, click "Réparer" next to "Réparer l'ordre":
- Confirm a success toast with the four counts appears.
- Confirm nothing visibly reorders (Players/Categories/Bareme/Phrases lists look exactly the same before and after, per the design note that repair preserves current effective order).
- In the Google Sheet directly, confirm the `Ordre` column on `Players`/`Categories` now has a header label and sequential values with no gaps.

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "feat(ordre): add Réparer l'ordre tool button"
```

---

### Task 10: Changelog + final verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the changelog entry**

In `CHANGELOG.md`, right after the `Format basé sur...` line and before `## [v3.13.0]`, insert:

```markdown
## [v3.14.0] - 2026-08-12

### Ajouté
**Humanisé** : Joueurs, Tops, règles du Barème (par Top) et Phrases (par pool) peuvent désormais être réordonnés à la main par glisser-déposer, à la souris comme au doigt sur mobile — un nouveau bouton "⠿" apparaît sur chaque ligne. Le nouvel ordre est mémorisé partout : filtres, listes déroulantes de saisie, légendes de graphiques, exports. Un bouton "Réparer l'ordre" dans 🔧 Outils sert de filet de sécurité si la colonne d'ordre venait à manquer ou à être incomplète (par exemple après une modification directe dans Google Sheets) — sans rien réorganiser visuellement, il ne fait que compléter les valeurs manquantes.
**Technique** : `Code.gs` — nouvelle colonne `Ordre` sur les feuilles `Players`/`Categories` (colonne E) et `Bareme`/`Phrases` (colonne D). `SettingsService.getEntities`, `BaremeService.getEntries`, `PhrasesService.getAll` trient désormais par `Ordre` via le helper partagé `_sortByOrdreOrOriginal`, qui se replie silencieusement sur l'ordre brut de la feuille tant que la colonne est absente ou incomplète (jamais d'erreur, jamais de blocage). Nouvelles actions `apiReorderEntities`, `apiReorderBareme` (par groupe Top), `apiReorderPhrases` (par groupe preset+pool) et `apiRepairOrder`, toutes protégées par `requireAuthor`/`withLock`/`AuditService.log`. `Index.html` — nouveau composant partagé `attachReorderHandle` basé sur les Pointer Events (souris et tactile unifiés), distinct du glisser-déposer existant de "Saisir un Lot" (`attachRowDragEvents`, HTML5 Drag-and-Drop, souris uniquement, non modifié). `renderBaremeDrawer`/`renderBaremeQuickBtns` ne trient plus côté client par points décroissants, le serveur fournissant déjà le bon ordre.

```

- [ ] **Step 2: Run the full verification suite**

Run: `npm run verify`
Expected: `check:html` passes (no syntax errors in `Index.html`), then all `node --test` suites PASS — no regressions in `tests/settings.test.js`, `tests/outils-nouveaux.test.js`, `tests/autopoints.test.js`, `tests/chat.test.js`, or any other existing suite.

- [ ] **Step 3: Manual end-to-end pass in the browser**

Walk through, in order: reorder a Player, reorder a Category, reorder a Bareme rule, reorder a Phrase, reload the page fully each time and confirm the order survived. Then click "Réparer l'ordre" once more and confirm nothing changes visually. Check that filters, the "Saisir un Lot" player/category selectors, and any chart legend reflect the new Player/Category order (they already iterate `cachedPlayers`/`cachedCategories` in array order, so this should require no extra code — this step is confirming that claim, not implementing anything).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for manual reorder feature (v3.14.0)"
```

- [ ] **Step 5: Push**

Ask the user to confirm before pushing (push triggers the project's auto-deploy). Once confirmed:

```bash
git push
```
