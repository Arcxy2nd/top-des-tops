# Nouveaux outils (maintenance + analyse)

## Contexte

L'onglet 🔧 Outils vient d'être restructuré en cartes repliables, une par outil (santé/nettoyage, lots répartis, groupes hérités, points automatiques). Ce spec ajoute sept nouveaux outils suivant exactement le même patron visuel et technique, répartis en deux familles : maintenance (détection + action de correction) et analyse (lecture seule, informatif).

## Objectif

- Deux outils de maintenance : doublons probables, scores aberrants.
- Cinq outils d'analyse : joueurs inactifs, records, tendances, jour le plus actif, duo le plus fréquent.
- Chacun est une carte `.card.card-collapsible` indépendante dans `#stab-tools`, avec son propre endpoint backend.

## Architecture commune

- **Backend** : une fonction `apiXxx()` par outil dans `Code.gs`, qui lit `History` une fois (réutilise `StorageService._parseHistoryRow` / le pattern de cache déjà utilisé par `apiDetectDistributedLots`/`apiDetectLegacyGroups` — cache invalidé à chaque écriture, recalculé au scan suivant) et retourne `{ success: true, ...résultat }`.
- **Frontend** : chaque carte a un bouton "🔍 Scanner"/"🔄 Actualiser" qui appelle son endpoint et rend la liste de résultats dans un `<div class="detect-results">` (ou équivalent pour les analyses, voir plus bas), suivant le style déjà en place (`.detect-lot-head`, pastilles catégorie/joueur, avatars obligatoires).
- Les outils de **maintenance** ajoutent une action de correction + un mécanisme "Ignorer" persistant en `localStorage`, identique au pattern déjà utilisé pour les lots répartis/groupes hérités (`tdt_dismissed_*`).
- Les outils d'**analyse** n'ont pas d'action de correction : juste un scan/actualisation et un affichage. Pas de mécanisme d'ignorer (rien à corriger).
- Tests : chaque nouvelle fonction backend reçoit un test dans `tests/` sur le modèle de `tests/audit.test.js`/existing detection tests (jeu de données construit à la main, vérifie la détection et les cas limites — liste vide, un seul joueur, etc.).

## Outils de maintenance

### 1. Doublons probables

- **Détection** (`apiDetectDuplicates`) : regroupe les entrées `History` par (joueur, catégorie, date exacte, points, description) strictement identiques. Un groupe de 2+ lignes = doublon suspect.
- **Affichage** : une carte par groupe de doublons — avatar/nom joueur, pastille catégorie, points, description, nombre de copies détectées.
- **Actions** :
  - "Supprimer les copies en trop" — garde la première entrée (la plus ancienne par `rowIndex`), supprime les autres. Confirmation modale avant suppression (comme les autres suppressions de l'app).
  - "Ignorer" — mémorise la signature du groupe (même logique que `tdt_dismissed_lots`), ne réapparaît plus au scan suivant.

### 2. Scores aberrants

- **Détection** (`apiDetectOutlierScores`) : pour chaque catégorie ayant au moins 5 entrées valides, calcule moyenne et écart-type des points. Signale toute entrée dont les points dépassent moyenne + 3×écart-type (et qui n'est pas déjà à l'intérieur d'un lot réparti/groupé, pour éviter les faux positifs sur les totaux de lots).
- **Affichage** : une ligne par entrée suspecte — avatar/nom joueur, pastille catégorie, points de l'entrée vs moyenne de la catégorie ("+850 pts, moyenne du Top : 45 pts"), date.
- **Actions** :
  - "Corriger" — ouvre directement la modale d'édition d'entrée déjà existante (`openFullEditHistoryModal(log)`, `Index.html:8734`), pré-remplie sur cette ligne.
  - "Ignorer" — mémorise le `rowIndex` en localStorage, ne réapparaît plus.

## Outils d'analyse

### 3. Joueurs inactifs

- **Calcul** (`apiGetInactivePlayers`) : pour chaque joueur, date de la dernière entrée dans `History`. Trie du plus inactif au moins inactif, exclut les joueurs sans aucune entrée (affichés séparément comme "jamais actifs").
- **Affichage** : liste avatar + nom + "dernière activité il y a N jours" (ou date si > 60 jours). Seuil de mise en avant visuelle (couleur d'alerte) configurable, par défaut 14 jours.

### 4. Records

- **Calcul** (`apiGetRecords`) : par joueur — plus gros score en une seule entrée (hors lots regroupés, ou total du lot si groupé), plus longue série de jours consécutifs avec au moins une entrée. Un record absolu (tous joueurs confondus) mis en avant en haut.
- **Affichage** : carte "Record absolu" en haut, puis une ligne par joueur avec ses deux records personnels.

### 5. Tendances

- **Calcul** (`apiGetTrends`) : compare les 30 derniers jours à la période équivalente précédente (jours 31 à 60). Pour chaque catégorie : variation en % du nombre d'entrées. Pour chaque joueur : variation en % de ses points par rapport à sa propre moyenne historique ("en forme" si en hausse significative).
- **Affichage** : deux listes séparées (catégories en hausse/baisse, joueurs en forme), pastille verte/rouge selon le sens de la variation.

### 6. Jour le plus actif

- **Calcul** (`apiGetActiveDayOfWeek`) : répartition du nombre d'entrées par jour de la semaine sur tout l'historique.
- **Affichage** : simple graphique ou liste à 7 barres (Lun-Dim), jour le plus actif mis en avant.

### 7. Duo le plus fréquent

- **Calcul** (`apiGetTopPlayerCategoryPairs`) : compte les occurrences de chaque paire (joueur, catégorie), classe par fréquence décroissante, top 10.
- **Affichage** : liste classée, avatar joueur + pastille catégorie + nombre d'occurrences.

## Hors périmètre

- Notifications automatiques (ex : alerter quand un joueur inactif dépasse le seuil) — juste un affichage à la demande.
- Personnalisation des seuils par l'utilisateur au-delà des valeurs par défaut citées (peut être ajouté plus tard si demandé).
- Toute action de correction pour les outils d'analyse (ils sont volontairement lecture seule).
- Historisation des scans eux-mêmes dans le Journal d'audit (ces scans ne modifient rien, donc rien à auditer, sauf les actions de suppression/correction des outils de maintenance qui, elles, sont déjà auditées comme toute suppression/édition d'entrée existante).
