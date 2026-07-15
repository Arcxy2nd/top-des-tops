# Design — Widget "Mentions" (statistiques de mentions @Nom)

## Contexte

Le système de mentions (`@Nom`) existe déjà sur les descriptions (History) et les notes (Notes). Le Dashboard affiche déjà quatre cards de statistiques en lecture seule en bas de page : Records, Tendances, Jour le plus actif, Duo le plus fréquent (catégorie×joueur). Aucune ne concerne les mentions.

Objectif : ajouter une cinquième card, purement informative et ludique, qui exploite les mentions déjà présentes dans le texte pour produire trois mini-classements.

## Périmètre

Nouvelle card **"💬 Mentions"**, positionnée après la card "Duo le plus fréquent", sur Dashboard (Index.html) et son équivalent mobile (Mobile.html, accordéon `mStatAccordionHtml`). Purement lecture — pas de saisie, pas de modification de données, donc pas de `requireIdentity()` / `AuditService.log()` (aucune écriture).

Non filtrée par les filtres croisés (joueurs/catégories/période), comme les 4 cards sœurs existantes (Records/Tendances/Jour actif/Duo) qui appellent leur API sans paramètres.

Ne modifie ni History ni Notes : lecture seule des textes déjà stockés.

## Contenu de la card

Trois listes, dans cet ordre :

1. **📣 Les plus mentionnés** — top 5 joueurs cités en `@Nom` dans les descriptions/notes, tous auteurs confondus.
2. **✍️ Ceux qui mentionnent le plus** — top 5 joueurs dont les entrées (History) ou notes (Notes) contiennent le plus de mentions. L'« auteur » d'un texte est : pour History, le saisisseur réel (`row.saiseur`, colonne G — déjà tracé par l'app pour distinguer qui a saisi l'entrée du joueur concerné par le score), avec repli sur `row.player` si `saiseur` est vide (lignes historiques anciennes, saisies avant l'ajout de ce champ) ; pour Notes, `row.player` (aucun champ saisisseur distinct n'existe sur cette feuille).
3. **🔗 Duo le plus complice** — la paire de joueurs (A, B) qui se mentionnent mutuellement le plus (mentions de A→B et B→A cumulées), affichée en une seule ligne avec les deux avatars.

Si aucune mention n'existe dans les données : message "Aucune mention trouvée." (cohérent avec le pattern `Aucune donnée.` des cards sœurs).

## Backend (`Code.gs`)

Nouvelle fonction `apiGetMentionStats()`, ajoutée à côté des fonctions de détection de mentions existantes (`_buildMentionCandidates`, `_scanTextForUnmentioned`, ~ligne 2380).

Nouvelle fonction interne `_countMentionsInText(text, playersSortedByLengthDesc)` : compte, pour un texte donné, les occurrences de `@NomComplet` pour chaque joueur connu. Traite les noms du plus long au plus court et retire chaque occurrence trouvée du texte de travail avant de tester les noms suivants, pour éviter qu'un nom court (ex. "Marie") ne compte à tort une mention d'un nom qui le contient (ex. "Marie Curie"). Réutilise `_escapeRegExpMention` déjà existant.

`apiGetMentionStats()` :
- Charge la liste des joueurs (`SettingsService.getEntities('Players')`), triée par longueur de nom décroissante.
- Parcourt `StorageService.getFullHistoryRowsCached()` (texte = `r.description`, auteur = `r.saiseur || r.player`) et `NotesService.getAllNotes().notes` (texte = `n.text`, auteur = `n.player`) — même source de données que `apiScanUnmentionedNames()`.
- Pour chaque texte, calcule les mentions via `_countMentionsInText`, puis cumule :
  - `mentionedTotals[cible] += n` (indépendant de l'auteur)
  - `mentioningTotals[auteur] += n`
  - `pairTotals[clé triée "A|B"] += n` si cible ≠ auteur (une mention de soi-même ne compte pas comme duo)
- Retourne `{ success: true, mostMentioned: [{player, count}] (top 5), mostMentioning: [{player, count}] (top 5), topDuo: {playerA, playerB, count} | null }`.
- Erreurs gérées via le pattern `try/catch` + `fail(e)` déjà utilisé par toutes les fonctions `api*` du fichier.

Aucune écriture, aucun verrou (`withLock`) nécessaire — lecture seule.

## Frontend PC (`Index.html`)

- Card HTML ajoutée dans le bloc Dashboard, après `#pairsCard` :
  ```html
  <div class="card card-collapsible" id="mentionsCard">
    <div class="card-collapse-header"><h2>💬 Mentions</h2></div>
    <div id="mentionsResults"></div>
  </div>
  ```
- Nouvelle fonction `loadMentionStats()` (section "MENTIONS", à côté de `scanTopPairs()`), suivant le même pattern DOM que les autres cards (`showSkeleton`, lignes `.tool-action`/`.tool-action-info`, avatar via `getAvatarUrl` + `cachedPlayers`). Un sous-titre `<h3>` léger (`color:var(--text-muted)`) introduit chacune des trois listes.
- Appel de `loadMentionStats()` ajouté au bloc qui initialise le Dashboard, à la suite des trois appels existants (`scanRecords(); loadTrends(); loadActiveWeekday(); scanTopPairs();`).

## Frontend mobile (`Mobile.html`)

- Nouvel accordéon ajouté via `mStatAccordionHtml('mMentionsAcc', '💬 Mentions', 'mMentionsBody')`, à la suite de celui de `mPairsAcc`.
- `bindStatAccordion('mMentionsAcc', loadMentionStats)` ajouté à la suite des trois `bindStatAccordion` existants.
- Nouvelle fonction `loadMentionStats()` (mobile), suivant le pattern `statRow(avatarImgHtml(...), titre, sous-titre)` déjà utilisé par `loadPairsStat()`/`loadRecordsStat()`. Un sous-titre `<p style="font-weight:700">` introduit chaque liste, comme le fait déjà `loadWeekdayStat()`.

## Style

Variables CSS existantes uniquement (`--text-muted`, `--accent`…), classes déjà en place (`.card`, `.card-collapsible`, `.tool-action`, `.m-accordion`, `.m-hist-card`). Aucune nouvelle couleur, aucune nouvelle classe CSS nécessaire.

## Tests

Le projet n'a pas de suite automatisée formelle mais dispose d'un harness Node VM local (mentionné dans les mémoires du projet) pour vérifier `Code.gs` en isolation. Vérification prévue :
- Harness Node VM : `apiGetMentionStats()` avec un jeu de données simulé (History + Notes contenant des `@Nom`), vérifier les trois classements et le cas vide.
- `/verify` : ouvrir le Dashboard (PC et mobile) et contrôler visuellement l'affichage de la nouvelle card/accordéon, dark et light.

## Changelog

Entrée `CHANGELOG.md` (section `Ajouté`), deux voix (humanisé + technique), au moment de la livraison.
