'use strict';

const { resolveTenant, scriptIdForTenant } = require('./tenants');
const { getAccessToken } = require('./google-auth');
const { runApi } = require('./gas-runtime/runtime');

const FN_NAME = /^api[A-Za-z0-9_]*$/;

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
 * Les erreurs de transport (délai réseau, réponse incohérente) citent l'URL
 * appelée, laquelle contient l'identifiant du classeur du tenant : on le
 * remplace avant de renvoyer le message au client.
 */
function _publicErrorMessage(e) {
  const raw = (e && e.message) || String(e);
  return raw.replace(/https?:\/\/\S+/g, '[URL masquée]');
}

// Une ligne par appel dans les logs Vercel : ce que l'appel a coûté en quota
// Sheets (60 lectures + 60 écritures par minute) et en requêtes Drive.
function _logQuota(fn, meter) {
  if (!meter) return;
  console.log('[quota] ' + fn + ' sheetsReads=' + meter.sheetsReads + ' sheetsWrites=' + meter.sheetsWrites + ' drive=' + meter.drive);
}

/**
 * Logique de l'endpoint RPC, sans dépendance au runtime Vercel : tout est
 * injecté (même séparation que runHealthCheck). Contrat de réponse identique à
 * tests/frontend/serve.js pour que le frontend (Plan 4) n'ait qu'un transport
 * à changer.
 */
async function handleRpc({ method, hostHeader, body, tenants, serviceAccount, fetchImpl, syncFetch, runApiImpl, readOnly }) {
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
  // Optionnelle, fournie par le client pour qu'un renvoi après un délai réseau
  // ne réécrive pas ce qui est déjà passé. Bornée : elle finit dans une cellule.
  if (payload.idempotencyKey !== undefined
      && (typeof payload.idempotencyKey !== 'string' || payload.idempotencyKey.length > 200)) {
    return _reply(400, { ok: false, error: 'Requête invalide : "idempotencyKey" doit être une chaîne de 200 caractères au plus.' });
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(serviceAccount, fetchImpl);
  } catch (e) {
    console.error('handleRpc auth failure:', e);
    return _reply(500, { ok: false, error: 'Échec de l\'authentification Google. Voir les logs serveur.' });
  }

  try {
    const result = (runApiImpl || runApi)({
      fnName: payload.fn,
      args: payload.args || [],
      spreadsheetId: tenant.spreadsheetId,
      accessToken,
      scriptId: scriptIdForTenant(tenant.spreadsheetId),
      syncFetch,
      readOnly,
      idempotencyKey: payload.idempotencyKey
    });
    _logQuota(payload.fn, result && result.meter);
    const { value, replayed } = result;
    // `replayed` dit au client que son renvoi est tombé sur une clé déjà
    // appliquée : le geste a bien eu lieu, rien n'a été écrit deux fois.
    return _reply(200, replayed ? { ok: true, value, replayed: true } : { ok: true, value });
  } catch (e) {
    _logQuota(payload.fn, e && e.meter);
    if (e && e.code === 'UNKNOWN_FUNCTION') return _reply(404, { ok: false, error: e.message });
    if (e && e.code === 'WRITE_DISABLED') return _reply(403, { ok: false, error: e.message });
    // Même contrat que l'échec d'un google.script.run : le message de Code.gs
    // remonte au client, qui l'affiche comme aujourd'hui.
    console.error('handleRpc ' + payload.fn + ' failure:', e);
    return _reply(200, { ok: false, error: _publicErrorMessage(e) });
  }
}

module.exports = { handleRpc, scriptIdForTenant };
