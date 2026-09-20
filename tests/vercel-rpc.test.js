'use strict';

const { handleRpc, scriptIdForTenant } = require('../lib/rpc');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { _resetTokenCacheForTests } = require('../lib/google-auth');
const { buildSheets } = require('./frontend/fixtures.js');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');

const TENANTS = { 'test.example.com': { spreadsheetId: 'SHEET_A' } };

function serviceAccount() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  });
  return { client_email: 'svc@test.iam.gserviceaccount.com', private_key: privateKey };
}

const SA = serviceAccount();
const tokenFetch = async () => ({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) });

function call(overrides) {
  _resetTokenCacheForTests();
  return handleRpc(Object.assign({
    method: 'POST',
    hostHeader: 'test.example.com',
    body: { fn: 'apiGetSettings', args: [] },
    tenants: TENANTS,
    serviceAccount: SA,
    fetchImpl: tokenFetch,
    syncFetch: makeFakeSheetsApi(fixtureGrids(buildSheets())).syncFetch
  }, overrides));
}

test('405 pour toute méthode autre que POST', async () => {
  const r = await call({ method: 'GET' });
  assert.strictEqual(r.status, 405);
  assert.strictEqual(r.body.ok, false);
});

test('404 pour un hôte inconnu, sans refléter le header Host', async () => {
  const r = await call({ hostHeader: 'pirate.example.com' });
  assert.strictEqual(r.status, 404);
  assert.doesNotMatch(r.body.error, /pirate/);
});

test('500 si le compte de service est absent', async () => {
  const r = await call({ serviceAccount: null });
  assert.strictEqual(r.status, 500);
});

test('400 pour un corps invalide (JSON cassé, fn absent ou mal formé, args non tableau)', async () => {
  for (const body of ['{pas du json', {}, { fn: 'eval' }, { fn: 'apiGetSettings', args: 'x' }]) {
    const r = await call({ body });
    assert.strictEqual(r.status, 400, JSON.stringify(body));
    assert.strictEqual(r.body.ok, false);
  }
});

test('accepte un corps texte JSON (Content-Type absent)', async () => {
  const r = await call({ body: JSON.stringify({ fn: 'apiGetSettings' }) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
});

test('500 générique si l\'auth Google échoue, sans détail amont', async () => {
  const r = await call({ fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'invalid_grant svc@test' }) });
  assert.strictEqual(r.status, 500);
  assert.doesNotMatch(r.body.error, /invalid_grant|svc@test/);
});

test('404 fonction inconnue, 403 fonction d\'écriture', async () => {
  assert.strictEqual((await call({ body: { fn: 'apiNExistePas' } })).status, 404);
  const w = await call({ body: { fn: 'apiAddNote', args: [] } });
  assert.strictEqual(w.status, 403);
  assert.strictEqual(w.body.ok, false);
});

test('exception de Code.gs : 200 + ok:false avec son message (contrat google.script.run)', async () => {
  const r = await call({ runApiImpl: () => { throw new Error('Erreur de connexion BDD : test'); } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body, { ok: false, error: 'Erreur de connexion BDD : test' });
});

test('succès de bout en bout : vrai runtime, faux Sheets API', async () => {
  const r = await call({});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  assert.ok(r.body.value.players.some(p => p.name === 'Safir'));
});

test('runApi reçoit le tenant, le jeton et un scriptId stable', async () => {
  let received = null;
  await call({ runApiImpl: opts => { received = opts; return { value: 1, discardedWrites: 0 }; } });
  assert.strictEqual(received.spreadsheetId, 'SHEET_A');
  assert.strictEqual(received.accessToken, 'tok');
  assert.strictEqual(received.scriptId, scriptIdForTenant('SHEET_A'));
  assert.match(received.scriptId, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(scriptIdForTenant('SHEET_A').slice(0, 10), scriptIdForTenant('SHEET_B').slice(0, 10));
});
