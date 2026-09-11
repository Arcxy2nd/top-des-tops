'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HISTORY_HEADER = ['Date', 'Joueur', 'Top', 'Points', 'Description', 'GroupeId', 'Saiseur'];
const PLAYERS_HEADER = ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'];
const CATEGORIES_HEADER = ['Name', 'Description', 'Emoji', 'Color', 'Ordre'];
const AGGREGATES_HEADER = ['Type', 'Key', 'SubKey', 'Extra', 'Points', 'Count', 'Meta'];
const AUTORULES_HEADER = [
  'Id', 'Player', 'Category', 'Points', 'Description', 'Frequency', 'Interval',
  'DaysOfWeek', 'DayOfMonth', 'StartDate', 'NextRun', 'LastRun', 'Active', 'CreatedBy'
];
const AUDIT_HEADER = ['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail'];

test('apiRunAutoRulesNow immediately updates apiGetQuickStats (leader, gap, monthCount, lastEvent)', () => {
  const gas = loadGas();
  const now = new Date();
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  const historySheet = makeSheet([
    HISTORY_HEADER,
    [new Date(Date.now() - 86400000), 'Bob', 'Mario Kart', 10, 'Initial points', '', 'Bob']
  ], 'History');

  const aggregatesSheet = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const playersSheet = makeSheet([
    PLAYERS_HEADER,
    ['Alice', '', '#ff0000', '', 1],
    ['Bob', '', '#00ff00', '', 2],
    ['Admin', '', '#0000ff', '', 3]
  ], 'Players');
  const categoriesSheet = makeSheet([
    CATEGORIES_HEADER,
    ['Mario Kart', '', '🏎️', '#111', 1]
  ], 'Categories');

  // Rule due: Alice gets 15 points
  const autoRulesSheet = makeSheet([
    AUTORULES_HEADER,
    ['AR1', 'Alice', 'Mario Kart', 15, 'Points auto Alice', 'daily', 1, '', '', yesterday, yesterday, '', true, 'Admin']
  ], 'AutoRules');
  const auditSheet = makeSheet([AUDIT_HEADER], 'AuditLog');

  gas.ConfigService.getSheets = () => ({
    spreadsheet: { insertSheet: () => autoRulesSheet, getSheetByName: (name) => name === 'AutoRules' ? autoRulesSheet : null },
    history: historySheet,
    aggregates: aggregatesSheet,
    players: playersSheet,
    categories: categoriesSheet,
    autoRules: autoRulesSheet,
    auditLog: auditSheet
  });

  gas.SettingsService.getEntities = (type) => {
    if (type === 'Players') return [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Admin' }];
    if (type === 'Categories') return [{ name: 'Mario Kart' }];
    return [];
  };

  // 1. Initial QuickStats: Bob is leader with 10 pts, Alice has 0
  const initialStats = gas.apiGetQuickStats('main');
  assert.strictEqual(initialStats.success, true);
  assert.strictEqual(initialStats.stats.leader.player, 'Bob');
  assert.strictEqual(initialStats.stats.leader.points, 10);
  assert.strictEqual(initialStats.stats.chaser.player, 'Alice');
  assert.strictEqual(initialStats.stats.chaser.points, 0);
  assert.strictEqual(initialStats.stats.gap, 10);

  // 2. Run due auto rules now
  const runRes = gas.apiRunAutoRulesNow('Admin');
  assert.strictEqual(runRes.success, true);
  assert.strictEqual(runRes.granted, 1);

  // 3. QuickStats immediately after execution: Alice is now leader with 15 pts, Bob is chaser with 10
  const updatedStats = gas.apiGetQuickStats('main');
  assert.strictEqual(updatedStats.success, true);
  assert.strictEqual(updatedStats.stats.leader.player, 'Alice');
  assert.strictEqual(updatedStats.stats.leader.points, 15);
  assert.strictEqual(updatedStats.stats.chaser.player, 'Bob');
  assert.strictEqual(updatedStats.stats.chaser.points, 10);
  assert.strictEqual(updatedStats.stats.gap, 5);
  assert.strictEqual(updatedStats.stats.lastEvent.player, 'Alice');
  assert.strictEqual(updatedStats.stats.lastEvent.points, 15);
  assert.strictEqual(updatedStats.stats.lastEvent.category, 'Mario Kart');
  assert.strictEqual(updatedStats.stats.globalBest.player, 'Alice');
  assert.strictEqual(updatedStats.stats.globalBest.points, 15);
});

test('AutoPoints execution with cold cache does not double count', () => {
  const gas = loadGas();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const historySheet = makeSheet([HISTORY_HEADER], 'History');
  const aggregatesSheet = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const playersSheet = makeSheet([
    PLAYERS_HEADER,
    ['Alice', '', '#ff0000', '', 1],
    ['Admin', '', '#0000ff', '', 2]
  ], 'Players');
  const categoriesSheet = makeSheet([
    CATEGORIES_HEADER,
    ['Jeux', '', '🎮', '#111', 1]
  ], 'Categories');

  const autoRulesSheet = makeSheet([
    AUTORULES_HEADER,
    ['AR1', 'Alice', 'Jeux', 10, 'Regle auto', 'daily', 1, '', '', yesterday, yesterday, '', true, 'Admin']
  ], 'AutoRules');
  const auditSheet = makeSheet([AUDIT_HEADER], 'AuditLog');

  gas.ConfigService.getSheets = () => ({
    spreadsheet: { insertSheet: () => autoRulesSheet, getSheetByName: (name) => name === 'AutoRules' ? autoRulesSheet : null },
    history: historySheet,
    aggregates: aggregatesSheet,
    players: playersSheet,
    categories: categoriesSheet,
    autoRules: autoRulesSheet,
    auditLog: auditSheet
  });

  gas.SettingsService.getEntities = (type) => {
    if (type === 'Players') return [{ name: 'Alice' }, { name: 'Admin' }];
    if (type === 'Categories') return [{ name: 'Jeux' }];
    return [];
  };

  // Ensure cold cache
  gas.AggregatesService.clearCache();

  // Run auto points
  const runRes = gas.apiRunAutoRulesNow('Admin');
  assert.strictEqual(runRes.success, true);
  assert.strictEqual(runRes.granted, 1);

  // Check aggregates: Alice must have exactly 10 points (not 20)
  const agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(agg.totalPoints, 10, 'Points should not be double-counted on cold cache');
  assert.strictEqual(agg.totalEntries, 1, 'Total entries should be 1');
  assert.strictEqual(agg.byPlayer['Alice'], 10);
});

test('ConfigService.clearCache preserves CacheService snapshot for AggregatesService', () => {
  const gas = loadGas();
  const historySheet = makeSheet([
    HISTORY_HEADER,
    [new Date(), 'Alice', 'Jeux', 25, 'Test', '', '']
  ], 'History');
  const aggregatesSheet = makeSheet([AGGREGATES_HEADER], 'Aggregates');
  const playersSheet = makeSheet([
    PLAYERS_HEADER,
    ['Alice', '', '#ff0000', '', 1]
  ], 'Players');
  const categoriesSheet = makeSheet([
    CATEGORIES_HEADER,
    ['Jeux', '', '🎮', '#111', 1]
  ], 'Categories');

  gas.ConfigService.getSheets = () => ({
    history: historySheet,
    aggregates: aggregatesSheet,
    players: playersSheet,
    categories: categoriesSheet
  });
  gas.SettingsService.getEntities = (type) => {
    if (type === 'Players') return [{ name: 'Alice' }];
    if (type === 'Categories') return [{ name: 'Jeux' }];
    return [];
  };

  // Build aggregates and populate CacheService
  gas.AggregatesService.rebuild();

  // Clear ConfigService cache (which previously evicted Aggregates cache too)
  gas.ConfigService.clearCache();

  // Track if sheet is accessed
  let historyRead = false;
  const origFetch = gas._fetchSheetValues;
  gas._fetchSheetValues = function(key) {
    if (key === 'history') historyRead = true;
    return origFetch.apply(this, arguments);
  };

  // getAggregates should read from CacheService, not scan history sheet
  const agg = gas.AggregatesService.getAggregates();
  assert.strictEqual(historyRead, false, 'History sheet should NOT be read when CacheService has snapshot');
  assert.strictEqual(agg.totalPoints, 25);
  assert.strictEqual(agg.byPlayer['Alice'], 25);
});
