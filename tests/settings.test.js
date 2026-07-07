'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

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
