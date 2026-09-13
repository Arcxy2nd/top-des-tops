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

test('addPoints writes a history row for the linked player and audits it', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '111111111111111111',
    top: 'Mario Kart', points: '5', desc: 'via test'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  const historyRows = gas.ConfigService.getSheets().history._grid;
  assert.strictEqual(historyRows.length, 2);
  assert.strictEqual(historyRows[1][1], 'Alex');
  assert.strictEqual(historyRows[1][2], 'Mario Kart');
  assert.strictEqual(historyRows[1][3], 5);
  const auditRows = gas.ConfigService.getSheets().auditLog._grid;
  assert.strictEqual(auditRows.length, 2);
  assert.strictEqual(auditRows[1][1], 'Alex');
});

test('addPoints refuses an unlinked Discord account', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '000000000000000000',
    top: 'Mario Kart', points: '5'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /lié/);
});

test('addPoints refuses an unknown top', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '111111111111111111',
    top: 'Top Inexistant', points: '5'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /inconnu/);
});

test('addPoints refuses zero or negative points', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '111111111111111111',
    top: 'Mario Kart', points: '0'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
  assert.match(body.message, /≥ 1/);
});

test('addNote writes a note for the linked player', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addNote', secret: 'right-secret', discordId: '111111111111111111', text: 'ping via discord'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  const noteRows = gas.ConfigService.getSheets().notes._grid;
  assert.strictEqual(noteRows.length, 2);
  assert.strictEqual(noteRows[1][1], 'Alex');
  assert.strictEqual(noteRows[1][2], 'ping via discord');
});

test('addNote refuses an unlinked Discord account', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addNote', secret: 'right-secret', discordId: '000000000000000000', text: 'ping'
  } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, false);
});

test('getLeaderboard returns a ranked, formatted list of all players', () => {
  const gas = makeContext('right-secret');
  gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addPoints', secret: 'right-secret', discordId: '111111111111111111', top: 'Mario Kart', points: '10'
  } });
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getLeaderboard', secret: 'right-secret' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  assert.match(body.message, /Alex/);
  assert.match(body.message, /10 pts/);
});

test("getNotes lists a player's notes, most recent first", () => {
  const gas = makeContext('right-secret');
  gas.DiscordBridgeService.handleRequest({ parameter: {
    bgAction: 'addNote', secret: 'right-secret', discordId: '111111111111111111', text: 'premiere note'
  } });
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getNotes', secret: 'right-secret', player: 'Alex' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  assert.match(body.message, /premiere note/);
});

test('getNotes reports no notes for a player with none', () => {
  const gas = makeContext('right-secret');
  const out = gas.DiscordBridgeService.handleRequest({ parameter: { bgAction: 'getNotes', secret: 'right-secret', player: 'Sam' } });
  const body = JSON.parse(out._text);
  assert.strictEqual(body.ok, true);
  assert.match(body.message, /Aucune note/);
});
