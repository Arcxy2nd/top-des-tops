'use strict';

const { gridFromRowData } = require('./cell-values');

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const META_FIELDS = 'properties.timeZone,properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))';
const GRID_FIELDS = 'sheets(properties.title,data.rowData.values(effectiveValue,effectiveFormat.numberFormat.type))';

/** Nom d'onglet en notation A1, apostrophes doublées (même règle que _fetchSheetValues). */
function quoteSheetName(title) {
  return '\'' + String(title).replace(/'/g, '\'\'') + '\'';
}

/**
 * Appel Sheets API unique (lecture comme écriture). Le corps d'erreur de
 * Google nomme le projet GCP et le compte de service : il va dans les logs
 * serveur, jamais dans le message remonté au client.
 */
function sheetsRequest({ syncFetch, accessToken, url, method, payload, what }) {
  const init = {
    method: method || 'GET',
    headers: { Authorization: 'Bearer ' + accessToken }
  };
  if (payload !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(payload);
  }
  const res = syncFetch(url, init);
  if (res.status !== 200) {
    console.error('[gas-runtime] Sheets API ' + res.status + ' (' + what + ') : ' + String(res.body).slice(0, 500));
    throw new Error('Échec Sheets API (' + res.status + ') : ' + what);
  }
  return JSON.parse(res.body);
}

function _getJson(syncFetch, accessToken, url, what) {
  return sheetsRequest({ syncFetch, accessToken, url, what });
}

function fetchSpreadsheetMeta({ syncFetch, accessToken, spreadsheetId }) {
  const url = SHEETS_API + encodeURIComponent(spreadsheetId) + '?fields=' + encodeURIComponent(META_FIELDS);
  const json = _getJson(syncFetch, accessToken, url, 'lecture des métadonnées');
  return {
    timeZone: (json.properties && json.properties.timeZone) || null,
    // Nom du classeur (Spreadsheet.getName() côté Code.gs) : BackupService en
    // a besoin pour nommer l'instantané.
    title: (json.properties && json.properties.title) || null,
    sheets: (json.sheets || []).map(s => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      rowCount: (s.properties.gridProperties && s.properties.gridProperties.rowCount) || 0,
      columnCount: (s.properties.gridProperties && s.properties.gridProperties.columnCount) || 0
    }))
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

/**
 * Envoie le lot d'écritures en UNE requête : spreadsheets.batchUpdate est
 * atomique côté Google (une requête invalide annule tout le lot), ce qui rend
 * impossible un état partiellement écrit — garantie que GAS n'offre pas.
 */
function sendBatchUpdate({ syncFetch, accessToken, spreadsheetId, requests }) {
  if (!requests || !requests.length) return { replies: [] };
  const url = SHEETS_API + encodeURIComponent(spreadsheetId) + ':batchUpdate';
  return sheetsRequest({ syncFetch, accessToken, url, method: 'POST', payload: { requests }, what: 'écriture du lot' });
}

module.exports = { fetchSpreadsheetMeta, fetchGrids, quoteSheetName, sheetsRequest, sendBatchUpdate, SHEETS_API };
