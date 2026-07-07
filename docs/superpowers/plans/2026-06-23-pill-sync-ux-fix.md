# Pill Sync & UX Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que les pills de totaux sous le graphique masquent/affichent les datasets en temps réel (client-side, sans appel serveur), corriger les boutons d'historique inaccessibles sur mobile, améliorer la lisibilité des pills cachées, puis auditer le code.

**Architecture:** Single-file `Index.html`. Toutes les modifications sont dans la section JS (section `renderTopStatsStrip`) et la section CSS. Aucun appel backend supplémentaire.

**Tech Stack:** Chart.js (CDN, API `setDatasetVisibility` + `update('none')`), CSS `@media (hover: none)` pour mobile.

---

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `D:\IA\projets\top-des-tops\Index.html` | Unique fichier — CSS et JS |

**Sections :**
- CSS ~ligne 1138 : `.hist-actions-cell`
- JS ~ligne 2510 : `renderTopStatsStrip`

---

## Task 1 : Pill click → client-side (pas de serveur)

**Fichier :** `Index.html` — JS, fonction `renderTopStatsStrip` (~ligne 2543)

**Contexte :** Actuellement le clic d'un pill appelle `renderCategoryChips()` puis `applyFilters()`. `applyFilters()` fait un aller-retour serveur, affiche un skeleton, et recharge tout le graphique. C'est inutile car les données des datasets sont déjà dans `currentChart`. Chart.js expose `chart.setDatasetVisibility(index, bool)` pour montrer/cacher un dataset sans requête.

Le challenge : les labels dans `currentChart.data.datasets[i].label` sont enrichis par `catDisplay()` (ex. `"🎮 Gaming"`) alors que `selectedCategoryChips` et `data.datasets[i].label` utilisent le nom brut (`"Gaming"`). Il faut donc retrouver l'index chart par matching `catDisplay(plainName) === chartLabel`.

- [ ] **Étape 1 : Localiser le bloc click handler dans `renderTopStatsStrip`**

Dans `Index.html`, chercher (autour de la ligne 2543) :
```javascript
pill.addEventListener('click', () => {
  if (selectedCategoryChips.has(t.name)) {
    selectedCategoryChips.delete(t.name);
  } else {
    if (selectedCategoryChips.size === 0) {
      data.datasets.forEach(ds => {
        if (ds.label !== t.name) selectedCategoryChips.add(ds.label);
      });
    } else {
      selectedCategoryChips.add(t.name);
    }
  }
  if (selectedCategoryChips.size === data.datasets.length) selectedCategoryChips.clear();
  renderCategoryChips();
  applyFilters();
});
```

- [ ] **Étape 2 : Remplacer le handler par la version client-side**

Remplacer l'intégralité du listener (de `pill.addEventListener('click', () => {` jusqu'à `});`) par :

```javascript
pill.addEventListener('click', () => {
  // 1. Mettre à jour la sélection (même logique qu'avant)
  if (selectedCategoryChips.has(t.name)) {
    selectedCategoryChips.delete(t.name);
  } else {
    if (selectedCategoryChips.size === 0) {
      data.datasets.forEach(ds => {
        if (ds.label !== t.name) selectedCategoryChips.add(ds.label);
      });
    } else {
      selectedCategoryChips.add(t.name);
    }
  }
  if (selectedCategoryChips.size === data.datasets.length) selectedCategoryChips.clear();

  // 2. Synchroniser les chips du haut (visuellement)
  renderCategoryChips();

  // 3. Mettre à jour la visibilité des datasets dans le graphique (sans appel serveur)
  if (currentChart) {
    currentChart.data.datasets.forEach((ds, chartIdx) => {
      // ds.label peut avoir un emoji préfixé via catDisplay() ; on retrouve le nom brut
      const match = data.datasets.find(d => catDisplay(d.label) === ds.label || d.label === ds.label);
      if (match) {
        const isVisible = !selectedCategoryChips.size || selectedCategoryChips.has(match.label);
        currentChart.setDatasetVisibility(chartIdx, isVisible);
      }
    });
    currentChart.update('none'); // 'none' = sans animation
  }

  // 4. Redessiner les pills pour refléter le nouvel état (sans flasher ni recharger)
  renderTopStatsStrip(data);
});
```

- [ ] **Étape 3 : Vérifier visuellement**

Dans la preview :
1. Aller sur un graphique de type "Empilé" ou "Groupé"
2. Cliquer sur un pill sous le graphique → le dataset disparaît instantanément du graphique (sans skeleton)
3. Le chip du haut correspondant doit passer à "actif"
4. Re-cliquer le pill (ou le chip du haut) → le dataset réapparaît

---

## Task 2 : Valeur des pills cachées — afficher le total même caché

**Fichier :** `Index.html` — JS, fonction `renderTopStatsStrip` (~ligne 2534)

**Contexte :** Quand un pill est "caché" (`tsp-hidden`), il affiche `"—"` au lieu du vrai total. L'utilisateur ne sait plus ce qu'il a masqué. Il vaut mieux afficher la vraie valeur avec une opacité réduite (déjà gérée par `.tsp-hidden { opacity: 0.45 }`).

- [ ] **Étape 1 : Localiser la ligne pts.textContent**

Chercher (autour de ligne 2534) :
```javascript
pts.textContent = isHidden ? '—' : t.total + ' pts';
```

- [ ] **Étape 2 : Toujours afficher la valeur réelle**

Remplacer par :
```javascript
pts.textContent = t.total + ' pts';
```

---

## Task 3 : Mobile — boutons d'historique toujours visibles

**Fichier :** `Index.html` — CSS (~ligne 1138)

**Contexte :** Task 12 a ajouté `.hist-actions-cell { opacity: 0 }` avec révélation au hover. Sur mobile/touch (tablette, téléphone), il n'y a pas de hover — les boutons d'édition et suppression d'historique deviennent complètement invisibles et inaccessibles.

Fix : media query `(hover: none)` pour forcer `opacity: 1` sur les appareils tactiles.

- [ ] **Étape 1 : Localiser le bloc CSS**

Chercher dans la section CSS :
```css
.hist-actions-cell { opacity: 0; transition: opacity 0.15s; }
tr:hover .hist-actions-cell,
tr:focus-within .hist-actions-cell { opacity: 1; }
```

- [ ] **Étape 2 : Ajouter la règle tactile juste après**

Après le bloc existant, ajouter :
```css
@media (hover: none) {
  .hist-actions-cell { opacity: 1; }
}
```

---

## Task 4 : Code review — audit final

**Fichier :** `Index.html`

**Objectif :** Identifier et corriger les problèmes restants après les Tasks 1–3.

- [ ] **Étape 1 : Vérifier la sync état ↔ chart au rechargement**

Après `applyFilters()` → `renderTopStatsStrip()` est appelé avec les nouvelles données. Les pills seront reconstruits. L'état `selectedCategoryChips` persiste entre les rechargements. Vérifier qu'après un changement de date ou de joueur, si `selectedCategoryChips` est non vide, les pills reflètent bien l'état (la logique `isHidden` dans `renderTopStatsStrip` s'en charge — vérifier que c'est correct).

Résultat attendu : aucune modification nécessaire ici (la logique `isHidden = selectedCategoryChips.size > 0 && !selectedCategoryChips.has(t.name)` est correcte).

- [ ] **Étape 2 : Vérifier le tooltip plugin sur types sans données**

Dans `buildCustomTooltipPlugin()`, si `chart.data.datasets` est vide, le plugin tente d'accéder à `context.dataset`. Vérifier s'il y a un guard :

Chercher `function buildCustomTooltipPlugin`. La fonction retourne un plugin avec `afterInit`. Si le tooltip est configuré via `options.plugins.tooltip.external`, vérifier qu'aucune erreur n'est générée quand le graphique est vide.

Action : si le corps de l'`external` callback n'a pas de guard sur `tooltipModel.opacity === 0`, ajouter :
```javascript
if (tooltipModel.opacity === 0) { el.classList.remove('visible'); return; }
```

- [ ] **Étape 3 : Vérifier `openFullEditHistoryModal` — format date**

Dans `openFullEditHistoryModal`, le champ date utilise `log.date`. Si la date vient du serveur au format `DD/MM/YYYY` ou similaire, l'`<input type="date">` (qui attend `YYYY-MM-DD`) ne sera pas pré-rempli.

Chercher `openFullEditHistoryModal` et trouver la ligne `dateIn.value = ...`. Si le format n'est pas `YYYY-MM-DD`, ajouter une conversion :
```javascript
// Convertir DD/MM/YYYY → YYYY-MM-DD si nécessaire
const rawDate = log.date || '';
dateIn.value = rawDate.includes('/') 
  ? rawDate.split('/').reverse().join('-') 
  : rawDate;
```

- [ ] **Étape 4 : Tester end-to-end le flux principal**

1. Charger un graphique empilé → pills visibles
2. Cliquer pill → dataset masqué instantanément, pas de skeleton
3. Cliquer chip du haut → idem
4. Ouvrir historique sur mobile (ou simuler hover:none via DevTools) → boutons visibles
5. Cliquer ✏️ sur une entrée → modal s'ouvre, date pré-remplie correctement

---

## Self-Review

### Couverture

| Problème | Task | Statut |
|---|---|---|
| Pills recharge interface entière | Task 1 | ✅ client-side via setDatasetVisibility |
| Pills cachées affichent "—" | Task 2 | ✅ toujours afficher la vraie valeur |
| Boutons historique invisibles sur mobile | Task 3 | ✅ @media (hover: none) |
| Tooltip vide | Task 4 Étape 2 | ✅ guard opacity |
| Date modale édition historique | Task 4 Étape 3 | ✅ conversion format |

### Risques

- `currentChart.setDatasetVisibility` est disponible dès Chart.js 3.x. La CDN `chart.js` (sans version fixe) pointe sur la dernière 4.x. Aucun risque.
- `currentChart.update('none')` saute les animations — c'est intentionnel pour la réactivité.
- Après Task 1, si l'utilisateur change de type de graphique, `applyFilters()` sera appelé et `selectedCategoryChips` guidera le filtre serveur. Comportement attendu et cohérent.
