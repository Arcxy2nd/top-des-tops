'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet, injectSheets } = require('./harness');

const D = s => new Date(s + 'T12:00:00');

function setup() {
  const gas = loadGas();
  const history = makeSheet([
    ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur', 'BaremeId'],
    [D('2026-09-01'), 'Alice', 'Babyfoot', 3, 'Victoire écrasante contre Bob', '', '', ''],
    [D('2026-09-02'), 'Alice', 'Babyfoot', 1, 'defaite', '', '', ''],
    [D('2026-09-03'), 'Alice', 'Echecs', 5, 'victoire', '', '', ''],
    [D('2026-09-04'), 'Alice', 'Babyfoot', 3, 'victoir', '', '', 'R1'],
    [D('2026-09-05'), 'Alice', 'Babyfoot', 2, 'pique-nique', '', '', '']
  ]);
  const bareme = makeSheet([['Top', 'Action', 'Points', 'Id'],
    ['Babyfoot', 'Victoire', 3, 'R1'], ['Babyfoot', 'Défaite', 1, 'R2'], ['Echecs', 'Mat', 5, 'R3']]);
  const settings = makeSheet([['Key', 'Value']]);
  const audit = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  injectSheets(gas, { history, bareme, settings, auditLog: audit,
    players: makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ['Alice', '', '', '']]),
    categories: makeSheet([['Name', 'Description', 'Emoji', 'Hex color'], ['Babyfoot', '', '', ''], ['Echecs', '', '', '']]),
    spreadsheet: { insertSheet: () => settings, getSheetByName: () => null } });
  return { gas, history, settings };
}

test('score : accents, casse, fautes de frappe, mots voisins', () => {
  const { gas } = setup();
  const M = gas.BaremeMatcher;
  assert.strictEqual(M.normalize('  Défaite, NETTE ! '), 'defaite nette');
  assert.strictEqual(M.score('Victoire écrasante contre Bob', 'Victoire'), 1);
  assert.ok(M.score('victoir', 'Victoire') >= 0.8);
  assert.ok(M.score('défaite', 'Victoire') < 0.4);
  assert.strictEqual(M.score('', 'Victoire'), 0);
});

test('suggestions : même Top uniquement, entrées sans règle uniquement, seuil respecté', () => {
  const { gas } = setup();
  const res = gas.apiGetBaremeSuggestions(0.6);
  assert.strictEqual(res.success, true);
  const byRow = {};
  res.suggestions.forEach(s => { byRow[s.rowIndex] = s; });
  assert.strictEqual(byRow[2].baremeId, 'R1');
  assert.strictEqual(byRow[3].baremeId, 'R2');
  assert.strictEqual(byRow[4], undefined, 'Echecs n\'a pas de règle « victoire »');
  assert.strictEqual(byRow[5], undefined, 'déjà rattachée');
  assert.strictEqual(byRow[6], undefined, 'sous le seuil');
});

test('seuil : valeur par défaut, bornage et persistance dans Settings', () => {
  const { gas, settings } = setup();
  assert.strictEqual(gas.apiGetBaremeSuggestions(null).threshold, 0.6);
  assert.strictEqual(gas.apiSaveBaremeMatchThreshold(0.1, 'Alice').threshold, 0.3);
  assert.strictEqual(settings._grid.find(r => r[0] === 'bareme_match_threshold')[1], '0.3');
  assert.strictEqual(gas.apiGetBaremeSuggestions(null).threshold, 0.3);
});

test('application : écrit la colonne H, ignore une ligne modifiée entre-temps, annulable', () => {
  const { gas, history } = setup();
  const res = gas.apiApplyBaremeSuggestions([
    { rowIndex: 2, baremeId: 'R1', expectedDescription: 'Victoire écrasante contre Bob' },
    { rowIndex: 3, baremeId: 'R2', expectedDescription: 'autre texte' },
    { rowIndex: 4, baremeId: 'R1', expectedDescription: 'victoire' }
  ], 'Alice');
  assert.strictEqual(res.success, true, res.error);
  assert.strictEqual(res.applied, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(res.skipped)), [3, 4]);
  assert.strictEqual(history._grid[1][7], 'R1');
  assert.strictEqual(history._grid[2][7], '');
  gas.apiUndoAuditEntry(res.auditRowId, 'Alice');
  assert.strictEqual(history._grid[1][7] || '', '');
});

test('la carte Outils et les APIs mutantes sont déclarées', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'Index.html'), 'utf8');
  assert.ok(html.includes('id="toolBaremeMatchCard"'));
  assert.ok(html.includes("'apiApplyBaremeSuggestions'"));
  assert.ok(html.includes("'apiSaveBaremeMatchThreshold'"));
});
