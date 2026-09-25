'use strict';

const { syncSleep, ACQUIRE_TIMEOUT_MS, LEASE_MS, RETRY_MS, BUSY_MESSAGE } = require('./sheet-lock');

// Verrou hors Sheets : SET NX PX est atomique côté Redis (vrai compare-and-set,
// que Sheets n'offre pas) et ne coûte aucune requête sur le quota Sheets.
// Mêmes durées et même message que le verrou de l'onglet ScriptLock.
// Libération : on ne supprime la clé que si elle porte encore NOTRE jeton,
// sinon un écrivain dont le bail a expiré effacerait le verrou du suivant.
const RELEASE_SCRIPT = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

function lockKeyFor(spreadsheetId) {
  return 'tdt:lock:' + spreadsheetId;
}

/** Variables posées par l'intégration Vercel ↔ Upstash (KV_*), sinon noms Upstash natifs. */
function redisConfigFromEnv(env) {
  const source = env || {};
  const url = source.KV_REST_API_URL || source.UPSTASH_REDIS_REST_URL;
  const token = source.KV_REST_API_TOKEN || source.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function createRedisLock({ syncFetch, url, token, key, sleep, now, random }) {
  const wait = sleep || syncSleep;
  const clock = now || Date.now;
  const rand = random || Math.random;

  function command(args) {
    const res = syncFetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    if (!res || res.status !== 200) throw new Error('Échec du verrou Redis (' + (res && res.status) + ')');
    return JSON.parse(res.body).result;
  }

  return {
    acquire(lockToken) {
      const deadline = clock() + ACQUIRE_TIMEOUT_MS;
      for (;;) {
        if (command(['SET', key, lockToken, 'NX', 'PX', String(LEASE_MS)]) === 'OK') return;
        if (clock() >= deadline) {
          const err = new Error(BUSY_MESSAGE);
          err.code = 'LOCK_BUSY';
          throw err;
        }
        // Attente avec gigue : deux écrivains en attente ne retentent pas en phase.
        wait(RETRY_MS + rand() * RETRY_MS);
      }
    },
    release(lockToken) {
      try {
        command(['EVAL', RELEASE_SCRIPT, '1', key, lockToken]);
      } catch (e) {
        console.error('[gas-runtime] libération du verrou Redis impossible (le bail expirera) : ' + ((e && e.message) || e));
      }
    }
  };
}

module.exports = { createRedisLock, redisConfigFromEnv, lockKeyFor, RELEASE_SCRIPT };
