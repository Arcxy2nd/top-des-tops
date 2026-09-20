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
  assert.deepStrictEqual(meta, { timeZone: 'Europe/Paris', sheets: [{ sheetId: 7, title: 'Players', rowCount: 0, columnCount: 0 }] });
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

const { sendBatchUpdate, sheetsRequest } = require('../lib/gas-runtime/sheets-snapshot');

test('fetchSpreadsheetMeta remonte la taille de grille de chaque onglet', () => {
  const calls = [];
  const syncFetch = (url) => {
    calls.push(url);
    return { status: 200, body: JSON.stringify({
      properties: { timeZone: 'Europe/Paris' },
      sheets: [{ properties: { sheetId: 7, title: 'History', gridProperties: { rowCount: 2000, columnCount: 12 } } }]
    }) };
  };
  const meta = fetchSpreadsheetMeta({ syncFetch, accessToken: 'tok', spreadsheetId: 'S' });
  assert.deepStrictEqual(meta.sheets, [{ sheetId: 7, title: 'History', rowCount: 2000, columnCount: 12 }]);
  assert.match(decodeURIComponent(calls[0]), /gridProperties\(rowCount,columnCount\)/);
});

test('fetchSpreadsheetMeta tolère un onglet sans gridProperties', () => {
  const syncFetch = () => ({ status: 200, body: JSON.stringify({
    properties: { timeZone: 'Europe/Paris' },
    sheets: [{ properties: { sheetId: 1, title: 'X' } }]
  }) });
  const meta = fetchSpreadsheetMeta({ syncFetch, accessToken: 'tok', spreadsheetId: 'S' });
  assert.deepStrictEqual(meta.sheets, [{ sheetId: 1, title: 'X', rowCount: 0, columnCount: 0 }]);
});

test('sendBatchUpdate poste un seul lot ordonné sur :batchUpdate', () => {
  const calls = [];
  const syncFetch = (url, init) => {
    calls.push({ url, init });
    return { status: 200, body: JSON.stringify({ replies: [{}, {}] }) };
  };
  const requests = [{ deleteSheet: { sheetId: 1 } }, { deleteSheet: { sheetId: 2 } }];
  const res = sendBatchUpdate({ syncFetch, accessToken: 'tok', spreadsheetId: 'S', requests });
  assert.strictEqual(calls.length, 1);
  assert.match(calls[0].url, /\/S:batchUpdate$/);
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepStrictEqual(JSON.parse(calls[0].init.body).requests, requests);
  assert.strictEqual(res.replies.length, 2);
});

test('sendBatchUpdate sans requête n\'appelle pas le réseau', () => {
  let called = 0;
  sendBatchUpdate({ syncFetch: () => { called++; return { status: 200, body: '{}' }; }, accessToken: 'tok', spreadsheetId: 'S', requests: [] });
  assert.strictEqual(called, 0);
});

test('sendBatchUpdate en échec : message générique, détail amont hors réponse', () => {
  const syncFetch = () => ({ status: 403, body: JSON.stringify({ error: { message: 'The caller does not have permission svc@projet.iam' } }) });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(
      () => sendBatchUpdate({ syncFetch, accessToken: 'tok', spreadsheetId: 'S', requests: [{ deleteSheet: { sheetId: 1 } }] }),
      err => /403/.test(err.message) && !/svc@projet/.test(err.message)
    );
  } finally {
    console.error = originalError;
  }
});

test('sheetsRequest transmet un GET sans corps', () => {
  const calls = [];
  const syncFetch = (url, init) => { calls.push(init); return { status: 200, body: '{"ok":1}' }; };
  const json = sheetsRequest({ syncFetch, accessToken: 'tok', url: 'https://x/y', what: 'test' });
  assert.deepStrictEqual(json, { ok: 1 });
  assert.strictEqual(calls[0].method, 'GET');
  assert.strictEqual(calls[0].body, undefined);
});
