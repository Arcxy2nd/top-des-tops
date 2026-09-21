'use strict';

// require() direct pour que Vercel embarque tenants.json (cf. api/health.js).
const tenants = require('../tenants.json');
const { handleRpc } = require('../lib/rpc');
const { getSharedSyncFetch } = require('../lib/gas-runtime/sync-fetch');

function _parseServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return JSON.parse(raw);
}

// Coquille non testée unitairement : elle ne fait que brancher req/res/
// process.env sur handleRpc (tests/vercel-rpc.test.js). Vérifiée en conditions
// réelles par les curl de fin de Task 5.
module.exports = async function handler(req, res) {
  try {
    let body;
    try {
      body = req.body; // getter Vercel : lève sur un JSON invalide
    } catch (_) {
      body = null;
    }
    const result = await handleRpc({
      method: req.method,
      hostHeader: req.headers.host,
      body,
      tenants,
      serviceAccount: _parseServiceAccount(),
      syncFetch: getSharedSyncFetch(),
      // Interrupteur d'arrêt d'urgence : poser TDT_READ_ONLY=1 dans les
      // variables Vercel referme le backend en lecture seule sans redéployer.
      readOnly: process.env.TDT_READ_ONLY === '1'
    });
    if (result.status === 405) res.setHeader('Allow', 'POST');
    res.status(result.status).json(result.body);
  } catch (e) {
    console.error('api/rpc setup failure:', e);
    res.status(500).json({ ok: false, error: 'Échec de l\'initialisation du endpoint RPC. Voir les logs serveur.' });
  }
};
