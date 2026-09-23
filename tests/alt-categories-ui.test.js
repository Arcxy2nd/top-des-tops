'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { makeEnv } = require('./dom-stub.js');

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

test('altCategoryColor : couleur stockée, sinon palette par position, sinon repli', () => {
  const env = makeEnv({});
  vm.createContext(env);
  env.CHART_COLORS = ['#a', '#b'];
  env.ALT_FALLBACK_COLOR = '#ffd166';
  env.cachedAltCategories = [{ name: 'X', color: '#123456' }, { name: 'Y', color: '' }];
  vm.runInContext(extractFunction(html, 'altCategoryColor') + '\nthis.__c = altCategoryColor;', env);
  assert.strictEqual(env.__c('X'), '#123456');
  assert.strictEqual(env.__c('Y'), '#b');
  assert.strictEqual(env.__c('Inconnu'), '#ffd166');
});

test('renameAltSelections garde les filtres actifs sur le Top renommé', () => {
  const env = makeEnv({});
  vm.createContext(env);
  env.selectedHistAltCategories = new Set(['Vieux']);
  env.selectedCategoryChips = new Set(['Vieux']);
  env.activeDashboardUniverse = 'alt';
  vm.runInContext(extractFunction(html, 'renameAltSelections') + '\nthis.__r = renameAltSelections;', env);
  env.__r('Vieux', 'Neuf');
  assert.deepStrictEqual([...env.selectedHistAltCategories], ['Neuf']);
  assert.deepStrictEqual([...env.selectedCategoryChips], ['Neuf']);
});

test('la liste des Tops alternatifs passe par renderEntityList', () => {
  const body = extractFunction(html, 'renderAltCategoriesList');
  assert.ok(/renderEntityList\([^)]*'AltCategories'\)/.test(body));
});

test('plus aucune réécriture complète ni couleur aléatoire côté client', () => {
  assert.ok(!/apiSaveAltCategories/.test(html));
  assert.ok(!/Math\.random\(\)\*16777215/.test(html));
});

test('ajout d\'un Top alternatif : apiManageEntity ADD + reprise après mot de passe', () => {
  const body = extractFunction(html, 'addAltCategory');
  assert.ok(/apiManageEntity',\s*\['ADD',\s*'AltCategories'/.test(body));
  assert.ok(/requireIdentity\(doAdd\)/.test(body));
});

test('couleur d\'entité : cache mis à jour seulement après réponse serveur (pas d\'UI optimiste)', () => {
  const body = extractFunction(html, 'renderEntityList');
  assert.ok(/callServer\('apiSetColor',\s*\[type,[^\]]*\],\s*\(\)\s*=>\s*\{/.test(body));
});

test('le bouton « Nouveau Top Alt » du sélecteur mène au formulaire des Paramètres', () => {
  const start = html.indexOf("getElementById('uPickerNewAltBtn').onclick");
  const chunk = html.slice(start, start + 500);
  assert.ok(/goToTab\('tab-settings'\)/.test(chunk));
  assert.ok(/stab-alt-categories/.test(chunk));
});
