# Cache Reliability, Backend Perf & CSS Hygiene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a live cache-staleness bug found during audit verification, harden two silent failure points, add cache hit/miss observability, batch four backend write loops that currently do one Sheets RPC per row, and remove verified-dead CSS / hardcoded colors — all behavior-preserving, verified against `tests/*.test.js` via the Node VM harness only (never real spreadsheet data).

**Architecture:** No new files, no new dependencies. All backend changes stay inside `Code.gs` (single monolithic GAS file, per project convention — see Global Constraints). All frontend changes stay inside `Index.html`'s `<style>` block. One new backend endpoint (`apiGetCacheStats`) plumbed into the existing "Outils / Rapport de santé" panel in `Index.html`.

**Tech Stack:** Google Apps Script (`Code.gs`), vanilla HTML/CSS/JS (`Index.html`), Node `--test` + VM sandbox harness (`tests/harness.js`).

## Global Constraints

- Keep `Code.gs` and `Index.html` monolithic — no namespace/IIFE modularization split (explicit project decision, overrides the audit's low-priority suggestion to modularize).
- No class-based JS, objects/IIFE only (existing pattern).
- Every write path stays behind `requireAuthor()` + `AuditService.log()` where one already exists — none of these tasks add new mutating endpoints that skip it.
- Never touch real spreadsheet/CacheService data — all verification via `npm run verify` (Node `--test` + `check:html`) against the VM harness fixtures.
- `CHANGELOG.md` gets one entry per shipped version, two voices (Humanisé/Technique), per `context.md` §8.
- Commit + `git push` on `main` after verification passes — triggers the dual-target GitHub Actions deploy. No permission needed to push (standing project rule).
- French comments in touched code stay French (existing codebase convention); new comments follow the same style as their surrounding function.

---

### Task 1: Fix cache-invalidation gap in `SettingsService.renameEntity`

**Bug found during audit verification:** renaming a Player propagates the new name into Notes/Chat sheets but never bumps `_bumpNotesVersion()`/`_bumpChatVersion()`; renaming a Category propagates into Bareme/Phrases but never bumps `_bumpBaremeVersion()`/`_bumpPhrasesVersion()`. Result: `NotesService.getAllNotes()`, `ChatService.getAllMessages()`, `BaremeService.getEntries()`, `PhrasesService.getAll()` can keep serving the pre-rename name for up to `CACHE_TTL_SECONDS` (600s) after a rename. The sibling "repair ordre" tool (`apiRepairOrder`, `Code.gs:4259-4261`) already bumps all three version counters it touches — `renameEntity` is the one inconsistent call site.

**Files:**
- Modify: `Code.gs:862` (Players branch, inside `renameEntity`) and `Code.gs:883` (Categories branch, inside `renameEntity`)
- Test: `tests/settings.test.js` (append after line 360, the existing chat-rename-propagation test)

- [ ] **Step 1: Write the failing tests**

Append to `tests/settings.test.js`:

```js
// Régression (audit cache 2026-08-26) : renameEntity() propageait déjà le
// renommage vers Notes/Chat en écriture directe, mais ne bumpait jamais
// _notesVersion()/_chatVersion() — un lecteur passant par le cache
// (getAllNotes/getAllMessages) pouvait donc servir l'ancien nom jusqu'à
// expiration du TTL (600s) après un renommage.
test('SettingsService.renameEntity invalidates the Notes and Chat caches, not just the raw sheet', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '#ff0000', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  const notes = makeSheet([
    ['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe'],
    [new Date('2026-01-01'), 'Alice', 'Note sur Alice', 'n1', 'Alice', '', '']
  ]);
  const chat = makeSheet([
    ['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ'],
    ['m1', new Date('2026-01-01'), 'Alice', 'Message d\'Alice', '']
  ]);
  gas.ConfigService.getSheets = () => ({ players, history, notes, chat, autoRules: null });

  // Populate the caches BEFORE the rename, exactly like a real reader would.
  const notesBefore = gas.NotesService.getAllNotes();
  const chatBefore = gas.ChatService.getAllMessages();
  assert.strictEqual(notesBefore.notes[0].player, 'Alice');
  assert.strictEqual(chatBefore.messages[0].author, 'Alice');

  gas.SettingsService.renameEntity('Players', 2, 'Alice', 'Alicia', '', '');

  // Read again WITHOUT any manual cache-clearing helper — a real cross-request
  // reader only ever gets a fresh result if the version counter changed.
  const notesAfter = gas.NotesService.getAllNotes();
  const chatAfter = gas.ChatService.getAllMessages();
  assert.strictEqual(notesAfter.notes[0].player, 'Alicia', 'the Notes cache must reflect the rename immediately, not after TTL expiry');
  assert.strictEqual(chatAfter.messages[0].author, 'Alicia', 'the Chat cache must reflect the rename immediately, not after TTL expiry');
});

test('SettingsService.renameEntity invalidates the Bareme and Phrases caches on a category rename', () => {
  const gas = loadGas();
  const categories = makeSheet([
    ['Name', 'Description', 'Emoji', 'Hex color'],
    ['Jeux', '', '🎮', '']
  ]);
  const history = makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']]);
  const bareme = makeSheet([
    ['Top', 'Action', 'Points', 'Ordre'],
    ['Jeux', 'Gagne', 5, 1]
  ]);
  const phrases = makeSheet([
    ['Preset', 'Pool', 'Phrase', 'Ordre'],
    ['Défaut', 'cat:Jeux', 'Bravo !', 1]
  ]);
  gas.ConfigService.getSheets = () => ({ categories, history, bareme, phrases, autoRules: null });

  const baremeBefore = gas.BaremeService.getEntries();
  const phrasesBefore = gas.PhrasesService.getAll();
  assert.strictEqual(baremeBefore[0].top, 'Jeux');
  assert.strictEqual(phrasesBefore[0].pool, 'cat:Jeux');

  gas.SettingsService.renameEntity('Categories', 2, 'Jeux', 'Gaming', '', '🎮');

  const baremeAfter = gas.BaremeService.getEntries();
  const phrasesAfter = gas.PhrasesService.getAll();
  assert.strictEqual(baremeAfter[0].top, 'Gaming', 'the Bareme cache must reflect the category rename immediately');
  assert.strictEqual(phrasesAfter[0].pool, 'cat:Gaming', 'the Phrases pool cache must reflect the category rename immediately');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx node --test tests/settings.test.js
```
Expected: FAIL on both new tests — `notesAfter.notes[0].player` / `chatAfter.messages[0].author` / `baremeAfter[0].top` / `phrasesAfter[0].pool` still equal the OLD name (stale cache).

- [ ] **Step 3: Fix `renameEntity`**

In `Code.gs`, inside `SettingsService.renameEntity` (around line 851-884):

```js
    this._renameInColumn('autoRules', ConfigService.getSheets().autoRules, type === 'Players' ? 2 : 3, oldName, newName);
    if (type === 'Players') {
      // Notes only ever reference a Player (column 2), never a Top — otherwise
      // renaming a player would silently orphan their notes (invisible in the
      // UI, which only ever groups by currently-known player names).
      this._renameInColumn('notes', ConfigService.getSheets().notes, 2, oldName, newName);
      // Chat messages reference their author by name (column 3, "Auteur") — without
      // this, a renamed player's old messages keep the stale name: unmatched by
      // cachedPlayers (generic avatar/color fallback) and unrecognized by the
      // author === _whoAmI check, silently losing the ability to delete their own
      // past messages.
      this._renameInColumn('chat', ConfigService.getSheets().chat, 3, oldName, newName);
      // Notes/Chat are cached independently of Settings (notes_all_v*/chat_msgs_v*) —
      // without these, a cached reader keeps serving the old name for up to
      // CACHE_TTL_SECONDS after this rename (audit fix 2026-08-26).
      _bumpNotesVersion();
      _bumpChatVersion();
      return;
    }

    this._renameInColumn('bareme', ConfigService.getSheets().bareme, 1, oldName, newName);

    const phrasesSheet = ConfigService.getSheets().phrases;
    if (phrasesSheet) {
      const pLastRow  = phrasesSheet.getLastRow();
      const poolStart = _firstDataRow('phrases', phrasesSheet);
      if (pLastRow >= poolStart) {
        const poolRange = phrasesSheet.getRange(poolStart, 2, pLastRow - poolStart + 1, 1);
        const poolVals  = poolRange.getValues();
        const oldPool   = 'cat:' + oldName;
        const newPool   = 'cat:' + newName;
        let poolModified = false;
        for (let i = 0; i < poolVals.length; i++) {
          if (poolVals[i][0] === oldPool) { poolVals[i][0] = newPool; poolModified = true; }
        }
        if (poolModified) poolRange.setValues(poolVals);
      }
    }
    // Bareme/Phrases are cached independently of Settings (bareme_entries_v*/
    // phrases_all_v*) — without these, a cached reader keeps serving the old
    // category name for up to CACHE_TTL_SECONDS after this rename (audit fix 2026-08-26).
    _bumpBaremeVersion();
    _bumpPhrasesVersion();
  },
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx node --test tests/settings.test.js
```
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/settings.test.js
git commit -m "fix: renameEntity now invalidates Notes/Chat/Bareme/Phrases caches"
```

---

### Task 2: Harden two silent `catch` blocks that can mask real failures

**Found during audit verification:** `Code.gs:376` (`try { _bumpLogsVersion(); } catch (_) {}` inside `withLock`) can silently defeat cross-request cache invalidation for 8 of 14 cache families if the `PropertiesService` write throws — a mutation still reports success to the caller with zero trace. `Code.gs:497` (inside `AuditService.log`) can silently drop an audit-log row on a transient `sheet.appendRow` failure. Both are behavior-preserving fixes (still never throw to the caller) — they just stop being silent.

**Files:**
- Modify: `Code.gs:376` and `Code.gs:497`
- Test: `tests/audit.test.js` and `tests/cache.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/cache.test.js`:

```js
test('a failed _bumpLogsVersion inside withLock is traced, not swallowed silently', () => {
  const gas = loadGas();
  const logs = [];
  gas.Logger.log = m => logs.push(String(m));
  const propStore = { logs_version: '0' };
  gas.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (k in propStore ? propStore[k] : null),
      setProperty: () => { throw new Error('quota exceeded'); }
    })
  };
  const result = gas.withLock(() => ({ ok: true }));
  assert.deepStrictEqual(result, { ok: true }, 'the operation itself must still succeed');
  assert.ok(logs.some(l => /logs.?version|invalidat/i.test(l)), 'a failed cache-invalidation bump must leave a trace: ' + JSON.stringify(logs));
});
```

Append to `tests/audit.test.js` (check the file's `require`/`loadGas` setup first, then add):

```js
test('a failed AuditService.log write is traced, not swallowed silently', () => {
  const gas = loadGas();
  const logs = [];
  gas.Logger.log = m => logs.push(String(m));
  const auditLog = { appendRow() { throw new Error('sheet locked'); }, getRange: () => ({ setFontWeight: () => {} }) };
  gas.ConfigService.getSheets = () => ({ auditLog });
  gas.ConfigService.clearCache = () => {};
  gas.AuditService.log('Alice', 'Test', 'Entity', 'before', 'after', '', null);
  assert.ok(logs.some(l => /audit/i.test(l)), 'a failed audit-log write must leave a trace: ' + JSON.stringify(logs));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx node --test tests/cache.test.js tests/audit.test.js
```
Expected: FAIL — `logs` array is empty in both (nothing traced today).

- [ ] **Step 3: Harden the two catches**

`Code.gs:376`, inside `withLock`:

```js
  try {
    const result = operation();
    try { _bumpLogsVersion(); } catch (e) { Logger.log('logs version bump failed (cache invalidation may be stale): ' + (e && e.message)); }
    return result;
  } finally {
    lock.releaseLock();
  }
```

`Code.gs:497`, inside `AuditService.log`:

```js
  function log(author, action, entity, before, after, detail, snapshot) {
    try {
      const sheet = _getOrCreateSheet();
      sheet.appendRow([
        new Date(),
        author  || '',
        action  || '',
        entity  || '',
        before  || '',
        after   || '',
        detail  || '',
        snapshot ? JSON.stringify(snapshot) : '',
        ''
      ]);
    } catch (e) { Logger.log('audit log write failed for ' + action + ' on ' + entity + ': ' + (e && e.message)); }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx node --test tests/cache.test.js tests/audit.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/cache.test.js tests/audit.test.js
git commit -m "fix: trace cache-invalidation and audit-log write failures instead of swallowing them"
```

---

### Task 3: Cache hit/miss observability (`apiGetCacheStats`)

**Why a separate endpoint instead of folding into `getDataHealth()`:** `getDataHealth()`'s return shape is itself cached (`health_v*`) and asserted byte-for-byte equal across cache hits in `tests/cache.test.js:123` (`assert.deepStrictEqual(second, first)`). Merging live, ever-changing hit/miss counters into that return value would make consecutive calls diverge and break that existing test/contract. A standalone endpoint keeps `getDataHealth()` untouched and is trivially testable on its own.

**Design:** instrument the single chokepoint every one of the 14 cached reads already goes through (`_cacheGetChunked`, confirmed via grep — every cached getter calls it), recording hit/miss via `CacheService` (not `PropertiesService` — the version counters are the write-quota-sensitive resource; `CacheService` calls are cheap and this stat is inherently approximate/best-effort). Counters live under their own TTL (6h) so they represent a rolling recent window rather than growing unbounded.

**Files:**
- Modify: `Code.gs` — rename current `_cacheGetChunked` body to `_cacheGetChunkedRaw`, add a thin instrumented wrapper, add `_recordCacheStat`/`_getCacheStats`/`apiGetCacheStats`
- Modify: `Index.html` — surface the stat in the existing "Outils / Rapport de santé" panel
- Test: `tests/cache.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/cache.test.js`:

```js
test('apiGetCacheStats reports hit/miss counts across cached reads', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER, [D('2026-03-04'), 'A', 'Jeux', 5, '', '']]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.getAllLogs();   // cache miss (first read)
  gas.StorageService.getAllLogs();   // cache hit (same version)

  const stats = gas.apiGetCacheStats();
  assert.strictEqual(stats.success, true);
  assert.ok(stats.hits >= 1, 'expected at least one recorded hit: ' + JSON.stringify(stats));
  assert.ok(stats.misses >= 1, 'expected at least one recorded miss: ' + JSON.stringify(stats));
  assert.ok(typeof stats.hitRate === 'number' && stats.hitRate >= 0 && stats.hitRate <= 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx node --test tests/cache.test.js
```
Expected: FAIL — `gas.apiGetCacheStats is not a function`.

- [ ] **Step 3: Implement the instrumentation**

In `Code.gs`, replace the existing `_cacheGetChunked` function (lines 123-142) with:

```js
/**
 * Reads back whatever `_cachePutChunked` wrote. Returns null when the entry is
 * absent, or when any single chunk has expired — a chunk set outlived by one of
 * its members would reassemble into truncated JSON, which is worse than a miss.
 */
function _cacheGetChunkedRaw(cache, key) {
  const plain = cache.get(key);
  if (plain) return plain;
  const countStr = cache.get(key + '_chunks');
  if (!countStr) return null;
  const count = parseInt(countStr, 10);
  if (!(count > 0)) return null;
  let out = '';
  for (let i = 0; i < count; i++) {
    const chunk = cache.get(key + '_' + i);
    if (chunk === null || chunk === undefined || chunk === '') return null;
    out += chunk;
  }
  return out || null;
}

/**
 * Thin wrapper around _cacheGetChunkedRaw that records a hit/miss for the
 * observability panel — a single chokepoint since every one of the 14 cached
 * reads in this file calls _cacheGetChunked. Counters live in CacheService
 * (not PropertiesService, which backs the invalidation version counters and
 * is the more write-quota-sensitive resource) under their own short TTL, so
 * they represent a rolling recent window rather than growing unbounded.
 */
function _cacheGetChunked(cache, key) {
  const result = _cacheGetChunkedRaw(cache, key);
  _recordCacheStat(cache, result !== null);
  return result;
}

function _recordCacheStat(cache, hit) {
  try {
    const key = hit ? 'stat_cache_hits' : 'stat_cache_misses';
    const current = parseInt(cache.get(key) || '0', 10);
    cache.put(key, String(current + 1), 21600); // 6h — Apps Script's own cache TTL ceiling
  } catch (_) {}
}

/** Rolling hit/miss snapshot for the "Rapport de santé" panel. Best-effort:
 *  counters reset every 6h (CacheService TTL ceiling) and can under-count
 *  under concurrent writes — acceptable for a qualitative gauge, not an
 *  exact metric. */
function _getCacheStats() {
  try {
    const cache = CacheService.getScriptCache();
    const hits = parseInt(cache.get('stat_cache_hits') || '0', 10);
    const misses = parseInt(cache.get('stat_cache_misses') || '0', 10);
    const total = hits + misses;
    return { hits, misses, hitRate: total > 0 ? Math.round((hits / total) * 100) : null };
  } catch (_) {
    return { hits: 0, misses: 0, hitRate: null };
  }
}
```

Add a new endpoint near the other read-only `api*` functions (e.g. next to `apiGetChangelog`, end of file):

```js
function apiGetCacheStats() {
  try {
    return Object.assign({ success: true }, _getCacheStats());
  } catch (e) { return fail(e); }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx node --test tests/cache.test.js
```
Expected: PASS. Also re-run the full suite once here since `_cacheGetChunked` is the single most-shared helper in the file:

```bash
npm run verify
```
Expected: 307+ tests green (the two new ones from Task 1/2 plus this one added on top).

- [ ] **Step 5: Surface it in the frontend health panel**

In `Index.html`, find the health-report rendering function (search for the function that renders `getDataHealth()`'s `zeros`/`orphans`/`duplicateNames` in the Outils sous-onglet — likely named `renderDataHealth` or similar; confirm exact name/location with `grep -n "getDataHealth\|zeros.*orphans" Index.html` before editing). Add a `callServer('apiGetCacheStats')` call alongside the existing health call, and render one extra line, e.g.:

```js
callServer('apiGetCacheStats', [], stats => {
  if (!stats || !stats.success) return;
  const el = document.getElementById('healthCacheStats'); // add this container next to the existing health summary markup
  if (!el) return;
  const rate = stats.hitRate === null ? '—' : stats.hitRate + '%';
  el.textContent = `Cache : ${stats.hits} hits / ${stats.misses} miss (${rate} sur les 6 dernières heures)`;
});
```

Add the `#healthCacheStats` container element next to wherever the existing zeros/orphans summary renders in the Outils/Santé markup, styled with the existing `.text-muted`-equivalent class already used for metadata lines nearby (match the surrounding markup's existing class, don't invent a new one).

- [ ] **Step 6: Manual verification in the app**

Run `/run` (per project skill table) to launch the local preview harness and confirm the new line renders in Paramètres → Outils → Rapport de santé without layout shift, in both dark and light theme.

- [ ] **Step 7: Commit**

```bash
git add Code.gs Index.html tests/cache.test.js
git commit -m "feat: expose cache hit/miss rate in the data health panel"
```

---

### Task 4: Batch the four per-row `setValue` loops into single `setValues` calls

**Confirmed during audit verification** (exact current line numbers, may drift slightly after Tasks 1-3 land — re-grep `apiRepairOrder` and `apiGroupSimilarEntries` before editing):
- `Code.gs` `apiRepairOrder`: 3 loops (Players/Categories Ordre column, Bareme Ordre column, Phrases Ordre column), each one Sheets RPC per row.
- `Code.gs` `StorageService.apiGroupSimilarEntries`: 1 loop (History GroupId column), one Sheets RPC per row.

None of the other `setValue(` occurrences in `Code.gs`/`AutoPoints.gs` are loop-based (confirmed by full-file grep during verification).

**Files:**
- Modify: `Code.gs` — `apiRepairOrder` (~line 4199-4266) and `StorageService.apiGroupSimilarEntries` (~line 1398-1443)
- Test: `tests/reorder.test.js` (for `apiRepairOrder`) and `tests/outils-nouveaux.test.js` or `tests/storage.test.js` (for `apiGroupSimilarEntries` — check which file already covers it with `grep -rn apiGroupSimilarEntries tests/`)

- [ ] **Step 1: Locate existing coverage and confirm current line numbers**

```bash
grep -n "apiRepairOrder\|apiGroupSimilarEntries" Code.gs
grep -rln "apiRepairOrder\|apiGroupSimilarEntries" tests/
```

Read the matched test file(s) fully before editing — these existing tests assert on the FINAL Ordre/GroupId values written; they must keep passing unchanged since this task only changes *how* the write happens (batched vs per-row), never *what* is written.

- [ ] **Step 2: Add a write-count regression test**

Append to `tests/reorder.test.js` (adjust the `makeSheet`/`countingHistory`-style row-count helper to match that file's existing patterns — check how `sheet.getRange` call counts are tracked elsewhere in this repo, e.g. `countingHistory` in `tests/settings.test.js`, and reuse the same pattern):

```js
test('apiRepairOrder writes each Ordre column in a single batched call, not one per row', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['C', '', '', '', 3], ['A', '', '', '', 1], ['B', '', '', '', 2]
  ]);
  let setValueCalls = 0;
  const realGetRange = players.getRange.bind(players);
  players.getRange = (...a) => {
    const range = realGetRange(...a);
    const realSetValue = range.setValue.bind(range);
    range.setValue = (...args) => { setValueCalls++; return realSetValue(...args); };
    return range;
  };
  gas.ConfigService.getSheets = () => ({ players, categories: makeSheet([['Name','Description','Emoji','Hex color','Ordre']]), bareme: null, phrases: null });

  gas.apiRepairOrder('Alice', '');
  assert.strictEqual(setValueCalls, 0, 'Ordre column must be written via setValues (batched), not per-row setValue calls: ' + setValueCalls + ' setValue() calls observed');
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx node --test tests/reorder.test.js
```
Expected: FAIL — `setValueCalls` is 3 (one per player row), not 0.

- [ ] **Step 4: Batch `apiRepairOrder`**

Replace the Players/Categories block (`Code.gs`, current lines ~4206-4219):

```js
      ['Players', 'Categories'].forEach(type => {
        const sheet = ConfigService.getSheets()[type.toLowerCase()];
        const data  = sheet.getDataRange().getValues();
        const off   = _headerOffsetFromValues(type.toLowerCase(), data);
        let rows = data.slice(off)
          .map((r, i) => ({ r, sheetRow: i + 1 + off }))
          .filter(x => x.r[0]);
        rows = _sortByOrdreOrOriginal(rows, x => x.r[4]);
        // Single batched write instead of one setValue() RPC per row: read the
        // full Ordre column once (already in `data`), overwrite only the rows
        // that were reordered, write the whole column back in one setValues().
        const ordreCol = data.slice(off).map(r => [r[4] !== undefined && r[4] !== '' ? r[4] : '']);
        rows.forEach((x, idx) => { ordreCol[x.sheetRow - 1 - off] = [idx + 1]; });
        if (ordreCol.length) sheet.getRange(off + 1, 5, ordreCol.length, 1).setValues(ordreCol);
        // Only label the Ordre column when row 1 really is a header — otherwise this
        // would overwrite the first entity's own Ordre value with the word "Ordre".
        if (off && sheet.getRange(1, 5).getValue() === '') sheet.getRange(1, 5).setValue('Ordre');
        result[type.toLowerCase()] = rows.length;
      });
```

Replace the Bareme block (current lines ~4221-4235):

```js
      const baremeSheet = ConfigService.getSheets().bareme;
      if (baremeSheet) {
        const data = baremeSheet.getDataRange().getValues();
        const off  = _headerOffsetFromValues('bareme', data);
        const rows = data.slice(off)
          .map((r, i) => ({ r, sheetRow: i + 1 + off }))
          .filter(x => x.r[0] !== '' && x.r[0] !== undefined);
        const groups = {};
        rows.forEach(x => { (groups[x.r[0]] = groups[x.r[0]] || []).push(x); });
        const ordreCol = data.slice(off).map(r => [r[3] !== undefined && r[3] !== '' ? r[3] : '']);
        Object.keys(groups).forEach(key => {
          const ordered = _sortByOrdreOrOriginal(groups[key], x => x.r[3]);
          ordered.forEach((x, idx) => { ordreCol[x.sheetRow - 1 - off] = [idx + 1]; });
          result.bareme += ordered.length;
        });
        if (ordreCol.length) baremeSheet.getRange(off + 1, 4, ordreCol.length, 1).setValues(ordreCol);
      }
```

Replace the Phrases block (current lines ~4237-4254):

```js
      const phrasesSheet = ConfigService.getSheets().phrases;
      if (phrasesSheet) {
        const data = phrasesSheet.getDataRange().getValues();
        const off  = _headerOffsetFromValues('phrases', data);
        const rows = data.slice(off)
          .map((r, i) => ({ r, sheetRow: i + 1 + off }))
          .filter(x => x.r[0] !== '' && x.r[2] !== '');
        const groups = {};
        rows.forEach(x => {
          const key = x.r[0] + '|' + x.r[1];
          (groups[key] = groups[key] || []).push(x);
        });
        const ordreCol = data.slice(off).map(r => [r[3] !== undefined && r[3] !== '' ? r[3] : '']);
        Object.keys(groups).forEach(key => {
          const ordered = _sortByOrdreOrOriginal(groups[key], x => x.r[3]);
          ordered.forEach((x, idx) => { ordreCol[x.sheetRow - 1 - off] = [idx + 1]; });
          result.phrases += ordered.length;
        });
        if (ordreCol.length) phrasesSheet.getRange(off + 1, 4, ordreCol.length, 1).setValues(ordreCol);
      }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx node --test tests/reorder.test.js
```
Expected: PASS, including the new write-count test and every pre-existing `apiRepairOrder` test (final Ordre values must be byte-identical to before).

- [ ] **Step 6: Add the equivalent write-count test for `apiGroupSimilarEntries`**

In whichever test file already covers it (found in Step 1), append:

```js
test('apiGroupSimilarEntries writes the GroupId column in a single batched call, not one per row', () => {
  const gas = loadGas();
  const mk = (d, p, c, pts, desc) => [new Date(d), p, c, pts, desc, ''];
  const history = makeSheet([
    ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId'],
    mk('2026-01-01T10:00', 'A', 'Jeux', 5, 'Partie'),
    mk('2026-01-01T10:00', 'A', 'Jeux', 3, 'Partie')
  ]);
  let setValueCalls = 0;
  const realGetRange = history.getRange.bind(history);
  history.getRange = (...a) => {
    const range = realGetRange(...a);
    const realSetValue = range.setValue.bind(range);
    range.setValue = (...args) => { setValueCalls++; return realSetValue(...args); };
    return range;
  };
  gas.ConfigService.getSheets = () => ({ history });

  const result = gas.StorageService.apiGroupSimilarEntries();
  assert.strictEqual(result.groupedCount, 2);
  assert.strictEqual(setValueCalls, 0, 'GroupId column must be written via setValues (batched): ' + setValueCalls + ' setValue() calls observed');
});
```

- [ ] **Step 7: Batch `apiGroupSimilarEntries`**

Replace the grouping loop (`Code.gs`, current lines ~1424-1437):

```js
    let groupedCount = 0;
    let groupsCreated = 0;
    // Single batched write instead of one setValue() RPC per row: mutate a
    // full-height copy of the GroupId column in memory, then write it back
    // in one setValues() call.
    const groupIdCol = data.map(r => [r[5] !== undefined ? r[5] : '']);

    Object.keys(groups).forEach(key => {
      const rows = groups[key];
      if (rows.length >= 2) {
        const groupId = _generateGroupId();
        groupsCreated++;
        rows.forEach(rIdx => {
          groupIdCol[rIdx - startRow] = [groupId];
          groupedCount++;
        });
      }
    });

    if (groupedCount > 0) {
      sheet.getRange(startRow, 6, groupIdCol.length, 1).setValues(groupIdCol);
      ConfigService.clearCache();
    }
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npm run verify
```
Expected: full suite green (307 pre-existing + 5 new from Tasks 1/2/3/4).

- [ ] **Step 9: Commit**

```bash
git add Code.gs tests/
git commit -m "perf: batch Ordre/GroupId column writes into single setValues() calls"
```

---

### Task 5: Remove 15 verified-dead CSS classes

**Verification method:** a dedicated read-only sweep grepped each candidate across the entire `Index.html` (markup, JS `classList`/`className`/`querySelector`, template literals) and found zero live usage for all 15 — each occurrence is only ever the class's own CSS selector or a media-query/pseudo-class variant of it. A broader naive automated sweep found ~30 additional candidates, but spot-checks showed those are constructed dynamically in JS (e.g. `` `rank-${n}` ``, `'audit-cat-' + action`) and are very likely false positives — **left untouched, not deleted**, since verifying each would require the same manual rigor and the risk of a visible regression on the live app outweighs the hygiene gain.

**Classes to remove** (definition line numbers as of the audit; re-grep each before deleting since earlier tasks may have shifted line numbers): `.spotlight-card`, `.d-range` (+ `.d-range input`, `.d-range .mini`), `.row-tops-group` (+ `.row-tops-group .main-top-row`), `.row-bottom` (+ 3 responsive/media-query fragments), `.row-actions` (+ `.row-actions button` + 2 media-query overrides), `.settings-grid` (+ 3 responsive overrides), `.auto-rules-card`, `.row-main-right` (3 fragments, all inside media-query/mobile-layout blocks — no unqualified base rule exists), `.row-range-toggle` (+ checkbox child rule), `.bareme-settings-section` (+ `h3` child rule), `.hist-bulk-desc-wrap` (+ input child rule), `.detect-lot-info` (+ `strong` child rule), `.detect-summary`, `.row-alt-pill` (+ `:hover` + `.active` variants), `.phrase-podium-header-row`.

**Files:**
- Modify: `Index.html` `<style>` block only

- [ ] **Step 1: Re-confirm each class is still unused**

For each class name above:

```bash
grep -n "row-main-right\|row-bottom" Index.html
```

(repeat per class, or one combined `grep -nE` pass) — confirm every hit is still inside the `<style>` block (line < the `</style>` closing tag) before deleting. If any class now shows a hit outside `<style>`, stop and skip that one class (do not delete it) — re-verification takes priority over the plan's original list.

- [ ] **Step 2: Delete the 15 rule blocks**

Use the Edit tool to remove each selector's full rule block (opening `{` to matching `}`), including any descendant/pseudo-class/media-query fragments listed above. Do this one class at a time, re-reading the surrounding lines immediately before each deletion (line numbers shift after every edit).

- [ ] **Step 3: Run the HTML syntax check and full suite**

```bash
npm run verify
```
Expected: `check:html` passes (no broken `<style>` block — unmatched braces would be caught here) and all tests stay green (CSS removal has no backend/JS test surface, this just confirms nothing else broke).

- [ ] **Step 4: Manual visual check**

Run `/run`, open the app, and visually sweep: Dashboard, Saisir un Lot, Paramètres (incl. Outils sous-onglet), Notes, Historique, in both dark and light theme, at desktop and mobile widths. None of the 15 removed classes should have been visibly rendering anything (they were unreferenced) — this step is a safety net, not an expected-to-fail check.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "chore: remove 15 verified-dead CSS classes from Index.html"
```

---

### Task 6: Replace hardcoded hex colors with CSS custom properties

**Verified during audit:** 27 hardcoded hex colors exist in CSS rules outside `:root`. `--medal-gold`/`--medal-silver`/`--medal-bronze` (`#ffd700`/`#c0c0c0`/`#cd7f32`) **already exist** at `Index.html:44-46` — 13 podium instances should reuse them, not get new tokens. 8 derived podium variants (contrast text / lighter tint / gradient end) need genuinely new tokens. 9 status/badge instances match existing `--error`, `--success`, `--on-accent` tokens. 3 instances are `var(--x, #fallback)` default fallbacks (not real hardcodes) and 1 is a `-webkit-mask` alpha trick (not a rendered color) — leave those 4 alone.

**Files:**
- Modify: `Index.html` — add 8 new `:root` tokens near the existing `--medal-*` declarations (~line 44-46), then swap 22 rule-level hex values to `var(...)`

- [ ] **Step 1: Re-confirm current line numbers**

```bash
grep -n "#ffd700\|#c0c0c0\|#cd7f32\|#ff4757\|#2ed573\|#ffffff\|#fff\b" Index.html
```

Cross-check against the list below before editing — Task 5's deletions may shift some of these lines.

- [ ] **Step 2: Add 8 new `:root` tokens**

Next to the existing medal tokens (`Index.html` ~line 44-46), add:

```css
      --rank-gold-text: #4a3800;
      --rank-silver-text: #33383d;
      --rank-bronze-text: #331d0c;
      --rank-silver-light: #d0d8e0;
      --rank-bronze-light: #e59866;
      --rank-gold-grad-end: #ffaa00;
      --rank-silver-grad-end: #909090;
      --rank-bronze-grad-end: #9a5518;
```

- [ ] **Step 3: Swap the 13 podium hex instances to existing `--medal-*` tokens**

At each of these locations, replace the literal hex with the matching existing variable:
- `#ffd700` → `var(--medal-gold)` (lines ~2809, 2836, 2861, 2927, 2958; and the gradient start in ~2980)
- `#c0c0c0` → `var(--medal-silver)` (lines ~2820, 2837; and the gradient start in ~2981)
- `#cd7f32` → `var(--medal-bronze)` (lines ~2831, 2838; and the gradient start in ~2982)

- [ ] **Step 4: Swap the 8 derived podium variants to the new tokens**

- `color: #4a3800;` (in `.sr-rank.gold`, ~line 2447) → `color: var(--rank-gold-text);`
- `color: #33383d;` (in `.sr-rank.silver`, ~line 2448) → `color: var(--rank-silver-text);`
- `color: #331d0c;` (in `.sr-rank.bronze`, ~line 2449) → `color: var(--rank-bronze-text);`
- `color: #d0d8e0;` (~line 2868) → `color: var(--rank-silver-light);`
- `color: #e59866;` (~line 2875) → `color: var(--rank-bronze-light);`
- Gradient end stops: `#ffaa00` → `var(--rank-gold-grad-end)`, `#909090` → `var(--rank-silver-grad-end)`, `#9a5518` → `var(--rank-bronze-grad-end)` (all ~lines 2980-2982)

- [ ] **Step 5: Swap the 9 status/badge instances to existing tokens**

- `color: #ff4757;` (`.phrase-cat-badge.tight`, ~line 3154) → `color: var(--error);`
- `color: #2ed573;` (`.phrase-cat-badge.active-top`, ~line 3160) → `color: var(--success);`
- All 7 `#ffffff`/`#fff` instances at ~lines 759, 766, 799, 1839, 2413, 3266, 3273 → `var(--on-accent)`

- [ ] **Step 6: Leave these 4 alone (not real hardcodes)**

`var(--on-accent, #ffffff)` fallback defaults (~lines 346, 364, 3984) and the `-webkit-mask: linear-gradient(#fff 0 0)` alpha-mask trick (~line 667) — do not touch.

- [ ] **Step 7: Run the full suite and visual check**

```bash
npm run verify
```
Then run `/run` and visually confirm the podium (Dashboard → Classement, and the Commentaires card's podium view) and any status badges still render the correct gold/silver/bronze/error/success colors in both themes — a `var()` typo here would show as black/transparent, easy to spot.

- [ ] **Step 8: Commit**

```bash
git add Index.html
git commit -m "chore: replace 22 hardcoded hex colors with CSS custom properties"
```

---

### Task 7: Git hygiene — ignore local dev scratch files

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the ignore rules**

Append to `.gitignore`:

```
dev/temp_front.css
dev/temp_front.js
```

- [ ] **Step 2: Verify**

```bash
git status --short
```
Expected: `dev/temp_front.css` and `dev/temp_front.js` no longer listed as untracked.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore local dev scratch files (dev/temp_front.css, dev/temp_front.js)"
```

---

### Task 8: CHANGELOG.md + NEXT_SESSION.md

**Files:**
- Modify: `CHANGELOG.md` (one new version entry, two voices, per `context.md` §8)
- Modify: `NEXT_SESSION.md` (État courant / Dernière session / Écarts / Rappels+Backlog)

- [ ] **Step 1: Determine the next version number**

Current is `v3.20.20` (per `CHANGELOG.md` top entry). This work is a bundle of a bug fix + perf + hygiene, no breaking change → `v3.20.21`.

- [ ] **Step 2: Write the CHANGELOG entry**

Prepend to `CHANGELOG.md` (after the `# Changelog` header, before `v3.20.20`):

```markdown
## [v3.20.21] - 2026-08-26

### Corrigé
**Humanisé** : Renommer un joueur ou un Top affiche désormais immédiatement le nouveau nom partout (Notes, Tchat, Barème, Phrases) — auparavant l'ancien nom pouvait rester visible jusqu'à 10 minutes dans ces écrans après un renommage.
**Technique** : `SettingsService.renameEntity()` (`Code.gs`) bump désormais `_bumpNotesVersion()`/`_bumpChatVersion()` (renommage Joueur) et `_bumpBaremeVersion()`/`_bumpPhrasesVersion()` (renommage Top), en plus de `_bumpSettingsVersion()` déjà en place — alignant son comportement sur celui de l'outil de réparation d'ordre qui bumpait déjà ces trois compteurs ensemble. Deux échecs silencieux durcis en parallèle : un échec d'invalidation de cache (`withLock`) et un échec d'écriture du journal d'audit (`AuditService.log`) laissent maintenant une trace dans les logs au lieu de disparaître sans avertissement.

### Ajouté
**Humanisé** : Le panneau Rapport de santé (Paramètres → Outils) affiche maintenant un indicateur du taux de réussite du cache serveur, pour voir en un coup d'œil si l'app sert bien ses pages depuis le cache plutôt que de relire le tableur à chaque fois.
**Technique** : Nouvel endpoint `apiGetCacheStats()` (`Code.gs`), alimenté par un compteur hit/miss instrumenté au point de passage unique `_cacheGetChunked()` (renommé en wrapper autour de `_cacheGetChunkedRaw`), stocké dans `CacheService` sur une fenêtre glissante de 6h. Câblé dans le panneau Santé de `Index.html`.

### Modifié
**Humanisé** : Certains outils d'administration (réparation de l'ordre, regroupement automatique d'entrées similaires) sont maintenant plus rapides sur les tableurs volumineux, sans changement de comportement visible.
**Technique** : `apiRepairOrder()` et `StorageService.apiGroupSimilarEntries()` (`Code.gs`) remplacent leurs boucles `forEach(...).setValue(...)` (une requête Sheets par ligne) par un unique `setValues()` par colonne/feuille concernée.

### Supprimé
**Humanisé** : Nettoyage de code mort dans les styles de l'application — aucun changement visible.
**Technique** : Suppression de 15 classes CSS non référencées dans `Index.html` (confirmées mortes par une revue exhaustive : `.spotlight-card`, `.d-range`, `.row-tops-group`, `.row-bottom`, `.row-actions`, `.settings-grid`, `.auto-rules-card`, `.row-main-right`, `.row-range-toggle`, `.bareme-settings-section`, `.hist-bulk-desc-wrap`, `.detect-lot-info`, `.detect-summary`, `.row-alt-pill`, `.phrase-podium-header-row`). Remplacement de 22 couleurs hexadécimales en dur par des variables CSS (dont 8 nouveaux tokens `--rank-*` pour les variantes podium). Ajout de `dev/temp_front.css`/`dev/temp_front.js` au `.gitignore`.
```

- [ ] **Step 3: Rewrite NEXT_SESSION.md**

Replace the full content of `NEXT_SESSION.md` with:

```markdown
# NEXT_SESSION — top-des-tops

## État courant
- Version livrée : **v3.20.21** (2026-08-26) — déployée et validée sur Google Apps Script via CI.
- Plan achevé : Audit cache/perf/hygiène (vérification croisée de l'audit Gemini + fix d'un bug de cache réel trouvé pendant la vérification).
- Suite de tests : [N] cas verts (`npm run verify`) — mettre à jour [N] avec le compte réel après le Step 4 de la dernière tâche exécutée.
- Init recommandé : standard.

## Dernière session
- Audit exhaustif du cache, des perfs backend et de l'hygiène CSS (`v3.20.21`), déclenché par une demande d'optimisation globale. Vérification systématique de chaque affirmation d'un audit Gemini externe avant d'agir dessus (workflow à 6 agents read-only en parallèle) :
  - **Bug de cache trouvé et corrigé** : `SettingsService.renameEntity()` ne invalidait pas les caches Notes/Chat/Barème/Phrases après un renommage — jusqu'à 10 min d'affichage de l'ancien nom. Corrigé + 2 tests de régression.
  - **Durcissement** : 2 `catch` silencieux (invalidation de cache dans `withLock`, écriture du journal d'audit) tracent maintenant leurs échecs au lieu de disparaître.
  - **Observabilité** : nouvel endpoint `apiGetCacheStats()`, taux de hit/miss affiché dans le panneau Santé des données (backlog historique enfin traité).
  - **Perf backend** : 4 boucles `setValue()` par ligne (réparation d'ordre × 3, regroupement d'entrées similaires × 1) remplacées par des écritures `setValues()` groupées.
  - **Hygiène CSS** : 15 classes mortes confirmées supprimées (sur ~30 candidats supplémentaires trouvés par un balayage naïf mais écartés — construction dynamique en JS, faux positifs probables, laissés en l'état par prudence). 22 couleurs hexadécimales en dur remplacées par des variables CSS.
  - **Git** : `dev/temp_front.css`/`.js` ajoutés au `.gitignore`.
  - **Explicitement écarté** : modularisation de `Index.html` en namespaces (suggestion de l'audit Gemini) — contredit la contrainte projet "garder les fichiers monolithiques". Traduction des ~540 commentaires français d'`Index.html` vers l'anglais — reportée (faible priorité, risque de dénaturer des commentaires porteurs d'invariants de sécurité comme le garde-fou anti-perte de joueur).

## Écarts
- Aucun écart sur les tâches exécutées. Deux items de l'audit Gemini volontairement non traités (voir ci-dessus) — décision, pas oubli.

## Rappels actifs + Backlog
- **Prochaines pistes suggérées** :
  1. Si le taux de hit/miss du cache (nouveau panneau Santé) montre un taux de miss élevé en usage réel, revisiter le TTL de 600s — impossible à trancher sans données d'usage réel (interdiction d'interagir avec les données réelles, donc pas de mesure possible avant mise en prod).
  2. ~30 classes CSS candidates supplémentaires (construction dynamique suspectée : `rank-${n}`, `audit-cat-` + variable, etc.) — nécessiteraient une vérification manuelle par classe avant suppression, non faite cette session par prudence.
  3. Traduction des commentaires français vers l'anglais (règle §8) — gros volume (~540 dans Index.html, ~100 dans Code.gs), reportée.
- **Action manuelle requise** : Le propriétaire du projet GAS doit effectuer une re-autorisation OAuth unique dans l'interface Google Apps Script pour valider le scope Drive (`https://www.googleapis.com/auth/drive`).
- **Piège shell** : les heredocs Git Bash sur cette machine mangent un niveau d'antislash — `\(` devient `\(`. Ne jamais écrire de `new RegExp("...")` via heredoc ; passer par l'outil d'édition ou un fichier de script.
- **Cross-realm dans les tests `vm`** : `assert.deepStrictEqual` / `instanceof` échoue sur des objets/dates/tableaux construits dans un sandbox `vm` différent du contexte Node — comparer via duck-typing ou `JSON.stringify(...)`.
- **Environnement de prévisualisation** : le pane du navigateur intégré peut rapporter `window.innerWidth === 0` juste après un `preview_start` frais, forçant `body.mobile-layout` même sur un onglet destiné au desktop — toujours appeler `resize_window` avant de lire un état dépendant de la largeur sur un tab tout juste ouvert.
- Garde-fous en place : `tests/papercuts.test.js`, `tests/guide-audit.test.js`, `tests/dropdown-outside-click.test.js`, `tests/cache-bytes.test.js`, `tests/innerhtml-audit.test.js`.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md NEXT_SESSION.md
git commit -m "docs: update CHANGELOG and NEXT_SESSION for v3.20.21"
```

---

### Task 9: Final full verification, account check, and push

- [ ] **Step 1: Full suite**

```bash
npm run verify
```
Expected: all tests green, `check:html` clean.

- [ ] **Step 2: Confirm the active GitHub account**

```bash
gh auth status
```
Expected: active account is `Arcxy2nd`. If not:

```bash
gh auth switch --user Arcxy2nd
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

This triggers `.github/workflows/deploy-gas.yml`, deploying to both `deploy-targets.json` entries ("Site tops" and "Tops RDS"). Do not poll `gh run list` in a tight loop afterward (project rule against repeated polling) — check once after a reasonable delay if confirmation is needed.

---

## Self-Review Notes

- **Spec coverage:** every confirmed-true finding from the 6-way audit-verification workflow maps to a task (Task 1 = cache bug, Task 2 = silent catches, Task 3 = observability/backlog item, Task 4 = backend perf, Task 5 = dead CSS, Task 6 = hardcoded colors, Task 7 = git hygiene). Two audit suggestions are deliberately excluded with reasoning recorded in Task 8's NEXT_SESSION update: `Index.html` modularization (contradicts project's monolithic-file constraint) and French→English comment translation (high volume, low priority, risk of blurring safety-critical prose — deferred to backlog, not silently dropped).
- **Placeholder scan:** no TBD/TODO markers; every step carries complete, real code or an exact command.
- **Type/name consistency:** `_bumpNotesVersion`/`_bumpChatVersion`/`_bumpBaremeVersion`/`_bumpPhrasesVersion` (Task 1), `_cacheGetChunkedRaw`/`_recordCacheStat`/`_getCacheStats`/`apiGetCacheStats` (Task 3) are used with identical names everywhere they're referenced across tasks.
