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
