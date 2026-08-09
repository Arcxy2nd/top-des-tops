'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER_HIST = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const HEADER_ALT_HIST = ['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Saiseur'];

test('AltStorageService.getAltHistoryMap maps refHistoryRowId to Alt Categories', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 10, 'Desc 1', '2', 'G1', 'Admin'],
    ['2026-08-01', 'Alice', 'Alt 2', 10, 'Desc 1', '2', 'G1', 'Admin'],
    ['2026-08-02', 'Bob', 'Alt 1', 5, 'Desc 2', '3', 'G2', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  const map = gas.AltStorageService.getAltHistoryMap();
  assert.deepEqual(Array.from(map['2']), ['Alt 1', 'Alt 2']);
  assert.deepEqual(Array.from(map['3']), ['Alt 1']);
  assert.strictEqual(map['4'], undefined);
});

test('linkHistoryRowsToAltCategory avoids duplicate links for same refHistoryRowId and Alt Category', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER_HIST,
    [new Date('2026-08-01T10:00:00Z'), 'Alice', 'Top Main', 10, 'Match 1', '', 'Admin']
  ]);
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 10, 'Match 1', '2', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ history, altHistory });

  // Try linking row 2 to 'Alt 1' again
  const count = gas.AltStorageService.linkHistoryRowsToAltCategory([2], 'Alt 1', 'Admin');
  assert.strictEqual(count, 0); // Duplicate ignored

  // Link row 2 to 'Alt 2' (new)
  const count2 = gas.AltStorageService.linkHistoryRowsToAltCategory([2], 'Alt 2', 'Admin');
  assert.strictEqual(count2, 1);
});

test('unlinkHistoryRowsFromAltCategory removes alt entries without touching main history', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER_HIST,
    [new Date('2026-08-01T10:00:00Z'), 'Alice', 'Top Main', 10, 'Match 1', '', 'Admin']
  ]);
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 10, 'Match 1', '2', '', 'Admin'],
    ['2026-08-01', 'Alice', 'Alt 2', 10, 'Match 1', '2', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ history, altHistory });

  const unlinked = gas.AltStorageService.unlinkHistoryRowsFromAltCategory([2], 'Alt 1', 'Admin');
  assert.strictEqual(unlinked, 1);

  const remaining = gas.AltStorageService.getAltLogs();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].category, 'Alt 2');

  // Ensure main history remained untouched
  assert.strictEqual(history._grid.length, 2);
});

test('unlinkHistoryRowsFromAltCategory ignores AltHistory row indexes', () => {
  const gas = loadGas();
  // Row 2 of AltHistory is native (no ref). Unlinking History row 2 must not touch it.
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 7, 'Native', '', '', 'Admin'],
    ['2026-08-01', 'Bob', 'Alt 1', 3, 'Linked', '2', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  const unlinked = gas.AltStorageService.unlinkHistoryRowsFromAltCategory([2], 'Alt 1', 'Admin');
  assert.strictEqual(unlinked, 1);

  const remaining = gas.AltStorageService.getAltLogs();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].description, 'Native');
});

test('deleteNativeAltEntry removes a native row and refuses a linked one', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 7, 'Native', '', '', 'Admin'],
    ['2026-08-01', 'Bob', 'Alt 1', 3, 'Linked', '2', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  assert.throws(
    () => gas.AltStorageService.deleteNativeAltEntry(3, 'Alt 1', null),
    /liee a l'historique principal|liée à l'historique principal/
  );

  const count = gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Alice', points: 7 });
  assert.strictEqual(count, 1);

  const remaining = gas.AltStorageService.getAltLogs();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].description, 'Linked');
});

test('deleteNativeAltEntry refuses when the guard no longer matches the row', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 7, 'Native', '', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  assert.throws(
    () => gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Bob', points: 7 }),
    /rechargez la liste/
  );
  assert.throws(
    () => gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 2', { player: 'Alice', points: 7 }),
    /n'appartient pas/
  );
  assert.strictEqual(gas.AltStorageService.getAltLogs().length, 1);
});
