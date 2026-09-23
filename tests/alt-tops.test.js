'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER_HIST = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const HEADER_ALT_CAT = ['Name', 'Description', 'Emoji', 'Hex color'];
const HEADER_ALT_HIST = ['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Saiseur'];

const HEADER_ALT_CAT_V2 = ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'];

function altSheets(gas, altRows, altHistRows) {
  const altCategories = makeSheet([HEADER_ALT_CAT].concat(altRows || []));
  const altHistory = makeSheet([HEADER_ALT_HIST].concat(altHistRows || []));
  gas.ConfigService.getSheets = () => ({ altCategories, altHistory });
  return { altCategories, altHistory };
}

test('AltSettingsService auto-creates AltCategories with the Ordre column and reads through SettingsService', () => {
  const gas = loadGas();
  const spreadsheet = {
    insertSheet(name) {
      const sheet = makeSheet([]);
      this._sheets[name] = sheet;
      return sheet;
    },
    _sheets: {}
  };
  gas.ConfigService.getSheets = () => ({
    spreadsheet,
    altCategories: spreadsheet._sheets['AltCategories'] || null
  });

  assert.deepStrictEqual([...gas.AltSettingsService.getAltCategories()], []);
  assert.deepStrictEqual([...spreadsheet._sheets['AltCategories']._grid[0]], HEADER_ALT_CAT_V2);

  gas.SettingsService.addEntity('AltCategories', 'Top 1', 'Premier', '⭐');
  const cats = gas.AltSettingsService.getAltCategories();
  assert.strictEqual(cats.length, 1);
  assert.deepStrictEqual({ ...cats[0] }, { rowIndex: 2, name: 'Top 1', description: 'Premier', emoji: '⭐', color: '' });
});

test('addEntity refuses a duplicate Alt Top name', () => {
  const gas = loadGas();
  altSheets(gas, [['Top 1', '', '⭐', '#ff0000']]);
  assert.throws(() => gas.SettingsService.addEntity('AltCategories', 'Top 1', '', ''), /existe déjà/);
});

test('getAltCategories keeps legacy 4-column sheets readable and sorts by Ordre once set', () => {
  const gas = loadGas();
  const { altCategories } = altSheets(gas, [['B', '', '', ''], ['A', '', '', '']]);
  assert.deepStrictEqual([...gas.AltSettingsService.getAltCategories().map(c => c.name)], ['B', 'A']);
  gas.SettingsService.reorderEntities('AltCategories', [3, 2], ['A', 'B']);
  assert.strictEqual(altCategories._grid[1][4], 2);
  assert.strictEqual(altCategories._grid[2][4], 1);
  assert.deepStrictEqual([...gas.AltSettingsService.getAltCategories().map(c => c.name)], ['A', 'B']);
});

test('renameEntity on an Alt Top cascades to AltHistory column C only', () => {
  const gas = loadGas();
  const { altCategories, altHistory } = altSheets(gas,
    [['Vieux', 'd', '⭐', '#123456']],
    [
      [new Date('2026-08-01'), 'Alice', 'Vieux', 3, '', '2', '', 'Alice'],
      [new Date('2026-08-02'), 'Bob', 'Autre', 1, 'Vieux', '', '', 'Bob']
    ]);
  gas.SettingsService.renameEntity('AltCategories', 2, 'Vieux', 'Neuf', 'd2', '🔥');
  assert.deepStrictEqual([...altCategories._grid[1]].slice(0, 4), ['Neuf', 'd2', '🔥', '#123456']);
  assert.strictEqual(altHistory._grid[1][2], 'Neuf');
  assert.strictEqual(altHistory._grid[2][2], 'Autre');
  assert.strictEqual(altHistory._grid[2][4], 'Vieux');
});

test('renameEntity on an Alt Top refuses homonyms and stale rows', () => {
  const gas = loadGas();
  altSheets(gas, [['Jumeau', '', '', ''], ['Jumeau', '', '', '']]);
  assert.throws(() => gas.SettingsService.renameEntity('AltCategories', 2, 'Jumeau', 'X', '', ''), /Tops alternatifs partagent/);
  assert.throws(() => gas.SettingsService.renameEntity('AltCategories', 2, 'Autre', 'X', '', ''), /a changé entre-temps/);
});

test('deleteEntity on an Alt Top removes only the targeted row and leaves AltHistory untouched', () => {
  const gas = loadGas();
  const { altCategories, altHistory } = altSheets(gas,
    [['A', '', '', ''], ['B', '', '', '']],
    [[new Date('2026-08-01'), 'Alice', 'A', 3, '', '', '', 'Alice']]);
  gas.SettingsService.deleteEntity('AltCategories', 2, 'A');
  assert.deepStrictEqual(altCategories._grid.map(r => r[0]), ['Name', 'B']);
  assert.strictEqual(altHistory._grid.length, 2);
});

test('setEntityColor on an Alt Top writes column D', () => {
  const gas = loadGas();
  const { altCategories } = altSheets(gas, [['A', '', '', '']]);
  gas.SettingsService.setEntityColor('AltCategories', 2, 'A', '#00ff00');
  assert.strictEqual(altCategories._grid[1][3], '#00ff00');
});

test('AltStorageService adds and retrieves entries in AltHistory with refHistoryRowId', () => {
  const gas = loadGas();
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  gas.AltStorageService.addAltEntries([
    { date: '2026-08-01', player: 'Alice', category: 'Alt 1', points: 10, description: 'Test', refHistoryRowId: '2', groupId: 'G10' }
  ]);

  const logs = gas.AltStorageService.getAltLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].player, 'Alice');
  assert.strictEqual(logs[0].category, 'Alt 1');
  assert.strictEqual(logs[0].refHistoryRowId, '2');
  assert.strictEqual(logs[0].groupId, 'G10');
});

test('AltStorageService.addAltEntries drops entries with invalid points instead of writing 0 silently', () => {
  const gas = loadGas();
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  gas.AltStorageService.addAltEntries([
    { date: '2026-08-01', player: 'Alice', category: 'Alt 1', points: 10, refHistoryRowId: '2', groupId: 'G1' },
    { date: '2026-08-01', player: 'Bob',   category: 'Alt 1', points: 0,  refHistoryRowId: '3', groupId: 'G1' },
    { date: '2026-08-01', player: 'Chloé', category: 'Alt 1', points: NaN, refHistoryRowId: '4', groupId: 'G1' }
  ]);

  const logs = gas.AltStorageService.getAltLogs();
  assert.strictEqual(logs.length, 1, 'only the valid entry (Alice) should be written');
  assert.strictEqual(logs[0].player, 'Alice');
  assert.strictEqual(logs[0].points, 10);
});

test('apiGroupSimilarEntries automatically groups identical ungrouped entries', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER_HIST,
    [new Date('2026-08-01T10:00:00Z'), 'Alice', 'Top A', 5, 'Session Mario', ''],
    [new Date('2026-08-01T10:00:00Z'), 'Alice', 'Top B', 5, 'Session Mario', ''],
    [new Date('2026-08-01T12:00:00Z'), 'Bob', 'Top A', 10, 'Solo', '']
  ]);

  gas.ConfigService.getSheets = () => ({ history });

  const result = gas.StorageService.apiGroupSimilarEntries();
  assert.strictEqual(result.groupedCount, 2);
  assert.strictEqual(result.groupsCreated, 1);

  const g1 = history._grid[1][5];
  const g2 = history._grid[2][5];
  const g3 = history._grid[3][5];

  assert.ok(g1 && g1.length > 0);
  assert.strictEqual(g1, g2); // Rows 1 and 2 received same groupId
  assert.strictEqual(g3, ''); // Row 3 stayed ungrouped
});

// Perf (audit cache 2026-08-26) : apiGroupSimilarEntries écrivait le GroupId
// de chaque ligne via un setValue() séparé. Doit maintenant écrire la
// colonne GroupId en un seul setValues() groupé.
test('apiGroupSimilarEntries writes the GroupId column in a single batched call, not one per row', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER_HIST,
    [new Date('2026-08-01T10:00:00Z'), 'Alice', 'Top A', 5, 'Session Mario', ''],
    [new Date('2026-08-01T10:00:00Z'), 'Alice', 'Top B', 5, 'Session Mario', ''],
    [new Date('2026-08-01T12:00:00Z'), 'Bob', 'Top A', 10, 'Solo', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  let setValueCalls = 0;
  const realGetRange = history.getRange.bind(history);
  history.getRange = (...a) => {
    const range = realGetRange(...a);
    const realSetValue = range.setValue.bind(range);
    range.setValue = (...args) => { setValueCalls++; return realSetValue(...args); };
    return range;
  };

  const result = gas.StorageService.apiGroupSimilarEntries();
  assert.strictEqual(result.groupedCount, 2);
  assert.strictEqual(setValueCalls, 0, 'GroupId column must be written via setValues (batched): ' + setValueCalls + ' setValue() calls observed');
  assert.strictEqual(history._grid[1][5], history._grid[2][5]);
  assert.strictEqual(history._grid[3][5], '');
});

test('appendBulkPlan handles subTops and altCategory linking', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER_HIST]);
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ history, altHistory });

  gas.StorageService.appendBulkPlan([
    {
      date: '2026-08-02',
      entries: [
        {
          player: 'Alice',
          category: 'Top A',
          points: 10,
          times: 1,
          description: 'Multi-top test',
          subTops: [{ category: 'Top B', points: 8 }],
          altCategory: 'Alt 1'
        }
      ]
    }
  ]);

  // History should have 2 rows (Top A + Top B)
  assert.strictEqual(history._grid.length, 3);
  const rowA = history._grid[1];
  const rowB = history._grid[2];

  assert.strictEqual(rowA[1], 'Alice');
  assert.strictEqual(rowA[2], 'Top A');
  assert.strictEqual(rowA[3], 10);
  assert.strictEqual(rowB[2], 'Top B');
  assert.strictEqual(rowB[3], 8);
  assert.strictEqual(rowA[5], rowB[5]); // Shared GroupId!

  // AltHistory should have 1 entry linked to Top A (refHistoryRowId = 2)
  const altLogs = gas.AltStorageService.getAltLogs();
  assert.strictEqual(altLogs.length, 1);
  assert.strictEqual(altLogs[0].category, 'Alt 1');
  assert.strictEqual(altLogs[0].points, 10);
  assert.strictEqual(altLogs[0].refHistoryRowId, '2');
});

test('deleting History rows renumbers surviving AltHistory refHistoryRowId and clears deleted refs', () => {
  const gas = loadGas();
  // History rows 2..5 (sheet rows). Row 2 gets deleted; rows 3-5 shift up to 2-4.
  const history = makeSheet([
    HEADER_HIST,
    [new Date('2026-08-01'), 'Alice', 'Top A', 5, 'row2-deleted', ''],
    [new Date('2026-08-02'), 'Bob',   'Top A', 5, 'row3->2', ''],
    [new Date('2026-08-03'), 'Carl',  'Top A', 5, 'row4->3', ''],
    [new Date('2026-08-04'), 'Dave',  'Top A', 5, 'row5->4', '']
  ]);
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 5, 'linked to deleted row', '2', '', ''],
    ['2026-08-02', 'Bob',   'Alt 1', 5, 'linked to row that shifts', '3', '', ''],
    ['2026-08-04', 'Dave',  'Alt 1', 5, 'linked to row that shifts twice', '5', '', '']
  ]);
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ['Tester', '', '', '']]);
  const auditLog = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ history, altHistory, players, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiDeleteHistoryEntries([2], 'Tester');
  assert.strictEqual(res.success, true);

  const refs = altHistory._grid.slice(1).map(r => r[5]);
  assert.strictEqual(refs[0], '', 'ref to the deleted row is cleared, not left dangling on the wrong entry');
  assert.strictEqual(refs[1], '2', 'ref to former row 3 shifts down to 2');
  assert.strictEqual(refs[2], '4', 'ref to former row 5 shifts down to 4');
});

test('linkHistoryRowsToAltCategory preserves the original History entry date', () => {
  const gas = loadGas();
  const originalDate = new Date('2026-03-15T10:00:00');
  const history = makeSheet([
    HEADER_HIST,
    [originalDate, 'Alice', 'Jeux', 5, 'ok', '', '']
  ]);
  const altCategories = makeSheet([HEADER_ALT_CAT, ['AltTop', '', '⭐', '#ff0000']]);
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ history, altCategories, altHistory });
  gas.ConfigService.clearCache = () => {};

  gas.AltStorageService.linkHistoryRowsToAltCategory([2], 'AltTop', 'Alice');

  const writtenDate = new Date(altHistory._grid[1][0]);
  assert.strictEqual(writtenDate.getTime(), originalDate.getTime(),
    'the Alt entry must carry the original History date, not the linking timestamp');
});

