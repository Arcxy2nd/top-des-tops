'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

test('getEntities sorts Players by the Ordre column when every row has one', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
      ['Bob',   '', '', '', 2],
      ['Alice', '', '', '', 1],
      ['Carl',  '', '', '', 3]
    ])
  });
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Alice', 'Bob', 'Carl']);
});

test('getEntities falls back to raw sheet order when Ordre is missing on some rows', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
      ['Bob',   '', '', '', 2],
      ['Alice', '', '', '', ''] // no Ordre yet
    ])
  });
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Bob', 'Alice']); // unchanged, raw order
});

test('getEntities falls back to raw sheet order when the Ordre column is entirely absent', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name', 'Avatar URL', 'Hex color', 'Password'],
      ['Bob', '', '', ''],
      ['Alice', '', '', '']
    ])
  });
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Bob', 'Alice']);
});

test('addEntity assigns the next sequential Ordre value', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.addEntity('Players', 'Carl', '', '');
  const row = players._grid[3];
  assert.strictEqual(row[0], 'Carl');
  assert.strictEqual(row[4], 3);
});

test('reorderEntities persists a full permutation of names as sequential Ordre', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2],
    ['Carl',  '', '', '', 3]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.reorderEntities('Players', ['Carl', 'Alice', 'Bob']);
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Carl', 'Alice', 'Bob']);
});

test('reorderEntities rejects a list that is not an exact permutation of existing names', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  assert.throws(() => gas.SettingsService.reorderEntities('Players', ['Alice']));
  assert.throws(() => gas.SettingsService.reorderEntities('Players', ['Alice', 'Bob', 'Ghost']));
});

test('apiReorderEntities requires an author and logs to AuditLog', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, auditLog });
  gas.ConfigService.clearCache = () => {};

  const noAuthor = gas.apiReorderEntities('Players', ['Bob', 'Alice'], '');
  assert.strictEqual(noAuthor.success, false);

  const res = gas.apiReorderEntities('Players', ['Bob', 'Alice'], 'Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(auditLog._grid.length, 2); // header + 1 log row
});
