'use strict';

const { runApi, API_FUNCTIONS, SCRIPT_TIME_ZONE, LAZY_SHEETS } = require('../lib/gas-runtime/runtime');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./harness.js');
const { buildSheets } = require('./frontend/fixtures.js');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');

const SCRIPT_ID = 'MOCK_SCRIPT_ID_12345'; // même valeur que gasMocks() du harness

function runOnGrids(grids, fnName, args) {
  const api = makeFakeSheetsApi(grids);
  const result = runApi({ fnName, args: args || [], spreadsheetId: 'SHEET_TEST', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch });
  return { result, calls: api.calls };
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
  const { result, calls } = runOnGrids(grids, 'apiGetSettings');
  assert.ok(result.value.players.some(p => p.name === 'Safir'), 'le premier joueur ne doit pas être pris pour un en-tête');
  assert.ok(result.discardedWrites >= 1, 'l\'insertion d\'en-tête doit être journalisée puis écartée');
  calls.forEach(c => assert.ok(!(c.init && c.init.method && c.init.method !== 'GET'), 'aucune requête d\'écriture'));
});

// Preuve de fidélité : même Code.gs, mêmes données, deux « moteurs » — le
// harness historique (SpreadsheetApp simulé) et le runtime Vercel (Sheets API
// simulé). Seules des clés dérivées de l'horloge peuvent être neutralisées,
// chacune justifiée par un commentaire ; toute autre différence est un bug.
const VOLATILE_KEYS = [];

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
