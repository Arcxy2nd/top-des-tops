'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId'];
const D = s => new Date(s + 'T12:00:00');

// ── 2.2 — single-call bulk plan ─────────────────────────────────────────
test('appendBulkPlan writes points = points*times, empty groupId, one row per entry', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.appendBulkPlan([
    { date: '2026-01-15', entries: [
      { player: 'A', category: 'Jeux',  points: 5, times: 2, description: 'x' },
      { player: 'B', category: 'Défis', points: 3, times: 1, description: '' }
    ] },
    { date: '2026-01-16', entries: [
      { player: 'A', category: 'Jeux', points: 10, times: 1, description: 'y' }
    ] }
  ]);

  const g = history._grid;
  assert.strictEqual(g.length, 4); // header + 3 entries
  assert.strictEqual(Object.prototype.toString.call(g[1][0]), '[object Date]');
  assert.strictEqual(g[1][0].getFullYear(), 2026);
  assert.strictEqual(g[1][0].getMonth(), 0);
  assert.strictEqual(g[1][0].getDate(), 15);
  assert.strictEqual(g[1][1], 'A');
  assert.strictEqual(g[1][2], 'Jeux');
  assert.strictEqual(g[1][3], 10);  // 5 * 2
  assert.strictEqual(g[1][4], 'x');
  assert.strictEqual(g[1][5], '');  // groupId stays empty (preserved behaviour)
  assert.strictEqual(g[3][0].getDate(), 16);
  assert.strictEqual(g[3][3], 10);  // 10 * 1
});

test('appendBulkPlan assigns the same real groupId to rows sharing a client tag, and different ids across two separate calls', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.appendBulkPlan([
    { date: '2026-02-01', entries: [
      { player: 'A', category: 'Jeux',  points: 5, times: 1, description: '', groupTag: 'G1' },
      { player: 'B', category: 'Jeux',  points: 3, times: 1, description: '', groupTag: 'G1' },
      { player: 'C', category: 'Jeux',  points: 2, times: 1, description: '', groupTag: 'G2' }
    ] }
  ]);
  gas.StorageService.appendBulkPlan([
    { date: '2026-02-02', entries: [
      { player: 'D', category: 'Jeux', points: 7, times: 1, description: '', groupTag: 'G1' }
    ] }
  ]);

  const g = history._grid;
  assert.strictEqual(g.length, 5); // header + 4 rows
  const idAG1 = g[1][5], idBG1 = g[2][5], idCG2 = g[3][5], idDG1second = g[4][5];

  assert.ok(idAG1, 'row A should have a non-empty groupId');
  assert.strictEqual(idAG1, idBG1, 'rows sharing client tag G1 in the same call get the same real id');
  assert.notStrictEqual(idAG1, idCG2, 'different client tags in the same call get different real ids');
  assert.notStrictEqual(idAG1, idDG1second, 'the same client tag "G1" used in a LATER, separate call must not collide with the earlier call\'s id');
});

test('apiRemoveFromGroup clears groupId for one row only, leaving siblings grouped', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux', 5, '', 'G1'],
    [D('2026-01-01'), 'B', 'Jeux', 3, '', 'G1'],
    [D('2026-01-01'), 'C', 'Jeux', 2, '', 'G1']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiRemoveFromGroup(3, 'Tester');
  assert.strictEqual(res.success, true);

  const g = history._grid;
  assert.strictEqual(g[1][5], 'G1'); // row 2 (grid index 1) untouched
  assert.strictEqual(g[2][5], '');   // row 3 (grid index 2) detached
  assert.strictEqual(g[3][5], 'G1'); // row 4 (grid index 3) untouched
});

test('apiRemoveFromGroup throws when rowIndex is missing', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({ history: makeSheet([HEADER]) });
  const res = gas.apiRemoveFromGroup(null, 'Tester');
  assert.strictEqual(res.success, false);
});

test('appendBulkPlan leaves groupId empty when no groupTag is provided', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.appendBulkPlan([
    { date: '2026-02-01', entries: [
      { player: 'A', category: 'Jeux', points: 5, times: 1, description: '' }
    ] }
  ]);

  assert.strictEqual(history._grid[1][5], '');
});

test('appendBulkPlan rejects points below 1', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({ history: makeSheet([HEADER]) });
  assert.throws(
    () => gas.StorageService.appendBulkPlan([
      { date: '2026-01-15', entries: [{ player: 'A', category: 'Jeux', points: 0, times: 1 }] }
    ]),
    /points/i
  );
});

// ── 0.1 — full entry edit restores the broken feature ───────────────────
test('updateHistoryEntry rewrites columns A–E and preserves the groupId (column F)', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux',  3, 'old',  'G123'],
    [D('2026-01-02'), 'B', 'Défis', 4, 'keep', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.updateHistoryEntry(2, {
    date: '2026-02-01', player: 'C', category: 'Défis', points: 7, description: 'note'
  });

  const g = history._grid;
  assert.strictEqual(Object.prototype.toString.call(g[1][0]), '[object Date]');
  assert.strictEqual(g[1][0].getMonth(), 1); // February
  assert.strictEqual(g[1][1], 'C');
  assert.strictEqual(g[1][2], 'Défis');
  assert.strictEqual(g[1][3], 7);
  assert.strictEqual(g[1][4], 'note');
  assert.strictEqual(g[1][5], 'G123'); // groupId untouched — the key guarantee
  assert.strictEqual(g[2][1], 'B');    // other rows untouched
});

test('updateHistoryEntry rejects an invalid row index', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({ history: makeSheet([HEADER]) });
  assert.throws(
    () => gas.StorageService.updateHistoryEntry(1, { date: '2026-01-01', player: 'A', category: 'J', points: 1 }),
    /invalide/i
  );
});

// ── getAllLogs — row parsing/validation ─────────────────────────────────
test('getAllLogs returns only valid rows, normalized with a Date timestamp', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux',  5, '', ''],
    ['not-a-date',    'A', 'Jeux',  5, '', ''], // invalid date → dropped
    [D('2026-01-02'), '',  'Jeux',  5, '', ''], // missing player → dropped
    [D('2026-01-03'), 'B', 'Défis', 0, '', '']  // non-positive points → dropped
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const logs = gas.StorageService.getAllLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].player, 'A');
  assert.strictEqual(logs[0].category, 'Jeux');
  assert.strictEqual(logs[0].points, 5);
  assert.strictEqual(Object.prototype.toString.call(logs[0].timestamp), '[object Date]');
});

// ── getDataHealth — counts only, never mutates ──────────────────────────
test('getDataHealth counts zero-point rows and orphans without modifying data', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'A',     'Jeux',    5, '', ''],
    [D('2026-01-02'), 'A',     'Jeux',    0, '', ''], // zero points
    [D('2026-01-03'), 'Ghost', 'Jeux',    5, '', ''], // orphan player
    [D('2026-01-04'), 'A',     'Inconnu', 5, '', '']  // orphan category
  ]);
  // Players/Categories sheets have NO header row (entities start at row 1).
  const players    = makeSheet([['A', '', '']]);
  const categories = makeSheet([['Jeux', '', '', '']]);
  gas.ConfigService.getSheets = () => ({ history, players, categories });

  const h = gas.StorageService.getDataHealth();
  assert.strictEqual(h.total, 4);
  assert.strictEqual(h.zeros, 1);
  assert.strictEqual(h.orphans, 2);
  assert.strictEqual(history._grid.length, 5); // unchanged: header + 4 rows
});

// ── getHistoryPage — grouping + pagination ──────────────────────────────
test('getHistoryPage groups entries sharing a groupId into one visual item', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux',  5, '', 'G1'],
    [D('2026-01-02'), 'A', 'Jeux',  5, '', 'G1'],
    [D('2026-01-03'), 'B', 'Défis', 3, '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.StorageService.getHistoryPage(1, 20, null, null, null);
  assert.strictEqual(res.totalEntries, 3); // 3 raw rows
  assert.strictEqual(res.total, 2);        // 1 group + 1 single = 2 visual items
  assert.strictEqual(res.logs.length, 3);  // page returns every entry of its items
});

test('getHistoryPage honours sortDir: desc (default) newest-first, asc oldest-first', () => {
  const gas = loadGas();
  const rows = [
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux',  5, '', ''],
    [D('2026-01-02'), 'B', 'Défis', 3, '', ''],
    [D('2026-01-03'), 'C', 'Jeux',  7, '', '']
  ];
  gas.ConfigService.getSheets = () => ({ history: makeSheet(rows) });

  const desc = gas.StorageService.getHistoryPage(1, 20, null, null, null);
  assert.strictEqual(desc.logs[0].player, 'C'); // 03/01 first
  assert.strictEqual(desc.logs[2].player, 'A'); // 01/01 last

  gas.ConfigService.getSheets = () => ({ history: makeSheet(rows) });
  const asc = gas.StorageService.getHistoryPage(1, 20, null, null, null, null, null, 'asc');
  assert.strictEqual(asc.logs[0].player, 'A'); // 01/01 first
  assert.strictEqual(asc.logs[2].player, 'C'); // 03/01 last
});

// ── 1.2 — backup before destructive cleanup ─────────────────────────────
test('fixZeroPoints backs up History then removes non-positive-point rows', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux', 5,  '', ''],
    [D('2026-01-02'), 'A', 'Jeux', 0,  '', ''],
    [D('2026-01-03'), 'B', 'Jeux', -2, '', '']
  ]);
  let backedUp = false;
  history.copyTo = () => { backedUp = true; return { setName() {} }; };
  const spreadsheet = { getSheetByName: () => null, deleteSheet: () => {} };
  gas.ConfigService.getSheets = () => ({ spreadsheet, history });

  const res = gas.StorageService.fixZeroPoints();
  assert.strictEqual(backedUp, true);            // snapshot taken before deleting
  assert.strictEqual(res.deleted, 2);
  assert.strictEqual(history._grid.length, 2);   // header + 1 surviving row
  assert.strictEqual(history._grid[1][3], 5);
});

// ── apiDetectDistributedLots — chaining algorithm ───────────────────────
test('apiDetectDistributedLots detects a chain of 3+ identical single-date entries within 7-day gaps', () => {
  const gas = loadGas();
  const mk = (d, p, c, pts) => [D(d), p, c, pts, 'desc', ''];
  const history = makeSheet([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux', 5),
    mk('2026-01-05', 'A', 'Jeux', 5),
    mk('2026-01-10', 'A', 'Jeux', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectDistributedLots();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.lots.length, 1);
  assert.strictEqual(res.lots[0].count, 3);
  assert.strictEqual(res.lots[0].player, 'A');
  assert.strictEqual(res.lots[0].totalPts, 15);
});

test('apiDetectDistributedLots ignores entries spread more than 7 days apart', () => {
  const gas = loadGas();
  const mk = (d, p, c, pts) => [D(d), p, c, pts, 'desc', ''];
  const history = makeSheet([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux', 5),
    mk('2026-01-20', 'A', 'Jeux', 5),
    mk('2026-02-15', 'A', 'Jeux', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectDistributedLots();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.lots.length, 0);
});
