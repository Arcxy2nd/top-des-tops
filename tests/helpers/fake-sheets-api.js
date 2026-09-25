'use strict';

// Faux Sheets API v4 pour tester le runtime GAS sur Node : répond de façon
// SYNCHRONE aux requêtes émises par lib/gas-runtime (métadonnées, grilles
// typées, cellule de verrou, batchUpdate), à partir de grilles JS en mémoire.
const { isDate, dateToSerial } = require('../../lib/gas-runtime/cell-values');

// Rejeu d'un batchUpdate : même code que le cache du runtime (lib/gas-runtime/batch-apply).
const { applyBatchRequests } = require('../../lib/gas-runtime/batch-apply');

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

  // Quota simulé : les n premières requêtes répondent 429 sans rien appliquer,
  // comme Google quand le plafond par minute est atteint.
  let pending429 = (options && options.failWith429) || 0;

  function syncFetch(url, init) {
    calls.push({ url, init });
    if (pending429 > 0) {
      pending429--;
      return { status: 429, body: '{"error":{"code":429}}' };
    }
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
    // Propriétés d'un onglet : partagées par la réponse de métadonnées et
    // par celle du classeur entier.
    const sheetProperties = title => ({
      sheetId: idOf[title],
      title,
      gridProperties: {
        rowCount: Math.max(1, (gridsByTitle[title] || []).length),
        columnCount: Math.max(1, (gridsByTitle[title] || []).reduce((m, r) => Math.max(m, (r || []).length), 0))
      }
    });
    const bookProperties = Object.assign({ timeZone }, spreadsheetTitle ? { title: spreadsheetTitle } : {});
    const rowDataOf = title => (gridsByTitle[title] || []).map(row => ({ values: (row || []).map(toApiCell) }));
    if (u.searchParams.get('includeGridData') === 'true') {
      const ranges = u.searchParams.getAll('ranges');
      // Sans `ranges` : classeur entier (métadonnées + toutes les grilles).
      if (!ranges.length) {
        return {
          status: 200,
          body: JSON.stringify({
            properties: bookProperties,
            sheets: order.map(title => ({ properties: sheetProperties(title), data: [{ rowData: rowDataOf(title) }] }))
          })
        };
      }
      const sheets = ranges.map(_unquote).map(title => ({
        properties: { title },
        data: [{ rowData: rowDataOf(title) }]
      }));
      return { status: 200, body: JSON.stringify({ sheets }) };
    }
    return {
      status: 200,
      body: JSON.stringify({
        properties: bookProperties,
        sheets: order.map(title => ({ properties: sheetProperties(title) }))
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
