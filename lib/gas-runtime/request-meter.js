'use strict';

const { syncSleep } = require('./sheet-lock');

// Le quota Sheets (60 lectures + 60 écritures par minute et par compte de
// service) est le vrai plafond de l'application : chaque requête est comptée
// ici pour que les logs et les tests de budget disent ce que coûte un appel.
// Un 429 n'a rien appliqué côté Google (requête refusée) : la rejouer après
// une pause est donc sans risque, écritures comprises.
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function _kind(url, init) {
  const u = String(url);
  if (u.indexOf('googleapis.com/drive/') !== -1) return 'drive';
  if (u.indexOf('sheets.googleapis.com') === -1) return null;
  const method = String((init && init.method) || 'GET').toUpperCase();
  return method === 'GET' ? 'sheetsReads' : 'sheetsWrites';
}

function meterSyncFetch(syncFetch, options) {
  const sleep = (options && options.sleep) || syncSleep;
  const counts = { sheetsReads: 0, sheetsWrites: 0, drive: 0 };
  function metered(url, init) {
    const kind = _kind(url, init);
    let res;
    for (let attempt = 0; ; attempt++) {
      if (kind) counts[kind]++;
      res = syncFetch(url, init);
      if (!res || res.status !== 429 || attempt >= RETRY_DELAYS_MS.length) return res;
      sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  return { syncFetch: metered, counts: () => Object.assign({}, counts) };
}

module.exports = { meterSyncFetch, RETRY_DELAYS_MS };
