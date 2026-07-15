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

test('apiGetMentionStats counts mentions by target, by author (saiseur fallback to player), and top duo', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', ''], ['Marie', '', ''], ['Léa', '', '']]);
  const history = makeSheet([
    HEADER,
    // Jean (saisi par Marie) mentionne Léa deux fois → cible Léa+2, auteur Marie+2, paire Marie-Léa+2
    [D('2026-01-10'), 'Jean', 'Jeux', 5, '@Léa a bien joué, merci @Léa', '', 'Marie'],
    // Marie (pas de saiseur renseigné → repli sur player) mentionne Jean une fois
    [D('2026-01-11'), 'Marie', 'Jeux', 3, 'GG @Jean', '', '']
  ]);
  const notes = makeSheet([
    ['Date', 'Joueur', 'Note'],
    [D('2026-01-12'), 'Léa', '@Jean était en retard']
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes });

  const res = gas.apiGetMentionStats();
  assert.strictEqual(res.success, true);

  const leaMentioned = res.mostMentioned.find(m => m.player === 'Léa');
  assert.strictEqual(leaMentioned.count, 2);
  const jeanMentioned = res.mostMentioned.find(m => m.player === 'Jean');
  assert.strictEqual(jeanMentioned.count, 2); // 1 (Marie, History) + 1 (Léa, Notes)

  // Marie est l'auteur des deux lignes History (saiseur explicite sur la 1ère,
  // repli sur player sur la 2ᵉ) : 2 mentions de Léa + 1 mention de Jean = 3.
  const marieMentioning = res.mostMentioning.find(m => m.player === 'Marie');
  assert.strictEqual(marieMentioning.count, 3);
  // Jean n'est jamais auteur (ni saiseur ni player-sans-saiseur d'aucune ligne) → absent.
  assert.strictEqual(res.mostMentioning.find(m => m.player === 'Jean'), undefined);

  assert.ok(res.topDuo);
  assert.strictEqual(res.topDuo.count, 2);
  assert.deepStrictEqual([res.topDuo.playerA, res.topDuo.playerB].sort(), ['Léa', 'Marie']);
});

test('apiGetMentionStats returns empty lists and null duo when there are no mentions', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', '']]);
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'Jean', 'Jeux', 5, 'Rien à signaler', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null });

  const res = gas.apiGetMentionStats();
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual([...res.mostMentioned], []);
  assert.deepStrictEqual([...res.mostMentioning], []);
  assert.strictEqual(res.topDuo, null);
});

test('apiGetMentionStats never counts a self-mention as a duo', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', '']]);
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'Jean', 'Jeux', 5, '@Jean parle de lui-même', '', 'Jean']
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null });

  const res = gas.apiGetMentionStats();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.mostMentioned[0].count, 1);
  assert.strictEqual(res.mostMentioning[0].count, 1);
  assert.strictEqual(res.topDuo, null);
});
