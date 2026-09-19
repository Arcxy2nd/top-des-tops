'use strict';

// require() direct (et non lib/tenants.js#loadTenants, qui lit via
// fs.readFileSync(filePath || TENANTS_FILE) — indirection non traçable
// statiquement par le Node File Trace de Vercel) pour garantir que
// tenants.json est bien inclus dans le bundle déployé.
const tenants = require('../tenants.json');
const { runHealthCheck } = require('../lib/health-check');

/** Parse GOOGLE_SERVICE_ACCOUNT_KEY (JSON stringifié) depuis l'environnement Vercel. */
function _parseServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return JSON.parse(raw);
}

// Coquille volontairement non testée unitairement : elle ne fait que brancher
// req/res/process.env sur runHealthCheck, déjà couvert par
// tests/vercel-health-check.test.js. Vérifiée en conditions réelles par le
// curl de fin de wizard (Task 5).
module.exports = async function handler(req, res) {
  try {
    const serviceAccount = _parseServiceAccount();
    const result = await runHealthCheck({ method: req.method, hostHeader: req.headers.host, tenants, serviceAccount });
    if (result.status === 405) res.setHeader('Allow', 'GET, HEAD');
    res.status(result.status).json(result.body);
  } catch (e) {
    console.error('api/health setup failure:', e);
    res.status(500).json({ ok: false, message: 'Échec de l\'initialisation du endpoint de santé. Voir les logs serveur pour le détail.' });
  }
};
