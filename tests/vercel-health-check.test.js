'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { runHealthCheck } = require('../lib/health-check');
const { _resetTokenCacheForTests } = require('../lib/google-auth');

function _makeServiceAccount() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  });
  return { client_email: 'svc@test.iam.gserviceaccount.com', private_key: privateKey };
}

function _makeFetch({ tokenOk = true, sheetsOk = true, sheetsValues = [] } = {}) {
  return async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      if (!tokenOk) return { ok: false, status: 401, text: async () => 'invalid_grant' };
      return { ok: true, json: async () => ({ access_token: 'fake-token', expires_in: 3600 }) };
    }
    if (!sheetsOk) return { ok: false, status: 403, text: async () => 'permission refusée' };
    return { ok: true, json: async () => ({ values: sheetsValues }) };
  };
}

test('runHealthCheck retourne 404 pour un hôte inconnu (défaut-refus)', async () => {
  const result = await runHealthCheck({
    hostHeader: 'inconnu.example.com',
    tenants: { 'test.example.com': { spreadsheetId: 'SHEET_A' } },
    serviceAccount: _makeServiceAccount(),
    fetchImpl: _makeFetch()
  });
  assert.strictEqual(result.status, 404);
  assert.strictEqual(result.body.ok, false);
  assert.match(result.body.message, /inconnu\.example\.com/);
});

test('runHealthCheck retourne 500 quand le compte de service est absent', async () => {
  const result = await runHealthCheck({
    hostHeader: 'test.example.com',
    tenants: { 'test.example.com': { spreadsheetId: 'SHEET_A' } },
    serviceAccount: null,
    fetchImpl: _makeFetch()
  });
  assert.strictEqual(result.status, 500);
  assert.strictEqual(result.body.ok, false);
  assert.match(result.body.message, /Compte de service Google non configuré/);
});

test('runHealthCheck retourne 200 avec le nombre de lignes lues sur le tenant résolu', async () => {
  _resetTokenCacheForTests();
  const values = [
    ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'],
    ['Mario Kart', 'Courses', '🏎️', '#ff0000', '1']
  ];
  const result = await runHealthCheck({
    hostHeader: 'test.example.com:443',
    tenants: { 'test.example.com': { spreadsheetId: 'SHEET_A' } },
    serviceAccount: _makeServiceAccount(),
    fetchImpl: _makeFetch({ sheetsValues: values })
  });
  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.body.ok, true);
  assert.strictEqual(result.body.tenant, 'test.example.com');
  assert.strictEqual(result.body.rowCount, 1);
  assert.ok(result.body.checkedAt);
});

test('runHealthCheck retourne 500 avec un message générique (pas le détail brut) si Sheets API refuse (ex: Sheet non partagé)', async () => {
  _resetTokenCacheForTests();
  const result = await runHealthCheck({
    hostHeader: 'test.example.com',
    tenants: { 'test.example.com': { spreadsheetId: 'SHEET_A' } },
    serviceAccount: _makeServiceAccount(),
    fetchImpl: _makeFetch({ sheetsOk: false })
  });
  assert.strictEqual(result.status, 500);
  assert.strictEqual(result.body.ok, false);
  assert.doesNotMatch(result.body.message, /403/, 'le détail brut Google ne doit pas fuiter dans la réponse publique');
  assert.match(result.body.message, /Échec de la vérification de connectivité/);
});

test('runHealthCheck retourne 500 quand l\'endpoint OAuth Google lui-même refuse la requête', async () => {
  _resetTokenCacheForTests();
  const result = await runHealthCheck({
    hostHeader: 'test.example.com',
    tenants: { 'test.example.com': { spreadsheetId: 'SHEET_A' } },
    serviceAccount: _makeServiceAccount(),
    fetchImpl: _makeFetch({ tokenOk: false })
  });
  assert.strictEqual(result.status, 500);
  assert.strictEqual(result.body.ok, false);
});
