# Groupes hérités + refonte outil de lots répartis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Groupes hérités à vérifier" tool in Paramètres → Outils to detect and let the user dissociate History groups created by the old (buggy) client-side group-id counter, and bring the existing "Regrouper les lots répartis" tool up to the app's UX rules (avatars, category pills, dismissible results).

**Architecture:** One new backend function (`apiDetectLegacyGroups`) reads the already-cached `StorageService.getFullHistoryRowsCached()` rows, filters `groupId` values matching the legacy short-id format `/^G\d{1,6}$/`, and returns them grouped with distinct-player/category counts. The frontend adds a new collapsible-list section (mirrors the existing "Regrouper les lots répartis" UI pattern) that lets the user select and dissociate groups via the existing `apiUngroupLot` endpoint. The existing distributed-lots tool gets avatar/pill rendering and a client-only "ignore" list persisted in `localStorage`.

**Tech Stack:** Google Apps Script (`Code.gs`), vanilla JS/HTML (`Index.html`), Node `node:test` harness (`tests/`).

**Spec:** `[[../specs/2026-07-08-groupes-herites-et-outil-lots-design.md]]`

**Out of scope (confirmed with design doc):** `Mobile.html`'s reduced Outils tab, detection-logic changes to the existing distributed-lots algorithm, pagination.

---

## Task 1: Backend — `apiDetectLegacyGroups()`

**Files:**
- Modify: `Code.gs` (insert after `apiDetectDistributedLots`, i.e. right before `function apiGroupDistributedLots(lotsToGroup, author) {` at line 1698)
- Test: `tests/cache.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/cache.test.js` (reuses the `HEADER`/`D`/`countingHistory` helpers already defined at the top of the file — `HEADER` there is `['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId']`):

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cache.test.js`
Expected: FAIL — `gas.apiDetectLegacyGroups is not a function`

- [ ] **Step 3: Implement `apiDetectLegacyGroups()` in `Code.gs`**

Insert this new function directly above `function apiGroupDistributedLots(lotsToGroup, author) {` (currently line 1698), i.e. right after the closing `}` of `apiDetectDistributedLots` (line 1696):

```js
function apiDetectLegacyGroups() {
  try {
    const LEGACY_GID_RE = /^G\d{1,6}$/;
    const pad = function(n) { return String(n).padStart(2, '0'); };

    const rows = StorageService.getFullHistoryRowsCached();
    const groups = {};
    rows.forEach(function(r) {
      if (!r.groupId || !LEGACY_GID_RE.test(r.groupId)) return;
      (groups[r.groupId] = groups[r.groupId] || []).push(r);
    });

    const result = Object.keys(groups).map(function(gid) {
      const members = groups[gid].slice().sort(function(a, b) { return a.date - b.date; });
      const players    = new Set(members.map(function(m) { return m.player; }));
      const categories = new Set(members.map(function(m) { return m.category; }));
      const spanDays = Math.round((members[members.length - 1].date - members[0].date) / 86400000);

      return {
        groupId: gid,
        distinctPlayers: players.size,
        distinctCategories: categories.size,
        spanDays: spanDays,
        entries: members.map(function(m) {
          return {
            player: m.player, category: m.category, points: m.points,
            description: m.description,
            dateStr: m.date.getFullYear() + '-' + pad(m.date.getMonth() + 1) + '-' + pad(m.date.getDate()),
            rowIndex: m.rowIndex
          };
        })
      };
    });

    // Groupes les plus susceptibles d'être de vraies collisions en premier
    // (plus de joueurs/catégories distincts) ; les groupes à 1 joueur/1 catégorie
    // restent listés en fin de liste pour arbitrage manuel par l'utilisateur.
    result.sort(function(a, b) {
      return (b.distinctPlayers + b.distinctCategories) - (a.distinctPlayers + a.distinctCategories);
    });

    return { success: true, groups: result };
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/cache.test.js`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/cache.test.js
git commit -m "feat: add apiDetectLegacyGroups to find pre-fix short group ids"
```

---

## Task 2: Frontend — "Groupes hérités à vérifier" section markup + scan

**Files:**
- Modify: `Index.html` (HTML section + new JS functions)

- [ ] **Step 1: Insert the new HTML section**

In `Index.html`, find this block (around line 2515-2518):

```html
      <button id="detectLotsBtn" class="primary small">🔍 Scanner l'historique</button>
      <div id="detectResults" class="detect-results"></div>

      <div class="settings-section-divider"></div>

      <h2>🤖 Points automatiques</h2>
```

Replace it with:

```html
      <button id="detectLotsBtn" class="primary small">🔍 Scanner l'historique</button>
      <div id="detectResults" class="detect-results"></div>

      <div class="settings-section-divider"></div>

      <h2>⚠️ Groupes hérités à vérifier</h2>
      <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 12px;line-height:1.5;">
        Avant une correction récente, deux lots saisis séparément depuis "Saisir un Lot" pouvaient recevoir le même identifiant court et apparaître fusionnés à tort dans l'Historique. Cet outil retrouve les groupes utilisant ce format d'ancien identifiant, pour vérification manuelle — rien n'est modifié tant que vous ne cliquez pas sur "Dissocier".
      </p>
      <button id="detectLegacyGroupsBtn" class="primary small">🔍 Scanner les groupes hérités</button>
      <div id="detectLegacyResults" class="detect-results"></div>

      <div class="settings-section-divider"></div>

      <h2>🤖 Points automatiques</h2>
```

- [ ] **Step 2: Add the scan + render JS functions**

In `Index.html`, find the end of the existing distributed-lots tool code (the closing of `renderDetectedLots`, right before `function initPhraseSettings() {` around line 9361):

```js
    });
  }

  function initPhraseSettings() {
```

Replace with (adds the two new functions between the existing `renderDetectedLots` and `initPhraseSettings`):

```js
    });
  }

  // ── DETECTION GROUPES HÉRITÉS ────────────────────────────────────────
  function scanLegacyGroups() {
    const btn = document.getElementById('detectLegacyGroupsBtn');
    const container = document.getElementById('detectLegacyResults');
    showSkeleton(container, { rows: 3, height: 60 });
    const restore = startBtnLoading(btn, 'Scan…');

    callServer('apiDetectLegacyGroups', [], res => {
      restore();
      if (!res.groups || !res.groups.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun groupe hérité suspect détecté. Tout est propre ✅</p>';
        return;
      }
      renderLegacyGroups(res.groups, container);
    }, 'Détection groupes hérités', () => { restore(); container.innerHTML = ''; showToast('Erreur lors du scan.', 'error'); });
  }

  function buildLegacyEntryRow(entry) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.82rem;';

    const pl = cachedPlayers.find(p => p.name === entry.player);
    const img = document.createElement('img');
    img.className = 'history-avatar';
    img.style.cssText = 'width:22px;height:22px;border-radius:50%;flex-shrink:0;';
    img.src = getAvatarUrl(entry.player, pl ? pl.meta : '');
    img.onerror = () => { img.src = getAvatarUrl(entry.player, ''); };
    row.appendChild(img);

    const name = document.createElement('span');
    name.textContent = entry.player;
    name.style.fontWeight = '600';
    row.appendChild(name);

    const col = categoryColor(entry.category);
    const pill = document.createElement('span');
    pill.className = 'hist-pill';
    pill.style.setProperty('--pill-bg', tint(col, 0.16));
    pill.style.setProperty('--pill-bd', tint(col, 0.55));
    const ic = catIcon(entry.category);
    if (ic) { const em = document.createElement('span'); em.className = 'pill-emoji'; em.textContent = ic; pill.appendChild(em); }
    pill.appendChild(document.createTextNode(entry.category));
    row.appendChild(pill);

    const rest = document.createElement('span');
    rest.style.color = 'var(--text-muted)';
    rest.textContent = entry.points + ' pts — ' + entry.dateStr;
    row.appendChild(rest);

    return row;
  }

  function renderLegacyGroups(groups, container) {
    container.innerHTML = '';

    const info = document.createElement('p');
    info.style.cssText = 'font-size:0.82rem;color:var(--text-muted);margin:0 0 10px;';
    info.textContent = groups.length + ' groupe(s) suspect(s). Dépliez pour voir le détail, cochez ceux à dissocier.';
    container.appendChild(info);

    const checkAll = document.createElement('label');
    checkAll.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:0.85rem;cursor:pointer;';
    const cbAll = document.createElement('input');
    cbAll.type = 'checkbox';
    checkAll.appendChild(cbAll);
    checkAll.appendChild(document.createTextNode('Tout sélectionner'));
    container.appendChild(checkAll);

    const groupEls = [];
    groups.forEach(group => {
      const div = document.createElement('div');
      div.className = 'detect-lot';

      const head = document.createElement('div');
      head.className = 'detect-lot-head';
      head.style.cursor = 'pointer';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => {
        const allCbs = container.querySelectorAll('.detect-lot-head input[type="checkbox"]');
        cbAll.checked = [...allCbs].every(c => c.checked);
      });

      const summary = document.createElement('span');
      summary.style.flex = '1';
      summary.textContent = group.distinctPlayers + ' joueur(s) · ' + group.distinctCategories +
        ' Top(s) · étalé sur ' + group.spanDays + ' jour(s)';

      const chevron = document.createElement('span');
      chevron.textContent = '▾';
      chevron.style.cssText = 'transition:transform 0.15s;';

      head.appendChild(cb);
      head.appendChild(summary);
      head.appendChild(chevron);
      div.appendChild(head);

      const detail = document.createElement('div');
      detail.style.cssText = 'display:none;padding-left:24px;margin-top:6px;border-top:1px solid var(--border);padding-top:8px;';
      group.entries.forEach(entry => detail.appendChild(buildLegacyEntryRow(entry)));
      div.appendChild(detail);

      head.addEventListener('click', () => {
        const open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : 'block';
        chevron.style.transform = open ? '' : 'rotate(180deg)';
      });

      container.appendChild(div);
      groupEls.push({ cb, group });
    });

    cbAll.addEventListener('change', () => {
      groupEls.forEach(g => g.cb.checked = cbAll.checked);
    });

    const actions = document.createElement('div');
    actions.className = 'detect-actions';
    const ungroupBtn = document.createElement('button');
    ungroupBtn.className = 'danger small';
    ungroupBtn.textContent = '🔓 Dissocier la sélection';
    actions.appendChild(ungroupBtn);
    container.appendChild(actions);

    ungroupBtn.addEventListener('click', () => {
      if (!requireIdentity()) return;
      const selected = groupEls.filter(g => g.cb.checked);
      if (!selected.length) { showToast('Aucun groupe coché.', 'error'); return; }

      openConfirmModal(
        'Dissocier ' + selected.length + ' groupe(s) ? Les entrées redeviendront indépendantes dans l\'Historique.',
        () => {
          buzz();
          const restore = startBtnLoading(ungroupBtn, 'Dissociation…');
          ungroupLegacyGroupsSequentially(selected.map(g => g.group.groupId), 0, () => {
            restore();
            showToast(selected.length + ' groupe(s) dissocié(s).', 'success');
            scanLegacyGroups();
            if (document.getElementById('tab-historique').classList.contains('active')) {
              loadHistoryPage(currentHistoryPage);
            }
          });
        }
      );
    });
  }

  function ungroupLegacyGroupsSequentially(groupIds, i, onDone) {
    if (i >= groupIds.length) { onDone(); return; }
    callServer('apiUngroupLot', [groupIds[i], _whoAmI || ''], () => {
      ungroupLegacyGroupsSequentially(groupIds, i + 1, onDone);
    }, 'Dissociation groupe hérité', () => {
      showToast('Erreur lors de la dissociation d\'un groupe.', 'error');
      ungroupLegacyGroupsSequentially(groupIds, i + 1, onDone);
    });
  }

  function initPhraseSettings() {
```

- [ ] **Step 3: Bind the new scan button**

In `Index.html`, find (line 9236):

```js
    document.getElementById('detectLotsBtn').addEventListener('click', scanDistributedLots);
```

Replace with:

```js
    document.getElementById('detectLotsBtn').addEventListener('click', scanDistributedLots);
    document.getElementById('detectLegacyGroupsBtn').addEventListener('click', scanLegacyGroups);
```

- [ ] **Step 4: Manual browser check**

Deploy/reload the app (or serve locally per project convention), go to Paramètres → Outils, click "Scanner les groupes hérités". With no legacy groups in the sheet, confirm the "Tout est propre ✅" message appears. This is checked exhaustively in Task 5's manual pass — a quick smoke check here is enough before moving on.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "feat: add legacy-groups detection UI in Paramètres > Outils"
```

---

## Task 3: Frontend — avatar + category pill in the existing distributed-lots tool

**Files:**
- Modify: `Index.html` (`renderDetectedLots`)

**Context:** `renderDetectedLots` (around line 9268) currently renders the player name as plain `<strong>` text and the category as plain text, both in violation of the app's "avatar mandatory everywhere a player name appears" and pill-styling rules already applied in the Historique tab.

- [ ] **Step 1: Replace the plain-text label with avatar + pill**

Find this block inside `renderDetectedLots` (around lines 9298-9309):

```js
      const label = document.createElement('span');
      label.innerHTML =
        '<strong>' + escapeHtml(lot.player) + '</strong> — ' +
        escapeHtml(lot.category) + ' — ' +
        lot.points + ' pts' +
        (lot.description ? ' — <em>' + escapeHtml(lot.description) + '</em>' : '') +
        ' <span style="color:var(--text-muted);font-size:0.8rem;">(' +
        lot.count + ' entrées, du ' + lot.dateFrom + ' au ' + lot.dateTo +
        ', total ' + lot.totalPts + ' pts)</span>';

      head.appendChild(cb);
      head.appendChild(label);
      div.appendChild(head);
```

Replace with:

```js
      const label = document.createElement('span');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

      const pl = cachedPlayers.find(p => p.name === lot.player);
      const avatarImg = document.createElement('img');
      avatarImg.style.cssText = 'width:22px;height:22px;border-radius:50%;flex-shrink:0;';
      avatarImg.src = getAvatarUrl(lot.player, pl ? pl.meta : '');
      avatarImg.onerror = () => { avatarImg.src = getAvatarUrl(lot.player, ''); };
      label.appendChild(avatarImg);

      const nameEl = document.createElement('strong');
      nameEl.textContent = lot.player;
      label.appendChild(nameEl);

      const col = categoryColor(lot.category);
      const pill = document.createElement('span');
      pill.className = 'hist-pill';
      pill.style.setProperty('--pill-bg', tint(col, 0.16));
      pill.style.setProperty('--pill-bd', tint(col, 0.55));
      const ic = catIcon(lot.category);
      if (ic) { const em = document.createElement('span'); em.className = 'pill-emoji'; em.textContent = ic; pill.appendChild(em); }
      pill.appendChild(document.createTextNode(lot.category));
      label.appendChild(pill);

      const rest = document.createElement('span');
      rest.style.color = 'var(--text-muted)';
      rest.innerHTML = lot.points + ' pts' +
        (lot.description ? ' — <em>' + escapeHtml(lot.description) + '</em>' : '') +
        ' <span style="font-size:0.8rem;">(' +
        lot.count + ' entrées, du ' + lot.dateFrom + ' au ' + lot.dateTo +
        ', total ' + lot.totalPts + ' pts)</span>';
      label.appendChild(rest);

      head.appendChild(cb);
      head.appendChild(label);
      div.appendChild(head);
```

- [ ] **Step 2: Commit**

```bash
git add Index.html
git commit -m "fix: show avatar and category pill in distributed-lots tool"
```

---

## Task 4: Frontend — "Ignorer ce lot" persisted dismissal

**Files:**
- Modify: `Index.html` (`scanDistributedLots`, `renderDetectedLots`)

- [ ] **Step 1: Add dismissal-storage helpers**

In `Index.html`, find the start of the distributed-lots section (line 9251):

```js
  // ── DETECTION LOTS RÉPARTIS ─────────────────────────────────────────
  function scanDistributedLots() {
```

Replace with:

```js
  // ── DETECTION LOTS RÉPARTIS ─────────────────────────────────────────
  const DISMISSED_LOTS_KEY = 'tdt_dismissed_lots';

  function lotSignature(rowIndexes) {
    return rowIndexes.slice().sort((a, b) => a - b).join(',');
  }

  function getDismissedLotSignatures() {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_LOTS_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }

  function dismissLotSignature(sig) {
    const set = getDismissedLotSignatures();
    set.add(sig);
    try { localStorage.setItem(DISMISSED_LOTS_KEY, JSON.stringify([...set])); }
    catch (e) { /* quota dépassé : ignoré, best-effort */ }
  }

  function scanDistributedLots() {
```

- [ ] **Step 2: Filter dismissed lots after fetching, before rendering**

Find (inside `scanDistributedLots`, around lines 9258-9265):

```js
    callServer('apiDetectDistributedLots', [], res => {
      restore();
      if (!res.lots || !res.lots.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun lot réparti détecté. Tout est propre ✅</p>';
        return;
      }
      renderDetectedLots(res.lots, container);
    }, 'Détection lots', () => { restore(); container.innerHTML = ''; showToast('Erreur lors du scan.', 'error'); });
```

Replace with:

```js
    callServer('apiDetectDistributedLots', [], res => {
      restore();
      const dismissed = getDismissedLotSignatures();
      const lots = (res.lots || []).filter(lot => !dismissed.has(lotSignature(lot.rowIndexes)));
      if (!lots.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun lot réparti détecté. Tout est propre ✅</p>';
        return;
      }
      renderDetectedLots(lots, container);
    }, 'Détection lots', () => { restore(); container.innerHTML = ''; showToast('Erreur lors du scan.', 'error'); });
```

- [ ] **Step 3: Add an "Ignorer ce lot" button per result row**

Find, inside `renderDetectedLots` (right after the `details` block you left untouched in Task 3, around lines 9312-9318):

```js
      const details = document.createElement('div');
      details.style.cssText = 'font-size:0.78rem;color:var(--text-muted);padding-left:24px;';
      details.textContent = 'Lignes : ' + lot.rowIndexes.join(', ');
      div.appendChild(details);

      container.appendChild(div);
      lotEls.push({ cb, lot });
```

Replace with:

```js
      const details = document.createElement('div');
      details.style.cssText = 'font-size:0.78rem;color:var(--text-muted);padding-left:24px;display:flex;justify-content:space-between;align-items:center;gap:8px;';
      const detailsText = document.createElement('span');
      detailsText.textContent = 'Lignes : ' + lot.rowIndexes.join(', ');
      details.appendChild(detailsText);

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'small';
      dismissBtn.textContent = 'Ignorer ce lot';
      dismissBtn.addEventListener('click', () => {
        dismissLotSignature(lotSignature(lot.rowIndexes));
        div.remove();
        showToast('Lot ignoré.', 'success');
        if (!container.querySelector('.detect-lot')) {
          container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun lot réparti détecté. Tout est propre ✅</p>';
        }
      });
      details.appendChild(dismissBtn);
      div.appendChild(details);

      container.appendChild(div);
      lotEls.push({ cb, lot });
```

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "feat: allow dismissing distributed-lot results, persisted in localStorage"
```

---

## Task 5: Manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full Node test suite**

Run: `node --test tests/`
Expected: all tests pass, including the two new ones from Task 1.

- [ ] **Step 2: Manual browser verification (per `/verify`)**

Using the local Node VM harness or the deployed app, in Paramètres → Outils:

1. Seed the History sheet (or test fixture) with at least one row group sharing a short legacy `groupId` (e.g. `G3`) across 2+ players/categories, and one row group with a current-format id (e.g. `G1720000000_ab12`).
2. Click "🔍 Scanner les groupes hérités" — confirm the `G3` group appears with the correct summary line (`N joueur(s) · M Top(s) · étalé sur D jour(s)`), and the current-format group does **not** appear.
3. Click the summary row — confirm it expands to show each entry with avatar, colored category pill, points, and date.
4. Check the group's checkbox, click "🔓 Dissocier la sélection" — confirm the confirmation modal appears, confirm it, and verify the group disappears from the list and (if Historique tab is open) the entries show as ungrouped there.
5. In "🔗 Regrouper les lots répartis": scan, confirm each result row now shows the player's avatar and a colored category pill (not plain text).
6. Click "Ignorer ce lot" on a result — confirm it disappears immediately, then reload the page and re-scan — confirm it stays hidden (persisted via `localStorage`).
7. Confirm no `Mobile.html` regressions: open the mobile Outils tab and confirm the existing distributed-lots flow there still works as before (it was intentionally not modified).

- [ ] **Step 3: Report results**

No commit for this task — it's a verification checkpoint. If any check fails, return to the relevant task and fix before proceeding.

---

## Self-Review Notes

- **Spec coverage:** §1 backend detection ✓ (Task 1), §1 frontend section/expand/select/dissociate ✓ (Task 2), §2 avatar+pill fixes ✓ (Task 3), §2 "Ignorer ce lot" + localStorage signature ✓ (Task 4), manual + Node verification ✓ (Task 5). No migration of data anywhere — dissociation only happens on explicit user click, matching spec's "Vérification" section.
- **Placeholder scan:** none found — every step has full code.
- **Type/name consistency:** `apiDetectLegacyGroups` returns `{ success, groups: [{ groupId, distinctPlayers, distinctCategories, spanDays, entries: [{ player, category, points, description, dateStr, rowIndex }] }] }` — used identically in `renderLegacyGroups`/`buildLegacyEntryRow`/tests. `lotSignature`/`getDismissedLotSignatures`/`dismissLotSignature` names match between definition (Task 4 Step 1) and usage (Task 4 Steps 2-3).
