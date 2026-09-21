'use strict';

const { resolveTenant } = require('./tenants');
const { getAccessToken } = require('./google-auth');
const { readDataRows } = require('./sheets-read');

/**
 * Logique de santé, sans dépendance au runtime Vercel (pas de req/res, pas de
 * process.env) : tout est injecté, donc testable avec de purs fixtures.
 * Lit la feuille Categories (toujours présente, cf. §3 context.md) pour
 * confirmer la chaîne tenant -> auth Google -> Sheets API de bout en bout.
 */
async function runHealthCheck({ method, hostHeader, tenants, serviceAccount, fetchImpl }) {
  if (method && method !== 'GET' && method !== 'HEAD') {
    return { status: 405, body: { ok: false, message: 'Méthode non autorisée.' } };
  }
  const tenant = resolveTenant(hostHeader, tenants);
  if (!tenant) {
    // Le header Host n'est jamais renvoyé : il est contrôlé par le client.
    return { status: 404, body: { ok: false, message: 'Tenant inconnu pour cet hôte.' } };
  }
  if (!serviceAccount) {
    return { status: 500, body: { ok: false, message: 'Compte de service Google non configuré.' } };
  }
  try {
    const accessToken = await getAccessToken(serviceAccount, fetchImpl);
    const { values } = await readDataRows(accessToken, tenant.spreadsheetId, 'categories', undefined, fetchImpl);
    return {
      status: 200,
      body: { ok: true, tenant: tenant.host, rowCount: values.length, checkedAt: new Date().toISOString() }
    };
  } catch (e) {
    console.error('runHealthCheck failure:', e);
    // Extrait uniquement le code HTTP à 3 chiffres du message d'erreur amont
    // (format 'Échec de ... (<code>) : <detail>' produit par google-auth.js et
    // sheets-read.js) pour garder le diagnostic actionnable côté wizard (Task 5)
    // sans réexposer le détail brut (numéro de projet GCP, email du compte de
    // service) que ce message générique existe justement pour ne pas fuiter.
    const statusMatch = e && e.message && e.message.match(/\((\d{3})\)/);
    const statusCode = statusMatch ? statusMatch[1] : null;
    const message = statusCode
      ? 'Échec de la vérification de connectivité (' + statusCode + '). Voir les logs serveur pour le détail.'
      : 'Échec de la vérification de connectivité. Voir les logs serveur pour le détail.';
    return { status: 500, body: { ok: false, message } };
  }
}

module.exports = { runHealthCheck };
