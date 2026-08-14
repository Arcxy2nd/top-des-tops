'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

/**
 * Row 1 of History/Players/Categories is NOT guaranteed to be a header: those three
 * sheets are created by hand in the spreadsheet (the app refuses to start without
 * them, it never creates them), and both production spreadsheets turned out to hold
 * a real record on row 1. Every reader used to skip row 1 unconditionally, so the
 * very first player/top/score was invisible everywhere — including to the duplicate
 * check in addEntity, which is how a second copy of an existing player could be
 * created. The reader must decide from the row's own content whether it is a header.
 */

// ── Players ──────────────────────────────────────────────────────────────────

test('getEntities reads the very first row of a Players sheet that has no header', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Ilker',   'https://i.imgur.com/a.jpeg', '#00ff91', 'Nur',  1],
      ['Antoine', 'https://i.imgur.com/b.jpeg', '#80eaff', 'Pied', 2]
    ])
  });
  const players = gas.SettingsService.getEntities('Players');
  assert.deepStrictEqual(players.map(p => p.name), ['Ilker', 'Antoine']);
  assert.strictEqual(players[0].rowIndex, 1, 'la ligne 1 doit être adressée comme ligne 1');
  assert.strictEqual(players[0].color, '#00ff91');
  assert.strictEqual(players[0].hasPassword, true);
});

test('getEntities still skips the header row when the Players sheet has one', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name',    'Avatar URL', 'Hex color', 'Password', 'Ordre'],
      ['Ilker',   '', '#00ff91', '', 1],
      ['Antoine', '', '#80eaff', '', 2]
    ])
  });
  const players = gas.SettingsService.getEntities('Players');
  assert.deepStrictEqual(players.map(p => p.name), ['Ilker', 'Antoine']);
  assert.strictEqual(players[0].rowIndex, 2);
});

test('addEntity refuses to duplicate the player sitting on row 1 of a headerless sheet', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '#00ff91', '', 1],
    ['Antoine', '', '#80eaff', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  assert.throws(() => gas.SettingsService.addEntity('Players', 'Ilker', '', ''), /existe déjà/);
  assert.strictEqual(players._grid.length, 2, 'aucune ligne en double ne doit être ajoutée');
});

test('addEntity numbers the next Ordre from every row of a headerless sheet', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '', '', 1],
    ['Antoine', '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.addEntity('Players', 'Nicolas', '', '');
  assert.strictEqual(players._grid[2][4], 3, "l'Ordre doit suivre les 2 joueurs déjà présents");
});

test('setEntityColor targets row 1 of a headerless sheet', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '#00ff91', '', 1],
    ['Antoine', '', '#80eaff', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.setEntityColor('Players', 1, 'Ilker', '#123456');
  assert.strictEqual(players._grid[0][2], '#123456');
  assert.strictEqual(players._grid[1][2], '#80eaff', "le 2e joueur ne doit pas bouger");
});

test('deleteEntity removes row 1 of a headerless sheet', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '', '', 1],
    ['Antoine', '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players, history: makeSheet([]) });
  gas.SettingsService.deleteEntity('Players', 1, 'Ilker');
  assert.deepStrictEqual(players._grid.map(r => r[0]), ['Antoine']);
});

test('reorderEntities accepts row 1 of a headerless sheet in the permutation', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '', '', 1],
    ['Antoine', '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.reorderEntities('Players', [2, 1], ['Antoine', 'Ilker']);
  assert.strictEqual(players._grid[1][4], 1, 'Antoine passe premier');
  assert.strictEqual(players._grid[0][4], 2, 'Ilker passe second');
});

test('verifyIdentity does not accept a header row as a player', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name',  'Avatar URL', 'Hex color', 'Password', 'Ordre'],
      ['Ilker', '', '', 'secret', 1]
    ])
  });
  assert.throws(() => gas.SettingsService.verifyIdentity('Name', ''), /introuvable/);
});

// ── Categories ───────────────────────────────────────────────────────────────

test('getEntities reads the very first row of a Categories sheet that has no header', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    categories: makeSheet([
      ['Mauvais', 'Celui qui prend mal ce qu\'on lui dit', '😠', '#ff4757', 1],
      ['Méchant', 'Celui qui est méchant',                 '😡', '#ffa502', 2]
    ])
  });
  const cats = gas.SettingsService.getEntities('Categories');
  assert.deepStrictEqual(cats.map(c => c.name), ['Mauvais', 'Méchant']);
  assert.strictEqual(cats[0].rowIndex, 1);
  assert.strictEqual(cats[0].icon, '😠');
});

// ── History ──────────────────────────────────────────────────────────────────

test('the first score of a headerless History sheet is counted', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    history: makeSheet([
      [new Date('2026-01-05T12:00:00Z'), 'Ilker',   'Mauvais', 5, '', '', ''],
      [new Date('2026-01-06T12:00:00Z'), 'Antoine', 'Mauvais', 3, '', '', '']
    ])
  });
  gas.ConfigService.getLogsCache = () => null;
  gas.ConfigService.setLogsCache = () => {};
  const logs = gas.StorageService._readLogsFromSheet();
  assert.strictEqual(logs.length, 2, 'les 2 scores doivent être lus');
  assert.strictEqual(logs[0].player, 'Ilker');
});

test('the header row of a History sheet is still skipped', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    history: makeSheet([
      ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'],
      [new Date('2026-01-05T12:00:00Z'), 'Ilker', 'Mauvais', 5, '', '', '']
    ])
  });
  gas.ConfigService.getLogsCache = () => null;
  gas.ConfigService.setLogsCache = () => {};
  const logs = gas.StorageService._readLogsFromSheet();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].player, 'Ilker');
});

// ── Bareme ───────────────────────────────────────────────────────────────────

test('getEntries reads the very first row of a headerless Bareme sheet', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    bareme: makeSheet([
      ['Mauvais', 'Râler', 2, 1],
      ['Mauvais', 'Bouder', 3, 2]
    ])
  });
  const entries = gas.BaremeService.getEntries();
  assert.deepStrictEqual(entries.map(e => e.action), ['Râler', 'Bouder']);
  assert.strictEqual(entries[0].rowIndex, 1);
});

// ── Phrases ──────────────────────────────────────────────────────────────────

test('getAll reads the very first row of a headerless Phrases sheet', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    phrases: makeSheet([
      ['Défaut', 'first',  '{player} domine', 1],
      ['Défaut', 'second', '{player} suit',   1]
    ])
  });
  const all = gas.PhrasesService.getAll();
  assert.deepStrictEqual(all.map(p => p.text), ['{player} domine', '{player} suit']);
  assert.strictEqual(all[0].rowIndex, 1);
});

// ── Notes ────────────────────────────────────────────────────────────────────

test('the first note of a headerless Notes sheet is returned', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    notes: makeSheet([
      [new Date('2026-01-05T12:00:00Z'), 'Ilker', 'Première note'],
      [new Date('2026-01-06T12:00:00Z'), 'Ilker', 'Deuxième note']
    ])
  });
  const res = gas.NotesService.getAllNotes();
  assert.strictEqual(res.notes.length, 2);
});

// ── Chat ─────────────────────────────────────────────────────────────────────

test('the first message of a headerless Chat sheet is returned', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    chat: makeSheet([
      ['id-1', new Date('2026-01-05T12:00:00Z'), 'Ilker',   'Salut', ''],
      ['id-2', new Date('2026-01-05T12:01:00Z'), 'Antoine', 'Yo',    '']
    ])
  });
  const res = gas.ChatService.getAllMessages();
  assert.strictEqual(res.messages.length, 2);
});

// ── Alt categories ───────────────────────────────────────────────────────────

test('the first alt category of a headerless AltCategories sheet is returned', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    altCategories: makeSheet([
      ['Bonus',  'Points bonus', '🎁', '#2ed573'],
      ['Malus',  'Points malus', '💀', '#ff4757']
    ])
  });
  const cats = gas.AltSettingsService.getAltCategories();
  assert.deepStrictEqual(cats.map(c => c.name), ['Bonus', 'Malus']);
});
