# Standardisation et décalage automatique des en-têtes de feuilles (Implementation Plan)

## Contexte & Objectif

Dans Google Sheets, les feuilles créées initialement à la main (`Players`, `Categories`, `History`) n'avaient pas de ligne d'en-tête (la ligne 1 contenait directement le premier enregistrement). Bien que le code applicatif sache lire ces feuilles dès la ligne 1, l'objectif est d'**automatiser la standardisation du Google Sheet lui-même** :
Lorsqu'une feuille ne possède pas de ligne d'en-tête, le système doit automatiquement insérer une ligne en haut (`insertRowBefore(1)`), décalant toutes les données existantes d'un cran vers le bas sans aucune perte, et inscrire les intitulés de colonnes officiels.

---

## Modifs apportées

### Backend (`Code.gs`)
- **Table des en-têtes canoniques** (`CANONICAL_SHEET_HEADERS`) :
  Déclaration des intitulés officiels par feuille (`players`, `categories`, `history`, `notes`, `bareme`, `phrases`, `chat`, `auditLog`, `settings`, `altCategories`, `altHistory`, `autoRules`).
- **Insertion et décalage automatique (`_ensureSheetHeaders`)** :
  Si une feuille contient des données en ligne 1 sans titres, `_ensureSheetHeaders` exécute `sheet.insertRowBefore(1)` et écrit les intitulés officiels en gras à la ligne 1.
- **Intégration transparente** :
  `_readDataRows`, `SettingsService.getEntities`, `BaremeService.getEntries`, `PhrasesService.getAll`, `AltSettingsService.getAltCategories`, `SettingsSheetService.getAll` et `apiRepairOrder` intègrent la détection et la standardisation automatique.

### Tests & Harness (`tests/harness.js` & `tests/headerless-sheets.test.js`)
- `tests/harness.js` : Implémentation de `insertRowBefore(idx)` sur l'objet mock `makeSheet`.
- `tests/headerless-sheets.test.js` : Validation complète (16/16) du décalage propre des lignes et de l'intégrité des données après insertion des titres.
