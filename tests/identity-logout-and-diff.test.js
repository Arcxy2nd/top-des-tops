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

function attachQuerySelector(el) {
  el.querySelector = sel => {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const find = node => {
        if (node._classes && node._classes.has(cls)) return node;
        if (node.className && node.className.split(' ').includes(cls)) return node;
        for (const c of (node.children || [])) {
          const found = find(c);
          if (found) return found;
        }
        return null;
      };
      return find(el);
    }
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      const find = node => {
        if (node.id === id) return node;
        for (const c of (node.children || [])) {
          const found = find(c);
          if (found) return found;
        }
        return null;
      };
      return find(el);
    }
    return null;
  };
  return el;
}

function loadIdentityEnv(opts = {}) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const env = makeEnv(opts);
  vm.createContext(env);

  // LocalStorage mock
  const store = new Map();
  if (opts.initialUser) store.set('tdt_who_am_i', opts.initialUser);
  env.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  };
  env.window.localStorage = env.localStorage;

  const origMakeEl = env.makeEl;
  env.makeEl = (tag, id) => {
    const el = origMakeEl(tag, id);
    el.style.setProperty = (k, v) => { el.style[k] = v; };
    return attachQuerySelector(el);
  };

  env.document.createTextNode = text => {
    const node = env.makeEl('span');
    node.textContent = String(text);
    return node;
  };
  env.document.createElement = tag => env.makeEl(tag);

  // Define required globals & stubs
  env.WHO_AM_I_KEY = 'tdt_who_am_i';
  env._whoAmI = opts.initialUser || null;
  env._identityPassword = opts.initialPwd || '';
  env.cachedPlayers = opts.cachedPlayers || [
    { name: 'Alice', color: '#ff4757', meta: 'avatar1.png', hasPassword: false },
    { name: 'Bob', color: '#2ed573', meta: '', hasPassword: true }
  ];
  env.getAvatarUrl = (name, meta) => meta || 'default.png';
  env.toasts = [];
  env.showToast = (msg, type) => { env.toasts.push({ msg, type }); };
  env.closeWhoAmIDropdown = () => {
    const wrap = env.document.getElementById('whoAmIWrap');
    if (wrap) wrap.classList.remove('open');
  };
  env.renderChatMessages = () => { env._chatRendered = (env._chatRendered || 0) + 1; };

  // DOM elements required for whoAmI
  const wrap = env.register('whoAmIWrap', env.makeEl('div'));
  const btn = env.register('whoAmIBtn', env.makeEl('button'));
  const avatar = env.register('whoAmIAvatar', env.makeEl('img'));
  const nameSpan = env.register('whoAmIName', env.makeEl('span'));
  const dropdown = env.register('whoAmIDropdown', env.makeEl('div'));
  btn.appendChild(avatar);
  btn.appendChild(nameSpan);
  wrap.appendChild(btn);
  wrap.appendChild(dropdown);
  env.document.body.appendChild(wrap);

  // DOM elements required for identityPwdModal
  const modal = env.register('identityPwdModal', env.makeEl('div'));
  const pwdBox = env.makeEl('div');
  pwdBox.className = 'identity-pwd-box';
  modal.appendChild(pwdBox);
  env.register('identityPwdAvatar', env.makeEl('img'));
  env.register('identityPwdName', env.makeEl('span'));
  env.register('identityPwdInput', env.makeEl('input'));
  env.register('identityPwdError', env.makeEl('p'));
  env.register('identityPwdCancel', env.makeEl('button'));
  env.register('identityPwdSubmit', env.makeEl('button'));
  env.register('identityPwdChangeUser', env.makeEl('button'));

  env.openModal = el => { if (el) el.style.display = 'block'; };
  env.closeModal = el => { if (el) el.style.display = 'none'; };
  env.detachWhoAmI = null;
  env.anchorFloating = null;
  env.placeWhoAmI = () => {};
  env._identityPwdTarget = null;
  env._identityPwdOnVerified = null;

  const fns = [
    'applyIdentity',
    'logoutIdentity',
    'renderWhoAmI',
    'openWhoAmIDropdown',
    'pulseWhoAmIBtn',
    'requireIdentity',
    'openIdentityPwdModal',
    'closeIdentityPwdModal',
    'wordDiffHtml',
    'auditDiffValue',
    'escapeHtml'
  ];
  const src = fns.map(n => extractFunction(html, n)).join('\n') +
              '\n' + fns.map(n => 'this.__' + n + ' = ' + n + ';').join('\n');
  vm.runInContext(src, env);

  const out = { env };
  fns.forEach(n => { out[n] = env['__' + n]; });
  return out;
}

test('logoutIdentity réinitialise _whoAmI, vide le mot de passe et le localStorage', () => {
  const { env, logoutIdentity } = loadIdentityEnv({ initialUser: 'Alice', initialPwd: 'secret123' });

  logoutIdentity();

  assert.strictEqual(env._whoAmI, null, '_whoAmI doit être null');
  assert.strictEqual(env._identityPassword, '', '_identityPassword doit être vide');
  assert.strictEqual(env.localStorage.getItem('tdt_who_am_i'), null, 'la clé tdt_who_am_i doit être supprimée');
  assert.ok(env.toasts.some(t => t.msg === 'Déconnecté.' && t.type === 'info'), 'Un toast d\'information doit être affiché');
});

test('renderWhoAmI affiche le bouton de déconnexion si une identité est active', () => {
  const { env, renderWhoAmI } = loadIdentityEnv({ initialUser: 'Alice' });

  renderWhoAmI();

  const nameSpan = env.document.getElementById('whoAmIName');
  assert.strictEqual(nameSpan.textContent, 'Alice');

  const btn = env.document.getElementById('whoAmIBtn');
  assert.ok(!btn.classList.contains('unselected'), 'Le bouton ne doit pas avoir la classe unselected');

  const dropdown = env.document.getElementById('whoAmIDropdown');
  const logoutBtn = dropdown.querySelector('#whoAmILogoutBtn');
  assert.ok(logoutBtn, 'Le bouton de déconnexion #whoAmILogoutBtn doit être présent');
  assert.ok(logoutBtn.children.some(c => c.textContent && c.textContent.includes('Se déconnecter')), 'Le libellé doit contenir "Se déconnecter"');

  const divider = dropdown.querySelector('.who-am-i-divider');
  assert.ok(divider, 'Un séparateur .who-am-i-divider doit précéder la déconnexion');
});

test('renderWhoAmI masque le bouton de déconnexion quand aucune identité n\'est sélectionnée', () => {
  const { env, renderWhoAmI } = loadIdentityEnv({ initialUser: null });

  renderWhoAmI();

  const nameSpan = env.document.getElementById('whoAmIName');
  assert.strictEqual(nameSpan.textContent, 'Qui suis-je ?');

  const btn = env.document.getElementById('whoAmIBtn');
  assert.ok(btn.classList.contains('unselected'), 'Le bouton doit avoir la classe unselected');

  const dropdown = env.document.getElementById('whoAmIDropdown');
  const logoutBtn = dropdown.querySelector('#whoAmILogoutBtn');
  assert.strictEqual(logoutBtn, null, 'Le bouton de déconnexion ne doit pas exister en mode anonyme');
});

test('cliquer sur Se déconnecter dans le dropdown déclenche la déconnexion', () => {
  const { env, renderWhoAmI } = loadIdentityEnv({ initialUser: 'Alice' });

  renderWhoAmI();
  const logoutBtn = env.document.getElementById('whoAmIDropdown').querySelector('#whoAmILogoutBtn');
  assert.ok(logoutBtn);

  // Simule le clic
  logoutBtn._listeners.click.forEach(fn => fn());

  assert.strictEqual(env._whoAmI, null);
  assert.strictEqual(env.localStorage.getItem('tdt_who_am_i'), null);
  const nameSpan = env.document.getElementById('whoAmIName');
  assert.strictEqual(nameSpan.textContent, 'Qui suis-je ?');
});

test('wordDiffHtml génère des balises del et ins groupées pour un remplacement', () => {
  const { wordDiffHtml } = loadIdentityEnv();

  const diff = wordDiffHtml('Hello world ancien', 'Hello world nouveau');
  assert.strictEqual(diff, 'Hello world <del class="diff-del">ancien</del><ins class="diff-ins">nouveau</ins>');
});

test('wordDiffHtml gère les suppressions et ajouts multi-mots contigus', () => {
  const { wordDiffHtml } = loadIdentityEnv();

  const diff = wordDiffHtml('Ceci est un grand test rapide', 'Ceci est un mini');
  assert.strictEqual(diff, 'Ceci est un <del class="diff-del">grand test rapide</del><ins class="diff-ins">mini</ins>');
});

test('wordDiffHtml échappe les caractères HTML dangereux dans avant et après', () => {
  const { wordDiffHtml } = loadIdentityEnv();

  const diff = wordDiffHtml('<b>danger</b>', '<i>safe & clean</i>');
  assert.ok(diff.includes('&lt;b&gt;danger&lt;/b&gt;'), 'La balise avant doit être échappée');
  assert.ok(diff.includes('&lt;i&gt;safe &amp; clean&lt;/i&gt;'), 'La balise après doit être échappée');
  assert.ok(!diff.includes('<script>'), 'Aucun tag exécutable injecté');
});

test('auditDiffValue crée des éléments de classe audit-before et audit-after avec support des pastilles couleur', () => {
  const { auditDiffValue } = loadIdentityEnv();

  const beforeEl = auditDiffValue('10 pts', 'audit-before');
  assert.strictEqual(beforeEl.className, 'audit-before');
  assert.ok(beforeEl.children.some(c => c.textContent === '10 pts'));

  const afterEl = auditDiffValue('#2ed573', 'audit-after');
  assert.strictEqual(afterEl.className, 'audit-after');
  const dot = afterEl.querySelector('.audit-color-dot');
  assert.ok(dot, 'Un point couleur doit être créé pour un code hexadécimal');
  assert.strictEqual(dot.style.background, '#2ed573');
});

test('requireIdentity retourne false, alerte et ouvre le sélecteur d\'identité quand _whoAmI est null', () => {
  const { env, requireIdentity } = loadIdentityEnv({ initialUser: null });
  const res = requireIdentity();
  assert.strictEqual(res, false, 'Doit retourner false quand aucun utilisateur n\'est connecté');
  assert.ok(env.toasts.some(t => t.type === 'error' && t.msg.includes('Sélectionne ton identité')));
  const wrap = env.document.getElementById('whoAmIWrap');
  assert.ok(wrap.classList.contains('open'), 'Le dropdown d\'identité doit être ouvert');
});

test('requireIdentity ouvre la modale de mot de passe et retourne false si le joueur est protégé et sans mot de passe en session', () => {
  const { env, requireIdentity } = loadIdentityEnv({ initialUser: 'Bob', initialPwd: '' });
  let callbackRan = false;
  const res = requireIdentity(() => { callbackRan = true; });
  assert.strictEqual(res, false, 'Doit retourner false tant que le mot de passe n\'est pas confirmé');
  const modal = env.document.getElementById('identityPwdModal');
  assert.strictEqual(modal.style.display, 'block', 'La modale de mot de passe doit s\'ouvrir');
  assert.strictEqual(env.document.getElementById('identityPwdName').textContent, 'Bob');
  assert.strictEqual(callbackRan, false);
  assert.strictEqual(typeof env._identityPwdOnVerified, 'function');
});

test('requireIdentity retourne true si le joueur est protégé et le mot de passe est déjà saisi', () => {
  const { env, requireIdentity } = loadIdentityEnv({ initialUser: 'Bob', initialPwd: 'secretPassword' });
  const res = requireIdentity();
  assert.strictEqual(res, true, 'Doit retourner true quand le mot de passe est présent');
  const modal = env.document.getElementById('identityPwdModal');
  assert.notStrictEqual(modal.style.display, 'block');
});

test('requireIdentity retourne true si le joueur n\'a pas de mot de passe configuré', () => {
  const { env, requireIdentity } = loadIdentityEnv({ initialUser: 'Alice', initialPwd: '' });
  const res = requireIdentity();
  assert.strictEqual(res, true, 'Doit retourner true directement pour un profil sans mot de passe');
});

test('Le bouton Changer d\'utilisateur ferme la modale mot de passe, déconnecte et ouvre le dropdown', () => {
  const { env, openIdentityPwdModal, closeIdentityPwdModal, logoutIdentity, openWhoAmIDropdown } = loadIdentityEnv({ initialUser: 'Bob', initialPwd: '' });
  openIdentityPwdModal({ name: 'Bob', hasPassword: true, meta: '' });
  const modal = env.document.getElementById('identityPwdModal');
  assert.strictEqual(modal.style.display, 'block');

  // Simule le clic sur #identityPwdChangeUser câblé dans Index.html
  closeIdentityPwdModal();
  logoutIdentity();
  openWhoAmIDropdown();

  assert.strictEqual(modal.style.display, 'none', 'La modale doit être fermée');
  assert.strictEqual(env._whoAmI, null, '_whoAmI doit être réinitialisé');
  assert.strictEqual(env._identityPassword, '', '_identityPassword doit être vidé');
  const wrap = env.document.getElementById('whoAmIWrap');
  assert.ok(wrap.classList.contains('open'), 'Le sélecteur Qui suis-je doit être ouvert');
});

test('cliquer sur un joueur protégé ouvre immédiatement la modale de mot de passe sans requête serveur préalable', () => {
  const { env, renderWhoAmI } = loadIdentityEnv({ initialUser: null });
  let serverCalled = false;
  env.callServer = () => { serverCalled = true; };
  env.setIdentityPassword = () => {};
  env.SETTINGS_CACHE_KEY = 'k';
  env.cachedCategories = [];

  renderWhoAmI();
  const dropdown = env.document.getElementById('whoAmIDropdown');
  const bobOpt = dropdown.children.find(opt => opt.children && opt.children.some(c => c.textContent === 'Bob'));
  assert.ok(bobOpt, 'Option Bob trouvée');
  bobOpt._listeners.click.forEach(fn => fn());

  assert.strictEqual(serverCalled, false, 'Aucun appel réseau préalable ne doit bloquer le clic');
  assert.strictEqual(env._whoAmI, null, 'L\'identité ne doit pas encore être appliquée');
  assert.strictEqual(env._identityPwdTarget.name, 'Bob', 'La modale cible Bob');
  const modal = env.document.getElementById('identityPwdModal');
  assert.strictEqual(modal.style.display, 'block', 'La modale mot de passe s\'ouvre immédiatement');
});

