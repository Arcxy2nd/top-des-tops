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

test('getEntities reads the very first row of a Players sheet that has no header and inserts headers', () => {
  const gas = loadGas();
  const playersSheet = makeSheet([
    ['Ilker',   'https://i.imgur.com/a.jpeg', '#00ff91', 'Nur',  1],
    ['Antoine', 'https://i.imgur.com/b.jpeg', '#80eaff', 'Pied', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players: playersSheet });
  const players = gas.SettingsService.getEntities('Players');
  assert.deepStrictEqual(players.map(p => p.name), ['Ilker', 'Antoine']);
  assert.strictEqual(players[0].rowIndex, 2, 'la donnée est décalée en ligne 2 après insertion de l\'en-tête');
  assert.strictEqual(players[0].color, '#00ff91');
  assert.strictEqual(players[0].hasPassword, true);
  assert.deepStrictEqual(playersSheet._grid[0], ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'], 'la ligne 1 a reçu les titres canoniques');
  assert.strictEqual(playersSheet._grid.length, 3, 'le tableau contient l\'en-tête + les 2 joueurs');
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
  assert.strictEqual(players._grid.length, 3, 'en-tête inséré + 2 joueurs existants conservés sans doublon');
});

test('addEntity numbers the next Ordre from every row of a headerless sheet', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '', '', 1],
    ['Antoine', '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.addEntity('Players', 'Nicolas', '', '');
  assert.strictEqual(players._grid[3][4], 3, "l'Ordre doit suivre les 2 joueurs déjà présents");
});

test('setEntityColor targets row after header insertion of a headerless sheet', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '#00ff91', '', 1],
    ['Antoine', '', '#80eaff', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.setEntityColor('Players', 2, 'Ilker', '#123456');
  assert.strictEqual(players._grid[1][2], '#123456');
  assert.strictEqual(players._grid[2][2], '#80eaff', "le 2e joueur ne doit pas bouger");
});

test('deleteEntity removes row after header insertion of a headerless sheet', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '', '', 1],
    ['Antoine', '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players, history: makeSheet([]) });
  gas.SettingsService.deleteEntity('Players', 2, 'Ilker');
  assert.deepStrictEqual(players._grid.slice(1).map(r => r[0]), ['Antoine']);
});

test('reorderEntities accepts row after header insertion in the permutation', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Ilker',   '', '', '', 1],
    ['Antoine', '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });
  gas.SettingsService.reorderEntities('Players', [3, 2], ['Antoine', 'Ilker']);
  assert.strictEqual(players._grid[2][4], 1, 'Antoine passe premier');
  assert.strictEqual(players._grid[1][4], 2, 'Ilker passe second');
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

test('getEntities reads the very first row of a Categories sheet that has no header and inserts headers', () => {
  const gas = loadGas();
  const catSheet = makeSheet([
    ['Mauvais', 'Celui qui prend mal ce qu\'on lui dit', '😠', '#ff4757', 1],
    ['Méchant', 'Celui qui est méchant',                 '😡', '#ffa502', 2]
  ]);
  gas.ConfigService.getSheets = () => ({
    categories: catSheet
  });
  const cats = gas.SettingsService.getEntities('Categories');
  assert.deepStrictEqual(cats.map(c => c.name), ['Mauvais', 'Méchant']);
  assert.strictEqual(cats[0].rowIndex, 2);
  assert.strictEqual(cats[0].icon, '😠');
  assert.deepStrictEqual(catSheet._grid[0], ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre']);
});

// ── History ──────────────────────────────────────────────────────────────────

test('the first score of a headerless History sheet is counted and headers inserted', () => {
  const gas = loadGas();
  const histSheet = makeSheet([
    [new Date('2026-01-05T12:00:00Z'), 'Ilker',   'Mauvais', 5, '', '', ''],
    [new Date('2026-01-06T12:00:00Z'), 'Antoine', 'Mauvais', 3, '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({
    history: histSheet
  });
  gas.ConfigService.getLogsCache = () => null;
  gas.ConfigService.setLogsCache = () => {};
  const logs = gas.StorageService._readLogsFromSheet();
  assert.strictEqual(logs.length, 2, 'les 2 scores doivent être lus');
  assert.strictEqual(logs[0].player, 'Ilker');
  assert.deepStrictEqual(histSheet._grid[0], ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']);
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

test('getEntries reads the very first row of a headerless Bareme sheet and inserts headers', () => {
  const gas = loadGas();
  const baremeSheet = makeSheet([
    ['Mauvais', 'Râler', 2],
    ['Mauvais', 'Bouder', 3]
  ]);
  gas.ConfigService.getSheets = () => ({
    bareme: baremeSheet
  });
  const entries = gas.BaremeService.getEntries();
  assert.deepStrictEqual(Array.from(entries.map(e => e.action)), ['Râler', 'Bouder']);
  assert.strictEqual(entries[0].rowIndex, 2);
  assert.deepStrictEqual(baremeSheet._grid[0], ['Top', 'Action', 'Points']);
});

// ── Phrases ──────────────────────────────────────────────────────────────────

test('getAll reads the very first row of a headerless Phrases sheet and inserts headers', () => {
  const gas = loadGas();
  const phrasesSheet = makeSheet([
    ['Défaut', 'first',  '{player} domine', 1],
    ['Défaut', 'second', '{player} suit',   1]
  ]);
  gas.ConfigService.getSheets = () => ({
    phrases: phrasesSheet
  });
  const all = gas.PhrasesService.getAll();
  assert.deepStrictEqual(all.map(p => p.text), ['{player} domine', '{player} suit']);
  assert.strictEqual(all[0].rowIndex, 2);
  assert.deepStrictEqual(phrasesSheet._grid[0], ['Preset', 'Pool', 'Phrase', 'Ordre']);
});

// ── Notes ────────────────────────────────────────────────────────────────────

test('the first note of a headerless Notes sheet is returned and headers inserted', () => {
  const gas = loadGas();
  const notesSheet = makeSheet([
    [new Date('2026-01-05T12:00:00Z'), 'Ilker', 'Première note'],
    [new Date('2026-01-06T12:00:00Z'), 'Ilker', 'Deuxième note']
  ]);
  gas.ConfigService.getSheets = () => ({
    notes: notesSheet
  });
  const res = gas.NotesService.getAllNotes();
  assert.strictEqual(res.notes.length, 2);
  assert.deepStrictEqual(notesSheet._grid[0], ['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe']);
});

// ── Chat ─────────────────────────────────────────────────────────────────────

test('the first message of a headerless Chat sheet is returned and headers inserted', () => {
  const gas = loadGas();
  const chatSheet = makeSheet([
    ['id-1', new Date('2026-01-05T12:00:00Z'), 'Ilker',   'Salut', ''],
    ['id-2', new Date('2026-01-05T12:01:00Z'), 'Antoine', 'Yo',    '']
  ]);
  gas.ConfigService.getSheets = () => ({
    chat: chatSheet
  });
  const res = gas.ChatService.getAllMessages();
  assert.strictEqual(res.messages.length, 2);
  assert.deepStrictEqual(chatSheet._grid[0], ['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ']);
});

// ── Alt categories ───────────────────────────────────────────────────────────

test('the first alt category of a headerless AltCategories sheet is returned and headers inserted', () => {
  const gas = loadGas();
  const altSheet = makeSheet([
    ['Bonus',  'Points bonus', '🎁', '#2ed573'],
    ['Malus',  'Points malus', '💀', '#ff4757']
  ]);
  gas.ConfigService.getSheets = () => ({
    altCategories: altSheet
  });
  const cats = gas.AltSettingsService.getAltCategories();
  assert.deepStrictEqual(cats.map(c => c.name), ['Bonus', 'Malus']);
  assert.deepStrictEqual(altSheet._grid[0], ['Name', 'Description', 'Emoji', 'Hex color']);
});

