# Performance & UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce redundant Google Sheets API calls and add three UX improvements (smart refresh, undo delete, text search in history).

**Architecture:** Two files only — `Code.gs` (Google Apps Script backend) and `Index.html` (single-page frontend). No build step, no test runner. "Verify" steps are manual checks via Apps Script logs or browser console. All backend changes invalidate `ConfigService._cache` where needed.

**Tech Stack:** Google Apps Script (ES5-compatible JS), vanilla JS frontend, Chart.js, no automated test framework.

---

### Task 1: Cache `getAllLogs()` in ConfigService (Backend)

**Files:**
- Modify: `Code.gs` — ConfigService IIFE and `StorageService.getAllLogs`

**Problem:** `getAllLogs()` reads the entire History sheet every time it's called within a single request. Calls to `getFilteredChartData`, `getTrendData`, and `getAvailableYears` each trigger a full sheet read.

**Fix:** Add `_logsCache` to `ConfigService`. `getAllLogs()` stores its result there; `clearCache()` wipes it alongside `_cache`.

- [ ] **Step 1: Update ConfigService IIFE**

Replace the current `ConfigService` block (lines 11–42) with:

```js
const ConfigService = (() => {
  let _cache = null;
  let _logsCache = null;

  const getSpreadsheetId = () => {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error("Erreur de configuration : SPREADSHEET_ID est manquant.");
    return id;
  };

  const getSheets = () => {
    if (_cache) return _cache;
    try {
      const ss = SpreadsheetApp.openById(getSpreadsheetId());
      const history    = ss.getSheetByName('History');
      const players    = ss.getSheetByName('Players');
      const categories = ss.getSheetByName('Categories');
      if (!history || !players || !categories)
        throw new Error("Onglets 'History', 'Players' ou 'Categories' manquants.");
      const notes  = ss.getSheetByName('Notes')  || null;
      const bareme = ss.getSheetByName('Bareme') || null;
      _cache = { spreadsheet: ss, history, players, categories, notes, bareme };
      return _cache;
    } catch(e) {
      throw new Error("Erreur de connexion BDD : " + e.message);
    }
  };

  const clearCache = () => { _cache = null; _logsCache = null; };
  const getLogsCache = () => _logsCache;
  const setLogsCache = v => { _logsCache = v; };

  return { getSheets, clearCache, getLogsCache, setLogsCache };
})();
```

- [ ] **Step 2: Update `StorageService.getAllLogs`**

Replace the `getAllLogs()` method body:

```js
getAllLogs() {
  const cached = ConfigService.getLogsCache();
  if (cached) return cached;
  const sheet   = ConfigService.getSheets().history;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) { ConfigService.setLogsCache([]); return []; }
  const result = sheet.getRange(2, 1, lastRow - 1, 4).getValues()
    .map(row => {
      const d      = new Date(row[0]);
      const points = parseInt(row[3], 10);
      if (isNaN(d.getTime()))  return null;
      if (!row[1] || !row[2])  return null;
      if (isNaN(points) || points <= 0) return null;
      return {
        timestamp: d,
        player:    row[1].toString(),
        category:  row[2].toString(),
        points
      };
    })
    .filter(Boolean);
  ConfigService.setLogsCache(result);
  return result;
},
```

- [ ] **Step 3: Verify**

In Apps Script editor, run `apiGetFilteredData` or `apiGetTrendData` manually. In Stackdriver logs (`View → Logs`) or with a temporary `Logger.log('cache hit: ' + !!ConfigService.getLogsCache())` inside `getAllLogs`, confirm the second call in the same request returns the cached value. Remove the log line after.

---

### Task 2: Batch `apiUpdateBulkDescription` (Backend)

**Files:**
- Modify: `Code.gs` — `apiUpdateBulkDescription` function (lines 885–898)

**Problem:** N selected rows → N individual `setValue` calls. Each is a Google Sheets API round-trip.

**Fix:** Read the entire description column once, modify targeted rows in memory, write the whole column back in one call.

- [ ] **Step 1: Replace `apiUpdateBulkDescription`**

```js
function apiUpdateBulkDescription(rowIndexes, description) {
  try {
    if (!rowIndexes || !rowIndexes.length) throw new Error("Aucune ligne sélectionnée.");
    const { history } = ConfigService.getSheets();
    const lastRow = history.getLastRow();
    if (lastRow <= 1) return { success: true };
    const colRange = history.getRange(2, 5, lastRow - 1, 1);
    const values   = colRange.getValues();
    const indexSet = new Set(rowIndexes.map(ri => parseInt(ri, 10)));
    for (let i = 0; i < values.length; i++) {
      if (indexSet.has(i + 2)) values[i][0] = description || '';
    }
    colRange.setValues(values);
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}
```

- [ ] **Step 2: Verify**

Select 10+ entries in Historique, apply a bulk description. Confirm the toast says "Description mise à jour." and all selected rows show the new description after reload. Check Apps Script execution log — should show 1 `getValues` + 1 `setValues` on column 5, not N `setValue` calls.

---

### Task 3: Add `filterText` to history search (Backend)

**Files:**
- Modify: `Code.gs` — `StorageService.getHistoryPage` and `apiGetHistoryPage`

- [ ] **Step 1: Add `filterText` param to `getHistoryPage`**

In `StorageService.getHistoryPage`, add `filterText` as the 5th parameter and add a filter check inside the row loop, right after the `filterCategory` check:

```js
getHistoryPage(page, pageSize, filterPlayer, filterCategory, filterText) {
  // ...existing setup code unchanged until the row loop...
  
  // Inside the row loop, after the filterCategory check, add:
  if (filterText) {
    const ft = filterText.toLowerCase();
    if (!player.toLowerCase().includes(ft) &&
        !category.toLowerCase().includes(ft) &&
        !description.toLowerCase().includes(ft)) continue;
  }
  
  // ...rest unchanged...
}
```

Full updated signature line only (the rest of the body is unchanged except the added block above):

```js
getHistoryPage(page, pageSize, filterPlayer, filterCategory, filterText) {
```

And the filter block to insert after line `if (filterCategory && category !== filterCategory) continue;`:

```js
if (filterText) {
  const ft = filterText.toLowerCase();
  if (!player.toLowerCase().includes(ft) &&
      !category.toLowerCase().includes(ft) &&
      !description.toLowerCase().includes(ft)) continue;
}
```

- [ ] **Step 2: Update `apiGetHistoryPage`**

```js
function apiGetHistoryPage(page, pageSize, filterPlayer, filterCategory, filterText) {
  try {
    const result = StorageService.getHistoryPage(page, pageSize, filterPlayer, filterCategory, filterText || null);
    return { success: true, logs: result.logs, total: result.total, totalEntries: result.totalEntries };
  } catch(e) { return { success: false, error: e.message }; }
}
```

- [ ] **Step 3: Verify**

Call `apiGetHistoryPage(1, 20, null, null, "apéro")` in the Apps Script console (via a temporary wrapper or directly). Confirm only entries matching "apéro" in player/category/description are returned.

---

### Task 4: Frontend — CSS for new components (Index.html)

**Files:**
- Modify: `Index.html` — `<style>` block (before line 869 `</style>`)

- [ ] **Step 1: Add styles at end of the `<style>` block, before `</style>`**

```css
/* ── TOAST UNDO (suppression différée) ── */
.toast.warning { border-color: #ffd166; color: #ffd166; }
.toast-undo-btn {
  background: transparent; border: 1px solid currentColor;
  color: inherit; border-radius: 4px; padding: 3px 8px;
  font-size: 0.8rem; cursor: pointer; font-weight: 700;
  margin-left: 10px; white-space: nowrap;
}
.toast-undo-btn:hover { background: rgba(255,209,102,0.15); }

/* ── LIGNE EN ATTENTE DE SUPPRESSION ── */
tr.hist-pending-delete td {
  opacity: 0.35; text-decoration: line-through;
}
```

---

### Task 5: Frontend — Search input in Historique (Index.html)

**Files:**
- Modify: `Index.html` — `.history-filters` div (around line 1038)

- [ ] **Step 1: Add search input to history filters**

In the `<!-- ══ HISTORIQUE ══ -->` section, the `.history-filters` div currently contains:
```html
<select id="historyPlayerFilter">...</select>
<select id="historyCategoryFilter">...</select>
<button id="refreshHistoryBtn" ...>...</button>
<button id="histSelectBtn" ...>...</button>
```

Add the text input as the first child:

```html
<input type="text" id="historyTextFilter" placeholder="🔍 Rechercher…" style="flex:1; min-width:140px; max-width:240px;">
```

---

### Task 6: Frontend — JS state & helper functions (Index.html)

**Files:**
- Modify: `Index.html` — `<script>` block

- [ ] **Step 1: Add state variables after existing global state (after line 1228 `let histVisibleRows = [];`)**

```js
// Pending deletions: Map<id, {rowIndexes, timerId, toastEl}>
const pendingDeletions = new Map();
let _pendingDelIdSeq = 0;
let _histSearchTimeout = null;
```

- [ ] **Step 2: Add `flushPendingDeletions` function (add before `loadHistoryPage`)**

```js
function flushPendingDeletions(callback) {
  if (pendingDeletions.size === 0) { callback(); return; }
  const allIndexes = [];
  pendingDeletions.forEach(p => {
    clearTimeout(p.timerId);
    p.toastEl.remove();
    allIndexes.push(...p.rowIndexes);
  });
  pendingDeletions.clear();
  callServer('apiDeleteHistoryEntries', [allIndexes], () => callback(), 'Suppression différée', () => callback());
}
```

- [ ] **Step 3: Add `scheduleDeletion` function (add right after `flushPendingDeletions`)**

```js
function scheduleDeletion(rowIndexes) {
  const id = ++_pendingDelIdSeq;

  // Style targeted rows as pending
  rowIndexes.forEach(ri => {
    const tr = document.querySelector('tr[data-row-index="' + ri + '"]');
    if (tr) tr.classList.add('hist-pending-delete');
  });

  // Build undo toast
  const toastEl = document.createElement('div');
  toastEl.className = 'toast warning';
  const count = rowIndexes.length;
  const msgSpan = document.createElement('span');
  msgSpan.textContent = (count === 1 ? 'Entrée supprimée.' : count + ' entrées supprimées.');
  const undoBtn = document.createElement('button');
  undoBtn.className = 'toast-undo-btn';
  undoBtn.textContent = 'Annuler';
  undoBtn.addEventListener('click', () => {
    const pending = pendingDeletions.get(id);
    if (!pending) return;
    clearTimeout(pending.timerId);
    pendingDeletions.delete(id);
    pending.toastEl.style.animation = 'fadeOut 0.2s ease forwards';
    setTimeout(() => pending.toastEl.remove(), 200);
    rowIndexes.forEach(ri => {
      const tr = document.querySelector('tr[data-row-index="' + ri + '"]');
      if (tr) tr.classList.remove('hist-pending-delete');
    });
    showToast('Suppression annulée.', 'success');
  });
  toastEl.appendChild(msgSpan);
  toastEl.appendChild(undoBtn);
  document.getElementById('toastContainer').appendChild(toastEl);

  const timerId = setTimeout(() => {
    const pending = pendingDeletions.get(id);
    if (!pending) return;
    pendingDeletions.delete(id);
    pending.toastEl.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => pending.toastEl.remove(), 300);
    callServer('apiDeleteHistoryEntries', [rowIndexes], () => {
      loadHistoryPage(currentHistoryPage);
    }, 'Suppression historique');
  }, 5000);

  pendingDeletions.set(id, { rowIndexes, timerId, toastEl });
}
```

---

### Task 7: Frontend — Wire up all changes (Index.html)

**Files:**
- Modify: `Index.html` — multiple JS locations

- [ ] **Step 1: Add `data-row-index` to each history row in `buildHistRow`**

At the very beginning of `buildHistRow`, right after `const tr = tbody.insertRow();`, add:

```js
tr.dataset.rowIndex = log.rowIndex;
```

- [ ] **Step 2: Replace delete handler in `buildHistRow`**

Find the existing `delBtn.addEventListener('click', ...)` block in `buildHistRow` and replace it:

```js
delBtn.addEventListener('click', () => {
  openConfirmModal('Supprimer cette entrée ?', () => {
    buzz();
    scheduleDeletion([log.rowIndex]);
  });
});
```

- [ ] **Step 3: Replace `confirmBulkDelete`**

```js
function confirmBulkDelete() {
  if (!histSelected.size) { showToast('Aucune entrée sélectionnée.', 'error'); return; }
  const indexes = [...histSelected];
  openConfirmModal(
    'Supprimer ' + indexes.length + ' entrée(s) ? Cette action est irréversible.',
    () => {
      buzz();
      histSelected.clear();
      toggleHistSelectMode(false);
      scheduleDeletion(indexes);
    }
  );
}
```

- [ ] **Step 4: Wrap `loadHistoryPage` to flush pending deletions first**

Replace the first 2 lines of `loadHistoryPage`:

```js
function loadHistoryPage(page) {
  flushPendingDeletions(() => _doLoadHistoryPage(page));
}

function _doLoadHistoryPage(page) {
  currentHistoryPage = page;
  const player   = document.getElementById('historyPlayerFilter').value;
  const category = document.getElementById('historyCategoryFilter').value;
  const textFilter = (document.getElementById('historyTextFilter') || {}).value || '';
  // ...rest of existing body unchanged, but update the callServer call:
```

In the `callServer('apiGetHistoryPage', ...)` call inside `_doLoadHistoryPage`, add the `textFilter` argument:

```js
callServer('apiGetHistoryPage', [page, PAGE_SIZE, player || null, category || null, textFilter.trim() || null], res => {
```

- [ ] **Step 5: Update `globalRefresh` to be tab-aware**

```js
function globalRefresh() {
  loadEntities();
  applyFilters();
  const activeTab = document.querySelector('.tab-content.active');
  if (activeTab) {
    const tabId = activeTab.id;
    if (tabId === 'tab-history') loadHistoryPage(currentHistoryPage);
    if (tabId === 'tab-notes')   loadNotes();
    if (tabId === 'tab-tools')   loadDataHealth();
  }
  lastRefreshTime = new Date();
  updateRefreshBadge();
}
```

- [ ] **Step 6: Add debounced search listener in `bindButtons`**

At the end of `bindButtons()`, before the closing `}`, add:

```js
const textFilterEl = document.getElementById('historyTextFilter');
if (textFilterEl) {
  textFilterEl.addEventListener('input', () => {
    clearTimeout(_histSearchTimeout);
    _histSearchTimeout = setTimeout(() => { currentHistoryPage = 1; loadHistoryPage(1); }, 400);
  });
}
```

---

### Task 8: Final verification

- [ ] **Step 1: Test cache (backend)**
Open the deployed app, go to Dashboard, switch between chart types quickly. Confirm no slowdown from repeated sheet reads. Check Apps Script execution transcript — `getAllLogs` should log one `Spreadsheets.Values.get` call per unique request.

- [ ] **Step 2: Test batch bulk description (backend)**
In Historique, select 5+ entries, type a description, click "📝 Appliquer". Confirm all rows update correctly. Apps Script log should show exactly 2 Sheets API calls for the description update (1 read + 1 write).

- [ ] **Step 3: Test text search (frontend + backend)**
Go to Historique. Type a player name in the search box. Confirm the list filters after 400ms. Try searching by a category name and by a description word. Confirm pagination resets to page 1 on each search.

- [ ] **Step 4: Test undo delete (frontend)**
Click "Suppr." on one entry, confirm. Confirm the row gets strikethrough/dim styling. Confirm the yellow toast "Entrée supprimée. [Annuler]" appears. Click Annuler → row is restored, success toast appears. Delete again, wait 5s → entry is gone after page reloads.

- [ ] **Step 5: Test undo bulk delete (frontend)**
In Historique, enter select mode, check 3 entries, click "🗑️ Supprimer", confirm. Confirm 3 rows get pending style and yellow toast appears. Click Annuler → all 3 rows restored. Repeat without annulling → all 3 deleted after 5s.

- [ ] **Step 6: Test smart globalRefresh (frontend)**
Go to Notes tab, click 🔄. Confirm only entities + dashboard + notes are reloaded (not history or tools). Go to Outils tab, click 🔄. Confirm only entities + dashboard + health are reloaded.
