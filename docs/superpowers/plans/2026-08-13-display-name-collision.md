# Note pour la prochaine session — collision d'affichage sur noms en double

**Statut : pas commencé.** Point 3 du signalement du 2026-08-13 (doublon "Ilker") — seul le côté écriture a été traité (voir commit `60447e8`, CHANGELOG v3.15.0). Le côté affichage reste ouvert.

## Le problème

`playerColor(name)`, `categoryColor(name)`, `getAvatarUrl(name, meta)` et tout lookup équivalent dans `Index.html` retrouvent un joueur/Top **par son nom**, pas par `rowIndex`. Avec deux lignes homonymes, ces fonctions renvoient toujours les infos de la **première** ligne trouvée — partout où l'app affiche un nom hors de la liste Paramètres (tchat, dashboard, notes, historique, filtres, mentions). Les deux homonymes sont donc visuellement indissociables partout ailleurs, même si Paramètres les distingue déjà correctement (rowIndex, depuis v3.15.0).

## Pourquoi ce n'est pas déjà fait

Contrairement au correctif déjà livré (couleur/ordre/renommage — 2-3 points d'entrée bien identifiés), ce problème touche potentiellement des dizaines d'appels dans `Index.html` (tchat, dashboard, notes, historique...). Et surtout : `History`/`Notes`/`Chat` stockent le nom du joueur **en texte**, sans colonne d'identifiant — il n'existe pas de `rowIndex` à faire circuler jusque dans ces feuilles pour distinguer laquelle des deux entités a produit une entrée donnée. Le problème n'est donc pas purement du refactor : une partie est structurellement irrésolvable sans changer le schéma des feuilles.

## Piste si on la reprend

1. Lister par grep tous les appels `playerColor(`/`categoryColor(`/`getAvatarUrl(` dans `Index.html` (exhaustivité, §7 context.md).
2. Décider jusqu'où aller : probablement pas la peine de threader `rowIndex` partout — la vraie solution durable reste que l'utilisateur élimine le doublon à la main dans le Sheet (déjà recommandé). Le renommage automatique reste refusé par design (risque de fusion d'historique, voir §7 incident joueur perdu).
3. Alternative plus légère : dans Paramètres → Outils → Santé (déjà modifié pour signaler les doublons), ajouter un lien/bouton qui explique concrètement la conséquence visuelle (pas juste "noms en double" mais "ces deux-là partagent la même couleur/avatar partout hors Paramètres tant que non résolu").

Avant de coder quoi que ce soit ici : `/superpowers:brainstorming` (nouvelle feature/portée à cadrer), puis `/superpowers:writing-plans` une fois la portée validée.
