# Task 1 report — Harness frontend local (plan 2026-08-10-dashboard-chargement-infini)

## Statut : DONE

## Ce qui a été implémenté

- `tests/frontend/fixtures.js` — feuilles factices (players, categories, history, notes,
  bareme, phrases, chat, altHistory, altCategories) construites via `makeSheet()` du harness,
  contenu exact du brief.
- `tests/frontend/stub.js` — préambule injecté dans `<head>`, fake `google.script.run` qui
  relaie vers `POST /call`, capture `window.error` / `unhandledrejection` et pousse les erreurs
  dans `window.__frontErrors` + `document.title`. Contenu exact du brief.
- `tests/frontend/serve.js` — serveur `node:http` : `GET /` sert `Index.html` avec le stub
  injecté juste après `<head>` ; `POST /call` exécute la vraie fonction Code.gs/AutoPoints.gs
  via `loadGas()` avec `ConfigService.getSheets` remplacé par les fixtures. Contenu exact du brief.
- `package.json` — ajout du script `serve:front`, laissé hors de `verify` comme demandé.
- `tests/harness.js` — un export manquant à l'épilogue (voir Step 1 ci-dessous), corrigé avant
  de continuer.

## Step 1 — écart trouvé et corrigé

La vérification a montré `apiGetFilteredData: undefined` alors que les cinq autres fonctions
demandées ressortaient bien en `function`. `apiGetFilteredData` existe pourtant dans `Code.gs`
(ligne 2094, distincte de `apiGetFilteredLogs` ligne 2101, qui elle était déjà dans l'épilogue) :
c'est un oubli de liste, pas une fonction inexistante. J'ai ajouté `apiGetFilteredData` à la
chaîne de noms de `tests/harness.js:155` (juste avant `apiGetFilteredLogs`). Après correction,
les six fonctions ressortent toutes en `function` :

```
apiGetPlayerRecords: function | apiGetFilteredData: function | apiGetTrends: function |
apiGetActiveWeekday: function | apiGetTopPlayerCategoryPairs: function | apiGetMentionStats: function
```

Exports du harness (`Object.keys(h)`) : `['loadGas', 'makeSheet', 'injectSheets']`.

## Step 2 — clés attendues par `ConfigService.getSheets()`

Relevé via la commande du brief : `{ spreadsheet, history, players, categories, notes, bareme,
phrases, auditLog, settings, autoRules, chat, altCategories, altHistory }`.

Le `buildSheets()` du brief ne couvre pas `spreadsheet`, `auditLog`, `settings`, `autoRules`.
J'ai vérifié que les six fonctions cibles (`apiGetPlayerRecords`, `apiGetFilteredData`,
`apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`, `apiGetMentionStats`)
ne passent que par `StorageService.getFullHistoryRowsCached()` / `AltStorageService.getAltLogs()`
/ `AnalyticsService.getFilteredChartData()` / `CacheService` / `CONFIG` — aucune ne touche
`settings`, `autoRules`, `auditLog` ou `spreadsheet`. Le round-trip curl confirme (voir Step 6)
que ces quatre fonctions renvoient de vraies données sans erreur malgré ces clés absentes.
Je n'ai donc pas complété `buildSheets()` : le set du brief est suffisant pour le périmètre de
cette tâche (rendre le Dashboard testable). Une extension éventuelle à d'autres endpoints qui
touchent `settings`/`autoRules`/`auditLog` resterait à faire si une tâche future en a besoin.

## Commandes exécutées et sorties

### Step 1 (avant correction)
```
$ node -e "const h=require('./tests/harness.js'); ... "
[ 'loadGas', 'makeSheet', 'injectSheets' ]
apiGetPlayerRecords: function | apiGetFilteredData: undefined | apiGetTrends: function | ...
```

### Step 1 (après correction)
```
[ 'loadGas', 'makeSheet', 'injectSheets' ]
apiGetPlayerRecords: function | apiGetFilteredData: function | apiGetTrends: function |
apiGetActiveWeekday: function | apiGetTopPlayerCategoryPairs: function | apiGetMentionStats: function
```

### Suite de tests existante (régression)
```
$ npm test
ℹ tests 135
ℹ pass 135
ℹ fail 0
```

```
$ npm run check:html
Index.html : 1 bloc(s) <script> inline, syntaxe OK.
```

```
$ npm run verify
... (mêmes 135 tests) ...
ℹ pass 135
ℹ fail 0
```

### Step 6 — serveur démarré et vérifié

```
$ npm run serve:front &
$ curl -s http://127.0.0.1:8137/ | grep -c "window.__frontErrors"
4
```

Écart avec l'attendu du brief (`1`) : **explicable, pas un bug.** `grep -c` compte les
*lignes* correspondantes, pas les occurrences. `stub.js` référence `window.__frontErrors`
sur 4 lignes distinctes (déclaration + 2 usages dans `record()`), et
`grep -c "window.__frontErrors" tests/frontend/stub.js` seul renvoie déjà `4`. J'ai vérifié
que `Index.html` seul (non instrumenté) renvoie `0` occurrence — donc les 4 occurrences de
la page servie viennent exclusivement du stub injecté une seule fois, pas d'une duplication.
J'ai aussi confirmé par positionnement de lignes que le script injecté (ligne 4) précède
bien tout autre `<script>` de la page (premier script tiers en ligne 70, script applicatif
en ligne 5198) :
```
3:<head>
4:<script>
70:  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1"></script>
71:  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
5198:<script>
```

Round-trip `POST /call` sur les quatre fonctions Dashboard testées :

```
$ curl -s -X POST http://127.0.0.1:8137/call -H "Content-Type: application/json" \
    -d '{"fn":"apiGetPlayerRecords","args":["main"]}'
{"ok":true,"value":{"success":true,"records":[{"player":"Ilker","bestSingleEntry":25,...}],
 "globalBest":{"player":"Ilker","points":25,"dateStr":"2026-07-14"}}}

$ curl ... -d '{"fn":"apiGetTrends","args":["main"]}'
{"ok":true,"value":{"success":true,"categoryTrends":[...],"playerTrends":[...]}}

$ curl ... -d '{"fn":"apiGetFilteredData","args":[null,null,null,null]}'
{"ok":true,"value":{"success":true,"chartData":{"labels":[...],"datasets":[...]}}}

$ curl ... -d '{"fn":"apiGetMentionStats","args":["main"]}'
{"ok":true,"value":{"success":true,"mostMentioned":[...],"mostMentioning":[...],"topDuo":{...}}}
```

Toutes des vraies données issues des fixtures, aucune erreur, aucun corps vide. Serveur arrêté
proprement ensuite (process tué, `curl` suivant time-out en connexion refusée — confirmé).

Note en passant (donnée, pas un bug de l'implémenteur à corriger ici) : le retour de
`apiGetFilteredData` contient un premier label `"Name"` avec un dataset à zéro — probablement
la ligne d'en-tête de la feuille `players` incluse dans l'agrégation par `AnalyticsService`.
Signalé pour information au contrôleur/Task 6, pas retouché dans cette tâche (hors périmètre :
la tâche ne modifie ni `Code.gs` ni la logique métier).

## Fichiers modifiés/créés

- `tests/frontend/fixtures.js` (créé)
- `tests/frontend/stub.js` (créé)
- `tests/frontend/serve.js` (créé)
- `package.json` (modifié — ajout `serve:front`)
- `tests/harness.js` (modifié — ajout `apiGetFilteredData` à l'épilogue)

## Auto-revue

- Steps 1 à 7 du brief tous exécutés dans l'ordre.
- `grep -c` renvoie `4` et non `1` — écart documenté ci-dessus, cause identifiée (comptage de
  lignes, pas d'occurrences), aucune anomalie de fonctionnement derrière.
- Round-trip `POST /call` vérifié sur 4 fonctions (pas seulement 1) : données réelles, pas
  d'erreur, pas de corps vide.
- Aucune touche à `Index.html`, `Code.gs`, `AutoPoints.gs`.
- Identifiants en anglais, commentaires en français uniquement là où le code n'est pas
  auto-explicatif — conforme au style du brief et du reste du repo (`tests/harness.js`).
- Aucun navigateur ouvert, aucune tentative d'exécuter les Steps 8/9 [CONTRÔLEUR].
- Commit unique créé, régression testée (`npm run verify` : 135/135 tests passent) avant et
  après le changement d'épilogue du harness.

## Commit

`c1b428c` — `test(frontend): serve Index.html locally against the real backend to expose client-side errors`
(inclut `tests/frontend/`, `package.json`, `tests/harness.js`)

## Fix: translate comments to English

Une relecture (revue de tâche) a signalé que les trois fichiers créés à l'étape 1
(`tests/frontend/fixtures.js`, `serve.js`, `stub.js`) violaient la règle §8 de
`context.md` : commentaires de code en français au lieu d'anglais. C'était un
oubli du brief qui a spécifié ce code, pas un choix délibéré.

Correction : traduction mot-à-mot en anglais de tous les commentaires `//` (aucun
`/* */` présent) dans les trois fichiers, sens technique préservé. Aucune touche
au code, aux noms de variables/fonctions, ni aux chaînes de caractères littérales
(données de fixtures, messages d'erreur JSON) — ce sont des données de test, pas
du texte affiché à un utilisateur final, et le brief demandait explicitement de
ne pas y toucher.

Commentaires traduits :
- `fixtures.js` : 2 commentaires (forme des données de production ; volume des
  84 entrées d'historique).
- `serve.js` : 2 commentaires (ordre d'injection du stub avant tout script ;
  distinction fonction absente du harness vs absente de Code.gs).
- `stub.js` : 2 commentaires (rôle du préambule injecté ; capture explicite des
  exceptions du successHandler que google.script.run avalerait sinon).

### Vérification 1 — aucun commentaire français restant

```
$ grep -nE "//.*[éèàêôûçÀÉ]|/\*.*[éèàêôûçÀÉ]" tests/frontend/fixtures.js tests/frontend/serve.js tests/frontend/stub.js
```
Sortie : vide (aucune correspondance). Conforme à l'attendu.

### Vérification 2 — serveur local, round-trip identique à avant

```
$ npm run serve:front &
$ curl -s http://127.0.0.1:8137/ | grep -c "window.__frontErrors"
4
$ curl -s -X POST http://127.0.0.1:8137/call -H "Content-Type: application/json" \
    -d '{"fn":"apiGetPlayerRecords","args":["main"]}'
{"ok":true,"value":{"success":true,"records":[{"player":"Ilker","bestSingleEntry":25,"bestEntryDate":"2026-07-14","longestStreakDays":1}, ...],"globalBest":{"player":"Ilker","points":25,"dateStr":"2026-07-14"}}}
```
`4` confirmé (comptage de lignes référençant `window.__frontErrors` dans le stub,
pas un bug — déjà établi dans le rapport initial). Réponse `POST /call` : vraies
données des fixtures, pas d'erreur. Comportement du serveur inchangé après la
traduction des commentaires.

### Vérification 3 — suite complète

```
$ npm run verify
ℹ tests 135
ℹ pass 135
ℹ fail 0
```
Aucune régression.

### Statut : DONE
