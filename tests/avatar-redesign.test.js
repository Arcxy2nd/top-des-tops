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

test('buildNoteCard does not generate .note-card-bg watermark', () => {
  const { buildNoteCard, env } = loadFns([
    'escapeRegExp', 'escapeHtml', 'renderMarkdown', 'renderMentions', 'renderCategoryMentions',
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
    text: 'Note de test sans filigrane',
    timestamp: '2026-09-20T10:00:00Z',
    createdBy: 'Ilker',
    noteId: 'n_1'
  };

  const card = buildNoteCard(note);
  const bg = card.children.find(c => c.className && c.className.includes('note-card-bg'));
  assert.strictEqual(bg, undefined, 'Aucun élément .note-card-bg ne doit être présent dans la carte');
});

test('buildNoteAuthorAvatar applies player color ring and buildNoteCard cleans footer text', () => {
  const { buildNoteCard, env } = loadFns([
    'escapeRegExp', 'escapeHtml', 'renderMarkdown', 'renderMentions', 'renderCategoryMentions',
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

  // .notes-flash-avatar-bg porte un masque dégradé
  assert.ok(html.includes('mask-image: linear-gradient(to right, transparent 0%, black 80%)'), 'Masque dégradé sur le filigrane flash');

  // .note-player-block porte une bordure supérieure aux couleurs du joueur
  assert.ok(html.includes('border-top: 3px solid var(--player-color, var(--border))'), 'Liseré de bloc aux couleurs du joueur');

  // .npb-head img est cerclé
  assert.ok(html.includes('box-shadow: 0 0 0 2.5px var(--player-color, var(--border))'), 'Avatar de colonne cerclé aux couleurs du joueur');
});
