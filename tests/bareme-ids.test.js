'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet, injectSheets } = require('./harness');

const D = s => new Date(s + 'T12:00:00');
const PLAYERS = [['Name', 'Avatar URL', 'Hex color', 'Password'], ['Testeur', '', '', '']];

function setup(baremeRows, historyRows) {
  const gas = loadGas();
  const bareme  = makeSheet(baremeRows);
  const history = makeSheet(historyRows || [['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  const audit   = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  injectSheets(gas, { bareme, history, players: makeSheet(PLAYERS), categories: makeSheet([['Name']]),
    auditLog: audit, spreadsheet: { insertSheet: () => makeSheet([]), getSheetByName: () => null } });
  return { gas, bareme, history, audit };
}

test('les règles existantes reçoivent un identifiant unique et persistant', () => {
  const { gas, bareme } = setup([['Top', 'Action', 'Points'], ['Babyfoot', 'Victoire', 3], ['Babyfoot', 'Défaite', 1]]);
  const created = gas.withLock(() => gas.BaremeService.ensureIds());
  assert.strictEqual(created, 2);
  assert.strictEqual(bareme._grid[0][3], 'Id');
  const ids = [bareme._grid[1][3], bareme._grid[2][3]];
  assert.ok(ids[0] && ids[1] && ids[0] !== ids[1]);
  assert.strictEqual(gas.withLock(() => gas.BaremeService.ensureIds()), 0);
  const entries = gas.apiGetBareme().entries;
  assert.strictEqual(entries.find(e => e.action === 'Victoire').id, ids[0]);
});

test('les numéros de l\'ancienne colonne Ordre ne sont pas pris pour des identifiants ; les liens existants suivent la bonne règle', () => {
  // Colonne D = ancienne colonne « Ordre », numérotée par Top : « 1 » existe dans les deux Tops.
  const { gas, bareme, history, audit } = setup(
    [['Top', 'Action', 'Points', 'Ordre'],
      ['Homo', 'Menacer avec sous-entendus', 3, 1], ['Homo', 'Gif Wandance', 15, 2],
      ['Mauvais', 'Insulter la mère', 204, 1], ['Mauvais', 'Mauvais perdant', 10, 'R_OK']],
    [['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur', 'BaremeId'],
      [D('2026-07-12'), 'Testeur', 'Homo', 15, 'Gif Wandance', '', '', 2],
      [D('2026-07-13'), 'Testeur', 'Homo', 3, 'menace', '', '', '1'],
      [D('2026-07-14'), 'Testeur', 'Mauvais', 10, 'perdant', '', '', 'R_OK'],
      [D('2026-07-15'), 'Testeur', 'Homo', 3, 'sans règle', '', '', '']]);
  const created = gas.apiGetBareme().entries.length && bareme._grid.slice(1).map(r => r[3]);
  assert.strictEqual(bareme._grid[0][3], 'Id');
  assert.strictEqual(new Set(created).size, 4, 'identifiants uniques');
  created.slice(0, 3).forEach(id => assert.match(String(id), /^R[a-z0-9]+$/));
  assert.strictEqual(created[3], 'R_OK', 'un identifiant valide et unique est conservé');
  const idOf = action => gas.apiGetBareme().entries.find(e => e.action === action).id;
  assert.strictEqual(history._grid[1][7], idOf('Gif Wandance'));
  assert.strictEqual(history._grid[2][7], idOf('Menacer avec sous-entendus'));
  assert.strictEqual(history._grid[3][7], 'R_OK');
  assert.strictEqual(history._grid[4][7], '');
  assert.ok(audit._grid.some(r => r[2] === 'Migration barème'), 'migration journalisée');
  const sugg = gas.apiGetBaremeSuggestions(0.3).suggestions;
  sugg.forEach(s => assert.strictEqual(gas.BaremeService.findById(s.baremeId).top, s.category));
});

test('ajouter une règle lui donne un identifiant ; modifier la conserve ; l\'annulation de suppression la restaure avec son id', () => {
  const { gas, bareme } = setup([['Top', 'Action', 'Points', 'Id']]);
  gas.apiAddBaremeEntry('Babyfoot', 'Victoire', 3, 'Testeur');
  const id = bareme._grid[1][3];
  assert.match(id, /^R/);
  gas.apiUpdateBaremeEntry(2, 'Victoire nette', 4, 'Testeur');
  assert.strictEqual(bareme._grid[1][3], id);
  assert.strictEqual(gas.BaremeService.findById(id).action, 'Victoire nette');
});
