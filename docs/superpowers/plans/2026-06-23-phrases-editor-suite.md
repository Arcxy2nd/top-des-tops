# Phrases Editor — Suite (ce qui manquait)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 5 problèmes laissés par le premier plan : (1) "Défaut" est verrouillé en lecture seule alors qu'il doit être éditable, (2) le Sheet n'est jamais peuplé pour "Défaut" donc l'éditeur serait vide, (3) aucune option de renommage de preset, (4) les pools vides n'indiquent pas quelles phrases de repli seront utilisées, (5) la card "Commentaires" disparaît quand on change de type de graphique — les utilisateurs ne savent pas qu'elle existe.

**Architecture :** Tout est déjà en place côté backend et data layer. Ce plan ne touche qu'à la logique frontend et ajoute une seule fonction API (`apiRenamePreset`). La constante `PHRASES_DEFAULT_ID = '__default__'` reste l'identifiant interne du preset "Défaut" — il est affiché sous le label "Défaut" et peut être édité librement, mais pas renommé (pour ne pas casser l'ID en localStorage). Tous les autres presets sont entièrement CRUD.

**Tech Stack :** même que le premier plan — GAS backend + HTML/JS monofichier.

---

## Fichiers touchés

- **Modifier :** `Code.gs` — ajouter `apiRenamePreset`
- **Modifier :** `Index.html` — 6 éditions JS ciblées + 1 édition HTML + 1 édition CSS

---

## Référence rapide (fonctions existantes pertinentes)

- `renderPresetChips()` ligne ~1978 — construit les chips. Le `defChip` a encore `innerHTML` avec 🔒.
- `renderPhrasesEditorSection()` ligne ~2024 — guard `if (active === PHRASES_DEFAULT_ID)` bloque l'éditeur.
- `getPhrasesForPreset(presetId)` ligne ~1949 — early return pour `PHRASES_DEFAULT_ID` bypasse le Sheet.
- `handleDeletePreset()` ligne ~2246 — guard empêche la suppression de `PHRASES_DEFAULT_ID`.
- `buildPoolBlock(presetName, pool)` ligne ~2050 — affiche "Aucune phrase — repli sur les phrases usine" sans montrer lesquelles.
- `window.onload` ligne ~6029 — appelle `loadCustomPhrases` mais ne seed pas le Sheet.
- `RANKING_PHRASES` ligne ~2262 — les phrases hardcodées, source de vérité pour le seed et le repli.
- `callServer(fn, params, onSuccess, errorLabel, onError)` ligne ~2249 — wrapper GAS.

---

### Tâche 1 : Code.gs — Ajouter `apiRenamePreset`

**Fichier :** `Code.gs` — Insérer après `apiDeletePreset` (fin du fichier).

- [ ] **1.1 — Ajouter la fonction backend**

```javascript
function apiRenamePreset(oldName, newName) {
  try {
    if (!newName || !newName.trim()) throw new Error("Nouveau nom vide.");
    if (oldName === newName.trim()) return { success: true, phrases: PhrasesService.getAll() };
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, phrases: [] };
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    let modified = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0].toString() === oldName) { data[i][0] = newName.trim(); modified = true; }
    }
    if (modified) sheet.getRange(2, 1, lastRow - 1, 1).setValues(data);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}
```

---

### Tâche 2 : Index.html — Débloquer "Défaut" (5 éditions JS + 1 HTML)

**Fichier :** `Index.html`

- [ ] **2.1 — Retirer le verrou 🔒 du chip "Défaut"**

Dans `renderPresetChips()` (ligne ~1991-1993), trouver :

```javascript
const defChip = document.createElement('button');
defChip.className = 'preset-chip' + (active === PHRASES_DEFAULT_ID ? ' active' : '');
defChip.innerHTML = '<span class="preset-chip-lock">🔒</span> Défaut';
```

Remplacer par :

```javascript
const defChip = document.createElement('button');
defChip.className = 'preset-chip' + (active === PHRASES_DEFAULT_ID ? ' active' : '');
defChip.textContent = 'Défaut';
```

- [ ] **2.2 — Retirer le guard lecture seule dans `renderPhrasesEditorSection`**

Trouver la fonction complète (ligne ~2024-2040) :

```javascript
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

Remplacer par :

```javascript
function renderPhrasesEditorSection() {
  const editorWrap = document.getElementById('phrasesEditorWrap');
  const titleEl    = document.getElementById('phrasesEditorTitle');
  const active     = getActivePresetId();
  if (!editorWrap) return;

  editorWrap.style.display = 'block';
  const displayName = active === PHRASES_DEFAULT_ID ? 'Défaut' : active;
  if (titleEl) titleEl.textContent = '✏️ ' + displayName;

  // Le bouton Renommer n'est disponible que pour les presets custom
  const renameBtn = document.getElementById('phrasesRenamePresetBtn');
  if (renameBtn) renameBtn.style.display = active === PHRASES_DEFAULT_ID ? 'none' : '';

  renderPoolList(active);
}
```

- [ ] **2.3 — Corriger `getPhrasesForPreset` — retirer l'early return PHRASES_DEFAULT_ID**

Trouver (ligne ~1949-1965) :

```javascript
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
```

Remplacer par :

```javascript
function getPhrasesForPreset(presetId) {
  const result = {};
  if (_customPhrases) {
    _customPhrases
      .filter(p => p.preset === presetId)
      .forEach(p => {
        if (!result[p.pool]) result[p.pool] = [];
        result[p.pool].push(p.text);
      });
  }
  // Repli pool par pool sur les phrases hardcodées (filet de sécurité)
  Object.keys(RANKING_PHRASES).forEach(pool => {
    if (!result[pool] || !result[pool].length) result[pool] = RANKING_PHRASES[pool];
  });
  return result;
}
```

- [ ] **2.4 — Retirer le guard dans `handleDeletePreset`**

Trouver (ligne ~2246-2248) :

```javascript
function handleDeletePreset() {
  const active = getActivePresetId();
  if (active === PHRASES_DEFAULT_ID) return;
```

Remplacer par :

```javascript
function handleDeletePreset() {
  const active = getActivePresetId();
  const displayName = active === PHRASES_DEFAULT_ID ? 'Défaut' : active;
```

Et plus bas dans la même fonction, trouver :

```javascript
  setActivePresetId(PHRASES_DEFAULT_ID);
```

Laisser tel quel — après suppression d'un preset quelconque (même Défaut), on revient sur `PHRASES_DEFAULT_ID`. Si c'est Défaut qui a été supprimé, le Sheet sera vide pour `'__default__'` et le repli sur RANKING_PHRASES s'activera automatiquement.

Et trouver :

```javascript
  if (!confirm('Supprimer le preset "' + active + '" et toutes ses phrases ?')) return;
```

Remplacer par :

```javascript
  const msg = active === PHRASES_DEFAULT_ID
    ? 'Vider le preset "Défaut" de toutes ses phrases personnalisées ? (Les phrases usine resteront disponibles comme repli.)'
    : 'Supprimer le preset "' + displayName + '" et toutes ses phrases ?';
  if (!confirm(msg)) return;
```

Et le toast final, trouver :

```javascript
      showToast('Preset "' + active + '" supprimé.', 'success');
```

Remplacer par :

```javascript
      showToast('Preset "' + displayName + '" supprimé.', 'success');
```

- [ ] **2.5 — Supprimer le `#phrasesDefaultView` du HTML**

Trouver ce bloc (lignes ~1565-1571) :

```html
      <!-- Notice lecture seule — preset Défaut -->
      <div id="phrasesDefaultView" style="display:none;">
        <p class="phrases-default-note">
          Les phrases par défaut ne sont pas modifiables.<br>
          Crée un preset personnalisé pour les adapter à ton style.
        </p>
      </div>
```

Supprimer entièrement ce bloc.

---

### Tâche 3 : Index.html — Auto-seed "Défaut" dans le Sheet au premier lancement

**Fichier :** `Index.html` — Dans `window.onload`, trouver le bloc `loadCustomPhrases` (ligne ~6034).

- [ ] **3.1 — Remplacer le callback de `loadCustomPhrases` dans `window.onload`**

Trouver :

```javascript
  loadCustomPhrases(() => {
    renderPresetChips();
    renderPhrasesEditorSection();
  });
```

Remplacer par :

```javascript
  loadCustomPhrases(() => {
    const hasDefault = (_customPhrases || []).some(p => p.preset === PHRASES_DEFAULT_ID);
    if (!hasDefault) {
      // Premier lancement : on peuple le Sheet avec les phrases usine pour le preset Défaut
      const seed = Object.entries(RANKING_PHRASES).flatMap(([pool, texts]) =>
        texts.map(text => ({ preset: PHRASES_DEFAULT_ID, pool, text })));
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

---

### Tâche 4 : Index.html — Renommer un preset (HTML + JS)

**Fichier :** `Index.html`

- [ ] **4.1 — Ajouter le bouton Renommer dans le HTML**

Trouver le bloc `#phrasesEditorWrap` (lignes ~1556-1563) :

```html
      <!-- Éditeur — preset custom actif -->
      <div id="phrasesEditorWrap" style="display:none;">
        <div class="phrases-editor-header">
          <span class="phrases-editor-title" id="phrasesEditorTitle"></span>
          <button class="danger small" id="phrasesDeletePresetBtn">🗑️ Supprimer ce preset</button>
        </div>
        <div id="phrasesPoolList"></div>
      </div>
```

Remplacer par :

```html
      <!-- Éditeur — preset actif -->
      <div id="phrasesEditorWrap" style="display:none;">
        <div class="phrases-editor-header">
          <span class="phrases-editor-title" id="phrasesEditorTitle"></span>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="secondary small" id="phrasesRenamePresetBtn" style="display:none;">✏️ Renommer</button>
            <button class="danger small" id="phrasesDeletePresetBtn">🗑️ Supprimer</button>
          </div>
        </div>
        <div id="phrasesPoolList"></div>
      </div>
```

- [ ] **4.2 — Ajouter la modal de renommage**

Trouver la modal `#presetCreateModal` (ligne ~1765). Insérer **avant** elle :

```html
  <!-- ══ MODAL : RENOMMER UN PRESET ═══════════════════════════════════════ -->
  <div id="presetRenameModal" class="modal-backdrop" style="display:none;" role="dialog" aria-modal="true">
    <div class="modal-box">
      <h3>Renommer le preset</h3>
      <div class="modal-field">
        <label>Nouveau nom</label>
        <input type="text" id="presetRenameInput" placeholder="Nouveau nom…" maxlength="40">
      </div>
      <div class="modal-actions">
        <button id="presetRenameCancel" class="secondary">Annuler</button>
        <button id="presetRenameSave" class="primary">Renommer</button>
      </div>
    </div>
  </div>
```

- [ ] **4.3 — Ajouter les fonctions JS de renommage**

Dans le script, après `handleDeletePreset` (ligne ~2259), insérer :

```javascript
  // ── PHRASES : RENOMMAGE PRESET ───────────────────────────────────────────
  function openRenamePresetModal() {
    const active = getActivePresetId();
    if (active === PHRASES_DEFAULT_ID) return;
    document.getElementById('presetRenameInput').value = active;
    document.getElementById('presetRenameModal').style.display = 'flex';
    const input = document.getElementById('presetRenameInput');
    setTimeout(() => { input.focus(); input.select(); }, 60);
  }

  function closeRenamePresetModal() {
    document.getElementById('presetRenameModal').style.display = 'none';
  }

  function saveRenamePreset() {
    const oldName = getActivePresetId();
    if (oldName === PHRASES_DEFAULT_ID) return;
    const newName = (document.getElementById('presetRenameInput').value || '').trim();

    if (!newName)            { showToast('Nom vide.', 'error'); return; }
    if (newName === oldName) { closeRenamePresetModal(); return; }
    if (newName === 'Défaut') { showToast('Nom réservé.', 'error'); return; }
    if (getCustomPresetNames().filter(n => n !== oldName).includes(newName)) {
      showToast('Ce nom est déjà utilisé.', 'error'); return;
    }

    const saveBtn = document.getElementById('presetRenameSave');
    saveBtn.disabled = true;

    callServer('apiRenamePreset', [oldName, newName], res => {
      saveBtn.disabled = false;
      _customPhrases = res.phrases;
      setActivePresetId(newName);
      closeRenamePresetModal();
      renderPresetChips();
      renderPhrasesEditorSection();
      showToast('Preset renommé en "' + newName + '" ✓', 'success');
    }, 'Renommage preset', () => { saveBtn.disabled = false; });
  }
```

- [ ] **4.4 — Câbler les events de la modal renommage dans `initPhraseSettings`**

Dans `initPhraseSettings` (ligne ~5960), trouver le bloc des events `phrasesDeletePresetBtn` :

```javascript
  // Supprimer preset
  document.getElementById('phrasesDeletePresetBtn')
    ?.addEventListener('click', handleDeletePreset);
```

Ajouter juste après :

```javascript
  // Renommer preset
  document.getElementById('phrasesRenamePresetBtn')
    ?.addEventListener('click', openRenamePresetModal);
  document.getElementById('presetRenameCancel')
    ?.addEventListener('click', closeRenamePresetModal);
  document.getElementById('presetRenameSave')
    ?.addEventListener('click', saveRenamePreset);
  document.getElementById('presetRenameModal')
    ?.addEventListener('click', e => { if (e.target === e.currentTarget) closeRenamePresetModal(); });
  document.getElementById('presetRenameInput')
    ?.addEventListener('keydown', e => {
      if (e.key === 'Enter')  saveRenamePreset();
      if (e.key === 'Escape') closeRenamePresetModal();
    });
```

---

### Tâche 5 : Index.html — Afficher les phrases de repli dans les pools vides

Quand un pool d'un preset custom est vide, on affiche les phrases qui seront effectivement utilisées (issues de `RANKING_PHRASES`) en grisé, avec un bouton "Copier" pour les intégrer au preset courant.

**Fichier :** `Index.html`

- [ ] **5.1 — Ajouter le CSS pour les phrases de repli**

Dans le bloc `<style>`, juste avant `</style>`, ajouter :

```css
/* ── PHRASES DE REPLI (fallback visible dans éditeur) ── */
.phrase-fallback-section {
  border-top: 1px dashed var(--border);
  padding: 8px 14px 6px;
  background: rgba(0,0,0,0.06);
}
body.light .phrase-fallback-section { background: rgba(0,0,0,0.03); }
.phrase-fallback-label {
  font-size: 0.67rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 6px;
}
.phrase-fallback-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 5px 0; border-top: 1px solid rgba(255,255,255,0.04);
}
body.light .phrase-fallback-item { border-top-color: rgba(0,0,0,0.05); }
.phrase-fallback-text {
  flex: 1; font-size: 0.8rem; line-height: 1.45;
  color: var(--text-muted); opacity: 0.65; word-break: break-word;
  font-style: italic;
}
.phrase-fallback-copy {
  flex-shrink: 0; font-size: 0.7rem; padding: 3px 7px;
  min-height: 24px; opacity: 0.7;
}
.phrase-fallback-copy:hover { opacity: 1; }
```

- [ ] **5.2 — Modifier `buildPoolBlock` pour afficher les replis**

Trouver dans `buildPoolBlock` (ligne ~2073-2077) :

```javascript
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'phrases-pool-empty';
      empty.textContent = 'Aucune phrase personnalisée — repli sur les phrases usine.';
      block.appendChild(empty);
    } else {
```

Remplacer par :

```javascript
    if (entries.length === 0) {
      const fallbackTexts = RANKING_PHRASES[pool] || [];
      if (fallbackTexts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'phrases-pool-empty';
        empty.textContent = 'Aucune phrase pour ce rang.';
        block.appendChild(empty);
      } else {
        const section = document.createElement('div');
        section.className = 'phrase-fallback-section';
        const lbl = document.createElement('div');
        lbl.className = 'phrase-fallback-label';
        lbl.textContent = 'Phrases de repli utilisées (usine)';
        section.appendChild(lbl);
        fallbackTexts.forEach(txt => {
          const row = document.createElement('div');
          row.className = 'phrase-fallback-item';
          const span = document.createElement('span');
          span.className = 'phrase-fallback-text';
          span.textContent = txt;
          const copyBtn = document.createElement('button');
          copyBtn.className = 'secondary small phrase-fallback-copy';
          copyBtn.textContent = 'Copier →';
          copyBtn.title = 'Copier dans ce preset pour pouvoir la modifier';
          copyBtn.addEventListener('click', () => {
            callServer('apiAddPhrase', [presetName, pool, txt], res => {
              _customPhrases = res.phrases;
              renderPoolList(presetName);
              renderPresetChips();
              showToast('Phrase copiée ✓', 'success');
            }, 'Copie phrase');
          });
          row.appendChild(span);
          row.appendChild(copyBtn);
          section.appendChild(row);
        });
        block.appendChild(section);
      }
    } else {
```

---

### Tâche 6 : Index.html — Supprimer le message "Ouvre le graphique Classement"

Ce message dans l'état vide de la card est condescendant et inutile. La card apparaît naturellement quand on passe en vue Classement — pas besoin d'expliquer où aller. Pour la discoverabilité, on ajoute à la place un petit badge sur le bouton "🏆 Classement" dans le sélecteur de graphique.

**Fichier :** `Index.html`

- [ ] **6.1 — Supprimer le message dans le HTML**

Trouver (lignes ~1450-1453) :

```html
        <div class="phrases-empty">
          <span class="phrases-empty-icon">🏆</span>
          Ouvre le graphique <strong>Classement</strong> pour voir les commentaires.
        </div>
```

Remplacer par (état vide silencieux) :

```html
        <div class="phrases-empty" id="phrasesEmptyState" style="display:none;"></div>
```

- [ ] **6.2 — Ajouter un badge "💬" sur le bouton Classement**

Trouver (ligne ~1425) :

```html
        <button class="chart-type-btn" data-chart-type="ranking" title="Podium et classement général">🏆 Classement</button>
```

Remplacer par :

```html
        <button class="chart-type-btn" data-chart-type="ranking" title="Podium et classement général">🏆 Classement <span class="ranking-comments-badge" title="Commentaires de classement disponibles">💬</span></button>
```

Et dans le CSS, ajouter :

```css
.ranking-comments-badge {
  font-size: 0.7em; vertical-align: middle; opacity: 0.6;
}
.chart-type-btn.active .ranking-comments-badge { opacity: 1; }
```

---

### Tâche 7 : Vérification & commit

- [ ] **7.1 — Vérifier "Défaut" éditable**

1. Déployer (GAS IDE → Déployer → Tester ou mettre à jour)
2. Ouvrir l'app → Paramètres → Commentaires de classement
3. Vérifier : chip "Défaut" sans 🔒, cliquable, affiche l'éditeur
4. Vérifier : toutes les pools montrent des phrases (les phrases usine ont été seedées dans le Sheet)
5. Cliquer "+ Ajouter" dans "1er" → ajouter une phrase → elle apparaît
6. Cliquer ✏️ → modifier → sauvegarder → vérifier màj
7. Cliquer 🗑️ → toast undo 5s → vérifier suppression
8. Vérifier : bouton "Renommer" absent pour "Défaut", présent pour un preset custom

- [ ] **7.2 — Vérifier renommage**

1. Créer un preset "Test" (copier Défaut)
2. Sélectionner "Test" → bouton "✏️ Renommer" visible
3. Cliquer → modal s'ouvre avec "Test" pré-rempli → changer en "TrashTalk" → Renommer
4. Vérifier : chip "TrashTalk" actif, plus de chip "Test"
5. Vérifier dans le Sheet Phrases que toutes les lignes "Test" sont maintenant "TrashTalk"

- [ ] **7.3 — Vérifier les replis visibles**

1. Créer un preset vide "Vide"
2. Sélectionner "Vide" → pools affichent les phrases usine en grisé sous "Phrases de repli utilisées"
3. Cliquer "Copier →" sur une phrase → elle passe en entrée normale dans le pool

- [ ] **7.4 — Vérifier le Dashboard**

1. Aller dans Dashboard → graphique Classement
2. Vérifier que les commentaires s'affichent toujours correctement avec le preset actif
3. Changer de preset depuis Paramètres → revenir Dashboard → vérifier que les commentaires changent au prochain "🎲 Nouveau tirage"

- [ ] **7.5 — Vérifier badge et suppression du message**

1. Aller sur le Dashboard — vérifier que le bouton "🏆 Classement" affiche un 💬 discret
2. Passer en vue "Classement" → vérifier que les commentaires apparaissent, le 💬 est plus visible (opacity 1)
3. Vérifier qu'aucun message "Ouvre le graphique Classement" n'apparaît nulle part

- [ ] **7.6 — Commit**

```
git add Code.gs Index.html
git commit -m "feat: phrases editor — Défaut éditable, seed auto, renommage preset, replis visibles, card commentaires toujours présente"
```
