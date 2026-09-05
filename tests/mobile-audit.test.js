'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const INDEX = path.join(__dirname, '..', 'Index.html');
const html  = fs.readFileSync(INDEX, 'utf8');

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


