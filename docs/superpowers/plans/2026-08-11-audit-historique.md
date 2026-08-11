# Passe 2 — 📜 Historique + 🔍 Journal d'audit

> Protocole : [`2026-08-11-audit-onglet-par-onglet.md`](2026-08-11-audit-onglet-par-onglet.md). Les contraintes globales de ce document s'appliquent à toutes les tâches ci-dessous.

**État :** ✅ passe livrée en v3.9.0 — `npm run verify` vert (153 tests), corrections re-vérifiées au navigateur après redémarrage propre du serveur de prévisualisation.
**Ligne de base :** v3.8.2, 152 tests verts, 0 erreur console au chargement (héritée de la passe 1)

---

## Carte — phase 1

### Structure de la cible

`#tab-history` (Index.html:4748-4850) contient **deux sous-onglets** commutés par `.history-inner-nav` (l.4751-4754), pas deux onglets séparés :

| Sous-onglet | Conteneur | Lignes |
|---|---|---|
| 📜 Entrées | `#stab-history-entries` | 4757-4808 |
| 🔍 Journal d'audit | `#stab-history-audit` | 4811-4848 |

Cette passe couvre les deux sous-onglets comme une seule cible, conformément au registre du plan-cadre (ligne 2 : « 📜 Historique + 🔍 Journal d'audit »).

### HTML — détail des blocs

**Entrées** : filtres (`historyTextFilter`, `historyDateFrom`/`historyDateTo`, `histSortBtn`, `refreshHistoryBtn`, `histSelectBtn`), chips de filtre (période, joueurs, tops, tops alt), tableau paginé (`historyTableBody`, `historyPagination`), barre d'actions groupées (`histBulkBar` : éditer, affecter/retirer Top Alt, tout sélectionner, grouper, supprimer, annuler).

**Journal d'audit** : filtres (`auditFilterSearch`, `auditFilterAuthor`, `auditFilterAction`, `auditFilterFrom`/`auditFilterTo`, `auditSortBtn`, `auditRefreshBtn`), chips de période (`auditRangeChips`), tableau paginé (`auditTableBody`, `auditPagination`), colonnes Quand/Qui/Action/Entité/Avant→Après/Détail/(bouton annuler).

### JS frontend — fonctions principales

| Fonction | Ligne | Rôle |
|---|---|---|
| `loadHistoryPage(page)` | 13945 | charge et affiche une page de l'Historique |
| `toggleHistSelectMode(force)` | 13496 | bascule le mode sélection multiple |
| `confirmBulkDelete()` | 13517 | confirmation + suppression groupée |
| `openBulkEditModal()` | 14904 | modale d'édition groupée |
| `openFullEditHistoryModal(log)` | 15058 | modale d'édition d'une entrée |
| `loadAuditLog(page)` | 13553 | charge et affiche une page du Journal d'audit |
| `renderAuditTable(res)` | 13615 | rendu du tableau du Journal |

Câblage des écouteurs : l.16058-16221 (Entrées + actions groupées), l.16062-16078 (Journal : refresh, filtres auteur/action, dates, tri, recherche).

### Backend — `Code.gs`

**Entrées** : `apiGetHistoryPage` (2118), `apiDeleteHistoryEntries` (2202), `apiUpdateHistoryEntry` (2674), `apiUpdateBulkEntries` (2811), `apiGroupRows` (3035), `apiUngroupLot` (3059), `apiRemoveFromGroup` (3326), `apiGroupSimilarEntries` (2392), `apiLinkHistoryRowsToAltCategory` / `apiUnlinkHistoryRowsFromAltCategory`.

**Journal** : `apiGetAuditLog` (2455), `apiGetAuditActionTypes` (2510), `apiUndoAuditEntry` (2523).

### Tests existants couvrant la zone

`tests/audit.test.js` · `tests/bulk-edit.test.js` · `tests/alt-tops.test.js` · `tests/alt-points-management.test.js` · `tests/storage.test.js` (pagination/groupage) · `tests/cache.test.js` (impact cache sur l'historique) · `tests/identity.test.js` (identité sur undo)

### Historique — fragilités déjà signalées (CHANGELOG.md)

Onglet très corrigé, signal de fragilité fort :
- pagination mal calculée → page blanche complète (régression sévère, déjà corrigée) ;
- bouton « Annuler » du Journal ne redemandait pas l'identité (violation de la règle Identité, déjà corrigée) ;
- changement de preset de phrases sans trace au Journal (violation de la règle Journalisation, déjà corrigée) ;
- régression du 10 juillet : lignes « Dégroupement lot »/« Retrait du groupe » qui n'affichaient plus d'info (déjà corrigée) ;
- rechargement inutile à chaque clic d'onglet (perf/UX, déjà corrigé) ;
- liste des actions filtrables désynchronisée des actions réellement enregistrées (déjà corrigée, passée à génération automatique) ;
- parité mobile : sous-onglet Journal d'audit absent du mobile jusqu'à correction récente.

**À surveiller en priorité (axe 5 + axe 3) :** la pagination et le groupage/dégroupement de lots ont déjà cassé deux fois — zone sensible aux régressions silencieuses.

### Écart avec `context.md`

`context.md` §5 mentionne bien le sous-onglet Journal d'audit sous Historique — cohérent avec la structure réelle. Pas d'écart à corriger.

---

## Relevés — phase 2

### I1 — Instrument défectueux, corrigé avant de poursuivre : le Journal d'audit paraissait toujours vide

`AuditService._getOrCreateSheet()` (Code.gs:215-223) crée l'onglet `AuditLog` à la volée via `ConfigService.getSheets().spreadsheet.insertSheet('AuditLog')`. Le harness de prévisualisation (`tests/frontend/fixtures.js`) ne fournissait ni clé `spreadsheet`, ni clé `auditLog` dans son objet `sheets` statique — `cache.spreadsheet` valait `undefined`, donc `.insertSheet(...)` levait une `TypeError`, systématiquement avalée par le `try/catch` muet d'`AuditService.log()` (Code.gs:232-247, avalage volontaire et documenté : « Never throws — audit failure must not break the caller »). Résultat observable : le Journal d'audit affichait toujours « Aucune entrée dans le journal. », quelle que soit l'action réalisée, alors que le vrai `Code.gs` fonctionne correctement (confirmé par `tests/audit.test.js`, qui stub `spreadsheet`/`auditLog` correctement par test).

Comme pour R1 en passe 1 (23 fonctions non exposées par le harness), c'est un défaut de l'instrument, pas de l'application — mais il aurait invalidé toute observation sur le Journal d'audit sans être imputé d'abord.

**Corrigé :** `tests/frontend/fixtures.js` fournit désormais un mock `spreadsheet.insertSheet(name)` générique (mappe `AuditLog`/`Settings`/`AutoRules`/`Notes`/`Bareme`/`Phrases`/`Chat`/`AltCategories`/`AltHistory` → leur clé `ConfigService`), qui enregistre la feuille créée dans l'objet `sheets` partagé. `npm run verify` toujours vert (152 tests, aucun test Node existant ne consomme ce fichier autrement que via `serve.js`). Serveur de prévisualisation redémarré pour prendre en compte le fix (leçon de la passe 1 : process Node qui garde l'ancien module en mémoire).

Après correction, une action réelle (groupement de 2 entrées) apparaît immédiatement dans le Journal, avec avatar, catégorisation d'icône, colonne Détail correcte, et le bouton « ↩️ Annuler » fonctionne (testé sur une action « Modification entrée » avec snapshot : annulation réussie, ligne source marquée « Action annulée »).

### R9 — Bouton « ↩️ Annuler » du Journal : `confirm()` natif au lieu de la modale stylée de l'app (CONFIRMÉ, sévère)

`Index.html:13752` : `if (!confirm('Annuler cette action (...)) return;` — dialogue natif du navigateur, alors que **toutes** les autres actions confirmables de l'app (suppression groupée, groupement de lot, suppression de preset excepté) passent par `openConfirmModal()` (Index.html:8754), une modale thémée cohérente avec le reste de l'UI (dark/light, avatars, styles boutons).

Un seul autre endroit du fichier entier fait la même chose : `handleDeletePreset()` (Index.html:6308, Paramètres → Commentaires, hors périmètre de cette passe — sera relevé en passe 4 Paramètres).

Reproduit dans le navigateur : cliquer sur « ↩️ Annuler » avec une identité sélectionnée ne produit **aucun changement visible** dans le contexte d'automatisation du navigateur (le dialogue natif `confirm()` n'a pas de représentation DOM interceptable) — en conditions réelles utilisateur, `confirm()` s'affiche bien mais casse la cohérence visuelle : pas de thème, pas d'avatar, style du navigateur brut. En le contournant (`window.confirm` stubé à `true`), la logique d'annulation elle-même fonctionne parfaitement (testé : annulation réussie, toast succès, ligne mise à jour, historique et audit rechargés, 0 erreur).

### R10 — Couleur du texte figée après bascule de thème, sur tout élément visible avec `transition: color` piloté uniquement par une custom property (CONFIRMÉ, sévère, transverse)

Même famille que R7 (passe 1, fond de page figé), mais sur `color` plutôt que `background`, et donc **non couvert par le fix de R7/C6** (qui n'excluait que `background-color` de la liste `transition`). `body` (Index.html:76-90) garde `transition: color 0.3s ease;`, et la règle générique `select, input[type="text"], input[type="url"], input[type="date"], input[type="number"], textarea` (Index.html:516-529) garde `color 0.2s ease` dans sa liste `transition`.

Reproduit dans le navigateur : sur le sous-onglet Journal d'audit (visible au moment de la bascule), après clic sur le bouton de thème, `getComputedStyle(#auditFilterSearch).color` reste `rgb(241, 245, 249)` (texte quasi blanc, valeur du thème sombre) sur un fond `rgb(255, 255, 255)` (blanc, thème clair) — texte illisible. Même symptôme sur `#auditFilterAuthor`/`#auditFilterAction` (select) et sur `document.body` lui-même. Confirmé **non lié à la largeur d'écran ni au mode mobile** (reproduit identique en `desktop-layout`).

**Cause isolée sur un cas minimal indépendant du projet** (même méthode que R7) : un élément avec `--x: red; color: var(--x); transition: color .1s;` dont on bascule `--x` à `blue` via une classe — `getComputedStyle(...).color` reste `rgb(255, 0, 0)` indéfiniment (vérifié après 1 s d'attente), alors qu'un élément identique **sans** la ligne `transition` bascule immédiatement. Confirme que le quirk moteur documenté en passe 1 pour `background` s'applique identiquement à `color`.

**Élément déterminant du symptôme :** seuls les éléments **visibles** (pas `display:none`) au moment précis du toggle de thème gèlent — les champs du sous-onglet Entrées (masqué pendant que le Journal était affiché) affichaient la bonne couleur immédiatement après bascule, car un élément cible `display:none` ne joue pas sa transition et saute directement à la valeur finale.

**Portée :** tout le corps de page (`body`) et **tous** les champs `select`/`input[text|url|date|number]`/`textarea` de l'app visibles au moment de la bascule de thème — recherche, dates, dropdowns d'auteur/action, filtres texte, etc. Un défaut transverse à toute l'application, pas seulement à l'Historique/Journal, découvert ici mais dont la correction (retirer `color` des listes `transition` concernées, même traitement que R7 pour `background-color`) profite à tous les onglets.

### R11 — Colonne « Avant → Après » du Journal : formats de date asymétriques (CONFIRMÉ, mineur)

Sur une entrée « Modification entrée », la valeur « Avant » est formatée en `JJ/MM/AAAA` (ex. `28/08/2026`, via `_historyRowSummary()`) tandis que la valeur « Après » reste au format ISO brut `AAAA-MM-JJ` (ex. `2026-08-28`), construite inline dans `apiUpdateHistoryEntry` (Code.gs:2683-2685) avec `fields.date || ''` sans passer par le même formatage. Un utilisateur lisant la diff voit deux formats de date différents pour la même colonne logique.

### R12 — Liste des actions filtrables du Journal non rafraîchie après une nouvelle action (CONFIRMÉ, mineur)

`apiGetAuditActionTypes()` n'est appelé qu'une fois, à l'ouverture du sous-onglet Journal (`initHistoryTabs`, Index.html:6741). Le bouton « 🔄 Actualiser » (`auditRefreshBtn`) ne recharge que `loadAuditLog(1)`, pas la liste des actions (Index.html:16062). Une action jamais vue avant (ex. première « Groupement lot » de la session) reste absente du menu déroulant « Toutes les actions » tant que l'utilisateur ne quitte/revient pas sur le sous-onglet — écart avec l'intention documentée du CHANGELOG (« se construit maintenant automatiquement à partir des actions réellement enregistrées »), qui suppose une liste à jour.

### Contrôles vérifiés sans défaut

- Filtres Historique (texte, dates, joueurs, tops, tops alt, tri, période) : chargement, aucune erreur.
- Mode sélection multiple (`☑ Sélectionner`), sélection de 2 lignes, barre d'actions groupées visible.
- Identité obligatoire avant action groupée (`requireIdentity()`) : bloque correctement le groupement sans identité sélectionnée, toast + pulse sur le bouton d'identité.
- Groupement de 2 entrées via `histBulkGroup` (avec modale de confirmation stylée `openConfirmModal`) : succès, toast, tableau rafraîchi, entrée journalisée avec avatar.
- Édition d'une entrée via la modale complète (`openFullEditHistoryModal`) : sauvegarde réussie, 0 erreur, journalisée avec snapshot (undoable).
- Annulation d'une action journalisée (`apiUndoAuditEntry`) : fonctionne, toast succès, ligne source marquée « Action annulée », historique et audit rechargés — testé en contournant R9.
- Panne backend simulée sur `apiGetAuditLog` (toutes requêtes `/call` en échec) : toast d'erreur affiché, aucun blocage, aucun squelette figé.
- Cas vide réel (fixtures sans entrée Journal avant le fix de l'instrument) : message « Aucune entrée dans le journal. » correctement affiché, pas de plantage.
- Largeur mobile (375px, `mobile-layout` auto-détecté) : aucun débordement horizontal (`scrollWidth === innerWidth`), sous-onglet Journal accessible, 0 erreur.
- Entité fantôme « Name » (R4, passe 1) : absente de tous les filtres/dropdowns de cette cible — le fix de la passe 1 tient.

## Clôture phase 2

Sonde terminée. 1 défaut d'instrument corrigé avant de poursuivre (I1), 4 défauts applicatifs relevés (R9 confirmé sévère, R10 confirmé sévère et transverse, R11 et R12 mineurs), aucune anomalie sur le reste du périmètre (filtres, sélection groupée, édition, groupement, annulation, panne backend, mobile, entité fantôme).

## Défauts candidats — phase 3

Conseil à 5 en mode local (mêmes rôles que la passe 1 : `correctness`/`data-truth`/`house-rules`/`ergonomics`/`code-quality`, un par axe, cinq sous-agents `Agent` en parallèle, aveugles les uns aux autres, chacun avec la carte + les relevés phase 2 et consigne de ne pas resignaler I1/R9/R10/R11/R12 déjà trouvés). Union brute, doublons non fusionnés à ce stade (fait en phase 4).

**Axe 1 — Ça marche**
- C1. `loadHistoryPage`/`_doLoadHistoryPage` (Index.html:14203-14207) : `callServer('apiGetHistoryPage', ...)` sans `onError` — le squelette de chargement (`showTableSkeleton`) posé avant l'appel ne se retire jamais si le serveur échoue (business error ou coupure réseau) ; seul un toast s'affiche par-dessus.
- C2. Bouton « ↩️ Annuler » du Journal (Index.html:13746-13764) : `undoBtn.disabled = true` posé avant l'appel, remis à `false` seulement dans la branche `res.success === false` — en cas d'échec réseau (`withFailureHandler`, pas d'`onError` fourni), le bouton reste grisé indéfiniment.
- C3. Suppression différée d'entrées (Index.html:13897-13943) : les lignes sont marquées visuellement supprimées (`hist-pending-delete`) avant même l'appel serveur (UI optimiste) ; si `apiDeleteHistoryEntries` échoue après les 5s de délai, aucun code ne retire la classe ni ne recharge — lignes grisées/barrées indéfiniment sans que la suppression ait eu lieu.
- C4. `loadAuditActionTypes` (Index.html:13537-13551) : le garde `_auditActionsLoaded = true` est posé avant que l'appel aboutisse et jamais réinitialisé sur échec — un seul échec transitoire bloque tout rechargement futur de la liste des actions, même en quittant/revenant sur le sous-onglet.
- C5. Suppression individuelle d'une entrée (Index.html:14393-14399) : la modale de confirmation s'ouvre sans vérifier `requireIdentity()` au préalable (contrairement au bouton « Retirer du groupe » juste au-dessus, Index.html:14382) — la vérification n'intervient qu'après confirmation, dans `scheduleDeletion()`. Pas de faille, mais confirmation inutile si l'identité manque.

**Axe 2 — Ça dit vrai**
- C6. `AltHistory.refHistoryRowId` (Code.gs:1103-1116, écrit en 628/1236) est un numéro de ligne Historique **absolu et figé** — toute suppression d'une ligne Historique en amont (`apiDeleteHistoryEntries`, `apiDeleteGroup`, `fixZeroPoints`, `deleteOrphans`) décale les lignes suivantes sans renuméroter les références, donc les badges/filtres « Top Alternatif » peuvent se raccrocher à la mauvaise entrée après coup. Précédent : CHANGELOG.md:513 documente exactement ce bug pour les Notes (corrigé par NoteId au lieu du numéro de ligne) — jamais répliqué sur `AltHistory`.
- C7. Décalage de fuseau horaire possible entre la date stockée (calculée en `Europe/Paris` côté serveur) et son affichage/pré-remplissage côté navigateur (`toDateStr`, `toLocaleDateString`, Index.html:8104-8109/14253/14922-14924) qui utilise le fuseau local du visiteur — un visiteur hors Europe peut voir/modifier une date décalée d'un jour pour une entrée proche de minuit heure de Paris.

**Axe 3 — Règles maison**
- C8. Boutons d'action du tableau Historique et du Journal (✏️ modifier, 🗑️ supprimer, 🔓 dissocier, ➖ retirer du groupe, ↩️ annuler) utilisent `button.small` (`min-height: 34px`, Index.html:577) sans override à 44px dans la zone Historique ni dans les media queries mobile — sous la cible tactile minimale règle maison sur les actions les plus fréquentes de l'onglet en mobile.

**Axe 4 — Utilisable**
- C9. Suppression d'un groupe entier (`deleteGroupBtn`, Index.html:14131-14148 → `apiDeleteGroup`, Code.gs:3340-3361) : contrairement à toute autre suppression de la page (entrée seule, sélection groupée — toutes deux via `scheduleDeletion()` + toast 5s + annulable), celle-ci supprime immédiatement sans snapshot ni filet de rattrapage — ni toast annulable, ni bouton « ↩️ Annuler » possible ensuite (pas de 7ᵉ argument snapshot passé à `AuditService.log`).
- C10. État vide du Journal (Index.html:13621-13627, texte brut) n'utilise pas `emptyIllustration()` (icône + message) contrairement aux autres états vides de l'app (Index.html:13963, 14438).
- C11. Filtre « Auteur » du Journal (liste `cachedPlayers`, joueurs actuels) et filtre « Action » (liste dynamique des actions réellement journalisées) suivent deux logiques différentes côte à côte — un joueur supprimé des Paramètres disparaît du filtre Auteur bien que ses lignes restent visibles dans le tableau.

**Axe 5 — Code sain**
- C12. `AuditService.log(author, action, entity, before, after, detail, snapshot)` appelé avec seulement 4 arguments à 5 endroits (Code.gs:2398 `apiGroupSimilarEntries`, 2351, 2362, 2373, 2319-2320) — le message voulu pour « Détail » atterrit dans « Avant » (5ᵉ paramètre positionnel), car ces actions ne sont pas dans `AUDIT_NO_DIFF_ACTIONS` (Index.html:13609-13613) : affichage trompeur dans la colonne Avant→Après du Journal.
- C13. Branche `if (res && res.success === false)` dupliquée et inatteignable à l'intérieur de 3 callbacks `onSuccess` de `callServer` (Index.html:13755 undo, 15040 édition groupée, 15120 édition complète) — `callServer` filtre déjà ce cas avant d'appeler `onSuccess` (Index.html:8586-8590).
- C14. Nombre de colonnes AuditLog (`9`) répété en dur à 4 endroits (Code.gs:219-220, 364, 2462, 2740) sans constante nommée.
- C15. Motif dupliqué « lire colonne F, modifier, réécrire, journaliser, vider le cache » dans `apiGroupRows`/`apiUngroupLot`/`apiDeleteGroup`/`apiRemoveFromGroup` (Code.gs:3035-3082, 3326-3361).
- C16. `_historyRowSummary`/`_noteRowSummary`/`_baremeRowSummary`/`_phraseRowSummary` (Code.gs:2132-2174) partagent la même structure try/catch sans helper commun.
- C17. `_renderHistoryPage` (Index.html:13949-14177, ~230 lignes) mélange regroupement logique, construction DOM d'en-tête de groupe, rendu des lignes enfants — plusieurs responsabilités.
- C18. `openBulkEditModal` (14904-15056) et `openFullEditHistoryModal` (15058-15133) sont des quasi-doublons structurels (même formulaire, même gabarit modal, même validation).
- C19. Tailles de page dupliquées en 3 endroits indépendants : `PAGE_SIZE=20` (Index.html:5233), `AUDIT_PAGE_SIZE=20` (5441), repli serveur `|| 20` (Code.gs:2499) — non centralisées dans l'objet `CONFIG` existant.

## Améliorations candidates — phase 3

**Axe 1** — Aucun état de chargement sur `loadAuditLog` (contrairement à `loadHistoryPage`) ; aucun bouton d'action serveur désactivé pendant l'appel (double-clic possible) ; `apiGroupRows`/`apiUngroupLot`/`apiRemoveFromGroup` renvoient `success:true` même si 0 ligne réellement touchée (contrairement à `apiUpdateBulkEntries` qui a un tableau `skipped`) ; code mort trompeur — branches `else` de `if(res.success)` dans 6 callbacks qui ne s'exécutent jamais.

**Axe 2** — Condition de garde toujours vraie dans `apiUpdateBulkEntries` (Index.html:15003-15007, points) qui laisse croire à une distinction mixte/non-modifié inexistante ; absence de documentation sur la distinction `total` (unités visuelles) vs `totalEntries` (lignes réelles) dans `apiGetHistoryPage` ; pas de détection de conflit de concurrence sur la lecture « Avant » avant action (contrairement à `AuditService.undo`'s `_locate()`).

**Axe 3** — Garde d'affichage incohérente entre `histBulkAltLink` (pas de vérification taille sélection) et ses boutons voisins ; zone tactile de la cellule « Annuler » élargie en CSS mais bouton visuel toujours 34px (patch partiel) ; `audit-color-dot` avec bordure `rgba(255,255,255,0.3)` fixe plutôt qu'une variable de thème.

**Axe 4** — Pas de compteur sur le sous-onglet Journal (contrairement aux Entrées) ; affordance de clic invisible au tactile sur `.hist-desc-toggle` (description tronquée) ; pas d'indicateur pendant le debounce (350ms) de la recherche du Journal.

**Axe 5** — (regroupées avec les défauts C15/C16/C17/C18/C19 ci-dessus, qui sont déjà de nature « amélioration de code sain » sans bug associé).

## Défauts confirmés — phase 4

Vérification adversariale : citation exacte des lignes qui rendent chaque défaut inévitable (recoupée par grep sur le fichier actuel), reproduction navigateur pour les points déjà couverts en phase 2 (R9-R12).

| # | Verdict | Preuve de vérification |
|---|---------|------------------------|
| C1 | **CONFIRMÉ** | Code cité (Index.html:14203-14207) : `callServer('apiGetHistoryPage', ..., 'Chargement historique')` — 4 arguments seulement, pas d'`onError`. `showTableSkeleton()` posé juste avant. |
| C2 | **CONFIRMÉ** | Code cité (Index.html:13750-13764) : `undoBtn.disabled=false` uniquement dans la branche `res.success===false` ; `callServer('apiUndoAuditEntry', ..., 'Annuler action journal')` sans 5ᵉ argument — un échec réseau (`withFailureHandler` sans `onError`) laisse le bouton grisé. |
| C3 | **CONFIRMÉ** | Code cité (Index.html:13937-13940) : `callServer('apiDeleteHistoryEntries', [rowIndexes, ...], () => {...}, 'Suppression historique')` — pas d'`onError`, alors que la classe `hist-pending-delete` a déjà été posée en optimiste avant le `setTimeout`. À comparer avec la version correcte de la même fonction (Index.html:13894, qui a bien un 5ᵉ argument `() => callback()`). |
| C4 | **CONFIRMÉ** | Code cité (Index.html:13537-13545) : `_auditActionsLoaded = true` posé en synchrone avant l'appel, jamais remis à `false` en cas d'erreur. |
| C5 | **CONFIRMÉ, mineur** | Code cité (Index.html:14393-14400) : `delBtn` ouvre `openConfirmModal` directement, sans `requireIdentity()` préalable, contrairement à `unlinkBtn` juste au-dessus (14382). Pas de faille (`scheduleDeletion` bloque après coup) mais confirmation inutile si identité absente. |
| C6 | **CONFIRMÉ, sévère** | Code cité : `AltStorageService.getAltHistoryMap()` (Code.gs:1103-1116) indexe par `refHistoryRowId`, un numéro de ligne absolu. `apiDeleteHistoryEntries` (Code.gs:2202-2216) et `apiDeleteGroup` (Code.gs:3340-3361) appellent `history.deleteRow(ri)`, qui décale toutes les lignes suivantes, sans jamais toucher `AltHistory.refHistoryRowId`. Précédent identique déjà corrigé pour les Notes (CHANGELOG.md:513, passage de numéro de ligne à un identifiant stable) — jamais répliqué ici. |
| C7 | **PLAUSIBLE, non corrigé cette passe** | Mécanisme réel (fuseau serveur Europe/Paris vs fuseau local du navigateur), mais impact limité à un usage multi-fuseaux et à des entrées proches de minuit — hors du profil d'usage documenté du projet (groupe d'amis, probablement même fuseau). Documenté, non traité pour ne pas complexifier la gestion de dates sans preuve de gêne réelle. |
| C8 | **CONFIRMÉ** | Grep : `button.small { min-height: 34px; }` (Index.html:577), aucune règle de la zone Historique/Journal ne relève cette valeur à `var(--tap-min)` pour les boutons d'action de ligne (seule `.history-nav-btn` en bénéficie). |
| C9 | **CONFIRMÉ, sévère** | Code cité : `apiDeleteGroup` (Code.gs:3340-3361) appelle `AuditService.log(author, 'Suppression groupe', 'History', groupId, '', ...)` — 6 arguments, pas de 7ᵉ `snapshot` → `undoable` restera faux. Suppression immédiate (`sheet.deleteRow`), sans passer par `scheduleDeletion()` (contrairement à toute autre suppression de la cible). |
| C10 | **CONFIRMÉ, mineur** | Grep : `renderAuditTable` (Index.html:13621-13627) utilise `td.textContent = 'Aucune entrée...'` ; `emptyIllustration()` n'est utilisé qu'à 2 autres endroits (13963, 14438), pas ici. |
| C11 | **CONFIRMÉ, non prioritaire** | Code cité : `auditFilterAuthor` peuplé depuis `cachedPlayers` (Index.html:9323-9330) vs `auditFilterAction` peuplé dynamiquement depuis `apiGetAuditActionTypes()`. Vrai écart de logique, mais impact limité (un joueur supprimé des Paramètres reste rare) — reporté, corrections plus profondes (snapshot d'auteur) hors périmètre proportionné de cette passe. |
| C12 | **CONFIRMÉ** | Grep : 5 sites (Code.gs:2320, 2351, 2362, 2373, 2398) appellent `AuditService.log(author, action, entity, <texte>)` avec seulement 4 arguments — le texte tombe dans `before` (5ᵉ paramètre positionnel de `log()`, Code.gs:232). Aucune des 5 actions n'est dans `AUDIT_NO_DIFF_ACTIONS` (Index.html:13609-13613) → s'affiche dans la colonne Avant→Après au lieu de Détail. |
| C13 | **CONFIRMÉ, non prioritaire** | Code cité : `callServer` (Index.html:8586-8590) n'invoque `onSuccess` que si `res.success !== false` — la re-vérification dans les 3 callbacks cités (13755, 15040, 15120) est bien inatteignable. Code mort sans impact fonctionnel — reporté. |
| C14 | **CONFIRMÉ, non prioritaire** | Grep : `9` répété en dur à Code.gs:219(header)/364/2462/2740. Vrai mais sans risque immédiat (schéma stable) — reporté. |
| C15 | **CONFIRMÉ, non prioritaire** | Duplication vérifiée par lecture directe de `apiGroupRows`/`apiUngroupLot`/`apiDeleteGroup`/`apiRemoveFromGroup`. Refactor de code sain sans bug associé — reporté (prudence sur la logique de groupage, déjà zone sensible aux régressions d'après l'historique CHANGELOG). |
| C16 | **CONFIRMÉ, non prioritaire** | Structure dupliquée confirmée par lecture. Reporté, aucun bug associé. |
| C17 | **CONFIRMÉ, non prioritaire** | Taille de fonction vérifiée (~230 lignes). Refactor pur — reporté, même logique prudente que C15 (zone `_renderHistoryPage` correspond à l'affichage groupé, déjà signalée fragile). |
| C18 | **CONFIRMÉ, non prioritaire** | Duplication structurelle vérifiée par lecture des deux fonctions. Reporté — refactor de fond hors périmètre proportionné d'une passe de réparation. |
| C19 | **CONFIRMÉ, mineur** | Grep : `PAGE_SIZE=20` (Index.html:5233), `AUDIT_PAGE_SIZE=20` (5441), repli serveur `\|\| 20` (Code.gs:2499) confirmés. Amélioration de code sain sans bug — reporté. |
| R9 | **CONFIRMÉ** (déjà prouvé phase 2) | Reproduit dans le navigateur : `confirm()` natif invisible au tool d'automatisation, logique fonctionnelle une fois contournée. |
| R10 | **CONFIRMÉ** (déjà prouvé phase 2) | Reproduit sur cas minimal isolé + dans l'app réelle. |
| R11 | **CONFIRMÉ, mineur** (déjà prouvé phase 2) | Observé dans le Journal après une édition réelle. |
| R12 | **CONFIRMÉ, mineur** (déjà prouvé phase 2) | Code cité : `auditRefreshBtn` n'appelle que `loadAuditLog(1)`, pas `loadAuditActionTypes()` (Index.html:16062). |

## Écartés — phase 4

_(aucun défaut rejeté cette passe — tous les candidats se sont révélés réels au moins par citation de code ; seule leur priorité de correction diffère, voir tableau ci-dessus)_

## Correction — phase 5

Priorité : défauts confirmés à impact utilisateur direct (comportement cassé ou incohérence visible), plus les nettoyages triviaux et sûrs. Reportés (documentés ci-dessus avec leur raison) : C7, C11, C13-C19 — refactors de code sain sans bug associé, ou correctifs disproportionnés pour cette passe.

1. **C1, C2, C3, C4** — ajout des `onError` manquants (`apiGetHistoryPage`, `apiUndoAuditEntry`, `apiDeleteHistoryEntries` dans `scheduleDeletion`, réinitialisation de `_auditActionsLoaded` sur échec).
2. **C5** — `requireIdentity()` avant l'ouverture de la modale de suppression individuelle (cohérence avec `unlinkBtn`).
3. **C6** — renumérotation de `AltHistory.refHistoryRowId` après toute suppression de lignes Historique (`apiDeleteHistoryEntries`, `apiDeleteGroup`, `fixZeroPoints`, `deleteOrphans`).
4. **C8** — cibles tactiles des boutons d'action (✏️/🗑️/🔓/➖/↩️) portées à 44px en mobile.
5. **C9** — suppression de groupe routée via le même filet de rattrapage que les autres suppressions (snapshot + délai annulable).
6. **C10** — état vide du Journal avec `emptyIllustration()`.
7. **C12** — correction des 5 appels `AuditService.log()` à 4 arguments (texte déplacé en position `detail`).
8. **R9** — bouton Annuler du Journal : `confirm()` natif remplacé par `openConfirmModal()`.
9. **R10** — retrait de `color` des listes `transition` pilotées uniquement par une custom property de thème (`body`, règle générique des champs de formulaire).
10. **R11** — format de date cohérent entre « Avant » et « Après » dans `apiUpdateHistoryEntry`.
11. **R12** — `auditRefreshBtn` recharge aussi la liste des types d'action.

### Réalisé (livré v3.9.0)

Les 11 groupes ci-dessus ont tous été corrigés. Test de non-régression Node ajouté pour C6 (`tests/alt-tops.test.js` : suppression de lignes History renumérote/efface correctement les `refHistoryRowId` d'AltHistory). `npm run verify` vert à 153 tests (152 → 153, +1 test C6), 0 échec.

Re-sonde au navigateur après redémarrage complet du serveur de prévisualisation :

- C9 + R9 : groupement de 2 entrées → suppression du groupe entier → ligne « Suppression groupe » apparaît dans le Journal avec bouton « ↩️ Annuler » (absent avant le fix) ; clic dessus ouvre la modale stylée de l'app (`openConfirmModal`, plus de `confirm()` natif) ; confirmation → annulation réussie, 0 erreur.
- R10 : bascule vers le thème clair pendant que le Journal est affiché → `getComputedStyle(#auditFilterSearch).color` = `rgb(15, 23, 42)` (texte foncé correct) sur fond blanc, `document.body` idem — le gel de couleur a disparu.
- C10 : état vide du Journal affiche désormais l'icône 🗒️ via `emptyIllustration()`.
- C8 : en largeur mobile (375px), les boutons d'action de ligne (✏️ modifier) ont `min-height: 44px` — plus aucun bouton sous la cible tactile minimale. Aucun débordement horizontal introduit (`scrollWidth === innerWidth`).
- C1-C5, C12, R11, R12 : vérifiés par lecture directe du code corrigé et par le comportement observé lors des manipulations ci-dessus (aucune régression, aucune nouvelle erreur console sur l'ensemble de la sonde).

Note d'exhaustivité : le retrait de `color` des listes `transition` (R10) n'a couvert que les deux règles CSS relevées (`body`, champs de formulaire génériques) — comme pour R7/C6 en passe 1, aucun balayage exhaustif des autres règles `transition` de `Index.html` n'a été fait pour ce motif précis sur `color`. Signalé ici plutôt que balayé en silence.
