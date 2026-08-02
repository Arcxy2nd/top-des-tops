'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER_HIST = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const HEADER_ALT_CAT = ['Name', 'Description', 'Emoji', 'Hex color'];
const HEADER_ALT_HIST = ['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Saiseur'];

test('AltSettingsService auto-creates AltCategories sheet and performs CRUD', () => {
  const gas = loadGas();
  const spreadsheet = {
    insertSheet(name) {
      const sheet = makeSheet([HEADER_ALT_CAT]);
      this._sheets[name] = sheet;
      return sheet;
    },
    _sheets: {}
  };
  gas.ConfigService.getSheets = () => ({
    spreadsheet,
    altCategories: spreadsheet._sheets['AltCategories'] || null
  });

  const cats = gas.AltSettingsService.getAltCategories();
  assert.deepStrictEqual(cats, []);

  gas.AltSettingsService.saveAltCategories([
    { name: 'Top 1', description: 'Premier top alt', emoji: '⭐', color: '#ff0000' }
  ]);

  gas.ConfigService.getSheets = () => ({
    spreadsheet,
    altCategories: spreadsheet._sheets['AltCategories']
  });

  const catsAfter = gas.AltSettingsService.getAltCategories();
  assert.strictEqual(catsAfter.length, 1);
  assert.strictEqual(catsAfter[0].name, 'Top 1');
  assert.strictEqual(catsAfter[0].emoji, '⭐');
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
