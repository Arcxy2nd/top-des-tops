# Interface mobile dédiée Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer `Mobile.html`, une interface mobile dédiée (les mêmes 7 onglets que `Index.html`, redessinés pour le tactile), servie automatiquement sur petit écran, avec bascule manuelle mémorisée vers/depuis `Index.html`, sans dupliquer le registre de menu entre les deux fichiers.

**Architecture:** Le registre `NAV_PAGES` (liste des 7 onglets) déménage de `Index.html` vers `Code.gs`, exposé par un nouvel endpoint `apiGetNavPages()`. `doGet(e)` route sur `?view=mobile|desktop`, et sert une micro-page de redirection (générée en JS inline dans `Code.gs`, pas de fichier séparé) quand aucun paramètre n'est fourni. `Mobile.html` est un fichier HTML/CSS/JS autonome qui réutilise tous les endpoints `api*` existants (aucune nouvelle route serveur hormis `apiGetNavPages`), avec ses propres copies des petites fonctions utilitaires client (`callServer`, `showToast`, `startBtnLoading`, `buzz`, `getAvatarUrl`, `escapeHtml`, `hashColor`/`playerColor`/`categoryColor`) — compromis assumé par la spec pour éviter un fichier `include()` supplémentaire.

**Tech Stack:** Google Apps Script (`Code.gs`, ES6 subset), HTML/CSS/JS vanilla (`Index.html`, `Mobile.html`), Chart.js (CDN, déjà chargé), Node.js test harness (`node:test` + VM sandbox, `tests/harness.js`). Pas de build, pas de dépendances npm, pas de dépôt git dans ce projet — les étapes de fin de tâche s'appellent « Sauvegarder l'état » (pas de commande git nulle part dans ce plan).

---

## Contraintes projet à respecter

- `Code.gs` et `Index.html` restent des fichiers uniques, monolithiques — **un seul fichier est ajouté** : `Mobile.html`. Total : 4 fichiers de code (`Code.gs`, `AutoPoints.gs`, `Index.html`, `Mobile.html`).
- Avatar obligatoire partout où un nom de joueur apparaît (liste, carte, historique, classement, commentaire, sélecteur d'identité).
- Zéro perte de fonctionnalité côté desktop (`Index.html`) — seul le chargement du menu passe d'une constante locale à un appel serveur.
- Code en anglais, commentaires en français uniquement pour le non-évident.
- Aucun placeholder — chaque fonction écrite est intégralement implémentée.
- Pas de commande git (`git rev-parse` échoue dans ce projet — ce n'est pas un dépôt git). Chaque étape de fin de tâche est un simple point de sauvegarde de fichier, pas un commit.

---

### Task 1: Backend — `NAV_PAGES` + `apiGetNavPages()` dans `Code.gs`, test Node, mise à jour du harness

**Files:**
- Modify: `Code.gs` (insertion après la ligne 10, avant `// ─── CONFIG SERVICE`)
- Modify: `tests/harness.js` (ligne 106-112 — épilogue d'exports)
- Create: `tests/nav-pages.test.js`

- [ ] **Step 1: Insérer `NAV_PAGES` et `apiGetNavPages()` dans `Code.gs`**

Repérer dans `Code.gs` la fin du bloc de commentaire d'en-tête et le début de `ConfigService` :

```javascript
 * AutoRules : automatic point-granting rules (optional sheet, auto-created — see AutoPoints.gs)
 */

// ─── CONFIG SERVICE ────────────────────────────────────────────────────────────
const ConfigService = (() => {
```

Insérer le bloc suivant JUSTE ENTRE le `*/` de fin de commentaire et le commentaire `// ─── CONFIG SERVICE`  :

```javascript
// ─── NAVIGATION REGISTRY ───────────────────────────────────────────────────────
// Single source of truth for "which tabs exist, in what order, with which icon".
// Consumed by both Index.html (desktop) and Mobile.html via apiGetNavPages() —
// adding/removing/reordering a tab only ever requires editing this array.
const NAV_PAGES = [
  { id: 'tab-dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'tab-inject',    icon: '✍️', label: 'Saisir un Lot' },
  { id: 'tab-settings',  icon: '⚙️', label: 'Paramètres' },
  { id: 'tab-notes',     icon: '📝', label: 'Notes', countId: 'notesCount' },
  { id: 'tab-history',   icon: '📜', label: 'Historique', countId: 'historyCount' },
  { id: 'tab-outils',    icon: '🔧', label: 'Outils' },
  { id: 'tab-guide',     icon: '❓', label: 'Guide' },
];

function apiGetNavPages() {
  try {
    return { success: true, pages: NAV_PAGES };
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 2: Vérifier la syntaxe**

```bash
node --check Code.gs
```

Expected: aucune sortie (exit 0).

- [ ] **Step 3: Mettre à jour `tests/harness.js` — exporter `NAV_PAGES` et `apiGetNavPages`**

Dans `tests/harness.js`, repérer l'épilogue (lignes 106-112) :

```javascript
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, apiRemoveFromGroup, ' +
    'AutoPointsService, apiGetAutoRules, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
```

Remplacer par (ajout de `NAV_PAGES` et `apiGetNavPages`) :

```javascript
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, apiRemoveFromGroup, ' +
    'AutoPointsService, apiGetAutoRules, NAV_PAGES, apiGetNavPages, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
```

- [ ] **Step 4: Créer `tests/nav-pages.test.js`**

```javascript
'use strict';
const { test } = require('node:test');
const assert   = require('assert');
const { loadGas } = require('./harness.js');

test('NAV_PAGES has exactly the 7 documented tabs, in order', () => {
  const gas = loadGas();
  const ids = gas.NAV_PAGES.map(p => p.id);
  assert.deepStrictEqual(ids, [
    'tab-dashboard', 'tab-inject', 'tab-settings',
    'tab-notes', 'tab-history', 'tab-outils', 'tab-guide'
  ]);
});

test('NAV_PAGES includes the previously-missing Outils entry', () => {
  const gas = loadGas();
  const outils = gas.NAV_PAGES.find(p => p.id === 'tab-outils');
  assert.ok(outils, 'tab-outils entry must exist');
  assert.strictEqual(outils.icon, '🔧');
  assert.strictEqual(outils.label, 'Outils');
});

test('every NAV_PAGES entry has a non-empty id, icon and label', () => {
  const gas = loadGas();
  gas.NAV_PAGES.forEach(p => {
    assert.ok(p.id && p.id.trim(),    'id must be non-empty');
    assert.ok(p.icon && p.icon.trim(), 'icon must be non-empty');
    assert.ok(p.label && p.label.trim(), 'label must be non-empty');
  });
});

test('apiGetNavPages returns success:true and the full NAV_PAGES array', () => {
  const gas = loadGas();
  const res = gas.apiGetNavPages();
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(res.pages, gas.NAV_PAGES);
  assert.strictEqual(res.pages.length, 7);
});

test('apiGetNavPages: notes and history entries carry their countId', () => {
  const gas = loadGas();
  const res = gas.apiGetNavPages();
  const notes   = res.pages.find(p => p.id === 'tab-notes');
  const history = res.pages.find(p => p.id === 'tab-history');
  assert.strictEqual(notes.countId, 'notesCount');
  assert.strictEqual(history.countId, 'historyCount');
});
```

- [ ] **Step 5: Lancer les tests**

```bash
npm test -- --test-name-pattern "NAV_PAGES|apiGetNavPages"
```

Expected: 5 tests PASS.

- [ ] **Step 6: Lancer toute la suite pour confirmer l'absence de régression**

```bash
npm test
```

Expected: tous les tests existants + les 5 nouveaux PASS.

- [ ] **Step 7: Sauvegarder l'état**

Le fichier est en bon état de marche (`node --check Code.gs` propre, tests verts). Continuer vers la tâche suivante sans action supplémentaire (pas de dépôt git dans ce projet).

---

### Task 2: Backend — `doGet(e)` : routage par device + page de redirection inline

**Files:**
- Modify: `Code.gs` (lignes 836-840 — `doGet`)
- Modify: `tests/harness.js` (mock `HtmlService.createHtmlOutput`)
- Create: `tests/doget-routing.test.js`

- [ ] **Step 1: Remplacer `doGet()` dans `Code.gs`**

Repérer (~ligne 836) :

```javascript
// ─── API ENDPOINTS ─────────────────────────────────────────────────────────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Tops des Tops')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

Remplacer par :

```javascript
// ─── API ENDPOINTS ─────────────────────────────────────────────────────────────

/**
 * Device routing: ?view=mobile serves Mobile.html, ?view=desktop serves Index.html.
 * With no ?view param (first visit / bare /exec URL), serves a tiny inline
 * redirect page: it checks localStorage for a remembered choice, falls back to
 * a screen-width check, then reloads the same URL with ?view=<mobile|desktop>.
 */
function doGet(e) {
  const view = e && e.parameter ? e.parameter.view : null;

  if (view === 'mobile') {
    return HtmlService.createHtmlOutputFromFile('Mobile')
      .setTitle('Tops des Tops')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (view === 'desktop') {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Tops des Tops')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutput(_deviceRedirectBootstrapHtml())
    .setTitle('Tops des Tops')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inline redirect bootstrap — a handful of lines, not worth a separate HTML file.
 * Reads the same 'tdt_layout_mode' localStorage key the in-app toggle writes, so a
 * manual choice made from inside the app is honored on the very next cold load.
 */
function _deviceRedirectBootstrapHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tops des Tops</title>
</head>
<body style="background:#0b0c10;color:#e0e6ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div>Chargement…</div>
  <script>
    (function() {
      var pref = null;
      try { pref = localStorage.getItem('tdt_layout_mode'); } catch (e) {}
      var view = (pref === 'mobile' || pref === 'desktop')
        ? pref
        : (window.matchMedia('(max-width:640px)').matches ? 'mobile' : 'desktop');
      var url = new URL(window.location.href);
      url.searchParams.set('view', view);
      window.location.href = url.toString();
    })();
  </script>
</body>
</html>`;
}
```

- [ ] **Step 2: Vérifier la syntaxe**

```bash
node --check Code.gs
```

Expected: aucune sortie.

- [ ] **Step 3: Mettre à jour `tests/harness.js` — mocker `HtmlService.createHtmlOutput`**

Repérer dans `gasMocks()` (~ligne 92-95) :

```javascript
    HtmlService: {
      createHtmlOutputFromFile: () => ({ setTitle: () => ({ setXFrameOptionsMode: () => {} }) }),
      XFrameOptionsMode: { ALLOWALL: 1 }
    },
```

Remplacer par (le mock capture le nom de fichier demandé et le HTML brut passé à `createHtmlOutput`, pour que les tests puissent les inspecter) :

```javascript
    HtmlService: {
      createHtmlOutputFromFile: name => ({
        _file: name,
        setTitle() { return this; },
        setXFrameOptionsMode() { return this; }
      }),
      createHtmlOutput: html => ({
        _html: html,
        setTitle() { return this; },
        setXFrameOptionsMode() { return this; }
      }),
      XFrameOptionsMode: { ALLOWALL: 1 }
    },
```

- [ ] **Step 4: Exporter `doGet` et `_deviceRedirectBootstrapHtml` dans l'épilogue**

Dans `tests/harness.js`, reprendre la ligne modifiée à la Task 1 et ajouter `doGet` et `_deviceRedirectBootstrapHtml` :

```javascript
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, apiRemoveFromGroup, ' +
    'AutoPointsService, apiGetAutoRules, NAV_PAGES, apiGetNavPages, doGet, _deviceRedirectBootstrapHtml, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
```

- [ ] **Step 5: Créer `tests/doget-routing.test.js`**

```javascript
'use strict';
const { test } = require('node:test');
const assert   = require('assert');
const { loadGas } = require('./harness.js');

test('doGet with ?view=mobile serves Mobile.html', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'mobile' } });
  assert.strictEqual(out._file, 'Mobile');
});

test('doGet with ?view=desktop serves Index.html', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'desktop' } });
  assert.strictEqual(out._file, 'Index');
});

test('doGet with no parameters serves the inline redirect bootstrap', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: {} });
  assert.ok(typeof out._html === 'string', 'must serve inline HTML, not a named file');
  assert.ok(out._html.includes('tdt_layout_mode'), 'reads the same localStorage key the toggle writes');
  assert.ok(out._html.includes("matchMedia('(max-width:640px)')"), 'falls back to a width check');
});

test('doGet with undefined event object serves the inline redirect bootstrap', () => {
  const gas = loadGas();
  const out = gas.doGet(undefined);
  assert.ok(typeof out._html === 'string');
});

test('doGet with an unrecognized ?view value falls back to the redirect bootstrap', () => {
  const gas = loadGas();
  const out = gas.doGet({ parameter: { view: 'tablet' } });
  assert.ok(typeof out._html === 'string');
});

test('_deviceRedirectBootstrapHtml sets the view param and reloads via window.location.href', () => {
  const gas  = loadGas();
  const html = gas._deviceRedirectBootstrapHtml();
  assert.ok(html.includes("url.searchParams.set('view', view)"));
  assert.ok(html.includes('window.location.href = url.toString()'));
});
```

- [ ] **Step 6: Lancer les tests**

```bash
npm test -- --test-name-pattern "doGet|_deviceRedirectBootstrapHtml"
```

Expected: 6 tests PASS.

- [ ] **Step 7: Lancer toute la suite**

```bash
npm test
```

Expected: tous les tests PASS (aucune régression).

- [ ] **Step 8: Sauvegarder l'état**

Fichier stable, tests verts. Continuer vers la tâche suivante.

---

### Task 3: Frontend `Index.html` — `NAV_PAGES` chargé depuis le serveur + bascule 📱/🖥️ persistée

**Files:**
- Modify: `Index.html` (lignes 8936-8944 — suppression de la constante locale + `renderNav`/`goToTab`)
- Modify: `Index.html` (lignes 8988-9010 — bascule de mode via `?view=`)

- [ ] **Step 1: Supprimer la constante locale `NAV_PAGES` et charger via le serveur**

Repérer (~ligne 8936-8944) :

```javascript
  // ── NAVIGATION ───────────────────────────────────────────────────────
  const NAV_PAGES = [
    { id: 'tab-dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'tab-inject',    icon: '✍️', label: 'Saisir un Lot' },
    { id: 'tab-settings',  icon: '⚙️', label: 'Paramètres' },
    { id: 'tab-notes',     icon: '📝', label: 'Notes', countId: 'notesCount' },
    { id: 'tab-history',   icon: '📜', label: 'Historique', countId: 'historyCount' },
    { id: 'tab-guide',     icon: '❓', label: 'Guide' },
  ];
```

Remplacer par (variable mutable, remplie par `apiGetNavPages`) :

```javascript
  // ── NAVIGATION ───────────────────────────────────────────────────────
  // NAV_PAGES n'est plus une constante locale : elle vient du serveur
  // (apiGetNavPages, source commune avec Mobile.html) pour qu'ajouter/retirer un
  // onglet ne nécessite qu'une seule modification, côté Code.gs.
  let NAV_PAGES = [];
```

- [ ] **Step 2: Remplacer l'appel direct à `renderNav()` par un chargement serveur**

Repérer (~ligne 8984-8985) :

```javascript
  renderNav();
  document.getElementById('drawerHamburger').addEventListener('click', openDrawer);
```

Remplacer par :

```javascript
  callServer('apiGetNavPages', [], res => {
    NAV_PAGES = res.pages;
    renderNav();
  }, 'Chargement du menu');
  document.getElementById('drawerHamburger').addEventListener('click', openDrawer);
```

- [ ] **Step 3: Adapter `goToTab` pour router `tab-outils` vers le sous-onglet Outils existant de Paramètres**

`apiGetNavPages()` introduit une entrée `tab-outils` qui n'a pas d'équivalent `<div id="tab-outils" class="tab-content">` côté desktop — le contenu Outils existe déjà comme sous-onglet de Paramètres (`#stab-tools`, bouton `.settings-nav-btn[data-stab="stab-tools"]`, ~ligne 2408). Plutôt que de restructurer Paramètres (hors périmètre de la spec), `goToTab` route ce cas spécial vers l'onglet Paramètres puis clique son sous-onglet Outils.

Repérer (~ligne 8974-8982) :

```javascript
  function goToTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.nav-btn[data-tab="' + tabId + '"]').forEach(el => el.classList.add('active'));
    if (tabId === 'tab-history') { currentHistoryPage = 1; clearHistPrefetchCache(); loadHistoryPage(1); }
    if (tabId === 'tab-notes')   { loadNotes(); }
    if (tabId === 'tab-guide')   { initGuideAccordion(); }
  }
```

Remplacer par :

```javascript
  function goToTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    // tab-outils n'a pas de <div> propre côté desktop : son contenu vit dans le
    // sous-onglet Outils de Paramètres. On affiche Paramètres puis on bascule
    // sur ce sous-onglet, sans dupliquer le HTML existant.
    const realTabId = tabId === 'tab-outils' ? 'tab-settings' : tabId;
    document.getElementById(realTabId).classList.add('active');
    document.querySelectorAll('.nav-btn[data-tab="' + tabId + '"]').forEach(el => el.classList.add('active'));
    if (tabId === 'tab-outils') {
      const toolsBtn = document.querySelector('.settings-nav-btn[data-stab="stab-tools"]');
      if (toolsBtn) toolsBtn.click();
    }
    if (tabId === 'tab-history') { currentHistoryPage = 1; clearHistPrefetchCache(); loadHistoryPage(1); }
    if (tabId === 'tab-notes')   { loadNotes(); }
    if (tabId === 'tab-guide')   { initGuideAccordion(); }
  }
```

- [ ] **Step 4: Bascule 📱/🖥️ — écrire `tdt_layout_mode` et recharger sur `?view=`**

Repérer (~ligne 9001-9010) :

```javascript
  function initLayoutMode() {
    const pref = localStorage.getItem('tdt_layout_mode') || 'auto';
    applyLayoutMode(resolveLayoutMode(pref));
    document.getElementById('layoutModeToggle').addEventListener('click', () => {
      const current = document.body.getAttribute('data-mode');
      const next = current === 'mobile' ? 'desktop' : 'mobile';
      localStorage.setItem('tdt_layout_mode', next);
      applyLayoutMode(next);
    });
```

Remplacer le contenu du listener de clic (garder `initLayoutMode` et le reste de la fonction inchangés, seul le corps du listener change) par :

```javascript
  function initLayoutMode() {
    const pref = localStorage.getItem('tdt_layout_mode') || 'auto';
    applyLayoutMode(resolveLayoutMode(pref));
    document.getElementById('layoutModeToggle').addEventListener('click', () => {
      const current = document.body.getAttribute('data-mode');
      const next = current === 'mobile' ? 'desktop' : 'mobile';
      localStorage.setItem('tdt_layout_mode', next);
      // Le choix manuel bascule maintenant vers l'autre FICHIER (Mobile.html a sa
      // propre mise en page — le CSS data-mode local ne suffit plus à basculer).
      const url = new URL(window.location.href);
      url.searchParams.set('view', next);
      window.location.href = url.toString();
    });
```

- [ ] **Step 5: Vérification manuelle**

Ouvrir `Index.html` via l'URL `/exec?view=desktop` (déployée) : le menu s'affiche identique à avant (7 boutons desktop nav + drawer), y compris un nouveau bouton "🔧 Outils" qui ouvre Paramètres → sous-onglet Outils. Cliquer sur le bouton 🖥️/📱 : l'URL doit se recharger avec `?view=mobile`.

- [ ] **Step 6: Sauvegarder l'état**

`Index.html` fonctionne à l'identique côté contenu, menu chargé dynamiquement, bascule redirigeant vers `?view=`. Continuer vers la tâche suivante.

---

### Task 4: `Mobile.html` — squelette, thème, helpers dupliqués, identité, navigation

**Files:**
- Create: `Mobile.html`

- [ ] **Step 1: Créer `Mobile.html` avec le head, le thème et le layout de base**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=0">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#0b0c10" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#f0f2f5" media="(prefers-color-scheme: light)">
  <title>Tops des Tops</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <style>
    :root {
      --bg: #0b0c10; --card: #1f2833; --border: #2a313d;
      --accent: #ff4757; --accent-hover: #ff6b81;
      --text: #e0e6ed; --text-muted: #9aa5be;
      --success: #2ed573; --error: #ff4757;
      --warn: #ffa502; --info: #7c8cff; --clean: #17a2b8;
      --btn-alt: #353b48; --tap-min: 48px;
    }
    body.light {
      --bg: #f0f2f5; --card: #ffffff; --border: #d1d5db;
      --accent: #e53e3e; --accent-hover: #c53030;
      --text: #1a202c; --text-muted: #4a5568;
      --warn: #d97706; --info: #4f5fd6; --clean: #0e7490;
      --btn-alt: #e2e8f0;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--text);
      margin: 0; padding: 0 0 calc(64px + env(safe-area-inset-bottom)) 0;
      transition: background 0.2s, color 0.2s;
      -webkit-tap-highlight-color: transparent;
    }
    button { touch-action: manipulation; }
    .card {
      background: var(--card); padding: 16px;
      border-radius: 14px; border: 1px solid var(--border);
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      margin-bottom: 14px;
    }
    h2 { margin: 0 0 12px 0; font-size: 1.1rem; color: var(--text); }
    h3 { font-size: 0.9rem; color: var(--text-muted); margin: 0 0 10px 0; }
    select, input[type="text"], input[type="url"], input[type="date"],
    input[type="number"], input[type="password"], textarea {
      padding: 12px 14px; border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg); color: var(--text);
      font-size: 16px; /* empêche le zoom auto iOS */
      outline: none; width: 100%; min-height: var(--tap-min);
      touch-action: manipulation; font-family: inherit;
    }
    select:focus, input:focus, textarea:focus { border-color: var(--accent); }
    button {
      padding: 12px 18px; border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--btn-alt); color: var(--text);
      font-size: 0.95rem; font-weight: 600;
      cursor: pointer; min-height: var(--tap-min);
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    button.danger  { background: var(--error); color: #fff; border-color: var(--error); }
    button.small   { padding: 8px 12px; font-size: 0.82rem; min-height: 36px; }
    button:disabled { opacity: 0.55; cursor: default; }
    .m-container { max-width: 640px; margin: 0 auto; padding: 12px max(12px, env(safe-area-inset-left)) 12px max(12px, env(safe-area-inset-right)); }
    .m-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: var(--btn-alt); }
    .m-avatar.sm { width: 24px; height: 24px; }
    .m-row { display: flex; align-items: center; gap: 10px; }
    .m-tab { display: none; }
    .m-tab.active { display: block; animation: mFadeIn 0.2s ease; }
    @keyframes mFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .m-empty { text-align: center; color: var(--text-muted); padding: 24px 8px; font-size: 0.9rem; }

    /* ── HEADER ── */
    .m-header {
      position: sticky; top: 0; z-index: 50;
      display: flex; align-items: center; gap: 8px;
      background: var(--card); border-bottom: 1px solid var(--border);
      padding: max(10px, env(safe-area-inset-top)) 12px 10px 12px;
    }
    .m-header-title { font-weight: 800; font-size: 1.05rem; color: var(--accent); flex: 1; }
    .m-header-btn {
      background: var(--btn-alt); border: none; border-radius: 20px;
      min-height: 40px; padding: 6px 10px; font-size: 1rem;
    }
    .m-identity-btn {
      display: flex; align-items: center; gap: 6px;
      background: var(--btn-alt); border: none; border-radius: 20px;
      padding: 4px 10px 4px 4px; min-height: 40px; font-size: 0.8rem; font-weight: 600;
    }
    .m-identity-name { max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ── BOTTOM NAV ── */
    .m-bottom-nav {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
      display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch;
      background: var(--card); border-top: 1px solid var(--border);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .m-nav-btn {
      flex: 1 0 13.5%; min-width: 52px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 2px;
      background: transparent; border: none; border-radius: 0;
      color: var(--text-muted); font-size: 0.62rem; font-weight: 600;
      padding: 8px 2px; min-height: 56px;
    }
    .m-nav-btn.active { color: var(--accent); }
    .m-nav-icon { font-size: 1.25rem; position: relative; }
    .m-nav-count {
      position: absolute; top: -4px; right: -10px;
      background: var(--accent); color: #fff; border-radius: 8px;
      font-size: 0.55rem; font-weight: 700; padding: 1px 4px; min-width: 14px;
    }

    /* ── MODAL / TOAST (repris à l'identique, plomberie stable) ── */
    #mModalBackdrop {
      display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.55);
      z-index: 200; align-items: flex-end; justify-content: center;
    }
    #mModalBox {
      background: var(--card); border-radius: 16px 16px 0 0; padding: 18px;
      width: 100%; max-width: 640px; max-height: 88vh; overflow-y: auto;
    }
    #mToastContainer { position: fixed; bottom: calc(72px + env(safe-area-inset-bottom)); left: 12px; right: 12px; z-index: 300; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .m-toast {
      background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      padding: 10px 16px; font-size: 0.85rem; box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      animation: mFadeIn 0.2s ease;
    }
    .m-toast.success { border-color: var(--success); color: var(--success); }
    .m-toast.error   { border-color: var(--error);   color: var(--error); }

    /* ── ACCORDION (Dashboard filtres / Guide) ── */
    .m-accordion-head {
      display: flex; align-items: center; justify-content: space-between;
      cursor: pointer; font-weight: 700; font-size: 0.9rem;
    }
    .m-accordion-body { display: none; padding-top: 10px; }
    .m-accordion.open .m-accordion-body { display: block; }
    .m-accordion.open .m-accordion-arrow { transform: rotate(180deg); }
    .m-accordion-arrow { transition: transform 0.2s; }

    /* ── CHIPS (filtres joueurs/catégories) ── */
    .m-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .m-chip {
      display: flex; align-items: center; gap: 5px;
      background: var(--btn-alt); border: 1px solid var(--border); border-radius: 16px;
      padding: 5px 10px 5px 5px; font-size: 0.78rem; cursor: pointer;
    }
    .m-chip.active { border-color: var(--accent); color: var(--accent); font-weight: 700; }

    /* ── HISTORY CARDS ── */
    .m-hist-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 8px; background: var(--bg); }
    .m-hist-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .m-hist-pts { margin-left: auto; font-weight: 800; color: var(--accent); }
    .m-hist-meta { font-size: 0.75rem; color: var(--text-muted); }
    .m-hist-desc { font-size: 0.82rem; margin-top: 4px; }
    .m-hist-actions { display: flex; gap: 6px; margin-top: 8px; }
  </style>
</head>
<body>

<div class="m-header">
  <img class="m-avatar sm" id="mBrandLogo" src="" alt="" style="display:none;">
  <span class="m-header-title" id="mHeaderTitle">Tops des Tops</span>
  <button class="m-header-btn" id="mThemeToggle" aria-label="Basculer le thème">🌙</button>
  <button class="m-header-btn" id="mViewToggle" title="Basculer vers la version PC">🖥️</button>
  <div class="m-identity-btn" id="mIdentityBtn">
    <img class="m-avatar sm" id="mIdentityAvatar" src="" alt="">
    <span class="m-identity-name" id="mIdentityName">?</span>
  </div>
</div>

<div id="mIdentitySheet" class="m-tab" style="position:fixed; inset:0; z-index:150; background:rgba(0,0,0,0.55); display:none; align-items:flex-end; justify-content:center;">
  <div class="card" style="width:100%; max-width:640px; max-height:70vh; overflow-y:auto; border-radius:16px 16px 0 0; margin:0;">
    <h2>Qui suis-je ?</h2>
    <div id="mIdentityList"></div>
    <button class="small" id="mIdentityCancel" style="margin-top:10px; width:100%;">Fermer</button>
  </div>
</div>

<div id="mIdentityPwdModal" style="display:none; position:fixed; inset:0; z-index:160; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
  <div class="card" style="width:88%; max-width:360px; margin:0; text-align:center;">
    <img class="m-avatar" id="mIdentityPwdAvatar" src="" alt="" style="width:56px; height:56px; margin:0 auto 10px;">
    <h2 id="mIdentityPwdName">—</h2>
    <input type="password" id="mIdentityPwdInput" placeholder="Mot de passe" style="margin-bottom:8px;">
    <div id="mIdentityPwdError" style="display:none; color:var(--error); font-size:0.8rem; margin-bottom:8px;">Mot de passe incorrect.</div>
    <div class="m-row" style="justify-content:center; gap:10px;">
      <button class="small" id="mIdentityPwdCancel">Annuler</button>
      <button class="primary small" id="mIdentityPwdSubmit">Valider</button>
    </div>
  </div>
</div>

<div class="m-container">
  <div id="tab-dashboard" class="m-tab"></div>
  <div id="tab-inject"    class="m-tab"></div>
  <div id="tab-settings"  class="m-tab"></div>
  <div id="tab-notes"     class="m-tab"></div>
  <div id="tab-history"   class="m-tab"></div>
  <div id="tab-outils"    class="m-tab"></div>
  <div id="tab-guide"     class="m-tab"></div>
</div>

<div id="mModalBackdrop">
  <div id="mModalBox"></div>
</div>
<div id="mToastContainer"></div>

<nav class="m-bottom-nav" id="mBottomNav"></nav>

<script>
  // ══════════════════════════════════════════════════════════════════════
  // HELPERS DUPLIQUÉS — plomberie technique stable, dupliquée depuis Index.html
  // faute de mécanisme de partage JS entre fichiers HTML en Apps Script sans
  // ajouter un fichier (exclu par la spec). Ce n'est pas la duplication que la
  // règle DRY cible ici (menus/listes métier) : c'est un compromis assumé.
  // ══════════════════════════════════════════════════════════════════════

  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function getAvatarUrl(name, meta) {
    if (meta && meta.trim()) return meta.trim();
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) +
           '&background=2a313d&color=e0e6ed&bold=true&size=64';
  }

  const PALETTE = [
    '#ff4757','#00d4aa','#ffd166','#6c63ff','#ff6b81','#3742fa',
    '#ff9f43','#10ac84','#5f27cd','#ee5253','#48dbfb','#1dd1a1',
    '#f368e0','#54a0ff','#feca57','#ff6348'
  ];
  function hashColor(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function playerColor(name) {
    const p = cachedPlayers.find(p => p.name === name);
    return (p && p.color) || hashColor('P|' + name);
  }
  function categoryColor(name) {
    const c = cachedCategories.find(c => c.name === name);
    if (c && c.color) return c.color;
    const i = cachedCategories.findIndex(c => c.name === name);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  }

  function avatarImgHtml(name, meta, cls) {
    const url = getAvatarUrl(name, meta);
    const fallback = getAvatarUrl(name, '');
    return '<img class="' + (cls || 'm-avatar') + '" src="' + escapeHtml(url) + '" alt="' +
      escapeHtml(name) + '" onerror="this.onerror=null;this.src=\\'' + fallback + '\\';">';
  }

  function showToast(msg, type, duration) {
    const t = document.createElement('div');
    t.className = 'm-toast ' + (type || '');
    t.textContent = (type === 'success' ? '✓ ' : type === 'error' ? '⚠ ' : '') + msg;
    document.getElementById('mToastContainer').appendChild(t);
    const ms = duration || (type === 'error' ? 6000 : 3500);
    setTimeout(() => t.remove(), ms);
  }

  function buzz() {
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function startBtnLoading(btn, loadingLabel) {
    if (!btn) return () => {};
    const original = btn.innerHTML;
    btn.dataset.original = original;
    btn.disabled = true;
    btn.innerHTML = '⏳ ' + (loadingLabel || '…');
    return () => { btn.disabled = false; btn.innerHTML = btn.dataset.original || original; };
  }

  function callServer(fn, params, onSuccess, errorLabel, onError) {
    let runner = google.script.run
      .withSuccessHandler(res => {
        if (res && res.success === false) {
          showToast((errorLabel || 'Erreur') + ' : ' + res.error, 'error');
          if (onError) onError(res.error);
        } else {
          onSuccess(res);
        }
      })
      .withFailureHandler(err => {
        showToast((errorLabel || 'Erreur serveur') + ' : ' + (err.message || err), 'error');
        if (onError) onError(err);
      });
    runner[fn](...params);
  }

  function toDateStr(d) {
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  }

  function openModal(html) {
    document.getElementById('mModalBox').innerHTML = html;
    document.getElementById('mModalBackdrop').style.display = 'flex';
  }
  function closeModal() {
    document.getElementById('mModalBackdrop').style.display = 'none';
    document.getElementById('mModalBox').innerHTML = '';
  }
  document.getElementById('mModalBackdrop').addEventListener('click', e => {
    if (e.target.id === 'mModalBackdrop') closeModal();
  });

  function openConfirmModal(message, onConfirm) {
    openModal(
      '<h2>Confirmer</h2><p>' + escapeHtml(message) + '</p>' +
      '<div class="m-row" style="justify-content:flex-end; gap:10px; margin-top:12px;">' +
      '<button class="small" id="mConfirmCancel">Annuler</button>' +
      '<button class="danger small" id="mConfirmOk">Confirmer</button></div>'
    );
    document.getElementById('mConfirmCancel').addEventListener('click', closeModal);
    document.getElementById('mConfirmOk').addEventListener('click', () => { closeModal(); onConfirm(); });
  }

  // ── QUI SUIS-JE ? (reprend la logique de Index.html ~2960-3060 / 4990-5180) ──
  const WHO_AM_I_KEY = 'tdt_who_am_i';
  let _whoAmI = localStorage.getItem(WHO_AM_I_KEY) || null;

  function requireIdentity() {
    if (_whoAmI) return true;
    showToast('Sélectionne ton identité avant d\\'agir.', 'error');
    openIdentitySheet();
    return false;
  }

  function applyIdentity(name) {
    _whoAmI = name;
    localStorage.setItem(WHO_AM_I_KEY, name);
    renderIdentityBtn();
    closeIdentitySheet();
  }

  function renderIdentityBtn() {
    if (_whoAmI && cachedPlayers.length > 0 && !cachedPlayers.find(p => p.name === _whoAmI)) {
      _whoAmI = null;
      localStorage.removeItem(WHO_AM_I_KEY);
    }
    const avatar = document.getElementById('mIdentityAvatar');
    const name   = document.getElementById('mIdentityName');
    const p = cachedPlayers.find(p => p.name === _whoAmI);
    if (p) {
      avatar.src = getAvatarUrl(p.name, p.meta);
      avatar.onerror = () => { avatar.src = getAvatarUrl(p.name, ''); };
      name.textContent = p.name;
    } else {
      avatar.src = getAvatarUrl('?', '');
      name.textContent = 'Qui ?';
    }
  }

  function openIdentitySheet() {
    const list = document.getElementById('mIdentityList');
    list.innerHTML = cachedPlayers.map(p => {
      const badge = p.name === _whoAmI ? '✓' : (p.hasPassword ? '🔒' : '');
      return '<button class="m-row" data-player="' + escapeHtml(p.name) + '" ' +
        'style="width:100%; margin-bottom:6px; justify-content:flex-start; background:' +
        (p.name === _whoAmI ? 'var(--accent)' : 'var(--btn-alt)') + ';">' +
        avatarImgHtml(p.name, p.meta, 'm-avatar sm') +
        '<span style="flex:1; text-align:left;">' + escapeHtml(p.name) + '</span>' +
        '<span>' + badge + '</span></button>';
    }).join('') || '<p class="m-empty">Aucun joueur.</p>';
    list.querySelectorAll('button[data-player]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.player;
        if (name === _whoAmI) { closeIdentitySheet(); return; }
        const p = cachedPlayers.find(p => p.name === name);
        if (p && p.hasPassword) {
          closeIdentitySheet();
          openIdentityPwdModal(p);
        } else {
          applyIdentity(name);
        }
      });
    });
    document.getElementById('mIdentitySheet').style.display = 'flex';
  }
  function closeIdentitySheet() {
    document.getElementById('mIdentitySheet').style.display = 'none';
  }
  document.getElementById('mIdentityBtn').addEventListener('click', openIdentitySheet);
  document.getElementById('mIdentityCancel').addEventListener('click', closeIdentitySheet);

  let _identityPwdTarget = null;
  function openIdentityPwdModal(player) {
    _identityPwdTarget = player;
    const avatar = document.getElementById('mIdentityPwdAvatar');
    avatar.src = getAvatarUrl(player.name, player.meta);
    avatar.onerror = () => { avatar.src = getAvatarUrl(player.name, ''); };
    document.getElementById('mIdentityPwdName').textContent = player.name;
    document.getElementById('mIdentityPwdError').style.display = 'none';
    document.getElementById('mIdentityPwdInput').value = '';
    document.getElementById('mIdentityPwdModal').style.display = 'flex';
    setTimeout(() => document.getElementById('mIdentityPwdInput').focus(), 50);
  }
  function closeIdentityPwdModal() {
    document.getElementById('mIdentityPwdModal').style.display = 'none';
    _identityPwdTarget = null;
  }
  document.getElementById('mIdentityPwdCancel').addEventListener('click', closeIdentityPwdModal);
  document.getElementById('mIdentityPwdSubmit').addEventListener('click', () => {
    if (!_identityPwdTarget) return;
    const player = _identityPwdTarget;
    const pwd = document.getElementById('mIdentityPwdInput').value;
    const btn = document.getElementById('mIdentityPwdSubmit');
    btn.disabled = true;
    callServer('apiVerifyIdentity', [player.name, pwd], res => {
      btn.disabled = false;
      if (_identityPwdTarget !== player) return;
      if (res && res.granted) {
        applyIdentity(player.name);
        closeIdentityPwdModal();
        showToast('Identité confirmée : ' + player.name, 'success');
      } else {
        document.getElementById('mIdentityPwdError').style.display = 'block';
        document.getElementById('mIdentityPwdInput').select();
      }
    }, 'Vérification identité', () => { btn.disabled = false; });
  });

  // ── THÈME (même clé localStorage que Index.html — cohérent entre les deux vues) ──
  function initTheme() {
    const saved = localStorage.getItem('topsdestops_theme');
    if (saved === 'light') document.body.classList.add('light');
    const btn = document.getElementById('mThemeToggle');
    btn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
    btn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      const isLight = document.body.classList.contains('light');
      localStorage.setItem('topsdestops_theme', isLight ? 'light' : 'dark');
      btn.textContent = isLight ? '☀️' : '🌙';
    });
  }

  // ── BASCULE VERS LA VERSION PC (même clé que Index.html — choix mémorisé) ──
  document.getElementById('mViewToggle').addEventListener('click', () => {
    localStorage.setItem('tdt_layout_mode', 'desktop');
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'desktop');
    window.location.href = url.toString();
  });

  // ── IDENTITÉ DE L'APP (titre + logo, réutilise apiGetAppSettings) ──
  function loadAppBranding() {
    callServer('apiGetAppSettings', [], res => {
      document.title = res.appTitle;
      document.getElementById('mHeaderTitle').textContent = res.appTitle;
      const logo = document.getElementById('mBrandLogo');
      if (res.logoUrl) {
        logo.src = res.logoUrl;
        logo.onerror = () => { logo.style.display = 'none'; };
        logo.style.display = '';
      } else {
        logo.style.display = 'none';
      }
    }, 'Chargement identité app');
  }

  // ── ENTITÉS (joueurs / catégories) ──
  let cachedPlayers    = [];
  let cachedCategories = [];

  function loadEntities(onDone) {
    callServer('apiGetSettings', [], res => {
      cachedPlayers    = res.players    || [];
      cachedCategories = res.categories || [];
      renderIdentityBtn();
      if (onDone) onDone();
    }, 'Chargement joueurs/catégories');
  }

  // ── NAVIGATION (registre chargé depuis apiGetNavPages — source commune avec Index.html) ──
  let NAV_PAGES = [];

  function renderBottomNav() {
    const nav = document.getElementById('mBottomNav');
    nav.innerHTML = NAV_PAGES.map((p, i) =>
      '<button class="m-nav-btn' + (i === 0 ? ' active' : '') + '" data-tab="' + p.id + '">' +
      '<span class="m-nav-icon">' + p.icon + (p.countId ? '<span class="m-nav-count" id="' + p.countId + '"></span>' : '') + '</span>' +
      '<span>' + escapeHtml(p.label) + '</span></button>'
    ).join('');
    nav.querySelectorAll('.m-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => goToTab(btn.dataset.tab));
    });
  }

  function goToTab(tabId) {
    document.querySelectorAll('.m-tab[id^="tab-"]').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.m-nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.m-nav-btn[data-tab="' + tabId + '"]').forEach(el => el.classList.add('active'));
    if (tabId === 'tab-dashboard') loadDashboard();
    if (tabId === 'tab-inject')    initInjectTab();
    if (tabId === 'tab-settings')  initSettingsTab();
    if (tabId === 'tab-notes')     loadNotesTab();
    if (tabId === 'tab-history')   { mHistoryPage = 1; loadHistoryTab(); }
    if (tabId === 'tab-outils')    loadOutilsTab();
    if (tabId === 'tab-guide')     initGuideTab();
  }

  // ── INIT ──────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadAppBranding();
    callServer('apiGetNavPages', [], res => {
      NAV_PAGES = res.pages;
      renderBottomNav();
      loadEntities(() => {
        goToTab('tab-dashboard');
        loadNotesCountBadge();
      });
    }, 'Chargement du menu');
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Vérification manuelle (fichier squelette seul, avant les onglets)**

À ce stade `Mobile.html` n'a pas encore de contenu dans les 7 `.m-tab` (tasks 5-11 les remplissent). Vérifier uniquement, en le déployant temporairement ou en l'inspectant : le header (titre + thème + bascule + identité) s'affiche, la barre du bas liste 7 boutons dans le bon ordre y compris "🔧 Outils", cliquer un bouton bascule la classe `active`. Le sélecteur d'identité liste les joueurs, un mot de passe déclenche la modale.

- [ ] **Step 3: Sauvegarder l'état**

Squelette fonctionnel : header, thème, identité, navigation par le bas alimentée par `apiGetNavPages`. Continuer vers la tâche suivante.

---

### Task 5: `Mobile.html` — Onglet 📊 Dashboard (filtres en accordéon, un graphique à la fois, card Commentaires en premier)

**Files:**
- Modify: `Mobile.html` (ajout de code dans le `<script>`, avant `// ── INIT`)

- [ ] **Step 1: Ajouter l'état et le rendu du Dashboard**

```javascript
  // ══════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════════════
  let mDashboardChart = null;
  let mChartType = 'stacked'; // stacked | grouped | line | radar | donut | ranking
  let mFilterPlayers   = new Set();
  let mFilterCategories = new Set();
  let mFilterPeriod = 'all'; // 7d | month | 3m | 6m | 1y | all

  function periodBounds(period) {
    const today = new Date();
    const end = toDateStr(today);
    if (period === 'all') return { start: null, end: null };
    const start = new Date(today);
    if (period === '7d')    start.setDate(start.getDate() - 7);
    if (period === 'month') start.setMonth(start.getMonth() - 1);
    if (period === '3m')    start.setMonth(start.getMonth() - 3);
    if (period === '6m')    start.setMonth(start.getMonth() - 6);
    if (period === '1y')    start.setFullYear(start.getFullYear() - 1);
    return { start: toDateStr(start), end };
  }

  function renderDashboardShell() {
    const tab = document.getElementById('tab-dashboard');
    tab.innerHTML =
      '<div class="card" id="mCommentsCard"><h2>🎭 Commentaires</h2><div id="mCommentsBody" class="m-empty">Chargement…</div></div>' +
      '<div class="card m-accordion" id="mFilterAccordion">' +
        '<div class="m-accordion-head" id="mFilterHead"><span>🔎 Filtres</span><span class="m-accordion-arrow">▾</span></div>' +
        '<div class="m-accordion-body">' +
          '<h3>Période</h3>' +
          '<select id="mPeriodSelect">' +
            '<option value="7d">7 jours</option><option value="month">1 mois</option>' +
            '<option value="3m">3 mois</option><option value="6m">6 mois</option>' +
            '<option value="1y">1 an</option><option value="all" selected>Tout</option>' +
          '</select>' +
          '<h3 style="margin-top:12px;">Joueurs</h3><div class="m-chip-row" id="mPlayerChips"></div>' +
          '<h3 style="margin-top:12px;">Tops</h3><div class="m-chip-row" id="mCategoryChips"></div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<select id="mChartTypeSelect" style="margin-bottom:12px;">' +
          '<option value="stacked">Empilé</option><option value="grouped">Groupé</option>' +
          '<option value="line">Courbes</option><option value="radar">Radar</option>' +
          '<option value="donut">Donut</option><option value="ranking">Classement</option>' +
        '</select>' +
        '<canvas id="mMainChart" height="260"></canvas>' +
      '</div>';

    document.getElementById('mFilterHead').addEventListener('click', () => {
      document.getElementById('mFilterAccordion').classList.toggle('open');
    });
    document.getElementById('mPeriodSelect').value = mFilterPeriod;
    document.getElementById('mPeriodSelect').addEventListener('change', e => {
      mFilterPeriod = e.target.value;
      refreshDashboardData();
    });
    document.getElementById('mChartTypeSelect').value = mChartType;
    document.getElementById('mChartTypeSelect').addEventListener('change', e => {
      mChartType = e.target.value;
      refreshDashboardData();
    });

    renderFilterChips();
  }

  function renderFilterChips() {
    const pWrap = document.getElementById('mPlayerChips');
    pWrap.innerHTML = cachedPlayers.map(p =>
      '<div class="m-chip' + (mFilterPlayers.has(p.name) ? ' active' : '') + '" data-name="' + escapeHtml(p.name) + '">' +
      avatarImgHtml(p.name, p.meta, 'm-avatar sm') + escapeHtml(p.name) + '</div>'
    ).join('') || '<p class="m-empty">Aucun joueur.</p>';
    pWrap.querySelectorAll('.m-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const name = chip.dataset.name;
        if (mFilterPlayers.has(name)) mFilterPlayers.delete(name); else mFilterPlayers.add(name);
        chip.classList.toggle('active');
        refreshDashboardData();
      });
    });

    const cWrap = document.getElementById('mCategoryChips');
    cWrap.innerHTML = cachedCategories.map(c =>
      '<div class="m-chip' + (mFilterCategories.has(c.name) ? ' active' : '') + '" data-name="' + escapeHtml(c.name) + '">' +
      (c.icon || '🏷️') + ' ' + escapeHtml(c.name) + '</div>'
    ).join('') || '<p class="m-empty">Aucun top.</p>';
    cWrap.querySelectorAll('.m-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const name = chip.dataset.name;
        if (mFilterCategories.has(name)) mFilterCategories.delete(name); else mFilterCategories.add(name);
        chip.classList.toggle('active');
        refreshDashboardData();
      });
    });
  }

  function currentFilterArrays() {
    return {
      players:    Array.from(mFilterPlayers),
      categories: Array.from(mFilterCategories)
    };
  }

  function refreshDashboardData() {
    const { players, categories } = currentFilterArrays();
    const { start, end } = periodBounds(mFilterPeriod);

    if (mChartType === 'line') {
      callServer('apiGetTrendData', [players, categories, start, end], res => renderTrendChart(res.trendData), 'Chargement tendance');
    } else if (mChartType === 'ranking') {
      callServer('apiGetPlayerTotals', [players, start, end], res => renderBarChart(res.chartData, 'bar'), 'Chargement classement');
    } else {
      callServer('apiGetFilteredData', [players, categories, start, end], res => {
        if (mChartType === 'stacked') renderBarChart(res.chartData, 'bar', true);
        else if (mChartType === 'grouped') renderBarChart(res.chartData, 'bar', false);
        else if (mChartType === 'radar') renderRadarChart(res.chartData);
        else if (mChartType === 'donut') renderDonutChart(res.chartData);
      }, 'Chargement graphique');
    }

    callServer('apiGetPlayerTotals', [players, start, end], res => renderComments(res.chartData), 'Chargement commentaires');
  }

  function destroyChart() {
    if (mDashboardChart) { mDashboardChart.destroy(); mDashboardChart = null; }
  }

  function chartTextColor() {
    return getComputedStyle(document.body).getPropertyValue('--text').trim();
  }

  function renderBarChart(chartData, type, stacked) {
    destroyChart();
    const ctx = document.getElementById('mMainChart').getContext('2d');
    mDashboardChart = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: chartTextColor() } } },
        scales: {
          x: { stacked: !!stacked, ticks: { color: chartTextColor() } },
          y: { stacked: !!stacked, ticks: { color: chartTextColor() } }
        }
      }
    });
  }

  function renderTrendChart(trendData) {
    destroyChart();
    const ctx = document.getElementById('mMainChart').getContext('2d');
    const datasets = Object.keys(trendData.series).map(player => ({
      label: player, data: trendData.series[player],
      borderColor: playerColor(player), backgroundColor: playerColor(player),
      fill: false, tension: 0.25
    }));
    mDashboardChart = new Chart(ctx, {
      type: 'line',
      data: { labels: trendData.labels, datasets },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: chartTextColor() } } },
        scales: { x: { ticks: { color: chartTextColor() } }, y: { ticks: { color: chartTextColor() } } }
      }
    });
  }

  function renderRadarChart(chartData) {
    destroyChart();
    const ctx = document.getElementById('mMainChart').getContext('2d');
    mDashboardChart = new Chart(ctx, {
      type: 'radar',
      data: chartData,
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: chartTextColor() } } },
        scales: { r: { ticks: { color: chartTextColor(), backdropColor: 'transparent' }, pointLabels: { color: chartTextColor() } } }
      }
    });
  }

  function renderDonutChart(chartData) {
    destroyChart();
    const ctx = document.getElementById('mMainChart').getContext('2d');
    const totals = chartData.labels.map((_, i) =>
      chartData.datasets.reduce((s, ds) => s + (ds.data[i] || 0), 0));
    mDashboardChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: chartData.labels,
        datasets: [{ data: totals, backgroundColor: chartData.labels.map(playerColor) }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: chartTextColor() } } }
      }
    });
  }

  // ── CARD COMMENTAIRES (phrases paramétriques à partir du classement courant) ──
  const COMMENT_VAR_RE = /\{(player|pts|gap|behind|rank)\}/g;

  function assignCommentPools(ranked) {
    const n = ranked.length;
    if (n === 0) return [];
    if (n === 1) return [{ ...ranked[0], rank: 1, pool: 'solo' }];
    return ranked.map((r, i) => {
      let pool = 'mid';
      if (i === 0) pool = (ranked[1] && ranked[1].points === r.points) ? 'tied' : 'first';
      else if (i === n - 1) pool = 'last';
      else if (i === 1) pool = 'second';
      else if (i === 2) pool = 'third';
      return { ...r, rank: i + 1, pool };
    });
  }

  function substituteCommentVars(text, entry, ranked) {
    const above = ranked[entry.rank - 2];
    const below = ranked[entry.rank];
    const gap    = above ? (above.points - entry.points) : 0;
    const behind = below ? (entry.points - below.points) : 0;
    return text.replace(COMMENT_VAR_RE, (_, v) => {
      if (v === 'player') return entry.player;
      if (v === 'pts')    return String(entry.points);
      if (v === 'gap')    return String(gap);
      if (v === 'behind') return String(behind);
      if (v === 'rank')   return String(entry.rank);
      return '';
    });
  }

  const FACTORY_PHRASES = {
    first:  ['{player} domine avec {pts} pts.'],
    second: ['{player} suit en 2e place, à {gap} pts du sommet.'],
    third:  ['{player} complète le podium avec {pts} pts.'],
    mid:    ['{player} tient sa place au classement avec {pts} pts.'],
    last:   ['{player} ferme la marche avec {pts} pts.'],
    tied:   ['{player} est à égalité en tête avec {pts} pts.'],
    solo:   ['{player} est seul(e) au classement avec {pts} pts.']
  };

  function renderComments(chartData) {
    const body = document.getElementById('mCommentsBody');
    if (!body) return; // l'onglet a pu être quitté avant la réponse serveur
    const dataset = chartData.datasets[0];
    if (!dataset) { body.innerHTML = '<p class="m-empty">Aucune donnée.</p>'; return; }
    const ranked = chartData.labels
      .map((player, i) => ({ player, points: dataset.data[i] || 0 }))
      .sort((a, b) => b.points - a.points);
    const pooled = assignCommentPools(ranked);
    const withComment = pooled.filter(e => e.pool !== 'mid').slice(0, 3);

    callServer('apiGetActivePhrasePreset', [], presetRes => {
      callServer('apiGetPhrases', [], phraseRes => {
        const preset = presetRes.preset;
        const phrases = phraseRes.phrases;
        const lines = withComment.map(entry => {
          const pool = phrases.filter(p => p.preset === preset && p.pool === entry.pool);
          const source = pool.length ? pool.map(p => p.text) : FACTORY_PHRASES[entry.pool];
          const text = source[Math.floor(Math.random() * source.length)];
          return '<div class="m-row" style="margin-bottom:8px;">' +
            avatarImgHtml(entry.player, (cachedPlayers.find(p => p.name === entry.player) || {}).meta, 'm-avatar sm') +
            '<span>' + escapeHtml(substituteCommentVars(text, entry, ranked)) + '</span></div>';
        });
        body.innerHTML = lines.join('') || '<p class="m-empty">Aucun commentaire disponible.</p>';
      }, 'Chargement phrases');
    }, 'Chargement preset actif');
  }

  function loadDashboard() {
    renderDashboardShell();
    refreshDashboardData();
  }
```

- [ ] **Step 2: Vérification manuelle**

Aller dans l'onglet Dashboard : la card Commentaires apparaît en premier (chargement puis phrases générées avec avatar), l'accordéon Filtres s'ouvre/ferme au tap, les chips joueurs/catégories filtrent, le sélecteur de type de graphique bascule entre Empilé/Groupé/Courbes/Radar/Donut/Classement sans erreur console.

- [ ] **Step 3: Sauvegarder l'état**

Dashboard mobile fonctionnel. Continuer vers la tâche suivante.

---

### Task 6: `Mobile.html` — Onglet ✍️ Saisir un Lot (formulaire vertical, gros boutons)

**Files:**
- Modify: `Mobile.html` (ajout de code dans le `<script>`, avant `// ── INIT`)

- [ ] **Step 1: Ajouter le constructeur de lot simplifié**

```javascript
  // ══════════════════════════════════════════════════════════════════════
  // SAISIR UN LOT
  // ══════════════════════════════════════════════════════════════════════
  let mInjectRowCounter = 0;

  function injectRowHtml(id) {
    const playerOptions = cachedPlayers.map(p =>
      '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</option>').join('');
    const catOptions = cachedCategories.map(c =>
      '<option value="' + escapeHtml(c.name) + '">' + (c.icon || '') + ' ' + escapeHtml(c.name) + '</option>').join('');
    return '<div class="card" id="row_' + id + '" style="margin-bottom:10px;">' +
      '<label style="font-size:0.75rem; color:var(--text-muted);">Joueur</label>' +
      '<select class="m-row-player">' + playerOptions + '</select>' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Top</label>' +
      '<select class="m-row-cat">' + catOptions + '</select>' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Points</label>' +
      '<input type="number" class="m-row-pts" value="1" min="1">' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Description (optionnel)</label>' +
      '<input type="text" class="m-row-desc" placeholder="Description">' +
      '<button class="danger small m-row-remove" style="margin-top:10px; width:100%;">🗑️ Retirer cette ligne</button>' +
      '</div>';
  }

  function addInjectRow() {
    mInjectRowCounter++;
    const container = document.getElementById('mInjectRows');
    container.insertAdjacentHTML('beforeend', injectRowHtml(mInjectRowCounter));
    const row = document.getElementById('row_' + mInjectRowCounter);
    row.querySelector('.m-row-remove').addEventListener('click', () => { row.remove(); });
  }

  function renderInjectShell() {
    const tab = document.getElementById('tab-inject');
    tab.innerHTML =
      '<div class="card">' +
        '<h2>✍️ Saisir un Lot</h2>' +
        '<label style="font-size:0.8rem; color:var(--text-muted);">Date</label>' +
        '<input type="date" id="mInjectDate" value="' + toDateStr(new Date()) + '">' +
      '</div>' +
      '<div id="mInjectRows"></div>' +
      '<button id="mInjectAddRow" class="secondary" style="width:100%; margin-bottom:10px;">＋ Ajouter une ligne</button>' +
      '<button id="mInjectSubmit" class="primary" style="width:100%;">✅ Enregistrer le lot</button>';

    document.getElementById('mInjectAddRow').addEventListener('click', addInjectRow);
    document.getElementById('mInjectSubmit').addEventListener('click', submitInjectPlan);
    addInjectRow();
  }

  function submitInjectPlan() {
    if (!requireIdentity()) return;
    const date = document.getElementById('mInjectDate').value;
    if (!date) { showToast('Date manquante.', 'error'); return; }

    const rows = Array.from(document.querySelectorAll('#mInjectRows .card'));
    if (!rows.length) { showToast('Ajoute au moins une ligne.', 'error'); return; }

    const entries = rows.map(row => ({
      player:      row.querySelector('.m-row-player').value,
      category:    row.querySelector('.m-row-cat').value,
      points:      row.querySelector('.m-row-pts').value,
      times:       1,
      description: row.querySelector('.m-row-desc').value,
      saiseur:     _whoAmI || ''
    }));
    if (entries.some(e => !e.player || !e.category)) {
      showToast('Chaque ligne doit avoir un joueur et un top.', 'error');
      return;
    }

    const btn = document.getElementById('mInjectSubmit');
    const stop = startBtnLoading(btn, 'Enregistrement…');
    callServer('apiAddBulkPlan', [[{ date, entries }], _whoAmI || ''], () => {
      stop();
      buzz();
      showToast(entries.length + ' entrée(s) enregistrée(s).', 'success');
      renderInjectShell();
    }, 'Enregistrement du lot', () => stop());
  }

  function initInjectTab() {
    renderInjectShell();
  }
```

- [ ] **Step 2: Vérification manuelle**

Aller dans l'onglet Saisir un Lot, ajouter 2-3 lignes, remplir joueur/top/points, valider sans identité sélectionnée (doit ouvrir le sélecteur d'identité et bloquer), sélectionner une identité, revalider : toast succès, formulaire réinitialisé.

- [ ] **Step 3: Sauvegarder l'état**

Continuer vers la tâche suivante.

---

### Task 7: `Mobile.html` — Onglet 📝 Notes (priorité n°1 : saisie rapide en un geste)

**Files:**
- Modify: `Mobile.html` (ajout de code dans le `<script>`, avant `// ── INIT`)

- [ ] **Step 1: Ajouter la saisie rapide et la liste des notes**

```javascript
  // ══════════════════════════════════════════════════════════════════════
  // NOTES — cas d'usage mobile principal : saisie rapide en un geste
  // ══════════════════════════════════════════════════════════════════════
  function renderNotesShell() {
    const tab = document.getElementById('tab-notes');
    const playerButtons = cachedPlayers.map(p =>
      '<button class="m-note-player-btn" data-name="' + escapeHtml(p.name) + '" style="flex-direction:column; height:auto; padding:10px 6px;">' +
      avatarImgHtml(p.name, p.meta, 'm-avatar') + '<span style="font-size:0.72rem; margin-top:4px;">' + escapeHtml(p.name) + '</span></button>'
    ).join('');
    tab.innerHTML =
      '<div class="card">' +
        '<h2>📝 Note rapide</h2>' +
        '<div class="m-row" style="flex-wrap:wrap; gap:8px;" id="mNotePlayerRow">' + playerButtons + '</div>' +
        '<textarea id="mNoteText" rows="3" placeholder="Écris ta note…" style="margin-top:10px;"></textarea>' +
        '<button id="mNoteSubmit" class="primary" style="width:100%; margin-top:10px;">📩 Envoyer</button>' +
      '</div>' +
      '<div class="card"><h2>Historique des notes</h2><div id="mNotesList"></div></div>';

    let selectedPlayer = null;
    tab.querySelectorAll('.m-note-player-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedPlayer = btn.dataset.name;
        tab.querySelectorAll('.m-note-player-btn').forEach(b => b.style.outline = '');
        btn.style.outline = '2px solid var(--accent)';
      });
    });
    document.getElementById('mNoteSubmit').addEventListener('click', () => {
      if (!selectedPlayer) { showToast('Choisis un joueur.', 'error'); return; }
      const text = document.getElementById('mNoteText').value;
      if (!text.trim()) { showToast('La note ne peut pas être vide.', 'error'); return; }
      const btn = document.getElementById('mNoteSubmit');
      const stop = startBtnLoading(btn, 'Envoi…');
      callServer('apiAddNote', [selectedPlayer, text, toDateStr(new Date()), _whoAmI || ''], () => {
        stop();
        buzz();
        showToast('Note ajoutée.', 'success');
        document.getElementById('mNoteText').value = '';
        loadNotesList();
        loadNotesCountBadge();
      }, 'Ajout note', () => stop());
    });

    loadNotesList();
  }

  function loadNotesList() {
    callServer('apiGetAllNotes', [], res => {
      const list = document.getElementById('mNotesList');
      if (!list) return;
      if (!res.notes.length) { list.innerHTML = '<p class="m-empty">Aucune note.</p>'; return; }
      list.innerHTML = res.notes.map(n => {
        const p = cachedPlayers.find(p => p.name === n.player);
        const d = n.timestamp ? new Date(n.timestamp) : null;
        const ds = d ? (String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear()) : '';
        return '<div class="m-hist-card">' +
          '<div class="m-hist-top">' + avatarImgHtml(n.player, p ? p.meta : '', 'm-avatar sm') +
          '<strong>' + escapeHtml(n.player) + '</strong><span class="m-hist-meta" style="margin-left:auto;">' + ds + '</span></div>' +
          '<div class="m-hist-desc">' + escapeHtml(n.text) + '</div>' +
          '<div class="m-hist-actions">' +
          '<button class="small" data-edit="' + n.rowIndex + '">✏️</button>' +
          '<button class="danger small" data-del="' + n.rowIndex + '">🗑️</button>' +
          '</div></div>';
      }).join('');
      list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!requireIdentity()) return;
          openConfirmModal('Supprimer cette note ?', () => {
            buzz();
            callServer('apiDeleteNote', [btn.dataset.del, _whoAmI || ''], () => {
              showToast('Note supprimée.', 'success');
              loadNotesList();
              loadNotesCountBadge();
            }, 'Suppression note');
          });
        });
      });
      list.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!requireIdentity()) return;
          const rowIndex = btn.dataset.edit;
          const note = res.notes.find(n => String(n.rowIndex) === String(rowIndex));
          openModal(
            '<h2>Modifier la note</h2>' +
            '<textarea id="mEditNoteText" rows="4">' + escapeHtml(note.text) + '</textarea>' +
            '<button class="primary" style="width:100%; margin-top:10px;" id="mEditNoteSave">Enregistrer</button>'
          );
          document.getElementById('mEditNoteSave').addEventListener('click', () => {
            const v = document.getElementById('mEditNoteText').value;
            if (!v.trim()) { showToast('La note ne peut pas être vide.', 'error'); return; }
            callServer('apiEditNote', [rowIndex, v, _whoAmI || ''], () => {
              closeModal();
              showToast('Note modifiée.', 'success');
              loadNotesList();
            }, 'Modification note');
          });
        });
      });
    }, 'Chargement notes');
  }

  function loadNotesCountBadge() {
    callServer('apiGetAllNotes', [], res => {
      const el = document.getElementById('notesCount');
      if (el) el.textContent = res.notes.length ? String(res.notes.length) : '';
    }, 'Chargement compteur notes');
  }

  function loadNotesTab() {
    renderNotesShell();
  }
```

- [ ] **Step 2: Vérification manuelle**

Aller dans l'onglet Notes : sélectionner un joueur (avatar en grille), taper un texte, envoyer → toast succès, note visible dans la liste en dessous avec avatar. Éditer puis supprimer une note.

- [ ] **Step 3: Sauvegarder l'état**

Continuer vers la tâche suivante.

---

### Task 8: `Mobile.html` — Onglet 📜 Historique (cartes, pas un tableau)

**Files:**
- Modify: `Mobile.html` (ajout de code dans le `<script>`, avant `// ── INIT`)

- [ ] **Step 1: Ajouter la liste en cartes avec pagination "Charger plus"**

```javascript
  // ══════════════════════════════════════════════════════════════════════
  // HISTORIQUE — rendu en cartes
  // ══════════════════════════════════════════════════════════════════════
  let mHistoryPage = 1;
  const M_HIST_PAGE_SIZE = 15;
  let mHistoryLoaded = [];

  function renderHistoryShell() {
    const tab = document.getElementById('tab-history');
    tab.innerHTML =
      '<div class="card">' +
        '<h2>📜 Historique</h2>' +
        '<input type="text" id="mHistSearch" placeholder="🔍 Rechercher…">' +
      '</div>' +
      '<div id="mHistCards"></div>' +
      '<button id="mHistLoadMore" class="secondary" style="width:100%;">Charger plus</button>';

    let searchTimer = null;
    document.getElementById('mHistSearch').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { mHistoryPage = 1; mHistoryLoaded = []; loadHistoryTab(); }, 300);
    });
    document.getElementById('mHistLoadMore').addEventListener('click', () => {
      mHistoryPage++;
      loadHistoryTab(true);
    });
  }

  function historyCardHtml(log) {
    const p = cachedPlayers.find(p => p.name === log.player);
    const d = new Date(log.timestamp);
    const ds = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
    const cat = cachedCategories.find(c => c.name === log.category);
    return '<div class="m-hist-card" data-row="' + log.rowIndex + '">' +
      '<div class="m-hist-top">' + avatarImgHtml(log.player, p ? p.meta : '', 'm-avatar sm') +
      '<strong>' + escapeHtml(log.player) + '</strong>' +
      '<span style="color:' + categoryColor(log.category) + ';">' + (cat ? cat.icon : '') + ' ' + escapeHtml(log.category) + '</span>' +
      '<span class="m-hist-pts">' + log.points + ' pts</span></div>' +
      '<div class="m-hist-meta">' + ds + (log.saiseur ? ' · saisi par ' + escapeHtml(log.saiseur) : '') + '</div>' +
      (log.description ? '<div class="m-hist-desc">' + escapeHtml(log.description) + '</div>' : '') +
      '<div class="m-hist-actions">' +
      '<button class="small" data-edit="' + log.rowIndex + '">✏️</button>' +
      '<button class="danger small" data-del="' + log.rowIndex + '">🗑️</button>' +
      '</div></div>';
  }

  function bindHistoryCardActions() {
    document.querySelectorAll('#mHistCards [data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        openConfirmModal('Supprimer cette entrée ?', () => {
          buzz();
          callServer('apiDeleteHistoryEntries', [[btn.dataset.del], _whoAmI || ''], () => {
            showToast('Entrée supprimée.', 'success');
            mHistoryPage = 1; mHistoryLoaded = [];
            loadHistoryTab();
          }, 'Suppression entrée');
        });
      });
    });
    document.querySelectorAll('#mHistCards [data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        const rowIndex = btn.dataset.edit;
        const log = mHistoryLoaded.find(l => String(l.rowIndex) === String(rowIndex));
        openHistoryEditModal(log);
      });
    });
  }

  function openHistoryEditModal(log) {
    const playerOptions = cachedPlayers.map(p =>
      '<option value="' + escapeHtml(p.name) + '"' + (p.name === log.player ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>').join('');
    const catOptions = cachedCategories.map(c =>
      '<option value="' + escapeHtml(c.name) + '"' + (c.name === log.category ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>').join('');
    openModal(
      '<h2>Modifier l\\'entrée</h2>' +
      '<label style="font-size:0.75rem; color:var(--text-muted);">Date</label>' +
      '<input type="date" id="mEditDate" value="' + toDateStr(new Date(log.timestamp)) + '">' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Joueur</label>' +
      '<select id="mEditPlayer">' + playerOptions + '</select>' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Top</label>' +
      '<select id="mEditCat">' + catOptions + '</select>' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Points</label>' +
      '<input type="number" id="mEditPts" value="' + log.points + '" min="1">' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Description</label>' +
      '<input type="text" id="mEditDesc" value="' + escapeHtml(log.description || '') + '">' +
      '<button class="primary" style="width:100%; margin-top:12px;" id="mEditSave">Enregistrer</button>'
    );
    document.getElementById('mEditSave').addEventListener('click', () => {
      const fields = {
        date:        document.getElementById('mEditDate').value,
        player:      document.getElementById('mEditPlayer').value,
        category:    document.getElementById('mEditCat').value,
        points:      document.getElementById('mEditPts').value,
        description: document.getElementById('mEditDesc').value,
        saiseur:     log.saiseur || ''
      };
      callServer('apiUpdateHistoryEntry', [log.rowIndex, fields, _whoAmI || ''], () => {
        closeModal();
        showToast('Entrée modifiée.', 'success');
        mHistoryPage = 1; mHistoryLoaded = [];
        loadHistoryTab();
      }, 'Modification entrée');
    });
  }

  function loadHistoryTab(append) {
    if (!document.getElementById('mHistCards')) renderHistoryShell();
    const text = (document.getElementById('mHistSearch') || {}).value || '';
    callServer('apiGetHistoryPage', [mHistoryPage, M_HIST_PAGE_SIZE, [], [], text], res => {
      mHistoryLoaded = append ? mHistoryLoaded.concat(res.logs) : res.logs;
      const container = document.getElementById('mHistCards');
      if (!mHistoryLoaded.length) {
        container.innerHTML = '<p class="m-empty">Aucune entrée.</p>';
      } else {
        container.innerHTML = mHistoryLoaded.map(historyCardHtml).join('');
        bindHistoryCardActions();
      }
      const loadMoreBtn = document.getElementById('mHistLoadMore');
      const loadedCount = mHistoryPage * M_HIST_PAGE_SIZE;
      loadMoreBtn.style.display = loadedCount >= res.totalEntries ? 'none' : '';
      const badge = document.getElementById('historyCount');
      if (badge) badge.textContent = String(res.totalEntries);
    }, 'Chargement historique');
  }
```

- [ ] **Step 2: Vérification manuelle**

Aller dans l'onglet Historique : les entrées s'affichent en cartes (pas de tableau), la recherche filtre après un court délai, "Charger plus" ajoute des cartes, éditer/supprimer une entrée fonctionne et rafraîchit la liste.

- [ ] **Step 3: Sauvegarder l'état**

Continuer vers la tâche suivante.

---

### Task 9: `Mobile.html` — Onglet ⚙️ Paramètres (joueurs/catégories, barème, presets de phrases)

**Files:**
- Modify: `Mobile.html` (ajout de code dans le `<script>`, avant `// ── INIT`)

- [ ] **Step 1: Ajouter les 4 sous-onglets (scroll horizontal) et leur contenu**

```javascript
  // ══════════════════════════════════════════════════════════════════════
  // PARAMÈTRES — sous-onglets en scroll horizontal (liste plate + édition inline)
  // ══════════════════════════════════════════════════════════════════════
  let mSettingsSubTab = 'players';
  let mBaremeEntries = [];
  let mPhrasesAll = [];
  let mActivePreset = '__default__';

  function renderSettingsShell() {
    const tab = document.getElementById('tab-settings');
    tab.innerHTML =
      '<div class="m-chip-row" id="mSettingsSubNav" style="flex-wrap:nowrap; overflow-x:auto; margin-bottom:12px;">' +
        '<div class="m-chip active" data-sub="players">👤 Joueurs</div>' +
        '<div class="m-chip" data-sub="categories">🎯 Tops</div>' +
        '<div class="m-chip" data-sub="bareme">⚖️ Barème</div>' +
        '<div class="m-chip" data-sub="phrases">🎭 Phrases</div>' +
      '</div>' +
      '<div id="mSettingsBody"></div>';

    tab.querySelectorAll('#mSettingsSubNav .m-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        mSettingsSubTab = chip.dataset.sub;
        tab.querySelectorAll('#mSettingsSubNav .m-chip').forEach(c => c.classList.toggle('active', c === chip));
        renderSettingsBody();
      });
    });
    renderSettingsBody();
  }

  function renderSettingsBody() {
    if (mSettingsSubTab === 'players')    renderEntitySettings('Players');
    if (mSettingsSubTab === 'categories') renderEntitySettings('Categories');
    if (mSettingsSubTab === 'bareme')     renderBaremeSettings();
    if (mSettingsSubTab === 'phrases')    renderPhrasesSettings();
  }

  // ── Joueurs / Catégories : liste plate + édition inline ──
  function renderEntitySettings(type) {
    const body = document.getElementById('mSettingsBody');
    const items = type === 'Players' ? cachedPlayers : cachedCategories;
    body.innerHTML =
      '<div class="card">' +
        '<h2>' + (type === 'Players' ? '👤 Joueurs' : '🎯 Tops') + '</h2>' +
        '<div id="mEntityList"></div>' +
        '<button class="secondary" id="mEntityAdd" style="width:100%; margin-top:10px;">＋ Ajouter</button>' +
      '</div>';

    const list = document.getElementById('mEntityList');
    list.innerHTML = items.map(item =>
      '<div class="m-row" style="border-bottom:1px solid var(--border); padding:10px 0;" data-name="' + escapeHtml(item.name) + '">' +
      (type === 'Players' ? avatarImgHtml(item.name, item.meta, 'm-avatar sm')
                           : '<span style="font-size:1.2rem;">' + (item.icon || '🏷️') + '</span>') +
      '<span style="flex:1;">' + escapeHtml(item.name) + '</span>' +
      '<span style="width:16px; height:16px; border-radius:50%; background:' +
        (type === 'Players' ? playerColor(item.name) : categoryColor(item.name)) + ';"></span>' +
      '<button class="small" data-edit>✏️</button>' +
      '<button class="danger small" data-del>🗑️</button>' +
      '</div>'
    ).join('') || '<p class="m-empty">Aucun élément.</p>';

    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        const name = btn.closest('[data-name]').dataset.name;
        openConfirmModal('Supprimer "' + name + '" définitivement ?', () => {
          buzz();
          callServer('apiManageEntity', ['DELETE', type, null, null, name, null, _whoAmI || ''], () => {
            showToast('Supprimé.', 'success');
            loadEntities(() => renderSettingsBody());
          }, 'Suppression');
        });
      });
    });
    list.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        const name = btn.closest('[data-name]').dataset.name;
        const item = items.find(i => i.name === name);
        openEntityFormModal(type, item);
      });
    });
    document.getElementById('mEntityAdd').addEventListener('click', () => {
      if (!requireIdentity()) return;
      openEntityFormModal(type, null);
    });
  }

  function openEntityFormModal(type, item) {
    const isPlayer = type === 'Players';
    openModal(
      '<h2>' + (item ? 'Modifier' : 'Ajouter') + ' — ' + (isPlayer ? 'Joueur' : 'Top') + '</h2>' +
      '<label style="font-size:0.75rem; color:var(--text-muted);">Nom</label>' +
      '<input type="text" id="mEntityName" value="' + (item ? escapeHtml(item.name) : '') + '">' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">' +
        (isPlayer ? 'URL avatar (optionnel)' : 'Description (optionnel)') + '</label>' +
      '<input type="text" id="mEntityMeta" value="' + (item ? escapeHtml(item.meta || '') : '') + '">' +
      (isPlayer ? '' :
        '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Emoji</label>' +
        '<input type="text" id="mEntityIcon" value="' + (item ? escapeHtml(item.icon || '') : '') + '" maxlength="4">') +
      '<button class="primary" style="width:100%; margin-top:12px;" id="mEntitySave">Enregistrer</button>'
    );
    document.getElementById('mEntitySave').addEventListener('click', () => {
      const name = document.getElementById('mEntityName').value.trim();
      const meta = document.getElementById('mEntityMeta').value.trim();
      const icon = isPlayer ? '' : (document.getElementById('mEntityIcon').value.trim());
      if (!name) { showToast('Le nom ne peut pas être vide.', 'error'); return; }
      const action = item ? 'RENAME' : 'ADD';
      callServer('apiManageEntity', [action, type, name, meta, item ? item.name : null, icon, _whoAmI || ''], () => {
        closeModal();
        showToast('Enregistré.', 'success');
        loadEntities(() => renderSettingsBody());
      }, 'Enregistrement');
    });
  }

  // ── Barème ──
  function renderBaremeSettings() {
    const body = document.getElementById('mSettingsBody');
    body.innerHTML = '<div class="card"><h2>⚖️ Barème</h2><div id="mBaremeList" class="m-empty">Chargement…</div>' +
      '<button class="secondary" id="mBaremeAdd" style="width:100%; margin-top:10px;">＋ Ajouter une règle</button></div>';

    callServer('apiGetBareme', [], res => {
      mBaremeEntries = res.entries;
      const list = document.getElementById('mBaremeList');
      list.innerHTML = mBaremeEntries.map(entry =>
        '<div class="m-row" style="border-bottom:1px solid var(--border); padding:10px 0;" data-row="' + entry.rowIndex + '">' +
        '<span style="flex:1;">' + escapeHtml(entry.top) + ' — ' + escapeHtml(entry.action) + '</span>' +
        '<strong>' + entry.pts + ' pts</strong>' +
        '<button class="small" data-edit>✏️</button>' +
        '<button class="danger small" data-del>🗑️</button>' +
        '</div>'
      ).join('') || '<p class="m-empty">Aucune règle.</p>';

      list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!requireIdentity()) return;
          const rowIndex = btn.closest('[data-row]').dataset.row;
          openConfirmModal('Supprimer cette règle ?', () => {
            callServer('apiDeleteBaremeEntry', [rowIndex, _whoAmI || ''], () => {
              showToast('Règle supprimée.', 'success');
              renderBaremeSettings();
            }, 'Suppression règle');
          });
        });
      });
      list.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!requireIdentity()) return;
          const rowIndex = btn.closest('[data-row]').dataset.row;
          const entry = mBaremeEntries.find(e => String(e.rowIndex) === String(rowIndex));
          openBaremeFormModal(entry);
        });
      });
    }, 'Chargement barème');

    document.getElementById('mBaremeAdd').addEventListener('click', () => {
      if (!requireIdentity()) return;
      openBaremeFormModal(null);
    });
  }

  function openBaremeFormModal(entry) {
    const catOptions = cachedCategories.map(c =>
      '<option value="' + escapeHtml(c.name) + '"' + (entry && entry.top === c.name ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>').join('');
    openModal(
      '<h2>' + (entry ? 'Modifier' : 'Ajouter') + ' une règle</h2>' +
      (entry ? '<p>' + escapeHtml(entry.top) + '</p>' :
        '<label style="font-size:0.75rem; color:var(--text-muted);">Top</label><select id="mBaremeTop">' + catOptions + '</select>') +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Action</label>' +
      '<input type="text" id="mBaremeAction" value="' + (entry ? escapeHtml(entry.action) : '') + '">' +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Points</label>' +
      '<input type="number" id="mBaremePts" value="' + (entry ? entry.pts : 1) + '">' +
      '<button class="primary" style="width:100%; margin-top:12px;" id="mBaremeSave">Enregistrer</button>'
    );
    document.getElementById('mBaremeSave').addEventListener('click', () => {
      const action = document.getElementById('mBaremeAction').value.trim();
      const pts = document.getElementById('mBaremePts').value;
      if (!action) { showToast('Action vide.', 'error'); return; }
      if (entry) {
        callServer('apiUpdateBaremeEntry', [entry.rowIndex, action, pts, _whoAmI || ''], () => {
          closeModal(); showToast('Règle modifiée.', 'success'); renderBaremeSettings();
        }, 'Modification règle');
      } else {
        const top = document.getElementById('mBaremeTop').value;
        callServer('apiAddBaremeEntry', [top, action, pts, _whoAmI || ''], () => {
          closeModal(); showToast('Règle ajoutée.', 'success'); renderBaremeSettings();
        }, 'Ajout règle');
      }
    });
  }

  // ── Presets de phrases : liste plate + édition inline ──
  function renderPhrasesSettings() {
    const body = document.getElementById('mSettingsBody');
    body.innerHTML = '<div class="card"><h2>🎭 Phrases</h2>' +
      '<label style="font-size:0.75rem; color:var(--text-muted);">Preset actif</label>' +
      '<select id="mPresetSelect"></select>' +
      '<div id="mPhrasesList" style="margin-top:10px;" class="m-empty">Chargement…</div>' +
      '<button class="secondary" id="mPhraseAdd" style="width:100%; margin-top:10px;">＋ Ajouter une phrase</button>' +
      '</div>';

    callServer('apiGetActivePhrasePreset', [], activeRes => {
      mActivePreset = activeRes.preset;
      callServer('apiGetPhrases', [], res => {
        mPhrasesAll = res.phrases;
        const presets = Array.from(new Set(mPhrasesAll.map(p => p.preset).concat([mActivePreset, '__default__'])));
        const select = document.getElementById('mPresetSelect');
        select.innerHTML = presets.map(p =>
          '<option value="' + escapeHtml(p) + '"' + (p === mActivePreset ? ' selected' : '') + '>' +
          (p === '__default__' ? 'Défaut' : escapeHtml(p)) + '</option>').join('');
        select.addEventListener('change', () => {
          callServer('apiSetActivePhrasePreset', [select.value], () => {
            mActivePreset = select.value;
            renderPhrasesList();
          }, 'Changement preset actif');
        });
        renderPhrasesList();
      }, 'Chargement phrases');
    }, 'Chargement preset actif');

    document.getElementById('mPhraseAdd').addEventListener('click', () => {
      if (!requireIdentity()) return;
      openPhraseFormModal(null);
    });
  }

  function renderPhrasesList() {
    const list = document.getElementById('mPhrasesList');
    const entries = mPhrasesAll.filter(p => p.preset === mActivePreset);
    list.innerHTML = entries.map(p =>
      '<div class="m-row" style="border-bottom:1px solid var(--border); padding:10px 0;" data-row="' + p.rowIndex + '">' +
      '<span style="font-size:0.7rem; color:var(--text-muted); min-width:44px;">[' + escapeHtml(p.pool) + ']</span>' +
      '<span style="flex:1;">' + escapeHtml(p.text) + '</span>' +
      '<button class="small" data-edit>✏️</button>' +
      '<button class="danger small" data-del>🗑️</button>' +
      '</div>'
    ).join('') || '<p class="m-empty">Aucune phrase dans ce preset.</p>';

    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        const rowIndex = btn.closest('[data-row]').dataset.row;
        openConfirmModal('Supprimer cette phrase ?', () => {
          callServer('apiDeletePhrase', [rowIndex, _whoAmI || ''], () => {
            showToast('Phrase supprimée.', 'success');
            renderPhrasesSettings();
          }, 'Suppression phrase');
        });
      });
    });
    list.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        const rowIndex = btn.closest('[data-row]').dataset.row;
        const entry = entries.find(e => String(e.rowIndex) === String(rowIndex));
        openPhraseFormModal(entry);
      });
    });
  }

  function openPhraseFormModal(entry) {
    const pools = ['first','second','third','mid','last','tied','solo'];
    const poolOptions = pools.map(p =>
      '<option value="' + p + '"' + (entry && entry.pool === p ? ' selected' : '') + '>' + p + '</option>').join('');
    openModal(
      '<h2>' + (entry ? 'Modifier' : 'Ajouter') + ' une phrase</h2>' +
      (entry ? '' : '<label style="font-size:0.75rem; color:var(--text-muted);">Pool</label><select id="mPhrasePool">' + poolOptions + '</select>') +
      '<label style="font-size:0.75rem; color:var(--text-muted); margin-top:8px; display:block;">Texte (variables : {player} {pts} {gap} {behind} {rank})</label>' +
      '<textarea id="mPhraseText" rows="3">' + (entry ? escapeHtml(entry.text) : '') + '</textarea>' +
      '<button class="primary" style="width:100%; margin-top:12px;" id="mPhraseSave">Enregistrer</button>'
    );
    document.getElementById('mPhraseSave').addEventListener('click', () => {
      const text = document.getElementById('mPhraseText').value.trim();
      if (!text) { showToast('Le texte ne peut pas être vide.', 'error'); return; }
      if (entry) {
        callServer('apiUpdatePhrase', [entry.rowIndex, text, _whoAmI || ''], () => {
          closeModal(); showToast('Phrase modifiée.', 'success'); renderPhrasesSettings();
        }, 'Modification phrase');
      } else {
        const pool = document.getElementById('mPhrasePool').value;
        callServer('apiAddPhrase', [mActivePreset, pool, text, _whoAmI || ''], () => {
          closeModal(); showToast('Phrase ajoutée.', 'success'); renderPhrasesSettings();
        }, 'Ajout phrase');
      }
    });
  }

  function initSettingsTab() {
    renderSettingsShell();
  }
```

- [ ] **Step 2: Vérification manuelle**

Aller dans l'onglet Paramètres : les 4 sous-onglets (chips en scroll horizontal) basculent le contenu. Joueurs/Tops : ajouter, éditer, supprimer un élément fonctionne, avatar toujours visible pour les joueurs. Barème : CRUD complet. Phrases : changer de preset actif recharge la liste filtrée, ajouter/éditer/supprimer une phrase fonctionne.

- [ ] **Step 3: Sauvegarder l'état**

Continuer vers la tâche suivante.

---

### Task 10: `Mobile.html` — Onglet 🔧 Outils (rapport de santé, nettoyage, lots répartis)

**Files:**
- Modify: `Mobile.html` (ajout de code dans le `<script>`, avant `// ── INIT`)

- [ ] **Step 1: Ajouter le rendu des 3 actions Outils**

```javascript
  // ══════════════════════════════════════════════════════════════════════
  // OUTILS — rapport de santé, nettoyage orphelins, lots répartis
  // ══════════════════════════════════════════════════════════════════════
  let mDetectedLots = [];

  function renderOutilsShell() {
    const tab = document.getElementById('tab-outils');
    tab.innerHTML =
      '<div class="card">' +
        '<h2>🩺 Rapport de santé</h2>' +
        '<div id="mHealthReport" class="m-empty">Chargement…</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>🧹 Nettoyage</h2>' +
        '<p style="font-size:0.85rem; color:var(--text-muted);">Supprime les entrées dont le joueur ou le top n\\'existe plus.</p>' +
        '<button class="danger" id="mCleanOrphans" style="width:100%;">🗑️ Nettoyer les orphelins</button>' +
      '</div>' +
      '<div class="card">' +
        '<h2>🔗 Lots répartis</h2>' +
        '<p style="font-size:0.85rem; color:var(--text-muted);">Détecte les entrées identiques saisies sur plusieurs jours (probable lot réparti manuellement).</p>' +
        '<button class="secondary" id="mDetectLots" style="width:100%;">🔍 Détecter les lots répartis</button>' +
        '<div id="mLotsList" style="margin-top:10px;"></div>' +
      '</div>';

    document.getElementById('mCleanOrphans').addEventListener('click', () => {
      if (!requireIdentity()) return;
      openConfirmModal('Supprimer toutes les entrées orphelines ? Une sauvegarde est créée avant suppression.', () => {
        buzz();
        const btn = document.getElementById('mCleanOrphans');
        const stop = startBtnLoading(btn, 'Nettoyage…');
        callServer('apiDeleteOrphans', [_whoAmI || ''], res => {
          stop();
          showToast(res.deleted + ' entrée(s) supprimée(s).', 'success');
          loadHealthReport();
        }, 'Nettoyage orphelins', () => stop());
      });
    });

    document.getElementById('mDetectLots').addEventListener('click', () => {
      const btn = document.getElementById('mDetectLots');
      const stop = startBtnLoading(btn, 'Analyse…');
      callServer('apiDetectDistributedLots', [], res => {
        stop();
        mDetectedLots = res.lots;
        renderLotsList();
      }, 'Détection lots', () => stop());
    });

    loadHealthReport();
  }

  function loadHealthReport() {
    callServer('apiGetDataHealth', [], res => {
      const el = document.getElementById('mHealthReport');
      if (!el) return;
      el.innerHTML =
        '<div class="m-row" style="margin-bottom:6px;"><span>Entrées totales</span><strong style="margin-left:auto;">' + res.health.total + '</strong></div>' +
        '<div class="m-row" style="margin-bottom:6px;"><span>Points à 0/négatifs</span><strong style="margin-left:auto; color:var(--warn);">' + res.health.zeros + '</strong></div>' +
        '<div class="m-row"><span>Entrées orphelines</span><strong style="margin-left:auto; color:var(--error);">' + res.health.orphans + '</strong></div>';
    }, 'Chargement rapport de santé');
  }

  function renderLotsList() {
    const list = document.getElementById('mLotsList');
    if (!mDetectedLots.length) { list.innerHTML = '<p class="m-empty">Aucun lot réparti détecté.</p>'; return; }
    list.innerHTML = mDetectedLots.map((lot, i) => {
      const p = cachedPlayers.find(p => p.name === lot.player);
      return '<div class="m-hist-card" data-idx="' + i + '">' +
        '<div class="m-hist-top">' + avatarImgHtml(lot.player, p ? p.meta : '', 'm-avatar sm') +
        '<strong>' + escapeHtml(lot.player) + '</strong><span class="m-hist-pts">' + lot.totalPts + ' pts</span></div>' +
        '<div class="m-hist-meta">' + escapeHtml(lot.category) + ' · ' + lot.count + ' entrées · ' + lot.dateFrom + ' → ' + lot.dateTo + '</div>' +
        (lot.description ? '<div class="m-hist-desc">' + escapeHtml(lot.description) + '</div>' : '') +
        '<div class="m-hist-actions"><button class="primary small" data-group>🔗 Regrouper ce lot</button></div>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        const idx = Number(btn.closest('[data-idx]').dataset.idx);
        const lot = mDetectedLots[idx];
        buzz();
        callServer('apiGroupDistributedLots', [[lot], _whoAmI || ''], () => {
          showToast('Lot regroupé.', 'success');
          mDetectedLots.splice(idx, 1);
          renderLotsList();
        }, 'Regroupement lot');
      });
    });
  }

  function loadOutilsTab() {
    renderOutilsShell();
  }
```

- [ ] **Step 2: Vérification manuelle**

Aller dans l'onglet Outils : le rapport de santé affiche 3 chiffres. "Nettoyer les orphelins" demande confirmation puis rafraîchit le rapport. "Détecter les lots répartis" liste les lots candidats en cartes ; "Regrouper ce lot" fait disparaître la carte après succès.

- [ ] **Step 3: Sauvegarder l'état**

Continuer vers la tâche suivante.

---

### Task 11: `Mobile.html` — Onglet ❓ Guide (accordéon)

**Files:**
- Modify: `Mobile.html` (ajout de code dans le `<script>`, avant `// ── INIT`)

- [ ] **Step 1: Ajouter le contenu du guide en accordéon**

Contenu repris des explications déjà présentes dans le guide desktop (`Index.html` ~lignes 2745-2760), reformulé en accordéon compact.

```javascript
  // ══════════════════════════════════════════════════════════════════════
  // GUIDE — contenu texte en accordéon
  // ══════════════════════════════════════════════════════════════════════
  const GUIDE_SECTIONS = [
    { title: '📊 Dashboard', body: 'Filtre les scores par joueurs, tops et période. Choisis un type de graphique (Empilé, Groupé, Courbes, Radar, Donut, Classement). La card Commentaires génère des phrases automatiques à partir du classement courant.' },
    { title: '✍️ Saisir un Lot', body: 'Choisis une date, ajoute une ligne par entrée (joueur, top, points, description optionnelle), puis enregistre le lot en une fois.' },
    { title: '⚙️ Paramètres', body: 'Gère les joueurs et tops (nom, avatar/emoji, couleur), le barème de points par top, et les presets de phrases de la card Commentaires.' },
    { title: '📝 Notes', body: 'Ajoute une note libre pour un joueur en un geste : sélectionne son avatar, écris le texte, envoie.' },
    { title: '📜 Historique', body: 'Toutes les entrées sous forme de cartes, les plus récentes en premier. Recherche, édition et suppression disponibles sur chaque carte.' },
    { title: '🔧 Outils', body: 'Rapport de santé des données, nettoyage des entrées orphelines (joueur/top supprimé), détection et regroupement des lots saisis manuellement sur plusieurs jours.' },
    { title: '👤 Qui suis-je ?', body: 'Sélectionne ton identité en haut de l\\'écran avant toute action qui modifie les données. Un joueur protégé par mot de passe demande une confirmation.' }
  ];

  function renderGuideShell() {
    const tab = document.getElementById('tab-guide');
    tab.innerHTML = GUIDE_SECTIONS.map((s, i) =>
      '<div class="card m-accordion" data-guide="' + i + '">' +
        '<div class="m-accordion-head"><span>' + escapeHtml(s.title) + '</span><span class="m-accordion-arrow">▾</span></div>' +
        '<div class="m-accordion-body"><p style="margin:0; font-size:0.85rem; color:var(--text-muted);">' + escapeHtml(s.body) + '</p></div>' +
      '</div>'
    ).join('');
    tab.querySelectorAll('.m-accordion-head').forEach(head => {
      head.addEventListener('click', () => head.closest('.m-accordion').classList.toggle('open'));
    });
  }

  function initGuideTab() {
    if (!document.querySelector('#tab-guide .m-accordion')) renderGuideShell();
  }
```

- [ ] **Step 2: Vérification manuelle**

Aller dans l'onglet Guide : 7 sections en accordéon, chaque tap ouvre/ferme sa section, le contenu correspond aux 7 onglets réels.

- [ ] **Step 3: Sauvegarder l'état**

`Mobile.html` couvre maintenant les 7 onglets. Continuer vers la tâche de vérification finale.

---

### Task 12: Vérification manuelle de bout en bout (déploiement réel — pas de serveur GAS local)

**Files:** aucun (vérification uniquement)

Ce projet n'a pas de serveur de développement GAS local : la vérification se fait sur le déploiement `/exec` réel, après avoir poussé `Code.gs`, `Index.html` et le nouveau `Mobile.html` depuis l'éditeur Apps Script (voir `DEPLOIEMENT.md` pour la procédure de déploiement d'une nouvelle version).

- [ ] **Step 1: Vérifier le routage automatique**

Ouvrir l'URL `/exec` nue (sans `?view=`) sur un téléphone (ou un émulateur de largeur ≤ 640px dans les DevTools) : doit rediriger automatiquement vers `?view=mobile` et afficher `Mobile.html`. Ouvrir la même URL nue sur un écran large (> 640px) : doit rediriger vers `?view=desktop` et afficher `Index.html`.

- [ ] **Step 2: Vérifier la bascule manuelle mémorisée**

Depuis `Mobile.html`, taper le bouton 🖥️ : doit recharger sur `?view=desktop`. Depuis `Index.html`, taper le bouton 📱/🖥️ : doit recharger sur l'autre `?view=`. Fermer l'onglet, rouvrir l'URL `/exec` nue : doit rouvrir directement dans le dernier mode choisi (pas de nouvelle détection automatique tant qu'aucun choix n'est effacé manuellement dans `localStorage`).

- [ ] **Step 3: Parcourir les 7 onglets sur `Mobile.html` et cocher chaque point**

- **📊 Dashboard** : la card Commentaires affiche des phrases avec avatar en premier ; l'accordéon Filtres s'ouvre/ferme ; les chips joueurs/catégories filtrent le graphique ; les 6 types de graphique (Empilé/Groupé/Courbes/Radar/Donut/Classement) s'affichent sans erreur console.
- **✍️ Saisir un Lot** : ajouter 2 lignes, valider sans identité (doit bloquer et ouvrir le sélecteur), sélectionner une identité, valider → toast succès, l'entrée apparaît ensuite dans Historique.
- **📝 Notes** : sélectionner un joueur, envoyer une note → apparaît immédiatement dans la liste avec avatar ; éditer puis supprimer une note.
- **📜 Historique** : les entrées s'affichent en cartes ; rechercher un texte filtre après un court délai ; "Charger plus" ajoute des cartes ; éditer et supprimer une entrée fonctionnent.
- **⚙️ Paramètres** : les 4 sous-onglets (Joueurs/Tops/Barème/Phrases) basculent ; CRUD complet sur chacun ; changer le preset de phrases actif recharge la bonne liste.
- **🔧 Outils** : le rapport de santé affiche des chiffres cohérents avec `Index.html` (comparer les deux vues) ; nettoyer les orphelins fonctionne avec confirmation ; détecter puis regrouper un lot réparti fonctionne.
- **❓ Guide** : les 7 sections en accordéon s'ouvrent/ferment et décrivent bien les 7 onglets réels.

- [ ] **Step 4: Vérifier l'absence de régression sur `Index.html`**

Ouvrir `?view=desktop` : le menu (nav desktop + drawer mobile CSS) se charge toujours, avec un nouveau bouton "🔧 Outils" qui ouvre Paramètres → sous-onglet Outils. Tous les onglets existants (Dashboard, Saisir un Lot, Paramètres avec ses 6 sous-onglets, Notes, Historique avec ses 2 sous-onglets Entrées/Journal, Guide) fonctionnent à l'identique d'avant.

- [ ] **Step 5: Lancer toute la suite Node une dernière fois**

```bash
npm test
```

Expected: tous les tests PASS (fondation + routage + aucune régression sur les tests existants).

- [ ] **Step 6: Sauvegarder l'état**

Plan livré : `Code.gs` (NAV_PAGES + apiGetNavPages + doGet routé), `Index.html` (menu chargé depuis le serveur, bascule vers `?view=`), `Mobile.html` (nouveau, 7 onglets complets), `tests/harness.js` (exports étendus), `tests/nav-pages.test.js` et `tests/doget-routing.test.js` (nouveaux).

---

## Self-Review

**Couverture des 7 onglets de `context.md` §5** — confirmée :
- 📊 Dashboard → Task 5 (filtres croisés joueurs/catégories/période, 6 types de graphique, card Commentaires en premier, avatar sur chaque phrase).
- ✍️ Saisir un Lot → Task 6 (constructeur de lignes joueur+top+points+date, saisie batch via `apiAddBulkPlan`).
- ⚙️ Paramètres → Task 9 (joueurs, catégories, barème, presets de phrases — CRUD complet, avatar partout).
- 📝 Notes → Task 7 (saisie rapide en un geste, priorité mobile confirmée par context.md §1).
- 📜 Historique → Task 8 (cartes, pas de tableau, filtres, édition, suppression).
- 🔧 Outils → Task 10 (rapport de santé, nettoyage orphelins, détection/regroupement lots répartis — exactement le périmètre demandé, rien de plus).
- ❓ Guide → Task 11 (accordéon, une section par onglet réel).
- Identité ("Qui suis-je") → Task 4, réutilise `apiVerifyIdentity` et la même logique de modale mot de passe que `Index.html` (mêmes clés `localStorage`, même comportement de blocage via `requireIdentity`).
- Registre de menu unique → Task 1 (`apiGetNavPages`), consommé par `Index.html` (Task 3) et `Mobile.html` (Task 4) — aucune duplication de la liste des onglets.
- Routage device + bascule mémorisée → Task 2 (backend) + Task 3 (desktop) + Task 4 (mobile), clé `localStorage` `tdt_layout_mode` partagée entre les trois.

**Hors périmètre respecté** (conforme à la spec) : pas d'éditeur de règles AutoPoints, pas de visualiseur de journal d'audit, pas de refonte des sous-onglets de Paramètres au-delà d'un restyle, pas de mode hors-ligne/PWA.

**Aucun placeholder** : chaque fonction listée dans les 12 tâches a un corps complet (pas de `TODO`, pas de `// ...`, pas de "similaire à la Task N"). Les corps de fonctions dupliquées (`callServer`, `showToast`, `startBtnLoading`, `buzz`, `getAvatarUrl`, `escapeHtml`, `hashColor`/`playerColor`/`categoryColor`) sont recopiés à l'identique depuis `Index.html`, avec les mêmes valeurs de configuration (délais de toast, clé `PALETTE`, format d'URL `ui-avatars.com`).

**Cohérence des noms à travers les tâches** — vérifiée :
- `NAV_PAGES` / `apiGetNavPages` : mêmes noms Task 1 → Task 3 → Task 4.
- `_whoAmI` / `WHO_AM_I_KEY` (`'tdt_who_am_i'`) : identiques entre `Index.html` et `Mobile.html`, cohérent avec Task 4.
- `tdt_layout_mode` : même clé `localStorage` utilisée par le toggle desktop (Task 3) et le toggle mobile (Task 4) et lue par le bootstrap de redirection (Task 2).
- `topsdestops_theme` : même clé `localStorage` pour le thème entre les deux fichiers (Task 4, `initTheme`).
- `tab-dashboard`, `tab-inject`, `tab-settings`, `tab-notes`, `tab-history`, `tab-outils`, `tab-guide` : mêmes ids utilisés dans `NAV_PAGES` (Task 1), dans le routage `goToTab` de `Mobile.html` (Task 4) et dans le cas spécial `tab-outils` ajouté à `goToTab` de `Index.html` (Task 3).
- `apiGetNavPages`, `apiGetDataHealth`, `apiDeleteOrphans`, `apiDetectDistributedLots`, `apiGroupDistributedLots`, tous les endpoints Paramètres/Phrases/Barème/Notes/Historique : appelés avec exactement la même signature de paramètres que celle définie dans `Code.gs` (vérifié ligne par ligne contre le fichier source pendant la rédaction du plan).

**Point d'attention corrigé pendant la rédaction** : `apiGetNavPages()` introduit une entrée `tab-outils` qui n'a pas de `<div id="tab-outils">` propre côté `Index.html` (Outils y est un sous-onglet de Paramètres). Sans correction, cliquer sur "🔧 Outils" dans le nav desktop aurait provoqué une erreur JS (`getElementById(...).classList` sur `null`). Fixé dans Task 3, Step 3 : `goToTab` route `tab-outils` vers `tab-settings` puis clique automatiquement le sous-onglet Outils existant — aucune restructuration HTML, conforme au hors-périmètre de la spec.

Aucun problème ouvert restant.
