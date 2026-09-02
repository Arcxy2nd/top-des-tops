# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com).

## [v3.24.1] - 2026-09-02

### Corrigé
**Humanisé** : La saisie de lots par période est fiabilisée : calendrier agrandi et stable au survol, affichage sans débordement et support des Tops Alternatifs.
**Technique** : `Index.html` — refonte de `createMiniCalendar` avec mise à jour ciblée des classes CSS (`.is-preview`, `.in-range`, `.is-end`) et du résumé lors du survol sans destruction de DOM, agrandissement des cases de jours à 26px de haut sur desktop, assouplissement de `.d-cell` et `.d-period` en `flex-wrap: wrap` pour supprimer les débordements horizontaux, fiabilisation du dimensionnement de `startInput` en mode jour unique (`width: auto`) et initialisation propre de `startInput` sur les raccourcis de durée. Extension du support des périodes (répartition/répétition par jour) en mode Alt dans `submitBulk`, et persistance complète des plages et sous-tops dans `setLotUniverse`. Tests étendus dans `tests/lot-period.test.js`.

### Modifié
**Humanisé** : Le barème de chaque Top est désormais trié par ordre croissant de points sur toutes les vues, et la colonne d'ordre obsolète a été retirée de l'administration.
**Technique** : `Index.html` — tri explicite par points croissants `(a.pts - b.pts) || (a.rowIndex - b.rowIndex)` dans `renderBaremeDrawer` et `renderBaremeQuickBtns`, nettoyage des libellés et toasts de l'outil « Réparer l'ordre ». `Code.gs` — retrait de la clé `bareme` du retour et de l'audit log de `apiRepairOrder`.

## [v3.24.0] - 2026-09-02

### Corrigé
**Humanisé** : Refonte ergonomique sur mobile : suppression des superpositions avec la barre du bas, fin du zoom intempestif sur iPhone, cibles tactiles agrandies et navigation fluidifiée.
**Technique** : `Index.html` — restructuration de la hiérarchie des `z-index` (Toast `11000` > Chat plein écran & Tiroir Barème `10000` > Barre de navigation mobile `9000`), réalignement de `#lotSummaryBar` et `#toastContainer` au-dessus des 62px de la bottom nav avec `calc(68px + env(safe-area-inset-bottom, 0px))`. Suppression du bridage `user-scalable=0` du meta viewport (conforme WCAG 1.4.4) et passage de tous les champs de formulaire (`input`, `select`, `textarea`) à `16px !important` sur mobile pour bloquer l'auto-zoom iOS Safari. Cibles tactiles portées à ≥ 44px (boutons top bar 44x44px, mini-calendrier de lot `.d-cal-day` à 32px de haut, chips filtres et raccourcis). Harmonisation sous le breakpoint unique `@media (max-width: 768px)` (élimination des seuils 640px/680px), protection `overflow-x: hidden` globale, affichage garanti des actions du Tchat sur tactile (`@media (hover: none)`), fermeture tactile de l'infobulle Chart.js et persistance de la bannière CTA dans `localStorage`. Suite de tests dédiée dans `tests/mobile-audit.test.js`.

### Corrigé
**Humanisé** : La sélection de périodes et le calcul des points en saisie de lot sont fluidifiés, avec mise à jour instantanée du résumé et du calendrier lors des changements de dates ou de mode.
**Technique** : `Index.html` — écouteurs `change` et `input` câblés sur `startInput` et `endInput`, normalisation automatique des bornes inversées (`startInput > endInput`), appel systématique de `updateLotSummary()` sur les raccourcis de durée, `createFillToggle`, `setDateMode` et `applyDateAllBtn`. Suppression du bloc manuel redondant `.d-cal-manual` dans `createMiniCalendar`. Sécurisation de `lineDates()` et `daysBetweenInclusive()` pour garantir une correspondance exacte du nombre de jours. Suite de tests unitaires dédiée dans `tests/lot-period.test.js`.

### Modifié
**Humanisé** : Les règles du barème sont désormais triées automatiquement par points croissants, supprimant les boutons de déplacement et la colonne d'ordre manuel.
**Technique** : `Code.gs` — suppression de la colonne `Ordre` pour `Bareme` (`SHEET_HEADERS`, `CANONICAL_SHEET_HEADERS`, `_getOrCreateSheet`, `addEntry`, `apiRepairOrder`), tri naturel dans `BaremeService.getEntries()` par `(a.pts - b.pts) || (a.rowIndex - b.rowIndex)` préservant le `rowIndex` physique. Suppression de `BaremeService.reorderEntries` et `apiReorderBareme`. `Index.html` — suppression de `buildMoveButtons` dans `buildBsectRow`, retrait de `apiReorderBareme` de la liste `_MUTATING_APIS` et tri ascendant systématique dans `renderBaremeSettings`, `renderBaremeDrawer` et `renderBaremeQuickBtns`.

## [v3.23.0] - 2026-08-26

### Ajouté
**Humanisé** : Génération automatique des en-têtes officiels en première ligne sur les feuilles Google Sheets qui en étaient dépourvues, sans altérer les données existantes.
**Technique** : `Code.gs` — introduction de `CANONICAL_SHEET_HEADERS` et de `_ensureSheetHeaders(sheetKey, sheet, values)` : si une feuille commence par une ligne de données, elle subit `sheet.insertRowBefore(1)` et reçoit la ligne d'en-tête canonique. Intégré de façon transparente dans `_readDataRows`, `SettingsService.getEntities`, `BaremeService`, `PhrasesService`, `AltSettingsService`, `SettingsSheetService` et `apiRepairOrder`. `tests/harness.js` enrichi de `insertRowBefore()` et 16 tests validés dans `tests/headerless-sheets.test.js`.

**Humanisé** : Ajout d'un bouton de déconnexion dans le menu « Qui suis-je ? » pour repasser en mode visiteur ou changer rapidement de profil.
**Technique** : `Index.html` — ajout de la fonction `logoutIdentity()` (`_whoAmI = null`, `_identityPassword = ''`, suppression de la clé `tdt_who_am_i` dans `localStorage`, mise à jour du composant navbar et toast de confirmation) et intégration d'un bouton dédié `🚪 Se déconnecter` séparé par `.who-am-i-divider` dans `renderWhoAmI()`.

**Humanisé** : Affichage du taux d'efficacité du cache serveur dans le Rapport de santé pour surveiller les performances d'accès aux données.
**Technique** : Nouvel endpoint `apiGetCacheStats()` (`Code.gs`), alimenté par un compteur hit/miss instrumenté au point de passage unique `_cacheGetChunked()` (renommé en wrapper autour de `_cacheGetChunkedRaw`), stocké dans `CacheService` sur une fenêtre glissante de 6h. Câblé dans le panneau Santé de `Index.html`.

### Corrigé
**Humanisé** : Le renommage d'un joueur ou d'un Top est désormais répercuté instantanément sur tous les écrans (Notes, Tchat, Barème, Phrases) sans délai de cache.
**Technique** : `SettingsService.renameEntity()` (`Code.gs`) bump désormais `_bumpNotesVersion()`/`_bumpChatVersion()` (renommage Joueur) et `_bumpBaremeVersion()`/`_bumpPhrasesVersion()` (renommage Top), en plus de `_bumpSettingsVersion()` déjà en place — alignant son comportement sur celui de l'outil de réparation d'ordre qui bumpait déjà ces trois compteurs ensemble. Deux échecs silencieux durcis en parallèle : un échec d'invalidation de cache (`withLock`) et un échec d'écriture du journal d'audit (`AuditService.log`) laissent maintenant une trace dans les logs au lieu de disparaître sans avertissement.

### Modifié
**Humanisé** : Uniformisation de l'affichage des modifications avant/après (Journal d'audit, historique de notes) avec coloration rouge/verte et symboles +/− style diff GitHub.
**Technique** : `Index.html` — harmonisation du design system diff sous `.diff-del`/`.audit-before` (`var(--error)`, fond rouge teinté, préfixe `−`, texte barré) et `.diff-ins`/`.audit-after` (`var(--success)`, fond vert teinté, préfixe `+`). `wordDiffHtml()` regroupe désormais les blocs contigus pour un rendu mot-à-mot net. `openNoteHistoryPopover()` intègre `wordDiffHtml()` pour visualiser les deltas réels sur les notes modifiées. Couverture complète dans `tests/identity-logout-and-diff.test.js` (8/8) et `tests/innerhtml-audit.test.js`.

**Humanisé** : Accélération des outils d'administration (réparation d'ordre, regroupement d'entrées similaires) sur les gros volumes de données.
**Technique** : `apiRepairOrder()` et `StorageService.apiGroupSimilarEntries()` (`Code.gs`) remplacent leurs boucles `forEach(...).setValue(...)` (une requête Sheets par ligne) par un unique `setValues()` par colonne/feuille concernée.

### Supprimé
**Humanisé** : Nettoyage des styles CSS inutilisés et harmonisation des variables de couleurs.
**Technique** : Suppression de 15 classes CSS non référencées dans `Index.html` (confirmées mortes par une revue exhaustive : `.spotlight-card`, `.d-range`, `.row-tops-group`, `.row-bottom`, `.row-actions`, `.settings-grid`, `.auto-rules-card`, `.row-main-right`, `.row-range-toggle`, `.bareme-settings-section`, `.hist-bulk-desc-wrap`, `.detect-lot-info`, `.detect-summary`, `.row-alt-pill`, `.phrase-podium-header-row`). Remplacement de 22 couleurs hexadécimales en dur par des variables CSS (dont 8 nouveaux tokens `--rank-*` pour les variantes podium). Ajout de `dev/temp_front.css`/`dev/temp_front.js` au `.gitignore`.

## [v3.22.1] - 2026-08-26

### Corrigé
**Humanisé** : Correction d'une erreur JavaScript lors de la fermeture des fenêtres modales via les boutons d'annulation ou de fermeture.
**Technique** : `closeModal()` et `openModal()` dans `Index.html` valident que l'argument reçu est bien un élément DOM avec `querySelectorAll` (au lieu d'un objet `MouseEvent` injecté par les callbacks `onclick = closeModal`), évitant l'exception `modal.querySelectorAll is not a function`.

### Modifié
**Humanisé** : Sécurisation des rappels et événements d'interface pour éviter les erreurs silencieuses lors des transitions et chargements.
**Technique** : Remplacement systématique des gardes `if (cb) cb()` par `if (typeof cb === 'function') cb()` dans `applyFilters`, `loadEntities`, `loadAppBranding`, `loadCustomPhrases`, `loadAltHistoryMap` et `anchorFloating`. Utilisation de `.closest('.chart-type-btn')` sur `#trendsScopeToggle` pour sécuriser la délégation d'événements. Nouveaux tests de non-régression dans `tests/papercuts.test.js`.

## [v3.22.0] - 2026-08-25

### Ajouté
**Humanisé** : Calcul précis de la taille réelle en octets des données en cache pour éviter les dépassements de limite causés par les caractères spéciaux et emojis.
**Technique** : Nouvelles aides top-level dans `Code.gs` — `_byteLength()` (poids UTF-8 exact, y compris paires de substituts), `_cachePutChunked()` (écriture en morceaux bornés en octets, marqueur `_chunks` écrit en dernier, ne lève jamais) et `_cacheGetChunked()` (relecture tolérante, `null` sur morceau expiré). Exportées via `EXPORTED_GLOBALS` dans `tests/harness.js` ; couvertes par `tests/cache-bytes.test.js` sur un faux `CacheService` qui applique la limite en octets.

**Humanisé** : Ajout d'un contrôle automatique garantissant la neutralisation systématique de toute donnée dynamique injectée dans l'interface.
**Technique** : Nouveau test `tests/innerhtml-audit.test.js` servant de cliquet anti-régression : chaque affectation `innerHTML` doit soit être statique/littérale, soit appeler `escapeHtml()`/`encodeURIComponent()`, soit figurer dans une liste d'exceptions auditées et justifiées.

### Corrigé
**Humanisé** : Neutralisation systématique des caractères spéciaux dans les boutons rapides du barème et les descriptions d'historique.
**Technique** : Échappement HTML ajouté sur `entry.action` dans `renderBaremeQuickBtns` et remplacement du `.replace(/</g, '&lt;')` incomplet par `escapeHtml()` dans les cartes de `renderHistEntries`.

**Humanisé** : Maintien du cache de l'historique même sur les volumes importants, évitant les relectures superflues du tableur lors des changements d'onglet.
**Technique** : `StorageService.getFullHistoryRowsCached` (`Code.gs:945`) découpe désormais le payload en morceaux de 90 000 caractères sur plusieurs clés `CacheService`, même pattern que `apiGetChangelog` (`Code.gs:4235`), au lieu d'abandonner la mise en cache au-delà de `CACHE_MAX_BYTES`.

**Humanisé** : Fiabilisation du cache serveur pour douze modules (classements, records, tchat, notes...), évitant sa désactivation intempestive en présence d'emojis.
**Technique** : Les 12 sites de `Code.gs` qui gardaient leur écriture par `serial.length <= CONFIG.CACHE_MAX_BYTES` passent par `_cachePutChunked()`/`_cacheGetChunked()`. Le `else _logCacheSkip(...)` mort de `StorageService.getAllLogs` est supprimé (l'aide journalise elle-même).

**Humanisé** : Correction du plantage de la page lors du chargement d'un rapport de santé volumineux.
**Technique** : `AnalyticsService.getDataHealth` écrivait via un `cache.put` nu, sans garde de taille ni `try` — une exception `Argument too large` du service remontait jusqu'à l'appelant. L'écriture passe maintenant par `_cachePutChunked()`, qui ne lève jamais.

**Humanisé** : Ajustement du découpage en cache de l'historique et du changelog pour respecter les limites Google en présence d'emojis.
**Technique** : `StorageService.getFullHistoryRowsCached` et `apiGetChangelog` abandonnent leur découpage maison en 90 000 caractères (jusqu'à 360 000 octets par morceau) au profit de `_cachePutChunked()`/`_cacheGetChunked()`, bornés en octets. Le schéma de clés (`key`, `key_chunks`, `key_N`) est conservé, donc les entrées écrites par la v3.20.9 restent lisibles pendant leur TTL.

### Supprimé
**Humanisé** : Suppression du code dupliqué de mise en cache au profit d'un mécanisme partagé.
**Technique** : Suppression de la logique de chunking dupliquée dans les deux fonctions, ainsi que du littéral `600` et du `chunkSize = 90000` codés en dur ; le TTL vient désormais de `CONFIG.CACHE_TTL_SECONDS`.

## [v3.21.0] - 2026-08-25

### Sécurité
**Humanisé** : Vérification systématique du mot de passe par le serveur à chaque action de modification d'un joueur.
**Technique** : `requireAuthor(author, password)` (`Code.gs:248`) valide le mot de passe via `SettingsService.verifyIdentity` (`Code.gs:760`) sur 49 points d'entrée d'écriture (`Code.gs` et `AutoPoints.gs`). Côté client, `callServer` (`Index.html:8845`) transmet `_identityPassword` en mémoire aux fonctions identifiées dans `_MUTATING_APIS`.

### Corrigé
**Humanisé** : Sécurisation des mots de passe des joueurs avec hachage automatique dans la feuille de données.
**Technique** : `SettingsService.verifyIdentity` (`Code.gs:755`) hache désormais en SHA-256 (`Utilities.computeDigest`). Migration transparente : un mot de passe legacy en clair est accepté une dernière fois puis immédiatement réécrit en hash — aucun script de migration séparé, aucune manipulation manuelle du Sheet réel. `tests/harness.js` : `Utilities.computeDigest` ajouté à la sandbox de test.

**Humanisé** : Masquage des alertes d'erreur lors des micro-coupures réseau pendant l'actualisation du tchat.
**Technique** : `callServer` (`Index.html:8860`) accepte désormais un paramètre `silent` pour supprimer les notifications `showToast` sur les échecs et erreurs retournées. `pollChat()` (`Index.html:7845`) l'active pour fiabiliser le cycle de polling sans polluer l'interface.

### Modifié
**Humanisé** : Annulation du hachage des mots de passe : maintien du stockage en clair dans la feuille Joueurs.
**Technique** : Suppression de `_hashPassword` dans `Code.gs` et retour à une comparaison directe chaîne-à-chaîne dans `SettingsService.verifyIdentity` (`Code.gs:760`), sans réécriture ni altération des cellules de la colonne `Password`.

## [v3.20.2] - 2026-08-25

### Corrigé
**Humanisé** : Correction d'un blocage du résumé rapide sur le Dashboard en présence d'entrées dans un Top Alternatif.
**Technique** : `apiGetQuickStats('alt')` lisait `.timestamp` sur des objets `AltStorageService.getAltLogs()` qui exposent `.date` — `TypeError` garanti. Normalisation au point d'entrée de la fonction (`Code.gs:2724`). Test de régression `tests/quick-stats.test.js`.

**Humanisé** : Conservation de la date d'origine lors du rattachement d'une entrée d'historique à un Top Alternatif.
**Technique** : `AltStorageService.linkHistoryRowsToAltCategory` (`Code.gs:1566`) lisait `histItem.timestamp` (inexistant sur les lignes de `getFullHistoryRowsCached()`, qui expose `.date`) — `_buildAltRow` retombait alors sur `new Date()`. Test de régression `tests/alt-tops.test.js`.

**Humanisé** : Correction de l'outil d'instantané (snapshot) avec ajout des permissions Google Drive et mise à jour de l'archivage.
**Technique** : Ajout du scope `https://www.googleapis.com/auth/drive` dans `appsscript.json` (absent, donc jamais auto-étendu par GAS). `BackupService.createSnapshot` (`Code.gs:514`) remplace le couple déprécié `folder.addFile()`/`parent.removeFile()` (modèle multi-parents) par `copyFile.moveTo(folder)`. `tests/harness.js` : `moveTo` ajouté à la fausse Drive.

**Humanisé** : Correction d'une faille de sécurité (XSS) sur l'affichage des URLs d'avatars dans l'Historique et les Tops Alternatifs.
**Technique** : `getAvatarUrl()` retourne du texte libre (`Players.meta`, jamais validé côté serveur) injecté sans échappement dans deux `<img src="${...}">` (`Index.html:9291`, `9524`) — faille XSS stockée, corrigée par `escapeHtml()`. Quatre constructions `style.backgroundImage = 'url(' + ... + ')'` (non exploitables en XSS — ce sont des affectations de propriété CSSOM, pas de l'innerHTML — mais fragiles si l'URL contient `"`/`\`) durcies via un nouveau helper `cssUrl()`.

**Humanisé** : Optimisation des performances lors du réordonnancement des listes (Joueurs, Tops, Barème, Phrases) en réduisant les requêtes réseau.
**Technique** : `SettingsService.reorderEntities`, `BaremeService.reorderEntries`, `PhrasesService.reorderPhrases` (`Code.gs`) passent d'un `setValue()` par ligne à un seul `setValues()` sur la colonne Ordre complète. `apiRepairOrder` et les boucles `deleteRow()` (admin, rares) restent inchangés — hors périmètre de ce fix, voir le plan.

## [v3.20.1] - 2026-08-24

### Corrigé
**Humanisé** : Maintien ouvert des menus déroulants et sélecteurs lors des clics internes ou du défilement.
**Technique** : `Index.html` — trois vérifications de clic "à l'extérieur" étaient soit incomplètes, soit absentes. Le panneau `.rs-panel` des rich-selects est reparenté sous `<body>` à l'ouverture (`openPanel()`, l. 8145) pour échapper au clipping d'un conteneur ancêtre ; le garde `mousedown` global (l. ~18234) ne testait que `e.target.closest('.rich-select')`, qui ne matche plus rien une fois le panneau déplacé — ajout d'un second test `.closest('.rs-panel')`. `altMenu` (pilule ⭐ Top Alt, `addEntryRow()`) et `#whoAmIDropdown` fermaient sur n'importe quel clic document sans aucune vérification de containment — ajout de `altMenu.contains(e.target)` et `whoAmIWrap.contains(e.target)` respectivement. Pour who-am-i, `closeWhoAmIDropdown()`/`placeWhoAmI()`/`detachWhoAmI` sont remontées de la portée locale de `window.onload` vers la portée module : `applyIdentity()` et les deux branches de sélection dans `renderWhoAmI()` fermaient le dropdown en retirant directement la classe `.open` (sans passer par `closeWhoAmIDropdown()`), ce qui — une fois le clic à l'intérieur exempté de la fermeture globale — aurait laissé fuiter indéfiniment les écouteurs `scroll`/`resize` d'`anchorFloating()` à chaque sélection d'identité (même classe de fuite que celle éliminée par `anchorFloating()` en v3.17.0). Nouveaux tests `tests/dropdown-outside-click.test.js` (5 cas), vérifiés en échouant sur l'ancien code puis passant sur le correctif, plus vérification en direct sur le harness local (clic sur le panneau reste ouvert, clic sur une option ferme, clic réellement extérieur ferme — sur les 3 menus).

**Humanisé** : Correction d'une fuite mémoire lors de l'ajout et de la suppression répétée de lignes dans la saisie de lot.
**Technique** : `Index.html` — `addEntryRow()` enregistrait un `document.addEventListener('click', ...)` dédié à chaque appel (fermeture au clic extérieur de la pilule ⭐ Top Alt, ajoutée en v3.20.1), jamais retiré même quand la ligne est supprimée (`delBtn` ne fait que `div.remove()`). Remplacé par un seul écouteur global posé une fois avant `addEntryRow()`, qui ferme tout `.alt-picker-menu` ne contenant pas la cible du clic — le sélecteur CSS étant stable, plus besoin d'un écouteur par instance. Tests `tests/dropdown-outside-click.test.js` étendus (2 cas de plus, vérifiés en échec sur l'ancien code via `git stash`), plus vérification en direct : ajout/ouverture/suppression de 3 lignes sans erreur console, menu toujours fonctionnel après.

## [v3.20.0] - 2026-08-24

### Corrigé
**Humanisé** : Refonte complète de l'onglet Guide : mise à jour des documentations, ajout d'une recherche, correction des thèmes et optimisation de l'ergonomie mobile et accessibilité.
**Technique** : `Index.html` — `--accent-rgb` déclarée dans `:root` et `body.light` (jusque-là un fallback codé en dur `rgba(var(--accent-rgb, 255,71,87), …)` masquait l'absence de la variable). `setupResizable()` (partagée Guide/Barème) : accès `localStorage` protégés par `try/catch`, plafond dynamique `effectiveMax()` lié à `window.innerWidth`, support tactile (`touchstart`/`touchmove`/`touchend`) et clavier (`tabindex`, `role="separator"`, flèches gauche/droite). Nouvelle `showGuideSection()` extraite d'`initGuideAccordion()`, avec `console.warn` sur un `data-section` orphelin et câblage ARIA `role="tablist"/"tab"/"tabpanel"` + `aria-selected`/`aria-controls`/`aria-labelledby` déduit de la correspondance `data-section` ↔ `id="gsec-*"`. Un seul écouteur de clic sur `.guide-layout` sert la sidebar et les nouveaux renvois `.guide-crosslink`. `#gsec-outils`, `#gsec-dashboard`, `#gsec-parametres`, `#gsec-tchat`, `#gsec-theme` réécrits pour refléter l'app réelle. CSS : `.guide-nav-btn` mobile passe à `min-height: var(--tap-min)`, les labels de groupe redeviennent visibles (`flex-basis: 100%`) au lieu d'être masqués, `body.light .guide-feature-item` aligné sur le reste de l'app, nouveau champ `#guideSearchInput` filtrant les boutons du menu en direct. Nouveaux tests `tests/guide-audit.test.js` (16 cas), dont deux garde-fous d'exhaustivité qui comparent le contenu du Guide aux vraies cartes/sous-onglets de l'app et échoueront si un futur outil ou sous-onglet est ajouté sans être documenté. Passe close le registre `docs/superpowers/plans/2026-08-11-audit-onglet-par-onglet.md` (7/7 cibles). Vérifié contre le harness local uniquement.

## [v3.19.0] - 2026-08-24

### Ajouté
**Humanisé** : Ajout du filtrage par trimestre sur le Dashboard et d'un bouton d'export rapide du pack trimestriel (CSV, Excel, graphiques).
**Technique** : `Index.html` — nouveau `quarterBounds(refDate, offset)`, seule source de calcul des bornes de trimestre calendaire, consommée par `dateRangePreset()`/`DATE_RANGE_CHIPS` (Historique, Journal d'audit) et `rangePresetItems()` (Dashboard). `exportAsCSV()`/`exportAsExcel()` scindées en builders purs (`buildCSVBytes()`/`buildExcelWorkbook()`) réutilisés par le nouveau `exportSeasonPack()`, qui zip CSV+Excel+PNG (`fflate`, même dépendance que "Tout exporter") et restaure le filtre de période d'avant clic.

## [v3.18.0] - 2026-08-24

### Ajouté
**Humanisé** : Ajout de l'outil « Créer un snapshot » dans les Paramètres pour sauvegarder l'intégralité des données dans un Google Sheet distinct en un clic.
**Technique** : `Code.gs` — nouveau `BackupService.createSnapshot()` (`spreadsheet.copy()` + déplacement Drive vers un sous-dossier `Snapshots top-des-tops` créé au premier usage à côté du fichier source) et `apiCreateSnapshot(author)`. `Index.html` — bouton dans 🔧 Outils avec lien réel vers la copie (pas de navigation pilotée par script). Pas de rétention automatique. `tests/harness.js` — faux `DriveApp`/`Spreadsheet.copy()` en mémoire (`makeFakeDrive()`), réutilisé par `tests/frontend/fixtures.js` pour que le harness de prévisualisation exerce le vrai chemin de succès.

## [v3.17.0] - 2026-08-24

### Corrigé
**Humanisé** : Amélioration globale de l'ergonomie : positionnement dynamique des menus déroulants au défilement, support complet des raccourcis clavier (Échap, Ctrl+Entrée) et fiabilisation des modales.

**Technique** : `Index.html` — trois briques partagées remplacent une vingtaine d'implémentations ad hoc. (1) `anchorFloating(el, anchorEl, place, onDetach)` : cycle de vie complet d'un élément `position:fixed` ancré à un déclencheur (recalage sur `scroll` en capture + `resize`, auto-détachement quand l'ancre sort du viewport, `detach()` idempotent). Adopté par `buildRichSelect` (`placePanel`), le menu `whoAmIDropdown` (`placeWhoAmI`), `openNoteHistoryPopover` (`placePopover`) et `attachMentionAutocomplete` (`place`) — ce dernier passait `hide` sur `scroll` au lieu de suivre. (2) `openModal(el, opts)` / `closeModal(el)` sur pile `_modalStack` + `_modalReturnFocus` : verrou `body.modal-open { overflow: hidden }`, focus initial, restitution du focus à l'ouvreur, retrait DOM des conteneurs marqués `_ephemeral`. `closeModal(el)` conserve `#modalBackdrop` par défaut, donc les ~40 appels nus existants sont inchangés. Les sept conteneurs y passent : `#modalBackdrop` (12 ouvertures), `#phraseEditModal`, `#presetCreateModal`, `#presetRenameModal`, `#bulkImportModal`, `#identityPwdModal` et l'overlay `.export-modal-overlay` construit à la volée par `openExportModal`. (3) `onModalKeydown` posé une seule fois sur `document` en capture, lisant le haut de pile : Échap, Ctrl+Entrée et piège de Tab/Maj+Tab avec `MODAL_FOCUSABLE_SEL` et requête paresseuse des champs (le contenu des fenêtres est reconstruit à chaque ouverture). Remplace l'ancien handler posé sur `#modalBackdrop` — inatteignable tant qu'aucun focus n'était donné à l'intérieur — et rend redondants quatre handlers Échap par champ, supprimés. Fuite colmatée : `attachMentionAutocomplete` retourne `{ hide, destroy }`, `autoGrowTextarea` expose `fit.destroy()`, `buildTextEditor` expose `wrap._destroy()` appelé par `closeModal` sur les `.md-editor` du conteneur fermé. Nouveaux tests `tests/papercuts.test.js` (21 cas) + `tests/dom-stub.js` (DOM minimal pour VM), dont un garde-fou qui échoue si un futur élément flottant recâble `scroll`/`resize` à la main. Vérifié contre le harness local uniquement (`tests/frontend/serve.js`) : ancrage des 4 éléments, 20 cycles ouverture/fermeture sans fuite, et Échap/Tab/verrou/retour de focus sur les 7 conteneurs. Aucune donnée réelle touchée.

## [v3.16.1] - 2026-08-23

### Corrigé
**Humanisé** : Les menus déroulants et le menu d'identité suivent désormais le défilement de la page en temps réel au lieu de se décrocher de leur bouton.
**Technique** : `Index.html` — `buildRichSelect()` : position du panneau extraite dans `positionPanel()`, ré-appelée sur `scroll` (capture) et `resize` tant que le panneau est ouvert, listeners retirés dans `closePanel()`. Menu `whoAmIDropdown` : même traitement (`positionWhoAmIDropdown()` + listeners scroll/resize attachés à l'ouverture, retirés à la fermeture). Reprend le pattern déjà en place dans `openNoteHistoryPopover()`.

## [v3.16.0] - 2026-08-14

### Corrigé
**Humanisé** : Prise en compte des données situées sur la première ligne des feuilles sans en-têtes, évitant l'invisibilité et la création de doublons du premier Joueur ou Top.
**Technique** : `Code.gs` — chaque lecture faisait `data.slice(1)` ou `getRange(2, 1, lastRow - 1, n)` et calculait `rowIndex = i + 2`, en supposant une ligne d'en-tête que rien ne garantit sur `History`/`Players`/`Categories` (jamais auto-créées : `ConfigService.getSheets()` lève une erreur si elles manquent). Nouveau socle : table `SHEET_HEADERS` (libellés canoniques par feuille), `_isHeaderRow()` (correspondance de libellés, plus un contrôle de type date pour les feuilles à première colonne datée), `_headerOffset()`/`_headerOffsetFromValues()` mémoïsés par exécution, `_firstDataRow()` et `_readDataRows()` (lecture de plage unique — la ligne 1 est lue avec les autres puis écartée seulement si c'est bien un en-tête, donc aucun appel Sheets supplémentaire sur les chemins chauds). Tous les sites de lecture, tous les calculs de `rowIndex`, et tous les gardes `rowIndex < 2` ont été migrés : `SettingsService` (getEntities, addEntity, renameEntity, reorderEntities, verifyIdentity, _renameInColumn), `StorageService` (_parseHistoryRow, _readLogsFromSheet, _readFullHistoryRows, _computeDataHealth, fixZeroPoints, deleteOrphans, apiGroupSimilarEntries, updateHistory*), `NotesService`, `ChatService`, `BaremeService`, `PhrasesService`, `SettingsSheetService`, `AltSettingsService`, `AltStorageService`, `AuditService` (recherche de ligne pour l'annulation), `AutoPoints.gs`, et les outils `apiRepairOrder`/`apiGetAuditLog`/`apiDetectDistributedLots`/`apiGroupRows`/`apiUngroupLot`/`apiDeleteGroup`/`apiUpdateBulkEntries`/`apiBackfillNoteAuthors`/`apiRenamePreset`/`apiDeletePreset`/`apiApplyMentionFixes`. Deux écritures dangereuses neutralisées au passage : `NotesService._ensureColumns()` écrasait les colonnes NoteId/auteurs de la première note d'une feuille sans en-tête, et `apiRepairOrder` pouvait écrire le mot « Ordre » par-dessus la valeur d'Ordre du premier joueur. Nouveau fichier de tests `tests/headerless-sheets.test.js` (16 cas, feuilles avec et sans en-tête). Aucune donnée réelle touchée : tout vérifié contre le harness local.

### Supprimé
**Humanisé** : Suppression des tests obsolètes liés aux outils retirés en v3.15.1.
**Technique** : `tests/outils-nouveaux.test.js` — suppression des 4 cas visant `apiDetectOutlierScores` et `apiGetInactivePlayers`, endpoints supprimés en v3.15.1 sans nettoyage de leurs tests.

### Modifié
**Humanisé** : Le changelog s'ouvre par défaut en vue Humanisée, avec masquage initial des entrées de la nouvelle catégorie « 🔧 Interne ».
**Technique** : `Index.html` — `_clViewMode` initialisé à `'human'` ; nouveau chip `.cl-cat-chip[data-cat="Interne"]` sans classe `active` par défaut ; `_clActiveCats` n'inclut pas `'Interne'` à l'init ni dans `resetChangelogFilters()` ; `formatChangelogBody()` mappe `<h3>Interne</h3>` vers un header stylé `var(--text-muted)` ; CSS `.cl-cat-chip[data-cat="Interne"]` ajouté.

## [v3.15.1] - 2026-08-14

### Supprimé
**Humanisé** : Suppression des outils inutilisés « Scores aberrants » et « Joueurs inactifs » de l'onglet Outils.
**Technique** : `Index.html` — suppression des cartes `toolOutliersCard` et `toolInactiveCard`, du bouton de navigation rapide correspondant, des fonctions JS (`scanOutliers`, `getDismissedOutlierRowIndexes`, `dismissOutlierRowIndex`, `scanInactivePlayers`) et de leurs event listeners. `Code.gs` — suppression de `apiDetectOutlierScores` et `apiGetInactivePlayers`.

## [v3.15.0] - 2026-08-13

### Corrigé
**Humanisé** : Fiabilisation du réordonnancement et du choix de couleur par index de ligne, avec signalement des noms en double dans le panneau Santé.
**Technique** : `Code.gs` — `apiSetColor`/`SettingsService.setEntityColor` et `apiReorderEntities`/`SettingsService.reorderEntities` adressaient encore la ligne par **nom** (`data.findIndex(r => r[0] === name)`), contrairement à `deleteEntity`/`renameEntity` déjà migrés vers un ciblage par `rowIndex` (v3.14.2). Avec un nom dupliqué, la couleur retombait toujours sur la première ligne portante ce nom, et le contrôle de permutation du réordonnancement (`Set` de noms) échouait dès qu'un nom apparaissait deux fois — peu importe la ligne concernée par le déplacement. Les deux endpoints adressent désormais par `rowIndex`, avec le même garde-fou `expectedName` (refuse si la ligne a changé entre le chargement de la page et le clic) que `deleteEntity`/`renameEntity`. `Index.html` — `dataset.rowIndex` ajouté à chaque ligne de la liste ; les 3 points d'appel de couleur et le réordonnancement transmettent `rowIndex` au lieu du seul nom.

### Sécurité
**Humanisé** : Blocage explicite du renommage en cas d'homonymes pour prévenir la fusion accidentelle de données.
**Technique** : `Code.gs` — `SettingsService.renameEntity()` compte désormais les lignes partageant `oldName` avant de renommer ; si plus d'une, lève une erreur explicite au lieu de laisser `_renameInColumn` (History/Notes/Chat/Bareme/Phrases) réattribuer par erreur l'historique du jumeau non concerné. `StorageService.getDataHealth()`/`_computeDataHealth()` renvoient un nouveau champ `duplicateNames` (Joueurs et Tops), affiché dans le panneau Santé. Aucun outil de fusion automatique n'a été ajouté — fusionner des données réelles par heuristique est précisément le type d'opération à l'origine de l'incident déjà documenté (§7).

Revue par 3 agents Claude indépendants (correction, intégrité des données, simplicité) avant implémentation ; reproduit et vérifié via le harness local avec un jeu de données répliquant exactement le doublon réel ("Ilker" x2) — réordonnancement, changement de couleur et refus de renommage confirmés avant/après correctif.

## [v3.14.5] - 2026-08-13

### Corrigé
**Humanisé** : Extension de la protection anti-écrasement d'ordre aux listes du Barème et des Phrases.
**Technique** : `Index.html` — même défaut que v3.14.4 mais sur `baremeEntries` (7 points d'écriture : les deux chargeurs indépendants `loadBaremeSettings()`/`loadBareme()`, ajout, modification, suppression, réordonnancement) et `_customPhrases` (11 points d'écriture : chargeur, ajout, copie depuis les phrases de repli, modification, suppression avec délai d'annulation, création/renommage/suppression de preset, import en lot, seed du preset "Défaut" au démarrage) — chacun écrivait dans son cache partagé sans garde d'ordre d'arrivée, exactement comme `cachedPlayers`/`cachedCategories` avant v3.14.4. Deux nouveaux compteurs de génération, `_baremeReqGen` et `_phrasesReqGen`, appliqués à chacun de ces points d'écriture. Reproduit et vérifié pour le Barème via le harness local en retardant artificiellement une seconde requête `apiGetBareme` déclenchée après un réordonnancement — confirmé que la réponse tardive n'écrase plus l'ordre à jour, avant et après correctif.

## [v3.14.4] - 2026-08-13

### Corrigé
**Humanisé** : Correction de l'annulation intempestive du réordonnancement des Joueurs et Tops causée par des réponses réseau tardives.
**Technique** : `Index.html` — `loadEntities()` (déclenché au démarrage) et le clic ▲/▼ (`apiReorderEntities`) écrivaient tous deux dans `cachedPlayers`/`cachedCategories` de façon asynchrone, sans garde d'ordre d'arrivée. Si la réponse `apiGetSettings` du chargement initial (capturée avant le clic) arrivait après la réponse du réordonnancement — latence réseau non garantie, notamment juste après un rechargement de page — elle écrasait silencieusement le nouvel ordre avec l'ancien. Nouveau compteur de génération `_entitiesReqGen`, incrémenté à chaque nouvel appel et vérifié avant d'appliquer une réponse ; toute réponse devenue obsolète entre-temps est ignorée. Même schéma que `histPrefetchKey()` (Historique, v3.7.0). Reproduit et vérifié via le harness local (`tests/frontend/`) en retardant artificiellement la réponse `apiGetSettings` pour simuler la course.

## [v3.14.3] - 2026-08-12

### Corrigé
**Humanisé** : Prise en compte immédiate des ajouts ou suppressions effectués directement dans Google Sheets sans attendre l'expiration du cache.
**Technique** : `SettingsService.getEntities()`, `BaremeService.getEntries()` et `PhrasesService.getAll()` (`Code.gs`) mettaient en cache leur résultat sous une clé qui n'incluait que `_settingsVersion()`/`_baremeVersion()`/`_phrasesVersion()` — des compteurs bumpés uniquement par les mutations passant par l'app (`addEntity`, `addEntry`, `addPhrase`...). Une ligne ajoutée/supprimée directement sur la feuille ne bumpait rien, donc le cache continuait à servir l'ancienne liste jusqu'à expiration du TTL (`CACHE_TTL_SECONDS` = 600s). Le nombre de lignes de la feuille (`sheet.getLastRow()`) est désormais inclus dans la clé de cache des trois fonctions, invalidant le cache dès que la feuille change de taille, sans coût supplémentaire (`getLastRow()` ne relit pas les données).

## [v3.14.2] - 2026-08-12

### Corrigé
**Humanisé** : Ciblage précis par ligne lors de la suppression ou du renommage d'un Joueur ou Top, évitant la suppression accidentelle d'homonymes.
**Technique** : `SettingsService.getEntities()` (`Code.gs`) attache désormais `rowIndex` (numéro de ligne réel de la feuille, calculé avant filtre/tri — même précaution que `BaremeService.getEntries`/`PhrasesService.getAll`) à chaque Joueur/Top renvoyé. `deleteEntity`/`renameEntity` prennent ce `rowIndex` en paramètre au lieu de faire correspondre par nom sur toute la feuille, et vérifient que le contenu de cette ligne correspond toujours au nom attendu avant d'agir (protection si la feuille a changé entre le chargement de la page et le clic) — sinon ils refusent avec un message clair plutôt que de risquer de toucher la mauvaise ligne. `apiManageEntity` (DELETE/RENAME) exige maintenant ce `rowIndex`, transmis par `Index.html` depuis l'objet déjà reçu du serveur (`item.rowIndex`) ; ADD est inchangé. `apiSetColor` reste, pour l'instant, par nom (impact cosmétique seulement en cas d'homonymes — non traité dans cette passe).

## [v3.14.1] - 2026-08-12

### Corrigé
**Humanisé** : Suppression du saut visuel temporaire lors du déplacement ▲/▼ d'un Joueur ou d'un Top dans les Paramètres.
**Technique** : `apiReorderEntities` (`Code.gs`) ne renvoyait que `{success:true}`, forçant `Index.html` à rappeler `loadEntities()` pour rafraîchir la liste — or celle-ci repeint d'abord depuis son cache `localStorage` (donc l'ancien ordre, pré-réorganisation) avant que la vraie réponse serveur arrive, d'où le flash. `apiReorderEntities` renvoie désormais `players`/`categories` à jour (comme `apiGetSettings`), et le point d'appel (`buildMoveButtons` sur `#playersList`/`#categoriesList`) peint directement cette réponse via `_paintEntitiesUI` au lieu de rappeler `loadEntities()`. Comportement déjà correct pour Barème/Phrases, qui suivaient déjà ce schéma.

## [v3.14.0] - 2026-08-12

### Ajouté
**Humanisé** : Ajout de boutons ▲/▼ pour réordonner manuellement les Joueurs, Tops, Barèmes et Phrases, avec un outil de réparation d'ordre dans les Paramètres.
**Technique** : `Code.gs` — nouvelle colonne `Ordre` sur les feuilles `Players`/`Categories` (colonne E) et `Bareme`/`Phrases` (colonne D). `SettingsService.getEntities`, `BaremeService.getEntries`, `PhrasesService.getAll` trient désormais par `Ordre`, groupé par Top/preset+pool pour Barème et Phrases, via le helper partagé `_sortByOrdreOrOriginal`, qui se replie silencieusement sur l'ordre brut de la feuille tant que la colonne est absente ou incomplète (jamais d'erreur, jamais de blocage). Nouvelles actions `apiReorderEntities`, `apiReorderBareme` (par groupe Top), `apiReorderPhrases` (par groupe preset+pool) et `apiRepairOrder`, toutes protégées par `requireAuthor`/`withLock`/`AuditService.log`. `Index.html` — nouveau composant partagé `buildMoveButtons` (échange avec le voisin direct au clic/tap) ; un premier essai en glisser-déposer basé sur les Pointer Events s'est révélé peu fiable en usage réel et a été retiré au profit de cette approche par boutons. Distinct du glisser-déposer existant de "Saisir un Lot" (`attachRowDragEvents`, HTML5 Drag-and-Drop, non modifié). `renderBaremeDrawer`/`renderBaremeQuickBtns` ne trient plus côté client par points décroissants, le serveur fournissant déjà le bon ordre.

## [v3.13.0] - 2026-08-11

### Corrigé
**Humanisé** : Rétablissement du Tchat sur mobile via un bouton dédié plein écran et correction de la transition d'affichage lors du redimensionnement de fenêtre.
**Technique** : `Index.html` — nouvelles règles `body.mobile-layout .nav-chat-btn`/`.chat-side-panel` (bouton flottant + panneau plein écran, réutilisant `openChatPanel`/`closeChatPanel` existants) remplaçant le blocage `display:none !important` inconditionnel hors desktop. `initLayoutModeToggle()` écoute désormais `matchMedia('(max-width:768px)').addEventListener('change', ...)` pour réévaluer la disposition à chaque franchissement du seuil, sauf si l'utilisateur l'a explicitement forcée via le bouton PC/Mobile.

**Humanisé** : Mise à jour immédiate des citations en « Message supprimé » lorsqu'un message cité est effacé dans le tchat.
**Technique** : `Index.html` — la suppression d'un message tchat recharge désormais la liste depuis le serveur (`loadChat()`) au lieu de simplement retirer le message en local, pour que les citations d'autres messages soient recalculées.

**Humanisé** : Réattribution automatique des anciens messages du tchat lors du renommage d'un joueur.
**Technique** : `Code.gs` — `SettingsService.renameEntity()` propage désormais le renommage d'un Joueur à la colonne `Auteur` de la feuille `Chat`, comme c'était déjà fait pour `History`/`AutoRules`/`Notes`.

**Humanisé** : Correction des doublons visuels lors de l'envoi de messages et fiabilisation du compteur de messages non lus dans le tchat.
**Technique** : `Index.html` — `renderChatMessages()` déduplique désormais les envois optimistes contre les messages déjà confirmés (auteur + texte + réponse-à) avant affichage. `pollChat()` compte les non-lus par identifiant de message jamais vu plutôt que par différence de longueur totale, qui pouvait rester inchangée sur un ajout+suppression compensés.

**Humanisé** : Amélioration du champ de saisie du tchat pour afficher correctement les longs messages multilignes avec défilement.
**Technique** : `Index.html` — retrait du `max-height: 120px` fixe sur `.chat-composer textarea`, qui entrait en conflit avec le plafond dynamique déjà géré par `autoGrowTextarea()`.

**Humanisé** : Affichage de l'avatar du joueur dans les citations et le bandeau de réponse du tchat.
**Technique** : `Index.html` — avatar + couleur du joueur ajoutés à la citation (`buildChatMessageEl`) et au bandeau de réponse (`setChatReplyTo`), alignés sur le traitement de l'auteur direct d'un message.

### Modifié
**Humanisé** : Harmonisation visuelle du bouton de suppression dans le tchat et mémorisation de l'état ouvert/fermé du panneau entre les sessions.
**Technique** : `Index.html` — classe `danger` sur le bouton de suppression (`buildChatMessageEl`) ; état `_chatPanelOpen` persisté en `localStorage` (`tdt_chat_panel_open`) et relu au chargement ; `.chat-badge`/`.nav-chat-btn` utilisent `var(--error)`/`var(--on-accent)`/`var(--btn-alt)` au lieu de couleurs hexadécimales fixes. Ajout de `maxlength="2000"` sur le champ de saisie, reflétant la limite déjà appliquée côté serveur.

### Supprimé
**Humanisé** : Suppression du code mort et des styles CSS obsolètes de l'ancien widget tchat.
**Technique** : `Index.html` — retrait des règles CSS `.chat-fab`/`.chat-fab-badge`/`.chat-panel` et de la constante JS `CHAT_FAB_POS_KEY`, tous confirmés inutilisés.

## [v3.12.0] - 2026-08-11

### Corrigé
**Humanisé** : Affichage d'un avatar par défaut dans les notes et mentions lorsqu'une image personnalisée ne charge pas.
**Technique** : `Index.html` — `buildNoteAuthorAvatar`, la pastille de la barre flash (`notes-player-chip`), `renderMentions()` et `attachMentionAutocomplete()` basculent désormais sur `getAvatarUrl(name, '')` au lieu de retirer l'image (`img.remove()`).

**Humanisé** : Préservation de la visibilité des notes et synchronisation des compteurs lors du renommage d'un joueur.
**Technique** : `Code.gs` — `SettingsService.renameEntity()` propage désormais le renommage d'un Joueur à la colonne `Joueur` de la feuille `Notes`, comme c'était déjà fait pour `History`/`AutoRules`. Pour les notes déjà orphelines (renommage ou suppression antérieurs à ce correctif), `renderNotesBlocks()` (Index.html) les affiche maintenant dans un bloc distinct « (introuvable dans Paramètres) » plutôt que de les faire disparaître — restent visibles, éditables, supprimables. Test de non-régression ajouté (`tests/settings.test.js`), y compris la survie intacte des notes d'un joueur non concerné par le renommage.

**Humanisé** : Protection contre la création de notes en double lors d'un double appui rapide sur Entrée.
**Technique** : `Index.html` — garde anti-double-soumission (`flashSubmitting`/`npbSubmitting`) sur les deux chemins d'ajout ; jusqu'ici seul le bouton était désactivé pendant l'appel serveur, pas le raccourci clavier.

**Humanisé** : Correction du blocage et de l'affichage figé de l'historique d'une note en cas d'erreur ou d'action simultanée.
**Technique** : `Index.html` — `onError` ajouté à `callServer('apiGetNoteHistory', ...)` ; `renderNotesBlocks()` ferme désormais le popover actif avant de reconstruire la liste, puisque celle-ci détruit le bouton auquel il est ancré.

**Humanisé** : Affichage de l'horodatage serveur exact lors de la modification d'une note.
**Technique** : `Code.gs` — `apiEditNote` renvoie désormais `editedAt` (l'horodatage serveur réel) ; `Index.html` l'utilise au lieu de `new Date().toISOString()`.

### Sécurité
**Humanisé** : Harmonisation globale des boutons compacts sur mobile avec une taille tactile minimale de 44px.
**Technique** : `Index.html` — règle `@media (max-width:768px) { button.small { min-height: var(--tap-min) } }` globale, remplace 3 règles scopées par onglet.

## [v3.11.0] - 2026-08-11

### Corrigé
**Humanisé** : Correction de l'affichage d'un nombre de jours négatif dans l'outil « Joueurs inactifs » pour les saisies antidatées dans le futur.
**Technique** : `Code.gs` — `apiGetInactivePlayers()` : `daysSinceLastEntry` désormais borné à 0 minimum (`Math.max(0, ...)`).

**Humanisé** : Détection symétrique des scores aberrants (valeurs anormalement basses comme anormalement hautes).
**Technique** : `Code.gs` — `apiDetectOutlierScores()` teste désormais un seuil bas symétrique (`med - 5*mad`) en plus du seuil haut.

**Humanisé** : Gestion des erreurs serveur dans les Paramètres et Outils pour débloquer les boutons et écrans de chargement avec un message clair.
**Technique** : `Index.html` — ajout de l'`onError` manquant à `callServer()` sur ces 9 appels ; nettoyage du code mort qui re-testait `res.success` dans des callbacks que `callServer` avait déjà filtrés (même motif que la passe Historique et la passe Saisir un Lot précédentes).

**Humanisé** : Agrandissement des boutons d'action de l'onglet Outils sur mobile pour une meilleure ergonomie tactile.
**Technique** : `Index.html` — cibles tactiles de `#stab-tools button.small` portées à `var(--tap-min)` (44px) sous 768px.

**Humanisé** : Utilisation de la fenêtre de confirmation intégrée lors de la suppression d'un ensemble de phrases personnalisées.
**Technique** : `Index.html` — `handleDeletePreset()` utilise désormais `openConfirmModal()` comme le reste de Paramètres.

### Sécurité
**Humanisé** : Interdiction d'ajouter ou de renommer un Joueur ou Top vers un nom déjà existant pour éviter les doublons.
**Technique** : `Code.gs` — `SettingsService.addEntity()` et `renameEntity()` refusent désormais un nom déjà utilisé par une autre entité du même type. Tests de non-régression ajoutés (`tests/settings.test.js`), y compris la survie intacte des entités non concernées.

## [v3.10.0] - 2026-08-11

### Corrigé
**Humanisé** : Calcul exact du total de points dans le récapitulatif et la confirmation de saisie de lot multi-jours et multi-tops.
**Technique** : `Index.html` — nouvelle fonction `computeRowTotalPoints(row)`, qui reproduit fidèlement le calcul serveur (`appendBulkPlan`, Code.gs) : multiplication par le nombre de dates en mode « répéter », répartition en mode « distribuer », et prise en compte des Tops supplémentaires. Utilisée par `updateLotSummary()` (barre récap) et `openLotRecapModal()` (récapitulatif post-envoi), qui sommaient auparavant la seule valeur brute du champ points.

**Humanisé** : Conservation des Tops supplémentaires lors de la duplication d'une ligne en saisie de lot.
**Technique** : `Index.html` — `dupBtn` transmet désormais `subTops` (lu depuis les `.sub-top-item` de la ligne) dans le preset passé à `addEntryRow()` ; la construction des Tops supplémentaires est extraite dans `addSubTopItem(presetSubTop)`, appelée une fois par sous-top du preset au lieu de démarrer systématiquement vide.

**Humanisé** : Désactivation des actions conflictuelles (ajout de ligne, changement d'univers) pendant la préparation d'un groupement de lot.
**Technique** : `Index.html` — `addRowBtn`, `lotModeMainBtn` et `lotModeAltBtn` sont désormais désactivés pendant `lotGroupMode` (`enterLotGroupMode`/`exitLotGroupMode`), ces deux actions reconstruisant les lignes avec de nouveaux identifiants et invalidant silencieusement toute sélection en cours.

**Humanisé** : Préservation de la couleur d'origine des Tops lors du groupement de lignes.
**Technique** : `Index.html` — `applyLotGroup()` ne réécrit plus `--row-accent` (piloté par `applyRowCategoryVisuals` depuis la couleur réelle du Top) ; le badge « Groupe N » reste seul marqueur visuel du groupement.

**Humanisé** : Affichage de la couleur réelle du Top Alternatif sélectionné dans la ligne de saisie.
**Technique** : `Index.html` — le picker Top Alt lit désormais la couleur réelle de la catégorie sélectionnée (`ac.color`) au lieu de la constante `ALT_FALLBACK_COLOR` seule ; son état neutre utilise `var(--alt-accent)` (correct dans les deux thèmes) plutôt que la valeur figée du thème sombre.

**Humanisé** : Gestion des erreurs serveur sur l'historique rapide et les suggestions de barème pour débloquer l'affichage.
**Technique** : `Index.html` — `loadHistPage()` et `refreshBaremeForTop()` reçoivent un 5ᵉ argument `onError` à `callServer()`, qui affiche désormais un état d'erreur explicite au lieu de rien.

**Humanisé** : Correction du plantage de la modale de récapitulatif de lot en cas d'avatar manquant.
**Technique** : `Index.html` — `openLotRecapModal()` : l'attribut `onerror` de l'avatar utilisait `JSON.stringify()` (guillemets doubles) non échappé à l'intérieur d'un attribut HTML lui-même entre guillemets doubles, corrompant le HTML généré et rendant le JS de repli inexécutable. Échappement HTML ajouté.

**Humanisé** : Correction des couleurs et contrastes des champs de saisie de lot lors du changement de thème.
**Technique** : `Index.html` — au lieu de continuer à retirer `color`/`background-color` règle par règle, une classe `body.theme-switching` désactive toutes les transitions pendant une bascule de thème (`requestAnimationFrame` double avant retrait), fermant définitivement cette famille de bug plutôt que de la corriger au cas par cas à chaque passe d'audit.

**Humanisé** : Agrandissement des cibles tactiles sur mobile pour les boutons de points, de dates et d'actions de ligne.
**Technique** : `Index.html` — cibles tactiles de `#tab-inject .pts-btn`, `.d-mode-seg .d-mode-btn`, `.date-shortcut`, `.row-topbar .btn-dup/.btn-del` et `.sub-top-add-btn` portées à `var(--tap-min)` (44px) sous 768px.

**Humanisé** : Ajustement de l'espacement en bas de page pour que la barre récapitulative ne masque plus la dernière ligne.
**Technique** : `Index.html` — `#entryContainer` réserve un espace en bas (`:has(~ #lotSummaryBar:not(.hidden))`) au moins égal à la hauteur de la barre.

### Ajouté
**Humanisé** : Ajout d'une pastille de couleur sur les Tops supplémentaires dans la saisie de lot.
**Technique** : `Index.html` — pastille `.sub-cat-dot` synchronisée sur `categoryColor()` du Top sélectionné, mise à jour au changement de sélection.

**Humanisé** : Rejet des entrées de Tops Alternatifs invalides plutôt qu'un enregistrement silencieux à 0 point.
**Technique** : `Code.gs` — `AltStorageService.addAltEntries()` filtre désormais les entrées sans joueur/catégorie/points valides avant l'écriture, au lieu de les laisser passer à 0 via `_buildAltRow`. Chemin non atteignable avec l'UI actuelle (aucun appelant ne fournit de points invalides aujourd'hui) mais protection défensive alignée sur `addNativeAltEntries`. Test de non-régression ajouté (`tests/alt-tops.test.js`).

## [v3.9.0] - 2026-08-11

### Corrigé
**Humanisé** : Maintien de l'attribution exacte des badges de Tops Alternatifs dans l'Historique après une suppression de ligne.
**Technique** : `Code.gs` — `AltHistory.RefHistoryRowId` stocke un numéro de ligne absolu, figé au moment de la liaison ; toute suppression dans `History` (`sheet.deleteRow`) décale les lignes suivantes sans jamais renuméroter ces références. Nouvelle fonction `AltStorageService.adjustRefsAfterHistoryDelete(deletedRowIndexes)`, appelée depuis `apiDeleteHistoryEntries`, `apiDeleteGroup`, `StorageService.fixZeroPoints` et `StorageService.deleteOrphans` : les références vers une ligne supprimée sont effacées, les autres décalées du bon nombre de crans.

**Humanisé** : Possibilité d'annuler la suppression d'un groupe d'entrées d'historique (délai de 5 s et Journal d'audit).
**Technique** : `Code.gs` — `apiDeleteGroup()` capture désormais un instantané des lignes supprimées et le passe à `AuditService.log()` (7ᵉ argument `snapshot`), rendant l'action annulable comme `apiDeleteHistoryEntries()`.

**Humanisé** : Correction de l'alignement des colonnes dans le Journal d'audit pour les actions liées aux Tops Alternatifs et regroupements.
**Technique** : `Code.gs` — ces 5 appels à `AuditService.log(author, action, entity, texte)` ne passaient que 4 arguments ; le texte tombait dans le 4ᵉ paramètre positionnel (`before`) au lieu du 6ᵉ (`detail`). Corrigés pour passer `before`/`after` vides et le texte en position `detail`.

**Humanisé** : Harmonisation du format de date affiché dans les comparaisons avant/après du Journal d'audit.
**Technique** : `Code.gs` — `apiUpdateHistoryEntry()` reformate désormais `fields.date` (`YYYY-MM-DD`) en `DD/MM/YYYY` avant de construire le résumé « Après », pour correspondre au format déjà utilisé par `_historyRowSummary()` pour « Avant ».

**Humanisé** : Gestion des erreurs réseau dans l'Historique et le Journal d'audit pour débloquer les tableaux et boutons d'annulation.
**Technique** : `Index.html` — ajout des gestionnaires `onError` manquants sur `apiGetHistoryPage` (affiche un message avec bouton « Réessayer »), `apiUndoAuditEntry` (réactive le bouton), `apiDeleteHistoryEntries` dans `scheduleDeletion()` (retire l'état « en cours de suppression »), et `loadAuditActionTypes()` (réinitialise son verrou de chargement sur échec).

**Humanisé** : Remplacement de la boîte de dialogue native par la fenêtre de confirmation personnalisée lors de l'annulation dans le Journal d'audit.
**Technique** : `Index.html` — remplacement de `confirm()` par `openConfirmModal()`, comme partout ailleurs dans l'app.

**Humanisé** : Correction de la lisibilité des textes et champs du Journal d'audit lors du basculement en thème clair.
**Technique** : `Index.html` — même défaut moteur que le fond de page figé corrigé en v3.8.2 (Chromium ne rejoue jamais une transition dont le seul changement vient d'une custom property CSS), mais sur `color` plutôt que `background`. `color` retiré des listes `transition` de `body` et de la règle générique des champs de formulaire.

**Humanisé** : Agrandissement des boutons d'action de l'Historique et du Journal d'audit sur mobile.
**Technique** : `Index.html` — nouvelle règle CSS mobile (`@media max-width:768px`) portant `button.small` à 44px minimum (`--tap-min`) dans `#historyTableBody` et `.audit-row`.

**Humanisé** : Harmonisation visuelle de l'état vide du Journal d'audit avec illustration et message dédié.
**Technique** : `Index.html` — `renderAuditTable()` utilise désormais `emptyIllustration('🗒️', ...)`.

**Humanisé** : Actualisation automatique de la liste des filtres d'action lors du rechargement du Journal d'audit.
**Technique** : `Index.html` — le bouton « 🔄 Actualiser » du Journal recharge maintenant aussi la liste des types d'action (`loadAuditActionTypes(true)`), qui accepte un paramètre de rafraîchissement forcé.

**Humanisé** : Vérification préalable de l'identité avant d'ouvrir la confirmation de suppression d'une entrée.
**Technique** : `Index.html` — ajout de `requireIdentity()` avant l'ouverture de la modale de suppression individuelle d'une entrée d'Historique, cohérent avec les autres boutons d'action de la même ligne.

## [v3.8.3] - 2026-08-11

### Interne
**Humanisé** : Correction de l'environnement de test local pour simuler fidèlement la création des feuilles Google Sheets.
**Technique** : `tests/frontend/fixtures.js` — `buildSheets()` fournit désormais un mock `spreadsheet.insertSheet(name)` (mappe `AuditLog`/`Settings`/`AutoRules`/`Notes`/`Bareme`/`Phrases`/`Chat`/`AltCategories`/`AltHistory` vers leur clé `ConfigService`), absent jusqu'ici. `AuditService._getOrCreateSheet()` (Code.gs) appelle `ConfigService.getSheets().spreadsheet.insertSheet(...)` pour créer l'onglet à la volée ; sans ce mock, l'appel levait sur `spreadsheet` `undefined`, exception avalée par le `try/catch` volontairement silencieux d'`AuditService.log()`.

## [v3.8.2] - 2026-08-11

### Corrigé
**Humanisé** : Correction du plantage d'affichage des graphiques du Dashboard lors de l'application des filtres ou du changement de date.
**Technique** : `Index.html` — `applyFiltersBtn` (click), `startDate` et `endDate` (change) appelaient `applyFilters` directement comme gestionnaire d'événement ; l'objet `Event` du DOM était donc passé comme premier argument (`onDone`), que la fonction essayait ensuite d'exécuter comme un callback (`TypeError: onDone is not a function`). Les trois branchements enveloppent maintenant l'appel (`() => applyFilters()`).

**Humanisé** : Élimination d'une entrée fictive « Name » qui polluait les listes, classements, graphiques et exports.
**Technique** : `Code.gs` — `SettingsService.getEntities()` lisait `sheet.getDataRange().getValues()` sans exclure la ligne d'en-tête des feuilles Players/Categories (`Name | Avatar URL | Hex color | Password`), donc `r[0]` valant littéralement `"Name"` passait le filtre `data.filter(r => r[0])`. Ligne d'en-tête désormais exclue via `data.slice(1)`. Les fixtures de test qui simulaient (à tort) des feuilles sans en-tête ont été corrigées pour refléter la vraie structure du Sheet.

**Humanisé** : Correction du fond de page et des champs de date restés sombres lors du passage au thème clair.
**Technique** : `Index.html` — les règles CSS de `body` et des champs de formulaire (`input`/`select`/`textarea`) transitionnaient leur `background`, mais Chromium ne réévalue jamais une transition dont le seul changement vient d'une custom property CSS (`var(--bg)` changeant via la classe `body.light`) — la couleur reste figée à la valeur du premier rendu. `background-color` est retiré des listes de `transition` (le changement de thème est désormais instantané sur ces deux règles au lieu d'être animé).

**Humanisé** : Déblocage immédiat du bouton de rafraîchissement et du Podium avec affichage d'une alerte en cas d'erreur serveur.
**Technique** : `Index.html` — `loadEntities()` a un chemin d'erreur sur `apiGetSettings` qui oubliait d'appeler `onDone()`, empêchant le compteur `pending` de `globalRefresh()` de jamais atteindre 0. Le chargement du Podium (`apiGetActivePhrasePreset`) n'avait, lui, aucun gestionnaire d'erreur du tout. Les deux appellent désormais leur callback / affichent un message immédiat en cas d'échec.

**Humanisé** : Affichage d'un message explicite « Aucun résultat » sur le Podium lorsqu'un filtre ne renvoie aucune donnée.
**Technique** : `Index.html` — `clearPhrasesCard()` insérait un `<div class="phrases-empty" id="phrasesEmptyState" style="display:none;">` sans texte ni affichage : la fonctionnalité était prête (CSS, icône) mais jamais branchée. Elle affiche désormais le même message que les autres états vides de l'onglet.

**Humanisé** : Distinction claire entre une absence réelle de données et une erreur serveur sur les panneaux Tendances et Jour actif.
**Technique** : `Index.html` — `loadTrends()` et `loadActiveWeekday()` distinguent désormais « Données indisponibles. » (échec serveur) de leur texte d'origine pour le cas réellement vide. Les panneaux Records, Duos et Mentions, qui n'avaient qu'un message d'erreur statique, ont maintenant un bouton « ↻ Réessayer » (nouvelle fonction partagée `renderRetryableError`), comme le graphique principal.

### Modifié
**Humanisé** : Harmonisation des couleurs des médailles argent et bronze entre le Podium et les Records.
**Technique** : `Index.html` — `--medal-silver` et `--medal-bronze` alignées sur les teintes déjà utilisées par le thème métallique du Podium (`#c0c0c0`, `#cd7f32`), qui devient la référence puisque `--medal-*` y était l'exception plutôt que la règle.

**Humanisé** : Intégration aux variables de thème de la couleur orange d'infobulle et des pastilles de filtres actives.
**Technique** : `Index.html` — nouvelle variable sémantique `--blaze` remplaçant le `#ffb347` en dur dans `.pv-blaze` et l'animation `ctt-blaze-pulse` ; `.fchip.active`/`.fchip-all.active` utilisent `var(--accent-hover)` au lieu de `#ff6b81` en dur.

**Humanisé** : Nettoyage et factorisation du code de gestion d'erreurs du Dashboard.
**Technique** : `Index.html` — le bloc de gestion d'erreur des 4 branches d'`applyFilters()` est factorisé dans `onChartError`, et la branche `trend` de `renderChartControls()` réutilise le tableau `sortChoices` déjà déclaré au lieu de le recopier.

## [v3.8.1] - 2026-08-11

### Corrigé
**Humanisé** : Alignement complet des fonctions serveur simulées dans l'outil de test local pour couvrir l'ensemble des écrans.
**Technique** : `tests/harness.js` — la liste d'exports tenue à la main dans l'épilogue du bac à sable est remplacée par `buildEpilogue(source)`, qui découvre toutes les déclarations `function api*` de `Code.gs` et `AutoPoints.gs` par balayage et les expose systématiquement ; `EXPORTED_GLOBALS` ne conserve que les services et constantes, qui ne suivent pas ce motif de nommage. Chaque nom est protégé par un garde `typeof`, l'absence d'un symbole ne fait donc plus échouer le chargement entier.

### Ajouté
**Humanisé** : Ajout d'un test automatique garantissant l'exhaustivité des fonctions serveur simulées dans l'outil de test.
**Technique** : `tests/frontend-guards.test.js` — le test « the harness exposes every server function Index.html calls » extrait les 78 noms passés à `callServer()` dans `Index.html` et échoue si `loadGas()` n'en expose pas un.

### Interne
**Humanisé** : Documentation du protocole d'audit et de refonte progressive onglet par onglet.
**Technique** : `docs/superpowers/plans/2026-08-11-audit-onglet-par-onglet.md` — protocole en 5 phases (cartographie, sonde comportementale en navigateur, conseil à 5 rôles, vérification adversariale, correction TDD et livraison), grille d'audit à 5 axes, registre des 7 cibles et ligne de base mesurée. `docs/superpowers/plans/2026-08-11-audit-dashboard.md` — passe 1 en cours.

## [v3.8.0] - 2026-08-10

### Corrigé
**Humanisé** : Correction du blocage infini du chargement des graphiques et statistiques du Dashboard.
**Technique** : `Index.html` — `applyRowCategoryVisuals()` appelait `refreshBaremeForTop()`, qui n'existe que dans la fermeture (closure) de `addEntryRow()` et lui est donc inaccessible : `ReferenceError` systématique dès qu'un joueur et un Top réels existent, interrompant `_paintEntitiesUI()` avant `applyFilters()`/`loadQuickStats()`. L'appel est retiré de `applyRowCategoryVisuals()` et déplacé, gardé par `if (!isAltRow)`, aux deux points d'appel réels (dans `addEntryRow()`, où `refreshBaremeForTop` est réellement visible). Le chargement des données passe en outre par `bootDataLoad()`, dont chaque étape (`renderWhoAmI`, `loadEntities`, `loadAppBranding`, `refreshDashboardStats`) est isolée par son propre `try/catch`, au lieu d'être la suite non protégée d'une initialisation de ~1 800 lignes.

**Humanisé** : Affichage d'un message d'erreur explicite lorsqu'une carte ne parvient pas à se charger au lieu d'un chargement infini.
**Technique** : `Index.html` — `callServer()` entoure `onSuccess` d'un `try/catch` (une exception y était avalée par `google.script.run`, sans toast ni état d'erreur), et `showSkeleton()` arme un chien de garde `CONFIG.SKELETON_TIMEOUT_MS` qui remplace un squelette figé par un message et un bouton de rechargement.

**Humanisé** : Amélioration de la lisibilité et de la disparition du message « aucune donnée » sur le graphique des tendances.
**Technique** : `Index.html` — `renderTrendChart()` utilise `showChartState('empty', …)` au lieu de peindre du texte dans le canevas avec une variable CSS (dernière occurrence du défaut corrigé en v3.7.0 pour `renderChart()`), et appelle `showChartState('hidden')` sur son chemin de succès.

### Ajouté
**Humanisé** : Ajout d'un bandeau d'alerte en bas de page pour signaler visuellement les erreurs techniques.
**Technique** : `Index.html` — `#globalErrorBanner`, `showGlobalError(message)` et écouteurs `error` / `unhandledrejection`.

**Humanisé** : Mise en place d'un environnement de test local indépendant pour l'interface utilisateur.
**Technique** : `tests/frontend/` (`serve.js`, `stub.js`, `fixtures.js`) — serveur `node:http` servant `Index.html` avec un `google.script.run` de substitution branché sur le vrai `Code.gs` via `tests/harness.js` ; script npm `serve:front`. `tests/frontend-guards.test.js` couvre les trois garde-fous.

## [v3.7.0] - 2026-08-10

### Corrigé
**Humanisé** : Affichage d'un message explicite ou d'un bouton « Réessayer » lorsque le graphique du Dashboard ne contient aucune donnée.
**Technique** : `Index.html` — panneau `#chartState` et fonction `showChartState(state, message)` ; la branche « aucune donnée » de `renderChart()` n'écrit plus dans le canevas (`ctx.fillStyle = 'var(--text-muted)'` était silencieusement ignoré par le canevas, le texte était peint en noir sur fond sombre) et les quatre gestionnaires d'erreur de `applyFilters()` affichent l'état d'erreur au lieu d'un conteneur vide.

**Humanisé** : Correction du contraste des Tops Alternatifs et du thème de leur menu déroulant en mode clair.
**Technique** : `Index.html` — `--alt-accent` et `--alt-accent-rgb` déclinées dans `body.light`, les onze `rgba(255, 209, 102, …)` remplacés par `rgba(var(--alt-accent-rgb), …)`, et `var(--bg-card, #1e2533)` — dont la variable n'était définie nulle part — remplacé par `var(--card-solid)`.

**Humanisé** : Correction des filtres Tops Alternatifs dans l'Historique lors de changements rapides de page.
**Technique** : `Index.html` — `histPrefetchKey()` prend le filtre Alt en 7ᵉ paramètre, et un compteur de génération jette les réponses de préchargement déjà parties au moment d'un changement de filtre.

**Humanisé** : La suppression d'une entrée native en Top Alternatif cible désormais la bonne ligne et devient annulable via l'audit.
**Technique** : `Code.gs` — `deleteNativeAltEntry()` retourne la ligne supprimée, `apiDeleteNativeAltEntry()` enregistre un instantané `{ sheet: 'altHistory', op: 'delete', before }` et aligne ses arguments sur la signature d'`AuditService.log()` ; le garde anti-obsolescence contrôle aussi la date.

### Ajouté
**Humanisé** : Exécution automatique des tests de validation sur le code final avant chaque déploiement.
**Technique** : `.github/workflows/deploy-gas.yml` — le nettoyage des commentaires devient une étape du workflow, suivie de `npm run verify` avant le déploiement ; Node passe de 20 à 22 (le glob littéral de `node --test` n'est pris en charge qu'à partir de la 22, sous la 20 l'étape n'aurait trouvé aucun test).

**Humanisé** : Journalisation explicite des dépassements de capacité du cache interne.
**Technique** : `Code.gs` — `_logCacheSkip()` tracé sur les deux caches de l'historique complet lorsqu'une charge dépasse `CONFIG.CACHE_MAX_BYTES`.

### Modifié
**Humanisé** : Verrouillage de la version de la librairie de graphiques pour garantir la stabilité du Dashboard.
**Technique** : `Index.html` — `chart.js` épinglé à `4.5.1` ; `renderChart()` et `renderTrendChart()` affichent une erreur lisible si la librairie n'a pas pu être chargée. `context.md` §2 corrigé : le projet a bien des dépendances CDN externes, contrairement à ce qu'il affirmait.

## [v3.6.0] - 2026-08-09

> Note de traçabilité : les numéros v3.5.1 à v3.5.3 ont été utilisés dans les sujets de trois commits abandonnés pendant l'épisode de l'interface vide. Les correctifs qui les ont remplacés sont documentés ci-dessous sous v3.5.4 à v3.5.6.

### Corrigé
**Humanisé** : En saisie de lot Alt, toute ligne invalide bloque désormais l'envoi complet avec un message d'erreur.
**Technique** : `Index.html` — la branche Alt de `submitBulk()` collecte puis valide dans une boucle `for...of` ; le `return` dans le `forEach` n'écartait que la ligne fautive.

**Humanisé** : Sécurisation de la suppression des entrées natives Alt et confirmation explicite de l'action.
**Technique** : `Code.gs` — `unlinkHistoryRowsFromAltCategory()` ne matche plus que la colonne `refHistoryRowId` ; nouvelle méthode `AltStorageService.deleteNativeAltEntry()` et endpoint `apiDeleteNativeAltEntry()` avec audit dédié. `Index.html` — le handler lit enfin `data-native`.

**Humanisé** : Application immédiate de la couleur en saisie Alt et accessibilité du constructeur sans Top principal requis.
**Technique** : `Index.html` — `applyRowCategoryVisuals()` extrait et appelé à l'initialisation comme dans `onChange` ; la garde de `addEntryRow()` teste `cachedAltCategories` en univers Alt.

**Humanisé** : Conservation des sélections par ligne lors du basculement entre univers Principal et Alternatif dans le constructeur de lot.
**Technique** : `Index.html` — chaque ligne mémorise `dataset.mainCategory` et `dataset.altUniverseCategory` ; `setLotUniverse()` reconstruit les presets à partir des deux.

**Humanisé** : Prise en compte effective du filtrage par Top Alternatif dans l'Historique.
**Technique** : `Index.html` — `selectedHistAltCategories` est transmis en 9ᵉ argument (`filterAltCategory`) à `apiGetHistoryPage`, à l'appel principal comme au préchargement.

**Humanisé** : Actualisation automatique des cartes Records et Tendances après une saisie de points Alt.
**Technique** : `Index.html` — `saveNativeAltEntries()` appelle `refreshDashboardStats()` en plus de `applyFilters()` quand le Dashboard est en univers Alt.

**Humanisé** : Rejet des dates invalides lors de la saisie Alt avec avertissement explicite.
**Technique** : `Code.gs` — `addNativeAltEntries()` valide `new Date(e.date)` avant écriture.

### Ajouté
**Humanisé** : Ajout de l'outil de détection des scores aberrants dans Paramètres → Outils.
**Technique** : `Index.html` — card `#toolOutliersCard` avec `#detectOutliersBtn` et `#outliersResults`, et écouteur vers la fonction `scanOutliers()` qui était déjà implémentée mais orpheline.

**Humanisé** : Blocage automatique du déploiement en cas d'erreur de syntaxe HTML ou JavaScript.
**Technique** : `tests/check-html-syntax.js` (nouveau) et script npm `verify` ; `.github/scripts/strip-comments.js` reconnaît les expressions régulières, préserve les fins de ligne CRLF, refuse de s'exécuter hors CI sans `--force`, et re-parse chaque fichier qu'il réécrit avant de l'enregistrer. `.github/scripts/deploy-gas.sh` propage désormais le code de sortie du nettoyeur (`|| exit 1`, le script tournant sous `set -uo pipefail` sans `-e`) et `.github/workflows/deploy-gas.yml` fixe explicitement `CI: true` — un fichier détecté cassé arrête le déploiement au lieu de partir en production. Couverture par `tests/strip-comments.test.js`.

### Modifié
**Humanisé** : Affichage des avatars joueurs et emojis de Tops dans la modale de saisie rapide Alt.
**Technique** : `Index.html` — `openAltNativeQuickAddModal()` est bâtie sur `buildRichSelect()` au lieu de balises `<select>` nues, et passe par le chemin d'écriture unique `saveNativeAltEntries()`.

**Humanisé** : Harmonisation des couleurs des Tops Alternatifs et agrandissement des zones tactiles de l'Historique.
**Technique** : `Index.html` — variable CSS `--alt-accent` et constante `ALT_FALLBACK_COLOR`, `var(--info)` pour le badge natif, `min-height: var(--tap-min)` sur `.history-nav-btn` et les champs de la modale Alt.

### Supprimé
**Humanisé** : Suppression des fonctions et endpoints orphelins devenus inutiles.
**Technique** : `Index.html` — `openAltCategoryLinkModal()`, `confirmGroupRows()`. `Code.gs` — `apiGetMobileBootstrap()`. `AutoPoints.gs` — `apiRunAutoRulesNow()`. `tests/harness.js` — listes d'exposition mises à jour.

## [v3.5.6] - 2026-08-06

### Modifié
**Humanisé** : Agrandissement de la barre de navigation (56px) pour un meilleur confort tactile et ajustement des compteurs.
**Technique** : `Index.html` — augmentation de la hauteur `.nav-container` à `56px`, `min-height: 56px` et `padding: 12px 10px` sur `.nav-btn` pour une hitbox verticale étendue, et resserrement `gap: 2px` / `margin-left: 2px` sur `.nav-count`.

## [v3.5.5] - 2026-08-06

### Corrigé
**Humanisé** : Nettoyage fiable des commentaires avant le déploiement pour éviter que Google ne corrompe la syntaxe du code.
**Technique** : `.github/scripts/strip-comments.js` (nouveau) — retire les commentaires `//` et `/* */` de tous les fichiers `.gs`/`.html` juste avant `clasp push`, uniquement dans la copie éphémère du CI (jamais le dépôt source), avec une analyse consciente des chaînes/template literals (ne touche jamais le contenu entre guillemets ou backticks). `.github/scripts/deploy-gas.sh` — invoque ce nettoyage avant la boucle de déploiement des deux cibles. Comportement vérifié identique avant/après sur toute la suite de tests.

## [v3.5.4] - 2026-08-06

### Corrigé
**Humanisé** : Résolution de l'écran blanc au chargement en servant directement le fichier HTML sans passer par le moteur de template.
**Technique** : `Code.gs` — `doGet()` sert désormais `Index.html` via `HtmlService.createHtmlOutputFromFile()` au lieu de `createTemplateFromFile().evaluate()` : le moteur de template GAS, en évaluant le scriptlet `<?!= JSON.stringify(appUrl) ?>`, tronquait silencieusement environ 28 000 caractères du fichier livré (confirmé en comparant le script servi en production, via extraction directe du payload `goog.script.init`, au source versionné), provoquant une `Uncaught SyntaxError` bloquant tout le JavaScript de la page. `Index.html` — suppression de la variable `APP_URL` (jamais utilisée ailleurs dans le code) et de son scriptlet, rendant tout rendu templaté inutile.

## [v3.5.0] - 2026-08-06

### Ajouté
**Humanisé** : Saisie directe de points dans les Tops Alternatifs (saisie native) via un sélecteur d'univers en Saisie de lot et un bouton dédié sur le Dashboard.
**Technique** : `Code.gs` — `AltStorageService.addNativeAltEntries()` (validation joueur/altCat/pts, écriture dans `AltHistory` avec `refHistoryRowId` vide), `_parseAltHistoryRow` expose `isNative`, nouveau endpoint `apiAppendAltNativeBatch(author, entries)` avec audit `'Saisie native Alt'`. `Index.html` — variable `activeLotUniverse`, segmented control `#lotUniverseSeg` dans l'onglet Saisie, type `'altCategory'` dans `buildRichSelect` (peuple avec `cachedAltCategories`), branche Alt dans `submitBulk()`, fonction `openAltNativeQuickAddModal()` appelée par `#dashAltAddBtn` (visible seulement en mode Alt Dashboard), badge `✏️ natif` dans `openAltCategoryManagerModal` pour les entrées sans `refHistoryRowId`.

## [v3.4.5] - 2026-08-05


### Corrigé
**Humanisé** : Suppression du rechargement intempestif de la bannière de statistiques rapides lors du basculement d'univers.
**Technique** : `Index.html` — retrait de `loadQuickStats()` de la fonction `refreshDashboardStats()`, garantissant le maintien fixe du bandeau `quickStatsBar` sans requête réseau inutile lors du changement d'univers.

## [v3.4.4] - 2026-08-05

### Modifié
**Humanisé** : Élargissement et optimisation des modales sur grand écran, avec affichage en grille responsive pour les notes.
**Technique** : `Index.html` — ajout des variantes CSS `.modal-box.xl` et `.modal-scroll-list`, bascule des modales universelles d'affectation Alt, gestionnaire Alt et drilldown de graphiques vers `.xl`, correction du vidage de classe dans `closeModal()`, et réorganisation de `#notesBlocksContainer` en grille 1/2/3 colonnes avec CSS responsive `@media`.

## [v3.4.3] - 2026-08-05

### Modifié
**Humanisé** : Ajustement dynamique du Guide sur grand écran et panneaux latéraux (Guide et Barème) redimensionnables par glisser-déposer.
**Technique** : `Index.html` — refonte CSS de `.guide-layout` (`height: clamp()`, layout responsive 2-colonnes `@media (min-width: 900px)`), ajout des séparateurs `.guide-resizer` et `.bareme-resizer`, et création de la fonction utilitaire JS `setupResizable()` avec persistance `localStorage`.

## [v3.4.2] - 2026-08-05

### Corrigé
**Humanisé** : Correction de la navigation par clic entre les sections dans le menu latéral du Guide.
**Technique** : `Index.html` — extraction de `initGuideAccordion()` au niveau du scope global JS et invocation dans `bindButtons()` et `goToTab('tab-guide')`.

## [v3.4.1] - 2026-08-05

### Modifié
**Humanisé** : Mise à jour complète du Guide avec une section dédiée aux Tops Alternatifs et aux nouvelles fonctionnalités.
**Technique** : `Index.html` — ajout de la tuile et du template `guideContent-alt` dans `tab-guide`, enregistrement dans `GUIDE_TITLES`, et mise à jour des templates de guide Dashboard, Saisie, Paramètres, Historique et Tchat.

## [v3.4.0] - 2026-08-04

### Ajouté
**Humanisé** : Gestion complète des Tops Alternatifs : sélecteur universel, badges ⭐ dans l'historique, filtres dédiés et gestionnaire dans les Paramètres.
**Technique** : `Code.gs` — implémentation de `AltStorageService.getAltHistoryMap()`, `unlinkHistoryRowsFromAltCategory()`, `getAltCategoryDetails()`, et des fonctions API correspondantes (`apiGetAltHistoryMap`, `apiUnlinkHistoryRowsFromAltCategory`, `apiGetAltCategoryDetails`). `Index.html` — création des modales `openUniversalAltPointPicker` et `openAltCategoryManagerModal`, intégration des badges ⭐ dans l'historique et des filtres par puces.

## [v3.3.5] - 2026-08-04

### Corrigé
**Humanisé** : Retrait de l'effet néon sur le bouton Top Alternatif ⭐ pour réserver l'effet aux contrôles neutres.
**Technique** : `Index.html` — ajout de l'invalidation `:not(.alt-picker-btn)` sur les règles CSS néon et dans le sélecteur `initSpotlightCards()`.

## [v3.3.4] - 2026-08-04

### Corrigé
**Humanisé** : Restriction du contour néon aux seuls boutons neutres, en excluant les boutons colorés et les règles du barème.
**Technique** : `Index.html` — restriction des sélecteurs CSS et du JS `initSpotlightCards()` avec l'invalidation `:not(.bq-btn):not(.nav-bareme-btn):not(.bareme-quick-header)` pour empêcher le ciblage intempestif des boutons de règles et de barème.

## [v3.3.3] - 2026-08-04

### Corrigé
**Humanisé** : Masquage du titre textuel sur mobile pour n'afficher que le logo et optimiser l'en-tête.
**Technique** : `Index.html` — ajout de `display: none !important` sur `.app-brand-title` en mobile (`body:not(.desktop-layout)` et `@media (max-width: 640px)`), ajout de l'élément de repli d'icône `#appBrandDefaultIcon` (`🏆`) et ajustement dans `applyAppBranding()` pour garantir l'affichage de l'icône seule en toutes circonstances.

## [v3.3.2] - 2026-08-04

### Corrigé
**Humanisé** : Automatisation du remplacement et de l'archivage des anciens déploiements lors des mises en production.
**Technique** : `.github/scripts/deploy-gas.sh` — suppression du mode de mise à jour réutilisant `clasp deploy -i` ; force la création d'une nouvelle URL via `clasp deploy --description` suivie de l'invalidation/archivage de tous les anciens déploiements via `clasp undeploy <old_id>`, puis mise à jour de Short.io.

## [v3.3.1] - 2026-08-04

### Modifié
**Humanisé** : Remplacement de la bordure rouge des boutons neutres par un contour néon cyan-blanc au survol.
**Technique** : `Index.html` — passage de la couleur de base du `radial-gradient` de rouge `rgba(255, 60, 95)` à un néon blanc/cyan neutre `rgba(255, 255, 255, 0.95)` / `rgba(160, 215, 255, 0.75)`, et ajout de `border-color: transparent !important` au survol pour annuler la bordure rouge/accent statique par défaut.

## [v3.3.0] - 2026-08-04

### Modifié
**Humanisé** : Reciblage de l'effet néon sur les boutons et filtres interactifs, et retrait des grands conteneurs pour épurer l'interface.
**Technique** : `Index.html` — restriction des règles CSS néon spotlight et de la fonction `initSpotlightCards()` aux sélecteurs `button.secondary`, `button:not(.primary):not(.danger)`, `.qs-pill`, `.nav-btn`, `.nav-item`, `.subtab-btn`, `select`, `.custom-select-trigger`, `.fchip`, `.d-mode-btn`, `.chart-type-btn`, `.export-btn`, `.who-am-i-btn`, `.nav-refresh-btn`, `.nav-bareme-btn`, `.nav-chat-btn`, `.quick-btn`, `.fill-opt`. Retrait définitif de `.card::before`/`.after`, `.filter-panel` et `.modal-content`.

## [v3.2.6] - 2026-08-04

### Corrigé
**Humanisé** : Fusion visuelle monobloc entre les cartes joueurs du podium et leurs socles.
**Technique** : `Index.html` — modification de `.phrase-podium-card` (`border-radius: 16px 16px 0 0`, `border-bottom: none`), ajustement de `.podium-step-base` (`margin-top: 0`, `border-top: none`) et ajout des règles d'accentuation unifiée de couleur de bordure au survol (`.podium-column.rank-*:hover .podium-step-base`).

## [v3.2.5] - 2026-08-04

### Modifié
**Humanisé** : Refonte visuelle du Podium : avatars agrandis avec halo animé, socles 3D rehaussés et animations d'entrée dynamiques.
**Technique** : `Index.html` — CSS : alignement centré dans `.phrase-podium-card`, taille des avatars portée à 44px (64px pour `.rank-1` avec animation `avatarPulse`), animations d'entrée `podiumDropIn` / `podiumSlideLeft` / `podiumSlideRight`, socles 80/55/36px, `crownBounce` retravaillé, mini-barre `.phrase-podium-progress-bar` avec `--score-pct`. JS : restructuration du DOM dans `renderPhrasesCard` pour centrer avatar + médaille + nom + chip points + barre de progression.

## [v3.2.4] - 2026-08-02

### Corrigé
**Humanisé** : Maintien des statistiques globales du bandeau supérieur lors du passage en mode Tops Alternatifs sur le Dashboard.
**Technique** : `Index.html` — modification de `loadQuickStats()` pour forcer l'appel serveur sur l'univers `'main'` (`apiGetQuickStats('main')`), garantissant que le bandeau `#quickStatsBar` reste ancré sur les statistiques globales du site indépendamment du mode d'affichage actif sur le Dashboard.

## [v3.2.3] - 2026-08-02

### Modifié
**Humanisé** : Intensification du contour néon au survol avec rotation chromatique fluide.
**Technique** : `Index.html` — augmentation de l'opacité et de la saturation du `radial-gradient` au curseur (de 0.45 à 0.95), élargissement du rayon (160px), et ajout de `@keyframes neonHueCycle` avec `filter: hue-rotate(0deg → 360deg)` en boucle continue (10s).

## [v3.2.2] - 2026-08-02

### Modifié
**Humanisé** : Intégration d'un effet néon interactif qui s'illumine dynamiquement sous le curseur sur les éléments cliquables.
**Technique** : `Index.html` — extension de la règle CSS de spotlight avec `radial-gradient` à tous les composants interactifs (`button`, `.card`, `.filter-panel`, `.qs-pill`, `.lot-row`, `.modal-content`, `.settings-section`, etc.) avec `-webkit-mask-composite: xor` / `mask-composite: exclude` ; optimisation de `initSpotlightCards()` grâce à `e.target.closest(selector)` pour un suivi ultra-fluide à 60 FPS sans surconsommation CPU.

## [v3.2.1] - 2026-08-02

### Corrigé
**Humanisé** : Correction de l'édition, de la duplication et de la suppression de la planification des automatisations dans les Paramètres.
**Technique** : `AutoPoints.gs` — normalisation des dates dans `_parseRow` sous forme de chaînes ISO sérialisables, sécurisation de `updateRule`/`runDue` avec des garde-fous sur l'extension `.toISOString()`, et fiabilisation de `_findRowIndex()`. `Index.html` — refonte complète des modales `openEditAutoRuleModal` et `openDuplicateAutoRuleModal` incluant tous les champs de planification (`interval`, `daysOfWeek`, `dayOfMonth`, `startDate`) avec bascule dynamique d'affichage selon la fréquence choisie, et sécurisation du formatage de date dans `renderAutoRules`.

## [v3.2.0] - 2026-08-02

### Ajouté
**Humanisé** : Refonte ergonomique complète des lignes de saisie de lot et création d'un onglet dédié aux Automatisations.
**Technique** : `Index.html` — refonte majeure de l'ergonomie des lignes de lot (`addEntryRow`) :
- **Top bar** : intègre la poignée de réorganisation, le sélecteur `⭐ Top Alt`, et les boutons allongés avec libellé complet `📋 Dupliquer cette ligne` et `✕ Supprimer cette ligne`.
- **Rangée principale (3 colonnes fluides en % relatives)** : `Joueur` (30%), `Top principal & Points` (35%), et `Date` (30%) directement sur le côté (côte à côte).
- **Points rapides** : réorganisés en une grille 2 lignes de 4 boutons (`1 3 5 7` / `10 25 50 100`) directement sous les points et dictant la largeur de la section.
- **Onglet Automatisations** : déplacé dans son propre onglet dédié des Paramètres avec gestion complète et duplication 1-clic.

## [v3.1.1] - 2026-08-02

### Modifié
**Humanisé** : Ancrage du tchat en panneau latéral sur PC, nettoyage de la navigation mobile et repositionnement du bandeau de statistiques rapides.
**Technique** : `Index.html` — fusion des règles CSS responsive de la navbar mobile, ancrage flex-sticky du tchat (`#chatSidePanel`), déplacement de `#quickStatsBar` hors des onglets et retrait des badges d'intensité sur les cartes de commentaires.

### Corrigé
**Humanisé** : Correction des blocages au démarrage du Dashboard et fiabilisation des statistiques lors des changements d'univers.
**Technique** : `Code.gs` — correction des appels `requireAuthor` serveur et ajout du paramètre `universe` sur les endpoints analytics ; `Index.html` — sécurisation des gestionnaires `onError` et temporisation des requêtes de statistiques secondaires au démarrage.

## [v3.1.0] - 2026-08-02

### Ajouté
**Humanisé** : Support du Markdown enrichi (GFM), refonte de la saisie de lot avec sous-tops et intégration du tchat en panneau latéral.
**Technique** : `Index.html` — réécriture de `renderMarkdown` avec support GFM (titres, gras, italique, barré, citations, tableaux, listes et blocs), isolation des puces du panneau de filtres selon l'univers actif, repositionnement des sous-tops dans `.row-tops-group`, création du bouton pilule `.row-alt-pill`, ajout de la modale `openEditAutoRuleModal`, remplacement du widget tchat flottant par `#chatSidePanel` et du bouton `#chatToggleBtn` dans la Top Bar.

## [v3.0.0] - 2026-08-02

### Ajouté
**Humanisé** : Lancement des Tops Alternatifs pour gérer deux univers de classement distincts, avec sous-tops à la saisie et bascule instantanée sur le Dashboard.
**Technique** : `Code.gs` — création des services `AltSettingsService` et `AltStorageService` (gestion de l'onglet `AltCategories`, requêtes analytics et endpoints `apiGetAltCategories`, `apiSaveAltCategories`, `apiGroupSimilarEntries`, `apiLinkHistoryRowsToAltCategory`, `apiGetAltAnalyticsData`). `Index.html` — onglet Paramètres `stab-alt-categories`, sélecteur d'univers `#dashboardUniverseSeg`, bouton `＋ Top supp.`, coche `⭐ Associer à un Top Alternatif` et modale d'affectation d'historique.imilarEntries`, `apiLinkHistoryRowsToAltCategory`, `apiGetAltAnalyticsData`). `Index.html` — onglet Paramètres `stab-alt-categories`, sélecteur d'univers `#dashboardUniverseSeg`, bouton `＋ Top supp.`, coche `⭐ Associer à un Top Alternatif` et modale d'affectation d'historique.

## [v2.6.0] - 2026-07-31

### Modifié
**Humanisé** : Refonte 3D du Podium avec socles étagés, badges Or/Argent/Bronze et calcul d'écart en direct.
**Technique** : `Index.html` — restructuration du composant Podium avec la hiérarchie `.podium-column` (socles `.podium-step-base` et cartes `.phrase-podium-card`), styles métalliques Or/Argent/Bronze réactifs aux thèmes, et intégration dans `renderPhrasesCard()` des pilules de score (`.phrase-podium-score-chip`) et d'écart (`.phrase-podium-gap`).

## [v2.5.0] - 2026-07-31

### Ajouté
**Humanisé** : Ajout d'une barre de recherche, de filtres par type de changement et d'une sélection de versions dans le Changelog.
**Technique** : `Index.html` & `Code.gs` — intégration du moteur de rendu réactif `renderChangelogView()`, découpage du cache GitHub par blocs de 90 Ko dans `apiGetChangelog()` pour éviter la limite Apps Script, et structuration SemVer officielle des versions historiques.

## [v2.4.0] - 2026-07-29

### Modifié
**Humanisé** : Unification de l'application en une page unique responsive (PC et mobile) avec légendes de graphiques interactives.
**Technique** : Suppression de `Mobile.html` et bascule sur une page unique `Index.html` responsive via `doGet()`. Création du plugin canvas `buildLegendBorderPlugin()` pour les boutons de légende du graphique Chart.js.

## [v2.3.0] - 2026-07-28

### Ajouté
**Humanisé** : Consultation du Changelog Git depuis les Paramètres et organisation du Barème en accordéons dépliables.
**Technique** : `Code.gs` — endpoint `apiGetChangelog()` interrogeant le dépôt GitHub avec cache `CacheService`. `Index.html` — accordéons interactifs `.bareme-quick-header` et ajustement du défilement sans rognage.t de consulter l'historique complet des mises à jour en direct depuis Git, avec un bouton d'actualisation et une mise en cache automatique.
**Technique** : `Code.gs` — création de l'endpoint `apiGetChangelog()` interrogeant le dépôt GitHub avec cache 10 minutes (`CacheService`). `Index.html` & `Mobile.html` — ajout du sous-onglet `📋 Changelog` sous Paramètres, création des fonctions `renderChangelogMarkup()` / `loadChangelog()` / `renderMChangelogSettings()` pour parser et afficher dynamiquement le Markdown du changelog avec badges et catégories colorisées.

### Corrigé
**Humanisé** : Résolution de l'écran noir sur les graphiques mobiles sous iOS/Safari.
**Technique** : `Mobile.html` — (1) `buildMobileTooltipPlugin()` garantit le retour permanent de `{ id: 'mCustomTooltip', ... }` pour éviter l'exception `Plugin must have an id` dans Chart.js. (2) Isolation par bloc `try/catch` de `emojiOverlay`, `barTotals`, `donutCenter` et des callbacks d'infobulle pour immuniser le rendu canvas iOS Safari. (3) `renderDashboardShell()` conserve le squelette HTML existant sans détruire `#mChartWrapper` lors des rafraîchissements réseau. (4) Rétablissement des options contextuelles (`#mChartOptionsBar` & `#mDonutPlayerChips`).

**Humanisé** : Harmonisation de l'interface mobile avec le PC : podium enrichi, affichage fiabilisé des graphiques et fermeture fluide du sélecteur d'identité.
**Technique** : `Mobile.html` — (1) Refonte de `renderComments()` avec cartes Podium en échelons (1er au centre surélevé avec médaille d'or) et feed compact pour la 4e place et plus. (2) Déblocage du rendu des graphiques dans `applyBootstrapData()` à la réception des données serveur réelles. (3) Intégration de graphiques Chart.js dans `loadTrendsStat()` et `loadWeekdayStat()`. (4) Élévation du `z-index` de `#mIdentitySheet` à `10000` et ajout de padding de sécurité.

## [v2.2.0] - 2026-07-27

### Corrigé
**Humanisé** : Chargement instantané sur mobile et correction des options de saisie et d'affichage des statistiques.
**Technique** : `Code.gs` — création de `apiGetMobileBootstrap()` regroupant en 1 seul aller-retour réseau l'intégralité des données d'initialisation mobile. `Mobile.html` — implémentation d'un rendu immédiat depuis `localStorage` (`MOBILE_BOOTSTRAP_CACHE_KEY`), mise à jour réactive des sélecteurs de Saisie (`updateInjectRowOptions`) et destinataires de Notes (`updateNotePlayerButtons`), mise en cache des commentaires et remplacement de `outerHTML` par `innerHTML` sécurisé dans les accordéons de statistiques (`loadRecordsStat`, `loadTrendsStat`, `loadWeekdayStat`, `loadPairsStat`, `loadMentionStats`).

### Ajouté
**Humanisé** : Optimisation des performances et préservation des quotas serveur grâce à un cache multiniveau et un sondage adaptatif.
**Technique** : `Code.gs` — intégration de `CacheService` avec versioning dynamique (`_settingsVersion`, `_chatVersion`, `_baremeVersion`, `_phrasesVersion`, `_notesVersion`, `_logsVersion`) sur `SettingsService`, `ChatService`, `BaremeService`, `PhrasesService`, `NotesService` et les endpoints de sous-statistiques (`apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`). `Index.html` & `Mobile.html` — refonte de `scheduleChatPoll()` / `mScheduleChatPoll()` avec écouteur `visibilitychange` (arrêt complet quand l'onglet est inactif, cadence portée à 20s fermé / 4s ouvert).

### Modifié
**Humanisé** : Ajustement du texte de la bannière invitant à ouvrir la version mobile sur grand écran.
**Technique** : `Index.html` — modification du libellé du conteneur `#mobileCtaBanner` (`.mobile-cta-text`).

**Humanisé** : Ajout d'une règle dans la documentation interdisant le sondage en boucle pour préserver les quotas.
**Technique** : `context.md` — section §8 enrichie avec la règle d'interdiction de polling répété lors des suivis de déploiement GitHub Actions.

**Humanisé** : Harmonisation mobile du Barème et ajustement des tailles de texte dans les fenêtres d'édition.
**Technique** : `Mobile.html` — refonte de `renderBaremeSettings()`, `openBaremeFormModal()`, `openHistoryEditModal()`, `openEntityFormModal()`, `openPhraseFormModal()` et suppression de toutes les règles inlines `1.65rem` / `1.75rem`.

**Humanisé** : Ergonomie mobile améliorée pour la Saisie et les Notes avec boutons pas-à-pas de points et raccourcis de dates.
**Technique** : `Mobile.html` — refonte de `injectRowHtml()`, `renderInjectShell()` et `renderNotesShell()`, harmonisation des labels à `0.78rem` uppercase et boutons tactiles `m-step-btn` / `m-date-shortcut`.

**Humanisé** : Parité complète du graphique mobile avec la version PC : emojis, totaux, options contextuelles et infobulles détaillées.
**Technique** : `Mobile.html` — intégration de `catDisplay()`, `buildEmojiOverlayPlugin()`, `totalsPlugin`, `donutCenterPlugin`, `buildTooltipGauge()`, `renderChartOptionsBar()`, `renderDonutPlayerChips()` et support du mode `ranking` détaillé avec tri et drill-down.

**Humanisé** : Signalement visuel renforcé (halo animé et alerte) sur le sélecteur d'identité tant qu'aucun profil n'est sélectionné.
**Technique** : `Index.html` & `Mobile.html` — ajout de la classe `.unselected` gérée dans `renderWhoAmI()` / `renderIdentityBtn()`, keyframes `@keyframes wai-unselected-breath` et badge dot `@keyframes wai-dot-pulse`, réécriture de `@keyframes wai-pulse` pour secousse + onde de choc 0.75s x 2, et gestion de la classe `.pulse` sur mobile dans `requireIdentity()`.

### Ajouté
**Humanisé** : Ajout d'une barre de progression et d'un indicateur de chargement réseau sur mobile.
**Technique** : `Mobile.html` — création du composant `.m-progress-bar` et de `.m-spinner` dans l'en-tête, intégration de la comptabilisation des requêtes actives `_mActiveRequests` (`mShowLoader()` / `mHideLoader()`) dans `callServer()`.

### Corrigé
**Humanisé** : Correction de l'initialisation mobile, fiabilisation du bouton de thème et repositionnement du bouton de tchat flottant.
**Technique** : `Mobile.html` — remplacement de `window.addEventListener('DOMContentLoaded')` par une exécution conditionnelle `document.readyState`, sécurisation d'icon fallback dans `initTheme()`, et calage de la position CSS `.m-chat-fab` (`bottom: calc(72px + env(...))`) et bornes `setPos()` pour libérer l'accès aux boutons de la barre inférieure.

### Modifié
**Humanisé** : Refonte de l'interface mobile avec navigation inférieure fixe, en-tête dédié et affichage optimisé en pleine largeur.
**Technique** : `Mobile.html` — remplacement de `.m-side-nav` par `.m-header` (`52px`) et `.m-bottom-nav` (`58px + safe-area`), conteneur `.m-container` réaligné sur la largeur écran (`max-width: 640px`), ajustement de `setupBottomNav()`, `goToTab()`, `renderIdentityBtn()` et repositionnement du widget tchat flottant (`#mChatFab`).

### Corrigé
**Humanisé** : Correction du dimensionnement du graphique Dashboard sur mobile avec contrôles segmentés et bandeau d'indicateurs clés.
**Technique** : `Code.gs` — ajout de `.addMetaTag('viewport', ...)` dans `doGet()`. `Mobile.html` — suppression de l'échelle $\times 2.2$, intégration de `#mChartTypeSegmented`, `#mPeriodSegmented`, `maintainAspectRatio: false` sur Chart.js, bandeau `#mQuickKpisBar` et design system CSS réactif.

### Ajouté
**Humanisé** : Modernisation du Hub Statistiques avec transitions fluides et refonte complète des contrastes en Mode Clair.
**Technique** : `Index.html` & `Mobile.html` — mise à jour des tokens `body.light`, styles `#statsHubTabs`, `.sr-row`, `.sr-hero`, `#chartCustomTooltip` et animation GSAP dans `switchStatsHubPane()`.

### Supprimé
**Humanisé** : Simplification du graphique principal par le retrait des options de lissage, comparaison N-1 et mode parts %.
**Technique** : `Index.html` — suppression de `#chartKpisBar`, des toggles `chartToggleSma` et `chartToggleN1`, de la fonction `updateChartKpis` et du bouton `parts`.

### Modifié
**Humanisé** : Rétablissement du défilement natif du navigateur pour une meilleure réactivité sur desktop et mobile.
**Technique** : `Index.html` et `Mobile.html` — suppression de la bibliothèque CDN Lenis, des instances de scroll et des écouteurs `requestAnimationFrame` associés.

### Ajouté
**Humanisé** : Refonte visuelle mobile avec animations fluides d'onglets et cartes tactiles translucides.
**Technique** : `Mobile.html` — ajout du CDN Lenis Scroll, intégration `initLenisMobile()` et `initSpotlightCardsMobile()`, rehaussement du thème CSS avec gradients de fond et flou de fond (`backdrop-filter: blur(20px/24px)`), transitions d'onglets animées par GSAP keyframes (`goToTab()`).

**Humanisé** : Enrichissement des graphiques : mini-KPIs, mode parts %, moyennes glissantes et surbrillance interactive des courbes.
**Technique** : `Index.html` — ajout de `#chartKpisBar` (`updateChartKpis`), nouveau type `parts`, toggles `chartToggleSma` et `chartToggleN1`, plugins Chart.js `glowShadowPlugin` et `seriesHighlightPlugin`.

**Humanisé** : Synchronisation et sauvegarde des préférences d'infobulles de graphiques sur le serveur.
**Technique** : `Code.gs` — nouvel endpoint `apiSaveTooltipStyle()` et mise à jour de `apiGetAppSettings()` pour lire/écrire la clé `tooltip_style` dans la feuille `Settings`. `Index.html` — `saveTooltipStylePrefs()` synchronise les changements avec le serveur de façon transparente.

### Corrigé
**Humanisé** : Modernisation du panneau de filtres avec un design translucide en pilules arrondies.
**Technique** : `Index.html` — `.filter-panel` passe en glassmorphism translucide (`rgba(15,20,29,0.65)`, `backdrop-filter: blur(20px)`), `.fchip` et `.date-shortcut` deviennent des pilules arrondies avec bordures subtiles (`border-radius: 9999px`), survol dynamique et halo lumineux sur l'état actif.

**Humanisé** : Blocage des défilements verticaux parasites dans la barre de navigation et le bandeau supérieur.
**Technique** : `Index.html` — `.navbar` passe à `overflow: visible`, `.quick-stats-bar` et `.nav-btn-group` ont désormais `overflow-y: hidden` explicite pour bloquer les défilements verticaux parasites.

### Ajouté
**Humanisé** : Refonte visuelle et interactive globale : animations fluides, cartes réactives à la souris et design translucide.
**Technique** : `Index.html` et `Mobile.html` — ajouts des CDN GSAP 3 et Lenis Scroll ; refonte du système de tokens CSS (`:root`, `body.light`) avec arrières-plans à mesh gradient, glassmorphism (`backdrop-filter: blur()`), bordures lumineuses et effets de survol magnétiques ; intégration du tracker de curseur `--mouse-x`/`--mouse-y` (`initSpotlightCards()`) ; transition d'onglets animée par GSAP keyframes (`goToTab()`).

## [v2.1.0] - 2026-07-26

### Corrigé
**Humanisé** : Correction de la sélection de plage dans le calendrier : un clic unique définit désormais une période d'un jour sans perte de données.
**Technique** : `Index.html` — `createMiniCalendar()` : sélection par ancre (`anchor`) au lieu du couple start/end vide ; le 1er clic pose `start = end = jour cliqué`, le 2e étend (ordre inversé géré). Filet supplémentaire dans `submitBulk()` : en mode période, `dateEnd` vide retombe sur `dateStart` au lieu de ramener silencieusement la ligne en mode date simple.

**Humanisé** : Correction du cadrage et de l'alignement des jours dans le mini-calendrier.
**Technique** : `Index.html` — `.d-cal-day` héritait du `min-height: var(--tap-min)` (44px) global des boutons, plus large que sa colonne de grille : `min-height: 0`, hauteur fixe 32px, `width: 100%` et `box-sizing: border-box`.

### Ajouté
**Humanisé** : Amélioration du mini-calendrier avec saisie manuelle des dates, survol prédictif et bouton de retour au jour en cours.
**Technique** : `Index.html` — `createMiniCalendar()` : bloc `.d-cal-manual` (deux `input[type=date]` synchronisés, borne à l'envers → l'autre borne suit), survol `.is-preview`, bouton `.d-cal-today`, `.d-cal-day.is-today` en couleur d'accent.

**Humanisé** : Ajout de raccourcis de durée (+3j, +7j, +14j, +1 mois) et de périodes prédéfinies en saisie de lot.
**Technique** : `Index.html` — nouvelle rangée `durationShortcuts` dans le panneau « Une période » ; deux entrées ajoutées à `rangePresetItems()` (partagée avec le Dashboard).

### Modifié
**Humanisé** : L'aperçu de répartition d'un total affiche désormais la distribution exacte des points par jour.
**Technique** : `Index.html` — `updateDatePreview()` reproduit le calcul entier de `submitBulk()` (`base` + `rem`) et signale les cas limites (période d'1 jour, points insuffisants).

## [v2.0.0] - 2026-07-23

### Ajouté
**Humanisé** : Ajout d'un bouton « Tout exporter » pour télécharger en une archive zip l'ensemble des graphiques avec les filtres actifs.
**Technique** : `Index.html` — nouveau bouton `#exportAllBtn` et fonction `exportAllCharts()` : parcourt `BATCH_EXPORT_CHART_TYPES`, appelle `switchChartType(type, onDone)` (paramètre `onDone` ajouté, additif, à `switchChartType`/`applyFilters`) pour attendre chaque rendu, capture chaque graphique via `buildInfographicCanvas`, puis zippe le tout avec `fflate` (chargée à la demande via `EXPORT_LIBS.zip`, même pattern que jsPDF/xlsx). Le graphique visible revient au type d'origine une fois l'export terminé.

### Ajouté
**Humanisé** : Option d'affichage du joueur ayant le plus progressé ou régressé sur l'infographie exportée.
**Technique** : `Index.html` — nouvelle option `topMover` dans `openExportModal()` ; `computeTopMover()` compare les totaux de la période active à ceux d'une période précédente de même durée (`computePreviousPeriodRange()`, un appel `apiGetFilteredData` supplémentaire) ; le résultat (`exportOpts._topMoverResult`, non persisté) est dessiné en pill par `buildInfographicCanvas()`. Omis silencieusement si aucune période explicite n'est active.

### Ajouté
**Humanisé** : Ajout d'un bouton « Copier » dans la fenêtre d'export pour coller directement l'image dans le presse-papier.
**Technique** : `Index.html` — `openExportModal()` : nouveau bouton `copyBtn` utilisant `navigator.clipboard.write()` avec un `ClipboardItem` construit depuis `canvas.toBlob()`. Masqué si `window.ClipboardItem` est indisponible ou si le format sélectionné est `pdf`.

### Ajouté
**Humanisé** : Ajout des métadonnées de contexte (période, filtres et date) en en-tête des exports CSV.
**Technique** : `Index.html` — nouvelle fonction `buildExportContextLines()` réutilisée par `exportAsCSV()` ; le CSV est préfixé de 4 lignes commentées (`# Clé : Valeur`) avant le tableau de données.

### Ajouté
**Humanisé** : Enrichissement des exports Excel avec un onglet Classement détaillé et un onglet Contexte de génération.
**Technique** : `Index.html` — `exportAsExcel()` ajoute les onglets `Classement` (via nouvelle fonction `computeRankingWithGaps()`) et `Contexte` (via `buildExportContextLines()`, partagée avec `exportAsCSV()`).

### Modifié
**Humanisé** : Mémorisation automatique des préférences d'export d'infographie d'une session à l'autre.
**Technique** : `Index.html` — `openExportModal()` initialise `exportOpts` via nouvelle fonction `loadStoredExportOpts()` (localStorage, clé `exportOpts_v1`) au lieu d'un objet littéral fixe ; chaque mutation (`pillGroup`, `checkOpt`, filigrane) appelle `saveExportOpts()`. Le titre personnalisé n'est volontairement pas persisté.

## [v1.9.0] - 2026-07-22

### Modifié
**Humanisé** : Tri croissant automatique des boutons rapides de barème dans la saisie de lot.
**Technique** : `Index.html` — `renderBaremeQuickBtns()` : les entrées filtrées sont triées par `pts` croissant avant le rendu des `.bq-btn`.

## [v1.8.0] - 2026-07-21

### Modifié
**Humanisé** : La zone « Créé par / Modifié par » des notes est désormais alignée sur la même ligne que les boutons d'action pour un affichage plus compact.
**Technique** : `Index.html`/`Mobile.html` — `.note-meta`/`.m-note-meta` et `.note-actions`/`.m-hist-actions` fusionnés dans un conteneur `.note-footer`/`.m-note-footer` unique (`flex-wrap`, meta en `flex:1`, actions en `margin-left:auto`). Avatars réduits (20→16px desktop, 24→20px mobile), suppression de la date affichée sur la pastille « Modifié par » (déplacée dans l'attribut `title`) pour gagner en largeur.

### Modifié
**Humanisé** : Les auteurs et dates de modification sont désormais enregistrés directement sur chaque note, garantissant un affichage instantané et fiable des pastilles.
**Technique** : `Code.gs` — feuille `Notes` étendue à 7 colonnes (`Date | Joueur | Note | NoteId | CrééPar | ModifiéPar | ModifiéLe`), migration douce via `NotesService._ensureColumns()`. `addNote()` écrit `CrééPar` à la création ; `editNote(rowIndex, newText, editor)` écrit `ModifiéPar`/`ModifiéLe` directement (et backfille le `NoteId` si absent). `getAllNotes()` lit ces colonnes telles quelles, sans dérivation. Suppression de `_noteAuthorsByNoteId()`/`_computeNoteAuthorsByNoteId()` (cache + calcul depuis le journal, devenus inutiles). `apiBackfillNoteAuthors` retrouve toujours l'auteur des notes anciennes en remontant la chaîne d'éditions dans le Journal, mais écrit désormais le résultat directement dans les colonnes plutôt que de retaguer des entrées de journal. `NoteId` reste utilisé uniquement par `apiGetNoteHistory()` pour l'historique détaillé.

### Modifié
**Humanisé** : Amélioration visuelle de la zone d'auteur des notes : séparation pointillée, typographie renforcée et bouton « Modifié par » interactif avec chevron animé.
**Technique** : `Index.html` — `.note-meta` : `border-top: dashed`, `padding-top`, pastilles sans fond/bordure sauf `.note-meta-edited` (seule actionnable) ; noms enveloppés en `<strong>`, `.note-meta-chevron` ajouté. `Mobile.html` — même traitement à l'échelle tactile (`.m-note-meta-*`).

### Corrigé
**Humanisé** : L'outil de rattachement remonte désormais toute la chaîne d'éditions d'une note pour restaurer à la fois l'auteur initial et les modificateurs.
**Technique** : `Code.gs` — `apiBackfillNoteAuthors` : après avoir localisé la dernière modification d'une note (Après == texte actuel), son champ Avant (`"joueur : texte précédent"`) est retesté contre l'index des créations, puis, si toujours pas trouvé, contre l'index des modifications avec ce texte précédent comme nouvelle cible — et ainsi de suite (plafond de sécurité 50 sauts) jusqu'à retrouver la création d'origine ou jusqu'à ce que la chaîne casse (correspondance absente ou ambiguë, jamais devinée). Toutes les entrées de la chaîne reconstituée (création + chaque modification traversée) sont retaguées avec le même NoteId — l'historique complet redevient visible dans le popover, pas seulement la dernière modification.

### Corrigé
**Humanisé** : L'infobulle d'historique des notes reste désormais parfaitement attachée au bouton lors du défilement et se ferme automatiquement lorsqu'il quitte l'écran.
**Technique** : `Index.html` — `openNoteHistoryPopover()` : la position (`position:fixed`, calculée une fois via `getBoundingClientRect()`) était figée à l'ouverture. Nouvelle fonction `reposition()` rappelée sur `scroll` (capture, pour les conteneurs scrollables imbriqués) et `resize`, tant que le popover est ouvert ; fermeture automatique si le bouton sort du viewport. Écouteurs nettoyés dans `closeNoteHistoryPopover()`.

### Corrigé
**Humanisé** : L'outil de rattachement identifie désormais l'auteur des notes ayant subi des modifications en s'appuyant sur leur dernière version enregistrée dans le journal.
**Technique** : `Code.gs` — `apiBackfillNoteAuthors` passe de un à deux index sur le Journal : `byCreation` (entrées « Note ajoutée », clé `"joueur : texte"`, format historique) et `byEdit` (entrées « Note modifiée », clé `"texte"` seul — l'ancien format n'incluait pas le joueur dans le champ Après d'une édition). Une note sans NoteId est d'abord testée contre `byCreation` (note jamais modifiée : Créé par retrouvé), puis contre `byEdit` (note modifiée depuis : seul Modifié par est retrouvé — remonter plus loin dans l'historique s'appuierait sur l'ancien numéro de ligne, pas fiable). Toujours aucune correspondance acceptée si ambiguë (texte dupliqué dans plusieurs entrées).

### Ajouté
**Humanisé** : Ajout d'un outil « Rattacher » dans les Paramètres pour réattribuer l'auteur d'origine aux notes antérieures, et traçage automatique de toute note dès sa modification.
**Technique** : `Code.gs` — `NotesService.editNote()` génère et écrit un `NoteId` à la volée si la ligne n'en a pas encore (note antérieure au suivi), et le renvoie pour que `apiEditNote` journalise avec le bon `Détail: "note:<id>"`. Nouvel endpoint `apiBackfillNoteAuthors(author)` : indexe les entrées "Note ajoutée" du Journal par contenu exact (`"joueur : texte"`), et pour chaque note sans NoteId dont le texte correspond à **une seule** entrée (pas d'ambiguïté), génère un NoteId et retague le Détail de cette entrée d'audit (`note:<id>`) — la note devient alors visible via le mécanisme normal (`_computeNoteAuthorsByNoteId`), sans duplication de données. Notes ambiguës (texte dupliqué) ou déjà éditées (texte modifié depuis) : laissées sans correspondance, honnêtes plutôt que devinées. `Index.html` — bouton `#backfillNoteAuthorsBtn` dans la carte Santé & nettoyage. Non ajouté à `Mobile.html` (onglet Outils volontairement réduit côté mobile).

### Corrigé
**Humanisé** : Correction de l'affichage de l'auteur d'origine (« Créé par ») lors de la création d'une note et suppression de la pastille temporaire « Auteur inconnu ».
**Technique** : `Code.gs` — bug dans `_computeNoteAuthorsByNoteId()` : le filtre exigeait `Entité === 'Note'`, mais `apiAddNote` journalise « Note ajoutée » avec `Entité: 'Note: ' + joueur` (pour un affichage plus lisible dans l'onglet Journal), jamais `'Note'` seul — `createdBy` ne matchait donc jamais. Le filtre repose maintenant uniquement sur le Détail `"note:<id>"` (déjà un identifiant unique posé par les 3 endpoints notes), sans condition sur l'Entité. `Index.html`/`Mobile.html` — pastille de repli `.note-meta-unknown`/`.m-note-meta-unknown` retirée ; la ligne méta redevient simplement masquée quand aucune donnée n'existe (notes antérieures à cette fonctionnalité).

### Modifié
**Humanisé** : Mise en cache des auteurs et modifications de notes pour accélérer l'ouverture de l'onglet Notes sans relire tout le journal d'audit.
**Technique** : `Code.gs` — `_noteAuthorsByNoteId()` enveloppe désormais `_computeNoteAuthorsByNoteId()` (logique inchangée) avec le même cache cross-requête que `getAllLogs()`/`getFullHistoryRowsCached()` : `CacheService.getScriptCache()`, clé `note_authors_v` + `_logsVersion()` (déjà incrémenté par `withLock()` à chaque écriture, notes incluses), TTL `CONFIG.CACHE_TTL_SECONDS`.

### Modifié
**Humanisé** : Récupération dynamique des auteurs de notes via le journal d'audit avec identifiant unique pour fiabiliser l'historique et affichage d'une mention pour les notes antérieures.
**Technique** : `Code.gs` — feuille `Notes` réduite à 4 colonnes (`Date | Joueur | Note | NoteId`, migration douce via `NotesService._ensureNoteIdColumn()`, colonnes `Auteur/ModifiéPar/ModifiéLe` de l'ancien schéma ignorées). `addNote()` génère un `NoteId` opaque (`_generateGroupId()`) qui voyage avec la note quel que soit son numéro de ligne. `apiAddNote`/`apiEditNote`/`apiDeleteNote` journalisent désormais `Détail: "note:<NoteId>"` au lieu de `"ligne #<rowIndex>"`. Nouvelle fonction `_noteAuthorsByNoteId()` : une passe sur le Journal, regroupée par NoteId, dérive `createdBy` (1ʳᵉ entrée « Note ajoutée ») et `lastEditedBy`/`lastEditedAt` (dernière entrée « Note modifiée ») — consommée par `getAllNotes()`. `apiGetNoteHistory(noteId)` filtre désormais par NoteId (avant : par numéro de ligne, vulnérable au décalage après suppression). `Index.html`/`Mobile.html` — `openNoteHistoryPopover()` reçoit `note.noteId` ; pastille de repli `.note-meta-unknown`/`.m-note-meta-unknown` quand aucune donnée n'est trouvée.

### Ajouté
**Humanisé** : Affichage de l'auteur d'origine et des informations de dernière modification (auteur et date) sur chaque note.
**Technique** : Feuille `Notes` étendue de 3 à 6 colonnes (`Date | Joueur | Note | Auteur | ModifiéPar | ModifiéLe`), migration douce via `NotesService._ensureAuthorColumns()` (ajoute les en-têtes manquants sans toucher aux notes existantes). `addNote(player, text, dateStr, author)` et `editNote(rowIndex, newText, editor)` écrivent désormais l'auteur/l'éditeur ; `getAllNotes()` renvoie `createdBy`/`lastEditedBy`/`lastEditedAt`. `apiAddNote`/`apiEditNote`/`apiDeleteNote` (Code.gs) journalisent sur 6 colonnes au lieu de 3. `Index.html`/`Mobile.html` : ligne `.note-meta`/`.m-note-meta` sous chaque note.

**Humanisé** : Transformation des informations d'auteur en pastilles visuelles avec ouverture d'un historique complet des versions au clic sur « Modifié par ».
**Technique** : `Code.gs` — nouvelle fonction `apiGetNoteHistory(rowIndex)` qui filtre le Journal d'audit (`entity==='Note'`, `action==='Note modifiée'`, `detail==='ligne #'+rowIndex`) et renvoie les couples avant/après texte, du plus récent au plus ancien (aucune nouvelle donnée stockée, réutilise les entrées déjà journalisées par `apiEditNote`). `Index.html` — `buildNoteCard()` remplace le texte `.note-meta` par des pastilles `.note-meta-item`, la pastille « Modifié par » est un bouton qui ouvre `openNoteHistoryPopover()` (popover positionné façon `whoAmIDropdown`, fermeture au clic extérieur). `Mobile.html` — mêmes pastilles `.m-note-meta-item` en échelle tactile ; le bouton `[data-history]` ouvre `openModal()` avec le même historique.

### Corrigé
**Humanisé** : L'infobulle de survol du graphique du Dashboard disparaît désormais systématiquement dès que le curseur ou le doigt quitte le graphique.
**Technique** : `Index.html`/`Mobile.html` — ajout d'un filet de sécurité `mousemove`/`touchstart` au niveau du document : si le curseur (ou le doigt) n'est ni dans le canvas du graphique ni dans la bulle `#chartCustomTooltip`/`#mChartCustomTooltip`, elle est masquée. Vient compléter le `mouseleave` existant sur le canvas, insuffisant dans certains cas de survol rapide.

### Modifié
**Humanisé** : Les libellés des onglets au survol s'affichent désormais dans une infobulle flottante sans décaler les boutons voisins ni modifier la barre de navigation.
**Technique** : `Index.html` — `.nav-btn-label` reste masqué (`display:none`) sauf pour l'onglet actif (affiché en ligne comme repère permanent). Au survol, une bulle unique `#navHoverTip` (`position:fixed`, style `var(--card)`/`var(--border)` cohérent avec le reste de l'app) est positionnée sous le bouton via `initNavHoverTip()` (délégation `mouseover`/`mouseout` sur `#desktopNavGroup`). Corrige une première tentative où le libellé était en `position:absolute` *dans* le bouton : `.nav-btn-group` étant `overflow-x:auto`, le navigateur force `overflow-y:auto` en retour et rognait la bulle, la rendant invisible.

### Ajouté
**Humanisé** : Coloration dynamique des scores dans l'infobulle du Dashboard selon leur performance relative par rapport à la moyenne du Top (paliers de couleur et animation pour les scores exceptionnels).
**Technique** : `Index.html`/`Mobile.html` — nouvelle fonction `pointValueTier(value, sampleValues)` : calcule la moyenne de `dp.dataset.data` (l'échantillon réellement affiché pour ce Top) et classe `value` par ratio à cette moyenne (`<0.6` froid, `<1.4` normal, `<2.2` chaud, `<3.2` incandescent, au-delà « blaze » animé). Appliqué dans `buildCustomTooltipPlugin`/`buildMobileTooltipPlugin` via une classe CSS sur `.ctt-val` (`.pv-cold/.pv-normal/.pv-warm/.pv-hot/.pv-blaze`), animation `@keyframes` respectant `prefers-reduced-motion`. Aucun seuil ni échelle codés en dur — tout dérive de la donnée du survol en cours.

### Modifié
**Humanisé** : Compaction de la barre de navigation avec affichage des icônes seules par défaut et déploiement du libellé au survol ou sur l'onglet actif.
**Technique** : `Index.html` — `navButtonHtml()` sépare icône (`.nav-btn-icon`) et libellé (`.nav-btn-label`, `max-width:0` par défaut, déployé au `:hover`/`.active` via transition CSS).

**Humanisé** : Affichage direct du record absolu historique dans le bandeau résumé en haut du Dashboard.
**Technique** : `Code.gs` — `apiGetQuickStats()` calcule et renvoie `stats.globalBest`. `Index.html` — nouvelle pill `#qsRecordPill` dans `#quickStatsBar`, alimentée par `loadQuickStats()`, clic renvoie vers l'onglet Records du hub Statistiques (`goToRecords()`).

**Humanisé** : Le clic sur un Top dans la légende masque ou affiche à nouveau individuellement son élément, avec un style de légende plus épuré.
**Technique** : `Index.html` — `isolatableLegendOnClick` remplacé par `toggleLegendOnClick` (toggle classique par dataset/segment) ; nouveau helper `CHART_LEGEND_LABELS(c)` (`usePointStyle`, `pointStyle:'circle'`, `boxWidth/boxHeight`, `padding`) appliqué aux 3 configurations de légende (stacked/grouped/radar/doughnut, courbes, classement détaillé).

**Humanisé** : Refonte intuitive du sélecteur de dates en saisie de lot : bascule claire entre jour unique et période via mini-calendrier visuel, options explicites de répartition et calcul en direct du score par jour.
**Technique** : `Index.html` — la cellule date (`.d-cell`) passe d'un affichage inline permanent (champ + 8 chips + case Plage + Répéter/Répartir + sélecteur de jours) à un interrupteur segmenté `.d-mode-seg` pilotant deux panneaux `.d-single` / `.d-period`. Nouveau composant `createMiniCalendar(startInput, endInput, onChange)` (sélection de période continue, navigation de mois, surbrillance `.in-range`/`.is-end`) ; `createFillToggle` refait en options plain-language (`.fill-choice`/`.fill-opt`, `data-fill`) avec callback `onChange` ; ligne d'aperçu `.d-fill-preview` mise à jour via `updateDatePreview()` (branchée sur points, calendrier, mode, fill). Helpers `daysBetweenInclusive()` + `MONTHS_FR`. Les hooks de lecture sont conservés (`.d-start`/`.d-end`/`.range-cb` caché = mode période/`.line-fill`/`.day-picker-wrap` caché à `'[]'`) → envoi/duplication inchangés ; `applyDateAllBtn` réécrit via `row.__applyDate()` + helper `setLineFill()`. Code mort retiré (`buildRowRangePresets`, `datePillLabel`, CSS pastille/popover/`.row-range-details`). `Mobile.html` inchangé (saisie de lot mobile à date unique, sans période — choix assumé).

### Modifié
**Humanisé** : Amélioration de la bascule mobile avec une pastille toujours visible et épinglage des contrôles principaux pendant le défilement des onglets.
**Technique** : `Index.html` — `.layout-mode-toggle` repensé en pastille libellée (icône + « Mobile »). La barre ne défile plus en bloc : `.nav-container` passe de `min-width:max-content` à `min-width:0` et seul `.nav-btn-group` (les onglets) scrolle horizontalement (`flex:1;overflow-x:auto`, scrollbar masquée), donc brand + contrôles de droite restent épinglés. `Mobile.html` inchangé (bascule « 🖥️ Version PC » déjà bien placée dans le menu latéral).

### Modifié
**Humanisé** : Refonte de l'onglet Guide sous forme de grille thématique de cartes interactives, intégrant l'ensemble des nouvelles fonctionnalités et outils du site.
**Technique** : `Index.html` — accordéon `.guide-section`/`.guide-body` remplacé par `.guide-grid`/`.guide-tile` + `.guide-detail`, contenu par thème dans des `<template>` (`guideContent-*`), logique `openGuideDetail()`/`closeGuideDetail()` dans `initGuideAccordion()` (nom conservé, appelé par `goToTab`). `Mobile.html` — `GUIDE_SECTIONS` passe d'un tableau `{title, body}` rendu en `.m-accordion` à un tableau `{key, icon, title, body}` rendu en `.m-guide-grid`/`.m-guide-tile` + `.m-guide-detail`, nouvelles fonctions `openMGuideDetail()`/`closeMGuideDetail()`. Aucun changement de données ni d'appel serveur.

### Modifié
**Humanisé** : Modernisation visuelle des blocs statistiques du Dashboard avec médailles de podium, avatars stylisés, carte trophée pour le record absolu et mise en avant des duos.
**Technique** : `Index.html` — nouveau kit CSS « livre des records » (`.sr-list`/`.sr-row`/`.sr-rank` médaillé or/argent/bronze, `.sr-avatar` cerclé de `--sr-accent`, `.sr-hero` doré, `.sr-avatar-cluster` pour les duos, `.sr-section`) + tokens `--medal-gold/silver/bronze`. Constructeurs DRY `buildStatRow(cfg)`/`buildStatRank(rank)`/`playerMetaOf(name)` partagés par `scanRecords`/`scanTopPairs`/`loadMentionStats`, qui remplacent leurs anciennes lignes `.tool-action`. Helper `categoryPill(name)` factorisé (pastille de Top emoji+nom teintée) et réutilisé aux 6 endroits qui reconstruisaient ce bloc à l'identique. `Mobile.html` — mêmes tokens + kit `.sr-*` à l'échelle tactile, constructeurs string `mStatRank`/`mStatRow`/`mStatHero`/`mSrAvatar` ; `loadRecordsStat`/`loadPairsStat`/`loadMentionStats` réécrits sur ce kit (Tendances et Jour actif laissés tels quels : la métaphore de podium n'a pas de sens pour une évolution ou une répartition par jour). Aucun changement de données ni d'appel serveur.

### Corrigé
**Humanisé** : Correction du redimensionnement du tchat : le panneau s'étend désormais vers le haut sans déborder de l'écran et la zone de saisie se réinitialise après chaque envoi.
**Technique** : `Index.html`/`Mobile.html` — `renderChatMessages()`/`mRenderChatMessages()` rappellent `positionChatPanel()` en `requestAnimationFrame` après rendu (le panneau est ancré par son `top` en px, donc grandissait vers le bas sans réancrage). `sendChatMessage()`/`mSendChatMessage()` rappellent la fonction `fit` de `autoGrowTextarea` (capturée dans `_chatInputFit`/`_mChatInputFit`) après avoir vidé le champ.

### Ajouté
**Humanisé** : Ajout des raccourcis de plages de dates dans le journal d'audit et d'un bouton d'inversion de l'ordre chronologique (récents/anciens) dans toutes les listes.
**Technique** : `Index.html` — helpers réutilisables `dateRangePreset()` + `DATE_RANGE_CHIPS` + `setupDateRangeControls()` (chips générées, plus de HTML en dur) ; l'Historique est refactoré dessus et le Journal (`#auditRangeChips`, `#auditDateClearBtn`) le réutilise. `setupDateSortToggle()` câble les boutons `#histSortBtn`/`#auditSortBtn` ; état `_histSortDir`/`_auditSortDir` passé à `apiGetHistoryPage`/`apiGetAuditLog` (et intégré à la clé de préchargement `histPrefetchKey`). `Mobile.html` — bouton `#mHistSortBtn` + `mHistSortDir`. `Code.gs` — `getHistoryPage(...,sortDir)` (saute le `reverse` si `'asc'`) et `apiGetAuditLog(...,sortDir)` (réordonne `filtered` si `'asc'`) ; paramètres optionnels, comportement par défaut inchangé. Test `getHistoryPage honours sortDir` ajouté (111 tests verts).

### Corrigé
**Humanisé** : Audit global de fiabilité : renforcement de la vérification d'identité sur les règles automatiques, propagation complète des renommages d'entités et fiabilisation de l'ordre des messages du tchat.
**Technique** : `AutoPoints.gs` — `requireAuthor(author)` ajouté en tête de `apiAddAutoRule`/`apiUpdateAutoRule`/`apiDeleteAutoRule`/`apiSetAutoTrigger`/`apiRunAutoRulesNow` ; `apiSetAutoTrigger` enrobé dans `withLock()` (seul endpoint mutateur qui ne l'était pas) ; `_validate()` vérifie désormais l'existence du joueur/Top via `SettingsService.getEntities()` avant d'accepter une règle. `Code.gs` — `SettingsService.renameEntity()` propage le renommage à `Bareme` (colonne Top), `Phrases` (pool `cat:<nom>`) et `AutoRules` (Player/Category) via un nouvel helper `_renameInColumn()`. `Index.html`/`Mobile.html` — `callServer()` vérifie `onSuccess` avant de l'appeler ; `pollChat()`/`mPollChat()` ignorent un nouvel appel tant que le précédent n'a pas répondu (`_chatPollInFlight`).

### Corrigé
**Humanisé** : La touche Entrée insère désormais la mention sélectionnée sans envoyer le message, et le panneau du tchat reste parfaitement positionné sur les petits écrans.
**Technique** : `Index.html` — `attachMentionAutocomplete(chatInput)` est désormais enregistré avant l'écouteur `keydown` Entrée-envoi (son `stopImmediatePropagation` ne pouvait pas agir en second). Clamp de position corrigé dans `positionChatPanel`/`setPos` (Index et Mobile) : `Math.max(8, Math.min(...))` au lieu de l'ordre inverse qui produisait une coordonnée négative quand la borne haute était négative.

### Modifié
**Humanisé** : Optimisations de performance sur les opérations de lot en base, harmonisation des couleurs avec le thème actif et agrandissement des cibles tactiles à 44px.
**Technique** : `Code.gs` — nouveau bloc `CONFIG` (`LOCK_TIMEOUT_MS`, `CACHE_TTL_SECONDS`, `CACHE_MAX_BYTES`, `AUTO_TRIGGER_INTERVAL_HOURS`) remplaçant les constantes dupliquées ; helpers partagés `_pad2`/`_dayKey`/`_parseLocalDateWithNow`/`_generateGroupId` remplaçant ~10 redéfinitions locales identiques. `apiUpdateBulkEntries`, `apiGroupDistributedLots`, `apiUngroupLot` : un seul `getRange().setValues()` sur toute la plage au lieu d'un appel par ligne modifiée. `Index.html` — `.who-am-i-badge` actif, `.chat-fab`/`.chat-fab-badge` : `color:#fff`/`#2ed573` remplacés par `var(--on-accent)`/`var(--success)` ; `button.small` passe de `min-height:34px` à `var(--tap-min)` (44px). `Mobile.html` — `.m-hist-range-btn.active` et `.m-chat-fab`/`.m-chat-fab-badge` : même remplacement par `var(--on-accent)`. Suite de tests (`npm test`, 110 tests) verte après ces changements.

### Ajouté
**Humanisé** : Ajout de boutons de périodes rapides (Aujourd'hui, 7 jours, Ce mois, etc.) dans l'Historique sur PC et mobile pour filtrer la liste en un clic.
**Technique** : `Index.html` — rangée `#histRangeChips` (`.hist-range-btn`, style pill accent) au-dessus des filtres Joueurs/Tops, `histQuickRangeDates()` calcule les bornes locales et remplit `historyDateFrom/To` (donc composable avec les filtres existants) avant `loadHistoryPage(1)`. `Mobile.html` — équivalent `#mHistRangeChips`/`.m-hist-range-btn` dans `renderHistoryEntriesShell()`, mêmes plages, tailles adaptées à l'échelle mobile.

### Modifié
**Humanisé** : Ajout d'un sommaire de navigation rapide en haut de l'onglet Outils pour accéder et déplier chaque outil instantanément.
**Technique** : `Index.html` — barre `#toolsQuickNav` (`.tools-quick-nav`, pills cohérentes avec le hub Statistiques) en tête de `stab-tools` ; chaque bouton retire `collapsed` de la carte cible puis `scrollIntoView`. Description ajoutée à `toolInactiveCard`. `Mobile.html` inchangé (section Outils volontairement réduite côté mobile).

### Modifié
**Humanisé** : Regroupement des cinq blocs statistiques du Dashboard dans une carte unique à onglets mémorisée d'une visite à l'autre sur PC.
**Technique** : `Index.html` — les cards `recordsCard`/`trendsCard`/`weekdayCard`/`pairsCard`/`mentionsCard` fusionnent dans `#statsHubCard` (`.stats-hub-tabs` pills accent + `.stats-hub-pane`), contenus et IDs internes inchangés (aucun loader modifié). `switchStatsHubPane()` persiste l'onglet dans `localStorage` (`tdt_stats_hub_tab`) et appelle `.resize()` sur `trendsChartInstance`/`weekdayChartInstance` à l'affichage (un chart créé dans un volet masqué a une taille nulle). Les 4 `makeCollapsible` correspondants sont retirés. `Mobile.html` inchangé (accordéons conservés, choix assumé).

### Modifié
**Humanisé** : Agrandissement automatique de tous les champs de texte selon leur contenu sur PC et mobile pour faciliter la saisie et la relecture.
**Technique** : Nouveau helper `autoGrowTextarea(ta, maxVhRatio)` (Index.html et Mobile.html) — hauteur suit `scrollHeight`, plafonnée à 40% du viewport (30% pour le champ du tchat, 50% pour l'import en masse), recalculée sur `input`/`focus`/`resize`. Branché dans `buildTextEditor` (couvre descriptions d'entrées, notes PC, règles auto, description de Top) et sur chaque `<textarea>` statique ou de modale : `chatInput`, `phraseModalText`, `bulkImportTextarea` (Index) ; `mChatInput`, `mNoteText`, `mEditNoteText`, `mPhraseText` (Mobile). `_setValue` de l'éditeur refait l'ajustement après un remplissage programmatique.

### Modifié
**Humanisé** : Amélioration de la réactivité du tchat avec affichage instantané des messages envoyés et rafraîchissement accéléré lorsque le panneau est ouvert.
**Technique** : `Index.html`/`Mobile.html` — envoi optimiste via `_chatPendingSends`/`_mChatPendingSends` (message temporaire `pending`, opacité réduite, actions désactivées, retiré et texte restauré en cas d'échec) ; sondage adaptatif `scheduleChatPoll()`/`mScheduleChatPoll()` (2 s ouvert / 8 s fermé, re-planifié à l'ouverture/fermeture) remplaçant le `setInterval` fixe de 4 s ; `pollChat()` immédiat à l'ouverture du panneau.

### Modifié
**Humanisé** : Répartition fluide des onglets dans la barre de navigation et animation progressive d'ouverture du libellé actif.
**Technique** : `Index.html` — `.nav-btn` passe de `padding` fixe à `flex:1 1 0` + `justify-content:center` (partage égal de l'espace libre, contenu toujours centré) ; `.nav-btn.active` prend `flex-grow:2.6` (les voisins, tous à `flex-grow:1`, se resserrent symétriquement autour de lui). `.nav-btn-label` passe d'un toggle `display:none/inline-block` sec à une transition `max-width`/`opacity`/`margin-left` pour un dépliage progressif.

### Ajouté
**Humanisé** : Intégration des avatars des joueurs sur les pastilles d'auteur des notes et dans leur historique de modification.
**Technique** : `Index.html` — nouveau helper `buildNoteAuthorAvatar(name)` (résout `cachedPlayers`/`getAvatarUrl`, retombe silencieusement en absence d'image) injecté dans `buildNoteCard()` (pastilles `.note-meta-item`) et `openNoteHistoryPopover()` (`.nhp-entry-head`, wrapper `.nhp-entry-who`). CSS `.note-meta-avatar` (18-20px, circulaire) ; `.note-meta-item` repensé (fond plus contrasté, gap augmenté).

### Corrigé
**Humanisé** : Disparition propre du point de repère de survol sur le graphique du Dashboard dès la sortie du curseur.
**Technique** : `Index.html` — Chart.js dessine ce repère indépendamment de la bulle `#chartCustomTooltip` : masquer la bulle seule ne l'effaçait pas. `bindButtons()` centralise la fermeture dans `hideChartHover()`, qui vide aussi les éléments actifs du chart (`chart.setActiveElements([])`, `chart.tooltip.setActiveElements([], …)`, `chart.update('none')`) en plus de masquer la bulle — appelé par le `mouseleave` du canvas et par le filet de sécurité `mousemove` existant.

### Ajouté
**Humanisé** : Personnalisation de l'infobulle du graphique dans les Paramètres : choix des couleurs par palier, jauge de progression et effets visuels mémorisés.
**Technique** : `Index.html` — préférences stockées dans `localStorage` (`topsdestops_tooltip_prefs`), lues/écrites via `getTooltipStylePrefs()`/`saveTooltipStylePrefs()`, appliquées en variables CSS (`--ctt-cold/normal/warm/hot/blaze`) et classe `.ctt-effects-on` sur `#chartCustomTooltip` par `applyTooltipStylePrefs()`. Rendu inline par `renderTooltipStyleSettings()` dans `#tooltipStyleSettings` (Paramètres → Identité, pas un popover flottant : c'est un réglage permanent de l'app). Jauge optionnelle : `buildTooltipGauge(tier, ratio)`, `.ctt-gauge`/`.ctt-gauge-fill`, ratio exposé par `pointValueRatio()` (extrait de `pointValueTier`, inchangé sinon). Pas de dépendance externe ajoutée : jauge et couleurs codées en CSS/SVG maison plutôt qu'une bibliothèque tierce (coût de perf par re-render de tooltip au survol, et personnalisation plus simple à contrôler nous-mêmes).

### Modifié
**Humanisé** : Réorganisation de l'ordre des onglets dans la barre de navigation : Dashboard, Saisir un Lot, Notes, Historique, Paramètres, Guide.
**Technique** : `Code.gs` — réordonnancement du tableau `NAV_PAGES` (source unique consommée par `Index.html` et `Mobile.html` via `apiGetNavPages()`), aucun autre changement nécessaire.

### Corrigé
**Humanisé** : Les scores à 0 point restent affichés en gris neutre dans l'infobulle du graphique indépendamment des palettes personnalisées.
**Technique** : `Index.html` — `pointValueTier()` renvoie un palier dédié `pv-zero` pour `value === 0` (avant de calculer le ratio à la moyenne), stylé en dur (`color:var(--text-muted); opacity:0.65`) indépendamment des variables `--ctt-*` personnalisables. La jauge optionnelle est masquée pour ce palier (aucun ratio pertinent à afficher).

## [v1.7.0] - 2026-07-17

### Corrigé
**Humanisé** : Renforcement de la sécurité et de la traçabilité : obligation stricte de confirmation d'identité pour toute suppression ou ajout de note, et rejet serveur des requêtes anonymes.
**Technique** : `requireIdentity()` ajouté en tête des 4 handlers manquants (`Index.html` : suppression d'entité et de message de tchat ; `Mobile.html` : suppression de message de tchat et `mNoteSubmit`). Nouveau garde-fou serveur `requireAuthor(author)` (Code.gs) appelé au début des 32 fonctions `api*` mutatrices — lève « Identité requise pour cette action » si l'auteur est vide. Le seed automatique du preset "Défaut" (`apiSavePhrasesBatch` au premier chargement) passe `'Système'` comme auteur en l'absence d'identité. Tests `bulk-edit.test.js` mis à jour pour passer un auteur.

### Ajouté
**Humanisé** : Transformation de la carte « Commentaires par Top » en carrousel fluide avec défilement automatique contrôlable (pause/lecture) et accroche magnétique des cartes au geste.
**Technique** : `renderPhrasesCard` (Index.html) — CSS `scroll-snap-type: x mandatory` / `scroll-snap-align: start` sur `.phrases-cat-body`/`.phrase-cat-card`. Nouveau défilement auto (`startCatAutoplay`/`stopCatAutoplay`/`pauseCatAutoplayBriefly`) piloté par `requestAnimationFrame`, position suivie en flottant (évite l'arrondi entier de `scrollLeft` sur certains navigateurs), va-et-vient entre 0 et `scrollWidth - clientWidth`, désactive `scroll-snap-type` pendant la lecture (`.autoplay-active`) et se met en pause 4s sur interaction (`pointerdown`/`touchstart`/`wheel`). État persisté dans `localStorage` (`tdt_cat_autoplay`, actif par défaut). Pas d'indicateur de position (points de pagination essayés puis retirés : la métaphore "page" ne correspondait pas à un rail en scroll continu). Mobile.html n'a pas cette section (non répliquée côté mobile), donc pas de changement là-bas.

## [v1.6.0] - 2026-07-16

### Corrigé
**Humanisé** : Repositionnement automatique vers le haut du menu d'autocomplétion des mentions (`@` et `#`) dans le tchat lorsqu'il manque d'espace en bas d'écran.
**Technique** : `attachMentionAutocomplete` (Index.html) — `position()` calcule l'espace disponible sous le champ via `getBoundingClientRect()`/`window.innerHeight` et bascule le popup au-dessus (`r.top - popupHeight - 4`) quand il manque de place en dessous et qu'il y en a assez au-dessus ; position horizontale également clampée pour ne jamais déborder à droite. Correction partagée par tous les champs utilisant cette fonction (descriptions, notes, tchat…).

### Ajouté
**Humanisé** : Intégration d'un tchat flottant déplaçable avec support du markdown, mentions de joueurs et de Tops, réponses imbriquées et badge de messages non lus.
**Technique** : Nouveau `ChatService` (Code.gs) + feuille `Chat` auto-créée (`Id | Date | Auteur | Texte | RéponseÀ`), API `apiGetChatMessages`/`apiPostChatMessage`/`apiDeleteChatMessage` (audit + `requireIdentity` comme partout ailleurs). Frontend : widget global hors du système d'onglets (`#chatFab`/`#chatPanel` sur Index.html, `#mChatFab`/`#mChatPanel` sur Mobile.html), sondage toutes les 4s (`google.script.run` n'a pas de push serveur), glisser du bouton via Pointer Events avec seuil anti-faux-clic, position persistée en localStorage. Extension de `renderMarkdown`/`attachMentionAutocomplete` (Index.html et Mobile.html en lecture) pour reconnaître `#NomDuTop` au même titre que `@Nom`, réutilisée automatiquement partout où le rendu markdown existait déjà (descriptions, notes, règles auto).

## [v1.5.0] - 2026-07-15

### Corrigé
**Humanisé** : Ajout d'une bannière d'invitation bien visible sur smartphone pour basculer facilement vers l'interface mobile dédiée.
**Technique** : `Index.html` — nouveau bandeau `#mobileCtaBanner` affiché via `initMobileCtaBanner()` quand `matchMedia('(max-width:640px)')` matche et qu'aucun choix desktop/fermeture n'est mémorisé (`tdt_layout_mode`, `tdt_mobile_banner_dismissed` en localStorage). Le bouton `#layoutModeToggle` de la navbar est aussi agrandi (fond, padding, taille d'icône) pour une meilleure cible tactile.

**Humanisé** : Réajustement global des proportions de l'interface mobile (textes, boutons, avatars agrandis) pour compenser le dézoom forcé par l'environnement Google Apps Script.
**Technique** : `Mobile.html` — tailles de police, cibles tactiles, avatars, rail de navigation et hauteur du graphique Dashboard augmentés d'un facteur ~2 à 2.5 dans tout le fichier, pour compenser l'échelle de rendu (~0.4 sur iPhone) imposée par l'absence de balise `viewport` sur le wrapper `script.google.com/.../exec` (confirmé via requête serveur directe avec User-Agent iPhone — aucune balise viewport dans la page reçue, ni desktop ni mobile). `overflow-x`/`overflow-y` avec `max-height` ajoutés en filet de sécurité sur les modales, accordéons, description d'historique et conteneur du graphique. La media query `@media (min-width: 600px)` — qui se déclenche en réalité toujours en production, contrairement aux paliers `≤430/380/340px` qui ne se déclenchent jamais (largeur CSS réelle fixée à ~980px par le wrapper Google) — a été réajustée pour ne pas annuler l'agrandissement.

**Humanisé** : Amélioration de la réactivité mobile sur toutes les tailles d'écran : suppression des débordements de texte, prise en charge du mode paysage et ajustement des marges.
**Technique** : `Mobile.html` — media queries étoffées (`≤430px`, `≤380px`, `≤340px`, `orientation:landscape`, `≥600px` pour tablette portrait) au lieu de l'unique palier `≤380px`. Correctifs ciblés : `.m-hist-top` et `.m-row` passent en `flex-wrap` pour éviter le débordement horizontal des cartes d'historique, `#mToastContainer` ne réserve plus l'espace de l'ancienne barre de navigation basse (remplacée par le rail latéral), tailles de titres en `clamp()`, inertie de défilement tactile iOS (`-webkit-overflow-scrolling`) sur les zones à scroll horizontal.

### Ajouté
**Humanisé** : Ajout de l'outil « Mentions manquantes » pour détecter les noms en texte brut dans les descriptions et les convertir automatiquement en mentions cliquables avec aperçu visuel.
**Technique** : `apiScanUnmentionedNames`/`apiApplyMentionFixes` (Code.gs) — détection via `_buildMentionCandidates` (nom complet de chaque joueur + tokens individuels si uniques à un seul joueur, pour éviter toute mauvaise attribution en cas d'homonymie partielle) et `_scanTextForUnmentioned` (remplacement mot-entier, insensible à la casse, Unicode-aware, ignore les mentions déjà présentes). Application groupée sous `withLock()`, audit via `updateMany` (History et Notes séparément, undo-compatible). Frontend : nouvelle carte dans `stab-tools` (Index.html), rendu diff mot-à-mot générique `wordDiffHtml()` (LCS), sélection individuelle/multiple avant application. Non porté sur Mobile.html, cohérent avec les autres outils avancés de cette section (volontairement absents du mobile).

**Humanisé** : Ajout de la carte statistique « Mentions » sur le Dashboard pour visualiser les joueurs les plus cités, les plus actifs et les duos les plus fréquents.
**Technique** : Nouvelle fonction `apiGetMentionStats()` (Code.gs), qui réutilise `_escapeRegExpMention` et scanne `StorageService.getFullHistoryRowsCached()` (auteur = `saiseur` avec repli sur `player`) et `NotesService.getAllNotes()` via la nouvelle fonction `_countMentionsInText()`. Frontend : nouvelle card `#mentionsCard`/`loadMentionStats()` dans Index.html (pattern `.tool-action`, à la suite de la card Duo), nouvel accordéon `mMentionsAcc`/`loadMentionStats()` dans Mobile.html (pattern `mStatAccordionHtml`/`statRow`).

### Corrigé
**Humanisé** : Activation de l'autocomplétion des mentions de joueurs (`@`) dans les champs de description de la saisie de lot.
**Technique** : Le champ `descInput` (`Index.html`, `addEntryRow`) n'avait jamais reçu l'appel `attachMentionAutocomplete()`, contrairement aux autres champs texte de l'app.

**Humanisé** : Correction d'un bogue de pagination dans l'Historique qui pouvait provoquer un écran blanc lors du chargement des scores.
**Technique** : `StorageService.getHistoryPage` (Code.gs) déclarait deux fois la constante `start` dans la même fonction (bornes de dates puis offset de pagination), ce qui est une erreur de syntaxe JavaScript empêchant le fichier de s'exécuter. La seconde a été renommée `pageStart`.

**Humanisé** : Ajout du contrôle d'identité obligatoire lors de l'annulation d'une action dans le journal d'audit et lors du changement de preset de commentaires sur mobile.
**Technique** : Ajout de `requireIdentity()` avant l'appel serveur dans le handler du bouton d'annulation (`Index.html`, `Mobile.html`) et dans le listener `change` du `<select>` de preset actif (`Mobile.html`), pour rester cohérent avec la règle « toute édition passe par `requireIdentity()` ».

**Humanisé** : Enregistrement systématique du changement de preset de commentaires dans le journal d'audit.
**Technique** : `apiSetActivePhrasePreset` (Code.gs) n'avait ni paramètre `author` ni appel à `AuditService.log`. Ajout des deux, enveloppé dans `withLock()` comme les autres setters simples ; les 3 appels client (`Index.html`, `Mobile.html` ×2) passent désormais `_whoAmI`.

**Humanisé** : Affichage de l'avatar de l'auteur de la saisie sur les cartes d'historique mobile.
**Technique** : `historyCardHtml` (Mobile.html) enveloppe désormais le nom du `saiseur` dans `avatarImgHtml()`, comme le fait déjà `buildHistRow` côté Index.html.

**Humanisé** : Affichage avec rendu markdown des descriptions de Tops dans les Paramètres sur mobile.
**Technique** : `renderEntitySettings` (Mobile.html) affiche désormais `item.meta` rendu via `renderMarkdown()` sous le nom de chaque Top, à l'identique du bloc `entity-meta` d'Index.html. La saisie côté mobile reste un champ texte simple (choix assumé et documenté : pas d'éditeur riche sur petit écran), seul l'affichage était manquant.

**Humanisé** : Harmonisation des couleurs du texte et des avertissements avec les variables du thème pour assurer une compatibilité parfaite en mode sombre et clair.
**Technique** : Nouvelle variable `--on-accent` (dark + light) dans `Index.html`/`Mobile.html`, remplace ~25 occurrences de `color: #fff`/`#fff !important`. `#ffaa00`/`#ffd166` (CSS uniquement, hors tableaux de couleurs JS pour Chart.js) remplacés par `var(--warn)`. `body.light option { background/color }` remplacé par `var(--card)`/`var(--text)`.

**Humanisé** : Agrandissement du bouton de bascule vers la version mobile pour faciliter l'appui tactile.
**Technique** : `.layout-mode-toggle` (Index.html) n'avait ni `min-width` ni `min-height`, contrairement aux autres boutons de la navbar qui héritent tous de `var(--tap-min)`. Ajout de `min-width`/`min-height: var(--tap-min)`.

**Humanisé** : Optimisation de la largeur du menu latéral et des marges intérieures sur les téléphones à petit écran.
**Technique** : `Mobile.html` n'avait aucun breakpoint `@media`. Largeur de la bande latérale extraite dans une variable `--rail-w` (56px), avec un breakpoint `≤380px` qui la réduit à 46px et resserre le padding de `.m-container`/`.card` ainsi que la taille des titres.

## [v1.4.0] - 2026-07-14

### Corrigé
**Humanisé** : Restauration des informations détaillées (lot et ligne concernés) sur les événements de dégroupement dans le journal d'audit.
**Technique** : `apiUngroupLot` et `apiRemoveFromGroup` (Code.gs) plaçaient l'identifiant utile (`groupId`/`rowIndex`) dans le paramètre `before` d'`AuditService.log`, colonne masquée côté frontend pour ces actions via `AUDIT_NO_DIFF_ACTIONS`. Déplacé vers le paramètre `detail`, seule colonne affichée pour ces actions.

**Humanisé** : Suppression des rechargements superflus lors du passage aux onglets Historique et Notes pour une navigation instantanée.
**Technique** : `goToTab()` (Index.html/Mobile.html) forçait un reset + rechargement complet de l'historique/des notes à chaque navigation vers ces onglets, en doublon des rechargements déjà déclenchés au bon endroit par les mutations. Ajout des indicateurs `_histLoadedOnce`/`_mHistoryLoadedOnce` (le second existait déjà côté notes mais n'était pas utilisé) pour ne charger qu'une fois par session.

### Ajouté
**Humanisé** : Ajout du filtrage par plage de dates (« Du / Au ») dans l'Historique des entrées sur PC et mobile.
**Technique** : `apiGetHistoryPage`/`StorageService.getHistoryPage` (Code.gs) acceptent deux nouveaux paramètres `startDate`/`endDate` (bornes inclusives, même logique que `apiGetAuditLog`). Frontend : deux `<input type="date">` + bouton d'effacement dans `.history-filters` (Index.html) et dans le shell Historique (Mobile.html), pris en compte dans la clé de cache de préchargement côté desktop.

### Modifié
**Humanisé** : Modernisation des sélecteurs de joueur et de Top dans l'outil Points automatiques avec intégration des avatars et des couleurs de catégories.
**Technique** : Remplacement des `<select id="autoRulePlayer">`/`<select id="autoRuleCategory">` par le composant `buildRichSelect()` déjà utilisé ailleurs (avatar/couleur + panneau stylé), reconstruit à chaque ouverture de l'onglet Outils via `loadAutoRules()`.

**Humanisé** : Prise en charge du markdown et des mentions de joueurs (`@`) avec barre d'outils et autocomplétion sur l'ensemble des champs de description.
**Technique** : Nouveau composant `buildTextEditor()` (Index.html) — textarea + toolbar + autocomplétion `@mention` (liste filtrée sur `cachedPlayers`) + aperçu, retourne `._getValue()/._setValue()`. Nouveau `renderMarkdown()`/`renderMentions()` (échappement HTML systématique avant insertion des balises générées, aucun HTML utilisateur n'est jamais injecté tel quel — liens limités à `http(s)://`). Appliqué à l'édition d'une entrée (`openFullEditHistoryModal`), d'une note (`openEditNoteModal`) et d'une règle automatique (`loadAutoRules`). Rendu markdown appliqué à l'affichage : tableau Historique (vue développée), drilldown Dashboard, cartes Notes, liste des règles automatiques. Un clic délégué global (`document.addEventListener('click', …)`) intercepte les `.mention` pour filtrer Historique. Côté Mobile.html : `renderMarkdown()`/`renderMentions()` portés à l'identique pour l'affichage (cartes Historique/Notes/lots) ; la saisie mobile reste un textarea simple (pas de toolbar ni d'autocomplétion sur petit écran), le texte tapé au format markdown/`@Nom` s'affichera quand même formaté.

### Corrigé
**Humanisé** : Fiabilisation du positionnement du menu de suggestions des mentions et activation de l'autocomplétion sur la saisie rapide de notes.
**Technique** : Deux causes distinctes. (1) Les champs `fInput`/`ta` (composeurs rapides de notes, Index.html) étaient de simples `<input>` sans autocomplétion. (2) Le popup `.md-mention-popup` de `buildTextEditor()` était en `position:absolute` sans coordonnées explicites — livré à sa position statique dans le flux, il pouvait se retrouver hors-champ ou tronqué par `.modal-box { overflow-y:auto }`. Extraction de la logique de mention dans une fonction autonome `attachMentionAutocomplete(inputEl)`, réutilisable sur tout `<input>`/`<textarea>` : popup ajouté à `document.body` en `position:fixed`, repositionné via `getBoundingClientRect()` à chaque affichage (indépendant de tout conteneur qui scrolle). Branchée sur `buildTextEditor()` (remplace l'ancienne logique dupliquée) et directement sur les deux composeurs de notes ; sélectionner une mention au clavier (Entrée/Tab) appelle `stopImmediatePropagation()` pour ne pas déclencher aussi la soumission de la note.

**Humanisé** : Déploiement de l'éditeur markdown et des mentions sur la modification groupée d'historique et la configuration des Tops.
**Technique** : `mbDesc` (modale d'édition groupée, `openBulkEditModal`), `newCategoryMeta` (ajout de Top) et `mNewMeta` côté catégorie uniquement (`openEditModal`, le champ reste un `<input>` texte simple côté joueur puisqu'il contient une URL d'avatar, pas une description) remplacés par `buildTextEditor()`. La logique « valeurs mixtes » de l'édition groupée (n'écraser la description que si elle a été modifiée) est préservée en dehors du composant, sur `aDesc.mixed`. Affichage de la description d'un Top (liste des Tops, Paramètres) passé à `renderMarkdown()`.

## [v1.3.0] - 2026-07-11

### Ajouté
**Humanisé** : Enrichissement interactif du graphique du Dashboard : avatars et écarts de classement au survol, isolation des courbes au clic dans la légende et ouverture du détail des scores.
**Technique** : Nouvel endpoint `apiGetFilteredLogs` (Code.gs) réutilisant `StorageService.getFullHistoryRowsCached()` via une nouvelle méthode `getFilteredFullLogs`. `AnalyticsService.getTrendData` expose désormais `granularity` (`day`/`week`/`month`), utilisé pour reconstruire la plage de dates exacte d'un point de courbe cliqué. `buildCustomTooltipPlugin` (Index.html) et `buildMobileTooltipPlugin` (Mobile.html) acceptent des `opts` (`titleIsPlayer`, `rowsArePlayers`, `rankedTotals`) pour injecter avatar et comparaison de rang. Nouveau handler `isolatableLegendOnClick` partagé sur les légendes des 6 types de graphique (hors Classement, volontairement exclu). Nouveaux modals `openChartDrilldown` (Index.html) / `openChartDrilldownMobile` (Mobile.html), volontairement consultatifs (le Dashboard ne sert pas l'édition). 4 nouveaux tests (`tests/dashboard-drilldown.test.js`).

### Corrigé
**Humanisé** : Correctifs ciblés sur le graphique du Dashboard : fiabilisation du détail radar/courbes sur mobile, isolation sur le donut et alignement des légendes et infobulles.
**Technique** : `Mobile.html` `renderRadarChart` réorganise désormais les données (labels=catégories, datasets=joueurs) comme `Index.html`, au lieu de passer `chartData` brut à Chart.js. `isolatableLegendOnClick` (Index.html + Mobile.html) gère le cas donut/pie (un seul dataset) via `chart.toggleDataVisibility(index)`/`getDataVisibility(index)` au lieu de `getDatasetMeta`. Légende du Classement explicitement non isolable des deux côtés (`onClick: undefined` si `stacked === undefined` côté Mobile.html, commentaire explicite côté Index.html). Le contexte de drill-down des Courbes mobile passe désormais `mFilterCategories`. Les calculs de date de fin de semaine/mois utilisent le formateur local `toDateStr()` au lieu de `toISOString().slice(0,10)` (qui décalait la date selon le fuseau horaire). `openChartDrilldown`/`openChartDrilldownMobile` utilisent un compteur `_drilldownRequestId` pour ignorer les réponses serveur obsolètes. `comparisonText`/`mComparisonText` retournent désormais `{text, neighbor}` pour permettre l'affichage de l'avatar du joueur cité.

## [v1.2.0] - 2026-07-10

### Ajouté
**Humanisé** : Ajout d'un bouton « ↩️ Annuler » sur chaque entrée éligible du journal d'audit pour restaurer l'état antérieur en un clic sur PC et mobile.
**Technique** : Nouvelle colonne cachée `Snapshot` (JSON) + `AnnuléLe` dans la feuille `AuditLog`. `AuditService.log()` accepte un 7ᵉ paramètre optionnel `snapshot` ; `AuditService.undo()`/`apiUndoAuditEntry()` implémentent un moteur générique de restauration (insert/delete/update/insertMany/deleteMany/updateMany) par recherche de ligne exacte, réutilisé par une vingtaine de sites d'appel. `apiGetAuditLog` expose `id`/`undoable` par entrée.

### Modifié
**Humanisé** : Clarification de la colonne différentielle du journal d'audit et simplification de l'interface en supprimant les contrôles superflus.
**Technique** : `AUDIT_NO_DIFF_ACTIONS` filtre le rendu de la colonne diff dans `renderAuditTable` (`Index.html`) et `auditCardHtml` (`Mobile.html`). Cellules Qui/Action/Entité redeviennent non interactives dans `Index.html` ; classe CSS `.audit-clickable-cell` retirée.

## [v1.1.0] - 2026-07-09

### Ajouté
**Humanisé** : Ajout de sept outils d'analyse et d'assainissement : détection des doublons et anomalies, joueurs inactifs, records, tendances et statistiques hebdomadaires.
**Technique** : 7 nouvelles fonctions backend (`apiDetectDuplicates`, `apiDetectOutlierScores`, `apiGetInactivePlayers`, `apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`) réutilisant `StorageService.getFullHistoryRowsCached()`. Détection des scores aberrants par médiane/écart absolu médian plutôt que moyenne/écart-type (une aberration fausse sa propre moyenne sur un petit échantillon). 8 nouveaux tests (`tests/outils-nouveaux.test.js`).

**Humanisé** : Sélection multiple rapide par simple cliquer-glisser à la souris ou au doigt dans l'Historique et les outils.
**Technique** : `enableDragMultiSelect(container, selector)`, délégation d'événements `mousedown`/`mouseover`/`touchmove`, appliqué à `#historyTableBody`, `#detectResults`, `#detectLegacyResults`.

**Humanisé** : Élargissement de la zone de sélection multiple par glisser à l'ensemble de la ligne pour faciliter la manipulation.
**Technique** : `enableDragMultiSelect` prend un `rowSelector` optionnel ; `checkboxAt()` retombe sur la ligne si le clic direct sur la case échoue, en excluant `button, a, input:not([type=checkbox]), select, textarea, .hist-desc-toggle`. Appliqué à `#historyTableBody` (`tr`) et aux entrées individuelles des groupes hérités (nouvelle classe `.legacy-entry-row`) — pas aux en-têtes `.detect-lot-head`, qui utilisent déjà tout leur clic pour déplier/replier.

**Humanisé** : Intégration directe des blocs statistiques (Records, Tendances, Jour actif, Duos) sous forme de graphiques interactifs sur le Dashboard.
**Technique** : Nouvelles cartes `#recordsCard`/`#trendsCard`/`#weekdayCard`/`#pairsCard` dans `tab-dashboard`. `renderTrends()`/`loadActiveWeekday()` utilisent Chart.js (`getChartColors()` pour le thème dark/light) au lieu de barres en `<div>`. Chargement unique au démarrage (`window.onload`), pas à chaque repaint de `_paintEntitiesUI` (ces stats ne dépendent pas des joueurs/catégories qui changent).

**Humanisé** : Suppression du raccourci redondant « Outils » dans la navigation pour centraliser les outils dans les Paramètres.
**Technique** : `tab-outils` retiré de `NAV_PAGES` (`Code.gs`, source unique partagée par les deux frontends). `Mobile.html` : Outils devient un 5ᵉ sous-onglet de Paramètres (`mSettingsSubTab === 'outils'`), `renderOutilsShell()` cible `#mSettingsBody` au lieu d'un `#tab-outils` retiré du DOM. Tests `nav-pages.test.js` mis à jour (6 onglets).

**Humanisé** : Organisation de l'onglet Outils en cartes repliables individuelles pour une meilleure lisibilité.
**Technique** : Chaque section de `#stab-tools` devient un `.card.card-collapsible` avec `makeCollapsible(...)`.

**Humanisé** : Génération dynamique de la liste des filtres du journal d'audit et affichage visuel des pastilles de couleur modifiées.
**Technique** : `apiGetAuditActionTypes()` remplace la liste `<option>` figée dans le HTML. `auditDiffValue()` détecte les valeurs hexadécimales et ajoute un `.audit-color-dot`.

**Humanisé** : Parité des fonctionnalités sur mobile : arrivée du journal d'audit, des cartes statistiques sur le Dashboard et de la gestion complète des commentaires.
**Technique** : `Mobile.html` — `renderHistoryShell()` gagne des sous-onglets `mHistorySubTab` (`entries`/`audit`) ; `renderAuditShell()`/`loadAuditTab()` consomment `apiGetAuditLog()` en lecture seule. `renderDashboardShell()` ajoute 4 `m-accordion` chargées à la demande via `bindStatAccordion()` (`apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`). `renderPhrasesSettings()` ajoute 3 boutons appelant `apiSetActivePhrasePreset` (création), `apiRenamePreset`, `apiDeletePreset`.

**Humanisé** : Remplacement de l'en-tête mobile par un rail de navigation latéral épuré et dépliable.
**Technique** : `Mobile.html` — `.m-side-nav` remplace `.m-header` + `.m-bottom-nav`. `renderSideNav()` remplace `renderBottomNav()`.

**Humanisé** : Allègement de l'interface ordinateur par la suppression des anciens modes d'affichage mobile obsolètes.
**Technique** : Retrait de `.mobile-drawer`, `#drawerNavList`, `body[data-mode="mobile"]` et de tout le JS associé (`openDrawer`/`closeDrawer`) dans `Index.html`.

### Corrigé
**Humanisé** : Correction du positionnement des listes déroulantes et adaptation automatique de la hauteur des fenêtres modales à l'écran.
**Technique** : Les `.rs-panel` (rich-select) sont désormais réattachés à `document.body` en `position:fixed`, positionnés dynamiquement (avec bascule vers le haut si pas assez de place en dessous) — au lieu d'un `position:absolute` imbriqué dans la modale, sujet au découpage par tout `overflow` ancêtre. `.modal-box` passe à `max-height:88vh; overflow-y:auto`.

**Humanisé** : Mise à jour instantanée des notes sans rechargement complet de la page lors des ajouts, modifications et suppressions.
**Technique** : `apiAddNote` renvoie désormais la note créée ; les 4 points d'appel (ajout ×2, édition, suppression) patchent `_allNotesRaw` localement et appellent `renderNotesBlocks()` au lieu de refaire un aller-retour serveur complet (`loadNotes()`).

**Humanisé** : Correction du lien de bascule entre versions PC et mobile et sécurisation du routage pour fiabiliser le chargement initial.
**Technique** : Deux bugs cumulés dans `window.top.location.href`. (1) Une redirection automatique sans clic utilisateur, bloquée sans exception par le bac à sable Apps Script (`SecurityError` non rattrapée, plantait `window.onload` avant `loadEntities()`) — supprimée entièrement, `Index.html` reste la version par défaut. (2) Une URL relative se résolvait contre l'origine du bac à sable (`googleusercontent.com`) plutôt que contre l'adresse réelle du site — le bouton devient un vrai `<a target="_top">`, avec `href` construit à partir de `ScriptApp.getService().getUrl()` injecté côté serveur (`doGet` passe à `HtmlService.createTemplateFromFile(...).evaluate()`). L'appel à `getService()` est protégé par un `try/catch` (dégradation silencieuse du bouton plutôt que blocage de la page si l'autorisation venait à manquer).

**Humanisé** : Restauration des pastilles de couleur des Tops dans la liste des règles de points automatiques.
**Technique** : `renderAutoRules` construit désormais la pastille en DOM (`categoryColor`/`catIcon`/`tint`), comme partout ailleurs dans l'app, au lieu d'un `innerHTML` en texte simple.

**Humanisé** : Désactivation de la fermeture accidentelle des fenêtres modales lors d'un clic en dehors de leur cadre.
**Technique** : Retrait des gestionnaires `click` sur `#modalBackdrop`, `#bulkImportModal`, `#identityPwdModal` (`Index.html`) et `#mModalBackdrop` (`Mobile.html`) qui fermaient sur `e.target === backdrop`.

**Humanisé** : Suppression des rafraîchissements intempestifs du Barème et des Notes lors de l'ajout d'un joueur ou d'un Top.
**Technique** : `_paintEntitiesUI()` appelait `loadBaremeSettings()` (squelette + fetch complet) et `loadNotes()` (idem) à chaque passage. Remplacés par un rendu local à partir des données déjà en cache (`renderBaremeSettings(baremeEntries)`, `renderNotesUI(_allNotesRaw)`) tant qu'un premier chargement a déjà eu lieu.

**Humanisé** : Possibilité de dissocier individuellement les entrées sélectionnées au sein des groupes hérités et d'ignorer un groupe.
**Technique** : Ajout de cases à cocher par entrée + action "Dissocier les entrées cochées" (`apiRemoveFromGroup`), et d'une action "Ignorer ce groupe" persistée en `localStorage`.

### Retiré
**Humanisé** : Retrait des mentions du terme anglophone « event » dans les libellés du Dashboard.

## [v1.0.0] - 2026-07-08

### Ajouté
**Humanisé** : Déploiement automatique et instantané des mises à jour vers Google Apps Script via GitHub Actions avec synchronisation multi-cibles.
**Technique** : Ajout d'un workflow GitHub Actions (`.github/workflows/deploy-gas.yml`) qui exécute `clasp push`, retire l'ancien déploiement, en crée un nouveau, et met à jour le lien short.io via son API (`.github/scripts/deploy-gas.sh`), pour chaque cible listée dans `deploy-targets.json`. La description de chaque déploiement Apps Script reprend maintenant le message du commit (tronqué) au lieu du hash brut.

### Corrigé
**Humanisé** : Correction du déploiement automatisé en excluant les fichiers de tests pour éviter les collisions de code sur Apps Script.
**Technique** : `clasp push` n'avait pas de filtre et poussait tout le dépôt, y compris `tests/`. Apps Script exécute tous les fichiers `.gs`/`.js` d'un projet dans un seul scope global partagé ; les 12 fichiers de test déclarant chacun `const { loadGas } = require('./harness')` en tête de fichier entraient en collision (identifiant dupliqué), cassant l'exécution de tout le projet déployé. Ajout de `.claspignore` pour ne pousser que `Code.gs`, `AutoPoints.gs`, `Index.html`, `Mobile.html` et `appsscript.json`.

**Humanisé** : Correction d'un blocage au chargement en servant directement l'interface principale et en mémorisant le choix de la version mobile.
**Technique** : `doGet()` sans `?view=` servait une mini-page de redirection auto-détectant l'appareil puis se rechargeant elle-même via `window.location.href`. Dans l'iframe sandbox du déploiement réel, Google bloque silencieusement toute navigation déclenchée par du script sans geste utilisateur réel — confirmé en testant qu'une navigation tapée à la main vers `?view=desktop` fonctionne, contrairement à la redirection automatique, que ce soit servie comme chaîne brute (`createHtmlOutput`) ou comme fichier (`createHtmlOutputFromFile`, tenté en premier et insuffisant). Suppression de cette page intermédiaire : `doGet()` sert directement `Index.html` par défaut (et sur toute valeur `?view=` non reconnue), `Mobile.html` uniquement sur `?view=mobile` explicite. Le bouton de bascule existant reste fonctionnel car un clic constitue un geste utilisateur valide pour le sandbox.

## [v0.9.30] - 2026-07-07

### Modifié
**Humanisé** : Configuration de l'accès à l'application web en mode anonyme public.
**Technique** : Ajustement des paramètres d'accès Apps Script.

## [v0.9.29] - 2026-07-06

### Ajouté
**Humanisé** : Intégration du bouton de bascule mobile/PC directement dans le menu tiroir de navigation.
**Technique** : Intégration du composant de bascule dans le menu mobile.

## [v0.9.28] - 2026-07-05

### Supprimé
**Humanisé** : Suppression de la page intermédiaire de redirection au profit d'un accès direct à l'application.
**Technique** : Simplification du routage `doGet()`.

## [v0.9.27] - 2026-07-04

### Ajouté
**Humanisé** : Mise en place d'une page de démarrage dédiée pour gérer la détection et la redirection mobile/PC.
**Technique** : Rendu `Bootstrap.html` intermédiaire.

## [v0.9.26] - 2026-07-03

### Modifié
**Humanisé** : Restriction de l'accès à l'application web aux seuls utilisateurs connectés.
**Technique** : Modification des permissions Apps Script.

## [v0.9.25] - 2026-07-02

### Ajouté
**Humanisé** : Centralisation du registre des pages et routage automatique vers la version mobile ou bureau.
**Technique** : Module de navigation partagé backend/frontend.

## [v0.9.24] - 2026-07-01

### Ajouté
**Humanisé** : Possibilité d'extraire une entrée d'un lot et détection automatique des identifiants de groupes hérités.
**Technique** : `apiRemoveFromGroup` et détection des identifiants `groupId` hérités.

## [v0.9.23] - 2026-06-30

### Ajouté
**Humanisé** : Introduction d'une interface mobile dédiée avec menu tiroir et affichage de l'historique sous forme de cartes.
**Technique** : Mise en page responsive mobile dédiée et mode tiroir.

## [v0.9.22] - 2026-06-29

### Modifié
**Humanisé** : Configuration des autorisations OAuth requises pour Google Sheets et les requêtes externes.
**Technique** : `appsscript.json` — ajout des `oauthScopes` (`spreadsheets`, `script.external_request`).

## [v0.9.21] - 2026-06-28

### Corrigé
**Humanisé** : Correction du calcul des semaines d'attribution des règles hebdomadaires et filtrage des entités supprimées.
**Technique** : Ajustement du moteur de règles `AutoPoints.gs`.

## [v0.9.20] - 2026-06-27

### Ajouté
**Humanisé** : Implémentation du moteur de règles de points automatiques avec planification quotidienne, hebdomadaire et mensuelle.
**Technique** : Création du module `AutoPoints.gs` et gestion des déclencheurs temporels.

## [v0.9.19] - 2026-06-26

### Ajouté
**Humanisé** : Ajout d'un état de tri neutre dans les tableaux pour rétablir l'ordre d'insertion d'origine.
**Technique** : Gestion de l'état de tri neutre/défaut dans les tableaux.

## [v0.9.18] - 2026-06-25

### Ajouté
**Humanisé** : Réorganisation des lignes de saisie en lot par glisser-déposer et optimisation du rafraîchissement global.
**Technique** : Implémentation du Drag & Drop natif JS sur la grille de saisie.

## [v0.9.17] - 2026-06-24

### Ajouté
**Humanisé** : Protection optionnelle de l'identité des joueurs par mot de passe vérifié côté serveur.
**Technique** : Validation du mot de passe joueur dans `Code.gs`.

## [v0.9.16] - 2026-06-23

### Modifié
**Humanisé** : Mise en cache serveur de l'historique et des diagnostics pour accélérer les temps de réponse.
**Technique** : Optimisation de `StorageService.getFullHistoryRowsCached()`.

## [v0.9.15] - 2026-06-22

### Ajouté
**Humanisé** : Personnalisation du titre et du logo de l'application via une feuille de configuration dédiée.
**Technique** : Création du service `SettingsSheetService` dans `Code.gs`.

## [v0.9.14] - 2026-06-21

### Modifié
**Humanisé** : Affichage prioritaire des phrases d'accroche pour les trois premières places du podium.
**Technique** : Tri prioritaire du podium des phrases d'accroche.

## [v0.9.13] - 2026-06-20

### Supprimé
**Humanisé** : Suppression du plugin d'émojis superposés sur les graphiques pour alléger l'affichage.
**Technique** : Allègement des plugins Chart.js.

## [v0.9.12] - 2026-06-19

### Corrigé
**Humanisé** : Préservation du fuseau horaire local lors de la manipulation des dates et ajout d'avatars en filigrane sur les notes.
**Technique** : Normalisation des objets `Date` à 12:00 locale pour éviter les décalages UTC.

## [v0.9.11] - 2026-06-18

### Ajouté
**Humanisé** : Création du journal d'audit pour enregistrer toutes les modifications de barèmes, couleurs et joueurs.
**Technique** : Création du système `AuditLog` dans `Code.gs`.

## [v0.9.10] - 2026-06-17

### Modifié
**Humanisé** : Ajout d'une pulsation visuelle sur le sélecteur d'identité et amélioration des champs de description.
**Technique** : Micro-animations CSS `@keyframes pulse`.

## [v0.9.9] - 2026-06-16

### Modifié
**Humanisé** : Intégration des listes déroulantes enrichies avec avatars et couleurs sur le tableau de saisie.
**Technique** : Déploiement des composants Rich-Select sur la grille de saisie.

## [v0.9.8] - 2026-06-15

### Ajouté
**Humanisé** : Création d'un composant de sélection enrichi et prise en charge de la modification groupée dans l'Historique.
**Technique** : `apiUpdateBulkEntries` et composant UI `rich-select`.

## [v0.9.7] - 2026-06-14

### Modifié
**Humanisé** : Regroupement du graphique dans un conteneur unique et restructuration de la configuration du Dashboard.
**Technique** : Refactorisation de la mise en page du Dashboard.

## [v0.9.6] - 2026-06-13

### Ajouté
**Humanisé** : Intégration des avatars des joueurs dans les infographies exportées du graphique Donut.
**Technique** : Intégration du rendu d'images avatars sur le Canvas d'exportation HD.

## [v0.9.5] - 2026-06-12

### Modifié
**Humanisé** : Retouches visuelles des boutons de barème rapide et réorganisation de l'en-tête du graphique.
**Technique** : Retouches CSS sur les pilules de barème rapide.

## [v0.9.4] - 2026-06-11

### Ajouté
**Humanisé** : Boutons de barème rapide pour insérer directement les points et actions dans la saisie.
**Technique** : Boutons d'insertion rapide de barème.

## [v0.9.3] - 2026-06-10

### Ajouté
**Humanisé** : Enregistrement de l'auteur de chaque saisie dans l'historique.
**Technique** : Enregistrement de l'auteur de la saisie dans `Code.gs`.

## [v0.9.2] - 2026-06-09

### Modifié
**Humanisé** : Modernisation des menus et cartes repliables, avec avatars empilés dans l'historique groupé.
**Technique** : Module d'accordéons repliables `makeCollapsible`.

## [v0.9.1] - 2026-06-08

### Ajouté
**Humanisé** : Sélecteur d'identité « Qui suis-je ? » et affichage discret de l'avatar sur les lignes de saisie.
**Technique** : Persistance de l'identité de l'utilisateur actif.

## [v0.9.0] - 2026-06-07

### Ajouté
**Humanisé** : Sécurisation des écritures simultanées pour éviter tout conflit de données.
**Technique** : Verrouillage de concurrence dans `Code.gs`.

## [v0.8.9] - 2026-06-06

### Modifié
**Humanisé** : Refonte du podium des commentaires et mémorisation du preset actif côté serveur.
**Technique** : Persistance du preset actif de phrases.

## [v0.8.8] - 2026-06-05

### Corrigé
**Humanisé** : Affichage des phrases pour tous les tops filtrés et maintien du clic sur les descriptions d'historique.
**Technique** : Correction du filtrage multi-tops des phrases.

## [v0.8.7] - 2026-06-04

### Corrigé
**Humanisé** : Exclusion correcte du preset par défaut dans la liste des presets personnalisés.
**Technique** : Filtrage des presets dans `Code.gs`.

## [v0.8.6] - 2026-06-03

### Ajouté
**Humanisé** : Nouveaux pools de phrases par catégorie et refonte visuelle des paramètres.
**Technique** : Organisation sous-onglets dans `Index.html`.

## [v0.8.5] - 2026-06-02

### Ajouté
**Humanisé** : Possibilité de renommer les presets de phrases et affichage des phrases de secours dans l'éditeur.
**Technique** : `apiRenamePreset` dans `Code.gs`.

## [v0.8.4] - 2026-06-01

### Ajouté
**Humanisé** : Personnalisation des phrases d'accroche organisées par presets et par catégories.
**Technique** : Service backend de gestion de presets de phrases.

## [v0.8.3] - 2026-05-31

### Modifié
**Humanisé** : Amélioration du champ de description par ligne et déplacement de la carte Commentaires dans le Dashboard.
**Technique** : Réorganisation layout Dashboard.

## [v0.8.2] - 2026-05-30

### Ajouté
**Humanisé** : Nouvelle carte de commentaires avec podium et paramètres associés.
**Technique** : Composant UI de commentaires dynamique.

## [v0.8.1] - 2026-05-29

### Modifié
**Humanisé** : Disposition verticale plus compacte à deux rangées par ligne de saisie.
**Technique** : Mise en page CSS flex/grid à deux niveaux.

## [v0.8.0] - 2026-05-28

### Ajouté
**Humanisé** : Refonte des fenêtres modales, phrases animées et infobulles enrichies sur les graphiques.
**Technique** : Module d'infobulles Chart.js sur-mesure.

## [v0.7.8] - 2026-05-27

### Corrigé
**Humanisé** : Correction du décalage d'un jour lié au fuseau horaire sur les dates.
**Technique** : Calcul d'offset horaire local.

## [v0.7.7] - 2026-05-26

### Modifié
**Humanisé** : Réintégration des styles CSS dans la page principale pour simplifier le chargement.
**Technique** : Regroupement monobloc pour Apps Script.

## [v0.7.6] - 2026-05-25

### Modifié
**Humanisé** : Séparation des feuilles de style pour clarifier l'organisation du code.
**Technique** : Séparation des fichiers frontend.

## [v0.7.5] - 2026-05-24

### Modifié
**Humanisé** : Sélection des joueurs par puces cliquables avec avatars sur le graphique Donut.
**Technique** : Puces de sélection interactive du graphique Donut.

## [v0.7.4] - 2026-05-23

### Ajouté
**Humanisé** : Recherche textuelle, regroupement visuel des entrées et chargement accéléré de l'historique.
**Technique** : Recherche textuelle et regroupement d'entrées.

## [v0.7.3] - 2026-05-22

### Corrigé
**Humanisé** : Détection fiabilisée des lots répartis sans faux doublons.
**Technique** : Algorithme de détection des chaînes chronologiques.

## [v0.7.2] - 2026-05-21

### Ajouté
**Humanisé** : Regroupement automatique des entrées saisies en lot sur plusieurs dates.
**Technique** : Champ `groupId` dans le contrat d'API.

## [v0.7.1] - 2026-05-20

### Corrigé
**Humanisé** : Correction d'une erreur d'affichage lors du regroupement des lots.
**Technique** : Nettoyage des portées de variables JS.

## [v0.7.0] - 2026-05-19

### Modifié
**Humanisé** : Regroupement réversible des lots répartis sans perte d'historique.
**Technique** : Gestion d'ID de groupe réversible sans perte de lignes.

## [v0.6.9] - 2026-05-18

### Ajouté
**Humanisé** : Fusion automatique des lots répartis en une seule entrée totalisée.
**Technique** : Fusion d'entrées agrégées.

## [v0.6.8] - 2026-05-17

### Ajouté
**Humanisé** : Détection des saisies répétées réparties sur plusieurs jours.
**Technique** : `apiDetectDistributedLots` dans `Code.gs`.

## [v0.6.7] - 2026-05-16

### Ajouté
**Humanisé** : Ajout d'un champ description par entrée d'historique, modifiable au cas par cas ou en masse.
**Technique** : Colonne description dans l'Historique.

## [v0.6.6] - 2026-05-15

### Ajouté
**Humanisé** : Suppression multiple dans l'historique et affichage du barème organisé par sections.
**Technique** : `apiDeleteHistoryEntries`.

## [v0.6.5] - 2026-05-14

### Modifié
**Humanisé** : Organisation du barème par Top avec interface de gestion dédiée dans les paramètres.
**Technique** : Reconstitution de la structure du barème.

## [v0.6.4] - 2026-05-13

### Ajouté
**Humanisé** : Système de barème personnalisable pour associer des points à chaque action.
**Technique** : Service de gestion des barèmes.

## [v0.6.3] - 2026-05-12

### Modifié
**Humanisé** : Sauvegarde des couleurs personnalisées directement sur le serveur.
**Technique** : `apiSetColor` et stockage Google Sheet.

## [v0.6.2] - 2026-05-11

### Ajouté
**Humanisé** : Couleurs personnalisables par joueur et par catégorie sur tous les graphiques.
**Technique** : Application dynamique de couleurs Chart.js.

## [v0.6.1] - 2026-05-10

### Ajouté
**Humanisé** : Sélection des jours de la semaine lors de la génération de saisies en lot.
**Technique** : Filtre de jours de la semaine dans la saisie.

## [v0.6.0] - 2026-05-09

### Ajouté
**Humanisé** : Affichage du total global par joueur tous tops confondus et filtre par jours pour les lots.
**Technique** : Calcul du total global multi-categories.

## [v0.5.9] - 2026-05-08

### Modifié
**Humanisé** : Éditeur de dates dédié avec plages temporelles prédéfinies.
**Technique** : Composant d'édition de plages temporelles.

## [v0.5.8] - 2026-05-07

### Ajouté
**Humanisé** : Option Répéter / Répartir activable individuellement sur chaque ligne de saisie.
**Technique** : Option de répétition par ligne.

## [v0.5.7] - 2026-05-06

### Ajouté
**Humanisé** : Création automatique de la feuille Notes et choix d'une date distincte par ligne de saisie.
**Technique** : Auto-initialisation de la feuille Notes.

## [v0.5.6] - 2026-05-05

### Modifié
**Humanisé** : Graphiques de tendances adaptatifs (jour, semaine, mois) sur 30 jours par défaut.
**Technique** : `getTrendData` adaptatif.

## [v0.5.5] - 2026-05-04

### Modifié
**Humanisé** : Harmonisation visuelle des colonnes et boutons dans le panneau de filtres.
**Technique** : Harmonisation des colonnes de filtres.

## [v0.5.4] - 2026-05-03

### Modifié
**Humanisé** : Remplacement des alertes doublons par la gestion des notes et diagnostic de santé simplifié.
**Technique** : `getDataHealth` simplifié.

## [v0.5.3] - 2026-05-02

### Ajouté
**Humanisé** : Icônes emoji pour chaque catégorie et adoption du terme « Tops » dans toute l'interface.
**Technique** : Gestion des emojis de catégories.

## [v0.5.2] - 2026-05-01

### Ajouté
**Humanisé** : Mode « Répartir / Répéter » pour étaler facilement une saisie sur plusieurs dates.
**Technique** : Algorithme d'étalement de dates.

## [v0.5.1] - 2026-04-30

### Ajouté
**Humanisé** : Ajout d'une feuille Notes et affichage indicatif des doublons sans suppression automatique.
**Technique** : Module Notes et détection sans suppression.

## [v0.5.0] - 2026-04-29

### Ajouté
**Humanisé** : Optimisations mobiles et support PWA pour un meilleur confort tactile.
**Technique** : Meta tags PWA & viewport safe-area.

## [v0.4.5] - 2026-04-28

### Corrigé
**Humanisé** : Correction de l'horodatage des saisies pour éviter les décalages de date.
**Technique** : Horodatage fixé à 12:00:00.

## [v0.4.4] - 2026-04-27

### Corrigé
**Humanisé** : Contrôle strict des valeurs saisies pour les points et multiplicateurs.
**Technique** : Validation d'entrées numériques strictes.

## [v0.4.3] - 2026-04-26

### Modifié
**Humanisé** : Pagination de l'historique plus rapide et alignée sur les lignes réelles.
**Technique** : Indexation 1-based directe sur Google Sheet.

## [v0.4.2] - 2026-04-25

### Modifié
**Humanisé** : Optimisation des performances du module de configuration grâce à un cache mémoire.
**Technique** : Cache mémoire d'exécution.

## [v0.4.1] - 2026-04-24

### Modifié
**Humanisé** : Nettoyage et allègement global des styles de l'interface.
**Technique** : Optimization CSS.

## [v0.4.0] - 2026-04-23

### Modifié
**Humanisé** : Chargement optimisé des logs et fiabilisation du calcul des points par défaut.
**Technique** : `apiGetFilteredLogs` & `getAllLogs`.

## [v0.3.4] - 2026-04-22

### Modifié
**Humanisé** : Nettoyage et fiabilisation du filtrage et de l'export des données.
**Technique** : Refactorisation des fonctions d'exportation.

## [v0.3.3] - 2026-04-21

### Ajouté
**Humanisé** : Filtres avancés sur l'historique et exports aux formats CSV et Excel (XLSX).
**Technique** : Intégration des bibliothèques d'export CSV/XLSX.

## [v0.3.2] - 2026-04-20

### Ajouté
**Humanisé** : Validation renforcée des actions et mise en cache pour accélérer la configuration.
**Technique** : Valideurs de types stricts.

## [v0.3.1] - 2026-04-19

### Modifié
**Humanisé** : Interface mobile-first avec boutons tactiles adaptés et navigation horizontale fluide.
**Technique** : Mobile-first CSS media queries.

## [v0.3.0] - 2026-04-18

### Corrigé
**Humanisé** : Correction d'une anomalie lors de la lecture et du tri des logs.
**Technique** : Immuabilité des tableaux de logs.

## [v0.2.3] - 2026-04-17

### Corrigé
**Humanisé** : Ajustements responsifs et correction du changement d'onglet sur Safari.
**Technique** : Safari touch event fixes.

## [v0.2.2] - 2026-04-16

### Ajouté
**Humanisé** : Sélecteur de joueur avec affichage dynamique de l'avatar dans la saisie en lot.
**Technique** : Composant de sélection d'avatars.

## [v0.2.1] - 2026-04-15

### Ajouté
**Humanisé** : Avatars automatiques pour les joueurs sans photo et correction de l'édition des métadonnées.
**Technique** : Génération SVG d'avatars de secours.

## [v0.2.0] - 2026-04-14

### Ajouté
**Humanisé** : Citations de secours automatiques en cas d'indisponibilité de l'IA.
**Technique** : Citations de secours en mode hors-ligne.

## [v0.1.9] - 2026-04-13

### Modifié
**Humanisé** : Amélioration de la génération des citations avec le modèle Gemini 2.0 Flash.
**Technique** : Migration endpoint Gemini 2.0 Flash.

## [v0.1.8] - 2026-04-12

### Ajouté
**Humanisé** : Ajout des avatars joueurs, descriptions de catégories et génération de citations par IA.
**Technique** : Intégration API Gemini & métadonnées entités.

## [v0.1.7] - 2026-04-11

### Modifié
**Humanisé** : Refonte visuelle complète de l'interface (cartes, navigation, saisie et notifications).
**Technique** : Nouveau système de cartes et notifications toasts.

## [v0.1.6] - 2026-04-10

### Modifié
**Humanisé** : Calcul dynamique et instantané des statistiques par joueur et par catégorie.
**Technique** : Dynamic aggregation pipeline.

## [v0.1.5] - 2026-04-09

### Modifié
**Humanisé** : Enregistrement groupé des scores pour des temps de sauvegarde considérablement réduits.
**Technique** : `setValues()` par blocs.

## [v0.1.4] - 2026-04-08

### Ajouté
**Humanisé** : Saisie en lot avec calcul automatique du score (points × multiplicateur).
**Technique** : Multiplicateur de saisie en lot.

## [v0.1.3] - 2026-04-07

### Modifié
**Humanisé** : Traduction en français de l'ensemble des messages d'erreur.
**Technique** : Localisation française des erreurs `Code.gs`.

## [v0.1.2] - 2026-04-06

### Ajouté
**Humanisé** : Gestion des joueurs et catégories avec mise à jour automatique de l'historique.
**Technique** : Mise à jour en cascade Google Sheet.

## [v0.1.1] - 2026-04-05

### Corrigé
**Humanisé** : Configuration dynamique de la feuille Google Sheets sans identifiant codé en dur.
**Technique** : `PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')`.

## [v0.1.0] - 2026-04-01

### Ajouté
**Humanisé** : Lancement officiel de l'application Tops des Tops avec architecture modulaire.
**Technique** : Architecture initiale modulaire en 3 services Google Apps Script.
