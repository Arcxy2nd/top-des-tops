'use strict';

// Trois menus déroulants (rich-select des filtres, pilule ⭐ Top Alt, "Qui
// suis-je ?") se fermaient dès qu'on cliquait à l'intérieur d'eux sur autre
// chose qu'une option — typiquement en essayant de faire défiler une longue
// liste avec la barre de défilement. Racine du bug, prouvée par lecture de
// code (le panneau du rich-select est reparenté sous <body> pendant qu'il
// est ouvert — Index.html:8145 — donc un clic sur son contenu n'est plus
// "dans" .rich-select) et reproduite isolément dans le navigateur : un
// mousedown ciblant le panneau lui-même passait le test `!e.target.closest(
// '.rich-select')`, donc lu comme un clic extérieur.
//
// Convention de test identique à tests/papercuts.test.js : assertions
// statiques sur le texte source, dom-stub.js n'implémentant pas
// closest()/contains() nécessaires à une vraie simulation d'événements.

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const INDEX = path.join(__dirname, '..', 'Index.html');
const html  = fs.readFileSync(INDEX, 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, name + ' introuvable dans Index.html');
  let depth = 0, i = source.indexOf('{', start);
  const open = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(i > open, name + ' : accolade fermante introuvable');
  return source.slice(start, i + 1);
}

test('le rich-select reconnaît un clic sur son propre panneau (reparenté sous <body>) comme "à l\'intérieur"', () => {
  const idx = html.indexOf("Close any open RichSelect when clicking outside");
  assert.notStrictEqual(idx, -1, 'commentaire du garde-fou introuvable');
  const snippet = html.slice(idx, html.indexOf('});', idx) + 3);
  assert.match(snippet, /e\.target\.closest\(['"]\.rich-select['"]\)/, 'doit toujours reconnaître un clic sur le déclencheur');
  assert.match(snippet, /e\.target\.closest\(['"]\.rs-panel['"]\)/, 'doit aussi reconnaître un clic sur le panneau reparenté, sinon sa barre de défilement referme le menu');
});

test('le sélecteur ⭐ Top Alt ne se ferme plus sur un clic à l\'intérieur de son propre menu', () => {
  const idx = html.indexOf("querySelectorAll('.alt-picker-menu').forEach(m => {");
  assert.notStrictEqual(idx, -1, "garde-fou introuvable (querySelectorAll('.alt-picker-menu').forEach(m => {...})");
  const snippet = html.slice(idx, html.indexOf('});', idx) + 3);
  assert.match(snippet, /m\.contains\(e\.target\)/, 'doit vérifier que le clic est hors du menu avant de le fermer');
});

test('le garde-fou du sélecteur ⭐ Top Alt est posé une seule fois (pas dans addEntryRow, sinon fuite par ligne)', () => {
  const closerListenerIdx = html.lastIndexOf("document.addEventListener('click'", html.indexOf("function addEntryRow("));
  assert.notStrictEqual(closerListenerIdx, -1, 'le garde-fou doit être déclaré avant addEntryRow, en dehors de la fonction');
  const addEntryRowIdx = html.indexOf('function addEntryRow(');
  assert.ok(closerListenerIdx < addEntryRowIdx, 'le garde-fou doit être posé une seule fois, pas à chaque appel de addEntryRow');

  const addEntryRowStart = addEntryRowIdx;
  let depth = 0, i = html.indexOf('{', addEntryRowStart);
  const open = i;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  const addEntryRowBody = html.slice(open, i + 1);
  assert.doesNotMatch(addEntryRowBody, /document\.addEventListener\(['"]click['"]/,
    "addEntryRow ne doit plus enregistrer son propre écouteur document — sinon un par ligne, jamais retiré");
});

test('"Qui suis-je ?" ne se ferme plus sur un clic à l\'intérieur de son propre menu', () => {
  assert.match(html, /document\.getElementById\(['"]whoAmIWrap['"]\)\.contains\(e\.target\)/,
    'le dropdown who-am-i doit vérifier contains() avant de se fermer');
});

test('closeWhoAmIDropdown() est défini en portée module, pas dans window.onload', () => {
  // Sinon applyIdentity()/renderWhoAmI() (portée module, définis bien avant
  // window.onload) ne peuvent pas l'appeler pour se fermer proprement.
  const closeIdx = html.indexOf('function closeWhoAmIDropdown()');
  const onloadIdx = html.indexOf('window.onload = () => {');
  assert.notStrictEqual(closeIdx, -1);
  assert.notStrictEqual(onloadIdx, -1);
  assert.ok(closeIdx < onloadIdx, 'closeWhoAmIDropdown doit être déclarée avant window.onload, en portée module');
});

test('sélectionner une identité détache le repositionnement du dropdown au lieu de seulement masquer le menu', () => {
  // Sans ça, choisir un joueur dans le dropdown "Qui suis-je ?" laisse les
  // écouteurs scroll/resize d'anchorFloating actifs indéfiniment (la même
  // classe de fuite que anchorFloating() a été introduite pour éliminer
  // ailleurs — voir tests/papercuts.test.js).
  const applyIdentity = extractFunction(html, 'applyIdentity');
  assert.match(applyIdentity, /closeWhoAmIDropdown\(\)/, 'applyIdentity doit fermer via closeWhoAmIDropdown(), pas juste retirer la classe .open');
  assert.doesNotMatch(applyIdentity, /classList\.remove\(['"]open['"]\)/, 'ne doit plus manipuler la classe directement, sinon le detach() est de nouveau oublié');

  const renderWhoAmI = extractFunction(html, 'renderWhoAmI');
  const optionClickCount = (renderWhoAmI.match(/closeWhoAmIDropdown\(\)/g) || []).length;
  assert.ok(optionClickCount >= 2, 'les deux branches de clic sur une option (identité déjà active, identité protégée) doivent aussi fermer via closeWhoAmIDropdown()');
});
