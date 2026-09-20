'use strict';

const { isDate, dateToSerial } = require('./cell-values');

// Traduit le journal d'écritures du modèle en mémoire (spreadsheet.js) en
// requêtes spreadsheets.batchUpdate. Module pur : aucune requête réseau, aucun
// état — toute la fidélité d'écriture se teste ici, hors Google.

const DATE_PATTERN = 'dd/MM/yyyy HH:mm:ss';
const NEW_SHEET_ROWS = 1000;
const NEW_SHEET_COLS = 26;

/**
 * CellData typée. GAS interprète une saisie commençant par '=' comme une
 * formule : c'est la seule coercition de setValues atteignable depuis une
 * saisie utilisateur et observable à la relecture, donc la seule reproduite.
 */
function cellData(value) {
  if (value === '' || value === null || value === undefined) return {};
  if (isDate(value)) return { userEnteredValue: { numberValue: dateToSerial(value) } };
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  const text = String(value);
  if (text.charAt(0) === '=') return { userEnteredValue: { formulaValue: text } };
  return { userEnteredValue: { stringValue: text } };
}

function _range(sheetId, row, col, numRows, numCols) {
  return {
    sheetId,
    startRowIndex: row - 1,
    endRowIndex: row - 1 + numRows,
    startColumnIndex: col - 1,
    endColumnIndex: col - 1 + numCols
  };
}

/**
 * cellFromApi ne rend un Date que si la cellule porte un format date : écrire
 * le numéro de série sans format ferait relire un nombre au prochain appel.
 * Les dates d'une même colonne sont regroupées en plages contiguës pour ne pas
 * émettre une requête par cellule sur une réécriture en bloc.
 */
function _dateFormatRequests(sheetId, row, col, values) {
  const out = [];
  const numCols = values.reduce((max, r) => Math.max(max, r.length), 0);
  for (let j = 0; j < numCols; j++) {
    let start = -1;
    for (let i = 0; i <= values.length; i++) {
      const isDateCell = i < values.length && isDate(values[i][j]);
      if (isDateCell && start < 0) start = i;
      if (!isDateCell && start >= 0) {
        out.push({
          repeatCell: {
            range: _range(sheetId, row + start, col + j, i - start, 1),
            cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: DATE_PATTERN } } },
            fields: 'userEnteredFormat.numberFormat'
          }
        });
        start = -1;
      }
    }
  }
  return out;
}

function _valueRequests(sheetId, row, col, values) {
  const numRows = values.length;
  const numCols = values.reduce((max, r) => Math.max(max, r.length), 0);
  if (!numRows || !numCols) return [];
  const rows = values.map(r => {
    const cells = [];
    for (let j = 0; j < numCols; j++) cells.push(cellData(r[j]));
    return { values: cells };
  });
  return [{ updateCells: { range: _range(sheetId, row, col, numRows, numCols), rows, fields: 'userEnteredValue' } }]
    .concat(_dateFormatRequests(sheetId, row, col, values));
}

/**
 * deleteRow() est appelé en boucle par les outils de nettoyage : soit toujours
 * sur le même index (les lignes suivantes remontent), soit en descendant. Les
 * deux formes se replient sur une seule plage, sinon un nettoyage de 2 000
 * lignes produit 2 000 requêtes.
 */
function _coalesce(journal) {
  const out = [];
  journal.forEach(entry => {
    const prev = out[out.length - 1];
    if (entry.op === 'deleteRows' && prev && prev.op === 'deleteRows' && prev.sheetId === entry.sheetId) {
      if (entry.index === prev.index) {
        out[out.length - 1] = { op: 'deleteRows', sheetId: entry.sheetId, index: prev.index, count: prev.count + entry.count };
        return;
      }
      if (entry.index + entry.count === prev.index) {
        out[out.length - 1] = { op: 'deleteRows', sheetId: entry.sheetId, index: entry.index, count: prev.count + entry.count };
        return;
      }
    }
    out.push(entry);
  });
  return out;
}

/** Ligne/colonne maximales touchées par onglet, insertions comprises (majorant). */
function _needsBySheet(journal) {
  const needs = {};
  const inserted = {};
  function touch(sheetId, row, col) {
    const n = needs[sheetId] || (needs[sheetId] = { rows: 0, cols: 0 });
    if (row > n.rows) n.rows = row;
    if (col > n.cols) n.cols = col;
  }
  journal.forEach(e => {
    if (e.op === 'setValues' || e.op === 'appendRow') {
      const numRows = e.values.length;
      const numCols = e.values.reduce((max, r) => Math.max(max, r.length), 0);
      touch(e.sheetId, e.row + numRows - 1, (e.col || 1) + numCols - 1);
    } else if (e.op === 'setFontWeight') {
      touch(e.sheetId, e.row + e.numRows - 1, e.col + e.numCols - 1);
    } else if (e.op === 'insertRows') {
      inserted[e.sheetId] = (inserted[e.sheetId] || 0) + e.count;
    }
  });
  // Les insertions s'ajoutent après coup : additionnées pendant la boucle,
  // elles seraient écrasées par le max d'une touche de ligne plus basse.
  Object.keys(inserted).forEach(sheetId => {
    const n = needs[sheetId] || (needs[sheetId] = { rows: 0, cols: 0 });
    n.rows += inserted[sheetId];
  });
  return needs;
}

function buildBatchRequests(journal, sheetGrids) {
  const entries = _coalesce(journal || []);
  const needs = _needsBySheet(entries);
  const created = {};
  entries.filter(e => e.op === 'addSheet' || e.op === 'duplicateSheet').forEach(e => { created[e.sheetId] = true; });

  const grown = {};
  const out = [];

  function ensureRoom(sheetId) {
    if (grown[sheetId] || created[sheetId]) return;
    grown[sheetId] = true;
    const need = needs[sheetId];
    const grid = (sheetGrids && sheetGrids[sheetId]) || null;
    if (!need || !grid) return;
    if (need.rows > grid.rowCount) {
      out.push({ appendDimension: { sheetId, dimension: 'ROWS', length: need.rows - grid.rowCount } });
    }
    if (need.cols > grid.columnCount) {
      out.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: need.cols - grid.columnCount } });
    }
  }

  entries.forEach(e => {
    switch (e.op) {
      case 'addSheet': {
        const need = needs[e.sheetId] || { rows: 0, cols: 0 };
        out.push({ addSheet: { properties: { sheetId: e.sheetId, title: e.title, gridProperties: {
          rowCount: Math.max(NEW_SHEET_ROWS, need.rows),
          columnCount: Math.max(NEW_SHEET_COLS, need.cols)
        } } } });
        break;
      }
      case 'duplicateSheet':
        out.push({ duplicateSheet: { sourceSheetId: e.sourceSheetId, newSheetId: e.sheetId, newSheetName: e.title } });
        break;
      case 'deleteSheet':
        out.push({ deleteSheet: { sheetId: e.sheetId } });
        break;
      case 'renameSheet':
        out.push({ updateSheetProperties: { properties: { sheetId: e.sheetId, title: e.title }, fields: 'title' } });
        break;
      case 'setValues':
      case 'appendRow':
        ensureRoom(e.sheetId);
        _valueRequests(e.sheetId, e.row, e.col || 1, e.values).forEach(r => out.push(r));
        break;
      case 'setFontWeight':
        ensureRoom(e.sheetId);
        out.push({ repeatCell: {
          range: _range(e.sheetId, e.row, e.col, e.numRows, e.numCols),
          cell: { userEnteredFormat: { textFormat: { bold: String(e.weight) === 'bold' } } },
          fields: 'userEnteredFormat.textFormat.bold'
        } });
        break;
      case 'insertRows':
        ensureRoom(e.sheetId);
        out.push({ insertDimension: {
          range: { sheetId: e.sheetId, dimension: 'ROWS', startIndex: e.index - 1, endIndex: e.index - 1 + e.count },
          inheritFromBefore: false
        } });
        break;
      case 'deleteRows':
        out.push({ deleteDimension: {
          range: { sheetId: e.sheetId, dimension: 'ROWS', startIndex: e.index - 1, endIndex: e.index - 1 + e.count }
        } });
        break;
      case 'clearContents':
        out.push({ updateCells: { range: { sheetId: e.sheetId }, fields: 'userEnteredValue' } });
        break;
      case 'clear':
        out.push({ updateCells: { range: { sheetId: e.sheetId }, fields: '*' } });
        break;
      default:
        // Une opération non traduite serait une écriture perdue en silence.
        throw new Error('Opération de journal non supportée par le rejeu : ' + e.op);
    }
  });

  return out;
}

module.exports = { buildBatchRequests, cellData, DATE_PATTERN, NEW_SHEET_ROWS, NEW_SHEET_COLS };
