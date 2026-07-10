# Refonte du Journal d'audit

## Contexte

Le Journal d'audit (`stab-history-audit` dans `Index.html`, `AuditService`/`apiGetAuditLog` dans `Code.gs`) a déjà reçu une passe d'amélioration (changelog du 2026-07-09 : filtres dynamiques, pastilles de couleur pour les hex). Malgré ça, il reste peu utilisable en pratique :

- La colonne "Avant → Après" affiche souvent des fragments sans valeur informative (`'' → '3 entrée(s)'`), au lieu d'un vrai avant/après quand l'action ne s'y prête pas (saisie de points, nettoyage, suppressions bulk).
- Deux interactions existent sans utilité perçue : le bouton copier la ligne (📋) et le clic sur Auteur/Action/Entité pour appliquer un filtre.
- Le style suit globalement les standards du site, mais n'a pas été revérifié après la dernière refonte du diff.
- Le journal est actuellement en lecture seule — aucune action ne peut être annulée depuis là, alors que c'est un des deux usages principaux visés (comprendre "qui a fait quoi" + pouvoir annuler).

## Objectif

Rendre le Journal d'audit réellement utile pour deux usages : (1) comprendre rapidement ce qui s'est passé, sans bruit ni fragments illisibles, et (2) annuler une action passée directement depuis une ligne du journal, quand c'est techniquement possible.

## Décisions

### 1. Contenu du diff nettoyé (colonnes conservées : Quand / Qui / Action / Entité / Avant→Après / Détail)

Pas de fusion en phrase unique — les colonnes actuelles restent, mais leur contenu est corrigé action par action :

- Les actions qui n'ont pas de vrai avant/après (saisie de points, suppressions bulk, nettoyages, groupement/dégroupement de lots) n'affichent **rien** dans la colonne Avant→Après ; l'information utile (nombre d'entrées affectées, etc.) va dans **Détail**, pas dans un avant/après qui n'en est pas un.
- Les actions avec un vrai avant/après (renommage, couleur, description, note, phrase, règle de barème) gardent le rendu actuel (texte barré + pastille couleur pour les hex).
- `AuditService.log()` et chaque site d'appel (~25, listés dans `Code.gs`) sont revus un par un pour ne passer `before`/`after` que quand c'est pertinent, et enrichir `detail` sinon.

### 2. Suppression des interactions mortes

- Bouton copier (📋, `Index.html:7710-7725`) : supprimé.
- Clic filtrant sur Auteur / Action / Entité (`Index.html:7608-7669`) : supprimé, ces cellules redeviennent du texte/badge non interactif. Les filtres du haut (`auditFilterAuthor`, `auditFilterAction`, `auditFilterSearch`) restent l'unique moyen de filtrer.

### 3. Passage de style

Vérification standard post-refonte (§6 `context.md`) : variables CSS uniquement, tailles/poids de police alignés sur la hiérarchie standard, `border-radius` cohérent (8px cellules, 20px pills), cible tactile 44px sur les éléments encore interactifs (les selects/inputs de filtre, la pagination). Pas de refonte visuelle profonde — nettoyage ciblé une fois la structure de contenu stabilisée.

### 4. Undo depuis le journal

**Constat technique.** `AuditService.log(author, action, entity, before, after, detail)` ne stocke que des chaînes d'affichage courtes. Pour annuler une action de façon fiable, il faut plus : un instantané structuré de ce qui a été modifié, capturé au moment de l'action.

**Architecture.**

1. `AuditService.log()` gagne un 7ᵉ paramètre optionnel `snapshot` (objet JS, sérialisé en JSON). Nouvelle colonne 8 `"Snapshot"` dans la feuille `AuditLog` — jamais affichée dans l'UI telle quelle, lue uniquement par la logique d'undo. Colonne 9 `"AnnuléLe"` (timestamp) pour marquer une ligne déjà annulée.
2. Chaque site d'appel de `AuditService.log()` est revu pour capturer, juste avant la mutation (comme c'est déjà fait pour `before`), les données minimales nécessaires à une restauration complète :
   - Suppression d'entrée(s) History → snapshot = ligne(s) complète(s) supprimée(s) (toutes colonnes).
   - Modification d'entrée/note/phrase/règle → snapshot = état complet avant modification (déjà proche de ce que `before` contient pour ces cas, mais structuré plutôt que résumé en chaîne).
   - Ajout (points, note, joueur, catégorie, règle, phrase) → snapshot = identifiant(s) de ce qui a été créé (pour pouvoir le supprimer en cas d'annulation).
   - Renommage / changement de couleur → snapshot = ancien nom / ancienne couleur (déjà dans `before`, dupliqué en JSON pour un format d'entrée fiable côté undo).
   - Suppression bulk / nettoyage (zéros, orphelins, doublons) → snapshot = tableau des lignes exactes supprimées.
   - Groupement / dégroupement de lot → snapshot = état des `GroupId` avant l'opération pour les lignes concernées.
3. `apiUndoAuditEntry(auditRowId, author)` : fonction générique côté `Code.gs`. Elle lit la ligne d'audit ciblée, vérifie qu'elle n'est pas déjà annulée, dispatch selon le champ `action` vers une restauration qui **passe par les services existants** (`StorageService.appendBatch`, `SettingsService.renameEntity`, `NotesService`, `BaremeService`, `PhrasesService`, etc.) — jamais d'écriture brute dans le Sheet, pour bénéficier des mêmes validations, verrous (`withLock`) et effets de cache que l'action d'origine.
4. Chaque undo réussi crée une **nouvelle** ligne d'audit ("Action annulée : <résumé de l'action d'origine>") et marque la ligne d'origine comme annulée (`AnnuléLe` rempli) — son bouton "Annuler" se désactive côté UI pour empêcher une double annulation.
5. **Lignes existantes** dans `AuditLog` (créées avant ce changement, sans colonne Snapshot) : le bouton "Annuler" est simplement absent pour elles — impossible de reconstituer un snapshot qui n'a jamais été capturé. Pas de migration rétroactive.
6. **Échecs gérés explicitement** : si l'état actuel ne permet plus l'annulation (ex. le joueur visé par un renommage a été supprimé depuis, la ligne History a déjà été modifiée par une action plus récente), `apiUndoAuditEntry` retourne une erreur explicite affichée en toast — pas de tentative silencieuse ni de correction partielle.

**Portée.** Toutes les catégories d'actions du journal sont couvertes (Historique/points, Joueurs, Catégories, Barème, Notes, Phrases, nettoyages, groupes) — pas de restriction à un sous-ensemble. Vu le nombre de sites d'appel à réviser, le plan d'implémentation découpera le travail par groupe d'actions, Historique/points en premier (le cas d'usage jugé le plus critique).

## Hors scope

- Les brainstormings "Outils" et "Dashboard" listés séparément par l'utilisateur — traités dans des cycles brainstorm/plan distincts.
- Migration des lignes d'audit existantes vers un format avec snapshot.
- Undo en cascade (annuler une action qui a elle-même déclenché d'autres actions auditées) — chaque ligne s'annule indépendamment.

## Tests

Pas de suite de tests automatisés dans ce projet (harness Node VM local). Chaque groupe d'actions undo sera vérifié manuellement via `/verify` : provoquer l'action, vérifier la ligne de journal, annuler, vérifier que l'état revient exactement à l'avant, vérifier la nouvelle ligne "Action annulée", vérifier que le bouton se désactive.
