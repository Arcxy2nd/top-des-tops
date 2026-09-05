'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas } = require('./harness.js');
const { buildSheets } = require('./frontend/fixtures.js');

test('apiGetBootstrapData aggregates all 10 startup RPC endpoints in a single response', () => {
  const gas = loadGas();
  const sheets = buildSheets();
  gas.ConfigService.getSheets = () => sheets;

  const res = gas.apiGetBootstrapData();
  assert.strictEqual(res.success, true);

  // 1. navPages
  assert.ok(res.navPages && res.navPages.success);
  assert.strictEqual(res.navPages.pages.length, 6);

  // 2. appSettings
  assert.ok(res.appSettings && typeof res.appSettings === 'object');

  // 3. settings (players & categories)
  assert.ok(res.settings && res.settings.success);
  assert.ok(Array.isArray(res.settings.players));
  assert.ok(Array.isArray(res.settings.categories));

  // 4. altCategories
  assert.ok(res.altCategories && res.altCategories.success);

  // 5. altHistoryMap
  assert.ok(res.altHistoryMap && res.altHistoryMap.success);

  // 6. filteredData
  assert.ok(res.filteredData && res.filteredData.success);
  assert.ok(res.filteredData.chartData);

  // 7. quickStats
  assert.ok(res.quickStats);

  // 8. phrases
  assert.ok(res.phrases && res.phrases.success);

  // 9. activePreset
  assert.ok(res.activePreset && res.activePreset.success);

  // 10. chatMessages
  assert.ok(res.chatMessages && res.chatMessages.success);
  assert.ok(Array.isArray(res.chatMessages.messages));
});

test('apiGetBootstrapData gracefully catches individual endpoint failures without crashing', () => {
  const gas = loadGas();
  const sheets = buildSheets();
  gas.ConfigService.getSheets = () => sheets;

  // Simulate an endpoint failing due to sheet error
  sheets.altCategories.getDataRange = () => { throw new Error('Alt categories sheet corrupted'); };

  const res = gas.apiGetBootstrapData();
  assert.strictEqual(res.success, true);
  assert.ok(res.altCategories);
  assert.strictEqual(res.altCategories.success, false);
  assert.ok(res.altCategories.error);

  // Other endpoints still succeed
  assert.ok(res.navPages && res.navPages.success);
  assert.ok(res.settings && res.settings.success);
});

