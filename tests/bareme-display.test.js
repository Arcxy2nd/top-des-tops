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

test('baremePill : pastille pour une règle connue, rien pour une règle introuvable', () => {
  const env = makeEnv({});
  vm.createContext(env);
  env.baremeEntries = [{ id: 'R1', top: 'Babyfoot', action: 'Victoire', pts: 3 }];
  vm.runInContext(extractFunction(html, 'baremePill') + '\nthis.__p = baremePill;', env);
  const pill = env.__p('R1');
  assert.ok(pill);
  assert.match(pill.textContent, /Victoire/);
  assert.strictEqual(env.__p('Rinconnu'), null);
  assert.strictEqual(env.__p(''), null);
});

test('le filtre de règle est transmis à apiGetHistoryPage', () => {
  assert.ok(html.includes('id="histBaremeFilter"'));
  assert.match(html, /callServer\('apiGetHistoryPage', \[page, PAGE_SIZE,[^\]]*altFilter, baremeFilter\]/);
});

test('la santé compte les entrées rattachées à une règle introuvable', () => {
  const gas = loadGas();
  const D = s => new Date(s + 'T12:00:00');
  injectSheets(gas, {
    history: makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur', 'BaremeId'],
      [D('2026-09-01'), 'Alice', 'Babyfoot', 3, '', '', '', 'R1'],
      [D('2026-09-02'), 'Alice', 'Babyfoot', 3, '', '', '', 'Rsupprimee']]),
    bareme: makeSheet([['Top', 'Action', 'Points', 'Id'], ['Babyfoot', 'Victoire', 3, 'R1']]),
    players: makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ['Alice', '', '', '']]),
    categories: makeSheet([['Name', 'Description', 'Emoji', 'Hex color'], ['Babyfoot', '', '', '']])
  });
  assert.strictEqual(gas.StorageService._computeDataHealth().baremeOrphans, 1);
});
