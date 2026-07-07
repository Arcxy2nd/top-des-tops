# Entry Row Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le grid 6-colonnes plat des lignes de saisie lot par un layout 2-niveaux (identité + détails) pour une meilleure lisibilité, sans perdre une seule fonctionnalité.

**Architecture:** Single-file `Index.html`. Modifications CSS (layout `.entry-row`, `.batch-header`) + JS (`addEntryRow` : restructuration DOM avec deux wrappers `.row-top` / `.row-bottom`). Toutes les classes fonctionnelles (`.p-sel`, `.c-sel`, `.custom-pts-in`, `.d-start`, `.d-end`, `.range-cb`, `.line-fill`, `.day-picker-wrap`, `.desc-in`, `.pts-btn`) restent dans le DOM — `submitBulk`, `applyDateAll` et `dupBtn` fonctionnent sans modification.

**Tech Stack:** HTML/CSS vanilla, aucune dépendance nouvelle.

---

## Fichiers concernés

| Fichier | Section | Lignes approximatives |
|---|---|---|
| `Index.html` | CSS — `.entry-row`, `.batch-header`, `.row-desc`, mobile | ~236–280, ~527, ~433–446, ~967–1012 |
| `Index.html` | JS — `addEntryRow`, partie `div.appendChild(...)` | ~3577–3584 |

---

## Layout cible

```
┌─────────────────────────────────────────────────────────────────┐
│ #1  [👤 Alice ▾]        [🎮 Gaming ●]        [42]   [📋] [✕]  │  ← .row-top
│     [5][10][20][50]   [📅 2024-01-15]   [📝 description…]      │  ← .row-bottom
└─────────────────────────────────────────────────────────────────┘
```

Le champ `custom-pts-in` (la valeur numérique) monte dans `.row-top` pour être visible d'un coup d'œil.
Les raccourcis pts, la date et la description descendent dans `.row-bottom`.

---

## Task 1 : CSS — Refondre le layout de `.entry-row`

**Fichier :** `Index.html` — section CSS

### Étape 1 : Remplacer le premier bloc `.entry-row` (grid → flex-column)

Localiser dans le CSS (~ligne 242) :
```css
.entry-row {
  display: grid; grid-template-columns: 1.5fr 1.5fr auto 0.7fr minmax(180px, 1.5fr) auto;
  gap: 10px; align-items: start;
  background: rgba(0,0,0,0.15); padding: 10px;
  border-radius: 8px; border: 1px solid var(--border);
  margin-bottom: 8px; transition: border-color 0.2s;
}
```

Remplacer par :
```css
.entry-row {
  display: flex; flex-direction: column; gap: 8px;
  background: rgba(0,0,0,0.15); padding: 10px;
  border-radius: 8px; border: 1px solid var(--border);
  margin-bottom: 8px; transition: border-color 0.2s;
}
```

### Étape 2 : Mettre à jour `.batch-header` (masquer — le nouveau layout 2-rangées ne s'aligne plus)

Localiser (~ligne 236) :
```css
.batch-header {
  display: grid; grid-template-columns: 1.5fr 1.5fr auto 0.7fr minmax(180px, 1.5fr) auto;
  gap: 10px; padding: 0 10px; margin-bottom: 8px;
  color: var(--text-muted); font-size: 0.78rem; font-weight: 700;
  text-transform: uppercase;
}
```

Remplacer par :
```css
.batch-header { display: none; }
```

### Étape 3 : Ajouter les règles `.row-top` et `.row-bottom`

Après la règle `.entry-row:hover { border-color: var(--accent); }` (~ligne 269), ajouter :
```css
/* ── LAYOUT INTERNE LIGNE ── */
.row-top {
  display: flex; align-items: center; gap: 10px;
}
.row-top .player-sel-wrap { flex: 1; min-width: 0; }
.row-top .c-sel-wrap { flex: 1; min-width: 0; }
.row-top .custom-pts-in {
  width: 64px; flex-shrink: 0;
  text-align: center; font-size: 1rem; font-weight: 800;
  padding: 8px 4px;
  border: 1.5px solid var(--row-accent, var(--border));
  border-radius: 8px; background: var(--bg); color: var(--text);
  transition: border-color 0.2s;
}
.row-top .row-actions { flex-shrink: 0; }

.row-bottom {
  display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
}
.row-bottom .pts-toggle-wrap { flex-shrink: 0; }
.row-bottom .d-cell { flex: 0 0 auto; }
.row-bottom .row-desc { flex: 1; min-width: 120px; margin-top: 0; }
```

### Étape 4 : Supprimer `grid-column: 1 / -1` sur `.row-desc`

Localiser (~ligne 527) :
```css
.row-desc { grid-column: 1 / -1; margin-top: 2px; }
```

Remplacer par :
```css
.row-desc { margin-top: 0; }
```

### Étape 5 : Mettre à jour les overrides mobile (max-width: 640px)

Localiser (~ligne 433) le bloc `@media (max-width: 640px)` qui contient des règles d'entry-row (`.entry-row { ... }`, `.player-sel-wrap`, `.c-sel`, etc.) :

```css
@media (max-width: 640px) {
  .entry-row { 
    /* (des propriétés actuellement présentes) */
  }
  .player-sel-wrap, .c-sel { width: 100%; }
  .pts-toggle-wrap { width: 100%; justify-content: space-between; }
  .entry-row .custom-pts-in { width: 100%; text-align: center; }
  .row-actions { width: 100%; }
}
```

Remplacer ce bloc par :
```css
@media (max-width: 640px) {
  .row-top { flex-wrap: wrap; }
  .row-top .player-sel-wrap,
  .row-top .c-sel-wrap { flex: 1 1 45%; }
  .row-top .custom-pts-in { width: 56px; }
  .row-bottom .pts-toggle-wrap { width: 100%; justify-content: space-between; }
  .row-bottom .row-desc { min-width: 100%; }
  .row-actions { margin-left: auto; }
}
```

---

## Task 2 : JS — Restructurer `addEntryRow` pour les wrappers `.row-top` / `.row-bottom`

**Fichier :** `Index.html` — JS, fonction `addEntryRow` (~ligne 3577)

### Étape 1 : Localiser le bloc d'append existant

Chercher à partir de `// ── Actions` jusqu'à la fin de la fonction :
```javascript
    div.appendChild(wrap);
    div.appendChild(cSelWrap);
    div.appendChild(ptsToggle);
    div.appendChild(customPtsInput);
    div.appendChild(dateCell);
    div.appendChild(actions);
    div.appendChild(descDiv);
    container.appendChild(div);
```

### Étape 2 : Remplacer par la structure 2-rangées

```javascript
    // Rangée principale : joueur, top, valeur pts, actions
    const topRow = document.createElement('div');
    topRow.className = 'row-top';
    topRow.appendChild(wrap);
    topRow.appendChild(cSelWrap);
    topRow.appendChild(customPtsInput);
    topRow.appendChild(actions);

    // Rangée secondaire : raccourcis pts, date, description
    const bottomRow = document.createElement('div');
    bottomRow.className = 'row-bottom';
    bottomRow.appendChild(ptsToggle);
    bottomRow.appendChild(dateCell);
    bottomRow.appendChild(descDiv);

    div.appendChild(topRow);
    div.appendChild(bottomRow);
    container.appendChild(div);
```

---

## Task 3 : Code review — Vérifier toutes les fonctionnalités

**Fichier :** `Index.html` — section JS

### Étape 1 : Vérifier `submitBulk`

`submitBulk` utilise `r.querySelector(...)` sur chaque `.entry-row`. Toutes ces classes sont toujours descendants de `.entry-row` dans le nouveau layout :
- `.p-sel` ✓ (dans `.player-sel-wrap` → `.row-top`)
- `.c-sel` ✓ (dans `.c-sel-wrap` → `.row-top`)
- `.custom-pts-in` ✓ (dans `.row-top`)
- `.d-start`, `.d-end`, `.range-cb`, `.row-range-details`, `.line-fill`, `.day-picker-wrap` ✓ (dans `.d-cell` → `.row-bottom`)
- `.desc-in` ✓ (dans `.row-desc` → `.row-bottom`)

Aucun changement nécessaire.

### Étape 2 : Vérifier `applyDateAllBtn`

`applyDateAllBtn` utilise `row.querySelector('.d-start')`, `.d-end`, `.range-cb`, `.row-range-details`, `.line-fill`. Tous restent dans `.d-cell` → `.row-bottom` → `.entry-row`. ✓

Aucun changement nécessaire.

### Étape 3 : Vérifier `dupBtn` listener

Le listener du bouton dupliquer capture les valeurs via les références locales (`pSel.value`, `cSel.value`, `customPtsInput.value`, `startInput.value`, `rangeCb.checked`, `endInput.value`, `fillToggle.dataset.fill`, `dayPickerWrap.dataset.days`, `descInput.value`). Ces références sont des closures sur les éléments créés dans la même invocation de `addEntryRow` — indépendantes du layout DOM. ✓

Aucun changement nécessaire.

### Étape 4 : Vérifier le mode groupement

Le mode groupement (`enterLotGroupMode`, `onLotGroupRowClick`) ajoute/retire des classes `.lot-group-selectable` et `.lot-group-selected` sur `.entry-row` et lit `r.id`. Rien de lié à la structure interne. ✓

Aucun changement nécessaire.

### Étape 5 : Vérifier `updateLotSummary`

`updateLotSummary` lit `.custom-pts-in` via `r.querySelector('.custom-pts-in')` sur chaque `.entry-row`. Toujours présent dans `.row-top`. ✓

Aucun changement nécessaire.

### Étape 6 : Vérifier l'animation et le badge numéro de ligne

`.entry-row::before` (badge `#1`, `#2`…) est un pseudo-élément sur `.entry-row` — indépendant du contenu interne. ✓
`animation: rowSlideIn` est sur `.entry-row` — inchangé. ✓
`border-left: 4px solid var(--row-accent)` est sur `.entry-row` — inchangé. ✓

### Étape 7 : Contrôle visuel final

Vérifier dans la preview :
1. Ajouter une ligne → layout 2 rangées visible, champs bien placés
2. Modifier le joueur → avatar mis à jour, anneau coloré visible
3. Modifier le Top → pastille couleur mise à jour, bordure gauche change
4. Cliquer [5] [10] → `custom-pts-in` (dans row-top) se met à jour
5. Taper dans `custom-pts-in` → raccourcis surlignent le bon bouton (dans row-bottom)
6. Activer la plage → `row-range-details` s'affiche dans `d-cell`
7. Appuyer sur 📋 Dupliquer → nouvelle ligne avec mêmes valeurs
8. Soumettre le lot → valide et envoie correctement

---

## Self-Review

### Couverture

| Fonctionnalité | Préservée | Mécanisme |
|---|---|---|
| submitBulk lit tous les champs | ✅ | Mêmes classes, même DOM nesting |
| applyDateAll | ✅ | Mêmes classes dans d-cell |
| Dupliquer une ligne | ✅ | Closures indépendantes du layout |
| Groupement de lignes | ✅ | Classes sur .entry-row uniquement |
| updateLotSummary | ✅ | .custom-pts-in toujours accessible |
| Badge #numéro | ✅ | ::before sur .entry-row |
| Animation entrée/sortie | ✅ | Sur .entry-row |
| Bordure gauche colorée | ✅ | --row-accent sur .entry-row |
| Anneau avatar joueur | ✅ | --player-ring sur img.row-avatar |
| Pts shortcuts ↔ input sync | ✅ | Références locales dans closure |
| Mobile | ✅ | Media query mise à jour Task 1 Étape 5 |

### Risques identifiés

- L'override mobile précédent `(.entry-row { ... })` dans le premier bloc `@media (max-width:640px)` doit être retiré entièrement (le `display:grid` overridé n'existe plus). Si ce bloc subsiste avec des `grid-*` règles, elles seraient ignorées (pas de grid), mais cela pollue le CSS. Le plan le remplace proprement.
- La règle `.batch-header { display:none }` remplace une règle existante. Vérifier qu'il n'y en a pas une seconde occurrence (`@media (max-width:640px)` en avait déjà une — pas de conflit, `display:none` est déjà l'état mobile).
