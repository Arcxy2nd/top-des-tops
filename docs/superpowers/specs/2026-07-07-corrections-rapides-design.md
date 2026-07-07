# Design — Corrections rapides (Groupe A)

**Date :** 2026-07-07

## Périmètre

Six corrections/ajouts isolés, sans dépendance entre eux, tous confirmés par lecture directe du code (pas d'hypothèse). Chacun est décrit avec sa cause racine et le fix retenu.

---

## 1. Sélection de texte impossible en saisie de lot

**Cause racine :** `Index.html:6529` — `div.draggable = true` est posé sur la ligne entière (`.entry-row`), et `attachRowDragEvents` (ligne 6472) attache `dragstart` directement dessus. Le drag natif HTML5 capte tout clic-glissé dans la ligne, y compris à l'intérieur des champs de texte, empêchant la sélection.

**Fix retenu :** Restreindre le drag à une poignée dédiée (icône `⋮⋮` ajoutée en début de ligne), sans librairie externe :
- La ligne garde `draggable="true"` (nécessaire pour que `dragstart` la vise), mais on bascule dynamiquement cet attribut selon l'origine du `mousedown` :
  - `mousedown` sur la poignée → `row.draggable = true`.
  - `mousedown` ailleurs dans la ligne (input, select, texte) → `row.draggable = false`, restauré à `true` au `mouseup`/`dragend` suivant.
- Aucun changement sur la logique de réordonnancement existante (`dragover`/`drop` inchangés).

---

## 2. Récap de lot mal formaté (concaténation de chaînes)

**Cause racine :** `Index.html:4720-4721` (`openLotRecapModal`) additionne `e.points` sans conversion numérique. `it.points` provient du DOM en tant que chaîne (`Index.html:7155`) et n'est converti en entier que dans la branche "répartir" (ligne 7205), pas dans la branche "répéter" (ligne 7199-7201).

**Fix retenu :** Convertir systématiquement `points` en entier au moment de la construction de l'item dans `submitBulk` (les deux branches "répéter" et "répartir"), avant qu'il n'atteigne `byDate`/`plan`. `openLotRecapModal` reçoit alors toujours des nombres et l'addition (`+=`) fonctionne normalement.

---

## 3. Groupes de lot qui fusionnent entre eux dans l'Historique

**Cause racine :** `Index.html:2945-2946` — `lotGroupSeq` est un compteur local (`'G' + lotGroupSeq`), remis à zéro après chaque envoi (`lotGroupSeq = 0` ligne 7261). Deux lots envoyés séparément peuvent tous les deux produire le tag `'G1'`. Le rendu de l'Historique regroupe par égalité stricte de `groupId` (`Index.html:7712-7722`), donc ces deux lots distincts apparaissent fusionnés sous un seul groupe visuel.

**Fix retenu (future-proof) :** Générer l'identifiant de groupe **côté serveur**, dans `Code.gs` (`appendBulkPlan`), avec le même schéma déjà utilisé ailleurs dans le fichier pour ce cas (`apiGroupRows` ligne 1645, `apiGroupDistributedLots` ligne 1627) : `'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)`. Le front continue d'assigner des tags temporaires locaux (`G1`, `G2`...) uniquement pour l'affichage pendant la construction du lot (avant envoi) ; au moment de l'écriture, le serveur remplace chaque tag temporaire distinct présent dans le payload par un identifiant généré côté serveur. Élimine toute collision, y compris entre onglets/sessions/utilisateurs simultanés, sans introduire un nouveau schéma d'ID dans le codebase.

---

## 4. Dissocier une seule entrée d'un groupe

**Cause racine :** `Code.gs:1661-1679` (`apiUngroupLot`) ne prend qu'un `groupId` et vide la colonne groupe de **toutes** les lignes qui le portent. Aucune fonction ne cible une seule ligne.

**Fix retenu :** Nouvelle fonction backend `apiRemoveFromGroup(rowIndex, author)` qui vide uniquement le `groupId` de la ligne ciblée (même mécanique que `apiUngroupLot`, filtrée sur un seul index de ligne au lieu d'un groupe entier). Côté front, dans le rendu d'un groupe déplié dans l'Historique (`renderGroupHeader`), ajouter une action "Retirer du groupe" sur chaque entrée membre (visible uniquement quand le groupe a plus de 2 membres restants, sinon proposer directement le dégroupement total existant).

---

## 5. Bouton barème (FAB) qui chevauche d'autres éléments

**Cause racine :** `Index.html:830-843` — `.bareme-fab` est `position: fixed; bottom: ...; left: 20px; z-index: 1500`, sans zone réservée. Rien n'empêche un toast, un tiroir mobile ou le clavier virtuel de venir le chevaucher.

**Fix retenu :** Sortir le barème du flottant. L'intégrer comme un bouton permanent dans la barre d'outils/header (desktop) et dans le drawer de navigation mobile (déjà généré depuis `NAV_PAGES`, voir spec mobile existante) — au même niveau que les autres actions globales (thème, identité). Un bouton ancré dans un conteneur de layout ne peut plus chevaucher du contenu, contrairement à un élément `position: fixed`. Suppression de `.bareme-fab` et de son CSS associé.

---

## 6. Permission `ScriptApp.getProjectTriggers` manquante

**Cause racine :** `AutoPoints.gs:258-337` appelle `ScriptApp.getProjectTriggers()` / `ScriptApp.newTrigger()` sans manifeste `appsscript.json` déclarant le scope OAuth `https://www.googleapis.com/auth/script.scriptapp`. `apiGetAutoRules` masque en plus l'erreur dans un `try/catch` silencieux (ligne 294), donc l'utilisateur ne voit qu'un état "non installé" trompeur au lieu du vrai message d'autorisation.

**Fix retenu :**
- Créer/compléter `appsscript.json` avec le scope `https://www.googleapis.com/auth/script.scriptapp` explicitement déclaré (nécessite une nouvelle autorisation utilisateur au prochain déploiement — à signaler dans les notes de déploiement).
- Retirer le `try/catch` silencieux dans `apiGetAutoRules` : remonter l'erreur réelle au front pour affichage clair si l'autorisation manque encore après redéploiement, plutôt que de la faire passer pour "aucune règle installée".

---

## Hors scope

- Refonte visuelle complète de l'onglet Automatisations (demande séparée, chantier "Groupe B").
- Toute nouvelle fonctionnalité de sélection d'historique au-delà du point 4 (chantier "Groupe B").

## Vérification

- Aucun impact sur le schéma du Sheet sauf le point 6 (nouveau scope OAuth, redéploiement requis) et le point 3 (le contenu de la colonne `GroupId` change de format : `G1`/`G2` → UUID — comportement transparent pour l'utilisateur, aucune migration de données existantes nécessaire, les anciens groupes déjà écrits restent valides tels quels).
- Test via le harnais Node existant (`tests/harness.js`) pour les fonctions `Code.gs` modifiées (`appendBulkPlan`, nouvelle `apiRemoveFromGroup`, `apiGetAutoRules`).
- Test manuel en environnement GAS réel pour le point 6 (autorisation OAuth) et les points UI (1, 2, 4, 5).
