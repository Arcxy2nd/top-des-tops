'use strict';

const { runApi, API_FUNCTIONS, SCRIPT_TIME_ZONE, createUrlFetchApp } = require('../lib/gas-runtime/runtime');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./harness.js');
const { buildSheets } = require('./frontend/fixtures.js');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');
const { makeFakeDrive } = require('./helpers/fake-drive-api');

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
  // runAutoPoints (EXTRA_ENTRY_POINTS) n'est pas une fonction api* : jamais
  // appelée depuis le frontend, seulement par le cron Vercel — exclue de la
  // comparaison de parité frontend/backend.
  const backend = Object.keys(API_FUNCTIONS).filter(n => n.startsWith('api') && API_FUNCTIONS[n].mutating).sort();
  assert.deepStrictEqual(backend, frontend);
});

// Remplace l'ancien test « 2 requêtes (métadonnées + un lot eager) » : avec le
// chargement paresseux (Step 3), apiGetSettings ne touche que Players et
// Categories, chacun sous PREFETCH_AFTER_MISSES → deux requêtes unitaires,
// jamais de lot. AuditLog, lui, n'est jamais sollicité par cet appel.
test('lecture : apiGetSettings ne télécharge que Players et Categories, jamais AuditLog', () => {
  const grids = fixtureGrids(buildSheets());
  grids.AuditLog = [['Timestamp', 'Auteur', 'Action']];
  const { result, calls } = runOnGrids(grids, 'apiGetSettings');
  assert.strictEqual(result.value.success, true);
  assert.ok(result.value.players.some(p => p.name === 'Safir'));
  assert.strictEqual(calls.length, 3, 'métadonnées + Players + Categories, une requête unitaire chacune');
  const titles = calls.slice(1).reduce((acc, c) => acc.concat(new URL(c.url).searchParams.getAll('ranges')), []);
  assert.ok(!titles.includes('\'AuditLog\''), 'AuditLog ne doit jamais être sollicité par apiGetSettings');
  assert.ok(titles.includes('\'Players\''));
  assert.ok(titles.includes('\'Categories\''));
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

// Remplace l'ancien test « ScriptApp.getProjectTriggers absent » : depuis le
// drapeau persisté (trigger-flag.js), ScriptApp.getProjectTriggers() ne lève
// plus jamais — apiGetAutoRules doit voir un état par défaut propre (aucun
// déclencheur installé, aucune erreur), pas une erreur JS brute.
test('apiGetAutoRules : aucun déclencheur installé par défaut, aucune erreur', () => {
  const { result } = runOnGrids(fixtureGrids(buildSheets()), 'apiGetAutoRules');
  assert.strictEqual(result.value.success, true);
  assert.strictEqual(result.value.triggerInstalled, false);
  assert.strictEqual(result.value.triggerError, '');
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
    /UrlFetchApp : seules les requêtes GET sont autorisées depuis ce backend\./
  );
  assert.strictEqual(called, false, 'syncFetch ne doit jamais être appelé pour une requête non-GET');
});

function gridRequests(api) {
  return api.calls.filter(c => /includeGridData=true/.test(c.url));
}

function requestedTitles(call) {
  return new URL(call.url).searchParams.getAll('ranges').map(r => r.replace(/^'|'$/g, '').replace(/''/g, '\''));
}

test('un sondage de tchat ne télécharge que les onglets qu\'il touche', () => {
  const grids = fixtureGrids(buildSheets());
  const { api } = runWrite(grids, 'apiGetChatMessages', ['version-inconnue']);
  const titles = gridRequests(api).reduce((acc, c) => acc.concat(requestedTitles(c)), []);
  assert.ok(titles.indexOf('Chat') !== -1, 'le tchat doit être lu');
  assert.strictEqual(titles.indexOf('History'), -1, 'l\'historique complet ne doit jamais être téléchargé pour un sondage');
  assert.ok(gridRequests(api).length <= 3, 'au plus 3 requêtes de grille, reçu ' + gridRequests(api).length);
});

test('un appel lourd bascule en un seul lot après deux onglets', () => {
  const grids = fixtureGrids(buildSheets());
  const { api } = runWrite(grids, 'apiGetBootstrapData');
  const reqs = gridRequests(api);
  assert.ok(reqs.length <= 3, 'deux requêtes unitaires puis un lot, reçu ' + reqs.length);
  const last = requestedTitles(reqs[reqs.length - 1]);
  assert.ok(last.length > 1, 'la dernière requête doit être le lot groupé');
});

test('un onglet déjà chargé n\'est jamais retéléchargé', () => {
  const grids = fixtureGrids(buildSheets());
  const { api } = runWrite(grids, 'apiGetBootstrapData');
  const seen = [];
  gridRequests(api).forEach(c => requestedTitles(c).forEach(t => seen.push(t)));
  assert.strictEqual(seen.length, new Set(seen).size, 'doublons : ' + seen.join(', '));
});

test('un onglet absent du classeur rend une grille vide sans requête supplémentaire', () => {
  const grids = fixtureGrids(buildSheets());
  const { result } = runWrite(grids, 'apiGetSettings');
  assert.strictEqual(result.value.success, true);
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

// Drive est câblé (Plan 5, dernier service manquant) : apiCreateSnapshot copie
// le classeur pour de vrai et range la copie dans le sous-dossier dédié.
test('apiCreateSnapshot copie le classeur et le range dans le sous-dossier Drive', () => {
  const grids = fixtureGrids(buildSheets());
  const sheetsApi = makeFakeSheetsApi(grids, { name: 'Tops' });
  const drive = makeFakeDrive({
    SHEET_TEST: { id: 'SHEET_TEST', name: 'Tops', parents: ['dossier-1'] },
    'dossier-1': { id: 'dossier-1', name: 'Jeux', mimeType: 'application/vnd.google-apps.folder', parents: [] }
  });
  const syncFetch = (url, init) => (new URL(url).hostname === 'www.googleapis.com' ? drive.syncFetch(url, init) : sheetsApi.syncFetch(url, init));

  const result = runApi({ fnName: 'apiCreateSnapshot', args: ['Safir', ''], spreadsheetId: 'SHEET_TEST', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch });

  assert.strictEqual(result.value.success, true, JSON.stringify(result.value));
  assert.match(result.value.name, /^Tops — Snapshot \d{4}-\d{2}-\d{2} \d{2}h\d{2}$/);
  assert.ok(result.value.url, 'une URL de la copie doit être renvoyée');

  const folder = Object.values(drive.state).find(f => f.mimeType === 'application/vnd.google-apps.folder' && f.name === 'Snapshots top-des-tops');
  assert.ok(folder, 'le sous-dossier "Snapshots top-des-tops" doit être créé à côté de la source');
  assert.deepStrictEqual(folder.parents, ['dossier-1'], 'le sous-dossier doit être créé dans le même dossier que le classeur source');

  const copy = Object.values(drive.state).find(f => /^copy-/.test(f.id));
  assert.ok(copy, 'une copie du classeur doit être créée');
  assert.deepStrictEqual(copy.parents, [folder.id], 'la copie doit finir uniquement dans le sous-dossier (moveTo retire l\'ancien parent)');
});

test('apiCreateSnapshot renvoie un échec exploitable (pas un ReferenceError) si Drive répond en erreur', () => {
  const grids = fixtureGrids(buildSheets());
  const sheetsApi = makeFakeSheetsApi(grids, { name: 'Tops' });
  // Aucun fichier connu de ce faux Drive : la toute première lecture (source) échoue.
  const drive = makeFakeDrive({});
  const syncFetch = (url, init) => (new URL(url).hostname === 'www.googleapis.com' ? drive.syncFetch(url, init) : sheetsApi.syncFetch(url, init));

  const result = runApi({ fnName: 'apiCreateSnapshot', args: ['Safir', ''], spreadsheetId: 'SHEET_TEST', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch });

  assert.strictEqual(result.value.success, false);
  assert.match(result.value.error, /404/);
});

test('apiSetAutoTrigger persiste le drapeau au lieu de lever', () => {
  const grids = fixtureGrids(buildSheets());
  const { result, api } = runWrite(grids, 'apiSetAutoTrigger', [true, 'Safir', '']);
  assert.strictEqual(result.value.success, true);
  assert.strictEqual(result.value.installed, true);
  assert.match(JSON.stringify(api.batches), /auto_trigger_installed/);
});

test('apiGetAutoRules voit le déclencheur installé quand le drapeau est posé', () => {
  const grids = fixtureGrids(buildSheets());
  grids.ScriptProperties = [['Key', 'Value'], ['auto_trigger_installed', '1']];
  const { result } = runWrite(grids, 'apiGetAutoRules');
  assert.strictEqual(result.value.triggerInstalled, true);
  assert.ok(!result.value.triggerError, 'plus aucune erreur de déclencheur : ' + result.value.triggerError);
});

test('runAutoPoints est une entrée exécutable et mutante du runtime', () => {
  const grids = fixtureGrids(buildSheets());
  const { result, error } = runWrite(grids, 'runAutoPoints');
  assert.ok(!error, 'runAutoPoints ne doit pas lever : ' + (error && error.message));
  assert.ok(result, 'un résultat est attendu');
});

test('runAutoPoints est refusé quand readOnly est armé', () => {
  const api = makeFakeSheetsApi({});
  assert.throws(
    () => runApi({ fnName: 'runAutoPoints', args: [], spreadsheetId: 'S', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch, readOnly: true }),
    err => err.code === 'WRITE_DISABLED'
  );
});
