'use strict';

// require() direct pour que Vercel embarque tenants.json (cf. api/health.js).
const tenants = require('../tenants.json');
const { resolveTenant, scriptIdForTenant } = require('../lib/tenants');
const { getAccessToken } = require('../lib/google-auth');
const { runBridge } = require('../lib/gas-runtime/runtime');
const { getSharedSyncFetch } = require('../lib/gas-runtime/sync-fetch');
const { bridgeReply } = require('../lib/discord-bridge');

// GET seulement : BotGhost n'envoie que des requêtes GET avec paramètres
// d'URL, et ne suit pas les redirections — d'où le Worker Cloudflare qui
// relayait l'URL /exec de GAS, devenu inutile ici (réponse 200 directe).
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      const reply = bridgeReply(new Error('Méthode non autorisée.'));
      res.status(reply.status).send(reply.body);
      return;
    }
    const parameter = Object.assign({}, req.query || {});
    const tenant = resolveTenant(parameter.tenant || req.headers.host, tenants);
    if (!tenant) {
      const reply = bridgeReply(new Error('Tenant inconnu.'));
      res.status(reply.status).send(reply.body);
      return;
    }
    // Le secret vit dans les variables Vercel ; DiscordBridge.gs le lit par
    // PropertiesService, donc on l'injecte dans le paramètre attendu.
    if (!process.env.DISCORD_BRIDGE_SECRET) {
      const reply = bridgeReply(new Error('Pont Discord non configuré.'));
      res.status(reply.status).send(reply.body);
      return;
    }
    if (String(parameter.secret || '') !== String(process.env.DISCORD_BRIDGE_SECRET)) {
      res.status(200).send(JSON.stringify({ ok: false, message: 'Non autorisé.' }));
      return;
    }
    const accessToken = await getAccessToken(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY));
    const out = runBridge({
      parameter: parameter,
      spreadsheetId: tenant.spreadsheetId,
      accessToken: accessToken,
      scriptId: scriptIdForTenant(tenant.spreadsheetId),
      syncFetch: getSharedSyncFetch(),
      readOnly: process.env.TDT_READ_ONLY === '1'
    });
    res.status(200).send(out.body);
  } catch (e) {
    console.error('api/discord failure:', e);
    const reply = bridgeReply(new Error('Erreur interne du pont.'));
    res.status(reply.status).send(reply.body);
  }
};
