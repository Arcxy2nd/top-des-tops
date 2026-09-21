'use strict';

const { compareResponses } = require('../scripts/compare-backends');
const test = require('node:test');
const assert = require('node:assert');

test('deux réponses identiques sont égales', () => {
  const a = { success: true, players: [{ name: 'Safir', pts: 12 }] };
  assert.deepStrictEqual(compareResponses(a, JSON.parse(JSON.stringify(a)), []), { equal: true, differences: [] });
});

test('une différence de valeur est signalée avec son chemin', () => {
  const out = compareResponses({ players: [{ pts: 12 }] }, { players: [{ pts: 13 }] }, []);
  assert.strictEqual(out.equal, false);
  assert.ok(out.differences.some(d => /players\.0\.pts/.test(d)), out.differences.join(' | '));
});

test('une clé volatile est ignorée à n\'importe quelle profondeur', () => {
  const out = compareResponses({ a: { version: '1' } }, { a: { version: '2' } }, ['version']);
  assert.strictEqual(out.equal, true);
});

test('une clé présente d\'un seul côté est signalée', () => {
  const out = compareResponses({ a: 1 }, { a: 1, b: 2 }, []);
  assert.strictEqual(out.equal, false);
  assert.ok(out.differences.some(d => /b/.test(d)));
});

test('les tableaux de longueurs différentes sont signalés, pas comparés élément à élément', () => {
  const out = compareResponses({ l: [1, 2] }, { l: [1] }, []);
  assert.strictEqual(out.equal, false);
  assert.ok(out.differences.some(d => /longueur/.test(d)));
});

test('la comparaison ne modifie aucun des deux objets', () => {
  const a = { x: 1 };
  const b = { x: 2 };
  compareResponses(a, b, []);
  assert.deepStrictEqual(a, { x: 1 });
  assert.deepStrictEqual(b, { x: 2 });
});
