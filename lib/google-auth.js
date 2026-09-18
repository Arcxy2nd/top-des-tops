'use strict';

const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// Réutilisé entre invocations "chaudes" d'un même conteneur Vercel ; un cold
// start repart toujours d'un fetch frais (variable non garantie persistante).
let _cachedToken = null; // { accessToken, expiresAt }

function _base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** Construit et signe (RS256) l'assertion JWT du compte de service, sans dépendance externe. */
function _buildAssertion(serviceAccount, nowSeconds) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  };
  const unsigned = _base64url(JSON.stringify(header)) + '.' + _base64url(JSON.stringify(claims));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, 'base64url');
  return unsigned + '.' + signature;
}

/**
 * Échange une assertion JWT signée contre un access token via l'endpoint OAuth2
 * de Google. `fetchImpl` est injectable pour les tests (défaut : fetch natif).
 */
async function getAccessToken(serviceAccount, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.expiresAt > now + 60) {
    return _cachedToken.accessToken;
  }
  const assertion = _buildAssertion(serviceAccount, now);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const res = await doFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Échec de l\'authentification Google (' + res.status + ') : ' + text);
  }
  const json = await res.json();
  _cachedToken = { accessToken: json.access_token, expiresAt: now + (json.expires_in || 3600) };
  return _cachedToken.accessToken;
}

function _resetTokenCacheForTests() { _cachedToken = null; }

module.exports = { getAccessToken, _buildAssertion, _resetTokenCacheForTests };
