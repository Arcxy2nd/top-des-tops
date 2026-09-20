'use strict';

/**
 * BotGhost n'affiche que le champ `message` d'une réponse 200 : renvoyer un
 * code d'erreur HTTP ferait disparaître le message côté Discord. Les erreurs
 * sont donc mises au format du pont, et l'URL amont (qui contient
 * l'identifiant du classeur) est masquée.
 */
function bridgeReply(err) {
  const raw = (err && err.message) || String(err);
  const message = raw.replace(/https?:\/\/\S+/g, '[URL masquée]');
  return { status: 200, body: JSON.stringify({ ok: false, message: message }) };
}

module.exports = { bridgeReply };
