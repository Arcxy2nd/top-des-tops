# Refonte du Journal d'audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nettoyer le contenu et le style du Journal d'audit, retirer les interactions mortes, et ajouter une annulation ("Annuler") générique par ligne pour toutes les catégories d'actions où c'est raisonnablement possible.

**Architecture:** Un moteur d'annulation générique dans `AuditService` (recherche/comparaison de lignes brutes sur les feuilles Google Sheets) piloté par un objet `snapshot` JSON stocké dans une nouvelle colonne cachée de `AuditLog`. Chaque site d'appel de `AuditService.log()` est étendu pour fournir ce snapshot. Le moteur ne réimplémente pas la validation métier de chaque service : il restaure une donnée qui était déjà valide (elle a existé), via des écritures directes sur la feuille — mêmes primitives que les services existants (`setValues`/`appendRow`/`deleteRow`), sous le même `withLock`.

**Tech Stack:** Google Apps Script (`Code.gs`), HTML/CSS/JS (`Index.html`), Node `--test` + VM harness (`tests/harness.js`, `tests/audit.test.js`).

## Global Constraints

- Comportement JS en anglais, texte utilisateur en français (§8 `context.md`).
- Pas de classe ES6 — objets littéraux / IIFE, cohérent avec le codebase existant.
- Aucune interaction "Outils" ni "Dashboard" — hors scope de ce plan.
- Groupement/dégroupement de lots (`Lots auto-groupés`, `Groupement lot`, `Dégroupement lot`, `Retrait du groupe`, `Suppression groupe`) : **pas d'undo dans ce plan** — mutation de `GroupId` sur un nombre arbitraire de lignes potentiellement ré-imbriquées avec d'autres lots depuis, jugé pas assez sûr pour une restauration automatique fiable. Documenté comme limitation assumée dans le changelog.
- Chaque commit fait tourner `npm test` avant de committer.

---

### Task 1 : Infrastructure snapshot + moteur d'annulation générique

**Files:**
- Modify: `Code.gs:123-155` (`AuditService`)
- Modify: `Code.gs:1394-1455` (`apiGetAuditLog`, `apiGetAuditActionTypes`)
- Test: `tests/audit.test.js`

**Interfaces:**
- Produces: `AuditService.log(author, action, entity, before, after, detail, snapshot)` — `snapshot` optionnel, objet `{ sheet, op, rowIndex?, before?, after?, rows? }` avec `op` ∈ `'insert' | 'delete' | 'update' | 'insertMany' | 'deleteMany' | 'updateMany'`.
- Produces: `AuditService.undo(auditRowId, author)` → `{ success: true, summary }` ou lève une `Error` avec message utilisateur.
- Produces: `apiUndoAuditEntry(auditRowId, author)` → `{ success: bool, error? }`.
- Produces: `apiGetAuditLog(...)` — chaque entrée de `logs[]` gagne `id` (numéro de ligne réel dans `AuditLog`, 2-based) et `undoable` (bool).

- [ ] **Step 1: Étendre la feuille `AuditLog` à 9 colonnes et `AuditService.log`**

Dans `Code.gs`, remplacer le bloc `AuditService` (lignes 123-155) :

```js
const AuditService = (() => {
  function _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.auditLog) return cache.auditLog;
    const sheet = cache.spreadsheet.insertSheet('AuditLog');
    sheet.appendRow(['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    ConfigService.clearCache();
    return ConfigService.getSheets().auditLog;
  }

  /**
   * Appends one audit row. Never throws — audit failure must not break the caller.
   * Must be called inside a withLock() block (lock is already held by the caller).
   * `snapshot`, when provided, is a plain object describing how to reverse this
   * action (see AuditService.undo) — serialized to JSON in column 8. Omit it for
   * actions that cannot be safely reversed.
   */
  function log(author, action, entity, before, after, detail, snapshot) {
    try {
      const sheet = _getOrCreateSheet();
      sheet.appendRow([
        new Date(),
        author  || '',
        action  || '',
        entity  || '',
        before  || '',
        after   || '',
        detail  || '',
        snapshot ? JSON.stringify(snapshot) : '',
        ''
      ]);
    } catch (_) {}
  }

  /** Normalizes one sheet cell for comparison: Date → epoch ms, else trimmed string. */
  function _cellKey(v) {
    if (v instanceof Date) return String(v.getTime());
    return v === null || v === undefined ? '' : v.toString();
  }

  function _rowsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (_cellKey(a[i]) !== _cellKey(b[i])) return false;
    return true;
  }

  /** Finds the 1-based row index of the first row (from row 2) matching `values` exactly. */
  function _findRowIndex(sheet, values) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2 || !values || !values.length) return -1;
    const data = sheet.getRange(2, 1, lastRow - 1, values.length).getValues();
    for (let i = 0; i < data.length; i++) if (_rowsEqual(data[i], values)) return i + 2;
    return -1;
  }

  /** Resolves the sheet object for a snapshot's `sheet` key ('history'|'players'|...). */
  function _sheetFor(key) {
    const sheet = ConfigService.getSheets()[key];
    if (!sheet) throw new Error("Feuille introuvable pour l'annulation : " + key);
    return sheet;
  }

  /** Locates the row to act on: trust `rowIndex` if its current content still matches
   *  `expected`, else fall back to a full-sheet content search. Throws if neither works. */
  function _locate(sheet, rowIndex, expected) {
    if (rowIndex) {
      const current = sheet.getRange(rowIndex, 1, 1, expected.length).getValues()[0];
      if (_rowsEqual(current, expected)) return rowIndex;
    }
    const found = _findRowIndex(sheet, expected);
    if (found === -1) throw new Error("Impossible d'annuler : les données ont changé depuis cette action.");
    return found;
  }

  /**
   * Reverses one snapshot. Pure data restoration via direct sheet writes (setValues/
   * appendRow/deleteRow) — the same primitives every service already uses — under the
   * caller's withLock. No re-validation: we are restoring a state that was valid before.
   */
  function _applySnapshot(snapshot) {
    const sheet = _sheetFor(snapshot.sheet);
    switch (snapshot.op) {
      case 'insert': {
        const row = _locate(sheet, snapshot.rowIndex, snapshot.after);
        sheet.deleteRow(row);
        return;
      }
      case 'delete': {
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, snapshot.before.length).setValues([snapshot.before]);
        return;
      }
      case 'update': {
        const row = _locate(sheet, snapshot.rowIndex, snapshot.after);
        sheet.getRange(row, 1, 1, snapshot.before.length).setValues([snapshot.before]);
        return;
      }
      case 'insertMany': {
        snapshot.rows.forEach(r => {
          const row = _findRowIndex(sheet, r);
          if (row !== -1) sheet.deleteRow(row);
        });
        return;
      }
      case 'deleteMany': {
        const startRow = sheet.getLastRow() + 1;
        const numCols  = snapshot.rows[0].length;
        sheet.getRange(startRow, 1, snapshot.rows.length, numCols).setValues(snapshot.rows);
        return;
      }
      case 'updateMany': {
        snapshot.rows.forEach(r => {
          const row = _locate(sheet, r.rowIndex, r.after);
          sheet.getRange(row, 1, 1, r.before.length).setValues([r.before]);
        });
        return;
      }
      default:
        throw new Error("Type d'annulation inconnu : " + snapshot.op);
    }
  }

  /** Undoes the audit entry at 1-based sheet row `auditRowId`. Marks it as undone and
   *  appends a new "Action annulée" audit row (itself not undoable). */
  function undo(auditRowId, author) {
    const sheet = _getOrCreateSheet();
    const rowIndex = parseInt(auditRowId, 10);
    if (isNaN(rowIndex) || rowIndex < 2) throw new Error("Ligne de journal invalide.");
    const row = sheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
    const [, , action, entity, , , , snapshotRaw, undoneAt] = row;
    if (undoneAt) throw new Error("Cette action a déjà été annulée.");
    if (!snapshotRaw) throw new Error("Cette entrée du journal ne peut pas être annulée (créée avant l'ajout de cette fonctionnalité, ou action non réversible).");

    let snapshot;
    try { snapshot = JSON.parse(snapshotRaw); }
    catch (e) { throw new Error("Instantané d'annulation corrompu."); }

    _applySnapshot(snapshot);
    sheet.getRange(rowIndex, 9).setValue(new Date());
    log(author, 'Action annulée', entity, '', '', 'Annulation de : ' + action);
    ConfigService.clearCache();
    return { success: true, summary: action };
  }

  return { log, undo };
})();
```

- [ ] **Step 2: Étendre `apiGetAuditLog` pour exposer `id` et `undoable`, et `apiUndoAuditEntry`**

Dans `Code.gs`, remplacer la boucle de lecture dans `apiGetAuditLog` (lignes 1402-1430 environ) :

```js
    const data  = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    // ... (bornes de dates et needle inchangées)

    const filtered = [];
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      const ts  = new Date(row[0]);
      if (isNaN(ts.getTime())) continue;
      if (filterAuthor && row[1] !== filterAuthor) continue;
      if (filterAction && row[2] !== filterAction) continue;
      if (start && ts < start) continue;
      if (end   && ts > end)   continue;
      if (needle) {
        const haystack = (row[3] + ' ' + row[4] + ' ' + row[5] + ' ' + row[6]).toLowerCase();
        if (haystack.indexOf(needle) === -1) continue;
      }
      filtered.push({
        id:        i + 2,
        timestamp: ts.toISOString(),
        author:    row[1] ? row[1].toString() : '',
        action:    row[2] ? row[2].toString() : '',
        entity:    row[3] ? row[3].toString() : '',
        before:    row[4] ? row[4].toString() : '',
        after:     row[5] ? row[5].toString() : '',
        detail:    row[6] ? row[6].toString() : '',
        undoable:  !!row[7] && !row[8]
      });
    }
```

(`getRange(2, 1, lastRow - 1, 9)` remplace le `7` existant ; le reste de la fonction — pagination, `total` — ne change pas.)

Ajouter juste après `apiGetAuditActionTypes` :

```js
function apiUndoAuditEntry(auditRowId, author) {
  try {
    return withLock(() => AuditService.undo(auditRowId, author));
  } catch (e) { return fail(e); }
}
```

- [ ] **Step 3: Exposer `apiUndoAuditEntry` au harness de test**

Dans `tests/harness.js`, ajouter `apiUndoAuditEntry` à la liste de `__exports` (ligne ~135, à côté de `apiGetAuditLog`).

- [ ] **Step 4: Tests du moteur générique**

Ajouter à `tests/audit.test.js` :

```js
// ─── AuditService.undo — generic engine ──────────────────────────────────────────

function makeAuditSheetV9() {
  return makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
}

test('AuditService.log stores a JSON snapshot in column 8 when provided', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  withAuditSheets(gas, audit);
  gas.AuditService.log('Alice', 'Note ajoutée', 'Note: Bob', '', 'Bob : hello', '',
    { sheet: 'notes', op: 'insert', rowIndex: 2, after: ['2026-01-01', 'Bob', 'hello'] });
  const row = audit._grid[1];
  assert.strictEqual(JSON.parse(row[7]).op, 'insert');
  assert.strictEqual(row[8], '');
});

test('undo reverses an insert by deleting the matching row', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const notes = makeSheet([['Date','Joueur','Note'], ['2026-01-01', 'Bob', 'hello']]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes, bareme: null, phrases: null, auditLog: audit
  });
  gas.AuditService.log('Alice', 'Note ajoutée', 'Note: Bob', '', 'Bob : hello', '',
    { sheet: 'notes', op: 'insert', rowIndex: 2, after: ['2026-01-01', 'Bob', 'hello'] });
  const res = gas.AuditService.undo(2, 'Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(notes._grid.length, 1, 'the inserted row was removed');
});

test('undo reverses a delete by re-appending the row', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const notes = makeSheet([['Date','Joueur','Note']]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes, bareme: null, phrases: null, auditLog: audit
  });
  gas.AuditService.log('Alice', 'Note supprimée', 'Note', 'Bob : hello', '', '',
    { sheet: 'notes', op: 'delete', before: ['2026-01-01', 'Bob', 'hello'] });
  gas.AuditService.undo(2, 'Alice');
  assert.strictEqual(notes._grid.length, 2, 'the deleted row is back');
  assert.strictEqual(notes._grid[1][1], 'Bob');
});

test('undo reverses an update by restoring the before row', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const notes = makeSheet([['Date','Joueur','Note'], ['2026-01-01', 'Bob', 'edited']]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes, bareme: null, phrases: null, auditLog: audit
  });
  gas.AuditService.log('Alice', 'Note modifiée', 'Note', 'hello', 'edited', '',
    { sheet: 'notes', op: 'update', rowIndex: 2,
      before: ['2026-01-01', 'Bob', 'hello'], after: ['2026-01-01', 'Bob', 'edited'] });
  gas.AuditService.undo(2, 'Alice');
  assert.strictEqual(notes._grid[1][2], 'hello');
});

test('undo throws when the entry has no snapshot', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  withAuditSheets(gas, audit);
  gas.AuditService.log('Alice', 'Saisie de points', 'History', '', '3 entrée(s)', '');
  assert.throws(() => gas.AuditService.undo(2, 'Alice'), /ne peut pas être annulée/);
});

test('undo throws when the entry was already undone', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const notes = makeSheet([['Date','Joueur','Note']]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes, bareme: null, phrases: null, auditLog: audit
  });
  gas.AuditService.log('Alice', 'Note supprimée', 'Note', 'Bob : hello', '', '',
    { sheet: 'notes', op: 'delete', before: ['2026-01-01', 'Bob', 'hello'] });
  gas.AuditService.undo(2, 'Alice');
  assert.throws(() => gas.AuditService.undo(2, 'Alice'), /déjà été annulée/);
});

test('undo throws when the current row no longer matches (data changed since)', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const notes = makeSheet([['Date','Joueur','Note'], ['2026-01-01', 'Bob', 'a totally different text']]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes, bareme: null, phrases: null, auditLog: audit
  });
  gas.AuditService.log('Alice', 'Note ajoutée', 'Note: Bob', '', 'Bob : hello', '',
    { sheet: 'notes', op: 'insert', rowIndex: 2, after: ['2026-01-01', 'Bob', 'hello'] });
  assert.throws(() => gas.AuditService.undo(2, 'Alice'), /ont changé depuis/);
});

test('apiGetAuditLog exposes id and undoable', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  withAuditSheets(gas, audit);
  gas.AuditService.log('Alice', 'Note ajoutée', 'Note: Bob', '', 'Bob : hello', '',
    { sheet: 'notes', op: 'insert', rowIndex: 2, after: ['2026-01-01', 'Bob', 'hello'] });
  gas.AuditService.log('Bob', 'Saisie de points', 'History', '', '3 entrée(s)', '');
  const res = gas.apiGetAuditLog(1, 20, null, null, null, null);
  assert.strictEqual(res.logs[0].undoable, false, 'no snapshot on the points entry');
  assert.strictEqual(res.logs[1].undoable, true);
  assert.strictEqual(res.logs[1].id, 2);
});

test('apiUndoAuditEntry returns a failure envelope on error instead of throwing', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  withAuditSheets(gas, audit);
  gas.AuditService.log('Alice', 'Saisie de points', 'History', '', '3 entrée(s)', '');
  const res = gas.apiUndoAuditEntry(2, 'Alice');
  assert.strictEqual(res.success, false);
  assert.ok(res.error);
});
```

Also update the existing `makeAuditSheet()` / `withAuditSheets` helper at the top of the file and every pre-existing test in `audit.test.js` that builds a 7-column header — they must become 9 columns (`'Snapshot'`, `'AnnuléLe'`) so `apiGetAuditLog`'s new `getRange(2, 1, lastRow - 1, 9)` reads real (empty-string) cells instead of running off the declared grid width. Since `makeSheet`'s `getRange` already pads missing cells with `''` (see `tests/harness.js:36`), widening just the header row is enough — no data-row changes needed.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all tests in `tests/audit.test.js` pass, no regression elsewhere.

- [ ] **Step 6: Commit**

```bash
git add Code.gs tests/harness.js tests/audit.test.js
git commit -m "feat: moteur générique de snapshot + annulation pour le Journal d'audit"
```

---

### Task 2 : Snapshots — Historique (points)

**Files:**
- Modify: `Code.gs` (`StorageService.fixZeroPoints`, `StorageService.deleteOrphans`, `apiAddBulkPlan`, `apiDeleteHistoryEntries`, `apiUpdateHistoryDescription`, `apiUpdateHistoryEntry`, `apiUpdateBulkEntries`, `apiFixZeroPoints`, `apiDeleteOrphans`)
- Test: `tests/audit.test.js` or a new `tests/audit-undo-history.test.js`

**Interfaces:**
- Consumes: `AuditService.log(..., snapshot)` from Task 1.
- Produces: nothing new consumed by later tasks — each task wires its own action family independently.

- [ ] **Step 1: `StorageService.fixZeroPoints` / `deleteOrphans` return the deleted rows**

`Code.gs:579-619` — change both to capture full rows before deleting:

```js
  fixZeroPoints() {
    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { deleted: 0, rows: [] };
    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    const rows = [];
    for (let i = data.length - 1; i >= 0; i--) {
      const pts = parseInt(data[i][3], 10);
      if (isNaN(pts) || pts <= 0) { rows.push(data[i]); sheet.deleteRow(i + 2); }
    }
    return { deleted: rows.length, rows };
  },
```

(Adapt `deleteOrphans` the same way — same shape, its own predicate for "orphan" stays unchanged; read the current body at `Code.gs:597-619` before editing to keep its exact predicate.)

- [ ] **Step 2: Wire snapshots into the 6 History call sites**

`apiAddBulkPlan` (insertMany) — capture the exact rows appended:

```js
function apiAddBulkPlan(plan, author) {
  try {
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const startRow = history.getLastRow() + 1;
      StorageService.appendBulkPlan(plan);
      const endRow = history.getLastRow();
      const addedRows = history.getRange(startRow, 1, endRow - startRow + 1, 7).getValues();
      const totalEntries = plan.reduce(function(s, d) { return s + (d.entries || []).length; }, 0);
      const firstDate    = plan[0] && plan[0].date ? plan[0].date : '';
      AuditService.log(author, 'Saisie de points', 'History', '', totalEntries + ' entrée(s)',
        firstDate ? 'à partir du ' + firstDate : '',
        { sheet: 'history', op: 'insertMany', rows: addedRows });
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

`apiDeleteHistoryEntries` (deleteMany) — capture rows before deleting:

```js
function apiDeleteHistoryEntries(rowIndexes, author) {
  try {
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const sorted = [...rowIndexes].sort((a, b) => b - a);
      const removedRows = sorted.map(ri => history.getRange(ri, 1, 1, 7).getValues()[0]);
      sorted.forEach(ri => history.deleteRow(ri));
      AuditService.log(author, 'Suppression bulk', 'History', '', '', rowIndexes.length + ' entrée(s)',
        { sheet: 'history', op: 'deleteMany', rows: removedRows });
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

`apiUpdateHistoryDescription` (update) — capture the full row, not just the description cell, so `before`/`after` in the snapshot are complete rows:

```js
function apiUpdateHistoryDescription(rowIndex, description, author) {
  try {
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const before = _historyDescSummary(rowIndex);
      const beforeRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      StorageService.updateHistoryDescription(rowIndex, description);
      const afterRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      AuditService.log(author, 'Description modifiée', 'History', before, description || '', 'ligne #' + rowIndex,
        { sheet: 'history', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

`apiUpdateHistoryEntry` (update) — same pattern:

```js
function apiUpdateHistoryEntry(rowIndex, fields, author) {
  try {
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const before = _historyRowSummary(rowIndex);
      const beforeRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      StorageService.updateHistoryEntry(rowIndex, fields);
      const afterRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      const after = [fields.player || '?', fields.category || '?',
        (parseInt(fields.points, 10) || '?') + ' pts', fields.date || '',
        fields.description || ''].join(' | ');
      AuditService.log(author, 'Modification entrée', 'History', before, after, 'ligne #' + rowIndex,
        { sheet: 'history', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

`apiFixZeroPoints` / `apiDeleteOrphans` (deleteMany), using the `rows` now returned by Step 1:

```js
function apiFixZeroPoints(author) {
  try {
    return withLock(() => {
      const result = StorageService.fixZeroPoints();
      AuditService.log(author, 'Nettoyage zéros', 'History', '', '',
        result.deleted + ' entrée(s) supprimée(s)',
        result.rows.length ? { sheet: 'history', op: 'deleteMany', rows: result.rows } : null);
      ConfigService.clearCache();
      return { success: true, deleted: result.deleted };
    });
  } catch(e) { return fail(e); }
}
```

(Mirror for `apiDeleteOrphans`.)

`apiUpdateBulkEntries` (updateMany) — `allData` is already read before the mutation loop; capture `before`/`after` per changed row:

```js
      var undoRows = [];
      indexSet.forEach(function(idx) {
        var rowI = idx - 2;
        if (rowI < 0 || rowI >= allData.length) { skipped.push(idx); return; }
        var row      = allData[rowI];
        var beforeRow = row.slice();
        var player   = hasPlayer ? partialFields.player   : (row[1] ? row[1].toString() : '');
        var category = hasCat    ? partialFields.category : (row[2] ? row[2].toString() : '');
        var pts      = hasPts    ? parseInt(partialFields.points, 10) : parseInt(row[3], 10);
        var desc     = hasDesc   ? (partialFields.description || '') : (row[4] ? row[4].toString() : '');
        var saiseur  = hasSais   ? (partialFields.saiseur  || '') : (row[6] ? row[6].toString() : '');

        if (!player || !category || isNaN(pts) || pts < 1) { skipped.push(idx); return; }

        var targetDate;
        if (hasDate) {
          var _now = new Date();
          var _dp = (partialFields.date + '').split('-').map(Number);
          targetDate = new Date(_dp[0], _dp[1] - 1, _dp[2], _now.getHours(), _now.getMinutes(), _now.getSeconds());
          if (isNaN(targetDate.getTime())) { skipped.push(idx); return; }
        } else {
          targetDate = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
        }

        history.getRange(idx, 1, 1, 5).setValues([[targetDate, player, category, pts, desc]]);
        if (hasSais) history.getRange(idx, 7).setValue(saiseur);
        undoRows.push({ rowIndex: idx, before: beforeRow, after: history.getRange(idx, 1, 1, 7).getValues()[0] });
      });

      var changedFields = Object.keys(partialFields).join(', ');
      AuditService.log(author, 'Modification bulk', 'History', '', changedFields,
        (rowIndexes.length - skipped.length) + ' entrée(s) modifiée(s)',
        undoRows.length ? { sheet: 'history', op: 'updateMany', rows: undoRows } : null);
```

(Replace the corresponding block in `apiUpdateBulkEntries`, `Code.gs:1571-1599` — the rest of the function is unchanged.)

- [ ] **Step 3: Tests**

Add to `tests/audit.test.js` (reusing `makeAuditSheetV9` from Task 1):

```js
test('apiDeleteHistoryEntries snapshot lets undo restore the deleted row', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const history = makeSheet([
    ['Date','Player','Category','Points','Description','GroupId','Saiseur'],
    [new Date('2026-01-01'), 'Bob', 'Sport', 10, '', '', '']
  ]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history, players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: audit
  });
  gas.apiDeleteHistoryEntries([2], 'Alice');
  assert.strictEqual(history._grid.length, 1);
  const res = gas.apiUndoAuditEntry(2, 'Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(history._grid.length, 2, 'the deleted History row is restored');
  assert.strictEqual(history._grid[1][1], 'Bob');
});

test('apiUpdateHistoryDescription snapshot lets undo restore the old description', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const history = makeSheet([
    ['Date','Player','Category','Points','Description','GroupId','Saiseur'],
    [new Date('2026-01-01'), 'Bob', 'Sport', 10, 'old', '', '']
  ]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history, players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: audit
  });
  gas.apiUpdateHistoryDescription(2, 'new', 'Alice');
  assert.strictEqual(history._grid[1][4], 'new');
  gas.apiUndoAuditEntry(2, 'Alice');
  assert.strictEqual(history._grid[1][4], 'old');
});
```

- [ ] **Step 4: Run tests, commit**

Run: `npm test` — expect all green.

```bash
git add Code.gs tests/audit.test.js
git commit -m "feat: undo pour les actions Historique/points du Journal d'audit"
```

---

### Task 3 : Snapshots — Joueurs / Catégories / Barème

**Files:**
- Modify: `Code.gs` (`apiManageEntity`, `apiSetColor`, `apiAddBaremeEntry`, `apiUpdateBaremeEntry`, `apiDeleteBaremeEntry`)
- Test: `tests/audit.test.js`

- [ ] **Step 1: `apiManageEntity` (ADD/DELETE/RENAME) — snapshots par branche**

`Code.gs:1153-1182`. Chaque branche capture la ligne complète (4 colonnes pour Players/Categories) :

```js
function apiManageEntity(action, type, newName, newMeta, oldName, newIcon, author) {
  try {
    if (!SettingsService.VALID_TYPES.includes(type))     throw new Error("Type invalide.");
    if (!SettingsService.VALID_ACTIONS.includes(action)) throw new Error("Action invalide.");
    return withLock(() => {
      const label = type === 'Players' ? 'Joueur' : 'Top';
      const sheetKey = type === 'Players' ? 'players' : 'categories';
      const numCols  = type === 'Players' ? 3 : 4;
      const sheet    = ConfigService.getSheets()[sheetKey];

      if (action === 'ADD') {
        SettingsService.addEntity(type, newName, newMeta, newIcon);
        const after = type === 'Players'
          ? (newName || '') + ' (avatar: ' + (newMeta || '') + ')'
          : (newName || '') + ' (' + (newMeta || '') + ', ' + (newIcon || '') + ')';
        const afterRow = sheet.getRange(sheet.getLastRow(), 1, 1, numCols).getValues()[0];
        AuditService.log(author, label + ' ajouté', label + ': ' + (newName || ''), '', after, '',
          { sheet: sheetKey, op: 'insert', rowIndex: sheet.getLastRow(), after: afterRow });
      }
      if (action === 'DELETE') {
        const before = _entitySummary(type, oldName);
        const data = sheet.getDataRange().getValues();
        const beforeRow = data.find(r => r[0] === oldName);
        SettingsService.deleteEntity(type, oldName);
        AuditService.log(author, label + ' supprimé', label + ': ' + (oldName || ''), before, '', '',
          beforeRow ? { sheet: sheetKey, op: 'delete', before: beforeRow.slice(0, numCols) } : null);
      }
      if (action === 'RENAME') {
        const data = sheet.getDataRange().getValues();
        const beforeRow = data.find(r => r[0] === oldName);
        SettingsService.renameEntity(type, oldName, newName, newMeta, newIcon);
        const afterData = sheet.getDataRange().getValues();
        const afterRow  = afterData.find(r => r[0] === newName);
        AuditService.log(author, label + ' renommé', label + ': ' + (oldName || ''),
          oldName || '', newName || '', '',
          (beforeRow && afterRow) ? { sheet: sheetKey, op: 'update',
            rowIndex: afterData.indexOf(afterRow) + 1,
            before: beforeRow.slice(0, numCols), after: afterRow.slice(0, numCols) } : null);
      }

      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

Note : `renameEntity` propage aussi le renommage dans `History` (colonnes Player/Category) — ce n'est **pas** couvert par ce snapshot (seule la ligne Players/Categories est restaurée). Annuler un renommage ne réécrit donc pas rétroactivement l'historique déjà migré. Documenté comme limitation dans le changelog.

- [ ] **Step 2: `apiSetColor` (update sur une seule colonne, snapshot sur la ligne entière)**

```js
function apiSetColor(type, name, color, author) {
  try {
    if (!SettingsService.VALID_TYPES.includes(type)) throw new Error("Type invalide.");
    return withLock(() => {
      const sheetKey = type === 'Players' ? 'players' : 'categories';
      const numCols  = type === 'Players' ? 3 : 4;
      const sheet    = ConfigService.getSheets()[sheetKey];
      const data     = sheet.getDataRange().getValues();
      const rowIdx1  = data.findIndex(r => r[0] === name) + 1;
      const beforeRow = rowIdx1 > 0 ? data[rowIdx1 - 1].slice(0, numCols) : null;
      const before = _entityColorSummary(type, name);
      SettingsService.setEntityColor(type, name, color);
      const label = type === 'Players' ? 'Joueur' : 'Top';
      const afterRow = beforeRow ? sheet.getRange(rowIdx1, 1, 1, numCols).getValues()[0] : null;
      AuditService.log(author, 'Couleur ' + label.toLowerCase(), label + ': ' + name,
        before, color || '', '',
        beforeRow ? { sheet: sheetKey, op: 'update', rowIndex: rowIdx1, before: beforeRow, after: afterRow } : null);
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 3: Barème — `apiAddBaremeEntry` / `apiUpdateBaremeEntry` / `apiDeleteBaremeEntry`**

```js
function apiAddBaremeEntry(top, action, pts, author) {
  try {
    return withLock(() => {
      BaremeService.addEntry(top, action, pts);
      const after = [top || '', action || '', String(Number(pts) || 0) + ' pts'].join(' | ');
      const sheet = ConfigService.getSheets().bareme;
      AuditService.log(author, 'Règle ajoutée', 'Barème', '', after, '',
        { sheet: 'bareme', op: 'insert', rowIndex: sheet.getLastRow(),
          after: sheet.getRange(sheet.getLastRow(), 1, 1, 3).getValues()[0] });
      ConfigService.clearCache();
      return { success: true, entries: BaremeService.getEntries() };
    });
  } catch(e) { return fail(e); }
}

function apiUpdateBaremeEntry(rowIndex, action, pts, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().bareme;
      const before = _baremeRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      BaremeService.updateEntry(rowIndex, action, pts);
      const after = (action || '') + ' | ' + String(Number(pts) || 0) + ' pts';
      const afterRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      AuditService.log(author, 'Règle modifiée', 'Barème', before, after, 'ligne #' + rowIndex,
        { sheet: 'bareme', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      ConfigService.clearCache();
      return { success: true, entries: BaremeService.getEntries() };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteBaremeEntry(rowIndex, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().bareme;
      const before = _baremeRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      BaremeService.deleteEntry(rowIndex);
      AuditService.log(author, 'Règle supprimée', 'Barème', before, '', 'ligne #' + rowIndex,
        { sheet: 'bareme', op: 'delete', before: beforeRow });
      ConfigService.clearCache();
      return { success: true, entries: BaremeService.getEntries() };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 4: Tests**

```js
test('apiManageEntity ADD/undo removes the added player', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const players = makeSheet([['Name','Avatar','Color']]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([['Date','Player','Category','Points','Description','GroupId','Saiseur']]),
    players, categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: audit
  });
  gas.apiManageEntity('ADD', 'Players', 'Zoé', '', null, null, 'Alice');
  assert.strictEqual(players._grid.length, 2);
  gas.apiUndoAuditEntry(2, 'Alice');
  assert.strictEqual(players._grid.length, 1);
});

test('apiDeleteBaremeEntry / undo restores the deleted rule', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const bareme = makeSheet([['Top','Action','Points'], ['Sport', 'Victoire', 10]]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme, phrases: null, auditLog: audit
  });
  gas.apiDeleteBaremeEntry(2, 'Alice');
  assert.strictEqual(bareme._grid.length, 1);
  gas.apiUndoAuditEntry(2, 'Alice');
  assert.strictEqual(bareme._grid.length, 2);
  assert.strictEqual(bareme._grid[1][0], 'Sport');
});
```

- [ ] **Step 5: Run tests, commit**

```bash
git add Code.gs tests/audit.test.js
git commit -m "feat: undo pour Joueurs/Catégories/Barème dans le Journal d'audit"
```

---

### Task 4 : Snapshots — Notes / Phrases

**Files:**
- Modify: `Code.gs` (`apiAddNote`, `apiDeleteNote`, `apiEditNote`, `apiAddPhrase`, `apiSavePhrasesBatch`, `apiUpdatePhrase`, `apiDeletePhrase`, `apiDeletePreset`, `apiRenamePreset`)
- Test: `tests/audit.test.js`

- [ ] **Step 1: Notes**

```js
function apiAddNote(player, text, dateStr, author) {
  try {
    return withLock(() => {
      const note = NotesService.addNote(player, text, dateStr);
      const sheet = ConfigService.getSheets().notes;
      AuditService.log(author, 'Note ajoutée', 'Note: ' + (player || ''),
        '', (player || '') + ' : ' + (text || '').trim(), '',
        { sheet: 'notes', op: 'insert', rowIndex: note.rowIndex,
          after: sheet.getRange(note.rowIndex, 1, 1, 3).getValues()[0] });
      return { success: true, note };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteNote(rowIndex, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().notes;
      const before = _noteRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      NotesService.deleteNote(rowIndex);
      AuditService.log(author, 'Note supprimée', 'Note', before, '', 'ligne #' + rowIndex,
        { sheet: 'notes', op: 'delete', before: beforeRow });
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiEditNote(rowIndex, newText, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().notes;
      const before = _noteRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      NotesService.editNote(rowIndex, newText);
      const afterRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      AuditService.log(author, 'Note modifiée', 'Note', before, (newText || '').trim(),
        'ligne #' + rowIndex,
        { sheet: 'notes', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 2: Phrases**

```js
function apiAddPhrase(preset, pool, text, author) {
  try {
    return withLock(() => {
      PhrasesService.addPhrase(preset, pool, text);
      const sheet = ConfigService.getSheets().phrases;
      const after = '[' + (pool || '') + '] ' + (text || '').trim() + ' (preset: ' + (preset || '') + ')';
      AuditService.log(author, 'Phrase ajoutée', 'Phrases: ' + (preset || ''), '', after, '',
        { sheet: 'phrases', op: 'insert', rowIndex: sheet.getLastRow(),
          after: sheet.getRange(sheet.getLastRow(), 1, 1, 3).getValues()[0] });
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiSavePhrasesBatch(entries, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases || null;
      const startRow = sheet ? sheet.getLastRow() + 1 : null;
      PhrasesService.saveBatch(entries);
      const preset = entries && entries.length ? entries[0].preset : '';
      const finalSheet = ConfigService.getSheets().phrases;
      const addedRows = (startRow && entries && entries.length)
        ? finalSheet.getRange(startRow, 1, entries.length, 3).getValues() : [];
      AuditService.log(author, 'Phrases batch', 'Phrases: ' + (preset || ''), '', '',
        (entries || []).length + ' phrase(s)',
        addedRows.length ? { sheet: 'phrases', op: 'insertMany', rows: addedRows } : null);
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiUpdatePhrase(rowIndex, text, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      const before = _phraseRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      PhrasesService.updatePhrase(rowIndex, text);
      const afterRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      AuditService.log(author, 'Phrase modifiée', 'Phrases', before, (text || '').trim(),
        'ligne #' + rowIndex,
        { sheet: 'phrases', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiDeletePhrase(rowIndex, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      const before = _phraseRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      PhrasesService.deletePhrase(rowIndex);
      AuditService.log(author, 'Phrase supprimée', 'Phrases', before, '', 'ligne #' + rowIndex,
        { sheet: 'phrases', op: 'delete', before: beforeRow });
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiDeletePreset(presetName, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      const removedRows = [];
      if (sheet) {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
          data.forEach(r => { if (r[0].toString() === presetName) removedRows.push(r); });
        }
      }
      PhrasesService.deletePreset(presetName);
      AuditService.log(author, 'Preset supprimé', 'Phrases: ' + (presetName || ''), '', '', '',
        removedRows.length ? { sheet: 'phrases', op: 'deleteMany', rows: removedRows } : null);
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiRenamePreset(oldName, newName, author) {
  try {
    if (!newName || !newName.trim()) throw new Error("Nouveau nom vide.");
    if (oldName === newName.trim()) return { success: true, phrases: PhrasesService.getAll() };
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      if (!sheet) throw new Error("Feuille Phrases introuvable.");
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return { success: true, phrases: [] };
      const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const undoRows = [];
      let modified = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i][0].toString() === oldName) {
          undoRows.push({ rowIndex: i + 2, before: [oldName], after: [newName.trim()] });
          data[i][0] = newName.trim();
          modified = true;
        }
      }
      if (modified) sheet.getRange(2, 1, lastRow - 1, 1).setValues(data);
      AuditService.log(author, 'Preset renommé', 'Phrases', oldName || '', newName.trim(), '',
        undoRows.length ? { sheet: 'phrases', op: 'updateMany', rows: undoRows } : null);
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}
```

Note : le snapshot `updateMany` de `apiRenamePreset` ne restaure que la colonne "Preset" (colonne 1) — cohérent avec `_applySnapshot`'s `updateMany`, qui utilise `r.before.length` pour la largeur de `setValues`, donc restaurer `[oldName]` (1 colonne) fonctionne tel quel.

- [ ] **Step 2: Tests**

```js
test('apiDeletePhrase / undo restores the deleted phrase', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const phrases = makeSheet([['Preset','Pool','Phrase'], ['Défaut', 'first', 'Bravo !']]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases, auditLog: audit
  });
  gas.apiDeletePhrase(2, 'Alice');
  assert.strictEqual(phrases._grid.length, 1);
  gas.apiUndoAuditEntry(2, 'Alice');
  assert.strictEqual(phrases._grid.length, 2);
  assert.strictEqual(phrases._grid[1][2], 'Bravo !');
});

test('apiRenamePreset / undo restores the old preset name', () => {
  const gas   = loadGas();
  const audit = makeAuditSheetV9();
  const phrases = makeSheet([['Preset','Pool','Phrase'], ['Ancien', 'first', 'Bravo !']]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases, auditLog: audit
  });
  gas.apiRenamePreset('Ancien', 'Nouveau', 'Alice');
  assert.strictEqual(phrases._grid[1][0], 'Nouveau');
  gas.apiUndoAuditEntry(2, 'Alice');
  assert.strictEqual(phrases._grid[1][0], 'Ancien');
});
```

- [ ] **Step 3: Run tests, commit**

```bash
git add Code.gs tests/audit.test.js
git commit -m "feat: undo pour Notes/Phrases dans le Journal d'audit"
```

---

### Task 5 : Frontend — diff nettoyé, retrait des boutons morts, bouton Annuler

**Files:**
- Modify: `Index.html` (`renderAuditTable`, `AUDIT_CATEGORIES`/`categorizeAuditAction`, styles `.audit-*`)

**Interfaces:**
- Consumes: `apiGetAuditLog` entries now carrying `id` and `undoable` (Task 1); `apiUndoAuditEntry(auditRowId, author)` (Task 1).

- [ ] **Step 1: Nettoyer le contenu Avant→Après selon l'action**

Dans `Index.html`, ajouter une liste des actions dont l'avant/après n'a pas de valeur informative (`Index.html`, juste avant `renderAuditTable`, ~ligne 7556) :

```js
  // Actions où "avant/après" ne reflète pas un vrai changement de valeur —
  // le contenu utile est déjà dans `detail`, donc on n'affiche rien ici plutôt
  // qu'un fragment sans signification ("" → "3 entrée(s)").
  const AUDIT_NO_DIFF_ACTIONS = new Set([
    'Saisie de points', 'Suppression bulk', 'Nettoyage zéros', 'Nettoyage orphelins',
    'Modification bulk', 'Phrases batch', 'Lots auto-groupés', 'Groupement lot',
    'Dégroupement lot', 'Retrait du groupe', 'Suppression groupe', 'Action annulée'
  ]);
```

Puis, dans `renderAuditTable`, remplacer le bloc `tdDiff` (`Index.html:7674-7687`) :

```js
      const tdDiff = tr.insertCell();
      if (AUDIT_NO_DIFF_ACTIONS.has(log.action)) {
        tdDiff.textContent = '—';
        tdDiff.style.color = 'var(--text-muted)';
      } else if (log.before && log.after) {
        const wrap = document.createElement('div');
        wrap.className = 'audit-before-after';
        const arr = document.createElement('span'); arr.className = 'audit-arrow'; arr.textContent = '→';
        wrap.append(auditDiffValue(log.before, 'audit-before'), arr, auditDiffValue(log.after, 'audit-after'));
        tdDiff.appendChild(wrap);
      } else if (log.before) {
        tdDiff.appendChild(auditDiffValue(log.before, 'audit-before'));
      } else if (log.after) {
        tdDiff.appendChild(auditDiffValue(log.after, 'audit-after'));
      } else {
        tdDiff.textContent = '—';
      }
```

- [ ] **Step 2: Retirer le bouton copier et le clic-pour-filtrer**

Dans `renderAuditTable` :

- Remplacer le bloc "Qui" (`Index.html:7608-7632`, avatar cliquable) par une version non interactive :

```js
      const tdWho = tr.insertCell();
      tdWho.className = 'hist-player-cell';
      if (log.author) {
        const p    = cachedPlayers.find(pl => pl.name === log.author);
        const img  = document.createElement('img');
        img.src    = getAvatarUrl(log.author, p ? p.meta : '');
        img.onerror = () => { img.src = getAvatarUrl(log.author, ''); };
        img.style.cssText = 'width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0;';
        const span = document.createElement('span');
        span.className = 'hist-player-name';
        span.textContent = log.author;
        tdWho.append(img, span);
      } else {
        tdWho.textContent = '—';
      }
```

- Remplacer le bloc "Action" (`Index.html:7635-7652`, bouton cliquable) :

```js
      const tdAction = tr.insertCell();
      if (log.action) {
        const cat = categorizeAuditAction(log.action);
        const pill = document.createElement('span');
        pill.className = 'audit-action-pill audit-cat-' + cat.cls;
        pill.innerHTML = '<span class="audit-action-icon">' + cat.icon + '</span><span>' + escapeHtml(log.action) + '</span>';
        tdAction.appendChild(pill);
      } else {
        tdAction.textContent = '—';
      }
```

- Remplacer le bloc "Entité" (`Index.html:7655-7669`, bouton cliquable) :

```js
      const tdEntity = tr.insertCell();
      tdEntity.style.cssText = 'font-size:0.82rem;color:var(--text-muted);';
      tdEntity.textContent = log.entity || '—';
```

- Supprimer entièrement le bloc "Actions — copier la ligne" (`Index.html:7709-7725`), remplacé au step 3 par le bouton Annuler.

- [ ] **Step 3: Ajouter le bouton "Annuler"**

À la place du bloc copier supprimé au step 2 :

```js
      // Actions — annuler cette action, si un snapshot est disponible et qu'elle
      // n'a pas déjà été annulée.
      const tdActions = tr.insertCell();
      if (log.undoable) {
        const undoBtn = document.createElement('button');
        undoBtn.className = 'small secondary';
        undoBtn.textContent = '↩️ Annuler';
        undoBtn.title = 'Annuler : ' + log.action;
        undoBtn.addEventListener('click', () => {
          if (!confirm('Annuler cette action ("' + log.action + '") ?')) return;
          undoBtn.disabled = true;
          callServer('apiUndoAuditEntry', [log.id, _whoAmI || ''], res => {
            if (res && res.success === false) {
              showToast('Erreur : ' + (res.error || 'Annulation impossible.'), 'error');
              undoBtn.disabled = false;
            } else {
              showToast('Action annulée.', 'success');
              loadAuditLog(_auditCurrentPage);
              loadHistoryPage(currentHistoryPage);
              applyFilters();
            }
          }, 'Annuler action journal');
        });
        tdActions.appendChild(undoBtn);
      }
```

- [ ] **Step 4: Style — vérifier tap target et cohérence**

Dans le bloc CSS `/* ── AUDIT LOG ── */` (`Index.html:2046-2083`), s'assurer que le bouton `.small.secondary` utilisé pour "Annuler" hérite déjà des styles génériques `button.small`/`.secondary` du site (vérifier leur définition globale — ne pas dupliquer de règles). Ajouter uniquement, si absente, une garantie de hauteur tactile minimale pour ce bouton dans le contexte du tableau :

```css
  .audit-row td:last-child { min-width: var(--tap-min); }
```

- [ ] **Step 5: Vérification manuelle (`/verify`)**

Lancer l'app localement ou déployée : provoquer une action simple (ex. ajouter une note), ouvrir Historique → Journal d'audit, vérifier que la ligne "Note ajoutée" n'a pas de fragment inutile en Avant→Après ailleurs que pour les actions concernées, cliquer "Annuler", vérifier que la note disparaît de l'onglet Notes et que le bouton "Annuler" disparaît de la ligne (remplacée par rien, puisque `undoable` redevient `false`).

- [ ] **Step 6: Commit**

```bash
git add Index.html
git commit -m "feat: diff nettoyé, retrait boutons morts, bouton Annuler dans le Journal d'audit"
```

---

### Task 6 : Parité mobile, changelog, vérification finale

**Files:**
- Modify: `Mobile.html` (si le Journal d'audit y existe déjà — vérifier `mHistorySubTab === 'audit'` avant d'éditer)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Vérifier la parité mobile**

Chercher dans `Mobile.html` le rendu du Journal d'audit (probablement `renderAuditShell`/`loadAuditTab`, lecture seule d'après le changelog du 2026-07-09). Si le rendu mobile réutilise une fonction commune avec `Index.html`, les changements de Task 5 se propagent automatiquement. Sinon, appliquer le même nettoyage de diff (Step 1 de Task 5) côté mobile ; **ne pas** ajouter le bouton Annuler côté mobile sans confirmation explicite (règle §7 `context.md` : les outils avancés restent volontairement réduits côté mobile) — ce composant s'écarte de cette règle générale (le mobile n'est pas un "outil avancé"), donc si `Mobile.html` a son propre rendu non partagé, ajouter aussi le bouton Annuler pour rester cohérent avec la parité mobile exigée par `context.md`.

- [ ] **Step 2: CHANGELOG.md**

Ajouter une entrée (format Keep a Changelog, deux voix) :

```markdown
### Ajouté
**Humanisé** : Le Journal d'audit permet maintenant d'annuler directement une action passée (ajout/suppression/modification de points, joueurs, catégories, barème, notes, phrases) grâce à un bouton "↩️ Annuler" sur chaque ligne concernée. Le groupement/dégroupement de lots reste pour l'instant en lecture seule — pas encore assez sûr à annuler automatiquement.
**Technique** : Nouvelle colonne cachée `Snapshot` (JSON) + `AnnuléLe` dans la feuille `AuditLog`. `AuditService.log()` accepte un 7ᵉ paramètre optionnel `snapshot` ; `AuditService.undo()`/`apiUndoAuditEntry()` implémentent un moteur générique de restauration (insert/delete/update/insertMany/deleteMany/updateMany) par recherche de ligne exacte, réutilisé par ~20 sites d'appel. `apiGetAuditLog` expose `id`/`undoable` par entrée.

### Modifié
**Humanisé** : La colonne "Avant → Après" du Journal d'audit n'affiche plus de fragments sans signification (ex. `"" → "3 entrée(s)"`) pour les actions qui n'ont pas de vrai avant/après — cette information reste visible dans la colonne Détail. Le bouton copier la ligne et le clic pour filtrer sur l'auteur/l'action/l'entité ont été retirés (jugés inutiles).
**Technique** : `AUDIT_NO_DIFF_ACTIONS` filtre le rendu de la colonne diff dans `renderAuditTable` (`Index.html`). Cellules Qui/Action/Entité redeviennent non interactives.
```

- [ ] **Step 3: Run full test suite, commit, push**

Run: `npm test`
Expected: all tests pass.

```bash
git add CHANGELOG.md Mobile.html
git commit -m "docs: changelog Journal d'audit + parité mobile"
git push
```
