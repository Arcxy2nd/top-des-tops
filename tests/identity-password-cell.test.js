'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet, injectSheets } = require('./harness');

function setup(rows) {
  const gas = loadGas();
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password']].concat(rows));
  injectSheets(gas, { players, categories: makeSheet([['Name', 'Description', 'Emoji', 'Hex color']]),
    history: makeSheet([]), auditLog: null, spreadsheet: { insertSheet: () => makeSheet([]), getSheetByName: () => null } });
  return gas;
}

test('une cellule mot de passe ne contenant que des caractères invisibles compte comme vide', () => {
  const gas = setup([
    ['Zed', '', '', '\u200B'],
    ['Nbsp', '', '', '\u00A0 \uFEFF'],
    ['Pwd', '', '', ' abc\u200B ']
  ]);
  const players = gas.SettingsService.getEntities('Players');
  const flag = n => players.find(p => p.name === n).hasPassword;
  assert.strictEqual(flag('Zed'), false);
  assert.strictEqual(flag('Nbsp'), false);
  assert.strictEqual(flag('Pwd'), true);
  assert.strictEqual(gas.SettingsService.verifyIdentity('Zed', ''), true);
  assert.strictEqual(gas.SettingsService.verifyIdentity('Pwd', 'abc'), true);
  assert.strictEqual(gas.SettingsService.verifyIdentity('Pwd', ''), false);
});

test('un mot de passe numérique 0 reste un vrai mot de passe', () => {
  const gas = setup([['Zero', '', '', 0]]);
  assert.strictEqual(gas.SettingsService.getEntities('Players')[0].hasPassword, true);
  assert.strictEqual(gas.SettingsService.verifyIdentity('Zero', '0'), true);
});
