# Spec — Édition groupée Historique + Sélecteurs visuels riches
Date : 2026-06-28

---

## 1. Édition groupée dans l'Historique

### Contexte
Le mode sélection dans l'onglet Historique permet aujourd'hui uniquement d'appliquer une description en masse (`apiUpdateBulkDescription`). Le reste de la barre (`histBulkBar`) expose : compte de sélection, input description, tout sélectionner, grouper, supprimer, annuler.

### Ce qui change
Un bouton **✏️ Modifier la sélection** s'ajoute dans `histBulkBar`, à gauche du bouton Grouper. Il ouvre une modale d'édition groupée.

### Comportement de la modale

**Analyse des valeurs sélectionnées :**  
Avant d'afficher la modale, on lit les données des lignes sélectionnées depuis `histVisibleRows` (le tableau en mémoire de la page courante). Pour chaque champ (date, points, joueur, top, description, saiseur) :
- Si toutes les valeurs sont identiques → champ pré-rempli.
- Si au moins deux valeurs diffèrent → champ en état "mixte".

**État mixte d'un champ :**
- Placeholder : `— Valeurs mixtes —`
- Style visuel distinctif : fond légèrement teinté (ex. `rgba(var(--accent-rgb), 0.08)`), bordure en pointillés.
- Flag interne `_mixed = true` sur le champ.
- L'utilisateur peut cliquer/interagir pour sortir de l'état mixte et saisir une valeur commune.
- Si le champ reste en état mixte à la sauvegarde → ce champ est **omis** du payload, les valeurs originales de chaque ligne sont preservées.

**Champs de la modale (identiques à `openFullEditHistoryModal`) :**
- Date (input type date)
- Points (input number)
- Joueur (RichSelect type `player`)
- Top (RichSelect type `category`)
- Description (input text)
- Saiseur (RichSelect type `saiseur`, nullable)

**Sauvegarde :**
- Confirmation : "Modifier N entrée(s) ?"
- Payload envoyé : uniquement les champs non-mixtes (ou sortis de l'état mixte).
- Appel backend : `apiUpdateBulkEntries(rowIndexes, fields)` — nouvelle fonction.
- `fields` est un objet partiel : seuls les champs à écrire sont présents.
- En cas de champs obligatoires manquants (joueur, top, date, points) et en état mixte → ce n'est pas une erreur, on saute ce champ. Les contraintes s'appliquent uniquement si l'utilisateur a explicitement modifié le champ.

**Suppression du champ description dans histBulkBar :**  
L'input description + bouton "Appliquer" existants dans `histBulkBar` sont **remplacés** par le bouton "✏️ Modifier la sélection". L'édition de description passe par la nouvelle modale groupée.

### Backend — nouvelle fonction `apiUpdateBulkEntries`

```
apiUpdateBulkEntries(rowIndexes, fields)
  fields = objet partiel, ex. { description: "foo", saiseur: "Alice" }
  Pour chaque rowIndex :
    Lit la ligne actuelle depuis le sheet
    Merge avec les fields fournis
    Écrit les colonnes concernées
  Retourne { success: true }
```

Colonnes affectables : date (col 1), joueur (col 2), catégorie (col 3), points (col 4), description (col 5), saiseur (col 7). Colonne 6 (groupId) toujours intacte.

Validation : si le merge produirait une ligne invalide (joueur vide, top vide, pts < 1), on saute cette ligne et on l'indique dans le résultat (liste des rowIndexes ignorés).

---

## 2. Sélecteurs visuels riches (`RichSelect`)

### Contexte
Les `<select>` HTML natifs ne permettent pas d'afficher avatars ou emojis dans le dropdown ouvert. Les wraps existants (`player-sel-wrap`, `c-sel-wrap`) ajoutent un avatar/pastille à côté du select natif mais le dropdown lui-même reste brut.

### Composant `buildRichSelect(config)`

**Paramètres :**
```js
buildRichSelect({
  type,       // 'player' | 'category' | 'saiseur'
  value,      // valeur initiale (string) ou null
  onChange,   // callback(newValue: string|null)
  nullable,   // bool — ajoute une option "— inconnu —" en tête (pour saiseur)
  mixedState, // bool — affiche le champ en état mixte
})
```

**Rendu HTML généré :**
```
div.rich-select [data-type]
  button.rs-trigger (ouvre/ferme)
    span.rs-thumb   ← avatar img ou pastille couleur
    span.rs-label   ← nom
    span.rs-chevron ← ▾
  div.rs-panel (position absolute, hidden par défaut)
    div.rs-option [data-val] × N
      span.rs-opt-thumb
      span.rs-opt-label
```

**Comportement :**
- Clic sur trigger → toggle `rs-panel` visible.
- Clic sur option → ferme le panel, appelle `onChange(value)`, met à jour le trigger.
- Clic outside (document mousedown) → ferme le panel.
- Escape → ferme le panel.
- Un seul panel ouvert à la fois (fermer les autres quand un s'ouvre).
- État mixte : trigger affiche `— Valeurs mixtes —` sans thumb, fond teinté. Premier clic sur le trigger ou sur une option sort de l'état mixte.

**Rendu par type :**
- `player` : thumb = `<img>` avec avatar URL (via `getAvatarUrl`), couleur de bordure = `playerColor(name)`.
- `category` : thumb = `<span>` emoji via `catIcon(name)` + pastille couleur via `categoryColor(name)`.
- `saiseur` : identique à `player` + option nullable "— inconnu —" (thumb vide).

**Accessibilité minimale :** `role="combobox"` sur le trigger, `role="listbox"` sur le panel, `aria-expanded`.

### Intégration

Remplace les `<select>` natifs dans :
1. `addEntryRow()` — player-sel-wrap et c-sel-wrap : les `<select>` natifs sont remplacés par `buildRichSelect`. La logique de sync avatar/couleur existante est absorbée dans le composant.
2. `openFullEditHistoryModal()` — les 3 selects (joueur, top, saiseur) remplacés par `buildRichSelect`.
3. `openBulkEditModal()` — nouvelle modale, utilise `buildRichSelect` d'emblée.

### CSS

Nouvelles classes dans la section `<style>` de Index.html :
- `.rich-select` — position relative, display inline-flex, full width.
- `.rs-trigger` — bouton pleine largeur, flex, gap, fond var(--bg), bordure var(--border).
- `.rs-trigger.rs-open` — bordure var(--accent).
- `.rs-trigger.rs-mixed` — fond teinté, bordure pointillés.
- `.rs-panel` — position absolute, z-index élevé, fond var(--card-bg), bordure, border-radius, box-shadow, max-height 220px overflow-y auto.
- `.rs-option` — flex, gap, padding, cursor pointer, hover background.
- `.rs-option.rs-selected` — fond accent léger.
- `.rs-thumb` — 24px × 24px, border-radius 50% pour players, 20px × 20px pour catégories.
- `.rs-chevron` — transition rotation 180deg quand panel ouvert.

---

## Ordre d'implémentation

1. Backend : `apiUpdateBulkEntries` dans Code.gs.
2. Frontend CSS : classes `.rich-select`, `.rs-*`.
3. Frontend JS : fonction `buildRichSelect`.
4. Intégration dans `addEntryRow` (saisie lot).
5. Intégration dans `openFullEditHistoryModal`.
6. Modale `openBulkEditModal` + bouton dans `histBulkBar` + retrait de l'input description existant.

---

## Ce qui ne change pas
- Les chips filtres (Dashboard, Historique) — déjà des boutons custom avec avatars, pas touchés.
- L'onglet Notes — chips joueurs déjà custom.
- La logique de sélection/groupement/suppression groupée — inchangée.
- `apiUpdateBulkDescription` — peut rester (utilisé nulle part si on supprime l'input, mais pas de régression à le garder).
