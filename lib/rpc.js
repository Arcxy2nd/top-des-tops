'use strict';

const crypto = require('crypto');
const { resolveTenant } = require('./tenants');
const { getAccessToken } = require('./google-auth');
const { runApi } = require('./gas-runtime/runtime');

const FN_NAME = /^api[A-Za-z0-9_]*$/;

/**
 * Remplace ScriptApp.getScriptId() : doGet() en garde les 10 premiers
 * caractères pour cloisonner le stockage local par instance (§5 context.md),
 * d'où un hash hexadécimal pur (pas de préfixe commun à tous les tenants).
 */
function scriptIdForTenant(spreadsheetId) {
  return crypto.createHash('sha256').update(String(spreadsheetId)).digest('hex').slice(0, 32);
}

function _parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (_) { return null; }
  }
  return body && typeof body === 'object' && !Buffer.isBuffer(body) ? body : null;
}

function _reply(status, body) {
  return { status, body };
}

/**
 * Logique de l'endpoint RPC, sans dépendance au runtime Vercel : tout est
 * injecté (même séparation que runHealthCheck). Contrat de réponse identique à
 * tests/frontend/serve.js pour que le frontend (Plan 4) n'ait qu'un transport
 * à changer.
 */
async function handleRpc({ method, hostHeader, body, tenants, serviceAccount, fetchImpl, syncFetch, runApiImpl }) {
  if (method !== 'POST') return _reply(405, { ok: false, error: 'Méthode non autorisée.' });
  const tenant = resolveTenant(hostHeader, tenants);
  if (!tenant) return _reply(404, { ok: false, error: 'Tenant inconnu pour cet hôte.' });
  if (!serviceAccount) return _reply(500, { ok: false, error: 'Compte de service Google non configuré.' });

  const payload = _parseBody(body);
  if (!payload || typeof payload.fn !== 'string' || !FN_NAME.test(payload.fn)) {
    return _reply(400, { ok: false, error: 'Requête invalide : champ "fn" attendu (nom de fonction api*).' });
  }
  if (payload.args !== undefined && !Array.isArray(payload.args)) {
    return _reply(400, { ok: false, error: 'Requête invalide : "args" doit être un tableau.' });
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(serviceAccount, fetchImpl);
  } catch (e) {
    console.error('handleRpc auth failure:', e);
    return _reply(500, { ok: false, error: 'Échec de l\'authentification Google. Voir les logs serveur.' });
  }

  try {
    const { value } = (runApiImpl || runApi)({
      fnName: payload.fn,
      args: payload.args || [],
      spreadsheetId: tenant.spreadsheetId,
      accessToken,
      scriptId: scriptIdForTenant(tenant.spreadsheetId),
      syncFetch
    });
    return _reply(200, { ok: true, value });
  } catch (e) {
    if (e && e.code === 'UNKNOWN_FUNCTION') return _reply(404, { ok: false, error: e.message });
    if (e && e.code === 'WRITE_DISABLED') return _reply(403, { ok: false, error: e.message });
    // Même contrat que l'échec d'un google.script.run : le message de Code.gs
    // remonte au client, qui l'affiche comme aujourd'hui.
    console.error('handleRpc ' + payload.fn + ' failure:', e);
    return _reply(200, { ok: false, error: (e && e.message) || String(e) });
  }
}

module.exports = { handleRpc, scriptIdForTenant };
