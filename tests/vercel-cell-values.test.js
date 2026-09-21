'use strict';

process.env.TZ = 'Europe/Paris';

const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { isDate, serialToDate, dateToSerial, cellFromApi, gridFromRowData } = require('../lib/gas-runtime/cell-values');

test('serialToDate lit le numéro de série comme une heure murale locale', () => {
  const d = serialToDate(46204.5); // 2026-07-01 12:00
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 6);
  assert.strictEqual(d.getDate(), 1);
  assert.strictEqual(d.getHours(), 12);
  assert.strictEqual(d.getMinutes(), 0);
});

test('dateToSerial est l\'inverse exact de serialToDate', () => {
  assert.strictEqual(dateToSerial(new Date(2026, 6, 1, 12, 0, 0)), 46204.5);
  assert.strictEqual(dateToSerial(serialToDate(45000.25)), 45000.25);
});

test('serialToDate construit la date avec le constructeur fourni (autre realm vm)', () => {
  const VmDate = vm.runInNewContext('Date');
  const d = serialToDate(46204, VmDate);
  assert.ok(d instanceof VmDate);
  assert.ok(!(d instanceof Date));
  assert.ok(isDate(d), 'isDate doit reconnaître une date d\'un autre realm');
});

test('cellFromApi reproduit les types de SpreadsheetApp.getValues()', () => {
  assert.strictEqual(cellFromApi({}), '');
  assert.strictEqual(cellFromApi(undefined), '');
  assert.strictEqual(cellFromApi({ effectiveValue: { stringValue: 'Safir' } }), 'Safir');
  assert.strictEqual(cellFromApi({ effectiveValue: { numberValue: 12 } }), 12);
  assert.strictEqual(cellFromApi({ effectiveValue: { boolValue: false } }), false);
  assert.strictEqual(cellFromApi({ effectiveValue: { errorValue: { type: 'N_A' } } }), '#N/A');
  const d = cellFromApi({ effectiveValue: { numberValue: 46204 }, effectiveFormat: { numberFormat: { type: 'DATE' } } });
  assert.ok(isDate(d));
  assert.strictEqual(d.getDate(), 1);
  assert.strictEqual(cellFromApi({ effectiveValue: { numberValue: 46204 }, effectiveFormat: { numberFormat: { type: 'NUMBER' } } }), 46204);
});

test('gridFromRowData tolère les lignes sans valeurs', () => {
  const grid = gridFromRowData([{ values: [{ effectiveValue: { stringValue: 'a' } }, {}] }, {}, { values: [{ effectiveValue: { numberValue: 3 } }] }]);
  assert.deepStrictEqual(grid, [['a', ''], [], [3]]);
  assert.deepStrictEqual(gridFromRowData(undefined), []);
});
