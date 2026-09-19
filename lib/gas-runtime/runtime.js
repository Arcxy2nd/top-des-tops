'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createSpreadsheet, createSheetsAdvancedService } = require('./spreadsheet');
const { fetchSpreadsheetMeta, fetchGrids } = require('./sheets-snapshot');

// Exécute le VRAI Code.gs (+ AutoPoints.gs, DiscordBridge.gs), non modifié,
// en lui fournissant sous Node les services Google qu'il appelle — même
// principe que tests/harness.js, mais branché sur Sheets API v4.

const ROOT = path.join(__dirname, '..', '..');
const GAS_FILES = ['Code.gs', 'AutoPoints.gs', 'DiscordBridge.gs'];

// Code.gs raisonne en heure locale (getDate(), getHours(), _dayKey…) : sous GAS
// c'est le fuseau du manifeste. Le process Node doit être dans le même.
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8'));
const SCRIPT_TIME_ZONE = MANIFEST.timeZone;
process.env.TZ = SCRIPT_TIME_ZONE;

// Onglets lus seulement à la demande : le journal d'audit embarque des
// instantanés volumineux et n'est utile qu'à quelques écrans.
const LAZY_SHEETS = ['AuditLog'];

const SOURCE = GAS_FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
// Compilé une fois par conteneur ; exécuté dans un contexte neuf à chaque
// appel, comme GAS qui repart d'une portée globale vierge par requête.
const SCRIPT = new vm.Script(SOURCE, { filename: GAS_FILES.join('+') });

/**
 * Même règle que l'identité serveur (§7 context.md) : toute fonction api* qui
 * écrit prend un paramètre `author`. Dérivée des sources, pour ne jamais
 * désynchroniser une liste tenue à la main.
 */
function listApiFunctions(source) {
  const out = {};
  for (const m of source.matchAll(/^function\s+(api[A-Za-z0-9_]*)\s*\(([^)]*)\)/gm)) {
    const params = m[2].split(',').map(p => p.split('=')[0].trim()).filter(Boolean);
    out[m[1]] = { mutating: params.includes('author') };
  }
  return out;
}

const API_FUNCTIONS = listApiFunctions(SOURCE);

function _inputError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// Backend en lecture seule : UrlFetchApp ne doit jamais laisser passer une
// requête d'écriture (POST/PUT/PATCH/DELETE…) vers un service externe.
function createUrlFetchApp(syncFetch) {
  return {
    fetch(url, params) {
      const method = params && params.method;
      if (method && String(method).toLowerCase() !== 'get') {
        throw new Error('UrlFetchApp : seules les requêtes GET sont autorisées sur ce backend en lecture seule.');
      }
      const res = syncFetch(url, { method: method || 'GET' });
      if (!(params && params.muteHttpExceptions) && res.status >= 400) {
        throw new Error('Request failed for ' + url + ' returned code ' + res.status);
      }
      return { getResponseCode: () => res.status, getContentText: () => res.body };
    }
  };
}

// Compteurs de version que Code.gs lit via PropertiesService (logs/settings/
// chat/bareme/phrases/notes) pour savoir si le cache d'un client est encore
// valable. Ce backend n'a pas accès aux vrais compteurs GAS (ils vivent dans
// les Propriétés du script réel, hors de portée en lecture seule) : on en
// amorce une valeur aléatoire à chaque appel, pour qu'une comparaison côté
// client rate toujours plutôt que de renvoyer un faux « pas de changement ».
// La vraie persistance arrive au Plan 3.
const VERSION_PROPERTY_KEYS = ['logs_version', 'settings_version', 'chat_version', 'bareme_version', 'phrases_version', 'notes_version'];

function _buildSandbox({ spreadsheetId, accessToken, scriptId, syncFetch, getDateCtor }) {
  const properties = { SPREADSHEET_ID: spreadsheetId };
  VERSION_PROPERTY_KEYS.forEach(k => { properties[k] = String(crypto.randomInt(1, 1000000000)); });
  const propertyWrites = [];
  const cacheStore = new Map();
  let model = null;

  function openModel() {
    if (model) return model;
    const DateCtor = getDateCtor();
    const meta = fetchSpreadsheetMeta({ syncFetch, accessToken, spreadsheetId });
    if (meta.timeZone && meta.timeZone !== SCRIPT_TIME_ZONE) {
      console.warn('[gas-runtime] fuseau du classeur (' + meta.timeZone + ') ≠ fuseau du script (' + SCRIPT_TIME_ZONE + ') : dates lues dans ' + SCRIPT_TIME_ZONE);
    }
    const eager = meta.sheets.map(s => s.title).filter(t => LAZY_SHEETS.indexOf(t) === -1);
    const grids = fetchGrids({ syncFetch, accessToken, spreadsheetId, titles: eager, DateCtor });
    model = createSpreadsheet({
      spreadsheetId,
      sheets: meta.sheets.map(s => ({ sheetId: s.sheetId, title: s.title, grid: grids[s.title] || null })),
      loadGrid: title => fetchGrids({ syncFetch, accessToken, spreadsheetId, titles: [title], DateCtor })[title],
      DateCtor
    });
    return model;
  }

  // Cache de la requête uniquement : un get après un put de la même exécution
  // fonctionne comme sous GAS ; d'une requête à l'autre, tout est un « miss ».
  const cache = {
    get: k => (cacheStore.has(k) ? cacheStore.get(k) : null),
    getAll(keys) {
      const out = {};
      (keys || []).forEach(k => { if (cacheStore.has(k)) out[k] = cacheStore.get(k); });
      return out;
    },
    put: (k, v) => { cacheStore.set(k, String(v)); },
    putAll(obj) { Object.keys(obj || {}).forEach(k => cacheStore.set(k, String(obj[k]))); },
    remove: k => { cacheStore.delete(k); },
    removeAll(keys) { (keys || []).forEach(k => cacheStore.delete(k)); }
  };

  const scriptProperties = {
    getProperty: k => (Object.prototype.hasOwnProperty.call(properties, k) ? properties[k] : null),
    getProperties: () => Object.assign({}, properties),
    setProperty(k, v) {
      properties[k] = String(v);
      propertyWrites.push(k);
      return scriptProperties;
    },
    deleteProperty(k) {
      delete properties[k];
      propertyWrites.push(k);
      return scriptProperties;
    }
  };

  const sandbox = {
    console,
    Logger: { log: (...args) => console.log(...args) },
    SpreadsheetApp: {
      openById(id) {
        if (id !== spreadsheetId) throw new Error('Accès refusé : classeur hors tenant.');
        return openModel().spreadsheet;
      },
      // Lecture seule : rien à envoyer. Le Plan 3 y rejouera le journal.
      flush() {}
    },
    Sheets: createSheetsAdvancedService(() => openModel().spreadsheet, spreadsheetId),
    PropertiesService: { getScriptProperties: () => scriptProperties },
    CacheService: { getScriptCache: () => cache },
    // Aucune écriture n'est envoyée, donc rien à sérialiser : le verrou réel
    // arrive avec le chemin d'écriture (Plan 3).
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, hasLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    ScriptApp: {
      getScriptId: () => scriptId,
      // Les déclencheurs temporels vivent dans le projet Apps Script réel,
      // inaccessible depuis ce backend en lecture seule (Sheets API only).
      getProjectTriggers() {
        throw new Error('Déclencheurs automatiques indisponibles sur ce backend (Vercel) : prévu au Plan 5.');
      }
    },
    Session: { getScriptTimeZone: () => SCRIPT_TIME_ZONE },
    UrlFetchApp: createUrlFetchApp(syncFetch)
  };

  return {
    sandbox,
    pendingWrites: () => (model ? model.journal.length : 0) + propertyWrites.length
  };
}

function runApi({ fnName, args, spreadsheetId, accessToken, scriptId, syncFetch }) {
  const info = Object.prototype.hasOwnProperty.call(API_FUNCTIONS, fnName) ? API_FUNCTIONS[fnName] : null;
  if (!info) throw _inputError('UNKNOWN_FUNCTION', 'Fonction serveur inconnue : ' + fnName);
  if (info.mutating) throw _inputError('WRITE_DISABLED', 'Écriture pas encore disponible sur ce backend : ' + fnName);

  let context = null;
  const env = _buildSandbox({ spreadsheetId, accessToken, scriptId, syncFetch, getDateCtor: () => vm.runInContext('Date', context) });
  context = vm.createContext(env.sandbox);
  SCRIPT.runInContext(context);

  const fn = context[fnName];
  if (typeof fn !== 'function') throw _inputError('UNKNOWN_FUNCTION', 'Fonction serveur inconnue : ' + fnName);
  // Les arguments doivent être des valeurs du realm vm (ex. Array.isArray de
  // Code.gs teste contre l'Array DU CONTEXTE, pas celui de Node) : on les
  // fait recréer par le JSON.parse du contexte lui-même.
  const vmArgs = vm.runInContext('JSON.parse', context)(JSON.stringify(Array.isArray(args) ? args : []));
  const value = fn.apply(null, vmArgs);

  const discardedWrites = env.pendingWrites();
  if (discardedWrites) {
    console.warn('[gas-runtime] ' + fnName + ' : ' + discardedWrites + ' écriture(s) non persistée(s) (backend en lecture seule).');
  }
  // Copie JSON : coupe tout lien avec le realm vm, comme la sérialisation de
  // google.script.run coupe le lien avec le serveur.
  return { value: value === undefined ? null : JSON.parse(JSON.stringify(value)), discardedWrites };
}

module.exports = { runApi, listApiFunctions, API_FUNCTIONS, SCRIPT_TIME_ZONE, LAZY_SHEETS, createUrlFetchApp };
