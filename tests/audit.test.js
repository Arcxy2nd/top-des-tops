'use strict';
const { test } = require('node:test');
const assert   = require('assert');
const { loadGas, makeSheet, injectSheets } = require('./harness.js');

function makeAuditSheet() {
  return makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail']]);
}

function withAuditSheets(gas, auditSheet) {
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => auditSheet, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: auditSheet
  });
}

// ─── AuditService.log ───────────────────────────────────────────────────────────

test('AuditService.log appends one row with all fields', () => {
  const gas   = loadGas();
  const audit = makeAuditSheet();
  withAuditSheets(gas, audit);

  gas.AuditService.log('Alice', 'Saisie de points', 'History', '', '3 entrées', '2026-01-10');

  assert.strictEqual(audit._grid.length, 2);
  const row = audit._grid[1];
  // In a VM sandbox, Date is a different constructor — check duck-typing instead
  assert.ok(row[0] != null && typeof row[0].getTime === 'function', 'timestamp is a Date');
  assert.strictEqual(row[1], 'Alice');
  assert.strictEqual(row[2], 'Saisie de points');
  assert.strictEqual(row[3], 'History');
  assert.strictEqual(row[4], '');
  assert.strictEqual(row[5], '3 entrées');
  assert.strictEqual(row[6], '2026-01-10');
});

test('AuditService.log replaces null/undefined args with empty strings', () => {
  const gas   = loadGas();
  const audit = makeAuditSheet();
  withAuditSheets(gas, audit);

  gas.AuditService.log(null, 'Action', undefined, null, null, null);
  const row = audit._grid[1];
  assert.strictEqual(row[1], '');
  assert.strictEqual(row[3], '');
  assert.strictEqual(row[4], '');
});

test('AuditService.log is completely silent when appendRow throws', () => {
  const gas    = loadGas();
  const broken = { ...makeAuditSheet(), appendRow() { throw new Error('Sheet quota exceeded'); } };
  withAuditSheets(gas, broken);
  assert.doesNotThrow(() => gas.AuditService.log('Alice', 'Test', '', '', '', ''));
});

test('AuditService.log auto-creates AuditLog sheet when absent', () => {
  const gas      = loadGas();
  const newSheet = makeAuditSheet();
  let created    = false;
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => { created = true; return newSheet; }, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: null
  });
  gas.AuditService.log('Bob', 'Test', '', '', '', '');
  assert.ok(created, 'insertSheet was called to create AuditLog');
  assert.strictEqual(newSheet._grid.length, 2);
});

// ─── apiGetAuditLog ─────────────────────────────────────────────────────────────

function makeFilledAuditSheet(rows) {
  // rows: [[author, action, entity, before, after, detail], ...]
  const grid = [['Timestamp','Auteur','Action','Entité','Avant','Après','Détail']];
  rows.forEach((r, i) => {
    const d = new Date('2026-01-' + String(i + 1).padStart(2, '0') + 'T12:00:00');
    grid.push([d, r[0], r[1], r[2], r[3], r[4], r[5]]);
  });
  return makeSheet(grid);
}

test('apiGetAuditLog returns empty result when auditLog sheet is absent', () => {
  const gas = loadGas();
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => makeAuditSheet(), getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: null
  });
  const res = gas.apiGetAuditLog(1, 20, null, null, null, null);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.logs.length, 0);
  assert.strictEqual(res.total, 0);
});

test('apiGetAuditLog returns rows in reverse order (most recent first)', () => {
  const gas   = loadGas();
  const audit = makeFilledAuditSheet([
    ['Alice', 'Action A', '', '', '', ''],
    ['Bob',   'Action B', '', '', '', '']
  ]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: audit
  });
  const res = gas.apiGetAuditLog(1, 20, null, null, null, null);
  assert.strictEqual(res.logs[0].author, 'Bob');    // row 2 (latest) comes first
  assert.strictEqual(res.logs[1].author, 'Alice');
});

test('apiGetAuditLog filters by author', () => {
  const gas   = loadGas();
  const audit = makeFilledAuditSheet([
    ['Alice', 'Action', '', '', '', ''],
    ['Bob',   'Action', '', '', '', ''],
    ['Alice', 'Action', '', '', '', '']
  ]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: audit
  });
  const res = gas.apiGetAuditLog(1, 20, 'Alice', null, null, null);
  assert.strictEqual(res.total, 2);
  assert.ok(res.logs.every(l => l.author === 'Alice'));
});

test('apiGetAuditLog filters by action', () => {
  const gas   = loadGas();
  const audit = makeFilledAuditSheet([
    ['Alice', 'Saisie de points',  '', '', '', ''],
    ['Bob',   'Suppression entrée','', '', '', '']
  ]);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: audit
  });
  const res = gas.apiGetAuditLog(1, 20, null, 'Saisie de points', null, null);
  assert.strictEqual(res.total, 1);
  assert.strictEqual(res.logs[0].action, 'Saisie de points');
});

test('apiGetAuditLog paginates correctly (25 rows, pageSize 20)', () => {
  const gas   = loadGas();
  const rows  = Array.from({ length: 25 }, (_, i) => ['Alice', 'Action ' + i, '', '', '', '']);
  const audit = makeFilledAuditSheet(rows);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: audit
  });
  const page1 = gas.apiGetAuditLog(1, 20, null, null, null, null);
  const page2 = gas.apiGetAuditLog(2, 20, null, null, null, null);
  assert.strictEqual(page1.logs.length, 20);
  assert.strictEqual(page2.logs.length, 5);
  assert.strictEqual(page1.total, 25);
  assert.strictEqual(page2.total, 25);
});

test('apiGetAuditLog filters by date range', () => {
  const gas  = loadGas();
  // 3 entries: Jan 1, Jan 15, Jan 31
  const grid = [['Timestamp','Auteur','Action','Entité','Avant','Après','Détail']];
  grid.push([new Date('2026-01-01T12:00:00'), 'Alice', 'Action', '', '', '', '']);
  grid.push([new Date('2026-01-15T12:00:00'), 'Alice', 'Action', '', '', '', '']);
  grid.push([new Date('2026-01-31T12:00:00'), 'Alice', 'Action', '', '', '', '']);
  const audit = makeSheet(grid);
  injectSheets(gas, {
    spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: audit
  });
  const res = gas.apiGetAuditLog(1, 20, null, null, '2026-01-10', '2026-01-20');
  assert.strictEqual(res.total, 1);
  assert.ok(res.logs[0].timestamp.startsWith('2026-01-15'), 'seule la ligne du 15 janvier passe');
});

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
