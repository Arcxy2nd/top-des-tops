'use strict';

// Rejoue un batchUpdate Sheets sur des grilles JS en mémoire. Servait d'abord
// au faux Sheets des tests ; promu ici parce que le cache du classeur
// (snapshot-cache) doit appliquer à sa copie EXACTEMENT le lot que Sheets
// vient d'accepter, pour rester identique au classeur sans le relire.
const { serialToDate } = require('./cell-values');

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

function _applyOne(state, req) {
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
}

/**
 * Applique un batchUpdate aux grilles en mémoire.
 *
 * Fidélité volontairement bornée à ce que `buildBatchRequests` émet réellement.
 * Un `repeatCell` de format DATE_TIME reconvertit le numéro de série en Date
 * dans la grille : c'est exactement ce que fait Sheets, dont la relecture ne
 * rend un Date que si la cellule porte un format date.
 *
 * `state.dims(req)`, s'il existe, est appelé APRÈS chaque requête : un
 * addSheet/duplicateSheet doit d'abord avoir enregistré l'onglet.
 */
function applyBatchRequests(state, requests) {
  (requests || []).forEach(req => {
    _applyOne(state, req);
    if (typeof state.dims === 'function') state.dims(req);
  });
}

/**
 * Adaptateur entre un instantané `fetchWorkbook` et `applyBatchRequests` : le
 * cache rejoue sur sa copie EXACTEMENT le lot accepté par Sheets, et garde les
 * dimensions de grille justes — buildBatchRequests s'en sert pour décider
 * d'un appendDimension, une dimension fausse ferait refuser le lot suivant.
 */
function createBookState(book) {
  const byId = id => book.sheets.find(s => s.sheetId === id);
  return {
    grids: book.grids,
    titleById: id => { const s = byId(id); return s ? s.title : undefined; },
    register(id, title) { if (!byId(id)) book.sheets.push({ sheetId: id, title, rowCount: 1000, columnCount: 26 }); },
    unregister(id) { book.sheets = book.sheets.filter(s => s.sheetId !== id); },
    rename(id, oldTitle, newTitle) { const s = byId(id); if (s) s.title = newTitle; },
    dims(req) {
      if (req.appendDimension) {
        const s = byId(req.appendDimension.sheetId);
        if (s) s[req.appendDimension.dimension === 'ROWS' ? 'rowCount' : 'columnCount'] += req.appendDimension.length;
      } else if (req.insertDimension && req.insertDimension.range.dimension === 'ROWS') {
        const r = req.insertDimension.range; const s = byId(r.sheetId);
        if (s) s.rowCount += r.endIndex - r.startIndex;
      } else if (req.deleteDimension && req.deleteDimension.range.dimension === 'ROWS') {
        const r = req.deleteDimension.range; const s = byId(r.sheetId);
        if (s) s.rowCount -= r.endIndex - r.startIndex;
      } else if (req.addSheet) {
        const p = req.addSheet.properties; const s = byId(p.sheetId);
        const g = p.gridProperties || {};
        if (s) { s.rowCount = g.rowCount || 1000; s.columnCount = g.columnCount || 26; }
      } else if (req.duplicateSheet) {
        // Une copie d'onglet a les dimensions de sa source.
        const d = req.duplicateSheet; const src = byId(d.sourceSheetId); const s = byId(d.newSheetId);
        if (s && src) { s.rowCount = src.rowCount; s.columnCount = src.columnCount; }
      }
    }
  };
}

module.exports = { applyBatchRequests, createBookState, DATE_FORMAT_TYPES };
