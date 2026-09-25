'use strict';

// require() direct pour que Vercel embarque tenants.json (cf. api/health.js).
const tenants = require('../../tenants.json');
const { resolveTenant, scriptIdForTenant } = require('../../lib/tenants');
const { getAccessToken } = require('../../lib/google-auth');
const { runApi } = require('../../lib/gas-runtime/runtime');
const { getSharedSyncFetch } = require('../../lib/gas-runtime/sync-fetch');
const { redisConfigFromEnv } = require('../../lib/gas-runtime/redis-lock');
const { runAutoPointsIfInstalled } = require('../../lib/auto-points-cron');

// Le cron tourne toujours ; c'est la propriété auto_trigger_installed du
// classeur qui décide si les règles s'exécutent — vérifiée explicitement par
// runAutoPointsIfInstalled, runDue ne la consultant pas.
module.exports = async function handler(req, res) {
  try {
    const expected = process.env.CRON_SECRET;
    const provided = String(req.headers.authorization || '');
    if (!expected || provided !== 'Bearer ' + expected) {
      res.status(401).json({ ok: false, error: 'Appel de tâche planifiée non autorisé.' });
      return;
    }
    // Sans `?tenant=`, la tâche couvre TOUS les tenants déclarés. Avec l'hôte
    // en dur dans vercel.json, ajouter une instance revenait à priver
    // silencieusement celle-ci de ses points automatiques — et l'oubli ne se
    // voyait nulle part. Le paramètre reste accepté pour rejouer un tenant
    // précis à la main.
    const requested = (req.query && req.query.tenant) || '';
    let targets;
    if (requested) {
      const one = resolveTenant(requested, tenants);
      if (!one) {
        res.status(404).json({ ok: false, error: 'Tenant inconnu.' });
        return;
      }
      targets = [one];
    } else {
      targets = Object.keys(tenants).map(h => resolveTenant(h, tenants)).filter(Boolean);
    }
    if (!targets.length) {
      res.status(500).json({ ok: false, error: 'Aucun tenant configuré.' });
      return;
    }

    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!raw) {
      res.status(500).json({ ok: false, error: 'Compte de service Google non configuré.' });
      return;
    }
    const accessToken = await getAccessToken(JSON.parse(raw));

    // Séquentiel volontairement : deux tenants en parallèle doubleraient la
    // pointe de requêtes Sheets sur le même compte de service (quota 60/min).
    // Un tenant en échec ne doit pas empêcher les suivants de tourner.
    const results = [];
    let failures = 0;
    for (const tenant of targets) {
      try {
        const outcome = runAutoPointsIfInstalled(runApi, {
          spreadsheetId: tenant.spreadsheetId,
          accessToken,
          scriptId: scriptIdForTenant(tenant.spreadsheetId),
          syncFetch: getSharedSyncFetch(),
          readOnly: process.env.TDT_READ_ONLY === '1',
          // Même verrou que api/rpc, sinon les deux écrivains ne s'excluent pas.
          redis: redisConfigFromEnv(process.env)
        });
        results.push({ tenant: tenant.host, ok: true, skipped: outcome.skipped, reason: outcome.reason, value: outcome.value });
      } catch (e) {
        failures++;
        console.error('api/cron/auto-points failure for ' + tenant.host + ':', e);
        results.push({ tenant: tenant.host, ok: false, error: 'Échec. Voir les logs serveur.' });
      }
    }
    // Tous en échec = la tâche a échoué (Vercel la marque en erreur) ; un échec
    // partiel reste un 200 pour ne pas masquer les tenants qui ont réussi.
    res.status(failures === targets.length ? 500 : 200).json({ ok: failures === 0, results: results });
  } catch (e) {
    console.error('api/cron/auto-points failure:', e);
    res.status(500).json({ ok: false, error: 'Échec de la tâche planifiée. Voir les logs serveur.' });
  }
};
