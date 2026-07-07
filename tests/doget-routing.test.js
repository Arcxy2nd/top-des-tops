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

test('doGet with no parameters serves the inline redirect bootstrap', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: {} });
  assert.ok(typeof out._html === 'string', 'must serve inline HTML, not a named file');
  assert.ok(out._html.includes('tdt_layout_mode'), 'reads the same localStorage key the toggle writes');
  assert.ok(out._html.includes("matchMedia('(max-width:640px)')"), 'falls back to a width check');
});

test('doGet with undefined event object serves the inline redirect bootstrap', () => {
  const gas = loadGas();
  const out = gas.doGet(undefined);
  assert.ok(typeof out._html === 'string');
});

test('doGet with an unrecognized ?view value falls back to the redirect bootstrap', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'tablet' } });
  assert.ok(typeof out._html === 'string');
});

test('_deviceRedirectBootstrapHtml sets the view param and reloads via window.location.href', () => {
  const gas  = loadGas();
  const html = gas._deviceRedirectBootstrapHtml();
  assert.ok(html.includes("url.searchParams.set('view', view)"));
  assert.ok(html.includes('window.location.href = url.toString()'));
});
