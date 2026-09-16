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

function sandbox(granted) {
  const env = makeEnv({});
  vm.createContext(env);
  const store = new Map();
  env.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  env.SETTINGS_CACHE_KEY = 'tdt_x_cache_settings';
  env.cachedPlayers = [{ name: 'Bob', hasPassword: true }];
  env.cachedCategories = [];
  env.calls = [];
  env.applied = null;
  env.modalFor = null;
  env.callServer = (fn, params, ok) => { env.calls.push([fn, params]); ok({ success: true, granted }); };
  env.applyIdentity = n => { env.applied = n; };
  env.setIdentityPassword = () => {};
  env.openIdentityPwdModal = p => { env.modalFor = p.name; };
  vm.runInContext(extractFunction(html, 'unlockOrPrompt') + '\nthis.__u = unlockOrPrompt;', env);
  return env;
}

test('joueur marqué protégé mais sans mot de passe côté serveur : identité appliquée, pas de modale', () => {
  const env = sandbox(true);
  let resumed = false;
  env.__u(env.cachedPlayers[0], () => { resumed = true; });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(env.calls)), [['apiVerifyIdentity', ['Bob', '']]]);
  assert.strictEqual(env.applied, 'Bob');
  assert.strictEqual(env.modalFor, null);
  assert.strictEqual(env.cachedPlayers[0].hasPassword, false);
  assert.strictEqual(JSON.parse(env.localStorage.getItem('tdt_x_cache_settings')).players[0].hasPassword, false);
  assert.strictEqual(resumed, true);
});

test('joueur réellement protégé : modale ouverte, identité non appliquée', () => {
  const env = sandbox(false);
  env.__u(env.cachedPlayers[0]);
  assert.strictEqual(env.modalFor, 'Bob');
  assert.strictEqual(env.applied, null);
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
