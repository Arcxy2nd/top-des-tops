'use strict';

const { acquireLock, releaseLock, newLockToken, LOCK_SHEET_NAME, LEASE_MS, RETRY_MS, CONFIRM_DELAY_MS, BUSY_MESSAGE } = require('../lib/gas-runtime/sheet-lock');
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
  acquireLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1', now: () => 1000, sleep: () => {} }, BASE));
  assert.strictEqual(api.state.cell, 'T1|' + (1000 + LEASE_MS));
});

test('bail expiré : on le reprend', () => {
  const api = makeApi('AUTRE|500');
  acquireLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1', now: () => 1000, sleep: () => {} }, BASE));
  assert.match(api.state.cell, /^T1\|/);
});

test('la confirmation attend CONFIRM_DELAY_MS avant de relire', () => {
  const api = makeApi('');
  const waits = [];
  acquireLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1', now: () => 1000, sleep: ms => waits.push(ms) }, BASE));
  assert.deepStrictEqual(waits, [CONFIRM_DELAY_MS]);
});

test('bail tenu par un autre : on attend puis on réussit quand il libère', () => {
  const api = makeApi('AUTRE|999999');
  let t = 1000;
  const sleeps = [];
  acquireLock(Object.assign({
    syncFetch: api.syncFetch,
    token: 'T1',
    now: () => t,
    // 2 attentes de ré-tentative (bail toujours tenu) puis, une fois libéré,
    // l'attente de confirmation avant la relecture gagnante : 3 au total.
    sleep: ms => { sleeps.push(ms); t += ms; if (sleeps.length === 2) api.state.cell = ''; }
  }, BASE));
  assert.strictEqual(sleeps.length, 3);
  assert.match(api.state.cell, /^T1\|/);
});

test('course perdue : notre jeton a été écrasé pendant la pause de confirmation, on ne croit pas détenir le verrou puis on reprend', () => {
  const api = makeApi('');
  let t = 1000;
  let sleepCalls = 0;
  acquireLock(Object.assign({
    syncFetch: api.syncFetch,
    token: 'T1',
    now: () => t,
    sleep: ms => {
      sleepCalls++;
      t += ms;
      // Au tout premier palier (la confirmation de notre propre écriture),
      // un concurrent plus lent atterrit avec un bail très court.
      if (sleepCalls === 1) api.state.cell = 'AUTRE|' + (t + 50);
    }
  }, BASE));
  assert.ok(sleepCalls >= 3, 'une relecture perdante doit déclencher une nouvelle tentative (retry + nouvelle confirmation)');
  assert.match(api.state.cell, /^T1\|/);
});

test('entrelacement à double gagnant : une écriture concurrente pendant la pause de confirmation ne doit pas nous faire croire gagnant', () => {
  // Avant le correctif (pas d'attente entre écriture et relecture de
  // confirmation), acquireLock relisait son propre jeton immédiatement et
  // repartait "gagnant" avant même que le concurrent B n'ait pu écrire —
  // ce test échoue donc sur le code non corrigé (acquireLock ne lève pas).
  const api = makeApi('');
  let t = 1000;
  let sleepCalls = 0;
  assert.throws(
    () => acquireLock(Object.assign({
      syncFetch: api.syncFetch,
      token: 'T1',
      now: () => t,
      timeoutMs: 5000,
      sleep: ms => {
        sleepCalls++;
        t += ms;
        // Le concurrent B écrit son propre jeton pendant notre toute
        // première pause de confirmation, avec un bail qui ne périmera
        // jamais avant la fin du test (deadline courte).
        if (sleepCalls === 1) api.state.cell = 'B|' + (t + 999999);
      }
    }, BASE)),
    err => err.code === 'LOCK_BUSY',
    'notre jeton écrasé par B ne doit jamais nous faire relire gagnant'
  );
  // Le bail en place doit rester celui de B, jamais le nôtre.
  assert.match(api.state.cell, /^B\|/);
});

test('le délai de ré-tentative varie avec la fonction aléatoire injectée', () => {
  const api = makeApi('AUTRE|999999999');
  let t = 1000;
  const waits = [];
  const values = [0, 1];
  let i = 0;
  assert.throws(
    () => acquireLock(Object.assign({
      syncFetch: api.syncFetch,
      token: 'T1',
      now: () => t,
      timeoutMs: 3000,
      sleep: ms => { waits.push(ms); t += ms; },
      random: () => values[Math.min(i++, values.length - 1)]
    }, BASE)),
    err => err.code === 'LOCK_BUSY'
  );
  assert.ok(waits.includes(RETRY_MS), 'random() = 0 doit donner RETRY_MS');
  assert.ok(waits.includes(RETRY_MS * 2), 'random() = 1 doit donner RETRY_MS * 2');
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
  acquireLock(Object.assign({ syncFetch: api.syncFetch, token: 'T1', now: () => 1000, sleep: () => {} }, BASE));
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
