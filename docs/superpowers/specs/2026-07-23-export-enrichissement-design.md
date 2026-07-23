# Enrichissement des exports Dashboard (infographie + CSV/Excel)

Statut : proposé
Date : 2026-07-23
Périmètre : `Index.html` (export CSV/Excel/Infographie du Dashboard). Extension à `Mobile.html` évaluée au cas par cas (voir §Parité mobile).

Note : la spec sœur `2026-07-23-export-animations-design.md` couvre les exports animés (bar chart race, dessin progressif du graphique) — hors périmètre ici, volontairement séparée pour livrer cet enrichissement en premier.

## Contexte

Le Dashboard propose déjà 3 exports (`Index.html` ~L2784-2787, logique ~L7887-8397) :
- 🎨 **Infographie** : image PNG/JPEG/PDF fortement personnalisable via une modale (`openExportModal()`) — thème, résolution, titre, avatars, filigrane, légende, résumé des filtres.
- 📊 **CSV** : export brut du tableau de données du graphique courant (`exportAsCSV()`).
- 📗 **Excel** : même contenu que le CSV, un seul onglet `Scores` (`exportAsExcel()`).

Objectif de cette spec : enrichir ces 3 exports sans rien retirer de l'existant.

## A. Infographie — améliorations

### A1. Mémoriser les réglages de la modale
Au lieu de repartir des valeurs par défaut (`format: 'png', theme: <thème courant>, scale: 1, ...`) à chaque ouverture de `openExportModal()`, les derniers réglages choisis par l'utilisateur sont sauvegardés en `localStorage` (clé dédiée, ex. `exportOpts_v1`) et réutilisés à la prochaine ouverture. Le thème reste ré-évalué dynamiquement si l'utilisateur n'a jamais explicitement changé ce champ (sinon son dernier choix explicite prime).

### A2. Copier dans le presse-papier
Ajout d'un bouton "📋 Copier" à côté de "⬇️ Télécharger" dans la modale, actif uniquement pour PNG/JPEG (pas PDF). Utilise `navigator.clipboard.write()` avec un `ClipboardItem` construit depuis le canvas (`canvas.toBlob()`). Si l'API est indisponible (navigateur non supporté), le bouton est masqué plutôt que d'échouer silencieusement.

### A3. Stat "plus forte progression"
Nouvelle option cochable dans le groupe "Options" (`checkOpt('Plus forte progression', 'topMover')`), affichée comme pill supplémentaire à côté des pills catégories/joueurs existantes. Calculée à partir des mêmes données déjà chargées pour le graphique courant (comparaison du total sur la période active vs la période équivalente précédente) — pas de nouvel appel serveur. Si l'historique ne couvre pas de période précédente comparable, la pill est omise (pas de valeur inventée).

### A4. Export groupé ("tout exporter")
Nouveau bouton `export-btn` "🗂️ Tout exporter" à côté des 3 boutons existants. Génère l'image PNG (réglages courants de la modale, ou défauts si jamais ouverte) pour chaque type de graphique actif compatible (Empilé, Groupé, Courbes, Radar — Donut et Classement exclus car dépendants d'une sélection joueur unique / non représentatifs en batch), et les regroupe dans un zip téléchargé en un clic. Utilise une librairie zip légère chargée à la demande (même pattern que `EXPORT_LIBS.jspdf`/`xlsx`), ex. `fflate` ou équivalent sans dépendance.

## B. CSV / Excel — enrichissement du contenu

### B1. Onglet "Classement" (Excel uniquement)
`exportAsExcel()` ajoute un second onglet `Classement` : rang, joueur, total sur la période/filtres actifs, écart de points avec le joueur suivant au classement. Calculé à partir des mêmes données déjà utilisées par le type de graphique "Classement" (`AnalyticsService`/données déjà en cache côté client, pas de nouvel appel serveur si les données sont déjà chargées ; sinon un seul appel `callServer()` supplémentaire).

### B2. Onglet "Contexte" (Excel uniquement)
Troisième onglet `Contexte` : période active, joueurs filtrés, catégories filtrées, date/heure d'export. Une ligne par information, format `Clé | Valeur`.

### B3. En-tête de contexte (CSV)
`exportAsCSV()` préfixe le CSV de lignes commentées (`# `) reprenant les mêmes informations que l'onglet Contexte B2, avant la ligne d'en-tête du tableau. Format ligne : `# Période : ...`, `# Joueurs filtrés : ...`, etc. Les lecteurs CSV standards ignorent ou affichent ces lignes sans casser le parsing du tableau qui suit.

## Parité mobile

`Mobile.html` n'expose actuellement aucun de ces 3 boutons d'export (fonctionnalité desktop-only, non trouvée côté mobile lors de l'exploration). Cette spec ne les ajoute pas côté mobile — cohérent avec l'existant. À confirmer explicitement si un besoin mobile apparaît plus tard (ne pas assumer, règle §7 context.md).

## Hors périmètre

- Exports animés (GIF/vidéo) → spec séparée `2026-07-23-export-animations-design.md`.
- Modification du contenu ou de la structure de la feuille `History`/`Notes` — ces exports ne font que lire des données déjà exposées.
- Partage direct vers un réseau/service tiers (au-delà du copier-coller local) — non demandé.

## Erreurs et cas limites

- `navigator.clipboard` indisponible → bouton "Copier" masqué (A2).
- Aucune période précédente comparable pour A3 → pill omise, jamais de valeur à 0 par défaut.
- Aucun graphique actif compatible pour l'export groupé (A4) → toast d'erreur explicite, pas de zip vide.
- Échec de chargement d'une librairie à la demande (zip, presse-papier) → toast d'erreur existant (pattern déjà en place pour `EXPORT_LIBS`).

## Changelog

Chaque item (A1-A4, B1-B3) est livré avec une entrée `CHANGELOG.md` séparée (humanisé + technique), conformément à la règle §8 de `context.md`.
