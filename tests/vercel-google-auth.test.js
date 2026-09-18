'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { getAccessToken, _buildAssertion, _resetTokenCacheForTests } = require('../lib/google-auth');

function _makeKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  });
}

test('_buildAssertion produit un JWT RS256 avec les bonnes revendications, signature vérifiable', () => {
  const { publicKey, privateKey } = _makeKeyPair();
  const serviceAccount = { client_email: 'svc@test.iam.gserviceaccount.com', private_key: privateKey };
  const now = 1700000000;
  const jwt = _buildAssertion(serviceAccount, now);

  const parts = jwt.split('.');
  assert.strictEqual(parts.length, 3);

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  assert.strictEqual(header.alg, 'RS256');
  assert.strictEqual(header.typ, 'JWT');
  assert.strictEqual(claims.iss, 'svc@test.iam.gserviceaccount.com');
  assert.strictEqual(claims.scope, 'https://www.googleapis.com/auth/spreadsheets');
  assert.strictEqual(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.strictEqual(claims.iat, now);
  assert.strictEqual(claims.exp, now + 3600);

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(parts[0] + '.' + parts[1]);
  verifier.end();
  assert.ok(verifier.verify(publicKey, parts[2], 'base64url'), 'la signature doit être valide');
});

test('getAccessToken échange l\'assertion contre un token et le met en cache', async () => {
  _resetTokenCacheForTests();
  const { privateKey } = _makeKeyPair();
  const serviceAccount = { client_email: 'svc@test.iam.gserviceaccount.com', private_key: privateKey };
  let callCount = 0;
  const fakeFetch = async (url, opts) => {
    callCount++;
    assert.strictEqual(url, 'https://oauth2.googleapis.com/token');
    assert.strictEqual(opts.method, 'POST');
    assert.match(opts.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
    return { ok: true, json: async () => ({ access_token: 'fake-token-123', expires_in: 3600 }) };
  };

  const token1 = await getAccessToken(serviceAccount, fakeFetch);
  assert.strictEqual(token1, 'fake-token-123');
  assert.strictEqual(callCount, 1);

  const token2 = await getAccessToken(serviceAccount, fakeFetch);
  assert.strictEqual(token2, 'fake-token-123');
  assert.strictEqual(callCount, 1, 'le second appel doit réutiliser le cache, pas re-fetcher');
});

test('getAccessToken lève une erreur explicite si Google refuse', async () => {
  _resetTokenCacheForTests();
  const { privateKey } = _makeKeyPair();
  const serviceAccount = { client_email: 'svc@test.iam.gserviceaccount.com', private_key: privateKey };
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid_grant' });

  await assert.rejects(
    () => getAccessToken(serviceAccount, fakeFetch),
    /Échec de l.authentification Google \(401\)/
  );
});
