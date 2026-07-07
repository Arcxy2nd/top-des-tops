# Design — Détection des groupes hérités cassés + refonte de l'outil de lots répartis

**Date :** 2026-07-08

## Contexte

Avant la correction du 2026-07-07 (`[[../plans/2026-07-07-corrections-rapides.md]]`), les identifiants de groupe créés depuis "Saisir un Lot" étaient générés par un compteur client remis à zéro à chaque envoi (`'G' + lotGroupSeq`). Deux lots totalement différents, saisis séparément, pouvaient donc recevoir le même identifiant court (`G1`, `G2`…) et apparaître fusionnés à tort dans l'Historique. La correction empêche que ça se reproduise, mais ne répare pas les groupes déjà créés avant elle. Ce chantier ajoute un outil pour les retrouver, et améliore au passage l'outil existant de détection de lots répartis qui vit dans la même zone de l'app (Paramètres → Outils).

## Périmètre

Deux outils, dans la même zone de l'interface, livrés ensemble :

1. **Nouveau** : détection des groupes hérités suspects (identifiants courts de l'ancien système).
2. **Amélioration** : l'outil existant "🔗 Regrouper les lots répartis".

---

## 1. Détection des groupes hérités suspects

### Backend

Nouvelle fonction `apiDetectLegacyGroups()` dans `Code.gs`, suivant le même schéma de cache que `apiDetectDistributedLots` (clé versionnée sur `_logsVersion()`, via `StorageService.getFullHistoryRowsCached()` déjà en place) :

- Parcourt toutes les lignes ayant un `groupId` non vide.
- Ne retient que les `groupId` correspondant au format de l'ancien système : `/^G\d{1,6}$/` (un `G` suivi uniquement de chiffres, court). Les identifiants générés par la correction actuelle (`'G' + Date.now() + '_' + random`) ne matchent jamais ce format — aucun faux positif possible sur ce critère.
- Pour chaque `groupId` suspect, renvoie : la liste de ses entrées (joueur, catégorie, points, description, date, rowIndex), le nombre de joueurs distincts, le nombre de catégories distinctes, l'écart en jours entre la première et la dernière date.
- Trie les résultats en mettant en premier les groupes les plus susceptibles d'être de vraies collisions (le plus de joueurs/catégories distincts d'abord — un groupe à un seul joueur/une seule catégorie est plus probablement un groupe manuel légitime de l'époque, mais reste listé pour que l'utilisateur tranche).

### Frontend

Nouvelle section dans Paramètres → Outils, juste après "Regrouper les lots répartis" : **"⚠️ Groupes hérités à vérifier"**.

- Bouton "🔍 Scanner les groupes hérités" (même pattern que l'outil existant).
- Aucun résultat → message "Aucun groupe hérité suspect détecté. Tout est propre ✅".
- Pour chaque groupe suspect : une ligne résumé repliée par défaut — `"3 joueurs · 2 Tops · étalé sur 14 jours"` + une case à cocher. Un clic déplie le détail : chaque entrée du groupe avec avatar du joueur, pastille colorée du Top, points, date.
- Case "Tout sélectionner" + bouton unique **"Dissocier la sélection"** (réutilise l'endpoint existant `apiUngroupLot`, un appel par groupe sélectionné). Confirmation avant action (`openConfirmModal`), comme pour l'outil existant. Aucune action n'est déclenchée automatiquement à la détection — l'utilisateur choisit groupe par groupe.
- Après dissociation, la liste se rafraîchit (les groupes traités disparaissent) et l'Historique est rechargé s'il est visible.

---

## 2. Amélioration de l'outil "Regrouper les lots répartis"

**Constat (relecture du code existant) :** l'outil affiche aujourd'hui le nom du joueur en texte brut (`<strong>Nom</strong>`), sans avatar — ce qui contrevient à la règle UX déjà appliquée partout ailleurs dans l'app ("avatar obligatoire dès qu'un joueur est mentionné", `context.md`). La catégorie est aussi en texte brut, sans la pastille colorée + emoji utilisée dans l'Historique.

**Fixes retenus :**
1. Ajouter l'avatar du joueur devant son nom dans chaque ligne de lot détecté (aligne l'outil sur la règle déjà en vigueur partout ailleurs — pas une nouvelle fonctionnalité, une mise en conformité).
2. Remplacer le texte brut de la catégorie par la même pastille colorée + emoji que l'Historique (`categoryColor`, `catIcon`, déjà disponibles).
3. Ajouter un bouton "Ignorer ce lot" par résultat détecté : les lots ignorés ne réapparaissent plus aux scans suivants. Mémorisé côté client dans `localStorage` (clé `tdt_dismissed_lots`), signature = liste triée des `rowIndexes` du lot (stable tant que les lignes ne bougent pas ; si les lignes changent, le lot n'est de toute façon plus le même et doit pouvoir réapparaître).

**Hors scope :** changement de la logique de détection elle-même (fenêtre de 7 jours, minimum 3 entrées) — non demandé, fonctionne déjà correctement. Pagination — le volume de lots détectés reste faible en pratique (YAGNI).

---

## Vérification

- Aucune migration de données : les groupes hérités détectés restent inchangés tant que l'utilisateur ne clique pas explicitement sur "Dissocier".
- Nouveaux tests Node (`tests/cache.test.js` ou nouveau fichier) pour `apiDetectLegacyGroups` : détecte bien un `groupId` court (`G3`) et ignore un `groupId` long (format actuel) ou vide.
- Vérification manuelle en navigateur pour l'affichage (avatars, pastilles, dépli/repli, dissociation, "ignorer ce lot" qui persiste après rechargement de la page).
- Aucun changement de `AutoPoints.gs`.
