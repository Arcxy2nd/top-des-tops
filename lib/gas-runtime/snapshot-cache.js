'use strict';

const { isDate } = require('./cell-values');
const { applyBatchRequests, createBookState } = require('./batch-apply');

// Instantané du classeur conservé dans la mémoire du conteneur Vercel entre
// deux requêtes. Il n'est servi que si la version Drive n'a pas bougé depuis
// sa lecture, et jamais au-delà de MAX_AGE_MS (garde-fou si Drive tarde à
// refléter une modification). Chaque requête reçoit sa COPIE : Code.gs
// modifie le modèle en mémoire, une requête ne doit jamais voir les
// écritures non confirmées d'une autre.
const MAX_AGE_MS = 600000;
const entries = new Map();

function _cloneBook(book, DateCtor) {
  const Ctor = DateCtor || Date;
  const grids = {};
  Object.keys(book.grids).forEach(t => {
    grids[t] = book.grids[t].map(row => (row || []).map(v => (isDate(v) ? new Ctor(v.getTime()) : v)));
  });
  return { timeZone: book.timeZone, title: book.title, sheets: book.sheets.map(s => Object.assign({}, s)), grids };
}

function get(spreadsheetId, version, now, DateCtor) {
  const e = entries.get(spreadsheetId);
  if (!e || version === null || version === undefined || e.version !== version || now - e.storedAt > MAX_AGE_MS) return null;
  return _cloneBook(e.book, DateCtor);
}

function put(spreadsheetId, version, book, now) {
  if (version === null || version === undefined) return;
  entries.set(spreadsheetId, { version, storedAt: now, book: _cloneBook(book) });
}

/** Rejoue sur la copie en cache le lot que Sheets vient d'accepter. */
function applyWrite(spreadsheetId, requests) {
  const e = entries.get(spreadsheetId);
  if (!e) return false;
  applyBatchRequests(createBookState(e.book), requests);
  return true;
}

// Nouvelle étiquette après notre propre écriture ; version illisible = on
// oublie l'instantané plutôt que de le servir sans pouvoir le valider.
function retag(spreadsheetId, version) {
  const e = entries.get(spreadsheetId);
  if (!e) return;
  if (version === null || version === undefined) entries.delete(spreadsheetId);
  else e.version = version;
}

function invalidate(spreadsheetId) { entries.delete(spreadsheetId); }
function clear() { entries.clear(); }

module.exports = { get, put, applyWrite, retag, invalidate, clear, MAX_AGE_MS };
