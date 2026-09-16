'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet, injectSheets } = require('./harness');

const D = s => new Date(s + 'T12:00:00');
const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];

function setup(historyRows) {
  const gas = loadGas();
  const history = makeSheet([HEADER].concat(historyRows || []));
  const bareme  = makeSheet([['Top', 'Action', 'Points', 'Id'], ['Babyfoot', 'Victoire', 3, 'R1'], ['Echecs', 'Mat', 5, 'R2']]);
  const audit   = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  injectSheets(gas, { history, bareme, auditLog: audit,
    players: makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ['Alice', '', '', '']]),
    categories: makeSheet([['Name', 'Description', 'Emoji', 'Hex color'], ['Babyfoot', '', '', ''], ['Echecs', '', '', '']]),
    altHistory: null, altCategories: null,
    spreadsheet: { insertSheet: () => makeSheet([]), getSheetByName: () => null } });
  return { gas, history, audit };
}

test('la saisie de lot écrit la règle en colonne H et libellé l\'en-tête', () => {
  const { gas, history } = setup();
  const res = gas.apiAddBulkPlan([{ date: '2026-09-10', entries: [
    { player: 'Alice', category: 'Babyfoot', points: 3, times: 1, description: 'contre Bob', saiseur: 'Alice', baremeId: 'R1' },
    { player: 'Alice', category: 'Echecs', points: 2, times: 1, description: '', saiseur: 'Alice' }
  ] }], 'Alice');
  assert.strictEqual(res.success, true, res.error);
  assert.strictEqual(history._grid[0][7], 'BaremeId');
  assert.strictEqual(history._grid[1][7], 'R1');
  assert.strictEqual(history._grid[2][7], '');
});

test('une règle d\'un autre Top est refusée', () => {
  const { gas } = setup();
  const res = gas.apiAddBulkPlan([{ date: '2026-09-10', entries: [
    { player: 'Alice', category: 'Babyfoot', points: 3, times: 1, baremeId: 'R2' }
  ] }], 'Alice');
  assert.strictEqual(res.success, false);
  assert.match(res.error, /Règle du barème introuvable/);
});

test('édition simple : définir puis retirer la règle ; changer de Top sans règle la retire', () => {
  const { gas, history } = setup([[D('2026-09-01'), 'Alice', 'Babyfoot', 3, '', '', 'Alice']]);
  const base = { date: '2026-09-01', player: 'Alice', category: 'Babyfoot', points: 3, description: '', saiseur: 'Alice' };
  assert.strictEqual(gas.apiUpdateHistoryEntry(2, Object.assign({}, base, { baremeId: 'R1' }), 'Alice').success, true);
  assert.strictEqual(history._grid[1][7], 'R1');
  assert.strictEqual(gas.apiUpdateHistoryEntry(2, Object.assign({}, base, { category: 'Echecs' }), 'Alice').success, true);
  assert.strictEqual(history._grid[1][7], '');
});

test('édition groupée : règle appliquée et annulable', () => {
  const { gas, history, audit } = setup([
    [D('2026-09-01'), 'Alice', 'Babyfoot', 3, 'a', '', ''],
    [D('2026-09-02'), 'Alice', 'Babyfoot', 3, 'b', '', '']
  ]);
  const res = gas.apiUpdateBulkEntries([2, 3], { baremeId: 'R1' }, 'Alice');
  assert.strictEqual(res.success, true, res.error);
  assert.strictEqual(history._grid[1][7], 'R1');
  assert.strictEqual(history._grid[2][7], 'R1');
  gas.apiUndoAuditEntry(res.auditRowId, 'Alice');
  assert.strictEqual(history._grid[1][7] || '', '');
});

test('historique paginé : baremeId exposé et filtrable', () => {
  const { gas } = setup([
    [D('2026-09-01'), 'Alice', 'Babyfoot', 3, 'a', '', '', 'R1'],
    [D('2026-09-02'), 'Alice', 'Babyfoot', 3, 'b', '', '', '']
  ]);
  const all = gas.apiGetHistoryPage(1, 20, [], [], null, null, null, 'asc', null, null);
  assert.strictEqual(all.logs[0].baremeId, 'R1');
  assert.strictEqual(gas.apiGetHistoryPage(1, 20, [], [], null, null, null, 'asc', null, 'R1').logs.length, 1);
  assert.strictEqual(gas.apiGetHistoryPage(1, 20, [], [], null, null, null, 'asc', null, '__NONE__').logs[0].description, 'b');
});

test('apiGetBaremeUsage compte les entrées par règle et les règles introuvables', () => {
  const { gas } = setup([
    [D('2026-09-01'), 'Alice', 'Babyfoot', 3, '', '', '', 'R1'],
    [D('2026-09-02'), 'Alice', 'Babyfoot', 3, '', '', '', 'R1'],
    [D('2026-09-03'), 'Alice', 'Babyfoot', 3, '', '', '', 'Rsupprimee'],
    [D('2026-09-04'), 'Alice', 'Babyfoot', 3, '', '', '', '']
  ]);
  const res = gas.apiGetBaremeUsage();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.counts.R1, 2);
  assert.strictEqual(res.orphans, 1);
});
