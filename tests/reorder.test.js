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

test('reorderEntities persists a full permutation by rowIndex as sequential Ordre', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2],
    ['Carl',  '', '', '', 3]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  // rows: Alice=2, Bob=3, Carl=4 -> desired order Carl, Alice, Bob
  gas.SettingsService.reorderEntities('Players', [4, 2, 3], ['Carl', 'Alice', 'Bob']);
  const names = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(names, ['Carl', 'Alice', 'Bob']);
});

test('reorderEntities rejects a rowIndex list that is not an exact permutation of existing rows', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  assert.throws(() => gas.SettingsService.reorderEntities('Players', [2], ['Alice']));
  assert.throws(() => gas.SettingsService.reorderEntities('Players', [2, 3, 4], ['Alice', 'Bob', 'Ghost']));
});

test('reorderEntities never faults on duplicate names — it is keyed by rowIndex, not name', () => {
  // The real bug this class of fix targets: two Players sharing a name used to make
  // the name-based permutation check (Set of names) fail deterministically, on every
  // single reorder attempt, regardless of which rows were actually being moved.
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Ilker',   '', '', '', 1],
    ['Antoine', '', '', '', 2],
    ['Ilker',   '', '', '', 3]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  // rows: Ilker#1=2, Antoine=3, Ilker#2=4 -> move Antoine to the front
  gas.SettingsService.reorderEntities('Players', [3, 2, 4], ['Antoine', 'Ilker', 'Ilker']);
  const rows = gas.SettingsService.getEntities('Players').map(p => p.name);
  assert.deepStrictEqual(rows, ['Antoine', 'Ilker', 'Ilker']);
});

test('reorderEntities rejects a rowIndex whose current name no longer matches expectedNames (stale client)', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice',   '', '', '', 1],
    ['Bob',     '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  // Row 2 is actually "Alice", but the stale client still thinks it's "Renamed".
  assert.throws(() => gas.SettingsService.reorderEntities('Players', [2, 3], ['Renamed', 'Bob']));
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

  const noAuthor = gas.apiReorderEntities('Players', [3, 2], ['Bob', 'Alice'], '');
  assert.strictEqual(noAuthor.success, false);

  const res = gas.apiReorderEntities('Players', [3, 2], ['Bob', 'Alice'], 'Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(auditLog._grid.length, 2); // header + 1 log row
});

test('apiReorderEntities returns the fresh players/categories lists in the new order', () => {
  // Without this, the client has no choice but to re-fetch via loadEntities(),
  // which paints from its stale localStorage snapshot before the real fetch
  // lands — a visible "moves, then reverts, then corrects itself" flicker.
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  const categories = makeSheet([
    ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'],
    ['Jeux',  '', '', '', 1],
    ['Défis', '', '', '', 2]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiReorderEntities('Players', [3, 2], ['Bob', 'Alice'], 'Alice');
  assert.deepStrictEqual(res.players.map(p => p.name), ['Bob', 'Alice']);
  assert.deepStrictEqual(res.categories.map(c => c.name), ['Jeux', 'Défis']);
});

test('BaremeService.getEntries sorts strictly by ascending points per Top group and keeps rowIndex pointing at the real sheet row', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points'],
    ['Jeux', 'Gagne',  5],
    ['Jeux', 'Perd',  -2],
    ['Jeux', 'Égalité', 0]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  const entries = gas.BaremeService.getEntries();
  assert.deepStrictEqual(Array.from(entries.map(e => e.action)), ['Perd', 'Égalité', 'Gagne']);
  assert.deepStrictEqual(Array.from(entries.map(e => e.pts)), [-2, 0, 5]);
  assert.strictEqual(entries[0].rowIndex, 3); // "Perd" is physically on sheet row 3
  assert.strictEqual(entries[1].rowIndex, 4); // "Égalité" is physically on sheet row 4
  assert.strictEqual(entries[2].rowIndex, 2); // "Gagne" is physically on sheet row 2
});

test('BaremeService.getEntries sorts by ascending points independently within each Top group', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points'],
    ['Jeux',  'Gagne', 5],
    ['Jeux',  'Perd', -2],
    ['Défis', 'Grand défi', 10],
    ['Défis', 'Petit défi', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  const entries = gas.BaremeService.getEntries();
  const jeux = entries.filter(e => e.top === 'Jeux');
  const defis = entries.filter(e => e.top === 'Défis');
  assert.deepStrictEqual(Array.from(jeux.map(e => e.action)), ['Perd', 'Gagne']);
  assert.deepStrictEqual(Array.from(defis.map(e => e.action)), ['Petit défi', 'Grand défi']);
});

test('BaremeService.addEntry appends [top, action, pts] without Ordre column', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points'],
    ['Jeux',  'Gagne', 5]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });
  gas.BaremeService.addEntry('Jeux', 'Perd', -2);
  const row = bareme._grid[2];
  assert.strictEqual(row[0], 'Jeux');
  assert.strictEqual(row[1], 'Perd');
  assert.strictEqual(row[2], -2);
  assert.strictEqual(row.length, 3);
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

test('apiRepairOrder normalizes Phrases per preset+pool group', () => {
  const gas = loadGas();
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'], ['Alice', '', '', '', 1]]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color', 'Ordre']]);
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'Z', ''],
    ['Défaut', 'first', 'Y', '']
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, phrases, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiRepairOrder('Alice');
  assert.strictEqual(res.phrases, 2);
  assert.deepStrictEqual(phrases._grid.slice(1).map(r => [r[2], r[3]]), [['Z', 1], ['Y', 2]]);
});

// Perf (audit cache 2026-08-26) : apiRepairOrder écrivait l'Ordre de chaque
// ligne via un setValue() séparé (une requête Sheets par ligne). Doit
// maintenant écrire chaque colonne concernée en un seul setValues() groupé.
test('apiRepairOrder writes each Ordre column in a single batched call, not one per row', () => {
  const gas = loadGas();
  // Ordre values are deliberately scrambled (not already 1..N in rank order) so
  // the repair actually rewrites something — physical row order never changes,
  // only the Ordre column values do, ranked by (ordre, original index).
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['C', '', '', '', 9], ['A', '', '', '', 9], ['B', '', '', '', 1]
  ]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color', 'Ordre']]);
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'Z', 9], ['Défaut', 'first', 'Y', 1]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, phrases, auditLog });
  gas.ConfigService.clearCache = () => {};

  let setValueCalls = 0;
  [players, categories, phrases].forEach(sheet => {
    const realGetRange = sheet.getRange.bind(sheet);
    sheet.getRange = (...a) => {
      const range = realGetRange(...a);
      const realSetValue = range.setValue.bind(range);
      range.setValue = (...args) => { setValueCalls++; return realSetValue(...args); };
      return range;
    };
  });

  const res = gas.apiRepairOrder('C');
  assert.strictEqual(res.success, true, JSON.stringify(res));
  assert.strictEqual(setValueCalls, 0, 'Ordre columns must be written via setValues (batched), not per-row setValue calls: ' + setValueCalls + ' setValue() calls observed');
  // Physical row order never changes (still C, A, B) — only the Ordre values do.
  // Sorted by (ordre, original index): B(1) < C(9, idx0) < A(9, idx1) -> B=1, C=2, A=3.
  assert.deepStrictEqual(players._grid.slice(1).map(r => [r[0], r[4]]), [['C', 2], ['A', 3], ['B', 1]]);
  // Sorted: Y(1) < Z(9) -> Y=1, Z=2.
  assert.deepStrictEqual(phrases._grid.slice(1).map(r => [r[2], r[3]]), [['Z', 2], ['Y', 1]]);
});

test('apiRepairOrder preserves an already-valid custom order for Players when it differs from raw row order', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 2],
    ['Bob',   '', '', '', 1]
  ]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color', 'Ordre']]);
  const phrases = makeSheet([['Preset', 'Pool', 'Phrase', 'Ordre']]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories, phrases, auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiRepairOrder('Alice');
  assert.strictEqual(res.success, true);
  const entities = gas.SettingsService.getEntities('Players');
  assert.deepStrictEqual(entities.map(e => e.name), ['Bob', 'Alice']);
});
