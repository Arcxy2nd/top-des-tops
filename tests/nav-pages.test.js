'use strict';
const { test } = require('node:test');
const assert   = require('assert');
const { loadGas } = require('./harness.js');

test('NAV_PAGES has exactly the 7 documented tabs, in order', () => {
  const gas = loadGas();
  const ids = [...gas.NAV_PAGES.map(p => p.id)];
  assert.deepStrictEqual(ids, [
    'tab-dashboard', 'tab-inject', 'tab-settings',
    'tab-notes', 'tab-history', 'tab-outils', 'tab-guide'
  ]);
});

test('NAV_PAGES includes the previously-missing Outils entry', () => {
  const gas = loadGas();
  const outils = gas.NAV_PAGES.find(p => p.id === 'tab-outils');
  assert.ok(outils, 'tab-outils entry must exist');
  assert.strictEqual(outils.icon, '🔧');
  assert.strictEqual(outils.label, 'Outils');
});

test('every NAV_PAGES entry has a non-empty id, icon and label', () => {
  const gas = loadGas();
  gas.NAV_PAGES.forEach(p => {
    assert.ok(p.id && p.id.trim(),    'id must be non-empty');
    assert.ok(p.icon && p.icon.trim(), 'icon must be non-empty');
    assert.ok(p.label && p.label.trim(), 'label must be non-empty');
  });
});

test('apiGetNavPages returns success:true and the full NAV_PAGES array', () => {
  const gas = loadGas();
  const res = gas.apiGetNavPages();
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(res.pages, gas.NAV_PAGES);
  assert.strictEqual(res.pages.length, 7);
});

test('apiGetNavPages: notes and history entries carry their countId', () => {
  const gas = loadGas();
  const res = gas.apiGetNavPages();
  const notes   = res.pages.find(p => p.id === 'tab-notes');
  const history = res.pages.find(p => p.id === 'tab-history');
  assert.strictEqual(notes.countId, 'notesCount');
  assert.strictEqual(history.countId, 'historyCount');
});
