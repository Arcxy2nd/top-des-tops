# Style automatisations + options granulaires groupes hérités — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the category as a colored pill (matching the rest of the app) in the "Points automatiques" rule list, and replace the legacy-groups tool's single all-or-nothing "dissociate" action with three options: dissociate only the checked entries, dissociate the whole group, or dismiss the group without touching data.

**Architecture:** Both changes are frontend-only (`Index.html`). The auto-rules row builder switches from a single `innerHTML` string to a mix of `innerHTML` fragments and a DOM-built pill element, reusing the existing `categoryColor`/`catIcon`/`tint`/`hist-pill` pattern already used in `buildLegacyEntryRow`. The legacy-groups renderer adds per-entry checkboxes and wires them to the existing `apiRemoveFromGroup(rowIndex, author)` backend endpoint (already implemented, untouched), plus a client-only dismiss list in `localStorage` mirroring the existing `tdt_dismissed_lots` pattern used by the neighboring distributed-lots tool.

**Tech Stack:** Google Apps Script (`Code.gs`, unmodified), vanilla JS/HTML (`Index.html`), manual browser verification (no backend behavior changes, so no new Node tests).

**Spec:** `[[../specs/2026-07-08-style-automatisations-et-options-groupes-herites-design.md]]`

**Out of scope (confirmed with design doc):** `apiDetectLegacyGroups` detection logic, per-entry "ignore" (only per-group), `Mobile.html`.

---

## Task 1: Category pill in "Points automatiques" rule list

**Files:**
- Modify: `Index.html:8880-8888` (`renderAutoRules`)

**Context:** `renderAutoRules` builds each rule row's `main` element with a single `innerHTML` assignment that puts the category name (`escapeHtml(rule.category)`) in plain text. Every other list in the app (Historique, outil lots répartis, outil groupes hérités) shows a category as a colored pill using `categoryColor(cat)` for the color, `catIcon(cat)` for the emoji, and the `.hist-pill`/`.pill-emoji` CSS classes (see `Index.html:9478-9486` for the exact reference pattern already used in `buildLegacyEntryRow`).

- [ ] **Step 1: Replace the plain-text category with a DOM-built pill**

Find this block in `Index.html` (`renderAutoRules`, currently lines 8880-8888):

```js
      const main = document.createElement('div');
      main.className = 'auto-rule-main';
      main.innerHTML =
        (broken ? '<span class="auto-rule-warn" title="Cette règle ne s\'exécutera pas : joueur ou Top introuvable">⚠️</span> ' : '') +
        '<strong>' + escapeHtml(rule.player) + '</strong> +' + rule.points + ' pts · ' +
        escapeHtml(rule.category) + (rule.description ? ' — ' + escapeHtml(rule.description) : '') +
        '<div class="auto-rule-schedule">' + escapeHtml(describeAutoRuleSchedule(rule)) +
        (rule.nextRun ? ' · prochain : ' + new Date(rule.nextRun).toLocaleString('fr-FR') : '') + '</div>';
      row.appendChild(main);
```

Replace with:

```js
      const main = document.createElement('div');
      main.className = 'auto-rule-main';
      main.innerHTML =
        (broken ? '<span class="auto-rule-warn" title="Cette règle ne s\'exécutera pas : joueur ou Top introuvable">⚠️</span> ' : '') +
        '<strong>' + escapeHtml(rule.player) + '</strong> +' + rule.points + ' pts · ';

      const col = categoryColor(rule.category);
      const pill = document.createElement('span');
      pill.className = 'hist-pill';
      pill.style.setProperty('--pill-bg', tint(col, 0.16));
      pill.style.setProperty('--pill-bd', tint(col, 0.55));
      const ic = catIcon(rule.category);
      if (ic) { const em = document.createElement('span'); em.className = 'pill-emoji'; em.textContent = ic; pill.appendChild(em); }
      pill.appendChild(document.createTextNode(rule.category));
      main.appendChild(pill);

      const tail = document.createElement('span');
      tail.innerHTML =
        (rule.description ? ' — ' + escapeHtml(rule.description) : '') +
        '<div class="auto-rule-schedule">' + escapeHtml(describeAutoRuleSchedule(rule)) +
        (rule.nextRun ? ' · prochain : ' + new Date(rule.nextRun).toLocaleString('fr-FR') : '') + '</div>';
      main.appendChild(tail);
      row.appendChild(main);
```

- [ ] **Step 2: Manual browser check**

Open the app, go to Paramètres → Outils → 🤖 Points automatiques, with at least one rule defined. Confirm the category now shows as a colored pill with its emoji (same look as a category pill in Historique) instead of plain text, and that player name, points, description, schedule line and the broken-rule warning icon (if any) still render exactly as before.

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "style: show category as a colored pill in Points automatiques rule list"
```

---

## Task 2: Per-entry checkboxes + partial dissociation in "Groupes hérités à vérifier"

**Files:**
- Modify: `Index.html` (`buildLegacyEntryRow`, `renderLegacyGroups`)

**Context:** `buildLegacyEntryRow` (currently `Index.html:9461-9494`) renders one entry row per group member with no checkbox. `renderLegacyGroups` (currently `Index.html:9496-9591`) has a single "🔓 Dissocier la sélection" button that dissociates entire groups via `apiUngroupLot`. We need per-entry checkboxes and a second action that dissociates only the checked individual entries via the existing `apiRemoveFromGroup(rowIndex, author)` endpoint (`Code.gs:1778-1788`, already implemented and unmodified by this plan).

- [ ] **Step 1: Add a checkbox to each entry row**

Find (`Index.html`, `buildLegacyEntryRow`, currently lines 9461-9463):

```js
  function buildLegacyEntryRow(entry) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.82rem;';

    const pl = cachedPlayers.find(p => p.name === entry.player);
```

Replace with:

```js
  function buildLegacyEntryRow(entry) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.82rem;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'legacy-entry-cb';
    row.appendChild(cb);

    const pl = cachedPlayers.find(p => p.name === entry.player);
```

Then find the end of the same function (currently lines 9488-9494):

```js
    const rest = document.createElement('span');
    rest.style.color = 'var(--text-muted)';
    rest.textContent = entry.points + ' pts — ' + entry.dateStr;
    row.appendChild(rest);

    return row;
  }
```

Replace with:

```js
    const rest = document.createElement('span');
    rest.style.color = 'var(--text-muted)';
    rest.textContent = entry.points + ' pts — ' + entry.dateStr;
    row.appendChild(rest);

    row.dataset.rowIndex = entry.rowIndex;
    return row;
  }
```

- [ ] **Step 2: Wire the entry checkbox into the group's "select all" checkbox and track entry checkboxes per group**

Find (`Index.html`, `renderLegacyGroups`, currently lines 9543-9546):

```js
      const detail = document.createElement('div');
      detail.style.cssText = 'display:none;padding-left:24px;margin-top:6px;border-top:1px solid var(--border);padding-top:8px;';
      group.entries.forEach(entry => detail.appendChild(buildLegacyEntryRow(entry)));
      div.appendChild(detail);
```

Replace with:

```js
      const detail = document.createElement('div');
      detail.style.cssText = 'display:none;padding-left:24px;margin-top:6px;border-top:1px solid var(--border);padding-top:8px;';
      const entryRows = group.entries.map(entry => buildLegacyEntryRow(entry));
      entryRows.forEach(r => detail.appendChild(r));
      div.appendChild(detail);
```

Then find (currently lines 9521-9527):

```js
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => {
        const allCbs = container.querySelectorAll('.detect-lot-head input[type="checkbox"]');
        cbAll.checked = [...allCbs].every(c => c.checked);
      });
```

Replace with:

```js
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => {
        entryRows.forEach(r => { r.querySelector('.legacy-entry-cb').checked = cb.checked; });
        const allCbs = container.querySelectorAll('.detect-lot-head input[type="checkbox"]');
        cbAll.checked = [...allCbs].every(c => c.checked);
      });
```

Then find (currently line 9555, inside the `groups.forEach` loop, right before its closing brace):

```js
      container.appendChild(div);
      groupEls.push({ cb, group });
    });
```

Replace with:

```js
      container.appendChild(div);
      groupEls.push({ cb, group, div, entryRows });
    });
```

- [ ] **Step 3: Rename the existing button to be explicit, and add the "Dissocier les entrées cochées" + "Ignorer ce groupe" actions**

Find (`Index.html`, `renderLegacyGroups`, currently lines 9562-9591):

```js
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
            if (document.getElementById('tab-history').classList.contains('active')) {
              loadHistoryPage(currentHistoryPage);
            }
          });
        }
      );
    });
  }
```

Replace with:

```js
    const actions = document.createElement('div');
    actions.className = 'detect-actions';

    const partialBtn = document.createElement('button');
    partialBtn.className = 'secondary small';
    partialBtn.textContent = '➖ Dissocier les entrées cochées';
    actions.appendChild(partialBtn);

    const ungroupBtn = document.createElement('button');
    ungroupBtn.className = 'danger small';
    ungroupBtn.textContent = '🔓 Dissocier tout le groupe sélectionné';
    actions.appendChild(ungroupBtn);
    container.appendChild(actions);

    partialBtn.addEventListener('click', () => {
      if (!requireIdentity()) return;
      const rowIndexes = [];
      groupEls.forEach(g => {
        g.entryRows.forEach(r => {
          if (r.querySelector('.legacy-entry-cb').checked) rowIndexes.push(parseInt(r.dataset.rowIndex, 10));
        });
      });
      if (!rowIndexes.length) { showToast('Aucune entrée cochée.', 'error'); return; }

      openConfirmModal(
        'Dissocier ' + rowIndexes.length + ' entrée(s) ? Elles redeviendront indépendantes, le reste de leur groupe ne bouge pas.',
        () => {
          buzz();
          const restore = startBtnLoading(partialBtn, 'Dissociation…');
          removeEntriesFromGroupSequentially(rowIndexes, 0, () => {
            restore();
            showToast(rowIndexes.length + ' entrée(s) dissociée(s).', 'success');
            scanLegacyGroups();
            if (document.getElementById('tab-history').classList.contains('active')) {
              loadHistoryPage(currentHistoryPage);
            }
          });
        }
      );
    });

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
            if (document.getElementById('tab-history').classList.contains('active')) {
              loadHistoryPage(currentHistoryPage);
            }
          });
        }
      );
    });
  }

  function removeEntriesFromGroupSequentially(rowIndexes, i, onDone) {
    if (i >= rowIndexes.length) { onDone(); return; }
    callServer('apiRemoveFromGroup', [rowIndexes[i], _whoAmI || ''], () => {
      removeEntriesFromGroupSequentially(rowIndexes, i + 1, onDone);
    }, 'Dissociation entrée héritée', () => {
      showToast('Erreur lors de la dissociation d\'une entrée.', 'error');
      removeEntriesFromGroupSequentially(rowIndexes, i + 1, onDone);
    });
  }
```

- [ ] **Step 4: Manual browser check**

Deploy/reload the app, seed a legacy group with 3+ entries (e.g. `groupId` `G3` across 2 players), scan it in Paramètres → Outils → ⚠️ Groupes hérités à vérifier, expand it, check only one entry, click "➖ Dissocier les entrées cochées", confirm — verify only that entry disappears from the group on the next scan (fewer entries, or the group disappears entirely if it was the last one) and the other entries are untouched. Then re-scan, check the group's own checkbox, click "🔓 Dissocier tout le groupe sélectionné" — verify the whole group disappears.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "feat: allow dissociating individual entries from a legacy group"
```

---

## Task 3: "Ignorer ce groupe" dismissal, persisted in localStorage

**Files:**
- Modify: `Index.html` (`scanLegacyGroups`, `renderLegacyGroups`)

**Context:** The neighboring "🔗 Regrouper les lots répartis" tool already has a client-only dismiss mechanism (`DISMISSED_LOTS_KEY = 'tdt_dismissed_lots'`, `getDismissedLotSignatures`/`dismissLotSignature`, defined right before `scanDistributedLots`). This task adds the same pattern for legacy groups, keyed directly by `groupId` (no signature needed — `groupId` is already a stable, unique string per group).

- [ ] **Step 1: Add dismissal-storage helpers before `scanLegacyGroups`**

Find (`Index.html`, currently lines 9444-9445):

```js
  // ── DETECTION GROUPES HÉRITÉS ────────────────────────────────────────
  function scanLegacyGroups() {
```

Replace with:

```js
  // ── DETECTION GROUPES HÉRITÉS ────────────────────────────────────────
  const DISMISSED_LEGACY_GROUPS_KEY = 'tdt_dismissed_legacy_groups';

  function getDismissedLegacyGroupIds() {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_LEGACY_GROUPS_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }

  function dismissLegacyGroupId(groupId) {
    const set = getDismissedLegacyGroupIds();
    set.add(groupId);
    try { localStorage.setItem(DISMISSED_LEGACY_GROUPS_KEY, JSON.stringify([...set])); }
    catch (e) { /* quota dépassé : ignoré, best-effort */ }
  }

  function scanLegacyGroups() {
```

- [ ] **Step 2: Filter dismissed groups after fetching, before rendering**

Find (`Index.html`, `scanLegacyGroups`, currently lines 9451-9458):

```js
    callServer('apiDetectLegacyGroups', [], res => {
      restore();
      if (!res.groups || !res.groups.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun groupe hérité suspect détecté. Tout est propre ✅</p>';
        return;
      }
      renderLegacyGroups(res.groups, container);
    }, 'Détection groupes hérités', () => { restore(); container.innerHTML = ''; showToast('Erreur lors du scan.', 'error'); });
```

Replace with:

```js
    callServer('apiDetectLegacyGroups', [], res => {
      restore();
      const dismissed = getDismissedLegacyGroupIds();
      const groups = (res.groups || []).filter(g => !dismissed.has(g.groupId));
      if (!groups.length) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun groupe hérité suspect détecté. Tout est propre ✅</p>';
        return;
      }
      renderLegacyGroups(groups, container);
    }, 'Détection groupes hérités', () => { restore(); container.innerHTML = ''; showToast('Erreur lors du scan.', 'error'); });
```

- [ ] **Step 3: Add an "Ignorer ce groupe" button next to each group's summary**

Find (`Index.html`, `renderLegacyGroups`, in the `groups.forEach` loop, right after the code from Task 2 Step 2 — currently the summary/chevron block, lines 9529-9541):

```js
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
```

Replace with:

```js
      const summary = document.createElement('span');
      summary.style.flex = '1';
      summary.textContent = group.distinctPlayers + ' joueur(s) · ' + group.distinctCategories +
        ' Top(s) · étalé sur ' + group.spanDays + ' jour(s)';

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'small';
      dismissBtn.textContent = 'Ignorer ce groupe';
      dismissBtn.title = 'Marquer ce groupe comme vérifié, sans modifier les données';
      dismissBtn.addEventListener('click', e => {
        e.stopPropagation();
        dismissLegacyGroupId(group.groupId);
        div.remove();
        showToast('Groupe ignoré.', 'success');
        if (!container.querySelector('.detect-lot')) {
          container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucun groupe hérité suspect détecté. Tout est propre ✅</p>';
        }
      });

      const chevron = document.createElement('span');
      chevron.textContent = '▾';
      chevron.style.cssText = 'transition:transform 0.15s;';

      head.appendChild(cb);
      head.appendChild(summary);
      head.appendChild(dismissBtn);
      head.appendChild(chevron);
      div.appendChild(head);
```

- [ ] **Step 4: Manual browser check**

Scan legacy groups, click "Ignorer ce groupe" on one result — confirm it disappears immediately (and the "Tout est propre ✅" message appears if it was the only one). Reload the page and re-scan — confirm the dismissed group stays hidden. Confirm the other action buttons ("➖ Dissocier les entrées cochées", "🔓 Dissocier tout le groupe sélectionné") from Task 2 still work correctly on a non-dismissed group.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "feat: allow dismissing a legacy group as verified, persisted in localStorage"
```

---

## Task 4: Full manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Points automatiques**

In Paramètres → Outils → 🤖 Points automatiques: confirm every rule row shows the category as a colored pill (color + emoji matching the Top's settings), alongside the existing avatar-less player name, points, description, schedule line, and (for a rule pointing at a deleted player/category) the ⚠️ broken-rule warning.

- [ ] **Step 2: Groupes hérités — three actions**

In Paramètres → Outils → ⚠️ Groupes hérités à vérifier, with at least two suspect groups seeded:
1. Expand a group, check a single entry, click "➖ Dissocier les entrées cochées" — confirm only that entry leaves the group.
2. Check a whole group via its own checkbox, click "🔓 Dissocier tout le groupe sélectionné" — confirm the whole group disappears and (if Historique is open) its entries show as ungrouped.
3. Click "Ignorer ce groupe" on the remaining group — confirm it disappears immediately, and stays hidden after a page reload + re-scan.

- [ ] **Step 3: Regression check on the neighboring tool**

In "🔗 Regrouper les lots répartis", confirm the tool still works exactly as before this plan (avatar, category pill, "Ignorer ce lot") — nothing in this plan touches that tool's code.

- [ ] **Step 4: Report results**

No commit for this task — it's a verification checkpoint. If any check fails, return to the relevant task and fix before proceeding.

---

## Self-Review Notes

- **Spec coverage:** §1 pill in Points automatiques ✓ (Task 1). §2 per-entry checkboxes ✓, partial dissociation via `apiRemoveFromGroup` ✓, whole-group dissociation kept ✓ (Task 2). §2 "Ignorer ce groupe" + localStorage persistence ✓ (Task 3). Manual verification ✓ (Task 4).
- **Placeholder scan:** none — every step has full code.
- **Type/name consistency:** `groupEls` now carries `{ cb, group, div, entryRows }` — `div` and `entryRows` added in Task 2 are consumed by Task 3's dismiss handler (`div.remove()`) and Task 2's own partial-dissociation handler (`g.entryRows`), matching usage. `removeEntriesFromGroupSequentially(rowIndexes, i, onDone)` mirrors the existing `ungroupLegacyGroupsSequentially(groupIds, i, onDone)` signature shape. `dismissLegacyGroupId`/`getDismissedLegacyGroupIds`/`DISMISSED_LEGACY_GROUPS_KEY` names are consistent between definition (Task 3 Step 1) and usage (Task 3 Steps 2-3). No backend changes — `apiRemoveFromGroup(rowIndex, author)` signature used matches its existing definition at `Code.gs:1778`.
