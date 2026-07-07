# Refonte UX ciblée (Groupe B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four independent UX gaps in the Top-des-Tops frontend: identity checks that fire too late (after text is typed), a Notes tab with no search/sort/relative-dates, an Historique selection mode that silently keeps stale selections across filter/page changes, and an Automatisations section that looks visually bare compared to the rest of the app.

**Architecture:** All changes are inside the existing monolithic `Index.html` (no `Code.gs`/`AutoPoints.gs` changes — purely client-side state, rendering, and CSS). Each of the 4 sub-tasks touches a disjoint region of the file and can be implemented and verified independently.

**Tech Stack:** Vanilla JS/HTML/CSS in `Index.html`. No backend, no new tests (purely front-end UI/state — verified manually in-browser, consistent with how Task 5 of the previous plan was verified).

---

## Task 1: Check identity before opening text-entry modals, not just before saving

**Files:**
- Modify: `Index.html:8375` (`openEditNoteModal`)
- Modify: `Index.html:3402` (`openPhraseModal`)
- Modify: `Index.html:4741` (`openEditModal`)
- Modify: `Index.html:8565` (`openFullEditHistoryModal`)
- Modify: `Index.html:3610` (`openBulkImportModal`)
- Modify: `Index.html:3446` (`openCreatePresetModal`)
- Modify: `Index.html:3539` (`openRenamePresetModal`)

**Problem:** `requireIdentity()` is already called consistently right before every write, but never before a text-entry modal opens. A user can type into a modal, click Save, get told to pick an identity, close the modal to do so (the identity picker lives in the header, not the modal), and lose everything typed — because `closeModal()` clears `box.innerHTML`. `openBulkEditModal` (`Index.html:8417-8418`) already checks at open time — it needs no change and is the pattern to replicate.

- [ ] **Step 1: `openEditNoteModal`**

Locate (`Index.html:8375`):

```javascript
  function openEditNoteModal(note) {
    const box = document.getElementById('modalBox');
```

Replace with:

```javascript
  function openEditNoteModal(note) {
    if (!requireIdentity()) return;
    const box = document.getElementById('modalBox');
```

- [ ] **Step 2: `openPhraseModal`**

Locate (`Index.html:3402`):

```javascript
  function openPhraseModal(entry, presetName, pool, displayLabel) {
    _phraseModalCtx = { entry, presetName, pool };
```

Replace with:

```javascript
  function openPhraseModal(entry, presetName, pool, displayLabel) {
    if (!requireIdentity()) return;
    _phraseModalCtx = { entry, presetName, pool };
```

- [ ] **Step 3: `openEditModal`**

Locate (`Index.html:4741`):

```javascript
  function openEditModal(entityType, oldName, oldMeta, oldIcon, currentColor) {
    const box = document.getElementById('modalBox');
```

Replace with:

```javascript
  function openEditModal(entityType, oldName, oldMeta, oldIcon, currentColor) {
    if (!requireIdentity()) return;
    const box = document.getElementById('modalBox');
```

- [ ] **Step 4: `openFullEditHistoryModal`**

Locate (`Index.html:8565`):

```javascript
  function openFullEditHistoryModal(log) {
    const box = document.getElementById('modalBox');
```

Replace with:

```javascript
  function openFullEditHistoryModal(log) {
    if (!requireIdentity()) return;
    const box = document.getElementById('modalBox');
```

- [ ] **Step 5: `openBulkImportModal`**

Locate (`Index.html:3610`):

```javascript
  function openBulkImportModal(presetName, pool, poolLabel) {
    _bulkImportCtx = { presetName, pool };
```

Replace with:

```javascript
  function openBulkImportModal(presetName, pool, poolLabel) {
    if (!requireIdentity()) return;
    _bulkImportCtx = { presetName, pool };
```

- [ ] **Step 6: `openCreatePresetModal`**

Locate (`Index.html:3446`):

```javascript
  function openCreatePresetModal() {
    const copySelect = document.getElementById('presetCopyFromSelect');
```

Replace with:

```javascript
  function openCreatePresetModal() {
    if (!requireIdentity()) return;
    const copySelect = document.getElementById('presetCopyFromSelect');
```

- [ ] **Step 7: `openRenamePresetModal`**

Locate (`Index.html:3539`):

```javascript
  function openRenamePresetModal() {
    const active = getActivePresetId();
```

Replace with:

```javascript
  function openRenamePresetModal() {
    if (!requireIdentity()) return;
    const active = getActivePresetId();
```

- [ ] **Step 8: Manual verification**

In the browser, with no identity selected (fresh session / "Qui suis-je ?" not chosen): click each of the following and confirm the identity toast + button pulse appear *immediately*, with no modal ever opening: edit a note, edit a phrase, edit a player/category, fully edit a history entry, open the bulk phrase import, create a phrase preset, rename a phrase preset. Then select an identity and confirm all 7 still open normally.

- [ ] **Step 9: Commit** (skip if no git repo is set up — see note at the end of this plan)

```bash
git add Index.html
git commit -m "fix: check identity before opening text-entry modals, not just before saving"
```

---

## Task 2: Notes tab — search, default sort, relative dates

**Files:**
- Modify: `Index.html:2564-2573` (Notes tab HTML — add search input)
- Modify: `Index.html:8127-8251` (`loadNotes`, `renderNotesUI` — split into raw-cache + filtered render)
- Modify: `Index.html:8330-8373` (`buildNoteCard` — add relative date)
- New CSS: near `.notes-flash-bar` rules

**Problem:** Notes are grouped by player but rendered in whatever order the backend returns (insertion order via `NotesService.getAllNotes()`'s `out.reverse()`, `Code.gs:611-635` — this is *insertion* order, not the note's actual `timestamp`, so a backdated note doesn't sort correctly). There's no search box, and dates show only as an absolute `toLocaleDateString('fr-FR')` string.

- [ ] **Step 1: Add the search input to the Notes tab HTML**

Locate (`Index.html:2564-2573`):

```html
  <!-- ══ NOTES ═════════════════════════════════════════════════════════ -->
  <div id="tab-notes" class="tab-content">
    <div class="card">
      <div class="chart-header">
        <h2 style="margin:0;">📝 Notes par joueur</h2>
        <button id="refreshNotesBtn" class="secondary small">🔄 Rafraîchir</button>
      </div>
      <div id="notesPlayersContainer"></div>
    </div>
  </div>
```

Replace with:

```html
  <!-- ══ NOTES ═════════════════════════════════════════════════════════ -->
  <div id="tab-notes" class="tab-content">
    <div class="card">
      <div class="chart-header">
        <h2 style="margin:0;">📝 Notes par joueur</h2>
        <button id="refreshNotesBtn" class="secondary small">🔄 Rafraîchir</button>
      </div>
      <div class="notes-search-row">
        <input type="text" id="notesSearchInput" placeholder="🔍 Rechercher dans les notes…">
      </div>
      <div id="notesPlayersContainer"></div>
    </div>
  </div>
```

- [ ] **Step 2: Add CSS for the search row**

Near the `.notes-flash-bar` rule (search for it to find the right spot in the `<style>` block), add:

```css
    .notes-search-row { margin-bottom: 12px; }
    .notes-search-row input {
      width: 100%; padding: 8px 12px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg); color: var(--text);
    }
```

- [ ] **Step 3: Add a relative-date helper**

Near `buildNoteCard` (before it, `Index.html:8330`), add:

```javascript
  function relativeDateLabel(date) {
    if (!date || isNaN(date.getTime())) return '';
    const days = Math.floor((new Date().setHours(0,0,0,0) - new Date(date).setHours(0,0,0,0)) / 86400000);
    if (days === 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days > 1 && days < 30) return 'il y a ' + days + ' jours';
    if (days < 0) return 'dans le futur';
    return '';
  }

```

- [ ] **Step 4: Show the relative date in `buildNoteCard`**

Locate (`Index.html:8330-8347`):

```javascript
  function buildNoteCard(note) {
    const d = note.timestamp ? new Date(note.timestamp) : null;
    const dateStr = (d && !isNaN(d)) ? d.toLocaleDateString('fr-FR') : '—';

    const card = document.createElement('div');
    card.className = 'note-card';

    const noteBg = document.createElement('div');
    noteBg.className = 'note-card-bg';
    const notePlayer = cachedPlayers.find(p => p.name === note.player);
    noteBg.style.backgroundImage = 'url(' + getAvatarUrl(note.player, notePlayer ? notePlayer.meta : '') + ')';
    card.appendChild(noteBg);

    const headc = document.createElement('div');
    headc.className = 'note-card-head';
    const dt = document.createElement('span');
    dt.className = 'note-date'; dt.textContent = dateStr;
    headc.appendChild(dt);
```

Replace with:

```javascript
  function buildNoteCard(note) {
    const d = note.timestamp ? new Date(note.timestamp) : null;
    const dateStr = (d && !isNaN(d)) ? d.toLocaleDateString('fr-FR') : '—';
    const relStr   = d && !isNaN(d) ? relativeDateLabel(d) : '';

    const card = document.createElement('div');
    card.className = 'note-card';

    const noteBg = document.createElement('div');
    noteBg.className = 'note-card-bg';
    const notePlayer = cachedPlayers.find(p => p.name === note.player);
    noteBg.style.backgroundImage = 'url(' + getAvatarUrl(note.player, notePlayer ? notePlayer.meta : '') + ')';
    card.appendChild(noteBg);

    const headc = document.createElement('div');
    headc.className = 'note-card-head';
    const dt = document.createElement('span');
    dt.className = 'note-date';
    dt.textContent = dateStr + (relStr ? ' · ' + relStr : '');
    headc.appendChild(dt);
```

- [ ] **Step 5: Cache the raw notes and wire the search box**

Locate (`Index.html:8127-8134`):

```javascript
  let _flashPlayer = ''; // persists across re-renders so selection survives note saves

  function loadNotes() {
    showSkeleton(document.getElementById('notesPlayersContainer'), { rows: 3, height: 70 });
    callServer('apiGetAllNotes', [], res => {
      renderNotesUI(res.notes || []);
    }, 'Chargement notes');
  }
```

Replace with:

```javascript
  let _flashPlayer = ''; // persists across re-renders so selection survives note saves
  let _allNotesRaw = [];
  let _notesSearchQuery = '';

  function loadNotes() {
    showSkeleton(document.getElementById('notesPlayersContainer'), { rows: 3, height: 70 });
    callServer('apiGetAllNotes', [], res => {
      renderNotesUI(res.notes || []);
    }, 'Chargement notes');
  }
```

- [ ] **Step 6: Split grouping/sorting into a reusable render function, wire the search input**

Locate (`Index.html:8244-8251`, the end of `renderNotesUI`):

```javascript
    // Regrouper les notes par joueur
    const byPlayer = {};
    notes.forEach(n => { (byPlayer[n.player] = byPlayer[n.player] || []).push(n); });

    cachedPlayers.forEach(p => {
      container.appendChild(buildPlayerNoteBlock(p, byPlayer[p.name] || []));
    });
  }
```

Replace with:

```javascript
    _allNotesRaw = notes;

    const searchInput = document.getElementById('notesSearchInput');
    if (searchInput) {
      searchInput.value = _notesSearchQuery;
      searchInput.oninput = () => {
        _notesSearchQuery = searchInput.value;
        renderNotesBlocks();
      };
    }

    const blocksContainer = document.createElement('div');
    blocksContainer.id = 'notesBlocksContainer';
    container.appendChild(blocksContainer);

    renderNotesBlocks();
  }

  function renderNotesBlocks() {
    const blocksContainer = document.getElementById('notesBlocksContainer');
    if (!blocksContainer) return;
    blocksContainer.innerHTML = '';

    const query = _notesSearchQuery.trim().toLowerCase();
    const filtered = query
      ? _allNotesRaw.filter(n => (n.text || '').toLowerCase().includes(query))
      : _allNotesRaw;

    // Regrouper les notes par joueur, triées par date décroissante (plus récentes en premier)
    const byPlayer = {};
    filtered.forEach(n => { (byPlayer[n.player] = byPlayer[n.player] || []).push(n); });
    Object.keys(byPlayer).forEach(name => {
      byPlayer[name].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    });

    cachedPlayers.forEach(p => {
      blocksContainer.appendChild(buildPlayerNoteBlock(p, byPlayer[p.name] || []));
    });
  }
```

- [ ] **Step 7: Show a "no match" message per empty player block when searching**

Locate (`Index.html:8316-8324`, inside `buildPlayerNoteBlock`):

```javascript
    // Liste des notes du joueur
    const listEl = document.createElement('div');
    listEl.className = 'npb-notes';
    if (!notes.length) {
      const e = document.createElement('div');
      e.className = 'npb-empty'; e.textContent = 'Aucune note pour le moment.';
      listEl.appendChild(e);
    } else {
      notes.forEach(note => listEl.appendChild(buildNoteCard(note)));
    }
```

Replace with:

```javascript
    // Liste des notes du joueur
    const listEl = document.createElement('div');
    listEl.className = 'npb-notes';
    if (!notes.length) {
      const e = document.createElement('div');
      e.className = 'npb-empty';
      e.textContent = _notesSearchQuery.trim() ? 'Aucune note ne correspond à la recherche.' : 'Aucune note pour le moment.';
      listEl.appendChild(e);
    } else {
      notes.forEach(note => listEl.appendChild(buildNoteCard(note)));
    }
```

- [ ] **Step 8: Manual verification**

In the browser, open the Notes tab with several notes across players (including at least one backdated note). Confirm: notes render most-recent-first per player block; typing in the search box filters notes live across all player blocks; clearing the search restores the full list; each note shows both an absolute and relative date; a player with no matching notes shows "Aucune note ne correspond à la recherche." instead of disappearing.

- [ ] **Step 9: Commit**

```bash
git add Index.html
git commit -m "feat: add search, default newest-first sort, and relative dates to Notes tab"
```

---

## Task 3: Historique selection — clear stale selection, clarify page scope

**Files:**
- Modify: `Index.html:7912-7917` (`_doLoadHistoryPage`)
- Modify: `Index.html:7276-7279` (`updateHistBulkBar`)

**Problem:** `histSelected` is only cleared by `toggleHistSelectMode()`. Changing the player/Top filter chips or navigating to a different page calls `loadHistoryPage`/`_doLoadHistoryPage` directly without clearing it, so a stale selection referencing rows no longer visible can silently carry over into the next bulk action. Separately, "Tout sélectionner" only selects the current page's rows (`histVisibleRows`) without saying so.

- [ ] **Step 1: Clear the selection on every history page load, in one place**

Locate (`Index.html:7912-7917`):

```javascript
  function _doLoadHistoryPage(page) {
    currentHistoryPage = page;
    const textFilter    = (document.getElementById('historyTextFilter') || {}).value || '';
    const filterPlayers = selectedHistPlayers.size    ? [...selectedHistPlayers]    : [];
    const filterCats    = selectedHistCategories.size ? [...selectedHistCategories] : [];
    const key = histPrefetchKey(page, filterPlayers, filterCats, textFilter.trim());
```

Replace with:

```javascript
  function _doLoadHistoryPage(page) {
    currentHistoryPage = page;
    if (histSelectMode && histSelected.size) {
      histSelected.clear();
      updateHistBulkBar();
    }
    const textFilter    = (document.getElementById('historyTextFilter') || {}).value || '';
    const filterPlayers = selectedHistPlayers.size    ? [...selectedHistPlayers]    : [];
    const filterCats    = selectedHistCategories.size ? [...selectedHistCategories] : [];
    const key = histPrefetchKey(page, filterPlayers, filterCats, textFilter.trim());
```

This single change point covers every way a page load can be triggered: pagination clicks, player/Top filter chip clicks, and the text-filter search box (all of them funnel through `loadHistoryPage` → `_doLoadHistoryPage`).

- [ ] **Step 2: Clarify that "select all" is page-scoped**

Locate (`Index.html:7276-7279`):

```javascript
  function updateHistBulkBar() {
    const count = document.getElementById('histBulkCount');
    if (count) count.textContent = histSelected.size + ' sélectionné' + (histSelected.size > 1 ? 's' : '');
  }
```

Replace with:

```javascript
  function updateHistBulkBar() {
    const count = document.getElementById('histBulkCount');
    if (count) count.textContent = histSelected.size + ' sélectionné' + (histSelected.size > 1 ? 's' : '') + ' sur cette page';
  }
```

- [ ] **Step 3: Manual verification**

In the browser, enter selection mode in Historique, check a few rows, then click a different player/Top filter chip — confirm the bulk bar counter resets to 0 and the checkboxes are unchecked. Repeat by navigating to page 2 instead of changing filters — same result expected. Then check some rows and confirm the counter reads "N sélectionné(s) sur cette page".

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "fix: clear stale history selection on filter/page change, clarify page-scoped select-all"
```

---

## Task 4: Automatisations — visual harmonization

**Files:**
- Modify: `Index.html:2471, 2489, 2498` (inline divider styles → shared class)
- Modify: `Index.html:2500-2547` (wrap the automation section in a card)
- Modify: `Index.html` `<style>` block (new `.settings-section-divider`, `.auto-rules-card` rules; add border to `.auto-rule-row`)

**Problem:** `#stab-tools` mixes health report, cleanup actions, distributed-lot regrouping, and automation rules as flat stacked sections separated by 3 repeated inline `style="border-top:1px solid var(--border);margin:20px 0 16px;"` divs, with the automation form/list not visually distinguished as a card the way Notes/History content is.

- [ ] **Step 1: Add the shared divider and card CSS**

Near `.tool-action` (`Index.html:527`), add:

```css
    .settings-section-divider { border-top: 1px solid var(--border); margin: 20px 0 16px; }
    .auto-rules-card {
      background: rgba(0,0,0,0.1); border: 1px solid var(--border);
      border-radius: 10px; padding: 16px; margin-top: 14px;
    }
```

Also locate (`Index.html:375-378`):

```css
    .auto-rule-row {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      background: rgba(0,0,0,0.15); border-radius: 8px; flex-wrap: wrap;
    }
```

Replace with:

```css
    .auto-rule-row {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      background: rgba(0,0,0,0.15); border: 1px solid var(--border); border-radius: 8px; flex-wrap: wrap;
    }
```

- [ ] **Step 2: Replace the 3 inline dividers with the shared class**

Locate the three occurrences (`Index.html:2471, 2489, 2498`), each currently:

```html
      <div style="border-top:1px solid var(--border);margin:20px 0 16px;"></div>
```

Replace **all three** with:

```html
      <div class="settings-section-divider"></div>
```

- [ ] **Step 3: Wrap the automation form + status + rules list in a card**

Locate (`Index.html:2500-2547`):

```html
      <h2>🤖 Points automatiques</h2>
      <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 12px;line-height:1.5;">
        Crée des règles qui ajoutent automatiquement des points à un joueur, selon la régularité de ton choix (tous les jours, certains jours de la semaine, ou tel jour du mois).
      </p>
      <div class="tool-action">
        <div class="tool-action-info">
          <strong>Exécution automatique</strong>
          <span id="autoTriggerStatus">—</span>
        </div>
        <button id="autoTriggerToggleBtn" class="secondary small">…</button>
      </div>

      <div class="add-form" style="margin-top:14px;">
```

Replace with:

```html
      <h2>🤖 Points automatiques</h2>
      <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 12px;line-height:1.5;">
        Crée des règles qui ajoutent automatiquement des points à un joueur, selon la régularité de ton choix (tous les jours, certains jours de la semaine, ou tel jour du mois).
      </p>
      <div class="auto-rules-card">
      <div class="tool-action">
        <div class="tool-action-info">
          <strong>Exécution automatique</strong>
          <span id="autoTriggerStatus">—</span>
        </div>
        <button id="autoTriggerToggleBtn" class="secondary small">…</button>
      </div>

      <div class="add-form" style="margin-top:14px;">
```

Then locate the closing of this section (`Index.html:2547`, right after `<div id="autoRulesList" class="auto-rules-list"></div>` and before `</div>` that closes `#stab-tools`):

```html
      <div id="autoRulesList" class="auto-rules-list"></div>
    </div>

    <!-- ─ Identité de l'app ─ -->
```

Replace with:

```html
      <div id="autoRulesList" class="auto-rules-list"></div>
      </div>
    </div>

    <!-- ─ Identité de l'app ─ -->
```

- [ ] **Step 4: Manual verification**

In the browser, open Paramètres → Outils. Confirm the visual spacing between the four sub-sections (health, cleanup, distributed lots, automations) looks identical to before (same divider spacing), and that the automation form + rule list now sit inside a visibly bordered card matching the visual weight of a `.note-card`. Confirm existing functionality (create/toggle/delete a rule, toggle the trigger) still works unchanged.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "style: harmonize Automatisations section with card styling and shared dividers"
```

---

## Self-Review Notes

- **Spec coverage:** B1–B4 from `docs/superpowers/specs/2026-07-07-refonte-ux-ciblee-design.md` each map 1:1 to Task 1–4.
- **Type/name consistency:** `_notesSearchQuery`/`_allNotesRaw`/`renderNotesBlocks` are new module-level names, checked against existing names in the file (`_flashPlayer`, `_customPhrases`, etc.) — no collisions. `relativeDateLabel` is a new standalone function, no existing function with that name.
- **No placeholders:** every step has literal, exact code — no "add appropriate styling" style instructions.
- **Not a git repo:** as with the previous plan, this working directory had no `.git` at last check. If that is still true, skip the `git add`/`git commit` steps and rely on the file edits alone.
