# Durcissement préventif des signatures de callbacks et délégations d'événements (Implementation Plan)

## Contexte & Objectif

L'incident technique `Uncaught TypeError: modal.querySelectorAll is not a function` (corrigé en v3.20.17) a mis en lumière un motif à risque classique en JavaScript natif : lorsqu'une fonction avec paramètre optionnel est passée en callback ou rattachée à un écouteur d'événement (`onclick = fn`, `addEventListener`, `setTimeout`), le navigateur injecte des arguments implicites (comme l'objet `MouseEvent` ou le delta de temporisation).

L'analyse globale du codebase a confirmé qu'aucun autre bug bloquant n'était actif immédiatement. Cependant, plusieurs fonctions clés partageaient des gardes fragiles de type `if (callback) callback();` au lieu de `if (typeof callback === 'function') callback();`, et certaines délégations d'événements s'appuyaient sur `e.target` direct sans `.closest()`.

**Objectif** : Durcir de manière préventive l'ensemble de ces points pour immuniser le frontend contre toute régression ou crash lié au passage d'arguments inattendus.

---

## Modifs apportées

### Frontend (`Index.html`)
- **Sécurisation des invocations de callbacks** :
  - `applyFilters(onDone)` : remplacement des 6 sites `if (onDone) onDone();` par `if (typeof onDone === 'function') onDone();`.
  - `loadEntities(onDone)` : remplacement des 4 sites `if (onDone) onDone();` par `if (typeof onDone === 'function') onDone();`.
  - `loadAppBranding(onDone)` : remplacement de `if (onDone) onDone();` par `if (typeof onDone === 'function') onDone();`.
  - `loadCustomPhrases(callback)` : remplacement de `if (callback) callback();` par `if (typeof callback === 'function') callback();`.
  - `loadAltHistoryMap(callback)` : remplacement de `if (callback) callback();` par `if (typeof callback === 'function') callback();`.
  - `anchorFloating(..., onDetach)` : remplacement de `if (onDetach) onDetach();` par `if (typeof onDetach === 'function') onDetach();`.
- **Sécurisation de la délégation d'événements** :
  - Dans `#trendsScopeToggle` : utilisation de `const btn = e.target.closest('.chart-type-btn'); if (!btn || !btn.dataset.scope) return;` et toggle sur `b === btn`.

### Tests Automatisés
- **`tests/papercuts.test.js`** : Ajout de tests unitaires vérifiant la présence stricte des gardes `typeof === 'function'` sur les fonctions asynchrones et l'utilisation de `.closest()` sur `trendsScopeToggle`.
- **`tests/frontend-guards.test.js`** : Mise à jour de l'assertion pour matcher la garde durcie.
