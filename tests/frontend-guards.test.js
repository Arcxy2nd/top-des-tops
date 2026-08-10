'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const INDEX = path.join(__dirname, '..', 'Index.html');

// Extracts a named function from Index.html's inline <script>, from the
// `function` keyword to its closing brace, by counting braces.
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

function loadCallServer() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const toasts = [];
  const errors = [];
  const sandbox = {
    showToast: (msg, kind) => toasts.push({ msg: String(msg), kind: kind }),
    console: { error: (...a) => errors.push(a.map(String).join(' ')), warn() {}, log() {} },
    google: { script: { run: null } }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'callServer') + '\nthis.__callServer = callServer;', sandbox);
  return { callServer: sandbox.__callServer, toasts, errors, sandbox };
}

// Mirrors the google.script.run contract: handlers are attached by chaining,
// then calling the function triggers the response.
function fakeRunner(response) {
  const state = { success: null, failure: null };
  const runner = {
    withSuccessHandler(h) { state.success = h; return runner; },
    withFailureHandler(h) { state.failure = h; return runner; },
    apiAnything() { state.success(response); }
  };
  return runner;
}

test('callServer reports an exception thrown by its success handler', () => {
  const { callServer, toasts, errors, sandbox } = loadCallServer();
  sandbox.google.script.run = fakeRunner({ success: true, value: 1 });

  const seen = [];
  callServer('apiAnything', [], () => { throw new Error('boom in render'); }, 'Chargement test', err => seen.push(err));

  assert.strictEqual(seen.length, 1, "onError doit être appelé quand onSuccess lève");
  assert.match(String(seen[0].message || seen[0]), /boom in render/);
  assert.strictEqual(toasts.length, 1, 'un toast doit signaler la panne');
  assert.match(toasts[0].msg, /Chargement test/);
  assert.strictEqual(toasts[0].kind, 'error');
  assert.ok(errors.some(e => /boom in render/.test(e)), 'la trace doit partir en console.error');
});

test('callServer still passes the payload through on the nominal path', () => {
  const { callServer, toasts, sandbox } = loadCallServer();
  sandbox.google.script.run = fakeRunner({ success: true, value: 42 });

  let got = null;
  callServer('apiAnything', [], res => { got = res; }, 'Chargement test', () => { throw new Error('onError ne doit pas être appelé'); });

  assert.strictEqual(got.value, 42);
  assert.strictEqual(toasts.length, 0, 'aucun toast sur le chemin nominal');
});
