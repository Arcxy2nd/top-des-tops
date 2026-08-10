# Passe 1 — 📊 Dashboard

> Protocole : [`2026-08-11-audit-onglet-par-onglet.md`](2026-08-11-audit-onglet-par-onglet.md). Les contraintes globales de ce document s'appliquent à toutes les tâches ci-dessous.

**État :** phase 2 — sonde comportementale
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

### Reste à sonder

- Filtres croisés (pastilles joueurs/Tops, raccourcis de période, dates, Appliquer, Effacer)
- Bascule d'univers Principaux / Alternatifs
- Podium et « Nouveau tirage »
- Les 5 panneaux du hub Statistiques + la portée des Tendances
- Les 4 exports
- Thème clair, largeur mobile, cas vide, cas d'erreur backend

## Défauts candidats — phase 3

_(à venir)_

## Défauts confirmés — phase 4

_(à venir)_

## Écartés — phase 4

_(à venir)_

## Correction — phase 5

_(à venir)_
