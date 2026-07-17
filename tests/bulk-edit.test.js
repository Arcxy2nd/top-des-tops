'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet, injectSheets } = require('./harness');

const D = s => new Date(s + 'T12:00:00');

// Col indexes in _grid (0-based):
//  0=Date  1=Player  2=Category  3=Points  4=Description  5=GroupId  6=Saiseur
const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];

// ── Test 1 : updates only specified fields, leaves others intact ────────────
test('updates only specified fields, leaves others intact', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'Alice',   'Jeux',  10, 'orig', '', 'Bob'],
    [D('2026-01-02'), 'Charlie', 'Sport',  5, '',     '', '']
  ]);
  injectSheets(gas, { history });

  const res = gas.apiUpdateBulkEntries([2, 3], { description: 'edited' }, 'Testeur');
  assert.strictEqual(res.success, true);

  const g = history._grid;
  // Row 2 (grid index 1) — player/category/points unchanged
  assert.strictEqual(g[1][1], 'Alice');
  assert.strictEqual(g[1][2], 'Jeux');
  assert.strictEqual(g[1][3], 10);
  assert.strictEqual(g[1][4], 'edited');
  assert.strictEqual(g[1][6], 'Bob');   // saiseur intact

  // Row 3 (grid index 2) — description updated
  assert.strictEqual(g[2][1], 'Charlie');
  assert.strictEqual(g[2][2], 'Sport');
  assert.strictEqual(g[2][3], 5);
  assert.strictEqual(g[2][4], 'edited');
});

// ── Test 2 : updates saiseur when explicitly in partialFields ───────────────
test('updates saiseur when explicitly in partialFields', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'Alice',   'Jeux',  10, '', '', 'Bob'],
    [D('2026-01-02'), 'Charlie', 'Sport',  5, '', '', 'Dave']
  ]);
  injectSheets(gas, { history });

  const res = gas.apiUpdateBulkEntries([2, 3], { saiseur: 'Eve' }, 'Testeur');
  assert.strictEqual(res.success, true);

  const g = history._grid;
  assert.strictEqual(g[1][6], 'Eve');
  assert.strictEqual(g[2][6], 'Eve');
});

// ── Test 3 : skips invalid row indexes silently ─────────────────────────────
test('skips invalid row indexes silently', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'Alice', 'Jeux', 10, 'orig', '', '']
  ]);
  injectSheets(gas, { history });

  const res = gas.apiUpdateBulkEntries([99, 2], { description: 'x' }, 'Testeur');
  assert.strictEqual(res.success, true);
  assert.ok(res.skipped.includes(99), 'row 99 should be in skipped');

  const g = history._grid;
  assert.strictEqual(g[1][4], 'x');  // row 2 was updated
});

// ── Test 4 : returns success immediately when partialFields is empty ────────
test('returns success immediately when partialFields is empty', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'Alice', 'Jeux', 10, '', '', '']
  ]);
  injectSheets(gas, { history });

  const res = gas.apiUpdateBulkEntries([2], {}, 'Testeur');
  assert.strictEqual(res.success, true);
});
