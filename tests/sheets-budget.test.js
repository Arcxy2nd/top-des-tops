'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { runApi } = require('../lib/gas-runtime/runtime');
const { buildSheets } = require('./frontend/fixtures.js');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');
const meterLib = require('../lib/gas-runtime/request-meter');

// Budget de requêtes Sheets par appel : le garde-fou du quota (60/min).
// Chaque phase du plan 2026-09-25 abaisse ces plafonds.
const SCRIPT_ID = 'MOCK_SCRIPT_ID_12345';

function makeWorld(options) {
  return makeFakeSheetsApi(fixtureGrids(buildSheets()), options);
}

function call(api, fnName, args) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return runApi({ fnName, args: args || [], spreadsheetId: 'SHEET_BUDGET', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: api.syncFetch });
  } finally {
    console.warn = warn;
  }
}

// Pauses de réessai à zéro le temps d'un test (le module lit le tableau à chaque essai).
function withoutRetryDelays(fn) {
  const saved = meterLib.RETRY_DELAYS_MS.slice();
  meterLib.RETRY_DELAYS_MS.fill(0);
  try {
    return fn();
  } finally {
    saved.forEach((v, i) => { meterLib.RETRY_DELAYS_MS[i] = v; });
  }
}

const BUDGET = {
  apiGetBootstrapData: { reads: 1, writes: 0 },
  apiGetQuickStats: { reads: 1, writes: 0 },
  apiGetAllNotes: { reads: 1, writes: 0 },
  apiGetHistoryPage: { reads: 1, writes: 0 }
};

Object.keys(BUDGET).forEach(fn => {
  test('budget ' + fn, () => {
    const api = makeWorld();
    // apiGetHistoryPage(page, pageSize, filtres…) : filtres absents = aucun filtre.
    const out = call(api, fn, fn === 'apiGetHistoryPage' ? [1, 50] : []);
    assert.ok(out.meter.sheetsReads <= BUDGET[fn].reads, fn + ' : ' + out.meter.sheetsReads + ' lectures');
    assert.ok(out.meter.sheetsWrites <= BUDGET[fn].writes, fn + ' : ' + out.meter.sheetsWrites + ' écritures');
  });
});

test('budget écriture apiAddNote', () => {
  const api = makeWorld();
  const out = call(api, 'apiAddNote', ['Safir', 'Note budget', '', 'Safir', '']);
  assert.strictEqual(out.value.success, true);
  assert.ok(out.meter.sheetsReads <= 4, out.meter.sheetsReads + ' lectures');
  assert.ok(out.meter.sheetsWrites <= 3, out.meter.sheetsWrites + ' écritures');
});

// Phase 3 : instantané du classeur gardé par l'instance chaude, validé par la
// version Drive. Les tests ci-dessus tournent sans Drive (le faux Sheets ne
// sert pas l'API Drive) : ils vérifient le repli à 1 lecture par appel.
const snapshotCache = require('../lib/gas-runtime/snapshot-cache');

function makeWorldWithDrive() {
  const sheets = makeWorld();
  const drive = { version: 1 };
  return {
    syncFetch(url, init) {
      if (String(url).indexOf('googleapis.com/drive/v3/files/') !== -1) {
        return { status: 200, body: JSON.stringify({ version: String(drive.version) }) };
      }
      const res = sheets.syncFetch(url, init);
      if (/:batchUpdate$/.test(url)) drive.version++;
      return res;
    }
  };
}

['apiGetBootstrapData', 'apiGetQuickStats'].forEach(fn => {
  test('budget cache : 2e ' + fn + ' identique = 0 lecture', () => {
    snapshotCache.clear();
    const world = makeWorldWithDrive();
    call(world, fn);
    const out = call(world, fn);
    assert.strictEqual(out.meter.sheetsReads, 0);
    assert.strictEqual(out.meter.sheetsWrites, 0);
    snapshotCache.clear();
  });
});

test('budget cache : apiAddNote avec instantané chaud ≤ 3 lectures', () => {
  snapshotCache.clear();
  const world = makeWorldWithDrive();
  call(world, 'apiGetAllNotes');
  const out = call(world, 'apiAddNote', ['Safir', 'Note budget', '', 'Safir', '']);
  assert.strictEqual(out.value.success, true);
  assert.ok(out.meter.sheetsReads <= 3, out.meter.sheetsReads + ' lectures');
  assert.ok(out.meter.sheetsWrites <= 3, out.meter.sheetsWrites + ' écritures');
  snapshotCache.clear();
});

// Phase 4 : verrou Upstash Redis (faux Redis) — le verrou ne coûte plus rien
// en quota Sheets, il ne reste que le batchUpdate.
test('budget cache + verrou Redis : apiAddNote = 0 lecture, 1 écriture', () => {
  const { makeFakeRedis } = require('./vercel-redis-lock.test.js');
  snapshotCache.clear();
  const world = makeWorldWithDrive();
  const redis = makeFakeRedis();
  const syncFetch = (url, init) => (String(url).indexOf('https://redis.test') === 0 ? redis.syncFetch(url, init) : world.syncFetch(url, init));
  const opts = { spreadsheetId: 'SHEET_BUDGET', accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch, redis: { url: 'https://redis.test', token: 'rtok' } };
  const warn = console.warn;
  console.warn = () => {};
  let out;
  try {
    runApi(Object.assign({ fnName: 'apiGetAllNotes', args: [] }, opts));
    out = runApi(Object.assign({ fnName: 'apiAddNote', args: ['Safir', 'Note budget', '', 'Safir', ''] }, opts));
  } finally {
    console.warn = warn;
  }
  assert.strictEqual(out.value.success, true);
  assert.strictEqual(out.meter.sheetsReads, 0);
  assert.strictEqual(out.meter.sheetsWrites, 1);
  assert.deepStrictEqual(redis.calls.map(c => c.cmd[0]), ['SET', 'EVAL']);
  assert.strictEqual(redis.store.size, 0);
  snapshotCache.clear();
});

test('un 429 passager ne remonte pas à l\'utilisateur', () => {
  const api = makeWorld({ failWith429: 1 });
  const out = withoutRetryDelays(() => call(api, 'apiGetAllNotes'));
  assert.ok(out.value);
});

// Code.gs rattrape l'exception de lecture (et retente lui-même l'ouverture du
// classeur) : un 429 persistant ressort donc en { success: false, error }.
test('429 persistant : l\'appel échoue avec le message Sheets', () => {
  const api = makeWorld({ failWith429: 1000 });
  const error = console.error;
  console.error = () => {};
  let out;
  try {
    out = withoutRetryDelays(() => call(api, 'apiGetAllNotes'));
  } finally {
    console.error = error;
  }
  assert.strictEqual(out.value.success, false);
  assert.match(out.value.error, /Échec Sheets API \(429\)/);
});

module.exports = { makeWorld, call };
