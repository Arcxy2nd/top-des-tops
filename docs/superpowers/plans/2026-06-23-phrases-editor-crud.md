# Phrases Editor & Presets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre le CRUD complet sur les phrases de commentaires de classement, avec un système de presets thématiques, une UI intégrée dans l'onglet Paramètres, et le stockage dans Google Sheets.

**Architecture:** Nouvelle feuille `Phrases` dans le Google Sheet (colonnes : Preset | Pool | Phrase). `PhrasesService` en backend GAS. Côté frontend : les phrases hardcodées deviennent le preset "Défaut" (lecture seule) ; les presets custom sont chargés via `callServer('apiGetPhrases')` au démarrage et stockés dans `_customPhrases`. L'éditeur (chips de preset + blocs par rang) remplace la card minimale actuelle. La logique `generateRankingPhrases` est corrigée (plus d'override tied, ajout des variables `{gap}` et `{behind}`).

**Tech Stack:** Google Apps Script (backend), HTML/CSS/JS monofichier `Index.html`, Google Sheets (stockage custom), localStorage (preset actif uniquement, comme le thème).

---

## Fichiers touchés

- **Modifier :** `Code.gs` — ajouter `PhrasesService`, mettre à jour `ConfigService.getSheets()`, ajouter 6 fonctions API
- **Modifier :** `Index.html` — CSS (styles éditeur), HTML (card Paramètres + 2 modals), JS (~280 lignes nouvelles, 1 fonction remplacée)

---

## Référence rapide : utilitaires existants à réutiliser

- `callServer(fn, params, onSuccess, errorLabel, onError)` — ligne ~2249, enveloppe `google.script.run` avec gestion d'erreur intégrée
- `showToast(msg, type, duration)` — ligne ~1930, utilise `textContent` (pas HTML)
- Pattern toast+undo : construire le DOM manuellement comme `scheduleDeletion()` (ligne ~4329)
- `escapeHtml(str)` — disponible globalement
- `lastPhraseSortedRows` — variable globale, contient le dernier classement affiché
- `RANKING_PHRASES` — objet global hardcodé, reste intact (devient le preset "Défaut")

---

### Tâche 1 : Code.gs — Mettre à jour `ConfigService.getSheets()`

**Fichier :** `Code.gs`

- [ ] **1.1 — Ajouter la feuille `phrases` au cache**

Trouver ce bloc (lignes ~31-33) :

```javascript
const notes  = ss.getSheetByName('Notes')  || null;
const bareme = ss.getSheetByName('Bareme') || null;
_cache = { spreadsheet: ss, history, players, categories, notes, bareme };
```

Remplacer par :

```javascript
const notes   = ss.getSheetByName('Notes')   || null;
const bareme  = ss.getSheetByName('Bareme')  || null;
const phrases = ss.getSheetByName('Phrases') || null;
_cache = { spreadsheet: ss, history, players, categories, notes, bareme, phrases };
```

---

### Tâche 2 : Code.gs — Ajouter `PhrasesService`

**Fichier :** `Code.gs` — Insérer après la fermeture `}` de `BaremeService` (ligne ~693).

- [ ] **2.1 — Insérer le service complet**

```javascript
// ─── PHRASES SERVICE ───────────────────────────────────────────────────────────
// Sheet "Phrases" : [0] Preset | [1] Pool | [2] Text
const PhrasesService = {
  VALID_POOLS: ['first', 'second', 'third', 'mid', 'last', 'tied', 'solo'],

  _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.phrases) return cache.phrases;
    const sheet = cache.spreadsheet.insertSheet('Phrases');
    sheet.appendRow(['Preset', 'Pool', 'Phrase']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    ConfigService.clearCache();
    return ConfigService.getSheets().phrases;
  },

  getAll() {
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.slice(1)
      .filter(r => r[0] !== '' && r[2] !== '')
      .map((r, i) => ({
        rowIndex: i + 2,
        preset:   r[0].toString(),
        pool:     r[1].toString(),
        text:     r[2].toString()
      }));
  },

  addPhrase(preset, pool, text) {
    if (!preset || !pool || !text || !text.trim()) throw new Error("Champs manquants.");
    if (!this.VALID_POOLS.includes(pool)) throw new Error("Pool invalide : " + pool);
    this._getOrCreateSheet().appendRow([preset.trim(), pool, text.trim()]);
  },

  saveBatch(entries) {
    if (!entries || !entries.length) return;
    const rows = entries.map(e => {
      if (!this.VALID_POOLS.includes(e.pool)) throw new Error("Pool invalide : " + e.pool);
      return [e.preset.trim(), e.pool, e.text.trim()];
    });
    const sheet = this._getOrCreateSheet();
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  },

  updatePhrase(rowIndex, text) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    if (!text || !text.trim()) throw new Error("La phrase ne peut pas être vide.");
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    sheet.getRange(idx, 3).setValue(text.trim());
  },

  deletePhrase(rowIndex) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    sheet.deleteRow(idx);
  },

  deletePreset(presetName) {
    if (!presetName) throw new Error("Nom de preset manquant.");
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][0].toString() === presetName) sheet.deleteRow(i + 2);
    }
  }
};
```

---

### Tâche 3 : Code.gs — Ajouter les endpoints API

**Fichier :** `Code.gs` — Insérer à la fin du fichier (après `apiUngroupLot`).

- [ ] **3.1 — Ajouter les 6 fonctions API**

```javascript
// ── Phrases ────────────────────────────────────────────────────────────────────

function apiGetPhrases() {
  try {
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiAddPhrase(preset, pool, text) {
  try {
    PhrasesService.addPhrase(preset, pool, text);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiSavePhrasesBatch(entries) {
  try {
    PhrasesService.saveBatch(entries);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiUpdatePhrase(rowIndex, text) {
  try {
    PhrasesService.updatePhrase(rowIndex, text);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeletePhrase(rowIndex) {
  try {
    PhrasesService.deletePhrase(rowIndex);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeletePreset(presetName) {
  try {
    PhrasesService.deletePreset(presetName);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}
```

---

### Tâche 4 : Index.html — CSS de l'éditeur de phrases

**Fichier :** `Index.html` — Insérer juste avant `</style>` (ligne ~1261).

- [ ] **4.1 — Ajouter les styles**

```css
/* ── TEXTAREA GÉNÉRIQUE ── */
textarea {
  padding: 10px 12px; border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg); color: var(--text);
  font-size: 15px; outline: none; transition: border-color 0.2s;
  width: 100%; font-family: inherit; line-height: 1.5; resize: vertical;
  touch-action: manipulation;
}
textarea:focus { border-color: var(--accent); }

/* ── PRESET CHIPS ── */
.phrases-preset-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 16px; }
.preset-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 20px; cursor: pointer;
  font-size: 0.82rem; font-weight: 600;
  border: 1.5px solid var(--border); background: var(--btn-alt); color: var(--text);
  transition: all 0.13s; min-height: 32px; user-select: none;
}
.preset-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.preset-chip:hover:not(.active) { border-color: var(--accent); color: var(--accent); }
.preset-chip-lock { font-size: 0.65rem; opacity: 0.6; }
.preset-chip-add {
  background: transparent; border-style: dashed; color: var(--text-muted);
}
.preset-chip-add:hover { border-color: var(--accent); color: var(--accent); background: transparent; }

/* ── PHRASES EDITOR ── */
.phrases-editor-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px; flex-wrap: wrap; gap: 8px;
}
.phrases-editor-title { font-weight: 700; font-size: 0.92rem; color: var(--text); }

.phrases-pool-block {
  border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden; margin-bottom: 8px;
}
.phrases-pool-head {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; background: rgba(0,0,0,0.15);
  border-bottom: 1px solid var(--border);
}
body.light .phrases-pool-head { background: rgba(0,0,0,0.05); }
.phrases-pool-emoji { font-size: 1rem; flex-shrink: 0; }
.phrases-pool-name { font-weight: 700; font-size: 0.85rem; flex: 1; }
.phrases-pool-count {
  font-size: 0.68rem; color: var(--text-muted);
  background: rgba(255,255,255,0.07); padding: 2px 7px; border-radius: 20px;
}
body.light .phrases-pool-count { background: rgba(0,0,0,0.07); }

.phrase-edit-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 14px; border-top: 1px solid var(--border);
  transition: background 0.1s;
}
.phrase-edit-item:hover { background: rgba(255,255,255,0.03); }
.phrase-edit-text {
  flex: 1; font-size: 0.83rem; line-height: 1.5;
  word-break: break-word; color: var(--text-muted); padding-top: 2px;
}
.phrase-edit-btns { display: flex; gap: 4px; flex-shrink: 0; }
.phrases-pool-empty {
  padding: 9px 14px; font-style: italic;
  font-size: 0.8rem; color: var(--text-muted);
  border-top: 1px solid var(--border);
}

/* Hint variables dans la modal */
.phrase-vars-hint {
  font-size: 0.72rem; color: var(--text-muted); margin-top: 6px; line-height: 1.8;
}
.phrase-vars-hint code {
  background: rgba(255,255,255,0.08); border-radius: 3px;
  padding: 1px 5px; font-size: 0.8em; font-family: monospace;
}
body.light .phrase-vars-hint code { background: rgba(0,0,0,0.07); }

.phrases-default-note {
  font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;
  padding: 8px 0 4px;
}

@media (max-width: 640px) {
  .phrases-editor-header { flex-direction: column; align-items: flex-start; }
  .phrases-preset-row { gap: 5px; }
}
```

---

### Tâche 5 : Index.html — HTML : remplacer `#phrasesSettingsCard` et ajouter les modals

**Fichier :** `Index.html`

- [ ] **5.1 — Remplacer le contenu de `#phrasesSettingsCard`**

Trouver l'intégralité de ce bloc (lignes ~1442-1459) :

```html
<div class="card" id="phrasesSettingsCard">
  <h2>🎭 Commentaires de classement</h2>
  <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 16px;line-height:1.5;">
    Apparaissent dans le Dashboard quand le graphique <strong>Classement</strong> est actif.
    Phrases paramétriques — aucun texte hardcodé par joueur.
  </p>
  <div class="phrases-settings-toggle">
    <label>
      <input type="checkbox" id="phrasesEnabledChk" checked>
      Activer les commentaires de classement
    </label>
  </div>
  <div class="phrases-count-wrap">
    <label for="phrasesCountSlider">Nombre de commentaires :</label>
    <input type="range" id="phrasesCountSlider" min="1" max="5" value="3" step="1">
    <span class="phrases-count-val" id="phrasesCountVal">3</span>
  </div>
</div>
```

Remplacer par :

```html
<div class="card" id="phrasesSettingsCard">
  <h2>🎭 Commentaires de classement</h2>

  <!-- Activer + Nombre -->
  <div class="phrases-settings-toggle">
    <label>
      <input type="checkbox" id="phrasesEnabledChk" checked>
      Activer les commentaires de classement
    </label>
  </div>
  <div class="phrases-count-wrap">
    <label for="phrasesCountSlider">Nombre de commentaires :</label>
    <input type="range" id="phrasesCountSlider" min="1" max="7" value="3" step="1">
    <span class="phrases-count-val" id="phrasesCountVal">3</span>
  </div>

  <div style="border-top:1px solid var(--border);margin:18px 0 16px;"></div>

  <!-- Sélecteur de preset -->
  <div class="fp-section">
    <div class="fp-label">Preset de phrases</div>
    <div class="phrases-preset-row" id="phrasesPresetChips"></div>
  </div>

  <!-- Éditeur — preset custom actif -->
  <div id="phrasesEditorWrap" style="display:none;">
    <div class="phrases-editor-header">
      <span class="phrases-editor-title" id="phrasesEditorTitle"></span>
      <button class="danger small" id="phrasesDeletePresetBtn">🗑️ Supprimer ce preset</button>
    </div>
    <div id="phrasesPoolList"></div>
  </div>

  <!-- Notice lecture seule — preset Défaut -->
  <div id="phrasesDefaultView" style="display:none;">
    <p class="phrases-default-note">
      Les phrases par défaut ne sont pas modifiables.<br>
      Crée un preset personnalisé pour les adapter à ton style.
    </p>
  </div>
</div>
```

- [ ] **5.2 — Ajouter les 2 modals avant la fermeture de `.container`**

Le `<div class="container">` ouvre vers la ligne 1283. Le dernier onglet est `<div id="tab-guide" class="tab-content">`. Trouver son `</div>` fermant, puis le `</div>` immédiatement après qui ferme `.container`. Insérer les modals juste avant ce dernier `</div>` :

```html
<!-- ══ MODAL : ÉDITION / AJOUT DE PHRASE ════════════════════════════════ -->
<div id="phraseEditModal" class="modal-backdrop" style="display:none;" role="dialog" aria-modal="true">
  <div class="modal-box">
    <h3 id="phraseModalTitle">Modifier la phrase</h3>
    <div class="modal-field">
      <label>Texte de la phrase</label>
      <textarea id="phraseModalText" rows="3" placeholder="Ex : 👑 {player} règne avec {pts} pts…"></textarea>
    </div>
    <p class="phrase-vars-hint">
      Variables disponibles :<br>
      <code>{player}</code> nom du joueur &nbsp;·&nbsp;
      <code>{pts}</code> ses points &nbsp;·&nbsp;
      <code>{gap}</code> écart avec le voisin de rang &nbsp;·&nbsp;
      <code>{behind}</code> points derrière le 1er
    </p>
    <div class="modal-actions">
      <button id="phraseModalCancel" class="secondary">Annuler</button>
      <button id="phraseModalSave" class="primary">Sauvegarder</button>
    </div>
  </div>
</div>

<!-- ══ MODAL : CRÉER UN PRESET ══════════════════════════════════════════ -->
<div id="presetCreateModal" class="modal-backdrop" style="display:none;" role="dialog" aria-modal="true">
  <div class="modal-box">
    <h3>Nouveau preset</h3>
    <div class="modal-grid single">
      <div class="modal-field">
        <label>Nom du preset</label>
        <input type="text" id="presetNameInput" placeholder="ex : Piquant, Bienveillant, Sobre…" maxlength="40">
      </div>
      <div class="modal-field" style="margin-top:10px;">
        <label>Partir de</label>
        <select id="presetCopyFromSelect">
          <option value="">Vide — j'ajouterai mes phrases manuellement</option>
          <option value="__default__">Défaut — copier toutes les phrases usine</option>
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button id="presetCreateCancel" class="secondary">Annuler</button>
      <button id="presetCreateSave" class="primary">Créer le preset</button>
    </div>
  </div>
</div>
```

---

### Tâche 6 : Index.html — JS : couche de données phrases

**Fichier :** `Index.html` — Dans le bloc `<script>`. Trouver la ligne `// ── SETTINGS PHRASES D'ACCROCHE` (ligne ~1697) et insérer le bloc suivant **juste avant** `const RANKING_PHRASES = {` (ligne ~1758).

- [ ] **6.1 — Insérer la couche de données**

```javascript
// ── PHRASES : COUCHE DE DONNÉES ─────────────────────────────────────────
const PHRASES_PRESET_KEY = 'tdt_active_preset';
const PHRASES_DEFAULT_ID  = '__default__';

const POOL_LABELS = {
  first:  { label: '1er',     emoji: '👑' },
  second: { label: '2e',      emoji: '🥈' },
  third:  { label: '3e',      emoji: '🥉' },
  mid:    { label: 'Milieu',  emoji: '😐' },
  last:   { label: 'Dernier', emoji: '🔴' },
  tied:   { label: 'Égalité', emoji: '⚖️' },
  solo:   { label: 'Solo',    emoji: '🧍' }
};

const POOL_ORDER = ['first', 'second', 'third', 'mid', 'last', 'tied', 'solo'];

let _customPhrases = null; // [{rowIndex, preset, pool, text}] — null = pas encore chargé

function getActivePresetId() {
  try { return localStorage.getItem(PHRASES_PRESET_KEY) || PHRASES_DEFAULT_ID; }
  catch { return PHRASES_DEFAULT_ID; }
}

function setActivePresetId(id) {
  try { localStorage.setItem(PHRASES_PRESET_KEY, id); } catch {}
}

function getCustomPresetNames() {
  if (!_customPhrases || !_customPhrases.length) return [];
  const names = new Set(_customPhrases.map(p => p.preset));
  return Array.from(names).sort();
}

function getPhrasesForPreset(presetId) {
  if (presetId === PHRASES_DEFAULT_ID) return RANKING_PHRASES;
  const result = {};
  if (_customPhrases) {
    _customPhrases
      .filter(p => p.preset === presetId)
      .forEach(p => {
        if (!result[p.pool]) result[p.pool] = [];
        result[p.pool].push(p.text);
      });
  }
  // Repli pool par pool sur les phrases usine si le pool custom est vide
  Object.keys(RANKING_PHRASES).forEach(pool => {
    if (!result[pool] || !result[pool].length) result[pool] = RANKING_PHRASES[pool];
  });
  return result;
}

function loadCustomPhrases(callback) {
  callServer('apiGetPhrases', [], res => {
    _customPhrases = res.phrases || [];
    if (callback) callback();
  }, 'Chargement phrases', () => {
    _customPhrases = [];
    if (callback) callback();
  });
}
```

---

### Tâche 7 : Index.html — JS : corriger `generateRankingPhrases`

**Fichier :** `Index.html` — Trouver `function generateRankingPhrases(sortedRows, count)` (ligne ~1800). Remplacer **toute la fonction** par :

- [ ] **7.1 — Remplacer la fonction**

```javascript
function generateRankingPhrases(sortedRows, count) {
  if (!sortedRows || !sortedRows.length) return [];
  const n        = sortedRows.length;
  const maxCount = count != null ? count : getPhraseSettings().count;
  const phrases  = getPhrasesForPreset(getActivePresetId());

  if (n === 1) {
    const row  = sortedRows[0];
    const pool = (phrases.solo && phrases.solo.length) ? phrases.solo : RANKING_PHRASES.solo;
    return [{
      text:   pickPhrase(pool, { player: row.player, pts: row.total, gap: 0, behind: 0, rank: 1 }),
      player: row.player, total: row.total, rank: 1, ...POOL_LABELS.solo
    }];
  }

  const all = sortedRows.map((row, i) => {
    const rank   = i + 1;
    const gap    = rank === 1
      ? row.total - sortedRows[1].total          // avance sur le 2e
      : sortedRows[i - 1].total - row.total;     // retard sur le joueur au-dessus
    const behind = sortedRows[0].total - row.total;

    let poolKey;
    if      (rank === 1)            poolKey = 'first';
    else if (rank === 2)            poolKey = 'second';
    else if (rank === 3 && n >= 4)  poolKey = 'third';
    else if (rank === n)            poolKey = 'last';
    else                            poolKey = 'mid';

    const pool = (phrases[poolKey] && phrases[poolKey].length)
      ? phrases[poolKey]
      : (RANKING_PHRASES[poolKey] || []);

    return {
      text:   pickPhrase(pool, { player: row.player, pts: row.total, gap, behind, rank }),
      player: row.player, total: row.total, rank,
      ...POOL_LABELS[poolKey]
    };
  });

  // Priorité d'affichage : 1er → dernier → 2e → milieu → avant-dernier
  const priority = [0, n - 1, 1, Math.floor(n / 2), n - 2];
  const seen = new Set();
  const selected = [];
  for (const idx of priority) {
    if (selected.length >= maxCount) break;
    if (idx >= 0 && idx < n && !seen.has(idx)) { seen.add(idx); selected.push(all[idx]); }
  }
  return selected;
}
```

---

### Tâche 8 : Index.html — JS : chips de preset

**Fichier :** `Index.html` — Dans le bloc `<script>`, après `loadCustomPhrases`. Ajouter :

- [ ] **8.1 — Ajouter `renderPresetChips` et `renderPhrasesEditorSection`**

```javascript
// ── PHRASES : UI PRESETS ─────────────────────────────────────────────────
function renderPresetChips() {
  const container = document.getElementById('phrasesPresetChips');
  if (!container) return;

  const active   = getActivePresetId();
  const names    = getCustomPresetNames();
  // Si preset actif est custom mais pas encore dans le Sheet (preset vide tout juste créé),
  // l'afficher quand même pour que l'utilisateur puisse y ajouter des phrases.
  const allNames = (active !== PHRASES_DEFAULT_ID && !names.includes(active))
    ? [...names, active]
    : names;

  container.innerHTML = '';

  // Chip "Défaut" (lecture seule)
  const defChip = document.createElement('button');
  defChip.className = 'preset-chip' + (active === PHRASES_DEFAULT_ID ? ' active' : '');
  defChip.innerHTML = '<span class="preset-chip-lock">🔒</span> Défaut';
  defChip.addEventListener('click', () => {
    setActivePresetId(PHRASES_DEFAULT_ID);
    renderPresetChips();
    renderPhrasesEditorSection();
    if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
  });
  container.appendChild(defChip);

  // Chips presets custom
  allNames.forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'preset-chip' + (active === name ? ' active' : '');
    chip.textContent = name;
    chip.addEventListener('click', () => {
      setActivePresetId(name);
      renderPresetChips();
      renderPhrasesEditorSection();
      if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
    });
    container.appendChild(chip);
  });

  // Bouton "Nouveau preset"
  const addChip = document.createElement('button');
  addChip.className = 'preset-chip preset-chip-add';
  addChip.textContent = '＋ Nouveau preset';
  addChip.addEventListener('click', openCreatePresetModal);
  container.appendChild(addChip);
}

function renderPhrasesEditorSection() {
  const editorWrap  = document.getElementById('phrasesEditorWrap');
  const defaultView = document.getElementById('phrasesDefaultView');
  const titleEl     = document.getElementById('phrasesEditorTitle');
  const active      = getActivePresetId();

  if (active === PHRASES_DEFAULT_ID) {
    if (editorWrap)  editorWrap.style.display  = 'none';
    if (defaultView) defaultView.style.display = 'block';
    return;
  }

  if (editorWrap)  editorWrap.style.display  = 'block';
  if (defaultView) defaultView.style.display = 'none';
  if (titleEl)     titleEl.textContent = '✏️ Preset : ' + active;
  renderPoolList(active);
}
```

---

### Tâche 9 : Index.html — JS : éditeur de phrases par pool

**Fichier :** `Index.html` — Après les fonctions de la Tâche 8.

- [ ] **9.1 — Ajouter `renderPoolList`, `buildPoolBlock` et la suppression avec undo**

```javascript
// ── PHRASES : LISTE DE POOLS ─────────────────────────────────────────────
function renderPoolList(presetName) {
  const container = document.getElementById('phrasesPoolList');
  if (!container) return;
  container.innerHTML = '';
  POOL_ORDER.forEach(pool => container.appendChild(buildPoolBlock(presetName, pool)));
}

function buildPoolBlock(presetName, pool) {
  const meta    = POOL_LABELS[pool];
  const entries = (_customPhrases || []).filter(p => p.preset === presetName && p.pool === pool);

  const block = document.createElement('div');
  block.className = 'phrases-pool-block';
  block.dataset.pool = pool;

  // En-tête du pool
  const head = document.createElement('div');
  head.className = 'phrases-pool-head';
  head.innerHTML =
    '<span class="phrases-pool-emoji">' + meta.emoji + '</span>' +
    '<span class="phrases-pool-name">'  + meta.label + '</span>' +
    '<span class="phrases-pool-count">' + entries.length + ' phrase' + (entries.length !== 1 ? 's' : '') + '</span>';

  const addBtn = document.createElement('button');
  addBtn.className = 'secondary small';
  addBtn.textContent = '+ Ajouter';
  addBtn.addEventListener('click', () => openPhraseModal(null, presetName, pool));
  head.appendChild(addBtn);
  block.appendChild(head);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'phrases-pool-empty';
    empty.textContent = 'Aucune phrase personnalisée — repli sur les phrases usine.';
    block.appendChild(empty);
  } else {
    entries.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'phrase-edit-item';
      row.innerHTML =
        '<span class="phrase-edit-text">' + escapeHtml(entry.text) + '</span>' +
        '<div class="phrase-edit-btns">' +
          '<button class="secondary small" title="Modifier">✏️</button>' +
          '<button class="danger small" title="Supprimer">🗑️</button>' +
        '</div>';
      row.querySelector('[title="Modifier"]').addEventListener('click', () =>
        openPhraseModal(entry, presetName, pool));
      row.querySelector('[title="Supprimer"]').addEventListener('click', () =>
        deletePhraseWithUndo(entry, presetName));
      block.appendChild(row);
    });
  }
  return block;
}

function deletePhraseWithUndo(entry, presetName) {
  // Construire le toast manuellement (comme scheduleDeletion) car showToast n'accepte pas de HTML
  const toastEl = document.createElement('div');
  toastEl.className = 'toast warning';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = 'Phrase supprimée.';
  const undoBtn = document.createElement('button');
  undoBtn.className = 'toast-undo-btn';
  undoBtn.textContent = 'Annuler';
  toastEl.appendChild(msgSpan);
  toastEl.appendChild(undoBtn);
  document.getElementById('toastContainer').appendChild(toastEl);

  const timerId = setTimeout(() => {
    toastEl.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toastEl.remove(), 300);
    callServer('apiDeletePhrase', [entry.rowIndex], res => {
      _customPhrases = res.phrases;
      renderPoolList(presetName);
      renderPresetChips();
      if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
    }, 'Suppression phrase');
  }, 5000);

  undoBtn.addEventListener('click', () => {
    clearTimeout(timerId);
    toastEl.style.animation = 'fadeOut 0.2s ease forwards';
    setTimeout(() => toastEl.remove(), 200);
    showToast('Suppression annulée.', 'success');
  }, { once: true });
}
```

- [ ] **9.2 — Ajouter la modal d'édition/ajout de phrase**

```javascript
// ── PHRASES : MODAL ÉDITION ──────────────────────────────────────────────
let _phraseModalCtx = null; // { entry: null|{rowIndex,text}, presetName, pool }

function openPhraseModal(entry, presetName, pool) {
  _phraseModalCtx = { entry, presetName, pool };
  document.getElementById('phraseModalTitle').textContent =
    entry ? 'Modifier la phrase' : 'Nouvelle phrase — ' + POOL_LABELS[pool].label;
  document.getElementById('phraseModalText').value = entry ? entry.text : '';
  document.getElementById('phraseEditModal').style.display = 'flex';
  setTimeout(() => document.getElementById('phraseModalText').focus(), 60);
}

function closePhraseModal() {
  document.getElementById('phraseEditModal').style.display = 'none';
  _phraseModalCtx = null;
}

function savePhraseModal() {
  if (!_phraseModalCtx) return;
  const text = (document.getElementById('phraseModalText').value || '').trim();
  if (!text) { showToast('La phrase ne peut pas être vide.', 'error'); return; }

  const saveBtn = document.getElementById('phraseModalSave');
  saveBtn.disabled = true;

  const { entry, presetName, pool } = _phraseModalCtx;
  const onDone = res => {
    saveBtn.disabled = false;
    _customPhrases = res.phrases;
    closePhraseModal();
    renderPoolList(presetName);
    renderPresetChips();
    if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
    showToast('Phrase ' + (entry ? 'modifiée' : 'ajoutée') + ' ✓', 'success');
  };
  const onErr = () => { saveBtn.disabled = false; };

  if (entry) {
    callServer('apiUpdatePhrase', [entry.rowIndex, text], onDone, 'Modification phrase', onErr);
  } else {
    callServer('apiAddPhrase', [presetName, pool, text], onDone, 'Ajout phrase', onErr);
  }
}
```

---

### Tâche 10 : Index.html — JS : modal de création et suppression de preset

**Fichier :** `Index.html` — Après les fonctions de la Tâche 9.

- [ ] **10.1 — Ajouter les fonctions de gestion de preset**

```javascript
// ── PHRASES : GESTION PRESETS ────────────────────────────────────────────
function openCreatePresetModal() {
  const copySelect = document.getElementById('presetCopyFromSelect');
  // Reconstruire les options dynamiquement
  copySelect.innerHTML =
    '<option value="">Vide — j\'ajouterai mes phrases manuellement</option>' +
    '<option value="__default__">Défaut — copier toutes les phrases usine</option>';
  getCustomPresetNames().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    copySelect.appendChild(opt);
  });

  document.getElementById('presetNameInput').value = '';
  document.getElementById('presetCreateModal').style.display = 'flex';
  setTimeout(() => document.getElementById('presetNameInput').focus(), 60);
}

function closeCreatePresetModal() {
  document.getElementById('presetCreateModal').style.display = 'none';
}

function saveCreatePreset() {
  const name     = (document.getElementById('presetNameInput').value || '').trim();
  const copyFrom = document.getElementById('presetCopyFromSelect').value;

  if (!name) { showToast('Donne un nom au preset.', 'error'); return; }
  if (name === 'Défaut') { showToast('Nom réservé.', 'error'); return; }
  if (getCustomPresetNames().includes(name)) { showToast('Ce preset existe déjà.', 'error'); return; }

  const saveBtn = document.getElementById('presetCreateSave');
  saveBtn.disabled = true;

  const finish = res => {
    saveBtn.disabled = false;
    _customPhrases = res.phrases;
    setActivePresetId(name);
    closeCreatePresetModal();
    renderPresetChips();
    renderPhrasesEditorSection();
    showToast('Preset "' + name + '" créé ✓', 'success');
  };
  const onErr = () => { saveBtn.disabled = false; };

  if (!copyFrom) {
    // Preset vide : pas d'appel serveur, matérialisé au premier ajout de phrase
    saveBtn.disabled = false;
    setActivePresetId(name);
    closeCreatePresetModal();
    renderPresetChips();
    renderPhrasesEditorSection();
    showToast('Preset "' + name + '" créé ✓', 'success');
    return;
  }

  // Construire le lot de phrases source
  const entries = copyFrom === PHRASES_DEFAULT_ID
    ? Object.entries(RANKING_PHRASES).flatMap(([pool, texts]) =>
        texts.map(text => ({ preset: name, pool, text })))
    : (_customPhrases || [])
        .filter(p => p.preset === copyFrom)
        .map(p => ({ preset: name, pool: p.pool, text: p.text }));

  if (!entries.length) {
    saveBtn.disabled = false;
    setActivePresetId(name);
    closeCreatePresetModal();
    renderPresetChips();
    renderPhrasesEditorSection();
    showToast('Preset "' + name + '" créé (vide) ✓', 'success');
    return;
  }

  callServer('apiSavePhrasesBatch', [entries], finish, 'Création preset', onErr);
}

function handleDeletePreset() {
  const active = getActivePresetId();
  if (active === PHRASES_DEFAULT_ID) return;
  if (!confirm('Supprimer le preset "' + active + '" et toutes ses phrases ?')) return;

  callServer('apiDeletePreset', [active], res => {
    _customPhrases = res.phrases;
    setActivePresetId(PHRASES_DEFAULT_ID);
    renderPresetChips();
    renderPhrasesEditorSection();
    if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
    showToast('Preset "' + active + '" supprimé.', 'success');
  }, 'Suppression preset');
}
```

---

### Tâche 11 : Index.html — JS : câblage des events + mise à jour de l'init

**Fichier :** `Index.html`

- [ ] **11.1 — Remplacer `initPhraseSettings` (ligne ~5452)**

Remplacer **toute la fonction** `initPhraseSettings` par :

```javascript
function initPhraseSettings() {
  const s = getPhraseSettings();
  const chk      = document.getElementById('phrasesEnabledChk');
  const slider   = document.getElementById('phrasesCountSlider');
  const countVal = document.getElementById('phrasesCountVal');
  if (!chk || !slider || !countVal) return;

  chk.checked          = s.enabled;
  slider.value         = s.count;
  countVal.textContent = s.count;

  chk.addEventListener('change', () => {
    savePhraseSettings({ enabled: chk.checked });
    if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
    else if (!chk.checked) clearPhrasesCard();
  });

  slider.addEventListener('input', () => {
    countVal.textContent = slider.value;
    savePhraseSettings({ count: parseInt(slider.value, 10) });
    if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
  });

  // Modal phrase : événements
  document.getElementById('phraseModalCancel')
    ?.addEventListener('click', closePhraseModal);
  document.getElementById('phraseModalSave')
    ?.addEventListener('click', savePhraseModal);
  document.getElementById('phraseEditModal')
    ?.addEventListener('click', e => { if (e.target === e.currentTarget) closePhraseModal(); });
  document.getElementById('phraseModalText')
    ?.addEventListener('keydown', e => { if (e.key === 'Escape') closePhraseModal(); });

  // Modal preset : événements
  document.getElementById('presetCreateCancel')
    ?.addEventListener('click', closeCreatePresetModal);
  document.getElementById('presetCreateSave')
    ?.addEventListener('click', saveCreatePreset);
  document.getElementById('presetCreateModal')
    ?.addEventListener('click', e => { if (e.target === e.currentTarget) closeCreatePresetModal(); });
  document.getElementById('presetNameInput')
    ?.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveCreatePreset();
      if (e.key === 'Escape') closeCreatePresetModal();
    });

  // Supprimer preset
  document.getElementById('phrasesDeletePresetBtn')
    ?.addEventListener('click', handleDeletePreset);

  // Bouton "Nouveau tirage" (dashboard)
  document.getElementById('phrasesRerollBtn')
    ?.addEventListener('click', () => {
      if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
    });
}
```

- [ ] **11.2 — Mettre à jour `window.onload` pour charger les phrases au démarrage**

Trouver (ligne ~5494-5499) :

```javascript
window.onload = () => {
  initTheme();
  bindButtons();
  bindExportButtons();
  initPhraseSettings();
```

Remplacer par :

```javascript
window.onload = () => {
  initTheme();
  bindButtons();
  bindExportButtons();
  initPhraseSettings();
  loadCustomPhrases(() => {
    renderPresetChips();
    renderPhrasesEditorSection();
  });
```

---

### Tâche 12 : Vérification manuelle & commit

- [ ] **12.1 — Vérifier le flux principal**

Dans Google Apps Script IDE : sauvegarder `Code.gs` et `Index.html`, puis déployer (tester le déploiement ou mettre à jour le déploiement web).

1. Ouvrir l'app → onglet **Paramètres** → section "Commentaires de classement"
2. Vérifier : chips "🔒 Défaut" + "＋ Nouveau preset" apparaissent
3. "Défaut" actif → notice lecture seule visible, éditeur caché
4. Cliquer "＋ Nouveau preset" → modal s'ouvre → saisir "Test" → "Défaut" sélectionné en copie → "Créer"
5. Vérifier : chip "Test" apparaît actif, éditeur de pools visible avec toutes les phrases copiées
6. Cliquer "+ Ajouter" sur "1er" → modal s'ouvre → saisir `👑 {player} domine avec {pts} pts !` → Sauvegarder
7. Vérifier : nouvelle phrase apparaît dans le bloc "1er"
8. Cliquer ✏️ → modal pré-remplie → modifier → Sauvegarder → texte mis à jour
9. Cliquer 🗑️ → toast "Phrase supprimée / Annuler" → attendre 5s → phrase disparaît

- [ ] **12.2 — Vérifier les variables `{gap}` et `{behind}`**

1. Dans le preset "Test", ajouter dans "2e" : `{player} est à {behind} pts du leader et {gap} pts derrière le 1er`
2. Dashboard → graphique **Classement** (avec au moins 3 joueurs)
3. Vérifier que `{behind}` et `{gap}` sont remplacés par des nombres réels

- [ ] **12.3 — Vérifier le repli sur les phrases usine**

1. Créer un nouveau preset "Vide" sans copier les phrases usine
2. Sélectionner ce preset
3. Dashboard → Classement → vérifier que des commentaires apparaissent quand même (repli usine)

- [ ] **12.4 — Vérifier la suppression de preset**

1. Sélectionner le preset "Test" → cliquer "🗑️ Supprimer ce preset"
2. Confirmer → vérifier : chip "Test" disparaît, retour sur "Défaut"
3. Vérifier dans le Google Sheet que la feuille "Phrases" est bien vidée des entrées "Test"

- [ ] **12.5 — Commit**

```
git add Code.gs Index.html
git commit -m "feat: phrases editor — CRUD, presets, variables {gap}/{behind}, fix ranked logic"
```
