'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

// Régression : SettingsService.getEntities() lisait sheet.getDataRange().getValues()
// sans exclure la ligne d'en-tête ("Name | Avatar URL | Hex color | Password" pour
// Players, "Name | Description | Emoji | Hex color" pour Categories) — un faux joueur
// et une fausse catégorie nommés "Name" apparaissaient donc systématiquement en tête
// de chaque liste, partout où getEntities() est consommé (Dashboard, Historique,
// Paramètres, tchat...).
test('getEntities excludes the header row of the Players sheet', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name', 'Avatar URL', 'Hex color', 'Password'],
      ['Alice', 'https://x/a.png', '#ff0000', '']
    ])
  });

  const players = gas.SettingsService.getEntities('Players');
  assert.strictEqual(players.length, 1);
  assert.strictEqual(players[0].name, 'Alice');
  assert.ok(!players.some(p => p.name === 'Name'), 'la ligne d\'en-tête ne doit jamais devenir un joueur');
});

test('getEntities excludes the header row of the Categories sheet', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    categories: makeSheet([
      ['Name', 'Description', 'Emoji', 'Hex color'],
      ['Jeux', 'Défis en jeu', '🎮', '#00ff00']
    ])
  });

  const categories = gas.SettingsService.getEntities('Categories');
  assert.strictEqual(categories.length, 1);
  assert.strictEqual(categories[0].name, 'Jeux');
  assert.ok(!categories.some(c => c.name === 'Name'), 'la ligne d\'en-tête ne doit jamais devenir une catégorie');
});

test('getEntities returns an empty list when the sheet only has a header row', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password']])
  });

  assert.deepStrictEqual(gas.SettingsService.getEntities('Players'), []);
});

/** Stateful mock: insertSheet() creates the sheet and getSheets() picks it up on the next call,
 *  mirroring how ConfigService.clearCache() + a real re-fetch behaves in production. */
function withSettingsSheets(gas, initial) {
  let settingsSheet = initial || null;
  const auditSheet = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail']]);
  gas.ConfigService.getSheets = () => ({
    spreadsheet: {
      insertSheet: () => { settingsSheet = makeSheet([]); return settingsSheet; },
      getSheetByName: () => null
    },
    settings: settingsSheet,
    auditLog: auditSheet
  });
  gas.ConfigService.clearCache = () => {};
}

test('SettingsSheetService.getAll returns {} when the Settings sheet does not exist', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  assert.deepStrictEqual({ ...gas.SettingsSheetService.getAll() }, {});
});

test('SettingsSheetService.setValue auto-creates the sheet with header + default keys, then writes the value', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  gas.SettingsSheetService.setValue('app_title', 'Les Champions');
  const all = gas.SettingsSheetService.getAll();
  assert.strictEqual(all.app_title, 'Les Champions');
  assert.strictEqual(all.logo_url, '');
});

test('SettingsSheetService.setValue updates an existing key without duplicating rows', () => {
  const gas = loadGas();
  const existing = makeSheet([['Key', 'Value'], ['app_title', 'Old'], ['logo_url', '']]);
  withSettingsSheets(gas, existing);
  gas.SettingsSheetService.setValue('app_title', 'New');
  assert.strictEqual(existing._grid.length, 3);
  assert.strictEqual(existing._grid[1][1], 'New');
});

test('apiGetAppSettings falls back to defaults when nothing is configured', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  const res = gas.apiGetAppSettings();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.appTitle, 'Tops des Tops');
  assert.strictEqual(res.logoUrl, '');
});

test('apiSaveAppSettings persists title and logo, then apiGetAppSettings reflects them', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  const saveRes = gas.apiSaveAppSettings('Les Champions', 'https://example.com/logo.png', 'Alice');
  assert.strictEqual(saveRes.success, true);
  const res = gas.apiGetAppSettings();
  assert.strictEqual(res.appTitle, 'Les Champions');
  assert.strictEqual(res.logoUrl, 'https://example.com/logo.png');
});

test('apiSaveTooltipStyle persists tooltip preferences to Settings sheet', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  const prefs = { colors: { cold: '#123456', normal: '#234567', warm: '#345678', hot: '#456789', blaze: '#567890' }, gauge: true, effects: false };
  const saveRes = gas.apiSaveTooltipStyle(JSON.stringify(prefs), 'Alice');
  assert.strictEqual(saveRes.success, true);
  const res = gas.apiGetAppSettings();
  assert.deepEqual(res.tooltipStyle, prefs);
});

// Régression : addEntity() n'avait aucune vérification d'unicité de nom — un
// double-clic sur "+ Ajouter" (ou deux appels concurrents) pouvait créer deux
// entités identiques, et deleteEntity() les aurait ensuite supprimées toutes
// les deux d'un coup sur ce qui ressemblait à une suppression unitaire.
test('SettingsService.addEntity rejects a name that already exists', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ players });

  assert.throws(() => gas.SettingsService.addEntity('Players', 'Alice', '', ''), /existe déjà/);
  assert.strictEqual(gas.SettingsService.getEntities('Players').length, 1, 'aucune ligne en double ne doit avoir été ajoutée');
});

test('SettingsService.renameEntity rejects a new name that collides with another entity', () => {
  const gas = loadGas();
  const categories = makeSheet([
    ['Name', 'Description', 'Emoji', 'Hex color'],
    ['Top A', '', '', ''],
    ['Top B', '', '', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  gas.ConfigService.getSheets = () => ({ categories, history, autoRules: null, bareme: null, phrases: null });

  assert.throws(() => gas.SettingsService.renameEntity('Categories', 'Top A', 'Top B', '', ''), /existe déjà/);
  const cats = gas.SettingsService.getEntities('Categories').map(c => c.name);
  assert.deepStrictEqual(cats, ['Top A', 'Top B'], 'aucun des deux Tops ne doit avoir été modifié');
});

test('SettingsService.renameEntity still allows a no-op rename to the same name', () => {
  const gas = loadGas();
  const categories = makeSheet([
    ['Name', 'Description', 'Emoji', 'Hex color'],
    ['Top A', 'old desc', '', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  gas.ConfigService.getSheets = () => ({ categories, history, autoRules: null, bareme: null, phrases: null });

  gas.SettingsService.renameEntity('Categories', 'Top A', 'Top A', 'new desc', '🎯');
  const cats = gas.SettingsService.getEntities('Categories');
  assert.strictEqual(cats[0].meta, 'new desc');
});

// Régression : renameEntity() propageait déjà le renommage d'un Joueur à
// History/AutoRules, mais jamais à la feuille Notes — une note dont le nom de
// joueur n'était plus reconnu par aucune entité active devenait invisible
// dans l'UI (qui ne groupe que par joueurs actuellement connus), sans être
// supprimée ni signalée.
test('SettingsService.renameEntity propagates a player rename to their Notes, leaving other players untouched', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '#ff0000', ''],
    ['Bob', '', '#00ff00', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  const notes = makeSheet([
    ['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe'],
    [new Date('2026-01-01'), 'Alice', 'Note sur Alice', 'n1', 'Bob', '', ''],
    [new Date('2026-01-02'), 'Bob', 'Note sur Bob', 'n2', 'Alice', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ players, history, notes, autoRules: null });

  gas.SettingsService.renameEntity('Players', 'Alice', 'Alicia', '', '');

  const notesValues = notes.getDataRange().getValues();
  assert.strictEqual(notesValues[1][1], 'Alicia', 'la note d\'Alice doit maintenant référencer Alicia');
  assert.strictEqual(notesValues[2][1], 'Bob', 'la note de Bob ne doit pas être touchée par le renommage d\'Alice');
});
