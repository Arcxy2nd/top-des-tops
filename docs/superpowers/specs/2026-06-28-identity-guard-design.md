# Design — Garde d'identité obligatoire ("Qui suis-je ?")

**Date :** 2026-06-28

## Objectif

Sans identité sélectionnée via le bouton "Qui suis-je ?", toute opération d'écriture dans le Google Sheet est bloquée. L'application passe en mode lecture seule tant que `_whoAmI` est null.

## Comportement au blocage (Option A)

1. Toast d'erreur affiché : `"Sélectionne ton identité avant d'agir."`
2. Le bouton `#whoAmIBtn` reçoit la classe CSS `.pulse` pendant 1,5 s pour attirer l'attention.
3. L'action est annulée (return false).

## Architecture

### Helper central

```javascript
function requireIdentity() {
  if (_whoAmI) return true;
  showToast('Sélectionne ton identité avant d\'agir.', 'error');
  const btn = document.getElementById('whoAmIBtn');
  if (btn) {
    btn.classList.remove('pulse');
    void btn.offsetWidth; // force reflow pour relancer l'animation
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 1500);
  }
  return false;
}
```

### Animation CSS

```css
@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.7); }
  70%  { box-shadow: 0 0 0 10px rgba(var(--accent-rgb), 0.0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.0); }
}
.who-am-i-btn.pulse {
  animation: pulse-ring 0.5s ease-out 3;
}
```

### Opérations bloquées (appel `requireIdentity()` en tête de chaque handler)

| Catégorie | Opérations |
|---|---|
| Lot | `apiAddBulkPlan` |
| Historique | `apiDeleteHistoryEntries`, `apiUpdateHistoryDescription`, `apiUpdateBulkEntries`, `apiUpdateHistoryEntry`, `apiGroupRows`, `apiUngroupLot` |
| Notes | `apiAddNote`, `apiDeleteNote`, `apiEditNote` |
| Barème | `apiAddBaremeEntry`, `apiUpdateBaremeEntry`, `apiDeleteBaremeEntry` |
| Paramètres | `apiManageEntity` (ADD/RENAME/DELETE), `apiSetColor` |
| Phrases | `apiAddPhrase`, `apiUpdatePhrase`, `apiDeletePhrase`, `apiSavePhrasesBatch`, `apiDeletePreset`, `apiRenamePreset`, `apiSetActivePhrasePreset` |
| Outils | `apiFixZeroPoints`, `apiDeleteOrphans`, `apiGroupDistributedLots` |

### Opérations NON bloquées (lectures)

`apiGetSettings`, `apiGetPhrases`, `apiGetTrendData`, `apiGetPlayerTotals`, `apiGetFilteredData`, `apiGetBareme`, `apiGetHistoryPage`, `apiGetAllNotes`, `apiGetActivePhrasePreset`, `apiGetDataHealth`, `apiDetectDistributedLots`

## Ce qui ne change pas

- Le reste du code (`callServer`, rendering, filtres) est inchangé.
- La variable `_whoAmI` reste la seule source de vérité.
- Aucun nouveau state global.

## Critères de succès

- `requireIdentity()` retourne `false` et déclenche toast + pulse si `_whoAmI === null`
- Toutes les opérations write appellent `requireIdentity()` en première ligne
- Les lectures restent accessibles sans identité
- L'animation est relançable (reflow + remove/add class)
