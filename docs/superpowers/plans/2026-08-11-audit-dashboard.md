# Passe 1 — 📊 Dashboard

> Protocole : [`2026-08-11-audit-onglet-par-onglet.md`](2026-08-11-audit-onglet-par-onglet.md). Les contraintes globales de ce document s'appliquent à toutes les tâches ci-dessous.

**État :** ✅ passe livrée en v3.8.2 — `npm run verify` vert (152 tests), corrections re-vérifiées au navigateur après redémarrage propre du serveur de prévisualisation.
**Ligne de base :** 140 tests verts, 0 erreur console au chargement (relevé du 2026-08-11)

---

## Carte — phase 1

### HTML — `Index.html`, l. 4156-4299

Sept blocs, dans l'ordre du DOM :

| Bloc | Identifiants | Contrôles |
|------|--------------|-----------|
| Bascule d'univers | `dashboardUniverseSeg`, `univMainBtn`, `univAltBtn`, `univIndicator`, `dashAltAddBtn` | 3 boutons |
| Podium | `phrasesCard`, `phrasesList`, `phrasesEmptyState`, `phrasesRerollBtn` | 1 bouton + repli de carte |
| Filtres croisés | `filtersCard`, `playerChips`, `categoryChips`, `rangePresets`, `startDate`, `endDate`, `clearDatesBtn`, `applyFiltersBtn` | 2 rangées de pastilles + raccourcis + 2 dates + 2 boutons |
| Graphique | `chartCard`, `chartTitle`, `chartTypeBar` (6 types), `chartControls`, `donutPlayerWrap`/`donutPlayerChips`, `chartSkeleton`, `chartState`/`chartStateMsg`/`chartStateRetry`, `chartWrapper`/`mainChart`, `chartCustomTooltip`, `topStatsStrip` | 6 types + contrôles dynamiques |
| Exports | `exportInfographicBtn`, `exportAllBtn`, `[data-export="csv"]`, `[data-export="xlsx"]` | 4 boutons |
| Statistiques (hub) | `statsHubCard`, `statsHubTabs` (5 onglets : records, trends, weekday, pairs, mentions) | 5 sous-onglets |
| Panneau Tendances | `trendsScopeToggle` (Par Top / Par joueur), `trendsChart`, `trendsEmpty` | 2 boutons de portée |

Autres canevas du hub : `weekdayChart`. Conteneurs de résultats : `recordsResults`, `pairsResults`, `mentionsResults`.

### JS frontend — fonctions principales

| Fonction | Ligne | Rôle |
|----------|-------|------|
| `loadQuickStats()` | 5813 | bandeau de stats rapides |
| `renderPhrasesCard(sortedRows)` | 7026 | rendu du Podium à partir du classement courant |
| `applyFilters(onDone)` | 9763 | point d'entrée : lit les filtres, appelle `apiGetFilteredData`, dispatche vers le rendu |
| `renderChartControls(type)` | 9874 | contrôles spécifiques au type de graphique |
| `showChartState(state, message)` | 10375 | états vide / erreur / masqué du graphique |
| `renderChart(data, type)` | 10408 | rendu des 5 types hors Courbes |
| `renderTrendChart(trendData)` | 10772 | rendu du type Courbes |
| `refreshDashboardStats()` | 17029 | orchestre les 5 panneaux du hub |
| `loadTrends()` | 17093 | panneau Tendances |

Câblage des écouteurs : l. 15991-15992 (filtres), 16023-16025 (univers), 17338-17346 (podium, exports), 17536 (portée des tendances).

### Backend — `Code.gs`

`apiGetFilteredData` (graphique principal) · `apiGetQuickStats` · `apiGetPlayerRecords` · `apiGetTrends` · `apiGetActiveWeekday` · `apiGetTopPlayerCategoryPairs` · `apiGetMentionStats` · `apiGetPhrases` · `apiGetActivePhrasePreset`

Les cinq appels du hub prennent `activeDashboardUniverse` en argument — la bascule Principaux/Alternatifs traverse donc jusqu'au backend.

### Tests existants couvrant la zone

`tests/analytics.test.js` · `tests/quick-stats.test.js` · `tests/dashboard-drilldown.test.js` · `tests/mention-detection.test.js` · `tests/frontend-guards.test.js`

### Historique — fragilités déjà signalées

Le Dashboard est l'onglet le plus souvent corrigé du projet. Trois défauts distincts en deux versions consécutives (v3.7.0 et v3.8.0) :
- squelettes de chargement sans fin (`refreshBaremeForTop()` appelée hors de sa portée) ;
- texte « aucune donnée » peint dans le canevas avec une variable CSS, donc invisible — **corrigé deux fois**, dans `renderChart()` puis dans `renderTrendChart()` ;
- exceptions avalées par `google.script.run`.

Le deuxième point est le signal le plus fort : le même défaut est réapparu dans une fonction voisine parce que la première correction n'avait pas été généralisée. **À traiter en priorité de l'axe 5 : chercher toute autre occurrence du motif « peindre du texte dans un canevas ».**

### Écart constaté avec `context.md`

`context.md` §5 décrit le Dashboard comme : « Filtres croisés, sélecteur de graphique, graphique principal, card Commentaires, puis en bas : Records, Tendances, Jour le plus actif, Duo le plus fréquent ».

La réalité comporte en plus : la **bascule d'univers** (Tops Principaux / Alternatifs) tout en haut, la card **Podium** (l'ancienne « card Commentaires », renommée) placée **avant** les filtres et non après, et un **cinquième** panneau de statistiques (**Mentions**). Les quatre panneaux de bas de page sont regroupés dans un hub à onglets, pas empilés.

→ `context.md` §5 est à corriger en fin de passe.

---

## Relevés — phase 2

### R1 — Défaut d'instrument, corrigé avant de poursuivre (livré en v3.8.1)

Premier passage sur les 6 types de graphique : `Courbes` et `Classement` affichaient
« Le graphique n'a pas pu être chargé : non exposée par le harness : apiGetTrendData / apiGetPlayerTotals ».

Vérification : les deux fonctions **existent** dans `Code.gs` (l. 2219 et 2227). Le défaut était dans le harness, pas dans l'application. Mesure de l'écart complet : sur les **78** fonctions appelées par `Index.html`, **23** n'étaient pas exposées par `tests/harness.js` — soit 30 % de la surface de l'application invisible à l'audit, touchant le Dashboard, l'Historique, les Notes, le Barème, les phrases et le tchat.

Corrigé : découverte automatique des endpoints par balayage, plus de liste manuelle. Test de non-régression ajouté. 141 tests verts.

**Leçon :** un défaut observé pendant une sonde doit être imputé avant d'être compté. Trois des six types de graphique auraient été signalés à tort comme cassés.

### R2 — Les 6 types de graphique, après réparation de l'instrument

| Type | Erreurs | Rendu | Titre |
|------|---------|-------|-------|
| Empilé | 0 | ✅ | 📈 Graphiques |
| Groupé | 0 | ✅ | 📈 Graphiques |
| Courbes | 0 | ✅ | 📈 Évolution temporelle |
| Radar | 0 | ✅ | 🕸️ Radar des scores |
| Donut | 0 | ✅ | 🍩 Répartition par Top |
| Classement | 0 | ✅ | 🏆 Total global |

Aucune erreur console, aucun état d'erreur affiché, `chartWrapper` visible sur les six.

**À instruire :** `Empilé` et `Groupé` partagent le titre générique « 📈 Graphiques » alors que les quatre autres ont un titre spécifique — le titre ne distingue donc pas deux des six vues.

### R3 — Bouton « Appliquer » des filtres croisés : casse le graphique à chaque clic (CONFIRMÉ, sévère)

`document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters)` (Index.html:15991) câble le bouton **directement** sur `applyFilters(onDone)`. Le listener reçoit l'objet `Event` du clic comme premier argument, qui devient `onDone`. La fonction fait `if (onDone) onDone();` (ex. l.9840) sans vérifier que c'est bien une fonction → `TypeError: onDone is not a function`.

Reproduit dans le navigateur : après un clic sur Appliquer, le graphique charge correctement (`showChartWrapper()` s'exécute), puis l'exception est catchée par le `try/catch` générique de `callServer()` (Index.html:8588-8594), qui déclenche le chemin d'erreur — celui-ci **écrase l'affichage réussi** et montre à l'utilisateur : « Le graphique n'a pas pu être chargé : onDone is not a function », alors que les données ont bien été chargées. Confirmé aussi via `window.__frontErrors`.

Tous les autres appelants de `applyFilters()` (bascule d'univers, effacer les dates, changement de type de graphique) l'appellent sans argument ou avec un vrai callback — seul ce branchement direct est cassé. C'est **le bug le plus grave relevé sur le Dashboard** : il touche l'action la plus fréquente de l'onglet (Axe 1 et Axe 4).

**Mise à jour (phase 2, sonde du cas vide) :** le même défaut existe à deux autres endroits, avec le même symptôme exact (`onDone is not a function`) :
- `Index.html:15997` — `document.getElementById('startDate').addEventListener('change', applyFilters)`
- `Index.html:15998` — `document.getElementById('endDate').addEventListener('change', applyFilters)`

Reproduit en changeant la date de début/fin des filtres croisés directement (sans passer par le bouton Appliquer) : même erreur, même écran d'échec affiché par-dessus des données pourtant chargées. **Trois branchements cassés, pas un seul** — la correction doit couvrir les trois (Axe « Exhaustivité » de `context.md` §7).

**Piste de correction :** `addEventListener('click'/'change', () => applyFilters())` sur les trois — cohérent avec le câblage des autres boutons du fichier.

### R4 — Entité fantôme « Name » : joueur et catégorie factices partout dans l'app (CONFIRMÉ, sévère, hors périmètre strict Dashboard)

`SettingsService.getEntities(type)` (Code.gs:388-421) lit `sheet.getDataRange().getValues()` puis filtre avec `data.filter(r => r[0])`. Ce filtre n'exclut que les lignes vides — pas la ligne d'en-tête, dont `r[0]` vaut `"Name"` (truthy). Résultat : un faux joueur nommé **« Name »** (avatar = littéralement la chaîne « Avatar URL », d'où le `GET /Avatar%20URL → 404` observé au premier chargement) et une fausse catégorie **« Name »** (icône = « Emoji ») apparaissent partout où `getEntities()` est utilisé.

Reproduit dans le navigateur — visible simultanément dans : les pastilles Joueurs et Tops du Dashboard (`#playerChips`, `#categoryChips`), le sélecteur « Joueur pour le Donut », le Podium (liste Paramètres → Joueurs / Tops), le Barème par Top, le tchat/mentions, les filtres de l'Historique, le menu déroulant « auteur » du Journal d'audit, et le constructeur de « Saisir un Lot ». Confirmé aussi par appel direct : `SettingsService.getEntities('Players')` retourne bien une entrée `{name: 'Name', meta: 'Avatar URL', ...}` en tête de liste.

Découvert via le point d'entrée Dashboard (pastilles de filtre) mais la cause racine est un service backend partagé, pas un défaut du Dashboard seul — la correction (une ligne, `data.slice(1).filter(...)` ou équivalent) profite à tout l'onglet Paramètres/Historique en même temps. À traiter dans cette passe vu la sévérité (Axe 1 + Axe 2), mais à signaler explicitement comme correction transverse.

### R5 — Contrôles vérifiés sans défaut

- Bascule d'univers Principaux/Alternatifs : aucune erreur, indicateur et podium se mettent à jour correctement (le Podium retombe sur le pool « Solo » en univers Alt car les fixtures n'ont quasiment aucune donnée sur le seul Top Alt existant — comportement attendu sur jeu de données vide, pas un bug).
- Podium — « Nouveau tirage » (`phrasesRerollBtn`) : aucune erreur, contenu re-généré.
- Les 5 onglets du hub Statistiques (Records, Tendances, Jour actif, Duo, Mentions) : bascule propre, aucune erreur JS. Panneau « Jour actif » vérifié en profondeur : `apiGetActiveWeekday` retourne des données valides (`topWeekday: "Dimanche"`), le graphique se rend bien (`wrapperDisplay: ''`, instance Chart.js créée) — la présence du texte « Aucune donnée. » dans le `textContent` du conteneur est un faux positif de ma méthode de sonde (le `div` de repli reste dans le DOM avec `display:none`, `textContent` l'inclut quand même).
- Portée des Tendances (Par Top / Par joueur) : bascule sans erreur.
- Export CSV et Export Excel : déclenchés sans erreur JS ni nouvelle entrée dans `window.__frontErrors`.

### R6 — Export Infographie : résolu, pas un défaut (session du 2026-08-11)

Reproduit avec le tool `computer` (clic réel en coordonnées, pas `element.click()`) sur `exportInfographicBtn` : la modale s'ouvre correctement (overlay `.export-modal-overlay` créé, `display:flex`, `opacity:1`, `z-index:3000`, plein viewport), tous les contrôles rendus (formats PNG/JPEG/SVG/PDF, thèmes, ratios, échelles). Aucune erreur console.

**Conclusion :** le soupçon initial (R6, session précédente) était fondé sur `element.click()` qui ne déclenche pas la même chaîne d'événements qu'un clic réel pour ce contrôle précis — probe artifact, pas un défaut de l'application. Écarté.

Correction à la marge notée en passant : la modale ne s'appuie pas sur `#modalBackdrop` (le conteneur modal partagé de l'app) mais crée son propre `.export-modal-overlay` à la volée — incohérence mineure d'architecture, hors périmètre de cette passe (pas un bug utilisateur).

### R7 — Bascule thème clair : le fond de page reste figé en sombre (CONFIRMÉ, sévère)

En sombre, `--bg` vaut `#07090e` (défini sur `:root`). En clair, `body.light` redéfinit `--bg` à `#f8fafc`. La règle `body { background: var(--bg); background-image: var(--bg-gradient); background-attachment: fixed; transition: background 0.3s, color 0.3s; }` (Index.html:75-85) utilise le raccourci `background: var(--bg)` pour la couleur de fond, combiné à une `transition: background 0.3s`.

Reproduit dans le navigateur : après bascule vers le thème clair (bouton « Basculer le thème »), `getComputedStyle(document.body).backgroundColor` reste bloqué à `rgb(7, 9, 14)` (la valeur sombre), alors que `--bg` est bien passé à `#f8fafc` sur l'élément (vérifié via `getComputedStyle(document.body).getPropertyValue('--bg')`), que `background-image` suit correctement le dégradé clair, et que texte/cartes/bordures basculent tous normalement. Même en forçant `--bg` en ligne via `document.body.style.setProperty('--bg', '#00ff00')`, la couleur de fond ne bouge pas.

**Cause isolée :** reproduction minimale sur un élément de test dans la même page — `background: var(--x); ...; transition: background 0.3s;` combiné à un changement de `--x` via bascule de classe **ne met jamais à jour `background-color`**, alors que le même test sans la ligne `transition` fonctionne normalement. La combinaison « couleur de fond posée uniquement via `var()` dans le raccourci `background` » + « `transition` sur cette même propriété raccourcie » empêche le moteur de re-calculer `background-color` quand seule la custom property change.

**Effet utilisateur :** en thème clair, le fond de page (derrière les cartes, dans les marges) reste noir/très sombre alors que tout le reste de l'interface est passé en clair — rendu visuellement cassé, viole la règle « Deux thèmes » de `context.md` §6 et des contraintes globales du protocole.

**Piste de correction :** séparer `background-color: var(--bg);` en déclaration propre (au lieu du raccourci `background: var(--bg)`), et transitionner `background-color` explicitement plutôt que le raccourci `background` — ex. `transition: background-color 0.3s, color 0.3s;`.

### R8 — Panne backend au clic « Rafraîchir » : le bouton reste figé en chargement pour toujours (CONFIRMÉ, sévère)

`globalRefresh()` (Index.html:8604-8625) attend 2 callbacks (`loadEntities(onDone)` + `loadAppBranding(onDone)`, `pending = 2`) avant d'appeler `stopLoading()` sur le bouton de rafraîchissement.

- `loadAppBranding(onDone)` (Index.html:5779) appelle `callServer('apiGetAppSettings', [], successCb, 'Chargement identité app', () => { if (onDone) onDone(); })` — le 5ᵉ argument (`onError`) appelle bien `onDone()` en cas d'échec serveur.
- `loadEntities(onDone)` (Index.html:9368) appelle `callServer('apiGetSettings', [], res => {...; if (onDone) onDone(); ...})` **sans 5ᵉ argument** — aucun `onError` fourni. En cas d'échec de `apiGetSettings`, `callServer` affiche un toast d'erreur mais n'appelle jamais `onDone`.

Reproduit dans le navigateur : backend simulé en panne totale (toutes les requêtes `/call` renvoient `{ok:false}`), clic sur « Rafraîchir les données ». Résultat : `pending` ne redescend jamais à 0 (seul `loadAppBranding` décrémente), `stopLoading()` n'est jamais appelé — le bouton reste **indéfiniment** dans son état `disabled` + `⏳ …`, sans aucun message d'erreur visible à l'écran pour l'utilisateur expliquant que le rafraîchissement a échoué. Aucune erreur console (le défaut est silencieux, pas une exception).

**Effet utilisateur :** en cas de panne réseau/serveur passagère, le bouton de rafraîchissement — l'un des contrôles les plus visibles de la navbar — reste bloqué en chargement de façon permanente, sans explication ni moyen de réessayer autrement qu'en rechargeant toute la page. Viole directement la consigne du protocole (phase 2, item 5) : « vérifier que l'écran le dit au lieu de rester figé ».

**Piste de correction :** ajouter un `onError` à l'appel `apiGetSettings` dans `loadEntities()` qui appelle `onDone()` (symétrique à `loadAppBranding`), pour que `globalRefresh()` sorte toujours de son état de chargement, succès ou échec.

## Clôture phase 2

Sonde comportementale terminée. Bilan : 2 défauts déjà confirmés en début de phase (R3, R4), 1 défaut écarté après reproduction au clic réel (R6), 1 élargissement de portée d'un défaut existant (R3 touche 3 branchements, pas 1), et 2 nouveaux défauts sévères découverts en testant les cas thème clair et panne backend (R7, R8). Aucune anomalie sur : les 6 types de graphique, la bascule d'univers, le Podium, les 5 onglets du hub Statistiques, la portée des Tendances, Export CSV/Excel/Tout exporter/Infographie, la largeur mobile (aucun débordement horizontal, cibles tactiles 61×61px, bascule de layout propre).

## Défauts candidats — phase 3

Conseil à 5 en mode local (`claude-council` ne définit pas les rôles du protocole du projet — `correctness`/`data-truth`/`house-rules`/`ergonomics`/`code-quality` n'existent pas dans son catalogue — les 5 membres ont donc été instanciés directement, un par axe, chacun aveugle aux autres). Union brute des 5 listes, doublons non fusionnés à ce stade (fait en phase 4) :

**Axe 1 — Ça marche**
- C1. Podium (`#phrasesList`) sans `onError` sur `apiGetActivePhrasePreset` — reste en squelette 15 s en cas de panne backend avant que le filet générique n'intervienne (Index.html:17413-17431).
- C2. `updatePreview()` et la branche PNG/JPEG de `generateInfographic()` n'ont ni `try/catch` ni `.catch()`, contrairement aux branches PDF/SVG voisines (Index.html:11932-11945, 11695-11701).

**Axe 2 — Ça dit vrai**
- C3. `apiGetQuickStats` : le fantôme « Name » peut apparaître comme « dauphin » dans le bandeau de stats rapides dès qu'un vrai joueur a 0 point (Code.gs:2260-2277).
- C4. `apiGetPlayerTotals` : rang fictif inséré dans le graphique Classement et l'export Excel, fausse l'écart du dernier vrai joueur (Code.gs:2227-2255).
- C5. Donut : au premier affichage, `_donutPlayer` par défaut = `cachedPlayers[0].name` = « Name » → camembert vide (Index.html:10861).

**Axe 3 — Règles maison**
- C6. Champs `#startDate`/`#endDate` restent en fond sombre après bascule vers le thème clair — même mécanisme que R7 mais règle CSS distincte (`input/select/textarea`, Index.html:511-522).
- C7. Couleurs de rang du Podium codées en dur, divergentes des variables `--medal-silver`/`--medal-bronze` utilisées dans le panneau Records (Index.html:2679-2715, 2857-2859).
- C8. Dégradé des pastilles actives : `#ff6b81` en dur au lieu de `var(--accent-hover)` (Index.html:702, 709).
- C9. Palette de tooltip : le palier « blaze » retombe sur un hex en dur, contrairement aux 4 autres paliers (Index.html:3387-3396).
- C10. Couleur joueur/Top : repli sur une palette JS en dur (`hashColor`) si absente du Sheet, au lieu d'imposer la donnée (Index.html:7341-7350, 9743, 5902-5906, 9983).
- C11. Légende native Chart.js : nom de joueur affiché sans avatar (Index.html:10366 et usages).

**Axe 4 — Utilisable**
- C12. État vide du Podium jamais affiché — `#phrasesEmptyState` toujours `display:none`, jamais peuplé ni rendu visible (Index.html:4181, 6969).
- C13. Bouton « Appliquer » redondant : l'auto-application (250 ms après chaque pastille/date) le rend superflu, mais il reste visuellement prioritaire — angle ergonomique de R3 (Index.html:8501-8545, 9756-9761, 15997-15998).
- C14. Panneaux Tendances et Jour actif affichent le même texte pour « vraiment vide » et « panne backend » — aucun moyen de distinguer (Index.html:17094-17099, 17189-17194 vs 17107-17110, 17157-17160).
- C15. Records, Duo, Mentions affichent un message d'erreur distinct mais sans bouton de reprise, contrairement au graphique principal (Index.html:17081-17083, 17219-17221, 17267-17269 vs 10399-10406).
- C16. Messages d'erreur bruts (concaténation de `err.message`/`res.error`) montrés tels quels, sans reformulation (Index.html:8580, 8592, 8597, 9789/9804/9821/9842).

**Axe 5 — Code sain**
- C17. Bloc d'erreur dupliqué mot pour mot 4 fois dans `applyFilters()` (Index.html:9788-9791, 9803-9806, 9820-9823, 9841-9844).
- C18. Bloc cache lecture/écriture dupliqué 4 fois à l'identique dans `Code.gs` (apiGetPlayerRecords, apiGetTrends, apiGetActiveWeekday, apiGetTopPlayerCategoryPairs — Code.gs:3178-3324) ; `apiGetMentionStats` n'a lui aucun cache (incohérence de patron).
- C19. Code mort confirmé : `AnalyticsService.generateInsights` (Code.gs:1529-1567), aucun appelant en production.
- C20. `renderPhrasesCard` : ~305 lignes, 4 responsabilités mélangées (Index.html:7026-7331).
- C21. Tableau `sortChoices` recopié en dur dans la branche `trend` au lieu de réutiliser la variable déjà en portée (Index.html:9933-9935 vs 9958-9960).
- C22. Fenêtre de tendance 30/60 jours codée en dur des deux côtés (backend et libellé HTML) au lieu d'aller dans `CONFIG` (Code.gs:3231-3232, Index.html:4282).

## Défauts confirmés — phase 4

Vérification adversariale : reproduction directe (navigateur ou test Node) quand c'était possible, sinon citation exacte des lignes qui rendent le défaut inévitable. Tous les numéros de ligne cités par le conseil ont été recoupés avec le fichier actuel (`grep`) — aucun décalage trouvé.

| # | Verdict | Preuve de vérification |
|---|---------|------------------------|
| R3 | **CONFIRMÉ** (déjà prouvé phase 2, élargi à 3 branchements) | Reproduit 3× dans le navigateur |
| R4 | **CONFIRMÉ** (déjà prouvé phase 2) | Reproduit dans le navigateur + appel direct `SettingsService.getEntities` |
| R7 | **CONFIRMÉ** (déjà prouvé phase 2) | Reproduit dans le navigateur, isolé sur un cas CSS minimal |
| R8 | **CONFIRMÉ** (déjà prouvé phase 2) | Reproduit dans le navigateur, bouton figé `disabled` de façon permanente |
| C1 | **CONFIRMÉ** | Code cité (Index.html:17413-17431) : `callServer('apiGetActivePhrasePreset', [], cb, 'Chargement preset actif')` — bien 4 arguments seulement, pas de 5ᵉ (`onError`). Cohérent avec le patron exact de R8. |
| C2 | **PLAUSIBLE, non prioritaire** | Absence de `try/catch`/`.catch()` vérifiée dans le code (asymétrie prouvée avec les branches PDF/SVG voisines) ; le déclencheur concret (avatar cross-origin qui « tainte » le canevas) n'a pas été reproduit en conditions réelles. Gardé comme défaut de robustesse, pas comme bug confirmé en action. |
| C3 | **CONFIRMÉ** | Conséquence directe et prouvée de R4 (ligne d'en-tête non filtrée dans `getEntities`) — se corrige automatiquement avec R4, pas de correction Dashboard séparée nécessaire. |
| C4 | **CONFIRMÉ** | Idem — conséquence de R4. |
| C5 | **CONFIRMÉ** | Idem — conséquence de R4. Vérifié : `Index.html:10861` lit bien `cachedPlayers[0].name` sans filtrer l'entête. |
| C6 | **CONFIRMÉ** | Reproduit en direct dans le navigateur (session courante) : `getComputedStyle(startDate).backgroundColor` reste `rgb(20, 25, 34)` après bascule vers le thème clair, alors que `--card-solid` sur `body` passe bien à `#ffffff`. Même cause que R7 (raccourci `background: var(...)` + `transition`), même correction. |
| C7 | **CONFIRMÉ** | Code cité : couleurs hex directes en CSS pour le Podium, divergentes des valeurs `--medal-silver`/`--medal-bronze` utilisées dans Records. Défaut visuel objectif (deux teintes différentes pour « argent » selon l'endroit). |
| C8 | **CONFIRMÉ** | Grep : `Index.html:702` et `709` contiennent bien `#ff6b81` en dur, `--accent-hover` vaut exactement cette valeur (Index.html:28). |
| C9 | **CONFIRMÉ** | Grep : asymétrie confirmée entre les 4 paliers et `.pv-blaze`. Mineur, cohérence de patron seulement. |
| C10 | **PLAUSIBLE, écarté de la correction immédiate** | Le repli existe bel et bien dans le code, mais c'est une résilience anti-crash intentionnelle (couleur manquante en Sheet ≠ Sheet non consulté) plutôt qu'un bug — la règle « toujours la couleur du Sheet » suppose implicitement qu'une couleur y est définie. Documenté, non corrigé dans cette passe (pas un bug utilisateur, comportement de repli légitime). |
| C11 | **CONFIRMÉ, non prioritaire** | Limite technique réelle de l'API native de légende Chart.js (pas d'image dans un item de légende sans plugin custom) — rupture d'exhaustivité vraie mais coût de correction disproportionné pour cette passe (nécessiterait un plugin de légende personnalisé). Documenté, reporté. |
| C12 | **CONFIRMÉ** | Grep : les deux seules occurrences de `phrasesEmptyState` sont toutes deux `display:none`, aucun code ne retire ce style ni n'y injecte de texte. |
| C13 | **CONFIRMÉ (angle ergonomique de R3)** | Fusionné avec R3 — se résorbe avec sa correction : une fois le bouton réparé, il redevient un contrôle de confirmation explicite légitime plutôt qu'un doublon cassé de l'auto-application. |
| C14 | **CONFIRMÉ** | Code cité : mêmes conteneurs DOM (`Index.html:4284`, `4288`) utilisés à la fois pour « vraiment vide » (l.17107-17110, 17157-17160) et pour le chemin d'erreur (l.17094-17099, 17189-17194), aucune distinction de texte ni de classe. |
| C15 | **CONFIRMÉ** | Grep confirme l'absence de tout listener de retry sur les 3 conteneurs cités, contrairement à `bindChartRetry` du graphique principal. |
| C16 | **CONFIRMÉ, non prioritaire** | Vrai sur le principe (message technique brut concaténé), mais cosmétique — reporté après les défauts fonctionnels. |
| C17 | **CONFIRMÉ** | Grep : les 4 lignes citées sont bien identiques caractère pour caractère. |
| C18 | **CONFIRMÉ, non prioritaire cette passe** | Lignes de fonction recoupées par grep, correspondent aux bornes citées. Refactor de code sain, aucun impact utilisateur — reporté (règle « aucune réécriture », prudence sur du code backend qui fonctionne). |
| C19 | **CONFIRMÉ** | `generateInsights` n'a pas d'appelant en dehors de son propre test. |
| C20 | **CONFIRMÉ, non prioritaire cette passe** | Taille de fonction vérifiée. Refactor pur (aucun bug), risque de régression sur la fonction la plus souvent corrigée du projet si touchée sans nécessité — reporté à une passe dédiée plutôt que fait à la volée ici. |
| C21 | **CONFIRMÉ** | Grep confirme la duplication littérale. |
| C22 | **CONFIRMÉ, non prioritaire** | Vrai mais mineur (pas de bug, juste una constante à centraliser) — reporté. |

## Écartés — phase 4

- **R6 — Export Infographie** : reproduit avec un clic réel (`computer`), la modale s'ouvre normalement. Le signalement initial reposait sur `element.click()`, qui ne déclenche pas la même chaîne d'événements qu'un clic utilisateur pour ce contrôle. Pas un défaut.

## Correction — phase 5

Priorité annoncée : R3 et R4 (déjà prouvés en phase 2). Cette passe corrige en plus tous les défauts confirmés au comportement utilisateur direct (pas de simple refactor de code sain sans bug associé, sauf s'il est trivial et sûr) :

1. **R3** — 3 branchements `applyFilters` cassés (Index.html:15991, 15997, 15998).
2. **R4** — entité fantôme "Name" (Code.gs `SettingsService.getEntities`) — corrige aussi C3, C4, C5 par ricochet.
3. **R7 + C6** — fond de page et champs de date figés en sombre après bascule vers le thème clair (même cause, deux emplacements CSS).
4. **R8 + C1** — bouton "Rafraîchir" et Podium restent figés en cas de panne backend (même patron : `callServer` sans `onError`).
5. **C12** — état vide du Podium jamais affiché.
6. **C14** — panne backend déguisée en "aucune donnée" sur Tendances/Jour actif.
7. **C15** — pas de bouton de reprise sur Records/Duo/Mentions.
8. **C7, C8, C9** — couleurs codées en dur à remplacer par les variables CSS existantes.
9. **C17, C21** — nettoyages de code sain triviaux et sûrs (dédupliquer le bloc d'erreur d'`applyFilters`, réutiliser `sortChoices`).

Reportés à une passe ultérieure (documentés ci-dessus, non correctifs immédiats) : C2 (déclencheur non confirmé), C10 (repli intentionnel), C11 (nécessite un plugin Chart.js dédié), C16 (cosmétique), C18/C20 (refactors sans bug associé, risque disproportionné pour cette passe), C22 (mineur).

### Réalisé (livré v3.8.2)

Les 9 groupes ci-dessus ont tous été corrigés en TDD (test écrit avant/avec la correction, `npm run verify` vert à 152 tests, 0 échec). Re-sonde au navigateur après redémarrage complet du serveur de prévisualisation (nécessaire : le process gardait en mémoire l'ancien `Code.gs` et un cache applicatif non invalidé — voir « Leçons » du plan-cadre) :

- R3 : clic réel sur « Appliquer » → 0 erreur front, graphique rendu normalement.
- R4 : « Name » n'apparaît plus nulle part dans l'UI (pastilles, Podium, sélecteur Donut, constructeur de lot) après un rechargement à froid.
- R7 + C6 : bascule réelle du thème (clic sur le bouton) → fond de page `rgb(248, 250, 252)` et champs de date `rgb(255, 255, 255)`, conformes au thème clair.
- R8 : bouton « Rafraîchir » testé sous panne backend simulée totale → reste actif (`disabled: false`), ne se bloque plus.
- C1, C7, C8, C9, C12, C14, C15, C17, C21 : vérifiés par les nouveaux tests ajoutés à `tests/frontend-guards.test.js`, `tests/settings.test.js` et `tests/quick-stats.test.js` (voir ces fichiers pour le détail des assertions).

Note d'exhaustivité : la correction de R7/C6 n'a couvert que les deux occurrences relevées (`body`, champs de formulaire globaux) — le motif « `transition` sur une propriété dépendant d'une custom property de thème » n'a pas fait l'objet d'un balayage exhaustif des ~150 autres usages de `background: var(...)` dans `Index.html`. Signalé ici plutôt que balayé en silence ; à reprendre si un autre élément est un jour rapporté figé après bascule de thème.
