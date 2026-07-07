# Exploitation desktop/paysage + cache au chargement (Groupe C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use wide-screen real estate on the Dashboard tab (filters + chart side by side above 1400px, desktop mode only) and make the app's boot sequence render instantly from a `localStorage` cache while silently revalidating against the server.

**Architecture:** Both changes are inside `Index.html` only. The layout change is pure CSS gated by an existing `body[data-mode]` attribute + a new `min-width` media query. The caching change follows the exact `localStorage` pattern already used elsewhere in the file (theme/layout/identity prefs) — plain `JSON.stringify`/`parse`, no expiration, always revalidated against the server on every load.

**Tech Stack:** Vanilla JS/HTML/CSS in `Index.html`. No backend changes, no new automated tests (pure front-end rendering/caching, verified manually in-browser as with prior UI-only tasks).

---

## Task 1: Dashboard — filters + chart side by side on wide desktop screens

**Files:**
- Modify: `Index.html:2260` (insert wrapper open, right before `#filtersCard`)
- Modify: `Index.html:2327-2329` (insert wrapper close, right after `#chartCard`)
- Modify: `Index.html` `<style>` block (new `.dashboard-wide-row` media query)

- [ ] **Step 1: Add the CSS**

Near `.card` (`Index.html:194-200`), add:

```css
    .dashboard-wide-row { display: block; }
    @media (min-width: 1400px) {
      body[data-mode="desktop"] .dashboard-wide-row {
        display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: start;
      }
    }
```

- [ ] **Step 2: Open the wrapper before `#filtersCard`**

Locate (`Index.html:2260`):

```html
    <div class="card card-collapsible" id="filtersCard">
```

Replace with:

```html
    <div class="dashboard-wide-row">
    <div class="card card-collapsible" id="filtersCard">
```

- [ ] **Step 3: Close the wrapper after `#chartCard`**

Locate (`Index.html:2327-2331`):

```html
    </div>

  </div>

  <!-- ══ SAISIE LOT ════════════════════════════════════════════════════ -->
```

Replace with:

```html
    </div>
    </div>

  </div>

  <!-- ══ SAISIE LOT ════════════════════════════════════════════════════ -->
```

(The first `</div>` closes `#chartCard`, exactly as before; the new second `</div>` closes `.dashboard-wide-row`; the third `</div>` still closes `#tab-dashboard`, unchanged.)

- [ ] **Step 4: Manual verification**

In the browser, resize the window past 1400px wide in desktop mode — confirm "🔍 Filtres croisés" and "🏆 Total global" sit side by side (filters ~360px on the left, chart filling the rest). Shrink below 1400px — confirm they stack vertically exactly as before. Force mobile mode via the existing toggle at a wide window width — confirm the grid does **not** apply (still stacked), since the rule is gated on `body[data-mode="desktop"]`.

- [ ] **Step 5: Commit** (skip if no git repo — see note at the end of this plan)

```bash
git add Index.html
git commit -m "feat: side-by-side filters/chart layout on wide desktop screens"
```

---

## Task 2: Cache-first boot for entities (players/categories) and app branding

**Files:**
- Modify: `Index.html:4843-4898` (`loadEntities`)
- Modify: `Index.html:3059-3066` (`loadAppBranding`)

**Problem:** Every page load waits for `apiGetSettings`/`apiGetAppSettings` to answer before showing anything but a skeleton. Neither result is cached client-side, so a returning user always sees the same empty-then-populated sequence, even though players/categories/branding rarely change between visits.

- [ ] **Step 1: Extract the entity-rendering side effects into a reusable function**

Locate (`Index.html:4843-4884`):

```javascript
  function loadEntities(onDone) {
    showSkeleton(document.getElementById('playersList'),    { rows: 3, height: 44, tag: 'li' });
    showSkeleton(document.getElementById('categoriesList'), { rows: 3, height: 44, tag: 'li' });
    callServer('apiGetSettings', [], res => {
      cachedPlayers    = res.players    || [];
      cachedCategories = res.categories || [];

      const auSel = document.getElementById('auditFilterAuthor');
      if (auSel) {
        while (auSel.options.length > 1) auSel.remove(1);
        (cachedPlayers || []).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.name; opt.textContent = p.name;
          auSel.appendChild(opt);
        });
      }

      // Remove any players/categories that no longer exist from chip selection
      selectedPlayerChips.forEach(n => { if (!cachedPlayers.find(p => p.name === n)) selectedPlayerChips.delete(n); });
      selectedCategoryChips.forEach(n => { if (!cachedCategories.find(c => c.name === n)) selectedCategoryChips.delete(n); });
      renderPlayerChips();
      renderCategoryChips();

      renderEntityList(document.getElementById('playersList'),    cachedPlayers,    'Players');
      renderEntityList(document.getElementById('categoriesList'), cachedCategories, 'Categories');
      loadBaremeSettings();

      updateHistoryFilters();
      updateDonutPlayerSelect();
      // Les notes dépendent de la liste des joueurs : on rafraîchit si l'onglet est ouvert.
      if (document.getElementById('tab-notes').classList.contains('active')) loadNotes();

      if (document.querySelectorAll('.entry-row').length === 0) addEntryRow();
      renderWhoAmI();

      // applyFilters/loadQuickStats affichent des avatars résolus via cachedPlayers :
      // on les déclenche seulement une fois cachedPlayers rempli, sinon le premier
      // chargement de page rate les avatars (course avec apiGetSettings) et il
      // faut actualiser pour les voir apparaître.
      applyFilters();
      loadQuickStats();
      if (onDone) onDone();

    }, 'Chargement settings', () => {
      // apiGetSettings a échoué : les skeletons affichés au chargement de la page
      // (chart, phrases, listes joueurs/catégories) ne seront jamais nettoyés par
      // applyFilters/loadQuickStats/renderEntityList puisqu'ils ne s'exécutent jamais.
      // On les efface pour ne pas bloquer l'UI.
      clearPhrasesCard();
      document.getElementById('chartSkeleton').style.display = 'none';
      document.getElementById('chartWrapper').style.display  = 'block';
      document.getElementById('playersList').innerHTML    = '';
      document.getElementById('categoriesList').innerHTML = '';
      if (onDone) onDone();
    });
  }
```

Replace the whole function with:

```javascript
  const SETTINGS_CACHE_KEY = 'tdt_cache_settings';

  // Effectue tous les rendus qui dépendent de cachedPlayers/cachedCategories — appelée
  // à la fois pour un rendu instantané depuis le cache et pour le rendu final avec les
  // données fraîches du serveur, afin de ne pas dupliquer cette longue séquence.
  function _paintEntitiesUI() {
    const auSel = document.getElementById('auditFilterAuthor');
    if (auSel) {
      while (auSel.options.length > 1) auSel.remove(1);
      (cachedPlayers || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name; opt.textContent = p.name;
        auSel.appendChild(opt);
      });
    }

    // Remove any players/categories that no longer exist from chip selection
    selectedPlayerChips.forEach(n => { if (!cachedPlayers.find(p => p.name === n)) selectedPlayerChips.delete(n); });
    selectedCategoryChips.forEach(n => { if (!cachedCategories.find(c => c.name === n)) selectedCategoryChips.delete(n); });
    renderPlayerChips();
    renderCategoryChips();

    renderEntityList(document.getElementById('playersList'),    cachedPlayers,    'Players');
    renderEntityList(document.getElementById('categoriesList'), cachedCategories, 'Categories');
    loadBaremeSettings();

    updateHistoryFilters();
    updateDonutPlayerSelect();
    // Les notes dépendent de la liste des joueurs : on rafraîchit si l'onglet est ouvert.
    if (document.getElementById('tab-notes').classList.contains('active')) loadNotes();

    if (document.querySelectorAll('.entry-row').length === 0) addEntryRow();
    renderWhoAmI();

    // applyFilters/loadQuickStats affichent des avatars résolus via cachedPlayers :
    // on les déclenche seulement une fois cachedPlayers rempli, sinon le premier
    // chargement de page rate les avatars (course avec apiGetSettings) et il
    // faut actualiser pour les voir apparaître.
    applyFilters();
    loadQuickStats();
  }

  function loadEntities(onDone) {
    let paintedFromCache = false;
    try {
      const cached = JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || 'null');
      if (cached && cached.players && cached.categories) {
        cachedPlayers    = cached.players;
        cachedCategories = cached.categories;
        _paintEntitiesUI();
        paintedFromCache = true;
      }
    } catch (e) { /* cache corrompu : ignorer, chargement normal */ }

    if (!paintedFromCache) {
      showSkeleton(document.getElementById('playersList'),    { rows: 3, height: 44, tag: 'li' });
      showSkeleton(document.getElementById('categoriesList'), { rows: 3, height: 44, tag: 'li' });
    }

    callServer('apiGetSettings', [], res => {
      cachedPlayers    = res.players    || [];
      cachedCategories = res.categories || [];
      try {
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ players: cachedPlayers, categories: cachedCategories }));
      } catch (e) { /* quota dépassé ou stockage désactivé : cache best-effort, pas bloquant */ }
      _paintEntitiesUI();
      if (onDone) onDone();

    }, 'Chargement settings', () => {
      // apiGetSettings a échoué : si rien n'a pu être peint depuis le cache, les
      // skeletons affichés au chargement (chart, phrases, listes joueurs/catégories)
      // ne seront jamais nettoyés par applyFilters/loadQuickStats/renderEntityList
      // puisqu'ils ne s'exécutent jamais — on les efface pour ne pas bloquer l'UI.
      // Si un rendu depuis le cache a déjà eu lieu, on le laisse tel quel : un échec
      // réseau ne doit pas effacer une interface déjà correctement affichée.
      if (!paintedFromCache) {
        clearPhrasesCard();
        document.getElementById('chartSkeleton').style.display = 'none';
        document.getElementById('chartWrapper').style.display  = 'block';
        document.getElementById('playersList').innerHTML    = '';
        document.getElementById('categoriesList').innerHTML = '';
      }
      if (onDone) onDone();
    });
  }
```

- [ ] **Step 2: Apply the same cache-first pattern to `loadAppBranding`**

Locate (`Index.html:3059-3066`):

```javascript
  function loadAppBranding(onDone) {
    callServer('apiGetAppSettings', [], res => {
      _appSettings = { appTitle: res.appTitle, logoUrl: res.logoUrl };
      applyAppBranding();
      populateAppSettingsForm();
      if (onDone) onDone();
    }, 'Chargement identité app', () => { if (onDone) onDone(); });
  }
```

Replace with:

```javascript
  const APP_SETTINGS_CACHE_KEY = 'tdt_cache_appsettings';

  function loadAppBranding(onDone) {
    try {
      const cached = JSON.parse(localStorage.getItem(APP_SETTINGS_CACHE_KEY) || 'null');
      if (cached) {
        _appSettings = cached;
        applyAppBranding();
      }
    } catch (e) { /* cache corrompu : ignorer, chargement normal */ }

    callServer('apiGetAppSettings', [], res => {
      _appSettings = { appTitle: res.appTitle, logoUrl: res.logoUrl };
      try { localStorage.setItem(APP_SETTINGS_CACHE_KEY, JSON.stringify(_appSettings)); } catch (e) { /* best-effort */ }
      applyAppBranding();
      populateAppSettingsForm();
      if (onDone) onDone();
    }, 'Chargement identité app', () => { if (onDone) onDone(); });
  }
```

- [ ] **Step 3: Manual verification**

In the browser: load the app once (populates the cache). Reload the page — confirm players/categories/branding appear immediately, before the network tab shows `apiGetSettings`/`apiGetAppSettings` completing (visible as no skeleton flash on the second load, or by throttling the network in devtools). Then simulate a network failure for `apiGetSettings` after a cached render (e.g. via devtools "offline" + reload) and confirm the cached players/categories stay visible instead of being cleared.

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "perf: cache-first render for entities and app branding on boot"
```

---

## Self-Review Notes

- **Spec coverage:** C1/C2 from `docs/superpowers/specs/2026-07-07-desktop-layout-et-cache-design.md` map to Task 1/2.
- **Type/name consistency:** `SETTINGS_CACHE_KEY`/`APP_SETTINGS_CACHE_KEY`/`_paintEntitiesUI` checked against existing top-level names (`WHO_AM_I_KEY`, `PHRASE_SETTINGS_KEY`, etc.) — no collisions, same naming convention.
- **Behavior preservation:** the `onError` path for `loadEntities` keeps its original destructive cleanup, now conditional on `paintedFromCache` — when there's no cache, behavior is byte-for-byte identical to before.
- **No placeholders:** every step has literal code.
- **Not a git repo:** as with prior plans, skip the `git add`/`git commit` steps if `.git` still doesn't exist.
