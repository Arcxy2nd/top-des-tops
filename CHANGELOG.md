# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com).

## [Non publié] - 2026-07-09

### Ajouté
**Humanisé** : Sept nouveaux outils dans l'onglet 🔧 Outils : détection des doublons et des scores anormaux (avec correction ou "ignorer" en un clic), liste des joueurs inactifs, records personnels et absolu, tendances récentes par Top et par joueur, jour de la semaine le plus actif, et duo joueur/Top le plus fréquent.
**Technique** : 7 nouvelles fonctions backend (`apiDetectDuplicates`, `apiDetectOutlierScores`, `apiGetInactivePlayers`, `apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`) réutilisant `StorageService.getFullHistoryRowsCached()`. Détection des scores aberrants par médiane/écart absolu médian plutôt que moyenne/écart-type (une aberration fausse sa propre moyenne sur un petit échantillon). 8 nouveaux tests (`tests/outils-nouveaux.test.js`).

**Humanisé** : Possibilité de cocher plusieurs cases rapidement en cliquant-glissant dessus (souris ou tactile), sans avoir besoin du clavier — disponible dans l'Historique et les outils de détection.
**Technique** : `enableDragMultiSelect(container, selector)`, délégation d'événements `mousedown`/`mouseover`/`touchmove`, appliqué à `#historyTableBody`, `#detectResults`, `#detectLegacyResults`.

### Modifié
**Humanisé** : L'onglet Outils affichait tout empilé sans fin. Chaque outil a maintenant sa propre carte qu'on peut replier, comme sur le Dashboard.
**Technique** : Chaque section de `#stab-tools` devient un `.card.card-collapsible` avec `makeCollapsible(...)`.

**Humanisé** : Le Journal d'audit avait une liste d'actions filtrables qui n'était plus à jour (deux actions récentes manquaient, une autre n'existait plus) — les clics sur ces filtres ne faisaient donc rien. Elle se construit maintenant automatiquement à partir des actions réellement enregistrées. Les changements de couleur affichent maintenant une pastille de la couleur plutôt qu'un code brut illisible.
**Technique** : `apiGetAuditActionTypes()` remplace la liste `<option>` figée dans le HTML. `auditDiffValue()` détecte les valeurs hexadécimales et ajoute un `.audit-color-dot`.

**Humanisé** : Refonte complète de l'interface mobile : plus de bande fixe en haut de l'écran, remplacée par un rail de navigation vertical sur la gauche, replié en icônes par défaut, qui s'étend par-dessus le contenu au clic.
**Technique** : `Mobile.html` — `.m-side-nav` remplace `.m-header` + `.m-bottom-nav`. `renderSideNav()` remplace `renderBottomNav()`.

**Humanisé** : Nettoyage de la version PC — elle contenait encore tout un mode d'affichage mobile (menu tiroir, réagencement des tableaux en cartes) devenu inutile depuis que la vraie version mobile dédiée existe.
**Technique** : Retrait de `.mobile-drawer`, `#drawerNavList`, `body[data-mode="mobile"]` et de tout le JS associé (`openDrawer`/`closeDrawer`) dans `Index.html`.

### Corrigé
**Humanisé** : Certains menus déroulants (dans les fenêtres d'édition) pouvaient déborder de la fenêtre et refermer toute la fenêtre par erreur au clic. Les fenêtres elles-mêmes s'adaptent maintenant à la hauteur de l'écran au lieu d'être coupées.
**Technique** : Les `.rs-panel` (rich-select) sont désormais réattachés à `document.body` en `position:fixed`, positionnés dynamiquement (avec bascule vers le haut si pas assez de place en dessous) — au lieu d'un `position:absolute` imbriqué dans la modale, sujet au découpage par tout `overflow` ancêtre. `.modal-box` passe à `max-height:88vh; overflow-y:auto`.

**Humanisé** : Ajouter, modifier ou supprimer une note rechargeait tout l'onglet Notes depuis zéro (perte de la recherche en cours, effet de "page qui recharge").
**Technique** : `apiAddNote` renvoie désormais la note créée ; les 4 points d'appel (ajout ×2, édition, suppression) patchent `_allNotesRaw` localement et appellent `renderNotesBlocks()` au lieu de refaire un aller-retour serveur complet (`loadNotes()`).

**Humanisé** : Le bouton bascule mobile/PC ne marchait pas ou envoyait vers une adresse cassée ; sur certains écrans, ça allait jusqu'à empêcher le chargement des données du site (incident constaté en production sur "Site tops").
**Technique** : Deux bugs cumulés dans `window.top.location.href`. (1) Une redirection automatique sans clic utilisateur, bloquée sans exception par le bac à sable Apps Script (`SecurityError` non rattrapée, plantait `window.onload` avant `loadEntities()`) — supprimée entièrement, `Index.html` reste la version par défaut. (2) Une URL relative se résolvait contre l'origine du bac à sable (`googleusercontent.com`) plutôt que contre l'adresse réelle du site — le bouton devient un vrai `<a target="_top">`, avec `href` construit à partir de `ScriptApp.getService().getUrl()` injecté côté serveur (`doGet` passe à `HtmlService.createTemplateFromFile(...).evaluate()`). L'appel à `getService()` est protégé par un `try/catch` (dégradation silencieuse du bouton plutôt que blocage de la page si l'autorisation venait à manquer).

**Humanisé** : L'outil "Points automatiques" avait perdu la pastille de couleur du Top dans sa liste de règles (elle apparaissait en texte brut).
**Technique** : `renderAutoRules` construit désormais la pastille en DOM (`categoryColor`/`catIcon`/`tint`), comme partout ailleurs dans l'app, au lieu d'un `innerHTML` en texte simple.

**Humanisé** : L'outil "Groupes hérités à vérifier" ne permettait de dissocier qu'un groupe entier d'un coup.
**Technique** : Ajout de cases à cocher par entrée + action "Dissocier les entrées cochées" (`apiRemoveFromGroup`), et d'une action "Ignorer ce groupe" persistée en `localStorage`.

### Retiré
**Humanisé** : Retrait du mot anglais "event" qui traînait dans quelques libellés du Dashboard.

## [Non publié] - 2026-07-08

### Ajouté
**Humanisé** : Les mises à jour du code se déploient maintenant automatiquement dès qu'elles sont envoyées sur GitHub — plus besoin de recopier les fichiers ni de redéployer à la main, le lien court reste toujours valide. Ça marche aussi pour les copies du même script (groupes différents), toutes mises à jour d'un coup.
**Technique** : Ajout d'un workflow GitHub Actions (`.github/workflows/deploy-gas.yml`) qui exécute `clasp push`, retire l'ancien déploiement, en crée un nouveau, et met à jour le lien short.io via son API (`.github/scripts/deploy-gas.sh`), pour chaque cible listée dans `deploy-targets.json`. La description de chaque déploiement Apps Script reprend maintenant le message du commit (tronqué) au lieu du hash brut.

### Corrigé
**Humanisé** : La synchro automatique cassait le site en le déployant (le code des tests se retrouvait mélangé au vrai code, ce qui faisait planter tout le site à l'ouverture). Réparé.
**Technique** : `clasp push` n'avait pas de filtre et poussait tout le dépôt, y compris `tests/`. Apps Script exécute tous les fichiers `.gs`/`.js` d'un projet dans un seul scope global partagé ; les 12 fichiers de test déclarant chacun `const { loadGas } = require('./harness')` en tête de fichier entraient en collision (identifiant dupliqué), cassant l'exécution de tout le projet déployé. Ajout de `.claspignore` pour ne pousser que `Code.gs`, `AutoPoints.gs`, `Index.html`, `Mobile.html` et `appsscript.json`.

**Humanisé** : Le site restait bloqué sur "Chargement…" puis devenait tout blanc à l'ouverture, aussi bien sur PC que sur mobile. Maintenant le lien de base ouvre directement la version PC ; le bouton 📱/🖥️ en haut de l'écran permet de passer sur mobile, et ce choix est ensuite mémorisé.
**Technique** : `doGet()` sans `?view=` servait une mini-page de redirection auto-détectant l'appareil puis se rechargeant elle-même via `window.location.href`. Dans l'iframe sandbox du déploiement réel, Google bloque silencieusement toute navigation déclenchée par du script sans geste utilisateur réel — confirmé en testant qu'une navigation tapée à la main vers `?view=desktop` fonctionne, contrairement à la redirection automatique, que ce soit servie comme chaîne brute (`createHtmlOutput`) ou comme fichier (`createHtmlOutputFromFile`, tenté en premier et insuffisant). Suppression de cette page intermédiaire : `doGet()` sert directement `Index.html` par défaut (et sur toute valeur `?view=` non reconnue), `Mobile.html` uniquement sur `?view=mobile` explicite. Le bouton de bascule existant reste fonctionnel car un clic constitue un geste utilisateur valide pour le sandbox.
