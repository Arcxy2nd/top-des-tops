# Local Council — revue du chantier « nettoyage post-v3.5 »

Portée : `becebbf..4ed0f8b` (19 commits), déjà poussé sur `main` et déployé sur les deux cibles.
Date : 2026-08-09

> **Local council** — ces perspectives viennent toutes de Claude jouant des rôles
> différents, pas de fournisseurs d'IA différents. Traitez leur accord comme un
> point de départ commun à mettre à l'épreuve, pas comme une confirmation
> indépendante.

Conseil local convoqué faute de fournisseurs externes configurés (ni `jq`, ni clé API,
ni CLI codex/grok/ollama sur la machine). 6 membres, lancés en parallèle, aveugles
les uns aux autres.

---

## 🗳️ Devil's Advocate

### Position
La branche a dépensé son budget sécurité à *détecter* une classe de panne déjà
couverte, en laissant non construites les deux choses qui protègent réellement
l'app : **la CI ne lance aucun test**, et **le seul endpoint ajouté qui détruit des
données irréversiblement est la seule suppression du code qui contourne la
machinerie d'annulation existante, située deux fonctions plus loin**.

### Key points
- Le pipeline de déploiement ne lance aucun test. `deploy-gas.yml` = checkout →
  install clasp → `deploy-gas.sh`. `tests/check-html-syntax.js`, livrable phare de
  la tâche 1, est un script que le développeur doit penser à taper. Il est en outre
  redondant avec ce qui garde déjà : `assertParses()` dans le stripper. Le garde-fou
  qui manque vraiment, c'est la suite de 132 tests backend — celle qui couvre la
  logique Alt-Tops que cette branche a réécrite. Action la plus rentable (~4 lignes) :
  lancer les tests dans le workflow **après** l'étape de strip, pour valider le
  `Code.gs` nettoyé. Piège : le workflow épingle `node-version: '20'` alors que
  `node --test "tests/*.test.js"` avec glob littéral demande Node 22+.
- `apiDeleteNativeAltEntry` (`Code.gs:2315`) passe une phrase française dans
  l'emplacement positionnel `before` de `log(author, action, entity, before, after,
  detail, snapshot)` et aucun `snapshot`. Comparer `apiDeleteHistoryEntries:2194`
  (`{sheet:'history', op:'deleteMany', rows}`) et `apiDeleteNote:2709`
  (`{sheet:'notes', op:'delete', before}`). La ligne supprimée n'a de jumelle nulle
  part, et l'entrée d'audit n'identifie la ligne que par un index invalidé par la
  suppression elle-même. Correctif ~5 lignes : `deleteNativeAltEntry` lit déjà les
  8 valeurs dans `row` (`Code.gs:1179`) et les jette — les retourner et les logger.
- Le garde anti-obsolescence est du théâtre pour la collision qui arrive vraiment :
  il ne revérifie que `player` et `points`, or « Antoine / 1 pt » est la *forme même*
  des données. Date et description sont disponibles des deux côtés.
- `ALT_FALLBACK_COLOR` ne doit pas être déplacé mais largement supprimé : 6 de ses
  15 usages l'interpolent dans des chaînes CSS, où le texte littéral
  `var(--alt-accent)` fonctionne.
- Les constats CSS sont exacts et correctement peu prioritaires.

### Risks & blind spots
« 132 tests passent » fait un travail non mérité : les 132 chargent `Code.gs` dans
un bac à sable. La partie la plus risquée de la branche est *frontend* et n'a pour
seule preuve automatique que « ça parse ». `assertParses` prouve que la sortie du
stripper *parse*, pas qu'elle est *équivalente*. `strip-comments.js --force` est un
piège local : réécrit les sources sur place, sans dry-run ni sauvegarde, et sort en
milieu de parcours en cas d'échec. Enfin, « les 15 lignes du plan sont traitées »
ne rassure que si le plan demandait les 15 bonnes choses — il n'a pas classé
l'irréversible au-dessus du cosmétique.

### Confidence
`high`

---

## 🗳️ Simplicity Champion

### Position
La branche a corrigé de vrais bugs avec compétence, mais a dépensé son budget de
complexité au mauvais endroit : elle a construit un analyseur lexical JavaScript
de 170 lignes qui réécrit les sources de production au déploiement, alors que le
changement d'une ligne qui délivrerait vraiment la sécurité annoncée — lancer les
132 tests en CI — n'a jamais été fait.

### Key points
- La suite de tests ne garde rien, et le nouveau garde-fou syntaxique non plus.
  Aucun `npm test` / `check:html` / `verify` dans le workflow ; `.git/hooks` est
  vide ; `push.bat` fait `git add -A && commit && push` sans vérification. Les
  132 tests tournent en **170 ms** sans aucune dépendance.
- `strip-comments.js` est le plus gros passif ajouté, et sa justification est la
  plus faible de deux diagnostics concurrents. Le CHANGELOG v3.5.4 déclarait déjà
  une cause *différente* et définitive (`createTemplateFromFile().evaluate()`
  tronquant ~28 000 caractères). Mesure du gain réel du stripper sur `Index.html` :
  **820 149 → 783 333 caractères, 4,5 %**. Si 4,5 % séparent le fonctionnel du
  blanc, ce n'est pas le stripper qui sauve l'app. Ne pas le supprimer sur un
  pressentiment, mais écrire dans `context.md` l'observation falsifiable qui
  justifierait de le supprimer.
- `--alt-accent` a *aggravé* la situation couleur : avant deux littéraux, après
  **trois** sources. `ALT_FALLBACK_COLOR` n'a pas lieu d'exister — les styles inline
  résolvent très bien les propriétés CSS personnalisées. Ajouter
  `--alt-accent-rgb: 255, 209, 102`, réécrire les 9 littéraux en
  `rgba(var(--alt-accent-rgb), 0.08)`, supprimer la constante. Suppression nette.
- Le constat « code dupliqué » sur `altBtn` a le mauvais remède : `.alt-picker-btn`
  n'apparaît dans la feuille de style que dans des `:not()`, jamais en règle
  positive. La bonne action est de supprimer les trois `cssText` et de donner de
  vraies règles à la classe.
- Deux suppressions nettes en passant : `dupBtn` émet encore une clé `category:`
  héritée, seule raison de la chaîne de repli à quatre branches ;
  `applyRowCategoryVisuals` appelant `refreshBaremeForTop()` est un problème de
  couplage, pas de nommage — remonter l'appel aux deux appelants.

### Risks & blind spots
La vraie contrainte que cette branche a heurtée n'est pas le monofichier mais :
**il n'existe aucune barrière automatique entre le clavier et deux instances de
production.** Sur le backend, `deleteNativeAltEntry` soigne le symptôme : les lignes
AltHistory n'ont pas d'identité stable, et `refHistoryRowId` est justement une
colonne d'identité inutilisée pour ces lignes — y écrire un id à l'insertion
supprimerait l'arithmétique d'index, le garde, et toute la classe de bug.
Contestation d'un constat Standards : `SCRIPT_RE` dupliqué entre `.github/scripts/`
et `tests/` = trois lignes dans deux rôles de cycle de vie différents ; à laisser.
Et sur les littéraux jaunes, celui de la ligne 2340 est `.toast-undo-btn`, sans
rapport avec les Tops Alternatifs — le compte réel est 9, pas 11.

### Confidence
`high`

---

## 🗳️ Security Auditor

### Position
La sécurité au niveau du code est correcte — aucun nouveau XSS, l'endpoint de
suppression est défendable — mais le travail de sécurité visait la mauvaise couche.
`appsscript.json` déclare `"access": "ANYONE_ANONYMOUS"` avec
`"executeAs": "USER_DEPLOYING"`, le dépôt est **public**, et `deploy-gas.sh` écrit
les deux URL `/exec` de production dans des journaux d'Actions lisibles par tous.
Comme `requireAuthor()` n'est qu'un test de chaîne non vide, chaque endpoint
mutant est appelable par n'importe qui, sans authentification.

### Key points
- Le modèle de menace de l'énoncé est faux : ce n'est pas « tout compte Google »,
  c'est **aucun compte**. `Code.gs:132` est tout le système d'autorisation :
  `if (!author || !String(author).trim()) throw`. L'identité vit dans
  `localStorage` et est renvoyée telle quelle comme `author`. Le mot de passe
  joueur est décoratif : stocké en clair en colonne D, comparé par `===`, exposé
  comme oracle de devinette illimité et non authentifié. Correctif (~20 min, le
  meilleur ratio du dépôt) : passer `access` à `ANYONE` → `Session.getActiveUser()
  .getEmail()` devient renseigné → faire résoudre cet email par `requireAuthor()`,
  qui est déjà le point de passage unique. Puis masquer l'URL en CI (`::add-mask::`).
- La nouvelle suppression est la seule du fichier sans instantané d'annulation —
  les deux axes l'ont manqué.
- Le garde anti-obsolescence est faible précisément dans l'app pour laquelle il est
  écrit, et il est entièrement optionnel (`if (guard)`).
- `assertParses` prouve la mauvaise invariante, et les tests ne tournent pas en CI.
  Lancer `npm test` en CI *après* le strip transforme le contrôle syntaxique en
  contrôle comportemental et referme proprement la brèche de chaîne
  d'approvisionnement.
- XSS : propre, et je le dis franchement plutôt que de fabriquer un constat.
  `escapeHtml` couvre `& < > " '` ; le nouveau bouton échappe `data-ref` et
  `data-player` ; `data-points` non échappé vient d'un `parseInt(…) || 0` ;
  `openConfirmModal` échappe son argument. Aucun nouveau point d'injection.

### Risks & blind spots
Les deux axes ont revu **le diff**, et le risque vit dans un fichier que le diff ne
touche jamais. Une revue de « durcissement du déploiement » qui n'ouvre jamais le
manifeste de déploiement a un trou structurel. La priorisation est actuellement
inversée : les constats CSS seront corrigés cette semaine parce qu'ils sont
concrets et pas chers ; le modèle d'authentification ne le sera pas parce qu'il
n'apparaît dans aucun diff. Ne pas sur-réagir non plus : « à corriger ce mois-ci »,
pas « annuler le déploiement ». Effet de second ordre : les mots de passe en clair
sont probablement réutilisés ailleurs par vos amis — une fois l'auth Google en
place, supprimer la colonne plutôt que la hacher. Détail adjacent : `scanOutliers`
lit `res.outliers` sans vérifier `res.success`.

### Confidence
`high`

---

## 🗳️ Scalability Architect

### Position
À une douzaine de joueurs et quelques milliers de lignes, rien ne s'effondrera —
mais la couche de cache inter-requêtes que les tests de cette branche certifient
comme fonctionnelle est, sur la vraie feuille de production, très probablement
**déjà désactivée en silence** par le garde `CACHE_MAX_BYTES`. C'est un problème
au présent, pas un risque de montée en charge.

### Key points
- `Code.gs:689` : `if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(...)` —
  pas de `else`, pas de `Logger.log`, aucun signal. Reconstruction fidèle de la
  forme sérialisée : **162 octets/ligne**, donc `CACHE_MAX_BYTES = 95000` est
  franchi à **~590 lignes**. La forme plus légère de `getAllLogs` (`{t,p,c,pts}`)
  fait 55 octets/ligne → **~1750 lignes**. Les 12 `cache.put` ont la même forme
  d'abandon silencieux. Conséquence : `apiGetHistoryPage` — l'endpoint le plus
  sollicité — relit toute la feuille History à chaque appel. `tests/cache.test.js`
  affirme `history.reads === 1` avec des feuilles d'une à deux lignes, soit
  exactement le régime où le garde passe.
- La branche a environ doublé le coût de la vue Historique par-dessus : le câblage
  des pastilles Alt fait que `getHistoryPage` appelle aussi `getAltHistoryMap()` →
  `getAltLogs()`, qui n'a **aucun cache**. Une page tournée avec pastille Alt
  active ≈ 4 lectures complètes sur 2 invocations.
- Le plafond qui mord en premier n'est pas les 6 minutes mais le **quota quotidien
  de temps d'exécution** (90 min/jour sur un compte grand public). Panne attendue :
  un `Service invoked too many times` en pleine soirée, pas de la lenteur.
- Le garde-fou syntaxique ajouté ne tourne pas en CI.
- Arbitrage demandé : `ConfigService.clearCache()` n'est *pas* l'invalidation qui
  compte, et n'a pas besoin de l'être — tout passe par `withLock()` qui appelle
  `_bumpLogsVersion()`, et chaque clé Alt est indexée sur ce compteur global.
  **L'invalidation est complète et correcte.** Sur `histPrefetchKey`, noter que
  `_histSortDir` est *aussi* absent de la liste de paramètres, lu depuis la
  fermeture — c'est là le vrai défaut de conception.

### Risks & blind spots
Je ne peux pas voir la vraie feuille. Les seuils 590/1750 viennent d'une
reconstruction, pas de vos données. **Première chose à faire : mesurer, pas
corriger** — ajouter une ligne `else Logger.log('cache skip ' + key + ' ' +
serial.length)`, déployer, ouvrir l'onglet Historique, lire le journal
d'exécution. Cinq minutes, risque nul, et ça tranche si le reste est urgent ou
théorique. Si correction il faut : découper en morceaux comme `apiGetChangelog`
le fait déjà (`Code.gs:3750`), motif déjà éprouvé sur 146 Ko. `Index.html` est
passé de 812 203 à 834 275 octets sur une branche de *nettoyage* — aucun nombre
n'est surveillé ; une assertion de taille dans `check-html-syntax.js` coûterait
trois lignes. Contrepoids honnête : si la feuille fait moins de ~600 lignes,
l'action correcte est de ne rien faire.

### Confidence
`medium` — dépend d'un nombre de lignes de production non observable d'ici.

---

## 🗳️ Maintainability Advocate

### Position
La vraie dette n'est pas les broutilles de variables CSS que les deux axes ont
chassées — c'est qu'**un même mot, `isAlt`, porte deux concepts métier différents
dans le code même que cette branche a réécrit**, et que la dépendance la plus
fragile de l'app (une balise CDN Chart.js **non versionnée**) est restée intacte
pendant que la branche renumérotait le CHANGELOG.

### Key points
- Deux sens incompatibles, en vigueur, dans les chemins touchés. Dans le
  constructeur de lot, `isAltRow` (`Index.html:12122`) signifie *tout le lot écrit
  des lignes natives dans AltHistory*. Mais `preset.isAlt` (`15778`, consommé en
  `12973`) signifie *cette ligne de l'univers principal est en plus liée à un Top
  Alternatif*. Pire : `setLotUniverse` déclare `const isAlt = mode === 'alt'` en
  15755 puis écrit `isAlt: !!(altCb.checked)` — l'autre sens — 23 lignes plus bas
  dans la même portée. Le backend a déjà le bon vocabulaire (`isNative`) ; le
  frontend ne l'a jamais adopté.
- `Index.html:12` est `<script src="https://cdn.jsdelivr.net/npm/chart.js">` — sans
  version. jsDelivr résout vers le dernier majeur : une v5 casse tout le Dashboard
  sans un seul commit, sans test qui l'attrape, sur les deux instances à la fois.
  Or `context.md:56` dit « Chart.js (**embarqué**) » et `context.md:59` « pas de
  dépendances npm » — **le document de référence est factuellement faux sur la
  posture de dépendance de l'app**, ce qui compte énormément quand le « futur
  développeur » est un agent qui lit `context.md` comme vérité de terrain.
- L'`epilogue` du harness devrait être généré : `Code.gs` + `AutoPoints.gs` ont
  **127** déclarations de premier niveau, l'epilogue en liste **76**, **56** ne sont
  pas exportées. Cinq lignes de regex remplacent la chaîne de 23 lignes et
  suppriment les dix gardes `typeof X === "undefined"` — activement nuisibles :
  elles transforment un renommage en `undefined` silencieux.
- **L'axe Standards s'est trompé sur `ALT_FALLBACK_COLOR`** : `Index.html:5124` est
  un bloc `// ── CONFIG ──` étiqueté, pas « au milieu de l'état mutable ». Le vrai
  défaut est la double écriture, avec un correctif précis que l'axe n'a pas
  atteint. Et pour `--bg-card`, le bon remplaçant n'est pas une nouvelle variable
  mais `--card-solid`, déjà thématisée dans `body.light`.
- La branche a enfreint sa propre règle DRY côté lecture : elle extrait
  `_buildAltRow` pour l'écriture, puis `deleteNativeAltEntry` (`Code.gs:1173-1193`)
  relit les colonnes en `row[5]`, `row[2]`… au lieu d'appeler le
  `_parseAltHistoryRow` situé 120 lignes plus haut.

### Risks & blind spots
Le cadrage « 132 tests backend contre 1 garde-fou frontend » invite au mauvais
correctif. Ne pas se jeter sur jsdom : chaque bug frontend corrigé ici était de la
*logique de décision pure* piégée dans des fonctions DOM. Extraire
`resolveRowCategories(preset, isAltUniverse, firstAltName)` et la machinerie
`new vm.Script()` existante peut l'exécuter et l'asserter sans aucune dépendance
nouvelle. `div.dataset` est défendable — GAS n'a pas de conteneur d'état, la ligne
*est* l'état. `applyRowCategoryVisuals` est pire que dit : l'effet de bord ne se
déclenche que dans la branche non-Alt, donc une fois sur deux. Sur les artefacts :
`.superpowers/sdd/` est gitignoré (correct), mais `docs/superpowers/plans/` suit
~25 plans datés alors que *le plan de cette branche est resté non suivi* — la
convention est devenue incohérente ; commiter ou gitignorer, mais pas l'entre-deux.

Ordre d'action proposé : (1) épingler le CDN et corriger `context.md` §2 ;
(2) renommer la famille `isAlt` ; (3) générer l'epilogue ; (4) extraire
`resolveRowCategories` + ses trois premiers tests ; (5) le nettoyage CSS en dernier
— le plus visible et le moins conséquent.

### Confidence
`high`

---

## 🗳️ Performance Optimizer

### Position
Le vrai coût n'est pas ce que la branche a ajouté au DOM ou à `Index.html` — c'est
qu'elle a transformé une écriture Alt en **rafale de 7 allers-retours dont les 6
lectures sont des échecs de cache garantis**, empilée sur un cache inter-requêtes
très probablement **désactivé en silence** à la taille de données de cet
utilisateur.

### Key points
- `CACHE_MAX_BYTES: 95000` garde chaque `cache.put` (14 sites) en silence. Une
  ligne `hist_full_v` sérialisée ≈ 170 o → le cache s'arrête vers **550 lignes** ;
  une ligne `logs_v` ≈ 54 o → vers **1 750 lignes**. `tests/cache.test.js:69`
  affirme « lit la feuille une fois » sur un fixture de 3 lignes : 132 tests verts,
  zéro couverture de la branche qui décide si le cache existe. La technique de
  découpage nécessaire existe déjà dans le fichier (`apiGetChangelog`,
  `Code.gs:3721`).
- `saveNativeAltEntries()` est passé de 2 à 7 allers-retours, et l'écriture les rend
  tous froids : `Index.html:13117-13124` fait écriture → `applyFilters()` →
  `refreshDashboardStats()`, lequel est 5 `callServer` distincts (`Index.html:16846`).
  L'écriture tourne sous `withLock`, qui appelle `_bumpLogsVersion()` — rotation de
  *toutes* les clés versionnées d'un coup. Les 6 lectures suivantes sont donc des
  échecs par construction. **C'est la régression ressentie**, sur le clic le plus
  fréquent de la fonctionnalité que toute cette branche visait.
- `applyFilters()` après une écriture Alt est inconditionnellement faux quand le
  Dashboard est sur `main` : rien de ce que lit `apiGetFilteredData` n'a pu changer.
  `Index.html:13122` le déclenche quand même, une ligne *au-dessus* du garde
  `activeDashboardUniverse === 'alt'`. Correctif d'une ligne.
- `getAltLogs()` (`Code.gs:1077`) n'a aucun cache — pas même le mémo intra-requête.
  Appelé depuis 8 sites. Le chemin de suppression du gestionnaire
  (`loadAltHistoryMap(() => openAltCategoryManagerModal(...))`) = 3 allers-retours,
  dont le second est du pur gaspillage : `loadAltHistoryMap` ne remplit que
  `cachedAltMap`, lu au rendu du *tableau Historique*, qui n'est pas re-rendu ici.
- **Le constat `histPrefetchKey` de l'axe Standards est juste ; la réfutation qui l'a
  clos est fausse.** `clearHistPrefetchCache()` vide la Map mais **ne peut pas
  annuler un préchargement en vol**. Clic pastille → vidage → page 1 charge (nouveau
  filtre) → le préchargement *précédent* (ancien filtre) se résout et écrit sous la
  même clé K, car K omet `altFilter` (`Index.html:5148`). Pire,
  `_prefetchNextHistoryPage` sort tôt sur `histPrefetchCache.has(key)`
  (`Index.html:14036`), donc une fois l'entrée périmée arrivée, le bon
  préchargement est supprimé. Clic « suivante » → lignes de l'ancien filtre.

### Risks & blind spots
Ce sur quoi **ne pas** perdre de temps, plusieurs points de l'énoncé étant
gonflés : le vidage du cache à chaque pastille ne coûte rien (l'entrée serait
invalide de toute façon) ; la croissance non bornée de la Map est un non-sujet ;
`setLotUniverse` reconstruisant les lignes est invisible car `buildRichSelect`
construit son panneau **paresseusement** dans `openPanel()` ; le poids d'`Index.html`
n'a bougé que de **+4 341 octets (+0,53 %)**, et la panne v3.5.1-3.5.3 était une
corruption par le stripper, pas un plafond de taille — ce garde-fou est la
meilleure chose de la branche. Un risque de panne dure latent :
`unlinkHistoryRowsFromAltCategory` (`Code.gs:1259`) supprime ligne par ligne dans
une boucle ; désaffecter une catégorie à 100+ entrées = 100+ appels séquentiels
sous `withLock`, seul chemin réel vers le mur des 6 minutes. Aucune de ces mesures
n'est mesurée : le harness simule l'API Sheets, il n'y a aucun signal temporel
dans les 132 tests.

Ordre proposé : (1) découper le cache au-delà de 95 Ko + un test avec un fixture
qui franchit le seuil ; (2) conditionner `applyFilters()` à l'univers Alt ;
(3) compteur de version propre à AltHistory + mémo intra-requête sur `getAltLogs` ;
(4) ajouter `altFilter` à `histPrefetchKey` ; (5) fusionner les 5 appels de
`refreshDashboardStats` en un seul endpoint.

### Confidence
`high`

---

## Synthèse — angles, pas consensus

### Points de départ partagés (à éprouver, pas à prendre pour confirmation)

Quatre membres sur six, indépendamment, ont pointé **la même absence : la CI ne
lance aucun test**. Vérifié directement dans `.github/workflows/deploy-gas.yml` :
checkout → setup-node → install clasp → `deploy-gas.sh`. Ni `npm test`, ni
`check:html`, ni `verify`. Nuance importante qu'ils apportent tous : le scénario
« site blanc » *est* bien fermé, mais par `assertParses()` à l'intérieur du
stripper, pas par le garde-fou de la tâche 1. Ce qui reste non gardé, c'est la
régression *logique*.

Cette convergence est cependant exactement le type d'accord à ne pas
sur-interpréter : ces six membres partagent un modèle et donc des a priori. Ce
qu'ils pourraient tous manquer pour la même raison : ils raisonnent tous sur du
code lu, jamais sur des mesures réelles — aucun n'a pu observer votre feuille de
production ni chronométrer une requête.

Trois membres ont aussi convergé sur **l'absence d'instantané d'annulation** pour
la nouvelle suppression Alt, que les deux axes de revue avaient manquée.

### Tensions réelles

- **Le stripper : dette ou protection ?** Le Simplicity Champion veut documenter
  l'observation qui justifierait de le supprimer (il ne gagne que 4,5 % de poids et
  sa justification concurrence un autre diagnostic déjà déclaré définitif). Le
  Performance Optimizer, lui, appelle le garde-fou syntaxique « la meilleure chose
  de la branche ». Ils ne parlent pas du même objet : l'un juge le *lexer*, l'autre
  le *contrôle de parsing*. Les deux ont raison — garder le contrôle, questionner
  le lexer.
- **Par où commencer ?** Le Security Auditor dit « si vous ne faites qu'une chose,
  basculez le manifeste ». Le Maintainability Advocate dit « épinglez le CDN, cinq
  minutes ». Le Scalability Architect dit « ne corrigez rien, mesurez d'abord ».
  Ces trois-là ne s'excluent pas : ce sont trois actions courtes et indépendantes.
- **Un constat Standards démoli deux fois.** Le Maintainability Advocate a vérifié
  que `ALT_FALLBACK_COLOR` *est* dans un bloc `CONFIG` étiqueté — l'axe Standards
  s'est trompé sur ses propres bases. Et le Simplicity Champion corrige le compte
  des littéraux jaunes : 9 liés aux Tops Alternatifs, pas 11 (celui de la ligne
  2340 est le bouton d'annulation des notifications).

### Angles morts

- **Ce que les deux axes ne pouvaient structurellement pas voir** : ils ont revu
  *le diff*. Le défaut d'authentification vit dans `appsscript.json`, que la
  branche n'a pas touché. Le cache possiblement mort dépend d'un volume de données
  qui n'est pas dans le dépôt. Le CDN non épinglé est une ligne inchangée depuis
  toujours. Une revue de diff ne les trouve jamais.
- **Ce qu'aucun membre n'a couvert** : l'accessibilité (contraste, lecteurs
  d'écran) au-delà du symptôme jaune-sur-blanc ; le comportement hors ligne ; et
  la question de savoir si les deux instances de production peuvent diverger.

### Direction suggérée

Par ratio effet/effort, et en séparant ce qui est mesurable de ce qui est décidable :

1. **Mesurer avant de corriger** (Scalability) — une ligne de journal dans le garde
   de cache, déployer, lire le journal d'exécution. Cinq minutes, risque nul, et
   ça tranche si les points 4 et 5 ci-dessous sont urgents ou théoriques.
2. **Épingler Chart.js** et corriger `context.md` §2 (Maintainability) — deux
   lignes, supprime un vecteur de panne totale silencieuse.
3. **Lancer les tests en CI, après l'étape de strip** (Devil, Simplicity, Security,
   Scalability) — ~4 lignes, mais attention : passer le workflow à Node 22+, sinon
   le glob `tests/*.test.js` ne trouve rien.
4. **Ajouter l'instantané d'annulation** à `apiDeleteNativeAltEntry` et durcir le
   garde avec la date (Devil, Security) — ~5 lignes, l'infrastructure existe.
5. **Décider du modèle d'authentification** (Security) — c'est le seul point qui
   n'est pas une correction technique mais un choix : accepter le risque ou
   basculer sur l'identité Google. Réellement exploitable, très peu probable.

Le nettoyage CSS que les deux axes ont mis en avant arrive en dernier chez cinq
membres sur six : c'est le plus visible et le moins conséquent.

### Incertitude résiduelle

Le point 1 conditionne les points de performance : si votre feuille fait moins de
~600 lignes, toute l'analyse du cache tombe et l'action correcte est de ne rien
faire. Personne ici n'a pu l'observer.
