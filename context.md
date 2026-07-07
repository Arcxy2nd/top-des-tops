# CONTEXTE PROJET : TOP-DES-TOPS (v2026.07)

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
| 📊 Dashboard | Filtres croisés, sélecteur de graphique, graphique principal, card Commentaires |
| ✍️ Saisir un Lot | Constructeur de lignes de score (joueur + Top + points + date), saisie batch |
| ⚙️ Paramètres | Gestion joueurs, catégories, barème, presets de phrases |
| 📝 Notes | Notes libres par joueur |
| 📜 Historique | Tableau paginé des entrées, filtres, édition description, suppression |
| 🔧 Outils | Rapport de santé, nettoyage orphelins, détection/regroupement lots répartis |
| ❓ Guide | Documentation inline |

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

## §6 — RÈGLES UX

### Avatar obligatoire partout

Dès qu'un nom de joueur apparaît dans l'UI (liste, tableau, graphique, filtre, commentaire, note, classement, saisie…), son avatar doit être affiché à côté. Aucune exception.

### Quatre critères de qualité interface

Chaque écran, formulaire ou composant ajouté ou modifié doit être :

- **Ergonomique** — peu de clics pour l'action la plus fréquente, hiérarchie visuelle claire
- **Pratique** — résout le besoin réel sans étape superflue
- **Intuitif** — compréhensible sans explication, feedback immédiat sur chaque action
- **Beau** — cohérence visuelle (thème dark/light, couleurs joueurs/catégories, espacements)

---

## §7 — HYGIÈNE DE CODE

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

---

## §8 — SKILLS — USAGE OBLIGATOIRE

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

## §9 — DÉPLOIEMENT

Web App GAS — exécutée en tant que le propriétaire, accessible à tout compte Google. L'URL `/exec` est stable entre les versions ; chaque mise à jour du code nécessite un nouveau déploiement depuis l'éditeur GAS. La procédure complète est dans `DEPLOIEMENT.md`.

---
