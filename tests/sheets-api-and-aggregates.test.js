'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HISTORY_HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const PLAYERS_HEADER = ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'];
const CATEGORIES_HEADER = ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'];
const AGGREGATES_HEADER = ['Type', 'Key1', 'Key2', 'Key3', 'Points', 'Count', 'Meta'];

// ─── 1. _parseDateCell & _fetchSheetValues ─────────────────────────────────────

test('_parseDateCell parses serial dates, ISO strings, European strings and Date objects', () => {
  const gas = loadGas();
  const parse = gas._parseDateCell;

  // Real Sheets serial date for 2024-09-05 (45540 days since 1899-12-30)
  const dSerial = parse(45540);
  assert.strictEqual(dSerial.getFullYear(), 2024);
  assert.strictEqual(dSerial.getMonth(), 8); // 0-indexed September
  assert.strictEqual(dSerial.getDate(), 5);

  // Date instance
  const now = new Date();
  assert.strictEqual(parse(now).getTime(), now.getTime());

  // ISO string
  const dIso = parse('2025-06-12T15:30:00Z');
  assert.strictEqual(dIso.getUTCFullYear(), 2025);
  assert.strictEqual(dIso.getUTCMonth(), 5); // June
  assert.strictEqual(dIso.getUTCDate(), 12);

  // European DD/MM/YYYY string
  const dEur = parse('25/12/2024');
  assert.strictEqual(dEur.getFullYear(), 2024);
  assert.strictEqual(dEur.getMonth(), 11);
  assert.strictEqual(dEur.getDate(), 25);

  // European DD/MM/YYYY with time
  const dEurTime = parse('25/12/2024 14:30:00');
  assert.strictEqual(dEurTime.getFullYear(), 2024);
  assert.strictEqual(dEurTime.getMonth(), 11);
  assert.strictEqual(dEurTime.getDate(), 25);
  assert.strictEqual(dEurTime.getHours(), 14);

  // Invalid / empty
  assert.ok(isNaN(parse('').getTime()));
  assert.ok(isNaN(parse(null).getTime()));
  assert.ok(isNaN(parse('invalid').getTime()));
});

test('_fetchSheetValues uses Sheets API v4 when available and falls back to SpreadsheetApp', () => {
  let v4Called = false;
  const mockV4 = {
    Spreadsheets: {
      Values: {
        get: (ssId, range, opt) => {
          v4Called = true;
          return {
            values: [
              ['Header1', 'Header2'],
              ['Val1'] // missing 2nd column in row 2
            ]
          };
        }
      }
    }
  };

  const gasWithV4 = loadGas({
    Sheets: mockV4,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k === 'SPREADSHEET_ID' ? 'test_ss_id' : null)
      })
    }
  });
  const sheetMock = makeSheet([['Header1', 'Header2'], ['Val1', 'Val2']], 'TestSheet');
  const values = gasWithV4._fetchSheetValues('test', sheetMock, 2);

  assert.strictEqual(v4Called, true);
  assert.strictEqual(values.length, 2);
  assert.strictEqual(values[1][0], 'Val1');
  assert.strictEqual(values[1][1], '', 'Second column was padded with empty string');

  // Fallback when Sheets API throws
  const mockThrowingV4 = {
    Spreadsheets: {
      Values: {
        get: () => { throw new Error('API Quota Exceeded'); }
      }
    }
  };
  const gasFallback = loadGas({
    Sheets: mockThrowingV4,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k === 'SPREADSHEET_ID' ? 'test_ss_id' : null)
      })
    }
  });
  const fallbackSheet = makeSheet([['A', 'B'], ['1', '2']], 'FallbackSheet');
  const fbValues = gasFallback._fetchSheetValues('test', fallbackSheet, 2);
  assert.strictEqual(fbValues.length, 2);
  assert.strictEqual(fbValues[1][0], '1');
  assert.strictEqual(fbValues[1][1], '2');
});

// ─── 2. AggregatesService Materialized View Calculation & Cache ────────────────

test('AggregatesService.rebuild generates accurate aggregates and snapshot', () => {
  const gas = loadGas();
  const d1 = new Date(2026, 0, 15, 10, 0, 0); // Jan 15 2026
  const d2 = new Date(2026, 0, 20, 14, 0, 0); // Jan 20 2026
  const d3 = new Date(2026, 1, 5, 18, 0, 0);  // Feb 5 2026

  const history = makeSheet([
    HISTORY_HEADER,
    [d1, 'Alice', 'Jeux', 10, 'Partie 1', '', ''],
    [d2, 'Bob',   'Jeux', 25, 'Partie 2', '', ''],
    [d3, 'Alice', 'Défis', 5, 'Défi 1', '', '']
  ], 'History');

  const aggregates = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const players = makeSheet([PLAYERS_HEADER, ['Alice', '', '#ff0000', '', 1], ['Bob', '', '#00ff00', '', 2]], 'Players');
  const categories = makeSheet([CATEGORIES_HEADER, ['Jeux', '', '🎮', '#111', 1], ['Défis', '', '⚡', '#222', 2]], 'Categories');

  gas.ConfigService.getSheets = () => ({ history, aggregates, players, categories });

  const agg = gas.AggregatesService.rebuild();

  assert.strictEqual(agg.totalEntries, 3);
  assert.strictEqual(agg.totalPoints, 40);

  // Totals by player
  assert.strictEqual(agg.byPlayer['Alice'], 15);
  assert.strictEqual(agg.byPlayer['Bob'], 25);

  // Totals by category
  assert.strictEqual(agg.byCategory['Jeux'], 35);
  assert.strictEqual(agg.byCategory['Défis'], 5);

  // Totals by player & category
  assert.strictEqual(agg.byPlayerCategory['Alice']['Jeux'], 10);
  assert.strictEqual(agg.byPlayerCategory['Alice']['Défis'], 5);
  assert.strictEqual(agg.byPlayerCategory['Bob']['Jeux'], 25);

  // Monthly buckets
  assert.strictEqual(agg.byMonth['2026-01'].points, 35);
  assert.strictEqual(agg.byMonth['2026-01'].count, 2);
  assert.strictEqual(agg.byMonth['2026-02'].points, 5);
  assert.strictEqual(agg.byMonth['2026-02'].count, 1);

  // Best & Last
  assert.strictEqual(agg.globalBest.player, 'Bob');
  assert.strictEqual(agg.globalBest.points, 25);
  assert.strictEqual(agg.lastEvent.player, 'Alice');
  assert.strictEqual(agg.lastEvent.category, 'Défis');

  // Verify Aggregates sheet was populated
  const g = aggregates._grid;
  assert.ok(g.length > 5, 'Aggregates sheet should contain materialized rows');
  assert.strictEqual(g[1][0], 'SNAPSHOT');
  assert.strictEqual(g[1][4], 40); // totalPoints
  assert.strictEqual(g[1][5], 3);  // totalEntries
  const snap = JSON.parse(g[1][6]);
  assert.strictEqual(snap.totalPoints, 40);
  assert.strictEqual(snap.byPlayer['Alice'], 15);
});

test('AggregatesService.getAggregates reads from cached snapshot without scanning History', () => {
  const gas = loadGas();
  let historyScanned = false;
  const history = makeSheet([HISTORY_HEADER], 'History');
  const origGetDataRange = history.getDataRange;
  history.getDataRange = function() {
    historyScanned = true;
    return origGetDataRange.apply(this, arguments);
  };

  const precomputedAgg = {
    byPlayer: { 'Alice': 50, 'Bob': 30 },
    byCategory: { 'Jeux': 80 },
    byPlayerCategory: { 'Alice': { 'Jeux': 50 }, 'Bob': { 'Jeux': 30 } },
    byMonth: { '2026-03': { points: 80, count: 4 } },
    lastEvent: { player: 'Bob', category: 'Jeux', points: 10, date: '2026-03-01T12:00:00.000Z' },
    globalBest: { player: 'Alice', points: 40, dateStr: '2026-03-01' },
    totalEntries: 4,
    totalPoints: 80
  };

  const aggregates = makeSheet([
    AGGREGATES_HEADER,
    ['SNAPSHOT', '', '', '', 80, 4, JSON.stringify(precomputedAgg)]
  ], 'Aggregates');

  gas.ConfigService.getSheets = () => ({ history, aggregates });

  const agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(historyScanned, false, 'History sheet must not be touched when SNAPSHOT is present');
  assert.strictEqual(agg.byPlayer['Alice'], 50);
  assert.strictEqual(agg.byPlayer['Bob'], 30);
  assert.strictEqual(agg.totalPoints, 80);
});

// ─── 3. Incremental Maintenance ───────────────────────────────────────────────

test('apiAddBulkPlan increments aggregates in place', () => {
  const gas = loadGas();
  const history = makeSheet([HISTORY_HEADER], 'History');
  const aggregates = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const players = makeSheet([PLAYERS_HEADER, ['Alice', '', '#ff0000', 'pwd1', 1]], 'Players');
  const categories = makeSheet([CATEGORIES_HEADER, ['Jeux', '', '🎮', '#111', 1]], 'Categories');
  const auditLog = makeSheet([], 'AuditLog');

  gas.ConfigService.getSheets = () => ({ history, aggregates, players, categories, auditLog });
  gas.AggregatesService.rebuild();

  const plan = [{
    date: '2026-04-10',
    entries: [{ player: 'Alice', category: 'Jeux', points: 15, times: 2, description: 'Test' }]
  }];

  const res = gas.apiAddBulkPlan(plan, 'Alice', 'pwd1');
  assert.strictEqual(res.success, true);

  const agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(agg.totalEntries, 1);
  assert.strictEqual(agg.totalPoints, 30); // 15 * 2
  assert.strictEqual(agg.byPlayer['Alice'], 30);
  assert.strictEqual(agg.byCategory['Jeux'], 30);
  assert.strictEqual(agg.byMonth['2026-04'].points, 30);
  assert.strictEqual(agg.byMonth['2026-04'].count, 1);
  assert.strictEqual(agg.globalBest.points, 30);
  assert.strictEqual(agg.lastEvent.player, 'Alice');
});

test('apiUpdateHistoryEntry adjusts aggregates in place', () => {
  const gas = loadGas();
  const d = new Date(2026, 4, 1, 12, 0, 0);
  const history = makeSheet([
    HISTORY_HEADER,
    [d, 'Alice', 'Jeux', 20, 'Initial', '', '']
  ], 'History');
  const aggregates = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const players = makeSheet([PLAYERS_HEADER, ['Alice', '', '#f00', 'pwd1', 1]], 'Players');
  const categories = makeSheet([CATEGORIES_HEADER, ['Jeux', '', '🎮', '#111', 1], ['Défis', '', '⚡', '#222', 2]], 'Categories');
  const auditLog = makeSheet([], 'AuditLog');

  gas.ConfigService.getSheets = () => ({ history, aggregates, players, categories, auditLog });
  gas.AggregatesService.rebuild();

  assert.strictEqual(gas.AggregatesService.getAggregates().byPlayer['Alice'], 20);

  // Edit line 2: change points from 20 to 35, and category to Défis
  gas.apiUpdateHistoryEntry(2, {
    date: '2026-05-01',
    player: 'Alice',
    category: 'Défis',
    points: 35,
    description: 'Updated'
  }, 'Alice', 'pwd1');

  const agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(agg.totalPoints, 35);
  assert.strictEqual(agg.byPlayer['Alice'], 35);
  assert.strictEqual(agg.byCategory['Jeux'], 0);
  assert.strictEqual(agg.byCategory['Défis'], 35);
  assert.strictEqual(agg.byPlayerCategory['Alice']['Défis'], 35);
});

test('apiDeleteHistoryEntries and apiDeleteGroup update aggregates', () => {
  const gas = loadGas();
  const d1 = new Date(2026, 5, 1, 12, 0, 0);
  const d2 = new Date(2026, 5, 2, 12, 0, 0);
  const d3 = new Date(2026, 5, 3, 12, 0, 0);

  const history = makeSheet([
    HISTORY_HEADER,
    [d1, 'Alice', 'Jeux', 10, 'Line 1', 'G1', ''],
    [d2, 'Alice', 'Jeux', 20, 'Line 2', 'G1', ''],
    [d3, 'Bob',   'Jeux', 15, 'Line 3', 'G2', '']
  ], 'History');
  const aggregates = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const players = makeSheet([PLAYERS_HEADER, ['Alice', '', '#f00', 'pwd1', 1], ['Bob', '', '#0f0', 'pwd2', 2]], 'Players');
  const categories = makeSheet([CATEGORIES_HEADER, ['Jeux', '', '🎮', '#111', 1]], 'Categories');
  const auditLog = makeSheet([], 'AuditLog');

  gas.ConfigService.getSheets = () => ({ history, aggregates, players, categories, auditLog });
  gas.AggregatesService.rebuild();

  assert.strictEqual(gas.AggregatesService.getAggregates().totalPoints, 45);

  // Delete line 4 (Bob's entry)
  gas.apiDeleteHistoryEntries([4], 'Alice', 'pwd1');
  let agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(agg.totalPoints, 30);
  assert.strictEqual(agg.byPlayer['Bob'], 0);
  assert.strictEqual(agg.byPlayer['Alice'], 30);

  // Delete group G1 (Alice's two entries)
  gas.apiDeleteGroup('G1', 'Alice', 'pwd1');
  agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(agg.totalPoints, 0);
  assert.strictEqual(agg.byPlayer['Alice'], 0);
});

// ─── 4. Consumer Endpoints Reading Aggregates ──────────────────────────────────

test('Dashboard endpoints read precalculated aggregates without scanning History', () => {
  const gas = loadGas();
  let historyScanned = false;
  const history = makeSheet([HISTORY_HEADER], 'History');
  history.getRange = function() {
    historyScanned = true;
    return makeSheet([]).getRange(1, 1, 1, 1);
  };

  const precomputedAgg = {
    byPlayer: { 'Alice': 100, 'Bob': 60 },
    byCategory: { 'Jeux': 120, 'Défis': 40 },
    byPlayerCategory: {
      'Alice': { 'Jeux': 70, 'Défis': 30 },
      'Bob':   { 'Jeux': 50, 'Défis': 10 }
    },
    byMonth: {
      [`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`]: { points: 160, count: 5 }
    },
    lastEvent: { player: 'Alice', category: 'Jeux', points: 25, date: '2026-09-01T12:00:00.000Z' },
    globalBest: { player: 'Alice', points: 40, dateStr: '2026-09-01' },
    totalEntries: 5,
    totalPoints: 160
  };

  const aggregates = makeSheet([
    AGGREGATES_HEADER,
    ['SNAPSHOT', '', '', '', 160, 5, JSON.stringify(precomputedAgg)]
  ], 'Aggregates');

  const players = makeSheet([
    PLAYERS_HEADER,
    ['Alice', '', '#ff0000', '', 1],
    ['Bob',   '', '#00ff00', '', 2]
  ], 'Players');
  const categories = makeSheet([
    CATEGORIES_HEADER,
    ['Jeux',  '', '🎮', '#111', 1],
    ['Défis', '', '⚡', '#222', 2]
  ], 'Categories');

  gas.ConfigService.getSheets = () => ({ history, aggregates, players, categories });

  // 1) apiGetQuickStats
  const qs = gas.apiGetQuickStats('main');
  assert.strictEqual(qs.success, true);
  assert.strictEqual(qs.stats.leader.player, 'Alice');
  assert.strictEqual(qs.stats.leader.points, 100);
  assert.strictEqual(qs.stats.chaser.player, 'Bob');
  assert.strictEqual(qs.stats.chaser.points, 60);
  assert.strictEqual(qs.stats.gap, 40);
  assert.strictEqual(qs.stats.monthCount, 5);
  assert.strictEqual(qs.stats.lastEvent.player, 'Alice');
  assert.strictEqual(qs.stats.globalBest.player, 'Alice');

  // 2) apiGetPlayerTotals (no date filter)
  const pt = gas.apiGetPlayerTotals(['Alice', 'Bob'], null, null);
  assert.strictEqual(pt.success, true);
  assert.strictEqual(pt.chartData.datasets[0].data[0], 100); // Alice
  assert.strictEqual(pt.chartData.datasets[0].data[1], 60);  // Bob

  // 3) AnalyticsService.getFilteredChartData (no date filter)
  const cd = gas.AnalyticsService.getFilteredChartData(['Alice', 'Bob'], ['Jeux', 'Défis'], null, null);
  assert.strictEqual(cd.datasets[0].label, 'Jeux');
  assert.strictEqual(cd.datasets[0].data[0], 70); // Alice Jeux
  assert.strictEqual(cd.datasets[0].data[1], 50); // Bob Jeux
  assert.strictEqual(cd.datasets[1].label, 'Défis');
  assert.strictEqual(cd.datasets[1].data[0], 30); // Alice Défis
  assert.strictEqual(cd.datasets[1].data[1], 10); // Bob Défis

  assert.strictEqual(historyScanned, false, 'History sheet must not be scanned when aggregates are precalculated');
});

// ─── 5. apiRebuildAggregates Endpoint ──────────────────────────────────────────

test('apiRebuildAggregates requires identity, logs to AuditLog, and recalculates', () => {
  const gas = loadGas();
  const d = new Date(2026, 8, 1, 10, 0, 0);
  const history = makeSheet([
    HISTORY_HEADER,
    [d, 'Alice', 'Jeux', 50, 'Grand chelem', '', '']
  ], 'History');
  const aggregates = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const players = makeSheet([PLAYERS_HEADER, ['Alice', '', '#f00', 'secret', 1]], 'Players');
  const categories = makeSheet([CATEGORIES_HEADER, ['Jeux', '', '🎮', '#111', 1]], 'Categories');
  const auditLog = makeSheet([], 'AuditLog');

  gas.ConfigService.getSheets = () => ({ history, aggregates, players, categories, auditLog });

  // Authentication check
  const failRes = gas.apiRebuildAggregates('Alice', 'wrongpwd');
  assert.strictEqual(failRes.success, false);

  // Success rebuild
  const res = gas.apiRebuildAggregates('Alice', 'secret');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.aggregates.totalPoints, 50);
  assert.strictEqual(res.aggregates.byPlayer['Alice'], 50);

  // Check audit log entry
  const logs = auditLog._grid;
  assert.ok(logs.some(r => r[2] === 'Recalcul agrégats' && r[1] === 'Alice'));
});

// ─── 6. Reviewer Edge Cases & Bug Fixes ──────────────────────────────────────

test('_parseDateCell rejects zero, negative, and sub-1000 serial numbers as Invalid Date', () => {
  const gas = loadGas();
  const parse = gas._parseDateCell;

  assert.ok(isNaN(parse(0).getTime()), '0 must be an Invalid Date, not Dec 30 1899');
  assert.ok(isNaN(parse(-10).getTime()), 'negative numbers must be Invalid Date');
  assert.ok(isNaN(parse(500).getTime()), 'numbers below 1000 must be Invalid Date');
  assert.ok(isNaN(parse(Infinity).getTime()), 'Infinity must be Invalid Date');
  assert.ok(isNaN(parse(NaN).getTime()), 'NaN must be Invalid Date');
});

test('_fetchSheetValues pads rows to CANONICAL_SHEET_HEADERS length and converts null/undefined to empty string', () => {
  const mockV4 = {
    Spreadsheets: {
      Values: {
        get: () => ({
          values: [
            ['Alice', null], // row with only 2 columns and a null cell
            [undefined, 'avatar.png']
          ]
        })
      }
    }
  };

  const gas = loadGas({
    Sheets: mockV4,
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => 'ss_id' })
    }
  });

  const sheet = makeSheet([], 'Players');
  // For 'players', CANONICAL_SHEET_HEADERS has 5 columns: Name, Avatar, Color, Password, Ordre
  const values = gas._fetchSheetValues('players', sheet);

  assert.strictEqual(values.length, 2);
  assert.strictEqual(values[0].length, 5, 'Must be padded to 5 columns matching canonical headers');
  assert.strictEqual(values[0][0], 'Alice');
  assert.strictEqual(values[0][1], '', 'null must be converted to empty string');
  assert.strictEqual(values[0][2], '', 'missing col 3 must be empty string');
  assert.strictEqual(values[0][3], '', 'missing col 4 must be empty string');
  assert.strictEqual(values[0][4], '', 'missing col 5 must be empty string');
  assert.strictEqual(values[1][0], '', 'undefined must be converted to empty string');
});

test('AggregatesService cache is retained across requests and not evicted by _bumpLogsVersion', () => {
  const gas = loadGas();
  const history = makeSheet([
    HISTORY_HEADER,
    [new Date(2026, 4, 1), 'Alice', 'Jeux', 10, '', '', '']
  ], 'History');
  const aggregates = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const players = makeSheet([PLAYERS_HEADER, ['Alice', '', '#f00', 'pwd1', 1]], 'Players');
  const categories = makeSheet([CATEGORIES_HEADER, ['Jeux', '', '🎮', '#111', 1]], 'Categories');
  const auditLog = makeSheet([], 'AuditLog');

  gas.ConfigService.getSheets = () => ({ history, aggregates, players, categories, auditLog });
  gas.AggregatesService.rebuild();

  // Perform a mutation which internally increments aggregates AND bumps logs version
  gas.apiAddBulkPlan([{
    date: '2026-04-10',
    entries: [{ player: 'Alice', category: 'Jeux', points: 20, times: 1, description: 'New' }]
  }], 'Alice', 'pwd1');

  // Clear in-memory singleton to simulate a fresh GAS execution context
  gas.AggregatesService.clearCache = () => {}; // keep cache store intact
  gas.AggregatesService.clearMemoryOnly = () => {};

  // Track if sheet is accessed
  let sheetRead = false;
  const origFetch = gas._fetchSheetValues;
  gas._fetchSheetValues = function(key) {
    if (key === 'aggregates') sheetRead = true;
    return origFetch.apply(this, arguments);
  };

  // getAggregates should HIT CacheService directly without reading the Aggregates sheet
  const agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(sheetRead, false, 'Aggregates should be read directly from CacheService without sheet RPC');
  assert.strictEqual(agg.totalPoints, 30);
});

test('apiUpdateHistoryEntry triggers rebuild when new entry has date newer than lastEvent', () => {
  const gas = loadGas();
  const dOld = new Date(2026, 0, 10);
  const history = makeSheet([
    HISTORY_HEADER,
    [dOld, 'Alice', 'Jeux', 10, 'Old', '', ''],
    [new Date(2026, 1, 1), 'Bob', 'Jeux', 15, 'CurrentLast', '', '']
  ], 'History');
  const aggregates = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const players = makeSheet([PLAYERS_HEADER, ['Alice', '', '#f00', 'pwd', 1], ['Bob', '', '#0f0', 'pwd', 2]], 'Players');
  const categories = makeSheet([CATEGORIES_HEADER, ['Jeux', '', '🎮', '#111', 1]], 'Categories');
  const auditLog = makeSheet([], 'AuditLog');

  gas.ConfigService.getSheets = () => ({ history, aggregates, players, categories, auditLog });
  gas.AggregatesService.rebuild();

  assert.strictEqual(gas.AggregatesService.getAggregates().lastEvent.player, 'Bob');

  // Edit Alice's row (row 2) to June 2026 (newer than Bob's date) via apiUpdateHistoryEntry
  gas.apiUpdateHistoryEntry(2, {
    date: '2026-06-20',
    player: 'Alice',
    category: 'Jeux',
    points: 10,
    description: 'Updated to future'
  }, 'Alice', 'pwd');

  const agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(agg.lastEvent.player, 'Alice', 'lastEvent should now be Alice after updating entry date');
});

test('deleteOrphans cleans deleted entity rows and rebuilds aggregates', () => {
  const gas = loadGas();
  const history = makeSheet([
    HISTORY_HEADER,
    [new Date(2026, 0, 1), 'Alice', 'Jeux', 20, '', '', ''],
    [new Date(2026, 0, 2), 'Bob', 'Jeux', 10, '', '', '']
  ], 'History');
  const aggregates = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const players = makeSheet([PLAYERS_HEADER, ['Alice', '', '#f00', 'pwd', 1], ['Bob', '', '#0f0', 'pwd', 2]], 'Players');
  const categories = makeSheet([CATEGORIES_HEADER, ['Jeux', '', '🎮', '#111', 1]], 'Categories');
  const auditLog = makeSheet([], 'AuditLog');
  const spreadsheet = { getSheetByName: () => null, deleteSheet: () => {} };
  history.copyTo = () => ({ setName() {} });
  gas.ConfigService.getSheets = () => ({ spreadsheet, history, aggregates, players, categories, auditLog });
  gas.AggregatesService.rebuild();

  assert.strictEqual(gas.AggregatesService.getAggregates().byPlayer['Bob'], 10);

  // Delete Bob from players sheet
  gas.SettingsService.deleteEntity('Players', 3, 'Bob');

  // Run deleteOrphans to clean orphaned Bob rows from History
  gas.apiDeleteOrphans('Alice', 'pwd');

  const agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(agg.byPlayer['Bob'], undefined, 'Deleted and orphaned player Bob should no longer be present in byPlayer');
  assert.strictEqual(agg.totalPoints, 20);
});

test('Index.html declares apiRebuildAggregates in _MUTATING_APIS', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

  // Find _MUTATING_APIS definition
  const match = html.match(/const _MUTATING_APIS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(match, '_MUTATING_APIS must exist in Index.html');
  assert.ok(match[1].includes("'apiRebuildAggregates'"), 'apiRebuildAggregates must be in _MUTATING_APIS');
});

