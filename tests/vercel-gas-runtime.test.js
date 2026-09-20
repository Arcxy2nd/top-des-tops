'use strict';

const { runApi, API_FUNCTIONS, SCRIPT_TIME_ZONE, LAZY_SHEETS, createUrlFetchApp } = require('../lib/gas-runtime/runtime');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./harness.js');
const { buildSheets } = require('./frontend/fixtures.js');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');

const SCRIPT_ID = 'MOCK_SCRIPT_ID_12345'; // même valeur que gasMocks() du harness

// Capture console.warn le temps de l'appel : les tests peuvent inspecter les
// avertissements du runtime (écritures écartées, fuseau…) sans les laisser
// polluer la sortie de `npm run verify`.
function runOnGrids(grids, fnName, args) {
  const api = makeFakeSheetsApi(grids);
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  let result;
  try {
    result = runApi({ fnName, args: args || [], spreadsheetId: 'SHEET_TEST', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch });
  } finally {
    console.warn = originalWarn;
  }
  return { result, calls: api.calls, warnings };
}

test('le process adopte le fuseau du manifeste GAS', () => {
  assert.strictEqual(SCRIPT_TIME_ZONE, 'Europe/Paris');
  assert.strictEqual(new Date(2026, 6, 1).getTimezoneOffset(), -120);
});

test('fonction inconnue : UNKNOWN_FUNCTION, aucune requête réseau', () => {
  const api = makeFakeSheetsApi({});
  assert.throws(
    () => runApi({ fnName: 'apiNExistePas', args: [], spreadsheetId: 'S', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch }),
    err => err.code === 'UNKNOWN_FUNCTION'
  );
  assert.strictEqual(api.calls.length, 0);
});

test('les fonctions d\'écriture détectées côté serveur = _MUTATING_APIS de Index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
  const block = /_MUTATING_APIS\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(html);
  assert.ok(block, '_MUTATING_APIS introuvable dans Index.html');
  const frontend = [...block[1].matchAll(/['"](api[A-Za-z0-9_]*)['"]/g)].map(m => m[1]).sort();
  const backend = Object.keys(API_FUNCTIONS).filter(n => API_FUNCTIONS[n].mutating).sort();
  assert.deepStrictEqual(backend, frontend);
});

test('lecture : 2 requêtes Sheets (métadonnées + un lot), AuditLog exclu du lot', () => {
  const grids = fixtureGrids(buildSheets());
  grids.AuditLog = [['Timestamp', 'Auteur', 'Action']];
  const { result, calls } = runOnGrids(grids, 'apiGetSettings');
  assert.strictEqual(result.value.success, true);
  assert.ok(result.value.players.some(p => p.name === 'Safir'));
  assert.strictEqual(calls.length, 2);
  const ranges = new URL(calls[1].url).searchParams.getAll('ranges');
  LAZY_SHEETS.forEach(t => assert.ok(!ranges.includes('\'' + t + '\''), t + ' ne doit pas être dans le lot initial'));
  assert.ok(ranges.includes('\'Players\''));
});

test('contexte neuf à chaque appel : aucun état de Code.gs ne survit entre deux requêtes', () => {
  const first = fixtureGrids(buildSheets());
  const second = fixtureGrids(buildSheets());
  second.Players = [second.Players[0], ['Nouveau', '', '#123456', '']];
  runOnGrids(first, 'apiGetSettings');
  const { result } = runOnGrids(second, 'apiGetSettings');
  assert.deepStrictEqual(result.value.players.map(p => p.name), ['Nouveau']);
});

test('onglet sans en-tête : aucun joueur perdu, écritures de réparation non persistées', () => {
  const grids = fixtureGrids(buildSheets());
  grids.Players = grids.Players.slice(1); // ligne 1 = vraie donnée
  const { result, calls, warnings } = runOnGrids(grids, 'apiGetSettings');
  assert.ok(result.value.players.some(p => p.name === 'Safir'), 'le premier joueur ne doit pas être pris pour un en-tête');
  assert.ok(result.discardedWrites >= 1, 'l\'insertion d\'en-tête doit être journalisée puis écartée');
  // Aucune requête ne doit jamais pouvoir écrire dans le classeur : ni un verbe
  // HTTP différent de GET, ni un corps, ni un appel à :batchUpdate ou /values
  // (les deux endpoints d'écriture de Sheets API v4).
  calls.forEach(c => {
    assert.ok(c.url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'), 'URL Sheets attendue : ' + c.url);
    assert.ok(c.url.indexOf(':batchUpdate') === -1, 'aucun appel :batchUpdate : ' + c.url);
    assert.ok(c.url.indexOf('/values') === -1, 'aucun appel /values : ' + c.url);
    const method = c.init && c.init.method;
    assert.ok(method === undefined || method === 'GET', 'aucune méthode d\'écriture : ' + method);
    assert.ok(!(c.init && c.init.body), 'aucun corps de requête');
  });
  assert.ok(warnings.some(w => w.indexOf('non persistée') !== -1), 'un avertissement doit mentionner les écritures non persistées');
});

test('ScriptApp.getProjectTriggers absent : message clair, jamais l\'erreur JS brute', () => {
  const { result } = runOnGrids(fixtureGrids(buildSheets()), 'apiGetAutoRules');
  const serialized = JSON.stringify(result.value);
  assert.ok(
    serialized.indexOf('indisponibles sur ce backend (Vercel) : prévu au Plan 5.') !== -1,
    'message métier attendu, reçu : ' + serialized
  );
  assert.ok(serialized.indexOf('is not a function') === -1, 'l\'erreur JS brute ne doit jamais fuiter : ' + serialized);
});

test('apiGetChatMessages : un client dont la version diffère reçoit les messages', () => {
  const { result } = runOnGrids(fixtureGrids(buildSheets()), 'apiGetChatMessages', ['inconnue']);
  assert.strictEqual(result.value.success, true);
  assert.notStrictEqual(result.value.notModified, true, 'une version cliente qui diffère du compteur ne peut pas donner "non modifié"');
  assert.ok(
    result.value.messages.some(m => m.author === 'Ilker' && m.text === 'Salut @Safir'),
    'le message de la fixture Chat doit être renvoyé'
  );
});

test('UrlFetchApp : GET autorisé (apiGetChangelog)', () => {
  const grids = fixtureGrids(buildSheets());
  const api = makeFakeSheetsApi(grids);
  const originalFetch = api.syncFetch;
  const spyCalls = [];
  api.syncFetch = (url, init) => {
    spyCalls.push({ url, init });
    if (url.indexOf('raw.githubusercontent.com') !== -1) {
      return { status: 200, body: '# Changelog' };
    }
    return originalFetch(url, init);
  };
  const result = runApi({ fnName: 'apiGetChangelog', args: [true], spreadsheetId: 'SHEET_TEST', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch });
  assert.strictEqual(result.value.success, true);
  assert.strictEqual(result.value.content, '# Changelog');
});

test('createUrlFetchApp : refuse toute méthode différente de GET, sans jamais appeler syncFetch', () => {
  let called = false;
  const spy = () => { called = true; return { status: 200, body: '' }; };
  const urlFetchApp = createUrlFetchApp(spy);
  assert.throws(
    () => urlFetchApp.fetch('https://example.com', { method: 'post' }),
    /UrlFetchApp : seules les requêtes GET sont autorisées sur ce backend en lecture seule\./
  );
  assert.strictEqual(called, false, 'syncFetch ne doit jamais être appelé pour une requête non-GET');
});

test('lazy-load : apiGetAuditLog déclenche exactement 3 requêtes Sheets, la 3e ciblant uniquement AuditLog', () => {
  const grids = fixtureGrids(buildSheets());
  grids.AuditLog = [
    ['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail'],
    ['2026-08-01 10:00:00', 'Safir', 'ADD', '', '', '', '']
  ];
  const { result, calls } = runOnGrids(grids, 'apiGetAuditLog', [1, 20]);
  assert.strictEqual(result.value.success, true);
  assert.strictEqual(calls.length, 3);
  const ranges = new URL(calls[2].url).searchParams.getAll('ranges');
  assert.deepStrictEqual(ranges, ['\'AuditLog\'']);
});

// Preuve de fidélité : même Code.gs, mêmes données, deux « moteurs » — le
// harness historique (SpreadsheetApp simulé) et le runtime Vercel (Sheets API
// simulé). Seules des clés dérivées de l'horloge peuvent être neutralisées,
// chacune justifiée par un commentaire ; toute autre différence est un bug.
const VOLATILE_KEYS = [
  // apiGetChatMessages (via apiGetBootstrapData) renvoie _chatVersion() : le
  // harness lit '0' (PropertiesService jamais écrit), le runtime Vercel amorce
  // une valeur aléatoire par appel (Code.gs ~697, runtime.js VERSION_PROPERTY_KEYS,
  // fix « compteurs de version factices ») — divergence attendue, pas un bug.
  'version'
];

function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => { if (!VOLATILE_KEYS.includes(k)) out[k] = stripVolatile(value[k]); });
    return out;
  }
  return value;
}

function harnessReference(fnName, args) {
  const sheets = buildSheets();
  const gas = loadGas({ DriveApp: sheets.__driveApp });
  gas.ConfigService.getSheets = () => sheets;
  const value = gas[fnName].apply(null, args);
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

const PARITY_CASES = [
  ['apiGetSettings', []],
  ['apiGetBareme', []],
  ['apiGetPhrases', []],
  ['apiGetAllNotes', []],
  ['apiGetAltCategories', []],
  ['apiGetHistoryPage', [1, 50]],
  ['apiGetFilteredData', [[], [], '', '']],
  ['apiGetBootstrapData', []]
];

PARITY_CASES.forEach(([fnName, args]) => {
  test('parité harness ↔ runtime : ' + fnName, () => {
    const expected = stripVolatile(harnessReference(fnName, args));
    const { result } = runOnGrids(fixtureGrids(buildSheets()), fnName, args);
    assert.deepStrictEqual(stripVolatile(result.value), expected);
  });
});

test('les compteurs de version viennent de la feuille, plus d\'un tirage aléatoire', () => {
  const grids = fixtureGrids(buildSheets());
  grids.ScriptProperties = [['Key', 'Value'], ['chat_version', '12']];
  const first = runOnGrids(grids, 'apiGetChatMessages', [0]);
  const second = runOnGrids(grids, 'apiGetChatMessages', [0]);
  assert.strictEqual(first.result.value.version, '12');
  assert.strictEqual(second.result.value.version, '12', 'deux appels identiques donnent la même version');
});

test('compteur absent de la feuille : Code.gs retombe sur sa valeur par défaut', () => {
  const grids = fixtureGrids(buildSheets());
  const { result } = runOnGrids(grids, 'apiGetChatMessages', [0]);
  assert.strictEqual(result.value.version, '0');
});

function runWrite(grids, fnName, args) {
  const api = makeFakeSheetsApi(grids);
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  let result, error = null;
  try {
    result = runApi({ fnName, args: args || [], spreadsheetId: 'SHEET_TEST', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch });
  } catch (e) {
    error = e;
  } finally {
    console.warn = originalWarn;
  }
  return { result, error, api, warnings };
}

test('une fonction d\'écriture prend le verrou AVANT de lire l\'instantané', () => {
  const grids = fixtureGrids(buildSheets());
  const { api } = runWrite(grids, 'apiAddNote', ['Safir', 'Note de test', '', 'Safir', '']);
  const lockIndex = api.calls.findIndex(c => /\/values\//.test(c.url));
  const gridIndex = api.calls.findIndex(c => /includeGridData=true/.test(c.url));
  assert.ok(lockIndex >= 0 && gridIndex >= 0);
  assert.ok(lockIndex < gridIndex, 'un rowIndex lu hors verrou peut être périmé au moment de l\'écriture');
});

test('une fonction d\'écriture envoie UN seul batchUpdate contenant sa ligne', () => {
  const grids = fixtureGrids(buildSheets());
  const { result, api } = runWrite(grids, 'apiAddNote', ['Safir', 'Note de test', '', 'Safir', '']);
  assert.strictEqual(result.value.success, true);
  assert.strictEqual(api.batches.length, 1);
  assert.ok(result.appliedWrites > 0);
  assert.match(JSON.stringify(api.lastBatch()), /Note de test/);
});

test('le verrou est relâché après une écriture réussie', () => {
  const grids = fixtureGrids(buildSheets());
  const { api } = runWrite(grids, 'apiAddNote', ['Safir', 'Note de test', '', 'Safir', '']);
  const puts = api.calls.filter(c => c.init && c.init.method === 'PUT');
  assert.strictEqual(JSON.parse(puts[puts.length - 1].init.body).values[0][0], '');
});

test('échec en cours de route : aucune écriture de données, verrou relâché', () => {
  const grids = fixtureGrids(buildSheets());
  const { result, api } = runWrite(grids, 'apiAddNote', ['JoueurInconnu', 'NE DOIT PAS APPARAITRE', '', 'JoueurInconnu', 'mauvais']);
  assert.strictEqual(result.value.success, false, 'requireAuthor doit refuser un joueur inconnu');
  const dataBatches = api.batches.filter(reqs => JSON.stringify(reqs).indexOf('NE DOIT PAS APPARAITRE') >= 0);
  assert.strictEqual(dataBatches.length, 0);
  const puts = api.calls.filter(c => c.init && c.init.method === 'PUT');
  assert.strictEqual(JSON.parse(puts[puts.length - 1].init.body).values[0][0], '');
});

test('échec d\'authentification : la trace d\'audit survit au rejet du journal', () => {
  const grids = fixtureGrids(buildSheets());
  grids.AuditLog = [['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail']];
  // Les joueurs des fixtures n'ont pas de mot de passe : sans ça, requireAuthor accorde.
  grids.Players = grids.Players.map(r => (r[0] === 'Safir' ? [r[0], r[1], r[2], 'secret'] : r));
  const { result, api } = runWrite(grids, 'apiAddNote', ['Safir', 'NE DOIT PAS APPARAITRE', '', 'Safir', 'mauvais-mot-de-passe']);
  assert.strictEqual(result.value.success, false);
  const audit = api.batches.filter(reqs => JSON.stringify(reqs).indexOf('Échec authentification') >= 0);
  assert.strictEqual(audit.length, 1, 'un lot ne contenant que la trace d\'échec doit partir');
  assert.strictEqual(JSON.stringify(api.batches).indexOf('NE DOIT PAS APPARAITRE'), -1, 'aucune donnée métier ne doit être écrite');
});

test('un appel de lecture ne rejoue rien, même quand il répare un en-tête', () => {
  const grids = fixtureGrids(buildSheets());
  grids.Players = grids.Players.slice(1); // ligne 1 = vraie donnée → _ensureSheetHeaders journalise
  const { api, warnings } = runWrite(grids, 'apiGetSettings');
  assert.strictEqual(api.batches.length, 0);
  assert.ok(warnings.some(w => /appel de lecture/.test(w)));
});

test('readOnly : une fonction d\'écriture est refusée avant toute requête', () => {
  const api = makeFakeSheetsApi({});
  assert.throws(
    () => runApi({ fnName: 'apiAddNote', args: [], spreadsheetId: 'S', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch, readOnly: true }),
    err => err.code === 'WRITE_DISABLED'
  );
  assert.strictEqual(api.calls.length, 0);
});

test('les services non portés échouent avec un message explicite, pas un ReferenceError', () => {
  const grids = fixtureGrids(buildSheets());
  const snapshot = runWrite(grids, 'apiCreateSnapshot', ['Safir', '']);
  assert.match(JSON.stringify(snapshot.result ? snapshot.result.value : snapshot.error.message), /Plan 5/);
  const trigger = runWrite(grids, 'apiSetAutoTrigger', [true, 'Safir', '']);
  assert.match(JSON.stringify(trigger.result ? trigger.result.value : trigger.error.message), /Plan 5/);
});
