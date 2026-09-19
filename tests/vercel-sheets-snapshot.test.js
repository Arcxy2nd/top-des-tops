'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { fetchSpreadsheetMeta, fetchGrids, quoteSheetName } = require('../lib/gas-runtime/sheets-snapshot');

function recorder(responder) {
  const calls = [];
  return {
    calls,
    syncFetch(url, init) {
      calls.push({ url, init });
      return responder(url, init);
    }
  };
}

test('quoteSheetName double les apostrophes (même règle que _fetchSheetValues)', () => {
  assert.strictEqual(quoteSheetName('Top d\'or'), '\'Top d\'\'or\'');
});

test('fetchSpreadsheetMeta lit fuseau et onglets avec le jeton en en-tête', () => {
  const r = recorder(() => ({ status: 200, body: JSON.stringify({ properties: { timeZone: 'Europe/Paris' }, sheets: [{ properties: { sheetId: 7, title: 'Players' } }] }) }));
  const meta = fetchSpreadsheetMeta({ syncFetch: r.syncFetch, accessToken: 'tok', spreadsheetId: 'SHEET_A' });
  assert.deepStrictEqual(meta, { timeZone: 'Europe/Paris', sheets: [{ sheetId: 7, title: 'Players' }] });
  assert.strictEqual(r.calls.length, 1);
  assert.match(r.calls[0].url, /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/SHEET_A\?fields=/);
  assert.strictEqual(r.calls[0].init.headers.Authorization, 'Bearer tok');
});

test('fetchGrids charge plusieurs onglets en UNE requête et remplit les absents', () => {
  const r = recorder(() => ({
    status: 200,
    body: JSON.stringify({ sheets: [{ properties: { title: 'Players' }, data: [{ rowData: [{ values: [{ effectiveValue: { stringValue: 'Safir' } }] }] }] }] })
  }));
  const grids = fetchGrids({ syncFetch: r.syncFetch, accessToken: 'tok', spreadsheetId: 'SHEET_A', titles: ['Players', 'Notes'] });
  assert.strictEqual(r.calls.length, 1);
  const url = new URL(r.calls[0].url);
  assert.strictEqual(url.searchParams.get('includeGridData'), 'true');
  assert.deepStrictEqual(url.searchParams.getAll('ranges'), ['\'Players\'', '\'Notes\'']);
  assert.deepStrictEqual(grids, { Players: [['Safir']], Notes: [] });
});

test('fetchGrids sans titre ne fait aucune requête', () => {
  const r = recorder(() => { throw new Error('ne doit pas être appelé'); });
  assert.deepStrictEqual(fetchGrids({ syncFetch: r.syncFetch, accessToken: 'tok', spreadsheetId: 'S', titles: [] }), {});
});

test('une réponse Sheets non-200 lève une erreur courte avec le code, sans le corps', () => {
  const r = recorder(() => ({ status: 403, body: 'secret-detail caller@project.iam' }));
  assert.throws(
    () => fetchSpreadsheetMeta({ syncFetch: r.syncFetch, accessToken: 'tok', spreadsheetId: 'S' }),
    err => /Échec Sheets API \(403\)/.test(err.message) && !/secret-detail/.test(err.message)
  );
});
