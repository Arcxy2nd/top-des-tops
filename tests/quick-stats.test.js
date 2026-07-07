'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId'];

test('apiGetQuickStats computes leader and gap to second place', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [new Date(), 'A', 'Jeux', 10, '', ''],
    [new Date(), 'B', 'Jeux', 4, '', ''],
    [new Date(), 'A', 'Jeux', 2, '', '']
  ]);
  const players = makeSheet([['A', '', ''], ['B', '', '']]);
  gas.ConfigService.getSheets = () => ({ history, players });

  const res = gas.apiGetQuickStats();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.stats.leader.player, 'A');
  assert.strictEqual(res.stats.leader.points, 12);
  assert.strictEqual(res.stats.gap, 8);
});

test('apiGetQuickStats returns gap 0 on a tie', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [new Date(), 'A', 'Jeux', 5, '', ''],
    [new Date(), 'B', 'Jeux', 5, '', '']
  ]);
  const players = makeSheet([['A', '', ''], ['B', '', '']]);
  gas.ConfigService.getSheets = () => ({ history, players });

  const res = gas.apiGetQuickStats();
  assert.strictEqual(res.stats.gap, 0);
});

test('apiGetQuickStats returns nulls and zero counts on an empty board', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    history: makeSheet([HEADER]),
    players: makeSheet([])
  });

  const res = gas.apiGetQuickStats();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.stats.leader, null);
  assert.strictEqual(res.stats.gap, null);
  assert.strictEqual(res.stats.monthCount, 0);
  assert.strictEqual(res.stats.lastEvent, null);
});

test('apiGetQuickStats counts only this month\'s entries and finds the latest event', () => {
  const gas = loadGas();
  const now = new Date();
  const thisMonth1 = new Date(now.getFullYear(), now.getMonth(), 3, 10, 0, 0);
  const thisMonth2 = new Date(now.getFullYear(), now.getMonth(), 10, 14, 0, 0);
  const lastMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 20, 9, 0, 0);
  const history = makeSheet([
    HEADER,
    [thisMonth1, 'A', 'Jeux',  5, '', ''],
    [thisMonth2, 'B', 'Défis', 3, '', ''],
    [lastMonth,  'A', 'Jeux',  7, '', '']
  ]);
  const players = makeSheet([['A', '', ''], ['B', '', '']]);
  gas.ConfigService.getSheets = () => ({ history, players });

  const res = gas.apiGetQuickStats();
  assert.strictEqual(res.stats.monthCount, 2);
  assert.strictEqual(res.stats.lastEvent.player, 'B');
  assert.strictEqual(res.stats.lastEvent.points, 3);
  assert.strictEqual(res.stats.lastEvent.category, 'Défis');
});
