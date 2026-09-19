'use strict';

const { isDate, dateToSerial } = require('./cell-values');

// Modèle en mémoire d'un classeur, limité au sous-ensemble de SpreadsheetApp
// réellement utilisé par Code.gs / AutoPoints.gs / DiscordBridge.gs.
// Écritures : appliquées en mémoire (les lectures suivantes de la même requête
// les voient, comme sous GAS) ET consignées dans `journal`, dans l'ordre, pour
// être rejouées vers Sheets API au Plan 3. Ce module n'envoie rien.

function _isBlank(v) {
  return v === '' || v === null || v === undefined;
}

function _assertValidCoordinates(values) {
  values.forEach(n => {
    if (!Number.isInteger(n) || n < 1) throw new Error('The coordinates or dimensions of the range are invalid.');
  });
}

function createSpreadsheet({ spreadsheetId, sheets, loadGrid, DateCtor }) {
  const journal = [];
  const states = sheets.map(s => ({ sheetId: s.sheetId, title: s.title, grid: s.grid || null }));
  let nextSheetId = states.reduce((max, s) => Math.max(max, s.sheetId), 0) + 1;
  const wrappers = new Map();

  function cloneCell(v) {
    return isDate(v) ? new DateCtor(v.getTime()) : v;
  }

  // Ce que la cellule contient après écriture : null/undefined deviennent vides.
  function storedCell(v) {
    if (v === null || v === undefined) return '';
    return cloneCell(v);
  }

  function gridOf(state) {
    if (!state.grid) state.grid = loadGrid(state.title);
    return state.grid;
  }

  function lastRowOf(grid) {
    for (let i = grid.length - 1; i >= 0; i--) {
      if ((grid[i] || []).some(v => !_isBlank(v))) return i + 1;
    }
    return 0;
  }

  function lastColumnOf(grid) {
    let max = 0;
    grid.forEach(row => {
      for (let j = (row || []).length - 1; j >= max; j--) {
        if (!_isBlank(row[j])) { max = j + 1; break; }
      }
    });
    return max;
  }

  function ensureRows(grid, count) {
    while (grid.length < count) grid.push([]);
  }

  function makeRange(state, row, col, numRows, numCols) {
    const range = {
      getValues() {
        const grid = gridOf(state);
        const out = [];
        for (let i = 0; i < numRows; i++) {
          const src = grid[row - 1 + i] || [];
          const cells = [];
          for (let j = 0; j < numCols; j++) {
            const v = src[col - 1 + j];
            cells.push(_isBlank(v) ? '' : cloneCell(v));
          }
          out.push(cells);
        }
        return out;
      },
      getValue() {
        return range.getValues()[0][0];
      },
      setValues(values) {
        const rowCount = Array.isArray(values) ? values.length : 0;
        if (rowCount !== numRows) {
          throw new Error('The number of rows in the data does not match the number of rows in the range. The data has ' + rowCount + ' but the range has ' + numRows + '.');
        }
        values.forEach(r => {
          const colCount = Array.isArray(r) ? r.length : 0;
          if (colCount !== numCols) {
            throw new Error('The number of columns in the data does not match the number of columns in the range. The data has ' + colCount + ' but the range has ' + numCols + '.');
          }
        });
        const grid = gridOf(state);
        ensureRows(grid, row - 1 + numRows);
        values.forEach((r, i) => {
          const target = grid[row - 1 + i];
          r.forEach((v, j) => { target[col - 1 + j] = storedCell(v); });
        });
        journal.push({ op: 'setValues', sheetId: state.sheetId, row, col, values: values.map(r => r.map(storedCell)) });
        return range;
      },
      setValue(v) {
        const values = [];
        for (let i = 0; i < numRows; i++) {
          const r = [];
          for (let j = 0; j < numCols; j++) r.push(v);
          values.push(r);
        }
        return range.setValues(values);
      },
      setFontWeight(weight) {
        journal.push({ op: 'setFontWeight', sheetId: state.sheetId, row, col, numRows, numCols, weight });
        return range;
      }
    };
    return range;
  }

  function assertUniqueTitle(title, except) {
    if (states.some(s => s !== except && s.title === title)) {
      throw new Error('A sheet with the name "' + title + '" already exists. Please enter another name.');
    }
  }

  function addSheetState(title, grid) {
    assertUniqueTitle(title);
    const state = { sheetId: nextSheetId++, title, grid };
    states.push(state);
    return state;
  }

  function makeSheet(state) {
    if (wrappers.has(state)) return wrappers.get(state);
    const sheet = {
      getName: () => state.title,
      setName(name) {
        const title = String(name);
        assertUniqueTitle(title, state);
        state.title = title;
        journal.push({ op: 'renameSheet', sheetId: state.sheetId, title });
        return sheet;
      },
      getSheetId: () => state.sheetId,
      getLastRow: () => lastRowOf(gridOf(state)),
      getLastColumn: () => lastColumnOf(gridOf(state)),
      getRange(row, col, numRows, numCols) {
        const nr = numRows === undefined ? 1 : numRows;
        const nc = numCols === undefined ? 1 : numCols;
        _assertValidCoordinates([row, col, nr, nc]);
        return makeRange(state, row, col, nr, nc);
      },
      getDataRange() {
        const grid = gridOf(state);
        return makeRange(state, 1, 1, Math.max(1, lastRowOf(grid)), Math.max(1, lastColumnOf(grid)));
      },
      appendRow(values) {
        const grid = gridOf(state);
        const target = lastRowOf(grid) + 1;
        const row = values.map(storedCell);
        ensureRows(grid, target);
        grid[target - 1] = row;
        journal.push({ op: 'appendRow', sheetId: state.sheetId, row: target, values: [row.map(cloneCell)] });
        return sheet;
      },
      insertRowBefore(index) {
        _assertValidCoordinates([index]);
        const grid = gridOf(state);
        ensureRows(grid, index - 1);
        grid.splice(index - 1, 0, []);
        journal.push({ op: 'insertRows', sheetId: state.sheetId, index, count: 1 });
        return sheet;
      },
      deleteRow(index) {
        _assertValidCoordinates([index]);
        const grid = gridOf(state);
        if (index <= grid.length) grid.splice(index - 1, 1);
        journal.push({ op: 'deleteRows', sheetId: state.sheetId, index, count: 1 });
        return sheet;
      },
      clearContents() {
        state.grid = [];
        journal.push({ op: 'clearContents', sheetId: state.sheetId });
        return sheet;
      },
      clear() {
        state.grid = [];
        journal.push({ op: 'clear', sheetId: state.sheetId });
        return sheet;
      },
      copyTo(target) {
        if (target !== spreadsheet) throw new Error('Copie vers un autre classeur non supportée par le runtime.');
        const copy = addSheetState('Copy of ' + state.title, gridOf(state).map(r => (r || []).map(cloneCell)));
        journal.push({ op: 'duplicateSheet', sourceSheetId: state.sheetId, sheetId: copy.sheetId, title: copy.title });
        return makeSheet(copy);
      }
    };
    wrappers.set(state, sheet);
    return sheet;
  }

  const spreadsheet = {
    getId: () => spreadsheetId,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit',
    getSheets: () => states.map(makeSheet),
    getSheetByName(name) {
      const state = states.find(s => s.title === name);
      return state ? makeSheet(state) : null;
    },
    insertSheet(name) {
      const state = addSheetState(String(name), []);
      journal.push({ op: 'addSheet', sheetId: state.sheetId, title: state.title });
      return makeSheet(state);
    },
    deleteSheet(sheet) {
      const index = states.findIndex(s => wrappers.get(s) === sheet);
      if (index < 0) throw new Error('Onglet introuvable dans ce classeur.');
      journal.push({ op: 'deleteSheet', sheetId: states[index].sheetId });
      states.splice(index, 1);
    }
  };

  return { spreadsheet, journal };
}

// 'Nom', Nom, 'Nom'!A1, 'Nom'!A1:G, 'Nom'!A1:G10 (seules formes utilisées par _fetchSheetValues).
const A1_RANGE = /^(?:'((?:[^']|'')+)'|([^!']+))(?:!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?)?$/;

function _columnIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Équivalent du service avancé Sheets (Sheets.Spreadsheets.Values.get) lu
 * depuis le modèle en mémoire : mêmes valeurs que l'API réelle avec
 * UNFORMATTED_VALUE + SERIAL_NUMBER, les écritures en attente incluses (sous
 * GAS, Code.gs appelle SpreadsheetApp.flush() avant de relire par l'API).
 */
function createSheetsAdvancedService(getSpreadsheet, spreadsheetId) {
  function get(ssId, a1, options) {
    if (ssId !== spreadsheetId) throw new Error('Accès refusé : classeur hors tenant.');
    const opts = options || {};
    if (opts.valueRenderOption !== 'UNFORMATTED_VALUE' || opts.dateTimeRenderOption !== 'SERIAL_NUMBER') {
      throw new Error('Options Sheets.Spreadsheets.Values.get non supportées par le runtime : ' + JSON.stringify(opts));
    }
    const m = A1_RANGE.exec(String(a1));
    if (!m) throw new Error('Plage A1 non supportée par le runtime : ' + a1);
    const title = m[1] !== undefined ? m[1].replace(/''/g, '\'') : m[2];
    const sheet = getSpreadsheet().getSheetByName(title);
    if (!sheet) throw new Error('Unable to parse range: ' + a1);

    const singleCell = m[3] !== undefined && m[5] === undefined;
    const c1 = m[3] ? _columnIndex(m[3]) : 1;
    const r1 = m[4] ? Number(m[4]) : 1;
    const c2 = singleCell ? c1 : (m[5] ? _columnIndex(m[5]) : sheet.getLastColumn());
    const r2 = singleCell ? r1 : (m[6] ? Number(m[6]) : sheet.getLastRow());

    const values = [];
    if (r2 >= r1 && c2 >= c1) {
      sheet.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1).getValues().forEach(row => {
        const out = row.map(v => (isDate(v) ? dateToSerial(v) : v));
        while (out.length && out[out.length - 1] === '') out.pop();
        values.push(out);
      });
    }
    while (values.length && values[values.length - 1].length === 0) values.pop();
    const result = { range: String(a1), majorDimension: 'ROWS' };
    if (values.length) result.values = values;
    return result;
  }
  return { Spreadsheets: { Values: { get } } };
}

module.exports = { createSpreadsheet, createSheetsAdvancedService };
