# Chargement progressif & feedback de chargement — Design

Date : 2026-07-01

## Contexte

Audit complet de tous les `callServer()` de `Index.html` (voir tableau ci-dessous) : la
plupart des zones de l'app n'ont aucun indicateur pendant l'attente réseau — le tableau
ou la carte reste vide jusqu'à l'arrivée de la réponse. L'Historique, en particulier, relit
l'intégralité de la feuille `History` côté serveur à chaque changement de page ou de filtre,
alors que la réponse renvoyée ne contient que la page demandée.

Avec des milliers d'entrées dans `History`, ce coût de lecture répétée devient perceptible.

## Périmètre couvert

| Zone | Appel(s) concerné(s) | État actuel |
|---|---|---|
| Dashboard — Quick Stats | `apiGetQuickStats` | Aucun feedback |
| Dashboard — Card Commentaires | `apiGetActivePhrasePreset`, `apiGetPhrases` | Aucun feedback |
| Historique — tableau | `apiGetHistoryPage` | Tableau vide + relecture complète du sheet à chaque appel |
| Notes | `apiGetAllNotes` | Aucun feedback |
| Paramètres → Entités | `apiGetSettings` | Aucun feedback |
| Paramètres → Phrases/Presets | `apiGetPhrases`, `apiSavePhrasesBatch` (seed) | Aucun feedback |
| Outils → Rapport de santé | `apiGetDataHealth` | Skeleton ad hoc déjà présent |
| Outils → Lots répartis | `apiDetectDistributedLots` | Aucun feedback, relecture complète à chaque clic |
| Saisie de lot — drawer Barème | `apiGetBareme` | Aucun feedback |
| Bandeau logo/titre | `apiGetAppSettings` | Aucun feedback |
| Dashboard — Graphique | `apiGetTrendData`/`apiGetPlayerTotals`/`apiGetFilteredData` | Skeleton ad hoc déjà présent |
| Paramètres → Barème | `apiGetBareme` | Skeleton ad hoc déjà présent |

Les 3 zones "skeleton ad hoc déjà présent" sont migrées vers le composant générique pour
l'uniformité visuelle (une seule classe CSS `.skeleton`, un seul point d'ajustement).

## 1. Composant skeleton générique (frontend)

Deux fonctions utilitaires ajoutées à `Index.html`, réutilisant la classe CSS `.skeleton`
déjà définie (shimmer animé) :

```js
// Injecte N blocs .skeleton dans container, remplace tout contenu existant.
function showSkeleton(container, opts) // opts: { rows = 3, height = 60 }

// Pas de fonction hideSkeleton dédiée : le rendu du contenu réel (innerHTML remplacé
// par renderXxx()) évacue naturellement le skeleton — cohérent avec le pattern déjà
// utilisé par chartSkeleton/health-stat (display toggle géré au niveau du callback).
```

Chaque site d'appel listé au périmètre appelle `showSkeleton(container, {...})` juste avant
son `callServer`, avec un nombre de lignes/hauteur adapté à la zone (ex: 1 ligne haute pour
Quick Stats, 3-5 lignes courtes pour un tableau).

Les 3 skeletons ad hoc existants (`chartSkeleton`, `bareme-skel`, `health-stat`) sont
réécrits pour appeler `showSkeleton` au lieu de leur `innerHTML` répété inline — même
rendu visuel, un seul générateur.

## 2. Cache backend unifié (Code.gs)

Le pattern existant de `StorageService.getAllLogs()` est réutilisé tel quel : `_logsVersion()`
est déjà incrémentée par `withLock()` à *chaque* mutation, tous services confondus. C'est
une clé de version globale déjà fiable et déjà en place — aucune nouvelle mécanique
d'invalidation à inventer.

Trois nouveaux caches `CacheService`, même durée de vie (10 min) et même limite de taille
(~95KB) que `getAllLogs` :

- **Lignes History complètes** — nouvelle méthode `StorageService._readFullHistoryRowsCached()`,
  clé `hist_full_v<version>`. Contient les 7 champs (date, joueur, catégorie, points,
  description, groupId, saiseur) + rowIndex, contrairement au cache de `getAllLogs` qui
  n'a que 4 champs. `getHistoryPage` l'utilise à la place de sa lecture directe du sheet.
- **Rapport de santé** — `apiGetDataHealth`, clé `health_v<version>`.
- **Détection de lots répartis** — `apiDetectDistributedLots`, clé `lots_v<version>`.

Toute écriture (ajout, suppression, édition, regroupement, ungroup, changement de couleur,
etc. — tout ce qui passe par `withLock`) invalide les trois automatiquement au prochain
appel. Aucune donnée périmée ne peut être servie plus de le temps d'une requête suivant
l'écriture.

## 3. Préchargement de la page suivante (Historique)

Dès que `_doLoadHistoryPage(page)` termine son rendu, un appel silencieux (sans skeleton,
sans toast d'erreur visible) est lancé pour `page + 1` avec les mêmes filtres. Le résultat
est stocké dans une Map côté client `histPrefetchCache` (clé = `page|joueurs|catégories|texte`).

Quand l'utilisateur navigue vers la page suivante, `loadHistoryPage` vérifie d'abord cette
Map : présent → rendu immédiat, aucun `callServer`, aucun skeleton. Absent → comportement
normal (skeleton + appel).

La Map est vidée :
- à chaque changement de filtre (joueur/catégorie/texte) ou de page hors séquence (retour
  arrière, saut de page) — le préchargement ne couvre que "la page juste après celle qu'on vient
  d'afficher" ;
- après toute mutation qui recharge déjà la page 1 (suppression, groupement, etc.).

## 4. Tests

Conforme à la contrainte du projet (GAS non exécutable en local, harnais VM Node) :

- `node --check` sur le script extrait de `Index.html` (validation de syntaxe uniquement,
  pas de test comportemental côté frontend possible hors navigateur).
- `npm test` : nouveaux tests dans `tests/cache.test.js` (ou fichier dédié) suivant le style
  déjà en place :
  - 1er appel à `getHistoryPage`/`apiGetDataHealth`/`apiDetectDistributedLots` peuple le cache ;
  - 2e appel identique sert depuis le cache sans relire le sheet (vérifié via un espion sur
    `getRange`/`getValues`) ;
  - une mutation (ex: `apiDeleteHistoryEntries`) invalide le cache — l'appel suivant relit
    le sheet et reflète le changement.

## Hors périmètre

- Pas de vraie pagination côté Sheet (lecture d'une tranche seulement) : casserait le
  regroupement par lots et les filtres croisés qui doivent voir toute la table. Disproportionné
  pour une échelle de "milliers" d'entrées (pas dizaines de milliers).
- Pas de préchargement généralisé à toutes les autres zones (Notes, Paramètres, etc.) — ce
  sont des chargements uniques par ouverture d'onglet, pas une pagination répétée comme
  l'Historique. Le skeleton seul suffit là.
