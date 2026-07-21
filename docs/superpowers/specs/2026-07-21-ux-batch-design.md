# Spec — Batch UX : navbar, record, légende, notes (2026-07-21)

4 modifications indépendantes, à traiter dans cet ordre (impact croissant sur le backend).

---

## 1. Navbar compacte — icônes seules, label au survol

### Situation actuelle
- Les boutons d'onglet affichent `icon + " " + label` (ex. "📊 Dashboard").
- Sur petit écran, la barre scrolle horizontalement — les labels prennent beaucoup de place.

### Design
- **Par défaut** : n'afficher que l'icône. Le label est masqué via CSS (`display:none` ou `max-width:0;overflow:hidden`).
- **Au survol** (`:hover`) ou si le bouton est **actif** (`.active`) : le label apparaît en slide-out (`max-width` animé + `transition`).
- Le titre "Tops des Tops" (`.app-brand-title`) reste inchangé.
- Sur mobile (`Mobile.html`) : sans objet, la nav est un menu latéral.

### Fichiers touchés
- `Index.html` : CSS `.nav-btn` + JS `navButtonHtml()` (séparer l'icône du label dans un `<span>` pour pouvoir cibler).

### Risques
- S'assurer que le `countSpan` (badge de comptage) reste visible même quand le label est masqué.
- Tester l'animation avec beaucoup d'onglets pour éviter un saut de layout.

---

## 2. Record absolu — remonter dans le Dashboard

### Situation actuelle
- Le record absolu est affiché en tête de l'onglet "Records" dans le hub Statistiques (`.sr-hero`), en bas du Dashboard.
- C'est un contenu "star" relégué dans un coin.

### Design
- **Remonter la carte hero** dans le Dashboard, juste en dessous du graphique principal et au-dessus du hub Statistiques.
- Le record reste aussi visible dans l'onglet Records (pas de duplication — on le déplace).
- Alternative : l'intégrer dans la quick stats bar (`.quick-stats-bar`) comme une pill supplémentaire "🏆 Record". Plus compact mais perd l'impact visuel de la carte dorée.

### Approche recommandée
Pill dans la quick stats bar. Cohérent, pas de carte supplémentaire, info visible dès le chargement. Le détail reste dans l'onglet Records.

### Fichiers touchés
- `Index.html` : `scanRecords()` alimente aussi une pill dans `#quickStatsBar` ; CSS pour la pill record.
- `Mobile.html` : vérifier la parité — si la quick stats bar existe côté mobile, y ajouter la pill.

---

## 3. Légende du graphique — restyler + revenir au toggle classique

### Situation actuelle
- Légende = rendu natif Chart.js (petits carrés de couleur + texte, cf. capture).
- `isolatableLegendOnClick` : un clic **isole** la série (masque les autres). Comportement voulu initialement mais l'utilisateur préfère le toggle classique (clic = masquer/afficher la série individuelle, comme le `strikethrough` d'avant).

### Design
- **Comportement** : revenir au toggle classique de Chart.js (`Chart.defaults.plugins.legend.onClick`) — un clic bascule la visibilité de la série cliquée. Le texte barré (`strikethrough`) apparaît sur les séries masquées.
- **Style** : remplacer la légende native par une **légende HTML custom** sous le graphique.
  - Chaque item = pill avec emoji de la catégorie + nom + carré de couleur de la catégorie.
  - Style cohérent : `border-radius:20px`, `background:var(--btn-alt)`, `border:1.5px solid <couleur catégorie>`.
  - État masqué : pill grisée + texte barré + opacité réduite.
  - Clic sur la pill = `chart.getDatasetMeta(i).hidden = !hidden; chart.update()`.
- Masquer la légende Chart.js native (`legend: { display: false }`).

### Fichiers touchés
- `Index.html` : nouveau conteneur `#chartLegend` sous `#mainChart` ; fonction `renderCustomLegend(chart, data)` appelée après `renderChart()` ; CSS pills de légende ; retrait de `isolatableLegendOnClick`.
- Infographie (`exportInfographic`) : adapter le rendu de la légende si elle est utilisée dans l'export canvas — garder l'ancienne logique canvas pour l'export ou adapter.
- `Mobile.html` : si le graphique mobile utilise la même légende, appliquer le même changement.

### Risques
- L'export infographie dessine la légende sur canvas (lignes 7853-7875). Il faudra soit garder la logique canvas actuelle (elle lit les datasets, pas la légende HTML), soit l'adapter pour lire l'état hidden des datasets.

---

## 4. Notes — traçabilité auteur + dernier modificateur

### Situation actuelle
- Feuille Notes : `Date | Joueur | Note` (3 colonnes).
- `NotesService.addNote()` écrit `[targetDate, player, text]`.
- `NotesService.editNote()` met à jour le texte uniquement.
- Aucune notion d'auteur (= identité connectée qui écrit) ni de date/auteur de modification.

### Design
- **Nouvelles colonnes** dans la feuille Notes : `Date | Joueur | Note | Auteur | ModifiéPar | ModifiéLe`
  - `Auteur` = identité connectée (`requireIdentity()`) au moment de la création.
  - `ModifiéPar` / `ModifiéLe` = mis à jour à chaque `editNote()`.
- **Backend** (`Code.gs`) :
  - `NotesService._sheet()` : si les colonnes 4-6 manquent, les ajouter (migration douce).
  - `addNote(player, text, dateStr, author)` : écrire l'auteur en colonne 4.
  - `editNote(rowIndex, newText, editor)` : écrire `editor` en colonne 5, `new Date()` en colonne 6.
  - `getAllNotes()` : lire les 6 colonnes, retourner `createdBy`, `lastEditedBy`, `lastEditedAt`.
- **Frontend** (`Index.html` + `Mobile.html`) :
  - Sous chaque note, afficher en petit : "Créé par Joueur · Modifié par Joueur le JJ/MM".
  - Avatar de l'auteur à côté du texte.
  - `requireIdentity()` déjà appelé avant `addNote`/`editNote` (existant), on passe l'identité en paramètre.

### Fichiers touchés
- `Code.gs` : `NotesService` (4 fonctions), `apiAddNote`, `apiEditNote`.
- `Index.html` : rendu des notes, appels `addNote`/`editNote`.
- `Mobile.html` : idem.

### Risques
- Migration douce : les notes existantes auront les colonnes 4-6 vides → afficher "—" ou rien.
- `AuditService.log()` doit déjà être en place pour add/edit/delete — vérifier.

---

## Ordre d'implémentation recommandé

| # | Tâche | Complexité | Parité mobile |
|---|-------|-----------|---------------|
| 1 | Navbar compacte | Faible | Non (nav différente) |
| 2 | Légende custom + toggle | Moyenne | À vérifier |
| 3 | Record dans quick stats | Faible | Oui |
| 4 | Traçabilité notes | Moyenne | Oui (backend + 2 frontends) |

---

## Hors périmètre
- Pas de nouveau skill/onglet.
- Pas de changement de données existantes (migration additive uniquement pour les notes).
- Pas de changement backend sauf NotesService.
