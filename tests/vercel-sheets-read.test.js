'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  colIndexToA1, parseDateCell, isDateCell, isHeaderRow,
  fetchSheetValues, readDataRows, CANONICAL_SHEET_HEADERS
} = require('../lib/sheets-read');

test('colIndexToA1 convertit un index de colonne en lettres A1', () => {
  assert.strictEqual(colIndexToA1(1), 'A');
  assert.strictEqual(colIndexToA1(7), 'G');
  assert.strictEqual(colIndexToA1(27), 'AA');
});

test('parseDateCell lit un numéro de série Sheets', () => {
  // 45000 = environ 2023-03-15 en numéro de série Sheets (epoch 1899-12-30)
  const d = parseDateCell(45000);
  assert.ok(!isNaN(d.getTime()));
  assert.strictEqual(d.getFullYear(), 2023);
});

test('parseDateCell lit une chaîne dd/mm/yyyy', () => {
  const d = parseDateCell('15/03/2023');
  assert.strictEqual(d.getFullYear(), 2023);
  assert.strictEqual(d.getMonth(), 2);
  assert.strictEqual(d.getDate(), 15);
});

test('parseDateCell lit une chaîne yyyy-mm-dd', () => {
  const d = parseDateCell('2023-03-15');
  assert.strictEqual(d.getFullYear(), 2023);
  assert.strictEqual(d.getMonth(), 2);
  assert.strictEqual(d.getDate(), 15);
});

test('parseDateCell retourne une Date invalide pour une entrée vide ou fausse', () => {
  assert.ok(isNaN(parseDateCell('').getTime()));
  assert.ok(isNaN(parseDateCell('pas une date').getTime()));
  assert.ok(isNaN(parseDateCell(null).getTime()));
});

test('isDateCell distingue une vraie date d\'un texte quelconque', () => {
  assert.strictEqual(isDateCell('15/03/2023'), true);
  assert.strictEqual(isDateCell('Alex'), false);
  assert.strictEqual(isDateCell(45000), true);
});

test('isHeaderRow reconnaît la ligne d\'en-tête canonique de Categories', () => {
  const row = ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'];
  assert.strictEqual(isHeaderRow('categories', row), true);
});

test('isHeaderRow rejette une ligne de donnée réelle sur Categories', () => {
  const row = ['Mario Kart', 'Courses en ligne', '🏎️', '#ff0000', '1'];
  assert.strictEqual(isHeaderRow('categories', row), false);
});

test('isHeaderRow — sur une feuille DATE_FIRST (history), une vraie date en col 0 n\'est jamais un en-tête', () => {
  // Même si Player/Category/Points ressemblaient par hasard à des libellés,
  // une date valide en première colonne prime — résilience "ligne 1 sans en-tête" (§3 context.md)
  const row = ['15/03/2023', 'Alex', 'Mario Kart', '5', 'Victoire'];
  assert.strictEqual(isHeaderRow('history', row), false);
});

test('isHeaderRow — sur history, une ligne 1 non-date est traitée comme en-tête', () => {
  const row = ['Date', 'Player', 'Category', 'Points', 'Description'];
  assert.strictEqual(isHeaderRow('history', row), true);
});

test('fetchSheetValues construit l\'URL Sheets API v4 attendue et complète chaque ligne à la largeur canonique', async () => {
  let capturedUrl = null;
  let capturedAuth = null;
  const fakeFetch = async (url, opts) => {
    capturedUrl = url;
    capturedAuth = opts.headers.Authorization;
    return { ok: true, json: async () => ({ values: [['Name', 'Description'], ['Mario Kart']] }) };
  };

  const rows = await fetchSheetValues('token-abc', 'SHEET_ID_1', 'categories', undefined, fakeFetch);

  assert.match(capturedUrl, /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/SHEET_ID_1\/values\/'Categories'/);
  assert.match(capturedUrl, /valueRenderOption=UNFORMATTED_VALUE/);
  assert.match(capturedUrl, /dateTimeRenderOption=SERIAL_NUMBER/);
  assert.strictEqual(capturedAuth, 'Bearer token-abc');

  const width = CANONICAL_SHEET_HEADERS.categories.length;
  assert.strictEqual(rows[0].length, width);
  assert.strictEqual(rows[1].length, width);
  assert.deepStrictEqual(rows[1], ['Mario Kart', '', '', '', '']);
});

test('fetchSheetValues lève une erreur explicite si l\'API répond en échec', async () => {
  const fakeFetch = async () => ({ ok: false, status: 403, text: async () => 'permission refusée' });
  await assert.rejects(
    () => fetchSheetValues('token-abc', 'SHEET_ID_1', 'categories', undefined, fakeFetch),
    /Échec de lecture Sheets API \(403\)/
  );
});

test('readDataRows retire la ligne d\'en-tête quand elle est présente', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ values: [
      ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'],
      ['Mario Kart', 'Courses', '🏎️', '#ff0000', '1']
    ] })
  });
  const { values, startRow } = await readDataRows('token-abc', 'SHEET_ID_1', 'categories', undefined, fakeFetch);
  assert.strictEqual(values.length, 1);
  assert.strictEqual(values[0][0], 'Mario Kart');
  assert.strictEqual(startRow, 2);
});

test('readDataRows garde la ligne 1 quand ce n\'est pas un en-tête (résilience §3 context.md)', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ values: [
      ['Mario Kart', 'Courses', '🏎️', '#ff0000', '1'],
      ['Zelda', 'Aventure', '🗡️', '#00ff00', '2']
    ] })
  });
  const { values } = await readDataRows('token-abc', 'SHEET_ID_1', 'categories', undefined, fakeFetch);
  assert.strictEqual(values.length, 2);
  assert.strictEqual(values[0][0], 'Mario Kart');
});

test('readDataRows retourne un tableau vide pour une feuille vide', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({}) });
  const { values } = await readDataRows('token-abc', 'SHEET_ID_1', 'categories', undefined, fakeFetch);
  assert.deepStrictEqual(values, []);
});
