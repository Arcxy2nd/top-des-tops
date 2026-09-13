'use strict';

const assert = require('assert');
const { loadGas, makeSheet, injectSheets } = require('./harness.js');

function makeContext() {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '#ff0000', 'sesame'],
    ['Bob', '', '', ''],          // no password
    ['Chloé', '', '', '  pad  '] // password with surrounding spaces in sheet
  ]);
  const categories = makeSheet([['Name', 'Description', 'Emoji icon', 'Hex color']]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description']]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  const settings = makeSheet([['Key', 'Value']]);
  injectSheets(gas, { players, categories, history, auditLog, settings });
  return gas;
}

// getEntities must expose hasPassword but NEVER the password value
{
  const ctx = makeContext();
  const players = ctx.SettingsService.getEntities('Players');
  const alice = players.find(p => p.name === 'Alice');
  const bob   = players.find(p => p.name === 'Bob');
  assert.strictEqual(alice.hasPassword, true);
  assert.strictEqual(bob.hasPassword, false);
  assert.strictEqual(JSON.stringify(players).includes('sesame'), false,
    'password value must never leave the backend');
}

// verifyIdentity: correct / wrong / empty-password player
{
  const ctx = makeContext();
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'sesame'), true);
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'wrong'), false);
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', ''), false);
  // player without password: any input accepted (no barrier configured)
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Bob', ''), true);
  // sheet value is trimmed before comparison
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Chloé', 'pad'), true);
  // unknown player rejected
  assert.throws(() => ctx.SettingsService.verifyIdentity('Nobody', 'x'), /introuvable/);
}

// apiVerifyIdentity wrapper returns { success, granted }
{
  const ctx = makeContext();
  const ok = ctx.apiVerifyIdentity('Alice', 'sesame');
  assert.deepStrictEqual({ ...ok }, { success: true, granted: true });
  const ko = ctx.apiVerifyIdentity('Alice', 'nope');
  assert.deepStrictEqual({ ...ko }, { success: true, granted: false });
}

// rename must preserve the password column
{
  const ctx = makeContext();
  ctx.SettingsService.renameEntity('Players', 2, 'Alice', 'Alicia', '', '');
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alicia', 'sesame'), true);
}

// Passwords stored in the sheet are preserved in plaintext as-is
{
  const ctx = makeContext();
  const players = ctx.ConfigService.getSheets().players;
  assert.strictEqual(players._grid[1][3], 'sesame', 'fixture starts with a plaintext password');

  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'sesame'), true);
  assert.strictEqual(players._grid[1][3], 'sesame', 'the cell must retain the plaintext password as-is');

  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'wrong'), false);
}

// requireAuthor verifies passwords server-side
{
  const ctx = makeContext();
  // Alice has a password:
  assert.strictEqual(ctx.requireAuthor('Alice', 'sesame'), 'Alice');
  assert.throws(() => ctx.requireAuthor('Alice', 'wrong'), /Mot de passe invalide/);
  assert.throws(() => ctx.requireAuthor('Alice', ''), /Mot de passe invalide/);
  // Bob has no password:
  assert.strictEqual(ctx.requireAuthor('Bob', ''), 'Bob');
  assert.strictEqual(ctx.requireAuthor('Bob', undefined), 'Bob');
  // Missing or unknown author:
  assert.throws(() => ctx.requireAuthor('', 'x'), /Identité requise/);
  assert.throws(() => ctx.requireAuthor('Ghost', 'x'), /Mot de passe invalide/);
}

// Mutating endpoints enforce authorization
{
  const ctx = makeContext();
  const resBad = ctx.apiSaveAppSettings('Title', '', 'Alice', 'wrong');
  assert.strictEqual(resBad.success, false);
  assert.match(resBad.error, /Mot de passe invalide/);

  const resOk = ctx.apiSaveAppSettings('Title', '', 'Alice', 'sesame');
  assert.strictEqual(resOk.success, true);
}

// Whitespace tolerance in verifyIdentity, getEntities, and SettingsService operations
{
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['  David  ', '', '#00ff00', '1234  '],
    ['Eve', '', '#0000ff', 5678] // numeric password
  ]);
  const categories = makeSheet([['Name', 'Description', 'Emoji icon', 'Hex color']]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description']]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  const settings = makeSheet([['Key', 'Value']]);
  injectSheets(gas, { players, categories, history, auditLog, settings });

  const list = gas.SettingsService.getEntities('Players');
  const david = list.find(p => p.name === 'David');
  assert.ok(david, 'David should be trimmed in getEntities');
  assert.strictEqual(david.name, 'David');

  assert.strictEqual(gas.SettingsService.verifyIdentity('David', '1234'), true);
  assert.strictEqual(gas.SettingsService.verifyIdentity('  David  ', ' 1234 '), true);
  assert.strictEqual(gas.SettingsService.verifyIdentity('Eve', '5678'), true);

  // setEntityColor, deleteEntity, renameEntity with whitespace in sheet
  gas.SettingsService.setEntityColor('Players', 2, 'David', '#112233');
  assert.strictEqual(players._grid[1][2], '#112233');

  gas.SettingsService.renameEntity('Players', 2, 'David', 'Dave', '', '');
  assert.strictEqual(gas.SettingsService.verifyIdentity('Dave', '1234'), true);

  gas.SettingsService.deleteEntity('Players', 2, 'Dave');
  assert.strictEqual(players._grid.length, 2); // Header + Eve
  // Numeric password 0
  const gasFrank = loadGas();
  const frankSheet = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Frank', '', '', 0]
  ]);
  injectSheets(gasFrank, { players: frankSheet, categories, history, auditLog, settings });
  const frankList = gasFrank.SettingsService.getEntities('Players');
  const frank = frankList.find(p => p.name === 'Frank');
  assert.ok(frank, 'Frank should exist');
  assert.strictEqual(frank.hasPassword, true, 'Numeric password 0 must be recognized as having a password');
  assert.strictEqual(gasFrank.SettingsService.verifyIdentity('Frank', '0'), true);
  assert.strictEqual(gasFrank.SettingsService.verifyIdentity('Frank', '1'), false);

  // Whitespace-only row in sheet should not break reorderEntities or addEntity
  const gasWs = loadGas();
  const wsPlayers = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Player1', '', '', '', 1],
    ['   ', '', '', '', ''],
    ['Player2', '', '', '', 2]
  ]);
  injectSheets(gasWs, { players: wsPlayers, categories, history, auditLog, settings });
  const wsEntities = gasWs.SettingsService.getEntities('Players');
  assert.strictEqual(wsEntities.length, 2, 'Whitespace row must be excluded from getEntities');
  // Reorder must succeed despite the whitespace row
  gasWs.SettingsService.reorderEntities('Players', [4, 2], ['Player2', 'Player1']);
  assert.strictEqual(wsPlayers._grid[3][4], 1); // Player2 is row 4
  assert.strictEqual(wsPlayers._grid[1][4], 2); // Player1 is row 2
  // addEntity nextOrdre must be 3 (not 4)
  gasWs.SettingsService.addEntity('Players', 'Player3', '', '');
  assert.strictEqual(wsPlayers._grid[4][4], 3);
}

// doGet instance ID injection
{
  const gas = loadGas();
  const out = gas.doGet();
  assert.ok(out._appended.includes('window.__APP_INSTANCE_ID__'));
}

console.log('identity.test.js OK');
