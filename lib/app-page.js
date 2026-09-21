'use strict';

const fs = require('fs');
const path = require('path');
const { scriptIdForTenant } = require('./tenants');

// doGet() ajoutait en fin de document un script portant l'identifiant de
// l'instance : toutes les clés localStorage/sessionStorage en sont préfixées
// (tdt_<id>_*), ce qui cloisonne deux instances servies sous le même domaine.
// Changer cet identifiant déconnecte tout le monde : il est donc dérivé du
// classeur (stable) et surchargeable tenant par tenant.

const INDEX_FILE = path.join(__dirname, '..', 'Index.html');
const INSTANCE_ID_LENGTH = 10;

function instanceIdFor(tenant) {
  if (tenant && tenant.instanceId) return String(tenant.instanceId);
  return scriptIdForTenant(tenant && tenant.spreadsheetId).slice(0, INSTANCE_ID_LENGTH);
}

function _instanceScript(instanceId) {
  // JSON.stringify n'échappe jamais '/' : un instanceId contenant "</script>"
  // (tenants.json est une donnée de config, pas une entrée utilisateur, mais
  // on ne le suppose pas) casserait hors de la balise. On échappe '<' en
  // <, comme le fait Next.js pour le même problème.
  const safeId = JSON.stringify(instanceId).replace(/</g, '\\u003c');
  return '<script>window.__APP_INSTANCE_ID__ = ' + safeId
    + '; if (window.syncIdentityFromStorage) window.syncIdentityFromStorage();</script>';
}

function _defaultReadIndex() {
  return fs.readFileSync(INDEX_FILE, 'utf8');
}

/**
 * Le document n'est jamais réécrit : le script est concaténé après, comme le
 * faisait HtmlOutput.append(). Une substitution dans un fichier d'1 Mo serait
 * à la fois coûteuse et fragile.
 */
function renderAppPage({ tenant, readIndex }) {
  const html = (readIndex || _defaultReadIndex)();
  return html + _instanceScript(instanceIdFor(tenant));
}

module.exports = { renderAppPage, instanceIdFor, INDEX_FILE, INSTANCE_ID_LENGTH };
