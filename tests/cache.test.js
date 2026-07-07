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
  assert.strictEqual(history.reads, 0); // empty sheet (lastRow<=1) is never range-read
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
  const players    = makeSheet([['A', '', '']]);
  const categories = makeSheet([['Jeux', '', '', '']]);
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
