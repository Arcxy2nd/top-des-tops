'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { makeEnv } = require('./dom-stub.js');

const INDEX = path.join(__dirname, '..', 'Index.html');

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

function loadFns(names, envOpts) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const env = makeEnv(envOpts);
  const origMakeEl = env.makeEl;
  env.makeEl = (tag, id) => {
    const el = origMakeEl(tag, id);
    if (el && el.style && !el.style.setProperty) {
      el.style.setProperty = (k, v) => { el.style[k] = v; };
    }
    return el;
  };
  env.document.createElement = tag => env.makeEl(tag);
  vm.createContext(env);
  const src = names.map(n => extractFunction(html, n)).join('\n') +
              '\n' + names.map(n => 'this.__' + n + ' = ' + n + ';').join('\n');
  vm.runInContext(src, env);
  const out = { env, html };
  names.forEach(n => { out[n] = env['__' + n]; });
  return out;
}

function collectText(node) {
  if (!node) return '';
  let str = node.textContent || '';
  if (Array.isArray(node.children)) {
    str += ' ' + node.children.map(collectText).join(' ');
  }
  return str;
}

test('renderMentions detects mentions inside parentheses (@Player) and brackets [@Player]', () => {
  const { renderMentions, env } = loadFns(['escapeRegExp', 'renderMentions', 'escapeHtml']);
  env.cachedPlayers = [
    { name: 'Safir', meta: 'safir.png', color: '#9b59b6' },
    { name: 'Ilker', meta: 'ilker.png', color: '#2ecc71' }
  ];
  env.playerColor = name => (name === 'Safir' ? '#9b59b6' : '#2ecc71');
  env.getAvatarUrl = (name, meta) => meta || 'default.png';

  const text1 = 'D\'après (@Safir) c\'est bon';
  const out1 = renderMentions(text1);
  assert.ok(out1.includes('class="mention"'), 'Mention (@Safir) détectée avec succès');
  assert.ok(out1.includes('data-player="Safir"'), 'Joueur Safir associé');
  assert.ok(out1.includes('style="--mention-color:#9b59b6"'), 'Couleur du joueur injectée');

  const text2 = 'Voir [@Ilker] pour validation';
  const out2 = renderMentions(text2);
  assert.ok(out2.includes('class="mention"'), 'Mention [@Ilker] détectée avec succès');
  assert.ok(out2.includes('data-player="Ilker"'), 'Joueur Ilker associé');
});

test('buildNoteCard generates redesigned .note-card-bg background avatar with proper styling', () => {
  const { buildNoteCard, env } = loadFns([
    'cssUrl', 'escapeRegExp', 'escapeHtml', 'renderMarkdown', 'renderMentions', 'renderCategoryMentions',
    'relativeDateLabel', 'buildNoteAuthorAvatar', 'buildNoteCard', 'getAvatarUrl'
  ]);
  env.cachedPlayers = [
    { name: 'Safir', meta: 'safir.png', color: '#9b59b6' },
    { name: 'Ilker', meta: 'ilker.png', color: '#2ecc71' }
  ];
  env.playerColor = name => (name === 'Safir' ? '#9b59b6' : '#2ecc71');
  env.cachedCategories = [];

  const note = {
    player: 'Safir',
    text: 'Note de test avec filigrane repensé',
    timestamp: '2026-09-20T10:00:00Z',
    createdBy: 'Ilker',
    noteId: 'n_1'
  };

  const card = buildNoteCard(note);
  const bg = card.children.find(c => c.className && c.className.includes('note-card-bg'));
  assert.ok(bg, 'L\'élément .note-card-bg doit être présent dans la carte');
  assert.ok(bg.style.backgroundImage && bg.style.backgroundImage.includes('safir.png'), 'L\'avatar d\'arrière-plan correspond au joueur de la note');
});

test('buildNoteAuthorAvatar applies player color ring and buildNoteCard cleans footer text', () => {
  const { buildNoteCard, env } = loadFns([
    'cssUrl', 'escapeRegExp', 'escapeHtml', 'renderMarkdown', 'renderMentions', 'renderCategoryMentions',
    'relativeDateLabel', 'buildNoteAuthorAvatar', 'buildNoteCard', 'getAvatarUrl'
  ]);
  env.cachedPlayers = [
    { name: 'Safir', meta: 'safir.png', color: '#9b59b6' },
    { name: 'Ilker', meta: 'ilker.png', color: '#2ecc71' }
  ];
  env.playerColor = name => (name === 'Safir' ? '#9b59b6' : '#2ecc71');
  env.cachedCategories = [];

  const note = {
    player: 'Safir',
    text: 'Note avec auteur et modificateur',
    timestamp: '2026-09-20T10:00:00Z',
    createdBy: 'Ilker',
    lastEditedBy: 'Safir',
    lastEditedAt: '2026-09-21T12:00:00Z',
    noteId: 'n_2'
  };

  const card = buildNoteCard(note);
  const footer = card.children.find(c => c.className === 'note-footer');
  assert.ok(footer, 'Footer présent');
  const meta = footer.children.find(c => c.className === 'note-meta');
  assert.ok(meta, 'Meta présent');

  // Vérifier qu'il n'y a plus d'emoji redondant ✍️ ou 📝 dans les labels
  const textContent = collectText(meta);
  assert.ok(!textContent.includes('✍️'), 'Pas d\'emoji ✍️ redondant dans le footer');
  assert.ok(!textContent.includes('📝'), 'Pas d\'emoji 📝 redondant dans le footer');
  assert.ok(textContent.includes('Créé par'), 'Texte Créé par conservé');
  assert.ok(textContent.includes('Modifié par'), 'Texte Modifié par conservé');

  // Vérifier l'anneau coloré sur l'avatar de l'auteur
  const authorImg = meta.children[0].children.find(c => c.className === 'note-meta-avatar');
  assert.ok(authorImg, 'Avatar auteur présent');
  assert.ok(authorImg.style.boxShadow.includes('#2ecc71'), 'Avatar auteur cerclé à la couleur d\'Ilker');
});

test('buildPlayerNoteBlock sets --player-color on column block', () => {
  const { buildPlayerNoteBlock, env } = loadFns([
    'escapeHtml', 'attachMentionAutocomplete', 'getAvatarUrl', 'buildPlayerNoteBlock'
  ]);
  env.attachMentionAutocomplete = () => {};
  env._notesSearchQuery = '';
  env.playerColor = name => (name === 'Antoine' ? '#3498db' : '#ffffff');

  const playerBlock = buildPlayerNoteBlock({ name: 'Antoine', meta: 'antoine.png' }, []);
  assert.strictEqual(playerBlock.style['--player-color'], '#3498db', '--player-color doit être positionné sur le bloc');
});

test('CSS rules ensure avatar rings and mask gradients', () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  // .note-card-bg et .notes-flash-avatar-bg portent un masque dégradé moderne
  assert.ok(html.includes('.note-card-bg {'), 'Classe .note-card-bg définie');
  assert.ok(html.includes('mask-image: linear-gradient(to left, black 25%, rgba(0,0,0,0.6) 60%, transparent 95%)'), 'Masque dégradé sur les filigranes');

  // .note-player-block porte une bordure supérieure aux couleurs du joueur
  assert.ok(html.includes('border-top: 3px solid var(--player-color, var(--border))'), 'Liseré de bloc aux couleurs du joueur');

  // .npb-head img est cerclé
  assert.ok(html.includes('box-shadow: 0 0 0 2.5px var(--player-color, var(--border))'), 'Avatar de colonne cerclé aux couleurs du joueur');
});

test('podium background avatars feature rank-specific metallic styling, champion pulse and mask gradient', () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  // .phrase-podium-bg-avatar est configuré avec masque dégradé et dimensions
  assert.ok(html.includes('.phrase-podium-bg-avatar {'), 'Classe .phrase-podium-bg-avatar définie');
  assert.ok(html.includes('object-fit: cover; object-position: center top;'), 'Avatar d\'arrière-plan podium cadré proprement');

  // Traitement spécial Champion (Or) avec aura animée
  assert.ok(html.includes('.podium-column.rank-1 .phrase-podium-bg-avatar {'), 'Sélecteur champion rank-1 présent');
  assert.ok(html.includes('@keyframes championAvatarAura'), 'Animation d\'aura du champion définie');
  assert.ok(html.includes('animation: championAvatarAura'), 'Animation d\'aura appliquée au rank-1');

  // Traitement Argent et Bronze avec drop-shadows métalliques
  assert.ok(html.includes('.podium-column.rank-2 .phrase-podium-bg-avatar {'), 'Sélecteur dauphin rank-2 présent');
  assert.ok(html.includes('.podium-column.rank-3 .phrase-podium-bg-avatar {'), 'Sélecteur 3ème place rank-3 présent');

  // Isolation z-index pour garantir la lisibilité du texte du podium
  assert.ok(html.includes('.phrase-podium-card > :not(.phrase-podium-bg-avatar) {'), 'Isolation z-index des enfants de la carte podium');
});

