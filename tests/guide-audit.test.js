'use strict';

// Passe d'audit onglet ❓ Guide (2026-08-24). Suit la convention statique de
// tests/papercuts.test.js : on scanne le texte source d'Index.html plutôt que
// de simuler un DOM complet (dom-stub.js est trop minimal pour querySelectorAll
// par classe/attribut, et le Guide est un panneau statique sans logique métier
// à couvrir par un vrai test comportemental).

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

function block(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  assert.notStrictEqual(start, -1, startMarker + ' introuvable');
  const end = html.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, endMarker + ' introuvable après ' + startMarker);
  return html.slice(start, end);
}

test('--accent-rgb est déclarée dans les deux thèmes (dark et body.light)', () => {
  const rootBlock = block(':root {', 'body.light {');
  const lightBlock = block('body.light {', '*, *::before, *::after');
  assert.match(rootBlock, /--accent-rgb:\s*255,\s*71,\s*87/, 'thème sombre');
  assert.match(lightBlock, /--accent-rgb:\s*229,\s*62,\s*62/, 'thème clair');
});

test('setupResizable protège ses accès localStorage', () => {
  const src = extractFunction(html, 'setupResizable');
  assert.match(src, /try\s*\{\s*saved\s*=\s*localStorage\.getItem/, 'lecture protégée');
  assert.match(src, /try\s*\{\s*localStorage\.setItem/, 'écriture protégée (persist)');
});

test('setupResizable plafonne la taille relativement au viewport, pas seulement à maxSize fixe', () => {
  const src = extractFunction(html, 'setupResizable');
  assert.match(src, /effectiveMax/, 'doit calculer un plafond dynamique');
  assert.match(src, /window\.innerWidth/, 'le plafond doit dépendre de la largeur de fenêtre');
});

test('setupResizable gère le tactile en plus de la souris', () => {
  const src = extractFunction(html, 'setupResizable');
  assert.match(src, /touchstart/);
  assert.match(src, /touchmove/);
  assert.match(src, /touchend/);
});

test('setupResizable est accessible au clavier (tabindex, role, flèches)', () => {
  const src = extractFunction(html, 'setupResizable');
  assert.match(src, /setAttribute\(['"]tabindex['"],\s*['"]0['"]\)/);
  assert.match(src, /setAttribute\(['"]role['"],\s*['"]separator['"]\)/);
  assert.match(src, /ArrowLeft/);
  assert.match(src, /ArrowRight/);
});

test('showGuideSection avertit au lieu d\'échouer silencieusement sur un data-section orphelin', () => {
  const src = extractFunction(html, 'showGuideSection');
  assert.match(src, /console\.warn/, 'un data-section sans bouton/section correspondant doit être signalé');
  assert.match(src, /aria-selected/, 'doit refléter la sélection pour les lecteurs d\'écran');
});

test('initGuideAccordion câble les rôles ARIA tab/tabpanel depuis data-section/gsec-*', () => {
  const src = extractFunction(html, 'initGuideAccordion');
  assert.match(src, /role['"],\s*['"]tablist['"]/);
  assert.match(src, /role['"],\s*['"]tab['"]/);
  assert.match(src, /role['"],\s*['"]tabpanel['"]/);
  assert.match(src, /aria-controls/);
  assert.match(src, /aria-labelledby/);
});

test('initGuideAccordion délègue aussi les clics sur .guide-crosslink (renvois internes)', () => {
  const src = extractFunction(html, 'initGuideAccordion');
  assert.match(src, /guide-crosslink/, 'les renvois internes du Guide doivent réutiliser le même mécanisme data-section');
});

test('.guide-nav-btn respecte la cible tactile minimale en mobile', () => {
  const mobileBlock = block('/* Mobile: stack layout */', '/* ── EXPORT MODAL ── */');
  assert.match(mobileBlock, /@media\s*\(max-width:\s*768px\)/);
  assert.match(mobileBlock, /\.guide-nav-btn\s*\{[^}]*min-height:\s*var\(--tap-min\)/s);
});

test('.guide-feature-item a un fond adapté au thème clair', () => {
  assert.match(html, /body\.light \.guide-feature-item\s*\{\s*background:\s*rgba\(0,\s*0,\s*0,\s*0\.04\)/);
});

test('Guide § Outils de données couvre tous les outils réels de #stab-tools', () => {
  const toolsBlock = block('id="stab-tools"', 'id="stab-automations"');
  const titles = [...toolsBlock.matchAll(/card-collapse-header"><h2>([^<]+)<\/h2>/g)].map(m => m[1]);
  assert.ok(titles.length >= 5, 'sanity check : au moins 5 cartes attendues dans #stab-tools');

  const guideOutils = block('id="gsec-outils"', 'id="gsec-bareme"');
  // Chaque titre de carte réelle doit avoir au moins un mot significatif (hors
  // emoji/mots vides) présent dans le texte du Guide — sinon l'outil a été
  // ajouté sans que le Guide en parle (c'est exactement le défaut trouvé lors
  // de cette passe : Doublons et Mentions étaient absents).
  const stopWords = new Set(['de', 'à', 'et', 'les', 'des', 'la', 'le', 'un', 'une']);
  titles.forEach(title => {
    const words = title.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()));
    const found = words.some(w => new RegExp(w, 'i').test(guideOutils));
    assert.ok(found, 'la carte "' + title + '" de #stab-tools doit être mentionnée dans #gsec-outils');
  });
});

test('Guide § Outils de données mentionne le snapshot', () => {
  const guideOutils = block('id="gsec-outils"', 'id="gsec-bareme"');
  assert.match(guideOutils, /snapshot/i);
});

test('Guide § Dashboard mentionne l\'export de saison', () => {
  const guideDashboard = block('id="gsec-dashboard"', 'id="gsec-saisie"');
  assert.match(guideDashboard, /trimestre/i);
});

test('Guide § Paramètres — Vue d\'ensemble couvre les 9 sous-onglets réels', () => {
  const navBlock = block('class="settings-inner-nav"', '</div>');
  const stabs = [...navBlock.matchAll(/data-stab="([^"]+)">([^<]+)</g)].map(m => m[2].trim());
  assert.strictEqual(stabs.length, 9, 'sanity check : 9 sous-onglets attendus dans la nav Paramètres');

  const guideParams = block('id="gsec-parametres"', 'id="gsec-alt"');
  const stopWords = new Set(['de', 'à', 'et', 'les', 'des', 'la', 'le', 'un', 'une']);
  stabs.forEach(label => {
    const words = label.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()));
    const found = words.some(w => new RegExp(w, 'i').test(guideParams));
    assert.ok(found, 'le sous-onglet "' + label + '" doit être mentionné dans #gsec-parametres');
  });
});

test('les 13 data-section de la sidebar correspondent 1:1 aux 13 id="gsec-*"', () => {
  const guideBlock = block('id="tab-guide"', '<!-- ══ MODAL');
  const navSections = [...guideBlock.matchAll(/class="guide-nav-btn[^"]*"\s+data-section="([^"]+)"/g)].map(m => m[1]);
  const contentSections = [...guideBlock.matchAll(/class="guide-content-section[^"]*"\s+id="gsec-([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual([...navSections].sort(), [...contentSections].sort());
});

test('un champ de recherche existe dans la sidebar du Guide', () => {
  const guideBlock = block('id="tab-guide"', '<!-- ══ MODAL');
  assert.match(guideBlock, /id="guideSearchInput"/);
});
