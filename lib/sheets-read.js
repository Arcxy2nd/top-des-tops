'use strict';

// Portage Node de la logique de lecture de Code.gs (_fetchSheetValues,
// _parseDateCell, _isHeaderRow, _headerOffsetFromValues, _readDataRows).
// Ces tables et fonctions doivent rester synchronisées MANUELLEMENT avec
// Code.gs jusqu'à ce que le Plan 2 retire complètement le backend GAS.
// Portage en LECTURE SEULE : pas d'équivalent à _ensureSheetHeaders ici
// (écriture hors périmètre de ce plan).

const SHEET_HEADERS = {
  players:       ['name', 'avatar url', 'hex color', 'password', 'ordre'],
  categories:    ['name', 'description', 'emoji', 'hex color', 'ordre'],
  history:       ['date', 'player', 'category', 'points', 'description', 'groupid', 'saiseur', 'baremeid'],
  notes:         ['date', 'joueur', 'note', 'noteid', 'créépar', 'modifiépar', 'modifiéle'],
  bareme:        ['top', 'action', 'points', 'id'],
  phrases:       ['preset', 'pool', 'phrase', 'ordre'],
  chat:          ['id', 'date', 'auteur', 'texte', 'réponseà'],
  auditLog:      ['timestamp', 'auteur', 'action', 'entité', 'avant', 'après', 'détail', 'snapshot', 'annuléle'],
  settings:      ['key', 'value'],
  altCategories: ['name', 'description', 'emoji', 'hex color'],
  altHistory:    ['date', 'player', 'category', 'points', 'description', 'refhistoryrowid', 'groupid', 'saiseur'],
  autoRules:     ['id', 'player', 'category', 'points', 'description', 'frequency', 'interval',
                  'daysofweek', 'dayofmonth', 'startdate', 'nextrun', 'lastrun', 'active', 'createdby'],
  aggregates:    ['type', 'key1', 'key2', 'key3', 'points', 'count', 'meta']
};

const CANONICAL_SHEET_HEADERS = {
  players:       ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
  categories:    ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'],
  history:       ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur', 'BaremeId'],
  notes:         ['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe'],
  bareme:        ['Top', 'Action', 'Points', 'Id'],
  phrases:       ['Preset', 'Pool', 'Phrase', 'Ordre'],
  chat:          ['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ'],
  auditLog:      ['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe'],
  settings:      ['Key', 'Value'],
  altCategories: ['Name', 'Description', 'Emoji', 'Hex color'],
  altHistory:    ['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Saiseur'],
  autoRules:     ['ID', 'Joueur', 'Catégorie', 'Points', 'Description', 'Fréquence', 'Intervalle',
                  'JoursSemaine', 'JourMois', 'DateDébut', 'ProchaineExécution', 'DernièreExécution', 'Actif', 'CrééPar'],
  aggregates:    ['Type', 'Key1', 'Key2', 'Key3', 'Points', 'Count', 'Meta']
};

const DATE_FIRST_SHEETS = { history: true, notes: true, altHistory: true, auditLog: true };

/** Convertit un index de colonne 1-based en lettres A1 (1 -> A, 7 -> G, 27 -> AA). */
function colIndexToA1(colIndex) {
  let s = '';
  let n = colIndex;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s || 'A';
}

/** Parse une cellule en Date valide : numéro de série Sheets, chaîne ISO ou dd/mm/yyyy. */
function parseDateCell(val) {
  if (!val) return new Date(NaN);
  if (val && typeof val.getTime === 'function') {
    return (isNaN(val.getTime()) || val.getFullYear() <= 1970) ? new Date(NaN) : val;
  }
  if (typeof val === 'number' || (typeof val === 'string' && /^\d+(\.\d+)?$/.test(String(val).trim()))) {
    const num = Number(val);
    if (!Number.isFinite(num) || num < 1000) return new Date(NaN);
    const ms = Math.round((num - 25569) * 86400 * 1000);
    const u = new Date(ms);
    const res = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
    return res.getFullYear() <= 1970 ? new Date(NaN) : res;
  }
  const s = String(val).trim();
  if (!s) return new Date(NaN);
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    if (y <= 1970) return new Date(NaN);
    const rest = dmyMatch[4].trim();
    if (rest) {
      const timeParts = rest.split(/[:\s]+/).filter(Boolean).map(Number);
      return new Date(y, m, d, timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);
    }
    return new Date(y, m, d);
  }
  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(.*)$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    if (y <= 1970) return new Date(NaN);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    const rest = ymdMatch[4].trim();
    if (rest) {
      const timeParts = rest.split(/[:\sT]+/).filter(Boolean).map(Number);
      return new Date(y, m, d, timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);
    }
    return new Date(y, m, d);
  }
  const fallback = new Date(s);
  return (isNaN(fallback.getTime()) || fallback.getFullYear() <= 1970) ? new Date(NaN) : fallback;
}

/** True si `v` ressemble à une vraie date (Date, numéro de série, ou chaîne parseable). */
function isDateCell(v) {
  if (v && typeof v.getTime === 'function') return !isNaN(v.getTime());
  if (typeof v === 'number') return v > 30000 && v < 80000;
  const s = (v === null || v === undefined) ? '' : String(v).trim();
  if (!s) return false;
  return !isNaN(parseDateCell(s).getTime());
}

/** True quand `row` est une ligne de libellés plutôt qu'un enregistrement. */
function isHeaderRow(sheetKey, row) {
  const labels = SHEET_HEADERS[sheetKey];
  if (!labels) return true;
  if (!row || !row.length) return false;
  const norm = v => (v === null || v === undefined) ? '' : String(v).trim().toLowerCase();
  let matches = 0;
  for (let i = 0; i < labels.length && i < row.length; i++) {
    if (norm(row[i]) === labels[i]) matches++;
  }
  if (matches >= 2 || (matches === 1 && norm(row[0]) === labels[0])) return true;
  if (DATE_FIRST_SHEETS[sheetKey]) return !isDateCell(row[0]);
  return false;
}

/** Dérive le nom d'onglet réel depuis la clé de feuille (categories -> Categories). */
function _sheetNameFromKey(sheetKey) {
  return sheetKey ? (sheetKey.charAt(0).toUpperCase() + sheetKey.slice(1)) : '';
}

/**
 * Lit les valeurs brutes d'une feuille via Sheets API v4 REST, complétées à la
 * largeur canonique — même comportement que _fetchSheetValues côté Code.gs
 * (UNFORMATTED_VALUE + SERIAL_NUMBER pour rester cohérent avec parseDateCell).
 */
async function fetchSheetValues(accessToken, spreadsheetId, sheetKey, optNumCols, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const sheetName = _sheetNameFromKey(sheetKey);
  const safeName = "'" + sheetName.replace(/'/g, "''") + "'";
  const range = optNumCols ? (safeName + '!A1:' + colIndexToA1(optNumCols)) : safeName;
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) +
    '/values/' + encodeURIComponent(range) +
    '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
  const res = await doFetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Échec de lecture Sheets API (' + res.status + ') : ' + text);
  }
  const json = await res.json();
  const rawValues = json.values || [];
  const minCols = (sheetKey && CANONICAL_SHEET_HEADERS[sheetKey]) ? CANONICAL_SHEET_HEADERS[sheetKey].length : 0;
  const width = optNumCols || Math.max(minCols, rawValues.reduce((max, r) => Math.max(max, r ? r.length : 0), 0));
  return rawValues.map(row => {
    const padded = (row || []).slice(0, width).map(cell => (cell === null || cell === undefined) ? '' : cell);
    while (padded.length < width) padded.push('');
    return padded;
  });
}

/**
 * Lit les lignes de données d'une feuille, en retirant la ligne d'en-tête si elle est présente.
 * Divergence volontaire avec Code.gs : côté GAS, la branche sans en-tête appelle
 * _ensureSheetHeaders(...) qui INSÈRE une ligne d'en-tête et décale les données
 * vers le bas (d'où startRow: 2 là-bas). Ce portage est lecture seule et n'écrit
 * rien : quand la ligne 1 est déjà une donnée, elle reste à la ligne réelle 1 du
 * classeur, donc startRow doit être 1 ici, pas 2.
 */
async function readDataRows(accessToken, spreadsheetId, sheetKey, numCols, fetchImpl) {
  const all = await fetchSheetValues(accessToken, spreadsheetId, sheetKey, numCols, fetchImpl);
  if (!all.length) return { values: [], startRow: 2 };
  if (!isHeaderRow(sheetKey, all[0])) return { values: all, startRow: 1 };
  return { values: all.slice(1), startRow: 2 };
}

module.exports = {
  SHEET_HEADERS, CANONICAL_SHEET_HEADERS, DATE_FIRST_SHEETS,
  colIndexToA1, parseDateCell, isDateCell, isHeaderRow,
  fetchSheetValues, readDataRows
};
