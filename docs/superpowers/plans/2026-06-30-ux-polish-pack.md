# UX Polish Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global quick-stats bar, a satisfying "+X pts" animation on the batch entry builder, and a customizable app title/logo — without breaking any existing feature.

**Architecture:** Three independent additions on top of the existing monolithic `Code.gs` / `Index.html`. Backend gets three new `api*` endpoints following the existing try/catch + `withLock` + `AuditService.log` conventions. Frontend reuses existing helpers (`callServer`, `cachedPlayers`, `getAvatarUrl`, `showToast`, `flashSaved`) — no new dependencies.

**Tech Stack:** Google Apps Script (`Code.gs`), vanilla JS/CSS in `Index.html`, Node `node:test` + VM harness (`tests/harness.js`) for backend tests.

**Project constraints (do not violate):**
- `Code.gs` and `Index.html` stay single files — no splitting.
- No git repository here — skip "commit" steps; just check off each step as you finish it.
- Every player mention in the UI must show an avatar (no exceptions).
- Don't remove or regress any existing feature while adding these.

---

### Task 1: Backend — recognize the `Settings` sheet in `ConfigService`

**Files:**
- Modify: `Code.gs` (top-of-file doc comment + `ConfigService.getSheets`)

- [ ] **Step 1: Add `Settings` to the structure doc comment**

Find this comment block at the top of `Code.gs`:

```javascript
/**
 * SPREADSHEET STRUCTURE
 * History   : [0] Date | [1] Player   | [2] Category  | [3] Points | [4] Description
 * Players   : [0] Name | [1] Avatar URL | [2] Hex color
 * Categories: [0] Name | [1] Description | [2] Emoji icon | [3] Hex color
 * Notes     : [0] Date | [1] Player   | [2] Note text
 * Bareme    : [0] Action (text) | [1] Points  (optional sheet, auto-created)
 */
```

Replace it with:

```javascript
/**
 * SPREADSHEET STRUCTURE
 * History   : [0] Date | [1] Player   | [2] Category  | [3] Points | [4] Description
 * Players   : [0] Name | [1] Avatar URL | [2] Hex color
 * Categories: [0] Name | [1] Description | [2] Emoji icon | [3] Hex color
 * Notes     : [0] Date | [1] Player   | [2] Note text
 * Bareme    : [0] Action (text) | [1] Points  (optional sheet, auto-created)
 * Settings  : [0] Key  | [1] Value  (optional sheet, auto-created — app_title, logo_url)
 */
```

- [ ] **Step 2: Add the `settings` sheet lookup to `ConfigService.getSheets`**

Find:

```javascript
      // La feuille Notes est optionnelle : null si absente (pas d'erreur bloquante).
      const notes    = ss.getSheetByName('Notes')    || null;
      const bareme   = ss.getSheetByName('Bareme')   || null;
      const phrases  = ss.getSheetByName('Phrases')  || null;
      const auditLog = ss.getSheetByName('AuditLog') || null;
      _cache = { spreadsheet: ss, history, players, categories, notes, bareme, phrases, auditLog };
      return _cache;
```

Replace with:

```javascript
      // La feuille Notes est optionnelle : null si absente (pas d'erreur bloquante).
      const notes    = ss.getSheetByName('Notes')    || null;
      const bareme   = ss.getSheetByName('Bareme')   || null;
      const phrases  = ss.getSheetByName('Phrases')  || null;
      const auditLog = ss.getSheetByName('AuditLog') || null;
      const settings = ss.getSheetByName('Settings') || null;
      _cache = { spreadsheet: ss, history, players, categories, notes, bareme, phrases, auditLog, settings };
      return _cache;
```

- [ ] **Step 3: Verify syntax**

Run: `node --check Code.gs`
Expected: no output (syntax OK)

- [ ] **Step 4: Mark step complete** (no git repo — just check the box)

---

### Task 2: Backend — `SettingsSheetService` + `apiGetAppSettings` / `apiSaveAppSettings`

**Files:**
- Modify: `Code.gs` (new service + two new endpoints)
- Modify: `tests/harness.js` (export new symbols)
- Create: `tests/settings.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/settings.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

/** Stateful mock: insertSheet() creates the sheet and getSheets() picks it up on the next call,
 *  mirroring how ConfigService.clearCache() + a real re-fetch behaves in production. */
function withSettingsSheets(gas, initial) {
  let settingsSheet = initial || null;
  gas.ConfigService.getSheets = () => ({
    spreadsheet: {
      insertSheet: () => { settingsSheet = makeSheet([['Key', 'Value']]); return settingsSheet; },
      getSheetByName: () => null
    },
    settings: settingsSheet
  });
  gas.ConfigService.clearCache = () => {};
}

test('SettingsSheetService.getAll returns {} when the Settings sheet does not exist', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  assert.deepStrictEqual(gas.SettingsSheetService.getAll(), {});
});

test('SettingsSheetService.setValue auto-creates the sheet with header + default keys, then writes the value', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  gas.SettingsSheetService.setValue('app_title', 'Les Champions');
  const all = gas.SettingsSheetService.getAll();
  assert.strictEqual(all.app_title, 'Les Champions');
  assert.strictEqual(all.logo_url, '');
});

test('SettingsSheetService.setValue updates an existing key without duplicating rows', () => {
  const gas = loadGas();
  const existing = makeSheet([['Key', 'Value'], ['app_title', 'Old'], ['logo_url', '']]);
  withSettingsSheets(gas, existing);
  gas.SettingsSheetService.setValue('app_title', 'New');
  assert.strictEqual(existing._grid.length, 3);
  assert.strictEqual(existing._grid[1][1], 'New');
});

test('apiGetAppSettings falls back to defaults when nothing is configured', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  const res = gas.apiGetAppSettings();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.appTitle, 'Tops des Tops');
  assert.strictEqual(res.logoUrl, '');
});

test('apiSaveAppSettings persists title and logo, then apiGetAppSettings reflects them', () => {
  const gas = loadGas();
  withSettingsSheets(gas, null);
  const saveRes = gas.apiSaveAppSettings('Les Champions', 'https://example.com/logo.png', 'Alice');
  assert.strictEqual(saveRes.success, true);
  const res = gas.apiGetAppSettings();
  assert.strictEqual(res.appTitle, 'Les Champions');
  assert.strictEqual(res.logoUrl, 'https://example.com/logo.png');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx node --test tests/settings.test.js`
Expected: FAIL — `gas.SettingsSheetService is undefined` (and `apiGetAppSettings`/`apiSaveAppSettings` undefined) because nothing is implemented or exported yet.

- [ ] **Step 3: Add `SettingsSheetService` to `Code.gs`**

Find the line `// ─── BAREME SERVICE ────────────────────────────────────────────────────────────` and insert this new block immediately **before** it:

```javascript
// ─── SETTINGS SHEET SERVICE ────────────────────────────────────────────────────
// Sheet "Settings" : [0] Key | [1] Value  (optional sheet, auto-created)
const SettingsSheetService = {
  _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.settings) return cache.settings;
    const sheet = cache.spreadsheet.insertSheet('Settings');
    sheet.appendRow(['Key', 'Value']);
    sheet.appendRow(['app_title', '']);
    sheet.appendRow(['logo_url', '']);
    ConfigService.clearCache();
    return ConfigService.getSheets().settings;
  },

  /** Read-only: never auto-creates. Returns {} if the sheet doesn't exist yet. */
  getAll() {
    const sheet = ConfigService.getSheets().settings;
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    const result = {};
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) result[data[i][0].toString()] = data[i][1] ? data[i][1].toString() : '';
    }
    return result;
  },

  setValue(key, value) {
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        return;
      }
    }
    sheet.appendRow([key, value]);
  }
};

```

- [ ] **Step 4: Add the two API endpoints**

Find:

```javascript
function apiGetSettings() {
  try {
    return {
      success:    true,
      players:    SettingsService.getEntities('Players'),
      categories: SettingsService.getEntities('Categories')
    };
  } catch(e) { return fail(e); }
}
```

Insert immediately **after** it:

```javascript

function apiGetAppSettings() {
  try {
    const all = SettingsSheetService.getAll();
    return {
      success:  true,
      appTitle: all.app_title || 'Tops des Tops',
      logoUrl:  all.logo_url  || ''
    };
  } catch(e) { return fail(e); }
}

function apiSaveAppSettings(title, logoUrl, author) {
  try {
    return withLock(() => {
      SettingsSheetService.setValue('app_title', (title || '').trim());
      SettingsSheetService.setValue('logo_url', (logoUrl || '').trim());
      AuditService.log(author, 'Identité app modifiée', 'Settings', '', (title || '').trim(), '');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 5: Export the new symbols from the test harness**

In `tests/harness.js`, find:

```javascript
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries };';
```

Replace with:

```javascript
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiGetQuickStats };';
```

(`apiGetQuickStats` is exported here too, ahead of Task 3, so Task 3 doesn't need to touch this file again.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx node --test tests/settings.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 7: Verify syntax**

Run: `node --check Code.gs`
Expected: no output (syntax OK)

- [ ] **Step 8: Mark step complete**

---

### Task 3: Backend — `apiGetQuickStats`

**Files:**
- Modify: `Code.gs` (new endpoint)
- Create: `tests/quick-stats.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/quick-stats.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet } = require('./harness.js');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId'];
const PLAYERS_HEADER = ['Name', 'Avatar URL', 'Hex color'];

test('apiGetQuickStats computes leader and gap to second place', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [new Date(), 'A', 'Jeux', 10, '', ''],
    [new Date(), 'B', 'Jeux', 4, '', ''],
    [new Date(), 'A', 'Jeux', 2, '', '']
  ]);
  const players = makeSheet([PLAYERS_HEADER, ['A', '', ''], ['B', '', '']]);
  gas.ConfigService.getSheets = () => ({ history, players });

  const res = gas.apiGetQuickStats();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.stats.leader.player, 'A');
  assert.strictEqual(res.stats.leader.points, 12);
  assert.strictEqual(res.stats.gap, 8);
});

test('apiGetQuickStats returns gap 0 on a tie', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [new Date(), 'A', 'Jeux', 5, '', ''],
    [new Date(), 'B', 'Jeux', 5, '', '']
  ]);
  const players = makeSheet([PLAYERS_HEADER, ['A', '', ''], ['B', '', '']]);
  gas.ConfigService.getSheets = () => ({ history, players });

  const res = gas.apiGetQuickStats();
  assert.strictEqual(res.stats.gap, 0);
});

test('apiGetQuickStats returns nulls and zero counts on an empty board', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({
    history: makeSheet([HEADER]),
    players: makeSheet([PLAYERS_HEADER])
  });

  const res = gas.apiGetQuickStats();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.stats.leader, null);
  assert.strictEqual(res.stats.gap, null);
  assert.strictEqual(res.stats.monthCount, 0);
  assert.strictEqual(res.stats.lastEvent, null);
});

test('apiGetQuickStats counts only this month\'s entries and finds the latest event', () => {
  const gas = loadGas();
  const now = new Date();
  const thisMonth1 = new Date(now.getFullYear(), now.getMonth(), 3, 10, 0, 0);
  const thisMonth2 = new Date(now.getFullYear(), now.getMonth(), 10, 14, 0, 0);
  const lastMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 20, 9, 0, 0);
  const history = makeSheet([
    HEADER,
    [thisMonth1, 'A', 'Jeux',  5, '', ''],
    [thisMonth2, 'B', 'Défis', 3, '', ''],
    [lastMonth,  'A', 'Jeux',  7, '', '']
  ]);
  const players = makeSheet([PLAYERS_HEADER, ['A', '', ''], ['B', '', '']]);
  gas.ConfigService.getSheets = () => ({ history, players });

  const res = gas.apiGetQuickStats();
  assert.strictEqual(res.stats.monthCount, 2);
  assert.strictEqual(res.stats.lastEvent.player, 'B');
  assert.strictEqual(res.stats.lastEvent.points, 3);
  assert.strictEqual(res.stats.lastEvent.category, 'Défis');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx node --test tests/quick-stats.test.js`
Expected: FAIL — `gas.apiGetQuickStats is not a function`

- [ ] **Step 3: Implement `apiGetQuickStats`**

Find `function apiGetPlayerTotals(players, startDate, endDate) {` and its closing `}` (it ends right before the comment `// ── Outils de nettoyage ──...`). Insert the new function immediately **after** `apiGetPlayerTotals`'s closing brace and **before** that comment:

```javascript

function apiGetQuickStats() {
  try {
    const allPlayers = SettingsService.getEntities('Players').map(p => p.name);
    const logs = StorageService.getFilteredLogs(allPlayers, null, null, null);

    const totals = {};
    allPlayers.forEach(p => { totals[p] = 0; });
    logs.forEach(log => {
      if (Object.prototype.hasOwnProperty.call(totals, log.player)) {
        totals[log.player] += log.points;
      }
    });

    const ranked = allPlayers
      .map(p => ({ player: p, points: totals[p] || 0 }))
      .sort((a, b) => b.points - a.points);

    const leader = ranked.length ? ranked[0] : null;
    const second = ranked.length > 1 ? ranked[1] : null;
    const gap = (leader && second) ? (leader.points - second.points) : null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthCount = logs.filter(l => l.timestamp >= monthStart).length;

    const sortedByDate = logs.slice().sort((a, b) => b.timestamp - a.timestamp);
    const last = sortedByDate.length ? sortedByDate[0] : null;

    return {
      success: true,
      stats: {
        leader: leader ? { player: leader.player, points: leader.points } : null,
        gap: gap,
        monthCount: monthCount,
        lastEvent: last ? {
          player:   last.player,
          category: last.category,
          points:   last.points,
          date:     last.timestamp.toISOString()
        } : null
      }
    };
  } catch (e) { return fail(e); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx node --test tests/quick-stats.test.js`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Run the full backend test suite**

Run: `npm test`
Expected: PASS — every existing test still passes plus the new ones (no regressions).

- [ ] **Step 6: Verify syntax**

Run: `node --check Code.gs`
Expected: no output (syntax OK)

- [ ] **Step 7: Mark step complete**

---

### Task 4: Frontend — quick stats bandeau

**Files:**
- Modify: `Index.html` (HTML, CSS, JS)

- [ ] **Step 1: Add the bandeau markup**

Find:

```html
    <button class="theme-toggle" id="themeToggle" aria-label="Basculer le thème">🌙</button>
  </div>
</nav>

<div class="container">
```

Replace with:

```html
    <button class="theme-toggle" id="themeToggle" aria-label="Basculer le thème">🌙</button>
  </div>
</nav>

<div id="quickStatsBar" class="quick-stats-bar">
  <div class="qs-pill qs-leader">
    <img class="qs-avatar" id="qsLeaderAvatar" src="" alt="" style="display:none;">
    <div class="qs-pill-text">
      <span class="qs-pill-label">🏆 Leader</span>
      <span class="qs-pill-value" id="qsLeaderValue">—</span>
    </div>
  </div>
  <div class="qs-pill">
    <div class="qs-pill-text">
      <span class="qs-pill-label">📊 Écart</span>
      <span class="qs-pill-value" id="qsGapValue">—</span>
    </div>
  </div>
  <div class="qs-pill">
    <div class="qs-pill-text">
      <span class="qs-pill-label">📅 Ce mois-ci</span>
      <span class="qs-pill-value" id="qsMonthValue">—</span>
    </div>
  </div>
  <div class="qs-pill qs-last">
    <img class="qs-avatar" id="qsLastAvatar" src="" alt="" style="display:none;">
    <div class="qs-pill-text">
      <span class="qs-pill-label">🕐 Dernier event</span>
      <span class="qs-pill-value" id="qsLastValue">—</span>
    </div>
  </div>
</div>

<div class="container">
```

- [ ] **Step 2: Add the CSS**

Find:

```css
    .navbar::-webkit-scrollbar { display: none; }
```

Insert immediately **after** it:

```css
    /* ── Bandeau résumé rapide ── */
    .quick-stats-bar {
      display: flex; gap: 10px; overflow-x: auto; -webkit-overflow-scrolling: touch;
      scrollbar-width: none; padding: 10px max(10px, env(safe-area-inset-left));
      max-width: 1200px; margin: 0 auto; background: var(--card);
      border-bottom: 1px solid var(--border);
    }
    .quick-stats-bar::-webkit-scrollbar { display: none; }
    .qs-pill {
      display: flex; align-items: center; gap: 8px;
      background: rgba(0,0,0,0.2); border: 1px solid var(--border);
      border-radius: 10px; padding: 8px 14px; flex-shrink: 0;
      min-width: 150px;
    }
    .qs-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .qs-pill-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .qs-pill-label { font-size: 0.7rem; color: var(--text-muted); }
    .qs-pill-value {
      font-size: 0.88rem; font-weight: 700; color: var(--text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    @media (max-width: 640px) {
      .qs-pill { min-width: 128px; padding: 7px 10px; }
    }
```

- [ ] **Step 3: Add `timeAgo` and `loadQuickStats` helpers**

Find:

```javascript
  function getAvatarUrl(name, meta) {
    if (meta && meta.trim()) return meta.trim();
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) +
           '&background=2a313d&color=e0e6ed&bold=true&size=64';
  }
```

Insert immediately **after** it:

```javascript

  // ── BANDEAU RÉSUMÉ RAPIDE ─────────────────────────────────────────────
  function timeAgo(date) {
    const diffMs = new Date() - date;
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'à l\'instant';
    if (mins < 60) return 'il y a ' + mins + ' min';
    const hours = Math.round(mins / 60);
    if (hours < 24) return 'il y a ' + hours + 'h';
    const days = Math.round(hours / 24);
    return 'il y a ' + days + 'j';
  }

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
        const p = cachedPlayers.find(pl => pl.name === s.leader.player);
        leaderAvatar.src = getAvatarUrl(s.leader.player, p ? p.meta : '');
        leaderAvatar.onerror = () => { leaderAvatar.src = getAvatarUrl(s.leader.player, ''); };
        leaderAvatar.style.display = '';
        leaderValue.textContent = s.leader.player + ' · ' + s.leader.points + ' pts';
      } else {
        leaderAvatar.style.display = 'none';
        leaderValue.textContent = 'Pas encore de scores';
      }

      gapValue.textContent = (s.gap === null) ? '—' : (s.gap === 0 ? 'Égalité' : s.gap + ' pts');
      monthValue.textContent = s.monthCount + ' event' + (s.monthCount > 1 ? 's' : '');

      if (s.lastEvent) {
        const p = cachedPlayers.find(pl => pl.name === s.lastEvent.player);
        lastAvatar.src = getAvatarUrl(s.lastEvent.player, p ? p.meta : '');
        lastAvatar.onerror = () => { lastAvatar.src = getAvatarUrl(s.lastEvent.player, ''); };
        lastAvatar.style.display = '';
        lastValue.textContent = s.lastEvent.player + ' +' + s.lastEvent.points + ' pts · ' + timeAgo(new Date(s.lastEvent.date));
      } else {
        lastAvatar.style.display = 'none';
        lastValue.textContent = 'Aucun event';
      }
    }, 'Chargement résumé');
  }
```

- [ ] **Step 4: Hook `loadQuickStats` into the refresh cycle**

Find:

```javascript
  function globalRefresh() {
    loadEntities();
    applyFilters();
```

Replace with:

```javascript
  function globalRefresh() {
    loadEntities();
    applyFilters();
    loadQuickStats();
```

Find (the end of `window.onload`):

```javascript
    loadEntities();
    applyFilters();
  };
```

Replace with:

```javascript
    loadEntities();
    applyFilters();
    loadQuickStats();
  };
```

- [ ] **Step 5: Manual check**

This is a GAS app — it cannot run locally. Re-read the four edits above and confirm: the `<div id="quickStatsBar">` sits between `</nav>` and `<div class="container">`; the CSS block was inserted once; `loadQuickStats` is defined before its first call site; both call sites (`globalRefresh` and `window.onload`) now call it.

- [ ] **Step 6: Mark step complete**

---

### Task 5: Frontend — "+X pts" float animation on row add

**Files:**
- Modify: `Index.html` (CSS, JS)

- [ ] **Step 1: Add the CSS animation**

Find:

```css
    @keyframes fadeOut { to { opacity: 0; transform: translateY(6px); } }
```

Insert immediately **after** it:

```css

    /* ── Animation "+X pts" sur ajout de ligne ── */
    .float-pts-badge {
      position: fixed; transform: translateX(-50%);
      pointer-events: none; font-weight: 700; font-size: 0.95rem;
      color: var(--accent); z-index: 9999;
      animation: float-pts-rise 600ms ease-out forwards;
    }
    @keyframes float-pts-rise {
      0%   { opacity: 0; transform: translate(-50%, 0); }
      15%  { opacity: 1; }
      100% { opacity: 0; transform: translate(-50%, -28px); }
    }
```

- [ ] **Step 2: Add the `floatPointsBadge` helper**

Find:

```javascript
  // Confirmation visuelle : le bouton passe brièvement en vert avec ✓.
  function flashSaved(btn) {
    if (!btn) return;
    const original = btn.dataset.original || btn.innerHTML;
    btn.classList.add('saved');
    btn.innerHTML = '✓';
    setTimeout(() => {
      btn.classList.remove('saved');
      btn.innerHTML = original;
    }, 900);
  }
```

Insert immediately **after** it:

```javascript

  // Texte "+X pts" qui remonte en fondu depuis un bouton (ajout de ligne au constructeur de lot).
  function floatPointsBadge(sourceEl, points) {
    if (!sourceEl) return;
    const rect = sourceEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'float-pts-badge';
    el.textContent = '+' + points + ' pts';
    el.style.left = (rect.left + rect.width / 2) + 'px';
    el.style.top = rect.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
```

- [ ] **Step 3: Make `addEntryRow` accept an optional source button and fire the animation**

Find:

```javascript
  function addEntryRow(preset) {
```

Replace with:

```javascript
  function addEntryRow(preset, animateFromBtn) {
```

Find (the end of `addEntryRow`, the four lines right before its closing brace):

```javascript
    applyRowAvatar(initPlayer);
    const initCatCol = categoryColor(initCategory);
    div.style.setProperty('--row-accent', initCatCol);
    refreshBaremeForTop(initCategory);
    refreshHistVisibility();
    updateLotSummary();
  }
```

Replace with:

```javascript
    applyRowAvatar(initPlayer);
    const initCatCol = categoryColor(initCategory);
    div.style.setProperty('--row-accent', initCatCol);
    refreshBaremeForTop(initCategory);
    refreshHistVisibility();
    updateLotSummary();
    if (animateFromBtn) floatPointsBadge(animateFromBtn, defaultPts);
  }
```

- [ ] **Step 4: Pass the clicked button at both explicit-click call sites**

Find:

```javascript
    dupBtn.addEventListener('click', () => addEntryRow({
      player:      pSel.value,
      category:    cSel.value,
      customPts:   customPtsInput.value,
      date:        startInput.value,
      dateEnd:     rangeCb.checked ? endInput.value : '',
      fill:        fillToggle.dataset.fill,
      days:        JSON.parse(dayPickerWrap.dataset.days || '[]'),
      description: descInput.value
    }));
```

Replace with:

```javascript
    dupBtn.addEventListener('click', () => addEntryRow({
      player:      pSel.value,
      category:    cSel.value,
      customPts:   customPtsInput.value,
      date:        startInput.value,
      dateEnd:     rangeCb.checked ? endInput.value : '',
      fill:        fillToggle.dataset.fill,
      days:        JSON.parse(dayPickerWrap.dataset.days || '[]'),
      description: descInput.value
    }, dupBtn));
```

Find:

```javascript
    document.getElementById('addRowBtn').addEventListener('click', () => addEntryRow());
```

Replace with:

```javascript
    document.getElementById('addRowBtn').addEventListener('click', (e) => addEntryRow(undefined, e.currentTarget));
```

- [ ] **Step 5: Confirm the silent/auto call sites are untouched**

Read the two remaining `addEntryRow(...)` call sites and confirm neither was touched (they must keep firing with **no** second argument, so no animation plays on auto-init or post-submit reset):

- `if (document.querySelectorAll('.entry-row').length === 0) addEntryRow();` (auto-fill empty tab)
- `addEntryRow();` right after `lotGroupSeq = 0;` inside the `apiAddBulkPlan` success callback (reset after submit)

Expected: both still call `addEntryRow()` with zero arguments — no change needed there.

- [ ] **Step 6: Verify syntax**

Run: `node --check Code.gs` (this task didn't touch `Code.gs`, but re-running confirms Task 1–3 edits are still intact)
Expected: no output (syntax OK)

- [ ] **Step 7: Mark step complete**

---

### Task 6: Frontend — customizable app title and logo

**Files:**
- Modify: `Index.html` (HTML, CSS, JS)

- [ ] **Step 1: Add the brand markup to the navbar**

Find:

```html
<nav class="navbar">
  <div class="nav-container">
    <button class="nav-btn active" data-tab="tab-dashboard">📊 Dashboard</button>
```

Replace with:

```html
<nav class="navbar">
  <div class="nav-container">
    <div class="app-brand" id="appBrand">
      <img class="app-brand-logo" id="appBrandLogo" src="" alt="" style="display:none;">
      <span class="app-brand-title" id="appBrandTitle">Tops des Tops</span>
    </div>
    <button class="nav-btn active" data-tab="tab-dashboard">📊 Dashboard</button>
```

- [ ] **Step 2: Add the brand CSS**

Find:

```css
    .nav-btn:hover  { color: var(--text); }
    .nav-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 700; }
```

Insert immediately **after** it:

```css

    /* ── Identité de l'app (titre + logo) ── */
    .app-brand { display: flex; align-items: center; gap: 8px; padding: 0 12px 0 4px; flex-shrink: 0; }
    .app-brand-logo { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; }
    .app-brand-title { font-weight: 800; font-size: 1rem; color: var(--accent); white-space: nowrap; letter-spacing: 0.2px; }
    @media (max-width: 640px) {
      .app-brand-title { font-size: 0.85rem; }
    }
```

- [ ] **Step 3: Add the settings pane (nav button + card)**

Find:

```html
      <button class="settings-nav-btn" data-stab="stab-tools">🔧 Outils</button>
    </div>
```

Replace with:

```html
      <button class="settings-nav-btn" data-stab="stab-tools">🔧 Outils</button>
      <button class="settings-nav-btn" data-stab="stab-identity">🎨 Identité</button>
    </div>
```

Find:

```html
      <button id="detectLotsBtn" class="primary small">🔍 Scanner l'historique</button>
      <div id="detectResults" class="detect-results"></div>
    </div>

  </div>

  <!-- ══ NOTES ═════════════════════════════════════════════════════════ -->
```

Replace with:

```html
      <button id="detectLotsBtn" class="primary small">🔍 Scanner l'historique</button>
      <div id="detectResults" class="detect-results"></div>
    </div>

    <!-- ─ Identité de l'app ─ -->
    <div id="stab-identity" class="settings-tab-pane card">
      <h2>🎨 Identité de l'app</h2>
      <div class="add-form">
        <p class="add-form-label">Nom de l'application</p>
        <input type="text" id="appSettingsTitle" placeholder="Tops des Tops">
        <p class="add-form-label">URL du logo (optionnel)</p>
        <input type="url" id="appSettingsLogo" placeholder="https://…">
        <button id="saveAppSettingsBtn" class="primary small">💾 Enregistrer</button>
      </div>
    </div>

  </div>

  <!-- ══ NOTES ═════════════════════════════════════════════════════════ -->
```

- [ ] **Step 4: Add `loadAppBranding` and form wiring**

Find:

```javascript
  // ── BANDEAU RÉSUMÉ RAPIDE ─────────────────────────────────────────────
```

Insert immediately **before** it:

```javascript
  // ── IDENTITÉ DE L'APP (titre + logo) ──────────────────────────────────
  let _appSettings = { appTitle: 'Tops des Tops', logoUrl: '' };

  function applyAppBranding() {
    document.title = _appSettings.appTitle;
    document.getElementById('appBrandTitle').textContent = _appSettings.appTitle;
    const logoImg = document.getElementById('appBrandLogo');
    if (_appSettings.logoUrl) {
      logoImg.src = _appSettings.logoUrl;
      logoImg.onerror = () => { logoImg.style.display = 'none'; };
      logoImg.style.display = '';
    } else {
      logoImg.style.display = 'none';
    }
  }

  function populateAppSettingsForm() {
    const titleInput = document.getElementById('appSettingsTitle');
    const logoInput  = document.getElementById('appSettingsLogo');
    if (titleInput) titleInput.value = _appSettings.appTitle;
    if (logoInput)  logoInput.value  = _appSettings.logoUrl;
  }

  function loadAppBranding() {
    callServer('apiGetAppSettings', [], res => {
      _appSettings = { appTitle: res.appTitle, logoUrl: res.logoUrl };
      applyAppBranding();
      populateAppSettingsForm();
    }, 'Chargement identité app');
  }

```

- [ ] **Step 5: Call `loadAppBranding` on startup**

Find:

```javascript
    loadEntities();
    applyFilters();
    loadQuickStats();
  };
```

Replace with:

```javascript
    loadEntities();
    applyFilters();
    loadQuickStats();
    loadAppBranding();
  };
```

- [ ] **Step 6: Wire the save button and the tab-switch refresh**

Find:

```javascript
    document.getElementById('addRowBtn').addEventListener('click', (e) => addEntryRow(undefined, e.currentTarget));
```

Insert immediately **after** it:

```javascript
    document.getElementById('saveAppSettingsBtn').addEventListener('click', (e) => {
      if (!requireIdentity()) return;
      const btn   = e.currentTarget;
      const title = document.getElementById('appSettingsTitle').value.trim();
      const logo  = document.getElementById('appSettingsLogo').value.trim();
      callServer('apiSaveAppSettings', [title, logo, _whoAmI || ''], () => {
        _appSettings = { appTitle: title || 'Tops des Tops', logoUrl: logo };
        applyAppBranding();
        flashSaved(btn);
        showToast('Identité de l\'app enregistrée.', 'success');
      }, 'Enregistrement identité app');
    });
```

Find:

```javascript
        if (target === 'stab-tools') loadDataHealth();
```

Replace with:

```javascript
        if (target === 'stab-tools') loadDataHealth();
        if (target === 'stab-identity') populateAppSettingsForm();
```

- [ ] **Step 7: Manual check**

Re-read the navbar HTML, the `stab-identity` pane HTML, and the four JS edits above. Confirm: `applyAppBranding`/`populateAppSettingsForm`/`loadAppBranding` are all defined before `window.onload` calls `loadAppBranding()`; the save button reads both inputs and calls `apiSaveAppSettings` with `_whoAmI`; an empty title falls back to `'Tops des Tops'` (matches the backend default, so the displayed title never goes blank).

- [ ] **Step 8: Mark step complete**

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `npm test`
Expected: PASS — all tests green, including the 5 from `tests/settings.test.js` and the 4 from `tests/quick-stats.test.js`.

- [ ] **Step 2: Syntax-check the backend**

Run: `node --check Code.gs`
Expected: no output (syntax OK)

- [ ] **Step 3: Re-read `Index.html` end to end around each touched region**

Confirm no duplicate IDs were introduced (`quickStatsBar`, `appBrand`, `stab-identity`, `saveAppSettingsBtn`, etc. — each must appear exactly once), and that every new `id` referenced in JS (`getElementById(...)`) has a matching element in the HTML added in Tasks 4–6.

- [ ] **Step 4: Tell the user manual verification is required**

GAS cannot run locally. Tell the user: "Backend tests pass and syntax is clean. To see this live, copy `Code.gs` and `Index.html` into the Apps Script project, deploy a new version, and check: the quick-stats bar under the navbar, the `+X pts` float when clicking '+ Ligne' or the duplicate-row button, and the new 🎨 Identité pane in Paramètres."

- [ ] **Step 5: Mark step complete**
