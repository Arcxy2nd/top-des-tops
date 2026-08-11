# Passe 3 — ✍️ Saisir un Lot

> Protocole : [`2026-08-11-audit-onglet-par-onglet.md`](2026-08-11-audit-onglet-par-onglet.md). Les contraintes globales de ce document s'appliquent à toutes les tâches ci-dessous.

**État :** ✅ passe livrée en v3.10.0 — `npm run verify` vert (154 tests), corrections re-vérifiées au navigateur après redémarrage propre du serveur de prévisualisation.
**Ligne de base :** v3.9.0, 153 tests verts, 0 erreur console au chargement (héritée de la passe 2)

---

## Carte — phase 1

### Structure de la cible

`#tab-inject` (Index.html:4317-4382) — un seul bloc, pas de sous-onglets. Contient :
- Sélecteur d'univers de saisie (`lotUniverseSeg` : 🏆 Tops Principaux / ⭐ Tops Alternatifs).
- Date/plage par défaut (`defaultModeSeg` : jour unique / période, avec remplissage jours de semaine).
- Constructeur de lignes (`entryContainer`) : une ligne = joueur + Top + raccourcis de points + valeur + date + actions (dont Tops secondaires et Top Alternatif par ligne).
- Barre de groupement (`lotGroupBar`), barre de tri (`lot-sort-bar`), barre d'actions (`＋ Ligne` / `🔗 Grouper` / `✓ Inscrire le lot`), barre récap sticky (`lotSummaryBar`).

### JS frontend — fonctions principales

| Fonction | Ligne | Rôle |
|---|---|---|
| `addEntryRow(preset, animateFromBtn)` | 12305 | crée une ligne (joueur, Top, raccourcis points, sous-tops, Top Alt, date/plage) |
| `createPtsToggle(defaultVal)` | 12110 | raccourcis de points (barème) par ligne |
| `applyRowCategoryVisuals` | 12296 | couleur/emoji du Top appliqués à la ligne |
| `applyRowAvatar` | 13108 | avatar du joueur en fond de ligne |
| `updateDatePreview` | 12529 | aperçu de la plage de dates par ligne |
| `sortEntryRows(criterion)` | 12201 | tri des lignes (joueur/Top/points/date) |
| `attachRowDragEvents` | 12253 | glisser-déposer pour réordonner les lignes |
| `enterLotGroupMode` / `exitLotGroupMode` / `onLotGroupRowClick` / `updateLotGroupBar` / `applyLotGroup` | 13220-13288 | mode groupement de lignes avant envoi (`groupTag` local, converti en `groupId` réel côté backend) |
| `lineDates(startStr, endStr)` | 13288 | dates couvertes par une ligne (jour seul ou plage) |
| `filterDatesByDays` | 8418 | filtre les dates d'une plage par jours de semaine cochés |
| `updateLotSummary` | 13175 | barre récap sticky (nb lignes, total points) |
| `saveNativeAltEntries` | 13304 | envoi direct en mode Tops Alternatifs (pas d'entrée Historique) |
| `submitBulk()` | 13318 | collecte les lignes, branche univers Principal/Alt, construit le plan par date |
| `runBulkPlan(plan, btn)` | 13470 | confirmation si plage multi-dates, `requireIdentity()`, appel serveur |
| `openLotRecapModal(plan)` | 8679 | récapitulatif après envoi réussi |
| `setLotUniverse(mode)` | 15958 | bascule Principal/Alt, préserve les Tops déjà choisis (CHANGELOG:152) |
| `scanDistributedLots` / `renderDetectedLots` / `lotSignature` / `getDismissedLotSignatures` / `dismissLotSignature` | 16254-16452 | détection de lots répartis sur plusieurs jours (outil, pas dans cet onglet mais alimenté par les mêmes données) — **hors périmètre**, appartient à 🔧 Outils (passe 4) |

Câblage des écouteurs principaux : `addRowBtn` (15927), `submitLotBtn` (15947), `lotGroupModeBtn` (15948), `lotModeMainBtn`/`lotModeAltBtn` (15952-15966), `lotGroupApplyBtn`/`lotGroupCancelBtn` (16010-16011), `applyDateAllBtn` (16022).

### Backend — `Code.gs`

| Fonction | Ligne | Rôle |
|---|---|---|
| `StorageService.appendBulkPlan(plan)` | 574 | écrit les lignes Historique (dont sous-tops sur lignes séparées, `groupId` partagé), pousse les entrées Alt liées (`altCategories`/`altCategory`) vers `AltStorageService.addAltEntries` |
| `apiAddBulkPlan(plan, author)` | 2122 | wrapper API, `requireIdentity`/`requireAuthor`, `withLock`, journalisation avec snapshot `insertMany` (undoable) |
| `apiAppendAltNativeBatch(author, entries)` | 2361 | écrit directement dans `AltHistory` (mode natif Alt), journalisation sans snapshot (pas de undo) |

Autre consommateur de `appendBulkPlan` : `AutoPoints.gs:249` (points automatiques, hors périmètre de cette passe — sera revu en passe 4 avec 🔧 Outils, mais partage la même fonction backend donc tout bug de `appendBulkPlan` impacte aussi les points auto).

### Tests existants couvrant la zone

`tests/storage.test.js` (`appendBulkPlan` : points×times, groupId partagé par tag, groupId différent entre deux appels, groupId vide sans tag, rejet points < 1), `tests/alt-tops.test.js`, `tests/audit.test.js`, `tests/cache.test.js`. Aucun test Node ne couvre `apiAppendAltNativeBatch` ni le multi-sous-tops (`subTops`) directement — à vérifier en phase 2/3.

### Historique — fragilités déjà signalées (CHANGELOG.md)

- Bascule Principal/Alt qui détruisait les Tops déjà choisis ligne par ligne (corrigé — CHANGELOG:152).
- Ordre des raccourcis de barème imprévisible, corrigé pour trier du plus petit au plus grand (CHANGELOG:506).
- `@mention` non proposée dans le champ Description de cet onglet alors que ça marche ailleurs (corrigé — CHANGELOG:699).
- `injectRowHtml`/`renderInjectShell` existaient dans `Mobile.html` (refonte citée CHANGELOG:400) — **`Mobile.html` n'existe plus dans le dépôt actuel** (fichier unique responsive `Index.html`, cohérent avec `context.md` §7). Écart de mémoire à corriger, pas un défaut applicatif.

**À surveiller en priorité (axe 2 + axe 5) :** `appendBulkPlan` est une fonction dense à responsabilités multiples (dates, sous-tops, groupId, entrées Alt liées) partagée avec `AutoPoints.gs` — zone à haut risque de régression silencieuse si modifiée. `AltHistory.refHistoryRowId` (déjà identifié fragile en passe 2, C6) est justement écrit ici (ligne 628) — vérifier que le fix de C6 (renumérotation) reste cohérent avec ce point d'écriture.

### Écart avec `context.md`

Aucun écart structurel. `context.md` §5 décrit bien « Constructeur de lignes de score (joueur + Top + points + date), saisie batch » — cohérent, mais ne mentionne pas les sous-tops, le mode Alt natif, ni le groupement de lignes avant envoi (fonctionnalités réelles plus riches que la description sommaire — pas un défaut, juste incomplet dans `context.md`).

---

## Relevés — phase 2

Sonde menée sur `preview_start top-des-tops-frontend` (port réattribué automatiquement, 65428). `window.gsap = null` posé avant chaque navigation d'onglet (lesson passe 2). Chargement initial : 0 erreur console applicative (les `ERR_NAME_NOT_RESOLVED` répétés sont les CDN externes bloqués par le sandbox — connu, sans impact, cohérent avec les passes précédentes).

### R1 — Récap de lot après envoi : `SyntaxError` reproductible à chaque fois qu'un avatar échoue à charger (CONFIRMÉ, sévère)

`openLotRecapModal()` (Index.html:8695) construit l'attribut `onerror` de l'avatar ainsi :

```js
'<img ... onerror="this.src=getAvatarUrl(' + JSON.stringify(name) + ',\'\')">'
```

`JSON.stringify(name)` produit une chaîne **entre guillemets doubles** (`"Safir"`), injectée telle quelle à l'intérieur d'un attribut HTML **lui-même délimité par des guillemets doubles** (`onerror="..."`). Le premier guillemet de `JSON.stringify` referme prématurément l'attribut — le HTML résultant est corrompu, et le JS qu'il contient est tronqué à `this.src=getAvatarUrl(`, syntaxiquement invalide.

Reproduit deux fois de suite dans le navigateur (fixtures avec avatar `https://example.invalid/a.jpg`, qui échoue toujours à charger → `onerror` se déclenche systématiquement) : `Uncaught SyntaxError: Unexpected end of input`, capturé par `window.__frontErrors` à chaque clic sur « ✓ Inscrire le lot ». Le lot est bien enregistré côté serveur (vérifié via `apiGetHistoryPage` — les lignes attendues sont présentes avec les bons `groupId`), seul l'affichage du récapitulatif casse silencieusement en erreur console dès qu'un avatar est indisponible — situation réaliste (URL d'avatar cassée, joueur sans avatar configuré).

### R2 — Couleur figée après bascule de thème sur les contrôles propres à Saisir un Lot : récidive de R10/R7, non couverte par leur correctif (CONFIRMÉ, sévère, transverse)

Même famille exacte que R7 (passe 1) et R10 (passe 2), mais sur deux règles CSS que leur correctif n'a pas touchées — celui-ci n'a retiré `color`/`background-color` que de `body` et de la règle générique `select, input[type=...], textarea` (passe 2). Deux autres règles du même fichier gardent `transition: color` sur une couleur pilotée uniquement par une custom property de thème :

- `.row-desc .desc-in` (Index.html:1462-1469, champ Description de chaque ligne du constructeur de lot) : `color: var(--text); transition: color 0.18s;`
- `.d-mode-seg .d-mode-btn` (Index.html:1478-1485, utilisé par **les deux** sélecteurs de mode de cet onglet : 🏆/⭐ univers et 📅/🗓️ date par défaut) : `color: var(--text-muted); transition: background 0.15s, color 0.15s;`

Reproduit sur cas réel : `#lotModeAltBtn` (non actif) → `getComputedStyle(...).color` reste `rgb(148, 163, 184)` (texte gris du thème sombre) après bascule vers le thème clair, au lieu de `rgb(74, 85, 104)` attendu. Un champ Description saisi juste avant la bascule de thème reste illisible du mauvais gris jusqu'au prochain re-render.

**Portée réelle plus large que ce qui est corrigé ici :** un grep sur `transition:.*color` dans tout `Index.html` remonte une douzaine d'autres règles ; celles avec un `:hover` compensatoire (`.hist-desc-toggle`, `.guide-nav-btn`, `.phrases-cat-autoplay-toggle`) ne sont **pas** concernées par ce bug précis (leur transition sert un vrai changement d'état interactif, pas une réévaluation de variable seule) — vérifié au cas par cas, pas supposé. Les deux règles ci-dessus sont celles qui touchent concrètement cet onglet et sont donc dans le périmètre de correction de cette passe ; le reste (s'il y en a hors du périmètre des passes déjà closes) sera revérifié aux passes suivantes plutôt que balayé en silence ici.

### R3 — Cibles tactiles sous 44px sur la quasi-totalité des contrôles de ligne en mobile (CONFIRMÉ, sévère)

Mesuré à 375px de large (préréglage mobile, sans forçage de disposition — `tdt_forced_layout` effacé pour tester le vrai chemin auto-détecté) :

| Contrôle | Hauteur mesurée | Fréquence d'usage |
|---|---|---|
| Raccourcis de points (1/3/5/7/10/25/50/100) | **28px** | le contrôle le plus utilisé de tout l'onglet — un tap par ligne saisie |
| Bascule date « 📅 Un jour / 🗓️ Une période » (par ligne) | **24px** | fréquent si dates variées |
| Puces de raccourci de date (Aujourd'hui, Hier, Lundi…) | **22px** | occasionnel |
| ＋ Top supp. (ajout sous-top) | **34px** | occasionnel |
| Dupliquer / Supprimer cette ligne | **32px** | fréquent |

À comparer avec `addRowBtn`/`lotGroupModeBtn`/`submitLotBtn`/sélecteurs joueur/Top, tous correctement à 44px. Même famille que C8 (passe 2, `button.small` à 34px sur l'Historique) mais ici le contrôle sous-dimensionné le plus grave (raccourcis de points, 28px) est celui qu'un utilisateur mobile touche le plus souvent sur tout l'onglet.

### Contrôles vérifiés sans défaut

- Bascule 🏆 Tops Principaux / ⭐ Tops Alternatifs : aller-retour préserve le Top choisi par ligne (fix CHANGELOG:152 tient toujours), indice contextuel affiché/masqué correctement.
- Mode période (`🗓️ Une période`) : zone de plage apparaît, sélecteur de répartition (« Le même score chaque jour » / « Un total à répartir ») correct, « 📅 Appliquer à toutes les lignes » propage bien la date de fin à toutes les lignes.
- Raccourcis de points : clic met à jour la valeur, la barre récap, et l'état actif du bouton.
- Sous-tops (＋ Top supp.) : ajoute correctement un sélecteur de Top secondaire par ligne.
- Sélecteur Top Alternatif par ligne (mode Principal) : menu personnalisé s'ouvre, sélection met à jour case à cocher + select cachés + libellé du bouton.
- Mode groupement (🔗 Grouper → sélection de 2 lignes → 🔗 Grouper la sélection) : tag visuel « Groupe 1 » posé sur les 2 lignes, toast de confirmation, barre de groupement se referme.
- Identité obligatoire avant envoi (`requireIdentity()`) : bloque correctement l'envoi sans identité sélectionnée, toast d'avertissement, aucune ligne perdue.
- Envoi combiné (lignes groupées manuellement + plage multi-dates + sous-top + Top Alternatif lié, dans le même lot) : vérifié directement côté serveur via `apiGetHistoryPage`/`apiGetAltHistoryMap` — `groupId` correctement partagé entre lignes groupées manuellement ET entre les dates d'une même ligne en plage ; `groupId` séparé pour le sous-top de la 3ᵉ ligne ; `AltHistory.refHistoryRowId` pointe bien sur la ligne **principale** de chaque date (pas sur le sous-top) — logique de `appendBulkPlan` (Code.gs:574) saine sur ce scénario combiné.
- Panne backend simulée sur `apiAddBulkPlan` (fetch intercepté, réponse `{ok:false}`) : bouton réactivé, texte restauré, lignes saisies conservées (pas de perte), toast d'erreur affiché — contrairement aux défauts C1-C4 de l'Historique (passe 2), `runBulkPlan` a un `onError` correctement câblé.
- Saisie native en univers Alt (`saveNativeAltEntries`) : soumission réussie, toast de succès avec total de points, lignes réinitialisées.
- Dupliquer / Supprimer une ligne : fonctionnent (suppression différée de 180ms pour l'animation de sortie — pas un défaut, juste une temporisation à respecter en test).
- Tri des lignes (clic sur un critère) : aucune erreur, pas de test différenciant (données de fixture trop uniformes pour valider l'ordre visuellement, mais aucun crash).
- Mobile 375px : aucun débordement horizontal (`scrollWidth === innerWidth`), auto-détection correcte de la disposition (sans le layout forcé résiduel d'une session antérieure, qui a été nettoyé de `localStorage` pour ce test).

## Clôture phase 2

Sonde terminée. 3 défauts confirmés directement en sonde (R1 sévère, R2 sévère et transverse — récidive non couverte de R7/R10, R3 sévère), aucune anomalie sur le reste du périmètre (bascule d'univers, mode période, groupement, sous-tops, Top Alt par ligne, identité, envoi combiné vérifié côté serveur, panne réseau, saisie native Alt, dupliquer/supprimer, tri, mobile).

## Défauts candidats — phase 3

Conseil à 5 en mode local (5 sous-agents `Agent`, `run_in_background`, un par axe, aveugles les uns aux autres, chacun avec la carte + les relevés phase 2, consigne de ne pas resignaler R1/R2/R3). Union brute, doublons non fusionnés à ce stade.

**Axe 1 — Ça marche**
- C1. Mode groupement (🔗 Grouper) n'attache `lot-group-selectable` + le listener qu'aux lignes déjà présentes au moment de l'activation (`enterLotGroupMode`, Index.html:13220-13230) — une ligne ajoutée via « ＋ Ligne » pendant le mode groupement reste cliquable sans effet, silencieusement.
- C2. Bascule 🏆/⭐ pendant le mode groupement : `setLotUniverse()` (15958) reconstruit toutes les lignes avec de nouveaux `id` sans toucher `lotGroupSel`/`lotGroupMode` — `applyLotGroup()` (13265) affiche ensuite un toast de succès alors qu'aucune ligne réelle n'a été taguée (`document.getElementById(id)` renvoie `null`, sort silencieusement de la boucle).
- C3. Panneau « 🕐 Historique rapide » d'une ligne (`loadHistPage`, 13049-13066) : `callServer('apiGetHistoryPage', …)` sans `onError` — en cas de panne, le code de fallback à l'intérieur du callback `onSuccess` (qui viderait le squelette) n'est jamais exécuté puisque `callServer` court-circuite `onSuccess` dès `res.success===false`. `_histLoading` reste `true` indéfiniment, panneau cassé jusqu'au rechargement complet.
- C4. « ⚖️ Barème rapide » par ligne (`refreshBaremeForTop`, 12916-12924) : même trou de câblage que C3, `callServer('apiGetBareme', …)` sans `onError`.

**Axe 2 — Ça dit vrai**
- C5. Barre récap sticky (`updateLotSummary`, 13175-13217) : le total affiché ne compte que la valeur brute de `.custom-pts-in` par ligne, ignorant (a) la multiplication par le nombre de dates en mode plage/repeat et (b) les points des sous-tops. Écart mesuré en reproduction : total affiché 13 pts vs total réellement écrit en base 153 pts sur un scénario combiné plage+sous-top.
- C6. Modale de récap post-envoi (`openLotRecapModal`, 8679-8709) : gère correctement la multiplication par date mais exclut totalement les points des sous-tops (`e.subTops` jamais lu) — le seul message de confirmation post-écriture affiche donc un total inférieur à ce qui a réellement été enregistré.

**Axe 3 — Règles maison**
- C7. `applyLotGroup()` (13265-13285) assigne une couleur de palette arbitraire en dur (`groupColors`, hex) à `--row-accent` des lignes groupées — `--row-accent` pilote pourtant bordure/fond/box-shadow du code couleur du Top sur toute la ligne (confirmé Index.html:929, 1440, 1448, 2445-2464, 3141-3306) : grouper une ligne remplace silencieusement son code couleur de Top issu des données par une teinte arbitraire.
- C8. Sélecteur « ⭐ Top Alt » par ligne : couleur figée en dur (`ALT_FALLBACK_COLOR = '#ffd166'`, 5228) au lieu de `var(--alt-accent)` — fausse en thème clair (la variable CSS vaut `#b8860b` en clair, jamais utilisée par le picker), et identique pour tous les Tops Alt quelle que soit leur couleur propre configurée en Paramètres (contrairement à `applyRowCategoryVisuals` qui, lui, utilise bien `ac.color`).
- C9. Sous-tops (＋ Top supp.) : sélecteur `<select>` HTML brut sans aucune pastille de couleur, contrairement au sélecteur du Top principal (`RichSelect` avec pastille `categoryColor()`) — rupture d'exhaustivité sur une même instance de champ « Top » dans la même ligne.

**Axe 4 — Utilisable**
- C10. Sélecteurs personnalisés Joueur/Top (`buildRichSelect`, 7745-7954) inutilisables au clavier seul — aucun `keydown` dans tout le composant, options en `<div role="option">` sans `tabindex`, seulement un `mousedown`.
- C11. Ordre de tabulation à contre-sens dans chaque ligne : `topBar` (Top Alt, Dupliquer, Supprimer) est ajouté au DOM avant `mainRow` (joueur/Top/points/date) — un utilisateur clavier rencontre 3 boutons administratifs, dont un destructif, avant les champs de saisie utiles.
- C12. Barre récap sticky (`#lotSummaryBar`) recouvre et rend inaccessibles au clic certains contrôles de la dernière ligne visible pendant le défilement d'un lot à 8+ lignes (reproduit : `elementFromPoint` sur la zone Description/Historique rapide renvoie la barre récap, pas la ligne).

**Axe 5 — Code sain**
- C13. `addEntryRow` (12305-13173) : 869 lignes réelles (vs ~470 estimées en Carte), au moins 8 responsabilités mélangées dans des closures imbriquées (sélecteurs, dates, sous-tops, picker Alt, Barème rapide, Historique rapide).
- C14. Triple duplication de la logique « appliquer une valeur de points à la ligne » (12373-12384 listener raccourcis, 12888-12898 `applyBaremePts`, 12997-13020 `applyHistEntry`) — déjà divergée : `applyBaremePts` omet l'animation `pts-val-anim` que les deux autres copies déclenchent.
- C15. Trois implémentations indépendantes de « lire les données d'une ligne » (Dupliquer 12768-12778, `submitBulk` mode Alt 13327-13342, mode Principal 13366-13406) sans fonction de sérialisation commune — conséquence concrète vérifiée : le `preset` du bouton « 📋 Dupliquer cette ligne » n'inclut pas `subTops`, donc **tout sous-top ajouté est silencieusement perdu à la duplication de ligne**.
- C16. `loadHistPage` (13057-13065) : branche `else` inatteignable (même cause que C3 — `callServer` court-circuite déjà `onSuccess` sur échec), code mort trompeur.
- C17. `appendBulkPlan` (Code.gs:619) : branche `e.altCategories` (pluriel) jamais alimentée par aucun appelant réel (`Index.html` n'envoie que `altCategory` singulier, `AutoPoints.gs` n'envoie ni l'un ni l'autre) — code mort suggérant une fonctionnalité « plusieurs Tops Alt par ligne » inexistante dans l'UI.
- C18. Incohérence de validation entre `AltStorageService.addAltEntries` (utilisée par `appendBulkPlan` pour les Tops Alt liés) et `addNativeAltEntries` (Code.gs ~1171-1225) : la première n'valide rien et `_buildAltRow` fait `parseInt(entry.points,10) || 0` — une entrée Alt liée invalide s'écrit silencieusement avec **0 point**, sans erreur, sans toast, sans trace, alors que la saisie native équivalente lève une erreur explicite pour le même cas.

## Améliorations candidates — phase 3

**Axe 1** — Pas de garde-fou structurel entre mode groupement et mutations de `entryContainer` (cause racine de C1/C2) ; `lineDates()` avale silencieusement une période inversée (`endDate < startDate` → repli sur `[start]` sans avertissement) ; pas de validation immédiate sur `sub-pts-input` contrairement à `custom-pts-in`.

**Axe 2** — Filtre « jours de semaine » de la plage : UI retirée mais logique de répartition (`filterDatesByDays`) toujours câblée et morte en pratique — piège si réactivé un jour sans revoir `updateDatePreview()` en même temps ; trois calculs de total indépendants (aperçu ligne / barre sticky / modale récap) sans source unique de vérité, cause structurelle de C5/C6 ; aucun message n'indique qu'un total additionnel sera écrit via sous-tops/Top Alt lié ; `times` toujours forcé à 1 côté client sans commentaire expliquant pourquoi (peut laisser croire à tort à un lien avec le mode "Un total à répartir").

**Axe 3** — Factoriser l'application de couleur Top pour la réutiliser sur les sous-tops (au lieu de corriger C9 ponctuellement) ; remplacer `ALT_FALLBACK_COLOR` (constante JS dupliquée) par une lecture runtime de `var(--alt-accent)` ; réserver un canal `--row-accent-group` distinct de `--row-accent` pour le marquage visuel de groupe, plutôt que d'écraser la seule source de vérité du code couleur du Top.

**Axe 4** — « Barème rapide » ouvert par défaut sur chaque ligne (contrairement à « Historique rapide » replié), gonfle le défilement d'un gros lot (8 lignes mesurées → 494px/ligne, bouton d'envoi repoussé à ~5,6 hauteurs d'écran) ; bouton d'envoi jamais sticky contrairement à la barre récap juste au-dessus ; mode Grouper sans affordance de sélection visible (zone cliquable réduite à de fines bandes non signalées) ; fonctionnalité de groupement non expliquée avant usage (pas de tooltip/texte d'aide, contrairement au sélecteur d'univers) ; champ Description qualifié de « recommandée » par l'app elle-même mais placé en dernière position, après deux sections secondaires ; sélecteur Top Alt éloigné visuellement du sélecteur de Top principal.

**Axe 5** — `groupColors` recréé en dur à chaque appel au lieu d'être une constante top-level nommée (convention `CHART_COLORS`/`PALETTE` déjà établie dans le fichier) ; duplication de style inline entre les blocs date « Du » et « Au » (12467-12483) ; `appendBulkPlan` dense à responsabilités multiples — refactor prudent recommandé (zone déjà fragile, partagée avec `AutoPoints.gs`, `AltHistory.refHistoryRowId` déjà en cause en passe 2/C6) ; `apiAppendAltNativeBatch` journalise sans snapshot sans commentaire expliquant l'absence d'undo (contrairement à `apiAddBulkPlan`) ; panneaux extensibles Barème rapide/Historique rapide répètent la même mécanique sans fabrique commune.

## Défauts confirmés — phase 4

Vérification adversariale. Méthode : citation exacte des lignes (recoupée par lecture directe du fichier actuel), avec ré-vérification personnelle approfondie sur les 7 points les plus sévères ou à risque de perte de données (C1, C2, C5, C6, C7, C15, C18 — tous confirmés exacts à la ligne près) ; les autres sont acceptés sur la base de la précision déjà démontrée par les citations du conseil sur cet échantillon.

| # | Verdict | Preuve de vérification |
|---|---------|------------------------|
| C1 | **CONFIRMÉ** | Code cité et relu (Index.html:13220-13230) : `enterLotGroupMode()` n'attache `lot-group-selectable`/le listener qu'aux `.entry-row` déjà dans le DOM. `addRowBtn` reste actif, `addEntryRow()` ne référence `lotGroupMode` nulle part. |
| C2 | **CONFIRMÉ, sévère** | Code cité et relu (Index.html:15958-16004) : `setLotUniverse()` fait `container.innerHTML=''` puis reconstruit via `addEntryRow(p)` (nouveaux id, `rowCounter` global monotone jamais remis à zéro) sans toucher `lotGroupSel`/`lotGroupMap`. `applyLotGroup()` (13265-13285) confirmé : `if (!row) return;` sort silencieusement, `showToast(...)` s'exécute quand même juste après avec le compte original. |
| C3 | **CONFIRMÉ, sévère** | Code cité (Index.html:13049-13066) : `callServer('apiGetHistoryPage', …, 'Historique rapide')` — 4 arguments, pas de 5ᵉ `onError`. Recoupé avec `callServer` (8593-8618) : `onSuccess` court-circuité sur `res.success===false`, jamais appelé → le code de récupération à l'intérieur ne s'exécute jamais. Même mécanisme que C1-C4 de la passe 2 (Historique) et R3 (Changelog, passe 4 — voir plus bas) : troisième famille de récidive de ce motif dans la session. |
| C4 | **CONFIRMÉ** | Code cité (Index.html:12916-12924) : `callServer('apiGetBareme', [], …, 'Barème rapide')` sans `onError`, même trou de câblage que C3. |
| C5 | **CONFIRMÉ, sévère** | Code relu intégralement (Index.html:13175-13217) : `updateLotSummary()` ne fait que `parseInt(.custom-pts-in.value)` par ligne, aucune référence à la plage de dates ni à `.sub-top-item`. Le libellé affiché est explicitement « pts au total » (Index.html:4377) — trompeur tel quel. |
| C6 | **CONFIRMÉ, sévère** | Code relu intégralement (Index.html:8679-8709, cité en Carte) : `openLotRecapModal()` boucle sur `dayPlan.entries` (gère donc bien la multiplication par date), mais ne lit jamais `e.subTops`. Seul message de confirmation post-écriture de l'onglet. |
| C7 | **CONFIRMÉ, sévère** | Code relu (Index.html:12296-12303, `applyRowCategoryVisuals`) : `--row-accent` est posé depuis la couleur réelle du Top (`categoryColor()`/`ac.color`) à la création de la ligne. `applyLotGroup()` (13265-13285) écrase ensuite cette même variable avec `groupColors[]` (hex en dur). Grep confirmé : `--row-accent` piloté à 15+ endroits du CSS (bordures, fonds, box-shadow — Index.html:929, 1440, 1448, 2445-2464, 3141-3306+). Violation directe et prouvée de la règle « couleurs de Top issues des données ». |
| C8 | **CONFIRMÉ** | `ALT_FALLBACK_COLOR = '#ffd166'` (Index.html:5228) utilisé en dur dans le picker Top Alt (12636-12689) au lieu de `var(--alt-accent)` (qui vaut `#b8860b` en thème clair) ni de la couleur propre de chaque catégorie Alt — contrairement à `applyRowCategoryVisuals` qui, elle, lit bien `ac.color`. |
| C9 | **CONFIRMÉ, mineur** | Sous-tops : `<select class="sub-cat-select">` natif sans pastille de couleur, à comparer au Top principal (`RichSelect` avec pastille `categoryColor()`). Écart d'exhaustivité réel mais impact visuel mineur — reporté (voir Correction). |
| C10 | **CONFIRMÉ, hors périmètre proportionné** | `buildRichSelect()` (7745-7954) n'a effectivement aucun `keydown`. Réel, mais ce composant est utilisé dans **tout** l'onglet et probablement ailleurs dans l'app (Paramètres, Notes…) — une accessibilité clavier complète mérite sa propre passe dédiée, pas un correctif ponctuel scope à Saisir un Lot. Reporté explicitement. |
| C11 | **CONFIRMÉ, mineur** | Ordre DOM `topBar` avant `mainRow` vérifié par lecture (12748 vs 12791+, `div.appendChild` dans cet ordre). |
| C12 | **CONFIRMÉ, sévère** | Reproduit par le conseil via `elementFromPoint` sur le harness réel — preuve directe en conditions live, pas seulement du code. |
| C13 | **CONFIRMÉ, non prioritaire** | Taille de fonction vérifiée (12305 à la fermeture avant 13175, soit ~869 lignes). Refactor pur, aucun bug associé — reporté, même prudence que C15/C17 de la passe 2 sur les fonctions denses de cette zone. |
| C14 | **CONFIRMÉ, non prioritaire** | Triple duplication vérifiée par lecture des 3 sites cités. Divergence réelle mais mineure (juste une classe d'animation manquante) — reporté. |
| C15 | **CONFIRMÉ, sévère** | Code relu et confirmé exact (Index.html:12768-12778) : l'objet passé à `addEntryRow()` par `dupBtn` n'a pas de clé `subTops`. Perte de donnée silencieuse et reproductible à la duplication d'une ligne avec sous-top(s). |
| C16 | **CONFIRMÉ, non prioritaire** | Même cause que C3, code mort confirmé — regroupé avec C3 dans la correction (le fix de C3 rend ce commentaire obsolète mais la branche reste target de la même correction). |
| C17 | **CONFIRMÉ, non prioritaire** | Recherche exhaustive vérifiée par grep : aucun appelant ne construit `altCategories` (pluriel). Code mort sans risque direct — reporté, cohérent avec la remarque de la Carte sur `AltHistory.refHistoryRowId` déjà fragile (prudence sur `appendBulkPlan`). |
| C18 | **CONFIRMÉ, sévère mais peu exploitable avec l'UI actuelle** | Code relu et confirmé exact (Code.gs:1171-1190 vs 1196-1225). Nuance après analyse : dans le flux actuel, `entry.points` transmis à `addAltEntries` vaut toujours soit `totalPts` (déjà validé ≥1 par `appendBulkPlan` en amont) soit `ac.points` — et `ac.points` n'est jamais fourni par aucun appelant réel (cf. C17, code mort). Le chemin d'écriture à 0 point silencieux existe bien dans le code et serait immédiatement exploité si le format objet de `altCategory` (actuellement mort) était un jour branché côté UI — donc un vrai défaut de robustesse défensive, mais pas un bug déclenchable aujourd'hui par un usage normal de l'app. Corrigé quand même par cohérence avec `addNativeAltEntries`, sans changer son urgence perçue. |
| R1 | **CONFIRMÉ** (déjà prouvé phase 2) | Reproduit deux fois dans le navigateur, cause exacte citée (Index.html:8695). |
| R2 | **CONFIRMÉ, transverse** (déjà prouvé phase 2) | Reproduit sur `.desc-in` et `.d-mode-btn` dans le navigateur réel. |
| R3 | **CONFIRMÉ** (déjà prouvé phase 2) | Mesuré directement en mobile (375px) sur 5 contrôles de ligne. |

## Écartés — phase 4

_(aucun candidat rejeté cette passe — tous se sont révélés réels au moins par citation de code vérifiée ; C10 est confirmé réel mais explicitement écarté du périmètre de correction de cette passe, pas de sa réalité)_

## Correction — phase 5

Priorité : bugs à impact utilisateur direct, violations de règles maison prouvées, et pertes de données silencieuses. Reportés avec raison (refactors de code sain sans bug associé, ou hors périmètre proportionné) : **C9** (impact visuel mineur, traitement minimal appliqué quand même faute de coût élevé — voir ci-dessous), **C10** (chantier d'accessibilité transverse à tout le composant `RichSelect`, mérite sa propre passe), **C13, C14, C16, C17** (refactors/code mort sans bug direct), et l'intégralité des « Améliorations candidates » listées en phase 3 (aucune n'est un défaut prouvé ; reportées à une prochaine amélioration ciblée plutôt que traitées en vrac dans cette passe déjà chargée).

1. **R1** — `openLotRecapModal` : remplacer `JSON.stringify(name)` (guillemets doubles conflictuels) par un échappement compatible attribut HTML simple-quote.
2. **R2** — mécanisme général (pas un patch ligne par ligne comme R7/R10) : désactiver temporairement les transitions CSS pendant la bascule de thème (classe `theme-switching` posée avant le toggle, retirée après le prochain frame), pour fermer définitivement cette famille de bug plutôt que de continuer à la corriger règle par règle à chaque passe.
3. **R3** — cibles tactiles ≥44px en mobile sur : raccourcis de points, bascule date par ligne, puces de raccourci de date, ＋ Top supp., Dupliquer/Supprimer ligne.
4. **C1 + C2** — désactiver `addRowBtn`, `lotModeMainBtn`, `lotModeAltBtn` pendant `lotGroupMode` (cause commune des deux défauts).
5. **C3 + C16** — `onError` sur `loadHistPage` (réinitialise `_histLoading`, vide le squelette, affiche un état d'erreur explicite).
6. **C4** — `onError` sur `refreshBaremeForTop`.
7. **C5 + C6** — helper commun `computeRowTotalPoints(row)` (plage × répétition + sous-tops), utilisé par `updateLotSummary` et par la construction du total affiché dans `openLotRecapModal`.
8. **C7** — `applyLotGroup` n'écrase plus `--row-accent` ; le marquage visuel de groupe (déjà porté par `.lot-group-tag`) suffit sans détruire le code couleur du Top.
9. **C8** — picker Top Alt lit la couleur réelle de chaque catégorie Alt (`ac.color || ALT_FALLBACK_COLOR`) au lieu de la constante fixe seule.
10. **C9** — ajout d'une pastille de couleur minimale devant chaque `<select>` de sous-top (même source `categoryColor()` que le Top principal), sans remplacer le `<select>` par un `RichSelect` complet (coût disproportionné pour ce défaut mineur).
11. **C11** — réordonner le DOM de la ligne : `mainRow` avant `topBar`, pour un ordre de tabulation logique (joueur → Top → points → date avant les actions administratives).
12. **C12** — réserver un dégagement en bas de `entryContainer` (padding-bottom) au moins égal à la hauteur de `#lotSummaryBar`, pour que la dernière ligne ne soit jamais recouverte pendant le défilement.
13. **C15** — `dupBtn` relit les `.sub-top-item` de la ligne et les inclut dans le `preset.subTops` transmis à `addEntryRow`, qui doit apprendre à réhydrater ce champ.
14. **C18** — `AltStorageService.addAltEntries`/`_buildAltRow` valide `points ≥ 1` (comme `addNativeAltEntries`) plutôt que de retomber silencieusement sur 0.

### Réalisé (livré v3.10.0)

Tous les points ci-dessus ont été corrigés, **sauf C11** (réordonnancement DOM `mainRow`/`topBar` pour l'ordre de tabulation) : écarté en cours de route, faute de pouvoir vérifier visuellement l'absence de régression de mise en page dans cette session (le pane du navigateur ne produit pas de capture d'écran en environnement headless — seule l'inspection DOM est possible). Un changement d'ordre DOM affecte l'ordre visuel autant que l'ordre de tabulation sur un conteneur flex/bloc ; le risque de casser silencieusement la mise en page réelle de la ligne dépassait la sévérité « mineure » du défaut. Reporté à une passe qui pourra le vérifier avec une capture d'écran réelle.

`npm run verify` vert à 154 tests (153 → 154, +1 test C18 dans `tests/alt-tops.test.js`). Serveur de prévisualisation redémarré avant re-sonde (leçon passe 1).

Re-sonde au navigateur après redémarrage :
- **R1** : lot envoyé avec un avatar introuvable (fixture `example.invalid`) → 0 entrée dans `window.__frontErrors` (contre 1 avant le fix, reproduit deux fois) ; l'attribut `onerror` s'exécute correctement et bascule vers l'avatar de repli.
- **C5 + C6** : scénario combiné (ligne à 10 pts + sous-top à 20 pts sur une plage de 5 jours, dupliquée) → barre récap et modale de récap affichent tous deux **301 pts**, valeur recalculée indépendamment et confirmée exacte (150 + 1 + 150) ; l'ancien calcul aurait affiché 21 pts.
- **C15** : ligne avec un sous-top dupliquée → la copie porte bien le même sous-top (même Top, même valeur de points) — vérifié sur les 3 lignes du DOM après duplication.
- **C1 + C2** : mode groupement activé → `addRowBtn`/`lotModeMainBtn`/`lotModeAltBtn` bien désactivés (`disabled: true`) ; sélection de 2 lignes + application du groupe → `addRowBtn` réactivé après coup, `--row-accent` de la ligne inchangé (couleur réelle du Top conservée), badge « Groupe 1 » présent.
- **C9** : pastille de couleur d'un Top supplémentaire vérifiée conforme à `categoryColor()` du Top sélectionné.
- **C8** : couleur du picker Top Alt vérifiée conforme à la couleur réelle de la catégorie sélectionnée (`#ee6943` pour « Trou du cul » dans les fixtures) via l'attribut `style` réel de l'élément — `getComputedStyle` s'est montré peu fiable sur cette vérification précise dans ce pane headless (`document.hidden === true`, cohérent avec la limite déjà documentée en passe 2 sur les animations GSAP) ; l'attribut `style` inline, source de vérité du rendu, confirme le fix.
- **C3, C4, C7, C12, R2, R3** : vérifiés par lecture directe du code corrigé (comportement déjà validé en isolation pour R2/R3 lors de passes précédentes sur le même motif).

Note d'exhaustivité : `ALT_FALLBACK_COLOR` reste utilisé tel quel dans le reste de l'application (Dashboard, Historique, Paramètres…) — seul le picker de Saisir un Lot a été corrigé, cohérent avec le périmètre de cette passe. Un balayage complet de cette constante à travers l'app n'a pas été fait et n'est pas silencieux : signalé ici comme piste pour une passe future si l'incohérence visuelle gêne ailleurs.

---
