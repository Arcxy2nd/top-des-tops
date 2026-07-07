# Tri et réorganisation manuelle des lignes du Constructeur de Lot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter, dans l'onglet "Saisir un Lot" de `Index.html`, une barre de 4 boutons de tri (Joueur/Catégorie/Points/Date) avec chaîne de départage fixe, et une poignée de glisser-déposer par ligne pour réorganiser manuellement les `.entry-row`.

**Architecture:** Tout dans `Index.html` (monofichier, pas de build). CSS ajouté dans le bloc `<style>` existant, HTML de la barre de tri ajouté dans `.lot-action-row`, JS ajouté dans la section `// ── SAISIE LOT ──`.

**Tech Stack:** Vanilla JS, drag & drop HTML5 natif (aucune dépendance).

---

### Task 1: Comparateurs et fonction de tri

**Files:**
- Modify: `Index.html` (section `// ── SAISIE LOT ──`, après `createFillToggle`, avant `addEntryRow`, ~ligne 6146)

- [ ] **Step 1: Ajouter l'état de tri et les comparateurs**

```javascript
// ── TRI / RÉORGANISATION DES LIGNES ─────────────────────────────────
let activeSortCriterion = null; // 'player' | 'category' | 'points' | 'date' | null
let activeSortAscending = true;

function listIndexOf(list, name) {
  const i = list.findIndex(x => x.name === name);
  return i === -1 ? list.length : i;
}

function rowPlayerName(row) { return (row.querySelector('.p-sel') || {}).value || ''; }
function rowCategoryName(row) { return (row.querySelector('.c-sel') || {}).value || ''; }
function rowPoints(row) { return parseInt((row.querySelector('.custom-pts-in') || {}).value, 10) || 0; }
function rowDate(row) { return (row.querySelector('.d-start') || {}).value || ''; }

function compareByPlayer(a, b) {
  return listIndexOf(cachedPlayers, rowPlayerName(a)) - listIndexOf(cachedPlayers, rowPlayerName(b));
}
function compareByCategory(a, b) {
  return listIndexOf(cachedCategories, rowCategoryName(a)) - listIndexOf(cachedCategories, rowCategoryName(b));
}
function compareByPoints(a, b) { return rowPoints(a) - rowPoints(b); }
function compareByDate(a, b) { return rowDate(a) < rowDate(b) ? -1 : (rowDate(a) > rowDate(b) ? 1 : 0); }

const SORT_COMPARATORS = {
  player: compareByPlayer,
  category: compareByCategory,
  points: compareByPoints,
  date: compareByDate
};

const SORT_CHAIN_ORDER = ['player', 'category', 'points', 'date'];

function sortEntryRows(criterion) {
  if (activeSortCriterion === criterion) {
    activeSortAscending = !activeSortAscending;
  } else {
    activeSortCriterion = criterion;
    activeSortAscending = true;
  }

  const chain = [criterion, ...SORT_CHAIN_ORDER.filter(c => c !== criterion)];
  const container = document.getElementById('entryContainer');
  const rows = Array.from(container.querySelectorAll('.entry-row'));

  rows.sort((a, b) => {
    for (let i = 0; i < chain.length; i++) {
      const cmp = SORT_COMPARATORS[chain[i]](a, b);
      if (cmp !== 0) {
        return (i === 0 && !activeSortAscending) ? -cmp : cmp;
      }
    }
    return 0;
  });

  rows.forEach(r => container.appendChild(r));
  updateSortButtonsUI();
}

function updateSortButtonsUI() {
  document.querySelectorAll('.lot-sort-btn').forEach(btn => {
    const c = btn.dataset.sortCriterion;
    const isActive = c === activeSortCriterion;
    btn.classList.toggle('active', isActive);
    const arrow = btn.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = isActive ? (activeSortAscending ? '↑' : '↓') : '';
  });
}

function clearActiveSortState() {
  activeSortCriterion = null;
  activeSortAscending = true;
  updateSortButtonsUI();
}
```

- [ ] **Step 2: Commit**

```bash
git add Index.html
git commit -m "feat: add sort comparators and sortEntryRows for lot builder"
```

Note: pas de dépôt git dans ce projet (`Is a git repository: false`) — ignorer ce step si `git status` échoue, se contenter de sauvegarder le fichier.

---

### Task 2: Barre de boutons de tri (HTML + wiring)

**Files:**
- Modify: `Index.html:2247-2249` (bloc `.lot-action-row`)

- [ ] **Step 1: Ajouter les 4 boutons dans le HTML**

Remplacer le bloc existant :
```html
      <div class="lot-action-row">
        <button id="addRowBtn" class="btn-add-row">＋ Ligne</button>
        <button id="lotGroupModeBtn" class="btn-group-mode">🔗 Grouper</button>
```
par :
```html
      <div class="lot-sort-bar">
        <button type="button" class="lot-sort-btn" data-sort-criterion="player">👤 Joueur <span class="sort-arrow"></span></button>
        <button type="button" class="lot-sort-btn" data-sort-criterion="category">🏷️ Top <span class="sort-arrow"></span></button>
        <button type="button" class="lot-sort-btn" data-sort-criterion="points">🔢 Points <span class="sort-arrow"></span></button>
        <button type="button" class="lot-sort-btn" data-sort-criterion="date">📅 Date <span class="sort-arrow"></span></button>
      </div>
      <div class="lot-action-row">
        <button id="addRowBtn" class="btn-add-row">＋ Ligne</button>
        <button id="lotGroupModeBtn" class="btn-group-mode">🔗 Grouper</button>
```

- [ ] **Step 2: Attacher les listeners d'init**

Trouver l'endroit où `document.getElementById('addRowBtn')` reçoit son listener (recherche `addRowBtn`) et ajouter juste après :

```javascript
document.querySelectorAll('.lot-sort-btn').forEach(btn => {
  btn.addEventListener('click', () => sortEntryRows(btn.dataset.sortCriterion));
});
```

- [ ] **Step 3: CSS de la barre**

Ajouter dans le bloc `<style>`, à la suite des règles `.lot-action-row` / `.btn-add-row` existantes :

```css
.lot-sort-bar { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0; }
.lot-sort-btn {
  background:var(--card-bg); border:1px solid var(--border); border-radius:8px;
  padding:6px 12px; font-size:0.82rem; color:var(--text-muted); cursor:pointer;
  transition:border-color .15s, color .15s;
}
.lot-sort-btn:hover { border-color:var(--accent); color:var(--text); }
.lot-sort-btn.active { border-color:var(--accent); color:var(--accent); font-weight:600; }
.lot-sort-btn .sort-arrow { display:inline-block; width:10px; }
```

(Adapter les noms de variables CSS aux variables déjà définies dans le fichier si `--card-bg`/`--text` diffèrent — vérifier avec `grep "^\s*--" Index.html` avant d'écrire.)

- [ ] **Step 4: Vérifier manuellement dans le navigateur**

Ouvrir l'app localement (ou via un serveur de test HTML statique), aller sur l'onglet "Saisir un Lot", ajouter 3-4 lignes avec joueurs/catégories/points différents, cliquer sur chaque bouton de tri et vérifier l'ordre + l'inversion au reclic.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "feat: add sort button bar to lot builder UI"
```

---

### Task 3: Poignée de glisser-déposer par ligne

**Files:**
- Modify: `Index.html` fonction `addEntryRow()` (~ligne 6147-6170)
- Modify: `<style>` block

- [ ] **Step 1: Ajouter le handle et rendre la ligne draggable dans `addEntryRow`**

Juste après :
```javascript
    rowCounter++;
    const div = document.createElement('div');
    div.className = 'entry-row';
    div.id = 'row_' + rowCounter;
```
ajouter :
```javascript
    div.draggable = true;
    const dragHandle = document.createElement('div');
    dragHandle.className = 'row-drag-handle';
    dragHandle.textContent = '⠿';
    dragHandle.title = 'Glisser pour réorganiser';
    div.appendChild(dragHandle);
    attachRowDragEvents(div);
```

- [ ] **Step 2: Fonction `attachRowDragEvents`**

Ajouter dans la section `// ── TRI / RÉORGANISATION DES LIGNES ──` (Task 1) :

```javascript
let draggedRow = null;

function attachRowDragEvents(row) {
  row.addEventListener('dragstart', (e) => {
    draggedRow = row;
    row.classList.add('row-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('row-dragging');
    document.querySelectorAll('.entry-row.row-drop-target').forEach(r => r.classList.remove('row-drop-target'));
    draggedRow = null;
  });

  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedRow || draggedRow === row) return;
    document.querySelectorAll('.entry-row.row-drop-target').forEach(r => r.classList.remove('row-drop-target'));
    row.classList.add('row-drop-target');
  });

  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('row-drop-target');
    if (!draggedRow || draggedRow === row) return;
    const container = document.getElementById('entryContainer');
    const rows = Array.from(container.querySelectorAll('.entry-row'));
    const draggedIndex = rows.indexOf(draggedRow);
    const targetIndex = rows.indexOf(row);
    if (draggedIndex < targetIndex) {
      row.after(draggedRow);
    } else {
      row.before(draggedRow);
    }
    clearActiveSortState();
  });
}
```

- [ ] **Step 3: CSS du handle et des états de drag**

```css
.row-drag-handle {
  cursor:grab; color:var(--text-muted); font-size:1rem; user-select:none;
  padding:0 6px; display:flex; align-items:center;
}
.row-drag-handle:active { cursor:grabbing; }
.entry-row.row-dragging { opacity:0.4; }
.entry-row.row-drop-target { border-top:2px solid var(--accent); }
```

- [ ] **Step 4: Vérifier que `.entry-row` est en `display:flex` (ou ajuster) pour que le handle s'aligne**

Chercher la règle CSS `.entry-row` existante (ligne ~1208) et confirmer qu'un `display:flex; align-items:center;` (ou équivalent grid déjà en place) permet au handle de s'insérer proprement en première position. Si `.entry-row` utilise `display:grid` avec des colonnes fixes, ajouter le handle en dehors de la grille (position absolue à gauche, `margin-left:-24px` ou équivalent) plutôt que de casser le template de colonnes existant — vérifier le CSS actuel avant de choisir l'approche.

- [ ] **Step 5: Vérifier manuellement dans le navigateur**

Ajouter plusieurs lignes, glisser une ligne vers une autre position (avant et après), vérifier que l'ordre DOM change et que les boutons de tri perdent leur état actif après un drop réel.

- [ ] **Step 6: Commit**

```bash
git add Index.html
git commit -m "feat: add drag-and-drop row reordering to lot builder"
```

---

### Task 4: Vérification finale et nettoyage

- [ ] **Step 1: Relire la spec `docs/superpowers/specs/2026-07-04-lot-sort-reorder-design.md` et cocher chaque exigence contre le code livré**

- [ ] **Step 2: Test manuel complet dans le navigateur**

Scénario : ajouter 5 lignes (2 mêmes joueurs, catégories différentes, points différents), tester les 4 tris + inversions, puis un drag manuel, puis re-cliquer un bouton de tri et vérifier qu'il retrie correctement par-dessus l'ordre manuel.

- [ ] **Step 3: Commit final si ajustements**

```bash
git add Index.html
git commit -m "fix: polish lot sort/reorder interactions"
```
