'use strict';

const { resolveTenant } = require('./tenants');

/**
 * BotGhost n'affiche que le champ `message` d'une réponse 200 : renvoyer un
 * code d'erreur HTTP ferait disparaître le message côté Discord. Les erreurs
 * sont donc mises au format du pont, et l'URL amont (qui contient
 * l'identifiant du classeur) est masquée.
 */
function bridgeReply(err) {
  const raw = (err && err.message) || String(err);
  const message = raw.replace(/https?:\/\/\S+/g, '[URL masquée]');
  return { status: 200, body: JSON.stringify({ ok: false, message: message }) };
}

/**
 * Vercel rend un tableau quand un paramètre d'URL est répété (`?top=a&top=b`),
 * là où Apps Script (doGet(e).parameter) donnait toujours une chaîne unique :
 * DiscordBridge.gs ferait alors `top.trim is not a function`. On ne garde que
 * la dernière occurrence — comportement le plus proche d'un formulaire HTML
 * classique — convertie en chaîne. Une clé absente reste `undefined`.
 */
function _normalizeParam(v) {
  const last = Array.isArray(v) ? v[v.length - 1] : v;
  return last === undefined || last === null ? undefined : String(last);
}

function normalizeBridgeParams(query) {
  const out = {};
  Object.keys(query || {}).forEach(k => { out[k] = _normalizeParam(query[k]); });
  return out;
}

/**
 * Décision d'accès du pont, sans dépendance au runtime Vercel (même
 * séparation que handleRpc/lib/rpc.js) : testable sans req/res.
 *
 * Le secret est vérifié EN PREMIER, avant toute résolution de tenant. Avec
 * l'ancien ordre (tenant résolu, puis secret vérifié), un appelant sans secret
 * valide pouvait distinguer "Tenant inconnu." de "Non autorisé." selon le
 * tenant demandé dans l'URL — ce qui révélait quels tenants existent. Un
 * secret manquant ou invalide rend donc toujours exactement le même message,
 * avant même de savoir si le tenant demandé existe.
 *
 * Retourne soit `{ reply }` (réponse à renvoyer telle quelle, court-circuit),
 * soit `{ parameter, tenant }` pour poursuivre vers runBridge.
 */
function resolveBridgeRequest({ method, query, hostHeader, tenants, bridgeSecret }) {
  if (method !== 'GET') {
    const reply = bridgeReply(new Error('Méthode non autorisée.'));
    return { reply: Object.assign({}, reply, { allow: 'GET' }) };
  }

  const parameter = normalizeBridgeParams(query);

  if (!bridgeSecret || String(parameter.secret || '') !== String(bridgeSecret)) {
    return { reply: { status: 200, body: JSON.stringify({ ok: false, message: 'Non autorisé.' }) } };
  }

  const tenant = resolveTenant(parameter.tenant || hostHeader, tenants);
  if (!tenant) {
    return { reply: bridgeReply(new Error('Tenant inconnu.')) };
  }

  return { parameter, tenant };
}

module.exports = { bridgeReply, normalizeBridgeParams, resolveBridgeRequest };
