'use strict';

const { runBridge, _buildSandbox, _scriptPropertiesSeed, _bridgeBody } = require('../lib/gas-runtime/runtime');
const { bridgeReply, normalizeBridgeParams, resolveBridgeRequest } = require('../lib/discord-bridge');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');
const { buildSheets } = require('./frontend/fixtures.js');
const test = require('node:test');
const assert = require('node:assert');

const SCRIPT_ID = 'MOCK_SCRIPT_ID_12345';
const BRIDGE_SECRET = 'bon-secret';

// Depuis la correction de la double source (Task 2, point 1), le secret n'est
// plus semé dans l'onglet ScriptProperties des fixtures : il est injecté par
// runBridge comme le ferait api/discord.js avec la variable d'environnement.
function bridge(parameter, gridsOverride, options) {
  const grids = gridsOverride || fixtureGrids(buildSheets());
  const secret = (options && Object.prototype.hasOwnProperty.call(options, 'secret')) ? options.secret : BRIDGE_SECRET;
  const api = makeFakeSheetsApi(grids);
  const out = runBridge({
    parameter: parameter,
    spreadsheetId: 'SHEET_TEST',
    accessToken: 'tok',
    scriptId: SCRIPT_ID,
    syncFetch: api.syncFetch,
    secret: secret
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

// Remplace l'ancien test qui utilisait getLeaderboard (une commande de LECTURE :
// le lot observé venait d'un effet de bord de cache, et `<= 1` acceptait aussi
// zéro écriture, donc ne prouvait rien). addPoints est la vraie commande
// écrivante du pont : un joueur relié à un Discord ID passe par le rejeu
// atomique habituel (verrou pris, un seul batchUpdate).
test('une commande écrivante (addPoints) passe par le rejeu atomique (un seul batchUpdate)', () => {
  const grids = fixtureGrids(buildSheets());
  grids.Players = grids.Players.map((r, i) => (i === 0 ? r.concat(['Discord ID']) : r.concat(['discord-' + i])));
  const { json, api } = bridge({ bgAction: 'addPoints', secret: BRIDGE_SECRET, discordId: 'discord-1', top: 'Mauvais', points: '5' }, grids);
  assert.strictEqual(json.ok, true, JSON.stringify(json));
  assert.strictEqual(api.batches.length, 1, 'exactement un lot d\'écriture');
  const batchJson = JSON.stringify(api.lastBatch());
  assert.match(batchJson, /Mauvais/, 'le lot doit contenir la ligne de points sur le Top visé');
  assert.match(batchJson, /Safir/, 'le lot doit attribuer les points au joueur résolu (discord-1 → Safir)');
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

// ─── Point 1 : le secret injecté ne vaut que pour le pont ──────────────────

test('_scriptPropertiesSeed n\'ajoute DISCORD_BRIDGE_SECRET que si explicitement fourni', () => {
  const withoutSecret = _scriptPropertiesSeed('S');
  assert.deepStrictEqual(withoutSecret, { SPREADSHEET_ID: 'S' });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(withoutSecret, 'DISCORD_BRIDGE_SECRET'), false);
  assert.deepStrictEqual(_scriptPropertiesSeed('S', 'shh'), { SPREADSHEET_ID: 'S', DISCORD_BRIDGE_SECRET: 'shh' });
});

test('un appel runApi (sans bridgeSecret) ne voit jamais la propriété DISCORD_BRIDGE_SECRET', () => {
  const grids = fixtureGrids(buildSheets());
  const api = makeFakeSheetsApi(grids);
  // Même construction que runApi : _buildSandbox sans bridgeSecret.
  const env = _buildSandbox({ spreadsheetId: 'SHEET_TEST', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch, getDateCtor: () => Date });
  const props = env.sandbox.PropertiesService.getScriptProperties();
  assert.strictEqual(props.getProperty('DISCORD_BRIDGE_SECRET'), null);
});

// ─── Point 3 : le secret est vérifié avant toute résolution de tenant ──────

test('resolveBridgeRequest : secret invalide ou absent → "Non autorisé.", identique quel que soit le tenant', () => {
  const tenants = { 'connu.example.com': { spreadsheetId: 'S' } };

  const badSecretKnownTenant = resolveBridgeRequest({
    method: 'GET', query: { tenant: 'connu.example.com', secret: 'faux' }, hostHeader: 'connu.example.com',
    tenants, bridgeSecret: 'bon-secret'
  });
  const noSecretUnknownTenant = resolveBridgeRequest({
    method: 'GET', query: { tenant: 'inconnu.example.com' }, hostHeader: 'inconnu.example.com',
    tenants, bridgeSecret: 'bon-secret'
  });

  assert.ok(badSecretKnownTenant.reply, 'un secret invalide doit court-circuiter avant le tenant');
  assert.ok(noSecretUnknownTenant.reply);
  const expected = { ok: false, message: 'Non autorisé.' };
  assert.deepStrictEqual(JSON.parse(badSecretKnownTenant.reply.body), expected);
  assert.deepStrictEqual(JSON.parse(noSecretUnknownTenant.reply.body), expected, 'même message qu\'un tenant connu : aucune fuite d\'existence de tenant');
});

test('resolveBridgeRequest : bon secret + tenant connu → laisse passer, paramètres normalisés', () => {
  const tenants = { 'connu.example.com': { spreadsheetId: 'S' } };
  const parsed = resolveBridgeRequest({
    method: 'GET', query: { tenant: 'connu.example.com', secret: 'bon-secret', top: ['a', 'b'] }, hostHeader: 'connu.example.com',
    tenants, bridgeSecret: 'bon-secret'
  });
  assert.ok(!parsed.reply, 'ne doit pas court-circuiter');
  assert.strictEqual(parsed.tenant.spreadsheetId, 'S');
  assert.strictEqual(parsed.parameter.top, 'b', 'dernière occurrence d\'un paramètre répété');
});

test('resolveBridgeRequest : bon secret mais tenant inconnu → "Tenant inconnu."', () => {
  const parsed = resolveBridgeRequest({
    method: 'GET', query: { tenant: 'inconnu.example.com', secret: 'bon-secret' }, hostHeader: 'inconnu.example.com',
    tenants: {}, bridgeSecret: 'bon-secret'
  });
  assert.ok(parsed.reply);
  assert.deepStrictEqual(JSON.parse(parsed.reply.body), { ok: false, message: 'Tenant inconnu.' });
});

// ─── Point 4 : normalisation des paramètres d'URL répétés ──────────────────

test('normalizeBridgeParams : un paramètre répété (tableau Vercel) devient une chaîne, dernière occurrence', () => {
  assert.deepStrictEqual(
    normalizeBridgeParams({ top: ['Mauvais', 'Méchant'], secret: 's', vide: [] }),
    { top: 'Méchant', secret: 's', vide: undefined }
  );
});

test('normalizeBridgeParams : une valeur simple reste une chaîne', () => {
  assert.deepStrictEqual(normalizeBridgeParams({ top: 'Mauvais' }), { top: 'Mauvais' });
});

// ─── Point 5 : repli de réponse au format du pont ──────────────────────────

test('_bridgeBody : une valeur sans getContent() retombe sur le format du pont, jamais "[object Object]"', () => {
  const body = _bridgeBody({ inattendu: true });
  assert.doesNotMatch(body, /\[object Object\]/);
  assert.deepStrictEqual(JSON.parse(body), { ok: false, message: 'Réponse du pont Discord invalide (format inattendu).' });
});

test('_bridgeBody : une TextOutput valide passe par getContent()', () => {
  const value = { getContent: () => '{"ok":true}' };
  assert.strictEqual(_bridgeBody(value), '{"ok":true}');
});
