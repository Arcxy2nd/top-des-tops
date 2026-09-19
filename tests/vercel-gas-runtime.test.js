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

test('fonction d\'écriture : WRITE_DISABLED avant toute requête réseau', () => {
  const api = makeFakeSheetsApi({});
  assert.throws(
    () => runApi({ fnName: 'apiAddNote', args: ['Safir', 'x', '', 'Safir', ''], spreadsheetId: 'S', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch }),
    err => err.code === 'WRITE_DISABLED'
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
    serialized.indexOf('Déclencheurs automatiques indisponibles sur ce backend (Vercel) : prévu au Plan 5.') !== -1,
    'message métier attendu, reçu : ' + serialized
  );
  assert.ok(serialized.indexOf('is not a function') === -1, 'l\'erreur JS brute ne doit jamais fuiter : ' + serialized);
});

test('apiGetChatMessages([0]) : compteur de version factice, jamais "non modifié"', () => {
  const { result } = runOnGrids(fixtureGrids(buildSheets()), 'apiGetChatMessages', [0]);
  assert.strictEqual(result.value.success, true);
  assert.notStrictEqual(result.value.notModified, true, 'sinceVersion=0 ne doit jamais matcher le compteur amorcé aléatoirement');
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
