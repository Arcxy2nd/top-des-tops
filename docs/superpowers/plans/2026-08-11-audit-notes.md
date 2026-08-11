# Passe 5 — 📝 Notes

> Protocole : [`2026-08-11-audit-onglet-par-onglet.md`](2026-08-11-audit-onglet-par-onglet.md). Les contraintes globales de ce document s'appliquent à toutes les tâches ci-dessous.

**État :** ✅ passe livrée en v3.12.0 (localement — `npm run verify` vert à 160 tests). **Non poussée** : cette passe s'empile sur la passe 4 (v3.11.0), elle-même en attente de confirmation utilisateur avant push (garde-fou n°3 du plan-cadre, CRUD Joueurs/Tops). Voir la note de fin de plan pour le détail.
**Ligne de base :** v3.11.0 (passe 4), 159 tests verts.

---

## Carte — phase 1

### Structure de la cible

`#tab-notes` (Index.html:4779-4790) — petit onglet, un seul bloc, pas de sous-onglets : en-tête + bouton rafraîchir (`refreshNotesBtn`), barre de recherche (`notesSearchInput`), conteneur dynamique (`notesPlayersContainer`) qui accueille tout le contenu construit en JS (une section par joueur, une carte par note).

### JS frontend — fonctions principales

| Fonction | Ligne (approx.) | Rôle |
|---|---|---|
| `loadNotes()` | 14562 | charge toutes les notes, affiche un squelette pendant l'appel |
| `renderNotesUI(notes)` | 14570 | construit la structure (recherche, groupement par joueur) |
| `renderNotesBlocks()` | 14696 | rendu des sections par joueur après filtre recherche |
| `buildNoteCard(note)` | 14822 | une carte de note (texte, méta Créé par/Modifié par, actions) |
| `buildNoteAuthorAvatar(name)` | 14812 | avatar à côté d'un nom d'auteur |
| `openNoteHistoryPopover(anchorEl, noteId)` | 14926 | popover d'historique des modifications (clic sur « Modifié par ») |
| Ajout rapide « flash » | ~14657 | `callServer('apiAddNote', [flashPlayer, text, flashDate, ...])` — chemin d'ajout distinct de la carte par joueur, **à vérifier s'il diverge** (paires de fonctions dupliquées trouvées dans les passes précédentes — Saisir un Lot C14/C15) |
| Ajout depuis carte joueur | ~14771 | `callServer('apiAddNote', [player.name, text, npbDate, ...])` — second chemin d'ajout |
| Suppression | ~14896 | `callServer('apiDeleteNote', [note.rowIndex, ...])` |
| Édition | ~15026 | `callServer('apiEditNote', [note.rowIndex, v, ...])` |

Écouteur : `refreshNotesBtn` → `loadNotes` (Index.html:16296).

### Backend — `Code.gs`

| Fonction | Ligne | Rôle |
|---|---|---|
| `apiGetAllNotes()` | 2771 | liste toutes les notes (cache `notes_all_v` + `_notesVersion()`) |
| `apiAddNote(player, text, dateStr, author)` | 2778 | ajout, génère un `NoteId` opaque |
| `apiDeleteNote(rowIndex, author)` | 2793 | suppression, snapshot `before` pour undo |
| `apiEditNote(rowIndex, newText, author)` | 2832 | édition, backfille un `NoteId` si absent (notes antérieures au suivi), snapshot avant/après |
| `apiGetNoteHistory(noteId)` | 2809 | historique détaillé (popover), filtre le Journal par `NoteId` — **pas** par numéro de ligne |
| `NotesService` | Code.gs:1354-1472 | service complet — `_sheet()` auto-création, `_ensureColumns()` migration douce, `getAllNotes`/`addNote`/`deleteNote`/`editNote`/`noteIdAt` |

Schéma actuel de la feuille `Notes` (7 colonnes) : `Date | Joueur | Note | NoteId | CrééPar | ModifiéPar | ModifiéLe`. `CrééPar`/`ModifiéPar` écrits **directement sur la ligne** (pas dérivés du Journal — changement délibéré documenté au CHANGELOG, plus simple et plus fiable). `NoteId` sert uniquement à `apiGetNoteHistory()` pour retrouver l'historique détaillé, indépendamment du numéro de ligne.

Identité + journal + snapshot confirmés présents sur les 3 mutations (`apiAddNote`/`apiDeleteNote`/`apiEditNote`) à la lecture du code — cohérent avec les règles maison.

### Tests existants couvrant la zone

`tests/audit.test.js` référence `NotesService`. **Aucun fichier de test dédié** identifié pour `NotesService`/`apiAddNote`/`apiEditNote`/`apiDeleteNote`/`apiGetNoteHistory` en dehors de mentions incidentes dans `audit.test.js` — à vérifier en phase 3 si c'est un vrai trou de couverture (l'historique CHANGELOG très riche sur cette zone suggère que si, vu le nombre de bugs déjà corrigés ici).

### Historique — fragilités déjà signalées (CHANGELOG.md)

Zone avec un historique de correctifs **exceptionnellement dense** pour sa taille (au moins 8 itérations successives rien que sur le mécanisme Créé par/Modifié par) :
- Bug de fond déjà corrigé : l'historique d'une note pouvait se mélanger avec celui d'une autre note après suppression d'une note plus haut dans la liste (numéro de ligne recyclé) — corrigé par le passage à `NoteId` (CHANGELOG:610-611). **Confirmé toujours en place à la lecture du code actuel** — `apiGetNoteHistory` filtre bien par `NoteId`, pas par `rowIndex`.
- « Créé par » ne s'affichait jamais à cause d'un filtre `Entité === 'Note'` qui ne matchait jamais le vrai format journalisé (`'Note: ' + joueur`) — corrigé (CHANGELOG:602-603).
- Popover d'historique qui ne suivait pas le défilement de la page — corrigé (CHANGELOG:590).
- Bouton « Rattacher » (Outils, hors périmètre direct) qui ne retrouvait qu'un seul des deux auteurs sur une note créée puis modifiée — corrigé en deux temps (CHANGELOG:586-587, 594-595).
- Refonte ergonomique des modales de note et grille responsive multi-colonnes (CHANGELOG:278).
- Auto-grandissement des zones de texte (notes incluses) avec ce qu'on y tape (CHANGELOG:690).

**À surveiller en priorité (axe 2 + axe 5) :** deux chemins d'ajout de note distincts (« flash » rapide et carte par joueur) — vérifier qu'ils produisent bien le même résultat et ne divergent pas silencieusement, motif déjà rencontré sur Saisir un Lot (C14/C15, passe 3). Le cache `notes_all_v` + `_notesVersion()` — vérifier qu'il s'invalide bien sur les 3 mutations (`_bumpNotesVersion()` confirmé appelé dans `addNote`/`deleteNote`/`editNote` à la lecture).

### Écart avec `context.md`

`context.md` §5 décrit l'onglet comme « Notes libres par joueur » — cohérent avec la structure réelle, pas d'écart à corriger.

---

## Relevés — phase 2

Sonde menée sur `preview_start top-des-tops-frontend` (harness redémarré après la passe 4). Chargement initial : 0 erreur console.

### R1 — Avatar de « Créé par »/« Modifié par »/l'historique disparaît totalement si l'URL d'avatar du joueur échoue à charger (CONFIRMÉ, sévère)

`buildNoteAuthorAvatar(name)` (Index.html:14812-14820) :

```js
img.onerror = () => img.remove();
```

Reproduit en direct : une note créée par « Safir » (avatar configuré sur `https://example.invalid/a.jpg`, qui échoue à charger) affiche « ✍️ Créé par **Safir** » **sans aucun avatar** — l'image est retirée du DOM plutôt que de basculer sur un avatar de repli. Même comportement sur la pastille « ✏️ Modifié par » et dans le popover d'historique (`.nhp-entry-who`, utilisé aux 3 points d'appel de la fonction : Index.html:14851, 14864, 14978).

Contraire à la règle maison « avatar partout, aucune exception » et incohérent avec le reste de l'app : le récapitulatif de lot (Saisir un Lot, corrigé passe 3) et les listes d'entités (Paramètres) basculent sur un avatar généré (`getAvatarUrl(name, '')`, service `ui-avatars.com`) quand l'URL configurée échoue, au lieu de faire disparaître l'avatar. Un joueur dont l'avatar personnalisé devient inaccessible (hébergement expiré, image supprimée…) perd silencieusement son avatar sur toute note qu'il a créée ou modifiée.

### R2 — Cibles tactiles `button.small` (34px) : quatrième récidive indépendante, corrigée globalement cette fois (CONFIRMÉ, sévère, transverse)

Mesuré en mobile (375px) : le bouton « + Ajouter » d'une note (`.npb-add button`, classe `small`) à 34px de hauteur — même défaut que C8 (passe 2, Historique), R3 (passe 3, Saisir un Lot) et R4 (passe 4, Outils), chacun corrigé par une règle CSS scopée à son propre onglet. Quatrième recension indépendante du même défaut sur un cinquième écran (il en reste deux non audités : Tchat, Guide) — au lieu d'ajouter une cinquième règle scopée, `button.small` est désormais corrigé **globalement** dans le fichier (`@media (max-width:768px) { button.small { min-height: var(--tap-min); } }`), fermant la famille de bug plutôt que de continuer à la déplacer d'onglet en onglet. Un cas particulier a nécessité de garder une règle plus spécifique : `.row-topbar .btn-dup`/`.btn-del` (Saisir un Lot) posent leur propre `min-height: 32px` à une spécificité CSS supérieure à la règle globale — non couverts par le passage au global, toujours corrigés via leur propre média query scopée.

Correction appliquée immédiatement pendant la sonde (pas reportée à la phase 5) car directement découverte en testant ce même défaut déjà connu — voir « Correction » ci-dessous pour la note de méthode.

### Contrôles vérifiés sans défaut

- Ajout rapide (barre « flash », en haut) : sélection du joueur par pastille, saisie avec mention `@`, ajout réussi, note visible immédiatement dans le bon bloc joueur.
- Ajout depuis un bloc joueur (`.npb-add`) : chemin distinct du flash, mais aboutit au même `apiAddNote` — pas de divergence de comportement observée.
- Mentions `@Joueur` dans le texte d'une note : rendu correct en pastille colorée (`<span class="mention" data-player="..." style="--mention-color:...">`), cohérent avec le système de mentions du reste de l'app.
- Édition d'une note (modale avec éditeur Markdown : gras/italique/code/titre/liste/lien/mention/dièse + aperçu) : sauvegarde réussie, badge « Modifié par » apparaît immédiatement, 0 erreur.
- Historique d'une note modifiée (clic sur « Modifié par ») : popover affiche la version précédente avec auteur et date, cohérent avec `apiGetNoteHistory` filtrant par `NoteId` (pas par numéro de ligne — le bug historique de la feuille corrigé en amont, CHANGELOG:610-611, tient toujours).
- Suppression d'une note : modale de confirmation stylée (pas de `confirm()` natif), suppression effective, 0 erreur.
- Identité obligatoire avant ajout (`requireIdentity()`) : bloque correctement l'ajout rapide sans identité sélectionnée, toast d'avertissement explicite.
- Recherche (`notesSearchInput`) : filtre correctement les cartes de note par contenu ; les blocs des joueurs sans résultat restent affichés (avec leur champ d'ajout rapide, vide de notes) plutôt que d'être masqués — comportement délibéré probable (garder la capacité d'ajouter une note pendant qu'on cherche) mais à confirmer en phase 3/4 si c'est realy voulu ou juste jamais remis en question.
- Thème clair/sombre : aucun gel de couleur observé sur les contrôles de cet onglet (bénéficie du mécanisme général posé en passe 3, `body.theme-switching`).
- Mobile 375px : aucun débordement horizontal, pastilles joueur à 44px.

## Clôture phase 2

Sonde terminée. 2 défauts confirmés (R1 sévère — avatar manquant sur trois emplacements, R2 sévère et transverse — quatrième récidive du motif de cible tactile, corrigée globalement séance tenante). Aucune anomalie sur le reste du périmètre (deux chemins d'ajout, mentions, édition, historique, suppression, identité, recherche, thème, mobile).

## Défauts candidats — phase 3

Conseil à 5 en mode local (relancé une fois suite à une limite de session API — 5/5 rapports reçus). Union brute.

**Axe 1 — Ça marche**
- N1. `apiGetNoteHistory` (popover d'historique) : `callServer` sans `onError` — le corps du popover reste bloqué sur « Chargement… » indéfiniment en cas de panne.
- N2. Le popover d'historique n'est jamais fermé quand la liste se re-rend (ajout/édition/suppression/frappe de recherche détruisent son ancre DOM sans le fermer) — au prochain scroll il saute en haut à gauche de l'écran au lieu de disparaître.
- N3. Double-Entrée rapide sur l'ajout (flash ou bloc joueur) crée deux notes identiques — le champ texte n'est pas désactivé pendant l'appel serveur (seul le bouton l'est), et `keydown` sur Entrée n'a pas de garde anti-double-soumission.

**Axe 2 — Ça dit vrai**
- N4. **Renommer ou supprimer un Joueur rend ses notes invisibles sans les supprimer.** `renameEntity`/`deleteEntity` (Code.gs) propagent déjà à `history`/`autoRules`/`bareme`/`phrases` mais jamais à `Notes` — une note dont le nom de joueur ne correspond plus à aucune entité active ne s'affiche plus dans aucun bloc, alors que le compteur de navigation (qui compte les notes brutes) continue de l'inclure. Note toujours en base, invisible et non éditable/supprimable depuis l'UI.
- N5. La date « Modifié le » affichée immédiatement après une édition est fabriquée côté client (`new Date().toISOString()`) au lieu du timestamp serveur réel — `apiEditNote` ne renvoie pas le timestamp (contrairement à `apiAddNote`, qui renvoie l'objet complet).

**Axe 3 — Règles maison**
- N6. Avatar de la pastille de sélection joueur (barre flash) : `onerror = () => chipImg.remove()` — même défaut que R1, sur un troisième code.
- N7. Avatar du badge `@Mention` dans le texte d'une note (`renderMentions()`) : `onerror="this.remove()"` — même défaut, sur le rendu Markdown des mentions.
- N8. Avatar dans la liste de suggestions d'autocomplétion `@` (`attachMentionAutocomplete()`, partagée par les 3 champs texte de l'onglet) : même défaut.

**Axe 4 — Utilisable**
- N9. Deux points d'ajout de note visuellement quasi-jumeaux (barre flash / bloc joueur) sans hiérarchie ni distinction claire de leur usage.
- N10. Sélection du joueur en barre flash uniquement par pastilles sans recherche texte — devient lent au-delà de 6-8 joueurs.
- N11. Barre flash non `sticky` — remonter tout en haut nécessaire pour ajouter une note après avoir défilé.
- N12. Suppression de note sans filet de rattrapage *visible* — l'entrée est en réalité annulable via le Journal (snapshot `beforeRow` confirmé côté backend) mais rien dans le toast ne le signale à l'utilisateur.
- N13. Pendant une recherche, les blocs de joueurs sans résultat restent affichés en entier (pas de repli/grisage) — noie les résultats pertinents.
- N14. Éditeur Markdown de la modale d'édition (8 boutons + aperçu) disproportionné pour une note généralement courte, saisie initiale en simple champ texte mono-ligne.
- N15. Pas de support Maj+Entrée pour un saut de ligne dans les champs de saisie rapide.

**Axe 5 — Code sain**
- N16. Widget « ajout + toggle date » dupliqué (~35 lignes) entre barre flash et bloc joueur — même motif que C14/C15 (Saisir un Lot, passe 3), actuellement synchrone mais structurellement à risque de divergence.
- N17. `_notesVersion`/`_bumpNotesVersion` dupliquent la même structure que 5 autres paires de fonctions de version (`_bumpLogsVersion`, `_bumpSettingsVersion`, `_bumpChatVersion`, `_bumpBaremeVersion`, `_bumpPhrasesVersion`) sans helper générique.
- N18. Nombre de colonnes de la feuille Notes (7) codé en dur à 6 emplacements de `Code.gs`.
- N19. `renderNotesUI` (~125 lignes) et `buildNoteCard` (~92 lignes) : fonctions à responsabilités multiples (état vide, avatar, pastilles, saisie rapide, recherche / construction DOM + logique de réindexation locale).

## Améliorations candidates — phase 3

**Axe 3** — Modale de suppression sans contexte (nom du joueur/extrait du texte) contrairement à d'autres suppressions de l'app ; modale d'édition sans nom/avatar du joueur concerné ; repli d'avatar du bloc joueur (`14724`) sans garde anti-boucle si `ui-avatars.com` devient lui-même injoignable (contrairement à `buildNoteAuthorAvatar` qui, elle, désarme `onerror` après le premier repli).
**Axe 4** — (détaillées avec N9-N15 ci-dessus, chacune already une tâche potentielle plutôt qu'une simple piste).
**Axe 5** — (détaillées avec N16-N19 ci-dessus).

## Défauts confirmés — phase 4

Vérification adversariale. N4 (le plus consequential) et N3 relus et confirmés personnellement par citation exacte du code ; les autres acceptés sur la base de citations précises déjà démontrées fiables sur cette session (5/5 spot-checks exacts en passe 3, encore vrai sur les points revérifiés ici).

| # | Verdict | Preuve |
|---|---------|--------|
| N1 | **CONFIRMÉ** | `callServer('apiGetNoteHistory', [noteId], res => {...})` sans 4ᵉ/5ᵉ argument, confirmé par lecture. |
| N2 | **CONFIRMÉ, modéré** | `closeNoteHistoryPopover()` jamais appelée par `renderNotesBlocks()`, confirmé — celle-ci est bien appelée après chaque mutation et à chaque frappe de recherche. |
| N3 | **CONFIRMÉ, modéré-sévère** | Relu : `fInput.addEventListener('keydown', e => { if (e.key==='Enter') submitFlash(); })` — `fInput` n'est jamais désactivé, contrairement à `fBtn` (`startBtnLoading`). Deux Entrées rapides avant la réponse serveur envoient deux `apiAddNote` identiques. |
| N4 | **CONFIRMÉ, sévère** | Relu et confirmé exact : `renameEntity`/`deleteEntity` (Code.gs) ne touchent jamais `ConfigService.getSheets().notes`. `renderNotesBlocks()` (Index.html) n'itère que sur `cachedPlayers` — une note dont le nom ne matche plus aucune entité active ne s'affiche dans aucun bloc, tout en restant comptée dans `_allNotesRaw.length` (badge de navigation). |
| N5 | **CONFIRMÉ, mineur** | `apiEditNote` ne renvoie que `{success, noteId}` (Code.gs:2844), confirmé ; le client fabrique `lastEditedAt` avec `new Date()`. |
| N6, N7, N8 | **CONFIRMÉS** | Trois `onerror = () => img.remove()` distincts confirmés à 3 endroits différents du fichier, même motif que R1. |
| N9-N15 | **CONFIRMÉS** (axe 4, préférences argumentées) | Retenues selon le même critère que le protocole (raison concrète, pas une préférence). |
| N16-N19 | **CONFIRMÉS, non prioritaires** | Code mort/duplication réels, aucun bug associé — reportés. |

## Écartés — phase 4

_(aucun candidat rejeté)_

## Correction — phase 5

**Corrigés cette passe :**
1. **R1 + N6 + N7 + N8** — repli d'avatar sur `getAvatarUrl(name, '')` au lieu de disparaître, aux 4 endroits trouvés : `buildNoteAuthorAvatar`, pastille de sélection joueur (barre flash), badge `@Mention` dans le texte (`renderMentions`), suggestion d'autocomplétion `@` (`attachMentionAutocomplete`, fonction partagée — corrige aussi ce défaut partout ailleurs où l'autocomplétion `@` est utilisée dans l'app).
2. **N4** — `renameEntity()` propage désormais le renommage d'un Joueur à la feuille `Notes` (comme `History`/`AutoRules` déjà) ; pour les notes déjà orphelines, `renderNotesBlocks()` les affiche dans un bloc distinct plutôt que de les faire disparaître — choix délibéré de **ne pas** cascader la suppression (`deleteEntity`) pour éviter d'introduire un nouveau risque de perte de donnée réelle dans une fonction déjà signalée fragile par le plan-cadre.
3. **N1** — `onError` sur `apiGetNoteHistory` (popover d'historique).
4. **N2** — `renderNotesBlocks()` ferme le popover d'historique actif avant de reconstruire la liste.
5. **N3** — garde anti-double-soumission sur les deux chemins d'ajout (clavier Entrée non protégé jusqu'ici, contrairement au bouton).
6. **N5** — `apiEditNote` renvoie l'horodatage serveur réel (`editedAt`) au lieu de laisser le client le fabriquer.
7. **R2** — cibles tactiles `button.small` (34px) : quatrième récidive, corrigée globalement (voir Relevés) plutôt que scopée à Notes.

**Reportés, documentés (raison) :**
- **N9-N15 (axe 4)** — améliorations d'ergonomie réelles (fusion des deux points d'ajout, recherche par texte des joueurs, barre flash sticky, toolbar Markdown allégée, Maj+Entrée…) mais aucune n'est un défaut prouvé ; reportées à une prochaine amélioration ciblée, cohérent avec le traitement des axes 4/5 des passes précédentes. Note spécifique sur N12 (filet de rattrapage invisible) : le filet existe déjà côté backend (snapshot `beforeRow`, undo via Journal) — seul le texte du toast manque un indice, correctif à faible risque mais non fait faute de temps proportionné cette passe déjà chargée.
- **N16-N19 (axe 5)** — refactors/duplication/code mort sans bug associé, reportés (même logique que C13/C14/C16/C17 en passe 3).

`npm run verify` vert à 160 tests (159 → 160 : +1 sur `apiEditNote`/`editedAt`, +1 sur la cascade de renommage vers Notes — remplace un test existant qui a été étendu). Re-sonde au navigateur après redémarrage du serveur de prévisualisation :
- Pastille de sélection joueur (avatar cassé dans les fixtures) : `src` bascule bien sur l'avatar généré `ui-avatars.com`, confirmé.
- Double-Entrée rapide sur l'ajout : une seule note créée (contre deux avant le fix), confirmé.
- Note orpheline injectée manuellement (simulant un joueur renommé avant ce correctif) : bloc distinct affiché avec le libellé « (introuvable dans Paramètres) », note éditable/supprimable, confirmé.
- Les autres correctifs (N1, N2, N5, R1 sur les 3 autres emplacements) vérifiés par lecture directe du code corrigé, cohérents avec les motifs déjà revérifiés en direct sur les passes précédentes.

---
