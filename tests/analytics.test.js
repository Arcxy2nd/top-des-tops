'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness');

test('_aggregate sums points per player/category and counts orphans', () => {
  const { AnalyticsService } = loadGas();
  const logs = [
    { player: 'A', category: 'Jeux',  points: 5 },
    { player: 'A', category: 'Jeux',  points: 3 },
    { player: 'A', category: 'Défis', points: 2 },
    { player: 'B', category: 'Jeux',  points: 4 },
    { player: 'Ghost', category: 'Jeux', points: 9 },   // unknown player → orphan
    { player: 'A', category: 'Inconnu', points: 1 }      // unknown category → orphan
  ];
  const { scores, orphanCount } = AnalyticsService._aggregate(logs, ['A', 'B'], ['Jeux', 'Défis']);

  assert.strictEqual(scores.A.Jeux, 8);
  assert.strictEqual(scores.A['Défis'], 2);
  assert.strictEqual(scores.A.total, 10);
  assert.strictEqual(scores.B.Jeux, 4);
  assert.strictEqual(scores.B.total, 4);
  assert.strictEqual(orphanCount, 2);
});

test('generateInsights names per-category winners and the overall verdict', () => {
  const { AnalyticsService } = loadGas();
  const scores = {
    A: { total: 12, Jeux: 10, 'Défis': 2 },
    B: { total: 7,  Jeux: 3,  'Défis': 4 }
  };
  const text = AnalyticsService.generateInsights(scores, ['Jeux', 'Défis'], 0);

  assert.match(text, /\[JEUX\] : A domine avec 10 pts/);
  assert.match(text, /\[DÉFIS\] : B domine avec 4 pts/);
  // A wins Jeux, B wins Défis → tie at the top → co-winners.
  assert.match(text, /VERDICT/);
  assert.match(text, /co-/);
});

test('generateInsights reports unattributed entries when orphanCount > 0', () => {
  const { AnalyticsService } = loadGas();
  const scores = { A: { total: 5, Jeux: 5 } };
  const text = AnalyticsService.generateInsights(scores, ['Jeux'], 3);
  assert.match(text, /3 entrée\(s\) non attribuée\(s\)/);
});

test('generateInsights handles an empty board gracefully', () => {
  const { AnalyticsService } = loadGas();
  const scores = { A: { total: 0, Jeux: 0 } };
  const text = AnalyticsService.generateInsights(scores, ['Jeux'], 0);
  assert.match(text, /Aucune infraction détectée/);
});
