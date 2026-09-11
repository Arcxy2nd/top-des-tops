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
  { line: 10780, pattern: /--text['"]\)\.trim\(\)\s*\|\|\s*'#e0e6ed'/, reason: 'Fallback --text pour Chart.js' },
  { line: 10781, pattern: /--text-muted['"]\)\.trim\(\)\s*\|\|\s*'#9aa5be'/, reason: 'Fallback --text-muted pour Chart.js' },
  { line: 10782, pattern: /--border['"]\)\.trim\(\)\s*\|\|\s*'#2a313d'/, reason: 'Fallback --border pour Chart.js' },
  
  // CHART_PALETTE — couleurs de séries Chart.js
  { line: 10776, pattern: /const CHART_COLORS = \[/, reason: 'Palette Chart.js (6 couleurs de base)' },
  { line: 11138, pattern: /ds\.backgroundColor\s*\|\|\s*'#ff4757'/, reason: 'Fallback couleur dataset Chart.js' },
  
  // CANVAS_RENDER — rendu canvas (avatars, graphiques custom)
  { line: 12048, pattern: /ctx\.fillStyle = \(av && av\.color\) \|\| '#555'/, reason: 'Canvas avatar fallback color' },
  { line: 12050, pattern: /ctx\.fillStyle = '#fff'/, reason: 'Canvas avatar text (white)' },
  { line: 12057, pattern: /ctx\.strokeStyle = \(av && av\.color\) \|\| '#555'/, reason: 'Canvas avatar stroke fallback' },
  { line: 12071, pattern: /const textColor = isDark \? '#e0e6ed' : '#1a202c'/, reason: 'Canvas text color (dark/light mode)' },
  { line: 12072, pattern: /const mutedColor = isDark \? '#9aa5be' : '#4a5568'/, reason: 'Canvas muted text color (dark/light mode)' },
  { line: 12555, pattern: /const moverColor = isUp \? '#2ed573' : '#ff4757'/, reason: 'Canvas mover color (up/down indicators)' },
  
  // THEME_CONFIG — palettes de thèmes
  { line: 12264, pattern: /bgGrad:\s*\['#0b0f19',\s*'#161f33'\]/, reason: 'Theme dark bgGrad' },
  { line: 12267, pattern: /fg:\s*'#f1f5f9'/, reason: 'Theme dark fg' },
  { line: 12268, pattern: /muted:\s*'#94a3b8'/, reason: 'Theme dark muted' },
  { line: 12269, pattern: /accent:\s*'#ff4757'/, reason: 'Theme dark accent' },
  { line: 12270, pattern: /accentGrad:\s*\['#ff4757',\s*'#ff6b81'\]/, reason: 'Theme dark accentGrad' },
  { line: 12277, pattern: /bgGrad:\s*\['#f8fafc',\s*'#e2e8f0'\]/, reason: 'Theme light bgGrad' },
  { line: 12278, pattern: /cardBg:\s*'#ffffff'/, reason: 'Theme light cardBg' },
  { line: 12280, pattern: /fg:\s*'#0f172a'/, reason: 'Theme light fg' },
  { line: 12281, pattern: /muted:\s*'#64748b'/, reason: 'Theme light muted' },
  { line: 12282, pattern: /accent:\s*'#ff4757'/, reason: 'Theme light accent' },
  { line: 12283, pattern: /accentGrad:\s*\['#ff4757',\s*'#ff6b81'\]/, reason: 'Theme light accentGrad' },
  { line: 12290, pattern: /bgGrad:\s*\['#0f0c29',\s*'#24243e'\]/, reason: 'Theme sunset bgGrad' },
  { line: 12293, pattern: /fg:\s*'#ffffff'/, reason: 'Theme sunset fg' },
  { line: 12294, pattern: /muted:\s*'#a5b4fc'/, reason: 'Theme sunset muted' },
  { line: 12295, pattern: /accent:\s*'#8b5cf6'/, reason: 'Theme sunset accent' },
  { line: 12296, pattern: /accentGrad:\s*\['#8b5cf6',\s*'#a855f7'\]/, reason: 'Theme sunset accentGrad' },
  { line: 12303, pattern: /bgGrad:\s*\['#0f2027',\s*'#2c5364'\]/, reason: 'Theme ocean bgGrad' },
  { line: 12306, pattern: /fg:\s*'#f0f9ff'/, reason: 'Theme ocean fg' },
  { line: 12307, pattern: /muted:\s*'#7dd3fc'/, reason: 'Theme ocean muted' },
  { line: 12308, pattern: /accent:\s*'#0ea5e9'/, reason: 'Theme ocean accent' },
  { line: 12309, pattern: /accentGrad:\s*\['#0ea5e9',\s*'#38bdf8'\]/, reason: 'Theme ocean accentGrad' },
  { line: 12316, pattern: /bgGrad:\s*\['#061a14',\s*'#11382b'\]/, reason: 'Theme forest bgGrad' },
  { line: 12319, pattern: /fg:\s*'#f0fdf4'/, reason: 'Theme forest fg' },
  { line: 12320, pattern: /muted:\s*'#86efac'/, reason: 'Theme forest muted' },
  { line: 12321, pattern: /accent:\s*'#10b981'/, reason: 'Theme forest accent' },
  { line: 12322, pattern: /accentGrad:\s*\['#10b981',\s*'#34d399'\]/, reason: 'Theme forest accentGrad' },
  
  // ENTITY_PALETTE — couleurs par défaut pour joueurs/tops
  { line: 5653, pattern: /const ALT_FALLBACK_COLOR = '#ffd166';/, reason: 'ALT_FALLBACK_COLOR (constante globale)' },
  { line: 6464, pattern: /'#ff4757','#00d4aa','#ffd166',/, reason: 'Palette couleurs joueurs (lot 1)' },
  { line: 6465, pattern: /'#ff9f43','#10ac84','#5f27cd',/, reason: 'Palette couleurs joueurs (lot 2)' },
  { line: 6466, pattern: /'#f368e0','#54a0ff','#feca57',/, reason: 'Palette couleurs joueurs (lot 3)' },
  { line: 14601, pattern: /const groupColors = \['#6c63ff',/, reason: 'Palette couleurs groupes' },
  
  // CANVAS_TEXT — texte sur canvas
  { line: 13936, pattern: /color:#121824;\s*font-weight:800;/, reason: 'Option select text color on accent bg' },
  
  // HEALTH_GAUGE — jauge de santé cache
  { line: 11257, pattern: /colors:\s*\{\s*cold:\s*'#9aa5be',/, reason: 'Health gauge colors (cold/normal/warm/hot/blaze)' },
  
  // FILTER_CHIPS — chips de filtre historique
  { line: 15250, pattern: /makeChip\('🚫 Non Alt',\s*selectedHistAltCategories\.has\('__NONE__'\),\s*'#9aa5be'/, reason: 'Chip "Non Alt" fallback color (gris neutre)' },
];

test('hardcoded colors are limited to allowlisted usages', () => {
  const content = fs.readFileSync(INDEX, 'utf8');
  const lines = content.split('\n');
  
  // Extraire le JS (après </style>, dynamique pour supporter le code stripped en CI)
  const styleEndIdx = lines.findIndex(l => l.includes('</style>'));
  const jsStart = styleEndIdx !== -1 ? styleEndIdx : 4463;
  const jsLines = lines.slice(jsStart);
  
  const violations = [];
  const allowlistedLines = new Set(ALLOWLIST.map(a => a.line));
  
  jsLines.forEach((line, idx) => {
    const lineNum = idx + jsStart + 1;
    
    // Ignorer les commentaires
    if (line.trim().startsWith('//')) return;
    
    // Chercher les couleurs hex (#xxx ou #xxxxxx)
    const hexMatches = line.match(/#[0-9a-fA-F]{3,6}\b/g);
    if (hexMatches) {
      const isAllowed = allowlistedLines.has(lineNum) || ALLOWLIST.some(a => a.pattern && a.pattern.test(line));
      if (!isAllowed) {
        violations.push({
          line: lineNum,
          code: line.trim(),
          colors: hexMatches
        });
      }
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
