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

  const removed = gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Alice', points: 7 });
  assert.strictEqual(removed[1], 'Alice');

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

test('addNativeAltEntries writes an empty refHistoryRowId and flags the row as native', () => {
  const gas = loadGas();
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ altHistory });
  gas.SettingsService.getEntities = () => [{ name: 'Alice' }];
  gas.AltSettingsService.getAltCategories = () => [{ name: 'Alt 1' }];

  const count = gas.AltStorageService.addNativeAltEntries([
    { player: 'Alice', altCategory: 'Alt 1', points: 5, date: '2026-08-01', description: 'Direct', saiseur: 'Alice' }
  ]);
  assert.strictEqual(count, 1);

  const logs = gas.AltStorageService.getAltLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].refHistoryRowId, '');
  assert.strictEqual(logs[0].isNative, true);
  assert.strictEqual(logs[0].points, 5);
});

test('addNativeAltEntries rejects invalid player, alt category, points and date', () => {
  const gas = loadGas();
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ altHistory });
  gas.SettingsService.getEntities = () => [{ name: 'Alice' }];
  gas.AltSettingsService.getAltCategories = () => [{ name: 'Alt 1' }];

  const base = { player: 'Alice', altCategory: 'Alt 1', points: 5, date: '2026-08-01' };
  assert.throws(() => gas.AltStorageService.addNativeAltEntries([Object.assign({}, base, { player: 'Ghost' })]), /Joueur invalide/);
  assert.throws(() => gas.AltStorageService.addNativeAltEntries([Object.assign({}, base, { altCategory: 'Nope' })]), /Top Alternatif invalide/);
  assert.throws(() => gas.AltStorageService.addNativeAltEntries([Object.assign({}, base, { points: 0 })]), /points doivent/);
  assert.throws(() => gas.AltStorageService.addNativeAltEntries([Object.assign({}, base, { date: 'pas-une-date' })]), /Date invalide/);

  // Nothing was written: validation runs before the single setValues() call.
  assert.strictEqual(gas.AltStorageService.getAltLogs().length, 0);
});

test('deleteNativeAltEntry returns the removed row so the deletion can be undone', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 7, 'Native', '', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  const removed = gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Alice', points: 7 });
  assert.ok(Array.isArray(removed), 'the removed row must be returned');
  assert.strictEqual(removed.length, 8);
  assert.strictEqual(removed[1], 'Alice');
  assert.strictEqual(removed[3], 7);
  assert.strictEqual(gas.AltStorageService.getAltLogs().length, 0);
});

test('deleteNativeAltEntry refuses when the guard date no longer matches', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 1, 'Premier', '', '', 'Admin'],
    ['2026-08-02', 'Alice', 'Alt 1', 1, 'Second',  '', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  // Same player, same points: only the date tells the two rows apart.
  assert.throws(
    () => gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Alice', points: 1, date: '2026-08-02' }),
    /rechargez la liste/
  );
  assert.strictEqual(gas.AltStorageService.getAltLogs().length, 2);
});
