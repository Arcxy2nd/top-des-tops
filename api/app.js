'use strict';

// require() direct pour que Vercel embarque tenants.json (cf. api/health.js).
const tenants = require('../tenants.json');
const { resolveTenant } = require('../lib/tenants');
const { renderAppPage } = require('../lib/app-page');

// Coquille non testée unitairement : elle ne fait que brancher req/res sur
// renderAppPage (tests/vercel-app-page.test.js). Vérifiée en conditions
// réelles à la Task 4.
module.exports = function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).send('Méthode non autorisée.');
      return;
    }
    const tenant = resolveTenant(req.headers.host, tenants);
    if (!tenant) {
      res.status(404).send('Tenant inconnu pour cet hôte.');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Le fichier change à chaque livraison et pèse 1 Mo : revalidation
    // systématique, sinon un utilisateur garde un frontend périmé parlant à
    // un backend à jour.
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(renderAppPage({ tenant }));
  } catch (e) {
    console.error('api/app failure:', e);
    res.status(500).send('Échec du rendu de la page. Voir les logs serveur.');
  }
};
