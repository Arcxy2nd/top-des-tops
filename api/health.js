'use strict';

const { loadTenants } = require('../lib/tenants');
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
  const tenants = loadTenants();
  const serviceAccount = _parseServiceAccount();
  const result = await runHealthCheck({ hostHeader: req.headers.host, tenants, serviceAccount });
  res.status(result.status).json(result.body);
};
