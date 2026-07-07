# Design — Refonte UX ciblée (Groupe B)

**Date :** 2026-07-07

## Périmètre

Quatre améliorations ciblées, indépendantes les unes des autres, sur des fonctionnalités existantes.

---

## B1. Vérification d'identité avant ouverture (pas avant sauvegarde)

**Constat :** Le motif `if (!requireIdentity()) return;` est déjà appliqué de façon cohérente dans tout le fichier — mais systématiquement au moment de l'action d'écriture (clic sur "Enregistrer"), jamais au moment de l'ouverture d'une boîte de saisie. `openBulkEditModal` (`Index.html:8417-8418`) est la seule exception qui vérifie déjà à l'ouverture — c'est le modèle à suivre.

**Problème concret :** L'utilisateur ouvre une boîte d'édition, tape du texte, clique "Enregistrer", découvre qu'il doit choisir son identité, ferme la boîte pour aller la choisir (le sélecteur est dans l'en-tête, hors de la boîte modale) → le texte tapé est perdu car `closeModal()` vide le contenu de la boîte (`box.innerHTML = ''`).

**Fix retenu :** Ajouter `if (!requireIdentity()) return;` en toute première ligne des fonctions suivantes, qui ouvrent une boîte de saisie de texte libre :
- `openEditNoteModal` (`Index.html:8375`) — édition de note
- `openPhraseModal` (`Index.html:3402`) — édition de phrase de commentaire
- `openEditModal` (`Index.html:4741`) — édition joueur/catégorie (nom, description, icône, couleur)
- `openFullEditHistoryModal` (`Index.html:8565`) — édition complète d'une entrée d'historique
- `openBulkImportModal` (`Index.html:3610`) — import de phrases en masse (gros pavé de texte collé)
- `openCreatePresetModal` (`Index.html:3446`) et `openRenamePresetModal` (`Index.html:3539`) — gestion de presets de phrases

`openBulkEditModal` n'a pas besoin de modification (déjà correct). Les boutons d'action simple (supprimer, activer/désactiver, dégrouper…) ne sont pas concernés : ils ne font perdre aucune saisie puisqu'il n'y a pas de texte tapé avant le clic.

**Comportement au blocage :** identique à l'existant (`requireIdentity()` affiche déjà un toast + fait clignoter le bouton d'identité) — on ne fait que déplacer le point d'appel plus tôt, aucun nouveau comportement à concevoir.

---

## B2. Journal (Notes) amélioré

**État actuel :** Notes groupées par joueur (ordre fixe = ordre de la liste des joueurs), pas de recherche, pas de tri explicite (ordre = ordre renvoyé par le serveur), date affichée en absolu seulement (`toLocaleDateString('fr-FR')`).

**Fix retenu :**
1. **Recherche textuelle** : un champ de recherche au-dessus de la liste des joueurs, filtrant les notes affichées (dans chaque bloc joueur) par correspondance texte insensible à la casse. Si un joueur n'a plus aucune note correspondante, son bloc reste affiché mais avec un message "Aucune note ne correspond" (pas de disparition complète du bloc, pour garder le repère visuel des joueurs).
2. **Tri par défaut** : les notes de chaque bloc joueur sont triées par date décroissante (plus récente en premier) avant affichage, au lieu de l'ordre brut du serveur.
3. **Date relative** : à côté de la date absolue déjà affichée, ajouter une puce de date relative (`"il y a 2 jours"`, `"aujourd'hui"`, `"hier"`) calculée côté client à partir de `note.timestamp`.

**Hors scope :** pagination des notes (le volume actuel ne le justifie pas — YAGNI), changement du groupement par joueur (fonctionnalité existante à préserver).

---

## B3. Sélection dans l'Historique — corrections

**Bugs constatés :**
1. `histSelected` (les lignes cochées) n'est vidé que par `toggleHistSelectMode()` — jamais quand les filtres joueur/Top changent ou qu'on change de page. Une sélection faite sur une vue peut donc rester "collée" en mémoire en référençant des lignes qui ne sont plus affichées, et être appliquée par erreur à une action groupée ultérieure sans que l'utilisateur s'en rende compte.
2. "Tout sélectionner" ne sélectionne que les lignes de la page actuellement chargée (`histVisibleRows`), sans que ce soit indiqué à l'utilisateur — qui peut croire à tort que toutes les entrées filtrées sont sélectionnées.

**Fix retenu :**
1. Vider `histSelected` et `histVisibleRows` (et rafraîchir la barre d'actions groupées) à chaque changement de filtre joueur/Top et à chaque changement de page — la sélection redevient explicitement une opération "sur la page/vue courante", sans état invisible qui persiste entre deux vues différentes.
2. Le texte de la barre d'actions groupées (`updateHistBulkBar`) précise désormais explicitement "X sélectionné(s) sur cette page" au lieu d'un simple compteur ambigu.

**Hors scope :** sélection véritablement multi-pages (nécessiterait de charger les données de toutes les pages sélectionnées pour l'édition groupée — chantier plus lourd, non demandé explicitement, YAGNI pour l'instant).

---

## B4. Automatisations — harmonisation visuelle

**État actuel :** Section `#stab-tools` (dans Paramètres → Outils) composée de formulaires plats (`.add-form`, `<select>`/`<input>` natifs), avec des séparateurs `style="border-top:..."` répétés en ligne au lieu d'une classe partagée. Contraste avec Notes/Historique qui utilisent des classes dédiées (cartes, puces, avatars).

**Fix retenu :**
- Remplacer les 3 séparateurs inline répétés (`Index.html:2471, 2489, 2498`) par une classe CSS unique `.settings-section-divider`.
- Envelopper le bloc "Automatisations" (statut du déclencheur + formulaire de règle + liste des règles) dans un conteneur `.auto-rules-card` au style cohérent avec les cartes existantes (`.note-card` comme référence visuelle : fond, bordure, radius, padding).
- Restyler chaque ligne de `.auto-rules-list` pour ressembler visuellement à une ligne d'historique (icône/emoji de catégorie, texte, actions alignées à droite) plutôt qu'une liste brute.

**Hors scope :** déplacement de la section vers un onglet dédié (elle reste dans Paramètres → Outils, changement de structure non demandé) ; toute nouvelle fonctionnalité d'automatisation.

---

## Vérification

- B1 : vérifiable manuellement en navigateur (ouvrir une boîte concernée sans identité sélectionnée → le toast + pulse doivent apparaître avant que la boîte ne s'affiche, pas après un clic sur Enregistrer).
- B2 : vérifiable manuellement (recherche filtrant les notes, ordre décroissant, date relative affichée).
- B3 : pas de logique serveur touchée (uniquement du state client) — vérifiable manuellement (cocher des lignes, changer de filtre, constater que la sélection est vidée et le compteur remis à zéro).
- B4 : vérifiable visuellement (capture d'écran avant/après du bloc Automatisations).
- Aucun changement de `Code.gs`/`AutoPoints.gs` dans ce chantier — uniquement `Index.html`. Le harnais de test Node existant n'est pas concerné ; aucune nouvelle suite de tests n'est nécessaire pour ce chantier purement front-end.
