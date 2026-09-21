'use strict';

const { createScriptPropertiesStore, PROPERTIES_SHEET_NAME, PROPERTIES_HEADERS } = require('../lib/gas-runtime/script-properties');
const { createSpreadsheet } = require('../lib/gas-runtime/spreadsheet');
const test = require('node:test');
const assert = require('node:assert');

function makeModel(propertyRows) {
  const sheets = [{ sheetId: 1, title: 'History', grid: [['Date', 'Player']] }];
  if (propertyRows) sheets.push({ sheetId: 2, title: PROPERTIES_SHEET_NAME, grid: propertyRows });
  return createSpreadsheet({ spreadsheetId: 'S', sheets, loadGrid: () => [], DateCtor: Date });
}

function makeStore(propertyRows, seed) {
  const model = makeModel(propertyRows);
  let opened = 0;
  const store = createScriptPropertiesStore({
    openSpreadsheet: () => { opened++; return model.spreadsheet; },
    seed: seed || { SPREADSHEET_ID: 'S' }
  });
  return { store, model, opens: () => opened };
}

test('une valeur injectée est servie sans ouvrir le classeur', () => {
  const { store, opens } = makeStore(null);
  assert.strictEqual(store.getProperty('SPREADSHEET_ID'), 'S');
  assert.strictEqual(opens(), 0, 'SPREADSHEET_ID vient du tenant, jamais de la feuille');
});

test('lit une propriété de l\'onglet ScriptProperties, en-tête ignoré', () => {
  const { store } = makeStore([PROPERTIES_HEADERS, ['logs_version', '42'], ['active_phrase_preset', 'Soirée']]);
  assert.strictEqual(store.getProperty('logs_version'), '42');
  assert.strictEqual(store.getProperty('active_phrase_preset'), 'Soirée');
  assert.strictEqual(store.getProperty('Key'), null, 'la ligne d\'en-tête n\'est pas une propriété');
});

test('clé absente : null (Code.gs retombe alors sur sa valeur par défaut)', () => {
  const { store } = makeStore([PROPERTIES_HEADERS]);
  assert.strictEqual(store.getProperty('logs_version'), null);
});

test('onglet absent : store vide, aucune erreur', () => {
  const { store } = makeStore(null);
  assert.strictEqual(store.getProperty('logs_version'), null);
  assert.deepStrictEqual(store.getProperties(), {});
});

test('getProperties ne rend que la feuille, jamais la graine injectée', () => {
  const { store } = makeStore([PROPERTIES_HEADERS, ['notes_version', '3']]);
  // La graine (SPREADSHEET_ID, et DISCORD_BRIDGE_SECRET sur le chemin du pont)
  // reste accessible clé par clé, mais ne part pas dans un objet complet qu'un
  // appelant pourrait journaliser ou renvoyer tel quel.
  assert.deepStrictEqual(store.getProperties(), { notes_version: '3' });
  assert.strictEqual(store.getProperty('SPREADSHEET_ID'), 'S');
});

test('un secret injecté ne ressort jamais de getProperties', () => {
  const { store } = makeStore([PROPERTIES_HEADERS, ['notes_version', '3']], { SPREADSHEET_ID: 'S', DISCORD_BRIDGE_SECRET: 'tres-secret' });
  const all = store.getProperties();
  assert.strictEqual(Object.prototype.hasOwnProperty.call(all, 'DISCORD_BRIDGE_SECRET'), false);
  assert.strictEqual(JSON.stringify(all).includes('tres-secret'), false);
  // DiscordBridge.gs lit le secret clé par clé : ce chemin doit rester intact.
  assert.strictEqual(store.getProperty('DISCORD_BRIDGE_SECRET'), 'tres-secret');
});

test('setProperty met à jour la ligne existante (une seule écriture de cellule)', () => {
  const { store, model } = makeStore([PROPERTIES_HEADERS, ['logs_version', '42']]);
  store.setProperty('logs_version', 43);
  assert.strictEqual(store.getProperty('logs_version'), '43');
  assert.strictEqual(model.journal.length, 1);
  assert.deepStrictEqual(model.journal[0], { op: 'setValues', sheetId: 2, row: 2, col: 2, values: [['43']] });
});

test('setProperty d\'une clé nouvelle ajoute une ligne', () => {
  const { store, model } = makeStore([PROPERTIES_HEADERS, ['logs_version', '42']]);
  store.setProperty('chat_version', '1');
  assert.strictEqual(store.getProperty('chat_version'), '1');
  assert.strictEqual(model.journal[0].op, 'appendRow');
  assert.deepStrictEqual(model.journal[0].values, [['chat_version', '1']]);
});

test('setProperty crée l\'onglet et son en-tête si besoin', () => {
  const { store, model } = makeStore(null);
  store.setProperty('logs_version', '1');
  assert.strictEqual(model.journal[0].op, 'addSheet');
  assert.strictEqual(model.journal[0].title, PROPERTIES_SHEET_NAME);
  assert.deepStrictEqual(model.journal[1].values, [PROPERTIES_HEADERS]);
  assert.deepStrictEqual(model.journal[2].values, [['logs_version', '1']]);
  assert.strictEqual(store.getProperty('logs_version'), '1');
});

test('deleteProperty vide la valeur sans décaler les lignes', () => {
  const { store, model } = makeStore([PROPERTIES_HEADERS, ['logs_version', '42'], ['chat_version', '7']]);
  store.deleteProperty('logs_version');
  assert.strictEqual(store.getProperty('logs_version'), null);
  assert.strictEqual(store.getProperty('chat_version'), '7', 'les lignes suivantes ne bougent pas');
  assert.ok(!model.journal.some(e => e.op === 'deleteRows'));
});

test('deleteProperty d\'une clé absente n\'écrit rien', () => {
  const { store, model } = makeStore([PROPERTIES_HEADERS]);
  store.deleteProperty('logs_version');
  assert.strictEqual(model.journal.length, 0);
});

test('les valeurs sont toujours des chaînes (contrat PropertiesService)', () => {
  const { store } = makeStore([PROPERTIES_HEADERS, ['logs_version', 42]]);
  assert.strictEqual(store.getProperty('logs_version'), '42');
  store.setProperty('notes_version', 8);
  assert.strictEqual(store.getProperty('notes_version'), '8');
});
