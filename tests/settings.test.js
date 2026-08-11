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
