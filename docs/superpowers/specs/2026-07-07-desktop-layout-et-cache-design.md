# Design — Exploitation desktop/paysage + cache au chargement (Groupe C)

**Date :** 2026-07-07

## Périmètre

Deux améliorations restantes du Groupe C (le 3e point, interface mobile séparée, a été explicitement écarté par l'utilisateur — l'interface mobile existante en fichier unique avec bascule automatique est conservée telle quelle).

---

## C1. Exploitation de l'écran PC/paysage

**Constat :** `.container` (`Index.html:186`) plafonne tout le contenu à `max-width: 1200px`, centré. Les trois onglets principaux (Dashboard, Saisir un Lot, Historique) empilent leurs cartes verticalement sans jamais utiliser la largeur disponible au-delà de 1200px. Aucune media query `min-width` n'existe aujourd'hui — seule la bascule mobile/desktop pilotée par JS (`data-mode`) existe.

**Fix retenu (scope resserré, YAGNI) :** Sur le Dashboard, les cartes "🔍 Filtres croisés" et "🏆 Total global" (le graphique) sont les deux blocs les plus naturellement complémentaires côte à côte (filtres à gauche, graphique large à droite) — c'est le seul endroit où une disposition à deux colonnes apporte un vrai gain, sans forcer un réagencement artificiel des autres onglets (Saisir un Lot est un constructeur séquentiel, Historique est un tableau plein-largeur — les deux restent inchangés, forcer une 2e colonne y serait un bricolage sans bénéfice réel).

- Envelopper `#filtersCard` et `#chartCard` dans un conteneur `.dashboard-wide-row`.
- `@media (min-width: 1400px)`, uniquement quand `body[data-mode="desktop"]` (jamais en mode mobile forcé, cohérent avec l'architecture existante pilotée par l'attribut plutôt que par la largeur brute) : `.dashboard-wide-row` passe en grille 2 colonnes (`360px` fixe pour les filtres, le reste pour le graphique).
- En dessous de 1400px ou en mode mobile : comportement strictement identique à aujourd'hui (empilement vertical, aucun changement visuel).

**Hors scope :** réagencement de Saisir un Lot et Historique (pas de gain clair identifié) ; augmentation du `max-width` global de `.container` (changerait la densité de tous les onglets, y compris ceux qui n'en profiteraient pas — pas demandé).

---

## C2. Cache au chargement de l'application

**Constat :** Au démarrage (`window.onload`), 3 chaînes d'appels serveur se lancent en parallèle les unes des autres : `loadCustomPhrases` → `apiGetPhrases` (+ `apiGetActivePhrasePreset` en cascade), `loadEntities` → `apiGetSettings` (dont dépendent en cascade `loadBaremeSettings`, `applyFilters`, `loadQuickStats`, `updateHistoryFilters`…), et `loadAppBranding` → `apiGetAppSettings`. Rien n'est mis en cache localement : chaque ouverture de page repart de zéro et attend la réponse serveur avant d'afficher quoi que ce soit (au mieux un squelette de chargement, déjà en place depuis un chantier précédent). `localStorage` n'est utilisé aujourd'hui que pour des préférences légères (thème, identité, mode d'affichage) — jamais pour des données serveur.

**Fix retenu :** Cache "affichage immédiat + rafraîchissement silencieux" (stale-while-revalidate), limité aux deux jeux de données qui conditionnent presque tout le reste de l'interface au démarrage (joueurs/catégories, identité visuelle de l'app) :

1. `loadEntities()` : si un cache `localStorage` (`tdt_cache_settings`) existe, peupler immédiatement `cachedPlayers`/`cachedCategories` et lancer le même rendu qu'un chargement normal (chips, listes, barème, filtres, quick stats…) — l'utilisateur voit une interface fonctionnelle immédiatement, avant même que le serveur ait répondu. L'appel réel à `apiGetSettings` part toujours en parallèle ; à sa réponse, le cache est mis à jour et le rendu est refait avec les données fraîches (silencieusement, sans flash ni indicateur de rechargement — l'utilisateur ne voit qu'une mise à jour transparente si quelque chose a changé entre-temps).
2. `loadAppBranding()` : même principe pour le titre/logo de l'app (`tdt_cache_appsettings`).
3. Si l'appel réseau échoue *après* un rendu depuis le cache, l'interface déjà peinte depuis le cache n'est **pas** effacée (contrairement au comportement actuel qui vide les listes en cas d'échec — ce nettoyage n'a de sens que quand rien n'était encore affiché).

**Hors scope :** mise en cache de l'Historique/Notes/Barème/Phrases au démarrage — ces zones ont déjà leur propre squelette de chargement et un cache serveur (`CacheService`) mis en place lors d'un chantier précédent (voir `docs/superpowers/plans/2026-07-01-progressive-loading-plan.md`) ; les dupliquer côté client apporterait un gain marginal pour une complexité disproportionnée (YAGNI). Aucune expiration de cache n'est ajoutée : le cache est toujours revalidé à chaque chargement de page (pas de risque de données figées indéfiniment).

---

## Vérification

- C1 : vérifiable visuellement en redimensionnant le navigateur au-dessus/en-dessous de 1400px (mode desktop), et en forçant le mode mobile via le bouton existant pour confirmer qu'aucune grille ne s'applique.
- C2 : vérifiable en rechargeant la page deux fois de suite — au 2e chargement, les joueurs/catégories doivent apparaître instantanément (avant la fin de l'appel réseau), et rester affichés même si le réseau est coupé.
- Aucun changement de `Code.gs`/`AutoPoints.gs`. Purement `Index.html`.
