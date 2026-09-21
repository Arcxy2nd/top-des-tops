'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { runApi } = require('../lib/gas-runtime/runtime');
const { createIdempotencyStore, IDEMPOTENCY_SHEET_NAME, IDEMPOTENCY_HEADERS, MAX_KEYS } = require('../lib/gas-runtime/idempotency');
const { createSpreadsheet } = require('../lib/gas-runtime/spreadsheet');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');
const { buildSheets } = require('./frontend/fixtures.js');

const SCRIPT_ID = 'MOCK_SCRIPT_ID_12345';

function makeStore(rows) {
  const sheets = [{ sheetId: 1, title: 'History', grid: [['Date', 'Player']] }];
  if (rows) sheets.push({ sheetId: 2, title: IDEMPOTENCY_SHEET_NAME, grid: rows });
  const model = createSpreadsheet({ spreadsheetId: 'S', sheets, loadGrid: () => [], DateCtor: Date });
  return { store: createIdempotencyStore({ openSpreadsheet: () => model.spreadsheet }), model };
}

// ── Le magasin, hors runtime ────────────────────────────────────────────────

test('onglet absent : aucune clé connue, et rien n\'est créé par une simple recherche', () => {
  const { store, model } = makeStore(null);
  assert.deepStrictEqual({ ...store.lookup('k1') }, { found: false, result: null });
  assert.strictEqual(model.journal.length, 0, 'une lecture ne doit rien écrire');
});

test('une clé enregistrée est retrouvée avec sa réponse', () => {
  const { store } = makeStore([IDEMPOTENCY_HEADERS]);
  store.record('k1', { success: true, added: 3 }, new Date('2026-09-20T10:00:00Z'));
  const seen = store.lookup('k1');
  assert.strictEqual(seen.found, true);
  assert.deepStrictEqual(seen.result, { success: true, added: 3 });
});

test('une clé inconnue reste inconnue même quand d\'autres existent', () => {
  const { store } = makeStore([IDEMPOTENCY_HEADERS]);
  store.record('k1', { success: true }, new Date());
  assert.strictEqual(store.lookup('k2').found, false);
});

test('une clé vide ou blanche n\'est ni enregistrée ni trouvée', () => {
  const { store, model } = makeStore([IDEMPOTENCY_HEADERS]);
  store.record('', { success: true }, new Date());
  store.record('   ', { success: true }, new Date());
  assert.strictEqual(model.journal.length, 0);
  assert.strictEqual(store.lookup('').found, false);
});

test('une réponse trop longue n\'est pas stockée, mais la clé reste une preuve', () => {
  const { store } = makeStore([IDEMPOTENCY_HEADERS]);
  store.record('k1', { blob: 'x'.repeat(5000) }, new Date());
  const seen = store.lookup('k1');
  assert.strictEqual(seen.found, true, 'le geste est passé : la clé doit rester');
  assert.strictEqual(seen.result, null, 'la valeur d\'origine est perdue, pas inventée');
});

test('l\'onglet est élagué à MAX_KEYS, les plus anciennes clés partant en premier', () => {
  const rows = [IDEMPOTENCY_HEADERS];
  for (let i = 0; i < MAX_KEYS; i++) rows.push(['vieille-' + i, '2026-01-01T00:00:00Z', '']);
  const { store } = makeStore(rows);

  store.record('nouvelle', { success: true }, new Date());

  assert.strictEqual(store.lookup('nouvelle').found, true);
  assert.strictEqual(store.lookup('vieille-0').found, false, 'la plus ancienne doit avoir été élaguée');
  assert.strictEqual(store.lookup('vieille-' + (MAX_KEYS - 1)).found, true, 'la plus récente des anciennes reste');
});

test('l\'élagage se replie en une seule suppression de plage dans le lot', () => {
  const rows = [IDEMPOTENCY_HEADERS];
  for (let i = 0; i < MAX_KEYS + 4; i++) rows.push(['vieille-' + i, '2026-01-01T00:00:00Z', '']);
  const { store, model } = makeStore(rows);
  store.record('nouvelle', { success: true }, new Date());
  const deletes = model.journal.filter(e => e.op === 'deleteRows');
  assert.strictEqual(deletes.length, 5, '5 lignes en trop = 5 entrées de journal, repliées au rejeu');
  assert.ok(deletes.every(e => e.index === 2), 'toujours le même index : les suivantes remontent');
});

// ── Bout en bout, à travers le runtime ──────────────────────────────────────

function writeNote(grids, key, text) {
  const api = makeFakeSheetsApi(grids);
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return {
      result: runApi({
        fnName: 'apiAddNote',
        args: ['Safir', text, '', 'Safir', ''],
        spreadsheetId: 'SHEET_TEST',
        accessToken: 'tok',
        scriptId: SCRIPT_ID,
        syncFetch: api.syncFetch,
        idempotencyKey: key
      }),
      api
    };
  } finally {
    console.warn = originalWarn;
  }
}

function noteTexts(grids) {
  return (grids.Notes || []).slice(1).map(r => r[2]);
}

test('renvoyer la même clé n\'écrit pas une seconde fois', () => {
  const grids = fixtureGrids(buildSheets());
  const first = writeNote(grids, 'cle-abc', 'Note unique');
  assert.strictEqual(first.result.value.success, true);
  assert.strictEqual(first.result.replayed, false);
  const afterFirst = noteTexts(grids).filter(t => t === 'Note unique').length;
  assert.strictEqual(afterFirst, 1);

  // Le client n'a jamais reçu la réponse et rejoue exactement le même appel.
  const second = writeNote(grids, 'cle-abc', 'Note unique');
  assert.strictEqual(second.result.replayed, true, 'le second passage doit être reconnu comme un rejeu');
  assert.strictEqual(second.api.batches.length, 0, 'aucun batchUpdate ne doit partir sur un rejeu');
  assert.strictEqual(noteTexts(grids).filter(t => t === 'Note unique').length, 1,
    'la note ne doit exister qu\'une fois');
});

test('le rejeu rend la réponse du premier passage', () => {
  const grids = fixtureGrids(buildSheets());
  const first = writeNote(grids, 'cle-def', 'Note rejouée');
  const second = writeNote(grids, 'cle-def', 'Note rejouée');
  assert.deepStrictEqual(second.result.value, first.result.value);
});

test('deux clés différentes écrivent bien deux fois (pas de déduplication par contenu)', () => {
  const grids = fixtureGrids(buildSheets());
  writeNote(grids, 'cle-1', 'Même texte');
  writeNote(grids, 'cle-2', 'Même texte');
  // Deux gestes délibérés identiques doivent rester deux lignes : la clé
  // protège d'un renvoi, jamais d'une répétition voulue.
  assert.strictEqual(noteTexts(grids).filter(t => t === 'Même texte').length, 2);
});

test('sans clé, rien ne change : l\'appel écrit comme avant', () => {
  const grids = fixtureGrids(buildSheets());
  const { result, api } = writeNote(grids, undefined, 'Sans clé');
  assert.strictEqual(result.value.success, true);
  assert.strictEqual(result.replayed, false);
  assert.strictEqual(api.batches.length, 1);
  assert.strictEqual(noteTexts(grids).filter(t => t === 'Sans clé').length, 1);
});

test('un appel échoué n\'enregistre pas sa clé : le renvoi peut aboutir', () => {
  const grids = fixtureGrids(buildSheets());
  const api = makeFakeSheetsApi(grids);
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    runApi({
      fnName: 'apiAddNote',
      args: ['JoueurInconnu', 'Refusée', '', 'JoueurInconnu', 'mauvais'],
      spreadsheetId: 'SHEET_TEST', accessToken: 'tok', scriptId: SCRIPT_ID,
      syncFetch: api.syncFetch, idempotencyKey: 'cle-echec'
    });
  } catch (e) {
    // apiAddNote rend { success: false } au lieu de lever : les deux formes
    // d'échec sont acceptables ici, seul compte l'effet sur la clé.
  } finally {
    console.warn = originalWarn;
  }

  const retry = writeNote(grids, 'cle-echec', 'Enfin écrite');
  assert.strictEqual(retry.result.replayed, false, 'une clé jamais appliquée ne doit pas bloquer le renvoi');
  assert.strictEqual(noteTexts(grids).filter(t => t === 'Enfin écrite').length, 1);
});
