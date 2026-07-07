# Corrections rapides (Groupe A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six isolated, low-risk issues in the Top-des-Tops GAS app: batch-entry row drag blocking text selection, batch-recap number concatenation, cross-batch group-id collisions, missing single-entry ungroup, an overlapping floating barème button, and a silently-masked automation permission error.

**Architecture:** All six fixes are surgical, behavior-preserving edits inside the existing monolithic `Code.gs` / `Index.html` / `AutoPoints.gs` files (see `[[../../règles.md]]` GAS exception — no file splitting). No new files except `appsscript.json` (required for OAuth scope declaration, doesn't exist yet). Each task is independently testable and committable.

**Tech Stack:** Google Apps Script (`Code.gs`, `AutoPoints.gs`), vanilla JS/HTML/CSS (`Index.html`), Node `node:test` + VM harness (`tests/harness.js`) for backend logic.

---

## Task 1: Batch-entry row drag handle (text selection fix)

**Files:**
- Modify: `Index.html:6509-6530` (`addEntryRow`)
- Modify: `Index.html:6472-6507` (`attachRowDragEvents`)
- Modify: `Index.html` `<style>` block (add `.row-drag-handle` rule near `.entry-row` styles)

**Problem:** `div.draggable = true` is set on the whole `.entry-row`, so any click-drag inside an input is captured as a row-drag instead of a text selection.

- [ ] **Step 1: Add a drag-handle element in `addEntryRow`**

In `Index.html`, locate the block starting at line 6524 (`rowCounter++; ...`). Replace:

```javascript
    rowCounter++;
    const div = document.createElement('div');
    div.className = 'entry-row';
    div.id = 'row_' + rowCounter;
    div.dataset.insertOrder = String(rowCounter);
    div.draggable = true;
    attachRowDragEvents(div);
```

with:

```javascript
    rowCounter++;
    const div = document.createElement('div');
    div.className = 'entry-row';
    div.id = 'row_' + rowCounter;
    div.dataset.insertOrder = String(rowCounter);
    div.draggable = true;
    attachRowDragEvents(div);

    const dragHandle = document.createElement('span');
    dragHandle.className = 'row-drag-handle';
    dragHandle.title = 'Glisser pour réordonner';
    dragHandle.textContent = '⋮⋮';
    div.appendChild(dragHandle);
```

- [ ] **Step 2: Restrict native drag activation to the handle in `attachRowDragEvents`**

Replace the whole function (`Index.html:6472-6507`):

```javascript
  function attachRowDragEvents(row) {
    row.addEventListener('dragstart', (e) => {
      draggedRow = row;
      row.classList.add('row-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('row-dragging');
      document.querySelectorAll('.entry-row.row-drop-target').forEach(r => r.classList.remove('row-drop-target'));
      draggedRow = null;
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedRow || draggedRow === row) return;
      document.querySelectorAll('.entry-row.row-drop-target').forEach(r => r.classList.remove('row-drop-target'));
      row.classList.add('row-drop-target');
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('row-drop-target');
      if (!draggedRow || draggedRow === row) return;
      const container = document.getElementById('entryContainer');
      const rows = Array.from(container.querySelectorAll('.entry-row'));
      const draggedIndex = rows.indexOf(draggedRow);
      const targetIndex = rows.indexOf(row);
      if (draggedIndex < targetIndex) {
        row.after(draggedRow);
      } else {
        row.before(draggedRow);
      }
      clearActiveSortState();
    });
  }
```

with:

```javascript
  function attachRowDragEvents(row) {
    row.addEventListener('mousedown', (e) => {
      row.draggable = !!e.target.closest('.row-drag-handle');
    });

    row.addEventListener('dragstart', (e) => {
      if (!e.target.closest('.row-drag-handle')) { e.preventDefault(); return; }
      draggedRow = row;
      row.classList.add('row-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('row-dragging');
      row.draggable = false;
      document.querySelectorAll('.entry-row.row-drop-target').forEach(r => r.classList.remove('row-drop-target'));
      draggedRow = null;
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedRow || draggedRow === row) return;
      document.querySelectorAll('.entry-row.row-drop-target').forEach(r => r.classList.remove('row-drop-target'));
      row.classList.add('row-drop-target');
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('row-drop-target');
      if (!draggedRow || draggedRow === row) return;
      const container = document.getElementById('entryContainer');
      const rows = Array.from(container.querySelectorAll('.entry-row'));
      const draggedIndex = rows.indexOf(draggedRow);
      const targetIndex = rows.indexOf(row);
      if (draggedIndex < targetIndex) {
        row.after(draggedRow);
      } else {
        row.before(draggedRow);
      }
      clearActiveSortState();
    });
  }
```

- [ ] **Step 3: Add CSS for the handle**

In the `<style>` block, near the existing `.entry-row` rules, add:

```css
    .row-drag-handle {
      cursor: grab; padding: 0 8px; color: var(--text-muted);
      user-select: none; font-size: 0.9rem; line-height: 1;
      display: inline-flex; align-items: center;
    }
    .row-drag-handle:active { cursor: grabbing; }
```

- [ ] **Step 4: Manual verification**

Run: `node --check Code.gs` (sanity, unaffected) — this task only touches `Index.html`, which cannot be syntax-checked with Node. Instead, open the file in a browser preview (or paste into a local static HTML test) and confirm: clicking and dragging inside a row's text input selects text; dragging from the `⋮⋮` handle still reorders rows.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "fix: restrict batch-entry row drag to dedicated handle"
```

---

## Task 2: Batch recap number formatting

**Files:**
- Modify: `Index.html:7155-7156` (`submitBulk` — where `items` are built from the DOM)
- Test: manual (no backend logic involved; `openLotRecapModal` is a pure front-end renderer with no Node-testable counterpart)

**Problem:** `points`/`times` are pushed into `items` as raw DOM strings (`Index.html:7155-7156`). Only the "spread" branch later parses them with `parseInt` (line 7205) — the "repeat" branch and `openLotRecapModal` (`Index.html:4720-4721`) don't, so `perPlayer[e.player] = (perPlayer[e.player] || 0) + e.points` does string concatenation (`0 + "5" + "3"` → `"053"`) instead of addition. Fixing the type once at the point where `items` are built (root cause) fixes every downstream consumer (both bulk-plan branches and the recap modal) without touching them individually.

- [ ] **Step 1: Convert `points`/`times` to real numbers when building `items`, preserving the existing empty-value fallback**

In `submitBulk` (`Index.html:7133`), locate the `items.push({...})` block:

```javascript
      if (pSel && cSel && customPtsEl && dStart) {
        items.push({
          dateStart:   dStart.value || '',
          dateEnd:     (isRange && dEnd) ? dEnd.value : '',
          fill:        fillTg ? fillTg.dataset.fill : 'repeat',
          days:        (isRange && dayPickerWr) ? JSON.parse(dayPickerWr.dataset.days || '[]') : [],
          player:      pSel.value,
          category:    cSel.value,
          points:      customPtsEl.value || '1',
          times:       '1',
          description: descEl ? descEl.value.trim() : '',
          groupTag:    lotGroupMap.get(r.id) || ''
        });
      }
```

Replace with:

```javascript
      if (pSel && cSel && customPtsEl && dStart) {
        items.push({
          dateStart:   dStart.value || '',
          dateEnd:     (isRange && dEnd) ? dEnd.value : '',
          fill:        fillTg ? fillTg.dataset.fill : 'repeat',
          days:        (isRange && dayPickerWr) ? JSON.parse(dayPickerWr.dataset.days || '[]') : [],
          player:      pSel.value,
          category:    cSel.value,
          points:      parseInt(customPtsEl.value || '1', 10),
          times:       1,
          description: descEl ? descEl.value.trim() : '',
          groupTag:    lotGroupMap.get(r.id) || ''
        });
      }
```

Note: `parseInt(customPtsEl.value || '1', 10)` preserves the exact prior fallback behavior — an empty field still defaults to `1`; a literal `"0"` is kept (parsed to `0`) and still caught by the existing validation loop right after (`Index.html:7164-7167`, `if (isNaN(pts) || pts < 1)`), unchanged. Downstream, both the "repeat" branch (`Index.html:7195-7202`) and the "spread" branch (`Index.html:7203-7213`) already consume `it.points`/`it.times` — since they're now real numbers instead of strings, no further changes are needed in either branch or in `openLotRecapModal`.

- [ ] **Step 2: Manual verification**

In the browser, add 2+ rows in "Saisir un Lot" with distinct point values (e.g. 5 and 3), submit, and confirm the recap modal shows `"8 pts au total"` and per-player lines like `"Alik +5 pts"` — not concatenated digits. Also verify the existing validation still blocks submission with `"0"` typed into a points field.

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "fix: convert batch entry points to integers before aggregating recap"
```

---

## Task 3: Group-id collisions across separate batch submissions

**Files:**
- Modify: `Code.gs:277-300` (`StorageService.appendBulkPlan`)
- Test: `tests/storage.test.js` (extend existing `appendBulkPlan` tests)

**Problem:** Client-side group tags (`G1`, `G2`, ...) are generated from a counter that resets after every submit (`Index.html` `lotGroupSeq = 0` post-submit), so unrelated batches submitted separately can share the same tag and appear merged in the History view (which groups strictly by `groupId` equality).

**Fix:** In `appendBulkPlan`, map each distinct non-empty client-side tag appearing in *this call* to a freshly generated, collision-resistant id (reusing the existing `'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)` pattern already used in `apiGroupRows`/`apiGroupDistributedLots`), before writing rows. Rows with no tag keep an empty groupId (unchanged from current behavior).

- [ ] **Step 1: Write the failing test**

In `tests/storage.test.js`, add after the existing `appendBulkPlan` tests (after line 39, before the `'appendBulkPlan rejects points below 1'` test — or anywhere in the same describe scope):

```javascript
test('appendBulkPlan assigns the same real groupId to rows sharing a client tag, and different ids across two separate calls', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.appendBulkPlan([
    { date: '2026-02-01', entries: [
      { player: 'A', category: 'Jeux',  points: 5, times: 1, description: '', groupTag: 'G1' },
      { player: 'B', category: 'Jeux',  points: 3, times: 1, description: '', groupTag: 'G1' },
      { player: 'C', category: 'Jeux',  points: 2, times: 1, description: '', groupTag: 'G2' }
    ] }
  ]);
  gas.StorageService.appendBulkPlan([
    { date: '2026-02-02', entries: [
      { player: 'D', category: 'Jeux', points: 7, times: 1, description: '', groupTag: 'G1' }
    ] }
  ]);

  const g = history._grid;
  assert.strictEqual(g.length, 5); // header + 4 rows
  const idAG1 = g[1][5], idBG1 = g[2][5], idCG2 = g[3][5], idDG1second = g[4][5];

  assert.ok(idAG1, 'row A should have a non-empty groupId');
  assert.strictEqual(idAG1, idBG1, 'rows sharing client tag G1 in the same call get the same real id');
  assert.notStrictEqual(idAG1, idCG2, 'different client tags in the same call get different real ids');
  assert.notStrictEqual(idAG1, idDG1second, 'the same client tag "G1" used in a LATER, separate call must not collide with the earlier call\'s id');
});

test('appendBulkPlan leaves groupId empty when no groupTag is provided', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.StorageService.appendBulkPlan([
    { date: '2026-02-01', entries: [
      { player: 'A', category: 'Jeux', points: 5, times: 1, description: '' }
    ] }
  ]);

  assert.strictEqual(history._grid[1][5], '');
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- --test-name-pattern="appendBulkPlan"`
Expected: the first new test FAILs on `assert.strictEqual(idAG1, idBG1, ...)` or similar (current code writes the raw client tag `'G1'` verbatim, so rows would currently share `'G1'` literally — meaning that specific assertion might pass, but `assert.notStrictEqual(idAG1, idDG1second, ...)` FAILs because both calls independently produce the literal string `'G1'`, so they'd be equal). Confirm this specific assertion fails before proceeding.

- [ ] **Step 3: Implement the fix in `Code.gs`**

Replace `appendBulkPlan` (`Code.gs:277-300`):

```javascript
  appendBulkPlan(plan) {
    if (!plan || !plan.length) throw new Error("Aucune donnée à injecter.");

    const rows = [];
    const _now = new Date();
    plan.forEach(day => {
      if (!day.date || !day.date.trim()) throw new Error("Date manquante dans le plan.");
      const _parts = day.date.trim().split('-').map(Number);
      const targetDate = new Date(_parts[0], _parts[1] - 1, _parts[2], _now.getHours(), _now.getMinutes(), _now.getSeconds());
      if (isNaN(targetDate.getTime())) throw new Error("Date fournie incorrecte.");
      (day.entries || []).forEach(e => {
        if (!e.player || !e.category) throw new Error("Joueur ou catégorie manquant(e).");
        const pts = parseInt(e.points, 10);
        const tms = parseInt(e.times,  10);
        if (isNaN(pts) || pts < 1)  throw new Error("Les points doivent être ≥ 1.");
        if (isNaN(tms) || tms < 1)  throw new Error("Le multiplicateur doit être ≥ 1.");
        rows.push([targetDate, e.player, e.category, pts * tms, e.description || '', e.groupTag || '', e.saiseur || '']);
      });
    });
    if (!rows.length) throw new Error("Aucune donnée à injecter.");

    const { history } = ConfigService.getSheets();
    history.getRange(history.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  },
```

with:

```javascript
  appendBulkPlan(plan) {
    if (!plan || !plan.length) throw new Error("Aucune donnée à injecter.");

    const rows = [];
    const tagToRealId = {};
    const _now = new Date();
    plan.forEach(day => {
      if (!day.date || !day.date.trim()) throw new Error("Date manquante dans le plan.");
      const _parts = day.date.trim().split('-').map(Number);
      const targetDate = new Date(_parts[0], _parts[1] - 1, _parts[2], _now.getHours(), _now.getMinutes(), _now.getSeconds());
      if (isNaN(targetDate.getTime())) throw new Error("Date fournie incorrecte.");
      (day.entries || []).forEach(e => {
        if (!e.player || !e.category) throw new Error("Joueur ou catégorie manquant(e).");
        const pts = parseInt(e.points, 10);
        const tms = parseInt(e.times,  10);
        if (isNaN(pts) || pts < 1)  throw new Error("Les points doivent être ≥ 1.");
        if (isNaN(tms) || tms < 1)  throw new Error("Le multiplicateur doit être ≥ 1.");
        let realGroupId = '';
        if (e.groupTag) {
          if (!tagToRealId[e.groupTag]) {
            tagToRealId[e.groupTag] = 'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          }
          realGroupId = tagToRealId[e.groupTag];
        }
        rows.push([targetDate, e.player, e.category, pts * tms, e.description || '', realGroupId, e.saiseur || '']);
      });
    });
    if (!rows.length) throw new Error("Aucune donnée à injecter.");

    const { history } = ConfigService.getSheets();
    history.getRange(history.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="appendBulkPlan"`
Expected: PASS (all `appendBulkPlan` tests, including the two new ones and the three pre-existing ones).

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add Code.gs tests/storage.test.js
git commit -m "fix: generate collision-resistant group ids server-side in appendBulkPlan"
```

---

## Task 4: Dissociate a single entry from a group

**Files:**
- Modify: `Code.gs:1661-1679` (add `apiRemoveFromGroup` near `apiUngroupLot`)
- Modify: `Index.html:8082-8102` (`buildHistRow` — add per-row "unlink" action)
- Modify: `tests/harness.js:105-110` (export whitelist — `apiRemoveFromGroup` isn't in it yet, neither are `apiGroupRows`/`apiUngroupLot`/`apiDeleteGroup`, confirmed unused by any existing test)
- Test: `tests/storage.test.js`

**Problem:** `apiUngroupLot(groupId, author)` clears the groupId of every row sharing that id — there's no way to detach just one row from its group.

- [ ] **Step 0: Add `apiRemoveFromGroup` to the test harness export whitelist**

`loadGas()` in `tests/harness.js` only exposes a fixed whitelist of top-level functions/services via `this.__exports = {...}` (lines 105-110). `apiRemoveFromGroup` must be added there before it's reachable from a test. Locate:

```javascript
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
```

Replace with:

```javascript
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, apiRemoveFromGroup, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
```

- [ ] **Step 1: Write the failing test**

In `tests/storage.test.js`, add:

```javascript
test('apiRemoveFromGroup clears groupId for one row only, leaving siblings grouped', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-01'), 'A', 'Jeux', 5, '', 'G1'],
    [D('2026-01-01'), 'B', 'Jeux', 3, '', 'G1'],
    [D('2026-01-01'), 'C', 'Jeux', 2, '', 'G1']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiRemoveFromGroup(3, 'Tester');
  assert.strictEqual(res.success, true);

  const g = history._grid;
  assert.strictEqual(g[1][5], 'G1'); // row 2 (grid index 1) untouched
  assert.strictEqual(g[2][5], '');   // row 3 (grid index 2) detached
  assert.strictEqual(g[3][5], 'G1'); // row 4 (grid index 3) untouched
});

test('apiRemoveFromGroup throws when rowIndex is missing', () => {
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({ history: makeSheet([HEADER]) });
  const res = gas.apiRemoveFromGroup(null, 'Tester');
  assert.strictEqual(res.success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="apiRemoveFromGroup"`
Expected: FAIL with `gas.apiRemoveFromGroup is not a function`.

- [ ] **Step 3: Implement `apiRemoveFromGroup` in `Code.gs`**

Immediately after `apiUngroupLot` (`Code.gs:1661-1679`, right before `apiDeleteGroup` at line 1681), insert:

```javascript
function apiRemoveFromGroup(rowIndex, author) {
  try {
    if (!rowIndex) throw new Error("Index de ligne manquant.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      sheet.getRange(rowIndex, 6).setValue('');
      AuditService.log(author, 'Retrait du groupe', 'History', String(rowIndex), '', '');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="apiRemoveFromGroup"`
Expected: PASS.

- [ ] **Step 5: Add the front-end "unlink" action in `buildHistRow`**

Locate the action cell in `buildHistRow` (`Index.html:8082-8102`):

```javascript
    const actCell = tr.insertCell();
    actCell.className = 'hist-actions-cell';
    actCell.style.cssText = 'white-space:nowrap;';

    const fullEditBtn = document.createElement('button');
    fullEditBtn.className = 'small';
    fullEditBtn.textContent = '✏️';
    fullEditBtn.title = 'Modifier cette entrée (date, joueur, Top, points, description, saiseur)';
    fullEditBtn.style.marginRight = '4px';
    fullEditBtn.addEventListener('click', () => openFullEditHistoryModal(log));

    const delBtn = document.createElement('button');
    delBtn.className = 'small danger'; delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => {
      openConfirmModal('Supprimer cette entrée ?', () => {
        buzz();
        scheduleDeletion([log.rowIndex]);
      });
    });
    actCell.appendChild(fullEditBtn); actCell.appendChild(delBtn);
    return tr;
```

Replace with:

```javascript
    const actCell = tr.insertCell();
    actCell.className = 'hist-actions-cell';
    actCell.style.cssText = 'white-space:nowrap;';

    const fullEditBtn = document.createElement('button');
    fullEditBtn.className = 'small';
    fullEditBtn.textContent = '✏️';
    fullEditBtn.title = 'Modifier cette entrée (date, joueur, Top, points, description, saiseur)';
    fullEditBtn.style.marginRight = '4px';
    fullEditBtn.addEventListener('click', () => openFullEditHistoryModal(log));
    actCell.appendChild(fullEditBtn);

    if (log.groupId) {
      const unlinkBtn = document.createElement('button');
      unlinkBtn.className = 'small'; unlinkBtn.textContent = '➖';
      unlinkBtn.title = 'Retirer cette entrée du groupe';
      unlinkBtn.style.marginRight = '4px';
      unlinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!requireIdentity()) return;
        openConfirmModal('Retirer cette entrée du groupe ? Elle redeviendra indépendante.', () => {
          callServer('apiRemoveFromGroup', [log.rowIndex, _whoAmI || ''], res => {
            if (res.success) { showToast('Entrée retirée du groupe.', 'success'); loadHistoryPage(currentHistoryPage); }
            else showToast('Erreur lors du retrait.', 'error');
          }, 'Retrait du groupe');
        });
      });
      actCell.appendChild(unlinkBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'small danger'; delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => {
      openConfirmModal('Supprimer cette entrée ?', () => {
        buzz();
        scheduleDeletion([log.rowIndex]);
      });
    });
    actCell.appendChild(delBtn);
    return tr;
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Manual verification**

In the browser, expand a group in Historique, click "➖" on one member, confirm the modal, and verify that entry becomes standalone while the rest of the group stays intact (member count decreases by one, e.g. `×3` → `×2`).

- [ ] **Step 8: Commit**

```bash
git add Code.gs Index.html tests/storage.test.js
git commit -m "feat: allow removing a single entry from a group"
```

---

## Task 5: Move the barème button off the floating FAB into the header/drawer

**Files:**
- Modify: `Index.html:830-843` (remove `.bareme-fab` CSS, keep drawer/backdrop CSS)
- Modify: `Index.html:2183-2206` (header markup — add button to `.nav-refresh-wrap`)
- Modify: `Index.html:2208-2214` (mobile drawer markup — add button to `.drawer-settings`)
- Modify: `Index.html:2877-2880` (remove old floating button markup)
- Modify: `Index.html:9635` (existing click-binding — extend to the new button ids)

**Problem:** `.bareme-fab` is `position: fixed; bottom:20px; left:20px` with no reserved space, so it visually collides with toasts, mobile drawers, or the on-screen keyboard.

- [ ] **Step 1: Remove the floating button markup**

Delete these 4 lines (`Index.html:2877-2880`):

```html
<!-- ══ BARÈME FAB + DRAWER ═══════════════════════════════════════════ -->
<button class="bareme-fab" id="baremeBtn" aria-expanded="false" title="Barème des Tops (touche ?)">
  ⚖️ <span class="bareme-fab-label">Barème</span>
</button>
```

Keep the two lines that follow (`<div class="bareme-backdrop" ...>` and the `<aside class="bareme-drawer" ...>` block) — only the trigger button moves, not the drawer itself.

- [ ] **Step 2: Add the button to the desktop header**

In the header (`Index.html:2191-2194`), replace:

```html
    <div class="nav-refresh-wrap">
      <button class="nav-refresh-btn" id="globalRefreshBtn" title="Rafraîchir les données">🔄</button>
      <span class="refresh-badge" id="refreshBadge"></span>
    </div>
```

with:

```html
    <div class="nav-refresh-wrap">
      <button class="nav-refresh-btn" id="globalRefreshBtn" title="Rafraîchir les données">🔄</button>
      <span class="refresh-badge" id="refreshBadge"></span>
      <button class="nav-refresh-btn" id="baremeBtn" aria-expanded="false" title="Barème des Tops (touche ?)">⚖️</button>
    </div>
```

- [ ] **Step 3: Add a second trigger in the mobile drawer**

Replace (`Index.html:2211-2213`):

```html
  <div class="drawer-section drawer-settings">
    <button class="theme-toggle" id="drawerThemeToggle" aria-label="Basculer le thème">🌙</button>
  </div>
```

with:

```html
  <div class="drawer-section drawer-settings">
    <button class="theme-toggle" id="drawerThemeToggle" aria-label="Basculer le thème">🌙</button>
    <button class="theme-toggle" id="baremeBtnMobile" aria-label="Barème des Tops">⚖️</button>
  </div>
```

- [ ] **Step 4: Remove the old FAB CSS, keep drawer/backdrop CSS**

Delete these lines (`Index.html:829-843`):

```css
    /* ── BARÈME FAB ── */
    .bareme-fab {
      position: fixed; bottom: max(20px, env(safe-area-inset-bottom)); left: 20px;
      z-index: 1500; display: flex; align-items: center; gap: 7px;
      background: var(--card); color: var(--text);
      border: 1px solid var(--border); border-radius: 24px;
      padding: 10px 16px; font-size: 0.88rem; font-weight: 600;
      cursor: pointer; user-select: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
      min-height: var(--tap-min);
    }
    .bareme-fab:hover  { background: var(--btn-alt); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.5); }
    .bareme-fab:active { transform: translateY(0); }
    .bareme-fab[aria-expanded="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
```

Also remove the now-orphaned mobile-only rule at line 867 (`.bareme-fab .bareme-fab-label { display: none; }`) — search for it and delete that single line.

- [ ] **Step 5: Wire the new mobile button to the same open/close logic**

Locate the existing binding (`Index.html:9635-9637`):

```javascript
  document.getElementById('baremeBtn').addEventListener('click', () => {
    document.getElementById('baremeDrawer').classList.contains('open') ? closeBareme() : openBareme();
  });
```

Replace with:

```javascript
  const openCloseBareme = () => {
    document.getElementById('baremeDrawer').classList.contains('open') ? closeBareme() : openBareme();
  };
  document.getElementById('baremeBtn').addEventListener('click', openCloseBareme);
  document.getElementById('baremeBtnMobile').addEventListener('click', () => { closeDrawer(); openCloseBareme(); });
```

- [ ] **Step 6: Manual verification**

Reload the app in a browser. Confirm: the ⚖️ button appears next to the refresh icon in the header (desktop) and inside the mobile drawer next to the theme toggle (resize to <640px or use the mobile toggle button). Confirm clicking either opens/closes the barème drawer as before, and no element overlaps a toast notification or the mobile drawer edge.

- [ ] **Step 7: Commit**

```bash
git add Index.html
git commit -m "fix: move barème trigger from floating FAB into header/drawer to avoid overlaps"
```

---

## Task 6: Automation trigger permission (OAuth scope + surfaced error)

**Files:**
- Create: `appsscript.json`
- Modify: `AutoPoints.gs:290-297` (`apiGetAutoRules`)
- Modify: `tests/harness.js` (`loadGas` currently only reads and runs `Code.gs` — `AutoPoints.gs` is never loaded into the sandbox at all, so `AutoPointsService`/`apiGetAutoRules` don't exist on any `gas` object returned by `loadGas()` today)
- Test: new file `tests/autopoints.test.js`

**Problem:** No `appsscript.json` manifest exists, so the `script.scriptapp` OAuth scope needed for `ScriptApp.getProjectTriggers()`/`newTrigger()` is never declared. `apiGetAutoRules` also swallows the resulting error silently, showing "not installed" instead of the real permission error.

- [ ] **Step 1: Load `AutoPoints.gs` into the same VM sandbox as `Code.gs`**

`AutoPoints.gs` references `ConfigService`/`AuditService`/`fail`/`withLock`, all defined in `Code.gs`, purely at call-time (inside closures), so running both files' source in the same `vm` context works as long as `Code.gs` runs first. In `tests/harness.js`, replace (`loadGas` function, lines 101-113):

```javascript
function loadGas(extraMocks) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const sandbox = Object.assign(gasMocks(), extraMocks || {});
  vm.createContext(sandbox);
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, apiRemoveFromGroup, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
  vm.runInContext(code + epilogue, sandbox, { filename: 'Code.gs' });
  return sandbox.__exports;
}
```

with:

```javascript
function loadGas(extraMocks) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const autoPointsCode = fs.readFileSync(path.join(__dirname, '..', 'AutoPoints.gs'), 'utf8');
  const sandbox = Object.assign(gasMocks(), extraMocks || {});
  vm.createContext(sandbox);
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, apiRemoveFromGroup, ' +
    'AutoPointsService, apiGetAutoRules, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
  vm.runInContext(code + '\n' + autoPointsCode + epilogue, sandbox, { filename: 'Code.gs+AutoPoints.gs' });
  return sandbox.__exports;
}
```

- [ ] **Step 2: Run the full suite to confirm loading `AutoPoints.gs` doesn't break anything**

Run: `npm test`
Expected: all existing tests still PASS (this step only adds source to the sandbox and two names to the export whitelist — no behavior change yet).

- [ ] **Step 3: Create the manifest**

Create `appsscript.json` at the project root:

```json
{
  "timeZone": "Europe/Paris",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
```

- [ ] **Step 4: Surface the real error instead of masking it**

In `AutoPoints.gs`, replace (`AutoPoints.gs:290-297`):

```javascript
function apiGetAutoRules() {
  try {
    const rules = AutoPointsService.getRules();
    let triggerInstalled = false;
    try { triggerInstalled = AutoPointsService.isTriggerInstalled(); } catch (_) {}
    return { success: true, rules, triggerInstalled };
  } catch (e) { return fail(e); }
}
```

with:

```javascript
function apiGetAutoRules() {
  try {
    const rules = AutoPointsService.getRules();
    let triggerInstalled = false;
    let triggerError = '';
    try {
      triggerInstalled = AutoPointsService.isTriggerInstalled();
    } catch (triggerErr) {
      triggerError = triggerErr && triggerErr.message ? triggerErr.message : String(triggerErr);
    }
    return { success: true, rules, triggerInstalled, triggerError };
  } catch (e) { return fail(e); }
}
```

- [ ] **Step 5: Write the failing test**

Create `tests/autopoints.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness');

test('apiGetAutoRules surfaces the trigger permission error instead of masking it', () => {
  const gas = loadGas();
  gas.AutoPointsService.getRules = () => [];
  gas.AutoPointsService.isTriggerInstalled = () => {
    throw new Error('Vous n\'êtes pas autorisé à appeler ScriptApp.getProjectTriggers.');
  };

  const res = gas.apiGetAutoRules();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.triggerInstalled, false);
  assert.match(res.triggerError, /ScriptApp\.getProjectTriggers/);
});

test('apiGetAutoRules reports triggerInstalled=true with no error when authorized', () => {
  const gas = loadGas();
  gas.AutoPointsService.getRules = () => [];
  gas.AutoPointsService.isTriggerInstalled = () => true;

  const res = gas.apiGetAutoRules();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.triggerInstalled, true);
  assert.strictEqual(res.triggerError, '');
});
```

- [ ] **Step 6: Run the test**

Run: `npm test -- --test-name-pattern="apiGetAutoRules"`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 8: Update the front-end to show the real error (optional but included — small, same task)**

Search for where `triggerInstalled` is read in `Index.html` (likely in the Automatisations tab render function):

```bash
grep -n "triggerInstalled" Index.html
```

In that rendering code, where it currently shows a static "non installé" state, add a conditional: if `res.triggerError` is non-empty, display it via `showToast(res.triggerError, 'error')` (or inline in the automation panel) instead of silently showing "not installed" with no explanation.

- [ ] **Step 9: Commit**

```bash
git add appsscript.json AutoPoints.gs tests/
git commit -m "fix: declare script.scriptapp OAuth scope and surface trigger permission errors"
```

**Deployment note (not automatable):** After deploying this change, the user must re-authorize the script in the Apps Script editor (a new permission prompt will appear for "See, edit, create, and delete your Google Apps Script projects' triggers") before automation rules can be installed.

---

## Self-Review Notes

- **Spec coverage:** All 6 spec items (§1–§6) have a corresponding task (Task 1–6). Confirmed 1:1.
- **Type consistency:** `apiRemoveFromGroup(rowIndex, author)` in Task 4 matches the call signature used in the front-end (`callServer('apiRemoveFromGroup', [log.rowIndex, _whoAmI || ''], ...)`). `log.groupId` (read in Task 4 Step 5) matches the field already populated by `_parseHistoryRow` (`Code.gs:265`).
- **No placeholders:** every step has literal code, no "TBD"/"handle appropriately".
- **Not a git repo:** the working directory has no `.git` yet (confirmed at session start). The `git add`/`git commit` steps in this plan assume the user has since initialized one, or that this plan runs in an environment where it is. If not, skip the commit steps and rely on the file edits alone — flag this to the user before running Task 1.
