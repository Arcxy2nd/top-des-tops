'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, name + ' introuvable');
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(start, i + 1);
}

test('describeDashboardCache décrit la clé, la présence, la date et l\'hôte', () => {
  const store = { 'tdt_i_dashboard_cache': JSON.stringify({ chartData: { labels: ['a'] }, savedAt: 42 }) };
  const ctx = { localStorage: { getItem: k => store[k] || null }, location: { host: 'h.example' },
    getDashboardCacheKey: () => 'tdt_i_dashboard_cache' };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(html, 'describeDashboardCache') + '\nthis.__d = describeDashboardCache;', ctx);
  assert.strictEqual(JSON.stringify(ctx.__d()), JSON.stringify({ key: 'tdt_i_dashboard_cache', present: true, savedAt: 42, host: 'h.example' }));
  delete store['tdt_i_dashboard_cache'];
  assert.strictEqual(ctx.__d().present, false);
});

test('bootDataLoad mémorise le résultat de la restauration du cache', () => {
  const body = extractFunction(html, 'bootDataLoad');
  assert.match(body, /_bootCacheStatus\s*=\s*Object\.assign\(describeDashboardCache\(\),\s*\{\s*restored:\s*restoreDashboardFromCache\(\)\s*\}\)/);
});

test('le banc local injecte l\'identifiant d\'instance comme doGet', () => {
  const serve = fs.readFileSync(path.join(__dirname, 'frontend', 'serve.js'), 'utf8');
  assert.match(serve, /__APP_INSTANCE_ID__/);
});
