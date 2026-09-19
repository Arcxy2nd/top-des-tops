'use strict';

// Faux Sheets API v4 (lecture seule) pour tester le runtime GAS sur Node :
// répond de façon SYNCHRONE aux deux requêtes émises par lib/gas-runtime
// (métadonnées, grilles typées), à partir de grilles JS en mémoire.
const { isDate, dateToSerial } = require('../../lib/gas-runtime/cell-values');

function toApiCell(v) {
  if (v === '' || v === null || v === undefined) return {};
  if (isDate(v)) return { effectiveValue: { numberValue: dateToSerial(v) }, effectiveFormat: { numberFormat: { type: 'DATE_TIME' } } };
  if (typeof v === 'number') return { effectiveValue: { numberValue: v } };
  if (typeof v === 'boolean') return { effectiveValue: { boolValue: v } };
  return { effectiveValue: { stringValue: String(v) } };
}

function _unquote(a1) {
  const m = /^'((?:[^']|'')+)'$/.exec(a1);
  return m ? m[1].replace(/''/g, '\'') : a1;
}

/** gridsByTitle : { Players: [[...], ...], ... } — l'ordre des clés est l'ordre des onglets. */
function makeFakeSheetsApi(gridsByTitle, options) {
  const calls = [];
  const timeZone = (options && options.timeZone) || 'Europe/Paris';
  const titles = Object.keys(gridsByTitle);
  function syncFetch(url, init) {
    calls.push({ url, init });
    const u = new URL(url);
    if (u.searchParams.get('includeGridData') === 'true') {
      const sheets = u.searchParams.getAll('ranges').map(_unquote).map(title => ({
        properties: { title },
        data: [{ rowData: (gridsByTitle[title] || []).map(row => ({ values: (row || []).map(toApiCell) })) }]
      }));
      return { status: 200, body: JSON.stringify({ sheets }) };
    }
    return {
      status: 200,
      body: JSON.stringify({ properties: { timeZone }, sheets: titles.map((title, i) => ({ properties: { sheetId: i + 1, title } })) })
    };
  }
  return { syncFetch, calls };
}

/** Grilles de tests/frontend/fixtures.js, indexées par titre d'onglet (clé ConfigService → 'History', 'AltHistory'…). */
function fixtureGrids(sheets) {
  const out = {};
  Object.keys(sheets).forEach(key => {
    const sheet = sheets[key];
    if (!sheet || !Array.isArray(sheet._grid)) return;
    out[key.charAt(0).toUpperCase() + key.slice(1)] = sheet._grid.map(r => r.slice());
  });
  return out;
}

module.exports = { makeFakeSheetsApi, fixtureGrids, toApiCell };
