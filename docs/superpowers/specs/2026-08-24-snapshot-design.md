# Snapshot — copie manuelle du Sheet avant opération risquée

Statut : approuvé
Date : 2026-08-24
Périmètre : `Code.gs` (nouveau `BackupService`), `Index.html` (bouton dans 🔧 Outils), `tests/harness.js` (faux `DriveApp`).

## Contexte

Décision prise en session du 2026-08-14 (voir `memory/project-tools-roadmap.md`) : un outil manuel pour copier le Sheet courant vers un autre Google Sheet, comme filet de sécurité avant une opération destructive (nettoyage, suppression d'entité...). `SettingsService.deleteEntity()`/`renameEntity()` n'ont aujourd'hui aucune sauvegarde dédiée (contrairement à `_backupHistory()` pour l'Historique) — Snapshot comble ce trou en donnant à l'utilisateur un geste manuel avant d'agir.

## Architecture

Nouveau service `BackupService` (IIFE, même style que les services existants), une seule fonction :

```
BackupService.createSnapshot(author) → { name, url }
```

**Flux :**
1. Récupère le Sheet source déjà ouvert via `ConfigService.getSheets().spreadsheet` — pas de nouvel `openById`.
2. Nom du fichier copié : `<nom du Sheet source> — Snapshot <AAAA-MM-JJ HHhMM>` (via `_pad2()`, déjà présent en tête de `Code.gs` — pas de nouvelle dépendance `Utilities.formatDate`/`Session`). Le nom du Sheet source encode déjà l'instance (Site tops / Tops RDS), donc pas d'ambiguïté si les deux partagent un Drive.
3. `spreadsheet.copy(name)` crée la copie complète (toutes les feuilles).
4. La copie est déplacée dans un sous-dossier `Snapshots top-des-tops`, créé au premier usage à côté du fichier source (même dossier Drive que l'original que celui-ci ait ou non un parent — repli sur `DriveApp.getRootFolder()` sinon). Pas de limite de rétention (usage manuel et rare).
5. Retour `{ name, url }` — `url` = lien Google Sheets réel de la copie (`copy.getUrl()`).

## Endpoint

```js
function apiCreateSnapshot(author) {
  try {
    requireAuthor(author);
    const result = BackupService.createSnapshot(author);
    AuditService.log(author, 'Snapshot créé', 'Backup', '', result.name, '');
    return { success: true, name: result.name, url: result.url };
  } catch (e) { return fail(e); }
}
```

Pas de `withLock()` (aucune feuille de données modifiée, seul Drive est touché — verrouiller le Sheet n'apporte rien). Pas de `snapshot` d'undo dans `AuditService.log()` — un snapshot ne s'annule pas (rien à défaire).

## Frontend

Bouton dans 🔧 Outils : `requireIdentity()` puis appel direct (pas de `openConfirmModal`, action non destructive — même pattern que "Réparer l'ordre"). Pendant l'appel : bouton désactivé via `startBtnLoading()` (helper déjà existant, `Index.html:8262`).

Au succès :
- Toast de confirmation (`showToast('Snapshot créé.', 'success')`).
- Zone persistante sous le bouton (`<div id="lastSnapshotInfo">`, vide par défaut) mise à jour avec un vrai lien `<a href="{url}" target="_blank" rel="noopener">Ouvrir le snapshot ↗</a>` + nom du fichier. Persiste jusqu'au prochain snapshot ou rechargement de page — pas dans un toast qui disparaît avant que l'utilisateur ait pu cliquer. Lien réel, jamais de navigation pilotée par script (règle sandbox GAS, `memory/top-des-tops-gas-sandbox-navigation.md`).

## Erreurs

Enveloppe `fail(e)` standard (pattern de tous les autres endpoints `api*`) si Drive/Sheets échoue (quota, permission). Toast d'erreur côté client — pas de tentative silencieuse ni de retry automatique.

## Tests

Extension de `tests/harness.js` avec un faux `DriveApp` en mémoire (sur le principe de `makeSheet()`) :
- Fausses feuilles/fichiers/dossiers : `createFolder(name)`, `getFoldersByName(name)` (itérateur `hasNext`/`next`), `addFile(file)`, `removeFile(file)`, `getParents()`, `getRootFolder()`.
- Faux `spreadsheet.copy(name)` retournant un objet avec `getId()`/`getUrl()`/`getName()`.

Cas couverts :
- Premier usage : le dossier `Snapshots top-des-tops` est créé à côté du fichier source.
- Deuxième usage : le dossier existant est réutilisé, pas de doublon.
- Nom du fichier généré (format date/heure).
- La copie n'a **que** le dossier Snapshots comme parent (retirée de son parent par défaut après `.copy()`).
- `AuditService.log()` reçoit l'action `'Snapshot créé'` avec le nom en `after`.
- `apiCreateSnapshot` sans `author` échoue via `requireAuthor`.

## Hors périmètre

- Rétention/purge automatique des anciens snapshots.
- Programmation automatique (cron) — déclenchement manuel uniquement.
- Restauration depuis un snapshot (l'utilisateur ouvre la copie dans Google Sheets et agit lui-même si besoin).
