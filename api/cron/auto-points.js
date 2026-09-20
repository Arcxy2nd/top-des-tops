'use strict';

// require() direct pour que Vercel embarque tenants.json (cf. api/health.js).
const tenants = require('../../tenants.json');
const { resolveTenant, scriptIdForTenant } = require('../../lib/tenants');
const { getAccessToken } = require('../../lib/google-auth');
const { runApi } = require('../../lib/gas-runtime/runtime');
const { getSharedSyncFetch } = require('../../lib/gas-runtime/sync-fetch');

// Le cron tourne toujours ; c'est la propriété auto_trigger_installed du
// classeur qui décide si les règles s'exécutent — runAutoPoints -> runDue ne
// fait rien quand aucune règle n'est due.
module.exports = async function handler(req, res) {
  try {
    const expected = process.env.CRON_SECRET;
    const provided = String(req.headers.authorization || '');
    if (!expected || provided !== 'Bearer ' + expected) {
      res.status(401).json({ ok: false, error: 'Appel de tâche planifiée non autorisé.' });
      return;
    }
    const host = (req.query && req.query.tenant) || '';
    const tenant = resolveTenant(host, tenants);
    if (!tenant) {
      res.status(404).json({ ok: false, error: 'Tenant inconnu.' });
      return;
    }
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!raw) {
      res.status(500).json({ ok: false, error: 'Compte de service Google non configuré.' });
      return;
    }
    const accessToken = await getAccessToken(JSON.parse(raw));
    const { value } = runApi({
      fnName: 'runAutoPoints',
      args: [],
      spreadsheetId: tenant.spreadsheetId,
      accessToken,
      scriptId: scriptIdForTenant(tenant.spreadsheetId),
      syncFetch: getSharedSyncFetch(),
      readOnly: process.env.TDT_READ_ONLY === '1'
    });
    res.status(200).json({ ok: true, value: value });
  } catch (e) {
    console.error('api/cron/auto-points failure:', e);
    res.status(500).json({ ok: false, error: 'Échec de la tâche planifiée. Voir les logs serveur.' });
  }
};
