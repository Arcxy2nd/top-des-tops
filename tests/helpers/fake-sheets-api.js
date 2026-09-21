'use strict';

// Faux Sheets API v4 pour tester le runtime GAS sur Node : répond de façon
// SYNCHRONE aux requêtes émises par lib/gas-runtime (métadonnées, grilles
// typées, cellule de verrou, batchUpdate), à partir de grilles JS en mémoire.
const { isDate, dateToSerial, serialToDate } = require('../../lib/gas-runtime/cell-values');

const DATE_FORMAT_TYPES = { DATE: true, TIME: true, DATE_TIME: true };

function _blankRow(width) {
  return new Array(Math.max(0, width)).fill('');
}

/** Élargit la grille pour que (row, col) existe — comme Sheets, qui n'a pas de trous. */
function _ensureCell(grid, row, col) {
  while (grid.length <= row) grid.push([]);
  const line = grid[row];
  while (line.length <= col) line.push('');
}

/** Valeur JS d'un `userEnteredValue` de batchUpdate (l'inverse de cellData()). */
function _valueFromUserEntered(cell) {
  const uev = cell && cell.userEnteredValue;
  if (!uev) return '';
  if (uev.stringValue !== undefined) return uev.stringValue;
  if (uev.numberValue !== undefined) return uev.numberValue;
  if (uev.boolValue !== undefined) return uev.boolValue;
  if (uev.formulaValue !== undefined) return uev.formulaValue;
  return '';
}

/**
 * Applique un batchUpdate aux grilles en mémoire — c'est ce qui manquait : sans
 * ça, aucun test ne pouvait faire un aller-retour écriture → relecture, et un
 * décalage d'index dans le rejeu du journal passait inaperçu.
 *
 * Fidélité volontairement bornée à ce que `buildBatchRequests` émet réellement.
 * Un `repeatCell` de format DATE_TIME reconvertit le numéro de série en Date
 * dans la grille : c'est exactement ce que fait Sheets, dont la relecture ne
 * rend un Date que si la cellule porte un format date.
 */
function applyBatchRequests(state, requests) {
  (requests || []).forEach(req => {
    if (req.addSheet) {
      const p = req.addSheet.properties;
      state.register(p.sheetId, p.title);
      state.grids[p.title] = [];
      return;
    }
    if (req.duplicateSheet) {
      const d = req.duplicateSheet;
      const source = state.titleById(d.sourceSheetId);
      state.register(d.newSheetId, d.newSheetName);
      state.grids[d.newSheetName] = (state.grids[source] || []).map(r => r.slice());
      return;
    }
    if (req.deleteSheet) {
      const title = state.titleById(req.deleteSheet.sheetId);
      state.unregister(req.deleteSheet.sheetId);
      delete state.grids[title];
      return;
    }
    if (req.updateSheetProperties) {
      const p = req.updateSheetProperties.properties;
      const old = state.titleById(p.sheetId);
      if (old !== undefined && p.title && p.title !== old) {
        state.grids[p.title] = state.grids[old] || [];
        delete state.grids[old];
        state.rename(p.sheetId, old, p.title);
      }
      return;
    }
    if (req.appendDimension) {
      const a = req.appendDimension;
      const grid = state.grids[state.titleById(a.sheetId)];
      if (!grid) return;
      if (a.dimension === 'ROWS') {
        const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
        for (let i = 0; i < a.length; i++) grid.push(_blankRow(width));
      } else {
        grid.forEach(r => { for (let i = 0; i < a.length; i++) r.push(''); });
      }
      return;
    }
    if (req.insertDimension) {
      const r = req.insertDimension.range;
      const grid = state.grids[state.titleById(r.sheetId)];
      if (!grid || r.dimension !== 'ROWS') return;
      const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
      const added = [];
      for (let i = r.startIndex; i < r.endIndex; i++) added.push(_blankRow(width));
      grid.splice(r.startIndex, 0, ...added);
      return;
    }
    if (req.deleteDimension) {
      const r = req.deleteDimension.range;
      const grid = state.grids[state.titleById(r.sheetId)];
      if (!grid || r.dimension !== 'ROWS') return;
      grid.splice(r.startIndex, r.endIndex - r.startIndex);
      return;
    }
    if (req.updateCells) {
      const u = req.updateCells;
      const title = state.titleById(u.range.sheetId);
      const grid = state.grids[title];
      if (!grid) return;
      // Plage sans bornes = clear de tout l'onglet (clearContents / clear).
      if (u.range.startRowIndex === undefined) {
        grid.forEach(row => { for (let j = 0; j < row.length; j++) row[j] = ''; });
        return;
      }
      (u.rows || []).forEach((row, i) => {
        (row.values || []).forEach((cell, j) => {
          const rowIdx = u.range.startRowIndex + i;
          const colIdx = u.range.startColumnIndex + j;
          _ensureCell(grid, rowIdx, colIdx);
          grid[rowIdx][colIdx] = _valueFromUserEntered(cell);
        });
      });
      return;
    }
    if (req.repeatCell) {
      const c = req.repeatCell;
      const format = c.cell && c.cell.userEnteredFormat && c.cell.userEnteredFormat.numberFormat;
      if (!format || !DATE_FORMAT_TYPES[format.type]) return; // gras & co : sans effet sur les valeurs
      const grid = state.grids[state.titleById(c.range.sheetId)];
      if (!grid) return;
      for (let i = c.range.startRowIndex; i < c.range.endRowIndex; i++) {
        for (let j = c.range.startColumnIndex; j < c.range.endColumnIndex; j++) {
          if (grid[i] && typeof grid[i][j] === 'number') grid[i][j] = serialToDate(grid[i][j]);
        }
      }
    }
  });
}

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
  const batches = [];
  let lockCell = '';
  const timeZone = (options && options.timeZone) || 'Europe/Paris';
  // Optionnel : absent par défaut (comportement inchangé), utile aux tests qui
  // exercent Spreadsheet.getName() (BackupService).
  const spreadsheetTitle = options && options.name;

  // Registre d'onglets mutable : addSheet/deleteSheet/renameSheet d'un lot
  // doivent se voir dans les métadonnées relues ensuite.
  const order = Object.keys(gridsByTitle);
  const idOf = {};
  order.forEach((t, i) => { idOf[t] = i + 1; });
  const state = {
    grids: gridsByTitle,
    titleById: id => order.find(t => idOf[t] === id),
    register(id, title) { if (order.indexOf(title) === -1) order.push(title); idOf[title] = id; },
    unregister(id) {
      const t = state.titleById(id);
      if (t === undefined) return;
      order.splice(order.indexOf(t), 1);
      delete idOf[t];
    },
    rename(id, oldTitle, newTitle) {
      const i = order.indexOf(oldTitle);
      if (i >= 0) order[i] = newTitle;
      delete idOf[oldTitle];
      idOf[newTitle] = id;
    }
  };

  function syncFetch(url, init) {
    calls.push({ url, init });
    if (/:batchUpdate$/.test(url)) {
      const body = JSON.parse((init && init.body) || '{}');
      batches.push(body.requests || []);
      applyBatchRequests(state, body.requests);
      return { status: 200, body: JSON.stringify({ replies: (body.requests || []).map(() => ({})) }) };
    }
    if (/\/values\//.test(url)) {
      // Cellule de bail du verrou : libre par défaut, acceptée à l'écriture.
      if (init && init.method === 'PUT') {
        lockCell = JSON.parse(init.body).values[0][0];
        return { status: 200, body: JSON.stringify({ updatedCells: 1 }) };
      }
      return { status: 200, body: JSON.stringify(lockCell === '' ? {} : { values: [[lockCell]] }) };
    }
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
      body: JSON.stringify({
        properties: Object.assign({ timeZone }, spreadsheetTitle ? { title: spreadsheetTitle } : {}),
        sheets: order.map(title => ({
          properties: {
            sheetId: idOf[title],
            title,
            gridProperties: {
              rowCount: Math.max(1, (gridsByTitle[title] || []).length),
              columnCount: Math.max(1, (gridsByTitle[title] || []).reduce((m, r) => Math.max(m, (r || []).length), 0))
            }
          }
        }))
      })
    };
  }
  // `grids` est la carte vivante : un test peut relire ce que le lot a écrit.
  return { syncFetch, calls, batches, grids: gridsByTitle, lastBatch: () => batches[batches.length - 1] || null };
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

module.exports = { makeFakeSheetsApi, fixtureGrids, toApiCell, applyBatchRequests };
