# Spec — Journal d'audit utilisateur (AuditLog)

**Date** : 2026-06-28  
**Projet** : Top-des-Tops (Google Apps Script + Google Sheets)  
**Fichiers cibles** : `Code.gs`, `Index.html`

---

## Objectif

Tracer toutes les opérations qui modifient les données dans le Sheets (History, Players, Categories, Notes, Bareme, Phrases). Le journal doit être extensible : toute nouvelle fonction mutante s'intègre en ajoutant une seule ligne `AuditService.log(...)`.

---

## Feuille `AuditLog`

Nouvelle feuille Google Sheets, créée automatiquement au premier appel à `AuditService.log()` (même pattern que Notes/Bareme/Phrases).

### Schéma (7 colonnes)

| # | Nom | Type | Description |
|---|---|---|---|
| A | `Timestamp` | Date | Horodatage exact de l'action (`new Date()`) |
| B | `Auteur` | String | Nom du joueur-saiseur (`_whoAmI` du frontend), ou `''` si non identifié |
| C | `Action` | String | Libellé humain de l'action (voir liste ci-dessous) |
| D | `Entité` | String | Ressource affectée (ex : `"History"`, `"Joueur: Alice"`, `"Top: Judo"`) |
| E | `Avant` | String | État lisible avant la mutation, ou `''` pour les créations |
| F | `Après` | String | État lisible après la mutation, ou `''` pour les suppressions |
| G | `Détail` | String | Contexte supplémentaire (ligne #, groupId, nombre d'entrées…) |

---

## `AuditService` (nouveau service GAS)

Objet littéral placé **après** `ConfigService` dans `Code.gs`, avant `SettingsService`.

### Interface publique

```javascript
AuditService.log(author, action, entity, before, after, detail)
```

**Contrat :**
- Ne lève jamais d'exception (`try/catch` interne, erreur silencieuse)
- N'est jamais appelé hors d'un contexte `withLock()` (le lock est déjà tenu par l'appelant)
- Appelle `_getOrCreateSheet()` qui crée la feuille si elle n'existe pas encore

### Auto-création de la feuille

```javascript
_getOrCreateSheet() {
  const cache = ConfigService.getSheets();
  if (cache.auditLog) return cache.auditLog;
  const sheet = cache.spreadsheet.insertSheet('AuditLog');
  sheet.appendRow(['Timestamp','Auteur','Action','Entité','Avant','Après','Détail']);
  sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  ConfigService.clearCache();
  return ConfigService.getSheets().auditLog;
}
```

### `ConfigService` — ajout `auditLog`

Dans `getSheets()`, ajouter :
```javascript
const auditLog = ss.getSheetByName('AuditLog') || null;
_cache = { spreadsheet, history, players, categories, notes, bareme, phrases, auditLog };
```

---

## Actions loguées (32 événements d'audit, 26 fonctions api*)

### Sérialisation avant/après

Les valeurs `avant` et `après` sont des **chaînes lisibles**, jamais du JSON brut.

| Ressource | Format |
|---|---|
| History (1 entrée) | `"Alice \| Judo \| 50 pts \| 15/01/2026 \| description"` |
| Joueur | `"Alice (avatar: url, couleur: #ff0000)"` |
| Top | `"Judo (desc, 🥋, #ff0000)"` |
| Note | `"Alice : texte de la note"` |
| Barème | `"Judo \| Ippon \| 5 pts"` |
| Phrase | `"[first] Texte de la phrase (preset: Défaut)"` |
| Bulk | `"5 entrées"` (résumé, pas de lecture ligne par ligne) |

Pour les opérations single-row nécessitant l'état "avant", la lecture se fait **dans le `withLock()`** avant la mutation.

### Tableau complet des 28 actions

| api* function | Action (string) | Entité | Avant | Après | Détail |
|---|---|---|---|---|---|
| `apiAddBulkPlan` | `Saisie de points` | `History` | `''` | résumé N lignes | groupTag si présent |
| `apiDeleteHistoryEntry` | `Suppression entrée` | `History` | état ligne lue | `''` | `ligne #N` |
| `apiDeleteHistoryEntries` | `Suppression bulk` | `History` | `''` | `''` | `N entrées` |
| `apiUpdateHistoryEntry` | `Modification entrée` | `History` | état avant | état après | `ligne #N` |
| `apiUpdateHistoryDescription` | `Description modifiée` | `History` | ancienne desc | nouvelle desc | `ligne #N` |
| `apiUpdateBulkDescription` | `Description bulk` | `History` | `''` | nouvelle desc | `N entrées` |
| `apiUpdateBulkEntries` | `Modification bulk` | `History` | `''` | champs modifiés | `N entrées` |
| `apiGroupRows` | `Groupement lot` | `History` | `''` | `''` | `N entrées, gid: G...` |
| `apiGroupDistributedLots` | `Lots auto-groupés` | `History` | `''` | `''` | `N lots` |
| `apiUngroupLot` | `Dégroupement lot` | `History` | groupId | `''` | `''` |
| `apiFixZeroPoints` | `Nettoyage zéros` | `History` | `''` | `''` | `N entrées supprimées` |
| `apiDeleteOrphans` | `Nettoyage orphelins` | `History` | `''` | `''` | `N entrées supprimées` |
| `apiManageEntity` ADD Players | `Joueur ajouté` | `Joueur: <name>` | `''` | état après | `''` |
| `apiManageEntity` DELETE Players | `Joueur supprimé` | `Joueur: <name>` | état avant | `''` | `''` |
| `apiManageEntity` RENAME Players | `Joueur renommé` | `Joueur: <oldName>` | `"<oldName>"` | `"<newName>"` | `''` |
| `apiSetColor` Players | `Couleur joueur` | `Joueur: <name>` | ancienne couleur | nouvelle couleur | `''` |
| `apiManageEntity` ADD Categories | `Top ajouté` | `Top: <name>` | `''` | état après | `''` |
| `apiManageEntity` DELETE Categories | `Top supprimé` | `Top: <name>` | état avant | `''` | `''` |
| `apiManageEntity` RENAME Categories | `Top renommé` | `Top: <oldName>` | `"<oldName>"` | `"<newName>"` | `''` |
| `apiSetColor` Categories | `Couleur Top` | `Top: <name>` | ancienne couleur | nouvelle couleur | `''` |
| `apiAddNote` | `Note ajoutée` | `Note: <player>` | `''` | texte de la note | `''` |
| `apiDeleteNote` | `Note supprimée` | `Note: <player>` | texte lu avant | `''` | `ligne #N` |
| `apiEditNote` | `Note modifiée` | `Note: <player>` | texte avant | texte après | `ligne #N` |
| `apiAddBaremeEntry` | `Règle ajoutée` | `Barème` | `''` | état après | `''` |
| `apiUpdateBaremeEntry` | `Règle modifiée` | `Barème` | état avant lu | état après | `ligne #N` |
| `apiDeleteBaremeEntry` | `Règle supprimée` | `Barème` | état avant lu | `''` | `ligne #N` |
| `apiAddPhrase` | `Phrase ajoutée` | `Phrases: <preset>` | `''` | état après | `''` |
| `apiSavePhrasesBatch` | `Phrases batch` | `Phrases: <preset>` | `''` | `''` | `N phrases` |
| `apiUpdatePhrase` | `Phrase modifiée` | `Phrases` | texte avant lu | texte après | `ligne #N` |
| `apiDeletePhrase` | `Phrase supprimée` | `Phrases` | état avant lu | `''` | `ligne #N` |
| `apiDeletePreset` | `Preset supprimé` | `Phrases: <preset>` | `''` | `''` | `''` |
| `apiRenamePreset` | `Preset renommé` | `Phrases` | ancien nom | nouveau nom | `''` |

> **Règle pour "avant" single-row** : lire la donnée via `sheet.getRange(rowIndex, ...).getValues()[0]` à l'intérieur du `withLock()`, avant toute mutation.

---

## Endpoint de lecture du journal

Nouvelle fonction GAS :

```javascript
function apiGetAuditLog(page, pageSize, filterAuthor, filterAction, startDate, endDate)
```

- Lit la feuille `AuditLog` de bas en haut (entrées récentes d'abord)
- Filtre par auteur, type d'action, plage de dates
- Retourne `{ success, logs: [...], total }` (même enveloppe que `apiGetHistoryPage`)
- Lecture seule — pas de write

---

## Frontend — Interface utilisateur

### Nouveau sous-onglet dans Historique

L'onglet `📜 Historique` adopte la structure sous-onglets `settings-tab-pane` (CSS + JS déjà existants). Deux sous-onglets :

1. **`📜 Entrées`** — contenu existant inchangé
2. **`🔍 Journal`** — nouveau feed d'audit

HTML pattern à placer en tête du `#tab-history` :
```html
<div class="history-inner-nav">
  <button class="history-nav-btn active" data-stab="stab-history-entries">📜 Entrées</button>
  <button class="history-nav-btn" data-stab="stab-history-audit">🔍 Journal</button>
</div>
<div id="stab-history-entries" class="history-tab-pane active"> <!-- contenu existant --> </div>
<div id="stab-history-audit" class="history-tab-pane"> <!-- nouveau feed --> </div>
```

**Important** : utiliser des classes dédiées `history-nav-btn` / `history-tab-pane` (et non `settings-nav-btn` / `settings-tab-pane` qui sont des sélecteurs globaux capturés par `initSettingsTabs()`). Ajouter `initHistoryTabs()` scopé à `#tab-history` :

```javascript
function initHistoryTabs() {
  const container = document.getElementById('tab-history');
  container.querySelectorAll('.history-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.stab;
      container.querySelectorAll('.history-nav-btn').forEach(b => b.classList.toggle('active', b === btn));
      container.querySelectorAll('.history-tab-pane').forEach(p => p.classList.toggle('active', p.id === target));
      if (target === 'stab-history-audit') loadAuditLog(1);
    });
  });
}
```

### Feed d'audit (`stab-history-audit`)

**Filtres :**
- Auteur : chips joueurs (multi-select, même composant `fchip` existant)
- Type d'action : `<select>` avec toutes les actions distinctes
- Plage de dates : deux `<input type="date">` (De / À)
- Bouton "🔄 Actualiser"

**Tableau (lecture seule) :**

| Quand | Qui | Action | Entité | Avant → Après | Détail |
|---|---|---|---|---|---|

- `Qui` : avatar + nom (règle UX universelle)
- `Avant → Après` : si `avant` et `après` tous les deux remplis : `avant → après` ; si seul `avant` : `avant` en rouge ; si seul `après` : `après` en vert
- Pagination identique à l'historique : pageSize 20, boutons Préc./Suiv.

**Pas de suppression ni d'édition.**

### Passage de l'auteur dans `callServer`

Chaque appel `callServer` déclenchant une mutation passe `_whoAmI || ''` en dernier argument :

```javascript
// Pattern uniforme
callServer('apiXxx', [...existingArgs, _whoAmI || ''], onSuccess, label);
```

Tous les call sites des 26 fonctions mutantes dans `Index.html` reçoivent `_whoAmI || ''` en dernier argument. La signature backend reçoit `author` en dernier paramètre.

---

## Contrainte architecturale persistante

> **Toute nouvelle fonction mutante doit appeler `AuditService.log(...)` dès sa création.**

Cette règle ne nécessite aucune modification de l'infrastructure existante — uniquement une ligne ajoutée dans le corps de la nouvelle fonction.

---

## Fichiers modifiés

| Fichier | Nature des changements |
|---|---|
| `Code.gs` | +`AuditService` (nouveau) ; `ConfigService.getSheets()` +`auditLog` ; 26 `api*` mutantes : +param `author`, +`AuditService.log(...)` ; +`apiGetAuditLog` |
| `Index.html` | Tab Historique → 2 sous-onglets ; HTML feed audit ; JS filtres + pagination + `initHistoryTabs()` ; call sites mutants +`_whoAmI` |

---

## Ce qui est hors périmètre

- Authentification serveur (GAS n'a pas de session utilisateur, `author` vient du `localStorage`)
- Suppression ou correction des entrées du journal (intentionnellement impossible)
- Export du journal (pas demandé)
- Rétention / purge automatique (pas demandé)
