# Dashboard — Graphique principal : interactivité (tooltip riche, drill-down, légende isolable)

**Date** : 2026-07-11
**Statut** : approuvé (session accélérée, validation par sections faite en amont)
**Chantier parent** : Brainstorming Dashboard, composant "Graphique principal + sélecteur de type"

## Contexte

Le Dashboard (`Index.html`, `#tab-dashboard`) affiche un graphique principal (`#mainChart`) avec 6 types
sélectionnables (empilé, groupé, courbes, radar, donut, classement), rendus par `renderChart()`
(Index.html ~5634-5967). Aujourd'hui : tooltip Chart.js par défaut (texte brut), pas de clic pour
approfondir, légende sans isolement pratique. Le mode "Classement" est un canvas custom (pas une
vraie instance Chart.js) avec son propre hit-testing.

## Objectif

Enrichir l'interactivité du graphique principal sur les 6 types, desktop et mobile :
1. Tooltip riche (avatar, nom, valeur, comparaison)
2. Légende isolable (clic = isole une série, reclic = restaure)
3. Clic/tap sur un segment = drill-down vers un modal listant les entrées History concernées, avec édition/suppression rapide

## Architecture retenue

**Module d'interaction partagé** (`ChartInteractions`, nouveau bloc JS dans Index.html, à côté de
`renderChart()`) exposant 3 fonctions réutilisées par les 6 branches de rendu :

- `buildRichTooltipHandler(getContext)` — retourne la config `tooltip: { enabled: false, external: ... }`
  pour Chart.js, qui construit un `<div>` HTML positionné en `position: absolute` au-dessus du canvas
  (pas une image canvas — nécessaire pour afficher un `<img>` avatar).
- `makeLegendIsolatable(chartInstance)` — remplace `legend.onClick` : si un seul dataset est visible et
  que c'est celui cliqué → tout restaurer ; sinon → cacher tous les autres, montrer seulement celui-ci.
  Ne s'applique qu'aux types multi-séries (empilé, groupé, courbes, radar, donut) — pas au Classement.
- `openDrilldownModal(context)` — appelle le nouvel endpoint `apiGetFilteredLogs`, construit la liste
  des entrées dans le modal générique existant (`#modalBackdrop`/`#modalBox`), avec actions rapides.

Le mode Classement (canvas custom, hit-testing déjà maison dans `renderChart()`) branche `buildRichTooltipHandler`
et `openDrilldownModal` directement sur ses gestionnaires de clic existants — pas de légende (une seule série).

### Pourquoi ce découpage plutôt qu'une logique inline par type

Cohérent avec §8 (DRY) du projet : un seul endroit à maintenir, comportement garanti identique sur
les 6 types plutôt que 6 implémentations qui peuvent diverger.

## 1. Tooltip riche

Contenu affiché au survol (desktop) ou 1er tap (mobile) d'une barre/point/segment :
- Avatar du joueur (déjà disponible côté client via les données Sheet chargées)
- Nom du joueur, coloré avec sa couleur définie dans le Sheet
- Valeur brute (points), comme aujourd'hui
- Écart de comparaison avec le joueur au rang immédiatement supérieur/inférieur sur ce même graphique
  (ex. "+12 pts devant Marie"), calculé à partir des données déjà en mémoire pour le rendu — **aucun
  appel serveur supplémentaire**.

Style : reprend les variables CSS existantes (`--card`, `--border`, `--text`, radius 8px, avatar rond
comme partout ailleurs dans l'app — cf. §7 avatar obligatoire).

Cas où la comparaison n'a pas de sens (ex. Radar par catégorie, valeur seule sans classement clair,
ou un seul joueur affiché) : la ligne de comparaison est simplement omise, pas de placeholder vide.

## 2. Légende isolable

Comportement : clic sur un élément de légende → isole cette série (masque toutes les autres) ; reclic
sur la même série (ou sur une série alors qu'une seule est déjà isolée) → restaure l'affichage complet.
S'appuie sur l'API Chart.js standard (`legend.onClick` + `chart.getDatasetMeta(i).hidden`), pas de
composant custom — reste léger.

## 3. Drill-down (clic/tap sur un segment)

**Desktop** : clic direct sur une barre/point/segment ouvre le modal.
**Mobile** : 1er tap affiche le tooltip riche, 2e tap sur le même élément ouvre le modal (cohérent
avec le comportement tactile standard de Chart.js).

### Détermination du contexte cliqué

Selon le type de graphique, le segment cliqué identifie : joueur(s), catégorie(s), et la plage de
dates actuellement appliquée par les filtres croisés du Dashboard (le drill-down n'introduit pas de
nouvelle notion de période — il réutilise `#startDate`/`#endDate` déjà actifs).

### Nouveau endpoint serveur

`apiGetFilteredLogs(players, categories, startDate, endDate)` dans Code.gs, wrapper mince autour de
`StorageService.getFilteredLogs()` (Code.gs:557-569, déjà utilisée en interne par `getFilteredChartData`
et `getTrendData` mais jamais exposée en `api*`). Retourne les entrées brutes (date, player, category,
points, description, rowIndex).

### Contenu du modal

Liste des entrées correspondantes (date, avatar+nom joueur, catégorie, points, description), triées
par date décroissante. Chaque ligne expose :
- **Éditer la description** — réutilise `apiUpdateHistoryDescription` (Code.gs:1671), même pattern
  que l'édition rapide déjà présente ailleurs dans l'app.
- **Supprimer** — réutilise `apiDeleteHistoryEntries` (Code.gs:1466), avec confirmation via
  `openConfirmModal` (pattern existant, Index.html:4849).

Ces deux endpoints sont **déjà** ceux utilisés par l'onglet Historique, qui vient d'être équipé du
Journal d'audit + undo (chantier livré le 2026-07-10). En les réutilisant tels quels depuis le
drill-down, les actions faites depuis ce nouveau modal apparaissent automatiquement dans le Journal
d'audit et sont automatiquement annulables (undo) — sans code supplémentaire à écrire pour ça.

### Cas vide

Si le résultat ne contient aucune entrée (cas limite, ex. donnée supprimée entre le rendu du
graphique et le clic) : message "Aucune entrée trouvée" dans le modal, pas d'erreur bloquante.

## Périmètre

S'applique aux 6 types de graphique (empilé, groupé, courbes, radar, donut, classement), desktop et
mobile (Index.html + Mobile.html, cf. §7 parité mobile).

Sur mobile, le graphique principal est déjà affiché (pas dans un accordéon replié comme les 4 cards
du bas) — les 3 fonctionnalités s'appliquent donc directement sans changement de structure d'accordéon.

## Hors périmètre (pour ce chantier)

- Les 4 cards du bas (Records/Tendances/Jour actif/Duo fréquent), les filtres croisés, et la card
  Commentaires sont des chantiers de brainstorming séparés (à traiter un par un, cf. demande initiale).
- Pas de nouveau filtre de période introduit par le drill-down — il hérite des filtres Dashboard actifs.
- Pas de refonte de la légende en composant HTML custom avec avatars — l'option a été explicitement
  écartée au profit de la légende Chart.js standard rendue isolable.

## Test / vérification

Pas de suite de tests automatisés sur ce projet (cf. §8 contexte). Vérification via `/verify` sur
l'app en dev/déployée : survol et clic sur chaque type de graphique (desktop), tap simple puis double
tap (mobile), édition et suppression depuis le modal de drill-down, vérification que l'action apparaît
dans le Journal d'audit et est annulable.
