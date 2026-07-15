'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const D = s => new Date(s + 'T12:00:00');
const mk = (d, p, c, pts, desc) => [D(d), p, c, pts, desc || '', '', ''];

test('apiScanUnmentionedNames detects a raw player name in a description and proposes @Name', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', ''], ['Marie', '', '']]);
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'Jean', 'Jeux', 5, 'Jean a gagné contre Marie'),
    mk('2026-01-11', 'Marie', 'Jeux', 3, 'Rien à signaler')
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null });

  const res = gas.apiScanUnmentionedNames();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.results.length, 1);
  assert.strictEqual(res.results[0].source, 'history');
  assert.strictEqual(res.results[0].rowIndex, 2);
  assert.strictEqual(res.results[0].after, '@Jean a gagné contre @Marie');
});

test('apiScanUnmentionedNames ignores names already written as @Mention', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', '']]);
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'Jean', 'Jeux', 5, '@Jean a gagné')
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null });

  const res = gas.apiScanUnmentionedNames();
  assert.strictEqual(res.results.length, 0);
});

test('apiScanUnmentionedNames does not attribute an ambiguous shared token to either player', () => {
  const gas = loadGas();
  // "Jean" apparaît comme prénom dans deux noms composés distincts → token ambigu, ignoré.
  const players = makeSheet([['Jean Dupont', '', ''], ['Jean Martin', '', '']]);
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'Jean Dupont', 'Jeux', 5, 'Jean a gagné')
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null });

  const res = gas.apiScanUnmentionedNames();
  assert.strictEqual(res.results.length, 0);
});

test('apiScanUnmentionedNames matches a unique first-name token from a composed name', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean Dupont', '', ''], ['Marie', '', '']]);
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'Jean Dupont', 'Jeux', 5, 'Jean a gagné')
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null });

  const res = gas.apiScanUnmentionedNames();
  assert.strictEqual(res.results.length, 1);
  assert.strictEqual(res.results[0].after, '@Jean Dupont a gagné');
});

test('apiScanUnmentionedNames also scans Notes text', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', '']]);
  const history = makeSheet([HEADER]);
  const notes = makeSheet([
    ['Date', 'Joueur', 'Note'],
    [D('2026-01-10'), 'Marie', 'Jean était en retard']
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes });

  const res = gas.apiScanUnmentionedNames();
  assert.strictEqual(res.results.length, 1);
  assert.strictEqual(res.results[0].source, 'notes');
  assert.strictEqual(res.results[0].after, '@Jean était en retard');
});

test('apiApplyMentionFixes writes the fixed description back and logs one audit entry', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', '']]);
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'Jean', 'Jeux', 5, 'Jean a gagné')
  ]);
  const auditLog = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null, auditLog });

  const res = gas.apiApplyMentionFixes([{ source: 'history', rowIndex: 2, after: '@Jean a gagné' }], 'Testeur');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.applied, 1);
  assert.strictEqual(history._grid[1][4], '@Jean a gagné');
  assert.strictEqual(auditLog._grid.length, 2);
  assert.strictEqual(auditLog._grid[1][2], 'Mentions corrigées');
});
