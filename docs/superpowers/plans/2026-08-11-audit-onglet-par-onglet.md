# Plan-cadre — Audit & réparation onglet par onglet

> **Pour les agents :** ce document n'est pas un plan d'implémentation. C'est le **protocole** d'une passe d'audit et le **registre de suivi** des passes. Chaque passe produit son propre plan d'implémentation dans `docs/superpowers/plans/2026-08-11-audit-<cible>.md`, écrit avec `superpowers:writing-plans` et exécuté avec `superpowers:executing-plans`.

**Objectif :** faire passer chaque onglet de l'application, un par un, d'un état « accumulé sans direction » à un état vérifié — sans bug connu, sans friction d'usage connue, sans dette de code connue — en livrant une version déployée par onglet. Une passe ne se limite pas à corriger ce qui est cassé : partout où l'onglet est **améliorable** (ergonomie, praticité, logique d'usage, style, intuitivité — les quatre critères de `context.md` §7), l'améliorer fait partie du travail, pas seulement le réparer.

**Approche :** une passe = 5 phases (cartographie → sonde comportementale → conseil à 5 → vérification adversariale → correction & livraison). Le protocole est fixe ; le plan produit à chaque passe est spécifique à l'onglet. Ce document est **évolutif** : la section « Registre des passes » et la section « Leçons » se remplissent au fil de l'eau, et le protocole lui-même peut être amendé si une passe révèle qu'il laisse passer quelque chose.

**Pile :** Google Apps Script (`Code.gs`, `AutoPoints.gs`) · `Index.html` monofichier (~17 900 lignes) · Google Sheets · Chart.js 4.5.1 · harness Node (`tests/`)

---

## Contraintes globales

Ces contraintes s'appliquent à **toutes** les tâches de **tous** les plans dérivés. Elles ne sont pas répétées dans chaque plan d'onglet.

- **Aucune réécriture.** On répare et on assainit ; on ne refond pas l'architecture. `Index.html` et `Code.gs` restent monofichiers.
- **Périmètre de correction :** bugs + ergonomie + qualité de code interne. Pas de refonte visuelle d'un écran sans accord explicite.
- **Améliorer, pas seulement corriger.** Une friction d'usage, une interaction peu logique, un manque d'intuitivité ou un détail de style en retrait du reste de l'app n'ont pas besoin d'être un « bug » pour justifier une tâche de correction — voir « Améliorations » en phases 3 à 5. La limite reste la même que pour les bugs : pas de refonte visuelle d'un écran sans accord explicite, et aucune réécriture d'architecture.
- **Identité obligatoire** — toute action modifiant des données passe par `requireIdentity()`.
- **Journal obligatoire** — toute action modifiant des données appelle `AuditService.log()` avec auteur, action, cible, résumé.
- **Avatar partout** — tout nom de joueur affiché est accompagné de son avatar.
- **Couleurs depuis les données** — jamais de couleur arbitraire pour un joueur ou un Top ; toujours la valeur du Sheet.
- **Variables CSS uniquement** — aucune valeur hexadécimale directe dans le CSS.
- **Deux thèmes** — tout changement visuel est vérifié en sombre **et** en clair.
- **Mobile** — tout changement d'écran reste utilisable sous 768 px ; cible tactile ≥ 44 px.
- **Zéro placeholder** — aucun `TODO`, `FIXME`, fonction vide ou branche non implémentée dans le code livré.
- **Code en anglais**, explications hors code en français.
- **Dépendances CDN épinglées** — aucune version flottante.
- **Livraison** — `npm run verify` vert, `CHANGELOG.md` mis à jour avec les deux voix (Humanisé + Technique), commit **et** `git push` sur `main` (le push déclenche le déploiement des deux cibles). Compte GitHub : `Arcxy2nd`.

---

## Garde-fous — protection des données réelles

**Un joueur a été perdu suite à une passe d'audit et a dû être ressaisi manuellement.** Ces garde-fous sont des règles dures, pas des recommandations — elles s'appliquent à **toutes** les passes présentes et futures, en particulier toute passe touchant Paramètres/Joueurs/Tops (CRUD d'entités) ou les outils de nettoyage.

1. **Toute manipulation destructive pendant la sonde (phase 2) se fait exclusivement contre le harness local** (`tests/frontend/serve.js` + fixtures), jamais contre l'URL `/exec` déployée ni contre un Sheet réel. Avant toute action de suppression/renommage/fusion testée dans le navigateur, vérifier explicitement que l'URL chargée est `http://localhost:<port>/…` — jamais un domaine `script.google.com` ou un lien short.io de production. Si un test doit absolument être fait en conditions réelles, il faut le dire explicitement à l'utilisateur et obtenir son accord avant d'agir, comme pour toute action irréversible.

2. **`SettingsService.deleteEntity()` et `renameEntity()` (Code.gs) n'ont aucune sauvegarde de sheet dédiée**, contrairement aux opérations de nettoyage de l'Historique qui appellent `_backupHistory()` avant toute suppression (Code.gs:912-918). La seule récupération possible pour un Joueur/Top supprimé ou mal renommé passe par le bouton « ↩️ Annuler » du Journal d'audit — qui dépend d'un snapshot correct, d'un `AuditLog` non purgé, et d'un identifiant de ligne qui n'a pas bougé entre-temps. **Avant qu'une passe future ne touche à `apiManageEntity`, `deleteEntity`, ou `renameEntity`, évaluer l'ajout d'un mécanisme de sauvegarde symétrique à `_backupHistory()` pour les feuilles Players/Categories** (ex. `_backupEntitySheet(type)` copiant la feuille avant toute suppression/renommage) — c'est un manque structurel confirmé, pas une supposition.

3. **Avant tout `git push` d'une passe qui modifie une fonction touchant la suppression, le renommage, la fusion ou le nettoyage d'entités (Joueurs/Tops) ou de leurs données associées** (`apiManageEntity`, `deleteEntity`, `renameEntity`, `fixZeroPoints`, `deleteOrphans`, `apiGroupSimilarEntries`, `apiDetectDuplicates`/suppression des doublons, tout outil du sous-onglet 🔧 Outils) — **s'arrêter et présenter explicitement à l'utilisateur, en langage clair, ce que la modification change dans le comportement de suppression/renommage, et attendre une confirmation avant de pousser.** Ceci est une exception ciblée à la règle « ne jamais demander la permission de committer/pousser » de `context.md` §8 — elle ne s'applique qu'à ce périmètre précis (CRUD/nettoyage d'entités), pas au reste des livraisons.

4. **Toute passe touchant ce périmètre ajoute un test de non-régression Node** qui vérifie qu'une entité qui ne devait pas être touchée par l'opération testée survit intacte (nom, avatar/emoji, couleur) — pas seulement que l'entité ciblée est correctement modifiée. Un test qui ne vérifie que le cas nominal ne suffit pas ici.

5. **Après toute correction touchant ce périmètre, la sonde comportementale (phase 2) inclut explicitement un scénario « avant/après » sur la liste complète des entités** (compter les joueurs et Tops avant l'action, recompter après, comparer un par un) — pas seulement vérifier que l'action ciblée a fonctionné.

---

## Registre des passes

Ordre choisi : du plus risqué au plus calme, pour que les gros défauts sortent tôt.

| # | Cible | Zone `Index.html` | État | Version livrée | Plan |
|---|-------|-------------------|------|----------------|------|
| 0 | Ligne de base (outillage) | — | ✅ livré | — | ci-dessous |
| 1 | 📊 Dashboard | `#tab-dashboard` (l. 4156-4299) | ✅ livré | v3.8.2 | [2026-08-11-audit-dashboard.md](2026-08-11-audit-dashboard.md) |
| 2 | 📜 Historique + 🔍 Journal d'audit | `#tab-history` (l. 4748-4850) | ✅ livré | v3.9.0 | [2026-08-11-audit-historique.md](2026-08-11-audit-historique.md) |
| 3 | ✍️ Saisir un Lot | `#tab-inject` (l. 4317-4382) | ✅ livré | v3.10.0 | [2026-08-11-audit-saisir-un-lot.md](2026-08-11-audit-saisir-un-lot.md) |
| 4 | ⚙️ Paramètres + 🔧 Outils | `#tab-settings` (l. 4368-4726) | ⬜ à faire | — | — |
| 5 | 📝 Notes | `#tab-notes` (l. 4727-4740) | ⬜ à faire | — | — |
| 6 | 💬 Tchat flottant | widget global, hors onglets | ⬜ à faire | — | — |
| 7 | ❓ Guide | `#tab-guide` (l. 4846+) | ⬜ à faire | — | — |

États : ⬜ à faire · 🔄 en cours · ✅ livré · ⏸️ suspendu (raison à noter)

> Les numéros de ligne sont ceux du **2026-08-11** et bougeront à chaque passe. Les revérifier au début de chaque cartographie (`grep -n 'id="tab-' Index.html`), ne jamais s'y fier de mémoire.

---

## Grille d'audit — 5 axes

Toute passe examine la cible selon ces cinq axes, dans cet ordre. Ils définissent aussi les cinq rôles du conseil (phase 3).

### Axe 1 — Ça marche
Chaque contrôle de l'onglet est réellement actionné. Cas nominal, cas vide (aucune donnée), cas plein (beaucoup de données), coupure serveur (le backend renvoie une erreur). Aucune erreur console, aucune promesse rejetée non gérée, aucun squelette de chargement qui ne se résout pas.

### Axe 2 — Ça dit vrai
Les chiffres, listes, classements et graphiques affichés correspondent aux données réelles. Recalcul indépendant depuis les fixtures pour comparaison. Les arrondis, totaux, tris et filtres croisés donnent le même résultat que le calcul de référence.

### Axe 3 — Règles maison
Identité avant édition · trace au journal d'audit · avatar sur chaque nom · couleurs issues des données · variables CSS · thème clair **et** sombre · mobile ≤ 768 px · exhaustivité (une fonctionnalité posée sur un type de champ est posée sur **toutes** ses instances).

### Axe 4 — Utilisable
Nombre de clics pour l'action la plus fréquente de l'onglet · feedback immédiat sur chaque action · messages d'erreur lisibles et actionnables · hiérarchie visuelle · états vides explicites · possibilité d'annuler une action destructrice. Cet axe ne s'arrête pas à « est-ce cassé ? » — il demande aussi « est-ce que ça pourrait être plus ergonomique, plus pratique, plus intuitif, alors même que rien n'est cassé ? ».

### Axe 5 — Code sain
Code mort · duplication (≥ 3 lignes répétées) · erreurs avalées en silence · variables ou fonctions référencées hors de leur portée · constantes en dur qui devraient être en `CONFIG` · fonctions trop longues à responsabilité multiple · gestion d'erreur absente sur un appel serveur.

### Améliorations (transverse aux 5 axes)
En plus de chercher des défauts, chaque membre du conseil (phase 3) note ce qui, sur son axe, est **améliorable sans être cassé** : une interaction qui fonctionne mais reste peu logique, un style visuel en retrait du reste de l'app, un manque d'intuitivité, une praticité perfectible. Ces pistes suivent un circuit plus léger que les défauts (phase 4 : jugées raisonnables ou écartées, pas « prouvées » comme un bug) mais sont traitées en phase 5 au même titre — voir le détail dans chaque phase.

---

## Protocole d'une passe — 5 phases

### Phase 1 — Cartographie

Délimiter exactement la cible avant de la juger. Produit la section « Carte » du plan de l'onglet.

```bash
grep -n 'id="tab-' Index.html
```

Relever et écrire dans le plan :
- **HTML** : bornes de lignes du bloc de l'onglet dans `Index.html`.
- **JS frontend** : toutes les fonctions qui touchent cet onglet — les localiser par les identifiants du HTML (`grep -n "getElementById('<id>')" Index.html`) puis remonter aux fonctions appelantes.
- **Backend** : les fonctions `api*` de `Code.gs` appelées depuis ces fonctions (`grep -n "callServer('<nom>'" Index.html`).
- **Tests existants** : quels fichiers de `tests/` couvrent déjà cette zone.
- **Historique** : entrées de `CHANGELOG.md` mentionnant cet onglet — un défaut déjà corrigé deux fois signale une fragilité structurelle.

**Sortie :** section « Carte » du plan de l'onglet. Aucune correction à ce stade.

### Phase 2 — Sonde comportementale

Faire tourner l'application pour de vrai et l'actionner, plutôt que raisonner sur le code.

```bash
npm run verify
```

Puis démarrer l'aperçu via `preview_start` sur la configuration `top-des-tops-frontend` (harness `tests/frontend/serve.js`, port 8137, `google.script.run` de substitution branché sur le vrai `Code.gs` avec les fixtures de production).

Pour la cible, exécuter et consigner :
1. Chargement initial — `read_console_messages`, `read_network_requests`, et le titre du document (le stub y écrit `ERRORS=n | …`).
2. Chaque contrôle actionné une fois via `computer` / `form_input`, avec relecture de l'état par `read_page` après chaque action.
3. Thème clair (`resize_window` avec `colorScheme: "light"`) puis sombre.
4. Largeur mobile (`resize_window` preset `mobile`) et rechargement.
5. Cas dégradés — provoquer une réponse d'erreur backend et vérifier que l'écran le dit au lieu de rester figé.

**Sortie :** section « Relevés » du plan de l'onglet — liste factuelle de ce qui a été observé, sans interprétation. Une capture d'écran par état notable.

### Phase 3 — Conseil à 5

Cinq membres, un par axe de la grille, aveugles les uns aux autres. Aucun fournisseur externe n'étant configuré sur cette machine (ni clé API, ni CLI, ni `jq`), **et** aucun des 5 rôles du protocole n'existant dans le catalogue de rôles du plugin `claude-council` (`correctness`/`data-truth`/`house-rules`/`ergonomics`/`code-quality` ne font pas partie de ses 8 rôles fixes), le conseil ne passe pas par `/claude-council:ask` mais s'instancie **directement** : cinq sous-agents (outil Agent, `run_in_background`, un par axe, aveugles les uns aux autres), chacun avec la consigne suivante, adaptée à la cible et jointe à la carte + aux relevés du plan de l'onglet :

> Audit de l'onglet <cible> de top-des-tops, axe <axe assigné> uniquement. La carte de la zone et les relevés d'exécution sont dans le plan joint. Rends deux listes numérotées : (1) des **défauts** — chacun avec symptôme observable, emplacement précis (fichier:ligne), gravité, et ce qui prouverait qu'il est réel ; (2) des **améliorations** — rien n'est cassé, mais ce serait plus ergonomique, plus pratique, plus logique dans son usage, plus intuitif, ou plus cohérent en style avec le reste de l'app — chacune avec emplacement précis et la raison concrète pour laquelle c'est mieux, pas juste une préférence.

Les cinq rôles correspondent aux cinq axes :

| Rôle | Axe |
|------|-----|
| `correctness` | 1 — Ça marche |
| `data-truth` | 2 — Ça dit vrai |
| `house-rules` | 3 — Règles maison |
| `ergonomics` | 4 — Utilisable |
| `code-quality` | 5 — Code sain |

**Sortie :** deux sections du plan de l'onglet — « Défauts candidats » et « Améliorations candidates » — union des cinq listes de chaque catégorie, doublons fusionnés, aucun tri ni filtrage à ce stade.

### Phase 4 — Vérification adversariale

**Défauts** — un défaut candidat n'entre au plan de correction que s'il est **prouvé**. Pour chacun, dans l'ordre :

1. **Le reproduire** — dans le navigateur si c'est un défaut de comportement, par un test Node qui échoue si c'est un défaut de logique backend.
2. **Ou le prouver dans le code** — citer les lignes exactes qui rendent le défaut inévitable (par exemple : une fonction appelée hors de la portée où elle est définie).
3. **Sinon, le rejeter** — et écrire le rejet avec sa raison. Un défaut rejeté reste consigné : il documente ce qui a été regardé et écarté, ce qui évite de le re-signaler à la passe suivante.

**Améliorations** — circuit plus léger, pas de preuve de bug à apporter : retenue si elle respecte les contraintes globales (pas de refonte visuelle sans accord, pas de réécriture d'architecture) et si la raison donnée est concrète et vérifiable sur la cible réelle (pas une simple préférence esthétique non justifiée) ; sinon écartée avec la raison, même logique de traçabilité que les défauts.

**Sortie :** « Défauts confirmés » (avec la preuve), « Améliorations retenues » (avec la justification), et « Écartés » (défauts et améliorations rejetés, avec la raison) du plan de l'onglet.

### Phase 5 — Correction & livraison

Le plan de l'onglet passe en mode tâches. Une tâche par défaut confirmé ou amélioration retenue, ou par groupe qui partage la même cause. Chaque tâche de correction de défaut suit le cycle TDD ; une tâche d'amélioration pure (sans bug à reproduire) est vérifiée par la sonde comportementale plutôt que par un test qui échouerait sans code à casser au préalable :

1. Écrire le test qui échoue (Node pour la logique, garde-fou dans `tests/frontend-guards.test.js` pour le frontend).
2. Le lancer, vérifier qu'il échoue pour la bonne raison.
3. Écrire la correction minimale.
4. Le relancer, vérifier qu'il passe.
5. Commit.

À la fin de la passe, dans cet ordre :

```bash
npm run verify
```

puis re-sonder l'onglet dans le navigateur (phase 2 abrégée) pour vérifier qu'aucun défaut confirmé ne subsiste et qu'aucun nouveau n'est apparu, puis :

- Mettre à jour `CHANGELOG.md` — une entrée de version, deux voix par item.
- Mettre à jour ce document : ligne de la cible dans le registre → ✅, numéro de version, lien vers le plan de l'onglet.
- Ajouter à la section « Leçons » ce que la passe a appris sur l'application ou sur le protocole lui-même.

```bash
git add -A && git commit -m "fix(<cible>): <résumé>" && git push
```

**Gate de fin de passe :** présenter à l'utilisateur ce qui a été trouvé et corrigé, en langage non technique, avant d'ouvrir la passe suivante.

---

## Tâche 0 — Ligne de base

À faire une seule fois, avant la passe 1. Sans elle, on ne peut pas distinguer un défaut préexistant d'un défaut qu'on vient d'introduire.

- [ ] **Étape 1 : vérifier que la suite de tests est verte**

```bash
npm run verify
```

Attendu : `check:html` sans erreur, puis tous les tests `pass`. Si un test échoue déjà, c'est le premier défaut du registre — il est traité avant toute passe d'onglet.

- [ ] **Étape 2 : vérifier que le harness frontend démarre**

Démarrer l'aperçu via `preview_start` sur `top-des-tops-frontend`, puis charger `http://127.0.0.1:8137/`.

Attendu : la page se charge, le titre du document ne contient pas `ERRORS=`, et les six boutons de navigation sont présents.

- [ ] **Étape 3 : consigner l'état de départ**

Relever le nombre d'erreurs console au chargement, la liste des appels `google.script.run` émis (`window.__frontCalls`), et le temps jusqu'au premier rendu du Dashboard. Écrire ces trois valeurs ci-dessous, dans « Ligne de base mesurée ».

- [ ] **Étape 4 : commit**

```bash
git add docs/superpowers/plans/2026-08-11-audit-onglet-par-onglet.md && git commit -m "docs(plan): add tab-by-tab audit protocol" && git push
```

### Ligne de base mesurée

Relevée le **2026-08-11** sur `tests/frontend/serve.js` (port 8137, fixtures de production du 2026-08-10).

| Mesure | Valeur |
|--------|--------|
| Suite de tests | 140 tests, 140 `pass`, 0 `fail` |
| Erreurs console au chargement | **0** (`window.__frontErrors` vide, titre du document propre) |
| Appels serveur au chargement | **13** : `apiGetNavPages`, `apiGetChatMessages`, `apiGetPhrases`, `apiGetSettings`, `apiGetAppSettings`, `apiGetActivePhrasePreset`, `apiGetFilteredData`, `apiGetQuickStats`, `apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`, `apiGetMentionStats` |
| `DOMContentLoaded` | 364 ms |
| `load` | 430 ms |
| Squelettes de chargement restants | 4 dans le DOM, **tous masqués** — aucun figé |
| Canevas rendus | 3 |
| Boutons de navigation | 12 (6 pages × 2 barres : bureau + mobile) |

Aucun défaut préexistant bloquant. Toute erreur console apparue lors d'une passe est donc imputable à cette passe.

**Observation à instruire (passe 1) :** 13 requêtes séquentielles au démarrage pour un backend Apps Script, dont 7 servent uniquement le Dashboard. À vérifier sur données réelles (la production a plus d'historique que les fixtures) — le chargement peut y être nettement plus lent qu'ici.

---

## Leçons

Ce que les passes apprennent — sur l'application, et sur ce protocole. Rempli au fil de l'eau ; une leçon qui se répète devient une règle des « Contraintes globales ».

**Passe 1 (Dashboard) :**

- **Les rôles du conseil sont un vocabulaire de plugin, pas celui du protocole.** `claude-council` ne connaît que 8 rôles fixes (`security`, `performance`, `maintainability`, `devil`…) — aucun des 5 rôles du protocole (`correctness`/`data-truth`/`house-rules`/`ergonomics`/`code-quality`) n'existe dans son catalogue, la commande échouerait telle quelle. Contournement qui a marché : instancier les 5 membres directement (Agent, un par axe, en parallèle, aveugles les uns aux autres) plutôt que de forcer le mapping sur les rôles existants du plugin.
- **Un « clic » simulé en JS n'est pas un clic.** `element.click()` peut ne pas déclencher la même chaîne d'événements qu'un vrai clic utilisateur pour certains contrôles (cf. R6, finalement écarté après reproduction au clic réel via le tool `computer`) — toujours revérifier au clic réel avant de conclure à un défaut de comportement.
- **Un défaut CSS peut se cacher dans l'interaction `transition` + `var()`, pas dans la couleur elle-même.** R7 (fond de page figé en sombre après bascule de thème) n'était pas un problème de cascade de variables — `--bg` se mettait bien à jour — mais un comportement du moteur de rendu : une transition posée sur une propriété dont le seul changement vient d'une custom property CSS ne se redéclenche jamais, la valeur reste figée à celle du premier rendu. Reproduit et confirmé y compris sur un cas minimal isolé, indépendant de ce projet. Fix : ne jamais mettre `background`/`background-color` dans une liste `transition` quand cette couleur dépend uniquement d'une classe de thème.
- **Les fixtures de test peuvent encoder une hypothèse fausse et la rendre invisible.** Neuf fichiers de test simulaient les feuilles Players/Categories **sans** ligne d'en-tête (`storage.test.js` allait jusqu'à le documenter en commentaire : « Players/Categories sheets have NO header row »), alors que la vraie structure du Sheet (`context.md` §3) en a toujours une. Corriger R4 sans corriger les fixtures aurait cassé 10 tests pour la mauvaise raison. Une suite verte ne garantit la réalité que si les fixtures reflètent la vraie forme des données.
- **Un serveur de prévisualisation gardé ouvert entre deux corrections sert du code et un cache obsolètes.** Après avoir corrigé `SettingsService.getEntities()` (R4), le fantôme « Name » restait visible dans le navigateur — pas un défaut du fix, mais le process Node du harness qui gardait en mémoire l'ancien `Code.gs` require()-é une fois, plus un cache applicatif (`CacheService` simulé) jamais invalidé entre les deux versions. Un redémarrage complet du serveur de prévisualisation a suffi. À refaire systématiquement après toute correction backend testée en navigateur.

---

**Passe 2 (Historique + Journal d'audit) :**

- **Un motif « transition sur une propriété pilotée uniquement par une custom property » n'est pas limité à `background` — `color` en souffre identiquement.** R10 (texte figé dans l'ancien thème après bascule) est la même cause racine que R7 (passe 1), sur une propriété différente, dans les mêmes règles CSS que R7/C6 avaient déjà touchées sans y penser. Un balayage lors de la correction de R7 aurait pu l'anticiper. À vérifier systématiquement pour toute propriété transitionnée dépendant d'une variable de thème, pas seulement `background`/`background-color`.
- **Un identifiant "numéro de ligne au moment de la liaison" est une dette qui ne se voit qu'au moment où on supprime une ligne en amont.** C6 (badges Top Alternatif mal raccrochés) est la même classe de bug que celui déjà corrigé pour les Notes (CHANGELOG:513) — jamais généralisé aux autres endroits qui référencent une ligne d'Historique par numéro absolu (`AltHistory.RefHistoryRowId`). Le motif « numéro de ligne stocké » mérite d'être recherché explicitement dans les prochaines passes (ex. Saisir un Lot, Paramètres) plutôt que découvert au hasard.
- **Une action de suppression qui n'utilise pas le chemin commun (`scheduleDeletion` + snapshot `AuditService.log`) perd silencieusement son filet de rattrapage.** C9 (suppression de groupe non annulable) montre qu'ajouter une nouvelle action destructrice sans repasser par le patron existant est facile à manquer en revue — vaut la peine d'être un point de vérification systématique de l'axe 4 pour toute future passe touchant une suppression.
- **Le sondage en navigateur headless nécessite de désactiver GSAP pour observer l'état réel.** Le pane du navigateur de cette session n'était pas réellement affiché (`document.hidden === true`), donc `requestAnimationFrame` ne s'exécutait jamais et les animations GSAP (changement d'onglet, transitions) restaient bloquées indéfiniment — pas un défaut de l'app. Contournement systématique : mettre `window.gsap = null` avant d'appeler `goToTab()` puis le restaurer, pour forcer le chemin synchrone. À réutiliser pour toutes les passes suivantes utilisant ce navigateur.

**Passe 3 (Saisir un Lot) :**

- **Le classificateur de permission de l'outil peut bloquer un appel `google.script.run` exécuté brut via script, même en lecture pure et même sur le harness local confirmé sûr.** Contournement qui a marché sans enfreindre la restriction : passer par de vrais clics UI (boutons réels de l'app) plutôt que par l'appel serveur direct — méthode de toute façon plus fidèle à un usage réel, réutilisée pour le reste de la sonde. À anticiper dans les prochaines passes plutôt que découvert à chaque fois.
- **`getComputedStyle()` peut rester périmé sur une propriété tout juste modifiée dans un pane headless (`document.hidden === true`), même sans transition CSS en jeu.** Pas limité au cas déjà documenté (GSAP/`requestAnimationFrame` qui ne s'exécute jamais quand la page est cachée) : ici une simple réécriture de `style.cssText` sans aucune transition associée. La source de vérité fiable dans ce contexte est l'attribut `style` inline lui-même (`element.getAttribute('style')`), pas `getComputedStyle()`. À utiliser systématiquement pour vérifier un changement de style JS fraîchement appliqué dans ce harness.
- **Un même motif de bug peut ne pas être corrigé exhaustivement même après deux passes qui l'ont déjà traité.** Le gel de couleur au changement de thème (R7 passe 1, R10 passe 2) a été retrouvé une troisième fois (R2, sur `.desc-in` et `.d-mode-btn`) parce que les deux premiers correctifs retiraient `color`/`background-color` règle par règle au lieu de traiter la cause. Corrigé cette fois par un mécanisme général (classe `body.theme-switching` qui coupe toutes les transitions le temps d'un frame autour du bascule de thème) plutôt qu'un nouveau correctif ponctuel — clôt la famille de bug plutôt que de la déplacer à la prochaine passe qui la retrouvera ailleurs.
- **Un total affiché avant envoi peut diverger fortement d'un total calculé une fois les données explosées côté serveur (plage de dates, sous-tops), sans qu'aucun test existant ne le couvre.** Le conseil à 5 (axe « Ça dit vrai ») a mesuré un écart ×11,7 sur un scénario combiné plage + sous-top — ce genre d'écart mérite d'être vérifié systématiquement dans les prochaines passes dès qu'un total est affiché avant un calcul serveur non trivial (répartition, multiplication, agrégation dérivée).
- **Le conseil à 5 en parallèle (5 agents `Agent` en arrière-plan) est fiable sur la précision de ses citations de code** — vérification par relecture directe sur un échantillon de 7 défauts parmi les plus sévères : 7/7 exacts à la ligne et à la citation près. Justifie d'accepter les défauts restants sur la base de leurs citations sans revérifier chacun ligne à ligne, quand le temps presse, tant qu'un échantillon a été vérifié en amont.

## Amendements du protocole

Si une passe révèle un défaut qu'aucun des cinq axes n'aurait attrapé, l'axe manquant est ajouté ici **avant** la passe suivante, et le rôle correspondant est ajouté au conseil.

_(aucun)_
