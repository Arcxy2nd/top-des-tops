# Interface Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated mobile layout mode (drawer nav generated from a single registry, CSS-driven reflow, card-style Historique) to `Index.html`, replacing the current ad-hoc `@media(max-width:640px)` patches.

**Architecture:** A JS `NAV_PAGES` array becomes the single source of truth for top-level navigation, rendering both the existing desktop top-bar and a new mobile drawer. A `body[data-mode]` attribute (persisted in `localStorage`, auto-detected + manually toggleable) drives all mobile layout CSS — no more layout `@media` queries. The Historique table gets a CSS-only "card" transform via `data-label` attributes on cells (no JS duplication of the existing grouped-row renderer).

**Tech Stack:** Vanilla JS/CSS in `Index.html` (Google Apps Script HtmlService, no build step). No test framework for frontend; verification is manual in-browser.

---

### Task 1: NAV_PAGES registry + dynamic desktop nav rendering

**Files:**
- Modify: `Index.html:2149-2154` (remove hardcoded `.nav-btn` buttons, replace with empty container)
- Modify: JS section near `Index.html:8752` (add `NAV_PAGES`, `renderNav()`)

- [ ] **Step 1: Replace hardcoded nav buttons with a container**

Replace lines 2149-2154:
```html
    <button class="nav-btn active" data-tab="tab-dashboard">📊 Dashboard</button>
    <button class="nav-btn" data-tab="tab-inject">✍️ Saisir un Lot</button>
    <button class="nav-btn" data-tab="tab-settings">⚙️ Paramètres</button>
    <button class="nav-btn" data-tab="tab-notes">📝 Notes<span class="nav-count" id="notesCount"></span></button>
    <button class="nav-btn" data-tab="tab-history">📜 Historique<span class="nav-count" id="historyCount"></span></button>
    <button class="nav-btn" data-tab="tab-guide">❓ Guide</button>
```
with:
```html
    <div class="nav-btn-group" id="desktopNavGroup"></div>
```

- [ ] **Step 2: Add NAV_PAGES registry and renderNav() near the NAVIGATION section (before `function goToTab`)**

Insert before `Index.html:8753` (`function goToTab`):
```js
  const NAV_PAGES = [
    { id: 'tab-dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'tab-inject',    icon: '✍️', label: 'Saisir un Lot' },
    { id: 'tab-settings',  icon: '⚙️', label: 'Paramètres' },
    { id: 'tab-notes',     icon: '📝', label: 'Notes', countId: 'notesCount' },
    { id: 'tab-history',   icon: '📜', label: 'Historique', countId: 'historyCount' },
    { id: 'tab-guide',     icon: '❓', label: 'Guide' },
  ];

  function navButtonHtml(page, extraClass) {
    const countSpan = page.countId ? '<span class="nav-count" id="' + page.countId + '"></span>' : '';
    return '<button class="nav-btn' + (extraClass ? ' ' + extraClass : '') + '" data-tab="' + page.id + '">' +
      page.icon + ' ' + page.label + countSpan + '</button>';
  }

  function renderNav() {
    document.getElementById('desktopNavGroup').innerHTML =
      NAV_PAGES.map((p, i) => navButtonHtml(p, i === 0 ? 'active' : '')).join('');
    const drawerList = document.getElementById('drawerNavList');
    if (drawerList) {
      drawerList.innerHTML = NAV_PAGES.map(p => navButtonHtml(p)).join('');
    }
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => goToTab(btn.dataset.tab));
    });
  }
```

- [ ] **Step 3: Remove the old static listener registration and call renderNav() on load**

Replace `Index.html:8764-8766`:
```js
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => goToTab(btn.dataset.tab));
  });
```
with:
```js
  renderNav();
```

- [ ] **Step 4: Update goToTab() to sync active state across both nav copies**

`goToTab` at `Index.html:8753` already does `document.querySelectorAll('.nav-btn')` which will now match both desktop and drawer buttons since both share the `.nav-btn` class — no change needed there.

- [ ] **Step 5: Manual verification**

Open the app in a browser, confirm the top nav renders identically to before (same icons/labels/order), clicking each tab still switches content and highlights the active button.

- [ ] **Step 6: Commit**

```bash
git add Index.html
git commit -m "refactor: generate top nav from NAV_PAGES registry"
```

---

### Task 2: Layout mode state (auto-detect + manual toggle + persistence)

**Files:**
- Modify: `Index.html:2167` area (add mode-toggle button next to theme toggle)
- Modify: JS section near `initTheme()` at `Index.html:8768` (add `initLayoutMode()`)

- [ ] **Step 1: Add a mode-toggle button in the header, after the theme toggle**

At `Index.html:2167`, after:
```html
    <button class="theme-toggle" id="themeToggle" aria-label="Basculer le thème">🌙</button>
```
add:
```html
    <button class="layout-mode-toggle" id="layoutModeToggle" aria-label="Basculer l'affichage mobile/desktop" title="Forcer l'affichage mobile/desktop">🖥️</button>
```

- [ ] **Step 2: Add initLayoutMode(), inserted right after initTheme() definition (near `Index.html:8768`)**

```js
  // ── MODE D'AFFICHAGE (mobile / desktop) ────────────────────────────────
  function resolveLayoutMode(pref) {
    if (pref === 'mobile' || pref === 'desktop') return pref;
    return window.matchMedia('(max-width:640px)').matches ? 'mobile' : 'desktop';
  }

  function applyLayoutMode(mode) {
    document.body.setAttribute('data-mode', mode);
    const btn = document.getElementById('layoutModeToggle');
    if (btn) btn.textContent = mode === 'mobile' ? '📱' : '🖥️';
    const drawer = document.getElementById('mobileDrawer');
    if (drawer && mode !== 'mobile') drawer.classList.remove('open');
  }

  function initLayoutMode() {
    const pref = localStorage.getItem('tdt_layout_mode') || 'auto';
    applyLayoutMode(resolveLayoutMode(pref));
    document.getElementById('layoutModeToggle').addEventListener('click', () => {
      const current = document.body.getAttribute('data-mode');
      const next = current === 'mobile' ? 'desktop' : 'mobile';
      localStorage.setItem('tdt_layout_mode', next);
      applyLayoutMode(next);
    });
  }
```

- [ ] **Step 3: Call initLayoutMode() alongside initTheme() at startup**

Find where `initTheme();` is called at startup (same init block), add `initLayoutMode();` on the next line.

- [ ] **Step 4: Manual verification**

Reload the app, resize the browser window below 640px width — confirm `document.body.getAttribute('data-mode')` becomes `"mobile"` (check via devtools). Click the toggle button, confirm it flips to the opposite mode and stays after reload (persisted).

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "feat: add mobile/desktop layout mode with auto-detect and manual toggle"
```

---

### Task 3: Mobile drawer (nav + theme + who-am-i)

**Files:**
- Modify: `Index.html` navbar block (`Index.html:2143-2169`) — add hamburger button + drawer markup
- Modify: JS near `renderNav()` (Task 1) — wire drawer open/close

- [ ] **Step 1: Add hamburger button at the start of `.nav-container`, right after `appBrand`**

At `Index.html:2148` (after the `</div>` closing `.app-brand`), add:
```html
    <button class="drawer-hamburger" id="drawerHamburger" aria-label="Ouvrir le menu">☰</button>
```

- [ ] **Step 2: Add drawer markup right before `</nav>` (after `Index.html:2168`, before line 2169 `</nav>`)**

```html
  <div class="drawer-overlay" id="drawerOverlay"></div>
  <div class="mobile-drawer" id="mobileDrawer">
    <div class="drawer-section" id="drawerNavList"></div>
    <div class="drawer-section drawer-settings">
      <div class="who-am-i-wrap" id="drawerWhoAmIWrap"></div>
      <button class="theme-toggle" id="drawerThemeToggle" aria-label="Basculer le thème">🌙</button>
    </div>
  </div>
```

- [ ] **Step 3: Wire hamburger + overlay to open/close the drawer, in `renderNav()` or right after it**

Add after the `renderNav();` call site (end of Task 1 Step 3):
```js
  function openDrawer() {
    document.getElementById('mobileDrawer').classList.add('open');
    document.getElementById('drawerOverlay').classList.add('open');
  }
  function closeDrawer() {
    document.getElementById('mobileDrawer').classList.remove('open');
    document.getElementById('drawerOverlay').classList.remove('open');
  }
  document.getElementById('drawerHamburger').addEventListener('click', openDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
  document.querySelectorAll('#drawerNavList .nav-btn').forEach(btn => {
    btn.addEventListener('click', closeDrawer);
  });
```
Note: since `renderNav()` regenerates `#drawerNavList` innerHTML, move the `.nav-btn` click-to-close wiring into `renderNav()` itself, right after the existing listener-attachment loop:
```js
    document.querySelectorAll('#drawerNavList .nav-btn').forEach(btn => {
      btn.addEventListener('click', closeDrawer);
    });
```
(Add this line inside `renderNav()`, defined in Task 1 Step 2, right after the existing `document.querySelectorAll('.nav-btn[data-tab]')...` block. `closeDrawer` must be defined before `renderNav()` is first called — move the `openDrawer`/`closeDrawer` definitions above the `renderNav()` function declaration.)

- [ ] **Step 4: Duplicate theme toggle behavior for the drawer's theme button**

The existing `initTheme()` only wires `#themeToggle`. Change it to wire both buttons: replace the line `const btn = document.getElementById('themeToggle');` and its `addEventListener` in `initTheme()` (around `Index.html:8772-8779`) with a loop over both ids:
```js
    ['themeToggle', 'drawerThemeToggle'].forEach(id => {
      const btn = document.getElementById(id);
      btn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
      btn.addEventListener('click', () => {
        document.body.classList.toggle('light');
        const isLight = document.body.classList.contains('light');
        localStorage.setItem('topsdestops_theme', isLight ? 'light' : 'dark');
        document.querySelectorAll('#themeToggle, #drawerThemeToggle').forEach(b => { b.textContent = isLight ? '☀️' : '🌙'; });
        if (currentChart && currentChartData) { /* existing chart-refresh logic stays here, unchanged */ }
      });
    });
```
Keep any existing chart-refresh code that currently follows the theme toggle listener — only the button-targeting part changes, not the chart logic.

- [ ] **Step 5: Move the who-am-i widget into the drawer on mobile via CSS (not DOM duplication)**

Rather than duplicating the who-am-i dropdown markup/logic (it has its own JS elsewhere), leave `#whoAmIWrap` in place in the header and use CSS in Task 4 to relocate it visually into the drawer's `.drawer-settings` area only when `[data-mode="mobile"]` is active (CSS `order`/flex re-parenting is not possible across DOM trees, so instead: hide `#whoAmIWrap` from the header in mobile mode and show a second, drawer-native trigger). Simplify: keep who-am-i only in the header at all times (it's compact), and drawer contains just nav list + theme toggle. Remove `#drawerWhoAmIWrap` from Step 2's markup — delete that line from the drawer HTML added in Step 2.

- [ ] **Step 6: Manual verification**

Resize below 640px or force mobile mode via the toggle from Task 2. Confirm the hamburger appears, clicking it opens the drawer with the page list and a working theme toggle; clicking a page link navigates and closes the drawer; clicking the overlay closes it too.

- [ ] **Step 7: Commit**

```bash
git add Index.html
git commit -m "feat: add mobile drawer navigation with theme toggle"
```

---

### Task 4: CSS layout rules for mobile mode

**Files:**
- Modify: `Index.html` `<style>` block — add new rules keyed off `[data-mode="mobile"]`, remove/consolidate the old scattered `@media(max-width:640px)` layout rules listed at `Index.html:79,104,625,866,1021,1367,1962,2019,2078` where they affect structural layout (leave purely cosmetic ones, e.g. font-size tweaks, untouched if harmless).

- [ ] **Step 1: Add base mobile-mode rules (hide desktop nav, show hamburger/drawer)**

Add near the end of the `<style>` block (before `</style>` at `Index.html:2139`):
```css
  .drawer-hamburger { display: none; background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--text); padding: 4px 8px; }
  .mobile-drawer {
    position: fixed; top: 0; left: 0; height: 100%; width: 260px;
    background: var(--card-bg, #1a1a1a); transform: translateX(-100%);
    transition: transform 0.25s ease; z-index: 200; padding: 16px; box-sizing: border-box;
    display: flex; flex-direction: column; gap: 16px; overflow-y: auto;
  }
  .mobile-drawer.open { transform: translateX(0); }
  .mobile-drawer .nav-btn { width: 100%; text-align: left; }
  .drawer-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 199;
  }
  .drawer-overlay.open { display: block; }
  .drawer-settings { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }

  body[data-mode="mobile"] .nav-btn-group { display: none; }
  body[data-mode="mobile"] .drawer-hamburger { display: inline-block; }
  body[data-mode="mobile"] .container { padding-left: 8px; padding-right: 8px; }
  body[data-mode="mobile"] .quick-stats-bar { flex-wrap: wrap; }
  body[data-mode="mobile"] .history-filters,
  body[data-mode="mobile"] .hist-filter-section { flex-direction: column; align-items: stretch; }
```

- [ ] **Step 2: Audit the existing `@media(max-width:640px)` blocks and migrate structural ones**

Open each block at the line numbers listed above. For any rule that changes *layout* (flex-direction, display, width, stacking) rather than just cosmetic sizing (font-size, padding tweaks), duplicate the selector under `body[data-mode="mobile"]` instead of `@media`, then delete the old `@media` version once confirmed covered. Keep purely cosmetic `@media` rules as-is (they're harmless at any mode and don't conflict).

This step is manual/exploratory — since exact rule content varies, the acceptance criterion is: after the change, resizing the window narrow with mode forced to `desktop` must NOT trigger the mobile stacking (proving `@media` is no longer driving layout), and forcing `data-mode="mobile"` on a wide screen MUST trigger the stacking.

- [ ] **Step 3: Manual verification**

With devtools open, set `document.body.setAttribute('data-mode','mobile')` on a full-width desktop browser — confirm dashboard/notes/settings sections stack vertically and the drawer/hamburger appear regardless of actual window width. Set back to `'desktop'` on a narrow window (devtools responsive mode) — confirm desktop layout persists.

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "style: drive mobile layout from data-mode attribute instead of media queries"
```

---

### Task 5: Historique card-style layout for mobile

**Files:**
- Modify: `Index.html` — add `data-label` attributes to Historique table cells at render time (JS around `Index.html:7649-7760`, in `_renderHistoryPage` and `renderGroupHeader`)
- Modify: `Index.html` `<style>` block — add card-transform CSS

- [ ] **Step 1: Add data-label to each inserted cell in the Historique renderer**

In `_renderHistoryPage`/`renderGroupHeader` (starting `Index.html:7642`), each `insertCell()` call needs a `data-label` matching its header. E.g. for `dateCell` (`Index.html:7700`) add right after creation:
```js
        dateCell.setAttribute('data-label', 'Date');
```
Repeat for `playerCell` → `'Joueur'`, `catCell` → `'Top'`, and the remaining cells (points, saiseur, actions) further down in the same function — add `.setAttribute('data-label', '<Header Text>')` immediately after each `insertCell()` call, matching the `<th>` labels at `Index.html:2576` (Date, Joueur, Top, Pts, Saiseur).

- [ ] **Step 2: Add the CSS card-transform for the Historique table under mobile mode**

Add to the `<style>` block (same area as Task 4 Step 1):
```css
  body[data-mode="mobile"] #stab-history-entries table,
  body[data-mode="mobile"] #stab-history-entries thead,
  body[data-mode="mobile"] #stab-history-entries tbody,
  body[data-mode="mobile"] #stab-history-entries tr,
  body[data-mode="mobile"] #stab-history-entries td { display: block; width: 100%; }
  body[data-mode="mobile"] #stab-history-entries thead { display: none; }
  body[data-mode="mobile"] #stab-history-entries tr {
    border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; padding: 8px;
  }
  body[data-mode="mobile"] #stab-history-entries td {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 0; border: none;
  }
  body[data-mode="mobile"] #stab-history-entries td[data-label]::before {
    content: attr(data-label); font-weight: 600; color: var(--text-muted); margin-right: 8px;
  }
```

- [ ] **Step 3: Manual verification**

Force mobile mode, open the Historique tab, confirm each row now renders as a bordered card with label/value pairs instead of table columns, and that group rows (multi-entry) still expand/collapse correctly on click.

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "style: render Historique as cards in mobile mode via data-label attributes"
```

---

### Task 6: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Desktop regression**
Force `data-mode="desktop"`. Click through all 6 top-level tabs, confirm identical behavior to before this plan (nav highlighting, counts, tab switching).

- [ ] **Step 2: Mobile regression**
Force `data-mode="mobile"`. Confirm: hamburger visible, top nav hidden, drawer opens/closes via hamburger and overlay, drawer nav navigates and auto-closes, theme toggle works from both header and drawer, Dashboard/Saisie/Notes/Paramètres content stacks without horizontal overflow, Historique renders as cards and groups still expand.

- [ ] **Step 3: Persistence check**
Toggle to mobile, reload the page — confirm it stays in mobile mode. Toggle back to desktop, reload — confirm it stays desktop.

- [ ] **Step 4: Final commit (if any fixes were needed during regression)**
```bash
git add Index.html
git commit -m "fix: address mobile layout regressions found in manual pass"
```
