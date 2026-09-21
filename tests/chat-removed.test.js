'use strict';
// Garde-fou de non-retour : le tchat a été retiré sur décision explicite de
// l'utilisateur (2026-09-21, v3.34.0). Ces tests échouent si un symbole de
// tchat réapparaît dans le code — voir la règle dédiée dans context.md.
const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./harness.js');
const { buildSheets } = require('./frontend/fixtures.js');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

test('aucun symbole de tchat ne subsiste dans Code.gs', () => {
  ['ChatService', 'apiGetChatMessages', 'apiPostChatMessage', 'apiDeleteChatMessage',
   '_chatVersion', '_bumpChatVersion', 'chat_version'].forEach(symbol => {
    assert.strictEqual(CODE.includes(symbol), false, 'symbole de tchat encore présent : ' + symbol);
  });
});

test("les en-têtes de feuille ne déclarent plus d'onglet chat", () => {
  const gas = loadGas();
  assert.strictEqual(gas.CANONICAL_SHEET_HEADERS.chat, undefined);
  assert.strictEqual(/^\s*chat:/m.test(CODE), false, 'une table dHeaders déclare encore chat');
});

test('le composite de démarrage ne renvoie plus de messages de tchat', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => buildSheets();
  const res = gas.apiGetBootstrapData();
  assert.strictEqual(res.success, true);
  assert.strictEqual('chatMessages' in res, false, 'chatMessages doit avoir disparu du bootstrap');
});
