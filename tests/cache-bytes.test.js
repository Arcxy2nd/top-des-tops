'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness');

/**
 * Faux CacheService qui applique la vraie contrainte d'Apps Script : la limite
 * porte sur des OCTETS UTF-8, pas sur des caractères JS. Le stub par defaut du
 * harness accepte tout, ce qui laissait passer le bug que ce test verrouille.
 */
function byteLimitedCache(limitBytes) {
  const store = {};
  return {
    store,
    get: k => (k in store ? store[k] : null),
    put(k, v) {
      const bytes = Buffer.byteLength(String(v), 'utf8');
      if (bytes > limitBytes) throw new Error('Argument too large: value (' + bytes + ' bytes)');
      store[k] = String(v);
    }
  };
}

function loadWithCache(cache) {
  return loadGas({ CacheService: { getScriptCache: () => cache } });
}

test('_byteLength compte les octets UTF-8, pas les caracteres JS', () => {
  const gas = loadWithCache(byteLimitedCache(95000));
  assert.strictEqual(gas._byteLength('abc'), 3);
  assert.strictEqual(gas._byteLength('é'), 2);          // 1 caractere, 2 octets
  assert.strictEqual(gas._byteLength('€'), 3);          // 1 caractere, 3 octets
  assert.strictEqual(gas._byteLength('🏆'), 4);         // 2 caracteres JS, 4 octets
  assert.strictEqual(gas._byteLength(''), 0);
  // Le cas qui casse en production : un payload d'emojis sous la limite en
  // caracteres mais au-dessus en octets.
  const trophies = '🏆'.repeat(30000);                  // 60000 caracteres, 120000 octets
  assert.strictEqual(trophies.length, 60000);
  assert.strictEqual(gas._byteLength(trophies), 120000);
});

test('_cachePutChunked ecrit en une entree quand le payload tient', () => {
  const cache = byteLimitedCache(95000);
  const gas = loadWithCache(cache);
  gas._cachePutChunked(cache, 'k', 'petit payload', 600);
  assert.strictEqual(cache.store['k'], 'petit payload');
  assert.strictEqual(cache.store['k_chunks'], undefined);
  assert.strictEqual(gas._cacheGetChunked(cache, 'k'), 'petit payload');
});

test('_cachePutChunked decoupe en octets et se relit a l identique', () => {
  const cache = byteLimitedCache(95000);
  const gas = loadWithCache(cache);
  const payload = JSON.stringify({ rows: Array.from({ length: 12000 }, (_, i) => ({ i, e: '🏆é€' })) });
  assert.ok(gas._byteLength(payload) > 95000, 'le fixture doit depasser la limite en octets');

  gas._cachePutChunked(cache, 'big', payload, 600);

  const chunkCount = parseInt(cache.store['big_chunks'], 10);
  assert.ok(chunkCount >= 2, 'le payload doit avoir ete decoupe');
  for (let i = 0; i < chunkCount; i++) {
    const bytes = Buffer.byteLength(cache.store['big_' + i], 'utf8');
    assert.ok(bytes <= 95000, 'chunk ' + i + ' pese ' + bytes + ' octets');
  }
  assert.strictEqual(gas._cacheGetChunked(cache, 'big'), payload);
  assert.deepStrictEqual(JSON.parse(gas._cacheGetChunked(cache, 'big')), JSON.parse(payload));
});

test('_cachePutChunked ne coupe jamais une paire de substituts', () => {
  const cache = byteLimitedCache(64);
  const gas = loadWithCache(cache);
  gas.CONFIG.CACHE_MAX_BYTES = 64;
  const payload = '🏆'.repeat(200);                     // 800 octets, decoupe forcee
  gas._cachePutChunked(cache, 'emo', payload, 600);
  const chunkCount = parseInt(cache.store['emo_chunks'], 10);
  for (let i = 0; i < chunkCount; i++) {
    // Un demi-substitut isole se serait transforme en U+FFFD au reassemblage.
    assert.ok(!/[\uD800-\uDBFF]$/.test(cache.store['emo_' + i]), 'chunk ' + i + ' finit sur un demi-substitut');
    assert.ok(!/^[\uDC00-\uDFFF]/.test(cache.store['emo_' + i]), 'chunk ' + i + ' commence sur un demi-substitut');
  }
  assert.strictEqual(gas._cacheGetChunked(cache, 'emo'), payload);
});

test('_cacheGetChunked renvoie null quand un morceau a expire', () => {
  const cache = byteLimitedCache(64);
  const gas = loadWithCache(cache);
  gas.CONFIG.CACHE_MAX_BYTES = 64;
  gas._cachePutChunked(cache, 'partial', '🏆'.repeat(200), 600);
  delete cache.store['partial_1'];
  assert.strictEqual(gas._cacheGetChunked(cache, 'partial'), null);
});

test('_cacheGetChunked renvoie null sur une cle absente', () => {
  const cache = byteLimitedCache(95000);
  const gas = loadWithCache(cache);
  assert.strictEqual(gas._cacheGetChunked(cache, 'jamais-ecrite'), null);
});

test('_cachePutChunked ne propage jamais une erreur du cache', () => {
  const gas = loadWithCache(byteLimitedCache(95000));
  const exploding = { get: () => null, put() { throw new Error('quota exceeded'); } };
  assert.doesNotThrow(() => gas._cachePutChunked(exploding, 'k', 'valeur', 600));
});

const fs   = require('node:fs');
const path = require('node:path');

test('plus aucun site de Code.gs ne mesure son cache en caracteres', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const charGuards = src.split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(x => /\.length\s*<=\s*(CONFIG\.CACHE_MAX_BYTES|chunkSize)/.test(x.line));
  assert.deepStrictEqual(
    charGuards, [],
    'Sites encore mesures en caracteres :\n' + charGuards.map(x => '  Code.gs:' + x.n + '  ' + x.line).join('\n')
  );
});

test('chaque cache.put direct de Code.gs passe par _cachePutChunked', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  // Les seuls cache.put legitimes restants sont ceux qui vivent DANS
  // _cachePutChunked lui-meme ; tout autre appel direct contourne la mesure en
  // octets et peut rejeter un payload en production sans que les tests le voient.
  const helperStart = src.indexOf('function _cachePutChunked(');
  const helperEnd   = src.indexOf('function _cacheGetChunked(');
  assert.ok(helperStart !== -1 && helperEnd > helperStart, '_cachePutChunked introuvable');
  const outside = src.slice(0, helperStart) + src.slice(helperEnd);
  // Pas de numero de ligne ici : `outside` est un recollage, ses indices ne
  // correspondent plus au fichier. Le texte de la ligne suffit a la retrouver.
  const strays = outside.split('\n')
    .map(line => line.trim())
    .filter(line => /\bcache\.put\(/.test(line));
  assert.deepStrictEqual(
    strays, [],
    'cache.put directs restants :\n' + strays.map(l => '  ' + l).join('\n')
  );
});
