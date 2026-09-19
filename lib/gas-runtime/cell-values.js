'use strict';

const MS_PER_DAY = 86400000;
// Jours entre l'origine des numéros de série Sheets (30/12/1899) et l'epoch Unix.
const SERIAL_UNIX_EPOCH = 25569;
const DATE_FORMAT_TYPES = { DATE: true, TIME: true, DATE_TIME: true };
// Texte renvoyé par SpreadsheetApp.getValues() pour une cellule en erreur.
const ERROR_TEXT = {
  ERROR: '#ERROR!', NULL_VALUE: '#NULL!', DIVIDE_BY_ZERO: '#DIV/0!', VALUE: '#VALUE!',
  REF: '#REF!', NAME: '#NAME?', NUM: '#NUM!', N_A: '#N/A', LOADING: 'Loading...'
};

/** Détection indépendante du realm : les dates de Code.gs viennent du contexte vm. */
function isDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

/**
 * Même conversion que la branche numérique de _parseDateCell (Code.gs) : le
 * numéro de série est une heure murale, reconstruite dans le fuseau du process
 * (celui du script GAS, cf. runtime.js). DateCtor = Date du contexte vm, car
 * Code.gs teste `instanceof Date`.
 */
function serialToDate(serial, DateCtor) {
  const Ctor = DateCtor || Date;
  const u = new Date(Math.round((serial - SERIAL_UNIX_EPOCH) * MS_PER_DAY));
  return new Ctor(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(), u.getUTCMilliseconds());
}

function dateToSerial(date) {
  const wallClock = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return wallClock / MS_PER_DAY + SERIAL_UNIX_EPOCH;
}

/** Valeur d'une CellData Sheets API v4, typée comme SpreadsheetApp.getValues(). */
function cellFromApi(cell, DateCtor) {
  const ev = cell && cell.effectiveValue;
  if (!ev) return '';
  if (ev.numberValue !== undefined) {
    const format = cell.effectiveFormat && cell.effectiveFormat.numberFormat;
    return (format && DATE_FORMAT_TYPES[format.type]) ? serialToDate(ev.numberValue, DateCtor) : ev.numberValue;
  }
  if (ev.stringValue !== undefined) return ev.stringValue;
  if (ev.boolValue !== undefined) return ev.boolValue;
  if (ev.errorValue !== undefined) return ERROR_TEXT[ev.errorValue.type] || '#ERROR!';
  return '';
}

function gridFromRowData(rowData, DateCtor) {
  return (rowData || []).map(row => ((row && row.values) || []).map(cell => cellFromApi(cell, DateCtor)));
}

module.exports = { isDate, serialToDate, dateToSerial, cellFromApi, gridFromRowData };
