'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const D = s => new Date(s + 'T12:00:00');

test('apiGetFilteredLogs returns raw entries with rowIndex and description, filtered by player/category/date range', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'A', 'Jeux',  5, 'desc A1', '', 'A'],
    [D('2026-01-15'), 'A', 'Défis', 3, 'desc A2', '', 'A'],
    [D('2026-01-20'), 'B', 'Jeux',  4, 'desc B1', '', 'B'],
    [D('2026-02-01'), 'A', 'Jeux',  9, 'desc A3', '', 'A']  // hors plage testée
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetFilteredLogs(['A'], ['Jeux'], '2026-01-01', '2026-01-31');

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.logs.length, 1);
  assert.strictEqual(res.logs[0].player, 'A');
  assert.strictEqual(res.logs[0].category, 'Jeux');
  assert.strictEqual(res.logs[0].points, 5);
  assert.strictEqual(res.logs[0].description, 'desc A1');
  assert.strictEqual(res.logs[0].rowIndex, 2);
  assert.match(res.logs[0].timestamp, /^2026-01-10/);
});

test('apiGetFilteredLogs with no filters returns every valid entry', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'A', 'Jeux', 5, '', '', ''],
    [D('2026-01-11'), 'B', 'Défis', 2, '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetFilteredLogs(null, null, null, null);
  assert.strictEqual(res.logs.length, 2);
});

test('getTrendData reports day granularity for a short range', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'A', 'Jeux', 5, '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });
  const data = gas.AnalyticsService.getTrendData(['A'], null, '2026-01-01', '2026-01-15');
  assert.strictEqual(data.granularity, 'day');
  assert.match(data.labels[0], /^\d{4}-\d{2}-\d{2}$/);
});

test('getTrendData reports month granularity for a long range', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'A', 'Jeux', 5, '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });
  const data = gas.AnalyticsService.getTrendData(['A'], null, '2026-01-01', '2026-12-31');
  assert.strictEqual(data.granularity, 'month');
  assert.match(data.labels[0], /^\d{4}-\d{2}$/);
});
