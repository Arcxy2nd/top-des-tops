# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com).
## [v3.5.0] - 2026-08-06

### Ajouté
**Humanisé** : Il est désormais possible de saisir des points directement dans un Top Alternatif, sans qu'aucune entrée ne soit créée dans l'historique principal. Deux surfaces : un sélecteur d'univers en haut de l'onglet « Saisir un Lot » (bascule le constructeur en mode Alt, avec le sélecteur de Top remplacé par un sélecteur de Top Alternatif), et un bouton « ＋ Saisir Alt » qui apparaît sur le Dashboard quand l'univers Alt est actif (modale légère en un clic). Les entrées natives sont distinctes des entrées liées : elles affichent un badge ✏️ natif dans le gestionnaire Alt.
**Technique** : `Code.gs` — `AltStorageService.addNativeAltEntries()` (validation joueur/altCat/pts, écriture dans `AltHistory` avec `refHistoryRowId` vide), `_parseAltHistoryRow` expose `isNative`, nouveau endpoint `apiAppendAltNativeBatch(author, entries)` avec audit `'Saisie native Alt'`. `Index.html` — variable `activeLotUniverse`, segmented control `#lotUniverseSeg` dans l'onglet Saisie, type `'altCategory'` dans `buildRichSelect` (peuple avec `cachedAltCategories`), branche Alt dans `submitBulk()`, fonction `openAltNativeQuickAddModal()` appelée par `#dashAltAddBtn` (visible seulement en mode Alt Dashboard), badge `✏️ natif` dans `openAltCategoryManagerModal` pour les entrées sans `refHistoryRowId`.

## [v3.4.5] - 2026-08-05


### Corrigé
**Humanisé** : La bascule vers les Tops Alternatifs sur le Dashboard ne recharge plus inutilement la bannière de statistiques rapides du haut de page, évitant ainsi tout clignotement intempestif.
**Technique** : `Index.html` — retrait de `loadQuickStats()` de la fonction `refreshDashboardStats()`, garantissant le maintien fixe du bandeau `quickStatsBar` sans requête réseau inutile lors du changement d'univers.

## [v3.4.4] - 2026-08-05

### Modifié
**Humanisé** : Refonte complète de l'ergonomie et de la taille des modales de modification (notes, affectation des points aux Tops Alternatifs, édition groupée, drill-down des graphiques). Les modales profitent désormais du grand écran sur ordinateur (`max-width` étendu à 860px-1000px, hauteurs de listes dynamiques `modal-scroll-list`) et les bloc-notes par joueur s'organisent en grille responsive multi-colonnes.
**Technique** : `Index.html` — ajout des variantes CSS `.modal-box.xl` et `.modal-scroll-list`, bascule des modales universelles d'affectation Alt, gestionnaire Alt et drilldown de graphiques vers `.xl`, correction du vidage de classe dans `closeModal()`, et réorganisation de `#notesBlocksContainer` en grille 1/2/3 colonnes avec CSS responsive `@media`.

## [v3.4.3] - 2026-08-05

### Modifié
**Humanisé** : Optimisation de l'ergonomie sur grand écran — le menu du Guide s'adapte désormais dynamiquement à la hauteur de la fenêtre avec grille de cartes multi-colonnes sur grand écran, et les panneaux latéraux (Guide et Barème) sont désormais redimensionnables à la souris en glisser-déposer avec sauvegarde de la largeur préférée.
**Technique** : `Index.html` — refonte CSS de `.guide-layout` (`height: clamp()`, layout responsive 2-colonnes `@media (min-width: 900px)`), ajout des séparateurs `.guide-resizer` et `.bareme-resizer`, et création de la fonction utilitaire JS `setupResizable()` avec persistance `localStorage`.

## [v3.4.2] - 2026-08-05

### Corrigé
**Humanisé** : La navigation par clics dans le menu latéral du Guide fonctionne désormais correctement pour basculer d'une section à l'autre dans la documentation.
**Technique** : `Index.html` — extraction de `initGuideAccordion()` au niveau du scope global JS et invocation dans `bindButtons()` et `goToTab('tab-guide')`.

## [v3.4.1] - 2026-08-05

### Modifié
**Humanisé** : Le guide d'utilisation du site a été entièrement mis à jour avec une nouvelle section dédiée aux Tops Alternatifs et l'actualisation de toutes les explications (podium 3D, automatisations, univers, tchat et sélection universelle).
**Technique** : `Index.html` — ajout de la tuile et du template `guideContent-alt` dans `tab-guide`, enregistrement dans `GUIDE_TITLES`, et mise à jour des templates de guide Dashboard, Saisie, Paramètres, Historique et Tchat.

## [v3.4.0] - 2026-08-04

### Ajouté
**Humanisé** : Gestion complète et universelle des points dans les Tops Alternatifs — ajout d'un sélecteur universel de points, de badges ⭐ dans l'historique, de filtres par Top Alt, d'une modale de gestion des points dans les Paramètres, et de raccourcis d'affectation depuis les outils de lots et les détails de graphiques.
**Technique** : `Code.gs` — implémentation de `AltStorageService.getAltHistoryMap()`, `unlinkHistoryRowsFromAltCategory()`, `getAltCategoryDetails()`, et des fonctions API correspondantes (`apiGetAltHistoryMap`, `apiUnlinkHistoryRowsFromAltCategory`, `apiGetAltCategoryDetails`). `Index.html` — création des modales `openUniversalAltPointPicker` et `openAltCategoryManagerModal`, intégration des badges ⭐ dans l'historique et des filtres par puces.

## [v3.3.5] - 2026-08-04

### Corrigé
**Humanisé** : Exclusion stricte du bouton ⭐ Top Alt (`.alt-picker-btn`) du contour néon réactif, garantissant que seuls les contrôles gris neutres pur le reçoivent.
**Technique** : `Index.html` — ajout de l'invalidation `:not(.alt-picker-btn)` sur les règles CSS néon et dans le sélecteur `initSpotlightCards()`.

## [v3.3.4] - 2026-08-04

### Corrigé
**Humanisé** : Exclusion stricte du contour néon sur l'ensemble des boutons de règles du barème (`.bq-btn`), du déclencheur du barème (`⚖️ Barème ▼`) et des boutons colorés/fonctionnels de l'interface. Seuls les contrôles gris neutres ("vanilla") le conservent.
**Technique** : `Index.html` — restriction des sélecteurs CSS et du JS `initSpotlightCards()` avec l'invalidation `:not(.bq-btn):not(.nav-bareme-btn):not(.bareme-quick-header)` pour empêcher le ciblage intempestif des boutons de règles et de barème.

## [v3.3.3] - 2026-08-04

### Corrigé
**Humanisé** : En version mobile, le titre textuel dans la barre supérieure est désormais automatiquement masqué au profit de l'icône/logo du site uniquement, libérant l'espace pour un alignement parfait de la barre de navigation.
**Technique** : `Index.html` — ajout de `display: none !important` sur `.app-brand-title` en mobile (`body:not(.desktop-layout)` et `@media (max-width: 640px)`), ajout de l'élément de repli d'icône `#appBrandDefaultIcon` (`🏆`) et ajustement dans `applyAppBranding()` pour garantir l'affichage de l'icône seule en toutes circonstances.

## [v3.3.2] - 2026-08-04

### Corrigé
**Humanisé** : Le script de déploiement créé désormais systématiquement un NOUVEAU déploiement Web App et ARCHIVE/DÉSACTIVE obligatoirement l'ancien déploiement GAS (les anciens liens directes ne fonctionnent plus et renvoient vers le nouveau).
**Technique** : `.github/scripts/deploy-gas.sh` — suppression du mode de mise à jour réutilisant `clasp deploy -i` ; force la création d'une nouvelle URL via `clasp deploy --description` suivie de l'invalidation/archivage de tous les anciens déploiements via `clasp undeploy <old_id>`, puis mise à jour de Short.io.

## [v3.3.1] - 2026-08-04

### Modifié
**Humanisé** : Le contour extérieur rouge des boutons et sélecteurs neutres ("vanilla") a été totalement supprimé au profit du contour néon cyan-blanc pur et lumineux au survol.
**Technique** : `Index.html` — passage de la couleur de base du `radial-gradient` de rouge `rgba(255, 60, 95)` à un néon blanc/cyan neutre `rgba(255, 255, 255, 0.95)` / `rgba(160, 215, 255, 0.75)`, et ajout de `border-color: transparent !important` au survol pour annuler la bordure rouge/accent statique par défaut.

## [v3.3.0] - 2026-08-04

### Modifié
**Humanisé** : Le contour néon réactif au curseur a été ciblé exclusivement sur les boutons et contrôles neutres ("vanilla" : sous-barre quick stats, onglets, sélecteurs, menus déroulants, filtres, boutons d'action simples). L'effet a été retiré des grandes cartes et panneaux de structure pour rendre l'interface plus épurée.
**Technique** : `Index.html` — restriction des règles CSS néon spotlight et de la fonction `initSpotlightCards()` aux sélecteurs `button.secondary`, `button:not(.primary):not(.danger)`, `.qs-pill`, `.nav-btn`, `.nav-item`, `.subtab-btn`, `select`, `.custom-select-trigger`, `.fchip`, `.d-mode-btn`, `.chart-type-btn`, `.export-btn`, `.who-am-i-btn`, `.nav-refresh-btn`, `.nav-bareme-btn`, `.nav-chat-btn`, `.quick-btn`, `.fill-opt`. Retrait définitif de `.card::before`/`.after`, `.filter-panel` et `.modal-content`.

## [v3.2.6] - 2026-08-04

### Corrigé
**Humanisé** : La jonction entre chaque carte de joueur du podium et sa marche a été unifiée en un seul bloc monobloc (retrait des coins arrrondis du bas et suppression du décalage), supprimant les zones transparentes indésirables.
**Technique** : `Index.html` — modification de `.phrase-podium-card` (`border-radius: 16px 16px 0 0`, `border-bottom: none`), ajustement de `.podium-step-base` (`margin-top: 0`, `border-top: none`) et ajout des règles d'accentuation unifiée de couleur de bordure au survol (`.podium-column.rank-*:hover .podium-step-base`).

## [v3.2.5] - 2026-08-04

### Modifié
**Humanisé** : Le podium du Dashboard a été entièrement redessiné — les avatars sont maintenant bien plus grands (64px pour le 1er avec halo doré animé, 44px pour les autres), les colonnes s'animent depuis leur direction respective au chargement, les socles sont surélevés (80/55/36px) et une mini-barre de progression comparative s'affiche sous le score de chaque joueur.
**Technique** : `Index.html` — CSS : alignement centré dans `.phrase-podium-card`, taille des avatars portée à 44px (64px pour `.rank-1` avec animation `avatarPulse`), animations d'entrée `podiumDropIn` / `podiumSlideLeft` / `podiumSlideRight`, socles 80/55/36px, `crownBounce` retravaillé, mini-barre `.phrase-podium-progress-bar` avec `--score-pct`. JS : restructuration du DOM dans `renderPhrasesCard` pour centrer avatar + médaille + nom + chip points + barre de progression.

## [v3.2.4] - 2026-08-02

### Corrigé
**Humanisé** : La bascule en mode "Tops Alternatifs" sur le Dashboard ne modifie désormais plus le reste du site (notamment la bannière de statistiques rapides globale en haut de page, qui conserve en permanence les scores des Tops Principaux).
**Technique** : `Index.html` — modification de `loadQuickStats()` pour forcer l'appel serveur sur l'univers `'main'` (`apiGetQuickStats('main')`), garantissant que le bandeau `#quickStatsBar` reste ancré sur les statistiques globales du site indépendamment du mode d'affichage actif sur le Dashboard.

## [v3.2.3] - 2026-08-02

### Modifié
**Humanisé** : Le contour néon au survol est désormais plus éclatant et fait tourner lentement ses couleurs (cycle chromatique continu en 10 secondes) au niveau du curseur sur tous les boutons et conteneurs.
**Technique** : `Index.html` — augmentation de l'opacité et de la saturation du `radial-gradient` au curseur (de 0.45 à 0.95), élargissement du rayon (160px), et ajout de `@keyframes neonHueCycle` avec `filter: hue-rotate(0deg → 360deg)` en boucle continue (10s).

## [v3.2.2] - 2026-08-02

### Modifié
**Humanisé** : Le contour néon réactif au curseur est maintenant généralisé à tous les boutons, cartes, filtres, onglets, modales et conteneurs interactifs de l'application. Dès que la souris survole un élément, son bord s'illumine subtilement à l'endroit exact du curseur.
**Technique** : `Index.html` — extension de la règle CSS de spotlight avec `radial-gradient` à tous les composants interactifs (`button`, `.card`, `.filter-panel`, `.qs-pill`, `.lot-row`, `.modal-content`, `.settings-section`, etc.) avec `-webkit-mask-composite: xor` / `mask-composite: exclude` ; optimisation de `initSpotlightCards()` grâce à `e.target.closest(selector)` pour un suivi ultra-fluide à 60 FPS sans surconsommation CPU.

## [v3.2.1] - 2026-08-02

### Corrigé
**Humanisé** : Correction du problème structurel empêchant d'éditer, dupliquer ou supprimer la planification complète des règles d'automatisations dans les Paramètres.
**Technique** : `AutoPoints.gs` — normalisation des dates dans `_parseRow` sous forme de chaînes ISO sérialisables, sécurisation de `updateRule`/`runDue` avec des garde-fous sur l'extension `.toISOString()`, et fiabilisation de `_findRowIndex()`. `Index.html` — refonte complète des modales `openEditAutoRuleModal` et `openDuplicateAutoRuleModal` incluant tous les champs de planification (`interval`, `daysOfWeek`, `dayOfMonth`, `startDate`) avec bascule dynamique d'affichage selon la fréquence choisie, et sécurisation du formatage de date dans `renderAutoRules`.

## [v3.2.0] - 2026-08-02

### Ajouté
**Humanisé** : Passage à la version 3.2 ! La ligne de saisie a été entièrement repensée pour être ultra-fluide, avec des dimensions adaptatives et un placement logique de chaque élément.
**Technique** : `Index.html` — refonte majeure de l'ergonomie des lignes de lot (`addEntryRow`) :
- **Top bar** : intègre la poignée de réorganisation, le sélecteur `⭐ Top Alt`, et les boutons allongés avec libellé complet `📋 Dupliquer cette ligne` et `✕ Supprimer cette ligne`.
- **Rangée principale (3 colonnes fluides en % relatives)** : `Joueur` (30%), `Top principal & Points` (35%), et `Date` (30%) directement sur le côté (côte à côte).
- **Points rapides** : réorganisés en une grille 2 lignes de 4 boutons (`1 3 5 7` / `10 25 50 100`) directement sous les points et dictant la largeur de la section.
- **Onglet Automatisations** : déplacé dans son propre onglet dédié des Paramètres avec gestion complète et duplication 1-clic.

## [v3.1.1] - 2026-08-02

### Modifié
**Humanisé** : Consolidation du volet latéral de tchat sur PC (masqué sur mobile), nettoyage de la barre de navigation mobile et repositionnement du bandeau des statistiques rapides au-dessus des onglets.
**Technique** : `Index.html` — fusion des règles CSS responsive de la navbar mobile, ancrage flex-sticky du tchat (`#chatSidePanel`), déplacement de `#quickStatsBar` hors des onglets et retrait des badges d'intensité sur les cartes de commentaires.

### Corrigé
**Humanisé** : Résolution des blocages au chargement initial du Dashboard, fiabilisation des garde-fous serveur (GAS) et support des statistiques réactives lors des changements d'univers.
**Technique** : `Code.gs` — correction des appels `requireAuthor` serveur et ajout du paramètre `universe` sur les endpoints analytics ; `Index.html` — sécurisation des gestionnaires `onError` et temporisation des requêtes de statistiques secondaires au démarrage.

## [v3.1.0] - 2026-08-02

### Ajouté
**Humanisé** : Intégration d'un moteur Markdown GFM complet, refonte ergonomique de la Saisie de Lot (sous-tops sous le top principal et pilule interactive Top Alternatif), édition complète des automatisations et tchat ancré en panneau latéral / tiroir mobile.
**Technique** : `Index.html` — réécriture de `renderMarkdown` avec support GFM (titres, gras, italique, barré, citations, tableaux, listes et blocs), isolation des puces du panneau de filtres selon l'univers actif, repositionnement des sous-tops dans `.row-tops-group`, création du bouton pilule `.row-alt-pill`, ajout de la modale `openEditAutoRuleModal`, remplacement du widget tchat flottant par `#chatSidePanel` et du bouton `#chatToggleBtn` dans la Top Bar.

## [v3.0.0] - 2026-08-02

### Ajouté
**Humanisé** : Passage historique à la version 3.0 ! Arrivée majeure des Tops Alternatifs pour gérer deux univers de classement en parallèle, avec possibilité d'ajouter des sous-tops secondaires à la saisie, de regrouper automatiquement les entrées identiques et de basculer l'affichage du Dashboard d'un clic.
**Technique** : `Code.gs` — création des services `AltSettingsService` et `AltStorageService` (gestion de l'onglet `AltCategories`, requêtes analytics et endpoints `apiGetAltCategories`, `apiSaveAltCategories`, `apiGroupSimilarEntries`, `apiLinkHistoryRowsToAltCategory`, `apiGetAltAnalyticsData`). `Index.html` — onglet Paramètres `stab-alt-categories`, sélecteur d'univers `#dashboardUniverseSeg`, bouton `＋ Top supp.`, coche `⭐ Associer à un Top Alternatif` et modale d'affectation d'historique.imilarEntries`, `apiLinkHistoryRowsToAltCategory`, `apiGetAltAnalyticsData`). `Index.html` — onglet Paramètres `stab-alt-categories`, sélecteur d'univers `#dashboardUniverseSeg`, bouton `＋ Top supp.`, coche `⭐ Associer à un Top Alternatif` et modale d'affectation d'historique.

## [v2.6.0] - 2026-07-31

### Modifié
**Humanisé** : Refonte visuelle d'exception et mise en scène du Podium avec socles physiques 3D, badges Or/Argent/Bronze, affichage du total de points, métriques d'écart en temps réel et liste compacte enrichie.
**Technique** : `Index.html` — restructuration du composant Podium avec la hiérarchie `.podium-column` (socles `.podium-step-base` et cartes `.phrase-podium-card`), styles métalliques Or/Argent/Bronze réactifs aux thèmes, et intégration dans `renderPhrasesCard()` des pilules de score (`.phrase-podium-score-chip`) et d'écart (`.phrase-podium-gap`).

## [v2.5.0] - 2026-07-31

### Ajouté
**Humanisé** : Ajout d'une barre de contrôle interactive et d'un fil conducteur temporel sur la page du Changelog (recherche instantanée par mots-clés, filtrage par type de modification ✨/⚡/🐛/🗑️, bascule d'affichage et sélecteurs de plage de versions).
**Technique** : `Index.html` & `Code.gs` — intégration du moteur de rendu réactif `renderChangelogView()`, découpage du cache GitHub par blocs de 90 Ko dans `apiGetChangelog()` pour éviter la limite Apps Script, et structuration SemVer officielle des versions historiques.

## [v2.4.0] - 2026-07-29

### Modifié
**Humanisé** : L'application s'affiche désormais sur une seule page réactive qui s'adapte automatiquement à tous les écrans (PC et mobile), avec contours interactifs sur la légende du graphique du Dashboard.
**Technique** : Suppression de `Mobile.html` et bascule sur une page unique `Index.html` responsive via `doGet()`. Création du plugin canvas `buildLegendBorderPlugin()` pour les boutons de légende du graphique Chart.js.

## [v2.3.0] - 2026-07-28

### Ajouté
**Humanisé** : Consultation du Changelog Git en direct depuis les Paramètres et refonte complète de l'affichage du Barème avec un système d'accordéons dépliables par Top (avec chevrons).
**Technique** : `Code.gs` — endpoint `apiGetChangelog()` interrogeant le dépôt GitHub avec cache `CacheService`. `Index.html` — accordéons interactifs `.bareme-quick-header` et ajustement du défilement sans rognage.t de consulter l'historique complet des mises à jour en direct depuis Git, avec un bouton d'actualisation et une mise en cache automatique.
**Technique** : `Code.gs` — création de l'endpoint `apiGetChangelog()` interrogeant le dépôt GitHub avec cache 10 minutes (`CacheService`). `Index.html` & `Mobile.html` — ajout du sous-onglet `📋 Changelog` sous Paramètres, création des fonctions `renderChangelogMarkup()` / `loadChangelog()` / `renderMChangelogSettings()` pour parser et afficher dynamiquement le Markdown du changelog avec badges et catégories colorisées.

### Corrigé
**Humanisé** : Resolution définitive de l'écran noir du graphique mobile sur iPhone/Safari : correction d'un bug où le plugin d'infobulle retournait un objet sans identifiant au chargement, provoquant un plantage silencieux du moteur Chart.js et empêchant tout dessin sur l'écran.
**Technique** : `Mobile.html` — (1) `buildMobileTooltipPlugin()` garantit le retour permanent de `{ id: 'mCustomTooltip', ... }` pour éviter l'exception `Plugin must have an id` dans Chart.js. (2) Isolation par bloc `try/catch` de `emojiOverlay`, `barTotals`, `donutCenter` et des callbacks d'infobulle pour immuniser le rendu canvas iOS Safari. (3) `renderDashboardShell()` conserve le squelette HTML existant sans détruire `#mChartWrapper` lors des rafraîchissements réseau. (4) Rétablissement des options contextuelles (`#mChartOptionsBar` & `#mDonutPlayerChips`).

**Humanisé** : Correction intégrale de l'interface mobile : refonte complète du Podium (cartes visuelles 1er/2e/3e avec médailles 🥇 🥈 🥉, filigrane d'avatar et couleurs des joueurs comme sur PC), affichage systématique des graphiques du Dashboard à l'arrivée des données, et fermeture fluide du sélecteur d'identité.
**Technique** : `Mobile.html` — (1) Refonte de `renderComments()` avec cartes Podium en échelons (1er au centre surélevé avec médaille d'or) et feed compact pour la 4e place et plus. (2) Déblocage du rendu des graphiques dans `applyBootstrapData()` à la réception des données serveur réelles. (3) Intégration de graphiques Chart.js dans `loadTrendsStat()` et `loadWeekdayStat()`. (4) Élévation du `z-index` de `#mIdentitySheet` à `10000` et ajout de padding de sécurité.

## [v2.2.0] - 2026-07-27

### Corrigé
**Humanisé** : Chargement instantané et correction des bugs d'affichage sur l'interface mobile (suppression du délai d'attente au démarrage, options de saisie et destinataires toujours présents, accordéons de statistiques stables sans blocage).
**Technique** : `Code.gs` — création de `apiGetMobileBootstrap()` regroupant en 1 seul aller-retour réseau l'intégralité des données d'initialisation mobile. `Mobile.html` — implémentation d'un rendu immédiat depuis `localStorage` (`MOBILE_BOOTSTRAP_CACHE_KEY`), mise à jour réactive des sélecteurs de Saisie (`updateInjectRowOptions`) et destinataires de Notes (`updateNotePlayerButtons`), mise en cache des commentaires et remplacement de `outerHTML` par `innerHTML` sécurisé dans les accordéons de statistiques (`loadRecordsStat`, `loadTrendsStat`, `loadWeekdayStat`, `loadPairsStat`, `loadMentionStats`).

### Ajouté
**Humanisé** : Mise en place d'un système d'optimisation globale des performances et de préservation du quota Google Apps Script (cache serveur réactif, sous-statistiques du Dashboard en cache rapide et sondage de tchat adaptatif en arrière-plan).
**Technique** : `Code.gs` — intégration de `CacheService` avec versioning dynamique (`_settingsVersion`, `_chatVersion`, `_baremeVersion`, `_phrasesVersion`, `_notesVersion`, `_logsVersion`) sur `SettingsService`, `ChatService`, `BaremeService`, `PhrasesService`, `NotesService` et les endpoints de sous-statistiques (`apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`). `Index.html` & `Mobile.html` — refonte de `scheduleChatPoll()` / `mScheduleChatPoll()` avec écouteur `visibilitychange` (arrêt complet quand l'onglet est inactif, cadence portée à 20s fermé / 4s ouvert).

### Modifié
**Humanisé** : Personnalisation du texte du bandeau d'invitation vers la version mobile sur desktop.
**Technique** : `Index.html` — modification du libellé du conteneur `#mobileCtaBanner` (`.mobile-cta-text`).

**Humanisé** : Ajout d'une règle d'hygiène dans la documentation interdisant le sondage en boucle (polling) pour préserver le quota de requêtes.
**Technique** : `context.md` — section §8 enrichie avec la règle d'interdiction de polling répété lors des suivis de déploiement GitHub Actions.

**Humanisé** : Correction complète de l'affichage du Barème et des modaux sur mobile : restructuration du barème par Top/Catégorie avec badges de couleur et pastilles de points (parité PC), suppression des tailles de texte surdimensionnées (28px) sur tous les modaux et formulaires d'édition.
**Technique** : `Mobile.html` — refonte de `renderBaremeSettings()`, `openBaremeFormModal()`, `openHistoryEditModal()`, `openEntityFormModal()`, `openPhraseFormModal()` et suppression de toutes les règles inlines `1.65rem` / `1.75rem`.

**Humanisé** : Refonte et nettoyage ergonomique des formulaires de Saisie et de Notes sur mobile : suppression des tailles de texte disproportionnées, ajout de boutons pas-à-pas de points (-5, -1, +1, +5) et de raccourcis de date (Aujourd'hui, Hier).
**Technique** : `Mobile.html` — refonte de `injectRowHtml()`, `renderInjectShell()` et `renderNotesShell()`, harmonisation des labels à `0.78rem` uppercase et boutons tactiles `m-step-btn` / `m-date-shortcut`.

**Humanisé** : Parité absolue et refonte du graphique mobile avec la version PC : affichage des emojis sur les barres et catégories, totaux au sommet des barres, score total au centre du graphique Donut avec sélecteur de joueur, classement détaillé par catégorie, barre d'options contextuelle (Totaux, Log, Détaillé) et jauges de progression visuelles dans les infobulles tactiles.
**Technique** : `Mobile.html` — intégration de `catDisplay()`, `buildEmojiOverlayPlugin()`, `totalsPlugin`, `donutCenterPlugin`, `buildTooltipGauge()`, `renderChartOptionsBar()`, `renderDonutPlayerChips()` et support du mode `ranking` détaillé avec tri et drill-down.

**Humanisé** : Embellissement et renforcement visuel du sélecteur d'identité lorsqu'aucune n'est choisie (halo respirant néon, badge d'alerte lumineux sur l'avatar et secousse/onde de choc accentuée lors d'une action bloquée sur desktop et mobile).
**Technique** : `Index.html` & `Mobile.html` — ajout de la classe `.unselected` gérée dans `renderWhoAmI()` / `renderIdentityBtn()`, keyframes `@keyframes wai-unselected-breath` et badge dot `@keyframes wai-dot-pulse`, réécriture de `@keyframes wai-pulse` pour secousse + onde de choc 0.75s x 2, et gestion de la classe `.pulse` sur mobile dans `requireIdentity()`.

### Ajouté
**Humanisé** : Ajout d'une barre de progression lumineuse en haut de l'écran mobile et d'un spinner réseau dans l'en-tête pour indiquer visuellement chaque chargement de données ou requête serveur.
**Technique** : `Mobile.html` — création du composant `.m-progress-bar` et de `.m-spinner` dans l'en-tête, intégration de la comptabilisation des requêtes actives `_mActiveRequests` (`mShowLoader()` / `mHideLoader()`) dans `callServer()`.

### Corrigé
**Humanisé** : Correction du déclenchement du script sur l'application web mobile (chargement immédiat si le DOM est déjà prêt, correction du bouton de thème sans erreur JS), et repositionnement du bouton de tchat flottant 💬 au-dessus de la barre de navigation inférieure sans superposition.
**Technique** : `Mobile.html` — remplacement de `window.addEventListener('DOMContentLoaded')` par une exécution conditionnelle `document.readyState`, sécurisation d'icon fallback dans `initTheme()`, et calage de la position CSS `.m-chat-fab` (`bottom: calc(72px + env(...))`) et bornes `setPos()` pour libérer l'accès aux boutons de la barre inférieure.

### Modifié
**Humanisé** : Refonte intégrale de l'architecture mobile avec suppression de la barre latérale au profit d'une Navigation Inférieure (Bottom Nav) et d'un En-tête Supérieur (Top Header) fixes. Zone de contenu portée à 100% de la largeur de l'écran, graphiques réactifs pleine largeur, formulaires optimisés au pouce et parité fonctionnelle absolue avec la version PC.
**Technique** : `Mobile.html` — remplacement de `.m-side-nav` par `.m-header` (`52px`) et `.m-bottom-nav` (`58px + safe-area`), conteneur `.m-container` réaligné sur la largeur écran (`max-width: 640px`), ajustement de `setupBottomNav()`, `goToTab()`, `renderIdentityBtn()` et repositionnement du widget tchat flottant (`#mChatFab`).

### Corrigé
**Humanisé** : Refonte intégrale de l'interface mobile et du graphique du Dashboard (taille native fluide sans sur-échelle, contrôles segmentés par pilules, bandeau mini-KPIs et ratio parfait sans déformation).
**Technique** : `Code.gs` — ajout de `.addMetaTag('viewport', ...)` dans `doGet()`. `Mobile.html` — suppression de l'échelle $\times 2.2$, intégration de `#mChartTypeSegmented`, `#mPeriodSegmented`, `maintainAspectRatio: false` sur Chart.js, bandeau `#mQuickKpisBar` et design system CSS réactif.

### Ajouté
**Humanisé** : Refonte de la section Statistiques (onglets pilules glassmorphic, transitions GSAP fluides, cartes de records enrichies) et perfectionnement intégral du Mode Clair (palette Slate lumineuse, contrastes renforcés, infobulles dépolies claires).
**Technique** : `Index.html` & `Mobile.html` — mise à jour des tokens `body.light`, styles `#statsHubTabs`, `.sr-row`, `.sr-hero`, `#chartCustomTooltip` et animation GSAP dans `switchStatsHubPane()`.

### Supprimé
**Humanisé** : Retrait définitif des boutons d'options Lissage / Comparer N-1, des mini-KPIs et du mode "Parts %" pour alléger l'interface du graphique principal.
**Technique** : `Index.html` — suppression de `#chartKpisBar`, des toggles `chartToggleSma` et `chartToggleN1`, de la fonction `updateChartKpis` et du bouton `parts`.

### Modifié
**Humanisé** : Retrait complet du défilement doux Lenis Scroll sur desktop et mobile — retour au défilement natif fluide et réactif de la plateforme.
**Technique** : `Index.html` et `Mobile.html` — suppression de la bibliothèque CDN Lenis, des instances de scroll et des écouteurs `requestAnimationFrame` associés.

### Ajouté
**Humanisé** : Refonte visuelle et interactive complète de l'interface mobile (`Mobile.html`) — défilement Lenis tactile, animations GSAP keyframe sur les onglets ("hyperframes"), cartes glassmorphic réactives au toucher (Spotlight cards) et boutons magnétiques.
**Technique** : `Mobile.html` — ajout du CDN Lenis Scroll, intégration `initLenisMobile()` et `initSpotlightCardsMobile()`, rehaussement du thème CSS avec gradients de fond et flou de fond (`backdrop-filter: blur(20px/24px)`), transitions d'onglets animées par GSAP keyframes (`goToTab()`).

**Humanisé** : Suite graphique enrichie — bandeau de mini-KPIs dynamiques (Total, Moyenne/j, Peak), nouveau type de graphique "Parts %" (proportions 100%), bouton de lissage (moyenne glissante), lueurs néon sur les courbes et mise en valeur interactive des séries au survol.
**Technique** : `Index.html` — ajout de `#chartKpisBar` (`updateChartKpis`), nouveau type `parts`, toggles `chartToggleSma` et `chartToggleN1`, plugins Chart.js `glowShadowPlugin` et `seriesHighlightPlugin`.

**Humanisé** : Les préférences du style de l'infobulle des graphiques (couleurs des paliers, jauge, lueur) sont maintenant sauvegardées sur le serveur dans la feuille Settings et conservées entre les appareils.
**Technique** : `Code.gs` — nouvel endpoint `apiSaveTooltipStyle()` et mise à jour de `apiGetAppSettings()` pour lire/écrire la clé `tooltip_style` dans la feuille `Settings`. `Index.html` — `saveTooltipStylePrefs()` synchronise les changements avec le serveur de façon transparente.

### Corrigé
**Humanisé** : Refonte visuelle complète du panneau Filtres croisés — suppression du fond sombre lourd et des blocs rectangulaires au profit de pilules fluides et translucides (glassmorphism).
**Technique** : `Index.html` — `.filter-panel` passe en glassmorphism translucide (`rgba(15,20,29,0.65)`, `backdrop-filter: blur(20px)`), `.fchip` et `.date-shortcut` deviennent des pilules arrondies avec bordures subtiles (`border-radius: 9999px`), survol dynamique et halo lumineux sur l'état actif.

**Humanisé** : La barre supérieure de navigation et le bandeau de statistiques rapides ne défilent plus à la verticale lors du survol à la molette.
**Technique** : `Index.html` — `.navbar` passe à `overflow: visible`, `.quick-stats-bar` et `.nav-btn-group` ont désormais `overflow-y: hidden` explicite pour bloquer les défilements verticaux parasites.

### Ajouté
**Humanisé** : Refonte visuelle et interactive complète de l'interface — intégration du défilement doux (Lenis), d'un moteur d'animations réactives (GSAP 3), de cartes interactives à lumière dynamique (Spotlight Cards) et d'une esthétique glassmorphism moderne.
**Technique** : `Index.html` et `Mobile.html` — ajouts des CDN GSAP 3 et Lenis Scroll ; refonte du système de tokens CSS (`:root`, `body.light`) avec arrières-plans à mesh gradient, glassmorphism (`backdrop-filter: blur()`), bordures lumineuses et effets de survol magnétiques ; intégration du tracker de curseur `--mouse-x`/`--mouse-y` (`initSpotlightCards()`) ; transition d'onglets animée par GSAP keyframes (`goToTab()`).

## [v2.1.0] - 2026-07-26

### Corrigé
**Humanisé** : Répartir un total sur une période fonctionne enfin. Avant, si on ne cliquait qu'une seule date dans le mini-calendrier, la fin de période restait vide et tous les points atterrissaient sur un seul jour, sans prévenir. Maintenant le premier clic crée une période d'un jour, le second l'étend — la fin n'est jamais vide.
**Technique** : `Index.html` — `createMiniCalendar()` : sélection par ancre (`anchor`) au lieu du couple start/end vide ; le 1er clic pose `start = end = jour cliqué`, le 2e étend (ordre inversé géré). Filet supplémentaire dans `submitBulk()` : en mode période, `dateEnd` vide retombe sur `dateStart` au lieu de ramener silencieusement la ligne en mode date simple.

**Humanisé** : Les jours du mini-calendrier débordaient hors de son cadre et paraissaient décalés — c'est corrigé.
**Technique** : `Index.html` — `.d-cal-day` héritait du `min-height: var(--tap-min)` (44px) global des boutons, plus large que sa colonne de grille : `min-height: 0`, hauteur fixe 32px, `width: 100%` et `box-sizing: border-box`.

### Ajouté
**Humanisé** : Le mini-calendrier gagne la saisie manuelle des deux dates (champs « Du » et « Au »), un aperçu de la période au survol avant le second clic, un bouton « Auj. » pour revenir au mois en cours, et le jour du jour est désormais mis en évidence.
**Technique** : `Index.html` — `createMiniCalendar()` : bloc `.d-cal-manual` (deux `input[type=date]` synchronisés, borne à l'envers → l'autre borne suit), survol `.is-preview`, bouton `.d-cal-today`, `.d-cal-day.is-today` en couleur d'accent.

**Humanisé** : Nouveaux raccourcis de période dans la saisie d'un lot : durées à partir du jour de début (+3 j, +7 j, +14 j, +1 mois), plus « Semaine en cours » et « Semaine préc. » dans les plages prédéfinies.
**Technique** : `Index.html` — nouvelle rangée `durationShortcuts` dans le panneau « Une période » ; deux entrées ajoutées à `rangePresetItems()` (partagée avec le Dashboard).

### Modifié
**Humanisé** : L'aperçu du mode « Un total à répartir » annonce le découpage réel jour par jour (ex. « 10 pts ÷ 3 jours = 4 pts sur 1 jour, 3 sur les 2 autres ») au lieu d'une moyenne à virgule qui ne correspondait pas à ce qui était enregistré.
**Technique** : `Index.html` — `updateDatePreview()` reproduit le calcul entier de `submitBulk()` (`base` + `rem`) et signale les cas limites (période d'1 jour, points insuffisants).

## [v2.0.0] - 2026-07-23

### Ajouté
**Humanisé** : Un nouveau bouton « Tout exporter » télécharge en un clic un zip contenant l'infographie de chaque type de graphique compatible (Empilé, Groupé, Courbes, Radar), avec les filtres actuellement actifs.
**Technique** : `Index.html` — nouveau bouton `#exportAllBtn` et fonction `exportAllCharts()` : parcourt `BATCH_EXPORT_CHART_TYPES`, appelle `switchChartType(type, onDone)` (paramètre `onDone` ajouté, additif, à `switchChartType`/`applyFilters`) pour attendre chaque rendu, capture chaque graphique via `buildInfographicCanvas`, puis zippe le tout avec `fflate` (chargée à la demande via `EXPORT_LIBS.zip`, même pattern que jsPDF/xlsx). Le graphique visible revient au type d'origine une fois l'export terminé.

### Ajouté
**Humanisé** : L'infographie exportée peut maintenant afficher, en option, le joueur ayant le plus progressé (ou régressé) par rapport à la période équivalente précédente.
**Technique** : `Index.html` — nouvelle option `topMover` dans `openExportModal()` ; `computeTopMover()` compare les totaux de la période active à ceux d'une période précédente de même durée (`computePreviousPeriodRange()`, un appel `apiGetFilteredData` supplémentaire) ; le résultat (`exportOpts._topMoverResult`, non persisté) est dessiné en pill par `buildInfographicCanvas()`. Omis silencieusement si aucune période explicite n'est active.

### Ajouté
**Humanisé** : Un bouton « Copier » a été ajouté à côté de « Télécharger » dans la fenêtre d'export d'infographie — l'image peut être collée directement ailleurs (chat, éditeur) sans passer par le fichier téléchargé.
**Technique** : `Index.html` — `openExportModal()` : nouveau bouton `copyBtn` utilisant `navigator.clipboard.write()` avec un `ClipboardItem` construit depuis `canvas.toBlob()`. Masqué si `window.ClipboardItem` est indisponible ou si le format sélectionné est `pdf`.

### Ajouté
**Humanisé** : L'export CSV du Dashboard indique maintenant en haut du fichier la période et les filtres actifs au moment de l'export, ainsi que la date d'export — avant, seul le tableau de chiffres était présent.
**Technique** : `Index.html` — nouvelle fonction `buildExportContextLines()` réutilisée par `exportAsCSV()` ; le CSV est préfixé de 4 lignes commentées (`# Clé : Valeur`) avant le tableau de données.

### Ajouté
**Humanisé** : L'export Excel du Dashboard contient maintenant 2 onglets en plus du tableau habituel : un classement (rang, total, écart avec le joueur suivant) et le contexte de l'export (période, filtres, date).
**Technique** : `Index.html` — `exportAsExcel()` ajoute les onglets `Classement` (via nouvelle fonction `computeRankingWithGaps()`) et `Contexte` (via `buildExportContextLines()`, partagée avec `exportAsCSV()`).

### Modifié
**Humanisé** : La fenêtre d'export d'infographie se souvient maintenant des derniers réglages choisis (thème, résolution, options cochées) au lieu de repartir des valeurs par défaut à chaque ouverture.
**Technique** : `Index.html` — `openExportModal()` initialise `exportOpts` via nouvelle fonction `loadStoredExportOpts()` (localStorage, clé `exportOpts_v1`) au lieu d'un objet littéral fixe ; chaque mutation (`pillGroup`, `checkOpt`, filigrane) appelle `saveExportOpts()`. Le titre personnalisé n'est volontairement pas persisté.

## [v1.9.0] - 2026-07-22

### Modifié
**Humanisé** : Dans Saisir un lot, les boutons rapides de barème (raccourcis pour appliquer un nombre de points prédéfini) s'affichent maintenant du plus petit score au plus grand, au lieu d'un ordre imprévisible.
**Technique** : `Index.html` — `renderBaremeQuickBtns()` : les entrées filtrées sont triées par `pts` croissant avant le rendu des `.bq-btn`.

## [v1.8.0] - 2026-07-21

### Modifié
**Humanisé** : La zone « Créé par / Modifié par » prenait trop de place sur une ligne à part au-dessus des boutons Éditer/Supprimer. Elle est maintenant alignée sur la même ligne que ces boutons (pastilles à gauche, actions à droite), plus compacte.
**Technique** : `Index.html`/`Mobile.html` — `.note-meta`/`.m-note-meta` et `.note-actions`/`.m-hist-actions` fusionnés dans un conteneur `.note-footer`/`.m-note-footer` unique (`flex-wrap`, meta en `flex:1`, actions en `margin-left:auto`). Avatars réduits (20→16px desktop, 24→20px mobile), suppression de la date affichée sur la pastille « Modifié par » (déplacée dans l'attribut `title`) pour gagner en largeur.

### Modifié
**Humanisé** : Créé par / Modifié par sont de nouveau écrits directement sur la note (comme au tout début), au lieu d'être recalculés à chaque fois depuis le Journal — plus simple, plus direct, les deux pastilles s'affichent ensemble sans dépendre d'une correspondance à retrouver. Le Journal ne sert plus qu'à l'historique détaillé (le popover listant chaque modification).
**Technique** : `Code.gs` — feuille `Notes` étendue à 7 colonnes (`Date | Joueur | Note | NoteId | CrééPar | ModifiéPar | ModifiéLe`), migration douce via `NotesService._ensureColumns()`. `addNote()` écrit `CrééPar` à la création ; `editNote(rowIndex, newText, editor)` écrit `ModifiéPar`/`ModifiéLe` directement (et backfille le `NoteId` si absent). `getAllNotes()` lit ces colonnes telles quelles, sans dérivation. Suppression de `_noteAuthorsByNoteId()`/`_computeNoteAuthorsByNoteId()` (cache + calcul depuis le journal, devenus inutiles). `apiBackfillNoteAuthors` retrouve toujours l'auteur des notes anciennes en remontant la chaîne d'éditions dans le Journal, mais écrit désormais le résultat directement dans les colonnes plutôt que de retaguer des entrées de journal. `NoteId` reste utilisé uniquement par `apiGetNoteHistory()` pour l'historique détaillé.

### Modifié
**Humanisé** : Zone « Créé par / Modifié par » d'une note retravaillée visuellement — séparée du texte par une ligne pointillée au lieu d'un simple espacement, noms en gras, avatar cerclé plus grand, et le bouton « Modifié par » se distingue clairement comme cliquable (chevron qui s'anime au survol/tap).
**Technique** : `Index.html` — `.note-meta` : `border-top: dashed`, `padding-top`, pastilles sans fond/bordure sauf `.note-meta-edited` (seule actionnable) ; noms enveloppés en `<strong>`, `.note-meta-chevron` ajouté. `Mobile.html` — même traitement à l'échelle tactile (`.m-note-meta-*`).

### Corrigé
**Humanisé** : Le bouton « Rattacher » ne retrouvait que « Modifié par » sur une note créée puis modifiée — jamais « Créé par » en même temps. Il remonte maintenant toute la chaîne d'éditions d'une note (chaque modification jusqu'à la création d'origine) pour retrouver et afficher les deux pastilles ensemble dès que le fil se reconstitue entièrement.
**Technique** : `Code.gs` — `apiBackfillNoteAuthors` : après avoir localisé la dernière modification d'une note (Après == texte actuel), son champ Avant (`"joueur : texte précédent"`) est retesté contre l'index des créations, puis, si toujours pas trouvé, contre l'index des modifications avec ce texte précédent comme nouvelle cible — et ainsi de suite (plafond de sécurité 50 sauts) jusqu'à retrouver la création d'origine ou jusqu'à ce que la chaîne casse (correspondance absente ou ambiguë, jamais devinée). Toutes les entrées de la chaîne reconstituée (création + chaque modification traversée) sont retaguées avec le même NoteId — l'historique complet redevient visible dans le popover, pas seulement la dernière modification.

### Corrigé
**Humanisé** : Le popover d'historique d'une note (ouvert en cliquant sur « Modifié par ») restait figé à l'écran pendant qu'on faisait défiler la page, au lieu de rester collé au bouton — il se recale maintenant en continu, et se ferme si le bouton sort de l'écran.
**Technique** : `Index.html` — `openNoteHistoryPopover()` : la position (`position:fixed`, calculée une fois via `getBoundingClientRect()`) était figée à l'ouverture. Nouvelle fonction `reposition()` rappelée sur `scroll` (capture, pour les conteneurs scrollables imbriqués) et `resize`, tant que le popover est ouvert ; fermeture automatique si le bouton sort du viewport. Écouteurs nettoyés dans `closeNoteHistoryPopover()`.

### Corrigé
**Humanisé** : Le bouton « Rattacher » ne retrouvait l'auteur que des notes jamais retouchées depuis leur création — toutes celles créées **et** modifiées depuis restaient ignorées (le texte actuel ne correspondait plus à sa version d'origine). Il cherche maintenant aussi une correspondance sur la dernière modification enregistrée.
**Technique** : `Code.gs` — `apiBackfillNoteAuthors` passe de un à deux index sur le Journal : `byCreation` (entrées « Note ajoutée », clé `"joueur : texte"`, format historique) et `byEdit` (entrées « Note modifiée », clé `"texte"` seul — l'ancien format n'incluait pas le joueur dans le champ Après d'une édition). Une note sans NoteId est d'abord testée contre `byCreation` (note jamais modifiée : Créé par retrouvé), puis contre `byEdit` (note modifiée depuis : seul Modifié par est retrouvé — remonter plus loin dans l'historique s'appuierait sur l'ancien numéro de ligne, pas fiable). Toujours aucune correspondance acceptée si ambiguë (texte dupliqué dans plusieurs entrées).

### Ajouté
**Humanisé** : Dans Paramètres → 🔧 Outils, un nouveau bouton « Rattacher » retrouve dans le Journal l'auteur des notes créées avant l'introduction du suivi Créé par/Modifié par — uniquement quand la note n'a jamais été modifiée depuis (correspondance certaine et unique dans le journal, jamais de devinette). Par ailleurs, toute note ancienne devient automatiquement traçable dès qu'on la modifie, plus besoin d'attendre un rattachement.
**Technique** : `Code.gs` — `NotesService.editNote()` génère et écrit un `NoteId` à la volée si la ligne n'en a pas encore (note antérieure au suivi), et le renvoie pour que `apiEditNote` journalise avec le bon `Détail: "note:<id>"`. Nouvel endpoint `apiBackfillNoteAuthors(author)` : indexe les entrées "Note ajoutée" du Journal par contenu exact (`"joueur : texte"`), et pour chaque note sans NoteId dont le texte correspond à **une seule** entrée (pas d'ambiguïté), génère un NoteId et retague le Détail de cette entrée d'audit (`note:<id>`) — la note devient alors visible via le mécanisme normal (`_computeNoteAuthorsByNoteId`), sans duplication de données. Notes ambiguës (texte dupliqué) ou déjà éditées (texte modifié depuis) : laissées sans correspondance, honnêtes plutôt que devinées. `Index.html` — bouton `#backfillNoteAuthorsBtn` dans la carte Santé & nettoyage. Non ajouté à `Mobile.html` (onglet Outils volontairement réduit côté mobile).

### Corrigé
**Humanisé** : « Créé par » ne s'affichait jamais, même sur une note toute juste créée — retiré aussi la pastille « Auteur inconnu » ajoutée en attendant de trouver la vraie cause.
**Technique** : `Code.gs` — bug dans `_computeNoteAuthorsByNoteId()` : le filtre exigeait `Entité === 'Note'`, mais `apiAddNote` journalise « Note ajoutée » avec `Entité: 'Note: ' + joueur` (pour un affichage plus lisible dans l'onglet Journal), jamais `'Note'` seul — `createdBy` ne matchait donc jamais. Le filtre repose maintenant uniquement sur le Détail `"note:<id>"` (déjà un identifiant unique posé par les 3 endpoints notes), sans condition sur l'Entité. `Index.html`/`Mobile.html` — pastille de repli `.note-meta-unknown`/`.m-note-meta-unknown` retirée ; la ligne méta redevient simplement masquée quand aucune donnée n'existe (notes antérieures à cette fonctionnalité).

### Modifié
**Humanisé** : Le calcul de « Créé par / Modifié par » (qui relit le Journal d'audit) est maintenant mis en cache entre les requêtes, comme le reste des données de l'app — pas de relecture complète du journal à chaque ouverture de la page Notes.
**Technique** : `Code.gs` — `_noteAuthorsByNoteId()` enveloppe désormais `_computeNoteAuthorsByNoteId()` (logique inchangée) avec le même cache cross-requête que `getAllLogs()`/`getFullHistoryRowsCached()` : `CacheService.getScriptCache()`, clé `note_authors_v` + `_logsVersion()` (déjà incrémenté par `withLock()` à chaque écriture, notes incluses), TTL `CONFIG.CACHE_TTL_SECONDS`.

### Modifié
**Humanisé** : Refonte de « Créé par / Modifié par » sur les notes : ces informations ne sont plus recopiées sur la ligne de la note, elles sont retrouvées à la volée dans le Journal d'audit (déjà la source de vérité pour l'historique) — plus aucune donnée dupliquée. Corrige au passage un bug de fond : l'historique d'une note pouvait, après suppression d'une autre note plus haut dans la liste, se mélanger avec celui d'une note différente (numéro de ligne recyclé). Les notes créées avant cette fonctionnalité (aucune trace dans le journal) affichent maintenant une pastille explicite « Auteur inconnu (note antérieure) » au lieu de rien du tout.
**Technique** : `Code.gs` — feuille `Notes` réduite à 4 colonnes (`Date | Joueur | Note | NoteId`, migration douce via `NotesService._ensureNoteIdColumn()`, colonnes `Auteur/ModifiéPar/ModifiéLe` de l'ancien schéma ignorées). `addNote()` génère un `NoteId` opaque (`_generateGroupId()`) qui voyage avec la note quel que soit son numéro de ligne. `apiAddNote`/`apiEditNote`/`apiDeleteNote` journalisent désormais `Détail: "note:<NoteId>"` au lieu de `"ligne #<rowIndex>"`. Nouvelle fonction `_noteAuthorsByNoteId()` : une passe sur le Journal, regroupée par NoteId, dérive `createdBy` (1ʳᵉ entrée « Note ajoutée ») et `lastEditedBy`/`lastEditedAt` (dernière entrée « Note modifiée ») — consommée par `getAllNotes()`. `apiGetNoteHistory(noteId)` filtre désormais par NoteId (avant : par numéro de ligne, vulnérable au décalage après suppression). `Index.html`/`Mobile.html` — `openNoteHistoryPopover()` reçoit `note.noteId` ; pastille de repli `.note-meta-unknown`/`.m-note-meta-unknown` quand aucune donnée n'est trouvée.

### Ajouté
**Humanisé** : Chaque note affiche maintenant qui l'a créée, et si elle a été modifiée, par qui et quand.
**Technique** : Feuille `Notes` étendue de 3 à 6 colonnes (`Date | Joueur | Note | Auteur | ModifiéPar | ModifiéLe`), migration douce via `NotesService._ensureAuthorColumns()` (ajoute les en-têtes manquants sans toucher aux notes existantes). `addNote(player, text, dateStr, author)` et `editNote(rowIndex, newText, editor)` écrivent désormais l'auteur/l'éditeur ; `getAllNotes()` renvoie `createdBy`/`lastEditedBy`/`lastEditedAt`. `apiAddNote`/`apiEditNote`/`apiDeleteNote` (Code.gs) journalisent sur 6 colonnes au lieu de 3. `Index.html`/`Mobile.html` : ligne `.note-meta`/`.m-note-meta` sous chaque note.

**Humanisé** : Sur une note, « Créé par » et « Modifié par » sont maintenant deux pastilles bien visibles au lieu d'une petite ligne de texte discrète. Cliquer sur « Modifié par » ouvre un petit historique : la liste de toutes les versions du texte, avec qui a modifié et quand.
**Technique** : `Code.gs` — nouvelle fonction `apiGetNoteHistory(rowIndex)` qui filtre le Journal d'audit (`entity==='Note'`, `action==='Note modifiée'`, `detail==='ligne #'+rowIndex`) et renvoie les couples avant/après texte, du plus récent au plus ancien (aucune nouvelle donnée stockée, réutilise les entrées déjà journalisées par `apiEditNote`). `Index.html` — `buildNoteCard()` remplace le texte `.note-meta` par des pastilles `.note-meta-item`, la pastille « Modifié par » est un bouton qui ouvre `openNoteHistoryPopover()` (popover positionné façon `whoAmIDropdown`, fermeture au clic extérieur). `Mobile.html` — mêmes pastilles `.m-note-meta-item` en échelle tactile ; le bouton `[data-history]` ouvre `openModal()` avec le même historique.

### Corrigé
**Humanisé** : Sur le Dashboard, la petite fenêtre qui apparaît au survol d'une barre du graphique pouvait rester affichée à l'écran même après avoir bougé la souris ailleurs sur la page.
**Technique** : `Index.html`/`Mobile.html` — ajout d'un filet de sécurité `mousemove`/`touchstart` au niveau du document : si le curseur (ou le doigt) n'est ni dans le canvas du graphique ni dans la bulle `#chartCustomTooltip`/`#mChartCustomTooltip`, elle est masquée. Vient compléter le `mouseleave` existant sur le canvas, insuffisant dans certains cas de survol rapide.

### Modifié
**Humanisé** : Dans la barre de navigation, survoler un onglet pour voir son nom ne fait plus bouger les onglets voisins (le nom apparaissait en poussant la largeur du bouton, ce qui décalait tout et rendait les clics imprécis à la souris). Le nom s'affiche maintenant comme une petite bulle flottante sous l'icône, sans jamais déplacer les autres onglets ni changer la taille des boutons.
**Technique** : `Index.html` — `.nav-btn-label` reste masqué (`display:none`) sauf pour l'onglet actif (affiché en ligne comme repère permanent). Au survol, une bulle unique `#navHoverTip` (`position:fixed`, style `var(--card)`/`var(--border)` cohérent avec le reste de l'app) est positionnée sous le bouton via `initNavHoverTip()` (délégation `mouseover`/`mouseout` sur `#desktopNavGroup`). Corrige une première tentative où le libellé était en `position:absolute` *dans* le bouton : `.nav-btn-group` étant `overflow-x:auto`, le navigateur force `overflow-y:auto` en retour et rognait la bulle, la rendant invisible.

### Ajouté
**Humanisé** : Dans la bulle qui s'affiche au survol d'une barre du Dashboard, le nombre de points par Top change maintenant d'aspect selon qu'il est faible, dans la moyenne, ou nettement au-dessus : gris discret, blanc normal, orange, rouge lumineux, puis un effet « lave en fusion » pulsant pour les valeurs vraiment exceptionnelles. Le seuil n'est pas fixe : il se recalcule à chaque survol sur la moyenne réelle des joueurs affichés pour ce Top précis.
**Technique** : `Index.html`/`Mobile.html` — nouvelle fonction `pointValueTier(value, sampleValues)` : calcule la moyenne de `dp.dataset.data` (l'échantillon réellement affiché pour ce Top) et classe `value` par ratio à cette moyenne (`<0.6` froid, `<1.4` normal, `<2.2` chaud, `<3.2` incandescent, au-delà « blaze » animé). Appliqué dans `buildCustomTooltipPlugin`/`buildMobileTooltipPlugin` via une classe CSS sur `.ctt-val` (`.pv-cold/.pv-normal/.pv-warm/.pv-hot/.pv-blaze`), animation `@keyframes` respectant `prefers-reduced-motion`. Aucun seuil ni échelle codés en dur — tout dérive de la donnée du survol en cours.

### Modifié
**Humanisé** : La barre de navigation est plus compacte : les onglets n'affichent plus que leur icône, le nom apparaît au survol ou quand l'onglet est ouvert.
**Technique** : `Index.html` — `navButtonHtml()` sépare icône (`.nav-btn-icon`) et libellé (`.nav-btn-label`, `max-width:0` par défaut, déployé au `:hover`/`.active` via transition CSS).

**Humanisé** : Le record absolu (le meilleur score jamais fait en une seule entrée) apparaît maintenant dès l'ouverture du Dashboard, dans le bandeau résumé en haut de page — plus besoin d'aller chercher dans les statistiques du bas.
**Technique** : `Code.gs` — `apiGetQuickStats()` calcule et renvoie `stats.globalBest`. `Index.html` — nouvelle pill `#qsRecordPill` dans `#quickStatsBar`, alimentée par `loadQuickStats()`, clic renvoie vers l'onglet Records du hub Statistiques (`goToRecords()`).

**Humanisé** : Dans la légende du graphique principal, cliquer sur un Top le barre/masque à nouveau individuellement (comme avant), au lieu d'isoler ce Top et de masquer tous les autres. La légende est aussi un peu plus soignée (points ronds, espacement).
**Technique** : `Index.html` — `isolatableLegendOnClick` remplacé par `toggleLegendOnClick` (toggle classique par dataset/segment) ; nouveau helper `CHART_LEGEND_LABELS(c)` (`usePointStyle`, `pointStyle:'circle'`, `boxWidth/boxHeight`, `padding`) appliqué aux 3 configurations de légende (stacked/grouped/radar/doughnut, courbes, classement détaillé).

**Humanisé** : Le choix de date/période dans la saisie de lot est repensé pour être vraiment intuitif. Un interrupteur clair remplace la case à cocher : **« Un jour »** (par défaut, le cas courant) ou **« Une période »**. En mode période, un **mini-calendrier** s'ouvre : on clique le 1er jour puis le dernier, et la période se colore entre les deux — fini les deux champs de dates abstraits et le filtre par jour de la semaine (retiré, inutile pour l'usage réel). Le choix « Répéter / Répartir » devient deux options en français clair — **« Le même score chaque jour »** ou **« Un total à répartir »** — avec un **aperçu chiffré live** (« 3 pts ÷ 7 jours ≈ 0,4 / jour ») pour voir l'effet sans deviner. Le bloc « date par défaut » adopte le même interrupteur et le même langage.
**Technique** : `Index.html` — la cellule date (`.d-cell`) passe d'un affichage inline permanent (champ + 8 chips + case Plage + Répéter/Répartir + sélecteur de jours) à un interrupteur segmenté `.d-mode-seg` pilotant deux panneaux `.d-single` / `.d-period`. Nouveau composant `createMiniCalendar(startInput, endInput, onChange)` (sélection de période continue, navigation de mois, surbrillance `.in-range`/`.is-end`) ; `createFillToggle` refait en options plain-language (`.fill-choice`/`.fill-opt`, `data-fill`) avec callback `onChange` ; ligne d'aperçu `.d-fill-preview` mise à jour via `updateDatePreview()` (branchée sur points, calendrier, mode, fill). Helpers `daysBetweenInclusive()` + `MONTHS_FR`. Les hooks de lecture sont conservés (`.d-start`/`.d-end`/`.range-cb` caché = mode période/`.line-fill`/`.day-picker-wrap` caché à `'[]'`) → envoi/duplication inchangés ; `applyDateAllBtn` réécrit via `row.__applyDate()` + helper `setLineFill()`. Code mort retiré (`buildRowRangePresets`, `datePillLabel`, CSS pastille/popover/`.row-range-details`). `Mobile.html` inchangé (saisie de lot mobile à date unique, sans période — choix assumé).

### Modifié
**Humanisé** : Le bouton pour passer à la version mobile est plus clair et plus facile à trouver. Fini l'icône 🖥️ ambiguë perdue tout à droite d'une barre qu'il fallait faire défiler : c'est maintenant une pastille « 📱 Mobile » qui reste toujours visible. Sur téléphone, seuls les onglets défilent horizontalement ; le titre à gauche et les boutons de droite (thème, identité, mobile) restent épinglés.
**Technique** : `Index.html` — `.layout-mode-toggle` repensé en pastille libellée (icône + « Mobile »). La barre ne défile plus en bloc : `.nav-container` passe de `min-width:max-content` à `min-width:0` et seul `.nav-btn-group` (les onglets) scrolle horizontalement (`flex:1;overflow-x:auto`, scrollbar masquée), donc brand + contrôles de droite restent épinglés. `Mobile.html` inchangé (bascule « 🖥️ Version PC » déjà bien placée dans le menu latéral).

### Modifié
**Humanisé** : L'onglet ❓ Guide est refait. Fini le long accordéon de texte : une grille de cards par thème (Dashboard, Saisir un Lot, Paramètres, Notes, Historique, Tchat, Barème, Thème & identité) — clique sur une card pour voir son contenu en détail, avec un bouton retour. Le contenu couvre aussi ce qui manquait : le tchat flottant, le Journal d'audit, le sous-onglet Outils au complet (joueurs inactifs, points automatiques, sommaire de navigation…), la bascule de thème et le système d'identité/mot de passe. Identique sur mobile (grille en 1 colonne).
**Technique** : `Index.html` — accordéon `.guide-section`/`.guide-body` remplacé par `.guide-grid`/`.guide-tile` + `.guide-detail`, contenu par thème dans des `<template>` (`guideContent-*`), logique `openGuideDetail()`/`closeGuideDetail()` dans `initGuideAccordion()` (nom conservé, appelé par `goToTab`). `Mobile.html` — `GUIDE_SECTIONS` passe d'un tableau `{title, body}` rendu en `.m-accordion` à un tableau `{key, icon, title, body}` rendu en `.m-guide-grid`/`.m-guide-tile` + `.m-guide-detail`, nouvelles fonctions `openMGuideDetail()`/`closeMGuideDetail()`. Aucun changement de données ni d'appel serveur.

### Modifié
**Humanisé** : Dans le Dashboard, les stats Records, Duo le plus fréquent et Mentions ne ressemblent plus à des lignes de réglages : elles adoptent un vrai style « livre des records » — une médaille dorée/argent/bronze pour le podium, l'avatar de chaque joueur cerclé de sa couleur, et le chiffre bien lisible à droite. Le record absolu s'affiche en tête dans une carte trophée dorée, et le duo le plus complice montre les deux avatars côte à côte. PC et mobile, thèmes clair et sombre.
**Technique** : `Index.html` — nouveau kit CSS « livre des records » (`.sr-list`/`.sr-row`/`.sr-rank` médaillé or/argent/bronze, `.sr-avatar` cerclé de `--sr-accent`, `.sr-hero` doré, `.sr-avatar-cluster` pour les duos, `.sr-section`) + tokens `--medal-gold/silver/bronze`. Constructeurs DRY `buildStatRow(cfg)`/`buildStatRank(rank)`/`playerMetaOf(name)` partagés par `scanRecords`/`scanTopPairs`/`loadMentionStats`, qui remplacent leurs anciennes lignes `.tool-action`. Helper `categoryPill(name)` factorisé (pastille de Top emoji+nom teintée) et réutilisé aux 6 endroits qui reconstruisaient ce bloc à l'identique. `Mobile.html` — mêmes tokens + kit `.sr-*` à l'échelle tactile, constructeurs string `mStatRank`/`mStatRow`/`mStatHero`/`mSrAvatar` ; `loadRecordsStat`/`loadPairsStat`/`loadMentionStats` réécrits sur ce kit (Tendances et Jour actif laissés tels quels : la métaphore de podium n'a pas de sens pour une évolution ou une répartition par jour). Aucun changement de données ni d'appel serveur.

### Corrigé
**Humanisé** : Dans le tchat, envoyer un message faisait grandir le panneau vers le bas jusqu'à le faire déborder de l'écran ; et après un long message, la zone de saisie restait haute. Le panneau se recale maintenant à chaque message pour rester au-dessus du bouton (il grandit vers le haut), et la zone de saisie reprend sa taille normale après envoi. PC et mobile.
**Technique** : `Index.html`/`Mobile.html` — `renderChatMessages()`/`mRenderChatMessages()` rappellent `positionChatPanel()` en `requestAnimationFrame` après rendu (le panneau est ancré par son `top` en px, donc grandissait vers le bas sans réancrage). `sendChatMessage()`/`mSendChatMessage()` rappellent la fonction `fit` de `autoGrowTextarea` (capturée dans `_chatInputFit`/`_mChatInputFit`) après avoir vidé le champ.

### Ajouté
**Humanisé** : Les plages rapides de dates (Aujourd'hui, 7 jours, Ce mois…) arrivent aussi dans le Journal d'audit, avec le même bouton ✕ pour effacer. Et partout où une liste est classée par date (Historique et Journal sur PC, Historique sur mobile), un bouton bascule « ↓ Récents / ↑ Anciens » permet d'inverser l'ordre d'affichage.
**Technique** : `Index.html` — helpers réutilisables `dateRangePreset()` + `DATE_RANGE_CHIPS` + `setupDateRangeControls()` (chips générées, plus de HTML en dur) ; l'Historique est refactoré dessus et le Journal (`#auditRangeChips`, `#auditDateClearBtn`) le réutilise. `setupDateSortToggle()` câble les boutons `#histSortBtn`/`#auditSortBtn` ; état `_histSortDir`/`_auditSortDir` passé à `apiGetHistoryPage`/`apiGetAuditLog` (et intégré à la clé de préchargement `histPrefetchKey`). `Mobile.html` — bouton `#mHistSortBtn` + `mHistSortDir`. `Code.gs` — `getHistoryPage(...,sortDir)` (saute le `reverse` si `'asc'`) et `apiGetAuditLog(...,sortDir)` (réordonne `filtered` si `'asc'`) ; paramètres optionnels, comportement par défaut inchangé. Test `getHistoryPage honours sortDir` ajouté (111 tests verts).

### Corrigé
**Humanisé** : Revue générale du code (audit multi-angles) — plusieurs correctifs de fiabilité et de cohérence sans changement visible sur les fonctionnalités existantes. Les règles automatiques de points pouvaient être créées, modifiées, supprimées ou déclenchées sans confirmer son identité (seule la saisie manuelle l'exigeait) ; une règle pouvait aussi être créée avec un nom de joueur ou de Top introuvable, sans avertissement, et ne se déclenchait alors jamais. Renommer un joueur ou un Top ne mettait à jour que l'historique — pas le barème, les commentaires configurés pour ce Top, ni les règles automatiques, qui restaient orphelins silencieusement. Dans le tchat flottant, deux réponses du serveur qui se chevauchent (connexion lente) pouvaient afficher des messages dans le désordre. Enfin, sauvegarder le preset de commentaires actif provoquait une erreur silencieuse en cas de succès.
**Technique** : `AutoPoints.gs` — `requireAuthor(author)` ajouté en tête de `apiAddAutoRule`/`apiUpdateAutoRule`/`apiDeleteAutoRule`/`apiSetAutoTrigger`/`apiRunAutoRulesNow` ; `apiSetAutoTrigger` enrobé dans `withLock()` (seul endpoint mutateur qui ne l'était pas) ; `_validate()` vérifie désormais l'existence du joueur/Top via `SettingsService.getEntities()` avant d'accepter une règle. `Code.gs` — `SettingsService.renameEntity()` propage le renommage à `Bareme` (colonne Top), `Phrases` (pool `cat:<nom>`) et `AutoRules` (Player/Category) via un nouvel helper `_renameInColumn()`. `Index.html`/`Mobile.html` — `callServer()` vérifie `onSuccess` avant de l'appeler ; `pollChat()`/`mPollChat()` ignorent un nouvel appel tant que le précédent n'a pas répondu (`_chatPollInFlight`).

### Corrigé
**Humanisé** : Dans le tchat, appuyer sur Entrée pour valider une mention (@joueur ou #top) envoyait le message au lieu d'insérer la mention. Entrée insère maintenant la mention quand la liste de suggestions est ouverte, et n'envoie que sinon. Par ailleurs, sur un très petit écran le panneau du tchat (et le bouton 💬) pouvait se retrouver poussé hors de l'écran — il reste désormais toujours visible.
**Technique** : `Index.html` — `attachMentionAutocomplete(chatInput)` est désormais enregistré avant l'écouteur `keydown` Entrée-envoi (son `stopImmediatePropagation` ne pouvait pas agir en second). Clamp de position corrigé dans `positionChatPanel`/`setPos` (Index et Mobile) : `Math.max(8, Math.min(...))` au lieu de l'ordre inverse qui produisait une coordonnée négative quand la borne haute était négative.

### Modifié
**Humanisé** : Toujours dans cette revue générale — nettoyage interne (aucun changement visible) : les modifications en masse dans l'Historique, le groupement et le dégroupement de lots répartis écrivent maintenant en une seule opération au lieu d'une par ligne, plus rapide sur de gros lots. Quelques couleurs restées codées en dur (badge « qui suis-je », bouton flottant du tchat et son badge, plage rapide de l'Historique côté mobile) suivent maintenant le thème clair/sombre comme le reste de l'app. Les petits boutons d'action (éditer/supprimer, pagination…) respectent maintenant la taille tactile minimale de 44px comme partout ailleurs dans l'app PC.
**Technique** : `Code.gs` — nouveau bloc `CONFIG` (`LOCK_TIMEOUT_MS`, `CACHE_TTL_SECONDS`, `CACHE_MAX_BYTES`, `AUTO_TRIGGER_INTERVAL_HOURS`) remplaçant les constantes dupliquées ; helpers partagés `_pad2`/`_dayKey`/`_parseLocalDateWithNow`/`_generateGroupId` remplaçant ~10 redéfinitions locales identiques. `apiUpdateBulkEntries`, `apiGroupDistributedLots`, `apiUngroupLot` : un seul `getRange().setValues()` sur toute la plage au lieu d'un appel par ligne modifiée. `Index.html` — `.who-am-i-badge` actif, `.chat-fab`/`.chat-fab-badge` : `color:#fff`/`#2ed573` remplacés par `var(--on-accent)`/`var(--success)` ; `button.small` passe de `min-height:34px` à `var(--tap-min)` (44px). `Mobile.html` — `.m-hist-range-btn.active` et `.m-chat-fab`/`.m-chat-fab-badge` : même remplacement par `var(--on-accent)`. Suite de tests (`npm test`, 110 tests) verte après ces changements.

### Ajouté
**Humanisé** : L'onglet Historique gagne une rangée de plages rapides (Aujourd'hui, 7 jours, Ce mois, Mois dernier, 3 mois, Cette année, Tout) : un clic pose la période dans les champs de dates et filtre aussitôt la liste. Modifier une date à la main désactive la plage rapide en cours, et « Tout » ou ✕ efface la période. Sur PC comme sur mobile.
**Technique** : `Index.html` — rangée `#histRangeChips` (`.hist-range-btn`, style pill accent) au-dessus des filtres Joueurs/Tops, `histQuickRangeDates()` calcule les bornes locales et remplit `historyDateFrom/To` (donc composable avec les filtres existants) avant `loadHistoryPage(1)`. `Mobile.html` — équivalent `#mHistRangeChips`/`.m-hist-range-btn` dans `renderHistoryEntriesShell()`, mêmes plages, tailles adaptées à l'échelle mobile.

### Modifié
**Humanisé** : L'onglet Paramètres → 🔧 Outils gagne un sommaire en tête de page : une rangée de raccourcis (Santé, Lots répartis, Groupes hérités, Doublons, Aberrants, Mentions, Inactifs, Points auto) qui déplie l'outil visé et y descend directement — plus besoin de faire défiler huit cartes pour trouver le bon. La carte « Joueurs inactifs » gagne aussi sa phrase d'explication, comme les autres.
**Technique** : `Index.html` — barre `#toolsQuickNav` (`.tools-quick-nav`, pills cohérentes avec le hub Statistiques) en tête de `stab-tools` ; chaque bouton retire `collapsed` de la carte cible puis `scrollIntoView`. Description ajoutée à `toolInactiveCard`. `Mobile.html` inchangé (section Outils volontairement réduite côté mobile).

### Modifié
**Humanisé** : Dans le Dashboard, les cinq cartes empilées du bas (Records, Tendances, Jour le plus actif, Duo le plus fréquent, Mentions) sont regroupées en une seule carte « 📊 Statistiques » à onglets : beaucoup moins de défilement, un clic pour passer d'une stat à l'autre, et l'onglet resté ouvert est retrouvé à la prochaine visite. (Côté mobile ces sections restent en accordéons, le format adapté au tactile.)
**Technique** : `Index.html` — les cards `recordsCard`/`trendsCard`/`weekdayCard`/`pairsCard`/`mentionsCard` fusionnent dans `#statsHubCard` (`.stats-hub-tabs` pills accent + `.stats-hub-pane`), contenus et IDs internes inchangés (aucun loader modifié). `switchStatsHubPane()` persiste l'onglet dans `localStorage` (`tdt_stats_hub_tab`) et appelle `.resize()` sur `trendsChartInstance`/`weekdayChartInstance` à l'affichage (un chart créé dans un volet masqué a une taille nulle). Les 4 `makeCollapsible` correspondants sont retirés. `Mobile.html` inchangé (accordéons conservés, choix assumé).

### Modifié
**Humanisé** : Toutes les zones de saisie de texte (descriptions, notes, phrases, import en masse, message du tchat…) grandissent maintenant automatiquement avec ce qu'on y tape, jusqu'à une fraction raisonnable de l'écran — fini la petite boîte de 3 lignes où il fallait scroller pour se relire, sur PC comme sur mobile.
**Technique** : Nouveau helper `autoGrowTextarea(ta, maxVhRatio)` (Index.html et Mobile.html) — hauteur suit `scrollHeight`, plafonnée à 40% du viewport (30% pour le champ du tchat, 50% pour l'import en masse), recalculée sur `input`/`focus`/`resize`. Branché dans `buildTextEditor` (couvre descriptions d'entrées, notes PC, règles auto, description de Top) et sur chaque `<textarea>` statique ou de modale : `chatInput`, `phraseModalText`, `bulkImportTextarea` (Index) ; `mChatInput`, `mNoteText`, `mEditNoteText`, `mPhraseText` (Mobile). `_setValue` de l'éditeur refait l'ajustement après un remplissage programmatique.

### Modifié
**Humanisé** : Le tchat est nettement plus réactif : le message envoyé s'affiche instantanément (grisé avec une horloge le temps que le serveur confirme), les nouveaux messages arrivent toutes les 2 secondes quand le panneau est ouvert (8 s quand il est fermé, juste pour le badge), et l'ouverture du panneau rafraîchit immédiatement la conversation. PC et mobile.
**Technique** : `Index.html`/`Mobile.html` — envoi optimiste via `_chatPendingSends`/`_mChatPendingSends` (message temporaire `pending`, opacité réduite, actions désactivées, retiré et texte restauré en cas d'échec) ; sondage adaptatif `scheduleChatPoll()`/`mScheduleChatPoll()` (2 s ouvert / 8 s fermé, re-planifié à l'ouverture/fermeture) remplaçant le `setInterval` fixe de 4 s ; `pollChat()` immédiat à l'ouverture du panneau.

### Modifié
**Humanisé** : Dans la navbar, les onglets se répartissent maintenant tout seuls dans l'espace disponible entre le titre du site et le bouton rafraîchir — plus d'espacement figé. Et quand un onglet s'ouvre (son nom apparaît), il s'élargit en douceur depuis son centre au lieu de pousser brutalement vers la droite.
**Technique** : `Index.html` — `.nav-btn` passe de `padding` fixe à `flex:1 1 0` + `justify-content:center` (partage égal de l'espace libre, contenu toujours centré) ; `.nav-btn.active` prend `flex-grow:2.6` (les voisins, tous à `flex-grow:1`, se resserrent symétriquement autour de lui). `.nav-btn-label` passe d'un toggle `display:none/inline-block` sec à une transition `max-width`/`opacity`/`margin-left` pour un dépliage progressif.

### Ajouté
**Humanisé** : Sur chaque note, les pastilles « Créé par » et « Modifié par » affichent maintenant l'avatar du joueur (comme partout ailleurs dans l'app), et l'historique de modifications aussi. Style des pastilles retravaillé (plus contrasté, mieux espacé).
**Technique** : `Index.html` — nouveau helper `buildNoteAuthorAvatar(name)` (résout `cachedPlayers`/`getAvatarUrl`, retombe silencieusement en absence d'image) injecté dans `buildNoteCard()` (pastilles `.note-meta-item`) et `openNoteHistoryPopover()` (`.nhp-entry-head`, wrapper `.nhp-entry-who`). CSS `.note-meta-avatar` (18-20px, circulaire) ; `.note-meta-item` repensé (fond plus contrasté, gap augmenté).

### Corrigé
**Humanisé** : Sur le Dashboard, le repère de survol du graphique (le point bleu qui suit la souris) pouvait rester affiché à un endroit du graphique après que la souris en soit sortie, en même temps que la petite bulle d'info — les deux ne disparaissaient pas toujours ensemble.
**Technique** : `Index.html` — Chart.js dessine ce repère indépendamment de la bulle `#chartCustomTooltip` : masquer la bulle seule ne l'effaçait pas. `bindButtons()` centralise la fermeture dans `hideChartHover()`, qui vide aussi les éléments actifs du chart (`chart.setActiveElements([])`, `chart.tooltip.setActiveElements([], …)`, `chart.update('none')`) en plus de masquer la bulle — appelé par le `mouseleave` du canvas et par le filet de sécurité `mousemove` existant.

### Ajouté
**Humanisé** : La bulle d'info du graphique du Dashboard devient personnalisable : dans Paramètres → 🎨 Identité, une nouvelle section permet de choisir la couleur de chaque palier (froid/normal/chaud/très chaud/incandescent), d'activer une jauge de progression sous chaque valeur, et d'activer/désactiver les effets de lueur/pulsation. Choix mémorisés d'une visite à l'autre.
**Technique** : `Index.html` — préférences stockées dans `localStorage` (`topsdestops_tooltip_prefs`), lues/écrites via `getTooltipStylePrefs()`/`saveTooltipStylePrefs()`, appliquées en variables CSS (`--ctt-cold/normal/warm/hot/blaze`) et classe `.ctt-effects-on` sur `#chartCustomTooltip` par `applyTooltipStylePrefs()`. Rendu inline par `renderTooltipStyleSettings()` dans `#tooltipStyleSettings` (Paramètres → Identité, pas un popover flottant : c'est un réglage permanent de l'app). Jauge optionnelle : `buildTooltipGauge(tier, ratio)`, `.ctt-gauge`/`.ctt-gauge-fill`, ratio exposé par `pointValueRatio()` (extrait de `pointValueTier`, inchangé sinon). Pas de dépendance externe ajoutée : jauge et couleurs codées en CSS/SVG maison plutôt qu'une bibliothèque tierce (coût de perf par re-render de tooltip au survol, et personnalisation plus simple à contrôler nous-mêmes).

### Modifié
**Humanisé** : Ordre des onglets de la barre de navigation revu : Dashboard, Saisir un Lot, Notes, Historique, Paramètres, Guide.
**Technique** : `Code.gs` — réordonnancement du tableau `NAV_PAGES` (source unique consommée par `Index.html` et `Mobile.html` via `apiGetNavPages()`), aucun autre changement nécessaire.

### Corrigé
**Humanisé** : Dans l'infobulle du graphique du Dashboard, un score à 0 point reste toujours grisé et discret, même si la palette de couleurs personnalisée dans Paramètres change — ce n'est pas une "performance froide" à teinter, juste une absence de données qui ne doit jamais ressortir autant qu'un vrai score.
**Technique** : `Index.html` — `pointValueTier()` renvoie un palier dédié `pv-zero` pour `value === 0` (avant de calculer le ratio à la moyenne), stylé en dur (`color:var(--text-muted); opacity:0.65`) indépendamment des variables `--ctt-*` personnalisables. La jauge optionnelle est masquée pour ce palier (aucun ratio pertinent à afficher).

## [v1.7.0] - 2026-07-17

### Corrigé
**Humanisé** : Audit complet de la traçabilité : trois actions pouvaient encore modifier des données sans confirmation d'identité — supprimer un joueur ou un Top (Paramètres, PC), supprimer un message du tchat (PC et mobile) et ajouter une note (mobile). Elles demandent désormais l'identité comme tout le reste. En plus, le serveur refuse maintenant toute écriture arrivant sans auteur, quelle qu'en soit l'origine.
**Technique** : `requireIdentity()` ajouté en tête des 4 handlers manquants (`Index.html` : suppression d'entité et de message de tchat ; `Mobile.html` : suppression de message de tchat et `mNoteSubmit`). Nouveau garde-fou serveur `requireAuthor(author)` (Code.gs) appelé au début des 32 fonctions `api*` mutatrices — lève « Identité requise pour cette action » si l'auteur est vide. Le seed automatique du preset "Défaut" (`apiSavePhrasesBatch` au premier chargement) passe `'Système'` comme auteur en l'absence d'identité. Tests `bulk-edit.test.js` mis à jour pour passer un auteur.

### Ajouté
**Humanisé** : Dans le Dashboard, la card "Commentaires par Top" (Index.html — les phrases par catégorie configurées dans Paramètres → Commentaires) se manipule maintenant comme un vrai carrousel au doigt : le glissé s'aimante carte par carte au lieu de s'arrêter n'importe où. Un petit bouton ⏸️/▶️ dans l'en-tête permet aussi de mettre en pause ou relancer un défilement automatique continu (va-et-vient doux d'un bout à l'autre), activé par défaut ; il s'interrompt tout seul quelques secondes dès qu'on touche/glisse/scrolle manuellement la card, et le choix pause/lecture est mémorisé.
**Technique** : `renderPhrasesCard` (Index.html) — CSS `scroll-snap-type: x mandatory` / `scroll-snap-align: start` sur `.phrases-cat-body`/`.phrase-cat-card`. Nouveau défilement auto (`startCatAutoplay`/`stopCatAutoplay`/`pauseCatAutoplayBriefly`) piloté par `requestAnimationFrame`, position suivie en flottant (évite l'arrondi entier de `scrollLeft` sur certains navigateurs), va-et-vient entre 0 et `scrollWidth - clientWidth`, désactive `scroll-snap-type` pendant la lecture (`.autoplay-active`) et se met en pause 4s sur interaction (`pointerdown`/`touchstart`/`wheel`). État persisté dans `localStorage` (`tdt_cat_autoplay`, actif par défaut). Pas d'indicateur de position (points de pagination essayés puis retirés : la métaphore "page" ne correspondait pas à un rail en scroll continu). Mobile.html n'a pas cette section (non répliquée côté mobile), donc pas de changement là-bas.

## [v1.6.0] - 2026-07-16

### Corrigé
**Humanisé** : Dans le tchat flottant, taper `@` ou `#` n'affichait aucune suggestion. En cause : le champ de saisie est collé en bas de l'écran (widget flottant), et la liste de suggestions s'ouvrait toujours vers le bas — donc hors de l'écran, invisible. Elle bascule maintenant automatiquement au-dessus du champ quand il n'y a pas la place en dessous.
**Technique** : `attachMentionAutocomplete` (Index.html) — `position()` calcule l'espace disponible sous le champ via `getBoundingClientRect()`/`window.innerHeight` et bascule le popup au-dessus (`r.top - popupHeight - 4`) quand il manque de place en dessous et qu'il y en a assez au-dessus ; position horizontale également clampée pour ne jamais déborder à droite. Correction partagée par tous les champs utilisant cette fonction (descriptions, notes, tchat…).

### Ajouté
**Humanisé** : Un tchat est maintenant accessible partout dans l'app via un bouton flottant 💬 — un clic l'ouvre, un maintien-glissé le déplace où on veut sur l'écran (position mémorisée). On peut écrire en markdown, mentionner un joueur (`@Nom`) ou un Top (`#NomDuTop`, nouveauté — jusqu'ici seul `@` existait), répondre à un message précis (aperçu cité, cliquable pour remonter dessus), et chaque message affiche son heure. Un badge rouge sur le bouton indique le nombre de nouveaux messages non lus. On ne peut supprimer que ses propres messages.
**Technique** : Nouveau `ChatService` (Code.gs) + feuille `Chat` auto-créée (`Id | Date | Auteur | Texte | RéponseÀ`), API `apiGetChatMessages`/`apiPostChatMessage`/`apiDeleteChatMessage` (audit + `requireIdentity` comme partout ailleurs). Frontend : widget global hors du système d'onglets (`#chatFab`/`#chatPanel` sur Index.html, `#mChatFab`/`#mChatPanel` sur Mobile.html), sondage toutes les 4s (`google.script.run` n'a pas de push serveur), glisser du bouton via Pointer Events avec seuil anti-faux-clic, position persistée en localStorage. Extension de `renderMarkdown`/`attachMentionAutocomplete` (Index.html et Mobile.html en lecture) pour reconnaître `#NomDuTop` au même titre que `@Nom`, réutilisée automatiquement partout où le rendu markdown existait déjà (descriptions, notes, règles auto).

## [v1.5.0] - 2026-07-15

### Corrigé
**Humanisé** : Sur mobile, le bouton pour passer à la version tactile était minuscule et facile à manquer dans la barre du haut. Une bannière s'affiche désormais automatiquement sur petit écran (avec un gros bouton « 📱 Version mobile ») ; une vraie redirection automatique reste impossible côté Google (le bac à sable de l'app bloque toute navigation non déclenchée par un vrai clic), donc ce bandeau est la meilleure alternative pour rendre le passage au mobile évident sans y penser.
**Technique** : `Index.html` — nouveau bandeau `#mobileCtaBanner` affiché via `initMobileCtaBanner()` quand `matchMedia('(max-width:640px)')` matche et qu'aucun choix desktop/fermeture n'est mémorisé (`tdt_layout_mode`, `tdt_mobile_banner_dismissed` en localStorage). Le bouton `#layoutModeToggle` de la navbar est aussi agrandi (fond, padding, taille d'icône) pour une meilleure cible tactile.

**Humanisé** : Une fois sur l'interface mobile, tout restait trop petit malgré les précédents ajustements. Cause trouvée : la page que Google sert pour l'app n'a elle-même aucun réglage d'affichage mobile (hors de notre contrôle, confirmé en interrogeant directement leur serveur), donc le téléphone réduit systématiquement tout l'écran à l'échelle, quel que soit notre code. Comme on ne peut pas corriger ça côté Google, la solution retenue est d'agrandir nettement tout le contenu de la version mobile (textes, boutons, avatars, menu latéral) pour qu'il reste confortable une fois réduit à l'échelle par le téléphone, avec du défilement de secours partout où un élément agrandi pourrait déborder.
**Technique** : `Mobile.html` — tailles de police, cibles tactiles, avatars, rail de navigation et hauteur du graphique Dashboard augmentés d'un facteur ~2 à 2.5 dans tout le fichier, pour compenser l'échelle de rendu (~0.4 sur iPhone) imposée par l'absence de balise `viewport` sur le wrapper `script.google.com/.../exec` (confirmé via requête serveur directe avec User-Agent iPhone — aucune balise viewport dans la page reçue, ni desktop ni mobile). `overflow-x`/`overflow-y` avec `max-height` ajoutés en filet de sécurité sur les modales, accordéons, description d'historique et conteneur du graphique. La media query `@media (min-width: 600px)` — qui se déclenche en réalité toujours en production, contrairement aux paliers `≤430/380/340px` qui ne se déclenchent jamais (largeur CSS réelle fixée à ~980px par le wrapper Google) — a été réajustée pour ne pas annuler l'agrandissement.

**Humanisé** : Une fois sur l'interface mobile, l'affichage s'adaptait mal aux petits écrans (une seule taille gérée alors que les téléphones varient beaucoup) : texte ou carte qui débordait sur les noms un peu longs, aucune adaptation en mode paysage, marges resserrées jusque sur tablette.
**Technique** : `Mobile.html` — media queries étoffées (`≤430px`, `≤380px`, `≤340px`, `orientation:landscape`, `≥600px` pour tablette portrait) au lieu de l'unique palier `≤380px`. Correctifs ciblés : `.m-hist-top` et `.m-row` passent en `flex-wrap` pour éviter le débordement horizontal des cartes d'historique, `#mToastContainer` ne réserve plus l'espace de l'ancienne barre de navigation basse (remplacée par le rail latéral), tailles de titres en `clamp()`, inertie de défilement tactile iOS (`-webkit-overflow-scrolling`) sur les zones à scroll horizontal.

### Ajouté
**Humanisé** : Nouvel outil (Paramètres → 🔧 Outils → « Mentions manquantes ») qui repère les noms de joueurs tapés en texte brut (sans `@`) dans les descriptions d'entrées et les notes, et propose de les transformer en mention cliquable. Chaque proposition affiche un avant/après (le nom brut barré, la mention en vert), se coche individuellement ou en bloc, et s'applique en un clic.
**Technique** : `apiScanUnmentionedNames`/`apiApplyMentionFixes` (Code.gs) — détection via `_buildMentionCandidates` (nom complet de chaque joueur + tokens individuels si uniques à un seul joueur, pour éviter toute mauvaise attribution en cas d'homonymie partielle) et `_scanTextForUnmentioned` (remplacement mot-entier, insensible à la casse, Unicode-aware, ignore les mentions déjà présentes). Application groupée sous `withLock()`, audit via `updateMany` (History et Notes séparément, undo-compatible). Frontend : nouvelle carte dans `stab-tools` (Index.html), rendu diff mot-à-mot générique `wordDiffHtml()` (LCS), sélection individuelle/multiple avant application. Non porté sur Mobile.html, cohérent avec les autres outils avancés de cette section (volontairement absents du mobile).

**Humanisé** : Le Dashboard affiche maintenant une carte « 💬 Mentions » : qui est le plus mentionné, qui mentionne le plus, et le duo qui se cite le plus mutuellement — calculé automatiquement à partir des `@Nom` déjà présents dans les descriptions et les notes. Disponible sur PC et mobile.
**Technique** : Nouvelle fonction `apiGetMentionStats()` (Code.gs), qui réutilise `_escapeRegExpMention` et scanne `StorageService.getFullHistoryRowsCached()` (auteur = `saiseur` avec repli sur `player`) et `NotesService.getAllNotes()` via la nouvelle fonction `_countMentionsInText()`. Frontend : nouvelle card `#mentionsCard`/`loadMentionStats()` dans Index.html (pattern `.tool-action`, à la suite de la card Duo), nouvel accordéon `mMentionsAcc`/`loadMentionStats()` dans Mobile.html (pattern `mStatAccordionHtml`/`statRow`).

### Corrigé
**Humanisé** : Dans l'onglet Saisir un Lot, taper `@` dans le champ Description ne proposait aucun joueur à mentionner, alors que ça fonctionne partout ailleurs (notes, descriptions d'édition, règles automatiques).
**Technique** : Le champ `descInput` (`Index.html`, `addEntryRow`) n'avait jamais reçu l'appel `attachMentionAutocomplete()`, contrairement aux autres champs texte de l'app.

**Humanisé** : L'onglet Historique pouvait planter complètement selon les cas (page blanche au lieu de la liste des scores) — un bug de code faisait que la pagination était mal calculée en interne.
**Technique** : `StorageService.getHistoryPage` (Code.gs) déclarait deux fois la constante `start` dans la même fonction (bornes de dates puis offset de pagination), ce qui est une erreur de syntaxe JavaScript empêchant le fichier de s'exécuter. La seconde a été renommée `pageStart`.

**Humanisé** : Le bouton « Annuler » d'une action dans le Journal d'audit ne redemandait pas de confirmer son identité avant d'agir, contrairement à toutes les autres actions qui modifient des données — sur PC comme sur mobile. Pareil pour le changement de preset de phrases actif sur mobile (menu déroulant dans Paramètres → Commentaires).
**Technique** : Ajout de `requireIdentity()` avant l'appel serveur dans le handler du bouton d'annulation (`Index.html`, `Mobile.html`) et dans le listener `change` du `<select>` de preset actif (`Mobile.html`), pour rester cohérent avec la règle « toute édition passe par `requireIdentity()` ».

**Humanisé** : Changer le preset de phrases actif (Paramètres → Commentaires) ne laissait aucune trace dans le Journal d'audit, contrairement à toutes les autres actions de ce type.
**Technique** : `apiSetActivePhrasePreset` (Code.gs) n'avait ni paramètre `author` ni appel à `AuditService.log`. Ajout des deux, enveloppé dans `withLock()` comme les autres setters simples ; les 3 appels client (`Index.html`, `Mobile.html` ×2) passent désormais `_whoAmI`.

**Humanisé** : Dans Historique côté mobile, le nom de la personne qui a saisi une entrée pour quelqu'un d'autre s'affichait sans avatar, alors que le joueur concerné en a un juste à côté.
**Technique** : `historyCardHtml` (Mobile.html) enveloppe désormais le nom du `saiseur` dans `avatarImgHtml()`, comme le fait déjà `buildHistRow` côté Index.html.

**Humanisé** : La description d'un Top (Paramètres → Tops) était invisible côté mobile — ni dans la liste, ni mise en forme — alors qu'elle s'affiche en markdown sur PC.
**Technique** : `renderEntitySettings` (Mobile.html) affiche désormais `item.meta` rendu via `renderMarkdown()` sous le nom de chaque Top, à l'identique du bloc `entity-meta` d'Index.html. La saisie côté mobile reste un champ texte simple (choix assumé et documenté : pas d'éditeur riche sur petit écran), seul l'affichage était manquant.

**Humanisé** : Plusieurs couleurs (blanc du texte sur bouton coloré, jaune d'avertissement) étaient écrites en dur dans le style au lieu d'utiliser les variables du thème, ce qui contrevient à la règle du projet et complique une future refonte de palette.
**Technique** : Nouvelle variable `--on-accent` (dark + light) dans `Index.html`/`Mobile.html`, remplace ~25 occurrences de `color: #fff`/`#fff !important`. `#ffaa00`/`#ffd166` (CSS uniquement, hors tableaux de couleurs JS pour Chart.js) remplacés par `var(--warn)`. `body.light option { background/color }` remplacé par `var(--card)`/`var(--text)`.

**Humanisé** : Le bouton pour passer à la version mobile (en haut à droite, PC) était minuscule et difficile à toucher précisément sur téléphone.
**Technique** : `.layout-mode-toggle` (Index.html) n'avait ni `min-width` ni `min-height`, contrairement aux autres boutons de la navbar qui héritent tous de `var(--tap-min)`. Ajout de `min-width`/`min-height: var(--tap-min)`.

**Humanisé** : Une fois sur la version mobile, l'interface s'adaptait mal aux téléphones à petit écran (bande de navigation latérale trop large par rapport à l'espace disponible, marges non resserrées).
**Technique** : `Mobile.html` n'avait aucun breakpoint `@media`. Largeur de la bande latérale extraite dans une variable `--rail-w` (56px), avec un breakpoint `≤380px` qui la réduit à 46px et resserre le padding de `.m-container`/`.card` ainsi que la taille des titres.

## [v1.4.0] - 2026-07-14

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

**Humanisé** : Les descriptions (entrées, notes, règles automatiques) supportent maintenant le markdown (gras, italique, titres, listes, liens, code) et les mentions de joueur (`@Nom` avec autocomplétion) — cliquer sur une mention affichée bascule directement sur l'Historique filtré pour ce joueur. Les zones de texte concernées ont une vraie petite barre d'outils (B/I/titre/liste/lien/mention) et un bouton Aperçu, au lieu d'un simple champ nu.
**Technique** : Nouveau composant `buildTextEditor()` (Index.html) — textarea + toolbar + autocomplétion `@mention` (liste filtrée sur `cachedPlayers`) + aperçu, retourne `._getValue()/._setValue()`. Nouveau `renderMarkdown()`/`renderMentions()` (échappement HTML systématique avant insertion des balises générées, aucun HTML utilisateur n'est jamais injecté tel quel — liens limités à `http(s)://`). Appliqué à l'édition d'une entrée (`openFullEditHistoryModal`), d'une note (`openEditNoteModal`) et d'une règle automatique (`loadAutoRules`). Rendu markdown appliqué à l'affichage : tableau Historique (vue développée), drilldown Dashboard, cartes Notes, liste des règles automatiques. Un clic délégué global (`document.addEventListener('click', …)`) intercepte les `.mention` pour filtrer Historique. Côté Mobile.html : `renderMarkdown()`/`renderMentions()` portés à l'identique pour l'affichage (cartes Historique/Notes/lots) ; la saisie mobile reste un textarea simple (pas de toolbar ni d'autocomplétion sur petit écran), le texte tapé au format markdown/`@Nom` s'affichera quand même formaté.

### Corrigé
**Humanisé** : Taper `@` ne proposait aucune suggestion de joueur nulle part — ni dans les deux champs rapides d'ajout de note (aucune autocomplétion n'y avait été branchée), ni de façon fiable dans les éditeurs déjà équipés (fenêtres d'édition d'entrée/de note), où le menu de suggestions pouvait être positionné n'importe où ou coupé par le cadre de la fenêtre.
**Technique** : Deux causes distinctes. (1) Les champs `fInput`/`ta` (composeurs rapides de notes, Index.html) étaient de simples `<input>` sans autocomplétion. (2) Le popup `.md-mention-popup` de `buildTextEditor()` était en `position:absolute` sans coordonnées explicites — livré à sa position statique dans le flux, il pouvait se retrouver hors-champ ou tronqué par `.modal-box { overflow-y:auto }`. Extraction de la logique de mention dans une fonction autonome `attachMentionAutocomplete(inputEl)`, réutilisable sur tout `<input>`/`<textarea>` : popup ajouté à `document.body` en `position:fixed`, repositionné via `getBoundingClientRect()` à chaque affichage (indépendant de tout conteneur qui scrolle). Branchée sur `buildTextEditor()` (remplace l'ancienne logique dupliquée) et directement sur les deux composeurs de notes ; sélectionner une mention au clavier (Entrée/Tab) appelle `stopImmediatePropagation()` pour ne pas déclencher aussi la soumission de la note.

**Humanisé** : Le markdown/mentions manquait encore sur trois champs de description : la modification groupée de plusieurs entrées d'Historique, l'ajout d'un nouveau Top et l'édition d'un Top existant (Paramètres → Tops). Corrigé pour rester cohérent avec la règle « partout où on peut éditer une description, on doit avoir les mêmes outils ».
**Technique** : `mbDesc` (modale d'édition groupée, `openBulkEditModal`), `newCategoryMeta` (ajout de Top) et `mNewMeta` côté catégorie uniquement (`openEditModal`, le champ reste un `<input>` texte simple côté joueur puisqu'il contient une URL d'avatar, pas une description) remplacés par `buildTextEditor()`. La logique « valeurs mixtes » de l'édition groupée (n'écraser la description que si elle a été modifiée) est préservée en dehors du composant, sur `aDesc.mixed`. Affichage de la description d'un Top (liste des Tops, Paramètres) passé à `renderMarkdown()`.

## [v1.3.0] - 2026-07-11

### Ajouté
**Humanisé** : Sur le graphique principal du Dashboard, survoler une barre/point affiche maintenant l'avatar du joueur et son écart avec les autres joueurs proches au classement. Cliquer dessus (ou taper deux fois de suite sur mobile) ouvre la liste en lecture seule des scores concernés (date, Top, points, description) — pour modifier ou supprimer une entrée, direction l'onglet Historique comme avant. Cliquer sur un nom dans la légende isole sa courbe/barre pour mieux la comparer aux autres — recliquer restaure l'affichage complet. Ces trois améliorations couvrent les 6 types de graphique (empilé, groupé, courbes, radar, donut, classement), sur PC comme sur mobile.
**Technique** : Nouvel endpoint `apiGetFilteredLogs` (Code.gs) réutilisant `StorageService.getFullHistoryRowsCached()` via une nouvelle méthode `getFilteredFullLogs`. `AnalyticsService.getTrendData` expose désormais `granularity` (`day`/`week`/`month`), utilisé pour reconstruire la plage de dates exacte d'un point de courbe cliqué. `buildCustomTooltipPlugin` (Index.html) et `buildMobileTooltipPlugin` (Mobile.html) acceptent des `opts` (`titleIsPlayer`, `rowsArePlayers`, `rankedTotals`) pour injecter avatar et comparaison de rang. Nouveau handler `isolatableLegendOnClick` partagé sur les légendes des 6 types de graphique (hors Classement, volontairement exclu). Nouveaux modals `openChartDrilldown` (Index.html) / `openChartDrilldownMobile` (Mobile.html), volontairement consultatifs (le Dashboard ne sert pas l'édition). 4 nouveaux tests (`tests/dashboard-drilldown.test.js`).

### Corrigé
**Humanisé** : Sept petits soucis trouvés en relecture de code sur les nouveautés du graphique Dashboard, corrigés avant mise en ligne : sur le graphique Radar mobile, taper sur un point ouvrait le détail du mauvais joueur/Top. Sur le graphique Donut, cliquer une catégorie dans la légende ne l'isolait pas correctement. Sur le Classement, la légende se comportait différemment sur PC et sur mobile. Sur les Courbes mobile, le détail ignorait le filtre de catégorie actif et pouvait manquer les entrées du tout dernier jour d'une semaine ou d'un mois. Cliquer très vite sur deux points du graphique pouvait afficher le détail du mauvais point. Et l'avatar manquait sur la ligne de comparaison du tooltip.
**Technique** : `Mobile.html` `renderRadarChart` réorganise désormais les données (labels=catégories, datasets=joueurs) comme `Index.html`, au lieu de passer `chartData` brut à Chart.js. `isolatableLegendOnClick` (Index.html + Mobile.html) gère le cas donut/pie (un seul dataset) via `chart.toggleDataVisibility(index)`/`getDataVisibility(index)` au lieu de `getDatasetMeta`. Légende du Classement explicitement non isolable des deux côtés (`onClick: undefined` si `stacked === undefined` côté Mobile.html, commentaire explicite côté Index.html). Le contexte de drill-down des Courbes mobile passe désormais `mFilterCategories`. Les calculs de date de fin de semaine/mois utilisent le formateur local `toDateStr()` au lieu de `toISOString().slice(0,10)` (qui décalait la date selon le fuseau horaire). `openChartDrilldown`/`openChartDrilldownMobile` utilisent un compteur `_drilldownRequestId` pour ignorer les réponses serveur obsolètes. `comparisonText`/`mComparisonText` retournent désormais `{text, neighbor}` pour permettre l'affichage de l'avatar du joueur cité.

## [v1.2.0] - 2026-07-10

### Ajouté
**Humanisé** : Le Journal d'audit permet maintenant d'annuler directement une action passée (ajout/suppression/modification de points, joueurs, catégories, barème, notes, phrases) grâce à un bouton "↩️ Annuler" sur chaque ligne concernée, sur PC comme sur mobile. Le groupement/dégroupement de lots reste pour l'instant en lecture seule — pas encore assez sûr à annuler automatiquement.
**Technique** : Nouvelle colonne cachée `Snapshot` (JSON) + `AnnuléLe` dans la feuille `AuditLog`. `AuditService.log()` accepte un 7ᵉ paramètre optionnel `snapshot` ; `AuditService.undo()`/`apiUndoAuditEntry()` implémentent un moteur générique de restauration (insert/delete/update/insertMany/deleteMany/updateMany) par recherche de ligne exacte, réutilisé par une vingtaine de sites d'appel. `apiGetAuditLog` expose `id`/`undoable` par entrée.

### Modifié
**Humanisé** : La colonne "Avant → Après" du Journal d'audit n'affiche plus de fragments sans signification (ex. `"" → "3 entrée(s)"`) pour les actions qui n'ont pas de vrai avant/après — cette information reste visible dans la colonne Détail. Le bouton copier la ligne et le clic pour filtrer sur l'auteur/l'action/l'entité ont été retirés (jugés inutiles).
**Technique** : `AUDIT_NO_DIFF_ACTIONS` filtre le rendu de la colonne diff dans `renderAuditTable` (`Index.html`) et `auditCardHtml` (`Mobile.html`). Cellules Qui/Action/Entité redeviennent non interactives dans `Index.html` ; classe CSS `.audit-clickable-cell` retirée.

## [v1.1.0] - 2026-07-09

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

## [v1.0.0] - 2026-07-08

### Ajouté
**Humanisé** : Les mises à jour du code se déploient maintenant automatiquement dès qu'elles sont envoyées sur GitHub — plus besoin de recopier les fichiers ni de redéployer à la main, le lien court reste toujours valide. Ça marche aussi pour les copies du même script (groupes différents), toutes mises à jour d'un coup.
**Technique** : Ajout d'un workflow GitHub Actions (`.github/workflows/deploy-gas.yml`) qui exécute `clasp push`, retire l'ancien déploiement, en crée un nouveau, et met à jour le lien short.io via son API (`.github/scripts/deploy-gas.sh`), pour chaque cible listée dans `deploy-targets.json`. La description de chaque déploiement Apps Script reprend maintenant le message du commit (tronqué) au lieu du hash brut.

### Corrigé
**Humanisé** : La synchro automatique cassait le site en le déployant (le code des tests se retrouvait mélangé au vrai code, ce qui faisait planter tout le site à l'ouverture). Réparé.
**Technique** : `clasp push` n'avait pas de filtre et poussait tout le dépôt, y compris `tests/`. Apps Script exécute tous les fichiers `.gs`/`.js` d'un projet dans un seul scope global partagé ; les 12 fichiers de test déclarant chacun `const { loadGas } = require('./harness')` en tête de fichier entraient en collision (identifiant dupliqué), cassant l'exécution de tout le projet déployé. Ajout de `.claspignore` pour ne pousser que `Code.gs`, `AutoPoints.gs`, `Index.html`, `Mobile.html` et `appsscript.json`.

**Humanisé** : Le site restait bloqué sur "Chargement…" puis devenait tout blanc à l'ouverture, aussi bien sur PC que sur mobile. Maintenant le lien de base ouvre directement la version PC ; le bouton 📱/🖥️ en haut de l'écran permet de passer sur mobile, et ce choix est ensuite mémorisé.
**Technique** : `doGet()` sans `?view=` servait une mini-page de redirection auto-détectant l'appareil puis se rechargeant elle-même via `window.location.href`. Dans l'iframe sandbox du déploiement réel, Google bloque silencieusement toute navigation déclenchée par du script sans geste utilisateur réel — confirmé en testant qu'une navigation tapée à la main vers `?view=desktop` fonctionne, contrairement à la redirection automatique, que ce soit servie comme chaîne brute (`createHtmlOutput`) ou comme fichier (`createHtmlOutputFromFile`, tenté en premier et insuffisant). Suppression de cette page intermédiaire : `doGet()` sert directement `Index.html` par défaut (et sur toute valeur `?view=` non reconnue), `Mobile.html` uniquement sur `?view=mobile` explicite. Le bouton de bascule existant reste fonctionnel car un clic constitue un geste utilisateur valide pour le sandbox.

## [v0.9.30] - 2026-07-07

### Modifié
**Humanisé** : Rebascule de l'accès du webapp vers l'accès anonyme (`ANYONE_ANONYMOUS`).
**Technique** : Ajustement des paramètres d'accès Apps Script.

## [v0.9.29] - 2026-07-06

### Ajouté
**Humanisé** : Ajout d'un bouton de bascule mobile/desktop dupliqué dans le tiroir de navigation pour rester accessible sur petit écran.
**Technique** : Intégration du composant de bascule dans le menu mobile.

## [v0.9.28] - 2026-07-05

### Supprimé
**Humanisé** : Suppression du fichier `Bootstrap.html` : l'application sert directement `Index.html`, la redirection automatique ne fonctionnant pas en sandbox.
**Technique** : Simplification du routage `doGet()`.

## [v0.9.27] - 2026-07-04

### Ajouté
**Humanisé** : Ajout d'un fichier `Bootstrap.html` dédié pour la redirection mobile/desktop, remplaçant le HTML généré en ligne.
**Technique** : Rendu `Bootstrap.html` intermédiaire.

## [v0.9.26] - 2026-07-03

### Modifié
**Humanisé** : Changement de l'accès du webapp d'anonyme à connecté.
**Technique** : Modification des permissions Apps Script.

## [v0.9.25] - 2026-07-02

### Ajouté
**Humanisé** : Ajout d'un registre de navigation centralisé et redirection automatique mobile/desktop via une page de démarrage.
**Technique** : Module de navigation partagé backend/frontend.

## [v0.9.24] - 2026-07-01

### Ajouté
**Humanisé** : Ajout de la possibilité de retirer une entrée d'un groupe et détection des anciens identifiants de groupe.
**Technique** : `apiRemoveFromGroup` et détection des identifiants `groupId` hérités.

## [v0.9.23] - 2026-06-30

### Ajouté
**Humanisé** : Ajout d'un mode d'affichage mobile avec menu tiroir et affichage de l'historique sous forme de cartes.
**Technique** : Mise en page responsive mobile dédiée et mode tiroir.

## [v0.9.22] - 2026-06-29

### Modifié
**Humanisé** : Ajout des autorisations et scopes d'accès nécessaires pour l'application.
**Technique** : `appsscript.json` — ajout des `oauthScopes` (`spreadsheets`, `script.external_request`).

## [v0.9.21] - 2026-06-28

### Corrigé
**Humanisé** : Correction du calcul des semaines actives pour les règles hebdomadaires et exclusion des entités supprimées.
**Technique** : Ajustement du moteur de règles `AutoPoints.gs`.

## [v0.9.20] - 2026-06-27

### Ajouté
**Humanisé** : Ajout d'un système de règles de points automatiques programmées (quotidien/hebdo/mensuel) via un nouveau module dédié.
**Technique** : Création du module `AutoPoints.gs` et gestion des déclencheurs temporels.

## [v0.9.19] - 2026-06-26

### Ajouté
**Humanisé** : Ajout d'un troisième état de tri permettant de revenir à l'ordre d'insertion initial des lignes.
**Technique** : Gestion de l'état de tri neutre/défaut dans les tableaux.

## [v0.9.18] - 2026-06-25

### Ajouté
**Humanisé** : Ajout du tri et de la réorganisation par glisser-déposer des lignes de saisie en lot, refonte du rafraîchissement global.
**Technique** : Implémentation du Drag & Drop natif JS sur la grille de saisie.

## [v0.9.17] - 2026-06-24

### Ajouté
**Humanisé** : Ajout d'une identité protégée par mot de passe optionnel par joueur, vérifiée côté serveur.
**Technique** : Validation du mot de passe joueur dans `Code.gs`.

## [v0.9.16] - 2026-06-23

### Modifié
**Humanisé** : Mise en cache multi-requêtes de l'historique complet et des statistiques de santé pour accélérer le chargement.
**Technique** : Optimisation de `StorageService.getFullHistoryRowsCached()`.

## [v0.9.15] - 2026-06-22

### Ajouté
**Humanisé** : Ajout de paramètres d'application personnalisables (titre, logo) stockés dans une feuille Settings dédiée.
**Technique** : Création du service `SettingsSheetService` dans `Code.gs`.

## [v0.9.14] - 2026-06-21

### Modifié
**Humanisé** : Modification de la priorité d'affichage des phrases pour montrer le podium complet (1er, 2e, 3e) avant les autres.
**Technique** : Tri prioritaire du podium des phrases d'accroche.

## [v0.9.13] - 2026-06-20

### Supprimé
**Humanisé** : Suppression du plugin d'overlay emoji sur les graphiques pour simplifier le rendu.
**Technique** : Allègement des plugins Chart.js.

## [v0.9.12] - 2026-06-19

### Corrigé
**Humanisé** : Correction de la construction des dates pour préserver l'heure locale, ajout d'avatars en fond sur les notes.
**Technique** : Normalisation des objets `Date` à 12:00 locale pour éviter les décalages UTC.

## [v0.9.11] - 2026-06-18

### Ajouté
**Humanisé** : Ajout d'un journal d'audit traçant les modifications de barème, de couleurs et d'entités.
**Technique** : Création du système `AuditLog` dans `Code.gs`.

## [v0.9.10] - 2026-06-17

### Modifié
**Humanisé** : Ajout d'une animation de pulsation sur le sélecteur « Qui suis-je ? » et amélioration visuelle du champ description.
**Technique** : Micro-animations CSS `@keyframes pulse`.

## [v0.9.9] - 2026-06-16

### Modifié
**Humanisé** : Intégration du sélecteur enrichi dans les champs joueur et catégorie des lignes de saisie.
**Technique** : Déploiement des composants Rich-Select sur la grille de saisie.

## [v0.9.8] - 2026-06-15

### Ajouté
**Humanisé** : Ajout d'un composant de liste déroulante enrichie (avatars/icônes) et de la modification groupée d'entrées d'historique.
**Technique** : `apiUpdateBulkEntries` et composant UI `rich-select`.

## [v0.9.7] - 2026-06-14

### Modifié
**Humanisé** : Réorganisation du graphique en conteneur unique et restauration de l'ordre des clés du fichier de configuration.
**Technique** : Refactorisation de la mise en page du Dashboard.

## [v0.9.6] - 2026-06-13

### Ajouté
**Humanisé** : Ajout d'avatars dans l'infographie exportée pour le graphique en Donut.
**Technique** : Intégration du rendu d'images avatars sur le Canvas d'exportation HD.

## [v0.9.5] - 2026-06-12

### Modifié
**Humanisé** : Amélioration visuelle des boutons de barème rapide et réorganisation de l'en-tête du graphique.
**Technique** : Retouches CSS sur les pilules de barème rapide.

## [v0.9.4] - 2026-06-11

### Ajouté
**Humanisé** : Ajout de boutons de barème rapide par Top affichant les actions et points prédéfinis directement dans la saisie.
**Technique** : Boutons d'insertion rapide de barème.

## [v0.9.3] - 2026-06-10

### Ajouté
**Humanisé** : Ajout d'un champ « saisisseur » enregistrant l'auteur de chaque entrée d'historique.
**Technique** : Enregistrement de l'auteur de la saisie dans `Code.gs`.

## [v0.9.2] - 2026-06-09

### Modifié
**Humanisé** : Amélioration visuelle des menus déroulants et des cartes repliables génériques, avatars empilés dans l'historique groupé.
**Technique** : Module d'accordéons repliables `makeCollapsible`.

## [v0.9.1] - 2026-06-08

### Ajouté
**Humanisé** : Ajout d'un sélecteur « Qui suis-je ? » et d'un fond avatar discret sur les lignes de saisie.
**Technique** : Persistance de l'identité de l'utilisateur actif.

## [v0.9.0] - 2026-06-07

### Ajouté
**Humanisé** : Ajout d'un verrou de concurrence et d'un versionnement de cache pour sécuriser les écritures simultanées.
**Technique** : Verrouillage de concurrence dans `Code.gs`.

## [v0.8.9] - 2026-06-06

### Modifié
**Humanisé** : Refonte du podium des commentaires (cartes classées, feed compact, accordéon par Top) avec preset actif persistant côté serveur.
**Technique** : Persistance du preset actif de phrases.

## [v0.8.8] - 2026-06-05

### Corrigé
**Humanisé** : Les phrases par Top s'affichent désormais pour tous les tops filtrés au lieu d'un seul, et la description d'historique reste toujours cliquable.
**Technique** : Correction du filtrage multi-tops des phrases.

## [v0.8.7] - 2026-06-04

### Corrigé
**Humanisé** : Correction du filtrage des presets personnalisés pour exclure le preset par défaut de la liste.
**Technique** : Filtrage des presets dans `Code.gs`.

## [v0.8.6] - 2026-06-03

### Ajouté
**Humanisé** : Extension des pools de phrases par catégorie et refonte visuelle des paramètres (onglets internes, formulaires).
**Technique** : Organisation sous-onglets dans `Index.html`.

## [v0.8.5] - 2026-06-02

### Ajouté
**Humanisé** : Ajout du renommage de preset de phrases et de phrases de secours visibles dans l'éditeur.
**Technique** : `apiRenamePreset` dans `Code.gs`.

## [v0.8.4] - 2026-06-01

### Ajouté
**Humanisé** : Ajout d'un service de phrases personnalisables, organisées par preset et par catégorie (pool).
**Technique** : Service backend de gestion de presets de phrases.

## [v0.8.3] - 2026-05-31

### Modifié
**Humanisé** : Amélioration du style du champ description par ligne et déplacement de la carte Commentaires dans le Dashboard.
**Technique** : Réorganisation layout Dashboard.

## [v0.8.2] - 2026-05-30

### Ajouté
**Humanisé** : Ajout d'une carte dédiée aux commentaires (phrases d'accroche) avec podium et réglages associés.
**Technique** : Composant UI de commentaires dynamique.

## [v0.8.1] - 2026-05-29

### Modifié
**Humanisé** : Réorganisation de la saisie de lot en disposition verticale à deux rangées par ligne.
**Technique** : Mise en page CSS flex/grid à deux niveaux.

## [v0.8.0] - 2026-05-28

### Ajouté
**Humanisé** : Refonte visuelle des modales, ajout de phrases d'accroche animées et d'une infobulle personnalisée pour les graphiques.
**Technique** : Module d'infobulles Chart.js sur-mesure.

## [v0.7.8] - 2026-05-27

### Corrigé
**Humanisé** : Correction du calcul de date locale pour éviter les décalages liés au fuseau horaire UTC.
**Technique** : Calcul d'offset horaire local.

## [v0.7.7] - 2026-05-26

### Modifié
**Humanisé** : Réintégration du CSS en ligne dans `Index.html`, annulant l'externalisation précédente.
**Technique** : Regroupement monobloc pour Apps Script.

## [v0.7.6] - 2026-05-25

### Modifié
**Humanisé** : Externalisation du CSS de l'interface vers un fichier `styles.css` séparé.
**Technique** : Séparation des fichiers frontend.

## [v0.7.5] - 2026-05-24

### Modifié
**Humanisé** : Remplacement du sélecteur de joueur du graphique Donut par des puces cliquables avec avatars.
**Technique** : Puces de sélection interactive du graphique Donut.

## [v0.7.4] - 2026-05-23

### Ajouté
**Humanisé** : Ajout d'un cache des logs, regroupement visuel des entrées par groupe dans l'historique, et recherche textuelle.
**Technique** : Recherche textuelle et regroupement d'entrées.

## [v0.7.3] - 2026-05-22

### Corrigé
**Humanisé** : Réécriture de la détection des lots répartis pour exclure les doublons manuels et fiabiliser le chaînage par date.
**Technique** : Algorithme de détection des chaînes chronologiques.

## [v0.7.2] - 2026-05-21

### Ajouté
**Humanisé** : Ajout d'un identifiant de groupe transmis lors de la saisie en lot sur plusieurs dates.
**Technique** : Champ `groupId` dans le contrat d'API.

## [v0.7.1] - 2026-05-20

### Corrigé
**Humanisé** : Correction d'un bug de déclaration en double d'une variable JavaScript lors du regroupement des lots.
**Technique** : Nettoyage des portées de variables JS.

## [v0.7.0] - 2026-05-19

### Modifié
**Humanisé** : Passage d'une fusion destructive à un simple marquage groupé (`groupId`), réversible, des lots répartis.
**Technique** : Gestion d'ID de groupe réversible sans perte de lignes.

## [v0.6.9] - 2026-05-18

### Ajouté
**Humanisé** : Les lots détectés sont désormais fusionnés en une seule entrée totalisée au lieu d'être simplement supprimés.
**Technique** : Fusion d'entrées agrégées.

## [v0.6.8] - 2026-05-17

### Ajouté
**Humanisé** : Ajout de la détection des lots répartis (entrées identiques étalées sur plusieurs jours).
**Technique** : `apiDetectDistributedLots` dans `Code.gs`.

## [v0.6.7] - 2026-05-16

### Ajouté
**Humanisé** : Ajout d'un champ description par entrée d'historique, modifiable individuellement ou en masse.
**Technique** : Colonne description dans l'Historique.

## [v0.6.6] - 2026-05-15

### Ajouté
**Humanisé** : Ajout de la suppression multiple d'entrées d'historique et refonte visuelle du barème présenté par section.
**Technique** : `apiDeleteHistoryEntries`.

## [v0.6.5] - 2026-05-14

### Modifié
**Humanisé** : Le barème est désormais organisé par Top (catégorie), avec une interface de gestion dédiée dans les paramètres.
**Technique** : Reconstitution de la structure du barème.

## [v0.6.4] - 2026-05-13

### Ajouté
**Humanisé** : Ajout d'un système de barème définissant des points par action, configurable par l'utilisateur.
**Technique** : Service de gestion des barèmes.

## [v0.6.3] - 2026-05-12

### Modifié
**Humanisé** : Les couleurs personnalisées sont désormais stockées côté serveur dans des colonnes dédiées plutôt qu'en localStorage.
**Technique** : `apiSetColor` et stockage Google Sheet.

## [v0.6.2] - 2026-05-11

### Ajouté
**Humanisé** : Ajout de couleurs personnalisables par joueur et par catégorie, stockées localement et appliquées aux graphiques.
**Technique** : Application dynamique de couleurs Chart.js.

## [v0.6.1] - 2026-05-10

### Ajouté
**Humanisé** : Ajout d'un sélecteur de jours de la semaine pour cibler les dates générées lors de la saisie en lot.
**Technique** : Filtre de jours de la semaine dans la saisie.

## [v0.6.0] - 2026-05-09

### Ajouté
**Humanisé** : Ajout du total global par joueur tous tops confondus et d'un sélecteur de jours de la semaine pour les lots répartis.
**Technique** : Calcul du total global multi-categories.

## [v0.5.9] - 2026-05-08

### Modifié
**Humanisé** : Remplacement des champs date par un bouton ouvrant un éditeur, avec plages de dates prédéfinies réutilisables.
**Technique** : Composant d'édition de plages temporelles.

## [v0.5.8] - 2026-05-07

### Ajouté
**Humanisé** : Ajout d'un mode Répéter/Répartir propre à chaque ligne de saisie individuelle.
**Technique** : Option de répétition par ligne.

## [v0.5.7] - 2026-05-06

### Ajouté
**Humanisé** : Simplification du service Notes (création automatique de la feuille) et ajout de dates individuelles par ligne de saisie.
**Technique** : Auto-initialisation de la feuille Notes.

## [v0.5.6] - 2026-05-05

### Modifié
**Humanisé** : Refonte du calcul des tendances temporelles avec granularité adaptative (jour/semaine/mois) et période par défaut de 30 jours.
**Technique** : `getTrendData` adaptatif.

## [v0.5.5] - 2026-05-04

### Modifié
**Humanisé** : Ajustement du panneau de filtres pour uniformiser la hauteur des colonnes et aligner le bouton Appliquer.
**Technique** : Harmonisation des colonnes de filtres.

## [v0.5.4] - 2026-05-03

### Modifié
**Humanisé** : Suppression de la détection de doublons au profit d'une gestion complète des notes, simplification du diagnostic de santé des données.
**Technique** : `getDataHealth` simplifié.

## [v0.5.3] - 2026-05-02

### Ajouté
**Humanisé** : Ajout d'icônes emoji pour les catégories, renommées « Tops » dans toute l'interface.
**Technique** : Gestion des emojis de catégories.

## [v0.5.2] - 2026-05-01

### Ajouté
**Humanisé** : Ajout d'un mode « Répartir/Répéter » pour étaler les entrées d'un lot sur une plage de dates.
**Technique** : Algorithme d'étalement de dates.

## [v0.5.1] - 2026-04-30

### Ajouté
**Humanisé** : Ajout d'une feuille Notes optionnelle et remplacement de la suppression automatique des doublons par une simple détection/liste.
**Technique** : Module Notes et détection sans suppression.

## [v0.5.0] - 2026-04-29

### Ajouté
**Humanisé** : Ajout d'optimisations mobiles et PWA (zones de sécurité, meta tags, touch-action) pour une meilleure ergonomie tactile.
**Technique** : Meta tags PWA & viewport safe-area.

## [v0.4.5] - 2026-04-28

### Corrigé
**Humanisé** : Correction de la gestion du fuseau horaire pour les dates saisies (construction explicite à midi).
**Technique** : Horodatage fixé à 12:00:00.

## [v0.4.4] - 2026-04-27

### Corrigé
**Humanisé** : Ajout de validations strictes des points et du multiplicateur côté client et serveur.
**Technique** : Validation d'entrées numériques strictes.

## [v0.4.3] - 2026-04-26

### Modifié
**Humanisé** : Réécriture de la pagination de l'historique pour utiliser directement les index réels des lignes de la feuille.
**Technique** : Indexation 1-based directe sur Google Sheet.

## [v0.4.2] - 2026-04-25

### Modifié
**Humanisé** : Réécriture de ConfigService en module avec cache interne et syntaxe ES6 raccourcie.
**Technique** : Cache mémoire d'exécution.

## [v0.4.1] - 2026-04-24

### Modifié
**Humanisé** : Compactage massif du code CSS de l'interface sans changement fonctionnel majeur.
**Technique** : Optimization CSS.

## [v0.4.0] - 2026-04-23

### Modifié
**Humanisé** : Séparation des fonctions de lecture complète et filtrée des logs, correction du calcul par défaut des points.
**Technique** : `apiGetFilteredLogs` & `getAllLogs`.

## [v0.3.4] - 2026-04-22

### Modifié
**Humanisé** : Simplification et nettoyage du code de filtrage et d'export des données.
**Technique** : Refactorisation des fonctions d'exportation.

## [v0.3.3] - 2026-04-21

### Ajouté
**Humanisé** : Ajout du filtrage avancé des données historiques et de l'export CSV/XLSX via des bibliothèques externes.
**Technique** : Intégration des bibliothèques d'export CSV/XLSX.

## [v0.3.2] - 2026-04-20

### Ajouté
**Humanisé** : Ajout d'un cache interne à l'exécution pour ConfigService et renforcement de la validation des types/actions.
**Technique** : Valideurs de types stricts.

## [v0.3.1] - 2026-04-19

### Modifié
**Humanisé** : Refonte du CSS en mobile-first : tailles tactiles, prévention du zoom iOS, navbar défilante horizontalement.
**Technique** : Mobile-first CSS media queries.

## [v0.3.0] - 2026-04-18

### Corrigé
**Humanisé** : Nettoyage du backend et correction d'un bug de mutation du tableau source dans la lecture des logs.
**Technique** : Immuabilité des tableaux de logs.

## [v0.2.3] - 2026-04-17

### Corrigé
**Humanisé** : Corrections responsives et sécurisation de la fonction de changement d'onglet contre un bug sur Safari.
**Technique** : Safari touch event fixes.

## [v0.2.2] - 2026-04-16

### Ajouté
**Humanisé** : Ajout d'un sélecteur de joueur enrichi avec avatar dynamique dans le formulaire de saisie en lot.
**Technique** : Composant de sélection d'avatars.

## [v0.2.1] - 2026-04-15

### Ajouté
**Humanisé** : Ajout d'avatars générés automatiquement pour les joueurs sans image et correction d'un bug lors de l'édition des métadonnées.
**Technique** : Génération SVG d'avatars de secours.

## [v0.2.0] - 2026-04-14

### Ajouté
**Humanisé** : Ajout d'un système de citations de secours utilisé si l'appel à l'API Gemini échoue ou est indisponible.
**Technique** : Citations de secours en mode hors-ligne.

## [v0.1.9] - 2026-04-13

### Modifié
**Humanisé** : Mise à jour du modèle Gemini utilisé pour générer les citations (passage de 1.5-flash à 2.0-flash).
**Technique** : Migration endpoint Gemini 2.0 Flash.

## [v0.1.8] - 2026-04-12

### Ajouté
**Humanisé** : Ajout de métadonnées (avatar pour les joueurs, description pour les catégories) et intégration d'un appel à l'API Gemini pour générer des citations.
**Technique** : Intégration API Gemini & métadonnées entités.

## [v0.1.7] - 2026-04-11

### Modifié
**Humanisé** : Refonte complète du CSS de l'interface (navbar, cartes, grille de saisie en lot, listes, toasts).
**Technique** : Nouveau système de cartes et notifications toasts.

## [v0.1.6] - 2026-04-10

### Modifié
**Humanisé** : Nettoyage du code et calcul dynamique des catégories/joueurs lors de l'agrégation des statistiques.
**Technique** : Dynamic aggregation pipeline.

## [v0.1.5] - 2026-04-09

### Modifié
**Humanisé** : Écriture groupée des scores en une seule opération (au lieu d'une boucle appendRow) et nettoyage du rapport HTML généré.
**Technique** : `setValues()` par blocs.

## [v0.1.4] - 2026-04-08

### Ajouté
**Humanisé** : Passage à la saisie en lot avec points et multiplicateur, le score enregistré étant désormais le produit des deux.
**Technique** : Multiplicateur de saisie en lot.

## [v0.1.3] - 2026-04-07

### Modifié
**Humanisé** : Traduction en français de tous les messages d'erreur du backend.
**Technique** : Localisation française des erreurs `Code.gs`.

## [v0.1.2] - 2026-04-06

### Ajouté
**Humanisé** : Ajout de SettingsService pour gérer joueurs et catégories (ajout/suppression/renommage) avec mise à jour en cascade de l'historique.
**Technique** : Mise à jour en cascade Google Sheet.

## [v0.1.1] - 2026-04-05

### Corrigé
**Humanisé** : L'identifiant du classeur est désormais lu via la propriété `SPREADSHEET_ID` au lieu d'être codé en dur.
**Technique** : `PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')`.

## [v0.1.0] - 2026-04-01

### Ajouté
**Humanisé** : Refonte du Code.gs monolithique en services ConfigService/StorageService/AnalyticsService et lancement officiel de l'application Tops des Tops.
**Technique** : Architecture initiale modulaire en 3 services Google Apps Script.
