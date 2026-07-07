# Tops des Tops — UX & Features Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Améliorer l'ergonomie, le visuel et les fonctionnalités du site dans `Index.html` sans perdre aucune fonctionnalité existante.

**Architecture:** Tout réside dans un unique `Index.html` (CSS + HTML + JS inline). Les modifications s'appliquent par sections : CSS en haut, HTML au milieu, JS en bas. Chaque tâche est autonome et ne casse pas les autres.

**Tech Stack:** HTML/CSS/JS vanilla, Chart.js (CDN), Google Apps Script backend via `google.script.run`, jsPDF, SheetJS.

---

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `Index.html` | Unique fichier — toutes les modifications y sont apportées |

**Sections dans `Index.html` :**
- **CSS** : lignes ~15–1021 (dans `<style>`)
- **HTML** : lignes ~1023–1369 (structure visible)
- **JS** : lignes ~1370–fin (logique et comportement)

---

## Ordre d'exécution recommandé

1. Fix selects (rapide, sans risque)
2. Top-stat pills cliquables (rapide)
3. Tooltip personnalisé
4. Bouton "Inscrire le lot" redesigné
5. Groupement en saisie lot
6. Amélioration boites d'édition
7. Phrases d'accroche
8. Historique — édition complète
9. Export modal enrichi
10. Amélioration saisie lot (UX)
11. Polish visuel général

---

## Task 1 : Fix selects — contraste blanc sur blanc (mode clair)

**Fichier :** `Index.html` — section CSS (~ligne 116)

**Contexte :** En mode clair (`body.light`), certains éléments `<select>` ont le texte illisible car les `<option>` héritent de couleurs OS ou de styles manquants.

- [ ] **Étape 1 : Ajouter les règles CSS pour les options**

Dans la section CSS, après la règle existante sur `select, input[...]`, ajouter :

```css
/* ── SELECT OPTIONS — contraste garanti dans les deux thèmes ── */
option {
  background: var(--card);
  color: var(--text);
}
body.light option {
  background: #ffffff;
  color: #1a202c;
}
/* Wrappers avec select transparent : forcer la couleur du texte */
.player-sel-wrap select,
.c-sel-wrap select {
  color: var(--text);
}
/* History filters */
.history-filters select {
  background: var(--bg);
  color: var(--text);
}
```

- [ ] **Étape 2 : Vérifier les selects dans les modales**

Les selects créés dynamiquement (ex: `openFullEditHistoryModal` dans Task 8) héritent déjà de la règle globale. Aucune modification supplémentaire nécessaire ici.

- [ ] **Étape 3 : Tester les deux thèmes**

Basculer en mode clair (bouton 🌙/☀️), ouvrir l'onglet "Saisir un Lot", vérifier que les selects Joueur et Top sont lisibles. Vérifier aussi l'onglet Historique.

---

## Task 2 : Top-stat pills — cliquables pour masquer/afficher un Top

**Fichier :** `Index.html` — JS section, fonction `renderTopStatsStrip` (~ligne 2213)

**Contexte :** Les pills sous les graphiques Empilé/Groupé affichent les totaux par Top. Le clic doit les toggler dans `selectedCategoryChips` exactement comme les chips de filtre en haut.

- [ ] **Étape 1 : Localiser `renderTopStatsStrip`**

La fonction commence à ~ligne 2213. Les pills y sont créées comme `div.top-stat-pill` avec `cursor: default`.

- [ ] **Étape 2 : Remplacer la fonction `renderTopStatsStrip` par la version interactive**

```javascript
function renderTopStatsStrip(data) {
  const strip = document.getElementById('topStatsStrip');
  if (!strip) return;
  strip.innerHTML = '';
  if (!data || !data.datasets || !data.datasets.length) return;

  const topTotals = data.datasets.map(ds => ({
    name:  ds.label,
    total: (ds.data || []).reduce((s, v) => s + (Number(v) || 0), 0),
    color: Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : (ds.backgroundColor || '#ff4757')
  })).filter(t => t.total > 0).sort((a, b) => b.total - a.total);

  topTotals.forEach(t => {
    const isHidden = selectedCategoryChips.size > 0 && !selectedCategoryChips.has(t.name);
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'top-stat-pill' + (isHidden ? ' tsp-hidden' : '');
    pill.style.background  = isHidden ? 'transparent' : tint(t.color, 0.15);
    pill.style.borderColor = tint(t.color, 0.5);
    pill.style.color       = isHidden ? 'var(--text-muted)' : 'var(--text)';
    pill.title = isHidden ? 'Cliquer pour afficher ce Top dans le graphique' : 'Cliquer pour masquer ce Top';

    const pts = document.createElement('span');
    pts.className = 'tsp-pts';
    pts.textContent = isHidden ? '—' : t.total + ' pts';

    const name = document.createElement('span');
    name.className = 'tsp-name';
    name.textContent = t.name.length > 14 ? t.name.slice(0, 13) + '…' : t.name;

    pill.appendChild(pts);
    pill.appendChild(name);

    pill.addEventListener('click', () => {
      if (selectedCategoryChips.has(t.name)) {
        selectedCategoryChips.delete(t.name);
      } else {
        // Si "Tous" était sélectionné (set vide), on passe en mode exclusif
        if (selectedCategoryChips.size === 0) {
          // Ajouter tous sauf celui-ci
          data.datasets.forEach(ds => {
            if (ds.label !== t.name) selectedCategoryChips.add(ds.label);
          });
        } else {
          selectedCategoryChips.add(t.name);
        }
      }
      // Si tous sont sélectionnés = équivaut à "Tous"
      if (selectedCategoryChips.size === data.datasets.length) selectedCategoryChips.clear();
      renderCategoryChips();
      applyFilters();
    });

    strip.appendChild(pill);
  });
}
```

- [ ] **Étape 3 : Ajouter le CSS pour l'état masqué**

Dans la section CSS, après `.top-stat-pill .tsp-name` :

```css
.top-stat-pill {
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s, border-color 0.15s;
}
.top-stat-pill:hover { filter: brightness(1.15); }
.top-stat-pill.tsp-hidden {
  opacity: 0.45;
  border-style: dashed;
}
.top-stat-pill.tsp-hidden:hover { opacity: 0.75; }
```

- [ ] **Étape 4 : Tester**

1. Ouvrir le Dashboard, sélectionner "Empilé".
2. Cliquer sur une pill → le Top disparaît du graphique, la pill s'affiche en pointillés.
3. Cliquer à nouveau → le Top réapparaît.
4. Les chips en haut restent synchronisés.

---

## Task 3 : Tooltip personnalisé dans les graphiques

**Fichier :** `Index.html` — JS section (~ligne 2284, fonctions `renderChart` et `renderTrendChart`)

**Contexte :** Le tooltip par défaut de Chart.js est générique. On veut un tooltip stylé : fond semi-transparent, couleur du joueur, valeurs bien lisibles, animation d'entrée.

- [ ] **Étape 1 : Ajouter le CSS du tooltip custom**

Dans la section CSS, avant la fermeture `</style>` :

```css
/* ── TOOLTIP CUSTOM CHART ── */
#chartCustomTooltip {
  position: absolute;
  pointer-events: none;
  z-index: 200;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  font-size: 0.82rem;
  min-width: 140px;
  max-width: 240px;
  transition: opacity 0.12s ease;
  opacity: 0;
}
#chartCustomTooltip.visible { opacity: 1; }
#chartCustomTooltip .ctt-title {
  font-size: 0.72rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 7px;
  border-bottom: 1px solid var(--border); padding-bottom: 5px;
}
#chartCustomTooltip .ctt-row {
  display: flex; align-items: center; gap: 7px; padding: 2px 0;
}
#chartCustomTooltip .ctt-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
#chartCustomTooltip .ctt-label { flex: 1; color: var(--text-muted); }
#chartCustomTooltip .ctt-val {
  font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text);
}
```

- [ ] **Étape 2 : Ajouter l'élément tooltip dans le HTML**

Dans la section HTML, après `<div class="chart-wrapper" id="chartWrapper" ...>`, ajouter :

```html
<div id="chartCustomTooltip" role="tooltip"></div>
```

- [ ] **Étape 3 : Créer la fonction `buildCustomTooltipPlugin`**

Dans la section JS, juste avant la fonction `renderChart` (~ligne 2284) :

```javascript
function buildCustomTooltipPlugin() {
  const el = document.getElementById('chartCustomTooltip');
  if (!el) return {};

  return {
    id: 'customTooltip',
    afterInit(chart) {
      chart.options.plugins.tooltip.enabled = false;
      chart.options.plugins.tooltip.external = (ctx) => {
        const { chart, tooltip } = ctx;
        if (tooltip.opacity === 0) { el.classList.remove('visible'); return; }

        el.innerHTML = '';

        // Titre (label de l'axe X ou date)
        if (tooltip.title && tooltip.title.length) {
          const titleEl = document.createElement('div');
          titleEl.className = 'ctt-title';
          titleEl.textContent = tooltip.title[0];
          el.appendChild(titleEl);
        }

        // Lignes de données
        tooltip.dataPoints.forEach(dp => {
          const dsLabel = dp.dataset.label || '';
          // Couleur : soit celle du dataset, soit la couleur du joueur/top
          const color = Array.isArray(dp.dataset.backgroundColor)
            ? dp.dataset.backgroundColor[dp.dataIndex]
            : (dp.dataset.borderColor || dp.dataset.backgroundColor || 'var(--accent)');

          const row = document.createElement('div');
          row.className = 'ctt-row';

          const dot = document.createElement('span');
          dot.className = 'ctt-dot';
          dot.style.background = color;

          const label = document.createElement('span');
          label.className = 'ctt-label';
          label.textContent = dsLabel;

          const val = document.createElement('span');
          val.className = 'ctt-val';
          val.textContent = dp.formattedValue + ' pts';

          row.appendChild(dot); row.appendChild(label); row.appendChild(val);
          el.appendChild(row);
        });

        // Positionnement — suit le curseur, reste dans le wrapper
        const wrapper = document.getElementById('chartWrapper');
        const wRect   = wrapper ? wrapper.getBoundingClientRect() : chart.canvas.getBoundingClientRect();
        const cRect   = chart.canvas.getBoundingClientRect();

        let x = cRect.left - wRect.left + tooltip.caretX + 14;
        let y = cRect.top  - wRect.top  + tooltip.caretY - 10;

        // Anti-débordement droit
        const elW = el.offsetWidth || 180;
        const elH = el.offsetHeight || 80;
        if (x + elW > wRect.width - 8) x = cRect.left - wRect.left + tooltip.caretX - elW - 14;
        if (y + elH > wRect.height - 8) y = wRect.height - elH - 8;
        if (y < 0) y = 4;

        el.style.left = x + 'px';
        el.style.top  = y + 'px';
        el.classList.add('visible');
      };
    }
  };
}
```

- [ ] **Étape 4 : Intégrer le plugin dans `renderChart`**

Dans `renderChart`, localiser la ligne `currentChart = new Chart(...)`. Chaque appel `new Chart(...)` doit inclure `buildCustomTooltipPlugin()` dans son tableau `plugins`. Exemple pour les barres groupées/empilées :

```javascript
currentChart = new Chart(document.getElementById('mainChart').getContext('2d'), {
  type: 'bar',
  data: displayData,
  options: { ... },
  plugins: [totalsPlugin, buildCustomTooltipPlugin()]  // ← ajouter ici
});
```

Faire de même pour les blocs `doughnut`, `radar`, `ranking` et dans `renderTrendChart`.

- [ ] **Étape 5 : Masquer le tooltip quand la souris quitte le graphique**

Dans `bindButtons()` (ou juste après `initTheme()`), ajouter :

```javascript
document.getElementById('mainChart').addEventListener('mouseleave', () => {
  const el = document.getElementById('chartCustomTooltip');
  if (el) el.classList.remove('visible');
});
```

- [ ] **Étape 6 : Tester**

Survoler les barres d'un graphique Empilé, Groupé, Ranking. Le tooltip custom doit apparaître avec les couleurs correctes. Vérifier qu'il ne dépasse pas le bord du wrapper.

---

## Task 4 : Redesign du bouton "Inscrire le lot"

**Fichier :** `Index.html` — HTML (~ligne 1134) et CSS (~ligne 1000)

**Contexte :** Le bouton `submitLotBtn` (rouge, pleine largeur) est trop tentant. L'action principale doit passer par la barre sticky `lotSummaryBar`. Le bouton principal reste mais en version secondaire discrète.

- [ ] **Étape 1 : Modifier le HTML du bouton principal**

Remplacer :
```html
<button id="submitLotBtn" class="primary" style="flex:1;">✓ Inscrire le Lot</button>
```
Par :
```html
<button id="submitLotBtn" class="secondary" style="font-size:0.84rem;">Inscrire le lot</button>
```

- [ ] **Étape 2 : Améliorer la barre sticky `lotSummaryBar`**

Remplacer le contenu de `lotSummaryBar` dans le HTML :
```html
<div id="lotSummaryBar" class="hidden">
  <div class="lot-summary-info">
    <strong id="lotRowCount">0</strong> ligne(s) &middot; <strong id="lotPtsTotal">0</strong> pts au total
  </div>
  <div id="lotSummaryDetails" style="font-size:0.75rem;color:var(--text-muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
  <button id="submitLotBtnSummary" class="primary small">✓ Inscrire le Lot</button>
</div>
```

- [ ] **Étape 3 : Mettre à jour `updateLotSummary` pour afficher le détail par joueur**

Dans la fonction `updateLotSummary` (ligne ~3088), après le calcul de `totalPts`, ajouter :

```javascript
// Détail par joueur dans la barre sticky
const details = document.getElementById('lotSummaryDetails');
if (details) {
  const byPlayer = {};
  rows.forEach(r => {
    const pSel = r.querySelector('.p-sel');
    const v    = parseInt((r.querySelector('.custom-pts-in') || {}).value || '0', 10);
    if (pSel && !isNaN(v) && v > 0) {
      byPlayer[pSel.value] = (byPlayer[pSel.value] || 0) + v;
    }
  });
  details.textContent = Object.entries(byPlayer)
    .map(([p, pts]) => p + ' +' + pts)
    .join('  ·  ');
}
```

- [ ] **Étape 4 : CSS — améliorer la barre sticky**

Trouver `#lotSummaryBar` dans le CSS et ajuster :

```css
#lotSummaryBar {
  position: sticky;
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 50;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 16px; margin-top: 14px;
  background: var(--card);
  border: 1.5px solid var(--accent);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(255,71,87,0.2), 0 1px 4px rgba(0,0,0,0.3);
  animation: fadeIn 0.2s ease;
}
```

- [ ] **Étape 5 : Tester**

Ajouter 2+ lignes. La barre sticky apparaît avec les détails par joueur. Le bouton rouge principal n'est plus là — seul le bouton de la sticky bar est primary. Le bouton en bas de la liste est grisé/secondaire.

---

## Task 5 : Groupement manuel des lignes en saisie lot

**Fichier :** `Index.html` — JS section, fonctions `addEntryRow` et `submitBulk`, plus CSS

**Contexte :** L'utilisateur veut pouvoir marquer plusieurs lignes comme appartenant au même groupe avant de les soumettre. Ces lignes auront le même `groupId` dans l'historique.

- [ ] **Étape 1 : Ajouter la variable d'état et le CSS**

Dans le bloc état global (ligne ~1381), ajouter :
```javascript
// Groupement manuel en saisie lot
let lotGroupMode   = false;   // mode sélection actif
let lotGroupSel    = new Set(); // IDs des lignes sélectionnées pour grouper
const lotGroupMap  = new Map(); // rowId -> groupTag (string courte)
let lotGroupSeq    = 0;       // compteur de groupes créés
```

CSS à ajouter avant `</style>` :
```css
/* ── GROUPEMENT EN SAISIE LOT ── */
.entry-row.lot-group-selectable { cursor: pointer; }
.entry-row.lot-group-selected {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  background: rgba(255,71,87,0.06);
}
.lot-group-tag {
  position: absolute; top: 4px; right: 7px;
  font-size: 0.6rem; font-weight: 900; letter-spacing: 0.03em;
  padding: 1px 6px; border-radius: 8px;
  background: var(--accent); color: #fff; opacity: 0.85;
}
.lot-group-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; margin: 8px 0;
  background: rgba(0,0,0,0.1); border: 1px solid var(--border);
  border-radius: 8px; font-size: 0.82rem;
}
.lot-group-bar button { min-height: 30px; }
```

- [ ] **Étape 2 : Ajouter la barre de groupement dans le HTML**

Juste après `<div id="entryContainer"></div>` (ligne ~1133), ajouter :
```html
<div id="lotGroupBar" class="lot-group-bar" style="display:none;">
  <span id="lotGroupBarInfo" style="flex:1;color:var(--text-muted);">Sélectionnez des lignes à grouper</span>
  <button id="lotGroupApplyBtn" class="primary small" disabled>🔗 Grouper la sélection</button>
  <button id="lotGroupCancelBtn" class="secondary small">✕ Annuler</button>
</div>
```

Et ajouter un bouton "⊞ Grouper" dans la zone de boutons du bas, à côté de `addRowBtn` :
```html
<button id="lotGroupModeBtn" class="secondary" style="font-size:0.84rem;">🔗 Grouper</button>
```

- [ ] **Étape 3 : Implémenter la logique de groupement**

Dans la section JS (après `updateLotSummary`), ajouter :

```javascript
function enterLotGroupMode() {
  lotGroupMode = true;
  lotGroupSel.clear();
  document.getElementById('lotGroupBar').style.display = 'flex';
  document.getElementById('lotGroupModeBtn').style.display = 'none';
  updateLotGroupBar();
  document.querySelectorAll('.entry-row').forEach(r => {
    r.classList.add('lot-group-selectable');
    r.addEventListener('click', onLotGroupRowClick);
  });
}

function exitLotGroupMode() {
  lotGroupMode = false;
  lotGroupSel.clear();
  document.getElementById('lotGroupBar').style.display = 'none';
  document.getElementById('lotGroupModeBtn').style.display = '';
  document.querySelectorAll('.entry-row').forEach(r => {
    r.classList.remove('lot-group-selectable', 'lot-group-selected');
    r.removeEventListener('click', onLotGroupRowClick);
  });
}

function onLotGroupRowClick(e) {
  // Ne pas intercepter les clics sur les boutons internes
  if (e.target.closest('button, input, select, label')) return;
  const row = e.currentTarget;
  const id  = row.id;
  if (lotGroupSel.has(id)) { lotGroupSel.delete(id); row.classList.remove('lot-group-selected'); }
  else { lotGroupSel.add(id); row.classList.add('lot-group-selected'); }
  updateLotGroupBar();
}

function updateLotGroupBar() {
  const info  = document.getElementById('lotGroupBarInfo');
  const apply = document.getElementById('lotGroupApplyBtn');
  const n = lotGroupSel.size;
  if (info) info.textContent = n < 2 ? 'Sélectionnez au moins 2 lignes à grouper' : n + ' lignes sélectionnées';
  if (apply) apply.disabled = n < 2;
}

function applyLotGroup() {
  if (lotGroupSel.size < 2) return;
  lotGroupSeq++;
  const tag = 'G' + lotGroupSeq;
  lotGroupSel.forEach(id => {
    lotGroupMap.set(id, tag);
    const row = document.getElementById(id);
    if (!row) return;
    // Retirer un ancien tag éventuel
    const old = row.querySelector('.lot-group-tag');
    if (old) old.remove();
    // Afficher le nouveau tag
    const tagEl = document.createElement('span');
    tagEl.className = 'lot-group-tag';
    tagEl.textContent = 'Groupe ' + lotGroupSeq;
    row.appendChild(tagEl);
    // Bordure gauche commune (couleur du groupe)
    const groupColors = ['#6c63ff','#00d4aa','#ffd166','#ff6b81','#3742fa','#ff9f43'];
    row.style.setProperty('--row-accent', groupColors[(lotGroupSeq - 1) % groupColors.length]);
  });
  showToast('Groupe ' + lotGroupSeq + ' créé (' + lotGroupSel.size + ' lignes).', 'success');
  exitLotGroupMode();
}
```

- [ ] **Étape 4 : Brancher les boutons dans `bindButtons`**

Dans `bindButtons()`, ajouter :
```javascript
document.getElementById('lotGroupModeBtn').addEventListener('click', enterLotGroupMode);
document.getElementById('lotGroupApplyBtn').addEventListener('click', applyLotGroup);
document.getElementById('lotGroupCancelBtn').addEventListener('click', exitLotGroupMode);
```

- [ ] **Étape 5 : Utiliser `lotGroupMap` dans `submitBulk`**

Dans `runBulkPlan` (ligne ~3301), le `gid` est actuellement généré aléatoirement pour toutes les lignes quand il y en a plusieurs. Modifier pour que les lignes sans groupe dans `lotGroupMap` n'aient pas de `gid`, et que les lignes du même groupe partagent le même `gid`.

Dans `submitBulk`, au moment de construire `items`, annoter chaque item avec son `groupTag` :
```javascript
// Dans la forEach sur rows :
const rowId   = r.id;
const groupTag = lotGroupMap.get(rowId) || '';
items.push({ ..., groupTag });
```

Dans `runBulkPlan`, adapter la génération de `gid` :
```javascript
// Construire un map groupTag -> gid permanent
const groupTagToGid = {};
plan.forEach(dayPlan => {
  dayPlan.entries.forEach(entry => {
    if (entry.groupTag && !groupTagToGid[entry.groupTag]) {
      groupTagToGid[entry.groupTag] = 'G' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
    }
    entry.gid = entry.groupTag ? groupTagToGid[entry.groupTag] : '';
  });
});
```

Puis dans `apiAddBulkScores`, passer `entry.gid` au lieu du `gid` global. (Adapter la signature de l'appel serveur si nécessaire — vérifier avec le backend existant.)

- [ ] **Étape 6 : Nettoyer `lotGroupMap` après soumission réussie**

Dans le callback de succès de `runBulkPlan`, ajouter :
```javascript
lotGroupMap.clear();
lotGroupSeq = 0;
```

- [ ] **Étape 7 : Tester**

1. Ajouter 4 lignes.
2. Cliquer "🔗 Grouper", sélectionner lignes 1 et 3, cliquer "Grouper la sélection" → tag "Groupe 1" apparaît.
3. Sélectionner lignes 2 et 4 → tag "Groupe 2".
4. Soumettre → dans l'historique, les entrées du groupe 1 sont regroupées ensemble.

---

## Task 6 : Amélioration des boites d'édition (modales)

**Fichier :** `Index.html` — JS section, fonctions `openEditModal`, `openEditNoteModal`, CSS

**Contexte :** Les modales actuelles sont fonctionnelles mais basiques. On veut : plus large, layout en grille, prévisualisation couleur en temps réel, textarea pour les notes.

- [ ] **Étape 1 : Augmenter la taille max des modales d'édition**

Dans le CSS, après `.modal-box { ... }`, ajouter :
```css
.modal-box.wide { max-width: 480px; }
.modal-box .modal-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;
}
.modal-box .modal-grid.single { grid-template-columns: 1fr; }
.modal-field { display: flex; flex-direction: column; gap: 5px; }
.modal-field label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.modal-field input, .modal-field textarea, .modal-field select {
  margin: 0;
}
.modal-color-preview {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; background: rgba(0,0,0,0.1);
  border-radius: 8px; border: 1px solid var(--border); margin-top: 4px;
}
.modal-color-swatch {
  width: 32px; height: 32px; border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.2); flex-shrink: 0;
}
```

- [ ] **Étape 2 : Améliorer `openEditModal` (joueurs et tops)**

Remplacer la fonction `openEditModal` par :
```javascript
function openEditModal(entityType, oldName, oldMeta, oldIcon, currentColor) {
  const box = document.getElementById('modalBox');
  box.classList.add('wide');
  const isCat  = entityType === 'Categories';
  const isPlay = entityType === 'Players';
  const metaLabel = isPlay ? 'URL avatar' : 'Description';
  const initColor = currentColor || (isPlay ? playerColor(oldName) : categoryColor(oldName));

  box.innerHTML = `
    <h3>Éditer — ${escapeHtml(oldName)}</h3>
    <div class="modal-grid">
      <div class="modal-field">
        <label>Nom</label>
        <input type="text" id="mNewName" value="${escapeHtml(oldName)}" placeholder="Nom">
      </div>
      ${isCat ? `<div class="modal-field"><label>Icône emoji</label>
        <input type="text" id="mNewIcon" value="${escapeHtml(oldIcon || '')}" placeholder="ex : 🍺" maxlength="8"></div>` : ''}
    </div>
    <div class="modal-grid single">
      <div class="modal-field">
        <label>${metaLabel}</label>
        <input type="text" id="mNewMeta" value="${escapeHtml(oldMeta || '')}" placeholder="${metaLabel}">
      </div>
    </div>
    <div class="modal-field" style="margin-bottom:12px;">
      <label>Couleur</label>
      <div class="modal-color-preview">
        <span class="modal-color-swatch" id="mColorSwatch" style="background:${initColor};border-radius:${isPlay?'50%':'8px'};"></span>
        <input type="color" id="mColorPicker" value="${initColor}" style="width:48px;height:36px;border-radius:6px;border:1px solid var(--border);cursor:pointer;padding:2px;">
        <span id="mColorHex" style="font-size:0.78rem;color:var(--text-muted);font-family:monospace;">${initColor}</span>
      </div>
    </div>
    <div class="modal-actions">
      <button id="mSave" class="primary">Enregistrer</button>
      <button id="mCancel" class="secondary">Annuler</button>
    </div>`;

  // Live preview couleur
  const picker = document.getElementById('mColorPicker');
  const swatch = document.getElementById('mColorSwatch');
  const hexEl  = document.getElementById('mColorHex');
  picker.addEventListener('input', () => {
    swatch.style.background = picker.value;
    hexEl.textContent = picker.value;
  });

  document.getElementById('mSave').onclick = () => {
    const n  = document.getElementById('mNewName').value.trim();
    const m  = document.getElementById('mNewMeta').value.trim();
    const ic = isCat ? (document.getElementById('mNewIcon') || {}).value.trim() || '' : '';
    const col = picker.value;
    if (!n) return;
    closeModal();
    // Mise à jour couleur locale immédiate
    const cache = isCat ? cachedCategories : cachedPlayers;
    const item  = cache.find(x => x.name === oldName);
    if (item) { item.color = col; }
    callServer('apiSetColor', [entityType, oldName, col], () => {}, 'Color save');
    callServer('apiManageEntity', ['RENAME', entityType, n, m, oldName, ic], () => {
      loadEntities();
      showToast('Modifié avec succès.', 'success');
      refreshColorDependentViews();
    }, 'Erreur renommage');
  };
  document.getElementById('mCancel').onclick = closeModal;
  document.getElementById('modalBackdrop').style.display = 'flex';
}
```

- [ ] **Étape 3 : Passer `currentColor` à `openEditModal` dans `renderEntityList`**

Dans `renderEntityList`, le bouton `editBtn` appelle actuellement :
```javascript
editBtn.addEventListener('click', () => openEditModal(type, item.name, item.meta, item.icon));
```
Changer en :
```javascript
const col = type === 'Players' ? playerColor(item.name) : categoryColor(item.name);
editBtn.addEventListener('click', () => openEditModal(type, item.name, item.meta, item.icon, col));
```

- [ ] **Étape 4 : Améliorer `openEditNoteModal`**

Remplacer la fonction :
```javascript
function openEditNoteModal(note) {
  const box = document.getElementById('modalBox');
  box.classList.add('wide');
  const d = note.timestamp ? new Date(note.timestamp) : null;
  const dateStr = (d && !isNaN(d)) ? d.toLocaleDateString('fr-FR') : '—';

  box.innerHTML =
    `<h3>Éditer la note</h3>
    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 10px;">${escapeHtml(dateStr)}</p>
    <div class="modal-field" style="margin-bottom:12px;">
      <label>Contenu de la note</label>
      <textarea id="mNoteText" rows="5" style="width:100%;padding:10px;border-radius:6px;
        border:1px solid var(--border);background:var(--bg);color:var(--text);
        font-size:16px;resize:vertical;font-family:inherit;">${escapeHtml(note.text)}</textarea>
      <span id="mNoteCount" style="font-size:0.7rem;color:var(--text-muted);text-align:right;display:block;"></span>
    </div>
    <div class="modal-actions">
      <button id="mSave" class="primary">Enregistrer</button>
      <button id="mCancel" class="secondary">Annuler</button>
    </div>`;

  const ta = document.getElementById('mNoteText');
  const counter = document.getElementById('mNoteCount');
  const updateCount = () => { counter.textContent = ta.value.length + ' caractères'; };
  ta.addEventListener('input', updateCount);
  updateCount();
  setTimeout(() => ta.focus(), 50);

  document.getElementById('mSave').onclick = () => {
    const v = ta.value.trim();
    if (!v) { showToast('La note ne peut pas être vide.', 'error'); return; }
    closeModal();
    callServer('apiEditNote', [note.rowIndex, v], () => {
      loadNotes();
      showToast('Note modifiée.', 'success');
    }, 'Édition note');
  };
  document.getElementById('mCancel').onclick = closeModal;
  document.getElementById('modalBackdrop').style.display = 'flex';
}
```

- [ ] **Étape 5 : Nettoyer la classe `wide` à la fermeture**

Dans `closeModal()` (ligne ~1841), ajouter :
```javascript
document.getElementById('modalBox').classList.remove('wide');
```

- [ ] **Étape 6 : Ajouter Ctrl+Enter pour soumettre dans les modales**

Dans la section JS (après `closeModal`), ajouter :
```javascript
document.getElementById('modalBackdrop').addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const saveBtn = document.getElementById('mSave');
    if (saveBtn && !saveBtn.disabled) saveBtn.click();
  }
  if (e.key === 'Escape') closeModal();
});
```

- [ ] **Étape 7 : Tester**

1. Dans Paramètres, cliquer ✏️ sur un joueur → modal large avec picker couleur en live preview.
2. Changer la couleur → swatch se met à jour immédiatement.
3. Modifier une note → textarea avec compteur de caractères.
4. Ctrl+Enter sauvegarde, Échap ferme.

---

## Task 7 : Phrases d'accroche pour les classements

**Fichier :** `Index.html` — JS section, fonctions `renderChart` (type `ranking`) et nouvelles fonctions

**Contexte :** Générer des phrases humoristiques contextuelles basées sur le classement actuel (1er, dernier, etc.). Les phrases utilisent les données du graphique et les noms des tops. Pas de hardcode des joueurs — tout est paramétrique.

- [ ] **Étape 1 : Définir les templates de phrases**

Dans la section JS, juste après le bloc `const PALETTE = [...]` (ligne ~1445), ajouter :

```javascript
// ── PHRASES D'ACCROCHE ──────────────────────────────────────────────────
// {player} = nom du joueur, {pts} = score, {cat} = top le plus joué, {n} = rang
const RANKING_PHRASES = {
  first: [
    "👑 {player} règne sans partage avec {pts} pts. Inclinez-vous.",
    "🏆 {player} a décidé de gagner, et franchement on le respecte.",
    "🚀 {player} est tellement devant qu'on lui voit plus la nuque.",
    "🎯 {player} : là pour gagner, pas pour fraterniser.",
    "⚡ Avec {pts} pts, {player} joue dans une autre ligue. La sienne.",
  ],
  second: [
    "🥈 {player} : si proche, si loin. La médaille d'argent ne ment pas.",
    "📈 {player} vise le sommet. Il/Elle est juste en chemin.",
    "🙏 {player} regarde le premier depuis le bas. Le très bas.",
  ],
  third: [
    "🥉 Podium pour {player} ! C'est déjà ça.",
    "🎖️ {player} termine sur le podium. Là où les photos sont prises.",
  ],
  mid: [
    "😐 {player} : ni premier, ni dernier. La zone de confort totale.",
    "🌊 {player} navigue en eaux tranquilles avec {pts} pts.",
  ],
  last: [
    "💀 {player} ferme la marche avec {pts} pts. Respect quand même.",
    "🐢 {player} : lent, mais constant. Enfin surtout lent.",
    "🌱 {player} a encore de la marge. Beaucoup de marge.",
    "😬 {player} booste le moral des autres en étant dernier. Altruiste.",
    "🔴 {player} porte le rouge de la lanterne. Élégamment.",
  ],
  tied: [
    "🤝 Égalité parfaite entre {player} et les autres. Décevant pour tout le monde.",
    "⚖️ {player} et ses adversaires sont à {pts} pts. Le hasard ? Non. Le destin.",
  ],
  solo: [
    "🧍 {player} joue seul·e avec {pts} pts. Victoire par défaut, mais victoire.",
  ]
};

function pickPhrase(pool, vars) {
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : '{' + k + '}');
}

function generateRankingPhrases(sortedRows) {
  if (!sortedRows || !sortedRows.length) return [];
  const phrases = [];
  const n = sortedRows.length;

  if (n === 1) {
    phrases.push(pickPhrase(RANKING_PHRASES.solo, { player: sortedRows[0].player, pts: sortedRows[0].total }));
    return phrases;
  }

  sortedRows.forEach((row, i) => {
    const rank = i + 1;
    const vars = { player: row.player, pts: row.total, n: rank };
    let pool;
    // Égalité avec le suivant ou le précédent ?
    const prevSameScore = i > 0 && sortedRows[i - 1].total === row.total;
    const nextSameScore = i < n - 1 && sortedRows[i + 1].total === row.total;
    if (prevSameScore || nextSameScore) {
      pool = RANKING_PHRASES.tied;
    } else if (rank === 1)   pool = RANKING_PHRASES.first;
    else if (rank === 2)     pool = RANKING_PHRASES.second;
    else if (rank === 3 && n >= 4) pool = RANKING_PHRASES.third;
    else if (rank === n)     pool = RANKING_PHRASES.last;
    else                     pool = RANKING_PHRASES.mid;

    phrases.push(pickPhrase(pool, vars));
  });

  // Retourner seulement 2-3 phrases pour ne pas surcharger
  // : 1er, dernier, et un du milieu si ≥ 5 joueurs
  const selected = [];
  selected.push(phrases[0]); // 1er
  if (n >= 3 && phrases[n - 1]) selected.push(phrases[n - 1]); // dernier
  if (n >= 5 && phrases[Math.floor(n / 2)]) selected.push(phrases[Math.floor(n / 2)]); // milieu
  return selected;
}
```

- [ ] **Étape 2 : Ajouter le CSS du strip de phrases**

Dans la section CSS, avant `</style>` :
```css
/* ── PHRASES D'ACCROCHE ── */
#rankingPhrasesStrip {
  display: flex; flex-direction: column; gap: 6px;
  margin-top: 12px;
}
.ranking-phrase {
  background: rgba(0,0,0,0.1); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 14px;
  font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;
  animation: fadeIn 0.3s ease;
  border-left: 3px solid var(--accent);
}
body.light .ranking-phrase { background: rgba(0,0,0,0.04); }
```

- [ ] **Étape 3 : Ajouter le conteneur HTML**

Juste après `<div id="topStatsStrip"></div>` dans le HTML, ajouter :
```html
<div id="rankingPhrasesStrip"></div>
```

- [ ] **Étape 4 : Appeler `generateRankingPhrases` dans `renderChart` type `ranking`**

Dans la fonction `renderChart`, bloc `if (type === 'ranking')`, après la création de `currentChart`, ajouter :

```javascript
// Phrases d'accroche — seulement en mode non-détaillé
const phrasesStrip = document.getElementById('rankingPhrasesStrip');
if (phrasesStrip) {
  phrasesStrip.innerHTML = '';
  if (!chartOptions.detailed) {
    const phrases = generateRankingPhrases(totals);
    phrases.forEach(p => {
      const div = document.createElement('div');
      div.className = 'ranking-phrase';
      div.textContent = p;
      phrasesStrip.appendChild(div);
    });
  }
}
```

- [ ] **Étape 5 : Effacer les phrases pour les autres types de graphiques**

Dans `clearTopStatsStrip` (ligne ~2246), ajouter :
```javascript
function clearTopStatsStrip() {
  const strip = document.getElementById('topStatsStrip');
  if (strip) strip.innerHTML = '';
  const phrases = document.getElementById('rankingPhrasesStrip');
  if (phrases) phrases.innerHTML = '';
}
```

- [ ] **Étape 6 : Tester**

Ouvrir le Dashboard, sélectionner "Classement". Des phrases humoristiques apparaissent sous le graphique, différentes pour le 1er, le dernier, etc. Chaque rechargement du filtre génère les mêmes phrases (basées sur les données, pas aléatoires à chaque frame).

---

## Task 8 : Historique — édition complète d'une entrée

**Fichier :** `Index.html` — JS section, fonction `buildHistRow`, nouvelle fonction `openFullEditHistoryModal`

**Contexte :** Actuellement seule la description est modifiable. On veut pouvoir modifier date, joueur, Top, points et description. Cela nécessite une API serveur `apiUpdateHistoryEntry`.

> ⚠️ **Prérequis backend** : La fonction `apiUpdateHistoryEntry(rowIndex, {date, player, category, points, description})` doit exister dans le backend Google Apps Script. Si elle n'existe pas, le bouton d'édition sera visible mais l'appel échouera avec un message d'erreur explicite.

- [ ] **Étape 1 : Créer `openFullEditHistoryModal`**

Ajouter la fonction après `openEditDescModal` (ligne ~4066) :

```javascript
function openFullEditHistoryModal(log) {
  const box = document.getElementById('modalBox');
  box.classList.add('wide');

  const playerOptions = cachedPlayers.map(p =>
    `<option value="${escapeHtml(p.name)}"${p.name === log.player ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');
  const catOptions = cachedCategories.map(c =>
    `<option value="${escapeHtml(c.name)}"${c.name === log.category ? ' selected' : ''}>${escapeHtml(catDisplay(c.name))}</option>`
  ).join('');

  const d = log.timestamp ? new Date(log.timestamp) : new Date();
  const dateVal = isNaN(d) ? toDateStr(new Date()) : toDateStr(d);

  box.innerHTML = `
    <h3>✏️ Modifier l'entrée</h3>
    <div class="modal-grid">
      <div class="modal-field">
        <label>Date</label>
        <input type="date" id="mEditDate" value="${escapeHtml(dateVal)}">
      </div>
      <div class="modal-field">
        <label>Points</label>
        <input type="number" id="mEditPts" value="${escapeHtml(String(log.points))}" min="1" step="1" inputmode="numeric">
      </div>
    </div>
    <div class="modal-grid">
      <div class="modal-field">
        <label>Joueur</label>
        <select id="mEditPlayer">${playerOptions}</select>
      </div>
      <div class="modal-field">
        <label>Top</label>
        <select id="mEditCategory">${catOptions}</select>
      </div>
    </div>
    <div class="modal-grid single">
      <div class="modal-field">
        <label>Description (optionnelle)</label>
        <input type="text" id="mEditDesc" value="${escapeHtml(log.description || '')}" placeholder="Description…">
      </div>
    </div>
    <div class="modal-actions">
      <button id="mSave" class="primary">Enregistrer</button>
      <button id="mCancel" class="secondary">Annuler</button>
    </div>`;

  document.getElementById('mSave').onclick = () => {
    const date     = document.getElementById('mEditDate').value;
    const pts      = parseInt(document.getElementById('mEditPts').value, 10);
    const player   = document.getElementById('mEditPlayer').value;
    const category = document.getElementById('mEditCategory').value;
    const desc     = document.getElementById('mEditDesc').value.trim();

    if (!date)            { showToast('Date requise.', 'error'); return; }
    if (isNaN(pts) || pts < 1) { showToast('Points invalides (min 1).', 'error'); return; }
    if (!player)          { showToast('Joueur requis.', 'error'); return; }
    if (!category)        { showToast('Top requis.', 'error'); return; }

    closeModal();
    callServer('apiUpdateHistoryEntry', [log.rowIndex, { date, player, category, points: pts, description: desc }],
      res => {
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
  setTimeout(() => { const el = document.getElementById('mEditPts'); if (el) el.focus(); }, 50);
}
```

- [ ] **Étape 2 : Ajouter le bouton d'édition complète dans `buildHistRow`**

Dans `buildHistRow`, remplacer le bloc `actCell` par :
```javascript
const actCell = tr.insertCell();
actCell.style.cssText = 'white-space:nowrap;';

const fullEditBtn = document.createElement('button');
fullEditBtn.className = 'small';
fullEditBtn.textContent = '✏️';
fullEditBtn.title = 'Modifier cette entrée (date, joueur, Top, points, description)';
fullEditBtn.style.marginRight = '4px';
fullEditBtn.addEventListener('click', () => openFullEditHistoryModal(log));

const delBtn = document.createElement('button');
delBtn.className = 'small danger';
delBtn.textContent = '🗑️';
delBtn.title = 'Supprimer';
delBtn.addEventListener('click', () => {
  openConfirmModal('Supprimer cette entrée ?', () => {
    buzz();
    scheduleDeletion([log.rowIndex]);
  });
});
actCell.appendChild(fullEditBtn);
actCell.appendChild(delBtn);
```

Note : `editDescBtn` (description seule) est remplacé par `fullEditBtn` (édition complète incluant la description).

- [ ] **Étape 3 : Tester**

1. Dans Historique, cliquer ✏️ sur une ligne.
2. Modal avec date, joueur, top, points, description.
3. Modifier un champ, sauvegarder.
4. Si le backend `apiUpdateHistoryEntry` n'existe pas → toast d'erreur "Erreur modification entrée".

---

## Task 9 : Export modal enrichi

**Fichier :** `Index.html` — JS section, fonctions `openExportModal` et `buildInfographicCanvas`

**Contexte :** Le modal d'export existe déjà. On l'enrichit avec : affichage de la légende, filigrane, grille visible, résumé des filtres actifs, titre personnalisable, résolution ×3.

- [ ] **Étape 1 : Étendre `exportOpts` avec les nouvelles options**

Dans `openExportModal` (ligne ~2703), remplacer la ligne :
```javascript
let exportOpts = { format: 'png', theme: 'dark', title: true, period: true, stats: true, scale: 1 };
```
Par :
```javascript
let exportOpts = {
  format:     'png',
  theme:      document.body.classList.contains('light') ? 'light' : 'dark',
  title:      true,
  period:     true,
  stats:      true,
  scale:      1,
  legend:     true,   // ← nouveau
  watermark:  true,   // ← nouveau
  filters:    true,   // ← résumé joueurs/tops filtrés
  customTitle: ''     // ← titre personnalisé (vide = auto)
};
```

- [ ] **Étape 2 : Ajouter les nouveaux contrôles dans le modal**

Après `box.appendChild(optsGroup)` et avant `box.appendChild(prevWrap)`, ajouter :

```javascript
// Groupe : Contenu avancé
const advGroup = document.createElement('div');
advGroup.className = 'export-opt-group';
const advLbl = document.createElement('label'); advLbl.textContent = 'Contenu avancé';
advGroup.appendChild(advLbl);
advGroup.appendChild(checkOpt('Afficher la légende du graphique', 'legend'));
advGroup.appendChild(checkOpt('Filigrane "Tops des Tops"', 'watermark'));
advGroup.appendChild(checkOpt('Résumé des filtres actifs', 'filters'));
box.insertBefore(advGroup, prevWrap);

// Résolution ×3
// Remplacer le groupe résolution existant : modifier les options
// [{v:1,t:'Normal'},{v:2,t:'HD ×2'},{v:3,t:'4K ×3'}]
// (trouver 'Résolution' dans le code et ajouter {v:3,t:'4K ×3'})

// Titre personnalisé
const titleGroup = document.createElement('div');
titleGroup.className = 'export-opt-group';
const titleLbl = document.createElement('label'); titleLbl.textContent = 'Titre personnalisé (optionnel)';
const titleIn  = document.createElement('input');
titleIn.type = 'text'; titleIn.placeholder = 'Laissez vide pour le titre auto';
titleIn.style.cssText = 'margin-top:4px;';
titleIn.addEventListener('input', () => { exportOpts.customTitle = titleIn.value.trim(); updatePreview(); });
titleGroup.appendChild(titleLbl); titleGroup.appendChild(titleIn);
box.insertBefore(titleGroup, prevWrap);
```

- [ ] **Étape 3 : Modifier `buildInfographicCanvas` pour les nouveaux opts**

Dans `buildInfographicCanvas`, ajouter le support des nouvelles options :

**Watermark :** dans le bloc `if (opts.title)`, la ligne `ctx.fillText('Tops des Tops', ...)` doit être conditionnelle :
```javascript
if (opts.watermark !== false) {
  ctx.fillText('Tops des Tops', Math.round(18 * S), Math.round(24 * S));
}
```

**Filtres actifs :** juste après le bloc titre, si `opts.filters` :
```javascript
if (opts.filters) {
  const activeP = [...selectedPlayerChips];
  const activeC = [...selectedCategoryChips];
  const filterStr = [
    activeP.length ? 'Joueurs : ' + activeP.join(', ') : '',
    activeC.length ? 'Tops : ' + activeC.join(', ') : ''
  ].filter(Boolean).join(' | ');
  if (filterStr) {
    ctx.fillStyle = MUTED; ctx.font = Math.round(11 * S) + 'px sans-serif';
    ctx.fillText(filterStr.length > 80 ? filterStr.slice(0, 79) + '…' : filterStr,
      Math.round(18 * S), Math.round(58 * S));
  }
}
```

**Titre personnalisé :** dans le bloc titre, remplacer `chartLabel` par :
```javascript
const chartTitleEl = document.getElementById('chartTitle');
const chartLabel = (opts.customTitle && opts.customTitle.trim())
  ? opts.customTitle.trim()
  : (chartTitleEl ? chartTitleEl.textContent : '');
```

**Résolution ×3 :** déjà supportée automatiquement si `opts.scale = 3` — mettre à jour le groupe de pills pour ajouter l'option.

- [ ] **Étape 4 : Tester**

1. Ouvrir le modal d'export.
2. Cocher/décocher "Filigrane" → la prévisualisation se met à jour.
3. Taper un titre personnalisé → il remplace le titre auto dans la préview.
4. Sélectionner ×3 (4K) → le fichier téléchargé est plus grand.

---

## Task 10 : Amélioration visuelle de la saisie lot

**Fichier :** `Index.html` — CSS et JS section `addEntryRow`

**Contexte :** L'interface de saisie lot fonctionne bien. On améliore le ressenti : meilleur en-tête de lot, séparateur visuel, boutons d'action plus clairs, état vide plus agréable.

- [ ] **Étape 1 : Améliorer l'état vide du container de lignes**

Dans `addEntryRow`, quand `!cachedPlayers.length || !cachedCategories.length`, remplacer le message par :
```javascript
const p = document.createElement('div');
p.className = 'empty-illustration';
p.innerHTML = '<div class="emoji">🎮</div><div class="msg">Ajoutez d\'abord des joueurs et des Tops dans <strong>Paramètres</strong>.</div>';
container.appendChild(p);
```

- [ ] **Étape 2 : Ajouter un compteur de lignes dans le titre de la section**

Dans le HTML, modifier le titre de la carte saisie lot :
```html
<h2>✍️ Constructeur de Lot <span id="batchLineCount" style="font-size:0.78rem;font-weight:400;color:var(--text-muted);margin-left:6px;"></span></h2>
```

Dans `updateLotSummary`, ajouter :
```javascript
const batchCount = document.getElementById('batchLineCount');
if (batchCount) batchCount.textContent = count > 0 ? '(' + count + ' ligne' + (count > 1 ? 's' : '') + ')' : '';
```

- [ ] **Étape 3 : Améliorer les boutons d'action en bas des lignes**

Dans `addEntryRow`, remplacer le contenu du bloc `actions` :
```javascript
const actions = document.createElement('div');
actions.className = 'row-actions';
const dupBtn = document.createElement('button');
dupBtn.className = 'small secondary';
dupBtn.innerHTML = '📋';
dupBtn.title = 'Dupliquer cette ligne';
// (garder le listener existant)

const delBtn = document.createElement('button');
delBtn.className = 'small danger';
delBtn.innerHTML = '✕';
delBtn.title = 'Supprimer cette ligne';
// (garder le listener existant)
```

- [ ] **Étape 4 : Séparateur visuel entre la section date globale et les lignes**

Dans le HTML, entre `</div>` (fin du bloc date par défaut) et `<div class="batch-header">` :
```html
<div style="border-top:1px solid var(--border);margin:14px -4px 14px;opacity:0.5;"></div>
```

- [ ] **Étape 5 : CSS — améliorer `.entry-row` sur mobile**

Vérifier et améliorer les styles responsives existants pour que les lignes soient agréables sur petits écrans. Ajouter :
```css
@media (max-width: 640px) {
  .row-actions { justify-content: flex-end; }
  .pts-toggle-wrap .pts-btn { font-size: 0.85rem; }
}
```

---

## Task 11 : Bug — descriptions dupliquées dans l'historique

**Fichier :** `Index.html` — JS section, fonction `buildHistRow` (~ligne 3750)

**Contexte :** Quand une entrée a une description, elle s'affiche en tronqué dans `.hist-desc-toggle`. Cliquer dessus ajoute `.hist-desc-full` avec le même texte juste en dessous → la description apparaît deux fois.

**Cause :** Le toggle montre déjà le texte complet, et le `.hist-desc-full` répète ce même texte. De plus, si la description est courte (non tronquée), l'expand est inutile.

**Fix :** Ne montrer le comportement expand-on-click que si la description est effectivement tronquée (>50 caractères). Pour les descriptions courtes, afficher directement le texte complet sans interaction. Pour les longues, cacher le texte dans le toggle et ne l'afficher que dans le `.hist-desc-full` à l'ouverture.

- [ ] **Étape 1 : Localiser le bloc description dans `buildHistRow`**

Chercher `hist-desc-toggle` dans la section JS, dans la fonction `buildHistRow`. Le bloc commence par :
```javascript
if (log.description) {
  const descEl = document.createElement('div');
  descEl.className = 'hist-desc-toggle';
  descEl.textContent = log.description;
```

- [ ] **Étape 2 : Remplacer le bloc par la version corrigée**

```javascript
if (log.description) {
  const SHORT_LIMIT = 55; // au-delà, on propose l'expand
  const isLong = log.description.length > SHORT_LIMIT;

  const descEl = document.createElement('div');
  descEl.className = 'hist-desc-toggle';

  if (!isLong) {
    // Texte court : affiché directement, pas d'interaction
    descEl.textContent = log.description;
    descEl.style.cursor = 'default';
    descEl.title = '';
  } else {
    // Texte long : tronqué avec "…", clic pour expand
    descEl.textContent = log.description.slice(0, SHORT_LIMIT) + '…';
    descEl.title = 'Cliquer pour lire la suite';
    descEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = catCell.querySelector('.hist-desc-full');
      if (existing) {
        existing.remove();
        descEl.textContent = log.description.slice(0, SHORT_LIMIT) + '…';
        descEl.style.whiteSpace = 'nowrap';
        descEl.title = 'Cliquer pour lire la suite';
        return;
      }
      // Afficher le texte complet UNIQUEMENT dans le bloc expand, pas de doublon
      descEl.textContent = ''; // vider le résumé pendant que le full est visible
      descEl.title = 'Cliquer pour replier';

      const full = document.createElement('div');
      full.className = 'hist-desc-full';
      full.textContent = log.description;
      descEl.style.whiteSpace = 'normal';
      catCell.appendChild(full);
    });
  }

  catCell.appendChild(descEl);
}
```

- [ ] **Étape 3 : Appliquer le même fix dans `renderGroupHeader`**

Dans `renderGroupHeader`, chercher le bloc similaire :
```javascript
if (!isMultiCategory && first.description) {
  const descEl = document.createElement('div');
  descEl.className = 'hist-desc-toggle';
  descEl.textContent = first.description;
  catCell.appendChild(descEl);
}
```
Remplacer par la même logique court/long (sans le `e.stopPropagation` puisqu'il n'y a pas de listener de clic ici — ou en ajouter un identique si on veut le comportement expand sur les en-têtes de groupe aussi) :

```javascript
if (!isMultiCategory && first.description) {
  const SHORT_LIMIT = 55;
  const isLong = first.description.length > SHORT_LIMIT;
  const descEl = document.createElement('div');
  descEl.className = 'hist-desc-toggle';
  if (!isLong) {
    descEl.textContent = first.description;
    descEl.style.cursor = 'default';
  } else {
    descEl.textContent = first.description.slice(0, SHORT_LIMIT) + '…';
    descEl.title = 'Cliquer pour lire la suite';
    descEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = catCell.querySelector('.hist-desc-full');
      if (existing) {
        existing.remove();
        descEl.textContent = first.description.slice(0, SHORT_LIMIT) + '…';
        descEl.title = 'Cliquer pour lire la suite';
        return;
      }
      descEl.textContent = '';
      descEl.title = 'Cliquer pour replier';
      const full = document.createElement('div');
      full.className = 'hist-desc-full';
      full.textContent = first.description;
      catCell.appendChild(full);
    });
  }
  catCell.appendChild(descEl);
}
```

- [ ] **Étape 4 : Tester**

1. Dans Historique, trouver une entrée avec une description courte (<55 chars) → texte affiché directement, pas cliquable, pas de doublon.
2. Trouver une entrée avec une description longue → texte tronqué, clic → seul le texte complet apparaît (le résumé disparaît), reclic → retour à la version tronquée.
3. Vérifier qu'un groupe avec description se comporte de même.

---

## Task 12 : Polish visuel général

**Fichier :** `Index.html` — CSS et petites retouches JS

**Contexte :** Série de finitions visuelles cohérentes : couleurs réactives, transitions manquantes, détails qui font dire "ah, c'est bien pensé".

- [ ] **Étape 1 : Hover sur les lignes d'historique — actions visibles au survol seulement**

Modifier `buildHistRow` : masquer `actCell` par défaut, le montrer au survol :
```css
/* Dans le CSS */
.hist-actions-cell { opacity: 0; transition: opacity 0.15s; }
tr:hover .hist-actions-cell,
tr:focus-within .hist-actions-cell { opacity: 1; }
```
Dans `buildHistRow`, ajouter `actCell.className = 'hist-actions-cell';`.

- [ ] **Étape 2 : Transitions sur les chips de filtre**

Les `.fchip` ont déjà `transition: 0.13s`. Améliorer avec un léger scale :
```css
.fchip { transform: scale(1); }
.fchip:active { transform: scale(0.95); }
.fchip.active { transform: scale(1.03); }
```

- [ ] **Étape 3 : Améliorer les cartes de l'onglet Paramètres**

Dans le CSS, après `.entity-item { ... }`, ajouter :
```css
.entity-item {
  transition: border-color 0.15s, box-shadow 0.15s;
}
.entity-item:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
```

- [ ] **Étape 4 : Badge de compteur animé dans la navbar**

Dans le CSS, ajouter une micro-animation quand le compteur change :
```css
@keyframes badgePop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.25); } }
.nav-count.pop { animation: badgePop 0.25s ease; }
```

Dans la section JS, chaque fois que `.nav-count` est mis à jour, ajouter la classe `pop` temporairement :
```javascript
function updateNavCount(el, value) {
  if (el && el.textContent !== String(value)) {
    el.textContent = value;
    el.classList.remove('pop');
    void el.offsetWidth; // reflow
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 250);
  }
}
```
Remplacer les `document.getElementById('notesCount').textContent = ...` et `historyCount.textContent = ...` par `updateNavCount(el, value)`.

- [ ] **Étape 5 : Améliorer l'animation fadeIn des onglets**

Modifier l'animation existante :
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tab-content.active { animation: fadeIn 0.2s ease; }
```

- [ ] **Étape 6 : Ligne accent colorée en haut des cards**

Ajouter une variante de card avec accent :
```css
.card-accent {
  border-top: 3px solid var(--accent);
}
```
Ajouter `card-accent` à la card du graphique dans le HTML :
```html
<div class="card card-accent">
```

- [ ] **Étape 7 : Focus ring cohérent**

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Étape 8 : Tester l'ensemble**

1. Naviguer entre les onglets → animation douce.
2. Survoler les lignes d'historique → les boutons d'action apparaissent au survol.
3. Activer/désactiver les chips → scale animation.
4. Ajouter une note → badge animé dans la navbar.

---

## Self-Review

### Couverture du spec

| Demande | Task | Statut |
|---|---|---|
| Pills totaux par top cliquables | Task 2 | ✅ |
| Tooltip ergonomique au survol | Task 3 | ✅ |
| Selects illisibles (blanc sur blanc) | Task 1 | ✅ |
| Phrases d'accroche pour tops | Task 7 | ✅ |
| Export enrichi (complet, souple) | Task 9 | ✅ |
| Historique — tout modifier | Task 8 | ✅ (prérequis backend noté) |
| "Inscrire le lot" moins tentant | Task 4 | ✅ |
| Boites d'édition améliorées | Task 6 | ✅ |
| Visuel général — polish | Task 12 | ✅ |
| Interface saisie lot améliorée | Task 10 | ✅ |
| Groupement manuel en saisie lot | Task 5 | ✅ |
| Bug descriptions dupliquées (historique) | Task 11 | ✅ |

### Risques identifiés

- **Task 8 (historique édition)** : dépend de `apiUpdateHistoryEntry` côté backend. Si absent, le bouton s'affiche mais l'opération échoue avec toast d'erreur. Ne bloque pas les autres tâches.
- **Task 5 (groupement lot)** : la signature de `apiAddBulkScores` doit accepter un `gid` par entrée (et non un seul `gid` global). Vérifier le backend avant d'implémenter.
- **Task 3 (tooltip)** : le plugin `buildCustomTooltipPlugin()` doit être appelé dans **tous** les `new Chart(...)` — ne pas en oublier.

### Pas de placeholders

Plan vérifié — tous les blocs de code sont complets et appelables.

---

## Exécution

Plan sauvegardé. Deux options :

**1. Subagent-Driven (recommandé)** — un subagent par tâche, avec revue entre chaque

**2. Inline Execution** — exécution dans cette session avec `executing-plans`

Quelle approche ?
