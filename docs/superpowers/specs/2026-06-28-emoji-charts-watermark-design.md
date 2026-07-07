# Spec — Emoji dans les graphiques + filigrane modifiable

**Date :** 2026-06-28
**Statut :** Validé

---

## Objectif

1. Afficher l'emoji de chaque catégorie (Top) directement dans les éléments visuels des graphiques Chart.js, pour distinguer les séries quand les couleurs sont proches.
2. Enrichir le tooltip avec un badge emoji+couleur pour toutes les tailles de segments (survol desktop, touch mobile).
3. Rendre le texte du filigrane modifiable dans la modale d'export.

---

## Périmètre

### Hors-périmètre
- Radar : les axes affichent déjà `catDisplay` (emoji + nom) → pas touché.
- Courbes (Trend) : séries par joueur, pas par catégorie → pas touché.
- Classement simple (non détaillé) : séries par joueur → pas touché.
- Logique backend / Google Sheets : aucun changement.

---

## Composant 1 — `buildEmojiOverlayPlugin()`

Nouvelle fonction factory retournant un plugin Chart.js (même pattern que `buildCustomTooltipPlugin()`).

### Responsabilité
Dessiner l'emoji de chaque catégorie centré dans son élément visuel, après le rendu des datasets.

### Logique par type de graphique

**Barres empilées / groupées (verticales)**
- Itère sur chaque dataset (`ds._catName` → `catIcon()`)
- Pour chaque barre : `h = |bar.base - bar.y|`
- Si `h < 20` → skip (trop petit)
- Position : `cx = bar.x`, `cy = (bar.y + bar.base) / 2`
- Taille de police : `min(h * 0.55, 16)px sans-serif`

**Classement détaillé (barres horizontales)**
- Même logique, seuil sur la largeur : `w = |bar.x - bar.base|`
- Si `w < 24` → skip
- Position : `cx = (bar.x + bar.base) / 2`, `cy = bar.y`
- Taille de police : `min(w * 0.35, 16)px sans-serif`

**Donut**
- Itère sur `chart.getDatasetMeta(0).data`
- Angle de l'arc : `arc.endAngle - arc.startAngle`
- Si angle `< 0.35 rad` (~20°) → skip
- Position : midpoint de l'arc à `(innerRadius + outerRadius) / 2`
- `cx = arc.x + cos(midAngle) * r`, `cy = arc.y + sin(midAngle) * r`
- Taille : 16px fixe
- Icône : `(ds._catNames || [])[i]` → `catIcon()`

### Lookup de l'icône
Les datasets reçoivent un champ custom non rendu par Chart.js :
- `_catName: rawCatLabel` (string) sur les datasets barres
- `_catNames: [rawCatLabel, ...]` (tableau) sur le dataset unique du donut

`catIcon()` existe déjà en ligne ~2657.

### Datasets à modifier

| Graphique | Lieu dans le code | Champ ajouté |
|---|---|---|
| Empilé/Groupé | `displayData.datasets` (ligne ~5003) | `_catName: ds.label` (avant `catDisplay`) |
| Classement détaillé | datasets dans `type === 'ranking'` (ligne ~4922) | `_catName: ds.label` |
| Donut | dataset unique (ligne ~4875) | `_catNames: segLabels` (les noms bruts avant `catDisplay`) |

### Ajout du plugin aux appels `new Chart()`

| Graphique | Tableau `plugins:` actuel | Ajout |
|---|---|---|
| Empilé/Groupé | `[totalsPlugin, buildCustomTooltipPlugin()]` | `buildEmojiOverlayPlugin()` entre les deux |
| Classement détaillé | `[buildCustomTooltipPlugin()]` | idem |
| Donut | `[centerPlugin, buildCustomTooltipPlugin()]` | idem |

---

## Composant 2 — Tooltip enrichi

### Modification de `buildCustomTooltipPlugin()`

Dans la boucle `tooltip.dataPoints.forEach(dp => {...})`, remplacer le dot coloré par un badge emoji quand disponible.

**Résolution de l'icône :**
```
icon = dp.dataset._catName  ? catIcon(dp.dataset._catName)
     : dp.dataset._catNames ? catIcon(dp.dataset._catNames[dp.dataIndex])
     : ''
```

**Rendu conditionnel :**
- Si `icon` non vide : créer un `<span class="ctt-emoji-badge">` avec `background = color` et `textContent = icon`
- Sinon : créer le `<span class="ctt-dot">` existant

### Nouveau style CSS — `.ctt-emoji-badge`
```css
.ctt-emoji-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 13px;
  flex-shrink: 0;
}
```

---

## Composant 3 — Filigrane modifiable (export)

### `exportOpts`
Ajouter le champ `watermarkText: 'Tops des Tops'`.

### Modale d'export — groupe "Contenu avancé"

Remplacer la checkbox seule "Filigrane" par un bloc :
1. Checkbox "Filigrane" (toggle on/off, inchangé)
2. `<input type="text">` visible seulement quand `exportOpts.watermark === true`
   - Placeholder : `"Tops des Tops"`
   - Valeur initiale : `"Tops des Tops"`
   - `input` event → `exportOpts.watermarkText = value.trim() || 'Tops des Tops'` + `updatePreview()`
   - Quand la checkbox est décochée : masquer l'input (mais conserver la valeur)

### `buildInfographicCanvas()`

Remplacer les deux textes hardcodés :
- Ligne 5201 : `'Tops des Tops'` → `opts.watermarkText || 'Tops des Tops'`
- Ligne 5409 : `'TOPS DES TOPS'` → `(opts.watermarkText || 'Tops des Tops').toUpperCase()`

Le footer (ligne 5397) n'est pas un filigrane — il reste inchangé.

---

## Gestion des cas limites

| Cas | Comportement |
|---|---|
| Catégorie sans icône (`c.icon` vide) | `catIcon()` retourne `''` → plugin skip → tooltip affiche dot classique |
| Barre trop petite (< seuil) | Plugin skip → tooltip gère la disambiguation |
| Arc trop petit (< 20°) | Plugin skip → tooltip title affiche le nom avec emoji |
| Watermark text vide | Fallback sur `'Tops des Tops'` |
| Dataset sans `_catName` (courbes, classement simple) | `catIcon(undefined)` retourne `''` → comportement inchangé |

---

## Fichiers modifiés

- `Index.html` uniquement (GAS monofichier)

## Sections modifiées dans `Index.html`

1. `<style>` — ajout `.ctt-emoji-badge`
2. `buildCustomTooltipPlugin()` — badge emoji conditionnel
3. Nouvelle fonction `buildEmojiOverlayPlugin()`
4. `renderChart()` — 3 endroits : datasets empilé/groupé, donut, classement détaillé
5. `openExportModal()` — input watermark text
6. `buildInfographicCanvas()` — 2 lignes remplacées
