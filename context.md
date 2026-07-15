# CONTEXTE PROJET : TOP-DES-TOPS (v2026.07)

---

## RÈGLE IMPÉRATIVE — CONCISION EN DÉBUT DE SESSION

Au début de chaque session (rituel d'initialisation, prise de connaissance du contexte, premiers échanges), parler **peu, très peu, de manière extrêmement concise**. Pas de récapitulatif, pas de reformulation de la demande, pas de plan annoncé en prose — lire, comprendre, agir. Le détail et l'explication ne viennent qu'une fois le travail engagé, si nécessaire.

---

## §0 — RITUEL D'INITIALISATION

Au tout début de chaque session, avant toute action, lire dans cet ordre :

| # | Fichier | Ce qu'on y cherche |
|---|---------|-------------------|
| 1 | `context.md` (ce fichier) | Remettre en tête les règles, la stack, les conventions |
| 2 | `CHANGELOG.md` | Comprendre l'état récent du projet — ce qui vient d'être ajouté, corrigé ou supprimé |
| 3 | `DEPLOIEMENT.md` | Rappel du workflow de déploiement si la session touche au déploiement ou aux scripts GAS |
| 4 | Dernier plan actif dans `docs/superpowers/plans/` (date la plus récente) | S'il y a un plan en cours, s'y référer avant de proposer une approche |

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
| Graphiques  | Chart.js (embarqué)       |
| Déploiement | Web App GAS (`/exec` URL) |

Pas de build, pas de framework, pas de dépendances npm. Le HTML est servi directement par GAS via `HtmlService`.

---

## §3 — DONNÉES (Google Sheets)

### Structure des feuilles

```
History    : Date | Player | Category | Points | Description | [GroupId]
Players    : Name | Avatar URL | Hex color | Password (optionnel, jamais affiché dans l'UI)
Categories : Name | Description | Emoji | Hex color
Notes      : Date | Player | Note text
Bareme     : Action (text) | Points
Phrases    : Preset | Pool | Phrase
```

Les feuilles **Notes**, **Bareme** et **Phrases** sont optionnelles — créées automatiquement si absentes.

---

## §4 — BACKEND (`Code.gs`)

Tous les services sont des objets littéraux ou IIFE, sans classe ES6. Pattern : service → fonctions `api*` exposées à l'appel GAS via `callServer()`.

| Service | Rôle |
|---------|------|
| `ConfigService` | Connexion au Sheet, cache des onglets, `SPREADSHEET_ID` via Script Properties |
| `SettingsService` | CRUD joueurs et catégories, renommage en cascade dans History |
| `StorageService` | Lecture/écriture History, gestion des lots (groupement, répartition par plage de dates) |
| `NotesService` | CRUD notes par joueur, auto-création de la feuille |
| `AnalyticsService` | Agrégation des scores filtrés (joueurs, catégories, période), données pour graphiques, santé des données |
| `BaremeService` | CRUD règles de points (barème), auto-création de la feuille |
| `PhrasesService` | CRUD phrases de commentaires, gestion des presets, auto-création de la feuille |

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

### Parité mobile

Toute mise à jour de `Index.html` (nouvel écran, nouveau composant, style modifié) doit être répercutée dans `Mobile.html`. Si l'outil concerné n'existe pas côté mobile (cas des outils avancés de l'onglet Outils, volontairement réduit), ne pas assumer — demander avant de l'ajouter.

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
- **Code en anglais** — variables, fonctions, commentaires dans le code. Les explications hors code sont en français.
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

Le projet n'a pas de suite de tests automatisés. Vérifier les changements via le harness Node VM local ou l'app déployée. Invoquer `/verify` après tout changement fonctionnel.

### Commit & push

Toute modification livrée doit être commit **et poussée** (`git push`) — pas seulement commit en local. Le push déclenche le déploiement automatique (§10), donc un commit non poussé ne se retrouve jamais dans l'app en ligne.

---

## §9 — SKILLS — USAGE OBLIGATOIRE

Les skills installés doivent être **invoqués aux moments-clés**, pas ignorés. Invoquer via l'outil `Skill` (jamais lire le fichier SKILL.md à la main).

| Moment | Skill à invoquer |
|--------|-----------------|
| Avant toute nouvelle feature ou modification de comportement | `/superpowers:brainstorming` |
| Avant tout fix de bug (comprendre la cause) | `/superpowers:systematic-debugging` |
| Avant d'écrire un plan multi-étapes | `/superpowers:writing-plans` |
| Exécution d'un plan fourni en contexte | `/superpowers:executing-plans` |
| Après tout changement fonctionnel (vérifier dans l'app) | `/verify` |
| Avant de déclarer "terminé" | `/superpowers:verification-before-completion` |
| Review du diff avant livraison | `/code-review` |
| Retrouver du contexte de sessions passées | `/claude-mem:mem-search` |

---

## §10 — DÉPLOIEMENT

Web App GAS — exécutée en tant que le propriétaire, accessible à tout compte Google. Le code est déployé vers **deux copies** ("Site tops" et "Tops RDS", même code, Sheet différent), chacune derrière son propre lien court short.io stable.

Depuis la mise en place de la synchro automatique, chaque `git push` sur `main` déclenche un workflow GitHub Actions (`.github/workflows/deploy-gas.yml`) qui, pour chaque copie listée dans `deploy-targets.json` : pousse le code via `clasp`, archive l'ancien déploiement, en crée un nouveau (nouvelle URL `/exec`), puis repointe le lien short.io correspondant vers cette nouvelle URL. Plus de déploiement manuel dans l'éditeur GAS.

Procédure de mise en place initiale (une seule fois) : `SETUP-AUTOSYNC.md`. Détails historiques et note sur `SPREADSHEET_ID` : `DEPLOIEMENT.md`.

---
