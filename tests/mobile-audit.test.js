'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { makeEnv, fire } = require('./dom-stub.js');

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

test('Meta viewport est conforme WCAG et sans blocage user-scalable', () => {
  assert.match(html, /<meta\s+name=["']viewport["']\s+content=["']width=device-width,\s*initial-scale=1\.0,\s*viewport-fit=cover["']\s*>/i);
  assert.doesNotMatch(html, /user-scalable=0/i, 'user-scalable=0 ne doit pas être présent');
  assert.doesNotMatch(html, /maximum-scale=1\.0/i, 'maximum-scale=1.0 ne doit pas être présent');
});

test('html et body verrouillent le débordement horizontal avec overflow-x: hidden', () => {
  assert.match(html, /html\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(html, /body\s*\{[^}]*overflow-x:\s*hidden/s);
});

test('Hiérarchie des z-index mobile : Toast (11000) au-dessus de Chat et Tiroir (10000) au-dessus de Bottom Nav (9000)', () => {
  const bottomNavBlock = block('.mobile-bottom-nav {', '.mobile-bottom-nav .nav-btn {');
  assert.match(bottomNavBlock, /z-index:\s*9000;/);

  const chatMobileBlock = block('body.mobile-layout .chat-side-panel', '/* Boutons contrôles droite */');
  assert.match(chatMobileBlock, /z-index:\s*10000;/);

  const baremeMobileBlock = block('body:not(.desktop-layout) .bareme-drawer {', 'body:not(.desktop-layout) .bareme-drawer.open');
  assert.match(baremeMobileBlock, /z-index:\s*10000;/);

  const toastBlock = block('#toastContainer {', 'body.desktop-layout #toastContainer');
  assert.match(toastBlock, /z-index:\s*11000;/);
});

test('Prévention du zoom iOS Safari : inputs à 16px sur mobile', () => {
  const mobileAutoBlock = block('/* ── Auto-detect mobile via media query (< 768px sans desktop-layout forcé) ── */', '</style>');
  assert.match(mobileAutoBlock, /font-size:\s*16px\s*!important/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+select/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+input\[type="text"\]/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+textarea/);
});

test('Mini-calendrier : cellules tactiles .d-cal-day de 32px de haut minimum sur mobile', () => {
  const mobileAutoBlock = block('/* ── Auto-detect mobile via media query (< 768px sans desktop-layout forcé) ── */', '</style>');
  assert.match(mobileAutoBlock, /\.d-cal-day\s*\{[^}]*height:\s*32px/s);
});

test('Tchat : actions visibles au toucher via @media (hover: none)', () => {
  const chatActionsBlock = block('.chat-msg-actions {', '.chat-msg-reply {');
  assert.match(chatActionsBlock, /@media\s*\(hover:\s*none\)\s*\{\s*\.chat-msg-actions\s*\{\s*opacity:\s*1;\s*\}\s*\}/);
});

test('Bannière CTA mobile : persistance de fermeture dans localStorage', () => {
  assert.match(html, /tdt_mobile_banner_dismissed/);
});

test('Navbar mobile : refresh-badge masqué et who-am-i-btn contraint sans chevauchement avec theme-toggle', () => {
  const topBarBlock = block('/* ══ TOP BAR MOBILE — source unique, sans duplication ══', '/* ── Auto-detect mobile via media query');
  assert.match(topBarBlock, /\.refresh-badge\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(topBarBlock, /\.who-am-i-btn\s*\{[^}]*max-width:\s*100%/s);
  assert.match(topBarBlock, /\.theme-toggle[^}]*margin:\s*0\s*!important/s);
});

test('Modales et exports : z-index à 10500 pour recouvrir la bottom nav (9000) et le chat (10000)', () => {
  const modalBackdropBlock = block('.modal-backdrop {', '.modal-box {');
  assert.match(modalBackdropBlock, /z-index:\s*10500;/);

  const exportOverlayBlock = block('.export-modal-overlay {', '.export-modal-box {');
  assert.match(exportOverlayBlock, /z-index:\s*10500;/);
});

test('Mention popup : z-index à 10001 au-dessus du tchat et écouteur tactile pointerdown', () => {
  const mentionPopupBlock = block('.md-mention-popup {', '.md-mention-item {');
  assert.match(mentionPopupBlock, /z-index:\s*10001;/);

  const mentionItemBlock = block('.md-mention-item {', '.md-mention-item img');
  assert.match(mentionItemBlock, /min-height:\s*40px;/);

  assert.match(html, /item\.addEventListener\(['"]pointerdown['"],\s*e\s*=>\s*\{\s*e\.preventDefault\(\);/);
});

test('Bottom nav mobile : calcul safe-area sur la hauteur et état tactile :active', () => {
  const bottomNavBlock = block('.mobile-bottom-nav {', '.mobile-bottom-nav .nav-btn {');
  assert.match(bottomNavBlock, /height:\s*calc\(62px\s*\+\s*env\(safe-area-inset-bottom/);

  const navBtnBlock = block('.mobile-bottom-nav .nav-btn:active {', '.mobile-bottom-nav .nav-btn.active');
  assert.match(navBtnBlock, /transform:\s*scale\(0\.92\)/);
});

test('Prévention du zoom iOS sur password et search inputs', () => {
  const mobileAutoBlock = block('/* ── Auto-detect mobile via media query (< 768px sans desktop-layout forcé) ── */', '</style>');
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+input\[type="password"\]/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+input\[type="search"\]/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+input#identityPwdInput/);
});

test('Podium des phrases : unifié à 768px avec règle micro-écrans <= 380px', () => {
  assert.match(html, /@media\s*\(max-width:\s*768px\)\s*\{\s*\.phrases-podium/);
  assert.match(html, /@media\s*\(max-width:\s*380px\)\s*\{\s*\.phrases-podium/);
});

test('Saisie ergonomique Notes et Lot : wrap 2 lignes et pleines largeurs sur mobile', () => {
  const mobileAutoBlock = block('/* ── Auto-detect mobile via media query (< 768px sans desktop-layout forcé) ── */', '</style>');
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+\.row-main-top-col\s*\{[^}]*width:\s*100%/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+\.pts-box-group\s*\{[^}]*width:\s*100%/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+\.notes-flash-input-row\s*\{[^}]*display:\s*flex;\s*flex-wrap:\s*wrap;/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+\.npb-add\s*\{[^}]*display:\s*flex;\s*flex-wrap:\s*wrap;/);
});

test('Actions tactiles inconditionnellement visibles sur mobile sans dépendre de hover:none', () => {
  const mobileAutoBlock = block('/* ── Auto-detect mobile via media query (< 768px sans desktop-layout forcé) ── */', '</style>');
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+\.hist-actions-cell\s*\{[^}]*opacity:\s*1\s*!important/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+\.chat-msg-actions\s*\{[^}]*opacity:\s*1\s*!important/);
});

test('Tchat mobile : FAB à z-index 9001 au-dessus de la nav (9000) et safe-area-inset-top sur panneau plein écran', () => {
  const chatFabBlock = block('body.mobile-layout .nav-chat-btn', 'body.mobile-layout .nav-chat-btn .chat-btn-label');
  assert.match(chatFabBlock, /z-index:\s*9001;/);

  const chatPanelBlock = block('body.mobile-layout .chat-side-panel', '/* Boutons contrôles droite */');
  assert.match(chatPanelBlock, /padding-top:\s*env\(safe-area-inset-top/);

  const mobileAutoBlock = block('/* ── Auto-detect mobile via media query (< 768px sans desktop-layout forcé) ── */', '</style>');
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+\.nav-chat-btn\s*\{[^}]*z-index:\s*9001;/);
  assert.match(mobileAutoBlock, /body:not\(\.desktop-layout\)\s+\.chat-side-panel\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top/);
});

test('Autocomplétion mentions : utilise visualViewport pour éviter d\'être caché sous le clavier virtuel', () => {
  assert.match(html, /const\s+viewH\s*=\s*\(window\.visualViewport\s*&&\s*window\.visualViewport\.height\)\s*\?\s*window\.visualViewport\.height\s*:\s*window\.innerHeight;/);
  assert.match(html, /popup\.style\.left\s*=\s*Math\.round\(Math\.max\(8,/);
  assert.match(html, /popup\.style\.maxHeight\s*=\s*maxH\s*\+\s*['"]px['"]/);
});

test('Popover d\'historique de note : respecte l\'offset de la bottom nav mobile et ne déborde pas', () => {
  assert.match(html, /const\s+navOffset\s*=\s*\(bottomNav\s*&&\s*getComputedStyle\(bottomNav\)\.display\s*!==\s*['"]none['"]\)/);
  assert.match(html, /spaceBelow\s*=\s*viewH\s*-\s*navOffset\s*-\s*rect\.bottom;/);
  assert.match(html, /node\.style\.maxHeight\s*=\s*Math\.max\(160,\s*Math\.min\(340,\s*viewH\s*-\s*navOffset\s*-\s*24\)\)\s*\+\s*['"]px['"];/);
});

test('Cibles tactiles avancées : conformité WCAG sur les filtres, modes, exports et raccourcis de date', () => {
  const mobileAutoBlock = block('/* ── Auto-detect mobile via media query (< 768px sans desktop-layout forcé) ── */', '</style>');
  assert.match(mobileAutoBlock, /\.date-shortcut\s*\{[^}]*min-height:\s*38px;/);
  assert.match(mobileAutoBlock, /\.seg-btn\s*\{[^}]*min-height:\s*var\(--tap-min\);/);
  assert.match(mobileAutoBlock, /\.row-shortcuts\s+\.row-shortcut\s*\{[^}]*min-height:\s*36px;/);
  assert.match(mobileAutoBlock, /\.hist-fchip\s*\{[^}]*min-height:\s*var\(--tap-min\);/);
  assert.match(mobileAutoBlock, /\.export-pill\s*\{[^}]*min-height:\s*38px;/);

  const mobileLayoutBlock = block('/* ── Disposition générale mode mobile ── */', '/* Bottom nav :');
  assert.match(mobileLayoutBlock, /\.export-pill\s*\{[^}]*min-height:\s*38px;/);
  assert.match(mobileLayoutBlock, /\.hist-fchip\s*\{[^}]*min-height:\s*var\(--tap-min\);/);
});

test('Formulaires Notes et resizer : flex order ordonné et masquage du resizer sur mobile', () => {
  const mobileAutoBlock = block('/* ── Auto-detect mobile via media query (< 768px sans desktop-layout forcé) ── */', '</style>');
  assert.match(mobileAutoBlock, /\.notes-flash-input-row\s+input\[type="text"\]\s*\{[^}]*order:\s*1;/);
  assert.match(mobileAutoBlock, /\.notes-flash-date-field\s*\{[^}]*order:\s*2;/);
  assert.match(mobileAutoBlock, /\.notes-flash-input-row\s+\.notes-flash-date-toggle\s*\{[^}]*order:\s*3;/);
  assert.match(mobileAutoBlock, /\.notes-flash-input-row\s+button\.primary\s*\{[^}]*order:\s*4;/);
  assert.match(html, /body:not\(\.desktop-layout\)\s+\.bareme-resizer,\s*body\.mobile-layout\s+\.bareme-resizer\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('Modales et export : intégration de safe-area-inset pour encoche et îlot dynamique', () => {
  const modalBlock = block('.modal-backdrop {', '.modal-box {');
  assert.match(modalBlock, /padding:\s*max\(16px,\s*env\(safe-area-inset-top/);

  const exportBlock = block('.export-modal-overlay {', '.export-modal-box {');
  assert.match(exportBlock, /padding:\s*max\(16px,\s*env\(safe-area-inset-top/);
});

test('Test fonctionnel approfondi : anchorFloating gère les instances concurrentes sans écraser les écouteurs visualViewport', () => {
  const env = makeEnv({ visualViewport: { height: 400, width: 360 } });
  vm.createContext(env);
  const code = extractFunction(html, 'anchorFloating');
  vm.runInContext(code, env);

  const a1 = env.makeEl('button');
  const f1 = env.makeEl('div');
  let placed1 = 0, placed2 = 0;
  const d1 = env.anchorFloating(f1, a1, () => { placed1++; });

  const a2 = env.makeEl('button');
  const f2 = env.makeEl('div');
  const d2 = env.anchorFloating(f2, a2, () => { placed2++; });

  assert.strictEqual(env.window.visualViewport._listeners.resize.length, 2, '2 écouteurs resize actifs');
  assert.strictEqual(env.window.visualViewport._listeners.scroll.length, 2, '2 écouteurs scroll actifs');

  // Détachement de la première instance
  d1();
  assert.strictEqual(env.window.visualViewport._listeners.resize.length, 1, '1 écouteur reste après premier detach');

  // Déclenchement d'un événement visualViewport : la seconde instance doit toujours réagir
  fire(env.window.visualViewport, 'resize');
  assert.strictEqual(placed2, 2, 'instance 2 répond toujours après le détachement de instance 1');

  d2();
  assert.strictEqual(env.window.visualViewport._listeners.resize.length, 0, 'tout est nettoyé sans fuite');
  assert.strictEqual(env.window.visualViewport._listeners.scroll.length, 0, 'tout est nettoyé sans fuite');
});

test('Test fonctionnel approfondi : autocomplétion des mentions avec clavier virtuel (visualViewport réduit à 300px)', () => {
  const env = makeEnv({ visualViewport: { height: 300, width: 360 } });
  env.getAvatarUrl = () => '';
  vm.createContext(env);
  const code = extractFunction(html, 'anchorFloating') + '\n' + extractFunction(html, 'attachMentionAutocomplete');
  vm.runInContext(code, env);

  env.cachedPlayers = [{ name: 'Thomas', color: '#3366ff' }, { name: 'Arthur', color: '#ff3366' }];
  env.cachedCategories = [];

  const inp = env.makeEl('input');
  inp.value = '@th';
  inp.selectionStart = 3;
  // Champ situé au milieu de l'écran (top: 140, bottom: 180)
  inp._rect = { top: 140, bottom: 180, left: 10, right: 200, width: 190, height: 40 };

  const aut = env.attachMentionAutocomplete(inp);
  fire(inp, 'input');

  const popups = env.document.body.children.filter(c => c.classList.contains('md-mention-popup'));
  assert.strictEqual(popups.length, 1, 'Le popup de mentions est injecté');
  const popup = popups[0];

  const topVal = parseInt(popup.style.top, 10);
  const maxHVal = parseInt(popup.style.maxHeight, 10);

  // Vérifications strictes : le popup ne doit ni dépasser en haut (>= 8px) ni sous le clavier (top + maxH <= 300px)
  assert.ok(topVal >= 8, 'top doit être >= 8px');
  assert.ok(topVal + maxHVal <= 300, 'Le popup et son contenu restent entièrement visibles au-dessus du clavier virtuel');

  aut.destroy();
  assert.strictEqual(env.window.visualViewport._listeners.resize.length, 0, 'Autocomplétion détruite sans fuite');
});



