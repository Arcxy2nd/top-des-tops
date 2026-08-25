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

// Passwords are hashed at rest, and migrated transparently from legacy plaintext
{
  const ctx = makeContext();
  const players = ctx.ConfigService.getSheets().players;
  assert.strictEqual(players._grid[1][3], 'sesame', 'fixture starts with a legacy plaintext password');

  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'sesame'), true);

  assert.notStrictEqual(players._grid[1][3], 'sesame',
    'the cell must no longer hold the plaintext password after a successful check');
  assert.match(players._grid[1][3], /^[0-9a-f]{64}$/i, 'migrated value must be a SHA-256 hex digest');

  // The migrated hash keeps working on every later check, including a bad one.
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'sesame'), true);
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

console.log('identity.test.js OK');
