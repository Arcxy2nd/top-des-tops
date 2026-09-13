'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet, injectSheets } = require('./harness.js');

/** propStore lets each test control DISCORD_BRIDGE_SECRET the same way tests/cache.test.js does. */
function makeContext(secret) {
  const propStore = {};
  if (secret !== undefined) propStore.DISCORD_BRIDGE_SECRET = secret;
  const gas = loadGas({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in propStore ? propStore[k] : null),
        getProperties: () => Object.assign({}, propStore),
        setProperty: (k, v) => { propStore[k] = String(v); }
      })
    }
  });
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre', 'Discord ID'],
    ['Alex', '', '', '', '1', '111111111111111111'],
    ['Sam', '', '', '', '2', '']
  ]);
  const categories = makeSheet([
    ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'],
    ['Mario Kart', '', '🏎️', '#ff0000', '1']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  const notes = makeSheet([['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe']]);
  const auditLog = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  const settings = makeSheet([['Key', 'Value']]);
  injectSheets(gas, { players, categories, history, notes, auditLog, settings });
  return gas;
}

test('handleRequest denies when DISCORD_BRIDGE_SECRET is unset (default-deny)', () => {
  const gas = makeContext();
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getLeaderboard' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
});

test('handleRequest denies when the provided secret does not match', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getLeaderboard', secret: 'wrong-secret' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
});

test('handleRequest rejects an unknown bgAction with the right secret', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'doSomethingElse', secret: 'right-secret' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /inconnue/);
});

test('resolvePlayerByDiscordId finds the linked player and returns null when unlinked', () => {
  const gas = makeContext('right-secret');
  assert.strictEqual(gas.DiscordBridgeService.resolvePlayerByDiscordId('111111111111111111'), 'Alex');
  assert.strictEqual(gas.DiscordBridgeService.resolvePlayerByDiscordId('999999999999999999'), null);
  assert.strictEqual(gas.DiscordBridgeService.resolvePlayerByDiscordId(''), null);
});

test('doGet delegates to DiscordBridgeService when bgAction is present', () => {
  const gas = makeContext('right-secret');
  // getLeaderboard_ doesn't exist yet at this task's stage — an unrecognized
  // action still proves doGet routed into the bridge (JSON out, not HTML).
  const out = gas.doGet({ parameter: { bgAction: 'unknown', secret: 'right-secret' } });
  assert.strictEqual(out._mime, 'JSON');
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /inconnue/);
});

test('doGet still serves Index.html when bgAction is absent', () => {
  const gas = makeContext('right-secret');
  const out = gas.doGet({ parameter: {} });
  assert.strictEqual(out._file, 'Index');
});
