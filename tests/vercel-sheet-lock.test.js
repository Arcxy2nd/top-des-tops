'use strict';

const { acquireLock, releaseLock, newLockToken, LOCK_SHEET_NAME, LEASE_MS, BUSY_MESSAGE } = require('../lib/gas-runtime/sheet-lock');
const test = require('node:test');
const assert = require('node:assert');

/**
 * Faux Sheets API centré sur la cellule de bail. `cell` est l'état partagé ;
 * `onWrite` permet de simuler un concurrent qui écrase notre jeton entre
 * notre écriture et notre relecture.
 */
function makeApi(initialCell, options) {
  const opts = options || {};
  const state = { cell: initialCell === undefined ? '' : initialCell, exists: opts.exists !== false };
  const calls = [];
  function syncFetch(url, init) {
    const method = (init && init.method) || 'GET';
    calls.push({ url, method, body: init && init.body });
    if (/:batchUpdate$/.test(url)) {
      state.exists = true;
      return { status: 200, body: JSON.stringify({ replies: [{}] }) };
    }
    if (!state.exists) return { status: 400, body: JSON.stringify({ error: { message: 'Unable to parse range' } }) };
    if (method === 'PUT') {
      state.cell = JSON.parse(init.body).values[0][0];
      if (opts.onWrite) opts.onWrite(state);
      return { status: 200, body: JSON.stringify({ updatedCells: 1 }) };
    }
    return { status: 200, body: JSON.stringify(state.cell === '' ? {} : { values: [[state.cell]] }) };
  }
  return { syncFetch, calls, state };
}

const BASE = { accessToken: 'tok', spreadsheetId: 'S' };

test('cellule libre : le verrou est pris et le bail porte notre jeton', () => {
  const api = makeApi('');
  acquireLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1', now: () => 1000 }, BASE));
  assert.strictEqual(api.state.cell, 'T1|' + (1000 + LEASE_MS));
});

test('bail expiré : on le reprend', () => {
  const api = makeApi('AUTRE|500');
  acquireLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1', now: () => 1000 }, BASE));
  assert.match(api.state.cell, /^T1\|/);
});

test('bail tenu par un autre : on attend puis on réussit quand il libère', () => {
  const api = makeApi('AUTRE|999999');
  let t = 1000;
  const sleeps = [];
  acquireLock(Object.assign({
    syncFetch: api.syncFetch,
    token: 'T1',
    now: () => t,
    sleep: ms => { sleeps.push(ms); t += ms; if (sleeps.length === 2) api.state.cell = ''; }
  }, BASE));
  assert.strictEqual(sleeps.length, 2);
  assert.match(api.state.cell, /^T1\|/);
});

test('course perdue : notre jeton a été écrasé, on ne croit pas détenir le verrou', () => {
  let overwrites = 0;
  const api = makeApi('', { onWrite: state => { if (++overwrites === 1) state.cell = 'AUTRE|999999'; } });
  let t = 1000;
  acquireLock(Object.assign({
    syncFetch: api.syncFetch,
    token: 'T1',
    now: () => t,
    sleep: ms => { t += ms; api.state.cell = ''; }
  }, BASE));
  assert.ok(overwrites >= 2, 'une relecture perdante doit déclencher une nouvelle tentative');
  assert.match(api.state.cell, /^T1\|/);
});

test('délai dépassé : LOCK_BUSY avec le message exact de Code.gs', () => {
  const api = makeApi('AUTRE|999999999');
  let t = 1000;
  assert.throws(
    () => acquireLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1', now: () => t, sleep: ms => { t += ms; }, timeoutMs: 1000 }, BASE)),
    err => err.code === 'LOCK_BUSY' && err.message === BUSY_MESSAGE
  );
});

test('onglet de verrou absent : il est créé puis le verrou est pris', () => {
  const api = makeApi('', { exists: false });
  acquireLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1', now: () => 1000 }, BASE));
  const created = api.calls.find(c => /:batchUpdate$/.test(c.url));
  assert.ok(created, 'un addSheet doit être émis');
  assert.match(created.body, new RegExp(LOCK_SHEET_NAME));
  assert.match(api.state.cell, /^T1\|/);
});

test('release vide la cellule quand le bail est le nôtre', () => {
  const api = makeApi('T1|999999');
  releaseLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1' }, BASE));
  assert.strictEqual(api.state.cell, '');
});

test('release ne touche pas un bail repris par un autre', () => {
  const api = makeApi('AUTRE|999999');
  releaseLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1' }, BASE));
  assert.strictEqual(api.state.cell, 'AUTRE|999999');
});

test('release n\'échoue jamais sur une erreur réseau (le bail expirera)', () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    releaseLock(Object.assign({ syncFetch: () => { throw new Error('réseau'); }, token: 'T1' }, BASE));
  } finally {
    console.error = originalError;
  }
});

test('deux jetons tirés de suite diffèrent', () => {
  assert.notStrictEqual(newLockToken(), newLockToken());
});
