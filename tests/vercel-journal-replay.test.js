'use strict';

const { buildBatchRequests, cellData, DATE_PATTERN, NEW_SHEET_ROWS, NEW_SHEET_COLS } = require('../lib/gas-runtime/journal-replay');
const { dateToSerial } = require('../lib/gas-runtime/cell-values');
const test = require('node:test');
const assert = require('node:assert');

const GRIDS = { 1: { rowCount: 100, columnCount: 8 }, 2: { rowCount: 10, columnCount: 3 } };

test('journal vide : aucune requête', () => {
  assert.deepStrictEqual(buildBatchRequests([], GRIDS), []);
});

test('cellData type chaque valeur comme Sheets API l\'attend', () => {
  assert.deepStrictEqual(cellData('Safir'), { userEnteredValue: { stringValue: 'Safir' } });
  assert.deepStrictEqual(cellData(12), { userEnteredValue: { numberValue: 12 } });
  assert.deepStrictEqual(cellData(true), { userEnteredValue: { boolValue: true } });
  assert.deepStrictEqual(cellData(''), {});
  assert.deepStrictEqual(cellData(null), {});
  assert.deepStrictEqual(cellData('=A1+1'), { userEnteredValue: { formulaValue: '=A1+1' } });
});

test('setValues devient un updateCells borné sur la bonne plage (indices 0-based)', () => {
  const reqs = buildBatchRequests([
    { op: 'setValues', sheetId: 1, row: 3, col: 2, values: [['a', 4], ['b', 5]] }
  ], GRIDS);
  assert.strictEqual(reqs.length, 1);
  assert.deepStrictEqual(reqs[0].updateCells.range, {
    sheetId: 1, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 3
  });
  assert.strictEqual(reqs[0].updateCells.fields, 'userEnteredValue');
  assert.deepStrictEqual(reqs[0].updateCells.rows[0].values[1], { userEnteredValue: { numberValue: 4 } });
});

test('une cellule date écrit le numéro de série ET impose le format date (sinon relue comme un nombre)', () => {
  const d = new Date(2026, 8, 20, 14, 30, 0);
  const reqs = buildBatchRequests([
    { op: 'appendRow', sheetId: 1, row: 7, values: [[d, 'Safir', 3]] }
  ], GRIDS);
  assert.strictEqual(reqs.length, 2, 'valeurs puis format');
  assert.deepStrictEqual(reqs[0].updateCells.rows[0].values[0], { userEnteredValue: { numberValue: dateToSerial(d) } });
  assert.deepStrictEqual(reqs[1].repeatCell.range, {
    sheetId: 1, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 1
  });
  assert.strictEqual(reqs[1].repeatCell.fields, 'userEnteredFormat.numberFormat');
  assert.deepStrictEqual(reqs[1].repeatCell.cell.userEnteredFormat.numberFormat, { type: 'DATE_TIME', pattern: DATE_PATTERN });
});

test('dates contiguës d\'une même colonne : un seul repeatCell', () => {
  const a = new Date(2026, 0, 1);
  const b = new Date(2026, 0, 2);
  const reqs = buildBatchRequests([
    { op: 'setValues', sheetId: 1, row: 2, col: 1, values: [[a, 'x'], [b, 'y']] }
  ], GRIDS);
  assert.strictEqual(reqs.length, 2);
  assert.deepStrictEqual(reqs[1].repeatCell.range, {
    sheetId: 1, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1
  });
});

test('écriture au-delà de la grille : appendDimension avant, une seule fois par onglet', () => {
  const reqs = buildBatchRequests([
    { op: 'appendRow', sheetId: 2, row: 12, values: [['a', 'b', 'c']] },
    { op: 'appendRow', sheetId: 2, row: 13, values: [['d', 'e', 'f']] }
  ], GRIDS);
  assert.strictEqual(reqs[0].appendDimension.sheetId, 2);
  assert.strictEqual(reqs[0].appendDimension.dimension, 'ROWS');
  assert.strictEqual(reqs[0].appendDimension.length, 3, '10 lignes existantes → 13');
  assert.strictEqual(reqs.filter(r => r.appendDimension).length, 1);
});

test('écriture au-delà de la dernière colonne : appendDimension COLUMNS', () => {
  const reqs = buildBatchRequests([
    { op: 'setValues', sheetId: 2, row: 1, col: 4, values: [['x', 'y']] }
  ], GRIDS);
  const cols = reqs.filter(r => r.appendDimension && r.appendDimension.dimension === 'COLUMNS');
  assert.strictEqual(cols.length, 1);
  assert.strictEqual(cols[0].appendDimension.length, 2, '3 colonnes existantes → 5');
});

test('les insertions de lignes comptent dans la place à réserver', () => {
  const reqs = buildBatchRequests([
    { op: 'insertRows', sheetId: 2, index: 1, count: 1 },
    { op: 'setValues', sheetId: 2, row: 10, col: 1, values: [['x']] }
  ], GRIDS);
  assert.strictEqual(reqs[0].appendDimension.length, 1, '10 existantes + 1 insérée → 11');
});

test('insertRows / deleteRows deviennent des dimensions 0-based demi-ouvertes', () => {
  const reqs = buildBatchRequests([
    { op: 'insertRows', sheetId: 1, index: 1, count: 1 },
    { op: 'deleteRows', sheetId: 1, index: 5, count: 1 }
  ], GRIDS);
  assert.deepStrictEqual(reqs[0].insertDimension, {
    range: { sheetId: 1, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, inheritFromBefore: false
  });
  assert.deepStrictEqual(reqs[1].deleteDimension, {
    range: { sheetId: 1, dimension: 'ROWS', startIndex: 4, endIndex: 5 }
  });
});

test('suppressions successives du même index : une seule plage (boucle de nettoyage)', () => {
  const reqs = buildBatchRequests([
    { op: 'deleteRows', sheetId: 1, index: 5, count: 1 },
    { op: 'deleteRows', sheetId: 1, index: 5, count: 1 },
    { op: 'deleteRows', sheetId: 1, index: 5, count: 1 }
  ], GRIDS);
  assert.strictEqual(reqs.length, 1);
  assert.deepStrictEqual(reqs[0].deleteDimension.range, { sheetId: 1, dimension: 'ROWS', startIndex: 4, endIndex: 7 });
});

test('suppressions descendantes contiguës : une seule plage', () => {
  const reqs = buildBatchRequests([
    { op: 'deleteRows', sheetId: 1, index: 9, count: 1 },
    { op: 'deleteRows', sheetId: 1, index: 8, count: 1 },
    { op: 'deleteRows', sheetId: 1, index: 7, count: 1 }
  ], GRIDS);
  assert.strictEqual(reqs.length, 1);
  assert.deepStrictEqual(reqs[0].deleteDimension.range, { sheetId: 1, dimension: 'ROWS', startIndex: 6, endIndex: 9 });
});

test('suppressions non contiguës ou sur deux onglets : pas de fusion', () => {
  const reqs = buildBatchRequests([
    { op: 'deleteRows', sheetId: 1, index: 9, count: 1 },
    { op: 'deleteRows', sheetId: 1, index: 4, count: 1 },
    { op: 'deleteRows', sheetId: 2, index: 4, count: 1 }
  ], GRIDS);
  assert.strictEqual(reqs.length, 3);
});

test('setFontWeight devient un repeatCell sur le gras seul', () => {
  const reqs = buildBatchRequests([
    { op: 'setFontWeight', sheetId: 1, row: 1, col: 1, numRows: 1, numCols: 4, weight: 'bold' }
  ], GRIDS);
  assert.strictEqual(reqs[0].repeatCell.fields, 'userEnteredFormat.textFormat.bold');
  assert.strictEqual(reqs[0].repeatCell.cell.userEnteredFormat.textFormat.bold, true);
  assert.deepStrictEqual(reqs[0].repeatCell.range, {
    sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4
  });
});

test('clearContents efface les valeurs, clear efface tout, sur l\'onglet entier', () => {
  const reqs = buildBatchRequests([
    { op: 'clearContents', sheetId: 1 },
    { op: 'clear', sheetId: 2 }
  ], GRIDS);
  assert.deepStrictEqual(reqs[0].updateCells, { range: { sheetId: 1 }, fields: 'userEnteredValue' });
  assert.deepStrictEqual(reqs[1].updateCells, { range: { sheetId: 2 }, fields: '*' });
});

test('addSheet réserve l\'identifiant du modèle et une grille par défaut', () => {
  const reqs = buildBatchRequests([
    { op: 'addSheet', sheetId: 42, title: 'Notes' },
    { op: 'appendRow', sheetId: 42, row: 1, values: [['Date', 'Player']] }
  ], GRIDS);
  assert.deepStrictEqual(reqs[0].addSheet.properties, {
    sheetId: 42, title: 'Notes', gridProperties: { rowCount: NEW_SHEET_ROWS, columnCount: NEW_SHEET_COLS }
  });
  assert.ok(!reqs.some(r => r.appendDimension), 'un onglet créé dans le lot n\'a pas besoin d\'agrandissement');
});

test('un onglet créé dans le lot est agrandi si le journal dépasse la grille par défaut', () => {
  const reqs = buildBatchRequests([
    { op: 'addSheet', sheetId: 42, title: 'Gros' },
    { op: 'setValues', sheetId: 42, row: NEW_SHEET_ROWS + 5, col: 1, values: [['x']] }
  ], GRIDS);
  assert.strictEqual(reqs[0].addSheet.properties.gridProperties.rowCount, NEW_SHEET_ROWS + 5);
});

test('deleteSheet, duplicateSheet et renameSheet', () => {
  const reqs = buildBatchRequests([
    { op: 'deleteSheet', sheetId: 2 },
    { op: 'duplicateSheet', sourceSheetId: 1, sheetId: 43, title: 'Copy of History' },
    { op: 'renameSheet', sheetId: 1, title: 'Histoire' }
  ], GRIDS);
  assert.deepStrictEqual(reqs[0], { deleteSheet: { sheetId: 2 } });
  assert.deepStrictEqual(reqs[1], { duplicateSheet: { sourceSheetId: 1, newSheetId: 43, newSheetName: 'Copy of History' } });
  assert.deepStrictEqual(reqs[2], {
    updateSheetProperties: { properties: { sheetId: 1, title: 'Histoire' }, fields: 'title' }
  });
});

test('opération inconnue : échec bruyant plutôt qu\'écriture silencieusement perdue', () => {
  assert.throws(() => buildBatchRequests([{ op: 'setBackground', sheetId: 1 }], GRIDS), /setBackground/);
});
