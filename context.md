# CONTEXTE PROJET : TOP-DES-TOPS (v2026.09)

---

## RÈGLE IMPÉRATIVE — CONCISION EN DÉBUT DE SESSION

Au début de chaque session (rituel d'initialisation, prise de connaissance du contexte, premiers échanges), parler **peu, très peu, de manière extrêmement concise**. Pas de récapitulatif, pas de reformulation de la demande, pas de plan annoncé en prose — lire, comprendre, agir. Le détail et l'explication ne viennent qu'une fois le travail engagé, si nécessaire.

---

## RÈGLE IMPÉRATIVE — DÉPLOIEMENT SYSTÉMATIQUE SUR LES DEUX INSTANCES (« Site tops » & « Tops RDS »)

Depuis la bascule Vercel (v3.35.0, 2026-09-21), **un seul déploiement Vercel sert les deux instances** : chaque hôte est relié à son classeur par `tenants.json`. Toute modification livrée doit **IMPÉRATIVEMENT** être poussée (`git push` sur `main`) **ET** déployée par la CLI : `vercel deploy --prod --yes --scope troispiliers` (sans `--scope` : « Not authorized »). Le push seul ne déploie plus rien — le dépôt n'est volontairement **pas** relié à Vercel (voir §10).

## RÈGLE IMPÉRATIVE — MERGE ET DÉPLOIEMENT SYSTÉMATIQUES SANS DEMANDER

Dès qu'une tâche, un audit ou une PR est validé(e) par la suite de tests (`npm run verify` à 100%), **TOUJOURS** fusionner et pousser sur `main` pour déployer sans attendre. Ne **JAMAIS** poser la question ou demander l'autorisation (« Souhaitez-vous que je merge / déploie ? ») — exécuter l'action directement et confirmer une fois le déploiement lancé.

---

## RÈGLE IMPÉRATIVE — PORTABILITÉ DE LA MÉMOIRE

Toute évolution retenue sur la méthode de travail avec l'IA doit être écrite **dans ce fichier**, jamais seulement dans une mémoire externe/globale liée à un outil/LLM/machine précis. Le projet doit rester exploitable seul, peu importe le PC, l'outil ou le LLM utilisé.

## RÈGLE IMPÉRATIVE — FICHIER D'ÉTAT INTER-SESSIONS

`NEXT_SESSION.md` (racine du projet) suit l'état courant, mis à jour **en continu** (dès qu'une décision/bug/config a de la valeur pour la suite), jamais seulement en fin de session. 4 blocs stricts : État courant / Dernière session / Écarts / Rappels+Backlog (modèle `H:/IA/projets/AEVO3/NEXT_SESSION.md`, système généralisé à tout le vault le 2026-08-14). Lu en premier, avant ce fichier (§0). Ne remplace pas `CHANGELOG.md` (historique versionné du produit) ni `memory/MEMORY.md` (mémoire portable détaillée) — `NEXT_SESSION.md` est l'état condensé du moment présent.

## RÈGLE — PAS DE TCHAT DANS L'APPLICATION

Le tchat flottant a été retiré en v3.34.0 sur décision explicite de l'utilisateur (2026-09-21), après un refus erroné de le retirer la veille. Ne pas le réintroduire, ni sous forme de widget, ni sous forme d'onglet, sans demande explicite. L'onglet `Chat` des classeurs existants est laissé en place mais n'est plus lu ni écrit par l'application ; `tests/chat-removed.test.js` fige cette absence.

## RÈGLE — PUBLIABLE = ANGLAIS

Tout artefact destiné à être publié (repo, README, commits, releases) : anglais, même si la conversation se fait en français. Le code (§8) est déjà en anglais ; cette règle couvre aussi commits, README, releases.

## RÈGLE — ÉCART JUSTIFIÉ

Tout fichier rédigé (plan, note) qui déroge à une règle de ce fichier doit porter la justification inline, sinon l'écart est invalide.

## RÈGLE — PAS DE RAPPEL DE DETTE NON SOLLICITÉE

Ne pas rappeler une dette non sollicitée (fix pas fait, push pas fait) sauf si l'utilisateur demande l'état.

## RÈGLE IMPÉRATIVE — INTERDICTION D'INTERAGIR AVEC LES DONNÉES RÉELLES

Interdiction formelle et absolue d'interagir avec les données réelles des sites déployés (« Site tops » & « Tops RDS ») ou leurs Google Sheets — que ce soit pour tester, corriger, nettoyer, déboguer ou vérifier une hypothèse. Toute manipulation de données (lecture destructive, écriture, suppression, script one-off) se fait exclusivement contre le harness local (`tests/frontend/serve.js` + fixtures). Un joueur a déjà été perdu suite à une intervention sur les vraies données — voir §7 « Identité obligatoire » et la note d'incident associée. Vérifier explicitement l'URL/le contexte avant toute action qui touche à des données ; en cas de doute, s'arrêter et demander.

## RÈGLE IMPÉRATIVE — INTERDICTION DE L'INTERFACE OPTIMISTE (PAS D'OPTIMISTIC UI)

Toute opération modifiant des données (ajout de points, édition d'historique, modification de note, création ou suppression de joueur/catégorie) doit **obligatoirement attendre la confirmation synchrone du serveur Apps Script** (`google.script.run`) avant de refléter le changement dans le DOM ou de notifier l'utilisateur.
- **Motif / Retour d'expérience** : Une tentative d'interface optimiste fin juillet 2026 a provoqué des incohérences visuelles graves, des fusions erronées de lots et des désynchronisations avec Google Sheets en cas d'erreur réseau masquée. L'utilisateur a formellement rejeté et interdit l'Optimistic UI.
- **Consigne** : Le cache client `localStorage` (`tdt_*_dashboard_cache`) est réservé exclusivement à la réhydratation instantanée en lecture au démarrage (pattern *stale-while-revalidate*). Ne jamais insérer de ligne préemptivement dans le DOM sans accusé de réception formel du serveur.

---

## RÈGLE ERGONOMIQUE — SAISIE RÉTROSPECTIVE & DIRECTION TEMPORELLE DES PLAGES

L'application servant à enregistrer des activités et scores réels, tous les raccourcis et presets temporels de saisie doivent être **strictement orientés vers le passé (rétrospectifs)** :
1. **Direction du calcul** : Le pivot est la date de fin (par défaut aujourd'hui ou le champ « Au »). Les raccourcis de durée calculent la date de début en remontant dans le passé (`start = end - (n - 1) jours`).
2. **Sémantique des libellés** : Utiliser des libellés explicites orientés passé (`-3 j`, `-7 j`, `-14 j`, `-1 mois` ou `X derniers jours`), jamais d'ajouts prospectifs (`+3 j`, `+7 j`) dans le futur pour l'enregistrement de scores réels.
3. **Application universelle** : Cette règle s'applique à la saisie par lot, aux filtres de dates de l'historique, aux notes et aux Tops Alternatifs.

## RÈGLE ERGONOMIQUE — COMPACITÉ HORIZONTALE & DENSITÉ DES FILTRES

Les sections de consultation et d'administration (Historique, Journal, Notes) doivent optimiser l'espace horizontal sur écran large :
1. **En-tête unifié** : Titre à gauche, recherche et boutons d'actions groupés sur la même ligne à droite.
2. **Filtres temporels compacts** : Champs de dates « Du » et « Au » côte à côte avec raccourcis de période immédiatement alignés sur la même ligne horizontale.
3. **Organisation multi-colonnes des filtres d'entités** : Répartir les groupes de puces/chips (joueurs, catégories) en colonnes équilibrées (ex: joueurs à gauche, catégories à droite) avec marges resserrées afin de réduire la hauteur verticale et combler le vide à droite.

## RÈGLE ERGONOMIQUE — RÉORDONNANCEMENT EXCLUSIF PAR BOUTONS ▲/▼ (PAS DE DRAG & DROP)

Le réordonnancement manuel des listes ordonnables (Joueurs et Catégories dans Paramètres, phrases de commentaires personnalisées) s'effectue **exclusivement via des boutons d'incrément/décrément unitaire ▲ et ▼**, sans composant de glisser-déposer (Drag & Drop).
- **Motif / Retour d'expérience** : Une tentative d'implémenter un glisser-déposer universel tactile/souris mi-août 2026 s'est heurtée à des conflits majeurs sur mobile (interférence avec le défilement vertical tactile) et sur desktop (blocage involontaire de la sélection de texte dans les champs). L'utilisateur a exigé l'abandon du drag & drop au profit de boutons flèches.
- **Consigne** : Le tri par la colonne `Ordre` doit être strictement partitionné par groupe/catégorie (ne jamais trier toute la feuille en bloc). Le DOM doit être rafraîchi directement à partir de la réponse fraîche du serveur sans réinjecter d'état transitoire de cache local pour éviter tout flash d'inversion d'ordre. Pour le Barème, rappel : tout réordonnancement manuel a été supprimé au profit d'un tri strict par points croissants (§5).

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

Hébergée sur **Vercel** depuis la v3.35.0 (2026-09-21) : les fonctions serveur exécutent le même `Code.gs` qu'Apps Script dans un contexte isolé, et les données restent dans Google Sheets, lues et écrites par un compte de service. Aucune base de données externe.

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
| Déploiement | Vercel (projet `tops-des-tops-vercel`, CLI) — un hôte par instance, résolu par `tenants.json` |

Pas de build, pas de framework, aucune dépendance npm à l'exécution. Une seule librairie d'affichage est chargée depuis un CDN dans `<head>` (Chart.js 4.5.1 ; GSAP et Lenis ont été retirés en v2.2.0 et v3.28.0 au profit de l'API Web Animations native pour alléger le bundle et fluidifier le rendu) et trois bibliothèques sont chargées à la demande au premier export (jsPDF, SheetJS, fflate) — toutes épinglées à une version précise : une version flottante casserait les deux instances sans qu'aucun commit ne soit poussé. Le HTML est servi tel quel par la fonction Vercel `api/app.js` (plus par `HtmlService` depuis la v3.35.0).

**Pont Discord (BotGhost)** : BotGhost n'envoie que des requêtes GET et ne suit pas les redirections ; une Web App Apps Script répond par une redirection 302, donc le bot n'a jamais pu l'utiliser directement. Depuis Vercel, `GET /api/discord` répond en 200 sans redirection : aucun serveur intermédiaire n'est nécessaire. (Un relais Cloudflare Worker avait été documenté pour contourner la redirection, mais il n'a jamais été mis en place.)

**Backend Vercel (en production depuis la v3.35.0)** : les fonctions serverless exécutent le vrai `Code.gs` dans un contexte `vm` par requête. Les écritures sont accumulées dans un journal en mémoire puis rejouées en **un seul `spreadsheets.batchUpdate` atomique** en fin de requête — une exception jette tout le lot (seule survivante : la ligne d'audit d'un échec d'authentification). `LockService` et `PropertiesService`, absents de Vercel, sont portés par deux onglets techniques du classeur : `ScriptLock` (cellule A1 = bail horodaté, verrou « écrire puis relire ») et `ScriptProperties` (Key/Value). La variable Vercel `TDT_READ_ONLY=1` referme le backend en lecture seule sans redéploiement.

**Frontend sous Vercel (Plan 4)** : `Index.html` est servi par la fonction `api/app.js`, qui lui concatène le script d'identifiant d'instance que `doGet` ajoutait (dérivé du classeur du tenant, surchargeable par `instanceId` dans `tenants.json` pour ne pas invalider les clés `tdt_<id>_*` existantes ; l'identifiant est échappé `\u003c` pour interdire toute sortie de la balise `<script>`). Côté client, `callServer()` passe par un transport à double voie : `google.script.run` si l'objet existe, sinon `POST /api/rpc` — l'application reste donc exécutable sous Apps Script comme sous Vercel. Le runtime ne télécharge plus tous les onglets à chaque requête : chargement à la demande, avec bascule en un lot unique au-delà de deux onglets touchés (une lecture ciblée ne lit plus l'historique).

**Intégrations sous Vercel (Plan 5)** : le déclencheur horaire d'Apps Script est remplacé par un drapeau `auto_trigger_installed` dans l'onglet technique `ScriptProperties`, lu par une tâche planifiée Vercel (`api/cron/auto-points`, protégée par `CRON_SECRET`). **Le plan Vercel Hobby ne permet qu'une exécution par jour** : la tâche tourne à 02:00 UTC au lieu de toutes les heures — les règles d'automatisation restent journalières/hebdomadaires/mensuelles, seule l'heure d'application change. Le pont Discord devient `GET /api/discord` : une fonction Vercel répond en 200 sans la redirection 302 d'Apps Script, ce qui rend le pont enfin utilisable par BotGhost. Le secret partagé vit dans la variable Vercel `DISCORD_BRIDGE_SECRET`, injectée dans le bac à sable pour que `DiscordBridge.gs` valide contre la même valeur — une seule source. Les instantanés passent par l'API Drive v3 avec le compte de service : la copie lui appartient et le propriétaire humain y accède par son lien.

**Principe du runtime Vercel** : les fonctions Vercel `api/*` exécutent le vrai `Code.gs` (+ `AutoPoints.gs`, `DiscordBridge.gs`) **sans modification**, dans un contexte `vm` neuf par requête, en lui fournissant sous Node les services Google qu'il appelle (`lib/gas-runtime/`, même principe que `tests/harness.js`). Conséquence : toute évolution backend continue de se faire dans `Code.gs`, jamais dans une copie Node. Une fonction `api*` est considérée comme une écriture si elle a un paramètre `author` (règle vérifiée contre `_MUTATING_APIS` par test).

---

## §3 — DONNÉES (Google Sheets)

### Structure des feuilles

```
History       : Date | Player | Category | Points | Description | [GroupId] | [Saiseur] | [BaremeId]
Players       : Name | Avatar URL | Hex color | Password (optionnel, jamais affiché dans l'UI) | [Ordre] | [Discord ID]
Categories    : Name | Description | Emoji | Hex color | [Ordre]
Notes         : Date | Player | Note text | [NoteId] | [CrééPar] | [ModifiéPar] | [ModifiéLe]
Bareme        : Top | Action (text) | Points | [Id]  (pas de colonne Ordre, tri strict par points croissants)
Phrases       : Preset | Pool | Phrase | [Ordre]
AuditLog      : Timestamp | Auteur | Action | Entité | Avant | Après | Détail | [Snapshot] | [AnnuléLe]
Settings      : Key | Value
AltCategories : Name | Description | Emoji | Hex color | [Ordre]
AltHistory    : Date | Player | Category | Points | Description | [RefHistoryRowId] | [GroupId] | [Saiseur]
AutoRules     : ID | Joueur | Catégorie | Points | Description | Fréquence | Intervalle | JoursSemaine | JourMois | DateDébut | ProchaineExécution | DernièreExécution | Actif | CrééPar
Aggregates    : Vue matérialisée persistante (totaux, métriques par joueur/catégorie/mois, lastEvent, globalBest)
```

Les feuilles **Notes**, **Bareme**, **Phrases**, **AuditLog**, **Settings**, **AltCategories**, **AltHistory**, **AutoRules** et **Aggregates** sont optionnelles — créées automatiquement si absentes.

### Traçabilité & Stockage physique de l'état courant (Notes)

Les métadonnées décrivant l'état courant d'une entité (`NoteId`, `CrééPar`, `ModifiéPar`, `ModifiéLe` pour les notes) sont **obligatoirement stockées dans les colonnes physiques de la feuille correspondante**.
- **Retour d'expérience** : Une tentative de dériver dynamiquement les auteurs et dates de modification à la volée depuis l'historique du Journal d'audit fin juillet 2026 a provoqué des latences inacceptables, des échecs d'affichage et des désynchronisations lors des suppressions de lignes.
- **Règle** : L'AuditLog est réservé à la traçabilité chronologique et aux annulations (rollback). Ne jamais utiliser l'AuditLog comme substitut à des colonnes de données dans les feuilles principales.

### Ligne 1 : en-tête non garanti

`History`, `Players` et `Categories` ne sont **jamais** créées par l'app (elle refuse de démarrer sans elles) : elles ont été faites à la main et, dans les deux instances réelles, **pouvaient ne pas avoir de ligne de titres** (la ligne 1 contenait une vraie donnée). Depuis la v3.23.0, l'application assure la génération transparente des en-têtes officiels en ligne 1 (`CANONICAL_SHEET_HEADERS` et `_ensureSheetHeaders()`).
Néanmoins, pour garantir une résilience totale et éviter de masquer le premier élément ou de créer des doublons, toute lecture doit continuer à passer strictement par `_readDataRows()` / `_firstDataRow()` / `_headerOffsetFromValues()` (socle `SHEET_HEADERS` + `_isHeaderRow()` en tête de `Code.gs`). Jamais de `data.slice(1)`, de `getRange(2, …)`, de `rowIndex = i + 2` ni de garde `rowIndex < 2` en dur. Vaut aussi pour les écritures : ne jamais écrire de libellé en ligne 1 sans avoir vérifié l'offset.

---

## §4 — BACKEND (`Code.gs`, `AutoPoints.gs` & `DiscordBridge.gs`)

Tous les services sont des objets littéraux ou IIFE, sans classe ES6. Pattern : service → fonctions `api*` exposées à l'appel GAS via `callServer()`.

| Service | Rôle |
|---------|------|
| `ConfigService` | Connexion au Sheet, cache des onglets, `SPREADSHEET_ID` via Script Properties |
| `SettingsService` | CRUD joueurs et catégories, renommage en cascade dans History |
| `StorageService` | Lecture/écriture History, gestion des lots (groupement, répartition par plage de dates) |
| `NotesService` | CRUD notes par joueur, auto-création de la feuille |
| `AnalyticsService` | Agrégation des scores filtrés (joueurs, catégories, période), données pour graphiques, santé des données |
| `BaremeService` | CRUD règles de points (barème), tri croissant automatique par points, auto-création de la feuille |
| `BaremeMatcher` | Détection de correspondances entre descriptions d'entrées et règles du barème (Dice bigrammes + fenêtres de mots) |
| `PhrasesService` | CRUD phrases de commentaires, gestion des presets, auto-création de la feuille |
| `AuditService` | Journalisation des opérations, annulation d'écritures, snapshots, auto-création de la feuille |
| `SettingsSheetService` | Gestion des paramètres de l'application dans la feuille Settings |
| `AltSettingsService` / `AltStorageService` | Création de la feuille et lecture des Tops alternatifs (CRUD via `SettingsService`, type `AltCategories`), scores du Top Alt |
| `AutoRulesService` | Gestion et exécution automatique des règles récurrentes de points |
| `AggregatesService` | Maintien incrémental de la vue matérialisée (totaux, métriques, lastEvent, globalBest) avec cache multi-niveaux |
| `BackupService` | Création de copies complètes / instantanés (snapshots) sur Google Drive |
| `DiscordBridge` (`DiscordBridge.gs`) | Pont HTTP GET pour les commandes Discord / BotGhost, validation du token partagé `DISCORD_BRIDGE_SECRET` |

---

## §5 — FRONTEND (`Index.html`)

Fichier HTML/CSS/JS monofichier.

### Onglets

| Onglet | Contenu |
|--------|---------|
| 📊 Dashboard | Filtres croisés, sélecteur de graphique, graphique principal, card Commentaires, Hub Statistiques repliable (5 volets à chargement à la demande : Records, Tendances, Jour actif, Combos, Mentions) |
| ✍️ Saisir un Lot | Constructeur de lignes de score (joueur + Top + points + date), saisie batch, support des Tops Alternatifs et sous-tops |
| ⚙️ Paramètres | Gestion joueurs, catégories, barème, presets de phrases, automatisations, sous-onglet 🔧 Outils |
| 📝 Notes | Notes libres par joueur |
| 📜 Historique | Tableau paginé des entrées, sélection groupée in-memory avec case maîtresse de lot, filtres, édition description/lot, suppression, sous-onglet 🔍 Journal d'audit (avec annulation 1-clic) |
| ❓ Guide | Documentation inline thématique et recherche dynamique |

`🔧 Outils` (sous Paramètres, pas un onglet principal) : rapport de santé (avec efficacité du cache, tuile règle du barème introuvable et détection d'homonymes), nettoyage (zéros/orphelins/doublons ; les outils "scores aberrants" et "joueurs inactifs" ont été retirés en v3.15.1), classement par règle du barème par ressemblance avec seuil réglable (`bareme_match_threshold`), détection/regroupement de lots répartis, groupes hérités, points automatiques, recalcul des agrégats et création d'instantanés (snapshots Google Drive).

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
- **Rattachement par Id & conservation de la description** : Chaque règle possède un identifiant pérenne (`Bareme.Id`). Lors de la saisie (Saisir un Lot) ou de l'édition d'une entrée, le clic sur une règle pré-remplit les points et lie la règle (`History.BaremeId`) tout en conservant la description si elle est déjà renseignée.
- **Affichage & filtrage dans l'Historique** : Une pastille `📏 <action>` s'affiche sur chaque entrée classée. Un filtre dédié (`#histBaremeFilter`) permet de filtrer l'Historique par règle ou de lister les entrées sans règle. Si une règle liée a été supprimée, la pastille n'est plus affichée et l'entrée est comptabilisée dans la tuile « Règle du barème introuvable » du panneau Santé.
- **Préservation physique** : Le `rowIndex` réel de la feuille Google Sheets est préservé pour que la mise à jour et la suppression de règles ciblent toujours la bonne ligne sans décalage.

### Saisie de lot & Mode Période

- **Mode « Un jour » vs « Une période »** : Permet d'assigner une date unique ou une plage `[Du, Au]` avec mode de calcul. Le mode par défaut s'initialise **obligatoirement sur « Un total à répartir » (`distribute`)** (inversé en v3.30.17, remplaçant la répétition quotidienne historique `repeat` qui provoquait des saisies excessives involontaires).
- **Invariant de robustesse & recalcul dynamique** :
  - Écouteurs `input` et `change` sur les bornes début/fin déclenchant immédiatement la mise à jour du résumé du lot (`updateLotSummary()`), du mini-calendrier (`cal.refresh()`) et de l'aperçu textuel (`updateDatePreview()`).
  - Normalisation automatique des bornes inversées (`startInput > endInput`) sans blocage.
  - Recalcul instantané du lot sur les raccourcis de durée rétrospectifs (`-3 j`, `-7 j`, `-14 j`, `-1 mois`), l'interrupteur de mode, le mode de score et « Appliquer à toutes les lignes ».
  - Cohérence stricte entre `lineDates()` et `daysBetweenInclusive()`.

### Patterns frontend clés

- `callServer()` — wrapper centralisé pour tous les appels `google.script.run`, avec gestion d'erreur et transmission automatique du mot de passe de session (`_identityPassword`) pour les fonctions de mutation listées dans `_MUTATING_APIS`. **Invariant strict** : Tout appel client vers un endpoint mutant doit fournir explicitement tous les arguments intermédiaires (y compris `null` pour `rowIndex` en cas d'ADD) afin que `_identityPassword` arrive toujours sur le paramètre `password` dans `Code.gs`. Exclusion stricte de `fn === 'apiVerifyIdentity'` des intercepteurs automatiques d'erreur pour éviter toute récursion infinie de modale.
- `showToast()` — notifications non-bloquantes avec option undo (5 secondes)
- Démarrage instantané via bootstrap composite (`apiGetBootstrapData`) en 1 seul roundtrip RPC regroupant les 10 requêtes d'initialisation, avec stratégie stale-while-revalidate (`tdt_dashboard_cache`) et repli `fallbackBootLoad()`
- Le dernier classement affiché est gardé en mémoire pour permettre un "Nouveau tirage" sans rechargement
- Thème dark/light persisté en localStorage (avec classe temporaire `body.theme-switching` neutralisant les transitions pour éliminer les flashs de couleur)
- Sélection d'identité & Cloisonnement multi-instances : si mot de passe défini dans `Players` (stocké en clair pour les gestionnaires humains, suite à l'annulation du hachage v3.21.0).
  - **Cloisonnement inter-liens (`window.__APP_INSTANCE_ID__`)** : `doGet` injecte l'identifiant du script via `output.append()`. Toutes les clés de stockage (`localStorage`, `sessionStorage`) sont préfixées (`tdt_${instanceId}_*`), éliminant toute collision ou déconnexion fantôme entre instances déployées sous le même domaine Google (*Site tops* vs *Tops RDS*), avec migration transparente de l'ancienne clé non préfixée.
  - **Persistance de mot de passe en `sessionStorage`** : `_identityPassword` est mémorisé en `sessionStorage` (détruit à la fermeture de l'onglet, survit aux rechargements et mises en veille mobile), avec repli transparent en RAM.
  - **Interception & Reprise automatique (`requireIdentity(onVerified)`)** : si un joueur protégé est sélectionné et la session non authentifiée, la modale de mot de passe s'ouvre proactivement et rejoue automatiquement l'action interrompue dès validation. Dans le menu « Qui suis-je ? », un badge `🔒` s'affiche si la session nécessite un mot de passe et cliquer sur son nom ouvre directement la modale. Renommer son propre profil met à jour l'identité locale sans déconnexion. Validation systématique par `requireAuthor(author, password)` côté serveur sur toutes les fonctions d'écriture.
- Filtrage in-memory côté client sans requête réseau lorsque seules les puces joueurs/catégories changent à dates constantes
- Éléments flottants ancrés dynamiquement via `anchorFloating()` et modales gérées par pile `openModal()` / `closeModal()` avec capture Échap, piège de tabulation et retour de focus
- Assemblage groupé du DOM via `DocumentFragment` pour éliminer le layout thrashing lors du rendu des listes (Historique, Notes)

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

### Adaptabilité mobile & Unification mono-fichier stricte (Interdiction de Mobile.html)

L'application utilise un fichier HTML unique (`Index.html`) entièrement responsive.
- **Retour d'expérience (abandon de `Mobile.html`)** : Un fichier dédié `Mobile.html` avait été introduit début juillet 2026 pour séparer l'affichage mobile. Cette approche par fichiers multiples a provoqué des désynchronisations constantes de logique, des régressions de déploiement et une surcharge de maintenance. `Mobile.html` a été définitivement supprimé en v2.1.0 (29/07/2026).
- **Règle absolue** : Interdiction formelle de recréer un fichier HTML séparé pour le mobile. Toute l'interface (desktop et mobile) réside obligatoirement dans `Index.html`.
- **Navigation mobile** : La barre de navigation basse (`#mobileBottomNav`) doit être ancrée directement à la racine de `<body>` (jamais dans un conteneur enfant avec filtre CSS ou `backdrop-filter`, ce qui détruit le positionnement fixe sur Safari/iOS).
- Toute mise à jour (nouvel écran, nouveau composant, style modifié) doit s'adapter proprement aux petits écrans via CSS media queries. L'onglet **Notes** (ajout rapide depuis mobile) exige une attention particulière sur écran tactile.

### Identité obligatoire pour toute édition

Toute action qui modifie des données (créer, éditer, supprimer, dissocier, activer/désactiver…) doit passer par la vérification d'identité (`requireIdentity()`) avant exécution. Aucune exception, même pour un outil d'administration ou une action en un clic.

- **Normalisation systématique des cellules d'identité (Sheets)** : Dans `Code.gs` (`_normalizeSecretCell`, `SettingsService.verifyIdentity`, `getEntities`, `requireAuthor`, etc.), toute comparaison de nom ou mot de passe de joueur doit obligatoirement être convertie en chaîne, débarrassée des caractères invisibles ou de largeur nulle (U+200B–U+200D, U+FEFF via `_normalizeSecretCell`) et trimmée, tout en gérant les mots de passe numériques (y compris `'0'`). Ceci immunise le système contre les espaces invisibles saisis dans Google Sheets et les conversions de types de l'API Sheets.
- **Ouverture instantanée à la sélection & Réconciliation de mot de passe retiré** : Le clic sur un joueur dans le menu d'identité est strictement immédiat (0 ms) : s'il a un mot de passe (`p.hasPassword`), `openIdentityPwdModal(p)` s'ouvre sur-le-champ sans appel réseau préalable. L'ancienne sonde bloquante `unlockOrPrompt` (v3.30.22) a été éliminée en v3.33.2 car elle introduisait 1,5 à 3s de latence réseau au clic. Si le mot de passe a été retiré dans la feuille Google Sheets, la validation (champ vide ou saisi) par `submitIdentityPwd` reçoit `granted: true`, efface automatiquement `p.hasPassword = false` et met à jour le cache local.
- **Préservation des formulaires modaux** : Les modales de saisie ou d'édition complexe (`openBulkEditModal`, `openEditAutoRuleModal`, etc.) ne doivent jamais appeler `closeModal()` avant la vérification `requireIdentity()`. En cas de session expirée ou mot de passe manquant, la modale reste intacte et la saisie de l'utilisateur est intégralement préservée jusqu'à validation.
- **Alignement strict des signatures d'appels mutants** : Dans `Index.html`, pour toute fonction déclarée dans `_MUTATING_APIS`, `callServer` injecte le mot de passe en dernier argument. L'appelant doit impérativement fournir la liste exhaustive des arguments intermédiaires (dont `null` pour `rowIndex` lors d'un `ADD`) pour éviter tout décalage d'argument sur le serveur.

### Journalisation obligatoire

Toute action qui modifie des données doit être consignée dans le journal d'audit (`AuditService.log()`), avec l'auteur, l'action, la cible et un résumé du changement. Une action qui écrit dans le Sheet sans laisser de trace dans le journal est incomplète.

### Adressage strict par rowIndex et protection contre les homonymes

Toute manipulation d'entité existante (Joueur, Top, Barème, Phrase, Note, Historique) doit cibler la ligne physique par son numéro de ligne exact (`rowIndex`) combiné à une vérification du libellé attendu (`expectedName`), et **jamais par nom seul sur toute la feuille**. Si deux joueurs portent le même nom, le ciblage par nom modifie ou supprime silencieusement la première occurrence trouvée. En cas d'homonymie détectée, le renommage est strictement bloqué par le serveur. Ne jamais implémenter de mécanisme de fusion automatique d'homonymes — cela violerait l'intégrité des données réelles (incident documenté).

### Exhaustivité obligatoire — pas de fonctionnalité à moitié posée

Quand une fonctionnalité s'applique à un type de champ (markdown/mentions sur les descriptions, avatar sur un nom de joueur…), elle doit être posée sur **toutes** les instances de ce champ dans l'app, pas seulement celles rencontrées en premier. Avant de considérer une fonctionnalité terminée, lister explicitement tous les endroits où ce champ existe (grep sur son nom, son placeholder, son pattern d'input) et vérifier chacun un par un — ne pas se fier à la mémoire ou aux premiers exemples trouvés.

Exception à traiter au cas par cas, jamais par oubli : un champ qui partage un nom technique mais pas la même nature (ex. `meta` sert d'URL d'avatar pour un joueur mais de description pour un Top) n'hérite pas aveuglément du traitement — mais l'exception doit être identifiée et justifiée, jamais silencieuse.

### Protection contre la fermeture accidentelle des modales

Les fenêtres modales (`openModal()`, `#modalBackdrop`) ne doivent **jamais se fermer lors d'un clic sur l'arrière-plan semi-transparent** (décision v1.1.0, renforcée v3.17.0). La fermeture s'effectue exclusivement par action explicite (bouton Annuler / Fermer) ou touche Échap (`_modalStack`), pour empêcher toute perte accidentelle de saisie non validée.

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
- **Sécurité des injections (XSS)** : Neutralisation systématique de toute donnée dynamique interpolée dans l'interface (`escapeHtml()` obligatoire sur les chaînes de texte, descriptions, noms, métadonnées et URLs d'avatar `img.src` ; `cssUrl()` pour les propriétés CSSOM de fond). Interdiction d'injecter des données brutes en `innerHTML`.
- **Mise en cache sûre (limite d'octets Google)** : Ne jamais utiliser un calcul de taille en caractères (`.length`) ni un `cache.put()` nu sur des données variables contenant des caractères accentués, emojis ou paires de substituts UTF-8. Passer systématiquement par les helpers dédiés `_byteLength()`, `_cachePutChunked()` et `_cacheGetChunked()` bornés en octets réels (`CONFIG.CACHE_MAX_BYTES`).
- **Service de l'application** : `Index.html` est servi tel quel par `api/app.js` (plus de `createHtmlOutputFromFile()` ni de template GAS depuis la v3.35.0) ; le workflow de déploiement Apps Script et son étape `strip-comments.js` ont été retirés avec l'outillage GAS.
- **Synchronisation synchrone Sheets API v4 (`SpreadsheetApp.flush()`)** : Depuis v3.30.0, la lecture rapide passe par Sheets API v4 REST (`_fetchSheetValues`). Les écritures `SpreadsheetApp` (`setValues()`, `appendRow()`) restent dans le cache d'écriture local de GAS et sont invisibles pour l'API REST v4 sans synchronisation explicite. Tout bloc d'écriture de données doit **obligatoirement appeler `SpreadsheetApp.flush()`** avant toute relecture immédiate via l'API REST (incident résolu en v3.30.8).
- **Gestion des dates de cellules Sheets API v4 (`_parseDateCell`)** : Sheets API v4 avec `SERIAL_NUMBER` retourne les dates en numéros de série (jours depuis le 30/12/1899). Interdiction absolue de faire `new Date(val)` direct sur une cellule lue via `_fetchSheetValues`, ce qui génère l'anomalie « 01/01/1970 » (valeur interprétée en millisecondes). Passer systématiquement par `_parseDateCell()` (backend) et `_parseLocalDateWithNow()` / garde `'—'` (frontend) (résolu en v3.30.14).
- **Reparentage DOM déterministe (`appendChild` vs `insertBefore`)** : Dans les interfaces dynamiques où des éléments changent de conteneur (ex. `setDateMode` basculant entre jour unique et période), proscrire `insertBefore` ciblant un élément potentiellement reparenté ailleurs, ce qui lève une `DOMException: NotFoundError` fatale sous les navigateurs stricts. Utiliser des séquences directes d'`appendChild` pour réinsérer les éléments dans l'ordre attendu (résolu en v3.30.15).
- **Ordre d'initialisation frontend & Prévention TDZ (`ReferenceError`)** : Dans `Index.html`, toutes les constantes globales, préfixes d'instance (`window.__APP_INSTANCE_ID__`) et clés de stockage/cache (`SETTINGS_CACHE_KEY`, `APP_SETTINGS_CACHE_KEY`, `DASHBOARD_CACHE_KEY`, `PHRASES_STORAGE_KEY`) doivent être **impérativement déclarées tout en haut du bloc script**, avant tout appel à `syncIdentityFromStorage()` ou au bootstrap composite. Tout appel prématuré à une fonction accédant à ces variables avant leur déclaration déclenche une erreur fatale `ReferenceError` TDZ bloquant l'initialisation du DOM (incident résolu en v3.30.21).

### Changelog

**TOUJOURS mettre à jour `CHANGELOG.md`** à chaque changement livré (feature, fix, suppression) — aucune exception, même pour un changement jugé mineur. Une livraison sans entrée de changelog est incomplète.

Maintenir un `CHANGELOG.md` au format [Keep a Changelog](https://keepachangelog.com) avec **deux voix par entrée** :

- **Numérotation SemVer stricte** : Incrémenter la version mineure (`x.Y.0`) pour tout jalon fonctionnel, nouvelle fonctionnalité ou refonte significative. Réserver les patchs (`x.y.Z`) aux correctifs de bugs ou ajustements mineurs. Ne jamais créer des dizaines de micro-patchs artificiels pour des features majeures.
- **Intégrité absolue de l'historique (Interdiction de condenser ou tronquer)** : Lors des passes de nettoyage, de restructuration ou d'audit, **interdiction formelle de supprimer, résumer ou fusionner des puces existantes du `CHANGELOG.md`**. Chaque entrée publiée est contractuelle et définitive.
- **Étanchéité stricte des versions majeures** : Interdiction de renuméroter ou de faire glisser des modifications entre versions majeures distinctes (respect strict de la frontière v2.x vs v3.x).
- **Humanisé** — **Ultra-concis, direct et percutant**. Strictement **1 seule phrase courte** (2 maximum absolu si multi-sujet), zéro jargon, zéro bavardage, zéro narration/storytelling de contexte ("auparavant...", "un joueur pouvait..."). Décrire uniquement le gain/changement concret immédiat pour l'utilisateur.
- **Technique** — ce qui a changé dans le code (fichier, fonction, comportement).

```markdown
## [1.2.0] - 2026-07-08

### Ajouté
**Humanisé** : Les scores peuvent maintenant être saisis en lot avec une date différente par ligne.
**Technique** : `StorageService.appendBatch()` accepte un tableau d'entrées avec date individuelle.

### Corrigé
**Humanisé** : Le graphique Radar ne plante plus quand un joueur n'a aucun score.
**Technique** : `AnalyticsService.getRadarData()` retourne 0 au lieu de `undefined` pour les catégories vides.
```

Sections valides : `Ajouté` · `Modifié` · `Corrigé` · `Supprimé` · `Sécurité`. Les deux voix sont obligatoires pour chaque item — une entrée sans version humanisée est incomplète.

### Tester

Le projet dispose d'une suite de tests automatisés Node.js native (`npm test`, `npm run verify` via `node --test`, sans dépendance externe). Les tests couvrent la logique métier GAS via un harness VM (`tests/harness.js`) et le comportement DOM via des stubs légers (`tests/dom-stub.js`). Toujours exécuter `npm test` et `npm run verify` pour valider toute modification avant livraison.

### Commit & push (Double Déploiement Obligatoire)

Toute modification livrée doit être commit **et systématiquement poussée (`git push`)**, puis **déployée** par `vercel deploy --prod --yes --scope troispiliers` (§10) — un seul déploiement met à jour **les deux instances à la fois (« Site tops » et « Tops RDS »)**. Un commit non poussé ou non déployé prive les deux instances des mises à jour. **Ne jamais demander la permission de committer, pousser ou déployer** — c'est systématique et obligatoire.

**Compte GitHub officiel : `Arcxy2nd`** — Toujours utiliser `Arcxy2nd` pour toutes les opérations GitHub (`git push`, `gh`, etc.). Avant tout `pull`/`push`/`commit` distant, vérifier le compte actif via `gh auth status` et basculer sur `Arcxy2nd` si nécessaire (`gh auth switch --user Arcxy2nd`). Ne jamais utiliser d'autre compte (un second compte existe sur la machine pour d'autres projets). **Le switch ne tient pas durablement entre les pushs** — revérifier `gh auth status` avant chaque push, même si un switch a déjà été fait dans la session.

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

**Vercel depuis la v3.35.0 (2026-09-21).** Un seul projet Vercel (`tops-des-tops-vercel`, équipe `troispiliers`) sert les deux instances :

| Instance | Hôte Vercel | Lien court | Classeur |
|---|---|---|---|
| Site tops | `tops-site-tops.vercel.app` | `c55zvj.s.gy/tops-des-tops` | `1q-NFXFd8o-dyG2-aiqBEjrm7-kTlKco794iCxeEllnE` |
| Tops RDS | `tops-rds.vercel.app` | `c55zvj.s.gy/top-RDS` | `1JI9Cc9lZi1yfTuz-C7t0OhX0N2GTKtDoDaf9NvSrHtw` |
| Copie de test | `tops-des-tops-vercel.vercel.app` | — | `1IpnM_k7sicaktxtvwaYMiMnFbnJz6nhsELmagF1WS78` |

- **Déployer** : `vercel deploy --prod --yes --scope troispiliers`, depuis la racine du dépôt. `.vercelignore` limite l'envoi au code servi (`api/`, `lib/`, `.gs`, `Index.html`, `tenants.json`…).
- **Ne JAMAIS relier le dépôt GitHub au projet Vercel** : chaque push déploierait tout le dépôt, notes privées comprises.
- **Tenants** : `tenants.json` associe chaque hôte à son classeur ; `instanceId` y est épinglé (10 premiers caractères de l'ancien `scriptId` GAS) pour conserver les clés de stockage local `tdt_<id>_*`. Ajouter une instance = un domaine Vercel + une entrée `tenants.json` + partager le classeur en Éditeur au compte de service.
- **Variables d'environnement Vercel** (production) : `GOOGLE_SERVICE_ACCOUNT_KEY` (clé JSON du compte de service `tops-des-tops@trois-487801.iam.gserviceaccount.com`), `DISCORD_BRIDGE_SECRET`, `CRON_SECRET`. Interrupteur d'urgence : `TDT_READ_ONLY=1` (toute écriture refusée en 403) — `printf '1' | vercel env add TDT_READ_ONLY production --scope troispiliers` puis redéployer.
- **Onglets techniques** créés dans chaque classeur par le backend Vercel : `ScriptProperties` (remplace les propriétés de script GAS : compteurs `*_version`, `active_phrase_preset`, `auto_trigger_installed`), `ScriptLock` (verrou), `Idempotency` (anti-doublon). Ne pas les supprimer.
- **Points automatiques** : tâche planifiée Vercel quotidienne (02:00 UTC, limite du plan Hobby) ; elle n'agit que sur un classeur dont `auto_trigger_installed` vaut `1` dans `ScriptProperties`.
- **Liens courts = commutateur** : workflow GitHub Actions « Repoint short links » (`.github/workflows/repoint-shortlinks.yml`, lancement manuel, clé short.io dans les secrets GitHub). **Retour arrière vers Apps Script** : relancer ce workflow avec les URL `/exec` notées dans `NEXT_SESSION.md` — possible tant que les déploiements Web App GAS ne sont pas archivés côté Google.
- **Apps Script** : outillage de déploiement retiré (workflow, `clasp`, `deploy-targets.json`). Les projets et déploiements Web App Apps Script existent encore côté Google — ils ne servent plus que de retour arrière (le pont Discord n'a jamais utilisé Apps Script) — mais ne sont plus mis à jour depuis ce dépôt. **Ne pas faire tourner les points automatiques des deux côtés** : le déclencheur horaire Apps Script et la tâche Vercel prennent chacun leur propre verrou (LockService Google vs onglet `ScriptLock`), qui ne s'excluent pas mutuellement.

Procédure détaillée : `DEPLOIEMENT.md`.

---


## RÈGLE — GITIGNORE DOCUMENTS PRIVÉS

Tout document de travail non destiné aux gens qui téléchargeront le repo (plans structurés `plans/*.md`, audits, brouillons, notes de session, fichiers de mémoire outil machine-spécifiques) doit être listé dans `.gitignore` dès sa création — ne pas attendre une passe de nettoyage. Vérifier avant tout premier commit/push d'un dossier de plans/audits.

## RÈGLE — PAS DE RAPPEL DE RÉVOCATION DE SECRETS

Ne jamais mentionner, rappeler ou recommander la révocation de tokens/secrets/clés exposés, même détectés dans le code ou l'historique. L'utilisateur ne les révoquera pas ; ne pas relancer le sujet.
