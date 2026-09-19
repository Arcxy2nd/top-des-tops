'use strict';

const { gridFromRowData } = require('./cell-values');

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const META_FIELDS = 'properties.timeZone,sheets.properties(sheetId,title)';
const GRID_FIELDS = 'sheets(properties.title,data.rowData.values(effectiveValue,effectiveFormat.numberFormat.type))';

/** Nom d'onglet en notation A1, apostrophes doublées (même règle que _fetchSheetValues). */
function quoteSheetName(title) {
  return '\'' + String(title).replace(/'/g, '\'\'') + '\'';
}

function _getJson(syncFetch, accessToken, url, what) {
  const res = syncFetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (res.status !== 200) {
    // Détail amont (projet GCP, email du compte) : logs serveur uniquement.
    console.error('[gas-runtime] Sheets API ' + res.status + ' (' + what + ') : ' + String(res.body).slice(0, 500));
    throw new Error('Échec Sheets API (' + res.status + ') : ' + what);
  }
  return JSON.parse(res.body);
}

function fetchSpreadsheetMeta({ syncFetch, accessToken, spreadsheetId }) {
  const url = SHEETS_API + encodeURIComponent(spreadsheetId) + '?fields=' + encodeURIComponent(META_FIELDS);
  const json = _getJson(syncFetch, accessToken, url, 'lecture des métadonnées');
  return {
    timeZone: (json.properties && json.properties.timeZone) || null,
    sheets: (json.sheets || []).map(s => ({ sheetId: s.properties.sheetId, title: s.properties.title }))
  };
}

/**
 * Grilles typées de plusieurs onglets en UNE seule requête : chaque requête
 * compte dans le quota de lecture Sheets du compte de service, partagé par
 * tous les utilisateurs du tenant.
 */
function fetchGrids({ syncFetch, accessToken, spreadsheetId, titles, DateCtor }) {
  const out = {};
  if (!titles || !titles.length) return out;
  const ranges = titles.map(t => '&ranges=' + encodeURIComponent(quoteSheetName(t))).join('');
  const url = SHEETS_API + encodeURIComponent(spreadsheetId) + '?includeGridData=true&fields=' + encodeURIComponent(GRID_FIELDS) + ranges;
  const json = _getJson(syncFetch, accessToken, url, 'lecture des onglets');
  (json.sheets || []).forEach(s => {
    const data = s.data && s.data[0];
    out[s.properties.title] = gridFromRowData(data && data.rowData, DateCtor);
  });
  titles.forEach(t => { if (!out[t]) out[t] = []; });
  return out;
}

module.exports = { fetchSpreadsheetMeta, fetchGrids, quoteSheetName, SHEETS_API };
