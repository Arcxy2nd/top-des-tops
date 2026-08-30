'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId'];
const D = s => new Date(s + 'T12:00:00');

/** A History sheet that counts how many times its rows are read. */
function countingHistory(rows) {
  const sheet = makeSheet(rows);
  sheet.reads = 0;
  const realGetRange = sheet.getRange.bind(sheet);
  sheet.getRange = (...a) => { sheet.reads++; return realGetRange(...a); };
  return sheet;
}

test('getAllLogs serves the cross-request cache and rebuilds Date timestamps', () => {
  const gas = loadGas();
  const history = countingHistory([HEADER, [D('2026-03-04'), 'A', 'Jeux', 5, '', '']]);
  gas.ConfigService.getSheets = () => ({ history });

  const first = gas.StorageService.getAllLogs();   // reads sheet, fills cache
  gas.ConfigService.clearCache();                  // simulate a fresh request (clears in-request cache)
  const second = gas.StorageService.getAllLogs();  // should hit the cross-request cache

  assert.strictEqual(history.reads, 1);            // sheet read only once across both requests
  assert.strictEqual(first.length, 1);
  assert.strictEqual(second.length, 1);
  assert.strictEqual(second[0].player, 'A');
  assert.strictEqual(second[0].points, 5);
  // Timestamp must come back as a real Date with the exact original instant.
  assert.strictEqual(Object.prototype.toString.call(second[0].timestamp), '[object Date]');
  assert.strictEqual(second[0].timestamp.getTime(), D('2026-03-04').getTime());
});

test('any write invalidates the logs cache — readers never get stale data', () => {
  const gas = loadGas();
  const history = countingHistory([HEADER, [D('2026-03-04'), 'A', 'Jeux', 5, '', '']]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.getAllLogs();          // read #1 (cache version 0)
  gas.ConfigService.clearCache();
  gas.StorageService.getAllLogs();          // cache hit → still read #1
  assert.strictEqual(history.reads, 1);

  gas.withLock(() => ({ ok: true }));        // a write bumps the cache version
  gas.ConfigService.clearCache();
  gas.StorageService.getAllLogs();          // version changed → cache miss → read #2
  assert.strictEqual(history.reads, 2);
});

test('getAllLogs on an empty sheet returns [] and is consistent across requests', () => {
  const gas = loadGas();
  const history = countingHistory([HEADER]);
  gas.ConfigService.getSheets = () => ({ history });

  const a = gas.StorageService.getAllLogs();
  assert.ok(Array.isArray(a));
  assert.strictEqual(a.length, 0);
  gas.ConfigService.clearCache();
  const b = gas.StorageService.getAllLogs();
  assert.ok(Array.isArray(b));
  assert.strictEqual(b.length, 0);
  // A single-row sheet is read once: without reading it there is no way to tell a
  // lone header from a lone real entry (see SHEET_HEADERS / _readDataRows).
  assert.strictEqual(history.reads, 1);
});

test('getHistoryPage reads the sheet once across repeated calls, then again after a write', () => {
  const gas = loadGas();
  const history = countingHistory([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux',  5, '', ''],
    [D('2026-01-02'), 'B', 'Défis', 3, '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.getHistoryPage(1, 20, null, null, null);
  gas.ConfigService.clearCache();
  gas.StorageService.getHistoryPage(1, 20, null, null, null);   // same version → cache hit
  assert.strictEqual(history.reads, 1);

  gas.withLock(() => ({ ok: true }));                            // a write bumps the version
  gas.ConfigService.clearCache();
  gas.StorageService.getHistoryPage(1, 20, null, null, null);   // version changed → cache miss
  assert.strictEqual(history.reads, 2);
});

test('getHistoryPage cache survives filter/pagination params changing (still one sheet read)', () => {
  const gas = loadGas();
  const history = countingHistory([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux',  5, '', ''],
    [D('2026-01-02'), 'B', 'Défis', 3, '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.getHistoryPage(1, 20, null, null, null);
  gas.ConfigService.clearCache();
  gas.StorageService.getHistoryPage(1, 20, ['A'], null, null);  // different filter, same version
  gas.ConfigService.clearCache();
  gas.StorageService.getHistoryPage(2, 20, null, ['Défis'], 'x');
  assert.strictEqual(history.reads, 1);
});

test('getDataHealth serves the cached result on repeat calls, then recomputes after a write', () => {
  const gas = loadGas();
  const history = countingHistory([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux', 5, '', ''],
    [D('2026-01-02'), 'A', 'Jeux', 0, '', '']
  ]);
  const players    = makeSheet([['Name', 'Avatar URL', 'Hex color'], ['A', '', '']]);
  const categories = makeSheet([['Name', 'Description', 'Emoji', 'Hex color'], ['Jeux', '', '', '']]);
  gas.ConfigService.getSheets = () => ({ history, players, categories });

  const first = gas.StorageService.getDataHealth();
  gas.ConfigService.clearCache();
  const second = gas.StorageService.getDataHealth();
  assert.strictEqual(history.reads, 1);
  assert.deepStrictEqual(second, first);

  gas.withLock(() => ({ ok: true }));
  gas.ConfigService.clearCache();
  gas.StorageService.getDataHealth();
  assert.strictEqual(history.reads, 2);
});

test('apiDetectDistributedLots serves the cached lots list, then recomputes after a write', () => {
  const gas = loadGas();
  const mk = (d, p, c, pts) => [D(d), p, c, pts, 'desc', ''];
  const history = countingHistory([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux', 5),
    mk('2026-01-05', 'A', 'Jeux', 5),
    mk('2026-01-10', 'A', 'Jeux', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const first = gas.apiDetectDistributedLots();
  gas.ConfigService.clearCache();
  const second = gas.apiDetectDistributedLots();
  assert.strictEqual(history.reads, 1);
  assert.strictEqual(second.lots.length, first.lots.length);

  gas.withLock(() => ({ ok: true }));
  gas.ConfigService.clearCache();
  gas.apiDetectDistributedLots();
  assert.strictEqual(history.reads, 2);
});

test('apiDetectLegacyGroups finds short legacy groupIds, ignores long/current-format and empty ones', () => {
  const gas = loadGas();
  const mk = (d, p, c, pts, gid) => [D(d), p, c, pts, 'desc', gid];
  const history = countingHistory([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux',  5, 'G3'),               // legacy short id → suspect
    mk('2026-01-02', 'B', 'Défis', 3, 'G3'),               // same legacy group
    mk('2026-01-03', 'C', 'Jeux',  4, 'G1720000000_ab12'), // current-format id → not suspect
    mk('2026-01-04', 'A', 'Jeux',  2, '')                  // no group → not suspect
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectLegacyGroups();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.groups.length, 1);
  assert.strictEqual(res.groups[0].groupId, 'G3');
  assert.strictEqual(res.groups[0].distinctPlayers, 2);
  assert.strictEqual(res.groups[0].distinctCategories, 2);
  assert.strictEqual(res.groups[0].entries.length, 2);
  assert.strictEqual(res.groups[0].entries[0].player, 'A');
  assert.strictEqual(res.groups[0].entries[0].rowIndex, 2);
});

test('apiDetectLegacyGroups reuses the cached full-history read across calls, recomputes after a write', () => {
  const gas = loadGas();
  const mk = (d, p, c, pts, gid) => [D(d), p, c, pts, 'desc', gid];
  const history = countingHistory([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux', 5, 'G3'),
    mk('2026-01-02', 'B', 'Défis', 3, 'G3')
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.apiDetectLegacyGroups();
  gas.ConfigService.clearCache();
  gas.apiDetectLegacyGroups();
  assert.strictEqual(history.reads, 1);

  gas.withLock(() => ({ ok: true }));
  gas.ConfigService.clearCache();
  gas.apiDetectLegacyGroups();
  assert.strictEqual(history.reads, 2);
});

test('apiGetChangelog handles large responses by chunking cache and falling back gracefully on cache errors', () => {
  const largeContent = '# Changelog\n' + 'x'.repeat(120000);
  const store = new Map();
  let fetchCount = 0;

  const gas = loadGas({
    UrlFetchApp: {
      fetch: (url) => {
        fetchCount++;
        return {
          getResponseCode: () => 200,
          getContentText: () => largeContent
        };
      }
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => store.get(k) || null,
        put: (k, v, exp) => {
          if (v.length > 100000) throw new Error('Value exceeds maximum size of 100KB');
          store.set(k, v);
        }
      })
    }
  });

  const res1 = gas.apiGetChangelog(false);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.content, largeContent);
  assert.strictEqual(store.get('github_changelog_v1_chunks'), '2');
  assert.strictEqual(fetchCount, 1);

  // Second call should hit chunked cache without fetching again
  const res2 = gas.apiGetChangelog(false);
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.content, largeContent);
  assert.strictEqual(fetchCount, 1);
});

// Régression (2026-08-12) : un joueur ajouté directement dans le Google Sheet
// (hors bouton "+ Ajouter" de l'app) restait invisible jusqu'à expiration du
// TTL (600s) — getEntities()/getEntries()/getAll() ne recalculaient leur cache
// que sur un bump de version, lui-même déclenché uniquement par les mutations
// passant par l'app (addEntity, addEntry, addPhrase...). Le nombre de lignes
// est désormais inclus dans la clé de cache pour que toute ligne ajoutée ou
// supprimée directement sur la feuille invalide le cache immédiatement.
test('getEntities reflects a player row appended directly to the Sheet, bypassing addEntity()', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '#111111', '']
  ]);
  gas.ConfigService.getSheets = () => ({ players });

  const before = gas.SettingsService.getEntities('Players');
  assert.deepStrictEqual(before.map(p => p.name), ['Alice']);

  // Manual Sheet edit — never goes through addEntity(), so _settingsVersion() unchanged.
  players._grid.push(['Bob', '', '#222222', '']);

  const after = gas.SettingsService.getEntities('Players');
  assert.deepStrictEqual(after.map(p => p.name), ['Alice', 'Bob'], 'the manually added row must appear without waiting out the cache TTL');
});

test('BaremeService.getEntries reflects a rule row appended directly to the Sheet, bypassing addEntry()', () => {
  const gas = loadGas();
  const bareme = makeSheet([
    ['Top', 'Action', 'Points'],
    ['Jeux', 'Gagne', 5]
  ]);
  gas.ConfigService.getSheets = () => ({ bareme });

  gas.BaremeService.getEntries();
  bareme._grid.push(['Jeux', 'Perd', -2]);
  const after = gas.BaremeService.getEntries();
  assert.deepStrictEqual(Array.from(after.map(e => e.action)), ['Perd', 'Gagne']);
});

test('PhrasesService.getAll reflects a phrase row appended directly to the Sheet, bypassing addPhrase()', () => {
  const gas = loadGas();
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'first', 'A', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ phrases });

  gas.PhrasesService.getAll();
  phrases._grid.push(['Défaut', 'first', 'B', 2]);
  const after = gas.PhrasesService.getAll();
  assert.deepStrictEqual(after.map(p => p.text), ['A', 'B']);
});

test('getAllLogs chunks an oversized payload instead of skipping the cache', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER,
    [D('2026-08-01'), 'Alice', 'Jeux', 5, 'ok', ''],
    [D('2026-08-02'), 'Bob',   'Jeux', 3, 'ok', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.CONFIG.CACHE_MAX_BYTES = 1;
  const before = gas.StorageService.getAllLogs();
  assert.strictEqual(before.length, 2);

  gas.ConfigService.getSheets = () => { throw new Error('sheet should not be re-read — cache miss'); };
  const after = gas.StorageService.getAllLogs();
  assert.strictEqual(after.length, 2);
  assert.strictEqual(after[0].player, 'Alice');
});

test('a cache write failure in _cachePutChunked is caught and the skip is traced', () => {
  const skips = [];
  const cache = {
    get: () => null,
    put() { throw new Error('quota exceeded'); }
  };
  const gas = loadGas({ CacheService: { getScriptCache: () => cache } });
  gas.Logger.log = m => skips.push(String(m));

  const history = makeSheet([HEADER,
    [D('2026-08-01'), 'Alice', 'Jeux', 5, 'ok', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });
  gas.StorageService.getAllLogs();
  assert.ok(skips.length >= 1, 'a throwing cache must log a skip');
  assert.match(skips[0], /cache skip/);
});

// Régression (audit cache 2026-08-26) : un échec de _bumpLogsVersion() à
// l'intérieur de withLock() était avalé sans trace — une mutation réussie
// pouvait donc rapporter un succès total alors que l'invalidation croisée
// de 8 des 14 familles de cache avait silencieusement échoué.
test('a failed _bumpLogsVersion inside withLock is traced, not swallowed silently', () => {
  const propStore = { logs_version: '0' };
  const gas = loadGas({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in propStore ? propStore[k] : null),
        setProperty: () => { throw new Error('quota exceeded'); }
      })
    }
  });
  const logs = [];
  gas.Logger.log = m => logs.push(String(m));
  const result = gas.withLock(() => ({ ok: true }));
  assert.deepStrictEqual(result, { ok: true }, 'the operation itself must still succeed');
  assert.ok(logs.some(l => /logs.?version|invalidat/i.test(l)), 'a failed cache-invalidation bump must leave a trace: ' + JSON.stringify(logs));
});

test('apiGetCacheStats reports hit/miss counts across cached reads', () => {
  const gas = loadGas();
  const history = countingHistory([HEADER, [D('2026-03-04'), 'A', 'Jeux', 5, '', '']]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.getAllLogs();   // cache miss (first read)
  gas.ConfigService.clearCache();    // bypass the L1 in-process cache, force a CacheService lookup
  gas.StorageService.getAllLogs();   // cache hit (same version)

  const stats = gas.apiGetCacheStats();
  assert.strictEqual(stats.success, true);
  assert.ok(stats.hits >= 1, 'expected at least one recorded hit: ' + JSON.stringify(stats));
  assert.ok(stats.misses >= 1, 'expected at least one recorded miss: ' + JSON.stringify(stats));
  assert.ok(typeof stats.hitRate === 'number' && stats.hitRate >= 0 && stats.hitRate <= 100);
});

test('getFullHistoryRowsCached chunks an oversized payload instead of skipping the cache', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER,
    [D('2026-08-01'), 'Alice', 'Jeux', 5, 'ok', ''],
    [D('2026-08-02'), 'Bob',   'Jeux', 3, 'ok', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.CONFIG.CACHE_MAX_BYTES = 1; // force "oversized" without needing a huge fixture
  const before = gas.StorageService.getFullHistoryRowsCached();
  assert.strictEqual(before.length, 2);

  // A second call must be served from the chunked cache, not a fresh sheet read —
  // prove it by breaking the sheet read and confirming the result is still correct.
  gas.ConfigService.getSheets = () => { throw new Error('sheet should not be re-read — cache miss'); };
  const after = gas.StorageService.getFullHistoryRowsCached();
  assert.strictEqual(after.length, 2);
  assert.strictEqual(after[0].player, 'Alice');
  assert.strictEqual(Object.prototype.toString.call(after[0].date), '[object Date]');
  assert.strictEqual(after[0].date.getTime(), D('2026-08-01').getTime());
});

