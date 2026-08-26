'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { makeEnv } = require('./dom-stub.js');

const INDEX = path.join(__dirname, '..', 'Index.html');

// Même contrat d'extraction que tests/frontend-guards.test.js : on sort une
// fonction nommée du <script> inline d'Index.html en comptant les accolades.
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
  vm.createContext(env);
  const src = names.map(n => extractFunction(html, n)).join('\n') +
              '\n' + names.map(n => 'this.__' + n + ' = ' + n + ';').join('\n');
  vm.runInContext(src, env);
  const out = { env };
  names.forEach(n => { out[n] = env['__' + n]; });
  return out;
}

test('anchorFloating repositionne l\'élément quand la page défile', () => {
  const { anchorFloating, env } = loadFns(['anchorFloating']);
  const anchor = env.makeEl('button');
  const floater = env.makeEl('div');
  anchor._rect = { top: 100, bottom: 120, left: 50, right: 150, width: 100, height: 20 };

  anchorFloating(floater, anchor, (rect, el) => { el.style.top = rect.bottom + 'px'; });
  assert.strictEqual(floater.style.top, '120px', 'positionné une première fois à l\'attache');

  anchor._rect = { top: 40, bottom: 60, left: 50, right: 150, width: 100, height: 20 };
  env.fire(env.document, 'scroll', true);
  assert.strictEqual(floater.style.top, '60px', 'recalé après défilement');
});

test('anchorFloating repositionne au redimensionnement de la fenêtre', () => {
  const { anchorFloating, env } = loadFns(['anchorFloating']);
  const anchor = env.makeEl('button');
  const floater = env.makeEl('div');
  anchor._rect = { top: 100, bottom: 120, left: 0, right: 100, width: 100, height: 20 };

  anchorFloating(floater, anchor, (rect, el) => { el.style.top = rect.bottom + 'px'; });
  anchor._rect = { top: 200, bottom: 220, left: 0, right: 100, width: 100, height: 20 };
  (env.window._listeners.resize || []).forEach(fn => fn({}));
  assert.strictEqual(floater.style.top, '220px');
});

test('anchorFloating appelle onDetach et se débranche quand l\'ancre quitte l\'écran', () => {
  const { anchorFloating, env } = loadFns(['anchorFloating'], { innerHeight: 800 });
  const anchor = env.makeEl('button');
  const floater = env.makeEl('div');
  anchor._rect = { top: 100, bottom: 120, left: 0, right: 100, width: 100, height: 20 };

  let detached = 0;
  anchorFloating(floater, anchor, () => {}, () => { detached++; });
  assert.strictEqual(env.listenerCount(env.document, 'scroll', true), 1);

  anchor._rect = { top: -80, bottom: -60, left: 0, right: 100, width: 100, height: 20 };
  env.fire(env.document, 'scroll', true);

  assert.strictEqual(detached, 1, 'onDetach appelé quand l\'ancre sort par le haut');
  assert.strictEqual(env.listenerCount(env.document, 'scroll', true), 0, 'écouteur scroll retiré');
  assert.strictEqual((env.window._listeners.resize || []).length, 0, 'écouteur resize retiré');
});

test('anchorFloating : detach() retire tout et est idempotent', () => {
  const { anchorFloating, env } = loadFns(['anchorFloating']);
  const anchor = env.makeEl('button');
  const floater = env.makeEl('div');
  anchor._rect = { top: 10, bottom: 30, left: 0, right: 100, width: 100, height: 20 };

  const detach = anchorFloating(floater, anchor, () => {});
  assert.strictEqual(env.listenerCount(env.document, 'scroll', true), 1);
  assert.strictEqual((env.window._listeners.resize || []).length, 1);

  detach();
  detach();
  assert.strictEqual(env.listenerCount(env.document, 'scroll', true), 0);
  assert.strictEqual((env.window._listeners.resize || []).length, 0);
});

test('anchorFloating ne fuit sur aucun des 20 cycles attache/détache', () => {
  const { anchorFloating, env } = loadFns(['anchorFloating']);
  const anchor = env.makeEl('button');
  anchor._rect = { top: 10, bottom: 30, left: 0, right: 100, width: 100, height: 20 };

  for (let i = 0; i < 20; i++) {
    const floater = env.makeEl('div');
    const detach = anchorFloating(floater, anchor, () => {});
    detach();
  }
  assert.strictEqual(env.listenerCount(env.document, 'scroll', true), 0);
  assert.strictEqual((env.window._listeners.resize || []).length, 0);
});

test('plus aucun élément ancré ne câble ses propres écouteurs scroll/resize', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const script = html.slice(html.indexOf('<script>'));

  // Tout câblage scroll/resize laissé à la main est un bug de repositionnement
  // en attente. Les seuls tolérés : anchorFloating lui-même, la liste de
  // messages du tchat (sa propre pagination), la bulle de survol de la nav
  // (elle se cache, ne suit pas) et autoGrowTextarea (refit, sans ancre).
  const raw = script.split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(o => /addEventListener\((['"])(scroll|resize)\1/.test(o.line));

  const allowed = [
    /messagesEl\.addEventListener/,
    /group\.addEventListener/,
    /window\.addEventListener\((['"])resize\1, fit\)/,
    /document\.addEventListener\((['"])scroll\1, reposition, true\)/,
    /window\.addEventListener\((['"])resize\1, reposition\)/
  ];
  const stray = raw.filter(o => !allowed.some(re => re.test(o.line)));
  assert.deepStrictEqual(stray.map(o => o.line), [],
    'ces écouteurs doivent passer par anchorFloating');
});

test('attachMentionAutocomplete expose destroy() et suit son champ', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'attachMentionAutocomplete');
  assert.match(src, /destroy/, 'attachMentionAutocomplete doit exposer destroy()');
  assert.match(src, /anchorFloating\(/, 'le popup doit être ancré à son champ');
  assert.doesNotMatch(src, /addEventListener\((['"])scroll\1, hide/,
    'le popup de mention doit suivre son champ, plus se cacher au défilement');
});

test('autoGrowTextarea expose destroy() sur son handle de refit', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'autoGrowTextarea');
  assert.match(src, /fit\.destroy\s*=/, 'le handle de refit doit porter destroy()');
  assert.match(src, /removeEventListener\((['"])resize\1, fit\)/,
    'destroy() doit retirer l\'écouteur resize global');
});

test('buildTextEditor expose _destroy() et débranche ses deux sous-widgets', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'buildTextEditor');
  assert.match(src, /wrap\._destroy\s*=/, 'buildTextEditor doit exposer _destroy()');
  assert.match(src, /mention\.destroy\(\)/, '_destroy doit débrancher l\'autocomplétion');
  assert.match(src, /refit\.destroy\(\)/, '_destroy doit débrancher l\'auto-dimensionnement');
});

test('closeModal détruit les éditeurs de la fenêtre qu\'il ferme', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'closeModal');
  assert.match(src, /_destroy/, 'closeModal doit appeler _destroy() sur les éditeurs de la fenêtre');
});

const MODAL_CONTAINERS = [
  'modalBackdrop', 'phraseEditModal', 'presetCreateModal',
  'presetRenameModal', 'bulkImportModal', 'identityPwdModal'
];

test('aucune fenêtre ne s\'ouvre en poussant directement son display', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const script = html.slice(html.indexOf('<script>'));
  const re = new RegExp("getElementById\\('(" + MODAL_CONTAINERS.join('|') + ")'\\)\\.style\\.display = 'flex'");
  const direct = script.split('\n').map(l => l.trim()).filter(l => re.test(l));
  assert.deepStrictEqual(direct, [],
    'toutes les ouvertures doivent passer par openModal() : sinon ni verrou de défilement, ni focus, ni piège de focus');
});

test('openModal empile, verrouille le défilement, donne le focus et mémorise l\'ouvreur', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'openModal');
  assert.match(src, /_modalStack\.push/, 'doit empiler le conteneur ouvert');
  assert.match(src, /classList\.add\((['"])modal-open\1\)/, 'doit verrouiller le défilement du body');
  assert.match(src, /activeElement/, 'doit mémoriser le bouton qui a ouvert la fenêtre');
  assert.match(src, /\.focus\(\)/, 'doit donner le focus, sinon Échap est mort');
});

test('closeModal dépile, déverrouille le défilement et rend le focus', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'closeModal');
  assert.match(src, /_modalStack/, 'doit dépiler le conteneur');
  assert.match(src, /classList\.remove\((['"])modal-open\1\)/, 'doit déverrouiller le défilement');
  assert.match(src, /opener/, 'doit rendre le focus au bouton d\'origine');
});

test('closeModal() sans argument ou appelé comme listener d\'événement vise la fenêtre partagée sans planter', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'closeModal');
  assert.match(src, /document\.getElementById\('modalBackdrop'\)/,
    'les ~40 appels nus closeModal() ou callbacks doivent continuer à viser #modalBackdrop');

  const env = makeEnv();
  const backdrop = env.register('modalBackdrop', env.makeEl('div', 'modalBackdrop'));
  const box = env.register('modalBox', env.makeEl('div', 'modalBox'));
  backdrop.appendChild(box);

  vm.createContext(env);
  const code = 'const _modalStack = []; function closeAllRichSelects() {}\n' +
    extractFunction(html, 'openModal') + '\n' +
    extractFunction(html, 'closeModal') + '\n' +
    'this.__openModal = openModal;\nthis.__closeModal = closeModal;';
  vm.runInContext(code, env);

  // 1. openModal() puis closeModal() sans argument
  env.__openModal();
  assert.strictEqual(backdrop.style.display, 'flex');
  env.__closeModal();
  assert.strictEqual(backdrop.style.display, 'none');

  // 2. openModal() puis closeModal(event) (simulation clic sur mCancel ou mRecapClose)
  env.__openModal();
  assert.strictEqual(backdrop.style.display, 'flex');
  assert.doesNotThrow(() => {
    env.__closeModal({ type: 'click', target: {}, preventDefault() {} });
  }, 'closeModal ne doit pas planter quand un objet Event lui est passé');
  assert.strictEqual(backdrop.style.display, 'none');
});

test('body.modal-open coupe le défilement et chaque conteneur est focusable', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.match(html, /body\.modal-open\s*\{[^}]*overflow:\s*hidden/,
    'body.modal-open doit couper le défilement de la page');
  ['modalBox'].concat(MODAL_CONTAINERS.filter(id => id !== 'modalBackdrop')).forEach(id => {
    const tag = new RegExp('id="' + id + '"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="' + id + '"');
    assert.match(html, tag, '#' + id + ' doit être focusable pour recevoir Échap / Tab');
  });
});

test('un seul handler clavier sert toutes les fenêtres, via la pile', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'onModalKeydown');
  assert.match(src, /_modalStack\[_modalStack\.length - 1\]/,
    'le handler doit agir sur la fenêtre active (haut de pile)');
  assert.match(src, /e\.key === 'Escape'/, 'doit gérer Échap');
  assert.match(src, /e\.key !== 'Tab'/, 'doit gérer Tab');
  assert.match(src, /shiftKey/, 'doit gérer Maj+Tab');
  assert.match(src, /querySelectorAll/,
    'les champs doivent être cherchés au moment du Tab : le contenu est reconstruit à chaque ouverture');
});

test('le sélecteur focusable exclut les contrôles désactivés et tabindex="-1"', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const m = /const MODAL_FOCUSABLE_SEL = '([^']+)'/.exec(html);
  assert.ok(m, 'MODAL_FOCUSABLE_SEL doit être une constante littérale');
  assert.match(m[1], /:not\(\[disabled\]\)/, 'doit exclure les contrôles désactivés');
  assert.match(m[1], /tabindex="-1"/, 'doit exclure tabindex="-1"');
});

test('plus aucun handler Échap par champ : le handler global les remplace', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const script = html.slice(html.indexOf('<script>'));
  const perInput = script.split('\n').map(l => l.trim()).filter(l =>
    /e\.key === 'Escape'/.test(l) && /close(Phrase|CreatePreset|RenamePreset|IdentityPwd)Modal/.test(l));
  assert.deepStrictEqual(perInput, [],
    'ces Échap par champ font doublon avec onModalKeydown et ne marchaient que le focus dans le champ');
});

test('la fenêtre Export rejoint la pile des fenêtres et n\'a plus de cycle de vie maison', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'openExportModal');
  assert.match(src, /openModal\(overlay/, 'l\'overlay Export doit passer par openModal()');
  assert.match(src, /closeModal\(overlay\)/, 'sa fermeture doit passer par closeModal()');
  assert.doesNotMatch(src, /overlay\.remove\(\)/,
    'plus de retrait direct : closeModal() dépile, déverrouille et rend le focus');
  assert.match(src, /overlay\.tabIndex = -1/, 'l\'overlay doit être focusable pour recevoir le clavier');
});

test('une fenêtre construite à la volée quitte le DOM à la fermeture', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const close = extractFunction(html, 'closeModal');
  assert.match(close, /modal\._ephemeral.*modal\.remove\(\)/s,
    'closeModal doit retirer du DOM les conteneurs éphémères, sinon ils s\'accumulent');
  const exp = extractFunction(html, 'openExportModal');
  assert.match(exp, /overlay\._ephemeral = true/,
    'l\'overlay Export est reconstruit à chaque ouverture : il doit être marqué éphémère');
});

test('Tab depuis le cadre lui-même entre dans la fenêtre au lieu d\'en sortir', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'onModalKeydown');
  assert.match(src, /focusables\.indexOf\(active\) === -1/,
    'un focus hors de la liste (cadre lui-même, ou page derrière) doit être ramené dans la fenêtre');
});

test('rouvrir une fenêtre déjà ouverte ne l\'empile pas deux fois', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'openModal');
  assert.match(src, /_modalStack\.some\(/,
    'openModal doit refuser d\'empiler deux fois le même conteneur : sinon closeModal ne dépile qu\'à moitié et le verrou de défilement ne saute jamais');
});

test('la pile garde conteneur et ouvreur dans le même objet', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const open = extractFunction(html, 'openModal');
  assert.match(open, /\{ el: modal, opener: document\.activeElement \}/,
    'deux tableaux parallèles finiraient par se désynchroniser');
  assert.doesNotMatch(html, /_modalReturnFocus/,
    'le tableau parallèle ne doit plus exister');
});

test('les fonctions asynchrones gardent leurs callbacks avec typeof === function', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const fns = ['applyFilters', 'loadEntities', 'loadAppBranding', 'loadCustomPhrases', 'loadAltHistoryMap', 'anchorFloating'];
  fns.forEach(fn => {
    const src = extractFunction(html, fn);
    assert.match(src, /typeof (onDone|callback|onDetach) === 'function'/,
      fn + ' doit vérifier typeof === function avant d\'invoquer son callback');
    assert.doesNotMatch(src, /if \((onDone|callback|onDetach)\) \1\(/,
      fn + ' ne doit pas utiliser la garde if (fn) fn() fragile aux objets Event');
  });
});

test('trendsScopeToggle utilise closest() pour sécuriser la délégation d\'événement', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.match(html, /trendsScopeToggle['"]\)\.addEventListener\('click',\s*e\s*=>\s*\{\s*const btn = e\.target\.closest\('\.chart-type-btn'\)/,
    'trendsScopeToggle doit déléguer via closest(\'.chart-type-btn\')');
});

