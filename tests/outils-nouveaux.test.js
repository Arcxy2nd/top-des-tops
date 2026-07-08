'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const D = s => new Date(s + 'T12:00:00');
const mk = (d, p, c, pts, desc) => [D(d), p, c, pts, desc || '', '', ''];

test('apiDetectDuplicates finds two identical entries on the same day and keeps the earliest rowIndex', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'A', 'Jeux', 5, 'x'),
    mk('2026-01-10', 'A', 'Jeux', 5, 'x'),
    mk('2026-01-11', 'B', 'Défis', 3, 'y')
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectDuplicates();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.duplicates.length, 1);
  assert.strictEqual(res.duplicates[0].count, 2);
  assert.strictEqual(res.duplicates[0].keepRowIndex, 2);
  assert.deepStrictEqual([...res.duplicates[0].extraRowIndexes], [3]);
});

test('apiDetectDuplicates returns nothing when every entry differs by at least one field', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'A', 'Jeux', 5, 'x'),
    mk('2026-01-10', 'A', 'Jeux', 6, 'x')
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectDuplicates();
  assert.strictEqual(res.duplicates.length, 0);
});

test('apiDetectOutlierScores flags an entry far above its category average, ignores categories with under 5 entries', () => {
  const gas = loadGas();
  const rows = [HEADER];
  for (let i = 0; i < 5; i++) rows.push(mk('2026-01-0' + (i + 1), 'A', 'Jeux', 10, 'x'));
  rows.push(mk('2026-01-06', 'B', 'Jeux', 500, 'x')); // outlier
  rows.push(mk('2026-01-07', 'C', 'RareTop', 999, 'x')); // seul dans sa catégorie → ignoré
  const history = makeSheet(rows);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectOutlierScores();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.outliers.length, 1);
  assert.strictEqual(res.outliers[0].player, 'B');
  assert.strictEqual(res.outliers[0].points, 500);
});

test('apiGetInactivePlayers separates never-active players and sorts the rest by days since last entry', () => {
  const gas = loadGas();
  const players    = makeSheet([['A', '', ''], ['B', '', ''], ['C', '', '']]);
  const categories = makeSheet([['Jeux', '', '', '']]);
  const history = makeSheet([
    HEADER,
    mk('2020-01-01', 'A', 'Jeux', 5),
    mk('2026-07-01', 'B', 'Jeux', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, categories });

  const res = gas.apiGetInactivePlayers();
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual([...res.neverActive], ['C']);
  assert.strictEqual(res.inactive.length, 2);
  assert.strictEqual(res.inactive[0].player, 'A'); // le plus inactif en premier
});

test('apiGetPlayerRecords computes best single entry, longest streak, and the global best', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux', 5),
    mk('2026-01-02', 'A', 'Jeux', 5),
    mk('2026-01-03', 'A', 'Jeux', 100),
    mk('2026-01-10', 'B', 'Jeux', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetPlayerRecords();
  assert.strictEqual(res.success, true);
  const a = res.records.find(r => r.player === 'A');
  assert.strictEqual(a.bestSingleEntry, 100);
  assert.strictEqual(a.longestStreakDays, 3);
  assert.strictEqual(res.globalBest.player, 'A');
  assert.strictEqual(res.globalBest.points, 100);
});

test('apiGetTrends computes a category swing between the two 30-day windows', () => {
  const gas = loadGas();
  const now = new Date();
  const daysAgo = n => new Date(now.getTime() - n * 86400000);
  const iso = d => d.toISOString().slice(0, 10);
  const history = makeSheet([
    HEADER,
    mk(iso(daysAgo(50)), 'A', 'Jeux', 10),
    mk(iso(daysAgo(10)), 'A', 'Jeux', 10),
    mk(iso(daysAgo(5)),  'A', 'Jeux', 10)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetTrends();
  assert.strictEqual(res.success, true);
  const jeux = res.categoryTrends.find(c => c.category === 'Jeux');
  assert.strictEqual(jeux.before, 1);
  assert.strictEqual(jeux.after, 2);
});

test('apiGetActiveWeekday counts entries per weekday and names the most active one', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-05', 'A', 'Jeux', 5), // lundi
    mk('2026-01-12', 'A', 'Jeux', 5), // lundi
    mk('2026-01-06', 'A', 'Jeux', 5)  // mardi
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetActiveWeekday();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.topWeekday, 'Lundi');
});

test('apiGetTopPlayerCategoryPairs ranks the most frequent player/category combinations', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux', 5),
    mk('2026-01-02', 'A', 'Jeux', 5),
    mk('2026-01-03', 'A', 'Défis', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetTopPlayerCategoryPairs();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.pairs[0].player, 'A');
  assert.strictEqual(res.pairs[0].category, 'Jeux');
  assert.strictEqual(res.pairs[0].count, 2);
});
