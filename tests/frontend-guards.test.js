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
    google: { script: { run: null } },
    _MUTATING_APIS: new Set(['apiMutatingTest']),
    _identityPassword: 'my-secret-pwd'
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

test('callServer appends _identityPassword to mutating endpoints and not to read endpoints', () => {
  const { callServer, sandbox } = loadCallServer();
  let receivedArgs = null;
  const runner = {
    withSuccessHandler(h) { return { withFailureHandler(fh) { return {
      apiMutatingTest(...args) { receivedArgs = args; h({ success: true }); },
      apiReadTest(...args) { receivedArgs = args; h({ success: true }); }
    }; } }; }
  };
  sandbox.google.script.run = runner;

  callServer('apiMutatingTest', ['Alice', 'data'], () => {});
  assert.deepStrictEqual(receivedArgs, ['Alice', 'data', 'my-secret-pwd']);

  callServer('apiReadTest', ['Alice'], () => {});
  assert.deepStrictEqual(receivedArgs, ['Alice']);
});

test('callServer with silent=true suppresses failure toasts on both failure and success-with-error', () => {
  const { callServer, toasts, sandbox } = loadCallServer();
  const runner = {
    withSuccessHandler(h) { return { withFailureHandler(fh) { return {
      apiFail(...args) { fh(new Error('network glitch')); },
      apiErrorPayload(...args) { h({ success: false, error: 'service busy' }); }
    }; } }; }
  };
  sandbox.google.script.run = runner;

  let errSeen = 0;
  callServer('apiFail', [], () => {}, 'Poll chat', () => { errSeen++; }, true);
  assert.strictEqual(errSeen, 1, 'onError callback must still be invoked');
  assert.strictEqual(toasts.length, 0, 'toast must be suppressed when silent=true on network failure');

  callServer('apiErrorPayload', [], () => {}, 'Poll chat', () => { errSeen++; }, true);
  assert.strictEqual(errSeen, 2, 'onError callback must still be invoked');
  assert.strictEqual(toasts.length, 0, 'toast must be suppressed when silent=true on success:false payload');
});

test('showSkeleton replaces a stalled skeleton with a readable message', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const timers = [];
  const container = {
    innerHTML: '',
    // The watchdog reads innerHTML to decide: a container the response has
    // already filled must not be overwritten.
    querySelector: () => null
  };
  const sandbox = {
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    CONFIG: { SKELETON_TIMEOUT_MS: 15000 },
    location: { reload() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'showSkeleton') + '\nthis.__showSkeleton = showSkeleton;', sandbox);

  sandbox.__showSkeleton(container, { rows: 3, height: 40 });
  assert.match(container.innerHTML, /class="skeleton/, 'le squelette doit être posé immédiatement');
  assert.strictEqual(timers.length, 1, 'un chien de garde doit être armé');
  assert.strictEqual(timers[0].ms, 15000, 'le délai doit venir de CONFIG');

  timers[0].fn();
  assert.doesNotMatch(container.innerHTML, /class="skeleton/, 'le squelette doit disparaître');
  assert.match(container.innerHTML, /Chargement interrompu/);
});

test('showSkeleton leaves a container alone once it has been filled', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const timers = [];
  const container = { innerHTML: '', querySelector: () => null };
  const sandbox = {
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    CONFIG: { SKELETON_TIMEOUT_MS: 15000 },
    location: { reload() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'showSkeleton') + '\nthis.__showSkeleton = showSkeleton;', sandbox);

  sandbox.__showSkeleton(container, { rows: 2, height: 30 });
  container.innerHTML = '<div class="sr-list">Contenu réel</div>';
  timers[0].fn();
  assert.strictEqual(container.innerHTML, '<div class="sr-list">Contenu réel</div>');
});

test('applyRowCategoryVisuals does not reference refreshBaremeForTop from its own scope', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const sandbox = {
    cachedAltCategories: [],
    ALT_FALLBACK_COLOR: '#ffd166',
    categoryColor: () => '#ff0000'
    // refreshBaremeForTop is intentionally NOT defined here: applyRowCategoryVisuals
    // must not call it directly, since in the real file it only exists inside
    // addEntryRow's closure and is unreachable from here — this reproduces the
    // exact production ReferenceError if the old code path is still present.
  };
  vm.createContext(sandbox);
  vm.runInContext(
    extractFunction(html, 'applyRowCategoryVisuals') +
    "\nthis.__apply = applyRowCategoryVisuals;",
    sandbox
  );
  const div = { style: { setProperty() {} } };
  assert.doesNotThrow(() => sandbox.__apply(div, 'Some Category', false));
});

test('applyFiltersBtn, startDate and endDate never bind applyFilters directly as their listener', () => {
  // addEventListener passes the DOM Event as the first argument. applyFilters(onDone)
  // treats that first argument as a callback and does `if (onDone) onDone()` — bound
  // directly, the Event object gets called as a function and throws. The three call
  // sites must wrap it: `() => applyFilters()`.
  const html = fs.readFileSync(INDEX, 'utf8');
  const broken = [
    /getElementById\('applyFiltersBtn'\)\.addEventListener\('click',\s*applyFilters\)/,
    /getElementById\('startDate'\)\.addEventListener\('change',\s*applyFilters\)/,
    /getElementById\('endDate'\)\.addEventListener\('change',\s*applyFilters\)/
  ];
  broken.forEach(pattern => {
    assert.doesNotMatch(html, pattern, 'applyFilters bound directly as a listener: ' + pattern);
  });
});

test('body and form controls never transition background-color (theme toggle freeze)', () => {
  // Chromium never re-triggers a transition on a property whose only change
  // driver is a CSS custom property swap (var(--bg) via body.light) — the paint
  // stays pinned to whatever was computed on first load. Reproduced live in the
  // browser: `--bg`/`--card-solid` update correctly on the element, but
  // getComputedStyle(...).backgroundColor never moves as long as a `transition`
  // covers `background`/`background-color`/`all` on that same rule.
  const html = fs.readFileSync(INDEX, 'utf8');

  const bodyRule = html.slice(html.indexOf('body {'), html.indexOf('body {') + 600);
  assert.doesNotMatch(
    bodyRule.replace(/\/\*[\s\S]*?\*\//g, ''),
    /transition:\s*[^;]*\b(background|all)\b/,
    'la règle body ne doit pas transitionner background/all'
  );

  const controlsRule = html.slice(html.indexOf('FORM CONTROLS'), html.indexOf('FORM CONTROLS') + 700);
  assert.doesNotMatch(
    controlsRule.replace(/\/\*[\s\S]*?\*\//g, ''),
    /transition:\s*[^;]*\b(background|all)\b/,
    'la règle des champs de formulaire ne doit pas transitionner background/all'
  );
});

test('loadEntities always resolves its onDone callback, success or failure', () => {
  // globalRefresh() waits on 2 callbacks (loadEntities + loadAppBranding) before
  // calling stopLoading() on the refresh button. loadEntities' apiGetSettings call
  // must call onDone() on BOTH paths — if the error path forgets it, the pending
  // counter never reaches 0 and the button stays disabled/spinning forever on any
  // backend failure.
  const html = fs.readFileSync(INDEX, 'utf8');
  const fn = extractFunction(html, 'loadEntities');
  const errorBranchStart = fn.indexOf("'Chargement settings'");
  assert.notStrictEqual(errorBranchStart, -1, "l'appel apiGetSettings doit garder son errorLabel 'Chargement settings'");
  const errorBranch = fn.slice(errorBranchStart, fn.indexOf('\n  }', errorBranchStart));
  assert.match(errorBranch, /if\s*\(onDone\)\s*onDone\(\)/, "le chemin d'erreur d'apiGetSettings doit appeler onDone()");
});

test('the Podium load has an error path that clears its skeleton', () => {
  // Without a 5th (onError) argument, callServer only shows a toast on failure —
  // #phrasesList stayed in its loading skeleton until the generic 15s watchdog.
  const html = fs.readFileSync(INDEX, 'utf8');
  const idx = html.indexOf("'Chargement preset actif'");
  assert.notStrictEqual(idx, -1, "l'appel apiGetActivePhrasePreset introuvable");
  const tail = html.slice(idx, idx + 300);
  assert.match(tail, /=>\s*\{[\s\S]*phrasesList/, "un onError doit toucher #phrasesList après 'Chargement preset actif'");
});

test('clearPhrasesCard renders a visible empty-state message instead of a hidden dead div', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const list = { innerHTML: '' };
  const rerollBtn = { style: {} };
  const sandbox = {
    document: {
      getElementById: id => (id === 'phrasesList' ? list : (id === 'phrasesRerollBtn' ? rerollBtn : null))
    },
    stopCatAutoplay: () => {},
    lastPhraseSortedRows: 'sentinel'
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'clearPhrasesCard') + '\nthis.__clear = clearPhrasesCard;', sandbox);

  sandbox.__clear();
  assert.doesNotMatch(list.innerHTML, /display:\s*none/, "l'état vide du Podium ne doit plus rester caché");
  assert.match(list.innerHTML, /phrases-empty-icon/, "l'état vide doit porter une icône, comme les autres états vides de l'onglet");
  assert.match(list.innerHTML, /Aucune donnée/, "l'état vide doit expliquer la situation à l'utilisateur");
});

test('renderRetryableError shows a message and a working retry button', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const container = { innerHTML: '', children: [], appendChild(el) { this.children.push(el); } };
  const sandbox = {
    document: { createElement: () => ({ style: {}, addEventListener(ev, fn) { this._onclick = fn; } }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'renderRetryableError') + '\nthis.__render = renderRetryableError;', sandbox);

  let retried = false;
  sandbox.__render(container, () => { retried = true; });

  assert.strictEqual(container.children.length, 2, 'un message + un bouton de reprise');
  assert.strictEqual(container.children[0].textContent, 'Données indisponibles.');
  assert.strictEqual(container.children[1].textContent, '↻ Réessayer');
  container.children[1]._onclick();
  assert.strictEqual(retried, true, 'le clic sur Réessayer doit relancer le chargement');
});

test('Trends and Active-day panels use distinct wording for a real error vs genuinely no data', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const trendsErr = extractFunction(html, 'loadTrends');
  assert.match(trendsErr, /'Données indisponibles\.'/, 'loadTrends doit distinguer une panne backend');
  const trendsEmpty = extractFunction(html, 'renderTrends');
  assert.match(trendsEmpty, /'Pas assez de données récentes\.'/, 'renderTrends doit garder son texte "vraiment vide"');

  const weekday = extractFunction(html, 'loadActiveWeekday');
  assert.match(weekday, /'Données indisponibles\.'/, 'loadActiveWeekday doit distinguer une panne backend');
  assert.match(weekday, /'Aucune donnée\.'/, 'loadActiveWeekday doit garder son texte "vraiment vide"');
});

test('the harness exposes every server function Index.html calls', () => {
  const { loadGas } = require('./harness.js');
  const html = fs.readFileSync(INDEX, 'utf8');
  const called = [...new Set(
    [...html.matchAll(/callServer\(\s*'([A-Za-z0-9_]+)'/g)].map(m => m[1])
  )].sort();

  assert.ok(called.length > 50, 'l’extraction des appels a échoué : ' + called.length + ' trouvés');

  const gas = loadGas();
  const missing = called.filter(name => typeof gas[name] !== 'function');

  assert.deepStrictEqual(
    missing, [],
    // A function missing here is invisible to the browser harness: the tab that
    // calls it renders an error state that has nothing to do with the app.
    'fonctions appelées par Index.html mais absentes du harness : ' + missing.join(', ')
  );
});
