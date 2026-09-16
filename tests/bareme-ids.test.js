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

test('ajouter une règle lui donne un identifiant ; modifier la conserve ; l\'annulation de suppression la restaure avec son id', () => {
  const { gas, bareme } = setup([['Top', 'Action', 'Points', 'Id']]);
  gas.apiAddBaremeEntry('Babyfoot', 'Victoire', 3, 'Testeur');
  const id = bareme._grid[1][3];
  assert.match(id, /^R/);
  gas.apiUpdateBaremeEntry(2, 'Victoire nette', 4, 'Testeur');
  assert.strictEqual(bareme._grid[1][3], id);
  assert.strictEqual(gas.BaremeService.findById(id).action, 'Victoire nette');
});
