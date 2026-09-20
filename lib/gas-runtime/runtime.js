'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createSpreadsheet, createSheetsAdvancedService } = require('./spreadsheet');
const { fetchSpreadsheetMeta, fetchGrids } = require('./sheets-snapshot');
const { createScriptPropertiesStore } = require('./script-properties');
const { buildBatchRequests } = require('./journal-replay');
const { sendBatchUpdate } = require('./sheets-snapshot');
const { acquireLock, releaseLock, newLockToken } = require('./sheet-lock');

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

// Aucun onglet n'est téléchargé d'avance : un sondage de tchat n'a pas à
// rapatrier 20 000 lignes d'historique. Les deux premiers onglets réellement
// touchés sont lus un par un ; au troisième, tout le reste part en une seule
// requête — un appel large (bootstrap) ne paie donc jamais plus de 3 requêtes.
const PREFETCH_AFTER_MISSES = 2;

const PLAN5_MESSAGE = 'Sauvegardes Drive et déclencheurs automatiques indisponibles sur ce backend (Vercel) : prévu au Plan 5.';

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

// Les compteurs de version (logs/settings/chat/bareme/phrases/notes) et
// `active_phrase_preset` sont désormais de vraies propriétés persistées dans
// l'onglet ScriptProperties du classeur : une clé absente vaut null, et
// Code.gs retombe sur sa valeur par défaut ('0', '__default__').

function _buildSandbox({ spreadsheetId, accessToken, scriptId, syncFetch, getDateCtor }) {
  const scriptProperties = createScriptPropertiesStore({
    openSpreadsheet: () => openModel().spreadsheet,
    seed: { SPREADSHEET_ID: spreadsheetId }
  });
  const cacheStore = new Map();
  let model = null;
  const sheetGrids = {};
  let sheetMeta = [];

  function openModel() {
    if (model) return model;
    const DateCtor = getDateCtor();
    const meta = fetchSpreadsheetMeta({ syncFetch, accessToken, spreadsheetId });
    if (meta.timeZone && meta.timeZone !== SCRIPT_TIME_ZONE) {
      console.warn('[gas-runtime] fuseau du classeur (' + meta.timeZone + ') ≠ fuseau du script (' + SCRIPT_TIME_ZONE + ') : dates lues dans ' + SCRIPT_TIME_ZONE);
    }
    sheetMeta = meta.sheets;
    meta.sheets.forEach(s => { sheetGrids[s.sheetId] = { rowCount: s.rowCount, columnCount: s.columnCount }; });

    const allTitles = meta.sheets.map(s => s.title);
    const loaded = {};
    const prefetched = {};
    let misses = 0;

    function loadGrid(title) {
      if (Object.prototype.hasOwnProperty.call(prefetched, title)) {
        const grid = prefetched[title];
        delete prefetched[title];
        return grid;
      }
      misses++;
      const remaining = allTitles.filter(t => t !== title && !loaded[t]);
      const titles = misses > PREFETCH_AFTER_MISSES ? [title].concat(remaining) : [title];
      const grids = fetchGrids({ syncFetch, accessToken, spreadsheetId, titles, DateCtor });
      titles.forEach(t => {
        loaded[t] = true;
        if (t !== title) prefetched[t] = grids[t] || [];
      });
      return grids[title] || [];
    }

    model = createSpreadsheet({
      spreadsheetId,
      sheets: meta.sheets.map(s => ({ sheetId: s.sheetId, title: s.title, grid: null })),
      loadGrid,
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
      // inaccessible depuis ce backend : message explicite plutôt qu'un
      // ReferenceError illisible maintenant que ces fonctions s'exécutent.
      getProjectTriggers() { throw new Error(PLAN5_MESSAGE); },
      newTrigger() { throw new Error(PLAN5_MESSAGE); },
      deleteTrigger() { throw new Error(PLAN5_MESSAGE); }
    },
    DriveApp: {
      getFileById() { throw new Error(PLAN5_MESSAGE); },
      getRootFolder() { throw new Error(PLAN5_MESSAGE); },
      getFolderById() { throw new Error(PLAN5_MESSAGE); }
    },
    Session: { getScriptTimeZone: () => SCRIPT_TIME_ZONE },
    UrlFetchApp: createUrlFetchApp(syncFetch)
  };

  return {
    sandbox,
    journal: () => (model ? model.journal : []),
    sheetGrids: () => sheetGrids,
    sheetIdByTitle: title => {
      const found = sheetMeta.find(s => s.title === title);
      return found ? found.sheetId : null;
    },
    pendingWrites: () => (model ? model.journal.length : 0)
  };
}

/**
 * Journal réduit à la trace d'un échec : quand requireAuthor refuse un auteur,
 * Code.gs écrit d'abord une ligne d'audit PUIS lève. Le lot global est jeté
 * (atomicité), mais cette trace de sécurité doit survivre. Rejeu autorisé
 * uniquement si l'onglet préexiste et si toutes les entrées le visant sont des
 * ajouts de ligne : sinon un index de ligne pourrait dépendre d'opérations
 * écartées.
 */
function _failureAuditJournal(journal, auditSheetId) {
  if (auditSheetId === null || auditSheetId === undefined) return [];
  const touching = journal.filter(e => e.sheetId === auditSheetId);
  if (!touching.length || touching.some(e => e.op !== 'appendRow')) return [];
  return touching;
}

function runApi({ fnName, args, spreadsheetId, accessToken, scriptId, syncFetch, readOnly }) {
  const info = Object.prototype.hasOwnProperty.call(API_FUNCTIONS, fnName) ? API_FUNCTIONS[fnName] : null;
  if (!info) throw _inputError('UNKNOWN_FUNCTION', 'Fonction serveur inconnue : ' + fnName);
  if (info.mutating && readOnly) throw _inputError('WRITE_DISABLED', 'Écriture désactivée sur ce backend : ' + fnName);

  const lockToken = info.mutating ? newLockToken() : null;
  // Le verrou englobe la lecture de l'instantané : pris plus tard, un autre
  // écrivain pourrait décaler les lignes que ce plan d'écriture vise déjà.
  if (info.mutating) acquireLock({ syncFetch, accessToken, spreadsheetId, token: lockToken });

  try {
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

    let value;
    try {
      value = fn.apply(null, vmArgs);
    } catch (e) {
      if (info.mutating) {
        const trace = _failureAuditJournal(env.journal(), env.sheetIdByTitle('AuditLog'));
        if (trace.length) {
          sendBatchUpdate({ syncFetch, accessToken, spreadsheetId, requests: buildBatchRequests(trace, env.sheetGrids()) });
        }
        console.warn('[gas-runtime] ' + fnName + ' : lot jeté après exception (' + env.pendingWrites() + ' écriture(s)).');
      }
      throw e;
    }

    let appliedWrites = 0;
    let discardedWrites = 0;
    if (info.mutating) {
      const requests = buildBatchRequests(env.journal(), env.sheetGrids());
      sendBatchUpdate({ syncFetch, accessToken, spreadsheetId, requests });
      appliedWrites = env.pendingWrites();
    } else {
      discardedWrites = env.pendingWrites();
      if (discardedWrites) {
        console.warn('[gas-runtime] ' + fnName + ' : ' + discardedWrites + ' écriture(s) non persistée(s) (appel de lecture).');
      }
    }

    // Copie JSON : coupe tout lien avec le realm vm, comme la sérialisation de
    // google.script.run coupe le lien avec le serveur.
    return {
      value: value === undefined ? null : JSON.parse(JSON.stringify(value)),
      discardedWrites,
      appliedWrites
    };
  } finally {
    if (info.mutating) releaseLock({ syncFetch, accessToken, spreadsheetId, token: lockToken });
  }
}

module.exports = { runApi, listApiFunctions, API_FUNCTIONS, SCRIPT_TIME_ZONE, createUrlFetchApp };
