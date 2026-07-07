# Tri et réorganisation manuelle des lignes du Constructeur de Lot

## Contexte

Dans l'onglet **✍️ Saisir un Lot**, les lignes (`.entry-row`) sont ajoutées dans `#entryContainer` dans l'ordre de saisie, sans aucun moyen de les réorganiser. Sur un lot avec de nombreuses lignes, il devient difficile de vérifier ou comparer visuellement les entrées d'un même joueur ou d'une même catégorie.

Cette fonctionnalité est **purement visuelle** : elle ne change que l'ordre d'affichage des lignes dans le DOM. Elle n'a aucun impact sur les données envoyées au serveur au moment de la soumission du lot — l'ordre de saisie n'a pas d'incidence fonctionnelle connue côté `StorageService`.

## Objectif

Permettre à l'utilisateur de :
1. Trier les lignes du lot par un critère (Joueur, Catégorie, Points, Date) via des boutons dédiés.
2. Réorganiser les lignes manuellement par glisser-déposer.

## Règles de tri

Chaque critère a un **ordre de priorité fixe** utilisé comme suite de départage : `Joueur → Catégorie → Points → Date`.

Cliquer sur un bouton de critère place ce critère en tête de la chaîne de tri ; les autres critères restent départageurs, dans leur ordre relatif d'origine (moins le critère choisi).

- **Joueur** (primaire) → Catégorie → Points (croissant) → Date
- **Catégorie** (primaire) → Joueur → Points (croissant) → Date
- **Points** (primaire) → Joueur → Catégorie → Date
- **Date** (primaire) → Joueur → Catégorie → Points (croissant)

Comparateurs :
- **Joueur** et **Catégorie** : comparés par leur **position dans la liste déroulante** correspondante (`cachedPlayers` / `cachedCategories`), pas par ordre alphabétique.
- **Points** : comparaison numérique, croissante par défaut.
- **Date** : comparaison chronologique sur la date de début (`.d-start`), croissante par défaut.

Un reclic sur le bouton du critère déjà actif **inverse le sens** de ce critère primaire (les critères de départage restent dans leur sens par défaut, non inversés). Le bouton actif affiche une flèche ↑ (croissant) ou ↓ (décroissant).

## Interface

### Barre de tri

Ajoutée dans `.lot-action-row`, à côté du bouton "＋ Ligne" :

```
[👤 Joueur] [🏷️ Top] [🔢 Points] [📅 Date]
```

- Boutons de type `.secondary.small`, cohérents avec le style existant (`#applyDateAllBtn`, `#lotGroupModeBtn`).
- Le bouton du critère actif porte une classe `.active` + suffixe flèche (`↑`/`↓`).
- Un seul critère actif à la fois (état exclusif, comme les autres toggles du fichier : `pts-toggle-wrap`, `seg-toggle`).

### Poignée de glisser-déposer

- Un handle `⠿` ajouté en début de chaque `.entry-row` (avant l'avatar de fond, dans le flux visuel), `cursor: grab`.
- Drag & drop HTML5 natif (`draggable="true"`, événements `dragstart`/`dragover`/`drop`/`dragend`) — pas de dépendance externe, conforme à la contrainte "pas de dépendances npm" du projet.
- Pendant le drag : la ligne source passe en opacité réduite ; une ligne insérée en surbrillance indique la position de dépôt (pattern déjà utilisé pour les autres feedbacks visuels du fichier, ex. `row-removing`).
- Dès qu'un drag aboutit à un déplacement réel, l'état "critère actif" de la barre de tri est réinitialisé (aucun bouton actif) — l'ordre devient "manuel".

## Comportement avec les lignes groupées

Les lignes marquées `lot-group-selectable` / `lot-group-selected` (mode groupement) restent chacune une ligne indépendante du point de vue tri/drag : le tri et le drag opèrent sur l'ensemble des `.entry-row` sans traitement spécial pour les lignes groupées. Le mode groupement (`lotGroupModeBtn`) et le tri/drag sont des fonctionnalités indépendantes qui ne s'excluent pas mutuellement.

## Portée technique

- Nouvelles fonctions dans la section `// ── SAISIE LOT ──` de `Index.html` :
  - `sortEntryRows(criterion)` — extrait les `.entry-row` de `#entryContainer`, les trie selon la chaîne de comparateurs, les réinsère dans l'ordre trié.
  - Comparateurs unitaires pour Joueur, Catégorie, Points, Date, réutilisant `cachedPlayers` / `cachedCategories` pour la position de liste.
  - Gestion du handle de drag (`dragstart`, `dragover`, `drop`, `dragend`) attachée à chaque ligne dans `addEntryRow()`.
  - Réinitialisation visuelle de l'état actif des boutons de tri au drop.
- Aucun changement backend (`Code.gs`), aucun changement de format de données soumis au serveur.
- Pas de nouveaux tests unitaires requis (le projet n'a pas de dossier `tests/` — moins de 3 modules, cf. `règles.md`) ; validation manuelle en local suffisante.

## Hors périmètre

- Pas de persistance de l'ordre trié/manuel entre rechargements de page (l'ordre est réinitialisé si la page est rechargée, comme le reste de l'état du lot en cours).
- Pas de tri multi-critères combiné choisi par l'utilisateur au-delà de la chaîne fixe définie ci-dessus.
