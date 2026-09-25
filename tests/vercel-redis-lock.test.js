'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createRedisLock, redisConfigFromEnv, lockKeyFor, RELEASE_SCRIPT } = require('../lib/gas-runtime/redis-lock');
const { BUSY_MESSAGE, ACQUIRE_TIMEOUT_MS } = require('../lib/gas-runtime/sheet-lock');

// Faux Upstash REST : SET NX et EVAL compare-et-supprime, rien d'autre.
function makeFakeRedis() {
  const store = new Map();
  const calls = [];
  function syncFetch(url, init) {
    const cmd = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization, cmd });
    if (cmd[0] === 'SET') {
      if (store.has(cmd[1])) return { status: 200, body: '{"result":null}' };
      store.set(cmd[1], cmd[2]);
      return { status: 200, body: '{"result":"OK"}' };
    }
    if (cmd[0] === 'EVAL') {
      const key = cmd[3]; const token = cmd[4];
      if (store.get(key) === token) { store.delete(key); return { status: 200, body: '{"result":1}' }; }
      return { status: 200, body: '{"result":0}' };
    }
    return { status: 400, body: '{"error":"unknown"}' };
  }
  return { syncFetch, store, calls };
}

function makeLock(redis, extra) {
  return createRedisLock(Object.assign({
    syncFetch: redis.syncFetch, url: 'https://redis.test', token: 'rtok', key: lockKeyFor('S1'),
    sleep: () => {}, random: () => 0
  }, extra || {}));
}

test('lockKeyFor préfixe l\'identifiant du classeur', () => {
  assert.strictEqual(lockKeyFor('abc'), 'tdt:lock:abc');
});

test('redisConfigFromEnv : KV_* prioritaires, repli UPSTASH_*, sinon null', () => {
  assert.deepStrictEqual(redisConfigFromEnv({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't', UPSTASH_REDIS_REST_URL: 'x' }), { url: 'u', token: 't' });
  assert.deepStrictEqual(redisConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'u2', UPSTASH_REDIS_REST_TOKEN: 't2' }), { url: 'u2', token: 't2' });
  assert.strictEqual(redisConfigFromEnv({ KV_REST_API_URL: 'u' }), null);
  assert.strictEqual(redisConfigFromEnv({}), null);
});

test('acquire pose SET NX PX avec le jeton, release le supprime', () => {
  const redis = makeFakeRedis();
  const lock = makeLock(redis);
  lock.acquire('jeton-A');
  assert.strictEqual(redis.store.get('tdt:lock:S1'), 'jeton-A');
  assert.deepStrictEqual(redis.calls[0].cmd.slice(0, 5), ['SET', 'tdt:lock:S1', 'jeton-A', 'NX', 'PX']);
  assert.strictEqual(redis.calls[0].auth, 'Bearer rtok');
  lock.release('jeton-A');
  assert.strictEqual(redis.store.has('tdt:lock:S1'), false);
  assert.deepStrictEqual(redis.calls[1].cmd, ['EVAL', RELEASE_SCRIPT, '1', 'tdt:lock:S1', 'jeton-A']);
});

test('second écrivain : attend puis lève BUSY_MESSAGE après le délai', () => {
  const redis = makeFakeRedis();
  makeLock(redis).acquire('jeton-A');
  let clock = 0;
  let waits = 0;
  const second = makeLock(redis, { now: () => clock, sleep: ms => { waits++; clock += ms; } });
  assert.throws(() => second.acquire('jeton-B'), err => err.message === BUSY_MESSAGE && err.code === 'LOCK_BUSY');
  assert.ok(waits > 1, 'le second écrivain doit réessayer avant d\'abandonner');
  assert.ok(clock >= ACQUIRE_TIMEOUT_MS);
  assert.strictEqual(redis.store.get('tdt:lock:S1'), 'jeton-A');
});

test('release n\'efface pas le verrou d\'un autre jeton', () => {
  const redis = makeFakeRedis();
  const lock = makeLock(redis);
  lock.acquire('jeton-A');
  lock.release('jeton-B');
  assert.strictEqual(redis.store.get('tdt:lock:S1'), 'jeton-A');
});

test('release en échec réseau ne lève pas (le bail expirera)', () => {
  const lock = createRedisLock({ syncFetch: () => ({ status: 500, body: '' }), url: 'u', token: 't', key: 'k' });
  const error = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => lock.release('x'));
  } finally {
    console.error = error;
  }
});

module.exports = { makeFakeRedis };
