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

function loadFns(names) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const env = makeEnv();
  env.cachedPlayers = [];
  env.cachedCategories = [];
  env.escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  env.escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  env.renderMentions = (s) => s;
  env.renderCategoryMentions = (s) => s;

  vm.createContext(env);
  const src = names.map(n => extractFunction(html, n)).join('\n') +
              '\n' + names.map(n => 'this.__' + n + ' = ' + n + ';').join('\n');
  vm.runInContext(src, env);
  const out = { env };
  names.forEach(n => { out[n] = env['__' + n]; });
  return out;
}

test('renderMarkdown : inline code ne corrompt pas les placeholders en INLINECODE avec des underscores', () => {
  const { renderMarkdown } = loadFns(['renderMarkdown']);

  const input = '- *Mode sélection in-memory (0 ms)* : mise en cache du résultat de page (`_lastHistPageRes`) permettant à `toggleHistSelectMode()` de re-rendre immédiatement via `_renderHistoryPage()_` sans roundtrip';
  const out = renderMarkdown(input);

  assert.ok(!out.includes('INLINECODE'), 'Le rendu ne doit jamais laisser fuiter de token INLINECODE : ' + out);
  assert.ok(out.includes('<code>_lastHistPageRes</code>'), 'Le code inline _lastHistPageRes doit être correctement enveloppé');
  assert.ok(out.includes('<code>toggleHistSelectMode()</code>'), 'Le code inline toggleHistSelectMode() doit être correctement enveloppé');
  assert.ok(out.includes('<code>_renderHistoryPage()_</code>'), 'Le code inline _renderHistoryPage()_ doit être correctement enveloppé');
  assert.ok(out.includes('<em>Mode sélection in-memory (0 ms)</em>'), 'Le texte en italique doit être conservé');
});

test('filterChangelogCatBody : sépare strictement le contenu humanisé du contenu technique', () => {
  const { filterChangelogCatBody } = loadFns(['filterChangelogCatBody']);

  const catBody = `**Humanisé** : Le mode de sélection d'historique passe à la vitesse supérieure.
**Technique** : \`Index.html\` —
- *Point 1* : première amélioration technique
- *Point 2* : deuxième amélioration technique

**Humanisé** : Deuxième changement lisible.
**Technique** : \`Code.gs\` —
- *Point 3* : troisième amélioration`;

  // Vue Humanisé : ne doit contenir AUCUNE puce technique ni nom de fichier
  const humanOut = filterChangelogCatBody(catBody, 'human');
  assert.ok(humanOut.includes("Le mode de sélection d'historique passe à la vitesse supérieure."), 'Doit inclure le texte humanisé 1');
  assert.ok(humanOut.includes('Deuxième changement lisible.'), 'Doit inclure le texte humanisé 2');
  assert.ok(!humanOut.includes('Index.html'), 'Ne doit pas inclure les fichiers techniques');
  assert.ok(!humanOut.includes('Point 1'), 'Ne doit pas inclure les puces techniques');
  assert.ok(!humanOut.includes('Code.gs'), 'Ne doit pas inclure le fichier technique 2');

  // Vue Technique : ne doit contenir AUCUN texte humanisé
  const techOut = filterChangelogCatBody(catBody, 'tech');
  assert.ok(!techOut.includes("Le mode de sélection d'historique passe à la vitesse supérieure."), 'Ne doit pas inclure le texte humanisé 1');
  assert.ok(!techOut.includes('Deuxième changement lisible.'), 'Ne doit pas inclure le texte humanisé 2');
  assert.ok(techOut.includes('Index.html'), 'Doit inclure le fichier technique 1');
  assert.ok(techOut.includes('Point 1'), 'Doit inclure la puce technique 1');
  assert.ok(techOut.includes('Code.gs'), 'Doit inclure le fichier technique 2');
  assert.ok(techOut.includes('Point 3'), 'Doit inclure la puce technique 3');

  // Vue All : préserve l'intégralité
  const allOut = filterChangelogCatBody(catBody, 'all');
  assert.strictEqual(allOut, catBody);
});

test('formatChangelogBody : structure les voix Humanisé et Technique dans des boîtes visuelles dédiées', () => {
  const { formatChangelogBody } = loadFns(['renderMarkdown', 'formatChangelogBody']);

  const bodyContent = `### Ajouté
**Humanisé** : Description claire pour l'utilisateur.
**Technique** : \`Index.html\` —
- *Item* : détail technique`;

  const html = formatChangelogBody(bodyContent);

  assert.ok(html.includes('cl-category-section'), 'Doit contenir la section de catégorie');
  assert.ok(html.includes('cl-sec-header cl-added'), 'Doit contenir l\'en-tête Ajouté');
  assert.ok(html.includes('cl-voice-entry cl-voice-human'), 'Doit contenir le conteneur Humanisé dédié');
  assert.ok(html.includes('cl-voice-entry cl-voice-tech'), 'Doit contenir le conteneur Technique dédié');
  assert.ok(html.includes('<span class="cl-tag cl-human">👤 Humanisé</span>'), 'Doit afficher le badge Humanisé');
  assert.ok(html.includes('<span class="cl-tag cl-tech">💻 Technique</span>'), 'Doit afficher le badge Technique');
  assert.ok(html.includes('<code>Index.html</code>'), 'Doit restituer le code formaté');
  assert.ok(!html.includes('INLINECODE'), 'Aucun token INLINECODE brut ne doit être présent');
});
