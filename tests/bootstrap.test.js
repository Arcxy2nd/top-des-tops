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

test('Index.html defines renderQuickStatsBar and boot sequence uses it safely', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

  assert.ok(html.includes('function renderQuickStatsBar('), 'renderQuickStatsBar doit être définie dans Index.html');
  assert.ok(html.includes('renderQuickStatsBar(res.quickStats)'), 'le bootstrap composite doit appeler renderQuickStatsBar');
  assert.ok(html.includes('renderQuickStatsBar(cached.quickStats)'), 'la restauration du cache doit appeler renderQuickStatsBar');
});

test('apiGetBootstrapData falls back to __default__ preset matching PHRASES_DEFAULT_ID', () => {
  const gas = loadGas();
  gas.apiGetActivePhrasePreset = () => { throw new Error('Preset failure'); };
  const res = gas.apiGetBootstrapData();
  assert.strictEqual(res.activePreset.preset, '__default__');
});

test('Index.html renders navigation synchronously without waiting for network', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

  const navIdx = html.indexOf('function renderNav()');
  assert.notStrictEqual(navIdx, -1);
  const tail = html.slice(navIdx, navIdx + 3000);
  assert.ok(tail.includes('renderNav();'), 'renderNav() doit être appelé immédiatement après sa définition');
  assert.ok(tail.includes('initNavHoverTip();'), 'initNavHoverTip() doit être appelé immédiatement après sa définition');
});

test('Index.html does not trap desktop screens with a buggy _layoutStable ignoring mq.change', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

  assert.strictEqual(html.includes('_layoutStable'), false, '_layoutStable ne doit pas exister dans Index.html');
});

test('Index.html controls #chatSidePanel display style and not a phantom #chatPanel', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

  const chatInitIdx = html.indexOf('function initChatWidget(');
  assert.notStrictEqual(chatInitIdx, -1);
  const chatBlock = html.slice(chatInitIdx, chatInitIdx + 1500);
  assert.strictEqual(chatBlock.includes("document.getElementById('chatPanel')"), false, 'chatPanel fantôme ne doit pas être cherché');
  assert.ok(chatBlock.includes("document.getElementById('chatSidePanel')"), 'chatSidePanel doit être ciblé');
  assert.ok(chatBlock.includes("style.display = 'flex'"), 'le panneau du tchat ouvert doit être affiché avec display: flex');
});



