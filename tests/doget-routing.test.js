'use strict';
const { test } = require('node:test');
const assert   = require('assert');
const { loadGas } = require('./harness.js');

test('doGet always serves Index.html regardless of ?view parameter', () => {
  const gas = loadGas();
  assert.strictEqual(gas.doGet({ parameter: { view: 'mobile' } })._file, 'Index');
  assert.strictEqual(gas.doGet({ parameter: { view: 'desktop' } })._file, 'Index');
});

// doGet uses createHtmlOutputFromFile (no server-side template evaluation):
// GAS's template engine silently corrupts very large HTML files (confirmed in
// production, see CHANGELOG v3.5.1), so Index.html no longer contains any
// <?  ?> scriptlet and doGet has nothing left to inject.
test('doGet sets the viewport meta tag without any template evaluation', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'desktop' } });
  assert.deepStrictEqual(out._metaTag, { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0' });
});

// No auto-redirect page anymore: the sandboxed deployment silently blocks any
// script-triggered navigation that isn't a real user click, so a bare /exec visit
// (or any unrecognized ?view value) goes straight to Index.html (desktop) rather
// than an intermediate page that tries and fails to redirect itself.
test('doGet with no parameters serves Index.html directly', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: {} });
  assert.strictEqual(out._file, 'Index');
});

test('doGet with undefined event object serves Index.html directly', () => {
  const gas = loadGas();
  const out = gas.doGet(undefined);
  assert.strictEqual(out._file, 'Index');
});

test('doGet with an unrecognized ?view value falls back to Index.html', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'tablet' } });
  assert.strictEqual(out._file, 'Index');
});
