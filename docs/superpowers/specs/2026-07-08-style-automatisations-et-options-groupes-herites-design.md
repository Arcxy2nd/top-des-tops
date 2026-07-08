# Design — Style de l'outil Points automatiques + options granulaires sur l'outil Groupes hérités

**Date :** 2026-07-08

## Contexte

Deux irritants remontés par l'utilisateur sur la zone Paramètres → Outils :

1. La section **🤖 Points automatiques** ne respecte pas totalement les conventions visuelles du reste de l'app.
2. L'outil **⚠️ Groupes hérités à vérifier** (livré le 2026-07-08, `[[2026-07-08-groupes-herites-et-outil-lots-design.md]]`) n'offre qu'une seule action — dissocier *tout* le groupe — alors que l'utilisateur veut parfois ne détacher que certaines entrées, ou juste marquer le groupe comme vérifié sans y toucher.

## Périmètre

### 1. Style — Points automatiques

**Constat :** `renderAutoRules` (Index.html) affiche la catégorie en texte brut (`escapeHtml(rule.category)`), alors que partout ailleurs (Historique, outil lots répartis, outil groupes hérités) une catégorie s'affiche avec sa pastille colorée + emoji (`categoryColor`, `catIcon`, classe `.hist-pill`).

**Fix :** dans `renderAutoRules`, remplacer le texte brut de la catégorie par la même pastille colorée + emoji que les autres outils de cette page. L'avatar joueur, le toggle actif/inactif, le bouton de suppression et le formulaire de création restent inchangés — ils suivent déjà les patterns standards (`.qs-avatar`, `.tool-action`, `.add-form`).

### 2. Options granulaires — Groupes hérités à vérifier

**Constat :** `renderLegacyGroups` (Index.html) n'expose qu'une case à cocher par *groupe* et un seul bouton, "Dissocier la sélection", qui appelle `apiUngroupLot(groupId)` — un tout-ou-rien par groupe.

**Fix — trois actions au lieu d'une :**

1. **Case à cocher par entrée** dans le détail déplié de chaque groupe (en plus de la case globale du groupe, qui coche/décoche toutes ses entrées).
2. **"Dissocier les entrées cochées"** (remplace l'ancien bouton unique) — pour chaque entrée cochée, appelle `apiRemoveFromGroup(rowIndex, author)` (endpoint backend déjà existant, `Code.gs:1778`, retire une seule ligne de son groupe). Les entrées non cochées restent liées. Confirmation avant action (`openConfirmModal`), affichant le nombre d'entrées concernées.
3. **"Ignorer ce groupe"** — bouton par groupe, à côté du résumé replié. Marque le groupe comme vérifié sans modifier de données. Persisté côté client dans `localStorage` (clé `tdt_dismissed_legacy_groups`, valeur = le `groupId`), même pattern que "Ignorer ce lot" de l'outil voisin (`tdt_dismissed_lots`). Un groupe ignoré ne réapparaît plus aux scans suivants tant que son `groupId` ne change pas (il ne peut pas changer sans passer par une dissociation, qui le fait disparaître de toute façon).

**Comportement après action :**
- Après dissociation partielle : si toutes les entrées d'un groupe ont été dissociées, le groupe disparaît de la liste (comportement déjà obtenu en relançant le scan) ; sinon il reste affiché avec les entrées restantes.
- Après "Ignorer" : le groupe disparaît immédiatement de la liste affichée (pas besoin de relancer le scan).
- Si la liste devient vide après une de ces actions, afficher le message "Aucun groupe hérité suspect détecté. Tout est propre ✅".

**Hors scope :** logique de détection (`apiDetectLegacyGroups`) inchangée. Pas de bouton "ignorer" au niveau d'une entrée individuelle (seulement au niveau du groupe) — une entrée qu'on ne veut pas dissocier, on ne la coche simplement pas.

## Vérification

- Aucune migration de données : les entrées cochées ne sont retirées de leur groupe que sur clic explicite confirmé.
- Test Node existant (`tests/cache.test.js`) inchangé — pas de changement backend, `apiRemoveFromGroup` existe déjà et est déjà couvert ailleurs le cas échéant.
- Vérification manuelle en navigateur : pastille catégorie dans Points automatiques, cases par entrée, dissociation partielle (le groupe garde les entrées non cochées), dissociation totale (le groupe disparaît), "Ignorer ce groupe" (disparaît immédiatement, reste ignoré après rechargement de page).
