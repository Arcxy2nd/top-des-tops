# Plan d'optimisation global — Top-des-Tops

> **Date :** 2026-06-24
> **Périmètre :** `Code.gs` (~1227 lignes) + `Index.html` (~6862 lignes)
> **Contrainte ultime (non négociable) :** aucune fonctionnalité ne doit être perdue, dégradée ou modifiée du point de vue de l'utilisateur. Chaque optimisation est un **refactoring à comportement strictement préservé**, qui doit *aussi* préserver — voire améliorer — la capacité d'évolution future.
> **Cadre qualité :** [`règles.md`](../../../règles.md) (DRY, KISS, YAGNI, SOLID, Fail Fast, erreurs typées, code 100 % anglais, tests si ≥ 3 modules).

---

## Avancement

**2026-06-24 — Phase 0 + premières actions livrées (code écrit, non encore redéployé/testé sur GAS) :**

- ✅ **0.1** `apiUpdateHistoryEntry` créé au backend → l'édition complète d'une entrée d'historique fonctionne de nouveau.
- ✅ **1.1** Verrou `withLock()` ajouté ; **toutes** les écritures Sheet (25 endpoints mutateurs) sont protégées contre les accès concurrents.
- ✅ **2.2** `apiAddBulkScores` (N appels) remplacé par `apiAddBulkPlan` (1 seul appel pour tout le lot).
- ✅ **2.5** jsPDF et SheetJS chargés à la demande (premier export) au lieu du démarrage.

**2026-06-24 (suite) — actions de sécurité et confort livrées :**

- ✅ **1.2** Snapshot `History_backup` créé automatiquement **avant** chaque nettoyage destructif (`fixZeroPoints`, `deleteOrphans`). La sauvegarde précédente est remplacée à chaque fois ; on garde toujours l'état juste avant le dernier nettoyage.
- ✅ **2.4** Debounce (250 ms) sur les clics de chips de filtre (joueurs/catégories) : cliquer vite plusieurs filtres ne déclenche plus qu'**un seul** appel serveur. Le skeleton s'affiche immédiatement (feedback instantané).
- 🔁 **2.1 réévaluée → non retenue.** En relisant le vrai code, le Dashboard ne fait **qu'un seul appel serveur par rendu** (chaque branche de `applyFilters` se termine par `return`). Un « endpoint unifié » n'éliminerait aucun aller-retour : bénéfice marginal pour un risque réel de régression. Action écartée au profit du debounce, qui élimine, lui, de vrais appels redondants.

> ✔️ **Vérification effectuée (ce qui est prouvable hors GAS) :** syntaxe des deux fichiers validée via `node --check` (`Code.gs` + bloc JS d'`Index.html`, ~209 k caractères) → **OK**. Câblage confirmé : 4 chips → `scheduleApplyFilters`, `_backupHistory` appelé dans les deux nettoyages.

> ⚠️ **À faire par l'utilisateur :** recopier `Code.gs` + `Index.html` dans l'éditeur Apps Script, puis **déployer une nouvelle version**. Les changements backend ne prennent effet qu'après redéploiement. La vérification du *comportement* (édition d'entrée, saisie de lot, exports, double-saisie simultanée, apparition de l'onglet `History_backup`) se fait dans l'app déployée — non reproductible ici.

**2026-06-24 (suite) — Phase 4 : tests de la logique pure livrés et VERTS :**

- ✅ **4.x** Suite de tests Node exécutable localement (`npm test`), **12 tests / 0 échec**.
  - Harnais `tests/harness.js` : charge le **vrai** `Code.gs` (inchangé) dans un bac à sable VM avec des doublures des services Google → on teste le code de production, pas une copie.
  - `tests/analytics.test.js` : agrégation des scores, comptage des orphelins, génération des phrases d'insights (gagnants par Top, verdict, égalités, plateau vide).
  - `tests/storage.test.js` : écriture du lot (`appendBulkPlan` → points×multiplicateur, groupId vide), **édition d'entrée préservant le groupId** (action 0.1), **snapshot avant nettoyage** (action 1.2), pagination/groupement de l'historique, détection des lots répartis (chaîne ≤ 7 j, rejet au-delà).
- ✅ **Cycle rouge/vert vérifié** : en cassant volontairement `updateHistoryEntry` (écrasement du groupId), le test passe au rouge ; restauré, il repasse au vert. Les tests ont donc un réel pouvoir de détection.

> ▶️ **Rejouer la suite à tout moment :** `npm test` (ou `node --test "tests/*.test.js"`). Aucune dépendance externe (Node natif). C'est le **filet de sécurité** qui sécurisera le futur ménage DRY (Phase 3).

**2026-06-24 (suite) — Phase 3 : DRY backend sous filet de tests :**

- ✅ **3.1** Parsing des lignes d'historique factorisé en `StorageService._parseHistoryRow(row, i)` (source unique de vérité), désormais utilisé par `getAllLogs`, `getHistoryPage`, `getDataHealth` et `apiDetectDistributedLots`. Avant : 4 copies des mêmes règles de validation. **Vérifié : 14 tests / 0 échec** (deux tests ajoutés au préalable pour couvrir `getAllLogs` et `getDataHealth`, baseline verte confirmée avant le refactor).
- ⏭️ **3.2 (couleurs) et 3.3 (idiome de date backend) écartés volontairement.** Ce sont des littéraux/idiomes d'**une seule ligne** ; `règles.md` fixe le seuil DRY à « logique répétée **≥ 3 lignes** ». Les factoriser violerait KISS/YAGNI (sur-abstraction). De plus, backend et frontend ne peuvent pas partager de constante (frontière GAS, fichiers monolithiques).
- ⏸️ **3.3 (constructeur de section colorée frontend) reporté.** Vraie duplication multi-lignes (phrases + barème), mais dans le **rendu visuel**, non couvert par le filet de tests actuel. La refactoriser à l'aveugle risquerait une régression visuelle silencieuse → contraire à la règle ultime. À traiter seulement avec une vérification visuelle (post-déploiement) ou une couverture de tests frontend dédiée.

**2026-06-24 (suite) — 1.3 : journalisation centralisée des erreurs :**

- ✅ **1.3 (partie utile)** Helper unique `fail(e)` : journalise l'erreur dans le log d'exécution Apps Script (la journalisation qui **manquait totalement** au backend) et renvoie l'enveloppe `{ success: false, error: <message> }` **inchangée**. Les 39 blocs `catch` des endpoints `api*` y sont routés (avant : la même ligne d'enveloppe dupliquée 39 fois, sans aucun log). **Vérifié : 14 tests / 0 échec**, message renvoyé identique → zéro impact utilisateur.
- ⏭️ **1.3 (hiérarchie d'exceptions typées) écartée.** Comme seul `e.message` traverse vers le frontend, remplacer chaque `new Error` par `ValidationError`/`ConfigError`/… n'apporterait **aucune** différence visible, pour un gros remaniement. Ajouter les classes sans les utiliser partout serait du **code mort** (anti-YAGNI). À ne faire que si une vraie logique de branchement par type d'erreur devient nécessaire.

**2026-06-24 (suite) — 2.3 : cache serveur des logs (versionné, jamais périmé) :**

- ✅ **2.3** `getAllLogs` dispose désormais d'un cache **inter-requêtes** (`CacheService`) en plus du cache intra-requête existant. La lecture brute du tableur est isolée dans `_readLogsFromSheet`. Le cache est **versionné** : `_bumpLogsVersion()` (dans `withLock`) change la clé à **chaque écriture** → un affichage ne peut jamais servir de données périmées après une saisie/édition/suppression. **Garde de taille** : au-delà de ~95 Ko sérialisés, on ne met pas en cache (limite `CacheService`) et on lit directement → toujours correct, sans plantage. Les horodatages sont sérialisés en millisecondes et reconstruits en `Date` à la lecture (round-trip exact).
- ✅ **Vérifié : 17 tests / 0 échec** (3 ajoutés : cache servi sur 2 requêtes avec 1 seule lecture du tableur, invalidation après écriture, feuille vide). **Cycle rouge/vert** sur la propriété critique : en désactivant l'invalidation, le test « jamais de données périmées » passe au rouge ; restauré, il repasse au vert.

**2026-06-24 (suite) — 3.3 (tranche la plus sûre) : ligne de phrase factorisée :**

- ✅ **3.3 (partiel, choix « part la plus sûre »)** Le bout strictement copié-collé entre `buildPoolBlock` et `buildCatPhraseBlock` — la **ligne de phrase éditable** (texte + boutons ✏️/🗑️ + leurs handlers) — est extrait dans `buildPhraseEditRow(entry, presetName, pool, displayLabel)`. Le code de cette ligne ne vit plus qu'à **un seul endroit** (avant : 2 copies). Les **en-têtes** des blocs (qui diffèrent légèrement) ne sont volontairement **pas** touchés.
- Équivalence prouvée par construction : innerHTML identique au caractère près ; pour `buildPoolBlock` l'ancien `openPhraseModal(entry, presetName, pool)` devient `openPhraseModal(entry, presetName, pool, undefined)` — strictement équivalent car `openPhraseModal` fait `displayLabel || fallback` (et pour l'édition d'une phrase existante le libellé n'est même pas utilisé).
- Vérifié : code de ligne présent une seule fois, helper appelé aux 2 endroits, syntaxe JS OK, backend toujours 17/17. **Seule réserve : le rendu à l'écran** n'est pas testable hors GAS → à confirmer d'un coup d'œil sur l'onglet Paramètres après redéploiement (les blocs « phrases par rang » et « phrases par Top » doivent s'afficher comme avant).
- ⏸️ **Reste reporté** (non retenu dans cette tranche) : fusion des en-têtes de blocs et factorisation des sections du barème (`renderBaremeSettings` / `renderBaremeDrawer`) — gain cosmétique, à ne faire qu'avec vérification visuelle dédiée.

> 🔎 **Effet de bord latent confirmé pendant l'implémentation (non corrigé volontairement) :** à la saisie d'un lot réparti sur plusieurs dates, le `groupId` calculé côté frontend était **déjà ignoré** par l'ancien backend (toutes les lignes étaient écrites sans groupe). Le nouveau code **préserve exactement ce comportement** (aucune régression). Le regroupement reste donc manuel via l'onglet Outils. Si l'on souhaite un jour grouper automatiquement à la saisie, ce serait une **évolution** à décider séparément, pas un bug à corriger en douce.

---

## 0. Méthode et principe directeur

Ce plan repose sur une **lecture intégrale du backend** et une **cartographie complète du frontend** (structure, 47 points d'appel serveur, séquence de démarrage, navigation entre onglets). Chaque proposition cite l'endroit réel du code concerné.

Règle d'or appliquée partout : **on ne touche jamais au comportement visible.** Quand un changement présente un risque de régression (ex. découper les fichiers), il est précédé d'un filet de sécurité (tests sur la logique pure) et listé en fin de parcours, pas au début.

Le parcours est ordonné par **rapport valeur / risque** :
1. réparer ce qui est déjà cassé (gain pur, risque nul),
2. sécuriser les données (empêcher la corruption),
3. gagner en vitesse (changements localisés, faciles à vérifier),
4. restructurer le code (gros chantier, fait en dernier, sous filet de tests).

---

## 1. Constat — ce que le code révèle aujourd'hui

### 1.1 Un bug déjà présent (fonctionnalité cassée)

- **Édition complète d'une entrée d'historique cassée.** Le frontend appelle `apiUpdateHistoryEntry` ([Index.html:6122](../../../Index.html#L6122)) pour sauvegarder la modification d'une ligne (date, joueur, catégorie, points, description). **Cette fonction n'existe pas dans le backend** — seule `apiUpdateHistoryDescription` existe ([Code.gs:944](../../../Code.gs#L944)). Résultat : la modale d'édition d'une entrée échoue silencieusement. C'est une **régression déjà subie** ; la réparer *restaure* une fonctionnalité, donc respecte la contrainte ultime.

### 1.2 Performance — le vrai goulot est le nombre d'allers-retours et de relectures

- **« Cache » illusoire entre deux requêtes.** `ConfigService` mémorise les onglets (`_cache`) et les logs (`_logsCache`) ([Code.gs:11-46](../../../Code.gs#L11)). Mais sur Google Apps Script, **chaque appel `google.script.run` est une exécution neuve** : ces caches sont vidés à chaque requête. Ils n'aident qu'*à l'intérieur* d'un seul appel. Conséquence : **chaque ouverture du Dashboard relit l'intégralité de la feuille History**, plus Players et Categories.

- **Le Dashboard fait plusieurs allers-retours et relit les mêmes feuilles.** Selon le type de graphique, `applyFilters()` ([Index.html:3596](../../../Index.html#L3596)) déclenche `apiGetFilteredData`, `apiGetTrendData` ou `apiGetPlayerTotals`. Chacun de ces endpoints relit **indépendamment** `getEntities('Players')` + `getEntities('Categories')` + `getAllLogs()` ([Code.gs:518](../../../Code.gs#L518), [553](../../../Code.gs#L553), [890](../../../Code.gs#L890)). Les mêmes feuilles sont donc relues plusieurs fois pour un seul affichage.

- **Un clic de filtre = un aller-retour serveur complet.** Aucun debounce sur les chips de filtre ; cliquer rapidement plusieurs joueurs enchaîne autant de requêtes serveur lourdes.

- **Saisie d'un lot réparti = N requêtes séquentielles.** L'enregistrement boucle un `apiAddBulkScores` **par date** du plan ([Index.html:5221-5242](../../../Index.html#L5221)). Un lot réparti sur 10 dates = 10 allers-retours en série (chacun ~1-2 s sur GAS).

- **3 librairies CDN chargées au démarrage.** Chart.js, jsPDF et SheetJS/xlsx sont chargés dans le `<head>` ([Index.html:12-14](../../../Index.html#L12)). jsPDF et xlsx ne servent **qu'à l'export**, rarement utilisé, mais pèsent sur le premier rendu.

### 1.3 Architecture et qualité de code (écart avec `règles.md`)

> **Exception Google Apps Script assumée :** on conserve les deux fichiers uniques (`Code.gs` + `Index.html`). Le découpage multi-fichiers exigé par `règles.md` ne s'applique **pas** ici — c'est un choix délibéré lié à l'hébergement GAS (simplicité de copier-coller dans l'éditeur, déploiement en un bloc). Les améliorations de qualité ci-dessous se font donc **à l'intérieur** des fichiers existants, via une organisation interne nette (sections ordonnées, services bien délimités) plutôt que par séparation physique.

- **Pas de hiérarchie d'exceptions.** `règles.md` demande une classe de base `ProjectError` avec sous-classes (`ConfigError`, `ValidationError`…). Le backend lève des `new Error(...)` génériques et chaque `api*` retourne `{ success, error }`. Le pattern de retour est sain pour GAS, mais le typage des erreurs est absent.

- **Logique de lecture de l'historique dupliquée 4 fois.** Le même parsing des colonnes History (date valide, joueur/catégorie non vides, points > 0) est réécrit dans `getAllLogs` ([Code.gs:173](../../../Code.gs#L173)), `getHistoryPage` ([212](../../../Code.gs#L212)), `getDataHealth` ([297](../../../Code.gs#L297)) et `apiDetectDistributedLots` ([1000](../../../Code.gs#L1000)). Violation directe de DRY.

- **Palette de couleurs dupliquée 3 fois.** `defaultColors` backend ([Code.gs:536](../../../Code.gs#L536)), `CHART_COLORS` frontend ([Index.html:3586](../../../Index.html#L3586)) et `PALETTE` ([2116](../../../Index.html#L2116)) — trois sources de vérité pour la même intention.

- **Utilitaires de date dupliqués backend et frontend.** Le motif `pad` + construction de date `…T12:00:00` est répété dans `appendBulkLogs`, `addNote` (backend) et de multiples helpers frontend (`toDateStr`, `getMondayOfWeek`…).

- **Construction DOM très répétitive côté frontend.** `buildPoolBlock` / `buildCatPhraseBlock` / `renderBaremeSettings` / `renderBaremeDrawer` partagent le même motif (en-tête coloré + liste d'entrées + boutons). Factorisable en un constructeur de « section colorée » générique.

- **Aucun test.** `règles.md` impose des tests dès 3 modules. La logique métier pure (agrégation des scores, détection des lots répartis, génération des phrases de classement, calcul des bornes temporelles) est entièrement testable et n'est couverte par rien.

### 1.4 Robustesse des données

- **Aucun verrou sur les écritures concurrentes.** Toutes les mutations (`appendRow`, `deleteRow`, `setValues`) s'exécutent sans `LockService`. Deux utilisateurs agissant en même temps peuvent : écrire en même position, ou supprimer une ligne qui décale les `rowIndex` que l'autre s'apprête à utiliser. `règles.md` insiste sur l'atomicité des fichiers de données.

- **`rowIndex` fragile par conception.** Le frontend mémorise des numéros de ligne (`rowIndex`) pour éditer/supprimer ([Index.html:5412](../../../Index.html#L5412), [6061](../../../Index.html#L6061)). Si la feuille change entre l'affichage et l'action, on agit sur la mauvaise ligne. Lié au point précédent.

- **Nettoyages destructifs sans filet.** `fixZeroPoints` et `deleteOrphans` ([Code.gs:329](../../../Code.gs#L329), [346](../../../Code.gs#L346)) suppriment des lignes définitivement, sans snapshot préalable. `règles.md` recommande une sauvegarde quand l'atomicité n'est pas garantie.

- **Pas de logger centralisé.** `règles.md` demande un logger configuré (DEBUG/INFO/ERROR). Le backend n'émet aucun log, même sur erreur attrapée — le diagnostic en production repose uniquement sur le message renvoyé au frontend.

### 1.5 UX

- **Latence perçue sur les filtres** (cf. 1.2 : pas de debounce, un round-trip par clic).
- **Édition d'entrée d'historique cassée** (cf. 1.1).
- **Démarrage ralenti** par les libs d'export chargées d'emblée (cf. 1.2).
- **Indicateurs de chargement inégaux** : des skeletons existent par endroits (barème, graphique) mais pas partout.

---

## 2. Parcours d'optimisation (par phases, du plus sûr au plus structurant)

Chaque action précise : **ce qu'on change**, **pourquoi c'est sans risque pour l'utilisateur**, et **comment on le vérifie**.

### Phase 0 — Réparer l'existant cassé *(risque nul, gain immédiat)*

| # | Action | Préservation / vérification |
|---|--------|------------------------------|
| 0.1 | Créer `apiUpdateHistoryEntry(rowIndex, fields)` au backend : met à jour date, joueur, catégorie, points et description d'une ligne en une écriture `setValues` sur la plage `A:E`, avec la même validation Fail Fast que `appendBulkLogs`. | **Restaure** une fonctionnalité cassée, n'en modifie aucune autre. Vérif : éditer une entrée depuis l'Historique met bien à jour toutes ses colonnes. |

### Phase 1 — Sécuriser les données *(empêche toute corruption silencieuse)*

| # | Action | Préservation / vérification |
|---|--------|------------------------------|
| 1.1 | Encapsuler **toutes** les mutations Sheet dans `LockService.getScriptLock()` (acquire ~10 s, release en `finally`). Un seul helper `withLock(fn)` réutilisé par tous les `api*` mutateurs. | Comportement identique en usage normal (1 seul utilisateur) ; empêche la corruption à plusieurs. Vérif : deux saisies simultanées ne se chevauchent plus. |
| 1.2 | Avant `fixZeroPoints` / `deleteOrphans`, écrire un onglet `History_backup_<timestamp>` (copie rapide via `copyTo`). | N'altère pas le nettoyage ; ajoute un filet récupérable. Vérif : l'onglet de sauvegarde apparaît avant suppression. |
| 1.3 | Introduire la hiérarchie d'exceptions de `règles.md` (`ProjectError` → `ConfigError`, `ValidationError`, `DataError`) et un logger minimal (`Logger.log` sur chaque `catch` de frontière `api*`). | Les messages renvoyés au frontend restent identiques (on lit toujours `e.message`). Vérif : les erreurs apparaissent dans les logs GAS sans changer l'UI. |

### Phase 2 — Performance *(changements localisés, faciles à vérifier)*

| # | Action | Préservation / vérification |
|---|--------|------------------------------|
| 2.1 | **Endpoint Dashboard unifié** : un seul `apiGetDashboard(filters, chartType)` qui lit Players + Categories + logs **une seule fois** et renvoie tout le nécessaire. Les endpoints actuels restent en place tant que le frontend n'est pas basculé. | Mêmes données affichées, moins d'allers-retours et de relectures. Vérif : chaque graphique est pixel-identique avant/après. |
| 2.2 | **Saisie de lot en un seul appel** : `apiAddBulkScores` accepte le **plan complet** (toutes les dates d'un coup) et écrit en une passe `setValues`. | Mêmes lignes écrites, mêmes groupes ; 1 round-trip au lieu de N. Vérif : un lot réparti sur 10 dates produit exactement les mêmes entrées. |
| 2.3 | **Cache d'agrégats côté serveur** via `CacheService` (clé = signature des filtres), invalidé à chaque mutation. TTL court (ex. 5 min). | Résultat identique ; simplement servi plus vite. Invalidation sur écriture = jamais de donnée périmée après une saisie. Vérif : modifier une donnée rafraîchit bien le Dashboard. |
| 2.4 | **Debounce** (~250 ms) sur `applyFilters` + indicateur de chargement, pour regrouper les clics rapides de chips. | Le résultat final est le même ; on évite les requêtes intermédiaires inutiles. Vérif : sélectionner 4 joueurs d'affilée ne déclenche qu'un seul chargement. |
| 2.5 | **Chargement paresseux de jsPDF et xlsx** : injecter le `<script>` à la première demande d'export. | L'export fonctionne à l'identique, déclenché à l'usage ; premier rendu plus rapide. Vérif : l'export PDF/Excel marche toujours, même au premier clic. |

### Phase 3 — Qualité interne & DRY *(à l'intérieur des fichiers existants, sous filet de tests)*

> **Aucun découpage de fichiers** (exception GAS, cf. §1.3). Tout reste dans `Code.gs` et `Index.html` ; on améliore l'organisation *interne* et on supprime les duplications.
> Prérequis : Phase 4 (tests sur la logique pure) écrite **avant** de retoucher la logique, pour garantir zéro régression.

| # | Action | Préservation / vérification |
|---|--------|------------------------------|
| 3.1 | **Factoriser le parsing History** en un seul `parseHistoryRow(row, i)` (dans `Code.gs`) réutilisé par `getAllLogs`, `getHistoryPage`, `getDataHealth`, `apiDetectDistributedLots`. | Mêmes règles de validation centralisées ; comportement identique. Vérif : tests sur cas nominaux + lignes invalides. |
| 3.2 | **Source unique de couleurs** : une seule palette de référence. Supprimer les redondances `defaultColors` ([Code.gs:536](../../../Code.gs#L536)) / `CHART_COLORS` ([Index.html:3586](../../../Index.html#L3586)) / `PALETTE` ([2116](../../../Index.html#L2116)). | Mêmes couleurs affichées. Vérif : graphiques visuellement identiques. |
| 3.3 | **Factoriser les utilitaires de date** (regrouper `pad` / `toDateStr` / construction `…T12:00:00` en helpers uniques, un côté `Code.gs`, un côté `Index.html`) et le **constructeur de section colorée** côté frontend, mutualisé entre phrases et barème (`buildPoolBlock` / `buildCatPhraseBlock` / `renderBaremeSettings` / `renderBaremeDrawer`). | Comportement inchangé, moins de duplication. Vérif : phrases et barème rendus à l'identique. |
| 3.4 | **Clarifier l'organisation interne** sans déplacer de fichier : sections commentées nettes dans `Code.gs` (déjà bien amorcé) et bandeaux de séparation cohérents dans le `<script>` d'`Index.html` (par domaine : core / dashboard / history / notes / phrases / barème / outils). | Pur confort de lecture ; zéro impact runtime. Vérif : app strictement inchangée. |

### Phase 4 — Tests *(filet de sécurité, à écrire avant la Phase 3)*

| # | Action | Préservation / vérification |
|---|--------|------------------------------|
| 4.1 | Extraire la logique métier pure en fonctions sans I/O (déjà presque le cas : `_aggregate`, `generateInsights`, `getTrendData`, détection des lots, génération des phrases). | Aucune logique ne change ; on isole pour pouvoir tester. |
| 4.2 | Tests unitaires (`vitest`, exécutés localement sur le code extrait, ou harness GAS via `clasp`) couvrant : agrégation des scores, bornes/granularité temporelle, détection des lots répartis, génération des phrases de classement, parsing d'une ligne History (cas nominaux + cas d'erreur). | Conformité à `règles.md` ; verrou anti-régression pour la Phase 3. |

---

## 3. Tableau de priorisation (valeur vs effort vs risque)

| Action | Valeur | Effort | Risque régression | Priorité |
|--------|:------:|:------:|:-----------------:|:--------:|
| 0.1 Réparer l'édition d'historique | 🔴 Haute | Faible | Nul | **1** |
| 1.1 LockService sur mutations | 🔴 Haute | Faible | Nul | **2** |
| 2.2 Lot en un seul appel | 🟠 Moyenne | Faible | Faible | **3** |
| 2.5 Lazy-load libs export | 🟠 Moyenne | Faible | Faible | **4** |
| 2.1 Endpoint Dashboard unifié | 🔴 Haute | Moyen | Faible | **5** |
| 2.4 Debounce filtres | 🟠 Moyenne | Faible | Nul | **6** |
| 1.2 Snapshot avant nettoyage | 🟠 Moyenne | Faible | Nul | **7** |
| 2.3 Cache d'agrégats (CacheService) | 🟠 Moyenne | Moyen | Faible | **8** |
| 1.3 Exceptions typées + logger | 🟡 Qualité | Moyen | Nul | **9** |
| 4.x Tests logique pure | 🟡 Qualité | Moyen | Nul | **10** |
| 3.1/3.2/3.3/3.4 Factorisations DRY internes | 🟡 Qualité | Moyen | Faible (sous tests) | **11** |

---

## 4. Garde-fous appliqués à tout le plan

- **Aucune fonctionnalité retirée.** Tout endpoint existant reste disponible jusqu'à ce que son remplaçant soit vérifié iso-fonctionnel ; aucun comportement utilisateur n'est modifié.
- **Deux fichiers conservés.** `Code.gs` et `Index.html` restent uniques (exception GAS assumée) : le déploiement et l'URL `/exec` ne changent pas, le copier-coller dans l'éditeur Apps Script reste trivial.
- **Vérification avant de déclarer « fait ».** Chaque action a un critère observable (graphique identique, lot identique, export fonctionnel…). La Phase 3 n'est entamée qu'une fois la Phase 4 (tests) en place.
- **Conformité `règles.md`** (hors clause multi-fichiers) : code 100 % anglais, Fail Fast conservé, DRY restauré, exceptions typées, tests sur la logique pure, constantes centralisées.

---

## 5. Recommandation de démarrage

Attaquer dans l'ordre **0.1 → 1.1 → 2.2 → 2.5** : quatre actions à faible effort et risque quasi nul qui, ensemble, **réparent la fonctionnalité cassée, mettent les données à l'abri de la corruption, et accélèrent visiblement la saisie et le démarrage** — sans rien changer à l'expérience existante. Le ménage interne (Phase 3 : suppression des duplications, dans les deux fichiers existants) vient en dernier, une fois le filet de tests posé.
