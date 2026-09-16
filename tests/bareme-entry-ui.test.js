'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { makeEnv } = require('./dom-stub.js');

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

test('buildBaremeSelect ne propose que les règles du Top, triées, avec « aucune »', () => {
  const env = makeEnv({});
  vm.createContext(env);
  env.baremeEntries = [
    { id: 'R2', top: 'Babyfoot', action: 'Victoire', pts: 3 },
    { id: 'R1', top: 'Babyfoot', action: 'Nul', pts: 1 },
    { id: 'R9', top: 'Echecs', action: 'Mat', pts: 5 }
  ];
  vm.runInContext(extractFunction(html, 'buildBaremeSelect') + '\nthis.__b = buildBaremeSelect;', env);
  const sel = env.__b('Babyfoot', 'R2');
  const values = sel.children.map(o => o.value);
  assert.deepStrictEqual(values, ['', 'R1', 'R2']);
  assert.strictEqual(sel.value, 'R2');
});

test('la ligne de lot n\'écrase plus une description déjà saisie et transmet baremeId', () => {
  assert.ok(/if\s*\(!descInput\.value\.trim\(\)\)\s*descInput\.value\s*=\s*entry\.action/.test(html));
  const planChunk = html.slice(html.indexOf('function submitBulk'), html.indexOf('function submitBulk') + 12000);
  assert.ok(/baremeId:\s*r\.dataset\.baremeId\s*\|\|\s*''/.test(planChunk) || /baremeId:\s*r\.dataset\.baremeId\s*\|\|\s*''/.test(html));
});
