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

test('BaremeService.getEntries sorts by Ordre and keeps rowIndex pointing at the real sheet row', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux', 'Gagne',  5, 2],
    ['Jeux', 'Perd',  -2, 1]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  const entries = gas.BaremeService.getEntries();
  assert.deepStrictEqual(entries.map(e => e.action), ['Perd', 'Gagne']);
  assert.strictEqual(entries[0].rowIndex, 3); // "Perd" is physically on sheet row 3
  assert.strictEqual(entries[1].rowIndex, 2); // "Gagne" is physically on sheet row 2
});

test('BaremeService.getEntries preserves one group\'s valid custom order even when a different, unrelated group has an invalid/missing Ordre', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Mauvais', 'A', 1, 3],
    ['Mauvais', 'B', 2, 1],
    ['Mauvais', 'C', 3, 2],
    ['Légende', 'X', 9, '']   // unrelated group, Ordre missing entirely
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  const entries = gas.BaremeService.getEntries();
  assert.deepStrictEqual(entries.filter(e => e.top === 'Mauvais').map(e => e.action), ['B', 'C', 'A']);
});

test('BaremeService.addEntry assigns Ordre scoped to its own Top group', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux',  'Gagne', 5, 1],
    ['Défis', 'Réussi', 3, 1]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  gas.BaremeService.addEntry('Jeux', 'Perd', -2);
  const row = bareme._grid[3];
  assert.strictEqual(row[0], 'Jeux');
  assert.strictEqual(row[1], 'Perd');
  assert.strictEqual(row[2], -2);
  assert.strictEqual(row[3], 2); // 2nd entry within "Jeux", not 3rd overall
});

test('BaremeService.reorderEntries only touches rows within the given Top group', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux',  'A', 1, 1],
    ['Jeux',  'B', 2, 2],
    ['Défis', 'C', 3, 1]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  gas.BaremeService.reorderEntries('Jeux', [3, 2]); // rowIndex 3 = "B", rowIndex 2 = "A" -> new order B, A
  const entries = gas.BaremeService.getEntries();
  assert.deepStrictEqual(entries.filter(e => e.top === 'Jeux').map(e => e.action), ['B', 'A']);
  assert.strictEqual(entries.find(e => e.top === 'Défis').action, 'C'); // untouched
});

test('apiReorderBareme rejects a rowIndex list that does not match the Top group', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux', 'A', 1, 1],
    ['Jeux', 'B', 2, 2]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ bareme, auditLog });
  gas.ConfigService.clearCache = () => {};
  const res = gas.apiReorderBareme('Jeux', [2], 'Alice'); // missing row 3
  assert.strictEqual(res.success, false);
});

test('PhrasesService.getAll sorts by Ordre within preset+pool and keeps rowIndex accurate', () => {
  const gas = loadGas();
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'B', 2],
    ['Défaut', 'first', 'A', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ phrases });
  const all = gas.PhrasesService.getAll();
  assert.deepStrictEqual(all.map(p => p.text), ['A', 'B']);
  assert.strictEqual(all[0].rowIndex, 3); // "A" is physically on sheet row 3
});

test('PhrasesService.getAll preserves one group\'s valid custom order even when a different, unrelated group has an invalid/missing Ordre', () => {
  const gas = loadGas();
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'A', 2],
    ['Défaut', 'first', 'B', 1],
    ['Défaut', 'last',  'X', '']   // unrelated group, Ordre missing entirely
  ]);
  gas.ConfigService.getSheets = () => ({ phrases });
  const all = gas.PhrasesService.getAll();
  assert.deepStrictEqual(all.filter(p => p.pool === 'first').map(p => p.text), ['B', 'A']);
});

test('PhrasesService.addPhrase assigns Ordre scoped to its preset+pool group', () => {
  const gas = loadGas();
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'A', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ phrases });
  gas.PhrasesService.addPhrase('Défaut', 'first', 'B');
  const row = phrases._grid[2];
  assert.strictEqual(row[0], 'Défaut');
  assert.strictEqual(row[1], 'first');
  assert.strictEqual(row[2], 'B');
  assert.strictEqual(row[3], 2);
});

test('PhrasesService.saveBatch assigns sequential Ordre per group across a multi-group batch', () => {
  const gas = loadGas();
  const phrases = makeSheet([['Preset', 'Pool', 'Phrase', 'Ordre']]);
  gas.ConfigService.getSheets = () => ({ phrases });
  gas.PhrasesService.saveBatch([
    { preset: 'Défaut', pool: 'first', text: 'A' },
    { preset: 'Défaut', pool: 'first', text: 'B' },
    { preset: 'Défaut', pool: 'last',  text: 'C' }
  ]);
  const rows = phrases._grid.slice(1);
  assert.deepStrictEqual(rows.map(r => [r[0], r[1], r[2], r[3]]), [
    ['Défaut', 'first', 'A', 1],
    ['Défaut', 'first', 'B', 2],
    ['Défaut', 'last',  'C', 1]
  ]);
});

test('PhrasesService.reorderPhrases only touches rows within the given preset+pool group', () => {
  const gas = loadGas();
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'A', 1],
    ['Défaut', 'first', 'B', 2],
    ['Défaut', 'last',  'C', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ phrases });
  gas.PhrasesService.reorderPhrases('Défaut', 'first', [3, 2]);
  const all = gas.PhrasesService.getAll();
  assert.deepStrictEqual(all.filter(p => p.pool === 'first').map(p => p.text), ['B', 'A']);
  assert.strictEqual(all.find(p => p.pool === 'last').text, 'C');
});

test('apiRepairOrder normalizes Players/Categories to sequential Ordre in current effective order', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Bob',   '', '', '', 2],
    ['Alice', '', '', '', 1],
    ['Carl',  '', '', '', ''] // hole -> whole list currently falls back to raw order
  ]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color']]); // no Ordre column at all
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiRepairOrder('Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.players, 3);
  // Effective order before repair (raw, since Carl had no Ordre) was Bob, Alice, Carl —
  // repair must persist exactly that order as clean 1..3, not re-sort by the old partial values.
  assert.deepStrictEqual(players._grid.slice(1).map(r => [r[0], r[4]]), [['Bob', 1], ['Alice', 2], ['Carl', 3]]);
});

test('apiRepairOrder normalizes Bareme per Top group and Phrases per preset+pool group', () => {
  const gas = loadGas();
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre']]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color', 'Ordre']]);
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux', 'A', 1, ''],
    ['Défis', 'X', 5, 1],
    ['Jeux', 'B', 2, '']
  ]);
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'Z', ''],
    ['Défaut', 'first', 'Y', '']
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, bareme, phrases, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiRepairOrder('Alice');
  assert.strictEqual(res.bareme, 3);
  assert.strictEqual(res.phrases, 2);
  assert.deepStrictEqual(bareme._grid.slice(1).map(r => [r[0], r[1], r[3]]), [
    ['Jeux', 'A', 1], ['Défis', 'X', 1], ['Jeux', 'B', 2]
  ]);
  assert.deepStrictEqual(phrases._grid.slice(1).map(r => [r[2], r[3]]), [['Z', 1], ['Y', 2]]);
});

test('apiRepairOrder preserves an already-valid custom order when it differs from raw row order', () => {
  const gas = loadGas();
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre']]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color', 'Ordre']]);
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux', 'A', 1, 2],      // row 2: Ordre=2 (should be 2nd in display order)
    ['Jeux', 'B', 2, 1]       // row 3: Ordre=1 (should be 1st in display order)
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, bareme, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiRepairOrder('Alice');
  assert.strictEqual(res.success, true);

  // Effective order before repair (sorted by valid Ordre) is B (Ordre=1), then A (Ordre=2)
  // apiRepairOrder should preserve this order, not reset to raw row order (A in row 2, B in row 3)
  const entries = gas.BaremeService.getEntries().filter(e => e.top === 'Jeux');
  assert.deepStrictEqual(entries.map(e => e.action), ['B', 'A']);
});
