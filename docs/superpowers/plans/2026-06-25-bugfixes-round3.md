# Bugfixes Round 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 bugs: "Qui suis-je?" dropdown clipped by navbar overflow; preset not persisted server-side; cat comments never visible; no reusable collapsible mechanism; avatar stacking not diagonal + bg too cropped.

**Architecture:** All changes are inside the two monolithic files `Index.html` (HTML + CSS + JS) and `Code.gs` (backend GAS). No new files. No feature loss allowed.

**Tech Stack:** Google Apps Script, vanilla HTML/CSS/JS, Google Sheets storage.

---

## Root-cause map

| Bug | Root cause |
|---|---|
| "Qui suis-je?" dropdown vide/invisible | `.navbar { overflow-x: auto }` crée un scroll context qui clip les enfants `position:absolute` — le dropdown s'ouvre mais est hors du clip | 
| Preset re-sélectionné à chaque session | `getActivePresetId()` / `setActivePresetId()` utilisent `localStorage` alors que `apiGetActivePhrasePreset` / `apiSetActivePhrasePreset` existent déjà dans `Code.gs` |
| Commentaires par Top invisibles | La section Dashboard filtre les catégories sans aucune phrase `cat:*` configurée. L'éditeur Paramètres les laisse configurer MAIS son hint text dit faussement "quand exactement un Top est filtré" → utilisateur ne sait pas quoi faire |
| Sections non enroulables / pas réutilisable | Seul `phrasesCard` est collapsible, câblé à la main. Pas de `makeCollapsible()` générique |
| Avatars historique : pas de biais diagonal + bg trop rogné | `.hist-avatar-stack` = overlap horizontal pur. `.row-avatar-bg` width 90px trop étroit |

---

## Task 1 — Fix "Qui suis-je?" dropdown (overflow clipping)

**Files:** Modify `Index.html` CSS ~line 111–118 + JS ~line 6859–6866 + `renderWhoAmI` ~line 3629

**Problem:** `.navbar { overflow-x: auto }` clips `position:absolute` children even when they extend downward. The dropdown opens (`.open` class toggled) but is invisible because the navbar clips it.

**Fix:** Change `.who-am-i-dropdown` to `position: fixed` and compute its coordinates via `getBoundingClientRect()` each time the dropdown opens. Also re-call `renderWhoAmI()` on open to handle any late-loading edge cases.

- [ ] **Step 1: Update `.who-am-i-dropdown` CSS**

Find (line ~111):
```css
.who-am-i-dropdown {
  display: none; position: absolute; top: calc(100% + 6px); right: 0;
  background: var(--card-bg); border: 1px solid var(--border);
```

Replace with:
```css
.who-am-i-dropdown {
  display: none; position: fixed; top: 0; left: 0;
  background: var(--card-bg); border: 1px solid var(--border);
```

Remove any `top: calc(100% + 6px); right: 0;` that remain — those are now set by JS.

- [ ] **Step 2: Update the whoAmIBtn click handler to set fixed coordinates**

Find (line ~6859):
```js
document.getElementById('whoAmIBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('whoAmIWrap').classList.toggle('open');
});
```

Replace with:
```js
document.getElementById('whoAmIBtn').addEventListener('click', e => {
  e.stopPropagation();
  const wrap = document.getElementById('whoAmIWrap');
  const isOpen = wrap.classList.contains('open');
  if (!isOpen) {
    renderWhoAmI();
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdown = document.getElementById('whoAmIDropdown');
    dropdown.style.top  = (rect.bottom + 6) + 'px';
    dropdown.style.left = Math.max(4, rect.right - 220) + 'px';
    dropdown.style.width = '220px';
  }
  wrap.classList.toggle('open');
});
```

- [ ] **Step 3: Verify syntax**

```
node --check Index.html.js
```
(Copy the script block into a `.js` file to check, or rely on visual inspection since this is GAS.)

- [ ] **Step 4: Manual test in browser**
Deploy a new GAS version and verify:
1. Click "Qui suis-je?" button → dropdown appears below the button with all players listed
2. Select a player → button updates with avatar and name
3. Click elsewhere → dropdown closes
4. Re-open → selection persists

---

## Task 2 — Preset persistence server-side

**Files:** Modify `Index.html` JS ~line 2246–2253 (getActivePresetId / setActivePresetId) + init block ~line 6819–6828

**Problem:** `getActivePresetId()` reads `localStorage`; `setActivePresetId()` writes `localStorage`. The server already has `apiGetActivePhrasePreset` / `apiSetActivePhrasePreset` using `PropertiesService.getScriptProperties()` but they're never called.

**Fix:** 
- Add an in-memory `_activePreset` variable (initialized from server on load).
- `getActivePresetId()` returns `_activePreset` (synchronous, fast, no localStorage).
- `setActivePresetId(id)` updates `_activePreset` + fires `apiSetActivePhrasePreset` (fire-and-forget).
- On app init (where phrases are loaded), also load the active preset from server.

- [ ] **Step 1: Add `_activePreset` variable and update the two functions**

Find (line ~2229):
```js
const PHRASES_PRESET_KEY = 'tdt_active_preset';
const PHRASES_DEFAULT_ID  = '__default__';
```

After these two constants, find (line ~2246):
```js
function getActivePresetId() {
  try { return localStorage.getItem(PHRASES_PRESET_KEY) || PHRASES_DEFAULT_ID; }
  catch { return PHRASES_DEFAULT_ID; }
}

function setActivePresetId(id) {
  try { localStorage.setItem(PHRASES_PRESET_KEY, id); } catch {}
}
```

Replace with:
```js
let _activePreset = PHRASES_DEFAULT_ID;

function getActivePresetId() {
  return _activePreset;
}

function setActivePresetId(id) {
  _activePreset = id || PHRASES_DEFAULT_ID;
  callServer('apiSetActivePhrasePreset', [_activePreset], null, 'Sauvegarde preset actif');
}
```

- [ ] **Step 2: Load the active preset from server on init**

Find the init block where `_customPhrases` is loaded (line ~6819). It looks like:
```js
callServer('apiGetPhrases', [], res => {
  _customPhrases = res.phrases || [];
  const hasPhrases = ...
  if (!hasPhrases) {
    // seeding default
    ...
    callServer('apiSavePhrasesBatch', [seed], res => {
      _customPhrases = res.phrases;
      renderPresetChips();
      renderPhrasesEditorSection();
    }, 'Initialisation Défaut');
  } else {
    renderPresetChips();
    renderPhrasesEditorSection();
  }
});
```

Wrap the inner part to first load the active preset:
```js
callServer('apiGetPhrases', [], res => {
  _customPhrases = res.phrases || [];
  // Load active preset from server, then render
  callServer('apiGetActivePhrasePreset', [], presetRes => {
    _activePreset = (presetRes && presetRes.preset) || PHRASES_DEFAULT_ID;
    const hasPhrases = (_customPhrases || []).some(p => p.preset === PHRASES_DEFAULT_ID);
    if (!hasPhrases) {
      const seed = POOL_ORDER.flatMap(pool =>
        (RANKING_PHRASES[pool] || []).map(text => ({ preset: PHRASES_DEFAULT_ID, pool, text })));
      callServer('apiSavePhrasesBatch', [seed], seedRes => {
        _customPhrases = seedRes.phrases;
        renderPresetChips();
        renderPhrasesEditorSection();
      }, 'Initialisation Défaut');
    } else {
      renderPresetChips();
      renderPhrasesEditorSection();
    }
    if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
  }, 'Chargement preset actif');
});
```

Note: Keep the existing code structure — only wrap the inner callback with the `apiGetActivePhrasePreset` call. Read the actual code around line 6810–6830 before editing to match exactly.

- [ ] **Step 3: Remove localStorage fallback**

Search for any remaining references to `PHRASES_PRESET_KEY` and `localStorage` related to presets. There should be none left after Step 1. If any remain in comments, clean them up.

- [ ] **Step 4: Manual test**
1. Open the app, select a preset (e.g., "Mon Preset")
2. Close the browser tab entirely
3. Re-open the app → the same preset should be pre-selected automatically
4. Verify that `apiSetActivePhrasePreset` is called (check Apps Script execution log)

---

## Task 3 — Cat comments: fix hint text + add Dashboard empty state

**Files:** Modify `Index.html` JS ~line 2743–2745 (hint text) + ~line 3068–3097 (`renderPhrasesCard` cat section)

**Problem A:** The Paramètres hint text says "Ces phrases apparaissent dans le Dashboard quand exactement un Top est filtré." — this is wrong. They appear for ALL categories (filtered or not).

**Problem B:** The Dashboard cat section is invisible when no `cat:*` phrases are configured. User never learns they need to add them in Paramètres.

- [ ] **Step 1: Fix wrong hint text in Paramètres**

Find (line ~2744):
```js
hint.textContent = 'Ces phrases apparaissent dans le Dashboard quand exactement un Top est filtré.';
```

Replace with:
```js
hint.textContent = 'Ces phrases apparaissent dans la section "Podium" du Dashboard pour chaque Top. Ajoutez-en pour les voir apparaître.';
```

- [ ] **Step 2: Add empty state in Dashboard when no cat phrases exist**

Find (line ~3068):
```js
if (catItems.length) {
  const section = document.createElement('div');
  section.className = 'phrases-cat-section';
  ...
  list.appendChild(section);
}
```

Replace the entire `if (catItems.length) { ... }` block with:
```js
const section = document.createElement('div');
section.className = 'phrases-cat-section';

const header = document.createElement('div');
header.className = 'phrases-cat-header';
header.textContent = '💬 Commentaires par Top';

const body = document.createElement('div');
body.className = 'phrases-cat-body';

if (catItems.length) {
  catItems.forEach((item, i) => {
    const col = typeof categoryColor === 'function' ? categoryColor(item.cat.name) : 'var(--accent)';
    const el  = document.createElement('div');
    el.className = 'phrase-cat-card';
    el.style.setProperty('--phrase-color', col);
    el.style.animationDelay = (i * 0.05) + 's';
    el.innerHTML =
      '<div class="phrase-cat-header">' +
        '<span>' + escapeHtml(item.cat.icon || '🎯') + '</span>' +
        '<span>' + escapeHtml(item.cat.name) + '</span>' +
      '</div>' +
      '<div class="phrase-cat-text">' + escapeHtml(item.text) + '</div>';
    body.appendChild(el);
  });
} else {
  const emptyEl = document.createElement('div');
  emptyEl.className = 'phrases-cat-empty';
  emptyEl.innerHTML =
    '<span class="phrases-empty-icon">🎯</span>' +
    'Ajoutez des phrases par Top dans <strong>Paramètres → Phrases → "Phrases par Top"</strong> pour les voir ici.';
  body.appendChild(emptyEl);
}

section.appendChild(header);
section.appendChild(body);
list.appendChild(section);
```

- [ ] **Step 3: Add CSS for `.phrases-cat-empty`**

Find the `.cat-phrases-section` CSS block (line ~1585) and add after it:
```css
.phrases-cat-empty {
  font-size: 0.82rem; color: var(--text-muted); font-style: italic;
  padding: 10px 0; display: flex; align-items: center; gap: 8px;
}
.phrases-cat-empty .phrases-empty-icon { font-size: 1.1rem; }
```

- [ ] **Step 4: Manual test**
1. In Dashboard, verify the "Commentaires par Top" section shows the empty state with the instruction message when no cat phrases are configured
2. Go to Paramètres → Phrases → scroll to "Phrases par Top" → add a phrase for one Top
3. Return to Dashboard → re-render (click another chart type or refresh) → the cat phrase should appear

---

## Task 4 — Reusable collapsible + rename "Podium"

**Files:** Modify `Index.html` CSS + HTML + JS

**Problem:** Only `phrasesCard` is collapsible, with hardcoded one-off logic. Other Dashboard sections can't be collapsed. The card header says "Commentaires" — rename to "Podium".

**Fix:** Create a `makeCollapsible(cardEl, storageKey)` function. Apply it to the phrases card (refactoring existing logic) and to other Dashboard sections. Add a collapse toggle `<button>` to each card's header dynamically.

- [ ] **Step 1: Add `makeCollapsible` function**

Find the JS section around the `// Collapse phrases card` block (line ~6849). Replace the hardcoded block with a generic function and its application:

Remove this hardcoded block:
```js
// Collapse phrases card
const PHRASES_COLLAPSED_KEY = 'tdt_phrases_collapsed';
const phrasesCard = document.getElementById('phrasesCard');
const phrasesCollapseBtn = document.getElementById('phrasesCollapseBtn');
if (localStorage.getItem(PHRASES_COLLAPSED_KEY) === '1') phrasesCard.classList.add('collapsed');
phrasesCollapseBtn.addEventListener('click', () => {
  phrasesCard.classList.toggle('collapsed');
  localStorage.setItem(PHRASES_COLLAPSED_KEY, phrasesCard.classList.contains('collapsed') ? '1' : '0');
});
```

Replace with:
```js
function makeCollapsible(cardEl, storageKey) {
  if (!cardEl) return;
  const header = cardEl.querySelector('.card-collapse-header');
  if (!header) return;
  const btn = document.createElement('button');
  btn.className = 'collapse-toggle-btn';
  btn.setAttribute('aria-label', 'Enrouler/Dérouler');
  btn.innerHTML = '<span class="collapse-arrow">▾</span>';
  header.appendChild(btn);
  if (localStorage.getItem(storageKey) === '1') cardEl.classList.add('collapsed');
  btn.addEventListener('click', () => {
    cardEl.classList.toggle('collapsed');
    localStorage.setItem(storageKey, cardEl.classList.contains('collapsed') ? '1' : '0');
  });
}

makeCollapsible(document.getElementById('phrasesCard'),  'tdt_collapsed_podium');
makeCollapsible(document.getElementById('chartCard'),    'tdt_collapsed_chart');
makeCollapsible(document.getElementById('filtersCard'),  'tdt_collapsed_filters');
```

Note: check actual IDs of Dashboard cards before finalizing the `makeCollapsible` calls — read the HTML around line 1626–1800 to find the correct IDs.

- [ ] **Step 2: Add CSS for the generic collapsible mechanism**

Replace or supplement the existing `phrases-card-collapsible` CSS with a generic approach. Find (line ~1131–1134):
```css
.phrases-card-collapsible.collapsed .phrases-collapse-btn { transform: rotate(180deg); }
.phrases-card-collapsible.collapsed #phrasesList { display: none; }
```

Add alongside or replace with:
```css
.collapse-toggle-btn {
  background: none; border: none; cursor: pointer; padding: 4px;
  color: var(--text-muted); transition: color 0.15s;
  display: flex; align-items: center;
}
.collapse-toggle-btn:hover { color: var(--text); }
.collapse-arrow { display: inline-block; transition: transform 0.2s; font-size: 0.8rem; }
.card-collapsible.collapsed .collapse-arrow { transform: rotate(-90deg); }
.card-collapsible.collapsed .card-collapsible-body { display: none; }
```

- [ ] **Step 3: Update phrasesCard HTML header and body**

Find the phrasesCard HTML (line ~1629):
```html
<div class="card phrases-card-collapsible" id="phrasesCard">
  <div class="phrases-card-header">
    <h2>🎭 Commentaires</h2>
    <div style="display:flex;gap:8px;align-items:center;">
      ...
      <button class="phrases-collapse-btn" id="phrasesCollapseBtn">▾</button>
    </div>
  </div>
  <div id="phrasesList" ...>
```

Replace with:
```html
<div class="card card-collapsible" id="phrasesCard">
  <div class="phrases-card-header card-collapse-header">
    <h2>🏆 Podium</h2>
    <div style="display:flex;gap:8px;align-items:center;">
      ... (keep existing buttons: reroll, settings)
      (remove the old phrasesCollapseBtn — makeCollapsible adds it dynamically)
    </div>
  </div>
  <div class="card-collapsible-body" id="phrasesList" ...>
```

Note: Read the actual HTML carefully before editing to preserve existing buttons (`phrasesRerollBtn`, settings icon). Only change: class name, title text, remove old collapse btn, add `card-collapsible-body` class to the body div.

- [ ] **Step 4: Add collapsible headers to other Dashboard cards**

For each other Dashboard card (chart section, filters section), add `card-collapse-header` class to their `<h2>` or header div, and `card-collapsible-body` class to their content div. Then call `makeCollapsible(el, key)`.

Read the Dashboard HTML (line ~1626–1800) to identify the actual card IDs and structure before editing.

- [ ] **Step 5: Clean up old phrases-card-collapsible CSS**

Remove or rename the now-unused `.phrases-card-collapsible` and `.phrases-collapse-btn` CSS rules to avoid confusion.

- [ ] **Step 6: Manual test**
1. Dashboard loads → "Podium" card visible with ▾ button in header
2. Click ▾ → card collapses, arrow rotates
3. Reload page → card stays collapsed (localStorage persists)
4. Other Dashboard sections also collapsible

---

## Task 5 — Avatar stacking diagonal + bg crop fix

**Files:** Modify `Index.html` CSS ~line 872–885 + JS ~line 5722–5738 (group header stack) + CSS ~line 1071–1077 (row-avatar-bg)

### Part A: Diagonal stacking in history

**Problem:** `.hist-avatar-stack` overlaps avatars horizontally only (flat). User wants "file indienne de côté, en biais" — diagonal cascade from top-left to bottom-right.

- [ ] **Step 1: Update `.hist-avatar-stack` CSS**

Find (line ~872):
```css
.hist-avatar-stack {
  display: inline-flex; align-items: center; margin-right: 6px; vertical-align: middle;
}
.hist-avatar-stack .history-avatar { margin-right: -8px; border: 2px solid var(--bg); }
.hist-avatar-stack .history-avatar:last-of-type { margin-right: 0; }
```

Replace with:
```css
.hist-avatar-stack {
  display: inline-flex; align-items: flex-start;
  margin-right: 10px; vertical-align: middle;
  position: relative;
}
.hist-avatar-stack .history-avatar {
  border: 2px solid var(--bg);
  margin-right: -10px;
  transition: transform 0.15s;
}
.hist-avatar-stack .history-avatar:nth-child(2) { transform: translateY(4px); z-index: -1; }
.hist-avatar-stack .history-avatar:nth-child(3) { transform: translateY(8px); z-index: -2; }
.hist-avatar-stack .history-avatar:last-of-type { margin-right: 0; }
```

- [ ] **Step 2: Set z-index on first avatar**

In JS, when building the stack (line ~5725), add `z-index` inline on each avatar so the first is on top:

```js
distinctPlayers.slice(0, 3).forEach((pName, idx) => {
  const pl = cachedPlayers.find(p => p.name === pName);
  const av = document.createElement('img');
  av.className = 'history-avatar';
  av.style.zIndex = String(3 - idx);
  av.style.position = 'relative';
  av.src = getAvatarUrl(pName, pl ? pl.meta : '');
  av.onerror = () => { av.src = getAvatarUrl(pName, ''); };
  stack.appendChild(av);
});
```

### Part B: Fix row-avatar-bg crop in "Saisir un Lot"

**Problem:** `.row-avatar-bg { width: 90px }` too narrow — the avatar is cropped to a thin strip.

- [ ] **Step 3: Update `.row-avatar-bg` CSS**

Find (line ~1071):
```css
.row-avatar-bg {
  position: absolute; right: 0; top: 0; bottom: 0; width: 90px;
  background-size: cover; background-position: center top;
  border-radius: 0 6px 6px 0;
  pointer-events: none; opacity: 0.08;
  transition: background-image 0.35s;
}
```

Replace with:
```css
.row-avatar-bg {
  position: absolute; right: 0; top: 0; bottom: 0; width: 160px;
  background-size: cover; background-position: center top;
  border-radius: 0 6px 6px 0;
  pointer-events: none; opacity: 0.10;
  transition: background-image 0.35s;
  mask-image: linear-gradient(to right, transparent 0%, black 40%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 40%);
}
```

- [ ] **Step 4: Manual test**
1. Go to "Saisir un Lot", select a player with an avatar → the ghost image behind the row is wider and fades in from the left
2. In Historique, find a group entry with 2–3 players → avatars stack diagonally (each one a few pixels lower than the previous)

---

## Self-review checklist

- [ ] No placeholder or TODO in any code step
- [ ] All function names consistent across tasks (`makeCollapsible`, `renderWhoAmI`, `getActivePresetId`)
- [ ] Task 2 init block: verify the actual code structure before editing (nested callbacks, seeding condition)
- [ ] Task 4: verify actual card IDs in Dashboard HTML before calling `makeCollapsible`
- [ ] Task 4: old `phrasesCollapseBtn` ID removed from HTML + JS after refactor
- [ ] Task 1: `right` and `top` CSS properties removed from `.who-am-i-dropdown` rule (now set by JS)
- [ ] No localStorage for preset (Task 2) — no remaining `PHRASES_PRESET_KEY` reads

---

## Execution options

**Plan saved to `docs/superpowers/plans/2026-06-25-bugfixes-round3.md`.**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks

**2. Inline Execution** — execute tasks in this session with checkpoints
