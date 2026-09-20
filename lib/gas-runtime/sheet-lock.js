'use strict';

const crypto = require('crypto');
const { sheetsRequest, sendBatchUpdate, SHEETS_API } = require('./sheets-snapshot');

// LockService n'existe pas sur Vercel et deux invocations concurrentes ne
// partagent aucune mémoire : le verrou doit vivre dans la seule ressource
// commune, le classeur. Sheets API n'offrant pas de compare-and-swap, on
// écrit son jeton dans la cellule de bail puis on relit — le classeur
// sérialise les écritures, donc exactement un concurrent se relit gagnant.

const LOCK_SHEET_NAME = 'ScriptLock';
const LOCK_CELL = '\'' + LOCK_SHEET_NAME + '\'!A1';
// Le bail doit couvrir la plus longue requête possible (maxDuration = 60 s,
// vercel.json) : plus court, un écrivain lent se ferait doubler en plein vol.
const LEASE_MS = 60000;
// Même budget d'attente que CONFIG.LOCK_TIMEOUT_MS de Code.gs (10 s).
const ACQUIRE_TIMEOUT_MS = 10000;
const RETRY_MS = 400;
const BUSY_MESSAGE = 'Système occupé (écriture concurrente). Réessayez dans un instant.';

function newLockToken() {
  return crypto.randomUUID();
}

/** Attente bloquante : tout le runtime GAS est synchrone, pas de await possible. */
function syncSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function _cellUrl(spreadsheetId) {
  return SHEETS_API + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(LOCK_CELL);
}

function _readLease({ syncFetch, accessToken, spreadsheetId }) {
  const url = _cellUrl(spreadsheetId) + '?valueRenderOption=UNFORMATTED_VALUE';
  let json;
  try {
    json = sheetsRequest({ syncFetch, accessToken, url, what: 'lecture du verrou' });
  } catch (e) {
    // Onglet absent : Sheets répond 400 « Unable to parse range ».
    return null;
  }
  const raw = (json.values && json.values[0] && json.values[0][0]) || '';
  const text = String(raw);
  if (!text) return { token: '', expiresAt: 0 };
  const sep = text.lastIndexOf('|');
  if (sep < 0) return { token: text, expiresAt: 0 };
  return { token: text.slice(0, sep), expiresAt: Number(text.slice(sep + 1)) || 0 };
}

function _writeLease({ syncFetch, accessToken, spreadsheetId, value }) {
  const url = _cellUrl(spreadsheetId) + '?valueInputOption=RAW';
  sheetsRequest({
    syncFetch, accessToken, url, method: 'PUT',
    payload: { range: LOCK_CELL, majorDimension: 'ROWS', values: [[value]] },
    what: 'écriture du verrou'
  });
}

function _createLockSheet({ syncFetch, accessToken, spreadsheetId }) {
  sendBatchUpdate({
    syncFetch, accessToken, spreadsheetId,
    requests: [{ addSheet: { properties: { title: LOCK_SHEET_NAME, gridProperties: { rowCount: 1, columnCount: 1 } } } }]
  });
}

function acquireLock({ syncFetch, accessToken, spreadsheetId, token, now, sleep, timeoutMs, leaseMs }) {
  const clock = now || Date.now;
  const wait = sleep || syncSleep;
  const lease = leaseMs || LEASE_MS;
  const deadline = clock() + (timeoutMs || ACQUIRE_TIMEOUT_MS);

  for (;;) {
    let current = _readLease({ syncFetch, accessToken, spreadsheetId });
    if (current === null) {
      _createLockSheet({ syncFetch, accessToken, spreadsheetId });
      current = { token: '', expiresAt: 0 };
    }
    const free = !current.token || current.expiresAt <= clock();
    if (free) {
      _writeLease({ syncFetch, accessToken, spreadsheetId, value: token + '|' + (clock() + lease) });
      const confirmed = _readLease({ syncFetch, accessToken, spreadsheetId });
      if (confirmed && confirmed.token === token) return;
    }
    if (clock() >= deadline) {
      // Message identique à celui de withLock (Code.gs) : le frontend affiche
      // le même texte qu'aujourd'hui sous GAS.
      const err = new Error(BUSY_MESSAGE);
      err.code = 'LOCK_BUSY';
      throw err;
    }
    wait(RETRY_MS);
  }
}

function releaseLock({ syncFetch, accessToken, spreadsheetId, token }) {
  try {
    const current = _readLease({ syncFetch, accessToken, spreadsheetId });
    // Bail déjà repris (le nôtre avait expiré) : l'effacer volerait le verrou.
    if (!current || current.token !== token) return;
    _writeLease({ syncFetch, accessToken, spreadsheetId, value: '' });
  } catch (e) {
    console.error('[gas-runtime] libération du verrou impossible (le bail expirera) : ' + ((e && e.message) || e));
  }
}

module.exports = {
  acquireLock, releaseLock, newLockToken, syncSleep,
  LOCK_SHEET_NAME, LOCK_CELL, LEASE_MS, ACQUIRE_TIMEOUT_MS, RETRY_MS, BUSY_MESSAGE
};
