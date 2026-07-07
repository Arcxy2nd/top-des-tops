# Chargement progressif & feedback de chargement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visible loading feedback to every zone of the app that currently loads silently, and remove the redundant server-side re-reads that make Historique / Rapport de santé / Détection de lots slow at scale (thousands of rows).

**Architecture:** Backend (`Code.gs`) gets three new `CacheService` caches, all keyed off the existing `_logsVersion()` counter that `withLock()` already bumps on every mutation — same pattern as `StorageService.getAllLogs()`, zero new invalidation logic to invent. Frontend (`Index.html`) gets a small set of skeleton helpers, all built on the single existing `.skeleton` CSS class (shimmer animation), applied to every zone identified in the audit. The two existing ad hoc skeleton styles (`.bareme-skel` with its own `bareme-pulse` animation) are migrated to the shared `.skeleton` class for visual consistency; `#chartSkeleton` (already a static `.skeleton` block, just display-toggled) is left untouched since it already follows the target pattern.

**Tech Stack:** Google Apps Script (`Code.gs`), vanilla JS/HTML/CSS (`Index.html`), Node `node:test` + VM harness (`tests/harness.js`) for backend tests, `node --check` for frontend syntax validation (GAS cannot run locally — see `tests/harness.js` header comment and project memory).

**Explicit scope trims (judgment calls, not asked to the user a second time):**
- **Bandeau logo/titre app** (`loadAppBranding`) is dropped from the skeleton rollout: it already shows a graceful static fallback (`"Tops des Tops"` title, hidden logo) rather than an empty state, so adding a skeleton would introduce a flicker for no UX gain.
- **Paramètres → Phrases/Presets editor** is not given its own skeleton: `loadCustomPhrases` runs once at boot (`window.onload`), long before a user could plausibly have navigated to that settings tab, so there is no real empty-state window to cover. Its boot-time effect (an empty Card Commentaires) is covered by Task 6 instead.

---

## File Structure

- **Modify `Code.gs`**: `StorageService` gets `_readFullHistoryRows()` + `getFullHistoryRowsCached()` (Task 1), `getDataHealth()` gains a cache wrapper (Task 2), `apiDetectDistributedLots()` gains a cache wrapper (Task 3). No new files — the project's hard constraint keeps `Code.gs` monolithic.
- **Modify `Index.html`**: new skeleton helpers added near `showToast` (Task 4), then applied at each of the 9 call sites (Tasks 5–13), then the Historique prefetch logic (Task 14). Same monolithic-file constraint applies.
- **Modify `tests/cache.test.js`**: new tests for the 3 backend caches (Tasks 1–3).

---

### Task 1: Backend — cache the full History rows behind `getHistoryPage`

**Files:**
- Modify: `Code.gs:285-297` (add two new `StorageService` methods right after `_readLogsFromSheet`)
- Modify: `Code.gs:344-349` (`getHistoryPage` — swap its direct sheet read for the cached one)
- Test: `tests/cache.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/cache.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: the two new tests FAIL — `history.reads` is `2`/`3` (or more) instead of `1`, because `getHistoryPage` currently reads the sheet directly on every call.

- [ ] **Step 3: Add the cached raw-row reader to `StorageService`**

In `Code.gs`, right after `_readLogsFromSheet()` (ends at line 297, before `getAllLogs()`), insert:

```js
  /**
   * Reads every valid History row with all 7 columns (unlike _readLogsFromSheet,
   * which only keeps 4 fields for the lighter getAllLogs cache). Used by
   * getHistoryPage, which still applies its own filters/pagination on top —
   * only the sheet read itself is shared/cached.
   */
  _readFullHistoryRows() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    return sheet.getRange(2, 1, lastRow - 1, 7).getValues()
      .map((row, i) => {
        const rec = this._parseHistoryRow(row, i);
        if (!rec.dateValid || !rec.hasEntities || !rec.pointsValid) return null;
        return {
          date: rec.date, player: rec.player, category: rec.category, points: rec.points,
          description: rec.description, groupId: rec.groupId, saiseur: rec.saiseur,
          rowIndex: rec.rowIndex
        };
      })
      .filter(Boolean);
  },

  /**
   * Cross-request cached wrapper around _readFullHistoryRows, keyed on the same
   * write-version counter _logsVersion() as getAllLogs — invalidated by any
   * mutation (withLock bumps it), so pagination/filter changes never re-read
   * the sheet as long as nothing has been written since the last read.
   */
  getFullHistoryRowsCached() {
    const cache = CacheService.getScriptCache();
    const key   = 'hist_full_v' + _logsVersion();
    const raw   = cache.get(key);
    if (raw) {
      try {
        return JSON.parse(raw).map(r => Object.assign({}, r, { date: new Date(r.date) }));
      } catch (e) { /* corrupt entry → fall through to a fresh read */ }
    }
    const result = this._readFullHistoryRows();
    const serial = JSON.stringify(result.map(r => Object.assign({}, r, { date: r.date.toISOString() })));
    if (serial.length <= 95000) cache.put(key, serial, 600);
    return result;
  },
```

- [ ] **Step 4: Make `getHistoryPage` use the cached reader**

In `Code.gs`, `getHistoryPage` currently starts like this (lines 344-376):

```js
  getHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText) {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { logs: [], total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    const hasPlayerFilter   = filterPlayers   && filterPlayers.length   > 0;
    const hasCategoryFilter = filterCategories && filterCategories.length > 0;

    let allWithIndex = [];
    for (let i = 0; i < data.length; i++) {
      const rec = this._parseHistoryRow(data[i], i);
      if (!rec.dateValid || !rec.hasEntities || !rec.pointsValid) continue;
      if (hasPlayerFilter   && !filterPlayers.includes(rec.player))     continue;
      if (hasCategoryFilter && !filterCategories.includes(rec.category)) continue;
      if (filterText) {
        const ft = filterText.toLowerCase();
        if (!rec.player.toLowerCase().includes(ft) &&
            !rec.category.toLowerCase().includes(ft) &&
            !rec.description.toLowerCase().includes(ft)) continue;
      }
      allWithIndex.push({
        timestamp:   rec.date.toISOString(),
        player:      rec.player,
        category:    rec.category,
        points:      rec.points,
        description: rec.description,
        groupId:     rec.groupId,
        saiseur:     rec.saiseur,
        rowIndex:    rec.rowIndex
      });
    }
```

Replace it with:

```js
  getHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText) {
    const rows = this.getFullHistoryRowsCached();
    const hasPlayerFilter   = filterPlayers   && filterPlayers.length   > 0;
    const hasCategoryFilter = filterCategories && filterCategories.length > 0;

    let allWithIndex = [];
    for (let i = 0; i < rows.length; i++) {
      const rec = rows[i];
      if (hasPlayerFilter   && !filterPlayers.includes(rec.player))     continue;
      if (hasCategoryFilter && !filterCategories.includes(rec.category)) continue;
      if (filterText) {
        const ft = filterText.toLowerCase();
        if (!rec.player.toLowerCase().includes(ft) &&
            !rec.category.toLowerCase().includes(ft) &&
            !rec.description.toLowerCase().includes(ft)) continue;
      }
      allWithIndex.push({
        timestamp:   rec.date.toISOString(),
        player:      rec.player,
        category:    rec.category,
        points:      rec.points,
        description: rec.description,
        groupId:     rec.groupId,
        saiseur:     rec.saiseur,
        rowIndex:    rec.rowIndex
      });
    }
```

The rest of `getHistoryPage` (grouping into visual items, pagination slicing, the final `return`) is unchanged — leave it exactly as-is below this block. Note the `if (lastRow <= 1) return { logs: [], total: 0 };` early-out is now implicitly handled by `getFullHistoryRowsCached()` returning `[]` for an empty sheet, so `rows.length === 0` flows correctly through the rest of the function to the same empty result.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass, including the two new ones and the existing `getHistoryPage groups entries sharing a groupId into one visual item` test (unchanged behavior).

- [ ] **Step 6: Commit**

```bash
git add Code.gs tests/cache.test.js
git commit -m "perf: cache full History rows behind getHistoryPage"
```

---

### Task 2: Backend — cache the Rapport de santé result

**Files:**
- Modify: `Code.gs:440-465` (`StorageService.getDataHealth`)
- Test: `tests/cache.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/cache.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAILS — `history.reads` is `2` (or more) instead of `1` after the second call, since `getDataHealth` currently re-reads the sheet every time.

- [ ] **Step 3: Wrap `getDataHealth` in a cache**

In `Code.gs`, `getDataHealth` currently reads (lines 440-465):

```js
  getDataHealth() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { zeros: 0, orphans: 0, total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));

    let zeros = 0, orphans = 0;

    data.forEach((row, idx) => {
      const rec = this._parseHistoryRow(row, idx);
      if (!rec.dateValid) return;
      if (!rec.pointsValid) zeros++;
      if (rec.player && !players.has(rec.player))         orphans++;
      else if (rec.category && !categories.has(rec.category)) orphans++;
    });

    return {
      total:  data.length,
      zeros,
      orphans
    };
  },
```

Replace it with a cached wrapper plus the original logic renamed to a private method:

```js
  getDataHealth() {
    const cache = CacheService.getScriptCache();
    const key   = 'health_v' + _logsVersion();
    const raw   = cache.get(key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { /* corrupt entry → recompute */ }
    }
    const result = this._computeDataHealth();
    cache.put(key, JSON.stringify(result), 600);
    return result;
  },

  _computeDataHealth() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { zeros: 0, orphans: 0, total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));

    let zeros = 0, orphans = 0;

    data.forEach((row, idx) => {
      const rec = this._parseHistoryRow(row, idx);
      if (!rec.dateValid) return;
      if (!rec.pointsValid) zeros++;
      if (rec.player && !players.has(rec.player))         orphans++;
      else if (rec.category && !categories.has(rec.category)) orphans++;
    });

    return {
      total:  data.length,
      zeros,
      orphans
    };
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass, including the existing `getDataHealth counts zero-point rows and orphans without modifying data` test (unchanged behavior — that test never calls `clearCache`/re-invokes twice, so the cache write is transparent to it).

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/cache.test.js
git commit -m "perf: cache getDataHealth result"
```

---

### Task 3: Backend — cache the Détection de lots répartis result

**Files:**
- Modify: `Code.gs:1442-1525` (`apiDetectDistributedLots`)
- Test: `tests/cache.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/cache.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAILS — `history.reads` is `2` (or more) instead of `1` after the second call.

- [ ] **Step 3: Wrap the computation in a cache**

In `Code.gs`, `apiDetectDistributedLots` currently starts with (lines 1442-1449):

```js
function apiDetectDistributedLots() {
  try {
    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, lots: [] };

    const pad = function(n) { return String(n).padStart(2, '0'); };
    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
```

and ends with (lines 1522-1525):

```js
    lots.sort(function(a, b) { return b.count - a.count; });
    return { success: true, lots: lots };
  } catch(e) { return fail(e); }
}
```

Wrap the whole body in a cache check. Replace the function's opening (`function apiDetectDistributedLots() {\n  try {`) with:

```js
function apiDetectDistributedLots() {
  try {
    const cache = CacheService.getScriptCache();
    const key   = 'lots_v' + _logsVersion();
    const raw   = cache.get(key);
    if (raw) {
      try { return { success: true, lots: JSON.parse(raw) }; } catch (e) { /* corrupt entry → recompute */ }
    }

    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, lots: [] };

    const pad = function(n) { return String(n).padStart(2, '0'); };
    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
```

and replace the function's ending (the `lots.sort` + `return` shown above) with:

```js
    lots.sort(function(a, b) { return b.count - a.count; });
    const serial = JSON.stringify(lots);
    if (serial.length <= 95000) cache.put(key, serial, 600);
    return { success: true, lots: lots };
  } catch(e) { return fail(e); }
}
```

Everything between (the entry-building, grouping-by-key, chaining loop) stays exactly as-is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass, including the two pre-existing `apiDetectDistributedLots` tests (unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/cache.test.js
git commit -m "perf: cache apiDetectDistributedLots result"
```

---

### Task 4: Frontend — skeleton helper functions

**Files:**
- Modify: `Index.html` (CSS block near line 300, JS near `showToast` at line 4019)

- [ ] **Step 1: Add the `.skeleton-text` CSS variant**

In `Index.html`, right after the existing skeleton CSS (lines 299-306):

```css
    /* ── SKELETON ── */
    .skeleton {
      background: linear-gradient(90deg, var(--border) 25%, var(--btn-alt) 50%, var(--border) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.2s infinite;
      border-radius: 8px;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
```

add:

```css
    .skeleton-text {
      display: inline-block;
      height: 0.9em;
      border-radius: 4px;
      vertical-align: middle;
    }
```

- [ ] **Step 2: Add the three helper functions**

In `Index.html`, right before `function showToast(msg, type, duration) {` (line 4019), insert:

```js
  // ── SKELETONS (feedback de chargement générique) ─────────────────────
  // Remplace tout le contenu d'un conteneur par N blocs de squelette (tableaux
  // sans en-tête, listes, grilles de stats). Le contenu réel, une fois arrivé,
  // écrase innerHTML normalement — pas besoin de fonction hideSkeleton dédiée.
  function showSkeleton(container, opts) {
    if (!container) return;
    opts = opts || {};
    const rows       = opts.rows || 3;
    const height     = opts.height || 44;
    const tag        = opts.tag || 'div';
    const extraClass = opts.extraClass ? (' ' + opts.extraClass) : '';
    let html = '';
    for (let i = 0; i < rows; i++) {
      html += '<' + tag + ' class="skeleton' + extraClass + '" style="height:' + height + 'px;margin-bottom:8px;"></' + tag + '>';
    }
    container.innerHTML = html;
  }

  // Pour un tableau : les <tr> doivent contenir un <td colspan> valide, showSkeleton
  // seul produirait du HTML de table invalide (le navigateur sortirait les <div> de <tbody>).
  function showTableSkeleton(tbody, colCount, rows) {
    if (!tbody) return;
    let html = '';
    for (let i = 0; i < (rows || 5); i++) {
      html += '<tr class="skeleton-row"><td colspan="' + colCount + '"><div class="skeleton" style="height:32px;"></div></td></tr>';
    }
    tbody.innerHTML = html;
  }

  // Pour un élément existant qu'on veut garder en place (ex: la valeur d'une pastille
  // Quick Stats) : affiche un bandeau shimmer par-dessus le texte sans toucher au
  // reste du DOM parent (avatars, labels…), puis unskeletonizeText restaure le texte réel.
  function skeletonizeText(el, width) {
    if (!el) return;
    el.classList.add('skeleton', 'skeleton-text');
    el.style.width = (width || 50) + 'px';
    el.textContent = ' ';
  }
  function unskeletonizeText(el) {
    if (!el) return;
    el.classList.remove('skeleton', 'skeleton-text');
    el.style.width = '';
  }

```

- [ ] **Step 3: Verify syntax**

Run:
```bash
node -e "const fs=require('fs'),os=require('os'),path=require('path');const html=fs.readFileSync('Index.html','utf8');const m=html.match(/<script>([\s\S]*)<\/script>/);const out=path.join(os.tmpdir(),'tdt_check.js');fs.writeFileSync(out,m[1]);require('child_process').execSync('node --check '+JSON.stringify(out),{stdio:'inherit'});console.log('OK');"
```
Expected output: `OK`

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "feat: add generic skeleton loading helpers"
```

---

### Task 5: Frontend — Quick Stats skeleton

**Files:**
- Modify: `Index.html:2831-2866` (`loadQuickStats`)

- [ ] **Step 1: Apply skeleton before the call, clear it in the callback**

Current code (lines 2831-2866):

```js
  function loadQuickStats() {
    callServer('apiGetQuickStats', [], res => {
      const s = res.stats;
      const leaderAvatar = document.getElementById('qsLeaderAvatar');
      const leaderValue  = document.getElementById('qsLeaderValue');
      const gapValue     = document.getElementById('qsGapValue');
      const monthValue   = document.getElementById('qsMonthValue');
      const lastAvatar   = document.getElementById('qsLastAvatar');
      const lastValue    = document.getElementById('qsLastValue');

      if (s.leader) {
```

Replace with:

```js
  function loadQuickStats() {
    const leaderValue = document.getElementById('qsLeaderValue');
    const gapValue     = document.getElementById('qsGapValue');
    const monthValue   = document.getElementById('qsMonthValue');
    const lastValue    = document.getElementById('qsLastValue');
    [leaderValue, gapValue, monthValue, lastValue].forEach(el => skeletonizeText(el, 60));

    callServer('apiGetQuickStats', [], res => {
      const s = res.stats;
      const leaderAvatar = document.getElementById('qsLeaderAvatar');
      const lastAvatar   = document.getElementById('qsLastAvatar');
      [leaderValue, gapValue, monthValue, lastValue].forEach(el => unskeletonizeText(el));

      if (s.leader) {
```

(the body of the `if (s.leader) { ... }` / rest of the function is unchanged — `leaderValue`/`gapValue`/`monthValue`/`lastValue` are now closures from the outer scope instead of being re-looked-up inside the callback, so remove the now-duplicate `const leaderValue = ...` / `const gapValue = ...` / `const monthValue = ...` / `const lastValue = ...` lines that used to follow `const leaderAvatar = ...` / `const lastAvatar = ...` inside the callback — only `leaderAvatar` and `lastAvatar` stay declared there, as shown above).

- [ ] **Step 2: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "feat: skeleton feedback for Quick Stats bandeau"
```

---

### Task 6: Frontend — Card Commentaires boot skeleton

**Files:**
- Modify: `Index.html:8344-8351` (`window.onload`, right before `loadCustomPhrases`)

- [ ] **Step 1: Show a skeleton in `#phrasesList` at boot**

Current code (lines 8344-8351):

```js
  window.onload = () => {
    initTheme();
    initSettingsTabs();
    initHistoryTabs();
    bindButtons();
    bindExportButtons();
    initPhraseSettings();
    loadCustomPhrases(() => {
```

Replace with:

```js
  window.onload = () => {
    initTheme();
    initSettingsTabs();
    initHistoryTabs();
    bindButtons();
    bindExportButtons();
    initPhraseSettings();
    showSkeleton(document.getElementById('phrasesList'), { rows: 3, height: 50 });
    loadCustomPhrases(() => {
```

No further change needed: `renderPhrasesCard()` and `clearPhrasesCard()` both already do `list.innerHTML = ...` (lines 3614 and 3583), which naturally replaces the skeleton once the phrases + ranking data are both ready.

- [ ] **Step 2: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "feat: skeleton feedback for Card Commentaires at boot"
```

---

### Task 7: Frontend — Historique table skeleton

**Files:**
- Modify: `Index.html:6999-7005` (`_doLoadHistoryPage`)

- [ ] **Step 1: Show a table skeleton before the call**

Current code (lines 6999-7005):

```js
  function _doLoadHistoryPage(page) {
    currentHistoryPage = page;
    const textFilter    = (document.getElementById('historyTextFilter') || {}).value || '';
    const filterPlayers = selectedHistPlayers.size    ? [...selectedHistPlayers]    : [];
    const filterCats    = selectedHistCategories.size ? [...selectedHistCategories] : [];

    callServer('apiGetHistoryPage', [page, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null], res => {
```

Replace with:

```js
  function _doLoadHistoryPage(page) {
    currentHistoryPage = page;
    const textFilter    = (document.getElementById('historyTextFilter') || {}).value || '';
    const filterPlayers = selectedHistPlayers.size    ? [...selectedHistPlayers]    : [];
    const filterCats    = selectedHistCategories.size ? [...selectedHistCategories] : [];

    showTableSkeleton(document.getElementById('historyTableBody'), histSelectMode ? 7 : 6, PAGE_SIZE);
    callServer('apiGetHistoryPage', [page, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null], res => {
```

The callback already does `tbody.innerHTML = ''` right before rendering rows (line 7013), which clears the skeleton.

- [ ] **Step 2: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "feat: skeleton feedback for Historique table"
```

---

### Task 8: Frontend — Notes skeleton

**Files:**
- Modify: `Index.html:7368-7372` (`loadNotes`)

- [ ] **Step 1: Show a skeleton before the call**

Current code (lines 7368-7372):

```js
  function loadNotes() {
    callServer('apiGetAllNotes', [], res => {
      renderNotesUI(res.notes || []);
    }, 'Chargement notes');
  }
```

Replace with:

```js
  function loadNotes() {
    showSkeleton(document.getElementById('notesPlayersContainer'), { rows: 3, height: 70 });
    callServer('apiGetAllNotes', [], res => {
      renderNotesUI(res.notes || []);
    }, 'Chargement notes');
  }
```

`renderNotesUI` already starts with `container.innerHTML = ''` (right after the container lookup), which clears the skeleton.

- [ ] **Step 2: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "feat: skeleton feedback for Notes"
```

---

### Task 9: Frontend — Paramètres → Entités skeleton

**Files:**
- Modify: `Index.html:4486-4487` (`loadEntities`)

- [ ] **Step 1: Show a skeleton before the call**

Current code (lines 4486-4488):

```js
  function loadEntities() {
    callServer('apiGetSettings', [], res => {
      cachedPlayers    = res.players    || [];
```

Replace with:

```js
  function loadEntities() {
    showSkeleton(document.getElementById('playersList'),    { rows: 3, height: 44, tag: 'li' });
    showSkeleton(document.getElementById('categoriesList'), { rows: 3, height: 44, tag: 'li' });
    callServer('apiGetSettings', [], res => {
      cachedPlayers    = res.players    || [];
```

`renderEntityList` (called later in the same callback, line 4507-4508) already does `container.innerHTML = ''` first, which clears the skeleton.

- [ ] **Step 2: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "feat: skeleton feedback for Paramètres > Entités"
```

---

### Task 10: Frontend — migrate Rapport de santé to the generic skeleton

**Files:**
- Modify: `Index.html:7878-7884` (`loadDataHealth`)

- [ ] **Step 1: Replace the inline skeleton markup**

Current code (lines 7878-7884):

```js
  function loadDataHealth() {
    const grid = document.getElementById('healthGrid');
    grid.innerHTML = `
      <div class="health-stat skeleton" style="height:90px;"></div>
      <div class="health-stat skeleton" style="height:90px;"></div>
      <div class="health-stat skeleton" style="height:90px;"></div>
    `;
    callServer('apiGetDataHealth', [], res => {
```

Replace with:

```js
  function loadDataHealth() {
    const grid = document.getElementById('healthGrid');
    showSkeleton(grid, { rows: 3, height: 90, extraClass: 'health-stat' });
    callServer('apiGetDataHealth', [], res => {
```

Same visual result (`.health-stat.skeleton`, 90px height, 3 blocks) — now generated by the shared helper instead of a hardcoded template string.

- [ ] **Step 2: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "refactor: migrate Rapport de santé skeleton to the generic helper"
```

---

### Task 11: Frontend — Détection de lots répartis skeleton

**Files:**
- Modify: `Index.html:8134-8140` (`scanDistributedLots`)

- [ ] **Step 1: Show a skeleton before the call (currently none)**

Current code (lines 8134-8140):

```js
  function scanDistributedLots() {
    const btn = document.getElementById('detectLotsBtn');
    const container = document.getElementById('detectResults');
    container.innerHTML = '';
    const restore = startBtnLoading(btn, 'Scan…');

    callServer('apiDetectDistributedLots', [], res => {
```

Replace with:

```js
  function scanDistributedLots() {
    const btn = document.getElementById('detectLotsBtn');
    const container = document.getElementById('detectResults');
    showSkeleton(container, { rows: 3, height: 60 });
    const restore = startBtnLoading(btn, 'Scan…');

    callServer('apiDetectDistributedLots', [], res => {
```

The callback already sets `container.innerHTML` on both branches (empty-state message or `renderDetectedLots`), which clears the skeleton either way.

- [ ] **Step 2: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "feat: skeleton feedback for Détection de lots répartis"
```

---

### Task 12: Frontend — migrate Paramètres → Barème to the generic skeleton

**Files:**
- Modify: `Index.html:8428-8436` (`loadBaremeSettings`)
- Modify: `Index.html:1005-1009` (remove now-dead `.bareme-skel` CSS — done in Task 13 together, see note below)

- [ ] **Step 1: Replace the inline skeleton markup**

Current code (line 8435, inside `loadBaremeSettings`):

```js
    container.innerHTML = '<div class="bareme-skel" style="height:60px;margin-bottom:10px;"></div>'.repeat(Math.min(cachedCategories.length, 3));
```

Replace with:

```js
    showSkeleton(container, { rows: Math.min(cachedCategories.length, 3), height: 60 });
```

- [ ] **Step 2: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "refactor: migrate Paramètres > Barème skeleton to the generic helper"
```

---

### Task 13: Frontend — migrate drawer Barème (saisie de lot) + remove dead CSS

**Files:**
- Modify: `Index.html:8589-8591` (`loadBareme`)
- Modify: `Index.html:1005-1009` (delete `.bareme-skel` / `bareme-pulse` CSS — no longer referenced after this task)

- [ ] **Step 1: Replace the inline skeleton markup**

Current code (lines 8589-8591):

```js
  function loadBareme() {
    const body = document.getElementById('baremeBody');
    body.innerHTML = [1,2,3].map(() => '<div class="bareme-skel"></div>').join('');
    callServer('apiGetBareme', [], res => {
```

Replace with:

```js
  function loadBareme() {
    const body = document.getElementById('baremeBody');
    showSkeleton(body, { rows: 3, height: 60 });
    callServer('apiGetBareme', [], res => {
```

- [ ] **Step 2: Remove the now-unused CSS**

In `Index.html`, delete these lines (1005-1009) — confirm first that Task 12's Step 1 already ran, so `.bareme-skel` has zero remaining references in the file:

```css
    @keyframes bareme-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.6; } }
    .bareme-skel {
      height: 60px; border-radius: 11px; background: var(--btn-alt);
      animation: bareme-pulse 1.4s ease-in-out infinite;
    }
```

- [ ] **Step 3: Verify syntax and confirm no leftover references**

Run the same check command as Task 4 Step 3, then:

```bash
grep -c "bareme-skel" Index.html
```
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "refactor: migrate drawer Barème skeleton to the generic helper, drop dead CSS"
```

---

### Task 14: Frontend — Historique: préchargement de la page suivante

**Files:**
- Modify: `Index.html:2671` (new state variable, next to `PAGE_SIZE`)
- Modify: `Index.html` — `loadHistoryPage` / `_doLoadHistoryPage`, **as left by Task 7** (Task 7 already inserted a `showTableSkeleton(...)` line right before the `callServer` call; the anchors below include it)

- [ ] **Step 1: Add a client-side prefetch cache**

Current code (line 2671):

```js
  const PAGE_SIZE = 20;
```

Replace with:

```js
  const PAGE_SIZE = 20;
  // Préchargement client de la page suivante de l'Historique : clé = "page|joueurs|catégories|texte".
  // Vidée à chaque changement de filtre/texte (les points d'entrée qui rechargent déjà
  // la page 1 après une mutation la vident aussi, via clearHistPrefetchCache()).
  const histPrefetchCache = new Map();
  function histPrefetchKey(page, players, cats, text) {
    return page + '|' + players.join(',') + '|' + cats.join(',') + '|' + (text || '');
  }
  function clearHistPrefetchCache() { histPrefetchCache.clear(); }
```

- [ ] **Step 2: Serve from the prefetch cache when available, and prefetch the next page**

This step turns the existing `_doLoadHistoryPage` into two functions: `_renderHistoryPage(page, res)` (pure rendering, reusable whether `res` came from the network or the prefetch cache) and a new `_doLoadHistoryPage` that decides whether to hit the network or serve from cache. The ~200-line rendering body in between (row/group building) is untouched — only its two ends move.

**2a.** Replace the function's opening — this is the state Task 7 left it in (its `showTableSkeleton` line included below, since Task 7 runs first):

```js
  function _doLoadHistoryPage(page) {
    currentHistoryPage = page;
    const textFilter    = (document.getElementById('historyTextFilter') || {}).value || '';
    const filterPlayers = selectedHistPlayers.size    ? [...selectedHistPlayers]    : [];
    const filterCats    = selectedHistCategories.size ? [...selectedHistCategories] : [];

    showTableSkeleton(document.getElementById('historyTableBody'), histSelectMode ? 7 : 6, PAGE_SIZE);
    callServer('apiGetHistoryPage', [page, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null], res => {
```

with just:

```js
  function _renderHistoryPage(page, res) {
```

This drops the `currentHistoryPage` assignment, the filter/text lookups, the `showTableSkeleton` call and the `callServer` call header — all of them move into the new `_doLoadHistoryPage` written in **2c** below. Everything from the next line (`const logs = res.logs || [];`) through the line `renderPagination(total);` stays byte-for-byte identical — it already only references `res`, `page`, `tbody`, `logs`, `total`, `histSelectMode`, `renderItems`, etc., none of which depend on being inside the old callback closure. Leave the indentation as-is (one level deeper than strictly necessary) — cosmetic only, not required for correctness.

**2b.** Replace the function's closing (unchanged by Task 7 — still the same two lines):

```js
      renderPagination(total);
    }, 'Chargement historique');
  }
```

with:

```js
      renderPagination(total);
  }
```

**2c.** Immediately after that closing `}` (i.e. right after what was line 7218), add the new `_doLoadHistoryPage` and its prefetch helper:

```js
  function _doLoadHistoryPage(page) {
    currentHistoryPage = page;
    const textFilter    = (document.getElementById('historyTextFilter') || {}).value || '';
    const filterPlayers = selectedHistPlayers.size    ? [...selectedHistPlayers]    : [];
    const filterCats    = selectedHistCategories.size ? [...selectedHistCategories] : [];
    const key = histPrefetchKey(page, filterPlayers, filterCats, textFilter.trim());

    const prefetched = histPrefetchCache.get(key);
    if (prefetched) {
      histPrefetchCache.delete(key);
      _renderHistoryPage(page, prefetched);
      _prefetchNextHistoryPage(page, filterPlayers, filterCats, textFilter);
      return;
    }

    showTableSkeleton(document.getElementById('historyTableBody'), histSelectMode ? 7 : 6, PAGE_SIZE);
    callServer('apiGetHistoryPage', [page, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null], res => {
      _renderHistoryPage(page, res);
      _prefetchNextHistoryPage(page, filterPlayers, filterCats, textFilter);
    }, 'Chargement historique');
  }

  // Précharge silencieusement la page suivante (pas de skeleton, pas de toast d'erreur
  // visible) pour que le clic "suivant" soit instantané. N'écrase pas une entrée déjà
  // présente dans le cache (évite de reprécharger en boucle si l'utilisateur va-et-vient).
  function _prefetchNextHistoryPage(page, filterPlayers, filterCats, textFilter) {
    const nextPage = page + 1;
    const key = histPrefetchKey(nextPage, filterPlayers, filterCats, textFilter.trim());
    if (histPrefetchCache.has(key)) return;
    callServer('apiGetHistoryPage', [nextPage, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null],
      res => { histPrefetchCache.set(key, res); },
      null, () => {} // échec silencieux : pas grave, la page suivante sera rechargée normalement au clic
    );
  }
```

- [ ] **Step 3: Clear the prefetch cache on filter/text changes and after mutations**

The following 7 existing call sites already reset to page 1 after a filter/text change or a mutation — each must also call `clearHistPrefetchCache()` since prefetched pages for the old filter combination are no longer valid. Line numbers below are approximate (earlier tasks shifted them) — use the surrounding code shown to locate each one uniquely, since some of these statements are textually identical to each other and only distinguishable by context.

**3a.** Inside `renderHistoryFilterChips()`, the "Tous" (clear all players) chip handler — originally around line 6902-6905:

```js
    const allP = makeChip('Tous', selectedHistPlayers.size === 0, null, () => {
      selectedHistPlayers.clear(); currentHistoryPage = 1;
      renderHistoryFilterChips(); loadHistoryPage(1);
    });
```

Change the middle line to:

```js
      selectedHistPlayers.clear(); currentHistoryPage = 1; clearHistPrefetchCache();
```

**3b.** Directly below it, the per-player toggle chip handler — originally around line 6909-6912:

```js
      pc.appendChild(makeChip(p.name, active, active ? playerColor(p.name) : null, () => {
        if (selectedHistPlayers.has(p.name)) selectedHistPlayers.delete(p.name);
        else selectedHistPlayers.add(p.name);
        currentHistoryPage = 1; renderHistoryFilterChips(); loadHistoryPage(1);
      }, getAvatarUrl(p.name, p.meta)));
```

Change the 4th line to:

```js
        currentHistoryPage = 1; clearHistPrefetchCache(); renderHistoryFilterChips(); loadHistoryPage(1);
```

**3c.** The "Tous" (clear all categories) chip handler — originally around line 6916-6919:

```js
    const allC = makeChip('Tous', selectedHistCategories.size === 0, null, () => {
      selectedHistCategories.clear(); currentHistoryPage = 1;
      renderHistoryFilterChips(); loadHistoryPage(1);
    });
```

Change the middle line to:

```js
      selectedHistCategories.clear(); currentHistoryPage = 1; clearHistPrefetchCache();
```

**3d.** The per-category toggle chip handler — originally around line 6923-6926:

```js
      cc.appendChild(makeChip(catDisplay(c.name), active, active ? categoryColor(c.name) : null, () => {
        if (selectedHistCategories.has(c.name)) selectedHistCategories.delete(c.name);
        else selectedHistCategories.add(c.name);
        currentHistoryPage = 1; renderHistoryFilterChips(); loadHistoryPage(1);
      }));
```

Change the 4th line to:

```js
        currentHistoryPage = 1; clearHistPrefetchCache(); renderHistoryFilterChips(); loadHistoryPage(1);
```

**3e.** The "Actualiser" button in the Historique tab — originally around line 8045-8047:

```js
    document.getElementById('refreshHistoryBtn').addEventListener('click', () => {
      currentHistoryPage = 1; loadHistoryPage(1);
    });
```

Change the middle line to:

```js
      currentHistoryPage = 1; clearHistPrefetchCache(); loadHistoryPage(1);
```

**3f.** The debounced text search — originally around line 8058-8063:

```js
    const textFilterEl = document.getElementById('historyTextFilter');
    if (textFilterEl) {
      textFilterEl.addEventListener('input', () => {
        clearTimeout(_histSearchTimeout);
        _histSearchTimeout = setTimeout(() => { currentHistoryPage = 1; loadHistoryPage(1); }, 400);
      });
    }
```

Change the `setTimeout` line to:

```js
        _histSearchTimeout = setTimeout(() => { currentHistoryPage = 1; clearHistPrefetchCache(); loadHistoryPage(1); }, 400);
```

**3g.** The nav tab-switch handler — originally around line 7905-7913:

```js
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
      if (tabId === 'tab-history') { currentHistoryPage = 1; loadHistoryPage(1); }
```

Change that last line to:

```js
      if (tabId === 'tab-history') { currentHistoryPage = 1; clearHistPrefetchCache(); loadHistoryPage(1); }
```

- [ ] **Step 4: Verify syntax**

Run the same check command as Task 4 Step 3.
Expected output: `OK`

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "feat: prefetch next Historique page in the background"
```

---

## Manual verification (all tasks)

GAS cannot run locally (project constraint — see `tests/harness.js` header and project memory). After all tasks are committed:

1. Deploy a new version to Apps Script ("Gérer les déploiements" → "Nouvelle version").
2. Open the app and check, for each of: Quick Stats, Card Commentaires, Historique (table + page navigation), Notes, Paramètres → Entités, Outils → Rapport de santé, Outils → Lots répartis, Paramètres → Barème, drawer Barème (bouton "Saisir un Lot") — that a shimmering skeleton appears immediately on load/navigation and is replaced by real content once the server responds.
3. In Historique, click "page suivante" after the current page has been visible for at least a second or two — the next page should appear with no visible skeleton flash (served from the prefetch cache).
4. Change a History filter (player/category/text) and confirm the table still shows a skeleton on that first filtered load (prefetch cache correctly cleared, not incorrectly serving a stale prefetched page).
