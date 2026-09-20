'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { makeEnv } = require('./dom-stub.js');
const { loadGas, makeSheet, injectSheets } = require('./harness');

const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, name + ' introuvable');
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(start, i + 1);
}

function loadSubmitEnv(granted) {
  const env = makeEnv({});
  const input = env.makeEl('input');
  input.value = '';
  input.select = () => {};
  env.register('identityPwdInput', input);

  const btn = env.makeEl('button');
  env.register('identityPwdSubmit', btn);

  const err = env.makeEl('p');
  env.register('identityPwdError', err);

  const modal = env.makeEl('div');
  const box = env.makeEl('div');
  box.className = 'identity-pwd-box';
  modal.appendChild(box);
  env.register('identityPwdModal', modal);
  env.document.querySelector = sel => {
    if (sel && sel.includes('.identity-pwd-box')) return box;
    return null;
  };

  vm.createContext(env);
  const store = new Map();
  env.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  env.SETTINGS_CACHE_KEY = 'tdt_x_cache_settings';
  env.cachedPlayers = [{ name: 'Bob', hasPassword: true }];
  env.cachedCategories = [];
  env._identityPwdTarget = env.cachedPlayers[0];
  env._identityPwdOnVerified = null;
  env.calls = [];
  env.applied = null;
  env.savedPwd = null;
  env.closedModal = false;
  env.showToast = () => {};
  env.callServer = (fn, params, ok) => {
    env.calls.push([fn, params]);
    ok({ success: true, granted });
  };
  env.applyIdentity = n => { env.applied = n; };
  env.setIdentityPassword = p => { env.savedPwd = p; };
  env.closeIdentityPwdModal = () => { env.closedModal = true; };

  const src = extractFunction(html, 'submitIdentityPwd') + '\nthis.__submit = submitIdentityPwd;';
  vm.runInContext(src, env);
  return env;
}

test('joueur marqué protégé dont le mot de passe a été retiré sur le serveur : soumission vide déverrouille et efface hasPassword', () => {
  const env = loadSubmitEnv(true);
  env.document.getElementById('identityPwdInput').value = '';

  env.__submit();

  assert.deepStrictEqual(JSON.parse(JSON.stringify(env.calls)), [['apiVerifyIdentity', ['Bob', '']]]);
  assert.strictEqual(env.applied, 'Bob');
  assert.strictEqual(env.savedPwd, '');
  assert.strictEqual(env.closedModal, true);
  assert.strictEqual(env.cachedPlayers[0].hasPassword, false);
  const cachedSettings = JSON.parse(env.localStorage.getItem('tdt_x_cache_settings'));
  assert.strictEqual(cachedSettings.players[0].hasPassword, false);
});

test('joueur protégé avec mot de passe incorrect : erreur affichée, pas de déverrouillage', () => {
  const env = loadSubmitEnv(false);
  env.document.getElementById('identityPwdInput').value = 'wrong';

  env.__submit();

  assert.strictEqual(env.applied, null);
  assert.strictEqual(env.closedModal, false);
  assert.strictEqual(env.cachedPlayers[0].hasPassword, true);
  assert.strictEqual(env.document.getElementById('identityPwdError').style.display, 'block');
});

test('sonde serveur sans mot de passe : aucune ligne « Échec authentification »', () => {
  const gas = loadGas();
  const audit = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ['Bob', '', '', 'secret']]);
  injectSheets(gas, { spreadsheet: { insertSheet: () => audit, getSheetByName: () => null },
    history: makeSheet([]), players, categories: makeSheet([]), notes: null, bareme: null, phrases: null, auditLog: audit });
  const res = gas.apiVerifyIdentity('Bob', '');
  assert.strictEqual(res.granted, false);
  assert.strictEqual(audit._grid.length, 1);
});
