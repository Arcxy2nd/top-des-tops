'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const INDEX = path.join(__dirname, '..', 'Index.html');

/**
 * Invariant projet : "every color read from data, never a hardcoded hex".
 * 
 * Ce test vérifie que les couleurs hardcodées dans le JS sont limitées aux
 * cas légitimes documentés ci-dessous. Tout nouvel usage doit être ajouté à
 * la allowlist avec justification, ou mieux : migré vers une variable CSS.
 * 
 * Catégories légitimes :
 * 1. FALLBACK_CSS : fallback après lecture d'une variable CSS (getPropertyValue)
 * 2. CHART_PALETTE : couleurs de séries pour Chart.js (inévitable)
 * 3. CANVAS_RENDER : rendu canvas (ctx.fillStyle/strokeStyle)
 * 4. THEME_CONFIG : définition des palettes de thèmes (dark/light/sunset/etc.)
 * 5. ENTITY_PALETTE : couleurs par défaut assignées aux joueurs/tops (avant personnalisation)
 * 6. CANVAS_TEXT : texte sur canvas (blanc sur fond coloré)
 */

const ALLOWLIST = [
  // FALLBACK_CSS — fallback si variable CSS non définie
  { line: 10780, reason: 'Fallback --text pour Chart.js' },
  { line: 10781, reason: 'Fallback --text-muted pour Chart.js' },
  { line: 10782, reason: 'Fallback --border pour Chart.js' },
  
  // CHART_PALETTE — couleurs de séries Chart.js
  { line: 10776, reason: 'Palette Chart.js (6 couleurs de base)' },
  { line: 11138, reason: 'Fallback couleur dataset Chart.js' },
  
  // CANVAS_RENDER — rendu canvas (avatars, graphiques custom)
  { line: 12048, reason: 'Canvas avatar fallback color' },
  { line: 12050, reason: 'Canvas avatar text (white)' },
  { line: 12057, reason: 'Canvas avatar stroke fallback' },
  { line: 12071, reason: 'Canvas text color (dark/light mode)' },
  { line: 12072, reason: 'Canvas muted text color (dark/light mode)' },
  { line: 12555, reason: 'Canvas mover color (up/down indicators)' },
  
  // THEME_CONFIG — palettes de thèmes
  { line: 12264, reason: 'Theme dark bgGrad' },
  { line: 12267, reason: 'Theme dark fg' },
  { line: 12268, reason: 'Theme dark muted' },
  { line: 12269, reason: 'Theme dark accent' },
  { line: 12270, reason: 'Theme dark accentGrad' },
  { line: 12277, reason: 'Theme light bgGrad' },
  { line: 12278, reason: 'Theme light cardBg' },
  { line: 12280, reason: 'Theme light fg' },
  { line: 12281, reason: 'Theme light muted' },
  { line: 12282, reason: 'Theme light accent' },
  { line: 12283, reason: 'Theme light accentGrad' },
  { line: 12290, reason: 'Theme sunset bgGrad' },
  { line: 12293, reason: 'Theme sunset fg' },
  { line: 12294, reason: 'Theme sunset muted' },
  { line: 12295, reason: 'Theme sunset accent' },
  { line: 12296, reason: 'Theme sunset accentGrad' },
  { line: 12303, reason: 'Theme ocean bgGrad' },
  { line: 12306, reason: 'Theme ocean fg' },
  { line: 12307, reason: 'Theme ocean muted' },
  { line: 12308, reason: 'Theme ocean accent' },
  { line: 12309, reason: 'Theme ocean accentGrad' },
  { line: 12316, reason: 'Theme forest bgGrad' },
  { line: 12319, reason: 'Theme forest fg' },
  { line: 12320, reason: 'Theme forest muted' },
  { line: 12321, reason: 'Theme forest accent' },
  { line: 12322, reason: 'Theme forest accentGrad' },
  
  // ENTITY_PALETTE — couleurs par défaut pour joueurs/tops
  { line: 5653, reason: 'ALT_FALLBACK_COLOR (constante globale)' },
  { line: 6464, reason: 'Palette couleurs joueurs (lot 1)' },
  { line: 6465, reason: 'Palette couleurs joueurs (lot 2)' },
  { line: 6466, reason: 'Palette couleurs joueurs (lot 3)' },
  { line: 14601, reason: 'Palette couleurs groupes' },
  
  // CANVAS_TEXT — texte sur canvas
  { line: 13936, reason: 'Option select text color on accent bg' },
  
  // HEALTH_GAUGE — jauge de santé cache
  { line: 11257, reason: 'Health gauge colors (cold/normal/warm/hot/blaze)' },
  
  // FILTER_CHIPS — chips de filtre historique
  { line: 15250, reason: 'Chip "Non Alt" fallback color (gris neutre)' },
];

test('hardcoded colors are limited to allowlisted usages', () => {
  const content = fs.readFileSync(INDEX, 'utf8');
  const lines = content.split('\n');
  
  // Extraire le JS (après </style>, ligne ~4463)
  const jsStart = 4463;
  const jsLines = lines.slice(jsStart);
  
  const violations = [];
  const allowlistedLines = new Set(ALLOWLIST.map(a => a.line));
  
  jsLines.forEach((line, idx) => {
    const lineNum = idx + jsStart + 1;
    
    // Ignorer les commentaires
    if (line.trim().startsWith('//')) return;
    
    // Chercher les couleurs hex (#xxx ou #xxxxxx)
    const hexMatches = line.match(/#[0-9a-fA-F]{3,6}\b/g);
    if (hexMatches && !allowlistedLines.has(lineNum)) {
      violations.push({
        line: lineNum,
        code: line.trim(),
        colors: hexMatches
      });
    }
  });
  
  if (violations.length > 0) {
    const msg = violations.map(v => 
      `  L${v.line}: ${v.colors.join(', ')}\n    ${v.code}`
    ).join('\n');
    
    assert.fail(
      `Nouvelles couleurs hardcodées détectées (${violations.length} violations).\n` +
      `Si l'usage est légitime, ajouter à ALLOWLIST dans tests/no-hardcoded-colors.test.js avec justification.\n` +
      `Sinon, migrer vers une variable CSS (--accent, --error, etc.) ou lire depuis les données.\n\n${msg}`
    );
  }
});

test('allowlist is documented and justified', () => {
  ALLOWLIST.forEach(entry => {
    assert.ok(entry.line > 0, `Allowlist entry invalide: ${JSON.stringify(entry)}`);
    assert.ok(entry.reason && entry.reason.length > 10, 
      `Allowlist entry L${entry.line} manque de justification: ${entry.reason}`);
  });
});
