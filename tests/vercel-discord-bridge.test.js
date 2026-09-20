'use strict';

const { runBridge } = require('../lib/gas-runtime/runtime');
const { bridgeReply } = require('../lib/discord-bridge');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');
const { buildSheets } = require('./frontend/fixtures.js');
const test = require('node:test');
const assert = require('node:assert');

const SCRIPT_ID = 'MOCK_SCRIPT_ID_12345';

function bridge(parameter, gridsOverride) {
  const grids = gridsOverride || fixtureGrids(buildSheets());
  grids.ScriptProperties = grids.ScriptProperties || [['Key', 'Value'], ['DISCORD_BRIDGE_SECRET', 'bon-secret']];
  const api = makeFakeSheetsApi(grids);
  const out = runBridge({
    parameter: parameter,
    spreadsheetId: 'SHEET_TEST',
    accessToken: 'tok',
    scriptId: SCRIPT_ID,
    syncFetch: api.syncFetch
  });
  return { out: out, api: api, json: JSON.parse(out.body) };
}

test('un secret invalide est refusé, sans exécuter la commande', () => {
  const { json, api } = bridge({ bgAction: 'listTops', secret: 'mauvais' });
  assert.strictEqual(json.ok, false);
  assert.strictEqual(api.batches.length, 0, 'aucune écriture ne doit partir');
});

test('listTops rend le format attendu par BotGhost', () => {
  const { json } = bridge({ bgAction: 'listTops', secret: 'bon-secret' });
  assert.strictEqual(json.ok, true);
  assert.ok(Array.isArray(json.choices), 'BotGhost attend un tableau choices');
  assert.ok(json.choices.every(c => typeof c.name === 'string' && typeof c.value === 'string'));
});

test('une action inconnue rend un message, jamais une exception', () => {
  const { json } = bridge({ bgAction: 'nImporteQuoi', secret: 'bon-secret' });
  assert.strictEqual(json.ok, false);
  assert.match(json.message, /inconnue/i);
});

test('une commande écrivante passe par le rejeu atomique (un seul batchUpdate)', () => {
  const grids = fixtureGrids(buildSheets());
  grids.ScriptProperties = [['Key', 'Value'], ['DISCORD_BRIDGE_SECRET', 'bon-secret']];
  grids.Players = grids.Players.map((r, i) => (i === 0 ? r : r.concat(['discord-' + i])));
  const { api } = bridge({ bgAction: 'getLeaderboard', secret: 'bon-secret' }, grids);
  assert.ok(api.batches.length <= 1, 'au plus un lot d\'écriture');
});

test('bridgeReply met les échecs au format BotGhost, en HTTP 200', () => {
  const reply = bridgeReply(new Error('Tenant inconnu.'));
  assert.strictEqual(reply.status, 200);
  assert.deepStrictEqual(JSON.parse(reply.body), { ok: false, message: 'Tenant inconnu.' });
});

test('bridgeReply ne laisse pas fuiter une URL ou un identifiant de classeur', () => {
  const reply = bridgeReply(new Error('Échec https://sheets.googleapis.com/v4/spreadsheets/SECRET_ID/values'));
  assert.strictEqual(JSON.parse(reply.body).message.indexOf('SECRET_ID'), -1);
});
