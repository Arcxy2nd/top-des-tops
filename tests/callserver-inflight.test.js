'use strict';

// Fusion des appels de lecture identiques en vol (quota Sheets, phase 5) :
// deux callServer de lecture (même fonction, mêmes arguments) partis avant la
// réponse du premier ne doivent produire qu'un seul appel réseau, et chaque
// appelant reçoit la réponse. Une écriture (_MUTATING_APIS) n'est jamais fusionnée.
//
// On extrait du script d'Index.html le bloc « APPEL SERVEUR » (constantes,
// transport, callServer) et on l'exécute dans une VM avec un faux
// google.script.run qui garde les appels en attente.

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

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

function extractStatement(source, head) {
  const start = source.indexOf(head);
  assert.notStrictEqual(start, -1, head + ' introuvable dans Index.html');
  return source.slice(start, source.indexOf(';', start) + 1);
}

function load() {
  const calls = [];
  const makeRunner = () => {
    const h = {};
    let proxy;
    const runner = {
      withSuccessHandler(fn) { h.ok = fn; return proxy; },
      withFailureHandler(fn) { h.ko = fn; return proxy; }
    };
    return proxy = new Proxy(runner, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return (...args) => { calls.push({ fn: prop, args, ok: h.ok, ko: h.ko }); };
      }
    });
  };
  const ctx = {
    google: { script: { get run() { return makeRunner(); } } },
    showToast() {}, showActionToast() {}, console,
    _identityPassword: ''
  };
  const code = [
    extractStatement(html, 'const _MUTATING_APIS = new Set(['),
    extractStatement(html, 'const _inflightReads = new Map()'),
    extractFunction(html, '_newIdempotencyKey'),
    extractFunction(html, '_rpcTransport'),
    extractFunction(html, 'callServer'),
    'this.callServer = callServer; this._inflightReads = _inflightReads;'
  ].join('\n');
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, calls };
}

test('deux lectures identiques en vol ne font qu\'un appel réseau, les deux rappels reçoivent la réponse', () => {
  const { ctx, calls } = load();
  const got1 = [], got2 = [];
  ctx.callServer('apiGetQuickStats', ['main'], r => got1.push(r));
  ctx.callServer('apiGetQuickStats', ['main'], r => got2.push(r));
  assert.strictEqual(calls.length, 1);
  const value = { success: true, n: 42 };
  calls[0].ok(value);
  assert.deepStrictEqual(got1, [value]);
  assert.deepStrictEqual(got2, [value]);
  // Réponse reçue : un nouvel appel repart vers le réseau.
  ctx.callServer('apiGetQuickStats', ['main'], () => {});
  assert.strictEqual(calls.length, 2);
});

test('des arguments différents ne sont pas fusionnés', () => {
  const { ctx, calls } = load();
  ctx.callServer('apiGetQuickStats', ['main'], () => {});
  ctx.callServer('apiGetQuickStats', ['alt'], () => {});
  ctx.callServer('apiGetFilteredData', [[], [], '', ''], () => {});
  assert.strictEqual(calls.length, 3);
});

test('un échec est transmis à chaque appelant fusionné, puis la voie est libérée', () => {
  const { ctx, calls } = load();
  const errs = [];
  ctx.callServer('apiGetFilteredData', [['A'], [], '', ''], null, 'x', e => errs.push(e), true);
  ctx.callServer('apiGetFilteredData', [['A'], [], '', ''], null, 'x', e => errs.push(e), true);
  assert.strictEqual(calls.length, 1);
  calls[0].ko(new Error('boom'));
  assert.strictEqual(errs.length, 2);
  assert.strictEqual(ctx._inflightReads.size, 0);
});

test('un refresh qui relance QuickStats et FilteredData en double ne part qu\'une fois chacun', () => {
  const { ctx, calls } = load();
  for (let i = 0; i < 2; i++) {
    ctx.callServer('apiGetQuickStats', ['main'], () => {});
    ctx.callServer('apiGetFilteredData', [[], [], '2026-01-01', '2026-09-25'], () => {});
  }
  assert.strictEqual(calls.filter(c => c.fn === 'apiGetQuickStats').length, 1);
  assert.strictEqual(calls.filter(c => c.fn === 'apiGetFilteredData').length, 1);
});

test('une écriture n\'est jamais fusionnée', () => {
  const { ctx, calls } = load();
  ctx.callServer('apiAddNote', ['a'], () => {});
  ctx.callServer('apiAddNote', ['a'], () => {});
  assert.strictEqual(calls.length, 2);
});
