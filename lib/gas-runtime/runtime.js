'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createSpreadsheet, createSheetsAdvancedService } = require('./spreadsheet');
const { fetchWorkbook } = require('./sheets-snapshot');
const { createScriptPropertiesStore } = require('./script-properties');
const { createIdempotencyStore } = require('./idempotency');
const { buildBatchRequests } = require('./journal-replay');
const { sendBatchUpdate } = require('./sheets-snapshot');
const { acquireLock, releaseLock, newLockToken } = require('./sheet-lock');
const { createTriggerService } = require('./trigger-flag');
const { createDriveApp, copySpreadsheet } = require('./drive');
const { bridgeReply } = require('../discord-bridge');
const { meterSyncFetch } = require('./request-meter');

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

// Le classeur entier (métadonnées + toutes les grilles, ScriptProperties
// compris) part en UNE seule requête par appel : le quota Sheets compte des
// requêtes, pas des octets. Une lecture ciblée télécharge donc aussi
// l'historique — prix accepté (plan 2026-09-25, phase 2).

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

// Points d'entrée qui ne sont pas des fonctions api* : le déclencheur horaire
// est appelé par le cron Vercel, pas par le frontend. Il écrit (points
// automatiques), donc il est mutant — verrou et rejeu atomique compris.
const EXTRA_ENTRY_POINTS = { runAutoPoints: { mutating: true } };
Object.keys(EXTRA_ENTRY_POINTS).forEach(name => {
  if (!Object.prototype.hasOwnProperty.call(API_FUNCTIONS, name)) {
    API_FUNCTIONS[name] = EXTRA_ENTRY_POINTS[name];
  }
});

function _inputError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// Appels sortants bornés en lecture : Code.gs n'a besoin de UrlFetchApp que
// pour consulter des services tiers (changelog GitHub). Laisser passer un
// POST/PUT/PATCH/DELETE ouvrirait un effet de bord hors de toute transaction
// — il ne serait couvert ni par le verrou du classeur ni par le lot atomique.
function createUrlFetchApp(syncFetch) {
  return {
    fetch(url, params) {
      const method = params && params.method;
      if (method && String(method).toLowerCase() !== 'get') {
        throw new Error('UrlFetchApp : seules les requêtes GET sont autorisées depuis ce backend.');
      }
      const res = syncFetch(url, { method: method || 'GET' });
      if (!(params && params.muteHttpExceptions) && res.status >= 400) {
        throw new Error('Request failed for ' + url + ' returned code ' + res.status);
      }
      return { getResponseCode: () => res.status, getContentText: () => res.body };
    }
  };
}

// Les compteurs de version (logs/settings/bareme/phrases/notes) et
// `active_phrase_preset` sont désormais de vraies propriétés persistées dans
// l'onglet ScriptProperties du classeur : une clé absente vaut null, et
// Code.gs retombe sur sa valeur par défaut ('0', '__default__').

/**
 * Le magasin de propriétés est partagé par runApi et runBridge. Seul le pont
 * doit voir le secret Discord (injecté depuis la variable d'environnement de
 * la route — jamais lu ici via process.env, cf. `secret` de runBridge) : un
 * runApi ordinaire ne fournit jamais `bridgeSecret`, donc SPREADSHEET_ID reste
 * la seule clé injectée. Un secret présent dans le magasin d'un appel
 * quelconque serait une fuite potentielle (§ point 1, revue Task 2).
 */
function _scriptPropertiesSeed(spreadsheetId, bridgeSecret) {
  const seed = { SPREADSHEET_ID: spreadsheetId };
  if (bridgeSecret !== undefined) seed.DISCORD_BRIDGE_SECRET = bridgeSecret;
  return seed;
}

function _buildSandbox({ spreadsheetId, accessToken, scriptId, syncFetch, getDateCtor, bridgeSecret }) {
  const scriptProperties = createScriptPropertiesStore({
    openSpreadsheet: () => openModel().spreadsheet,
    seed: _scriptPropertiesSeed(spreadsheetId, bridgeSecret)
  });
  const cacheStore = new Map();
  let model = null;
  const sheetGrids = {};
  let sheetMeta = [];
  // Garde-fou de tenant pour Drive (cf. createDriveApp) : seul le classeur du
  // tenant est lisible au départ.
  const allowedFileIds = new Set([spreadsheetId]);
  // Drive n'a pas de transaction : une copie créée ici est définitive même si
  // le lot Sheets est ensuite jeté. On garde donc de quoi la retrouver.
  const createdDriveFiles = [];
  const idempotencyStore = createIdempotencyStore({ openSpreadsheet: () => openModel().spreadsheet });

  function openModel() {
    if (model) return model;
    const DateCtor = getDateCtor();
    const book = fetchWorkbook({ syncFetch, accessToken, spreadsheetId, DateCtor });
    if (book.timeZone && book.timeZone !== SCRIPT_TIME_ZONE) {
      console.warn('[gas-runtime] fuseau du classeur (' + book.timeZone + ') ≠ fuseau du script (' + SCRIPT_TIME_ZONE + ') : dates lues dans ' + SCRIPT_TIME_ZONE);
    }
    sheetMeta = book.sheets;
    book.sheets.forEach(s => { sheetGrids[s.sheetId] = { rowCount: s.rowCount, columnCount: s.columnCount }; });

    model = createSpreadsheet({
      spreadsheetId,
      sheets: book.sheets.map(s => ({ sheetId: s.sheetId, title: s.title, grid: book.grids[s.title] || [] })),
      loadGrid: title => book.grids[title] || [],
      DateCtor,
      name: book.title,
      copyFile: copyName => {
        const created = copySpreadsheet({ syncFetch, accessToken, fileId: spreadsheetId, name: copyName });
        if (created && created.id) {
          // La copie devient lisible par getFileById pour la suite de CET
          // appel (BackupService la relit pour la ranger dans le dossier).
          allowedFileIds.add(String(created.id));
          createdDriveFiles.push({
            id: created.id,
            name: created.name || copyName,
            url: created.webViewLink || ('https://drive.google.com/open?id=' + created.id)
          });
        }
        return created;
      }
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
      // Rien à vider : les écritures vivent dans le journal du modèle et
      // partent en un seul batchUpdate à la fin de l'appel (journal-replay).
      // Un flush() au milieu d'une fonction ne doit donc rien déclencher,
      // sous peine de casser l'atomicité du lot.
      flush() {}
    },
    Sheets: createSheetsAdvancedService(() => openModel().spreadsheet, spreadsheetId),
    PropertiesService: { getScriptProperties: () => scriptProperties },
    CacheService: { getScriptCache: () => cache },
    // Verrou déjà tenu à l'échelle de l'appel entier par _runInSandbox
    // (sheet-lock, cellule ScriptLock!A1, pris AVANT la lecture de
    // l'instantané). Un withLock() interne de Code.gs n'a donc rien à
    // reprendre : ces méthodes réussissent sans rien faire, exprès.
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, hasLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    ScriptApp: Object.assign(
      { getScriptId: () => scriptId },
      createTriggerService(scriptProperties)
    ),
    DriveApp: createDriveApp({ syncFetch, accessToken, allowedFileIds }),
    Session: { getScriptTimeZone: () => SCRIPT_TIME_ZONE },
    UrlFetchApp: createUrlFetchApp(syncFetch),
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput(text) {
        const state = { content: String(text === undefined ? '' : text) };
        const output = {
          setMimeType: () => output,
          getContent: () => state.content,
          append(more) { state.content += String(more); return output; }
        };
        return output;
      }
    }
  };

  return {
    sandbox,
    journal: () => (model ? model.journal : []),
    sheetGrids: () => sheetGrids,
    sheetIdByTitle: title => {
      const found = sheetMeta.find(s => s.title === title);
      return found ? found.sheetId : null;
    },
    pendingWrites: () => (model ? model.journal.length : 0),
    createdDriveFiles: () => createdDriveFiles.slice(),
    idempotency: () => idempotencyStore
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

/**
 * Convention universelle des fonctions api* de Code.gs : un refus métier
 * (mot de passe faux, joueur inconnu…) ne lève pas, il rend { success: false }.
 */
function _isBusinessFailure(value) {
  return Boolean(value) && typeof value === 'object' && value.success === false;
}

/**
 * Drive n'a pas de transaction : `BackupService.createSnapshot` crée la copie
 * (et parfois le dossier) AVANT que le lot Sheets ne parte. Si le lot est
 * ensuite jeté, la copie survit sans la ligne qui l'annonce — invisible depuis
 * l'application. On ne peut pas l'annuler sans risquer de supprimer le travail
 * de quelqu'un d'autre ; on la rend donc au moins retrouvable dans les logs.
 */
function _warnOrphanDriveFiles(env, label, cause) {
  const files = env.createdDriveFiles();
  if (!files.length) return;
  console.error(
    '[gas-runtime] ' + label + ' : ' + files.length + ' fichier(s) Drive créé(s) mais '
    + cause + ' — copie(s) orpheline(s) à supprimer à la main : '
    + files.map(f => f.name + ' <' + f.url + '>').join(', ')
  );
}

/**
 * Exécute une entrée du bac à sable sous les garanties du Plan 3 : verrou du
 * classeur pris avant l'instantané pour une entrée mutante, rejeu du journal
 * en un batchUpdate atomique, trace d'audit d'un échec d'authentification
 * conservée même quand le lot est jeté.
 */
function _runInSandbox({ mutating, invoke, spreadsheetId, accessToken, scriptId, syncFetch, readOnly, label, bridgeSecret, idempotencyKey }) {
  if (mutating && readOnly) throw _inputError('WRITE_DISABLED', 'Écriture désactivée sur ce backend : ' + label);

  const lockToken = mutating ? newLockToken() : null;
  // Le verrou englobe la lecture de l'instantané : pris plus tard, un autre
  // écrivain pourrait décaler les lignes que ce plan d'écriture vise déjà.
  if (mutating) acquireLock({ syncFetch, accessToken, spreadsheetId, token: lockToken });

  try {
    let context = null;
    const env = _buildSandbox({ spreadsheetId, accessToken, scriptId, syncFetch, bridgeSecret, getDateCtor: () => vm.runInContext('Date', context) });
    context = vm.createContext(env.sandbox);
    SCRIPT.runInContext(context);

    // Le rejeu se décide SOUS le verrou et sur le même instantané que
    // l'écriture : vérifier la clé avant de verrouiller laisserait deux
    // tentatives concurrentes se croiser et écrire toutes les deux.
    const useKey = Boolean(mutating && idempotencyKey);
    if (useKey) {
      const seen = env.idempotency().lookup(idempotencyKey);
      if (seen.found) {
        console.warn('[gas-runtime] ' + label + ' : clé d\'idempotence déjà appliquée, rien n\'est réécrit.');
        return { value: seen.result, appliedWrites: 0, discardedWrites: 0, replayed: true };
      }
    }

    let value;
    try {
      value = invoke(context, env);
    } catch (e) {
      if (mutating) {
        const trace = _failureAuditJournal(env.journal(), env.sheetIdByTitle('AuditLog'));
        if (trace.length) {
          sendBatchUpdate({ syncFetch, accessToken, spreadsheetId, requests: buildBatchRequests(trace, env.sheetGrids()) });
        }
        console.warn('[gas-runtime] ' + label + ' : lot jeté après exception (' + env.pendingWrites() + ' écriture(s)).');
        _warnOrphanDriveFiles(env, label, 'le lot Sheets a été jeté');
      }
      throw e;
    }

    let appliedWrites = 0;
    let discardedWrites = 0;
    if (mutating) {
      // Enregistrée dans le MÊME lot que les données : la clé et l'écriture
      // qu'elle protège atterrissent ensemble, ou pas du tout. Un échec métier
      // en est exclu : Code.gs n'utilise pas d'exception pour ça, il rend
      // { success: false } (helper `fail`) — enregistrer cette clé figerait
      // l'échec et empêcherait le renvoi légitime après correction.
      if (useKey && !_isBusinessFailure(value)) {
        env.idempotency().record(idempotencyKey, value, new Date());
      }
      try {
        sendBatchUpdate({ syncFetch, accessToken, spreadsheetId, requests: buildBatchRequests(env.journal(), env.sheetGrids()) });
      } catch (e) {
        _warnOrphanDriveFiles(env, label, 'l\'envoi du lot Sheets a échoué');
        throw e;
      }
      appliedWrites = env.pendingWrites();
    } else {
      _warnOrphanDriveFiles(env, label, 'l\'appel est une lecture (rien n\'est persisté)');
      discardedWrites = env.pendingWrites();
      if (discardedWrites) {
        console.warn('[gas-runtime] ' + label + ' : ' + discardedWrites + ' écriture(s) non persistée(s) (appel de lecture).');
      }
    }
    return { value, appliedWrites, discardedWrites };
  } finally {
    if (mutating) releaseLock({ syncFetch, accessToken, spreadsheetId, token: lockToken });
  }
}

function runApi({ fnName, args, spreadsheetId, accessToken, scriptId, syncFetch, readOnly, idempotencyKey }) {
  const info = Object.prototype.hasOwnProperty.call(API_FUNCTIONS, fnName) ? API_FUNCTIONS[fnName] : null;
  if (!info) throw _inputError('UNKNOWN_FUNCTION', 'Fonction serveur inconnue : ' + fnName);

  // Compteur de requêtes de cet appel (lu par lib/rpc.js pour le log [quota]) :
  // joint à l'exception en cas d'échec, pour que le coût reste visible.
  const meter = meterSyncFetch(syncFetch);
  let out;
  try {
    out = _runInSandbox({
      mutating: info.mutating,
      label: fnName,
      spreadsheetId, accessToken, scriptId, syncFetch: meter.syncFetch, readOnly, idempotencyKey,
      invoke: context => {
        const fn = context[fnName];
        if (typeof fn !== 'function') throw _inputError('UNKNOWN_FUNCTION', 'Fonction serveur inconnue : ' + fnName);
        // Les arguments doivent être des valeurs du realm vm (ex. Array.isArray de
        // Code.gs teste contre l'Array DU CONTEXTE, pas celui de Node) : on les
        // fait recréer par le JSON.parse du contexte lui-même.
        const vmArgs = vm.runInContext('JSON.parse', context)(JSON.stringify(Array.isArray(args) ? args : []));
        return fn.apply(null, vmArgs);
      }
    });
  } catch (e) {
    if (e && typeof e === 'object') e.meter = meter.counts();
    throw e;
  }

  // Copie JSON : coupe tout lien avec le realm vm, comme la sérialisation de
  // google.script.run coupe le lien avec le serveur.
  return {
    value: out.value === undefined || out.value === null ? null : JSON.parse(JSON.stringify(out.value)),
    discardedWrites: out.discardedWrites,
    appliedWrites: out.appliedWrites,
    // Vrai quand la clé d'idempotence avait déjà été appliquée : rien n'a été
    // réécrit, la valeur rendue est celle du premier passage.
    replayed: Boolean(out.replayed),
    meter: meter.counts()
  };
}

/**
 * Réponse HTTP à renvoyer pour la valeur rendue par DiscordBridgeService.handleRequest.
 * Le cas normal est une TextOutput (`getContent()`) ; l'absence de cette
 * méthode (résultat inattendu) retombe sur le format du pont plutôt que sur
 * `String(value)`, qui donnerait `[object Object]` en HTTP 200 à un bot qui
 * attend du JSON.
 */
function _bridgeBody(value) {
  if (value && typeof value.getContent === 'function') return value.getContent();
  return bridgeReply(new Error('Réponse du pont Discord invalide (format inattendu).')).body;
}

/**
 * Pont Discord : DiscordBridge.gs valide lui-même le secret partagé (reçu ici
 * via `secret`, injecté dans le magasin de propriétés du bac à sable sous la
 * clé DISCORD_BRIDGE_SECRET — cf. _scriptPropertiesSeed) et rend un
 * TextOutput. Les commandes addPoints/addNote écrivent, donc l'appel est
 * toujours traité comme mutant — même verrou, même lot atomique.
 *
 * Limite connue : DiscordBridgeService.handleRequest (DiscordBridge.gs,
 * non modifiable) rattrape lui-même TOUTES ses exceptions et rend un message
 * d'erreur (this.err_(...)) au lieu de lever. _runInSandbox ne voit donc
 * jamais d'exception pour un échec de commande du pont : si une commande
 * échoue APRÈS avoir déjà écrit dans le journal en mémoire (ex. un appel
 * withLock() qui a déjà passé StorageService.appendBulkPlan avant l'échec),
 * le bloc catch de _runInSandbox (rejet du lot, cf. runApi) ne se déclenche
 * jamais : le journal partiel est rejoué tel quel dans l'unique batchUpdate,
 * exactement comme le faisait Apps Script (l'écriture reste atomique côté
 * Google — un seul batchUpdate). Contrairement à runApi, où une exception
 * fait toujours jeter tout le lot, le pont n'offre donc PAS la garantie
 * « lot jeté en cas d'échec » pour un échec interne à une commande.
 */
function runBridge({ parameter, spreadsheetId, accessToken, scriptId, syncFetch, readOnly, secret }) {
  const meter = meterSyncFetch(syncFetch);
  const out = _runInSandbox({
    mutating: true,
    label: 'DiscordBridge:' + String((parameter && parameter.bgAction) || 'inconnu'),
    spreadsheetId, accessToken, scriptId, syncFetch: meter.syncFetch, readOnly,
    bridgeSecret: secret,
    invoke: context => {
      // DiscordBridgeService est un `const` de DiscordBridge.gs : les
      // liaisons lexicales top-level (let/const) d'un vm.Script ne deviennent
      // PAS des propriétés de l'objet contexte (contrairement à `var` et aux
      // déclarations de fonction) — seule une évaluation dans le contexte via
      // vm.runInContext peut la lire.
      const service = vm.runInContext('typeof DiscordBridgeService === "undefined" ? null : DiscordBridgeService', context);
      if (!service || typeof service.handleRequest !== 'function') {
        throw _inputError('UNKNOWN_FUNCTION', 'Pont Discord indisponible dans ce bac à sable.');
      }
      const event = vm.runInContext('JSON.parse', context)(JSON.stringify({ parameter: parameter || {} }));
      return service.handleRequest(event);
    }
  });
  return { body: _bridgeBody(out.value), appliedWrites: out.appliedWrites, meter: meter.counts() };
}

module.exports = {
  runApi, runBridge, listApiFunctions, API_FUNCTIONS, SCRIPT_TIME_ZONE, createUrlFetchApp,
  // Exportés uniquement pour les tests (isolation du secret Discord, repli de
  // réponse du pont) : pas d'appelant en dehors de ce module.
  _buildSandbox, _scriptPropertiesSeed, _bridgeBody
};
