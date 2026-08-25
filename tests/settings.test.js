'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

// Régression : SettingsService.getEntities() lisait sheet.getDataRange().getValues()
// sans exclure la ligne d'en-tête ("Name | Avatar URL | Hex color | Password" pour
// Players, "Name | Description | Emoji | Hex color" pour Categories) — un faux joueur
// et une fausse catégorie nommés "Name" apparaissaient donc systématiquement en tête
// de chaque liste, partout où getEntities() est consommé (Dashboard, Historique,
// Paramètres, tchat...).
test('getEntities excludes the header row of the Players sheet', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([
      ['Name', 'Avatar URL', 'Hex color', 'Password'],
      ['Alice', 'https://x/a.png', '#ff0000', '']
    ])
  });

  const players = gas.SettingsService.getEntities('Players');
  assert.strictEqual(players.length, 1);
  assert.strictEqual(players[0].name, 'Alice');
  assert.ok(!players.some(p => p.name === 'Name'), 'la ligne d\'en-tête ne doit jamais devenir un joueur');
});

test('getEntities excludes the header row of the Categories sheet', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    categories: makeSheet([
      ['Name', 'Description', 'Emoji', 'Hex color'],
      ['Jeux', 'Défis en jeu', '🎮', '#00ff00']
    ])
  });

  const categories = gas.SettingsService.getEntities('Categories');
  assert.strictEqual(categories.length, 1);
  assert.strictEqual(categories[0].name, 'Jeux');
  assert.ok(!categories.some(c => c.name === 'Name'), 'la ligne d\'en-tête ne doit jamais devenir une catégorie');
});

test('getEntities returns an empty list when the sheet only has a header row', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    players: makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password']])
  });

  assert.deepStrictEqual(gas.SettingsService.getEntities('Players'), []);
});

/** Stateful mock: insertSheet() creates the sheet and getSheets() picks it up on the next call,
 *  mirroring how ConfigService.clearCache() + a real re-fetch behaves in production. */
function withSettingsSheets(gas, initial) {
  let settingsSheet = initial || null;
  const auditSheet = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail']]);
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ['Alice', '', '', '']]);
  gas.ConfigService.getSheets = () => ({
    spreadsheet: {
      insertSheet: () => { settingsSheet = makeSheet([]); return settingsSheet; },
      getSheetByName: () => null
    },
    settings: settingsSheet,
    auditLog: auditSheet,
    players: players
  });
  gas.ConfigService.clearCache = () => {};
}

test('SettingsSheetService.getAll returns {} when the Settings sheet does not exist', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  assert.deepStrictEqual({ ...gas.SettingsSheetService.getAll() }, {});
});

test('SettingsSheetService.setValue auto-creates the sheet with header + default keys, then writes the value', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  gas.SettingsSheetService.setValue('app_title', 'Les Champions');
  const all = gas.SettingsSheetService.getAll();
  assert.strictEqual(all.app_title, 'Les Champions');
  assert.strictEqual(all.logo_url, '');
});

test('SettingsSheetService.setValue updates an existing key without duplicating rows', () => {
  const gas = loadGas();
  const existing = makeSheet([['Key', 'Value'], ['app_title', 'Old'], ['logo_url', '']]);
  withSettingsSheets(gas, existing);
  gas.SettingsSheetService.setValue('app_title', 'New');
  assert.strictEqual(existing._grid.length, 3);
  assert.strictEqual(existing._grid[1][1], 'New');
});

test('apiGetAppSettings falls back to defaults when nothing is configured', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  const res = gas.apiGetAppSettings();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.appTitle, 'Tops des Tops');
  assert.strictEqual(res.logoUrl, '');
});

test('apiSaveAppSettings persists title and logo, then apiGetAppSettings reflects them', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  const saveRes = gas.apiSaveAppSettings('Les Champions', 'https://example.com/logo.png', 'Alice');
  assert.strictEqual(saveRes.success, true);
  const res = gas.apiGetAppSettings();
  assert.strictEqual(res.appTitle, 'Les Champions');
  assert.strictEqual(res.logoUrl, 'https://example.com/logo.png');
});

test('apiSaveTooltipStyle persists tooltip preferences to Settings sheet', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  const prefs = { colors: { cold: '#123456', normal: '#234567', warm: '#345678', hot: '#456789', blaze: '#567890' }, gauge: true, effects: false };
  const saveRes = gas.apiSaveTooltipStyle(JSON.stringify(prefs), 'Alice');
  assert.strictEqual(saveRes.success, true);
  const res = gas.apiGetAppSettings();
  assert.deepEqual(res.tooltipStyle, prefs);
});

// Régression : addEntity() n'avait aucune vérification d'unicité de nom — un
// double-clic sur "+ Ajouter" (ou deux appels concurrents) pouvait créer deux
// entités identiques, et deleteEntity() les aurait ensuite supprimées toutes
// les deux d'un coup sur ce qui ressemblait à une suppression unitaire.
test('SettingsService.addEntity rejects a name that already exists', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ players });

  assert.throws(() => gas.SettingsService.addEntity('Players', 'Alice', '', ''), /existe déjà/);
  assert.strictEqual(gas.SettingsService.getEntities('Players').length, 1, 'aucune ligne en double ne doit avoir été ajoutée');
});

// Régression réelle (2026-08-12) : un Joueur dupliqué (deux lignes portant
// le même nom, arrivées là par une saisie antérieure) apparaissait deux fois
// dans Paramètres. Supprimer UNE des deux entrées à l'écran supprimait les
// DEUX lignes de la feuille — deleteEntity(type, name) ciblait "toute ligne
// portant ce nom" au lieu de la ligne précise cliquée. Le joueur restant
// disparaissait du site tout en étant toujours visible dans le Google Sheet
// (l'autre ligne du duo, elle, avait bien été supprimée). deleteEntity prend
// maintenant un rowIndex précis (comme getEntities() en fournit un à chaque
// entité) et vérifie que le nom sur cette ligne correspond avant d'agir.
test('SettingsService.deleteEntity removes only the targeted row when two players share a name, leaving the other duplicate and all unrelated players intact', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', 'https://x/alice1.png', '#111111', '', 1], // row 2 — first duplicate
    ['Bob',   'https://x/bob.png',    '#222222', '', 2], // row 3 — unrelated, must survive
    ['Alice', 'https://x/alice2.png', '#333333', '', 3]  // row 4 — second duplicate
  ]);
  gas.ConfigService.getSheets = () => ({ players });

  const before = gas.SettingsService.getEntities('Players');
  assert.strictEqual(before.length, 3, 'sanity: both Alice rows and Bob are visible before the delete');

  // Delete row 2 specifically (the FIRST "Alice") — not "Alice" by name.
  gas.SettingsService.deleteEntity('Players', 2, 'Alice');

  const after = gas.SettingsService.getEntities('Players');
  assert.strictEqual(after.length, 2, 'exactly one row must have been removed, not both Alices');
  const bob = after.find(p => p.name === 'Bob');
  assert.ok(bob, 'Bob must still be present');
  assert.strictEqual(bob.color, '#222222', 'Bob must be untouched by the delete');
  const remainingAlice = after.find(p => p.name === 'Alice');
  assert.ok(remainingAlice, 'the second Alice (row 4) must survive');
  assert.strictEqual(remainingAlice.color, '#333333', 'the surviving Alice must be the second row, untouched');
});

// Same real incident, but through the public API path (apiManageEntity),
// which is what the UI actually calls.
test('apiManageEntity DELETE with a rowIndex removes only that physical row among duplicate names', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '#111111', '', 1],
    ['Bob',   '', '#222222', '', 2],
    ['Alice', '', '#333333', '', 3]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories: makeSheet([]), history: makeSheet([]), auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiManageEntity('DELETE', 'Players', null, null, 'Alice', null, 'Bob', 4); // target row 4, the second Alice
  assert.strictEqual(res.success, true);

  const remaining = gas.SettingsService.getEntities('Players');
  assert.strictEqual(remaining.length, 2);
  assert.strictEqual(remaining.filter(p => p.name === 'Alice').length, 1, 'one Alice must remain');
  assert.strictEqual(remaining.find(p => p.name === 'Alice').color, '#111111', 'the surviving Alice must be row 2, not row 4');
  assert.ok(remaining.find(p => p.name === 'Bob'), 'Bob must be untouched');
});

test('apiManageEntity DELETE without a rowIndex is rejected instead of guessing which row to remove', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, categories: makeSheet([]), history: makeSheet([]), auditLog });
  gas.ConfigService.clearCache = () => {};

  const res = gas.apiManageEntity('DELETE', 'Players', null, null, 'Alice', null, 'Bob');
  assert.strictEqual(res.success, false);
  assert.strictEqual(gas.SettingsService.getEntities('Players').length, 1, 'nothing must be deleted when rowIndex is missing');
});

// Defense in depth: if the row moved between page load and click (someone
// else edited the sheet meanwhile), refuse rather than silently deleting
// whatever now sits at that row number.
test('SettingsService.deleteEntity refuses a rowIndex whose current content no longer matches the expected name', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', '', 1],
    ['Bob',   '', '', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });

  assert.throws(() => gas.SettingsService.deleteEntity('Players', 2, 'Someone Else'), /changé entre-temps/);
  assert.strictEqual(gas.SettingsService.getEntities('Players').length, 2, 'nothing must be deleted on a stale rowIndex');
});

test('SettingsService.setEntityColor only touches the targeted row when two players share a name', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Ilker', '', '#00ff91', '', 1],
    ['Ilker', '', '#3742fa', '', 2]
  ]);
  gas.ConfigService.getSheets = () => ({ players });

  gas.SettingsService.setEntityColor('Players', 3, 'Ilker', '#123456');

  assert.strictEqual(players._grid[1][2], '#00ff91', 'row 2 (the first Ilker) must be untouched');
  assert.strictEqual(players._grid[2][2], '#123456', 'row 3 is the one that was targeted');
});

test('SettingsService.setEntityColor refuses a rowIndex whose current content no longer matches the expected name', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '#111111', '', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ players });

  assert.throws(() => gas.SettingsService.setEntityColor('Players', 2, 'Someone Else', '#ffffff'), /changé entre-temps/);
  assert.strictEqual(players._grid[1][2], '#111111');
});

test('SettingsService.renameEntity refuses to rename a row whose name is shared by another row', () => {
  // rowIndex targeting alone is NOT enough here: renaming propagates in cascade to
  // History/Notes/Chat/Bareme/Phrases by matching the OLD NAME AS TEXT
  // (_renameInColumn), not by row. With two "Alice" rows, renaming row 3 to "Alicia"
  // would relabel row 2's History/Notes/Chat entries to "Alicia" too — merging two
  // different people's history under a single new name, silently and irreversibly.
  // Refuse instead of attempting an automatic (and inherently lossy) merge.
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '#111111', '', 1],
    ['Alice', '', '#333333', '', 2]
  ]);
  const history = makeSheet([
    ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'],
    ['2026-08-01', 'Alice', 'Jeux', 5, '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ players, history, notes: null, autoRules: null, chat: null });

  assert.throws(() => gas.SettingsService.renameEntity('Players', 3, 'Alice', 'Alicia', '', ''), /partagent le nom/);

  const all = gas.SettingsService.getEntities('Players');
  assert.strictEqual(all.filter(p => p.name === 'Alice').length, 2, 'neither row was touched');
  assert.strictEqual(history._grid[1][1], 'Alice', 'History stays attributed to Alice, no silent merge under Alicia');
});

test('SettingsService.renameEntity rejects a new name that collides with another entity', () => {
  const gas = loadGas();
  const categories = makeSheet([
    ['Name', 'Description', 'Emoji', 'Hex color'],
    ['Top A', '', '', ''],
    ['Top B', '', '', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  gas.ConfigService.getSheets = () => ({ categories, history, autoRules: null, bareme: null, phrases: null });

  assert.throws(() => gas.SettingsService.renameEntity('Categories', 2, 'Top A', 'Top B', '', ''), /existe déjà/);
  const cats = gas.SettingsService.getEntities('Categories').map(c => c.name);
  assert.deepStrictEqual(cats, ['Top A', 'Top B'], 'aucun des deux Tops ne doit avoir été modifié');
});

test('SettingsService.renameEntity still allows a no-op rename to the same name', () => {
  const gas = loadGas();
  const categories = makeSheet([
    ['Name', 'Description', 'Emoji', 'Hex color'],
    ['Top A', 'old desc', '', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  gas.ConfigService.getSheets = () => ({ categories, history, autoRules: null, bareme: null, phrases: null });

  gas.SettingsService.renameEntity('Categories', 2, 'Top A', 'Top A', 'new desc', '🎯');
  const cats = gas.SettingsService.getEntities('Categories');
  assert.strictEqual(cats[0].meta, 'new desc');
});

// Régression : renameEntity() propageait déjà le renommage d'un Joueur à
// History/AutoRules, mais jamais à la feuille Notes — une note dont le nom de
// joueur n'était plus reconnu par aucune entité active devenait invisible
// dans l'UI (qui ne groupe que par joueurs actuellement connus), sans être
// supprimée ni signalée.
test('SettingsService.renameEntity propagates a player rename to their Notes, leaving other players untouched', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '#ff0000', ''],
    ['Bob', '', '#00ff00', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  const notes = makeSheet([
    ['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe'],
    [new Date('2026-01-01'), 'Alice', 'Note sur Alice', 'n1', 'Bob', '', ''],
    [new Date('2026-01-02'), 'Bob', 'Note sur Bob', 'n2', 'Alice', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ players, history, notes, autoRules: null });

  gas.SettingsService.renameEntity('Players', 2, 'Alice', 'Alicia', '', '');

  const notesValues = notes.getDataRange().getValues();
  assert.strictEqual(notesValues[1][1], 'Alicia', 'la note d\'Alice doit maintenant référencer Alicia');
  assert.strictEqual(notesValues[2][1], 'Bob', 'la note de Bob ne doit pas être touchée par le renommage d\'Alice');
});

// Régression : renameEntity() propage déjà le renommage d'un Joueur à
// History/AutoRules/Notes, mais jamais à la feuille Chat — l'auteur d'un
// message tchat gardait l'ancien nom après un renommage, perdant son avatar/
// couleur (plus retrouvé dans la liste des joueurs actifs) et la possibilité
// de supprimer ses propres anciens messages (comparaison whoAmI === author).
test('SettingsService.renameEntity propagates a player rename to their Chat messages, leaving other authors untouched', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '#ff0000', ''],
    ['Bob', '', '#00ff00', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  const chat = makeSheet([
    ['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ'],
    ['m1', new Date('2026-01-01'), 'Alice', 'Message d\'Alice', ''],
    ['m2', new Date('2026-01-02'), 'Bob', 'Message de Bob', '']
  ]);
  gas.ConfigService.getSheets = () => ({ players, history, notes: null, autoRules: null, chat });

  gas.SettingsService.renameEntity('Players', 2, 'Alice', 'Alicia', '', '');

  const chatValues = chat.getDataRange().getValues();
  assert.strictEqual(chatValues[1][2], 'Alicia', 'le message d\'Alice doit maintenant référencer Alicia');
  assert.strictEqual(chatValues[2][2], 'Bob', 'le message de Bob ne doit pas être touché par le renommage d\'Alice');
});
