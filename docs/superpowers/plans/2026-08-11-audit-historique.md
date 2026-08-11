# Passe 2 — 📜 Historique + 🔍 Journal d'audit

> Protocole : [`2026-08-11-audit-onglet-par-onglet.md`](2026-08-11-audit-onglet-par-onglet.md). Les contraintes globales de ce document s'appliquent à toutes les tâches ci-dessous.

**État :** 🔄 en cours — phase 1 (cartographie)
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
