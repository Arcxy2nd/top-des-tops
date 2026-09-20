'use strict';

// PropertiesService n'a pas d'équivalent sur Vercel (rien n'y survit à une
// requête). Les propriétés mutables du script vivent donc dans un onglet
// technique du classeur : elles passent par le modèle en mémoire, donc par le
// journal, donc par le MÊME batchUpdate atomique que les données — un
// compteur de version ne peut pas être incrémenté sans que l'écriture qu'il
// invalide soit écrite elle aussi.

const PROPERTIES_SHEET_NAME = 'ScriptProperties';
const PROPERTIES_HEADERS = ['Key', 'Value'];

function _text(v) {
  return v === null || v === undefined ? '' : String(v);
}

function createScriptPropertiesStore({ openSpreadsheet, seed }) {
  const injected = Object.assign({}, seed || {});
  let sheet = null;
  let resolved = false;

  function findSheet() {
    if (!resolved) {
      sheet = openSpreadsheet().getSheetByName(PROPERTIES_SHEET_NAME);
      resolved = true;
    }
    return sheet;
  }

  function ensureSheet() {
    if (findSheet()) return sheet;
    const ss = openSpreadsheet();
    sheet = ss.insertSheet(PROPERTIES_SHEET_NAME);
    sheet.appendRow(PROPERTIES_HEADERS);
    resolved = true;
    return sheet;
  }

  /** Lignes de données (en-tête exclu) sous forme { key, value, row }. */
  function rows() {
    const target = findSheet();
    if (!target) return [];
    const lastRow = target.getLastRow();
    if (lastRow < 2) return [];
    return target.getRange(2, 1, lastRow - 1, 2).getValues().map((r, i) => ({
      key: _text(r[0]).trim(),
      value: _text(r[1]),
      row: i + 2
    })).filter(r => r.key);
  }

  function find(key) {
    return rows().find(r => r.key === key) || null;
  }

  function getProperty(key) {
    if (Object.prototype.hasOwnProperty.call(injected, key)) return injected[key];
    const entry = find(key);
    // Une valeur vidée vaut une clé absente : deleteProperty efface la cellule
    // plutôt que la ligne, pour ne décaler aucune autre propriété.
    return entry && entry.value !== '' ? entry.value : null;
  }

  function getProperties() {
    const out = {};
    rows().forEach(r => { if (r.value !== '') out[r.key] = r.value; });
    return Object.assign(out, injected);
  }

  function setProperty(key, value) {
    const text = _text(value);
    const entry = find(key);
    if (entry) {
      ensureSheet().getRange(entry.row, 2).setValue(text);
    } else {
      ensureSheet().appendRow([key, text]);
    }
    return api;
  }

  function deleteProperty(key) {
    const entry = find(key);
    if (entry && entry.value !== '') ensureSheet().getRange(entry.row, 2).setValue('');
    return api;
  }

  const api = { getProperty, getProperties, setProperty, deleteProperty };
  return api;
}

module.exports = { createScriptPropertiesStore, PROPERTIES_SHEET_NAME, PROPERTIES_HEADERS };
