# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com).

## [Non publié] - 2026-07-14

### Corrigé
**Humanisé** : Dans Historique → Journal d'audit, les lignes « Dégroupement lot » et « Retrait du groupe » n'affichaient plus aucune information (régression de la refonte du 10 juillet) — elles montrent de nouveau quel lot/quelle ligne était concerné.
**Technique** : `apiUngroupLot` et `apiRemoveFromGroup` (Code.gs) plaçaient l'identifiant utile (`groupId`/`rowIndex`) dans le paramètre `before` d'`AuditService.log`, colonne masquée côté frontend pour ces actions via `AUDIT_NO_DIFF_ACTIONS`. Déplacé vers le paramètre `detail`, seule colonne affichée pour ces actions.

**Humanisé** : Les onglets Historique et Notes se rechargeaient inutilement à chaque fois qu'on cliquait dessus, même sans rien avoir changé — ça provoquait un flash visible et une petite attente à chaque fois. Ils ne se rechargent maintenant que la première fois, comme attendu.
**Technique** : `goToTab()` (Index.html/Mobile.html) forçait un reset + rechargement complet de l'historique/des notes à chaque navigation vers ces onglets, en doublon des rechargements déjà déclenchés au bon endroit par les mutations. Ajout des indicateurs `_histLoadedOnce`/`_mHistoryLoadedOnce` (le second existait déjà côté notes mais n'était pas utilisé) pour ne charger qu'une fois par session.

### Ajouté
**Humanisé** : Dans Historique → Entrées, on peut maintenant filtrer par plage de dates (« Depuis » / « Jusqu'au »), comme c'était déjà possible dans le Journal d'audit. Disponible aussi sur mobile.
**Technique** : `apiGetHistoryPage`/`StorageService.getHistoryPage` (Code.gs) acceptent deux nouveaux paramètres `startDate`/`endDate` (bornes inclusives, même logique que `apiGetAuditLog`). Frontend : deux `<input type="date">` + bouton d'effacement dans `.history-filters` (Index.html) et dans le shell Historique (Mobile.html), pris en compte dans la clé de cache de préchargement côté desktop.

### Modifié
**Humanisé** : Dans l'outil Points automatiques (Paramètres → Outils), les listes déroulantes Joueur et Top étaient de simples menus texte, sans avatar ni couleur — contrairement à tous les autres formulaires du site (saisie en lot, édition d'entrée).
**Technique** : Remplacement des `<select id="autoRulePlayer">`/`<select id="autoRuleCategory">` par le composant `buildRichSelect()` déjà utilisé ailleurs (avatar/couleur + panneau stylé), reconstruit à chaque ouverture de l'onglet Outils via `loadAutoRules()`.

## [Non publié] - 2026-07-11

### Ajouté
**Humanisé** : Sur le graphique principal du Dashboard, survoler une barre/point affiche maintenant l'avatar du joueur et son écart avec les autres joueurs proches au classement. Cliquer dessus (ou taper deux fois de suite sur mobile) ouvre la liste en lecture seule des scores concernés (date, Top, points, description) — pour modifier ou supprimer une entrée, direction l'onglet Historique comme avant. Cliquer sur un nom dans la légende isole sa courbe/barre pour mieux la comparer aux autres — recliquer restaure l'affichage complet. Ces trois améliorations couvrent les 6 types de graphique (empilé, groupé, courbes, radar, donut, classement), sur PC comme sur mobile.
**Technique** : Nouvel endpoint `apiGetFilteredLogs` (Code.gs) réutilisant `StorageService.getFullHistoryRowsCached()` via une nouvelle méthode `getFilteredFullLogs`. `AnalyticsService.getTrendData` expose désormais `granularity` (`day`/`week`/`month`), utilisé pour reconstruire la plage de dates exacte d'un point de courbe cliqué. `buildCustomTooltipPlugin` (Index.html) et `buildMobileTooltipPlugin` (Mobile.html) acceptent des `opts` (`titleIsPlayer`, `rowsArePlayers`, `rankedTotals`) pour injecter avatar et comparaison de rang. Nouveau handler `isolatableLegendOnClick` partagé sur les légendes des 6 types de graphique (hors Classement, volontairement exclu). Nouveaux modals `openChartDrilldown` (Index.html) / `openChartDrilldownMobile` (Mobile.html), volontairement consultatifs (le Dashboard ne sert pas l'édition). 4 nouveaux tests (`tests/dashboard-drilldown.test.js`).

### Corrigé
**Humanisé** : Sept petits soucis trouvés en relecture de code sur les nouveautés du graphique Dashboard, corrigés avant mise en ligne : sur le graphique Radar mobile, taper sur un point ouvrait le détail du mauvais joueur/Top. Sur le graphique Donut, cliquer une catégorie dans la légende ne l'isolait pas correctement. Sur le Classement, la légende se comportait différemment sur PC et sur mobile. Sur les Courbes mobile, le détail ignorait le filtre de catégorie actif et pouvait manquer les entrées du tout dernier jour d'une semaine ou d'un mois. Cliquer très vite sur deux points du graphique pouvait afficher le détail du mauvais point. Et l'avatar manquait sur la ligne de comparaison du tooltip.
**Technique** : `Mobile.html` `renderRadarChart` réorganise désormais les données (labels=catégories, datasets=joueurs) comme `Index.html`, au lieu de passer `chartData` brut à Chart.js. `isolatableLegendOnClick` (Index.html + Mobile.html) gère le cas donut/pie (un seul dataset) via `chart.toggleDataVisibility(index)`/`getDataVisibility(index)` au lieu de `getDatasetMeta`. Légende du Classement explicitement non isolable des deux côtés (`onClick: undefined` si `stacked === undefined` côté Mobile.html, commentaire explicite côté Index.html). Le contexte de drill-down des Courbes mobile passe désormais `mFilterCategories`. Les calculs de date de fin de semaine/mois utilisent le formateur local `toDateStr()` au lieu de `toISOString().slice(0,10)` (qui décalait la date selon le fuseau horaire). `openChartDrilldown`/`openChartDrilldownMobile` utilisent un compteur `_drilldownRequestId` pour ignorer les réponses serveur obsolètes. `comparisonText`/`mComparisonText` retournent désormais `{text, neighbor}` pour permettre l'affichage de l'avatar du joueur cité.

## [Non publié] - 2026-07-10

### Ajouté
**Humanisé** : Le Journal d'audit permet maintenant d'annuler directement une action passée (ajout/suppression/modification de points, joueurs, catégories, barème, notes, phrases) grâce à un bouton "↩️ Annuler" sur chaque ligne concernée, sur PC comme sur mobile. Le groupement/dégroupement de lots reste pour l'instant en lecture seule — pas encore assez sûr à annuler automatiquement.
**Technique** : Nouvelle colonne cachée `Snapshot` (JSON) + `AnnuléLe` dans la feuille `AuditLog`. `AuditService.log()` accepte un 7ᵉ paramètre optionnel `snapshot` ; `AuditService.undo()`/`apiUndoAuditEntry()` implémentent un moteur générique de restauration (insert/delete/update/insertMany/deleteMany/updateMany) par recherche de ligne exacte, réutilisé par une vingtaine de sites d'appel. `apiGetAuditLog` expose `id`/`undoable` par entrée.

### Modifié
**Humanisé** : La colonne "Avant → Après" du Journal d'audit n'affiche plus de fragments sans signification (ex. `"" → "3 entrée(s)"`) pour les actions qui n'ont pas de vrai avant/après — cette information reste visible dans la colonne Détail. Le bouton copier la ligne et le clic pour filtrer sur l'auteur/l'action/l'entité ont été retirés (jugés inutiles).
**Technique** : `AUDIT_NO_DIFF_ACTIONS` filtre le rendu de la colonne diff dans `renderAuditTable` (`Index.html`) et `auditCardHtml` (`Mobile.html`). Cellules Qui/Action/Entité redeviennent non interactives dans `Index.html` ; classe CSS `.audit-clickable-cell` retirée.

## [Non publié] - 2026-07-09

### Ajouté
**Humanisé** : Sept nouveaux outils dans l'onglet 🔧 Outils : détection des doublons et des scores anormaux (avec correction ou "ignorer" en un clic), liste des joueurs inactifs, records personnels et absolu, tendances récentes par Top et par joueur, jour de la semaine le plus actif, et duo joueur/Top le plus fréquent.
**Technique** : 7 nouvelles fonctions backend (`apiDetectDuplicates`, `apiDetectOutlierScores`, `apiGetInactivePlayers`, `apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`) réutilisant `StorageService.getFullHistoryRowsCached()`. Détection des scores aberrants par médiane/écart absolu médian plutôt que moyenne/écart-type (une aberration fausse sa propre moyenne sur un petit échantillon). 8 nouveaux tests (`tests/outils-nouveaux.test.js`).

**Humanisé** : Possibilité de cocher plusieurs cases rapidement en cliquant-glissant dessus (souris ou tactile), sans avoir besoin du clavier — disponible dans l'Historique et les outils de détection.
**Technique** : `enableDragMultiSelect(container, selector)`, délégation d'événements `mousedown`/`mouseover`/`touchmove`, appliqué à `#historyTableBody`, `#detectResults`, `#detectLegacyResults`.

**Humanisé** : Cocher plusieurs cases en cliquant-glissant marchait, mais fallait viser précisément la petite case. Toute la ligne compte maintenant comme zone de clic (sauf sur un bouton, un lien, ou le texte dépliable d'une description, qui gardent leur propre action).
**Technique** : `enableDragMultiSelect` prend un `rowSelector` optionnel ; `checkboxAt()` retombe sur la ligne si le clic direct sur la case échoue, en excluant `button, a, input:not([type=checkbox]), select, textarea, .hist-desc-toggle`. Appliqué à `#historyTableBody` (`tr`) et aux entrées individuelles des groupes hérités (nouvelle classe `.legacy-entry-row`) — pas aux en-têtes `.detect-lot-head`, qui utilisent déjà tout leur clic pour déplier/replier.

**Humanisé** : Quatre outils d'analyse (Records, Tendances, Jour le plus actif, Duo le plus fréquent) quittent l'onglet Outils pour devenir des cartes du Dashboard, en bas — ils se chargent directement à l'ouverture au lieu d'un clic "Actualiser" caché dans un sous-menu. Tendances et Jour le plus actif sont maintenant des vrais graphiques (barres divergentes vert/rouge, barres par jour de la semaine) plutôt que des listes de texte.
**Technique** : Nouvelles cartes `#recordsCard`/`#trendsCard`/`#weekdayCard`/`#pairsCard` dans `tab-dashboard`. `renderTrends()`/`loadActiveWeekday()` utilisent Chart.js (`getChartColors()` pour le thème dark/light) au lieu de barres en `<div>`. Chargement unique au démarrage (`window.onload`), pas à chaque repaint de `_paintEntitiesUI` (ces stats ne dépendent pas des joueurs/catégories qui changent).

**Humanisé** : Le bouton "Outils" dans la barre de navigation et le menu mobile faisait doublon avec Paramètres → Outils, où il existait déjà — retiré.
**Technique** : `tab-outils` retiré de `NAV_PAGES` (`Code.gs`, source unique partagée par les deux frontends). `Mobile.html` : Outils devient un 5ᵉ sous-onglet de Paramètres (`mSettingsSubTab === 'outils'`), `renderOutilsShell()` cible `#mSettingsBody` au lieu d'un `#tab-outils` retiré du DOM. Tests `nav-pages.test.js` mis à jour (6 onglets).

**Humanisé** : L'onglet Outils affichait tout empilé sans fin. Chaque outil a maintenant sa propre carte qu'on peut replier, comme sur le Dashboard.
**Technique** : Chaque section de `#stab-tools` devient un `.card.card-collapsible` avec `makeCollapsible(...)`.

**Humanisé** : Le Journal d'audit avait une liste d'actions filtrables qui n'était plus à jour (deux actions récentes manquaient, une autre n'existait plus) — les clics sur ces filtres ne faisaient donc rien. Elle se construit maintenant automatiquement à partir des actions réellement enregistrées. Les changements de couleur affichent maintenant une pastille de la couleur plutôt qu'un code brut illisible.
**Technique** : `apiGetAuditActionTypes()` remplace la liste `<option>` figée dans le HTML. `auditDiffValue()` détecte les valeurs hexadécimales et ajoute un `.audit-color-dot`.

**Humanisé** : Trois manques de la version mobile comblés pour retrouver la parité avec la version PC : (1) l'Historique a maintenant son sous-onglet Journal d'audit (qui n'existait que sur PC), (2) le Dashboard mobile affiche désormais les mêmes quatre cartes statistiques que la version PC (Records, Tendances, Jour le plus actif, Duo le plus fréquent), repliées par défaut et chargées à l'ouverture, (3) les presets de phrases de la card Commentaires peuvent enfin être créés, renommés et supprimés depuis le mobile (avant : uniquement sélectionnables).
**Technique** : `Mobile.html` — `renderHistoryShell()` gagne des sous-onglets `mHistorySubTab` (`entries`/`audit`) ; `renderAuditShell()`/`loadAuditTab()` consomment `apiGetAuditLog()` en lecture seule. `renderDashboardShell()` ajoute 4 `m-accordion` chargées à la demande via `bindStatAccordion()` (`apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`). `renderPhrasesSettings()` ajoute 3 boutons appelant `apiSetActivePhrasePreset` (création), `apiRenamePreset`, `apiDeletePreset`.

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

**Humanisé** : Cliquer en dehors d'une fenêtre d'édition (modale) la refermait par erreur, avec perte de tout ce qui avait été saisi. Seuls les boutons Annuler/Échap ferment désormais une fenêtre.
**Technique** : Retrait des gestionnaires `click` sur `#modalBackdrop`, `#bulkImportModal`, `#identityPwdModal` (`Index.html`) et `#mModalBackdrop` (`Mobile.html`) qui fermaient sur `e.target === backdrop`.

**Humanisé** : Ajouter un joueur ou une catégorie faisait clignoter et recharger inutilement le Barème et les Notes ailleurs dans l'app, même sans rapport avec ce qui venait de changer.
**Technique** : `_paintEntitiesUI()` appelait `loadBaremeSettings()` (squelette + fetch complet) et `loadNotes()` (idem) à chaque passage. Remplacés par un rendu local à partir des données déjà en cache (`renderBaremeSettings(baremeEntries)`, `renderNotesUI(_allNotesRaw)`) tant qu'un premier chargement a déjà eu lieu.

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

## Historique des versions antérieures
_Résumés courts reconstitués a posteriori à partir des diffs de code, du plus récent au plus ancien. Non détaillés en catégories Ajouté/Modifié/Corrigé faute d'information plus fine sur chaque changement._

### Claude v59.5
- Rebascule de l'accès du webapp vers l'anonyme (ANYONE_ANONYMOUS).

### Claude v52.5
- Ajout d'un bouton de bascule mobile/desktop dupliqué dans le tiroir de navigation pour rester accessible sur petit écran.

### Claude v52.3
- Suppression du fichier Bootstrap.html : l'application sert directement Index.html, la redirection automatique ne fonctionnant pas en sandbox.

### Claude v59.2
- Ajout d'un fichier Bootstrap.html dédié pour la redirection mobile/desktop, remplaçant le HTML généré en ligne.

### Claude v59.1
- Changement de l'accès du webapp d'anonyme à connecté (ANYONE_ANONYMOUS vers ANYONE).

### Claude v59
- Ajout d'un registre de navigation centralisé et redirection automatique mobile/desktop via une page de démarrage.

### Claude v58
- Ajout de la possibilité de retirer une entrée d'un groupe et détection des anciens identifiants de groupe.

### Claude v57
- Ajout d'un mode d'affichage mobile avec menu tiroir et affichage de l'historique sous forme de cartes.

### Claude v56.1
- Ajout des scopes OAuth nécessaires (feuilles de calcul, script) dans la configuration du script.

### Claude v56
- Correction du calcul des semaines actives pour les règles hebdomadaires à intervalle supérieur à un, exclusion des entités supprimées.

### Claude v55
- Ajout d'un système de règles de points automatiques programmées (quotidien/hebdo/mensuel) via un nouveau module dédié.

### Claude v53
- Ajout d'un troisième état de tri permettant de revenir à l'ordre d'insertion initial des lignes.

### Claude v52
- Ajout du tri et de la réorganisation par glisser-déposer des lignes de saisie en lot, refonte du rafraîchissement global.

### Claude v51
- Ajout d'une identité protégée par mot de passe optionnel par joueur, vérifiée côté serveur.

### Claude v50
- Mise en cache multi-requêtes de l'historique complet et des statistiques de santé pour réduire les lectures de la feuille.

### Claude v49
- Ajout de paramètres d'application personnalisables (titre, logo) stockés dans une feuille Settings dédiée.

### Claude v48
- Modification de la priorité d'affichage des phrases pour montrer le podium complet (1er, 2e, 3e) avant les autres.

### Claude v47
- Suppression du plugin d'overlay emoji sur les graphiques pour simplifier le rendu.

### Claude v46
- Correction de la construction des dates pour préserver l'heure locale, ajout d'avatars en fond sur les notes.

### Claude v45
- Ajout d'un journal d'audit traçant les modifications de barème, de couleurs et d'entités.

### Claude v43
- Ajout d'une animation de pulsation sur le sélecteur « Qui suis-je ? » et amélioration visuelle du champ description.

### Claude v42
- Intégration du sélecteur enrichi dans les champs joueur et catégorie des lignes de saisie.

### Claude v41
- Ajout d'un composant de liste déroulante enrichie (avatars/icônes) et de la modification groupée d'entrées d'historique.

### Claude v40
- Réorganisation du graphique en conteneur unique et restauration de l'ordre des clés du fichier de configuration.

### Claude v39
- Ajout d'avatars dans l'infographie exportée pour le graphique en Donut.

### Claude v38
- Amélioration visuelle des boutons de barème rapide et réorganisation de l'en-tête du graphique.

### Claude v37
- Ajout de boutons de barème rapide par Top affichant les actions et points prédéfinis directement dans la saisie.

### Claude v36
- Ajout d'un champ « saisisseur » enregistrant l'auteur de chaque entrée d'historique.

### Claude v35
- Amélioration visuelle des menus déroulants et des cartes repliables génériques, avatars empilés dans l'historique groupé.

### Claude v34
- Ajout d'un sélecteur « Qui suis-je ? » et d'un fond avatar discret sur les lignes de saisie.

### Claude v33.3
- Ajout d'un verrou de concurrence et d'un versionnement de cache pour sécuriser les écritures simultanées.

### Claude v33
- Refonte du podium des commentaires (cartes classées, feed compact, accordéon par Top) avec preset actif persistant côté serveur.

### Claude v32.2
- Les phrases par Top s'affichent désormais pour tous les tops filtrés au lieu d'un seul, et la description d'historique reste toujours cliquable.

### Claude v32.1
- Correction du filtrage des presets personnalisés pour exclure le preset par défaut de la liste.

### Clauve v32
- Extension des pools de phrases par catégorie et refonte visuelle des paramètres (onglets internes, formulaires).

### Claude v31
- Ajout du renommage de preset de phrases et de phrases de secours visibles dans l'éditeur.

### Claude v30
- Ajout d'un service de phrases personnalisables, organisées par preset et par catégorie (pool).

### Claude v29
- Amélioration du style du champ description par ligne et déplacement de la carte Commentaires dans le Dashboard.

### Claude v28
- Ajout d'une carte dédiée aux commentaires (phrases d'accroche) avec podium et réglages associés.

### Claude v27
- Réorganisation de la saisie de lot en disposition verticale à deux rangées par ligne.

### Claude v26
- Refonte visuelle des modales, ajout de phrases d'accroche animées et d'une infobulle personnalisée pour les graphiques.

### Claude v25
- Correction du calcul de date locale pour éviter les décalages liés au fuseau horaire UTC.

### Claude v24.1
- Réintégration du CSS en ligne dans Index.html, annulant l'externalisation précédente.

### Claude v24
- Externalisation du CSS de l'interface vers un fichier styles.css séparé.

### Claude v23
- Remplacement du sélecteur de joueur du graphique Donut par des puces cliquables avec avatars.

### Claude v22
- Ajout d'un cache des logs, regroupement visuel des entrées par groupe dans l'historique, et recherche textuelle.

### Claude v21
- Réécriture de la détection des lots répartis pour exclure les doublons manuels et fiabiliser le chaînage par date.

### Claude v20
- Ajout d'un identifiant de groupe transmis lors de la saisie en lot sur plusieurs dates.

### Claude v19
- Correction d'un bug de déclaration en double d'une variable JavaScript lors du regroupement des lots.

### Claude v18
- Passage d'une fusion destructive à un simple marquage groupé (groupId), réversible, des lots répartis.

### Claude v17
- Les lots détectés sont désormais fusionnés en une seule entrée totalisée au lieu d'être simplement supprimés.

### Claude v16
- Ajout de la détection des lots répartis (entrées identiques étalées sur plusieurs jours).

### Claude v15
- Ajout d'un champ description par entrée d'historique, modifiable individuellement ou en masse.

### Claude v14
- Ajout de la suppression multiple d'entrées d'historique et refonte visuelle du barème présenté par section.

### Claude v13
- Le barème est désormais organisé par Top (catégorie), avec une interface de gestion dédiée dans les paramètres.

### Claude v12
- Ajout d'un système de barème définissant des points par action, configurable par l'utilisateur.

### Claude v11
- Les couleurs personnalisées sont désormais stockées côté serveur dans des colonnes dédiées plutôt qu'en localStorage.

### Claude v10
- Ajout de couleurs personnalisables par joueur et par catégorie, stockées localement et appliquées aux graphiques.

### Claude v9
- Ajout d'un sélecteur de jours de la semaine pour cibler les dates générées lors de la saisie en lot.

### Claude Opus v10
- Ajout du total global par joueur tous tops confondus et d'un sélecteur de jours de la semaine pour les lots répartis.

### Claude Opus v9
- Remplacement des champs date par un bouton ouvrant un éditeur, avec plages de dates prédéfinies réutilisables.

### Claude Opus v8
- Ajout d'un mode Répéter/Répartir propre à chaque ligne de saisie individuelle.

### Claude Opus v7
- Simplification du service Notes (création automatique de la feuille) et ajout de dates individuelles par ligne de saisie.

### Claude Opus v6
- Refonte du calcul des tendances temporelles avec granularité adaptative (jour/semaine/mois) et période par défaut de 30 jours.

### Claude Opus v5
- Ajustement du panneau de filtres pour uniformiser la hauteur des colonnes et aligner le bouton Appliquer.

### Claude Opus v4
- Suppression de la détection de doublons au profit d'une gestion complète des notes, simplification du diagnostic de santé des données.

### Claude Opus v3
- Ajout d'icônes emoji pour les catégories, renommées « Tops » dans toute l'interface.

### Claude Opus v2
- Ajout d'un mode « Répartir/Répéter » pour étaler les entrées d'un lot sur une plage de dates.

### Claude Opus v1
- Ajout d'une feuille Notes optionnelle et remplacement de la suppression automatique des doublons par une simple détection/liste.

### Gemini Pro v1
- Ajout d'optimisations mobiles et PWA (zones de sécurité, meta tags, touch-action) pour une meilleure ergonomie tactile.

### Claude v8
- Correction de la gestion du fuseau horaire pour les dates saisies (construction explicite à midi).

### Claude v7
- Ajout de validations strictes des points et du multiplicateur côté client et serveur.

### Claude v6
- Réécriture de la pagination de l'historique pour utiliser directement les index réels des lignes de la feuille.

### Claude v5
- Réécriture de ConfigService en module avec cache interne et syntaxe ES6 raccourcie.

### Claude v4
- Compactage massif du code CSS de l'interface sans changement fonctionnel majeur.

### Claude V3
- Séparation des fonctions de lecture complète et filtrée des logs, correction du calcul par défaut des points.

### Deepseek v3
- Simplification et nettoyage du code de filtrage et d'export des données.

### Deepseek v2
- Ajout du filtrage avancé des données historiques et de l'export CSV/XLSX via des bibliothèques externes.

### Deepseek v1
- Ajout d'un cache interne à l'exécution pour ConfigService et renforcement de la validation des types/actions.

### Claude v2
- Refonte du CSS en mobile-first : tailles tactiles, prévention du zoom iOS, navbar défilante horizontalement.

### Claude v1
- Nettoyage du backend et correction d'un bug de mutation du tableau source dans la lecture des logs.

### v21
- Corrections responsives et sécurisation de la fonction de changement d'onglet contre un bug sur Safari.

### v19
- Ajout d'un sélecteur de joueur enrichi avec avatar dynamique dans le formulaire de saisie en lot.

### v18
- Ajout d'avatars générés automatiquement pour les joueurs sans image et correction d'un bug lors de l'édition des métadonnées.

### v17
- Ajout d'un système de citations de secours utilisé si l'appel à l'API Gemini échoue ou est indisponible.

### v16
- Mise à jour du modèle Gemini utilisé pour générer les citations (passage de 1.5-flash à 2.0-flash).

### Plein de fonctions trop biens
- Ajout de métadonnées (avatar pour les joueurs, description pour les catégories) et intégration d'un appel à l'API Gemini pour générer des citations.

### v12
- Refonte complète du CSS de l'interface (navbar, cartes, grille de saisie en lot, listes, toasts).

### Naaan ergonomie naaan
- Nettoyage du code et calcul dynamique des catégories/joueurs lors de l'agrégation des statistiques.

### v10
- Écriture groupée des scores en une seule opération (au lieu d'une boucle appendRow) et nettoyage du rapport HTML généré.

### v9
- Passage à la saisie en lot avec points et multiplicateur, le score enregistré étant désormais le produit des deux.

### v8
- Traduction en français de tous les messages d'erreur du backend.

### Ajout Trois
- Ajout de SettingsService pour gérer joueurs et catégories (ajout/suppression/renommage) avec mise à jour en cascade de l'historique.

### Plus de bug ID sheet
- L'identifiant du classeur est désormais lu via la propriété SPREADSHEET_ID au lieu d'être codé en dur ; ajout accidentel d'un fichier desktop.ini.

### Trois plein de fonctions tri phrases graphs etc
- Refonte du Code.gs monolithique en services ConfigService/StorageService/AnalyticsService et changement du titre de l'application.
