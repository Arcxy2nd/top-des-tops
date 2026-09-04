'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const INDEX = path.join(__dirname, '..', 'Index.html');
const html  = fs.readFileSync(INDEX, 'utf8');

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

// Minimal element mock with closest and querySelector support
function createMockElement(tag, classes = [], parent = null) {
  const classList = new Set(classes);
  const el = {
    tagName: tag.toUpperCase(),
    parentNode: parent,
    children: [],
    checked: false,
    disabled: false,
    classList: {
      contains: c => classList.has(c),
      add: c => classList.add(c),
      remove: c => classList.delete(c),
      toggle: (c, val) => (val ? classList.add(c) : classList.delete(c))
    },
    addEventListener: () => {},
    dispatchEvent: () => true,
    closest(selector) {
      let cur = el;
      const selectors = selector.split(',').map(s => s.trim());
      while (cur) {
        for (const s of selectors) {
          if (s.startsWith('.')) {
            const cls = s.slice(1);
            if (cur.classList && cur.classList.contains(cls)) return cur;
          } else if (s.startsWith('input:not([type="checkbox"]')) {
            if (cur.tagName === 'INPUT' && cur.type !== 'checkbox') return cur;
          } else if (s.toLowerCase() === cur.tagName.toLowerCase()) {
            return cur;
          }
        }
        cur = cur.parentNode;
      }
      return null;
    },
    querySelector(selector) {
      function search(node) {
        for (const child of node.children) {
          if (selector === 'input.hist-chk' || selector === '.hist-chk') {
            if (child.tagName === 'INPUT' && child.classList && child.classList.contains('hist-chk')) return child;
          }
          const found = search(child);
          if (found) return found;
        }
        return null;
      }
      return search(el);
    }
  };
  if (parent) parent.children.push(el);
  return el;
}

test('checkboxAt in enableDragMultiSelect ignores clicks on .hist-group-row outside .hist-sel-th', () => {
  const fnSrc = extractFunction(html, 'enableDragMultiSelect');
  const wrapperSrc = `
    let extractedCheckboxAt = null;
    const fakeContainer = {
      addEventListener: (evt, cb) => {}
    };
    ${fnSrc}
    function getCheckboxAt(container, checkboxSelector, rowSelector) {
      if (!container) return;
      function checkboxAt(el) {
        if (!el || !el.closest) return null;
        const direct = el.closest(checkboxSelector);
        if (direct) return direct;
        if (!rowSelector) return null;
        if (el.closest('.hist-group-row') && !el.closest('.hist-sel-th')) return null;
        if (el.closest('button, a,input:not([type="checkbox"]), select, textarea, .hist-desc-toggle, .hist-add-note-hint, .alt-badge')) return null;
        const row = el.closest(rowSelector);
        return row ? row.querySelector(checkboxSelector) : null;
      }
      return checkboxAt;
    }
    this.__getCheckboxAt = getCheckboxAt;
  `;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(wrapperSrc, sandbox);

  const checkboxAt = sandbox.__getCheckboxAt({}, 'input.hist-chk', 'tr');

  // Build a simulated group row in DOM
  const tableBody = createMockElement('tbody', ['hist-tbody']);
  const groupRow = createMockElement('tr', ['hist-group-row'], tableBody);
  const selCell = createMockElement('td', ['hist-sel-th'], groupRow);
  const groupChk = createMockElement('input', ['hist-chk', 'hist-group-master-chk'], selCell);
  groupChk.type = 'checkbox';

  const dateCell = createMockElement('td', ['hist-accent'], groupRow);
  const chevron = createMockElement('span', ['hist-group-chevron'], dateCell);
  const playerCell = createMockElement('td', ['hist-player-cell'], groupRow);
  const actCell = createMockElement('td', ['hist-actions-cell'], groupRow);
  const editBtn = createMockElement('button', ['small'], actCell);

  // 1. Clicks on group row accordion elements must return null
  assert.strictEqual(checkboxAt(chevron), null, 'Clicking chevron must not target checkbox');
  assert.strictEqual(checkboxAt(dateCell), null, 'Clicking date cell must not target checkbox');
  assert.strictEqual(checkboxAt(playerCell), null, 'Clicking player cell must not target checkbox');
  assert.strictEqual(checkboxAt(editBtn), null, 'Clicking button must not target checkbox');

  // 2. Clicks in selCell or on groupChk must target groupChk
  assert.strictEqual(checkboxAt(groupChk), groupChk, 'Clicking groupChk directly must target groupChk');
  assert.strictEqual(checkboxAt(selCell), groupChk, 'Clicking inside selCell must target groupChk');

  // 3. Regular child row behavior
  const childRow = createMockElement('tr', ['hist-group-child'], tableBody);
  const childSelCell = createMockElement('td', ['hist-sel-th'], childRow);
  const childChk = createMockElement('input', ['hist-chk'], childSelCell);
  childChk.type = 'checkbox';
  const childDateCell = createMockElement('td', ['hist-accent'], childRow);
  const childCatCell = createMockElement('td', [], childRow);
  const altBadge = createMockElement('span', ['alt-badge'], childCatCell);
  const addNoteHint = createMockElement('span', ['hist-add-note-hint'], childCatCell);
  const descToggle = createMockElement('div', ['hist-desc-toggle'], childCatCell);
  const childActCell = createMockElement('td', ['hist-actions-cell'], childRow);
  const childEditBtn = createMockElement('button', ['small'], childActCell);

  // Clicking normal cells targets childChk
  assert.strictEqual(checkboxAt(childDateCell), childChk, 'Clicking normal row cell targets row checkbox');
  assert.strictEqual(checkboxAt(childChk), childChk, 'Clicking checkbox directly targets row checkbox');
  assert.strictEqual(checkboxAt(childSelCell), childChk, 'Clicking selCell targets row checkbox');

  // Clicking interactive items in normal row returns null
  assert.strictEqual(checkboxAt(altBadge), null, 'Clicking .alt-badge must not toggle selection');
  assert.strictEqual(checkboxAt(addNoteHint), null, 'Clicking .hist-add-note-hint must not toggle selection');
  assert.strictEqual(checkboxAt(descToggle), null, 'Clicking .hist-desc-toggle must not toggle selection');
  assert.strictEqual(checkboxAt(childEditBtn), null, 'Clicking button must not toggle selection');
});

test('static guards: renderGroupHeader protects selection and accordion isolation', () => {
  // Check enableDragMultiSelect contains .hist-group-row guard
  const dragFn = extractFunction(html, 'enableDragMultiSelect');
  assert.ok(
    dragFn.includes("el.closest('.hist-group-row') && !el.closest('.hist-sel-th')"),
    'enableDragMultiSelect must guard against group row accordion clicks'
  );
  assert.ok(
    dragFn.includes('.hist-add-note-hint') && dragFn.includes('.alt-badge'),
    'enableDragMultiSelect must exclude .hist-add-note-hint and .alt-badge'
  );

  // Check renderGroupHeader has selCell stopPropagation
  assert.ok(
    html.includes("selCell.addEventListener('click', (e) => e.stopPropagation());"),
    'selCell must stop click propagation in renderGroupHeader'
  );

  // Check headerTr click listener has guard against interactive elements
  const groupHeaderIdx = html.indexOf('headerTr.addEventListener(\'click\', (e) => {');
  assert.notStrictEqual(groupHeaderIdx, -1, 'headerTr click listener with (e) argument must exist');
  const listenerChunk = html.slice(groupHeaderIdx, groupHeaderIdx + 200);
  assert.ok(
    listenerChunk.includes("if (e.target.closest('.hist-sel-th, button, a, input, select, textarea')) return;"),
    'headerTr click listener must return early when clicking selection or interactive elements'
  );
});
