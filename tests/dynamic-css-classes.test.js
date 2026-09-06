'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const INDEX = path.join(__dirname, '..', 'Index.html');

/**
 * Régression : certaines classes CSS ne sont jamais référencées littéralement
 * dans le code JS/HTML, mais sont construites dynamiquement via des templates
 * ou concaténations. Si on les supprime par erreur (en croyant qu'elles sont
 * mortes), le style se casse silencieusement sans échec de test.
 *
 * Ce test fige la liste des classes dynamiquement construites et vérifie
 * qu'elles sont bien présentes dans le bloc <style>.
 */

const DYNAMIC_CLASSES = [
  // audit-cat-{create,delete,update,auto,clean,other} : construits via 'audit-cat-' + cat.cls (ligne ~15048)
  'audit-cat-create',
  'audit-cat-delete',
  'audit-cat-update',
  'audit-cat-auto',
  'audit-cat-clean',
  'audit-cat-other',
  
  // rank-1, rank-2, rank-3 : construits via `rank-${p.rank}` (ligne ~7717)
  'rank-1',
  'rank-2',
  'rank-3'
];

test('dynamically constructed CSS classes are present in stylesheet', () => {
  const content = fs.readFileSync(INDEX, 'utf8');
  
  // Extraire le bloc <style> (lignes 15-4463 environ)
  const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  assert.ok(styleMatch, 'Bloc <style> introuvable dans Index.html');
  
  const styleBlock = styleMatch[1];
  
  DYNAMIC_CLASSES.forEach(cls => {
    // Vérifier que la classe apparaît dans un sélecteur CSS (préfixée par un point)
    const pattern = new RegExp('\\.' + cls.replace(/-/g, '\\-') + '(?:[^a-zA-Z0-9_-]|$)');
    assert.ok(
      pattern.test(styleBlock),
      `Classe CSS dynamique '.${cls}' absente du bloc <style> (construite dynamiquement en JS)`
    );
  });
});

test('dynamic class construction patterns are documented', () => {
  const content = fs.readFileSync(INDEX, 'utf8');
  
  // Vérifier que les patterns de construction dynamique sont bien présents
  assert.ok(
    content.includes("'audit-cat-' + cat.cls"),
    "Pattern de construction 'audit-cat-' + cat.cls introuvable"
  );
  
  assert.ok(
    content.includes('`podium-column rank-${p.rank}`'),
    'Pattern de construction `rank-${p.rank}` introuvable'
  );
});
