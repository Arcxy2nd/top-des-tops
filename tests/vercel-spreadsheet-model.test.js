'use strict';

process.env.TZ = 'Europe/Paris';

const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { createSpreadsheet, createSheetsAdvancedService } = require('../lib/gas-runtime/spreadsheet');

const VmDate = vm.runInNewContext('Date');

function build(sheets, loadGrid) {
  return createSpreadsheet({
    spreadsheetId: 'SHEET_A',
    sheets,
    loadGrid: loadGrid || (() => { throw new Error('loadGrid inattendu'); }),
    DateCtor: VmDate
  });
}

test('getSheetByName retrouve un onglet par titre exact, null sinon', () => {
  const { spreadsheet } = build([{ sheetId: 1, title: 'Players', grid: [] }]);
  assert.strictEqual(spreadsheet.getSheetByName('Players').getName(), 'Players');
  assert.strictEqual(spreadsheet.getSheetByName('Notes'), null);
  assert.strictEqual(spreadsheet.getSheetByName('Players'), spreadsheet.getSheetByName('Players'), 'même objet à chaque appel');
});

test('un onglet paresseux n\'est chargé qu\'au premier accès aux données, une seule fois', () => {
  let loads = 0;
  const { spreadsheet } = build([{ sheetId: 9, title: 'AuditLog', grid: null }], title => { loads++; return [['h'], ['x']]; });
  const sheet = spreadsheet.getSheetByName('AuditLog');
  assert.strictEqual(loads, 0);
  assert.strictEqual(sheet.getLastRow(), 2);
  sheet.getRange(1, 1).getValue();
  assert.strictEqual(loads, 1);
});

test('getLastRow / getLastColumn ignorent les cellules vides finales', () => {
  const { spreadsheet } = build([{ sheetId: 1, title: 'S', grid: [['a', 'b', ''], ['c', '', ''], ['', '', ''], []] }]);
  const sheet = spreadsheet.getSheetByName('S');
  assert.strictEqual(sheet.getLastRow(), 2);
  assert.strictEqual(sheet.getLastColumn(), 2);
});

test('getRange().getValues() complète par des chaînes vides et clone les dates', () => {
  const date = new VmDate(2026, 6, 1);
  const { spreadsheet } = build([{ sheetId: 1, title: 'S', grid: [[date, 'x']] }]);
  const values = spreadsheet.getSheetByName('S').getRange(1, 1, 2, 3).getValues();
  assert.strictEqual(values.length, 2);
  assert.ok(values[0][0] instanceof VmDate);
  assert.notStrictEqual(values[0][0], date, 'une copie, pas la référence stockée');
  assert.deepStrictEqual([values[0][1], values[0][2], ...values[1]], ['x', '', '', '', '']);
});

test('getRange refuse des coordonnées invalides (comme GAS)', () => {
  const { spreadsheet } = build([{ sheetId: 1, title: 'S', grid: [] }]);
  assert.throws(() => spreadsheet.getSheetByName('S').getRange(0, 1), /coordinates or dimensions of the range are invalid/);
});

test('setValues écrit en mémoire, se journalise et contrôle les dimensions', () => {
  const { spreadsheet, journal } = build([{ sheetId: 4, title: 'S', grid: [['a']] }]);
  const sheet = spreadsheet.getSheetByName('S');
  sheet.getRange(2, 2, 1, 2).setValues([['x', 'y']]);
  assert.deepStrictEqual(sheet.getRange(2, 1, 1, 3).getValues(), [['', 'x', 'y']]);
  assert.deepStrictEqual(journal, [{ op: 'setValues', sheetId: 4, row: 2, col: 2, values: [['x', 'y']] }]);
  assert.throws(() => sheet.getRange(1, 1, 2, 1).setValues([['z']]), /number of rows in the data does not match/);
  assert.throws(() => sheet.getRange(1, 1, 1, 2).setValues([['z']]), /number of columns in the data does not match/);
});

test('appendRow écrit après la dernière ligne non vide', () => {
  const { spreadsheet, journal } = build([{ sheetId: 1, title: 'S', grid: [['h'], ['a'], ['']] }]);
  const sheet = spreadsheet.getSheetByName('S');
  sheet.appendRow(['b', null]);
  assert.deepStrictEqual(sheet.getRange(1, 1, 4, 2).getValues(), [['h', ''], ['a', ''], ['b', ''], ['', '']]);
  assert.deepStrictEqual(journal, [{ op: 'appendRow', sheetId: 1, row: 3, values: [['b', '']] }]);
});

test('insertRowBefore / deleteRow décalent les lignes et se journalisent', () => {
  const { spreadsheet, journal } = build([{ sheetId: 1, title: 'S', grid: [['a'], ['b']] }]);
  const sheet = spreadsheet.getSheetByName('S');
  sheet.insertRowBefore(1);
  assert.deepStrictEqual(sheet.getRange(1, 1, 3, 1).getValues(), [[''], ['a'], ['b']]);
  sheet.deleteRow(2);
  assert.deepStrictEqual(sheet.getRange(1, 1, 2, 1).getValues(), [[''], ['b']]);
  assert.deepStrictEqual(journal, [
    { op: 'insertRows', sheetId: 1, index: 1, count: 1 },
    { op: 'deleteRows', sheetId: 1, index: 2, count: 1 }
  ]);
});

test('insertSheet crée un onglet vide, refuse un doublon ; deleteSheet le retire', () => {
  const { spreadsheet, journal } = build([{ sheetId: 5, title: 'Players', grid: [] }]);
  const notes = spreadsheet.insertSheet('Notes');
  assert.strictEqual(notes.getLastRow(), 0);
  assert.strictEqual(spreadsheet.getSheetByName('Notes'), notes);
  assert.throws(() => spreadsheet.insertSheet('Players'), /already exists/);
  spreadsheet.deleteSheet(notes);
  assert.strictEqual(spreadsheet.getSheetByName('Notes'), null);
  assert.deepStrictEqual(journal, [
    { op: 'addSheet', sheetId: 6, title: 'Notes' },
    { op: 'deleteSheet', sheetId: 6 }
  ]);
});

test('clearContents vide l\'onglet sans charger la grille', () => {
  const { spreadsheet, journal } = build([{ sheetId: 1, title: 'S', grid: null }], () => { throw new Error('ne doit pas charger'); });
  const sheet = spreadsheet.getSheetByName('S');
  sheet.clearContents();
  assert.strictEqual(sheet.getLastRow(), 0);
  assert.deepStrictEqual(journal, [{ op: 'clearContents', sheetId: 1 }]);
});

test('copyTo duplique l\'onglet dans le même classeur, setName le renomme', () => {
  const { spreadsheet, journal } = build([{ sheetId: 1, title: 'History', grid: [['a']] }]);
  const copy = spreadsheet.getSheetByName('History').copyTo(spreadsheet).setName('History_backup');
  assert.deepStrictEqual(copy.getRange(1, 1).getValues(), [['a']]);
  assert.deepStrictEqual(journal, [
    { op: 'duplicateSheet', sourceSheetId: 1, sheetId: 2, title: 'Copy of History' },
    { op: 'renameSheet', sheetId: 2, title: 'History_backup' }
  ]);
});

test('Values.get reproduit la forme de l\'API réelle (séries, vides finaux retirés)', () => {
  const { spreadsheet } = build([{ sheetId: 1, title: 'Top d\'or', grid: [['Date', 'Pts', ''], [new VmDate(2026, 6, 1, 12), 5, ''], ['', '', '']] }]);
  const sheets = createSheetsAdvancedService(() => spreadsheet, 'SHEET_A');
  const opts = { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' };
  assert.deepStrictEqual(sheets.Spreadsheets.Values.get('SHEET_A', '\'Top d\'\'or\'', opts), {
    range: '\'Top d\'\'or\'', majorDimension: 'ROWS', values: [['Date', 'Pts'], [46204.5, 5]]
  });
  assert.deepStrictEqual(sheets.Spreadsheets.Values.get('SHEET_A', '\'Top d\'\'or\'!A1:A', opts).values, [['Date'], [46204.5]]);
});

test('Values.get sur un onglet vide omet values ; refuse un autre classeur ou d\'autres options', () => {
  const { spreadsheet } = build([{ sheetId: 1, title: 'Vide', grid: [] }]);
  const sheets = createSheetsAdvancedService(() => spreadsheet, 'SHEET_A');
  const opts = { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' };
  assert.deepStrictEqual(sheets.Spreadsheets.Values.get('SHEET_A', '\'Vide\'', opts), { range: '\'Vide\'', majorDimension: 'ROWS' });
  assert.throws(() => sheets.Spreadsheets.Values.get('AUTRE', '\'Vide\'', opts), /hors tenant/);
  assert.throws(() => sheets.Spreadsheets.Values.get('SHEET_A', '\'Vide\'', {}), /non supportées/);
});
