'use strict';

// Un appel mutant est « au moins une fois », pas « exactement une fois » : si
// le lot atteint Google mais que la réponse se perd (délai réseau de 20 s,
// maxDuration de 60 s), l'utilisateur voit une erreur et peut rejouer — les
// points seraient ajoutés deux fois, sans aucun moyen de le détecter.
//
// La clé d'idempotence ferme ce trou. Elle vit dans un onglet technique du
// classeur, donc elle passe par le modèle en mémoire, donc par le MÊME
// batchUpdate que les données : une clé ne peut pas être enregistrée sans que
// l'écriture qu'elle protège le soit aussi, ni l'inverse.

const IDEMPOTENCY_SHEET_NAME = 'Idempotency';
const IDEMPOTENCY_HEADERS = ['Key', 'Timestamp', 'Result'];

// Au-delà, les plus anciennes lignes partent dans le même lot. Une clé n'a de
// sens que le temps qu'un utilisateur puisse rejouer son geste ; la garder
// indéfiniment ferait grossir l'onglet — et donc chaque lecture — sans fin.
const MAX_KEYS = 200;

// Une réponse plus longue n'est pas stockée : le rejeu rend alors un accusé
// minimal plutôt que la valeur d'origine. Mieux vaut une réponse pauvre qu'une
// cellule Sheets saturée (limite de 50 000 caractères par cellule).
const MAX_RESULT_CHARS = 4000;

function _text(v) {
  return v === null || v === undefined ? '' : String(v);
}

/**
 * `openSpreadsheet` rend le modèle en mémoire du classeur : toute écriture faite
 * ici est journalisée et part dans le lot de l'appel en cours.
 */
function createIdempotencyStore({ openSpreadsheet }) {
  let sheet = null;
  let resolved = false;

  function findSheet() {
    if (!resolved) {
      sheet = openSpreadsheet().getSheetByName(IDEMPOTENCY_SHEET_NAME);
      resolved = true;
    }
    return sheet;
  }

  function ensureSheet() {
    if (findSheet()) return sheet;
    sheet = openSpreadsheet().insertSheet(IDEMPOTENCY_SHEET_NAME);
    sheet.appendRow(IDEMPOTENCY_HEADERS);
    resolved = true;
    return sheet;
  }

  /** Lignes de données (en-tête exclu), les plus anciennes d'abord. */
  function rows() {
    const target = findSheet();
    if (!target) return [];
    const lastRow = target.getLastRow();
    if (lastRow < 2) return [];
    return target.getRange(2, 1, lastRow - 1, 3).getValues().map((r, i) => ({
      key: _text(r[0]).trim(),
      timestamp: _text(r[1]),
      result: _text(r[2]),
      row: i + 2
    })).filter(r => r.key);
  }

  /**
   * `found` dit si la clé a déjà été appliquée. `result` rend la réponse
   * d'origine quand elle avait pu être stockée, sinon null — l'appelant décide
   * alors quoi renvoyer.
   */
  function lookup(key) {
    const wanted = _text(key).trim();
    if (!wanted) return { found: false, result: null };
    const entry = rows().find(r => r.key === wanted);
    if (!entry) return { found: false, result: null };
    if (!entry.result) return { found: true, result: null };
    try {
      return { found: true, result: JSON.parse(entry.result) };
    } catch (e) {
      // Cellule tronquée ou éditée à la main : la clé reste une preuve que le
      // geste est passé, seule la valeur d'origine est perdue.
      return { found: true, result: null };
    }
  }

  /** Enregistre la clé et, si elle tient, la réponse — dans le lot en cours. */
  function record(key, value, now) {
    const wanted = _text(key).trim();
    if (!wanted) return;
    let serialized = '';
    try {
      const json = JSON.stringify(value);
      if (json && json.length <= MAX_RESULT_CHARS) serialized = json;
    } catch (e) {
      serialized = '';
    }

    const existing = rows();
    const target = ensureSheet();
    // Élagage AVANT l'ajout : les deleteRow successifs sur le même index se
    // replient en une seule requête au rejeu (cf. _coalesce de journal-replay).
    const excess = existing.length + 1 - MAX_KEYS;
    for (let i = 0; i < excess; i++) target.deleteRow(2);
    target.appendRow([wanted, (now || new Date()).toISOString(), serialized]);
  }

  return { lookup, record };
}

module.exports = {
  createIdempotencyStore,
  IDEMPOTENCY_SHEET_NAME,
  IDEMPOTENCY_HEADERS,
  MAX_KEYS,
  MAX_RESULT_CHARS
};
