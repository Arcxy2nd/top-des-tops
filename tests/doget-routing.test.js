'use strict';
const { test } = require('node:test');
const assert   = require('assert');
const { loadGas } = require('./harness.js');

test('doGet with ?view=mobile serves Mobile.html', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'mobile' } });
  assert.strictEqual(out._file, 'Mobile');
});

test('doGet with ?view=desktop serves Index.html', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'desktop' } });
  assert.strictEqual(out._file, 'Index');
});

test('doGet injects the deployment\'s real public URL into the template (appUrl)', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'desktop' } });
  assert.strictEqual(out._appUrl, 'https://script.google.com/macros/s/FAKE_DEPLOYMENT_ID/exec');
});

test('doGet still serves the page (with an empty appUrl) when ScriptApp.getService() is not authorized', () => {
  const gas = loadGas();
  gas.ScriptApp.getService = () => { throw new Error('Vous n\'êtes pas autorisé à appeler ScriptApp.getService.'); };
  const out = gas.doGet({ parameter: { view: 'desktop' } });
  assert.strictEqual(out._file, 'Index');
  assert.strictEqual(out._appUrl, '');
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
