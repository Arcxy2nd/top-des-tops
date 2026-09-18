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
async function runHealthCheck({ hostHeader, tenants, serviceAccount, fetchImpl }) {
  const tenant = resolveTenant(hostHeader, tenants);
  if (!tenant) {
    return { status: 404, body: { ok: false, message: 'Tenant inconnu pour cet hôte : ' + hostHeader } };
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
    return { status: 500, body: { ok: false, message: 'Échec de la vérification de connectivité. Voir les logs serveur pour le détail.' } };
  }
}

module.exports = { runHealthCheck };
