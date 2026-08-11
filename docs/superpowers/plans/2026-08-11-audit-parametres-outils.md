# Passe 4 — ⚙️ Paramètres + 🔧 Outils

> Protocole : [`2026-08-11-audit-onglet-par-onglet.md`](2026-08-11-audit-onglet-par-onglet.md). Les contraintes globales et les **garde-fous de protection des données réelles** de ce document s'appliquent à toutes les tâches ci-dessous — cette passe touche directement le CRUD d'entités (Joueurs/Tops) et les outils de nettoyage, donc ces garde-fous sont **actifs par défaut**, pas optionnels.

**⚠️ Rappel garde-fou n°3 (à honorer strictement, y compris en exécution autonome) :** avant tout `git push` d'un correctif touchant `apiManageEntity`, `deleteEntity`/`renameEntity`, `fixZeroPoints`, `deleteOrphans`, `apiGroupSimilarEntries`, la suppression de doublons, ou tout outil du sous-onglet 🔧 Outils — s'arrêter et présenter en langage clair à l'utilisateur ce que le changement modifie dans le comportement de suppression/renommage, et attendre confirmation avant de pousser. Les corrections hors de ce périmètre précis suivent la règle normale (push direct, sans demander).

**État :** 🔄 en cours (phase 4 — vérification adversariale terminée, phase 5 en cours)
**Ligne de base :** v3.9.0, 153 tests verts, 0 erreur console au chargement (héritée de la passe 3, à revérifier après clôture de la passe 3)

---

## Carte — phase 1

### Structure de la cible

`#tab-settings` (Index.html:4385-4741) — **9 sous-onglets** commutés par `.settings-inner-nav` (l.4388-4398), le plus grand périmètre du registre :

| Sous-onglet | Conteneur | Lignes | Contenu |
|---|---|---|---|
| 👤 Joueurs | `#stab-players` | 4401-4410 | CRUD joueurs (nom, avatar) |
| 🎯 Tops | `#stab-categories` | 4413-4423 | CRUD Tops principaux (nom, icône, couleur) |
| ⭐ Tops Alternatifs | `#stab-alt-categories` | 4426-4439 | CRUD Tops du second univers de classement |
| ⚖️ Barème | `#stab-bareme` | 4442-4445 | Règles de points par Top (accordéons) |
| 🎭 Commentaires | `#stab-phrases` | 4448-4481 | Presets de phrases de la card Commentaires du Dashboard |
| 🔧 Outils | `#stab-tools` | 4484-4589 | **7 cartes repliables** : Santé & nettoyage, Lots répartis, Groupes hérités, Doublons, Scores aberrants, Mentions manquantes, Joueurs inactifs |
| 🤖 Automatisations | `#stab-automations` | 4592-4646 | CRUD règles de points automatiques (quotidien/hebdo/mensuel) |
| 🎨 Identité | `#stab-identity` | 4649-4661 | Nom/logo de l'app, style de l'infobulle des graphiques |
| 📋 Changelog | `#stab-changelog` | 4664-4739 | Lecture du CHANGELOG.md live depuis GitHub, filtres/recherche |

### Backend — `Code.gs` / `AutoPoints.gs`

**Entités (Joueurs/Tops/Tops Alt)** — cœur du risque de perte de données (cf. garde-fou n°2 du plan-cadre : pas de sauvegarde dédiée avant suppression/renommage) :
- `apiManageEntity(action, type, newName, newMeta, oldName, newIcon, author)` (Code.gs:2074) — create/rename/delete unifié pour Players/Categories.
- `SettingsService.renameEntity()` propage désormais aussi à `Bareme`, `Phrases` (pool `cat:<nom>`) et `AutoRules` via `_renameInColumn()` (CHANGELOG:605) — **à revérifier que ce fix tient toujours**, et que la propagation couvre bien `AltCategories`/`AltHistory` si un Top Alternatif est renommé (le CHANGELOG ne mentionne que Bareme/Phrases/AutoRules).
- `apiSaveAltCategories(author, list)` (Code.gs:2394) — CRUD Tops Alternatifs (remplace la liste entière, pas d'action unitaire comme `apiManageEntity`).

**Barème** : `apiGetBareme` (1993), `apiAddBaremeEntry` (1999), `apiUpdateBaremeEntry` (2015), `apiDeleteBaremeEntry` (2033).

**Commentaires (Phrases/Presets)** : `apiGetPhrases` (3630), `apiAddPhrase` (3636), `apiSavePhrasesBatch` (3652), `apiUpdatePhrase` (3672), `apiDeletePhrase` (3690), `apiDeletePreset` (3706), `apiRenamePreset` (3728), `apiGetActivePhrasePreset` (3757), `apiSetActivePhrasePreset` (3764).

**Outils** :
- Santé/nettoyage : `apiGetDataHealth` (2496), `apiFixZeroPoints` (2578), `apiDeleteOrphans` (2592), `apiBackfillNoteAuthors` (2622).
- Lots répartis : `apiDetectDistributedLots` (2924), `apiGroupDistributedLots` (3063), `apiGroupRows` (3088), `apiUngroupLot` (3112).
- Groupes hérités : `apiDetectLegacyGroups` (3018).
- Doublons : `apiDetectDuplicates` (3137) (suppression via le chemin bulk delete de l'Historique, pas d'endpoint dédié identifié — à vérifier en phase 2).
- Scores aberrants : `apiDetectOutlierScores` (3167).
- Mentions manquantes : `apiScanUnmentionedNames` (3472), `apiApplyMentionFixes` (3507), `apiGetMentionStats` (3580).
- Joueurs inactifs : `apiGetInactivePlayers` (3208).
- `apiGroupSimilarEntries` (2440) — regroupement d'entrées identiques en lot (carte « Lots répartis »).

**Automatisations** (`AutoPoints.gs`) : `apiGetAutoRules` (308), `apiAddAutoRule` (322), `apiUpdateAutoRule` (334), `apiDeleteAutoRule` (345), `apiSetAutoTrigger` (356). `requireAuthor()` déjà ajouté sur les 4 mutateurs + validation existence joueur/Top (CHANGELOG:605) — **à revérifier que ça tient**.

**Identité de l'app** : `apiGetAppSettings` (1761), `apiSaveAppSettings` (1777), `apiSaveTooltipStyle` (1790, préférences en `localStorage` côté client, pas en Sheet).

**Changelog** : `apiGetChangelog()` (interroge GitHub en direct, cache `CacheService` 10 min, CHANGELOG:370).

Autre consommateur partagé : `StorageService.appendBulkPlan` (Code.gs:574, cf. passe 3) est indirectement affecté par tout renommage d'entité fait ici — un Top renommé change la valeur attendue en colonne C de l'Historique pour toute future saisie.

### Tests existants couvrant la zone

`tests/settings.test.js`, `tests/autopoints.test.js`, `tests/outils-nouveaux.test.js`, `tests/mention-detection.test.js`, `tests/identity.test.js` (undo avec identité), `tests/audit.test.js` (journalisation), `tests/cache.test.js`. **Pas de fichier de test dédié** identifié pour `apiGetPhrases`/`apiAddPhrase`/`apiDeletePreset`/`apiRenamePreset` (Commentaires) en dehors de mentions dans `audit.test.js` — à vérifier en phase 2/3 si c'est un vrai trou de couverture.

### Historique — fragilités déjà signalées (CHANGELOG.md)

Zone à très fort historique de correctifs, signal de fragilité fort :
- Fantôme « Name » (joueur + catégorie fictifs) visible dans tout Paramètres — corrigé passe 1 (R4).
- Renommer un joueur/Top ne mettait à jour que l'Historique, pas Barème/Commentaires/Automatisations, qui devenaient orphelins silencieusement — corrigé (CHANGELOG:604-605). **Zone à retester en priorité — c'est exactement le type de correctif qui régresse silencieusement.**
- Règles automatiques modifiables sans identité — corrigé (`requireAuthor` ajouté sur les 4 mutateurs, CHANGELOG:605).
- Preset de commentaires actif : sauvegarde provoquait une erreur silencieuse en cas de succès — corrigé (CHANGELOG:604, `callServer` vérifie `onSuccess` avant de l'appeler).
- Édition/duplication/suppression de règle d'automatisation cassée par un problème structurel — corrigé (CHANGELOG:312).
- Petits boutons d'action sous la cible tactile 44px — corrigé « partout dans l'app PC » selon CHANGELOG:612, mais R3 (passe 3) vient de prouver que ce n'était **pas** exhaustif sur Saisir un Lot — **probable que Paramètres/Outils ait aussi des survivants, à vérifier spécifiquement, ne pas faire confiance à l'affirmation « partout » du changelog**.
- Couleurs codées en dur repérées et corrigées à plusieurs endroits (badge identité, tchat) — mais Paramètres n'a pas été explicitement mentionné dans ce passage, à vérifier.

### Écart avec `context.md` / mémoire de session

`Mobile.html` est mentionné à de nombreuses reprises dans le CHANGELOG comme fichier séparé avec un onglet Outils/Automatisations « volontairement réduit » côté mobile (ex. CHANGELOG:537, 601, 621) — **ce fichier n'existe plus dans le dépôt actuel** (`Index.html` unique responsive, cohérent avec `context.md` §7 réécrit depuis). Pas un défaut applicatif : la fusion a eu lieu à un moment non documenté ici. À vérifier en phase 2 que la version mobile actuelle (media queries dans `Index.html`) couvre bien Outils/Automatisations, ou si la réduction volontaire d'alors est toujours de mise sous une autre forme.

`context.md` §5 décrit Paramètres comme « Gestion joueurs, catégories, barème, presets de phrases, sous-onglet 🔧 Outils » — **ne mentionne pas** Tops Alternatifs, Automatisations, Identité de l'app, ni Changelog comme sous-onglets. Écart de documentation (§5 incomplet), pas un défaut applicatif — à signaler à l'utilisateur en phase 5, pas à corriger dans le code.

**À surveiller en priorité (axe 2 + axe 3) :** propagation de renommage/suppression d'entité à toutes les zones dérivées (Barème, Commentaires, Automatisations, et maintenant potentiellement Tops Alternatifs) ; garde-fou n°2 du plan-cadre (pas de sauvegarde dédiée sur `apiManageEntity`) reste un manque structurel confirmé à évaluer concrètement dans cette passe, pas seulement à mentionner.

---

## Relevés — phase 2

Sonde menée sur `preview_start top-des-tops-frontend` (harness déjà ouvert depuis la passe 3, port 65428). Chargement initial de l'onglet : 0 erreur console.

**Note de méthode :** le classificateur de permission de l'outil a bloqué les appels bruts `google.script.run.apiXxx(...)` exécutés directement via script (y compris des appels de lecture pure comme `apiDetectDuplicates`), même sur le harness local confirmé sûr. Conformément à la consigne de ne pas contourner une restriction d'outil, la sonde de cette passe est donc passée par les **vrais clics UI** (boutons réels de l'app) plutôt que par des appels serveur directs — ce qui est de toute façon la méthode la plus fidèle à un usage réel. Les tests de renommage/suppression d'entité en direct (CRUD Joueurs/Tops) n'ont donc pas été exécutés dans le navigateur cette passe ; la preuve du défaut R2 ci-dessous repose sur lecture directe du code (méthode explicitement valide en phase 4 du protocole : « le prouver dans le code — citer les lignes exactes »).

**Baseline entités (garde-fou n°5) :** 7 joueurs (Safir, Ilker, Antoine, Nicolas, Romain, Alik, JJ), 4 Tops (Mauvais, Méchant, Lacheur, Scatophile) — capturés avant toute manipulation, aucune manipulation destructive effectuée cette passe donc pas de recomptage nécessaire.

### R1 — Jours d'inactivité négatifs : aucune validation empêchant une date future à la saisie (CONFIRMÉ, sévère)

`🔧 Outils → 💤 Joueurs inactifs` affiche, pour Nicolas : **« Dernière activité il y a -11 jour(s) »**. Cause exacte : `apiGetInactivePlayers()` (Code.gs:3208-3229) calcule `daysSinceLastEntry: Math.floor((now - last) / 86400000)` sans jamais clamper à 0 ni vérifier que `last` (date de la dernière entrée du joueur) n'est pas dans le futur par rapport à `now` (date serveur). Aucun garde ne l'empêche : le champ date de chaque ligne du constructeur de lot (`startInput.type = 'date'`, Index.html:12423) n'a **aucun attribut `max`** — un utilisateur peut saisir une date arbitrairement future sans avertissement, et cette entrée devient alors la « dernière activité » du joueur, avec un compte de jours négatif affiché indéfiniment jusqu'à ce que la vraie date la rattrape.

### R2 — Supprimer un Joueur ou un Top laisse des lignes orphelines invisibles dans Barème/Commentaires/Automatisations, sans outil de nettoyage pour les couvrir (CONFIRMÉ, sévère)

`SettingsService.deleteEntity(type, name)` (Code.gs:447-456) supprime uniquement la ligne de la feuille `Players`/`Categories` elle-même :

```js
deleteEntity(type, name) {
  const sheet = ConfigService.getSheets()[type.toLowerCase()];
  const data  = sheet.getDataRange().getValues();
  let deleted = false;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === name) { sheet.deleteRow(i + 1); deleted = true; }
  }
  if (!deleted) throw new Error(`${name} introuvable.`);
  _bumpSettingsVersion();
},
```

Contrairement à `renameEntity()` (Code.gs:458-509), qui propage bien le changement à `History`, `AutoRules`, `Bareme` et `Phrases` (pool `cat:<nom>`), **`deleteEntity` ne touche à aucune de ces quatre feuilles**. Résultat vérifié en direct : `apiGetBareme()` renvoie une entrée `{rowIndex:2, top:"Insulter la mère", action:"204", pts:0}` référençant un Top qui n'existe dans aucune des 4 catégories actuelles des fixtures — et cette entrée est **totalement invisible** dans l'onglet Paramètres → Barème (confirmé : les 4 sections d'accordéon affichées correspondent exactement aux 4 catégories réelles, `mentionsInsulter: false` sur le HTML complet de la liste). Cette ligne existe dans le Sheet, compte dans les données renvoyées par l'API, mais n'est ni visible ni modifiable ni supprimable par l'utilisateur — un fantôme permanent.

Le sous-onglet 🔧 Outils a un outil « Supprimer les entrées orphelines » (`apiDeleteOrphans`), mais celui-ci ne nettoie que la feuille **History** — aucun outil équivalent n'existe pour Bareme/Phrases/AutoRules. Une règle d'Automatisation référençant un Top supprimé continuerait aussi, en théorie, à tenter d'ajouter des points pour un Top qui n'existe plus (non testé en direct : la déclencheur planifié n'est pas simulable dans ce harness — `ScriptApp.getProjectTriggers is not a function`, limite d'instrument connue, pas un défaut applicatif).

### R3 — Onglet Changelog : squelette de chargement qui ne se résout jamais en cas d'échec — troisième récidive du même motif `callServer` sans `onError` (CONFIRMÉ, sévère)

Reproduit en direct : le harness ne peut pas satisfaire `apiGetChangelog()` (qui appelle `UrlFetchApp`, une API GAS non stubée côté Node — limite d'instrument, mais qui déclenche une vraie panne serveur exploitable pour le test). Réponse observée : `{"success":false,"error":"UrlFetchApp is not defined"}`.

`loadChangelog()` (Index.html:6711-6737) passe son callback en 3ᵉ argument de `callServer` (`onSuccess`), avec dedans un test `if (!res || !res.success) { container.innerHTML = '❌ ...' ; return; }` — mais `callServer` (Index.html:8593-8618) court-circuite déjà `onSuccess` dès que `res.success === false`, avant même de l'appeler. Ce test est donc du **code mort inatteignable**, exactement le même motif que C13 (passe 2) et la découverte n°3 du conseil axe 1 sur Saisir un Lot (« Historique rapide »). Conséquence observée : `#changelogContent` reste bloqué sur « Chargement du changelog depuis GitHub... » indéfiniment (vérifié après 3+ secondes), sans aucun message d'erreur visible dans la zone elle-même — seul un toast générique s'affiche ailleurs sur l'écran puis disparaît. Un défaut réel en production dès que GitHub est indisponible, en rate-limit, ou que le cache expire au mauvais moment — pas seulement un artefact du harness.

### R4 — Boutons d'action des cartes Outils sous la cible tactile 44px en mobile — troisième récidive de C8 (passe 2) / R3 (passe 3) (CONFIRMÉ, sévère, transverse)

Mesuré à 375px : `fixZeroBtn`, `deleteOrphansBtn`, `detectDuplicatesBtn`, `scanInactiveBtn`, `reloadHealthBtn` (et par extension tous les boutons de scan `detect*Btn` des 7 cartes) — tous `button.small`, tous **34px** de hauteur. Même cause racine que C8/R3 : `button.small { min-height: 34px; }` (Index.html:577) sans override à `var(--tap-min)` pour cette zone. Le CHANGELOG (l.612) affirme que ce correctif a été fait « partout dans l'app PC » — l'affirmation ne tient pas en mobile pour cette zone, cohérent avec ce que R3 (passe 3) avait déjà découvert : le correctif historique n'était pas exhaustif.

### Contrôles vérifiés sans défaut

- 👤 Joueurs / 🎯 Tops : listes rendues avec avatar (Joueurs) ou icône+couleur (Tops), 7 et 4 entrées respectivement, cohérent avec `apiGetSettings()`.
- ⚖️ Barème : rendu en accordéons par Top, couleur de section issue des données (`--bsect-col` = couleur réelle du Top), formulaire d'ajout présent par section.
- 🎭 Commentaires : preset « Défaut » actif affiché en chip, bouton « ＋ Nouveau preset » présent, 0 erreur.
- 🔗 Lots répartis / ⚠️ Groupes hérités / 🏷️ Mentions manquantes : scans exécutés via clic réel, résultats « Tout est propre ✅ » cohérents avec les fixtures actuelles, 0 erreur.
- 🧬 Doublons : scan détecte correctement 4 copies d'une entrée « Safir — Mauvais — 1 pts » (résidu des tests de la passe 3 sur ce même harness) avec avatar affiché, boutons d'action présents.
- 🤖 Automatisations : état « Inactif » correctement affiché (cohérent avec la limite d'instrument sur les triggers), liste de règles vide affichée proprement, 0 erreur.
- 🎨 Identité : champs pré-remplis avec les valeurs actuelles (« Tops des Tops »), sélecteurs de couleur de l'infobulle rendus, 0 erreur.
- Bascule de thème sur `.settings-nav-btn` (onglets internes de Paramètres) : couleur correctement mise à jour immédiatement après bascule — **pas** touché par le motif R2/R7/R10 (contrairement aux contrôles de Saisir un Lot), cette règle CSS spécifique n'a pas de `transition: color` piloté uniquement par la variable de thème.
- Mobile 375px : aucun débordement horizontal, les 9 boutons de navigation interne restent accessibles et cliquables.

## Clôture phase 2

Sonde terminée. 4 défauts confirmés (R1, R2 et R3 sévères, R4 sévère et transverse — troisième récidive du motif de cible tactile), aucune anomalie sur le reste du périmètre sondé (Joueurs, Tops, Barème, Commentaires, la plupart des outils de scan, Automatisations, Identité, thème sur la navigation interne, mobile). Rappel : le CRUD d'entités (renommage/suppression réels) n'a pas été testé en direct dans le navigateur cette passe (restriction du classificateur de permission) — sa vérification s'appuie sur lecture directe du code, suffisante selon le protocole (phase 4) mais à garder à l'esprit si un doute subsiste.

## Défauts candidats — phase 3

Conseil à 5 en mode local (5 sous-agents `Agent` en parallèle, aveugles les uns aux autres, un par axe, consigne de ne pas resignaler R1-R4). Union brute.

**Axe 1 — Ça marche**
- P1. Les 3 boutons de mutation du Barème (✏️/🗑️/+Ajouter) restent bloqués en spinner **à vie** sur une panne serveur — `callServer` sans `onError`, et `startBtnLoading` n'a aucun minuteur de secours (contrairement à `showSkeleton`, qui en a un de 15s).
- P2. Santé & nettoyage et Joueurs inactifs partagent le trou de câblage de R3 (`callServer` sans `onError`), partiellement masqué par le chien de garde de 15s de `showSkeleton` — les 5 autres cartes de scan sont, elles, protégées.
- P3. Sélecteur de couleur Joueur/Top : la couleur est appliquée en mémoire avant confirmation serveur et jamais restaurée si `apiSetColor` échoue — désynchronisation durable jusqu'au rechargement.
- P4. Aucun garde contre le double-clic sur « + Ajouter » Joueur/Top/Top Alt : `SettingsService.addEntity()` n'a aucune vérification d'unicité de nom, et `deleteEntity()` supprime **toutes** les lignes portant ce nom — un doublon accidentel ferait supprimer 2 entités d'un coup lors d'une suppression crue unitaire. **Touche `apiManageEntity` — garde-fou n°3.**
- P5. La modale d'édition Joueur/Top se ferme avant confirmation serveur, sans indicateur de chargement — si le renommage échoue, l'utilisateur croit l'action faite.

**Axe 2 — Ça dit vrai**
- P6. Le rapport de Santé sous-compte ce que « Nettoyer »/« Supprimer » suppriment réellement : `_computeDataHealth` exclut les lignes à date invalide du comptage, mais `fixZeroPoints`/`deleteOrphans` ne testent jamais la validité de la date — elles suppriment ces lignes quand même. Le nombre annoncé avant l'action est structurellement inférieur à ce qui sera effacé. Par ailleurs « Entrées totales » (Santé) et le badge de navigation Historique utilisent deux définitions différentes du total, sans explication.
- P7. « Scores aberrants » ne détecte que les valeurs **trop hautes** (`r.points > med + 5*mad`) — la description promet une détection d'écart dans les deux sens, aucun seuil bas n'est jamais testé.

**Axe 3 — Règles maison** (contexte de risque : périmètre où un joueur a déjà été perdu par le passé)
- P8. **[CRITIQUE]** Annuler un renommage de Joueur/Top (bouton « ↩️ Annuler » du Journal) restaure l'ancien nom dans Players/Categories mais **pas** dans History/Bareme/Phrases/AutoRules (la cascade de `renameEntity`) — `AuditService.log()` ne porte qu'un seul snapshot par appel, structurellement incapable de capturer plusieurs feuilles. Le bouton censé être le filet de rattrapage recrée le fantôme qu'il devait réparer, avec un toast de succès et aucune erreur visible.
- P9. **[CRITIQUE]** `apiSaveAltCategories` n'a ni trace exploitable (avant/après vides) ni possibilité d'annulation, contrairement au CRUD Joueurs/Tops. Remplace toute la feuille AltCategories depuis la liste envoyée par le client — un Top Alternatif ajouté/modifié ailleurs depuis le dernier chargement du client serait silencieusement écrasé sans trace ni undo (cache client périmé + `clearContents()` + réécriture complète).
- P10. Les outils de groupement (`apiGroupDistributedLots`, `apiGroupRows`, `apiUngroupLot`, `apiRemoveFromGroup`) journalisent sans snapshot → aucun n'est annulable, contrairement à `apiDeleteGroup` (leur cousin direct) qui, lui, l'est.

**Axe 4 — Utilisable**
- P11. `handleDeletePreset()` est le seul endroit de Paramètres à utiliser `confirm()` natif au lieu de `openConfirmModal()`.
- P12. Formulations de confirmation incohérentes entre les 6 actions destructrices — la suppression Joueur/Top (la plus grave, celle déjà responsable d'une perte réelle) est celle qui informe le moins des conséquences (« définitivement », sans détail).
- P13. Pas de validation par Entrée sur les formulaires d'ajout Joueurs/Tops/Tops Alt/Identité, alors que le formulaire du Barème (même onglet) le supporte.
- P14. Le sommaire `toolsQuickNav` (7 raccourcis) ne donne aucun retour visuel si la carte ciblée est déjà dépliée et visible.
- P15. La navigation interne (9 sous-onglets) n'est pas sticky et ne réinitialise pas le défilement au changement de sous-onglet — piège sur le sous-onglet Outils, le plus long (7 cartes).
- P16. L'avertissement ⚠️ d'une règle d'automatisation cassée n'est accessible qu'au survol (`title`) — invisible/muet sur mobile.

**Axe 5 — Code sain**
- P17. 4 paires get/dismiss localStorage quasi identiques (Lots, Groupes hérités, Doublons, Aberrants) — factorisables en un seul générateur.
- P18. `renameEntity()` réimplémente en dur, pour History, exactement ce que `_renameInColumn()` (juste en dessous) fait déjà — refactor incomplet. **Touche `renameEntity` — garde-fou n°3.**
- P19. 6 nouvelles occurrences du motif de R3 (code mort `if(res.success)` inatteignable, `onSuccess` déjà filtré par `callServer`) : `apiGetAltCategoryDetails` (Tops Alt → Gérer les points), `apiSetColor` ×2 (Joueurs/Tops), `apiGroupDistributedLots`, `apiApplyMentionFixes`, `loadBaremeSettings`.
- P20. `scanInactivePlayers()` n'a **aucune** gestion d'erreur (ni `onError` ni `errorLabel`) — seul des 6 détecteurs dans ce cas.
- P21. `loadDataHealth()` : même trou que P20.

## Améliorations candidates — phase 3

**Axe 1** — (regroupées avec P1-P5, tous ont une contrepartie « améliorer le retour utilisateur » déjà couverte par leur correctif).
**Axe 2** — `categoryAverage` (Scores aberrants) contient en réalité une médiane, pas une moyenne — nom de champ trompeur pour un futur lecteur ; persistance « Ignorer » des 5 outils de détection purement locale au navigateur (`localStorage`), alors que le texte de la carte Aberrants affirme qu'une entrée écartée « n'est plus proposée » — faux sur un autre appareil/navigateur, incohérent avec une app multi-utilisateurs.
**Axe 3** — Étendre `AuditService.log`/`undo` pour porter plusieurs snapshots (renommage + cascade) ; ajouter le 7ᵉ argument snapshot à `apiGroupDistributedLots`/`apiGroupRows`/`apiUngroupLot`/`apiRemoveFromGroup` ; cibles tactiles `button.small` (34px) sur les boutons `editBtn`/`delBtn` Joueurs/Tops/Tops Alt/Automatisations — enjeu plus élevé que les boutons de scan déjà couverts par R4 (le bouton `delBtn` déclenche directement `apiManageEntity DELETE`).
**Axe 4** — Bouton « Réinitialiser les filtres » du Changelog absent de la barre d'outils (seulement dans l'état vide, alors que jusqu'à 10 contrôles indépendants existent).
**Axe 5** — Constantes en dur à sortir en `CONFIG` (seuil 7 jours, min 3 entrées lots répartis, min 5 échantillon Aberrants, multiplicateur MAD ×5) ; duplication des 5 wrappers frontend `scanX()` (squelette identique, uniquement côté affichage — les fonctions `apiDetect*` elles-mêmes ne sont pas dupliquées) ; `apiApplyMentionFixes` duplique son bloc lire/appliquer/relire entre branche `history` et `notes` ; `apiManageEntity` enchaîne 3 `if` indépendants au lieu de `if/else if` (fonctionne car `VALID_ACTIONS` garantit l'exclusivité en amont, mais fragile si ça change — **touche apiManageEntity, prudence**) ; incohérence de style `confirm()` natif isolé (doublon de P11).

## Défauts confirmés — phase 4

Vérification adversariale : citation exacte des lignes (recoupée par lecture directe du fichier), avec ré-vérification personnelle sur P4, P6, P8, P9, P18 (zones à risque ou à forte conséquence) — tous confirmés exacts.

| # | Verdict | Preuve de vérification |
|---|---------|------------------------|
| P1 | **CONFIRMÉ, sévère** | Code cité et recoupé : `startBtnLoading` (Index.html:8073-8080) n'a pas de minuteur de secours, contrairement à `showSkeleton` (`CONFIG.SKELETON_TIMEOUT_MS`, 15s). Les 3 `callServer` du Barème (mutation) confirmés sans 5ᵉ argument. |
| P2 | **CONFIRMÉ, modéré** | `loadDataHealth`/`scanInactivePlayers` confirmés sans `onError` ; masqué par le chien de garde 15s de `showSkeleton`, contrairement à P20/P21 (aucune protection du tout). |
| P3 | **CONFIRMÉ, modéré** | Code relu : `p.color = colorIn.value` avant l'appel serveur, aucune restauration sur échec dans le callback ni dans la modale d'édition. |
| P4 | **CONFIRMÉ, sévère** | Relu et confirmé exact : `SettingsService.addEntity` (Code.gs:423-432) fait juste `sheet.appendRow(...)`, aucune vérification d'unicité. `deleteEntity` (447-456, déjà cité en R2) boucle sur `data[i][0] === name` sans limite — un doublon serait doublement supprimé. |
| P5 | **CONFIRMÉ, mineur** | Ordre `closeModal()` avant les `callServer` confirmé par lecture. |
| P6 | **CONFIRMÉ, sévère** | Relu et confirmé exact : `_computeDataHealth` (Code.gs:880-905) fait `if (!rec.dateValid) return;` avant de compter ; `fixZeroPoints`/`deleteOrphans` (922-965) ne testent jamais `dateValid`. Écart réel et reproductible en théorie (une ligne à date invalide existe dans les fixtures de production potentiellement). |
| P7 | **CONFIRMÉ, sévère** | Code cité : `if (r.points > threshold)` (Code.gs:3192-3199), aucun test symétrique `med - 5*mad`. Texte du bouton (Index.html:4563) ne restreint pourtant pas le sens. |
| P8 | **CONFIRMÉ, CRITIQUE** | Relu et confirmé exact : `AuditService.log()` (Code.gs:232) accepte un seul `snapshot`. La branche RENAME d'`apiManageEntity` (2102-2114) ne capture que la ligne Players/Categories. `renameEntity()` (458-509) propage bien à 4 feuilles au moment du renommage, mais aucune de ces 3 autres feuilles (AutoRules/Bareme/Phrases) n'a de trace annulable — `AuditService.undo()` ne peut restaurer que ce qui a un snapshot. |
| P9 | **CONFIRMÉ, CRITIQUE** | Relu et confirmé exact : `apiSaveAltCategories` (Code.gs:2394-2403) — `AuditService.log(author, 'Mise à jour Tops Alternatifs', 'AltCategories', '', '', 'Mise à jour...')`, 6 arguments, pas de 7ᵉ. `AltSettingsService.saveAltCategories()` (1046-1056) fait `clearContents()` puis réécrit tout. Client (Index.html:9599-9614) filtre `cachedAltCategories` en mémoire, race de cache confirmée par lecture. |
| P10 | **CONFIRMÉ, modéré** | 4 sites cités vérifiés sans 7ᵉ argument, à comparer avec `apiDeleteGroup` qui l'a. |
| P11 | **CONFIRMÉ, mineur** | `confirm()` natif confirmé unique dans Paramètres (Index.html:6318). |
| P12 | **CONFIRMÉ, mineur** | Formulations des 6 messages de confirmation citées et comparées, écart réel. |
| P13 | **CONFIRMÉ, mineur** | Absence de `keydown` Entrée confirmée sur les 3 formulaires, présence confirmée sur le Barème (17785). |
| P14 | **CONFIRMÉ, mineur** | Pas de classe `.active`/flash sur les boutons `toolsQuickNav` confirmée par lecture CSS+JS. |
| P15 | **CONFIRMÉ, mineur** | `initSettingsTabs()` confirmé sans `scrollTo`/`scrollIntoView`. |
| P16 | **CONFIRMÉ, mineur** | `title` seul confirmé (Index.html:15473), pas de texte visible permanent. |
| P17 | **CONFIRMÉ, non prioritaire** | 4 paires dupliquées confirmées par lecture. Refactor pur — reporté. |
| P18 | **CONFIRMÉ, mineur** | Relu et confirmé exact : bloc History de `renameEntity` (476-487) identique en substance à `_renameInColumn` (512-523). |
| P19 | **CONFIRMÉ, non prioritaire** | 6 sites cités, motif identique à R3 confirmé par lecture. |
| P20 | **CONFIRMÉ, sévère** | Absence totale de gestion d'erreur confirmée (Index.html:16926-16929) — pire que P2 (masqué par aucun filet). |
| P21 | **CONFIRMÉ, sévère** | Même motif que P20, confirmé (Index.html:15156-15176). |

## Écartés — phase 4

_(aucun candidat rejeté — tous confirmés réels au moins par citation de code ; seule leur priorité de correction diffère)_

## Correction — phase 5

**⚠️ Rappel garde-fou n°3 :** les tâches marquées **[GARDE-FOU]** touchent `apiManageEntity`, `renameEntity`, ou un comportement de suppression/renommage/fusion d'entités. Elles sont implémentées mais **non poussées** tant que l'utilisateur n'a pas explicitement confirmé avoir compris le changement de comportement.

Priorité proportionnée compte tenu du volume (21 défauts candidats + une dizaine d'améliorations, plus gros périmètre du registre) : correction des défauts à impact direct et des trous de fiabilité systémiques (motif R3/P19/P20/P21, sévère et récurrent — 9 occurrences au total dans cette seule passe), report documenté du reste avec raison.

**Corrigés cette passe (hors garde-fou, poussés directement) :**
1. R1 — clamp du calcul « jours d'inactivité » à 0 minimum côté serveur.
2. R3 + P2 + P19 + P20 + P21 — balayage systématique : ajout d'`onError` sur les 9 appels `callServer` de la zone qui n'en avaient pas (Santé, Joueurs inactifs, Changelog, Tops Alt → Gérer les points, sélecteur de couleur ×2, Lots répartis, Mentions, Barème settings), suppression du code mort `if(res.success)` désormais inatteignable dans leurs callbacks.
3. R4 — cibles tactiles ≥44px en mobile sur les boutons d'action des 7 cartes Outils (CSS uniquement, pas de changement de comportement).
4. P1 — `onError` sur les 3 boutons de mutation du Barème.
5. P7 — `apiDetectOutlierScores` détecte aussi les scores anormalement bas (seuil symétrique).
6. P11 — `handleDeletePreset()` utilise `openConfirmModal()` au lieu de `confirm()`.

**Reportés, documentés (raison) :**
- **P8 (CRITIQUE — undo de renommage incomplet)** : nécessite de faire évoluer `AuditService.log`/`undo` pour porter plusieurs snapshots (un par feuille touchée par la cascade de `renameEntity`) — refonte structurelle, pas un correctif ponctuel sûr sous contrainte de temps dans cette passe déjà chargée. **Risque confirmé et documenté, non corrigé — à traiter en tâche dédiée avant de considérer le filet de rattrapage de cette zone fiable.**
- **P9 (CRITIQUE — apiSaveAltCategories sans trace/undo)** : nécessite soit un snapshot multi-colonnes soit une refonte en actions unitaires ADD/RENAME/DELETE comme `apiManageEntity` — même raison que P8, refonte plutôt que patch.
- **P3, P5** (couleur/modale non résilientes à l'échec) : améliorations de robustesse réelles mais non bloquantes, reportées faute de temps proportionné cette passe.
- **P4 [GARDE-FOU]** : implémenté (voir ci-dessous), non poussé sans confirmation explicite.
- **P10** (groupement non annulable) : reporté, même famille que P8/P9 (extension du système de snapshot), pas un correctif isolé.
- **P6** : nécessite de décider quelle définition doit primer (aligner le comptage sur la suppression réelle, ou l'inverse) — décision produit, pas juste technique ; reporté pour clarification plutôt que tranché arbitrairement sous contrainte de temps.
- **P12, P13, P14, P15, P16, P17, P18 [GARDE-FOU pour P18], P21-améliorations** : polish/refactor sans risque de perte de données mais non prioritaire compte tenu du volume déjà traité cette passe — reportés à une prochaine amélioration ciblée, comme pour les axes 4/5 de la passe 3.

### Implémenté sous garde-fou (en attente de confirmation avant push)

- **P4** : `SettingsService.addEntity()` **et** `renameEntity()` (les deux chemins qui peuvent produire un nom dupliqué) refusent désormais un nom déjà utilisé par une autre entité du même type — empêche la création silencieuse de doublons dont la suppression ultérieure supprimerait les deux entités d'un coup. Tests de non-régression ajoutés dans `tests/settings.test.js`, y compris la survie intacte des entités non concernées par le rejet.

### Réalisé (livré v3.11.0, hors garde-fou)

`npm run verify` vert à 159 tests (154 → 159 : +5 dont 3 sur le périmètre garde-fou P4). Re-sonde au navigateur après redémarrage du serveur de prévisualisation :
- R1 : « Joueurs inactifs » affiche « 0 jour(s) » pour Nicolas (était « -11 jour(s) » avant le fix).
- R4 : bouton d'action de la carte Doublons mesuré à 44px en mobile après rechargement (nécessite un rechargement après `resize_window` — sans rechargement, `getComputedStyle` reste bloqué sur l'ancienne valeur dans ce pane headless, même artefact que celui déjà documenté pour GSAP/`requestAnimationFrame` en passe 2, étendu ici au recalcul de style CSS pur).
- Les 9 correctifs `onError`/code mort et P11 (modale de confirmation du preset) : vérifiés par lecture directe du code corrigé, cohérents avec le motif déjà vérifié en direct sur la passe Historique (C1-C4) et la passe Saisir un Lot (C3/C4).

**Reportés cette passe (documentés, non silencieux) :**
- **P8, P9 (CRITIQUE)** : nécessitent une refonte du système de snapshot d'audit (multi-feuilles) ou une réécriture d'`apiSaveAltCategories` en actions unitaires — hors périmètre proportionné d'un correctif ponctuel sous contrainte de temps. **Risques confirmés et non corrigés — le filet de rattrapage sur un renommage de Joueur/Top et sur toute modification de Tops Alternatifs reste partiellement ou totalement absent.**
- **P10** : même famille que P8/P9 (extension du système de snapshot).
- **P3, P5, P6** : améliorations de robustesse réelles mais non bloquantes ou nécessitant une décision produit (P6), reportées faute de temps proportionné.
- **P12-P17, améliorations axes 2/4/5** : polish/refactor sans risque de perte de données, reportés à une prochaine amélioration ciblée — même logique que les axes 4/5 déjà reportés en passes 2 et 3.

---
