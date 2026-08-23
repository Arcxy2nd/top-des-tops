# UI Papercuts Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate five families of silent UI defects in `Index.html` — floating elements that drift from their anchor, listener/DOM leaks, dead keyboard shortcuts on modals, page scrolling behind an open modal, and focus escaping modals.

**Architecture:** Three shared primitives replace ~26 duplicated ad-hoc implementations. `anchorFloating()` owns the lifecycle of any `position:fixed` element tied to a trigger. `openModal(el, opts)`/`closeModal(el)` own the lifecycle of **all seven** modal containers — one shared (`#modalBackdrop`/`#modalBox`) and six bespoke — via a small stack, covering scroll lock, initial focus, focus restoration, and teardown of editors they contain. A single document-level `onModalKeydown` reads that stack to serve Escape, Ctrl+Enter and the Tab focus trap for every container at once, replacing the unreachable per-container handlers. No visual change, no data change, no server call touched.

**Tech Stack:** Google Apps Script web app. Single-file frontend `Index.html` (HTML/CSS/vanilla JS, no build, no framework). Tests: Node built-in test runner (`node --test`) driving functions extracted from `Index.html` into a `vm` sandbox.

## Global Constraints

- **Never touch real data.** All verification runs against the local Node harness only (`tests/`, `tests/frontend/serve.js`). Never against the deployed "Site tops" / "Tops RDS" instances or their Google Sheets. (`context.md` — RÈGLE IMPÉRATIVE)
- **Keep the frontend monolithic.** All frontend code stays in `Index.html`. Do not split it into modules.
- **Comments inside `Index.html` are in French** — match the surrounding file. Identifiers stay in English (`context.md` §8).
- **No ES6 classes.** Object literals or IIFEs only (`context.md` §8).
- **No new runtime dependency.** No CDN library may be added (`context.md` §2).
- **No hardcoded colors.** Use the existing CSS variables only (`context.md` §6).
- **No `TODO`/`FIXME`/placeholder/empty function** in delivered code (`context.md` §8).
- **CHANGELOG.md is mandatory** for the delivery, with both `**Humanisé**` and `**Technique**` voices (`context.md` §8).
- **Commit AND push** — push is what triggers the dual deployment; never ask permission (`context.md` §8).
- **Backdrop click must NOT close the modal.** This is a deliberate documented choice ("trop d'annulations accidentelles avec une progression perdue"). Preserve it.
- Verification command for every task: `npm run verify` (runs `check:html` then the full test suite).

---

### Task 1: `anchorFloating()` primitive + DOM stub for tests

**Files:**
- Create: `tests/dom-stub.js`
- Create: `tests/papercuts.test.js`
- Modify: `Index.html` — insert `anchorFloating()` immediately above the `// ── AUTOCOMPLÉTION DE MENTION` comment block that precedes `function attachMentionAutocomplete(` (currently ~line 5584)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `anchorFloating(el, anchorEl, place, onDetach) -> detach()`
  - `el: HTMLElement` — the floating element (already `position:fixed`, already in the DOM)
  - `anchorEl: HTMLElement` — the trigger it must track
  - `place: (rect, el) => void` — caller-owned positioning math; receives the anchor's current viewport rect
  - `onDetach: (() => void) | undefined` — called when the anchor scrolls out of the viewport, so the caller can close/hide its element
  - returns `detach: () => void` — removes the scroll/resize listeners. Idempotent.
  - Task 2 consumes this exact signature, at four call sites.

- [ ] **Step 1: Write the DOM stub**

Create `tests/dom-stub.js`:

```js
'use strict';

// DOM minimal, juste assez pour les briques de géométrie/cycle de vie extraites
// d'Index.html (anchorFloating, openModal/closeModal, piège de focus). Ce n'est
// pas un DOM généraliste : il modélise écouteurs, focus, classList, style et
// getBoundingClientRect — exactement ce que ces fonctions touchent.

function makeEl(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: id || '',
    style: {},
    dataset: {},
    disabled: false,
    children: [],
    parentNode: null,
    innerHTML: '',
    offsetWidth: 100,
    offsetHeight: 20,
    _rect: { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 },
    _listeners: {},
    _classes: new Set(),
    _focusCount: 0
  };
  el.classList = {
    add: c => el._classes.add(c),
    remove: c => el._classes.delete(c),
    contains: c => el._classes.has(c),
    toggle: (c, on) => (on ? el._classes.add(c) : el._classes.delete(c))
  };
  el.getBoundingClientRect = () => el._rect;
  el.addEventListener = (type, fn, capture) => {
    const key = type + (capture ? ':capture' : '');
    (el._listeners[key] = el._listeners[key] || []).push(fn);
  };
  el.removeEventListener = (type, fn, capture) => {
    const key = type + (capture ? ':capture' : '');
    const arr = el._listeners[key] || [];
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  };
  el.appendChild = child => { child.parentNode = el; el.children.push(child); return child; };
  el.remove = () => {
    if (!el.parentNode) return;
    const i = el.parentNode.children.indexOf(el);
    if (i !== -1) el.parentNode.children.splice(i, 1);
    el.parentNode = null;
  };
  el.focus = () => { el._focusCount++; if (el.ownerDoc) el.ownerDoc.activeElement = el; };
  el.setAttribute = () => {};
  el.querySelectorAll = () => [];
  el.ownerDoc = null;
  return el;
}

// Compte les écouteurs vivants d'un type donné — base des assertions de fuite.
function listenerCount(node, type, capture) {
  return (node._listeners[type + (capture ? ':capture' : '')] || []).length;
}

function fire(node, type, capture, event) {
  const arr = (node._listeners[type + (capture ? ':capture' : '')] || []).slice();
  arr.forEach(fn => fn(event || {}));
}

function makeEnv(opts) {
  opts = opts || {};
  const byId = {};
  const document = {
    activeElement: null,
    _listeners: {},
    body: makeEl('body'),
    createElement: tag => { const e = makeEl(tag); e.ownerDoc = document; return e; },
    getElementById: id => byId[id] || null,
    addEventListener: (type, fn, capture) => {
      const key = type + (capture ? ':capture' : '');
      (document._listeners[key] = document._listeners[key] || []).push(fn);
    },
    removeEventListener: (type, fn, capture) => {
      const key = type + (capture ? ':capture' : '');
      const arr = document._listeners[key] || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    }
  };
  document.body.ownerDoc = document;

  const window = {
    innerHeight: opts.innerHeight || 800,
    innerWidth: opts.innerWidth || 1280,
    _listeners: {},
    addEventListener: (type, fn) => {
      (window._listeners[type] = window._listeners[type] || []).push(fn);
    },
    removeEventListener: (type, fn) => {
      const arr = window._listeners[type] || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    }
  };

  return {
    document,
    window,
    register: (id, el) => { byId[id] = el; el.id = id; el.ownerDoc = document; return el; },
    makeEl: tag => { const e = makeEl(tag); e.ownerDoc = document; return e; },
    listenerCount,
    fire,
    setTimeout: fn => { fn(); return 0; },
    requestAnimationFrame: fn => { fn(); return 0; },
    console: { log() {}, warn() {}, error() {} }
  };
}

module.exports = { makeEnv, makeEl, listenerCount, fire };
```

- [ ] **Step 2: Write the failing test**

Create `tests/papercuts.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/papercuts.test.js`
Expected: FAIL — every test errors with `anchorFloating introuvable dans Index.html`.

- [ ] **Step 4: Implement `anchorFloating` in `Index.html`**

Locate the comment block starting `// ── AUTOCOMPLÉTION DE MENTION` (~line 5584). Insert this block **immediately above it**:

```js
  // ── ANCRAGE D'UN ÉLÉMENT FLOTTANT ────────────────────────────────────
  // Un élément en position:fixed est ancré à l'écran, pas à son bouton : sans
  // repositionnement, il « flotte » dès que la page défile. Cette brique le
  // recale à chaque scroll/resize et le détache quand son ancre quitte l'écran
  // (plus rien à pointer). `place` garde le calcul de position propre à chaque
  // appelant ; `detach` DOIT être appelé à la fermeture, sinon les écouteurs
  // globaux survivent à l'élément (fuite : ils tournent à chaque défilement).
  function anchorFloating(el, anchorEl, place, onDetach) {
    var attached = true;
    function detach() {
      if (!attached) return;
      attached = false;
      document.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    }
    function reposition() {
      var rect = anchorEl.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        detach();
        if (onDetach) onDetach();
        return;
      }
      place(rect, el);
    }
    document.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    reposition();
    return detach;
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/papercuts.test.js`
Expected: PASS — 5 tests passing.

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: `check:html` passes, all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add tests/dom-stub.js tests/papercuts.test.js Index.html && git commit -m "feat(ui): add anchorFloating primitive for viewport-anchored elements"
```

---

### Task 2: Migrate the four anchored elements onto `anchorFloating`

**Files:**
- Modify: `Index.html` — `buildRichSelect()` (locate `function buildRichSelect(`, ~line 7881; the `positionPanel`/`onFollowScroll`/`onFollowResize`/`openPanel`/`closePanel` block is ~lines 8020-8085)
- Modify: `Index.html` — who-am-i handler (locate `positionWhoAmIDropdown`, ~line 17860)
- Modify: `Index.html` — `openNoteHistoryPopover()` / `closeNoteHistoryPopover()` (locate `function closeNoteHistoryPopover(`, ~line 15143)
- Modify: `Index.html` — `attachMentionAutocomplete()` (locate `function attachMentionAutocomplete(`, ~line 5590)
- Modify: `tests/papercuts.test.js`

**Interfaces:**
- Consumes: `anchorFloating(el, anchorEl, place, onDetach) -> detach()` from Task 1.
- Produces: `attachMentionAutocomplete(inputEl, opts) -> { hide, destroy }` — the returned object gains a `destroy()` method. Task 3 consumes `destroy()`.

- [ ] **Step 1: Write the failing test**

Append to `tests/papercuts.test.js`:

```js
test('plus aucun élément ancré ne câble ses propres écouteurs scroll/resize', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const script = html.slice(html.indexOf('<script>'));

  // Tout câblage scroll/resize laissé à la main est un bug de repositionnement
  // en attente. Les seuls tolérés : anchorFloating lui-même, la liste de
  // messages du tchat (sa propre pagination), la bulle de survol de la nav
  // (elle se cache, ne suit pas) et autoGrowTextarea (refit, sans ancre).
  const raw = script.split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(o => /addEventListener\((['"])(scroll|resize)\1/.test(o.line));

  const allowed = [
    /messagesEl\.addEventListener/,
    /group\.addEventListener/,
    /window\.addEventListener\((['"])resize\1, fit\)/,
    /document\.addEventListener\((['"])scroll\1, reposition, true\)/,
    /window\.addEventListener\((['"])resize\1, reposition\)/
  ];
  const stray = raw.filter(o => !allowed.some(re => re.test(o.line)));
  assert.deepStrictEqual(stray.map(o => o.line), [],
    'ces écouteurs doivent passer par anchorFloating');
});

test('attachMentionAutocomplete expose destroy() et suit son champ', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'attachMentionAutocomplete');
  assert.match(src, /destroy/, 'attachMentionAutocomplete doit exposer destroy()');
  assert.match(src, /anchorFloating\(/, 'le popup doit être ancré à son champ');
  assert.doesNotMatch(src, /addEventListener\((['"])scroll\1, hide/,
    'le popup de mention doit suivre son champ, plus se cacher au défilement');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/papercuts.test.js`
Expected: FAIL — the stray-listener test lists the rich-select and who-am-i hookups; the mention test fails on `destroy`.

- [ ] **Step 3: Rewrite `buildRichSelect`'s panel lifecycle**

In `buildRichSelect()`, replace the whole block running from the comment `// position:fixed est ancré à l'écran, pas au trigger : sans repositionnement,` down to the closing brace of `closePanel()` with:

```js
    var detachPanel = null;

    // Le panneau est reparenté sous <body> en position:fixed (cf. openPanel) :
    // il faut donc le recaler sur son bouton à chaque défilement, sinon il
    // reste figé à l'écran pendant que le bouton s'en va.
    function placePanel(rect, node) {
      var vh = window.innerHeight;
      var margin = 6;
      var spaceBelow = vh - rect.bottom - margin;
      var spaceAbove = rect.top - margin;
      node.style.left  = rect.left + 'px';
      node.style.width = rect.width + 'px';
      if (spaceBelow >= 140 || spaceBelow >= spaceAbove) {
        node.style.top = (rect.bottom + margin) + 'px';
        node.style.bottom = '';
        node.style.maxHeight = Math.max(120, Math.min(260, spaceBelow)) + 'px';
      } else {
        node.style.top = '';
        node.style.bottom = (vh - rect.top + margin) + 'px';
        node.style.maxHeight = Math.max(120, Math.min(260, spaceAbove)) + 'px';
      }
    }

    function openPanel() {
      closeAllRichSelects();
      buildPanel();
      panel.style.display = '';

      // Reparent to <body> as position:fixed, positioned from the trigger's
      // own viewport rect. This escapes any ancestor's overflow/scroll
      // clipping (e.g. a tall modal box) and any local stacking context, so
      // the panel always renders fully visible and never over a misplaced
      // hit-area that could close the parent modal by mistake.
      document.body.appendChild(panel);
      panel.style.position = 'fixed';
      detachPanel = anchorFloating(panel, trigger, placePanel, closePanel);

      trigger.classList.add('rs-open');
      trigger.setAttribute('aria-expanded', 'true');
      if (openRichSelectClosers.indexOf(closePanel) === -1) openRichSelectClosers.push(closePanel);
    }

    function closePanel() {
      if (detachPanel) { detachPanel(); detachPanel = null; }
      panel.style.display = 'none';
      if (panel.parentNode === document.body) panel.remove();
      panel.style.position = '';
      panel.style.left = panel.style.top = panel.style.bottom = panel.style.width = panel.style.maxHeight = '';
      trigger.classList.remove('rs-open');
      trigger.setAttribute('aria-expanded', 'false');
      var idx = openRichSelectClosers.indexOf(closePanel);
      if (idx !== -1) openRichSelectClosers.splice(idx, 1);
    }
```

- [ ] **Step 4: Rewrite the who-am-i dropdown lifecycle**

Replace the block running from the comment `// position:fixed est ancré à l'écran, pas au bouton : sans repositionnement,` through the line `document.addEventListener('click', () => closeWhoAmIDropdown());` with:

```js
    // Le menu est en position:fixed : sans recalage il reste figé à l'écran
    // quand la page défile, décroché de son bouton.
    var detachWhoAmI = null;
    function placeWhoAmI(rect, node) {
      node.style.top   = (rect.bottom + 6) + 'px';
      node.style.left  = Math.max(4, rect.right - 220) + 'px';
      node.style.width = '220px';
    }
    function closeWhoAmIDropdown() {
      if (detachWhoAmI) { detachWhoAmI(); detachWhoAmI = null; }
      const wrap = document.getElementById('whoAmIWrap');
      if (wrap) wrap.classList.remove('open');
    }
    document.getElementById('whoAmIBtn').addEventListener('click', e => {
      e.stopPropagation();
      const wrap = document.getElementById('whoAmIWrap');
      if (wrap.classList.contains('open')) { closeWhoAmIDropdown(); return; }
      renderWhoAmI();
      wrap.classList.add('open');
      detachWhoAmI = anchorFloating(
        document.getElementById('whoAmIDropdown'), e.currentTarget, placeWhoAmI, closeWhoAmIDropdown);
    });
    document.addEventListener('click', () => closeWhoAmIDropdown());
```

- [ ] **Step 5: Rewrite the note-history popover lifecycle**

In `closeNoteHistoryPopover()`, replace these two lines:

```js
    if (_activeNoteHistoryPopover._onScroll) document.removeEventListener('scroll', _activeNoteHistoryPopover._onScroll, true);
    if (_activeNoteHistoryPopover._onResize) window.removeEventListener('resize', _activeNoteHistoryPopover._onResize);
```

with:

```js
    if (_activeNoteHistoryPopover._detach) _activeNoteHistoryPopover._detach();
```

In `openNoteHistoryPopover()`, replace the `function reposition() { … }` block, the bare `reposition();` call, the `_activeNoteHistoryPopover = pop;` assignment, and the `pop._onScroll` / `pop._onResize` assignments plus their two `addEventListener` lines, with:

```js
    function placePopover(rect, node) {
      node.style.top = (rect.bottom + 6) + 'px';
      let left = rect.left;
      const maxLeft = window.innerWidth - 300 - 8;
      if (left > maxLeft) left = Math.max(8, maxLeft);
      node.style.left = left + 'px';
    }

    _activeNoteHistoryPopover = pop;
    pop._detach = anchorFloating(pop, anchorEl, placePopover, closeNoteHistoryPopover);
```

Keep the existing `_onDocClick` wiring untouched. `_activeNoteHistoryPopover = pop;` must be assigned **before** `anchorFloating` is called, so the `onDetach` path can find it.

- [ ] **Step 6: Make the mention popup follow its field instead of hiding**

In `attachMentionAutocomplete()`:

(a) Add a lifecycle handle right after `let triggerChar = '@';`:

```js
    let detachPopup = null;
```

(b) Replace `function hide() { … }` with:

```js
    function hide() {
      if (detachPopup) { detachPopup(); detachPopup = null; }
      popup.style.display = 'none';
      range = null;
    }
```

(c) Replace `function position() { … }` with a `place`-shaped function:

```js
    function place(r) {
      const width = Math.round(Math.min(Math.max(r.width, 180), 320));
      popup.style.width = width + 'px';
      // Bascule au-dessus du champ quand il n'y a pas la place en dessous — le
      // composeur du tchat flottant est collé en bas de l'écran, donc le popup
      // s'ouvrait hors-viewport (invisible) sans cette bascule.
      const popupHeight = popup.offsetHeight || 220;
      const spaceBelow = window.innerHeight - r.bottom;
      const top = (spaceBelow < popupHeight + 8 && r.top > popupHeight + 8)
        ? r.top - popupHeight - 4
        : r.bottom + 4;
      popup.style.left = Math.round(Math.min(r.left, window.innerWidth - width - 8)) + 'px';
      popup.style.top  = Math.round(top) + 'px';
    }
```

(d) In `render()`, replace the trailing `if (matches.length) position();` with:

```js
      if (matches.length) {
        if (detachPopup) detachPopup();
        detachPopup = anchorFloating(popup, inputEl, place, hide);
      }
```

(e) Delete these two global lines:

```js
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
```

(f) Replace the trailing `return { hide };` with:

```js
    return {
      hide: hide,
      // Le popup vit sous <body> : sans destroy() il survit à son champ (une
      // div orpheline de plus à chaque ouverture de fenêtre d'édition).
      destroy: function() { hide(); popup.remove(); }
    };
```

- [ ] **Step 7: Run the tests**

Run: `node --test tests/papercuts.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 8: Run the full suite**

Run: `npm run verify`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add Index.html tests/papercuts.test.js && git commit -m "fix(ui): route every anchored floating element through anchorFloating"
```

---

### Task 3: Stop the editor leak (`_destroy` chain)

**Files:**
- Modify: `Index.html` — `autoGrowTextarea()` (locate `function autoGrowTextarea(`, ~line 5699)
- Modify: `Index.html` — `buildTextEditor()` (locate `function buildTextEditor(`, ~line 5718)
- Modify: `Index.html` — `closeModal()` (locate `function closeModal(`, ~line 8867)
- Modify: `tests/papercuts.test.js`

**Interfaces:**
- Consumes: `attachMentionAutocomplete(...) -> { hide, destroy }` from Task 2.
- Produces:
  - `autoGrowTextarea(ta, maxVhRatio) -> fit` where `fit` is the existing refit function **plus** a `fit.destroy: () => void` property. The four existing callers that use the return value as a plain function keep working unchanged.
  - `buildTextEditor(config) -> wrap` where `wrap` gains `wrap._destroy: () => void` alongside the existing `_getValue`/`_setValue`/`_textarea`. Task 4's `closeModal()` calls `_destroy()`.

- [ ] **Step 1: Write the failing test**

Append to `tests/papercuts.test.js`:

```js
test('autoGrowTextarea expose destroy() sur son handle de refit', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'autoGrowTextarea');
  assert.match(src, /fit\.destroy\s*=/, 'le handle de refit doit porter destroy()');
  assert.match(src, /removeEventListener\((['"])resize\1, fit\)/,
    'destroy() doit retirer l\'écouteur resize global');
});

test('buildTextEditor expose _destroy() et débranche ses deux sous-widgets', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'buildTextEditor');
  assert.match(src, /wrap\._destroy\s*=/, 'buildTextEditor doit exposer _destroy()');
  assert.match(src, /mention\.destroy\(\)/, '_destroy doit débrancher l\'autocomplétion');
  assert.match(src, /refit\.destroy\(\)/, '_destroy doit débrancher l\'auto-dimensionnement');
});

test('closeModal détruit les éditeurs de la fenêtre qu\'il ferme', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'closeModal');
  assert.match(src, /_destroy/, 'closeModal doit appeler _destroy() sur les éditeurs de la fenêtre');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/papercuts.test.js`
Expected: FAIL — the three new tests fail on the missing `destroy` wiring.

- [ ] **Step 3: Give `autoGrowTextarea` a teardown**

Replace the tail of `autoGrowTextarea()` — from `ta.addEventListener('input', fit);` through `return fit;` — with:

```js
    ta.addEventListener('input', fit);
    ta.addEventListener('focus', fit);
    window.addEventListener('resize', fit);
    requestAnimationFrame(fit); // premier ajustement une fois posé dans le DOM
    // L'écouteur resize est global : sans destroy() il survit au textarea et
    // se déclenche à chaque redimensionnement, pour un champ qui n'existe plus.
    fit.destroy = function() { window.removeEventListener('resize', fit); };
    return fit;
```

- [ ] **Step 4: Give `buildTextEditor` a teardown**

In `buildTextEditor()`, replace:

```js
    attachMentionAutocomplete(textarea, { onApply: () => triggerChange() });
```

with:

```js
    const mention = attachMentionAutocomplete(textarea, { onApply: () => triggerChange() });
```

Then replace the block from `const refit = autoGrowTextarea(textarea);` through `return wrap;` with:

```js
    const refit = autoGrowTextarea(textarea);
    wrap._getValue = () => textarea.value;
    wrap._setValue = v => { textarea.value = v || ''; triggerChange(); refit(); };
    wrap._textarea = textarea;
    // Un éditeur est reconstruit à chaque ouverture de fenêtre. Sans _destroy(),
    // chaque ouverture laisse derrière elle une div de suggestions orpheline
    // sous <body> et des écouteurs globaux qui tournent à chaque défilement.
    wrap._destroy = () => { mention.destroy(); refit.destroy(); };

    return wrap;
```

- [ ] **Step 5: Have `closeModal` destroy the editors it holds**

Replace `closeModal()` with:

```js
  function closeModal() {
    closeAllRichSelects();
    const box = document.getElementById('modalBox');
    box.querySelectorAll('.md-editor').forEach(ed => { if (ed._destroy) ed._destroy(); });
    document.getElementById('modalBackdrop').style.display = 'none';
    box.innerHTML = '';
    box.style.maxWidth = '';
    box.classList.remove('wide');
    box.classList.remove('xl');
  }
```

Note the `const box` declaration moves to the top of the function — do not declare it twice.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/papercuts.test.js`
Expected: PASS — 10 tests.

- [ ] **Step 7: Run the full suite**

Run: `npm run verify`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add Index.html tests/papercuts.test.js && git commit -m "fix(ui): tear down text editors on modal close to stop listener leak"
```

---

### Task 4: Generic modal lifecycle — `openModal()` / `closeModal()`

The app has **seven** modal containers, not one. Six are bespoke and inherit nothing from the shared one:

| Container | Escape today | Focus today | Scroll lock | Focus trap |
|---|---|---|---|---|
| `#modalBackdrop` (shared, 12 openers) | handler exists but unreachable | none | no | no |
| `#phraseEditModal` | yes (on its input) | yes | no | no |
| `#presetCreateModal` | yes (on its input) | yes | no | no |
| `#presetRenameModal` | yes (on its input) | yes | no | no |
| `#bulkImportModal` | **none** | yes | no | no |
| `#identityPwdModal` | yes (on its input) | yes | no | no |
| `.export-modal-overlay` (built at open time) | **none** | none | no | no |

Fixing only the shared one would leave the feature half-laid — forbidden by `context.md` §7 ("Exhaustivité obligatoire"). So the lifecycle is generic from the start and every container uses it.

**Files:**
- Modify: `Index.html` — CSS, add `body.modal-open` rule right after `.modal-backdrop { … }` (~line 1191)
- Modify: `Index.html` — markup, add `tabindex="-1"` to `#modalBox` (~line 5242), `#phraseEditModal`, `#presetCreateModal`, `#presetRenameModal`, `#bulkImportModal`, `#identityPwdModal` (~lines 5115-5194)
- Modify: `Index.html` — add `openModal()` immediately above `function closeModal()` (~line 8867)
- Modify: `tests/papercuts.test.js`

**Interfaces:**
- Consumes: `closeModal()` as amended in Task 3.
- Produces:
  - `openModal(el, opts) -> void` — `el: HTMLElement | undefined` (defaults to `#modalBackdrop`), `opts: { focus?: HTMLElement } | undefined`. Pushes `el` onto the modal stack, locks page scroll, remembers `document.activeElement`, focuses `opts.focus` or `el` itself.
  - `closeModal(el) -> void` — `el` defaults to `#modalBackdrop`, so the ~40 existing bare `closeModal()` calls keep working unchanged. Pops the stack, unlocks scroll when the stack empties, restores focus.
  - `_modalStack: HTMLElement[]` — module-level; Task 5's keydown handler reads its last entry to know which container is active.
- Tasks 5 and 6 consume all three.

- [ ] **Step 1: Write the failing test**

Append to `tests/papercuts.test.js`:

```js
const MODAL_CONTAINERS = [
  'modalBackdrop', 'phraseEditModal', 'presetCreateModal',
  'presetRenameModal', 'bulkImportModal', 'identityPwdModal'
];

test('aucune fenêtre ne s\'ouvre en poussant directement son display', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const script = html.slice(html.indexOf('<script>'));
  const re = new RegExp("getElementById\\('(" + MODAL_CONTAINERS.join('|') + ")'\\)\\.style\\.display = 'flex'");
  const direct = script.split('\n').map(l => l.trim()).filter(l => re.test(l));
  assert.deepStrictEqual(direct, [],
    'toutes les ouvertures doivent passer par openModal() : sinon ni verrou de défilement, ni focus, ni piège de focus');
});

test('openModal empile, verrouille le défilement, donne le focus et mémorise l\'ouvreur', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'openModal');
  assert.match(src, /_modalStack\.push/, 'doit empiler le conteneur ouvert');
  assert.match(src, /classList\.add\((['"])modal-open\1\)/, 'doit verrouiller le défilement du body');
  assert.match(src, /activeElement/, 'doit mémoriser le bouton qui a ouvert la fenêtre');
  assert.match(src, /\.focus\(\)/, 'doit donner le focus, sinon Échap est mort');
});

test('closeModal dépile, déverrouille le défilement et rend le focus', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'closeModal');
  assert.match(src, /_modalStack/, 'doit dépiler le conteneur');
  assert.match(src, /classList\.remove\((['"])modal-open\1\)/, 'doit déverrouiller le défilement');
  assert.match(src, /_modalReturnFocus/, 'doit rendre le focus au bouton d\'origine');
});

test('closeModal() sans argument vise toujours la fenêtre partagée', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'closeModal');
  assert.match(src, /el \|\| document\.getElementById\('modalBackdrop'\)/,
    'les ~40 appels nus closeModal() doivent continuer à viser #modalBackdrop');
});

test('body.modal-open coupe le défilement et chaque conteneur est focusable', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.match(html, /body\.modal-open\s*\{[^}]*overflow:\s*hidden/,
    'body.modal-open doit couper le défilement de la page');
  ['modalBox'].concat(MODAL_CONTAINERS.filter(id => id !== 'modalBackdrop')).forEach(id => {
    const tag = new RegExp('id="' + id + '"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="' + id + '"');
    assert.match(html, tag, '#' + id + ' doit être focusable pour recevoir Échap / Tab');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/papercuts.test.js`
Expected: FAIL — `openModal introuvable dans Index.html`, plus the 17 direct display sites listed.

- [ ] **Step 3: Add the CSS scroll lock**

Immediately after the `.modal-backdrop { … }` rule, add:

```css
    /* La page ne doit pas défiler derrière une fenêtre ouverte : sans ça, la
       molette au-dessus du fond fait bouger le contenu du dessous et on perd
       sa position de lecture (surtout sur mobile). */
    body.modal-open { overflow: hidden; }
```

- [ ] **Step 4: Make every container focusable**

Add `tabindex="-1"` to each of these six elements in the markup:

```html
  <div class="modal-box" id="modalBox" tabindex="-1"></div>
```

and likewise on `id="phraseEditModal"`, `id="presetCreateModal"`, `id="presetRenameModal"`, `id="bulkImportModal"`, `id="identityPwdModal"` — add `tabindex="-1"` to each opening tag, changing nothing else about them.

`#modalBackdrop` itself does **not** get one: its focusable child `#modalBox` is the focus target.

- [ ] **Step 5: Add `openModal()`**

Immediately **above** `function closeModal() {`, insert:

```js
  // Conteneurs de fenêtre actuellement ouverts — le dernier est l'actif. Une
  // pile plutôt qu'un booléen : le mot de passe d'identité peut se superposer
  // à une autre fenêtre, et le verrou de défilement ne doit sauter qu'à la
  // fermeture de la dernière.
  const _modalStack = [];
  // Bouton qui a ouvert chaque fenêtre : le focus lui revient à la fermeture,
  // sinon on repart du haut de la page à chaque aller-retour.
  const _modalReturnFocus = [];

  // Point d'entrée unique de TOUTES les fenêtres (partagée et sur-mesure).
  // Le focus initial n'est pas cosmétique : les raccourcis Échap/Ctrl+Entrée et
  // le piège de Tab sont posés sur le conteneur ; sans focus à l'intérieur, le
  // keydown ne l'atteint jamais et les raccourcis sont morts.
  function openModal(el, opts) {
    opts = opts || {};
    const modal = el || document.getElementById('modalBackdrop');
    _modalStack.push(modal);
    _modalReturnFocus.push(document.activeElement);
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    const target = opts.focus || (modal.id === 'modalBackdrop' ? document.getElementById('modalBox') : modal);
    setTimeout(() => { if (target && target.focus) target.focus(); }, 0);
  }
```

- [ ] **Step 6: Rewrite `closeModal()` to be generic**

Replace `closeModal()` (as amended in Task 3) with:

```js
  function closeModal(el) {
    const modal = el || document.getElementById('modalBackdrop');
    closeAllRichSelects();
    modal.querySelectorAll('.md-editor').forEach(ed => { if (ed._destroy) ed._destroy(); });
    modal.style.display = 'none';

    const idx = _modalStack.lastIndexOf(modal);
    const opener = idx === -1 ? null : _modalReturnFocus.splice(idx, 1)[0];
    if (idx !== -1) _modalStack.splice(idx, 1);
    if (!_modalStack.length) document.body.classList.remove('modal-open');

    if (modal.id === 'modalBackdrop') {
      const box = document.getElementById('modalBox');
      box.innerHTML = '';
      box.style.maxWidth = '';
      box.classList.remove('wide');
      box.classList.remove('xl');
    }
    if (opener && opener.focus) opener.focus();
  }
```

Note: the editor teardown now runs on `modal`, not on `#modalBox`, so bespoke containers holding an editor are covered too.

- [ ] **Step 7: Migrate all 17 opening sites**

List them:

```bash
grep -n "getElementById('\(modalBackdrop\|phraseEditModal\|presetCreateModal\|presetRenameModal\|bulkImportModal\)').style.display = 'flex'" Index.html
```

**The 12 shared-modal sites** — replace each

```js
    document.getElementById('modalBackdrop').style.display = 'flex';
```

with

```js
    openModal();
```

Then fold their existing focus `setTimeout`s into the call and delete the now-redundant timeout:

- `openEditNoteModal` — `openModal(null, { focus: noteEditor._textarea });`
- `openFullEditHistoryModal` — `openModal(null, { focus: document.getElementById('mEditPts') });`

**The 5 bespoke sites** — replace each container's own display line and delete its focus `setTimeout`:

- `openPhraseModal`: `openModal(document.getElementById('phraseEditModal'), { focus: document.getElementById('phraseModalText') });`
- `openCreatePresetModal`: `openModal(document.getElementById('presetCreateModal'), { focus: document.getElementById('presetNameInput') });`
- `openRenamePresetModal`: `openModal(document.getElementById('presetRenameModal'), { focus: input });` then, on the next line, `setTimeout(() => input.select(), 0);` to preserve the existing select-all behaviour.
- `openBulkImportModal`: `openModal(document.getElementById('bulkImportModal'), { focus: document.getElementById('bulkImportTextarea') });`
- `openIdentityPwdModal`: replace `modal.style.display = 'flex';` with `openModal(modal, { focus: document.getElementById('identityPwdInput') });`

**Their close functions** must route through `closeModal` so the stack, scroll lock and focus return stay correct. In each of `closePhraseModal`, `closeCreatePresetModal`, `closeRenamePresetModal`, `closeBulkImportModal` and `closeIdentityPwdModal`, replace the line

```js
    document.getElementById('<containerId>').style.display = 'none';
```

with

```js
    closeModal(document.getElementById('<containerId>'));
```

keeping every other line of those functions (field resets, error hiding, state clearing) exactly as it is. In `closeIdentityPwdModal` the local is already named `modal` in the opener; use `document.getElementById('identityPwdModal')` explicitly here.

- [ ] **Step 8: Run the tests**

Run: `node --test tests/papercuts.test.js`
Expected: PASS — 15 tests.

- [ ] **Step 9: Run the full suite**

Run: `npm run verify`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add Index.html tests/papercuts.test.js && git commit -m "fix(ui): give every modal container a real lifecycle"
```

---

### Task 5: One focus trap for every modal container

**Files:**
- Modify: `Index.html` — replace the `#modalBackdrop`-only `keydown` handler (locate `document.getElementById('modalBackdrop').addEventListener('keydown'`, ~line 9520)
- Modify: `Index.html` — remove the four now-redundant per-input Escape handlers (~lines 17608, 17620, 17639, 17893)
- Modify: `tests/papercuts.test.js`

**Interfaces:**
- Consumes: `_modalStack`, `openModal()`, `closeModal()` from Task 4.
- Produces: `MODAL_FOCUSABLE_SEL` — a module-level string constant. Task 6 consumes it.

A single document-level handler reading `_modalStack` covers all seven containers at once, instead of seven near-identical handlers.

- [ ] **Step 1: Write the failing test**

Append to `tests/papercuts.test.js`:

```js
test('un seul handler clavier sert toutes les fenêtres, via la pile', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'onModalKeydown');
  assert.match(src, /_modalStack\[_modalStack\.length - 1\]/,
    'le handler doit agir sur la fenêtre active (haut de pile)');
  assert.match(src, /e\.key === 'Escape'/, 'doit gérer Échap');
  assert.match(src, /e\.key !== 'Tab'/, 'doit gérer Tab');
  assert.match(src, /shiftKey/, 'doit gérer Maj+Tab');
  assert.match(src, /querySelectorAll/,
    'les champs doivent être cherchés au moment du Tab : le contenu est reconstruit à chaque ouverture');
});

test('le sélecteur focusable exclut les contrôles désactivés et tabindex="-1"', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const m = /const MODAL_FOCUSABLE_SEL = '([^']+)'/.exec(html);
  assert.ok(m, 'MODAL_FOCUSABLE_SEL doit être une constante littérale');
  assert.match(m[1], /:not\(\[disabled\]\)/, 'doit exclure les contrôles désactivés');
  assert.match(m[1], /tabindex="-1"/, 'doit exclure tabindex="-1"');
});

test('plus aucun handler Échap par champ : le handler global les remplace', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const script = html.slice(html.indexOf('<script>'));
  const perInput = script.split('\n').map(l => l.trim()).filter(l =>
    /e\.key === 'Escape'/.test(l) && /close(Phrase|CreatePreset|RenamePreset|IdentityPwd)Modal/.test(l));
  assert.deepStrictEqual(perInput, [],
    'ces Échap par champ font doublon avec onModalKeydown et ne marchaient que le focus dans le champ');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/papercuts.test.js`
Expected: FAIL — `onModalKeydown introuvable`, no `MODAL_FOCUSABLE_SEL`, four per-input Escape handlers still listed.

- [ ] **Step 3: Replace the handler**

Replace the existing block:

```js
  // Cliquer sur le fond n'annule plus la fenêtre : trop d'annulations
  // accidentelles avec une progression perdue. Seuls Annuler/Échap ferment.
  document.getElementById('modalBackdrop').addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const saveBtn = document.getElementById('mSave');
      if (saveBtn && !saveBtn.disabled) saveBtn.click();
    }
    if (e.key === 'Escape') closeModal();
  });
```

with:

```js
  const MODAL_FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Un seul handler pour les sept conteneurs de fenêtre : il agit sur le haut
  // de la pile. Posé sur document en capture, il fonctionne quel que soit
  // l'endroit du focus — l'ancien handler était posé sur #modalBackdrop, donc
  // muet dès que le focus était resté sur le bouton d'origine, à l'extérieur.
  // Cliquer sur le fond n'annule toujours pas la fenêtre : trop d'annulations
  // accidentelles avec une progression perdue. Seuls Annuler/Échap ferment.
  function onModalKeydown(e) {
    const modal = _modalStack[_modalStack.length - 1];
    if (!modal) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const saveBtn = modal.querySelector('#mSave');
      if (saveBtn && !saveBtn.disabled) { e.preventDefault(); saveBtn.click(); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); closeModal(modal); return; }
    if (e.key !== 'Tab') return;

    // Les champs sont cherchés maintenant, pas à l'ouverture : le contenu est
    // reconstruit à chaque fenêtre et certaines listes se remplissent après
    // coup (réponse serveur). Sans ça, Tab sortirait de la fenêtre pour aller
    // se perdre dans la page invisible derrière.
    const focusables = Array.prototype.slice
      .call(modal.querySelectorAll(MODAL_FOCUSABLE_SEL))
      .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);
    if (!focusables.length) { e.preventDefault(); return; }

    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    const active = document.activeElement;
    const atEdge = e.shiftKey ? (active === first) : (active === last);
    if (atEdge || !modal.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }
  document.addEventListener('keydown', onModalKeydown, true);
```

- [ ] **Step 4: Remove the four redundant per-input Escape handlers**

Each of these now duplicates `onModalKeydown` and only ever fired when focus sat in that one field. In each listed handler, delete **only** the `if (e.key === 'Escape') close…Modal();` line, leaving the rest of the handler (Enter-to-submit, etc.) untouched:

- the `phraseModalText` keydown handler (~line 17608) — drop `if (e.key === 'Escape') closePhraseModal();`
- the `presetNameInput` keydown handler (~line 17620) — drop `if (e.key === 'Escape') closeCreatePresetModal();`
- the preset-rename input keydown handler (~line 17639) — drop `if (e.key === 'Escape') closeRenamePresetModal();`
- the `identityPwdInput` keydown handler (~line 17893) — drop `if (e.key === 'Escape') closeIdentityPwdModal();`

Leave `closeBareme()`'s Escape handler (~line 18273) alone — the barème quick panel is not a modal container and is not on the stack.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/papercuts.test.js`
Expected: PASS — 18 tests.

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add Index.html tests/papercuts.test.js && git commit -m "fix(ui): one keyboard handler and focus trap for every modal container"
```

---

### Task 6: Rebranch the bespoke Export window

**Files:**
- Modify: `Index.html` — `openExportModal()` (locate `function openExportModal(`, ~line 12004)
- Modify: `tests/papercuts.test.js`

**Interfaces:**
- Consumes: `openModal()`, `closeModal()`, `_modalStack` from Task 4; `onModalKeydown` from Task 5 (nothing to wire — it reads the stack).
- Produces: nothing consumed by later tasks.

`openExportModal` builds its overlay at open time rather than using a static container, so it joins the stack explicitly. Once on the stack, it inherits Escape, Ctrl+Enter, the focus trap, the scroll lock and focus restoration for free.

- [ ] **Step 1: Write the failing test**

Append to `tests/papercuts.test.js`:

```js
test('la fenêtre Export rejoint la pile des fenêtres et n\'a plus de cycle de vie maison', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const src = extractFunction(html, 'openExportModal');
  assert.match(src, /openModal\(overlay/, 'l\'overlay Export doit passer par openModal()');
  assert.match(src, /closeModal\(overlay\)/, 'sa fermeture doit passer par closeModal()');
  assert.doesNotMatch(src, /overlay\.remove\(\)/,
    'plus de retrait direct : closeModal() dépile, déverrouille et rend le focus');
  assert.match(src, /overlay\.tabIndex = -1/, 'l\'overlay doit être focusable pour recevoir le clavier');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/papercuts.test.js`
Expected: FAIL — none of the patterns present; `overlay.remove()` still there.

- [ ] **Step 3: Find the Export overlay's open and teardown points**

```bash
sed -n "$(grep -n 'function openExportModal' Index.html | cut -d: -f1),+220p" Index.html | grep -n "overlay.remove\|appendChild(overlay)\|overlay.className"
```

Note every `overlay.remove()` line and the append line — the next step replaces them.

- [ ] **Step 4: Put the Export overlay on the shared lifecycle**

Immediately after `overlay.className = 'export-modal-overlay';`, add:

```js
    // Cette fenêtre se fabrique son propre fond : sans l'inscrire dans la pile,
    // elle n'hériterait ni d'Échap, ni du piège de focus, ni du verrou de
    // défilement (cf. openModal / onModalKeydown).
    overlay.tabIndex = -1;
```

Replace the line that appends the overlay:

```js
    document.body.appendChild(overlay);
```

with:

```js
    document.body.appendChild(overlay);
    openModal(overlay);
```

`openModal` sets `display:flex` on the overlay. If `.export-modal-overlay` relies on a different display mode in CSS, check its rule and, if it is not already `flex`, set `overlay.style.display = 'flex'` is still correct only when the rule expects flex — otherwise add `overlay.style.display = ''` right after `openModal(overlay)` and let the stylesheet own the display, since the stack membership (not the display value) is what grants the behaviour. Verify with:

```bash
grep -n -A6 "\.export-modal-overlay" Index.html | head -20
```

Finally, replace **every** `overlay.remove()` inside this function with:

```js
      closeModal(overlay);
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/papercuts.test.js`
Expected: PASS — 19 tests.

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add Index.html tests/papercuts.test.js && git commit -m "fix(ui): put the Export window on the shared modal lifecycle"
```

---

### Task 7: Live verification, changelog, delivery

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `NEXT_SESSION.md`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: the delivered, pushed change.

- [ ] **Step 1: Start the local harness**

Use the `run` skill, or start the preview from `.claude/launch.json` (`top-des-tops-frontend`, port 8137). Never point verification at a deployed instance.

- [ ] **Step 2: Verify family 1 — anchored elements follow**

For each of: a rich-select filter, the identity menu (top right), a note-history bubble, an `@` mention list — open it, scroll the page, confirm it stays glued to its trigger; keep scrolling until the trigger leaves the viewport and confirm it closes rather than floating.

- [ ] **Step 3: Verify family 2 — no leak**

With the app loaded, run in the page console:

```js
(function(){ return 'orphan popups: ' + document.querySelectorAll('body > .md-mention-popup').length; })();
```

Note the baseline, open and close a note-edit window 20 times, re-run with all windows closed, and confirm the count is back to that baseline.

- [ ] **Step 4: Verify families 3, 4, 5 — all seven containers**

For **each** of: Confirmer, Récap de lot, Édition d'entité, Édition en lot, Édition d'historique, Phrase, Créer un preset, Renommer un preset, Import en lot, Mot de passe d'identité, Export — open it, then without clicking anything:

- press Escape → must close
- reopen, press Tab repeatedly → focus must cycle inside the window only, never reaching the page behind
- scroll the wheel over the backdrop → the page behind must not move
- close → focus must land back on the button that opened it

- [ ] **Step 5: Run the full suite one last time**

Run: `npm run verify`
Expected: `check:html` passes, all tests pass including the 19 in `tests/papercuts.test.js`.

- [ ] **Step 6: Update `CHANGELOG.md`**

Insert a `## [v3.17.0] - 2026-08-23` section directly above `## [v3.16.1]`, with a `### Corrigé` block carrying both mandatory voices.

The **Humanisé** voice must state, in plain language with no jargon: menus and bubbles now follow their button instead of drifting off, and close when it leaves the screen; the app no longer gets progressively slower as edit windows are opened and closed; Échap and Ctrl+Entrée now work on all eleven windows rather than a handful; the page no longer scrolls behind an open window; and the keyboard no longer wanders out of an open window, returning to the button that opened it on close.

The **Technique** voice must name `anchorFloating()`, `openModal(el, opts)`/`closeModal(el)`, `_modalStack`, `onModalKeydown`, `MODAL_FOCUSABLE_SEL`, `buildTextEditor._destroy()`, `autoGrowTextarea` → `fit.destroy()`, and the seven containers now sharing the lifecycle. State that verification ran against the local harness only.

- [ ] **Step 7: Review the diff**

Invoke the `code-review` skill on the full diff since the branch point; address anything it raises before pushing.

- [ ] **Step 8: Confirm the GitHub account, then commit and push**

```bash
gh auth status
```

Expected: `Arcxy2nd` is the active account. If not: `gh auth switch --user Arcxy2nd`.

```bash
git add CHANGELOG.md && git commit -m "docs(changelog): record the UI papercuts audit" && git push
```

The push triggers `.github/workflows/deploy-gas.yml`, which deploys to **both** targets in `deploy-targets.json`.

- [ ] **Step 9: Update `NEXT_SESSION.md`**

Refresh the four blocks (État courant / Dernière session / Écarts / Rappels+Backlog) to record this delivery and whatever remains open.
