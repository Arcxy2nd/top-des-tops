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

function createTestSandbox(opts = {}) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const env = makeEnv(opts);
  vm.createContext(env);

  const localMap = new Map(Object.entries(opts.localStorage || {}));
  env.localStorage = {
    getItem: k => (localMap.has(k) ? localMap.get(k) : null),
    setItem: (k, v) => localMap.set(k, String(v)),
    removeItem: k => localMap.delete(k),
    clear: () => localMap.clear()
  };
  env.window.localStorage = env.localStorage;

  const sessionMap = new Map(Object.entries(opts.sessionStorage || {}));
  env.sessionStorage = {
    getItem: k => (sessionMap.has(k) ? sessionMap.get(k) : null),
    setItem: (k, v) => sessionMap.set(k, String(v)),
    removeItem: k => sessionMap.delete(k),
    clear: () => sessionMap.clear()
  };
  env.window.sessionStorage = env.sessionStorage;

  if (opts.appInstanceId) {
    env.window.__APP_INSTANCE_ID__ = opts.appInstanceId;
  }

  env.toasts = [];
  env.showToast = (msg, kind) => { env.toasts.push({ msg: String(msg), kind }); };
  env.actionToasts = [];
  env.showActionToast = (msg, label, cb) => { env.actionToasts.push({ msg, label, cb }); };
  env.buzz = () => {};
  env.console = { error() {}, warn() {}, log() {} };

  env.cachedPlayers = opts.cachedPlayers || [
    { name: 'Alice', color: '#ff4757', meta: 'avatar1.png', hasPassword: true },
    { name: 'Bob', color: '#2ed573', meta: '', hasPassword: false }
  ];
  env.cachedCategories = [];
  env.getAvatarUrl = (name, meta) => meta || 'default.png';

  // Modal stubs
  env.document.getElementById = id => {
    let el = env.document.body.children && env.document.body.children.find(c => c.id === id);
    if (!el) {
      el = env.makeEl('div', id);
      el.style = {};
      env.register(id, el);
    }
    return el;
  };
  env.openModal = () => {};
  env.closeModal = () => {};

  const fnsToExtract = [
    'getAppInstancePrefix',
    'getWhoAmIStorageKey',
    'getIdentityPwdStorageKey',
    'getSettingsCacheKey',
    'getAppSettingsCacheKey',
    'getDashboardCacheKey',
    'getPhraseSettingsKey',
    'getPhraseSettings',
    'savePhraseSettings',
    'getIdentityPassword',
    'setIdentityPassword',
    'syncIdentityFromStorage',
    'applyIdentity',
    'logoutIdentity',
    'requireIdentity',
    'callServer'
  ];

  const declarations = `
    var _whoAmI = null;
    var _identityPassword = '';
    var WHO_AM_I_KEY = 'tdt_who_am_i';
    var SETTINGS_CACHE_KEY = 'tdt_cache_settings';
    var APP_SETTINGS_CACHE_KEY = 'tdt_cache_appsettings';
    var DASHBOARD_CACHE_KEY = 'tdt_dashboard_cache';
    var PHRASE_SETTINGS_KEY = 'tdt_phrase_settings';
    var _MUTATING_APIS = new Set(['apiMutatingTest', 'apiManageEntity', 'apiSaveAppSettings']);
    var _identityPwdTarget = null;
    var _identityPwdOnVerified = null;
    function openIdentityPwdModal(player, onVerified) {
      _identityPwdTarget = player;
      _identityPwdOnVerified = onVerified || null;
    }
    function closeIdentityPwdModal() {
      _identityPwdTarget = null;
      _identityPwdOnVerified = null;
    }
  `;

  const src = declarations + '\n' +
    fnsToExtract.map(n => extractFunction(html, n)).join('\n') + '\n' +
    fnsToExtract.map(n => 'this.__' + n + ' = ' + n + ';').join('\n');

  vm.runInContext(src, env);

  const out = { env };
  fnsToExtract.forEach(n => { out[n] = env['__' + n]; });
  return out;
}

test('instance ID partitions storage keys and prefixes', () => {
  const instanceA = createTestSandbox({ appInstanceId: 'instSiteTops' });
  assert.strictEqual(instanceA.getAppInstancePrefix(), 'tdt_instSiteTops_');
  assert.strictEqual(instanceA.getWhoAmIStorageKey(), 'tdt_instSiteTops_who_am_i');
  assert.strictEqual(instanceA.getIdentityPwdStorageKey(), 'tdt_instSiteTops_pwd');
  assert.strictEqual(instanceA.getSettingsCacheKey(), 'tdt_instSiteTops_cache_settings');
  assert.strictEqual(instanceA.getAppSettingsCacheKey(), 'tdt_instSiteTops_cache_appsettings');

  const instanceDefault = createTestSandbox();
  assert.strictEqual(instanceDefault.getAppInstancePrefix(), 'tdt_');
  assert.strictEqual(instanceDefault.getWhoAmIStorageKey(), 'tdt_who_am_i');
  assert.strictEqual(instanceDefault.getIdentityPwdStorageKey(), 'tdt_pwd');
});

test('session password persists in sessionStorage and is cleared on setIdentityPassword("")', () => {
  const { getIdentityPassword, setIdentityPassword, env } = createTestSandbox({ appInstanceId: 'app1' });

  assert.strictEqual(getIdentityPassword(), '');
  setIdentityPassword('superSecret');
  assert.strictEqual(env.sessionStorage.getItem('tdt_app1_pwd'), 'superSecret');
  assert.strictEqual(getIdentityPassword(), 'superSecret');

  // Reset in-memory password, should reload from sessionStorage
  env._identityPassword = '';
  assert.strictEqual(getIdentityPassword(), 'superSecret');

  // Clear password
  setIdentityPassword('');
  assert.strictEqual(env.sessionStorage.getItem('tdt_app1_pwd'), null);
  assert.strictEqual(getIdentityPassword(), '');
});

test('syncIdentityFromStorage migrates legacy un-prefixed who_am_i to partitioned key', () => {
  const { syncIdentityFromStorage, env } = createTestSandbox({
    appInstanceId: 'app2',
    localStorage: { 'tdt_who_am_i': 'Alice' }
  });

  syncIdentityFromStorage();
  assert.strictEqual(env._whoAmI, 'Alice');
  assert.strictEqual(env.localStorage.getItem('tdt_app2_who_am_i'), 'Alice');
});

test('callServer catches auth error, prompts modal, and retries with new password upon verification', () => {
  const { callServer, setIdentityPassword, env } = createTestSandbox({
    appInstanceId: 'app3',
    cachedPlayers: [{ name: 'Alice', hasPassword: true }]
  });

  env._whoAmI = 'Alice';
  setIdentityPassword('wrong-pwd');

  let callCount = 0;
  let receivedArgs = [];
  const runner = {
    withSuccessHandler(h) { return { withFailureHandler(fh) { return {
      apiMutatingTest(...args) {
        callCount++;
        receivedArgs.push(args);
        const pwd = args[args.length - 1];
        if (pwd !== 'correct-pwd') {
          h({ success: false, error: 'Mot de passe invalide pour Alice.' });
        } else {
          h({ success: true, count: 123 });
        }
      }
    }; } }; }
  };
  env.google = { script: { run: runner } };

  let finalRes = null;
  callServer('apiMutatingTest', ['data1'], res => {
    finalRes = res;
  });

  assert.strictEqual(callCount, 1, 'First call executed');
  assert.strictEqual(env._identityPwdTarget.name, 'Alice', 'Password modal opened for Alice');
  assert.strictEqual(typeof env._identityPwdOnVerified, 'function', 'Retry callback attached');

  // Simulate user entering the correct password in the modal and verifying:
  setIdentityPassword('correct-pwd');
  env._identityPwdOnVerified();

  assert.strictEqual(callCount, 2, 'Second call executed after verification');
  assert.deepStrictEqual(finalRes, { success: true, count: 123 });
  assert.strictEqual(receivedArgs[1][1], 'correct-pwd', 'Correct password passed on retry');
});

test('callServer handles withFailureHandler auth rejection similarly', () => {
  const { callServer, setIdentityPassword, env } = createTestSandbox({
    appInstanceId: 'app4',
    cachedPlayers: [{ name: 'Alice', hasPassword: true }]
  });

  env._whoAmI = 'Alice';
  setIdentityPassword('wrong-pwd');

  let callCount = 0;
  const runner = {
    withSuccessHandler(h) { return { withFailureHandler(fh) { return {
      apiMutatingTest(...args) {
        callCount++;
        const pwd = args[args.length - 1];
        if (pwd !== 'good-pwd') {
          fh(new Error('Mot de passe invalide pour Alice.'));
        } else {
          h({ success: true });
        }
      }
    }; } }; }
  };
  env.google = { script: { run: runner } };

  callServer('apiMutatingTest', ['val'], () => {});
  assert.strictEqual(callCount, 1);
  assert.strictEqual(env._identityPwdTarget.name, 'Alice');

  setIdentityPassword('good-pwd');
  env._identityPwdOnVerified();
  assert.strictEqual(callCount, 2);
});

test('applyIdentity updates _whoAmI and partitioned localStorage key', () => {
  const { applyIdentity, env } = createTestSandbox({ appInstanceId: 'instX' });

  applyIdentity('Bob');
  assert.strictEqual(env._whoAmI, 'Bob');
  assert.strictEqual(env.localStorage.getItem('tdt_instX_who_am_i'), 'Bob');
});

test('callServer does not trigger handleAuthError when fn is apiVerifyIdentity', () => {
  const { callServer, env } = createTestSandbox({
    appInstanceId: 'appVerify',
    cachedPlayers: [{ name: 'Alice', hasPassword: true }]
  });

  env._whoAmI = 'Alice';
  let errorReceived = null;
  const runner = {
    withSuccessHandler(h) { return { withFailureHandler(fh) { return {
      apiVerifyIdentity(name, pwd) {
        h({ success: false, error: 'Échec authentification serveur' });
      }
    }; } }; }
  };
  env.google = { script: { run: runner } };

  callServer('apiVerifyIdentity', ['Alice', 'test'], () => {}, 'Label', err => {
    errorReceived = err;
  });

  assert.strictEqual(errorReceived, 'Échec authentification serveur');
  assert.strictEqual(env._identityPwdTarget, null, 'Modal should not be triggered recursively for apiVerifyIdentity');
});

test('requireIdentity queues and executes callback upon password verification', () => {
  const { requireIdentity, setIdentityPassword, env } = createTestSandbox({
    appInstanceId: 'appResumption',
    cachedPlayers: [{ name: 'Alice', hasPassword: true }]
  });

  env._whoAmI = 'Alice';
  let actionExecuted = false;

  const allowed = requireIdentity(() => {
    actionExecuted = true;
  });

  assert.strictEqual(allowed, false);
  assert.strictEqual(actionExecuted, false);
  assert.strictEqual(env._identityPwdTarget.name, 'Alice');
  assert.strictEqual(typeof env._identityPwdOnVerified, 'function');

  // Verify password
  setIdentityPassword('valid-pass');
  env._identityPwdOnVerified();
  assert.strictEqual(actionExecuted, true, 'Queued action callback must be executed after verification');
});

test('dashboard and phrase cache keys partition by instance and migrate smoothly', () => {
  const sandboxA = createTestSandbox({
    appInstanceId: 'instAlpha',
    localStorage: {
      'tdt_dashboard_cache': JSON.stringify({ chartData: { labels: ['A'] } }),
      'tdt_phrase_settings': JSON.stringify({ enabled: false, count: 5 })
    }
  });

  const { getDashboardCacheKey, getPhraseSettingsKey, getPhraseSettings, savePhraseSettings, env: envA } = sandboxA;
  assert.strictEqual(getDashboardCacheKey(), 'tdt_instAlpha_dashboard_cache');
  assert.strictEqual(getPhraseSettingsKey(), 'tdt_instAlpha_phrase_settings');

  // Fallback to legacy unpartitioned key
  const phraseA = getPhraseSettings();
  assert.strictEqual(phraseA.count, 5);
  assert.strictEqual(phraseA.enabled, false);

  // Saving updates partitioned key
  savePhraseSettings({ count: 7 });
  assert.strictEqual(JSON.parse(envA.localStorage.getItem('tdt_instAlpha_phrase_settings')).count, 7);
  // Legacy key untouched
  assert.strictEqual(JSON.parse(envA.localStorage.getItem('tdt_phrase_settings')).count, 5);

  const sandboxB = createTestSandbox({
    appInstanceId: 'instBeta'
  });
  const { getDashboardCacheKey: getDashB, getPhraseSettingsKey: getPhraseB, getPhraseSettings: getPhraseSettingsB } = sandboxB;
  assert.strictEqual(getDashB(), 'tdt_instBeta_dashboard_cache');
  assert.strictEqual(getPhraseB(), 'tdt_instBeta_phrase_settings');
  // Sandbox B defaults
  assert.strictEqual(getPhraseSettingsB().count, 3);
});


