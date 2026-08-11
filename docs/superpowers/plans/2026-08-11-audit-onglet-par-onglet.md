# Plan-cadre — Audit & réparation onglet par onglet

> **Pour les agents :** ce document n'est pas un plan d'implémentation. C'est le **protocole** d'une passe d'audit et le **registre de suivi** des passes. Chaque passe produit son propre plan d'implémentation dans `docs/superpowers/plans/2026-08-11-audit-<cible>.md`, écrit avec `superpowers:writing-plans` et exécuté avec `superpowers:executing-plans`.

**Objectif :** faire passer chaque onglet de l'application, un par un, d'un état « accumulé sans direction » à un état vérifié — sans bug connu, sans friction d'usage connue, sans dette de code connue — en livrant une version déployée par onglet.

**Approche :** une passe = 5 phases (cartographie → sonde comportementale → conseil à 5 → vérification adversariale → correction & livraison). Le protocole est fixe ; le plan produit à chaque passe est spécifique à l'onglet. Ce document est **évolutif** : la section « Registre des passes » et la section « Leçons » se remplissent au fil de l'eau, et le protocole lui-même peut être amendé si une passe révèle qu'il laisse passer quelque chose.

**Pile :** Google Apps Script (`Code.gs`, `AutoPoints.gs`) · `Index.html` monofichier (~17 900 lignes) · Google Sheets · Chart.js 4.5.1 · harness Node (`tests/`)

---

## Contraintes globales

Ces contraintes s'appliquent à **toutes** les tâches de **tous** les plans dérivés. Elles ne sont pas répétées dans chaque plan d'onglet.

- **Aucune réécriture.** On répare et on assainit ; on ne refond pas l'architecture. `Index.html` et `Code.gs` restent monofichiers.
- **Périmètre de correction :** bugs + ergonomie + qualité de code interne. Pas de refonte visuelle d'un écran sans accord explicite.
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

## Registre des passes

Ordre choisi : du plus risqué au plus calme, pour que les gros défauts sortent tôt.

| # | Cible | Zone `Index.html` | État | Version livrée | Plan |
|---|-------|-------------------|------|----------------|------|
| 0 | Ligne de base (outillage) | — | ✅ livré | — | ci-dessous |
| 1 | 📊 Dashboard | `#tab-dashboard` (l. 4156-4299) | ✅ livré | v3.8.2 | [2026-08-11-audit-dashboard.md](2026-08-11-audit-dashboard.md) |
| 2 | 📜 Historique + 🔍 Journal d'audit | `#tab-history` (l. 4741-4845) | ⬜ à faire | — | — |
| 3 | ✍️ Saisir un Lot | `#tab-inject` (l. 4300-4367) | ⬜ à faire | — | — |
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
Nombre de clics pour l'action la plus fréquente de l'onglet · feedback immédiat sur chaque action · messages d'erreur lisibles et actionnables · hiérarchie visuelle · états vides explicites · possibilité d'annuler une action destructrice.

### Axe 5 — Code sain
Code mort · duplication (≥ 3 lignes répétées) · erreurs avalées en silence · variables ou fonctions référencées hors de leur portée · constantes en dur qui devraient être en `CONFIG` · fonctions trop longues à responsabilité multiple · gestion d'erreur absente sur un appel serveur.

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

Cinq membres, un par axe de la grille, aveugles les uns aux autres. Aucun fournisseur externe n'étant configuré sur cette machine (ni clé API, ni CLI, ni `jq`), le conseil tourne en **mode local** : cinq sous-agents Claude, chacun contraint à un seul angle.

```bash
/claude-council:ask --local --roles=correctness,data-truth,house-rules,ergonomics,code-quality --file=docs/superpowers/plans/2026-08-11-audit-<cible>.md "Audit de l'onglet <cible> de top-des-tops. La carte de la zone et les relevés d'exécution sont dans le fichier joint. Chaque membre ne traite que son axe et rend une liste numérotée de défauts, chacun avec : symptôme observable, emplacement précis (fichier:ligne), gravité, et ce qui prouverait qu'il est réel."
```

Les cinq rôles correspondent aux cinq axes :

| Rôle | Axe |
|------|-----|
| `correctness` | 1 — Ça marche |
| `data-truth` | 2 — Ça dit vrai |
| `house-rules` | 3 — Règles maison |
| `ergonomics` | 4 — Utilisable |
| `code-quality` | 5 — Code sain |

**Sortie :** section « Défauts candidats » du plan de l'onglet — union des cinq listes, doublons fusionnés, aucun tri ni filtrage à ce stade.

### Phase 4 — Vérification adversariale

Un défaut candidat n'entre au plan de correction que s'il est **prouvé**. Pour chacun, dans l'ordre :

1. **Le reproduire** — dans le navigateur si c'est un défaut de comportement, par un test Node qui échoue si c'est un défaut de logique backend.
2. **Ou le prouver dans le code** — citer les lignes exactes qui rendent le défaut inévitable (par exemple : une fonction appelée hors de la portée où elle est définie).
3. **Sinon, le rejeter** — et écrire le rejet avec sa raison. Un défaut rejeté reste consigné : il documente ce qui a été regardé et écarté, ce qui évite de le re-signaler à la passe suivante.

**Sortie :** section « Défauts confirmés » (avec la preuve pour chacun) et section « Écartés » (avec la raison) du plan de l'onglet.

### Phase 5 — Correction & livraison

Le plan de l'onglet passe en mode tâches. Une tâche par défaut confirmé, ou par groupe de défauts qui partagent la même cause. Chaque tâche suit le cycle TDD :

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

## Amendements du protocole

Si une passe révèle un défaut qu'aucun des cinq axes n'aurait attrapé, l'axe manquant est ajouté ici **avant** la passe suivante, et le rôle correspondant est ajouté au conseil.

_(aucun)_
