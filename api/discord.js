'use strict';

// require() direct pour que Vercel embarque tenants.json (cf. api/health.js).
const tenants = require('../tenants.json');
const { scriptIdForTenant } = require('../lib/tenants');
const { getAccessToken } = require('../lib/google-auth');
const { runBridge } = require('../lib/gas-runtime/runtime');
const { getSharedSyncFetch } = require('../lib/gas-runtime/sync-fetch');
const { bridgeReply, resolveBridgeRequest } = require('../lib/discord-bridge');

// GET seulement : BotGhost n'envoie que des requêtes GET avec paramètres
// d'URL, et ne suit pas les redirections — l'URL /exec de GAS (302) lui
// était donc inutilisable ; ici la réponse est un 200 direct.
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    // Secret vérifié EN PREMIER, avant la résolution du tenant : voir le
    // commentaire de resolveBridgeRequest (lib/discord-bridge.js) — sinon un
    // appelant sans secret valide peut distinguer "Tenant inconnu." de
    // "Non autorisé." selon le tenant demandé, ce qui révèle quels tenants
    // existent. resolveBridgeRequest normalise aussi les paramètres d'URL
    // répétés (Vercel en fait un tableau, jamais Apps Script).
    const parsed = resolveBridgeRequest({
      method: req.method,
      query: req.query || {},
      hostHeader: req.headers.host,
      tenants,
      bridgeSecret: process.env.DISCORD_BRIDGE_SECRET
    });
    if (parsed.reply) {
      if (parsed.reply.allow) res.setHeader('Allow', parsed.reply.allow);
      res.status(parsed.reply.status).send(parsed.reply.body);
      return;
    }
    const { parameter, tenant } = parsed;
    const accessToken = await getAccessToken(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY));
    const out = runBridge({
      parameter: parameter,
      spreadsheetId: tenant.spreadsheetId,
      accessToken: accessToken,
      scriptId: scriptIdForTenant(tenant.spreadsheetId),
      syncFetch: getSharedSyncFetch(),
      // Même valeur que celle qui vient d'être vérifiée ci-dessus : runBridge
      // l'injecte dans le magasin de propriétés du bac à sable (seed), pour
      // que DiscordBridge.gs (qui la lit via PropertiesService) valide contre
      // exactement le même secret que la route — plus de copie séparée à
      // maintenir dans l'onglet ScriptProperties du classeur.
      secret: process.env.DISCORD_BRIDGE_SECRET,
      readOnly: process.env.TDT_READ_ONLY === '1'
    });
    res.status(200).send(out.body);
  } catch (e) {
    console.error('api/discord failure:', e);
    // TDT_READ_ONLY n'est pas une panne : c'est un interrupteur volontaire.
    // Le masquer derrière « Erreur interne » envoyait l'utilisateur Discord
    // (et nous) chercher un bug inexistant.
    const reply = e && e.code === 'WRITE_DISABLED'
      ? bridgeReply(new Error('Le site est en lecture seule pour le moment : aucune écriture n\'est possible.'))
      : bridgeReply(new Error('Erreur interne du pont.'));
    res.status(reply.status).send(reply.body);
  }
};
