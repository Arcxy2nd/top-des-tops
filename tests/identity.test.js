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
  injectSheets(gas, { players, categories, history });
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
  ctx.SettingsService.renameEntity('Players', 'Alice', 'Alicia', '', '');
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alicia', 'sesame'), true);
}

console.log('identity.test.js OK');
