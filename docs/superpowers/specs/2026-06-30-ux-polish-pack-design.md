# Design — Pack UX : bandeau résumé, animation +X pts, identité visuelle

**Date :** 2026-06-30

## Contexte

Demande groupée en 5 idées d'amélioration UX. Deux ont été abandonnées en brainstorming :
- **Podium visuel sur le classement** → déjà couvert par la carte "🏆 Podium" (phrases) et le type de graphique "Classement" existants.
- **Couleurs des catégories dans l'historique** → abandonnée, hors scope.

Restent 3 features, regroupées dans un seul plan d'implémentation (petites améliorations UI/UX indépendantes mais cohérentes, même esprit "vibe entre potes").

**Contrainte projet rappelée :** fichiers `Code.gs` et `Index.html` restent monolithiques (pas de split). Ces ajouts ne doivent perdre aucune fonctionnalité existante (avatars obligatoires, thèmes, podium phrases, etc.) — voir mémoire `top-des-tops-constraints`.

---

## Feature A — Bandeau résumé rapide

### Objectif
Donner une photo instantanée de la compétition dès l'ouverture de l'app, sans dépendre des filtres du Dashboard.

### Emplacement
Nouvel élément `<div id="quickStatsBar">` inséré entre `<nav class="navbar">` et `<div class="container">`. Visible sur tous les onglets. Vue globale fixe (non filtrée), comme validé par l'utilisateur.

### Contenu (4 pastilles horizontales, scroll horizontal sur mobile comme la navbar)
1. 🏆 **Leader** — avatar + nom + total de points (toutes périodes, tous joueurs)
2. 📊 **Écart** — points d'avance du leader sur le 2e ; affiche "Égalité" si totaux identiques
3. 📅 **Ce mois-ci** — nombre d'entrées (events) enregistrées depuis le 1er du mois civil en cours
4. 🕐 **Dernier event** — avatar + nom du joueur + `+X pts` + temps relatif ("à l'instant", "il y a 2h", "il y a 3j")

### Backend — `Code.gs`
Nouvelle fonction `apiGetQuickStats()`, suit le pattern des autres endpoints `api*` (try/catch + `fail(e)`) :

```javascript
function apiGetQuickStats() {
  try {
    const allPlayers = SettingsService.getEntities('Players').map(p => p.name);
    const logs = StorageService.getFilteredLogs(allPlayers, null, null, null);

    const totals = {};
    allPlayers.forEach(p => { totals[p] = 0; });
    logs.forEach(log => {
      if (Object.prototype.hasOwnProperty.call(totals, log.player)) {
        totals[log.player] += log.points;
      }
    });

    const ranked = allPlayers
      .map(p => ({ player: p, points: totals[p] || 0 }))
      .sort((a, b) => b.points - a.points);

    const leader = ranked[0] || null;
    const second = ranked[1] || null;
    const gap = (leader && second) ? (leader.points - second.points) : null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthCount = logs.filter(l => l.timestamp >= monthStart).length;

    const sortedByDate = logs.slice().sort((a, b) => b.timestamp - a.timestamp);
    const last = sortedByDate[0] || null;

    return {
      success: true,
      stats: {
        leader: leader ? { player: leader.player, points: leader.points } : null,
        gap: gap,
        monthCount: monthCount,
        lastEvent: last ? {
          player: last.player,
          category: last.category,
          points: last.points,
          date: last.timestamp.toISOString()
        } : null
      }
    };
  } catch (e) { return fail(e); }
}
```

Réutilise `StorageService.getFilteredLogs` et `SettingsService.getEntities`, déjà existants — aucune nouvelle dépendance.

### Frontend — `Index.html`
- Rendu via `cachedPlayers.find(p => p.name === ...)` pour avatar/couleur (pattern déjà utilisé partout dans le fichier) — respecte la règle avatar obligatoire.
- Fonction `loadQuickStats()` appelée : au chargement initial, après le rafraîchissement global (`globalRefreshBtn`), et après tout enregistrement réussi qui modifie l'History (ajout de lot, suppression, édition).
- Temps relatif calculé côté client avec une petite fonction utilitaire `timeAgo(date)` (pas de librairie externe).
- Si aucune donnée (`leader === null`) : bandeau affiche un état neutre ("Pas encore de scores") plutôt que de planter.

---

## Feature B — Animation "+X pts" sur ajout de ligne

### Objectif
Rendre l'ajout d'une ligne au constructeur de lot plus satisfaisant visuellement.

### Déclencheur
Uniquement sur clic explicite utilisateur :
- bouton `#addRowBtn` ("+ Ligne")
- bouton de duplication de ligne (`dupBtn`, ligne ~5959)

**Ne se déclenche pas** sur les ajouts automatiques/silencieux :
- ligne vide auto-créée à l'ouverture de l'onglet Paramètres (ligne ~4348)
- reset après envoi réussi du lot (ligne ~6606)

### Implémentation
`addEntryRow(preset, animateFrom)` reçoit un 2e paramètre optionnel : l'élément DOM du bouton cliqué. Si fourni, après construction de la ligne, déclenche le flottement :

```javascript
function floatPointsBadge(sourceEl, points) {
  const rect = sourceEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'float-pts-badge';
  el.textContent = '+' + points + ' pts';
  el.style.left = (rect.left + rect.width / 2) + 'px';
  el.style.top = rect.top + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 650);
}
```

```css
.float-pts-badge {
  position: fixed;
  transform: translateX(-50%);
  pointer-events: none;
  font-weight: 700;
  color: var(--accent);
  z-index: 9999;
  animation: float-pts-rise 600ms ease-out forwards;
}
@keyframes float-pts-rise {
  0%   { opacity: 0; transform: translate(-50%, 0); }
  15%  { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -28px); }
}
```

Points affichés = `defaultPts` calculé dans `addEntryRow` (valeur par défaut de la nouvelle ligne, déjà calculée ligne ~5833).

Les deux call sites passent l'élément bouton cliqué :
```javascript
document.getElementById('addRowBtn').addEventListener('click', (e) => addEntryRow(undefined, e.currentTarget));
dupBtn.addEventListener('click', (e) => addEntryRow({ ... }, e.currentTarget));
```

Pas de dépendance JS externe, animation CSS pure, cohérent avec les animations existantes (`total-anim`, `pts-pop`).

---

## Feature C — Identité visuelle personnalisable (titre + logo)

### Objectif
Permettre de renommer l'app et d'ajouter un logo sans toucher au code.

### Backend — `Code.gs`

Nouvelle feuille `Settings`, auto-créée comme `Notes`/`Bareme`/`Phrases`, structure clé/valeur :
```
Key          | Value
app_title    | (vide par défaut)
logo_url     | (vide par défaut)
```

```javascript
const SettingsSheetService = {
  _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.Settings) return cache.Settings;
    const ss = ConfigService.getSpreadsheet();
    let sheet = ss.getSheetByName('Settings');
    if (!sheet) {
      sheet = ss.insertSheet('Settings');
      sheet.appendRow(['Key', 'Value']);
      sheet.appendRow(['app_title', '']);
      sheet.appendRow(['logo_url', '']);
    }
    cache.Settings = sheet;
    return sheet;
  },
  getAll() {
    const sheet = this._getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    const result = {};
    for (let i = 1; i < data.length; i++) {
      result[data[i][0]] = data[i][1];
    }
    return result;
  },
  setValue(key, value) {
    const sheet = this._getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        return;
      }
    }
    sheet.appendRow([key, value]);
  }
};

function apiGetAppSettings() {
  try {
    const all = SettingsSheetService.getAll();
    return {
      success: true,
      appTitle: all.app_title || 'Tops des Tops',
      logoUrl:  all.logo_url  || ''
    };
  } catch (e) { return fail(e); }
}

function apiSaveAppSettings(title, logoUrl, author) {
  try {
    SettingsSheetService.setValue('app_title', title || '');
    SettingsSheetService.setValue('logo_url', logoUrl || '');
    logAudit(author, 'edit_app_settings', 'app_title=' + title);
    return { success: true };
  } catch (e) { return fail(e); }
}
```

(Le nom `SettingsSheetService` évite la collision avec le `SettingsService` existant qui gère joueurs/catégories.)

### Frontend — `Index.html`

- Au chargement (`init()` ou équivalent), appel `apiGetAppSettings()` :
  - `document.title = appTitle`
  - Affichage du nom dans la navbar, à gauche des onglets, dans un nouvel élément `<span class="app-brand" id="appBrandTitle">`
  - Si `logoUrl` non vide → `<img class="app-brand-logo" id="appBrandLogo">` affichée avant le titre ; sinon élément masqué (`display:none`), pas d'icône cassée
- Valeurs par défaut (feuille vide) : titre = "Tops des Tops", pas de logo → comportement actuel inchangé, conforme à la règle de non-régression

### Paramètres — nouvelle section dans l'onglet ⚙️
Carte `🎨 Identité de l'app` dans `tab-settings`, même style que les cartes barème/joueurs existantes :
- Champ texte "Nom de l'application"
- Champ texte "URL du logo" (image, optionnelle)
- Bouton "Enregistrer" → `apiSaveAppSettings(title, logoUrl, author)` → toast succès → recharge le titre/logo affichés sans reload complet de la page

---

## Vérification

- `node --check` sur `Code.gs` (copié en `.js`) pour la syntaxe
- `npm test` (harness VM existant) — ajouter des cas pour `apiGetQuickStats`, `apiGetAppSettings`, `apiSaveAppSettings` (nominal + feuille vide/sheet auto-créée)
- Vérification manuelle visuelle impossible en local (GAS) — comportement réel à valider après déploiement par l'utilisateur
