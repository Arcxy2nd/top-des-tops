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
