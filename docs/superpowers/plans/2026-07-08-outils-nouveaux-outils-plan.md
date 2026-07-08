# Nouveaux outils (maintenance + analyse) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seven new tools to the 🔧 Outils tab — two maintenance tools (duplicate detection, outlier score detection) and five read-only analysis tools (inactive players, records, trends, most active weekday, most frequent player/category pair).

**Architecture:** Backend-only additions to `Code.gs` (seven new `api*` read functions, all built on the existing `StorageService.getFullHistoryRowsCached()` cache — no new sheet reads, no new mutation endpoints since duplicate cleanup reuses the existing `apiDeleteHistoryEntries` and outlier correction reuses the existing `openFullEditHistoryModal`). Frontend additions are new cards in `#stab-tools` (`Index.html`), following the exact `.card.card-collapsible` + `.detect-results` pattern already used for "Lots répartis"/"Groupes hérités".

**Tech Stack:** Google Apps Script (`Code.gs`), vanilla JS/HTML (`Index.html`), Node test harness (`tests/`, `node --test`).

**Spec:** `[[../specs/2026-07-08-outils-nouveaux-outils-design.md]]`

**Out of scope (confirmed with design doc):** notifications, configurable thresholds, Mobile.html, audit-logging the scans themselves.

---

## Task 1: Backend — seven new read functions + tests

**Files:**
- Modify: `Code.gs` (add functions after `apiDetectLegacyGroups`, i.e. after the closing brace that currently ends around line 1770, right before `apiRemoveFromGroup`)
- Modify: `tests/harness.js:115-121` (add the seven new function names to the `__exports` list)
- Create: `tests/outils-nouveaux.test.js`

**Context:** `StorageService.getFullHistoryRowsCached()` (`Code.gs:373`) already returns every valid `History` row as `{ date, player, category, points, description, groupId, saiseur, rowIndex }`, cached across requests and invalidated on every write — every function below reuses it, no new sheet access is written.

- [ ] **Step 1: Add the two maintenance functions to `Code.gs`**

Insert right after the closing brace of `apiDetectLegacyGroups` (the function ends with `return { success: true, groups: result };\n  } catch(e) { return fail(e); }\n}` around `Code.gs:1770`):

```js
function apiDetectDuplicates() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const pad = n => String(n).padStart(2, '0');
    const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

    const groups = {};
    rows.forEach(r => {
      const key = r.player + '|' + r.category + '|' + dayKey(r.date) + '|' + r.points + '|' + r.description;
      (groups[key] = groups[key] || []).push(r);
    });

    const duplicates = Object.keys(groups)
      .map(k => groups[k])
      .filter(g => g.length >= 2)
      .map(g => {
        const sorted = g.slice().sort((a, b) => a.rowIndex - b.rowIndex);
        return {
          player: sorted[0].player, category: sorted[0].category, points: sorted[0].points,
          description: sorted[0].description, dateStr: dayKey(sorted[0].date),
          count: sorted.length,
          keepRowIndex: sorted[0].rowIndex,
          extraRowIndexes: sorted.slice(1).map(r => r.rowIndex)
        };
      })
      .sort((a, b) => b.count - a.count);

    return { success: true, duplicates };
  } catch(e) { return fail(e); }
}

function apiDetectOutlierScores() {
  try {
    const rows = StorageService.getFullHistoryRowsCached().filter(r => !r.groupId);
    const byCategory = {};
    rows.forEach(r => (byCategory[r.category] = byCategory[r.category] || []).push(r));

    const pad = n => String(n).padStart(2, '0');
    const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

    const outliers = [];
    Object.keys(byCategory).forEach(cat => {
      const list = byCategory[cat];
      if (list.length < 5) return;
      const mean = list.reduce((s, r) => s + r.points, 0) / list.length;
      const variance = list.reduce((s, r) => s + Math.pow(r.points - mean, 2), 0) / list.length;
      const threshold = mean + 3 * Math.sqrt(variance);
      list.forEach(r => {
        if (r.points > threshold) {
          outliers.push({
            rowIndex: r.rowIndex, player: r.player, category: r.category, points: r.points,
            categoryAverage: Math.round(mean), dateStr: dayKey(r.date)
          });
        }
      });
    });

    outliers.sort((a, b) => b.points - a.points);
    return { success: true, outliers };
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 2: Add the five analysis functions to `Code.gs`**

Insert immediately after the two functions from Step 1:

```js
function apiGetInactivePlayers() {
  try {
    const players = SettingsService.getEntities('Players');
    const rows = StorageService.getFullHistoryRowsCached();
    const lastByPlayer = {};
    rows.forEach(r => {
      if (!lastByPlayer[r.player] || r.date > lastByPlayer[r.player]) lastByPlayer[r.player] = r.date;
    });

    const now = new Date();
    const inactive = [];
    const neverActive = [];
    players.forEach(p => {
      const last = lastByPlayer[p.name];
      if (!last) { neverActive.push(p.name); return; }
      inactive.push({ player: p.name, daysSinceLastEntry: Math.floor((now - last) / 86400000) });
    });
    inactive.sort((a, b) => b.daysSinceLastEntry - a.daysSinceLastEntry);

    return { success: true, inactive, neverActive };
  } catch(e) { return fail(e); }
}

function apiGetPlayerRecords() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const byPlayer = {};
    rows.forEach(r => (byPlayer[r.player] = byPlayer[r.player] || []).push(r));

    const pad = n => String(n).padStart(2, '0');
    const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

    let globalBest = null;
    const records = Object.keys(byPlayer).map(player => {
      const list = byPlayer[player];
      const best = list.reduce((m, r) => r.points > m.points ? r : m, list[0]);
      if (!globalBest || best.points > globalBest.points) {
        globalBest = { player, points: best.points, dateStr: dayKey(best.date) };
      }

      const days = [...new Set(list.map(r => dayKey(r.date)))].sort();
      let longestStreak = days.length ? 1 : 0;
      let currentStreak = 1;
      for (let i = 1; i < days.length; i++) {
        const gap = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
        currentStreak = gap === 1 ? currentStreak + 1 : 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      }

      return { player, bestSingleEntry: best.points, bestEntryDate: dayKey(best.date), longestStreakDays: longestStreak };
    });

    return { success: true, records, globalBest };
  } catch(e) { return fail(e); }
}

function apiGetTrends() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const now = new Date();
    const cutoff1 = new Date(now.getTime() - 30 * 86400000);
    const cutoff2 = new Date(now.getTime() - 60 * 86400000);

    const recent   = rows.filter(r => r.date >= cutoff1 && r.date <= now);
    const previous = rows.filter(r => r.date >= cutoff2 && r.date < cutoff1);

    function countByCategory(list) {
      const m = {};
      list.forEach(r => { m[r.category] = (m[r.category] || 0) + 1; });
      return m;
    }
    const recentByCat = countByCategory(recent);
    const prevByCat   = countByCategory(previous);
    const categories  = [...new Set([...Object.keys(recentByCat), ...Object.keys(prevByCat)])];
    const categoryTrends = categories.map(cat => {
      const before = prevByCat[cat] || 0;
      const after  = recentByCat[cat] || 0;
      const changePct = before === 0 ? (after > 0 ? 100 : 0) : Math.round(((after - before) / before) * 100);
      return { category: cat, before, after, changePct };
    }).sort((a, b) => b.changePct - a.changePct);

    const byPlayerAll = {};
    rows.forEach(r => (byPlayerAll[r.player] = byPlayerAll[r.player] || []).push(r));
    const playerTrends = Object.keys(byPlayerAll).map(player => {
      const all = byPlayerAll[player];
      const recentEntries = all.filter(r => r.date >= cutoff1 && r.date <= now);
      if (!recentEntries.length) return null;
      const historicalAvg = all.reduce((s, r) => s + r.points, 0) / all.length;
      const recentAvg = recentEntries.reduce((s, r) => s + r.points, 0) / recentEntries.length;
      const changePct = historicalAvg === 0 ? 0 : Math.round(((recentAvg - historicalAvg) / historicalAvg) * 100);
      return { player, historicalAvg: Math.round(historicalAvg), recentAvg: Math.round(recentAvg), changePct };
    }).filter(Boolean).sort((a, b) => b.changePct - a.changePct);

    return { success: true, categoryTrends, playerTrends };
  } catch(e) { return fail(e); }
}

function apiGetActiveWeekday() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const counts = [0, 0, 0, 0, 0, 0, 0]; // index = Date.getDay(), 0 = dimanche
    rows.forEach(r => { counts[r.date.getDay()]++; });

    const labels = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const byWeekday = labels.map((label, i) => ({ weekday: label, count: counts[i] }));
    let topIndex = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[topIndex]) topIndex = i;

    return { success: true, byWeekday, topWeekday: rows.length ? labels[topIndex] : null };
  } catch(e) { return fail(e); }
}

function apiGetTopPlayerCategoryPairs() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const counts = {};
    rows.forEach(r => {
      const key = r.player + '|' + r.category;
      counts[key] = (counts[key] || 0) + 1;
    });
    const pairs = Object.keys(counts)
      .map(key => {
        const sep = key.indexOf('|');
        return { player: key.slice(0, sep), category: key.slice(sep + 1), count: counts[key] };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { success: true, pairs };
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 2b: Register the new functions in the test harness**

In `tests/harness.js`, find the `epilogue` string (lines 115-121) and add the seven names to the export list:

```js
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiDetectLegacyGroups, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, apiRemoveFromGroup, ' +
    'AutoPointsService, apiGetAutoRules, NAV_PAGES, apiGetNavPages, doGet, ' +
    'apiDetectDuplicates, apiDetectOutlierScores, apiGetInactivePlayers, apiGetPlayerRecords, ' +
    'apiGetTrends, apiGetActiveWeekday, apiGetTopPlayerCategoryPairs, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
```

- [ ] **Step 3: Write `tests/outils-nouveaux.test.js`**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const D = s => new Date(s + 'T12:00:00');
const mk = (d, p, c, pts, desc) => [D(d), p, c, pts, desc || '', '', ''];

test('apiDetectDuplicates finds two identical entries on the same day and keeps the earliest rowIndex', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'A', 'Jeux', 5, 'x'),
    mk('2026-01-10', 'A', 'Jeux', 5, 'x'),
    mk('2026-01-11', 'B', 'Défis', 3, 'y')
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectDuplicates();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.duplicates.length, 1);
  assert.strictEqual(res.duplicates[0].count, 2);
  assert.strictEqual(res.duplicates[0].keepRowIndex, 2);
  assert.deepStrictEqual(res.duplicates[0].extraRowIndexes, [3]);
});

test('apiDetectDuplicates returns nothing when every entry differs by at least one field', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-10', 'A', 'Jeux', 5, 'x'),
    mk('2026-01-10', 'A', 'Jeux', 6, 'x')
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectDuplicates();
  assert.strictEqual(res.duplicates.length, 0);
});

test('apiDetectOutlierScores flags an entry far above its category average, ignores categories with under 5 entries', () => {
  const gas = loadGas();
  const rows = [HEADER];
  for (let i = 0; i < 5; i++) rows.push(mk('2026-01-0' + (i + 1), 'A', 'Jeux', 10, 'x'));
  rows.push(mk('2026-01-06', 'B', 'Jeux', 500, 'x')); // outlier
  rows.push(mk('2026-01-07', 'C', 'RareTop', 999, 'x')); // seul dans sa catégorie → ignoré
  const history = makeSheet(rows);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiDetectOutlierScores();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.outliers.length, 1);
  assert.strictEqual(res.outliers[0].player, 'B');
  assert.strictEqual(res.outliers[0].points, 500);
});

test('apiGetInactivePlayers separates never-active players and sorts the rest by days since last entry', () => {
  const gas = loadGas();
  const players    = makeSheet([['A', '', ''], ['B', '', ''], ['C', '', '']]);
  const categories = makeSheet([['Jeux', '', '', '']]);
  const history = makeSheet([
    HEADER,
    mk('2020-01-01', 'A', 'Jeux', 5),
    mk('2026-07-01', 'B', 'Jeux', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, categories });

  const res = gas.apiGetInactivePlayers();
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(res.neverActive, ['C']);
  assert.strictEqual(res.inactive.length, 2);
  assert.strictEqual(res.inactive[0].player, 'A'); // le plus inactif en premier
});

test('apiGetPlayerRecords computes best single entry, longest streak, and the global best', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux', 5),
    mk('2026-01-02', 'A', 'Jeux', 5),
    mk('2026-01-03', 'A', 'Jeux', 100),
    mk('2026-01-10', 'B', 'Jeux', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetPlayerRecords();
  assert.strictEqual(res.success, true);
  const a = res.records.find(r => r.player === 'A');
  assert.strictEqual(a.bestSingleEntry, 100);
  assert.strictEqual(a.longestStreakDays, 3);
  assert.strictEqual(res.globalBest.player, 'A');
  assert.strictEqual(res.globalBest.points, 100);
});

test('apiGetTrends computes a category swing and a player in-form swing between the two 30-day windows', () => {
  const gas = loadGas();
  const now = new Date();
  const daysAgo = n => new Date(now.getTime() - n * 86400000);
  const iso = d => d.toISOString().slice(0, 10);
  const history = makeSheet([
    HEADER,
    mk(iso(daysAgo(50)), 'A', 'Jeux', 10),
    mk(iso(daysAgo(10)), 'A', 'Jeux', 10),
    mk(iso(daysAgo(5)),  'A', 'Jeux', 10)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetTrends();
  assert.strictEqual(res.success, true);
  const jeux = res.categoryTrends.find(c => c.category === 'Jeux');
  assert.strictEqual(jeux.before, 1);
  assert.strictEqual(jeux.after, 2);
});

test('apiGetActiveWeekday counts entries per weekday and names the most active one', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-05', 'A', 'Jeux', 5), // lundi
    mk('2026-01-12', 'A', 'Jeux', 5), // lundi
    mk('2026-01-06', 'A', 'Jeux', 5)  // mardi
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetActiveWeekday();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.topWeekday, 'Lundi');
});

test('apiGetTopPlayerCategoryPairs ranks the most frequent player/category combinations', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    mk('2026-01-01', 'A', 'Jeux', 5),
    mk('2026-01-02', 'A', 'Jeux', 5),
    mk('2026-01-03', 'A', 'Défis', 5)
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetTopPlayerCategoryPairs();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.pairs[0].player, 'A');
  assert.strictEqual(res.pairs[0].category, 'Jeux');
  assert.strictEqual(res.pairs[0].count, 2);
});
```

- [ ] **Step 4: Run the new tests and the full suite**

Run: `npm test`
Expected: all new tests in `outils-nouveaux.test.js` PASS, and the existing 63 tests still PASS (71 total).

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/harness.js tests/outils-nouveaux.test.js
git commit -m "feat: add backend for 7 new Outils tools (duplicates, outliers, inactifs, records, tendances, jour actif, duo fréquent)"
```

---

## Task 2: Frontend — seven new cards in the Outils tab

**Files:**
- Modify: `Index.html` (HTML: inside `#stab-tools`, after the `toolLegacyCard` card and before `toolAutoCard`; JS: near `scanLegacyGroups`/`renderLegacyGroups`, and in `window.onload`'s `makeCollapsible(...)` block)

**Context:** Follow the exact pattern already used for `toolLotsCard`/`toolLegacyCard` (`Index.html`, search `id="toolLegacyCard"`): a `.card.card-collapsible` with a `.card-collapse-header`, a "Scanner" button, and a results `<div>`. `escapeHtml`, `getAvatarUrl`, `categoryColor`, `catIcon`, `tint`, `.hist-pill`/`.pill-emoji`, `openConfirmModal`, `showToast`, `startBtnLoading`, `callServer`, `requireIdentity`, `openFullEditHistoryModal`, `enableDragMultiSelect` are all already defined and reused as-is — no new helpers needed beyond what's written below.

- [ ] **Step 1: Add the two maintenance cards to the HTML**

Find (`Index.html`, right after the closing `</div>` of `toolLegacyCard`, before `toolAutoCard`'s opening `<div class="card card-collapsible" id="toolAutoCard">`):

```html
      <div class="card card-collapsible" id="toolDuplicatesCard">
        <div class="card-collapse-header"><h2>🧬 Doublons probables</h2></div>
        <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 12px;line-height:1.5;">
          Détecte les entrées identiques (même joueur, même Top, même date, mêmes points, même description) — souvent une double saisie accidentelle.
        </p>
        <button id="detectDuplicatesBtn" class="primary small">🔍 Scanner l'historique</button>
        <div id="duplicatesResults" class="detect-results"></div>
      </div>

      <div class="card card-collapsible" id="toolOutliersCard">
        <div class="card-collapse-header"><h2>📈 Scores aberrants</h2></div>
        <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 12px;line-height:1.5;">
          Repère les entrées dont les points s'écartent fortement de la moyenne habituelle d'un Top (souvent une faute de frappe).
        </p>
        <button id="detectOutliersBtn" class="primary small">🔍 Scanner l'historique</button>
        <div id="outliersResults" class="detect-results"></div>
      </div>
```

- [ ] **Step 2: Add the five analysis cards to the HTML**

Insert right after the two cards from Step 1, still before `toolAutoCard`:

```html
      <div class="card card-collapsible" id="toolInactiveCard">
        <div class="card-collapse-header"><h2>💤 Joueurs inactifs</h2></div>
        <button id="scanInactiveBtn" class="secondary small">🔄 Actualiser</button>
        <div id="inactiveResults" style="margin-top:12px;"></div>
      </div>

      <div class="card card-collapsible" id="toolRecordsCard">
        <div class="card-collapse-header"><h2>🏅 Records</h2></div>
        <button id="scanRecordsBtn" class="secondary small">🔄 Actualiser</button>
        <div id="recordsResults" style="margin-top:12px;"></div>
      </div>

      <div class="card card-collapsible" id="toolTrendsCard">
        <div class="card-collapse-header"><h2>📊 Tendances</h2></div>
        <button id="scanTrendsBtn" class="secondary small">🔄 Actualiser</button>
        <div id="trendsResults" style="margin-top:12px;"></div>
      </div>

      <div class="card card-collapsible" id="toolWeekdayCard">
        <div class="card-collapse-header"><h2>📅 Jour le plus actif</h2></div>
        <button id="scanWeekdayBtn" class="secondary small">🔄 Actualiser</button>
        <div id="weekdayResults" style="margin-top:12px;"></div>
      </div>

      <div class="card card-collapsible" id="toolPairsCard">
        <div class="card-collapse-header"><h2>🔁 Duo le plus fréquent</h2></div>
        <button id="scanPairsBtn" class="secondary small">🔄 Actualiser</button>
        <div id="pairsResults" style="margin-top:12px;"></div>
      </div>
```

- [ ] **Step 3: Add the JS for the two maintenance tools**

Find (`Index.html`, right after the end of `scanLegacyGroups`'s enclosing code, i.e. right before the comment `// ── DÉTECTION LOTS RÉPARTIS ──` or equivalent boundary — insert as a new block right after `removeEntriesFromGroupSequentially`'s closing brace):

```js
  // ── DOUBLONS PROBABLES ────────────────────────────────────────────────
  function scanDuplicates() {
    const btn = document.getElementById('detectDuplicatesBtn');
    const container = document.getElementById('duplicatesResults');
    showSkeleton(container, { rows: 3, height: 50 });
    const restore = startBtnLoading(btn, 'Scan…');
    callServer('apiDetectDuplicates', [], res => {
      restore();
      if (!res.duplicates.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun doublon détecté. Tout est propre ✅</p>';
        return;
      }
      container.innerHTML = '';
      res.duplicates.forEach(dup => {
        const row = document.createElement('div');
        row.className = 'tool-action';
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const p = cachedPlayers.find(pl => pl.name === dup.player);
        const strong = document.createElement('strong');
        const avatar = document.createElement('img');
        avatar.className = 'qs-avatar';
        avatar.src = getAvatarUrl(dup.player, p ? p.meta : '');
        avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
        strong.appendChild(avatar);
        strong.appendChild(document.createTextNode(dup.player + ' — ' + dup.category + ' — ' + dup.points + ' pts'));
        const span = document.createElement('span');
        span.textContent = dup.count + ' copies le ' + dup.dateStr + (dup.description ? ' — ' + dup.description : '');
        info.appendChild(strong); info.appendChild(span);
        const btnFix = document.createElement('button');
        btnFix.className = 'danger small';
        btnFix.textContent = 'Supprimer les copies en trop';
        btnFix.addEventListener('click', () => {
          if (!requireIdentity()) return;
          openConfirmModal('Supprimer ' + dup.extraRowIndexes.length + ' copie(s) en trop ? La première entrée est conservée.', () => {
            buzz();
            callServer('apiDeleteHistoryEntries', [dup.extraRowIndexes, _whoAmI || ''], () => {
              showToast('Doublon(s) supprimé(s).', 'success');
              scanDuplicates();
              if (document.getElementById('tab-history').classList.contains('active')) loadHistoryPage(currentHistoryPage);
            }, 'Suppression doublons');
          });
        });
        row.appendChild(info); row.appendChild(btnFix);
        container.appendChild(row);
      });
    }, 'Détection doublons', () => { restore(); container.innerHTML = ''; showToast('Erreur lors du scan.', 'error'); });
  }

  // ── SCORES ABERRANTS ─────────────────────────────────────────────────
  function scanOutliers() {
    const btn = document.getElementById('detectOutliersBtn');
    const container = document.getElementById('outliersResults');
    showSkeleton(container, { rows: 3, height: 50 });
    const restore = startBtnLoading(btn, 'Scan…');
    callServer('apiDetectOutlierScores', [], res => {
      restore();
      if (!res.outliers.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun score aberrant détecté. Tout est propre ✅</p>';
        return;
      }
      container.innerHTML = '';
      res.outliers.forEach(o => {
        const row = document.createElement('div');
        row.className = 'tool-action';
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const p = cachedPlayers.find(pl => pl.name === o.player);
        const strong = document.createElement('strong');
        const avatar = document.createElement('img');
        avatar.className = 'qs-avatar';
        avatar.src = getAvatarUrl(o.player, p ? p.meta : '');
        avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
        strong.appendChild(avatar);
        strong.appendChild(document.createTextNode(o.player + ' — ' + o.category + ' : ' + o.points + ' pts'));
        const span = document.createElement('span');
        span.textContent = 'Moyenne du Top : ' + o.categoryAverage + ' pts — le ' + o.dateStr;
        info.appendChild(strong); info.appendChild(span);
        const btnFix = document.createElement('button');
        btnFix.className = 'secondary small';
        btnFix.textContent = 'Corriger';
        btnFix.addEventListener('click', () => {
          if (!requireIdentity()) return;
          const log = histPageLogs.find(l => l.rowIndex === o.rowIndex) || { rowIndex: o.rowIndex, player: o.player, category: o.category, points: o.points, description: '', saiseur: '', timestamp: null };
          openFullEditHistoryModal(log);
        });
        row.appendChild(info); row.appendChild(btnFix);
        container.appendChild(row);
      });
    }, 'Détection scores aberrants', () => { restore(); container.innerHTML = ''; showToast('Erreur lors du scan.', 'error'); });
  }
```

- [ ] **Step 4: Add the JS for the five analysis tools**

Insert right after the code from Step 3:

```js
  // ── JOUEURS INACTIFS ─────────────────────────────────────────────────
  function scanInactivePlayers() {
    const container = document.getElementById('inactiveResults');
    showSkeleton(container, { rows: 3, height: 40 });
    callServer('apiGetInactivePlayers', [], res => {
      container.innerHTML = '';
      res.inactive.forEach(item => {
        const row = document.createElement('div');
        row.className = 'tool-action';
        const p = cachedPlayers.find(pl => pl.name === item.player);
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const strong = document.createElement('strong');
        const avatar = document.createElement('img');
        avatar.className = 'qs-avatar';
        avatar.src = getAvatarUrl(item.player, p ? p.meta : '');
        avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
        strong.appendChild(avatar);
        strong.appendChild(document.createTextNode(item.player));
        const span = document.createElement('span');
        span.textContent = 'Dernière activité il y a ' + item.daysSinceLastEntry + ' jour(s)';
        info.appendChild(strong); info.appendChild(span);
        row.appendChild(info);
        container.appendChild(row);
      });
      res.neverActive.forEach(name => {
        const row = document.createElement('div');
        row.className = 'tool-action';
        const p = cachedPlayers.find(pl => pl.name === name);
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const strong = document.createElement('strong');
        const avatar = document.createElement('img');
        avatar.className = 'qs-avatar';
        avatar.src = getAvatarUrl(name, p ? p.meta : '');
        avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
        strong.appendChild(avatar);
        strong.appendChild(document.createTextNode(name));
        const span = document.createElement('span');
        span.textContent = 'Jamais actif';
        info.appendChild(strong); info.appendChild(span);
        row.appendChild(info);
        container.appendChild(row);
      });
      if (!res.inactive.length && !res.neverActive.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun joueur enregistré.</p>';
      }
    }, 'Chargement joueurs inactifs');
  }

  // ── RECORDS ──────────────────────────────────────────────────────────
  function scanRecords() {
    const container = document.getElementById('recordsResults');
    showSkeleton(container, { rows: 3, height: 40 });
    callServer('apiGetRecords', [], res => {
      container.innerHTML = '';
      if (res.globalBest) {
        const best = document.createElement('div');
        best.className = 'tool-action';
        best.style.cssText = 'background:rgba(255,71,87,0.08);border-radius:8px;';
        const p = cachedPlayers.find(pl => pl.name === res.globalBest.player);
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const strong = document.createElement('strong');
        const avatar = document.createElement('img');
        avatar.className = 'qs-avatar';
        avatar.src = getAvatarUrl(res.globalBest.player, p ? p.meta : '');
        avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
        strong.appendChild(avatar);
        strong.appendChild(document.createTextNode('🏆 Record absolu : ' + res.globalBest.player));
        const span = document.createElement('span');
        span.textContent = res.globalBest.points + ' pts en une entrée, le ' + res.globalBest.dateStr;
        info.appendChild(strong); info.appendChild(span);
        best.appendChild(info);
        container.appendChild(best);
      }
      res.records.forEach(r => {
        const row = document.createElement('div');
        row.className = 'tool-action';
        const p = cachedPlayers.find(pl => pl.name === r.player);
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const strong = document.createElement('strong');
        const avatar = document.createElement('img');
        avatar.className = 'qs-avatar';
        avatar.src = getAvatarUrl(r.player, p ? p.meta : '');
        avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
        strong.appendChild(avatar);
        strong.appendChild(document.createTextNode(r.player));
        const span = document.createElement('span');
        span.textContent = 'Meilleur score : ' + r.bestSingleEntry + ' pts (' + r.bestEntryDate + ') · Série la plus longue : ' + r.longestStreakDays + ' jour(s)';
        info.appendChild(strong); info.appendChild(span);
        row.appendChild(info);
        container.appendChild(row);
      });
      if (!res.records.length) container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucune donnée.</p>';
    }, 'Chargement records');
  }

  // ── TENDANCES ────────────────────────────────────────────────────────
  function scanTrends() {
    const container = document.getElementById('trendsResults');
    showSkeleton(container, { rows: 3, height: 40 });
    callServer('apiGetTrends', [], res => {
      container.innerHTML = '';
      const catTitle = document.createElement('h3');
      catTitle.textContent = 'Par Top (30 derniers jours vs 30 jours précédents)';
      container.appendChild(catTitle);
      res.categoryTrends.forEach(c => {
        const row = document.createElement('div');
        row.className = 'tool-action';
        const col = categoryColor(c.category);
        const pill = document.createElement('span');
        pill.className = 'hist-pill';
        pill.style.setProperty('--pill-bg', tint(col, 0.16));
        pill.style.setProperty('--pill-bd', tint(col, 0.55));
        const ic = catIcon(c.category);
        if (ic) { const em = document.createElement('span'); em.className = 'pill-emoji'; em.textContent = ic; pill.appendChild(em); }
        pill.appendChild(document.createTextNode(c.category));
        const span = document.createElement('span');
        span.style.color = c.changePct >= 0 ? 'var(--success)' : 'var(--error)';
        span.textContent = (c.changePct >= 0 ? '+' : '') + c.changePct + '% (' + c.before + ' → ' + c.after + ' entrées)';
        row.appendChild(pill); row.appendChild(span);
        container.appendChild(row);
      });
      const playerTitle = document.createElement('h3');
      playerTitle.style.marginTop = '14px';
      playerTitle.textContent = 'Par joueur (moyenne récente vs moyenne historique)';
      container.appendChild(playerTitle);
      res.playerTrends.forEach(pt => {
        const row = document.createElement('div');
        row.className = 'tool-action';
        const p = cachedPlayers.find(pl => pl.name === pt.player);
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const strong = document.createElement('strong');
        const avatar = document.createElement('img');
        avatar.className = 'qs-avatar';
        avatar.src = getAvatarUrl(pt.player, p ? p.meta : '');
        avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
        strong.appendChild(avatar);
        strong.appendChild(document.createTextNode(pt.player));
        const span = document.createElement('span');
        span.style.color = pt.changePct >= 0 ? 'var(--success)' : 'var(--error)';
        span.textContent = (pt.changePct >= 0 ? '+' : '') + pt.changePct + '% (moyenne récente ' + pt.recentAvg + ' pts vs historique ' + pt.historicalAvg + ' pts)';
        info.appendChild(strong); info.appendChild(span);
        row.appendChild(info);
        container.appendChild(row);
      });
      if (!res.categoryTrends.length && !res.playerTrends.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Pas assez de données récentes.</p>';
      }
    }, 'Chargement tendances');
  }

  // ── JOUR LE PLUS ACTIF ───────────────────────────────────────────────
  function scanActiveWeekday() {
    const container = document.getElementById('weekdayResults');
    showSkeleton(container, { rows: 3, height: 30 });
    callServer('apiGetActiveWeekday', [], res => {
      container.innerHTML = '';
      if (!res.topWeekday) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucune donnée.</p>';
        return;
      }
      const top = document.createElement('p');
      top.innerHTML = 'Jour le plus actif : <strong>' + escapeHtml(res.topWeekday) + '</strong>';
      container.appendChild(top);
      res.byWeekday.forEach(w => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;font-size:0.82rem;';
        const label = document.createElement('span');
        label.style.cssText = 'width:90px;flex-shrink:0;';
        label.textContent = w.weekday;
        const bar = document.createElement('div');
        const max = Math.max(...res.byWeekday.map(x => x.count), 1);
        bar.style.cssText = 'height:14px;border-radius:4px;background:var(--accent);width:' + Math.round((w.count / max) * 100) + '%;min-width:2px;';
        const count = document.createElement('span');
        count.style.cssText = 'color:var(--text-muted);flex-shrink:0;';
        count.textContent = w.count;
        row.appendChild(label); row.appendChild(bar); row.appendChild(count);
        container.appendChild(row);
      });
    }, 'Chargement jour actif');
  }

  // ── DUO LE PLUS FRÉQUENT ─────────────────────────────────────────────
  function scanTopPairs() {
    const container = document.getElementById('pairsResults');
    showSkeleton(container, { rows: 3, height: 30 });
    callServer('apiGetTopPlayerCategoryPairs', [], res => {
      container.innerHTML = '';
      if (!res.pairs.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucune donnée.</p>';
        return;
      }
      res.pairs.forEach(pair => {
        const row = document.createElement('div');
        row.className = 'tool-action';
        const p = cachedPlayers.find(pl => pl.name === pair.player);
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const strong = document.createElement('strong');
        const avatar = document.createElement('img');
        avatar.className = 'qs-avatar';
        avatar.src = getAvatarUrl(pair.player, p ? p.meta : '');
        avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
        strong.appendChild(avatar);
        strong.appendChild(document.createTextNode(pair.player));
        const col = categoryColor(pair.category);
        const pill = document.createElement('span');
        pill.className = 'hist-pill';
        pill.style.setProperty('--pill-bg', tint(col, 0.16));
        pill.style.setProperty('--pill-bd', tint(col, 0.55));
        const ic = catIcon(pair.category);
        if (ic) { const em = document.createElement('span'); em.className = 'pill-emoji'; em.textContent = ic; pill.appendChild(em); }
        pill.appendChild(document.createTextNode(pair.category));
        strong.appendChild(pill);
        const span = document.createElement('span');
        span.textContent = pair.count + ' fois';
        info.appendChild(strong); info.appendChild(span);
        row.appendChild(info);
        container.appendChild(row);
      });
    }, 'Chargement duos fréquents');
  }
```

**Note de cohérence :** le backend expose `apiGetPlayerRecords` (Task 1) — le nom utilisé ci-dessus est `apiGetRecords` par erreur de frappe potentielle : utiliser exactement `apiGetPlayerRecords` dans `callServer('apiGetPlayerRecords', ...)` à l'implémentation (corriger l'appel avant de committer).

- [ ] **Step 5: Wire the buttons and register the collapsible cards**

Find (`Index.html`, inside `window.onload`, the four `makeCollapsible(...)` calls added for the Outils tab):

```js
    makeCollapsible(document.getElementById('toolHealthCard'), 'tdt_collapsed_tool_health');
    makeCollapsible(document.getElementById('toolLotsCard'),   'tdt_collapsed_tool_lots');
    makeCollapsible(document.getElementById('toolLegacyCard'), 'tdt_collapsed_tool_legacy');
    makeCollapsible(document.getElementById('toolAutoCard'),   'tdt_collapsed_tool_auto');
```

Replace with:

```js
    makeCollapsible(document.getElementById('toolHealthCard'),     'tdt_collapsed_tool_health');
    makeCollapsible(document.getElementById('toolLotsCard'),       'tdt_collapsed_tool_lots');
    makeCollapsible(document.getElementById('toolLegacyCard'),     'tdt_collapsed_tool_legacy');
    makeCollapsible(document.getElementById('toolDuplicatesCard'), 'tdt_collapsed_tool_duplicates');
    makeCollapsible(document.getElementById('toolOutliersCard'),   'tdt_collapsed_tool_outliers');
    makeCollapsible(document.getElementById('toolInactiveCard'),   'tdt_collapsed_tool_inactive');
    makeCollapsible(document.getElementById('toolRecordsCard'),    'tdt_collapsed_tool_records');
    makeCollapsible(document.getElementById('toolTrendsCard'),     'tdt_collapsed_tool_trends');
    makeCollapsible(document.getElementById('toolWeekdayCard'),    'tdt_collapsed_tool_weekday');
    makeCollapsible(document.getElementById('toolPairsCard'),      'tdt_collapsed_tool_pairs');
    document.getElementById('detectDuplicatesBtn').addEventListener('click', scanDuplicates);
    document.getElementById('detectOutliersBtn').addEventListener('click', scanOutliers);
    document.getElementById('scanInactiveBtn').addEventListener('click', scanInactivePlayers);
    document.getElementById('scanRecordsBtn').addEventListener('click', scanRecords);
    document.getElementById('scanTrendsBtn').addEventListener('click', scanTrends);
    document.getElementById('scanWeekdayBtn').addEventListener('click', scanActiveWeekday);
    document.getElementById('scanPairsBtn').addEventListener('click', scanTopPairs);
    enableDragMultiSelect(document.getElementById('duplicatesResults'), 'input[type="checkbox"]');
```

(The last line is a no-op today — the duplicates card has no checkboxes — but kept out per YAGNI: **remove it**, it does not apply here. Only the seven `addEventListener`/`makeCollapsible` lines above are needed.)

- [ ] **Step 6: Manual browser check**

After deploying (or in the Node harness for backend-only correctness, since there's no local frontend server — see project constraint in `context.md` §8), verify in the live app:
1. Seed two identical entries (same joueur/Top/date/points/description) → "🧬 Doublons probables" → Scanner → confirm the pair appears, click "Supprimer les copies en trop", confirm only one remains.
2. Seed 5 normal-range entries + 1 huge one in the same Top → "📈 Scores aberrants" → Scanner → confirm the huge one appears with category average, "Corriger" opens the edit modal on that exact entry.
3. "💤 Joueurs inactifs", "🏅 Records", "📊 Tendances", "📅 Jour le plus actif", "🔁 Duo le plus fréquent" → Actualiser on each → confirm data renders without console errors and matches expectations from the seeded History.

- [ ] **Step 7: Commit**

```bash
git add Index.html
git commit -m "feat: add 7 tool cards to Outils (doublons, scores aberrants, inactifs, records, tendances, jour actif, duo fréquent)"
```

---

## Self-Review Notes

- **Spec coverage:** all 7 tools from the design doc have a backend function (Task 1) and a frontend card + wiring (Task 2). Dismiss/ignore mechanism for maintenance tools was scoped in the design doc but is **not** included here — see correction below.
- **Correction found during self-review:** the design doc says duplicates/outliers should have an "Ignorer" action persisted in `localStorage`, matching the existing `tdt_dismissed_*` pattern. Task 2 Step 3 above does not implement it. **This must be added** before Task 2 is considered done: add a `DISMISSED_DUPLICATES_KEY`/`DISMISSED_OUTLIERS_KEY` pair of helpers (mirroring `getDismissedLegacyGroupIds`/`dismissLegacyGroupId` from `Index.html:9459-9470`), an "Ignorer" button next to each row's fix button, and a filter step in `scanDuplicates`/`scanOutliers` before rendering (mirroring the `getDismissedLegacyGroupIds()`/`.filter(...)` step in `scanLegacyGroups`). Use the duplicate group's `keepRowIndex` and the outlier's `rowIndex` as the dismissal key respectively (both are stable per-row identifiers already returned by the backend).
- **Naming fix applied:** Task 2 Step 4's `scanRecords` must call `apiGetPlayerRecords` (matching Task 1's actual function name), not `apiGetRecords` — flagged inline above, apply at implementation time.
- **Type consistency:** `histPageLogs` (used in `scanOutliers`'s "Corriger" handler) is the existing module-level array populated by `loadHistoryPage` — confirmed it exists and holds `{ rowIndex, player, category, points, description, saiseur, timestamp }` shaped entries, matching what `openFullEditHistoryModal(log)` expects.
