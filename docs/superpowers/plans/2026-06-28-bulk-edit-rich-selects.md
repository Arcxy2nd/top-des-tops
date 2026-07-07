# Édition groupée + Sélecteurs visuels — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les `<select>` natifs par un composant `buildRichSelect` avec avatars/emojis, et étendre l'édition groupée de l'Historique à tous les champs avec gestion des valeurs mixtes.

**Architecture:** Deux fonctionnalités interdépendantes. Le composant `buildRichSelect` est défini en premier (Task 2-3) car il est utilisé dans la modale d'édition simple (Task 4), dans `addEntryRow` (Task 5), et dans la nouvelle modale d'édition groupée (Task 6). Le backend `apiUpdateBulkEntries` est ajouté en amont (Task 1) pour que la modale groupée puisse l'appeler. Tout vit dans les deux fichiers monolithiques `Code.gs` et `Index.html`.

**Tech Stack:** Google Apps Script (ES5 patterns), HTML/CSS/JS vanilla, tests Node VM via `tests/harness.js`.

---

## Fichiers touchés

| Fichier | Lignes clés modifiées / ajoutées |
|---|---|
| `Code.gs` | ~1154 (après `apiUpdateBulkDescription`) : ajout `apiUpdateBulkEntries` |
| `Index.html` | ~960 (CSS) : ajout blocs `.rich-select` / `.rs-*` |
| `Index.html` | ~2195 : ajout `let histPageLogs = []` |
| `Index.html` | ~3200 (JS utilitaires) : ajout `buildRichSelect` + `closeAllRichSelects` |
| `Index.html` | ~5083–5356 (`addEntryRow`) : remplacer sels natifs par RichSelect hybride |
| `Index.html` | ~6534–6608 (`openFullEditHistoryModal`) : remplacer sels natifs par RichSelect |
| `Index.html` | ~5891–5895 (`loadHistoryPage`) : stocker `histPageLogs` |
| `Index.html` | ~1991–2001 (HTML `histBulkBar`) : retirer input desc, ajouter bouton Modifier |
| `Index.html` | ~7072 (`window.onload`) : ajout handler click-outside global |
| `Index.html` | ~6823–6845 (listeners) : remplacer listener `histBulkDescApply` par `histBulkEdit` + `openBulkEditModal` |
| `tests/bulk-edit.test.js` | Nouveau fichier de tests backend |

---

## Task 1 — Backend : `apiUpdateBulkEntries` dans `Code.gs`

**Files:**
- Modify: `Code.gs` (après `apiUpdateBulkDescription`, ligne ~1154)
- Create: `tests/bulk-edit.test.js`

- [ ] **Step 1 — Écrire le test**

Créer `tests/bulk-edit.test.js` :

```js
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createContext } = require('./harness.js');

describe('apiUpdateBulkEntries', () => {
  test('updates only specified fields, leaves others intact', () => {
    // History: row 2 = Alice, Jeux, 10pts, 2026-01-01, desc='orig', saiseur='Bob'
    //          row 3 = Charlie, Sport, 5pts, 2026-01-02, desc='',     saiseur=''
    const grid = [
      ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'],
      [new Date('2026-01-01'), 'Alice', 'Jeux', 10, 'orig', '', 'Bob'],
      [new Date('2026-01-02'), 'Charlie', 'Sport', 5, '', '', ''],
    ];
    const ctx = createContext({ history: grid });
    const res = ctx.apiUpdateBulkEntries([2, 3], { description: 'edited' });
    assert.equal(res.success, true);
    assert.deepEqual(res.skipped, []);
    // Description updated, player/category/points intact
    const row2 = ctx.sheets.history._grid[1];
    assert.equal(row2[1], 'Alice');
    assert.equal(row2[2], 'Jeux');
    assert.equal(row2[3], 10);
    assert.equal(row2[4], 'edited');
    assert.equal(row2[6], 'Bob'); // saiseur untouched
    const row3 = ctx.sheets.history._grid[2];
    assert.equal(row3[1], 'Charlie');
    assert.equal(row3[4], 'edited');
  });

  test('updates saiseur when explicitly in partialFields', () => {
    const grid = [
      ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'],
      [new Date('2026-01-01'), 'Alice', 'Jeux', 10, '', '', 'Bob'],
      [new Date('2026-01-02'), 'Charlie', 'Sport', 5, '', '', 'Dave'],
    ];
    const ctx = createContext({ history: grid });
    ctx.apiUpdateBulkEntries([2, 3], { saiseur: 'Eve' });
    assert.equal(ctx.sheets.history._grid[1][6], 'Eve');
    assert.equal(ctx.sheets.history._grid[2][6], 'Eve');
  });

  test('skips invalid row indexes silently', () => {
    const grid = [
      ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'],
      [new Date('2026-01-01'), 'Alice', 'Jeux', 10, '', '', ''],
    ];
    const ctx = createContext({ history: grid });
    const res = ctx.apiUpdateBulkEntries([99, 2], { description: 'x' });
    assert.equal(res.success, true);
    assert.ok(res.skipped.includes(99));
    assert.equal(ctx.sheets.history._grid[1][4], 'x');
  });

  test('returns success immediately when partialFields is empty', () => {
    const ctx = createContext({ history: [['h'], [new Date(), 'Alice', 'Jeux', 1, '', '', '']] });
    const res = ctx.apiUpdateBulkEntries([2], {});
    assert.equal(res.success, true);
  });
});
```

- [ ] **Step 2 — Vérifier que le test échoue**

```bash
node --test tests/bulk-edit.test.js
```
Attendu : erreur « apiUpdateBulkEntries is not a function » (ou similaire).

- [ ] **Step 3 — Ajouter `apiUpdateBulkEntries` dans `Code.gs`**

Insérer après `apiUpdateBulkDescription` (ligne ~1154), avant la ligne vide qui suit :

```javascript
function apiUpdateBulkEntries(rowIndexes, partialFields) {
  try {
    if (!rowIndexes || !rowIndexes.length) throw new Error("Aucune ligne sélectionnée.");
    if (!partialFields || !Object.keys(partialFields).length) return { success: true };
    return withLock(function() {
      var history  = ConfigService.getSheets().history;
      var lastRow  = history.getLastRow();
      if (lastRow <= 1) return { success: true, skipped: [] };

      var allData  = history.getRange(2, 1, lastRow - 1, 7).getValues();
      var indexSet = new Set(rowIndexes.map(function(ri) { return parseInt(ri, 10); }));
      var skipped  = [];

      var hasDate   = 'date'        in partialFields;
      var hasPlayer = 'player'      in partialFields;
      var hasCat    = 'category'    in partialFields;
      var hasPts    = 'points'      in partialFields;
      var hasDesc   = 'description' in partialFields;
      var hasSais   = 'saiseur'     in partialFields;

      indexSet.forEach(function(idx) {
        var rowI = idx - 2;
        if (rowI < 0 || rowI >= allData.length) { skipped.push(idx); return; }
        var row      = allData[rowI];
        var player   = hasPlayer ? partialFields.player   : (row[1] ? row[1].toString() : '');
        var category = hasCat    ? partialFields.category : (row[2] ? row[2].toString() : '');
        var pts      = hasPts    ? parseInt(partialFields.points, 10) : parseInt(row[3], 10);
        var desc     = hasDesc   ? (partialFields.description || '') : (row[4] ? row[4].toString() : '');
        var saiseur  = hasSais   ? (partialFields.saiseur  || '') : (row[6] ? row[6].toString() : '');

        if (!player || !category || isNaN(pts) || pts < 1) { skipped.push(idx); return; }

        var targetDate;
        if (hasDate) {
          targetDate = new Date(partialFields.date + 'T12:00:00');
          if (isNaN(targetDate.getTime())) { skipped.push(idx); return; }
        } else {
          targetDate = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
        }

        history.getRange(idx, 1, 1, 5).setValues([[targetDate, player, category, pts, desc]]);
        if (hasSais) history.getRange(idx, 7).setValue(saiseur);
      });

      ConfigService.clearCache();
      return { success: true, skipped: skipped };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 4 — Vérifier la syntaxe**

```bash
cp Code.gs Code.js && node --check Code.js && rm Code.js
```
Attendu : aucune erreur.

- [ ] **Step 5 — Vérifier que les tests passent**

```bash
node --test tests/bulk-edit.test.js
```
Attendu : 4 tests PASS.

Vérifier aussi que les tests existants n'ont pas régressé :
```bash
npm test
```
Attendu : tous PASS.

- [ ] **Step 6 — Vérifier le harness.js si `createContext` n'existe pas encore**

Si `tests/harness.js` n'exporte pas `createContext`, inspecter ce qu'il exporte et adapter les tests pour utiliser l'API existante. Regarder `tests/storage.test.js` pour voir le pattern en usage.

- [ ] **Step 7 — Commit**

```bash
git add Code.gs tests/bulk-edit.test.js
git commit -m "feat: add apiUpdateBulkEntries for partial bulk field update"
```

---

## Task 2 — Frontend CSS : composant RichSelect

**Files:**
- Modify: `Index.html` (~ligne 960, section `/* ── HISTORY SELECTION ──*/`)

- [ ] **Step 1 — Ajouter le bloc CSS RichSelect**

Insérer à la suite de la section `/* ── HISTORY SELECTION ── */` (ligne ~994), avant `/* ── CHIPS FILTRES HISTORIQUE ── */` :

```css
    /* ── RICH SELECT ── */
    .rich-select {
      position: relative; display: flex; width: 100%;
    }
    .rs-trigger {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 9px 12px; cursor: pointer; text-align: left;
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 6px; color: var(--text); font-size: 0.88rem;
      transition: border-color 0.15s;
    }
    .rs-trigger:hover,
    .rs-trigger.rs-open { border-color: var(--accent); }
    .rs-trigger.rs-mixed {
      background: rgba(255, 71, 87, 0.06);
      border-style: dashed; color: var(--text-muted);
    }
    .rs-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-chevron {
      font-size: 0.72rem; color: var(--text-muted); flex-shrink: 0;
      transition: transform 0.15s; display: inline-block;
    }
    .rs-trigger.rs-open .rs-chevron { transform: rotate(180deg); }
    .rs-panel {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      background: var(--card-bg, var(--bg)); border: 1px solid var(--border);
      border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.28);
      max-height: 220px; overflow-y: auto; z-index: 200;
    }
    .rs-option {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; cursor: pointer; font-size: 0.86rem;
      transition: background 0.1s;
    }
    .rs-option:hover    { background: rgba(255,255,255,0.06); }
    .rs-option.rs-selected { background: rgba(255, 71, 87, 0.1); }
    .rs-thumb {
      width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--btn-alt); overflow: hidden; font-size: 1rem; line-height: 1;
    }
    .rs-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .rs-thumb-dot { border-radius: 50%; }
    .rs-thumb-emoji { background: transparent; font-size: 1.1rem; }
    .rs-opt-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-cat-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    /* Ajustements pour les wrappers existants qui accueillent un RS */
    .player-sel-wrap.rs-host,
    .c-sel-wrap.rs-host {
      padding: 0; border: none; background: transparent;
    }
    .player-sel-wrap.rs-host:focus-within,
    .c-sel-wrap.rs-host:focus-within { border: none; }
```

- [ ] **Step 2 — Vérifier la syntaxe HTML**

```bash
node --check Index.html 2>&1 | head -5
```
(Cette commande check le JS embarqué; les erreurs CSS ne seront pas détectées ici — visuel à valider plus tard.)

- [ ] **Step 3 — Commit**

```bash
git add Index.html
git commit -m "style: add RichSelect CSS component"
```

---

## Task 3 — Frontend JS : `buildRichSelect` + `closeAllRichSelects`

**Files:**
- Modify: `Index.html` (section JS utilitaires, ~ligne 3200, après `hashColor` ou `categoryColor`)

- [ ] **Step 1 — Ajouter les fonctions après `categoryColor`**

Insérer après la fonction `categoryColor` (ligne ~3210) :

```javascript
  // ── RICH SELECT ──────────────────────────────────────────────────────
  function closeAllRichSelects() {
    document.querySelectorAll('.rs-panel').forEach(function(panel) {
      if (panel.style.display !== 'none') {
        panel.style.display = 'none';
        var trigger = panel.previousElementSibling;
        if (trigger) {
          trigger.classList.remove('rs-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      }
    });
  }

  /**
   * Builds a custom rich dropdown replacing a native <select>.
   * config.type      : 'player' | 'category' | 'saiseur'
   * config.value     : initial string value (or null)
   * config.onChange  : callback(newValue: string|null)
   * config.nullable  : bool — adds "— inconnu —" as first option
   * config.mixedState: bool — starts in mixed-value state
   * Returns a div.rich-select with _getValue(), _isMixed(), _setValue(val) methods.
   */
  function buildRichSelect(config) {
    var type       = config.type;
    var onChange   = config.onChange || function() {};
    var nullable   = !!config.nullable;
    var isMixed    = !!config.mixedState;
    var curVal     = config.value || null;

    var wrap    = document.createElement('div');
    wrap.className = 'rich-select';
    wrap.dataset.type = type;

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-expanded', 'false');

    var thumb   = document.createElement('span');
    thumb.className = 'rs-thumb';
    var label   = document.createElement('span');
    label.className = 'rs-label';
    var chevron = document.createElement('span');
    chevron.className = 'rs-chevron';
    chevron.textContent = '▾';
    trigger.appendChild(thumb);
    trigger.appendChild(label);
    trigger.appendChild(chevron);

    var panel = document.createElement('div');
    panel.className = 'rs-panel';
    panel.style.display = 'none';
    panel.setAttribute('role', 'listbox');

    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    function makeThumb(container, val, isCategory) {
      container.innerHTML = '';
      container.className = 'rs-thumb';
      container.style.background = '';
      if (!val) return;
      if (isCategory) {
        var icon = catIcon(val);
        if (icon) {
          container.textContent = icon;
          container.className = 'rs-thumb rs-thumb-emoji';
        } else {
          container.className = 'rs-thumb rs-thumb-dot';
          container.style.background = categoryColor(val);
        }
      } else {
        var pData = cachedPlayers.find(function(p) { return p.name === val; });
        var img = document.createElement('img');
        img.src = getAvatarUrl(val, pData ? pData.meta : '');
        img.alt = '';
        img.onerror = function() { img.remove(); };
        container.appendChild(img);
      }
    }

    function renderTrigger() {
      var isCategory = (type === 'category');
      if (isMixed) {
        thumb.innerHTML = ''; thumb.className = 'rs-thumb'; thumb.style.background = '';
        label.textContent = '— Valeurs mixtes —';
        trigger.className = 'rs-trigger rs-mixed';
      } else if (!curVal && nullable) {
        thumb.innerHTML = ''; thumb.className = 'rs-thumb'; thumb.style.background = '';
        label.textContent = '— inconnu —';
        trigger.className = 'rs-trigger';
      } else if (curVal) {
        makeThumb(thumb, curVal, isCategory);
        label.textContent = curVal;
        trigger.className = 'rs-trigger';
      } else {
        thumb.innerHTML = ''; thumb.className = 'rs-thumb'; thumb.style.background = '';
        var first = isCategory
          ? (cachedCategories[0] ? cachedCategories[0].name : '')
          : (cachedPlayers[0]    ? cachedPlayers[0].name    : '');
        label.textContent = first || '—';
        trigger.className = 'rs-trigger';
      }
    }

    function buildPanel() {
      panel.innerHTML = '';
      var isCategory = (type === 'category');
      var items = [];
      if (nullable) items.push({ val: null, isNull: true });
      if (isCategory) {
        cachedCategories.forEach(function(c) { items.push({ val: c.name }); });
      } else {
        cachedPlayers.forEach(function(p) { items.push({ val: p.name }); });
      }
      items.forEach(function(item) {
        var opt = document.createElement('div');
        opt.className = 'rs-option' + (item.val === curVal ? ' rs-selected' : '');
        opt.setAttribute('role', 'option');

        var optThumb = document.createElement('span');
        if (!item.isNull) {
          makeThumb(optThumb, item.val, isCategory);
        } else {
          optThumb.className = 'rs-thumb';
        }
        var optLabel = document.createElement('span');
        optLabel.className = 'rs-opt-label';
        optLabel.textContent = item.isNull ? '— inconnu —' : item.val;
        opt.appendChild(optThumb);
        opt.appendChild(optLabel);
        if (isCategory && !item.isNull) {
          var dot = document.createElement('span');
          dot.className = 'rs-cat-dot';
          dot.style.background = categoryColor(item.val);
          opt.appendChild(dot);
        }
        opt.addEventListener('mousedown', function(e) {
          e.preventDefault();
          isMixed  = false;
          curVal   = item.val;
          closePanel();
          renderTrigger();
          onChange(curVal);
        });
        panel.appendChild(opt);
      });
    }

    function openPanel() {
      closeAllRichSelects();
      buildPanel();
      panel.style.display = '';
      trigger.classList.add('rs-open');
      trigger.setAttribute('aria-expanded', 'true');
    }

    function closePanel() {
      panel.style.display = 'none';
      trigger.classList.remove('rs-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', function() {
      if (panel.style.display === 'none') {
        isMixed = false;
        openPanel();
      } else {
        closePanel();
      }
    });

    // Public API
    wrap._getValue  = function() { return curVal; };
    wrap._isMixed   = function() { return isMixed; };
    wrap._setValue  = function(val) { curVal = val; isMixed = false; renderTrigger(); };
    wrap._setMixed  = function() { isMixed = true; renderTrigger(); };

    renderTrigger();
    return wrap;
  }
```

- [ ] **Step 2 — Ajouter le handler click-outside dans `window.onload`**

À la fin de `window.onload` (avant la dernière accolade fermante, ligne ~7072+), ajouter :

```javascript
    // Close any open RichSelect when clicking outside
    document.addEventListener('mousedown', function(e) {
      if (!e.target.closest('.rich-select')) closeAllRichSelects();
    });
```

- [ ] **Step 3 — Vérifier la syntaxe JS**

```bash
node --check Index.html
```
Attendu : aucune erreur.

- [ ] **Step 4 — Commit**

```bash
git add Index.html
git commit -m "feat: add buildRichSelect universal dropdown component"
```

---

## Task 4 — Intégration dans `openFullEditHistoryModal`

Remplacer les 3 `<select>` natifs (joueur, top, saiseur) par `buildRichSelect` dans la fonction `openFullEditHistoryModal` (lignes ~6534–6608).

**Files:**
- Modify: `Index.html:6534–6608`

- [ ] **Step 1 — Remplacer `openFullEditHistoryModal`**

Remplacer l'intégralité de la fonction (de `function openFullEditHistoryModal(log) {` jusqu'au `}` fermant à la ligne ~6608) par :

```javascript
  function openFullEditHistoryModal(log) {
    const box = document.getElementById('modalBox');
    box.classList.add('wide');

    const d       = log.timestamp ? new Date(log.timestamp) : new Date();
    const dateVal = isNaN(d) ? toDateStr(new Date()) : toDateStr(d);

    box.innerHTML =
      '<h3>✏️ Modifier l\'entrée</h3>' +
      '<div class="modal-grid">' +
        '<div class="modal-field"><label>Date</label>' +
          '<input type="date" id="mEditDate" value="' + escapeHtml(dateVal) + '"></div>' +
        '<div class="modal-field"><label>Points</label>' +
          '<input type="number" id="mEditPts" value="' + escapeHtml(String(log.points)) + '" min="1" step="1" inputmode="numeric"></div>' +
      '</div>' +
      '<div class="modal-grid">' +
        '<div class="modal-field"><label>Joueur</label>' +
          '<div id="mEditPlayerRS"></div></div>' +
        '<div class="modal-field"><label>Top</label>' +
          '<div id="mEditCategoryRS"></div></div>' +
      '</div>' +
      '<div class="modal-grid single">' +
        '<div class="modal-field"><label>Description (optionnelle)</label>' +
          '<input type="text" id="mEditDesc" value="' + escapeHtml(log.description || '') + '" placeholder="Description…"></div>' +
      '</div>' +
      '<div class="modal-grid single">' +
        '<div class="modal-field"><label>Saiseur</label>' +
          '<div id="mEditSaiseurRS"></div></div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button id="mSave" class="primary">Enregistrer</button>' +
        '<button id="mCancel" class="secondary">Annuler</button>' +
      '</div>';

    const playerRS  = buildRichSelect({ type: 'player',   value: log.player,   onChange: function() {} });
    const categoryRS = buildRichSelect({ type: 'category', value: log.category, onChange: function() {} });
    const saiseurRS  = buildRichSelect({ type: 'saiseur',  value: log.saiseur || null, onChange: function() {}, nullable: true });

    document.getElementById('mEditPlayerRS').appendChild(playerRS);
    document.getElementById('mEditCategoryRS').appendChild(categoryRS);
    document.getElementById('mEditSaiseurRS').appendChild(saiseurRS);

    document.getElementById('mSave').onclick = function() {
      const date     = document.getElementById('mEditDate').value;
      const pts      = parseInt(document.getElementById('mEditPts').value, 10);
      const player   = playerRS._getValue();
      const category = categoryRS._getValue();
      const desc     = document.getElementById('mEditDesc').value.trim();
      const saiseur  = saiseurRS._getValue() || '';

      if (!date)                 { showToast('Date requise.', 'error'); return; }
      if (isNaN(pts) || pts < 1) { showToast('Points invalides (min 1).', 'error'); return; }
      if (!player)               { showToast('Joueur requis.', 'error'); return; }
      if (!category)             { showToast('Top requis.', 'error'); return; }

      closeModal();
      callServer('apiUpdateHistoryEntry', [log.rowIndex, { date, player, category, points: pts, description: desc, saiseur }],
        function(res) {
          if (res && res.success === false) {
            showToast('Erreur : ' + (res.error || 'Mise à jour impossible.'), 'error');
          } else {
            showToast('Entrée modifiée.', 'success');
            loadHistoryPage(currentHistoryPage);
            applyFilters();
          }
        }, 'Modification entrée'
      );
    };
    document.getElementById('mCancel').onclick = closeModal;
    document.getElementById('modalBackdrop').style.display = 'flex';
    setTimeout(function() { const el = document.getElementById('mEditPts'); if (el) el.focus(); }, 50);
  }
```

- [ ] **Step 2 — Vérifier la syntaxe JS**

```bash
node --check Index.html
```
Attendu : aucune erreur.

- [ ] **Step 3 — Commit**

```bash
git add Index.html
git commit -m "feat: replace native selects with RichSelect in history edit modal"
```

---

## Task 5 — Intégration dans `addEntryRow`

Approche hybride : garder des `<input type="hidden">` avec les classes `.p-sel` / `.c-sel` (pour que `submitBulk` et `updateLotSummary` continuent à fonctionner sans changement), et monter un `buildRichSelect` visible à la place du select natif.

**Files:**
- Modify: `Index.html:5083–5356` (bloc joueur + bloc top dans `addEntryRow`)

- [ ] **Step 1 — Remplacer le bloc joueur (lignes ~5083–5099)**

Remplacer de `// ── Joueur ──` jusqu'à `wrap.appendChild(img); wrap.appendChild(pSel);` par :

```javascript
    // ── Joueur ──────────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'player-sel-wrap rs-host';

    // Hidden input for backward compat (submitBulk, updateLotSummary read .p-sel)
    const pSel = document.createElement('input');
    pSel.type = 'hidden'; pSel.className = 'p-sel';
    pSel.value = cachedPlayers[0] ? cachedPlayers[0].name : '';

    const playerRS = buildRichSelect({
      type: 'player',
      value: pSel.value,
      onChange: function(val) {
        pSel.value = val || '';
        const pData = cachedPlayers.find(function(p) { return p.name === val; });
        const url = getAvatarUrl(val, pData ? pData.meta : '');
        avatarBg.style.backgroundImage = 'url(' + url + ')';
        div.style.setProperty('--player-ring', playerColor(val));
      }
    });

    wrap.appendChild(pSel);
    wrap.appendChild(playerRS);
```

- [ ] **Step 2 — Remplacer le bloc Top (lignes ~5101–5123)**

Remplacer de `// ── Top ──` jusqu'à `updateLotSummary();` par :

```javascript
    // ── Top ─────────────────────────────────────────────────────────────
    const cSel = document.createElement('input');
    cSel.type = 'hidden'; cSel.className = 'c-sel';
    cSel.value = cachedCategories[0] ? cachedCategories[0].name : '';

    const cSelWrap = document.createElement('div');
    cSelWrap.className = 'c-sel-wrap rs-host';

    const catRS = buildRichSelect({
      type: 'category',
      value: cSel.value,
      onChange: function(val) {
        cSel.value = val || '';
        const col = categoryColor(val);
        div.style.setProperty('--row-accent', col);
        refreshBaremeForTop(val);
        updateLotSummary();
      }
    });

    cSelWrap.appendChild(cSel);
    cSelWrap.appendChild(catRS);
```

- [ ] **Step 3 — Mettre à jour les références à `pSel` et `cSel` dans les closures de `addEntryRow`**

a) Le bouton dupliqué (ligne ~5246) passe déjà `pSel.value` et `cSel.value` — aucune modification nécessaire car les hidden inputs ont `.value`. ✓

b) La ligne `cSel.addEventListener('change', () => refreshBaremeForTop(cSel.value))` (ligne ~5335) doit être **supprimée** (la logique est maintenant dans `catRS`'s onChange).

c) Le bloc preset (lignes ~5343–5354) doit être remplacé par :

```javascript
    if (preset) {
      if (preset.player && cachedPlayers.find(function(p) { return p.name === preset.player; })) {
        pSel.value = preset.player;
        playerRS._setValue(preset.player);
      }
      if (preset.category && cachedCategories.find(function(c) { return c.name === preset.category; })) {
        cSel.value = preset.category;
        catRS._setValue(preset.category);
      }
    }
    // Init avatar bg
    const initPlayerData = cachedPlayers.find(function(p) { return p.name === pSel.value; });
    avatarBg.style.backgroundImage = 'url(' + getAvatarUrl(pSel.value, initPlayerData ? initPlayerData.meta : '') + ')';
    div.style.setProperty('--player-ring', playerColor(pSel.value));
    const initCatCol = categoryColor(cSel.value);
    div.style.setProperty('--row-accent', initCatCol);
    refreshBaremeForTop(cSel.value);
    updateLotSummary();
```

Supprimer les lignes `updateRowAvatar(pSel, img)` et `catDot.style.background = initCatCol` et `img.style.setProperty(...)` (maintenant gérées ci-dessus ou dans RS).

d) L'appel `updateRowAvatar(pSel, img)` à la ligne ~5347 doit être **supprimé** (plus d'`img` dans le wrap).

- [ ] **Step 4 — Supprimer les règles CSS devenues orphelines**

Dans la section `<style>`, les règles ci-dessous ne s'appliquent plus à rien mais sont inoffensives — les laisser en place pour éviter d'introduire un diff trop large. (Nettoyage optionnel dans une session dédiée.)

- [ ] **Step 5 — Vérifier la syntaxe JS**

```bash
node --check Index.html
```
Attendu : aucune erreur.

- [ ] **Step 6 — Commit**

```bash
git add Index.html
git commit -m "feat: replace native selects with RichSelect in batch entry rows"
```

---

## Task 6 — Édition groupée : `openBulkEditModal` + mise à jour de l'UI

**Files:**
- Modify: `Index.html` (plusieurs sections)

### 6a — Tracking `histPageLogs`

- [ ] **Step 1 — Ajouter `let histPageLogs = []` avec les autres variables d'état**

À la ligne ~2195, à la suite de `let histVisibleRows = [];` (ligne 2195), ajouter :

```javascript
  let histPageLogs    = [];   // full log objects for the current history page
```

- [ ] **Step 2 — Peupler `histPageLogs` dans `loadHistoryPage`**

À la ligne ~5894, là où `histVisibleRows = logs.map(...)` est assigné, ajouter juste en dessous :

```javascript
      histPageLogs = logs;
```

Et dans le bloc `if (!logs.length)` (ligne ~5889) ajouter `histPageLogs = [];` juste à côté de `histVisibleRows = [];`.

### 6b — HTML `histBulkBar`

- [ ] **Step 3 — Modifier le HTML de `histBulkBar` (lignes 1991–2001)**

Remplacer le contenu de `<div id="histBulkBar" ...>` par :

```html
      <div id="histBulkBar" class="hist-bulk-bar" style="display:none;">
        <span id="histBulkCount">0 sélectionné(s)</span>
        <button id="histBulkEdit" class="secondary small">✏️ Modifier</button>
        <button id="histBulkSelectAll" class="secondary small">Tout sélectionner</button>
        <button id="histBulkGroup" class="secondary small">🔗 Grouper</button>
        <button id="histBulkDelete" class="danger small">🗑️ Supprimer</button>
        <button id="histBulkCancel" class="secondary small">✕ Annuler</button>
      </div>
```

Supprimer aussi le style `.hist-bulk-desc-wrap` si désiré (inoffensif de le laisser).

### 6c — Listener : remplacer `histBulkDescApply` par `histBulkEdit`

- [ ] **Step 4 — Supprimer le listener `histBulkDescApply` (lignes ~6824–6845)**

Supprimer le bloc entier :

```javascript
    // ── Bulk description apply ──
    document.getElementById('histBulkDescApply').addEventListener('click', () => {
      ...
    });
```

- [ ] **Step 5 — Ajouter le listener `histBulkEdit` à la même place**

```javascript
    // ── Bulk edit ──
    document.getElementById('histBulkEdit').addEventListener('click', function() {
      if (!histSelected.size) { showToast('Aucune entrée sélectionnée.', 'error'); return; }
      openBulkEditModal();
    });
```

### 6d — Fonction `openBulkEditModal`

- [ ] **Step 6 — Ajouter `openBulkEditModal` juste avant `openFullEditHistoryModal` (ligne ~6534)**

```javascript
  function openBulkEditModal() {
    const selectedLogs = histPageLogs.filter(function(l) {
      return histSelected.has(l.rowIndex);
    });
    if (!selectedLogs.length) { showToast('Entrées introuvables sur cette page.', 'error'); return; }

    const n = selectedLogs.length;

    // Analyse champ par champ : identique ou mixte
    function fieldState(getter) {
      const vals = selectedLogs.map(getter);
      const unique = new Set(vals);
      return unique.size === 1
        ? { mixed: false, value: vals[0] }
        : { mixed: true,  value: null   };
    }

    const stDate    = fieldState(function(l) { return l.timestamp ? toDateStr(new Date(l.timestamp)) : ''; });
    const stPts     = fieldState(function(l) { return String(l.points); });
    const stPlayer  = fieldState(function(l) { return l.player; });
    const stCat     = fieldState(function(l) { return l.category; });
    const stDesc    = fieldState(function(l) { return l.description || ''; });
    const stSaiseur = fieldState(function(l) { return l.saiseur || ''; });

    const box = document.getElementById('modalBox');
    box.classList.add('wide');

    box.innerHTML =
      '<h3>✏️ Modifier ' + n + ' entrée' + (n > 1 ? 's' : '') + '</h3>' +
      '<p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 12px;">' +
        'Laissez un champ «&nbsp;Valeurs mixtes&nbsp;» pour ne pas l\'écraser.</p>' +
      '<div class="modal-grid">' +
        '<div class="modal-field"><label>Date</label>' +
          '<input type="date" id="mbDate"' +
            (stDate.mixed ? ' placeholder="— Valeurs mixtes —" class="rs-mixed-input"' : ' value="' + escapeHtml(stDate.value) + '"') + '></div>' +
        '<div class="modal-field"><label>Points</label>' +
          '<input type="number" id="mbPts" min="1" step="1" inputmode="numeric"' +
            (stPts.mixed ? ' placeholder="— mixtes —" class="rs-mixed-input"' : ' value="' + escapeHtml(stPts.value) + '"') + '></div>' +
      '</div>' +
      '<div class="modal-grid">' +
        '<div class="modal-field"><label>Joueur</label><div id="mbPlayerRS"></div></div>' +
        '<div class="modal-field"><label>Top</label><div id="mbCategoryRS"></div></div>' +
      '</div>' +
      '<div class="modal-grid single">' +
        '<div class="modal-field"><label>Description</label>' +
          '<input type="text" id="mbDesc"' +
            (stDesc.mixed ? ' placeholder="— Valeurs mixtes —" class="rs-mixed-input"' : ' value="' + escapeHtml(stDesc.value) + '"') + '></div>' +
      '</div>' +
      '<div class="modal-grid single">' +
        '<div class="modal-field"><label>Saiseur</label><div id="mbSaiseurRS"></div></div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button id="mbSave" class="primary">Enregistrer</button>' +
        '<button id="mbCancel" class="secondary">Annuler</button>' +
      '</div>';

    // Inline CSS for mixed state inputs (reuse rs-mixed styling)
    var style = document.getElementById('_mbMixedStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = '_mbMixedStyle';
      style.textContent = '.rs-mixed-input { background: rgba(255,71,87,0.06); border-style: dashed !important; color: var(--text-muted); }';
      document.head.appendChild(style);
    }

    const playerRS   = buildRichSelect({ type: 'player',   value: stPlayer.value,  onChange: function() {}, mixedState: stPlayer.mixed  });
    const categoryRS = buildRichSelect({ type: 'category', value: stCat.value,     onChange: function() {}, mixedState: stCat.mixed     });
    const saiseurRS  = buildRichSelect({ type: 'saiseur',  value: stSaiseur.value || null, onChange: function() {}, nullable: true, mixedState: stSaiseur.mixed });

    document.getElementById('mbPlayerRS').appendChild(playerRS);
    document.getElementById('mbCategoryRS').appendChild(categoryRS);
    document.getElementById('mbSaiseurRS').appendChild(saiseurRS);

    document.getElementById('mbSave').onclick = function() {
      const partialFields = {};

      const dateVal = document.getElementById('mbDate').value;
      if (dateVal) partialFields.date = dateVal;

      const ptsRaw = document.getElementById('mbPts').value;
      if (ptsRaw !== '') {
        const pts = parseInt(ptsRaw, 10);
        if (isNaN(pts) || pts < 1) { showToast('Points invalides (min 1).', 'error'); return; }
        partialFields.points = pts;
      }

      if (!playerRS._isMixed())   partialFields.player   = playerRS._getValue();
      if (!categoryRS._isMixed()) partialFields.category = categoryRS._getValue();

      const descEl = document.getElementById('mbDesc');
      if (descEl && !descEl.classList.contains('rs-mixed-input') || (descEl && descEl.value !== (stDesc.mixed ? '' : stDesc.value))) {
        // If not mixed originally OR user typed something, include it
        if (!stDesc.mixed || descEl.value !== '') partialFields.description = descEl.value.trim();
      }
      // Simpler: always include description if input has no placeholder class active
      // Use dataset flag instead:
      if (!stDesc.mixed) partialFields.description = descEl.value.trim();
      if (stDesc.mixed && descEl.value.trim() !== '') partialFields.description = descEl.value.trim();

      if (!saiseurRS._isMixed()) partialFields.saiseur = saiseurRS._getValue() || '';

      if (!Object.keys(partialFields).length) {
        closeModal();
        return;
      }

      openConfirmModal(
        'Modifier ' + n + ' entrée' + (n > 1 ? 's' : '') + ' ?',
        function() {
          const btn = document.getElementById('mbSave');
          const restore = btn ? startBtnLoading(btn, '…') : function() {};
          callServer('apiUpdateBulkEntries', [[...histSelected], partialFields], function(res) {
            restore();
            if (res && res.success) {
              showToast('Modification appliquée.', 'success');
              closeModal();
              loadHistoryPage(currentHistoryPage);
              applyFilters();
            } else {
              showToast(res && res.error ? res.error : 'Erreur.', 'error');
            }
          }, 'Édition groupée', function() { restore(); });
        }
      );
    };
    document.getElementById('mbCancel').onclick = closeModal;
    document.getElementById('modalBackdrop').style.display = 'flex';
  }
```

- [ ] **Step 7 — Simplifier le calcul `partialFields.description` (le bloc ci-dessus a une logique dupliquée)**

Dans la fonction `openBulkEditModal` ci-dessus, remplacer les deux blocs `if` sur `descEl` par ceci (logique nette) :

```javascript
      // Include description if:
      // — originally identical across rows (not mixed) → always include current input value
      // — originally mixed → include only if user typed something
      const descVal = document.getElementById('mbDesc').value;
      if (!stDesc.mixed) {
        partialFields.description = descVal.trim();
      } else if (descVal.trim() !== '') {
        partialFields.description = descVal.trim();
      }
```

Veiller à supprimer le bloc précédent (qui fait la même chose en double) lors de l'implémentation.

- [ ] **Step 8 — Vérifier la syntaxe JS**

```bash
node --check Index.html
```
Attendu : aucune erreur.

- [ ] **Step 9 — Commit**

```bash
git add Index.html
git commit -m "feat: add bulk edit modal for history entries with mixed-value field support"
```

---

## Vérification manuelle (déploiement GAS requis)

Après avoir copié `Code.gs` et `Index.html` dans le projet GAS et publié une nouvelle version :

- [ ] **RichSelect dans Saisir un Lot** : ajouter une ligne, cliquer sur le sélecteur joueur → panel s'ouvre avec avatars. Cliquer sur un joueur → panel se ferme, trigger affiche l'avatar et le nom. Dupliquer la ligne → bonne valeur reprise. Soumettre le lot → données correctes dans le Sheet.

- [ ] **RichSelect dans Modifier une entrée** : dans Historique, cliquer ✏️ sur une ligne → modale ouvre avec RichSelect pré-remplis. Changer joueur et top via RS → enregistrer → données mises à jour dans le Sheet.

- [ ] **Édition groupée** : passer en mode sélection (bouton Sélectionner), cocher 3 lignes avec tops différents → cliquer ✏️ Modifier → modale ouvre avec Top en "Valeurs mixtes". Modifier uniquement la description → enregistrer → seule la description change. Vérifier via Historique et directement dans le Sheet.

- [ ] **Click outside** : ouvrir un RichSelect, cliquer n'importe où hors de celui-ci → panel se ferme.

- [ ] **Escape** : ouvrir un RichSelect, appuyer Escape → rien (Escape est capturé par la modale globale qui ferme la modale). Hors modale : ouvrir un RS en saisie lot, appuyer Escape → panel se ferme.

- [ ] **Régression** : vérifier que les chips filtres Dashboard et Historique fonctionnent toujours, que le mode groupement de lot fonctionne toujours (clic sur ligne), que la suppression groupée fonctionne toujours.

---

## Auto-review

**Spec coverage check :**
- ✅ `apiUpdateBulkEntries` partiel (champs en `partialFields`) — Task 1
- ✅ RichSelect CSS — Task 2  
- ✅ `buildRichSelect` + `closeAllRichSelects` + click-outside — Task 3
- ✅ RS dans `openFullEditHistoryModal` — Task 4
- ✅ RS dans `addEntryRow` (hybride hidden input) — Task 5
- ✅ `histPageLogs` tracking — Task 6a
- ✅ `histBulkBar` HTML mise à jour (retrait input desc, ajout bouton Modifier) — Task 6b
- ✅ Listener `histBulkEdit` — Task 6c
- ✅ `openBulkEditModal` avec état mixte + payload partiel — Task 6d
- ✅ Saiseur dans la modale groupée — Task 6d

**Placeholder scan :** aucun TODO/TBD dans le plan.

**Type consistency :**
- `buildRichSelect` retourne `_getValue()`, `_isMixed()`, `_setValue()`, `_setMixed()` — tous utilisés avec les mêmes noms dans Tasks 4, 5, 6.
- `apiUpdateBulkEntries(rowIndexes, partialFields)` — signature identique en Task 1 et Task 6.
- `histPageLogs` — déclaré en Task 6a, utilisé en Task 6d. ✓
