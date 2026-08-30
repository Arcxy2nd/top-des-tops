# CONTEXTE PROJET : TOP-DES-TOPS (v2026.07)

---

## RÈGLE IMPÉRATIVE — CONCISION EN DÉBUT DE SESSION

Au début de chaque session (rituel d'initialisation, prise de connaissance du contexte, premiers échanges), parler **peu, très peu, de manière extrêmement concise**. Pas de récapitulatif, pas de reformulation de la demande, pas de plan annoncé en prose — lire, comprendre, agir. Le détail et l'explication ne viennent qu'une fois le travail engagé, si nécessaire.

---

## RÈGLE IMPÉRATIVE — PUSH SYSTÉMATIQUE SUR LES DEUX CIBLES (« Site tops » & « Tops RDS »)

Toute modification livrée doit **IMPÉRATIVEMENT** être poussée via `git push` sur `main` afin d'actualiser et déployer **les deux instances de l'application (« Site tops » et « Tops RDS »)** via le workflow GitHub Actions (`.github/workflows/deploy-gas.yml`).
En cas d'opération de déploiement manuel ou `clasp push` hors CI, il faut **OBLIGATOIREMENT** exécuter la mise à jour sur les 2 cibles listées dans `deploy-targets.json`. Aucune livraison ne doit laisser l'une des deux copies non mise à jour.

---

## RÈGLE IMPÉRATIVE — PORTABILITÉ DE LA MÉMOIRE

Toute évolution retenue sur la méthode de travail avec l'IA doit être écrite **dans ce fichier**, jamais seulement dans une mémoire externe/globale liée à un outil/LLM/machine précis. Le projet doit rester exploitable seul, peu importe le PC, l'outil ou le LLM utilisé.

## RÈGLE IMPÉRATIVE — FICHIER D'ÉTAT INTER-SESSIONS

`NEXT_SESSION.md` (racine du projet) suit l'état courant, mis à jour **en continu** (dès qu'une décision/bug/config a de la valeur pour la suite), jamais seulement en fin de session. 4 blocs stricts : État courant / Dernière session / Écarts / Rappels+Backlog (modèle `H:/IA/projets/AEVO3/NEXT_SESSION.md`, système généralisé à tout le vault le 2026-08-14). Lu en premier, avant ce fichier (§0). Ne remplace pas `CHANGELOG.md` (historique versionné du produit) ni `memory/MEMORY.md` (mémoire portable détaillée) — `NEXT_SESSION.md` est l'état condensé du moment présent.

## RÈGLE — PUBLIABLE = ANGLAIS

Tout artefact destiné à être publié (repo, README, commits, releases) : anglais, même si la conversation se fait en français. Le code (§8) est déjà en anglais ; cette règle couvre aussi commits, README, releases.

## RÈGLE IMPÉRATIVE — INTERDICTION D'INTERAGIR AVEC LES DONNÉES RÉELLES

Interdiction formelle et absolue d'interagir avec les données réelles des sites déployés (« Site tops » & « Tops RDS ») ou leurs Google Sheets — que ce soit pour tester, corriger, nettoyer, déboguer ou vérifier une hypothèse. Toute manipulation de données (lecture destructive, écriture, suppression, script one-off) se fait exclusivement contre le harness local (`tests/frontend/serve.js` + fixtures). Un joueur a déjà été perdu suite à une intervention sur les vraies données — voir §7 « Identité obligatoire » et la note d'incident associée. Vérifier explicitement l'URL/le contexte avant toute action qui touche à des données ; en cas de doute, s'arrêter et demander.

---

## §0 — RITUEL D'INITIALISATION

Au tout début de chaque session, avant toute action, lire dans cet ordre :

| # | Fichier | Ce qu'on y cherche |
|---|---------|-------------------|
| 1 | `NEXT_SESSION.md` | État courant + prochaine tâche prioritaire, mis à jour en continu (système AEVO3, généralisé à tout le vault le 2026-08-14) — avant tout le reste |
| 2 | `context.md` (ce fichier) | Remettre en tête les règles, la stack, les conventions |
| 3 | `CHANGELOG.md` — seulement les entrées les plus récentes (dernière version, et les précédentes si le sujet de la session y touche) | Comprendre l'état récent du projet — ce qui vient d'être ajouté, corrigé ou supprimé. Pas besoin de lire tout l'historique. |
| 4 | `DEPLOIEMENT.md` | Rappel du workflow de déploiement si la session touche au déploiement ou aux scripts GAS |
| 5 | Dernier plan actif dans `docs/superpowers/plans/` (date la plus récente) | S'il y a un plan en cours, s'y référer avant de proposer une approche |
| 6 | `memory/MEMORY.md` + fichiers pertinents | Mémoire portable du projet — incidents réels, décisions de détail, open questions non couvertes par ce fichier |

Après la lecture, si la session porte sur un bug → invoquer `/superpowers:systematic-debugging`. Si c'est une nouvelle feature → `/superpowers:brainstorming`. Dans tous les cas, ne pas coder avant d'avoir lu ces fichiers.

---

## §1 — PROJET

### Ce que c'est

Application web de suivi de scores pour un groupe de joueurs. Chaque joueur accumule des points en participant à des **Tops** (catégories : jeux, défis, activités…). L'app permet de saisir les scores, visualiser les classements, annoter les sessions et gérer les règles de points.

Hébergée sur **Google Apps Script** — pas de serveur, pas de base de données externe. Tout tourne dans le compte Google du propriétaire.

### Usage cible

- **Principal** : PC (écran large, souris/clavier) — optimiser en priorité pour ce contexte.
- **Occasionnel** : mobile, surtout l'onglet **Notes** (ajout rapide depuis l'extérieur) — doit bien fonctionner sur petit écran.
- Le mobile doit rester utilisable partout, mais seul Notes exige un soin particulier sur petit écran.

---

## §2 — STACK TECHNIQUE

| Couche      | Techno                    |
| ----------- | ------------------------- |
| Backend     | Google Apps Script (`.gs`) |
| Frontend    | HTML/CSS/JS (`.html`)     |
| Stockage    | Google Sheets             |
| Graphiques  | Chart.js 4.5.1 (CDN jsDelivr, version figée) |
| Tests       | Node.js test runner natif (`node --test`, `npm test`, `npm run verify`), VM GAS et stubs DOM |
| Déploiement | Web App GAS (`/exec` URL) |

Pas de build, pas de framework, aucune dépendance npm à l'exécution. Deux librairies sont chargées depuis un CDN dans `<head>` (Chart.js, GSAP) et trois à la demande au premier export (jsPDF, SheetJS, fflate) — toutes épinglées à une version précise : une version flottante casserait les deux instances sans qu'aucun commit ne soit poussé. Le HTML est servi directement par GAS via `HtmlService`.

---

## §3 — DONNÉES (Google Sheets)

### Structure des feuilles

```
History       : Date | Player | Category | Points | Description | [GroupId] | [Saiseur]
Players       : Name | Avatar URL | Hex color | Password (optionnel, jamais affiché dans l'UI) | [Ordre]
Categories    : Name | Description | Emoji | Hex color | [Ordre]
Notes         : Date | Player | Note text | [NoteId] | [CrééPar] | [ModifiéPar] | [ModifiéLe]
Bareme        : Top | Action (text) | Points  (pas de colonne Ordre, tri strict par points croissants)
Phrases       : Preset | Pool | Phrase | [Ordre]
Chat          : Id | Date | Author | Text | ReplyToId
AuditLog      : Timestamp | Auteur | Action | Entité | Avant | Après | Détail | [Snapshot] | [AnnuléLe]
Settings      : Key | Value
AltCategories : Name | Description | Emoji | Hex color
AltHistory    : Date | Player | Category | Points | Description | [RefHistoryRowId] | [GroupId] | [Saiseur]
AutoRules     : ID | Joueur | Catégorie | Points | Description | Fréquence | Intervalle | JoursSemaine | JourMois | DateDébut | ProchaineExécution | DernièreExécution | Actif | CrééPar
```

Les feuilles **Notes**, **Bareme**, **Phrases**, **Chat**, **AuditLog**, **Settings**, **AltCategories**, **AltHistory** et **AutoRules** sont optionnelles — créées automatiquement si absentes.

### Ligne 1 : en-tête non garanti

`History`, `Players` et `Categories` ne sont **jamais** créées par l'app (elle refuse de démarrer sans elles) : elles ont été faites à la main et, dans les deux instances réelles, **n'ont pas de ligne de titres** — la ligne 1 contient une vraie donnée. Aucune lecture ne doit donc supposer un en-tête.

Règle : passer par `_readDataRows()` / `_firstDataRow()` / `_headerOffsetFromValues()` (socle `SHEET_HEADERS` + `_isHeaderRow()` en tête de `Code.gs`). Jamais de `data.slice(1)`, de `getRange(2, …)`, de `rowIndex = i + 2` ni de garde `rowIndex < 2` en dur — chacun de ces motifs rend invisible la première entité de la feuille (et la masque au contrôle de doublon, ce qui permet de la recréer). Vaut aussi pour les écritures : ne jamais écrire de libellé en ligne 1 sans avoir vérifié l'offset.

---

## §4 — BACKEND (`Code.gs` & `AutoPoints.gs`)

Tous les services sont des objets littéraux ou IIFE, sans classe ES6. Pattern : service → fonctions `api*` exposées à l'appel GAS via `callServer()`.

| Service | Rôle |
|---------|------|
| `ConfigService` | Connexion au Sheet, cache des onglets, `SPREADSHEET_ID` via Script Properties |
| `SettingsService` | CRUD joueurs et catégories, renommage en cascade dans History |
| `StorageService` | Lecture/écriture History, gestion des lots (groupement, répartition par plage de dates) |
| `NotesService` | CRUD notes par joueur, auto-création de la feuille |
| `AnalyticsService` | Agrégation des scores filtrés (joueurs, catégories, période), données pour graphiques, santé des données |
| `BaremeService` | CRUD règles de points (barème), tri croissant automatique par points, auto-création de la feuille |
| `PhrasesService` | CRUD phrases de commentaires, gestion des presets, auto-création de la feuille |
| `ChatService` | Messages du tchat flottant (lecture, envoi, suppression de ses propres messages), résolution du message cité par une réponse, auto-création de la feuille |
| `AuditService` | Journalisation des opérations, annulation d'écritures, snapshots, auto-création de la feuille |
| `SettingsSheetService` | Gestion des paramètres de l'application dans la feuille Settings |
| `AltSettingsService` / `AltStorageService` | Gestion des catégories et scores du Top Alt |
| `AutoRulesService` | Gestion et exécution automatique des règles récurrentes de points |

---

## §5 — FRONTEND (`Index.html`)

Fichier HTML/CSS/JS monofichier.

### Onglets

| Onglet | Contenu |
|--------|---------|
| 📊 Dashboard | Filtres croisés, sélecteur de graphique, graphique principal, card Commentaires, puis en bas : Records, Tendances, Jour le plus actif, Duo le plus fréquent |
| ✍️ Saisir un Lot | Constructeur de lignes de score (joueur + Top + points + date), saisie batch |
| ⚙️ Paramètres | Gestion joueurs, catégories, barème, presets de phrases, sous-onglet 🔧 Outils |
| 📝 Notes | Notes libres par joueur |
| 📜 Historique | Tableau paginé des entrées, filtres, édition description, suppression, sous-onglet 🔍 Journal d'audit |
| ❓ Guide | Documentation inline |

`🔧 Outils` (sous Paramètres, pas un onglet principal) : rapport de santé, nettoyage (zéros/orphelins/doublons/scores aberrants), détection/regroupement de lots répartis, groupes hérités, joueurs inactifs, points automatiques.

### Tchat flottant

Pas un onglet — un widget global (bouton 💬 `#chatToggleBtn` + panneau `#chatSidePanel`) superposé à toutes les pages, en dehors du système d'onglets. Desktop : bouton dans la navbar, panneau latéral sticky. Mobile : bouton flottant rond au-dessus de la barre de nav du bas, panneau plein écran. Un clic sur le bouton ouvre/ferme le panneau ; l'état ouvert/fermé est mémorisé en localStorage. Markdown complet, mentions `@Joueur` et `#Top` (avec autocomplétion), réponse à un message (aperçu cité avec avatar), horodatage, suppression de ses propres messages uniquement. Stockage dans la feuille `Chat` (auto-créée) via `ChatService`. Pas de push serveur possible (GAS) : sondage adaptatif (4s panneau ouvert / 20s fermé), avec badge de messages non lus quand le panneau est fermé.

### Types de graphique (Dashboard)

`Empilé` · `Groupé` · `Courbes` · `Radar` · `Donut` · `Classement`

Le type **Classement** calcule le total général par joueur et alimente la card **Commentaires**.

### Card Commentaires

Widget indépendant des graphiques, toujours visible dans le Dashboard. Affiche des phrases paramétriques générées à partir du classement courant. Entièrement configurable via des presets dans l'onglet Paramètres.

**Variables disponibles :** `{player}` `{pts}` `{gap}` `{behind}` `{rank}`

**Pools :** `first` `second` `third` `mid` `last` `tied` `solo`

### Système de presets de phrases

- Un preset "Défaut" est seedé automatiquement au premier lancement
- Presets custom : CRUD complet (créer depuis zéro ou copier un existant, renommer, supprimer)
- Stockage dans la feuille `Phrases` ; preset actif persiste en localStorage
- Repli automatique pool par pool sur les phrases usine si un pool est vide

### Barème des Tops

- **Tri strict par points croissants** : Les règles du barème sont systématiquement affichées par ordre croissant de points (`pts` croissant : négatifs en premier, zéro, puis positifs) au sein de chaque Top, sans notion d'ordre manuel ni boutons de réordonnancement / drag-and-drop.
- **Accès universel** : Accessible en consultation rapide (tiroir `?` / bouton navbar `#baremeBtn`), en raccourcis sur chaque ligne de saisie de lot, et en gestion complète dans l'onglet Paramètres.
- **Préservation physique** : Le `rowIndex` réel de la feuille Google Sheets est préservé pour que la mise à jour et la suppression de règles ciblent toujours la bonne ligne sans décalage.

### Saisie de lot & Mode Période

- **Mode « Un jour » vs « Une période »** : Permet d'assigner une date unique ou une plage `[Du, Au]` avec mode de calcul (`Répéter` le score sur chaque jour ou `Répartir` le total équitablement sur la durée).
- **Invariant de robustesse & recalcul dynamique** :
  - Écouteurs `input` et `change` sur les bornes début/fin déclenchant immédiatement la mise à jour du résumé du lot (`updateLotSummary()`), du mini-calendrier (`cal.refresh()`) et de l'aperçu textuel (`updateDatePreview()`).
  - Normalisation automatique des bornes inversées (`startInput > endInput`) sans blocage.
  - Recalcul instantané du lot sur les raccourcis de durée (`+3 j`, `+7 j`, `+14 j`, `+1 mois`), l'interrupteur de mode, le mode de score et « Appliquer à toutes les lignes ».
  - Cohérence stricte entre `lineDates()` et `daysBetweenInclusive()`.

### Patterns frontend clés

- `callServer()` — wrapper centralisé pour tous les appels `google.script.run`, avec gestion d'erreur
- `showToast()` — notifications non-bloquantes avec option undo (5 secondes)
- Le dernier classement affiché est gardé en mémoire pour permettre un "Nouveau tirage" sans rechargement
- Thème dark/light persisté en localStorage
- Sélection d'identité : si mot de passe défini → modale de confirmation → vérification côté serveur

### Filtres croisés

Joueurs (multi-select) · Catégories (multi-select) · Période (7j / mois / 3m / 6m / 1an / tout). Tous les graphiques et la card Commentaires respectent les filtres actifs.

---

## §6 — STYLE VISUEL

### Thème

Dark par défaut, light en override via `body.light`. Toujours tester les deux. Transition douce (`0.2s`) sur background et color.

### Palette — variables CSS

| Variable | Dark | Light | Usage |
|----------|------|-------|-------|
| `--bg` | `#0b0c10` | `#f0f2f5` | fond de page |
| `--card` | `#1f2833` | `#ffffff` | cartes, navbar, panneaux |
| `--border` | `#2a313d` | `#d1d5db` | séparateurs, contours |
| `--text` | `#e0e6ed` | `#1a202c` | texte principal |
| `--text-muted` | `#9aa5be` | `#4a5568` | labels, métadonnées, hints |
| `--accent` | `#ff4757` | `#e53e3e` | CTA, titres de marque, highlights |
| `--accent-hover` | `#ff6b81` | `#c53030` | état hover de l'accent |
| `--btn-alt` | `#353b48` | `#e2e8f0` | boutons secondaires, fonds alternatifs |

**Tokens sémantiques** (inchangés entre les thèmes) :

| Variable | Couleur | Usage |
|----------|---------|-------|
| `--success` | `#2ed573` | confirmation, données saines |
| `--error` | `#ff4757` | erreurs, suppressions |
| `--warn` | `#ffa502` / `#d97706` | avertissements |
| `--info` | `#7c8cff` / `#4f5fd6` | informations neutres |
| `--clean` | `#17a2b8` / `#0e7490` | données propres, statuts OK |

Toujours utiliser les variables — jamais de couleur hexadécimale directe dans le CSS.

### Typographie

Stack système : `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. Pas de font externe, pas de Google Fonts — priorité à la performance et au rendu natif.

Hiérarchie typique :

| Rôle | Taille | Poids |
|------|--------|-------|
| Titre de marque | `1rem` | `800` |
| Titre de section (`h2`) | `1.2rem` | par défaut |
| Label de section (`h3`) | `0.95rem` | par défaut |
| Corps | `0.88rem` | `400` |
| Label petit / badge | `0.72–0.78rem` | `600–700` |
| Micro-label | `0.65–0.7rem` | `700`, `uppercase` |

### Formes & espacement

- **Border-radius :** `8px` pour les éléments (inputs, tableaux, blocs) · `12px` pour les cartes · `20px` pour les pills/badges
- **Bordures :** `1px solid var(--border)` systématiquement · `1.5px` pour les éléments mis en avant
- **Ombres :** `0 4px 12px rgba(0,0,0,0.4)` pour la navbar — utiliser avec parcimonie
- **Cible tactile minimum :** `44px` (`--tap-min`) — toujours respecté sur les éléments interactifs

### Couleurs joueurs et catégories

Chaque joueur et chaque catégorie a une couleur hex définie dans le Sheet. Ces couleurs sont utilisées directement pour coloriser les graphiques, pills, avatars et badges. Ne jamais substituer une couleur arbitraire — toujours lire la couleur depuis les données.

### Transitions & animations

- Transitions standards : `0.15s` sur les états hover/active, `0.2s` sur les changements de thème
- Pas d'animation décorative sans raison fonctionnelle

---

## §7 — RÈGLES UX

### Avatar obligatoire partout

Dès qu'un nom de joueur apparaît dans l'UI (liste, tableau, graphique, filtre, commentaire, note, classement, saisie…), son avatar doit être affiché à côté. Aucune exception.

### Adaptabilité mobile (Index.html unique)

L'application utilise un fichier HTML unique (`Index.html`) entièrement responsive. Toute mise à jour (nouvel écran, nouveau composant, style modifié) doit s'adapter proprement aux petits écrans via CSS media queries. L'onglet **Notes** (ajout rapide depuis mobile) exige une attention particulière sur écran tactile.

### Identité obligatoire pour toute édition

Toute action qui modifie des données (créer, éditer, supprimer, dissocier, activer/désactiver…) doit passer par la vérification d'identité (`requireIdentity()`) avant exécution. Aucune exception, même pour un outil d'administration ou une action en un clic.

### Journalisation obligatoire

Toute action qui modifie des données doit être consignée dans le journal d'audit (`AuditService.log()`), avec l'auteur, l'action, la cible et un résumé du changement. Une action qui écrit dans le Sheet sans laisser de trace dans le journal est incomplète.

### Exhaustivité obligatoire — pas de fonctionnalité à moitié posée

Quand une fonctionnalité s'applique à un type de champ (markdown/mentions sur les descriptions, avatar sur un nom de joueur…), elle doit être posée sur **toutes** les instances de ce champ dans l'app, pas seulement celles rencontrées en premier. Avant de considérer une fonctionnalité terminée, lister explicitement tous les endroits où ce champ existe (grep sur son nom, son placeholder, son pattern d'input) et vérifier chacun un par un — ne pas se fier à la mémoire ou aux premiers exemples trouvés.

Exception à traiter au cas par cas, jamais par oubli : un champ qui partage un nom technique mais pas la même nature (ex. `meta` sert d'URL d'avatar pour un joueur mais de description pour un Top) n'hérite pas aveuglément du traitement — mais l'exception doit être identifiée et justifiée, jamais silencieuse.

### Quatre critères de qualité interface

Chaque écran, formulaire ou composant ajouté ou modifié doit être :

- **Ergonomique** — peu de clics pour l'action la plus fréquente, hiérarchie visuelle claire
- **Pratique** — résout le besoin réel sans étape superflue
- **Intuitif** — compréhensible sans explication, feedback immédiat sur chaque action
- **Beau** — cohérence visuelle (thème dark/light, couleurs joueurs/catégories, espacements)

---

## §8 — HYGIÈNE DE CODE

### Règles fondamentales

- **Complétude absolue** — aucun `TODO`, `FIXME`, placeholder, fonction vide. Tout ce qui est écrit est intégralement implémenté.
- **Code en anglais** — variables, fonctions. Les commentaires existants restent en français (convention historique du projet) : ne jamais lancer de chantier de traduction FR→EN sur les commentaires, même partiel. Nouveau commentaire : suivre le style déjà présent dans la fonction/le fichier édité. Les explications hors code sont en français.
- **Pas de questions** — analyser la demande et livrer directement.

### Principes de conception

- **DRY** — toute logique répétée (≥ 3 lignes) est factorisée immédiatement.
- **KISS** — solution la plus simple. Pas de sur-ingénierie.
- **YAGNI** — implémenter uniquement ce qui est demandé, sans spéculation.
- **SOLID** — responsabilité unique et séparation des préoccupations en priorité.
- **Composition > Héritage** — pas de classe ES6, objets littéraux, encapsulation stricte.
- **Fail Fast** — valider les entrées au plus tôt, message d'erreur explicite en cas d'état invalide.

### Qualité du code (JS/GAS)

- Nommage `camelCase`, verbes d'action, noms explicites.
- Fonctions courtes, responsabilité unique, return early.
- Commentaires uniquement pour le *pourquoi* non évident — jamais pour décrire ce que le code fait.
- Pas de classe ES6 — objets littéraux ou IIFE, cohérent avec le reste du codebase.
- Aucune constante hardcodée dans la logique : les valeurs configurables vont dans le Sheet ou en haut du fichier dans un bloc `CONFIG`.

### Changelog

**TOUJOURS mettre à jour `CHANGELOG.md`** à chaque changement livré (feature, fix, suppression) — aucune exception, même pour un changement jugé mineur. Une livraison sans entrée de changelog est incomplète.

Maintenir un `CHANGELOG.md` au format [Keep a Changelog](https://keepachangelog.com) avec **deux voix par entrée** :

- **Humanisé** — ce que ça change concrètement pour l'utilisateur, zéro jargon, une phrase par item.
- **Technique** — ce qui a changé dans le code (fichier, fonction, comportement).

```markdown
## [1.2.0] - 2026-07-08

### Ajouté
**Humanisé** : Les scores peuvent maintenant être saisis en lot avec une date différente par ligne.
**Technique** : `StorageService.appendBatch()` accepte un tableau d'entrées avec date individuelle.

### Corrigé
**Humanisé** : Le graphique Radar ne plantait plus quand un joueur n'avait aucun score.
**Technique** : `AnalyticsService.getRadarData()` retourne 0 au lieu de `undefined` pour les catégories vides.
```

Sections valides : `Ajouté` · `Modifié` · `Corrigé` · `Supprimé`. Les deux voix sont obligatoires pour chaque item — une entrée sans version humanisée est incomplète.

### Tester

Le projet dispose d'une suite de tests automatisés Node.js native (`npm test`, `npm run verify` via `node --test`, sans dépendance externe). Les tests couvrent la logique métier GAS via un harness VM (`tests/harness.js`) et le comportement DOM via des stubs légers (`tests/dom-stub.js`). Toujours exécuter `npm test` et `npm run verify` pour valider toute modification avant livraison.

### Commit & push (Double Déploiement Obligatoire)

Toute modification livrée doit être commit **et systématiquement poussée (`git push`)**. Le push déclenche l'auto-sync GitHub Actions (§10) qui déploie automatiquement le code vers **les deux cibles simultanément (« Site tops » et « Tops RDS »)**. Un commit gardé en local ou non poussé prive les deux instances des mises à jour. Ne jamais oublier de push sur les deux cibles, et **ne jamais demander la permission de committer/pousser** — c'est systématique et obligatoire.

**Compte GitHub officiel : `Arcxy2nd`** — Toujours utiliser `Arcxy2nd` pour toutes les opérations GitHub (`git push`, `gh`, etc.). Avant tout `pull`/`push`/`commit` distant, vérifier le compte actif via `gh auth status` et basculer sur `Arcxy2nd` si nécessaire (`gh auth switch --user Arcxy2nd`). Ne jamais utiliser d'autre compte (le second compte sur la machine s'appelle `aznan-triks`). **Le switch ne tient pas durablement entre les pushs** — revérifier `gh auth status` avant chaque push, même si un switch a déjà été fait dans la session.

### Pas de sondage en boucle (anti-polling / quota)

Lors de la vérification de l'avancement des tâches en arrière-plan ou des déploiements GitHub Actions (`gh run list`), **ne jamais sonder en boucle répétée (polling)** via des appels d'outils successifs rapprochés. Cela consomme inutilement le quota de requêtes. Attendre le délai nécessaire en une fois ou rendre la main.

---

## §9 — SKILLS — USAGE OBLIGATOIRE

Les skills installés doivent être **invoqués aux moments-clés**, pas ignorés. Invoquer via l'outil `Skill` (jamais lire le fichier SKILL.md à la main).

**Pas de fichiers de spec.** Le brainstorming se conclut par un design validé en conversation — ne jamais écrire de document dans `docs/superpowers/specs/`. Passer directement du design approuvé à `/superpowers:writing-plans`.

| Moment | Skill à invoquer |
|--------|-----------------|
| Avant toute nouvelle feature ou modification de comportement | `/superpowers:brainstorming` |
| Avant tout fix de bug (comprendre la cause) | `/superpowers:systematic-debugging` |
| Avant d'écrire un plan multi-étapes | `/superpowers:writing-plans` |
| Exécution d'un plan fourni en contexte | `/superpowers:executing-plans` |
| Après tout changement fonctionnel (vérifier dans l'app) | `/run` |
| Avant de déclarer "terminé" | `/superpowers:verification-before-completion` |
| Review du diff avant livraison | `/code-review` |

> ⚠️ Ce tableau ne prescrit que des skills réellement disponibles en session. Prescrire un skill absent = ordre inexécutable à chaque session.

---

## §10 — DÉPLOIEMENT

Web App GAS — exécutée en tant que le propriétaire, accessible à tout compte Google. Le code est déployé vers **deux copies** ("Site tops" et "Tops RDS", même code, Sheet différent), chacune derrière son propre lien court short.io stable.

Depuis la mise en place de la synchro automatique, chaque `git push` sur `main` déclenche un workflow GitHub Actions (`.github/workflows/deploy-gas.yml`) qui, pour chaque copie listée dans `deploy-targets.json` : pousse le code via `clasp`, archive l'ancien déploiement, en crée un nouveau (nouvelle URL `/exec`), puis repointe le lien short.io correspondant vers cette nouvelle URL. Plus de déploiement manuel dans l'éditeur GAS.

Procédure de mise en place initiale (une seule fois) : `SETUP-AUTOSYNC.md`. Détails historiques et note sur `SPREADSHEET_ID` : `DEPLOIEMENT.md`.

---
