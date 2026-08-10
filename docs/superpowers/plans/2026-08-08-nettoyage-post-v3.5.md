# Nettoyage post-v3.5 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 15 défauts relevés par la review du diff `6195a53..HEAD` (v3.4.5 → v3.5.3), en refermant les branches Alt laissées à moitié posées, en sécurisant le pipeline de déploiement, et en remettant le code aux conventions de `context.md`.

**Architecture :** Trois axes indépendants. (1) *Backend Alt* — séparer les deux espaces de nommage d'identifiants d'`AltHistory` (index de ligne History vs index de ligne AltHistory) et factoriser l'écriture. (2) *Frontend Alt* — un seul chemin d'écriture native, et un état de constructeur de lot qui survit au changement d'univers. (3) *Pipeline* — rendre le nettoyage de commentaires auto-vérifiant, pour qu'une erreur de scanner casse le build au lieu de blanchir le site.

**Tech Stack :** Google Apps Script (`.gs`), HTML/CSS/JS monofichier (`Index.html`), tests `node:test` sur harness VM local (`tests/harness.js`), déploiement GitHub Actions + `clasp`.

## Global Constraints

Ces règles viennent de `context.md` et s'appliquent à **chaque** tâche.

- **Code en anglais** — variables, fonctions, commentaires dans le code. Les explications hors code sont en français.
- **Pas de classe ES6** — objets littéraux ou IIFE, cohérent avec le reste du codebase.
- **Commentaires uniquement pour le *pourquoi* non évident** — jamais pour décrire ce que le code fait.
- **Aucune constante hardcodée dans la logique** — les valeurs configurables vont en haut du fichier dans un bloc `CONFIG`.
- **Jamais de couleur hexadécimale directe dans le CSS** — toujours une variable CSS.
- **Cible tactile minimum `44px`** (`--tap-min`) sur tout élément interactif.
- **Avatar obligatoire** dès qu'un nom de joueur apparaît dans l'UI. Aucune exception.
- **Identité obligatoire** (`requireIdentity()` client, `requireAuthor()` serveur) avant toute écriture.
- **Journalisation obligatoire** (`AuditService.log()`) pour toute écriture.
- **Aucun `TODO`/`FIXME`/placeholder/fonction vide.**
- **`CHANGELOG.md` mis à jour à chaque changement livré**, deux voix (**Humanisé** + **Technique**) par item.
- **Un seul `git push` à la toute fin** (Task 15). Chaque push déclenche un déploiement des deux cibles (`deploy-targets.json`) — on n'en veut qu'un.
- **Compte GitHub `Arcxy2nd`** — vérifier `gh auth status` avant le push, basculer avec `gh auth switch --user Arcxy2nd` si besoin.

**Commande de vérification après chaque tâche :** `npm run verify` (introduite en Task 1). Toute tâche qui la laisse rouge n'est pas terminée.

---

### Task 1: Porte de vérification syntaxique d'`Index.html`

Le projet n'a aucun test frontend : une erreur de syntaxe dans le bloc `<script>` d'`Index.html` blanchit toute l'application et rien ne l'attrape. C'est exactement ce qui s'est produit en v3.5.0. Toutes les tâches frontend qui suivent ont besoin d'une commande réelle à lancer — c'est celle-ci.

**Files:**
- Create: `tests/check-html-syntax.js`
- Modify: `package.json:6-8`

**Interfaces:**
- Consumes: rien.
- Produces: les scripts npm `check:html` et `verify`. Toutes les tâches suivantes lancent `npm run verify`.

- [ ] **Step 1: Écrire le vérificateur**

Créer `tests/check-html-syntax.js` :

```js
'use strict';

// Index.html is served verbatim by GAS: a syntax error in its inline <script>
// blanks the whole app and no other test in the suite would notice.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'Index.html');
const src = fs.readFileSync(file, 'utf8');
const SCRIPT_RE = /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi;

let found = 0;
let match;
while ((match = SCRIPT_RE.exec(src)) !== null) {
  found++;
  try {
    new vm.Script(match[2], { filename: 'Index.html#script' + found });
  } catch (e) {
    console.error('SyntaxError dans Index.html (bloc script #' + found + ') : ' + e.message);
    process.exit(1);
  }
}

if (!found) {
  console.error('Aucun bloc <script> inline trouve dans Index.html.');
  process.exit(1);
}
console.log('Index.html : ' + found + ' bloc(s) <script> inline, syntaxe OK.');
```

- [ ] **Step 2: Lancer le vérificateur sur le code actuel**

```bash
node tests/check-html-syntax.js
```

Attendu : `Index.html : 1 bloc(s) <script> inline, syntaxe OK.` et code de sortie 0.
Si le résultat est différent, ne pas continuer — c'est que la base de départ est déjà cassée.

- [ ] **Step 3: Vérifier que le vérificateur échoue vraiment sur du code cassé**

```bash
printf '\n<script>function broken( {</script>\n' >> Index.html; node tests/check-html-syntax.js; echo "exit=$?"; git checkout -- Index.html; git diff --stat Index.html
```

Attendu : un message `SyntaxError dans Index.html (bloc script #2)`, puis `exit=1`, puis un `git diff --stat` vide confirmant la restauration.

- [ ] **Step 4: Câbler les scripts npm**

Dans `package.json`, remplacer le bloc `"scripts"` par :

```json
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "check:html": "node tests/check-html-syntax.js",
    "verify": "npm run check:html && npm test"
  },
```

Le glob `tests/*.test.js` ne ramasse pas `check-html-syntax.js` — il n'a pas le suffixe `.test.js`. C'est voulu : c'est un script, pas une suite.

- [ ] **Step 5: Lancer la vérification complète**

```bash
npm run verify
```

Attendu : le message de syntaxe OK, puis `tests 119 / pass 119 / fail 0`.

- [ ] **Step 6: Commit**

```bash
git add tests/check-html-syntax.js package.json && git commit -m "test: add Index.html inline script syntax gate"
```

---

### Task 2: Séparer les espaces de nommage de suppression d'une entrée Alt

`unlinkHistoryRowsFromAltCategory` matche l'identifiant reçu contre **deux** colonnes différentes : `refHistoryRowId` (index de ligne *History*) et l'index de ligne *AltHistory*. Depuis que les entrées natives existent (`refHistoryRowId` vide), le client s'appuie sur ce second matching — et une collision entre les deux numérotations supprime définitivement une entrée sans source.

**Files:**
- Modify: `Code.gs:1198-1228` (`unlinkHistoryRowsFromAltCategory`)
- Modify: `Code.gs:1163` (insérer `deleteNativeAltEntry` juste après `addNativeAltEntries`)
- Modify: `Code.gs:2296` (insérer `apiDeleteNativeAltEntry` après `apiAppendAltNativeBatch`)
- Modify: `tests/harness.js:157-165` (liste d'exposition)
- Test: `tests/alt-points-management.test.js`

**Interfaces:**
- Consumes: `AltStorageService._sheet()`, `ConfigService.clearCache()`, `requireAuthor()`, `withLock()`, `AuditService.log()`, `fail()`.
- Produces:
  - `AltStorageService.deleteNativeAltEntry(rowIndex, altCategory, guard) -> 1` — lève une `Error` sinon. `guard` est `{ player: string, points: number }` ou `null`.
  - `apiDeleteNativeAltEntry(author, altCategory, rowIndex, guard) -> { success: true, count: 1 }` ou `{ success: false, error }`.
  - `unlinkHistoryRowsFromAltCategory` ne matche plus que la colonne `refHistoryRowId`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `tests/alt-points-management.test.js` :

```js
test('unlinkHistoryRowsFromAltCategory ignores AltHistory row indexes', () => {
  const gas = loadGas();
  // Row 2 of AltHistory is native (no ref). Unlinking History row 2 must not touch it.
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 7, 'Native', '', '', 'Admin'],
    ['2026-08-01', 'Bob', 'Alt 1', 3, 'Linked', '2', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  const unlinked = gas.AltStorageService.unlinkHistoryRowsFromAltCategory([2], 'Alt 1', 'Admin');
  assert.strictEqual(unlinked, 1);

  const remaining = gas.AltStorageService.getAltLogs();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].description, 'Native');
});

test('deleteNativeAltEntry removes a native row and refuses a linked one', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 7, 'Native', '', '', 'Admin'],
    ['2026-08-01', 'Bob', 'Alt 1', 3, 'Linked', '2', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  assert.throws(
    () => gas.AltStorageService.deleteNativeAltEntry(3, 'Alt 1', null),
    /liee a l'historique principal|liée à l'historique principal/
  );

  const count = gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Alice', points: 7 });
  assert.strictEqual(count, 1);

  const remaining = gas.AltStorageService.getAltLogs();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].description, 'Linked');
});

test('deleteNativeAltEntry refuses when the guard no longer matches the row', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 7, 'Native', '', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  assert.throws(
    () => gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Bob', points: 7 }),
    /rechargez la liste/
  );
  assert.throws(
    () => gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 2', { player: 'Alice', points: 7 }),
    /n'appartient pas/
  );
  assert.strictEqual(gas.AltStorageService.getAltLogs().length, 1);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --test-name-pattern="AltHistory row indexes|deleteNativeAltEntry"
```

Attendu : 3 échecs — le premier sur `unlinked` valant 2 au lieu de 1, les deux autres sur `gas.AltStorageService.deleteNativeAltEntry is not a function`.

- [ ] **Step 3: Restreindre le matching de `unlinkHistoryRowsFromAltCategory`**

Dans `Code.gs`, remplacer la ligne 1213 :

```js
      const matchesRef = targetRefIds.has(rowRefId) || targetRefIds.has(altRowIndex.toString());
```

par :

```js
      // Match the History row id column only: AltHistory row indexes are a
      // different numbering, and accepting both deletes unrelated native rows.
      const matchesRef = !!rowRefId && targetRefIds.has(rowRefId);
```

- [ ] **Step 4: Ajouter `deleteNativeAltEntry`**

Dans `Code.gs`, juste après la fermeture de `addNativeAltEntries` (la ligne `},` en 1163) et avant `linkHistoryRowsToAltCategory`, insérer :

```js
  /**
   * Deletes one native AltHistory row (empty refHistoryRowId) by its sheet row
   * index. The guard re-checks the row content because the index was captured
   * when the manager modal rendered: another write may have shifted rows since.
   */
  deleteNativeAltEntry(rowIndex, altCategory, guard) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error('Ligne invalide.');
    const sheet = this._sheet();
    if (idx > sheet.getLastRow()) throw new Error("Cette entrée n'existe plus. Rechargez la liste.");

    const row = sheet.getRange(idx, 1, 1, 8).getValues()[0];
    if (row[5] && row[5].toString().trim()) {
      throw new Error("Cette entrée est liée à l'historique principal : utilisez « Retirer ».");
    }
    if (altCategory && (row[2] ? row[2].toString() : '') !== altCategory) {
      throw new Error("Cette entrée n'appartient pas à ce Top Alternatif.");
    }
    if (guard) {
      if (guard.player && (row[1] ? row[1].toString() : '') !== guard.player) {
        throw new Error("L'entrée a changé depuis l'affichage, rechargez la liste.");
      }
      if (guard.points != null && parseInt(row[3], 10) !== parseInt(guard.points, 10)) {
        throw new Error("L'entrée a changé depuis l'affichage, rechargez la liste.");
      }
    }

    sheet.deleteRow(idx);
    ConfigService.clearCache();
    return 1;
  },
```

- [ ] **Step 5: Ajouter l'endpoint**

Dans `Code.gs`, juste après la fermeture de `apiAppendAltNativeBatch` et avant `function apiGetAltCategories()`, insérer :

```js
function apiDeleteNativeAltEntry(author, altCategory, rowIndex, guard) {
  try {
    requireAuthor(author);
    return withLock(function() {
      const count = AltStorageService.deleteNativeAltEntry(rowIndex, altCategory, guard);
      AuditService.log(author, 'Suppression entrée Alt native', altCategory || '—',
        'Entrée native supprimée définitivement (ligne ' + rowIndex + ')');
      return { success: true, count: count };
    });
  } catch(e) { return fail(e); }
}
```

- [ ] **Step 6: Exposer les nouveaux symboles au harness**

Dans `tests/harness.js`, dans la chaîne `epilogue`, à la suite des autres entrées Alt gardées par `typeof`, ajouter :

```js
    'apiAppendAltNativeBatch: (typeof apiAppendAltNativeBatch === "undefined" ? undefined : apiAppendAltNativeBatch), ' +
    'apiDeleteNativeAltEntry: (typeof apiDeleteNativeAltEntry === "undefined" ? undefined : apiDeleteNativeAltEntry), ' +
```

Avant d'ajouter, vérifier que `apiAppendAltNativeBatch` n'y est pas déjà :

```bash
grep -n "apiAppendAltNativeBatch" tests/harness.js
```

S'il est déjà présent, n'ajouter que la ligne `apiDeleteNativeAltEntry`.

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

```bash
npm run verify
```

Attendu : `pass 122 / fail 0` (les 119 existants + les 3 nouveaux). Le test existant `unlinkHistoryRowsFromAltCategory removes alt entries without touching main history` doit rester vert — il matche sur la colonne ref (`'2'`), pas sur l'index.

- [ ] **Step 8: Commit**

```bash
git add Code.gs tests/harness.js tests/alt-points-management.test.js && git commit -m "fix(alt): stop matching AltHistory row indexes when unlinking, add native delete endpoint"
```

---

### Task 3: Factoriser la construction de ligne Alt et valider les dates

`addAltEntries` et `addNativeAltEntries` construisent chacune le même tableau de 8 colonnes. Par ailleurs `new Date(e.date)` n'est jamais validé : une date invalide part telle quelle dans la feuille, ce qui contredit la règle Fail Fast de `context.md` §8.

**Files:**
- Modify: `Code.gs:1110-1163` (`addAltEntries`, `addNativeAltEntries`)
- Test: `tests/alt-points-management.test.js`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `AltStorageService._buildAltRow(entry) -> Array(8)`, méthode privée utilisée par `addAltEntries` et `addNativeAltEntries`. Signature de `addNativeAltEntries` inchangée.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/alt-points-management.test.js` :

```js
test('addNativeAltEntries writes an empty refHistoryRowId and flags the row as native', () => {
  const gas = loadGas();
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ altHistory });
  gas.SettingsService.getEntities = () => [{ name: 'Alice' }];
  gas.AltSettingsService.getAltCategories = () => [{ name: 'Alt 1' }];

  const count = gas.AltStorageService.addNativeAltEntries([
    { player: 'Alice', altCategory: 'Alt 1', points: 5, date: '2026-08-01', description: 'Direct', saiseur: 'Alice' }
  ]);
  assert.strictEqual(count, 1);

  const logs = gas.AltStorageService.getAltLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].refHistoryRowId, '');
  assert.strictEqual(logs[0].isNative, true);
  assert.strictEqual(logs[0].points, 5);
});

test('addNativeAltEntries rejects invalid player, alt category, points and date', () => {
  const gas = loadGas();
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ altHistory });
  gas.SettingsService.getEntities = () => [{ name: 'Alice' }];
  gas.AltSettingsService.getAltCategories = () => [{ name: 'Alt 1' }];

  const base = { player: 'Alice', altCategory: 'Alt 1', points: 5, date: '2026-08-01' };
  assert.throws(() => gas.AltStorageService.addNativeAltEntries([Object.assign({}, base, { player: 'Ghost' })]), /Joueur invalide/);
  assert.throws(() => gas.AltStorageService.addNativeAltEntries([Object.assign({}, base, { altCategory: 'Nope' })]), /Top Alternatif invalide/);
  assert.throws(() => gas.AltStorageService.addNativeAltEntries([Object.assign({}, base, { points: 0 })]), /points doivent/);
  assert.throws(() => gas.AltStorageService.addNativeAltEntries([Object.assign({}, base, { date: 'pas-une-date' })]), /Date invalide/);

  // Nothing was written: validation runs before the single setValues() call.
  assert.strictEqual(gas.AltStorageService.getAltLogs().length, 0);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --test-name-pattern="addNativeAltEntries"
```

Attendu : le premier test échoue potentiellement sur `isNative`, le second échoue sur `/Date invalide/` (aucune exception levée aujourd'hui).

- [ ] **Step 3: Extraire le constructeur de ligne**

Dans `Code.gs`, juste avant `addAltEntries`, insérer :

```js
  _buildAltRow(entry) {
    return [
      entry.date instanceof Date ? entry.date : (entry.date ? new Date(entry.date) : new Date()),
      entry.player,
      entry.category,
      parseInt(entry.points, 10) || 0,
      entry.description || '',
      entry.refHistoryRowId ? entry.refHistoryRowId.toString() : '',
      entry.groupId || '',
      entry.saiseur || ''
    ];
  },
```

- [ ] **Step 4: Faire consommer le constructeur par `addAltEntries`**

Remplacer le corps de `addAltEntries` par :

```js
  addAltEntries(entries) {
    if (!entries || !entries.length) return;
    const sheet = this._sheet();
    const rows = entries.map(e => this._buildAltRow(e));
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
    ConfigService.clearCache();
  },
```

- [ ] **Step 5: Faire consommer le constructeur par `addNativeAltEntries` et valider la date**

Remplacer le corps de `addNativeAltEntries` par :

```js
  addNativeAltEntries(entries) {
    if (!entries || !entries.length) return 0;
    const allPlayers = SettingsService.getEntities('Players').map(p => p.name);
    const allAltCats = AltSettingsService.getAltCategories().map(c => c.name);
    const sheet      = this._sheet();

    // Validate everything before the single setValues(): a throw halfway must
    // leave the sheet untouched, not half-written.
    const rows = entries.map(e => {
      if (!e.player || !allPlayers.includes(e.player)) throw new Error('Joueur invalide : ' + e.player);
      if (!e.altCategory || !allAltCats.includes(e.altCategory)) throw new Error('Top Alternatif invalide : ' + e.altCategory);
      const pts = parseInt(e.points, 10);
      if (isNaN(pts) || pts < 1) throw new Error('Les points doivent être ≥ 1.');
      const targetDate = e.date ? new Date(e.date) : new Date();
      if (isNaN(targetDate.getTime())) throw new Error('Date invalide : ' + e.date);
      return this._buildAltRow({
        date: targetDate,
        player: e.player,
        category: e.altCategory,
        points: pts,
        description: e.description,
        refHistoryRowId: '',   // empty marks the entry as native
        groupId: '',
        saiseur: e.saiseur
      });
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
    ConfigService.clearCache();
    return rows.length;
  },
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

```bash
npm run verify
```

Attendu : `pass 124 / fail 0`.

- [ ] **Step 7: Commit**

```bash
git add Code.gs tests/alt-points-management.test.js && git commit -m "refactor(alt): share the AltHistory row builder, fail fast on invalid dates"
```

---

### Task 4: Brancher la suppression d'une entrée native sur le bon endpoint

Le gestionnaire de Top Alternatif émet déjà `data-native` sur le bouton ❌ Retirer, mais le handler ne le lit jamais : les entrées natives passent par l'endpoint de désaffectation, qui les traite comme des liaisons à défaire. Le libellé, la confirmation et l'audit mentent tous sur ce qui se passe réellement.

**Files:**
- Modify: `Index.html:9008` (calcul de `isNative`)
- Modify: `Index.html:9022` (markup du bouton)
- Modify: `Index.html:9036-9048` (handler)

**Interfaces:**
- Consumes: `apiDeleteNativeAltEntry(author, altCategory, rowIndex, guard)` de la Task 2 ; le champ `isNative` produit par `_parseAltHistoryRow`.
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Vérifier que `isNative` arrive bien jusqu'au client**

```bash
grep -n "apiGetAltCategoryDetails" Code.gs | head -3
```

Puis lire le corps de la fonction et confirmer qu'elle renvoie des entrées issues de `_parseAltHistoryRow` (donc porteuses de `isNative`). Si ce n'est pas le cas, garder `const isNative = !e.refHistoryRowId;` à l'étape suivante au lieu de `e.isNative`, et le noter dans le message de commit.

- [ ] **Step 2: Consommer le champ serveur plutôt que le recalculer**

Dans `Index.html`, remplacer la ligne 9008 :

```js
          const isNative = !e.refHistoryRowId;
```

par :

```js
          const isNative = !!e.isNative;
```

- [ ] **Step 3: Enrichir le bouton et distinguer son libellé**

Remplacer la ligne 9022 :

```js
                <button class="small danger unlink-single-btn" data-ref="${escapeHtml(e.refHistoryRowId || String(e.rowIndex))}" data-native="${isNative ? '1' : '0'}">❌ Retirer</button>
```

par :

```js
                <button class="small danger unlink-single-btn"
                  data-ref="${escapeHtml(e.refHistoryRowId || String(e.rowIndex))}"
                  data-native="${isNative ? '1' : '0'}"
                  data-player="${escapeHtml(e.player)}"
                  data-points="${e.points}">${isNative ? '🗑️ Supprimer' : '❌ Retirer'}</button>
```

- [ ] **Step 4: Router le handler selon la nature de l'entrée**

Remplacer le bloc des lignes 9036-9048 par :

```js
        content.querySelectorAll('.unlink-single-btn').forEach(btn => {
          btn.onclick = () => {
            const refId    = btn.dataset.ref;
            const isNative = btn.dataset.native === '1';
            const message  = isNative
              ? `Supprimer définitivement cette entrée ? Elle n'existe que dans le Top Alternatif "${altCategoryName}", aucune copie ne subsiste dans l'historique principal.`
              : `Retirer cette entrée du Top Alternatif "${altCategoryName}" ?`;
            openConfirmModal(message, () => {
              const fn   = isNative ? 'apiDeleteNativeAltEntry' : 'apiUnlinkHistoryRowsFromAltCategory';
              const args = isNative
                ? [_whoAmI, altCategoryName, refId, { player: btn.dataset.player, points: parseInt(btn.dataset.points, 10) }]
                : [_whoAmI, [refId], altCategoryName];
              const label = isNative ? 'Suppression entrée Alt native' : 'Désaffectation Top Alternatif';
              callServer(fn, args, res => {
                if (res.success) {
                  showToast(isNative ? 'Entrée Alt supprimée définitivement.' : 'Point retiré du Top Alternatif.', 'success');
                  loadAltHistoryMap(() => openAltCategoryManagerModal(altCategoryName));
                }
              }, label);
            });
          };
        });
```

- [ ] **Step 5: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 124 / fail 0`.

- [ ] **Step 6: Commit**

```bash
git add Index.html && git commit -m "fix(alt): delete native entries through their own endpoint with an honest confirmation"
```

---

### Task 5: Chemin d'écriture native unique et validation réelle du lot Alt

Dans la branche Alt de `submitBulk`, la validation des points fait `return` à l'intérieur d'un `forEach` : la ligne fautive est **silencieusement écartée** et le reste du lot part quand même. La branche Main juste en dessous fait ça correctement, avec un `for...of` après collecte. On corrige, et on en profite pour créer le point d'écriture unique que la modale rapide utilisera en Task 8.

**Files:**
- Modify: `Index.html:13073-13106` (branche Alt de `submitBulk`)
- Modify: `Index.html` — insérer `saveNativeAltEntries` juste avant `function submitBulk()`

**Interfaces:**
- Consumes: `apiAppendAltNativeBatch(author, entries)`, `requireIdentity()`, `startBtnLoading()`, `showToast()`, `applyFilters()`, `refreshDashboardStats()`, `activeDashboardUniverse`.
- Produces: `saveNativeAltEntries(entries, btn, onSuccess)` — utilisé par la Task 8. `entries` est un tableau de `{ player, altCategory, points, date, description, saiseur }`.

- [ ] **Step 1: Ajouter le point d'écriture unique**

Dans `Index.html`, juste avant la ligne `function submitBulk() {`, insérer :

```js
  /**
   * Single client-side write path for native Alt entries. The quick-add modal and
   * the Alt branch of the lot builder both go through it so the server call, the
   * toast and the post-write refresh cannot drift apart between the two surfaces.
   */
  function saveNativeAltEntries(entries, btn, onSuccess) {
    if (!requireIdentity()) return;
    const restore = startBtnLoading(btn, 'Enregistrement…');
    callServer('apiAppendAltNativeBatch', [_whoAmI || '', entries], res => {
      restore();
      if (!res.success) return;
      const total = entries.reduce((sum, e) => sum + e.points, 0);
      showToast(`⭐ ${total} pt(s) enregistré(s) dans les Tops Alternatifs !`, 'success');
      applyFilters();
      if (activeDashboardUniverse === 'alt') refreshDashboardStats();
      if (onSuccess) onSuccess(res);
    }, 'Saisie native Alt', () => { restore(); });
  }
```

- [ ] **Step 2: Réécrire la branche Alt de `submitBulk`**

Remplacer intégralement le bloc `if (activeLotUniverse === 'alt') { ... return; }` (lignes 13073-13106) par :

```js
    if (activeLotUniverse === 'alt') {
      if (!cachedAltCategories.length) {
        showToast('Aucun Top Alternatif configuré. Ajoutez-en dans Paramètres → ⭐ Tops Alternatifs.', 'error');
        return;
      }
      const altItems = [];
      rows.forEach(r => {
        const pSel   = r.querySelector('.p-sel');
        const cSel   = r.querySelector('.c-sel'); // in alt mode c-sel holds the alt category
        const ptsEl  = r.querySelector('.custom-pts-in');
        const dStart = r.querySelector('.d-start');
        const descEl = r.querySelector('.desc-in');
        if (!pSel || !cSel || !ptsEl || !dStart) return;
        altItems.push({
          player:      pSel.value,
          altCategory: cSel.value,
          points:      parseInt(ptsEl.value, 10),
          date:        dStart.value || toDateStr(new Date()),
          description: descEl ? descEl.value.trim() : '',
          saiseur:     _whoAmI || ''
        });
      });
      if (!altItems.length) { showToast('Ajoutez au moins une ligne.', 'error'); return; }

      // Validate after collection so an invalid row aborts the whole batch
      // instead of being dropped while the rest is written.
      for (const item of altItems) {
        if (!item.player)      { showToast('Joueur manquant sur une ligne.', 'error'); return; }
        if (!item.altCategory) { showToast('Top Alternatif manquant sur une ligne.', 'error'); return; }
        if (isNaN(item.points) || item.points < 1) {
          showToast('Points invalides sur une ligne (≥ 1 requis).', 'error');
          return;
        }
      }

      const btn = document.getElementById('submitLotBtn');
      saveNativeAltEntries(altItems, btn, () => {
        flashSaved(btn);
        document.getElementById('entryContainer').innerHTML = '';
        addEntryRow();
        updateLotSummary();
      });
      return;
    }
```

- [ ] **Step 3: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 124 / fail 0`.

- [ ] **Step 4: Vérification manuelle dans l'app**

Invoquer `/verify`. Dans l'onglet ✍️ Saisir un Lot, basculer en ⭐ Tops Alternatifs, créer 3 lignes, vider le champ points de la 2ᵉ, cliquer Inscrire.
Attendu : le toast « Points invalides sur une ligne » s'affiche et **aucune** entrée n'est écrite. Vérifier dans le gestionnaire du Top Alternatif concerné qu'il n'y a pas de nouvelle ligne.

- [ ] **Step 5: Commit**

```bash
git add Index.html && git commit -m "fix(alt): abort the whole Alt batch on an invalid row instead of dropping it"
```

---

### Task 6: Garde et visuels d'initialisation de ligne par univers

`addEntryRow` refuse de créer une ligne si `cachedCategories` est vide, même en mode Alt où seuls les Tops Alternatifs comptent — le constructeur devient inutilisable. Et l'initialisation appelle `categoryColor()`/`refreshBaremeForTop()` avec le nom du Top **alternatif**, alors que `onChange` branche correctement selon l'univers.

**Files:**
- Modify: `Index.html:5100-5110` (bloc CONFIG en tête de script)
- Modify: `Index.html:12089-12098` (garde de `addEntryRow`)
- Modify: `Index.html:12915-12925` (`onChange` du RichSelect catégorie)
- Modify: `Index.html:12931-12933` (visuels d'initialisation)
- Modify: `Index.html` — insérer `applyRowCategoryVisuals` juste avant `function addEntryRow(`

**Interfaces:**
- Consumes: `cachedAltCategories`, `cachedCategories`, `categoryColor()`, `refreshBaremeForTop()`, `activeLotUniverse`.
- Produces:
  - `ALT_FALLBACK_COLOR` — constante JS, couleur de repli d'un Top Alternatif sans couleur. Consommée par les Tasks 7 et 10.
  - `applyRowCategoryVisuals(div, categoryName, isAlt)` — pose `--row-accent` et, en univers principal seulement, rafraîchit le barème.
  - `isAltRow` — constante locale à `addEntryRow`, vraie quand la ligne appartient à l'univers Alt. Consommée par la Task 7.

**Avant de commencer :** vérifier qu'`addEntryRow` ne déclare pas déjà un symbole nommé `isAltRow` ou `requiredTops` (`grep -n "isAltRow\|requiredTops" Index.html` → doit être vide).

- [ ] **Step 1: Déclarer la constante de repli**

Dans `Index.html`, dans le bloc d'état global (juste après `let activeLotUniverse = 'main';`), insérer :

```js
  // ── CONFIG ───────────────────────────────────────────────────────────
  // Fallback accent for an Alt Top with no colour set in the Sheet. Mirrors the
  // --alt-accent CSS variable; both must stay in sync.
  const ALT_FALLBACK_COLOR = '#ffd166';
```

- [ ] **Step 2: Extraire les visuels de ligne**

Juste avant `function addEntryRow(preset, animateFromBtn) {`, insérer :

```js
  function applyRowCategoryVisuals(div, categoryName, isAlt) {
    if (isAlt) {
      const ac = cachedAltCategories.find(c => c.name === categoryName);
      div.style.setProperty('--row-accent', (ac && ac.color) || ALT_FALLBACK_COLOR);
      return;
    }
    div.style.setProperty('--row-accent', categoryColor(categoryName || ''));
    refreshBaremeForTop(categoryName || '');
  }
```

- [ ] **Step 3: Rendre la garde consciente de l'univers**

Remplacer le bloc des lignes 12089-12098 :

```js
    if (!cachedPlayers.length || !cachedCategories.length) {
      if (!container.querySelector('.empty-illustration')) {
        const p = document.createElement('div');
        p.className = 'empty-illustration';
        p.innerHTML = '<div class="emoji">🎮</div><div class="msg">Ajoutez d\'abord des joueurs et des Tops dans <strong>Paramètres</strong>.</div>';
        container.appendChild(p);
      }
      return;
    }
```

par :

```js
    const isAltRow = activeLotUniverse === 'alt';
    const requiredTops = isAltRow ? cachedAltCategories : cachedCategories;
    if (!cachedPlayers.length || !requiredTops.length) {
      if (!container.querySelector('.empty-illustration')) {
        const p = document.createElement('div');
        p.className = 'empty-illustration';
        p.innerHTML = isAltRow
          ? '<div class="emoji">⭐</div><div class="msg">Ajoutez d\'abord des joueurs et des <strong>Tops Alternatifs</strong> dans <strong>Paramètres</strong>.</div>'
          : '<div class="emoji">🎮</div><div class="msg">Ajoutez d\'abord des joueurs et des Tops dans <strong>Paramètres</strong>.</div>';
        container.appendChild(p);
      }
      return;
    }
```

- [ ] **Step 4: Faire consommer le helper par `onChange`**

Remplacer le corps du `onChange` du RichSelect catégorie (lignes 12915-12925) :

```js
      onChange: function(v) {
        cSel.value = v || '';
        if (activeLotUniverse === 'alt') {
          const ac = cachedAltCategories.find(c => c.name === v);
          div.style.setProperty('--row-accent', ac ? (ac.color || '#ffd166') : '#ffd166');
        } else {
          const col = categoryColor(v || '');
          div.style.setProperty('--row-accent', col);
          refreshBaremeForTop(v || '');
        }
        refreshHistVisibility();
        updateLotSummary();
      }
```

par :

```js
      onChange: function(v) {
        cSel.value = v || '';
        applyRowCategoryVisuals(div, v || '', isAltRow);
        if (isAltRow) div.dataset.altUniverseCategory = v || '';
        else          div.dataset.mainCategory        = v || '';
        refreshHistVisibility();
        updateLotSummary();
      }
```

- [ ] **Step 5: Faire consommer le helper par l'initialisation**

Remplacer les lignes 12931-12933 :

```js
    const initCatCol = categoryColor(initCategory);
    div.style.setProperty('--row-accent', initCatCol);
    refreshBaremeForTop(initCategory);
```

par :

```js
    applyRowCategoryVisuals(div, initCatValue, isAltRow);
```

- [ ] **Step 6: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 124 / fail 0`.

- [ ] **Step 7: Vérification manuelle dans l'app**

Invoquer `/verify`. En mode ⭐ Tops Alternatifs, créer une ligne et vérifier que la barre d'accent de la ligne prend bien la couleur du Top Alternatif choisi **dès la création**, sans avoir à re-sélectionner. Vérifier aussi que le panneau de raccourcis barème ne se remplit pas de règles étrangères.

- [ ] **Step 8: Commit**

```bash
git add Index.html && git commit -m "fix(alt): branch row guard and initial visuals on the active lot universe"
```

---

### Task 7: Changement d'univers non destructif dans le constructeur de lot

`setLotUniverse` reconstruit toutes les lignes à partir d'un preset qui copie la valeur de `.c-sel` telle quelle. En passant Alt → Principal, le nom d'un Top **Alternatif** atterrit dans une ligne principale ; en passant Principal → Alt, toutes les lignes sont écrasées par le premier Top Alternatif.

**Files:**
- Modify: `Index.html:12877-12912` (résolution de la catégorie initiale dans `addEntryRow`)
- Modify: `Index.html:15713-15748` (`setLotUniverse`)

**Interfaces:**
- Consumes: `applyRowCategoryVisuals` (Task 6), `div.dataset.mainCategory` / `div.dataset.altUniverseCategory` (Task 6, Step 4).
- Produces: le preset accepté par `addEntryRow` porte désormais `mainCategory` et `altUniverseCategory` en plus des clés existantes (`player`, `customPts`, `date`, `description`, `isAlt`, `altCategory`).

**Note importante sur les noms de clés :** `preset.altCategory` et `preset.isAlt` désignent déjà, dans le code existant (ligne 12934), le **sélecteur Alt par ligne** de l'univers principal. Ne pas réutiliser ces clés pour la catégorie de l'univers Alt — d'où `altUniverseCategory`.

- [ ] **Step 1: Mémoriser les deux catégories sur la ligne**

Dans `addEntryRow`, remplacer le bloc des lignes 12906-12909 :

```js
    const initCatValue = activeLotUniverse === 'alt'
      ? ((preset && preset.category) || (cachedAltCategories[0] && cachedAltCategories[0].name) || '')
      : initCategory;
    cSel.value = initCatValue;
```

par :

```js
    // Both universes' choices ride along on the row so switching back and forth
    // is lossless: .c-sel can only hold the one currently displayed.
    const carriedMain = (preset && preset.mainCategory) || initCategory || '';
    const carriedAlt  = (preset && preset.altUniverseCategory)
      || (cachedAltCategories[0] && cachedAltCategories[0].name) || '';
    div.dataset.mainCategory        = carriedMain;
    div.dataset.altUniverseCategory = carriedAlt;

    const initCatValue = isAltRow ? carriedAlt : carriedMain;
    cSel.value = initCatValue;
```

- [ ] **Step 2: Reconstruire les presets sans perte dans `setLotUniverse`**

`setLotUniverse` assigne `activeLotUniverse = mode;` en toute première ligne, ce qui rend impossible de savoir de quel univers on vient. Le nouvel ordre lit d'abord les lignes existantes, puis bascule l'état, puis reconstruit. Remplacer **toute la fonction** `setLotUniverse` par :

```js
      function setLotUniverse(mode) {
        const isAlt = mode === 'alt';
        if (activeLotUniverse === mode) return;

        // Read the rows while activeLotUniverse still names the universe they
        // were built for: .c-sel holds that universe's category, the dataset
        // holds the other one.
        const wasAlt = activeLotUniverse === 'alt';
        const container = document.getElementById('entryContainer');
        const presets = [];
        container.querySelectorAll('.entry-row').forEach(r => {
          const pSel   = r.querySelector('.p-sel');
          const cSel   = r.querySelector('.c-sel');
          const ptsEl  = r.querySelector('.custom-pts-in');
          const dStart = r.querySelector('.d-start');
          const descEl = r.querySelector('.desc-in');
          const altCb  = r.querySelector('.row-alt-cb');
          const altSel = r.querySelector('.row-alt-select');
          presets.push({
            player: pSel ? pSel.value : '',
            mainCategory:        wasAlt ? (r.dataset.mainCategory || '') : (cSel ? cSel.value : ''),
            altUniverseCategory: wasAlt ? (cSel ? cSel.value : '')       : (r.dataset.altUniverseCategory || ''),
            // Row-level Alt picker (main universe only): its DOM is merely hidden
            // in Alt mode, so its state survives and is worth carrying over.
            isAlt: !!(altCb && altCb.checked),
            altCategory: altSel ? altSel.value : '',
            customPts: ptsEl ? ptsEl.value : '1',
            date: dStart ? dStart.value : toDateStr(new Date()),
            description: descEl ? descEl.value : ''
          });
        });

        activeLotUniverse = mode;
        lotMainBtn.classList.toggle('active', !isAlt);
        lotAltBtn.classList.toggle('active',  isAlt);
        if (lotHint) lotHint.style.display = isAlt ? '' : 'none';
        if (submitBtn) submitBtn.textContent = isAlt ? '⭐ Inscrire dans les Tops Alternatifs' : '✓ Inscrire le lot';
        if (batchHeader) {
          const topHeader = batchHeader.children[1];
          if (topHeader) topHeader.textContent = isAlt ? 'Top Alternatif' : 'Top';
        }

        container.innerHTML = '';
        if (presets.length) presets.forEach(p => addEntryRow(p));
        else addEntryRow();
        updateLotSummary();
      }
```

Le `if (activeLotUniverse === mode) return;` est nouveau : sans lui, un double clic sur le bouton déjà actif reconstruit les lignes pour rien.

- [ ] **Step 3: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 124 / fail 0`.

- [ ] **Step 4: Vérification manuelle dans l'app**

Invoquer `/verify`. Test de l'aller-retour :
1. Mode Principal, créer 2 lignes avec deux Tops principaux **différents**, cocher le sélecteur Alt de la 1ʳᵉ ligne et lui choisir un Top Alternatif.
2. Basculer en Alt, choisir deux Tops Alternatifs différents.
3. Rebasculer en Principal.
Attendu : les deux Tops principaux d'origine sont revenus, distincts, et le sélecteur Alt de la 1ʳᵉ ligne est toujours coché sur le bon Top Alternatif.
4. Rebasculer en Alt : les deux Tops Alternatifs choisis à l'étape 2 sont revenus, distincts.

- [ ] **Step 5: Commit**

```bash
git add Index.html && git commit -m "fix(alt): keep both universes' category choices across a lot universe switch"
```

---

### Task 8: Modale de saisie rapide sur RichSelect (avatars) et chemin unique

La modale ⭐ Saisir Alt liste les joueurs dans un `<select>` nu, sans avatar — `context.md` §7 l'interdit sans exception. Elle refait aussi sa propre logique d'appel serveur au lieu d'utiliser `saveNativeAltEntries`.

**Files:**
- Modify: `Index.html:8865-8940` (`openAltNativeQuickAddModal`)

**Interfaces:**
- Consumes: `buildRichSelect({ type, value, onChange })` avec `type` valant `'player'` ou `'altCategory'` ; `saveNativeAltEntries` (Task 5) ; `ALT_FALLBACK_COLOR` (Task 6).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Remplacer le markup des deux sélecteurs**

Dans `openAltNativeQuickAddModal`, supprimer les variables `altOpts` et `playerOpts` (elles construisaient les `<option>`), puis remplacer les deux blocs `<div><label…><select id="qaPlayerSel"…>…</select></div>` et `<div><label…><select id="qaAltCatSel"…>…</select></div>` par :

```html
        <div>
          <label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">Joueur</label>
          <div id="qaPlayerHost" class="rs-host qa-field"></div>
        </div>
        <div>
          <label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">Top Alternatif</label>
          <div id="qaAltCatHost" class="rs-host qa-field"></div>
        </div>
```

- [ ] **Step 2: Monter les RichSelect et suivre leur valeur**

Juste après `document.getElementById('modalBackdrop').style.display = 'flex';`, insérer :

```js
    let qaPlayer = (cachedPlayers[0] && cachedPlayers[0].name) || '';
    let qaAltCat = prefillAltCategory || (cachedAltCategories[0] && cachedAltCategories[0].name) || '';

    document.getElementById('qaPlayerHost').appendChild(buildRichSelect({
      type: 'player', value: qaPlayer, onChange: v => { qaPlayer = v || ''; }
    }));
    document.getElementById('qaAltCatHost').appendChild(buildRichSelect({
      type: 'altCategory', value: qaAltCat, onChange: v => { qaAltCat = v || ''; }
    }));
```

- [ ] **Step 3: Router la confirmation par le chemin unique**

Remplacer le handler `document.getElementById('qaConfirmBtn').onclick = () => { ... };` par :

```js
    document.getElementById('qaConfirmBtn').onclick = () => {
      const pts  = parseInt(document.getElementById('qaPtsInput').value, 10);
      const date = document.getElementById('qaDateInput').value || today;
      const desc = document.getElementById('qaDescInput').value.trim();

      if (!qaPlayer)             { showToast('Joueur requis.', 'error'); return; }
      if (!qaAltCat)             { showToast('Top Alternatif requis.', 'error'); return; }
      if (isNaN(pts) || pts < 1) { showToast('Points invalides (≥ 1 requis).', 'error'); return; }

      const btn = document.getElementById('qaConfirmBtn');
      saveNativeAltEntries(
        [{ player: qaPlayer, altCategory: qaAltCat, points: pts, date: date, description: desc, saiseur: _whoAmI || '' }],
        btn,
        () => closeModal()
      );
    };
```

- [ ] **Step 4: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 124 / fail 0`.

- [ ] **Step 5: Vérification manuelle dans l'app**

Invoquer `/verify`. Dashboard → ⭐ Tops Alternatifs → ＋ Saisir Alt.
Attendu : le sélecteur Joueur affiche l'avatar de chaque joueur, le sélecteur Top Alternatif affiche l'emoji et la pastille de couleur. Enregistrer un point et vérifier que les cards Records / Tendances se mettent à jour sans recharger la page.

- [ ] **Step 6: Commit**

```bash
git add Index.html && git commit -m "fix(alt): build the quick-add modal on RichSelect so player avatars are shown"
```

---

### Task 9: Câbler le filtre Alt de l'onglet Historique

`selectedHistAltCategories` est piloté par des chips visibles et n'est jamais envoyé au serveur : le paramètre `filterAltCategory` de `apiGetHistoryPage` reste `undefined`. Les chips sont mono-sélection (chaque handler fait `.clear()` puis `.add()`), donc le paramètre scalaire côté serveur suffit — aucune signature à changer.

**Files:**
- Modify: `Index.html:13983` (appel principal)
- Modify: `Index.html:13996` et la définition de `_prefetchNextHistoryPage` (appel de préchargement)

**Interfaces:**
- Consumes: `apiGetHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText, startDate, endDate, sortDir, filterAltCategory)` — 9ᵉ paramètre déjà implémenté côté serveur (`Code.gs:756`), valeurs acceptées : un nom de Top Alternatif, `'__ANY__'`, `'__NONE__'`, ou `null`.
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Lire la signature du préchargement**

```bash
grep -n "_prefetchNextHistoryPage" Index.html
```

Lire la définition de la fonction et noter sa liste de paramètres exacte : il faudra y ajouter `altFilter` en dernier et le transmettre à son propre `callServer('apiGetHistoryPage', ...)`.

- [ ] **Step 2: Passer le filtre à l'appel principal**

Juste avant la ligne 13983, insérer :

```js
    // Chips are single-select (each handler clears the set before adding), so the
    // server's scalar filterAltCategory is enough.
    const altFilter = selectedHistAltCategories.size ? Array.from(selectedHistAltCategories)[0] : null;
```

puis remplacer l'appel :

```js
    callServer('apiGetHistoryPage', [page, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null, dateFrom || null, dateTo || null, _histSortDir], res => {
      _renderHistoryPage(page, res);
      _prefetchNextHistoryPage(page, filterPlayers, filterCats, textFilter, dateFrom, dateTo);
    }, 'Chargement historique');
```

par :

```js
    callServer('apiGetHistoryPage', [page, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null, dateFrom || null, dateTo || null, _histSortDir, altFilter], res => {
      _renderHistoryPage(page, res);
      _prefetchNextHistoryPage(page, filterPlayers, filterCats, textFilter, dateFrom, dateTo, altFilter);
    }, 'Chargement historique');
```

- [ ] **Step 3: Propager dans le préchargement**

Dans la définition de `_prefetchNextHistoryPage`, ajouter `altFilter` comme dernier paramètre et l'ajouter en 9ᵉ position du tableau d'arguments de son `callServer('apiGetHistoryPage', ...)`, exactement comme à l'étape 2.

- [ ] **Step 4: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 124 / fail 0`.

- [ ] **Step 5: Vérification manuelle dans l'app**

Invoquer `/verify`. Onglet 📜 Historique : cliquer sur la chip « ⭐ Tous Alt » puis sur « 🚫 Non Alt » puis sur un Top Alternatif précis.
Attendu : le tableau change à chaque clic. Vérifier que « 🚫 Non Alt » ne montre aucune entrée portant un badge Alt, et l'inverse pour « ⭐ Tous Alt ».

- [ ] **Step 6: Commit**

```bash
git add Index.html && git commit -m "fix(history): send the Alt chip selection to apiGetHistoryPage"
```

---

### Task 10: Conventions visuelles — variables de couleur et cibles tactiles

Trois manquements à `context.md` : des hexadécimaux en dur alors que `--info` existe déjà, deux couleurs de repli concurrentes (`#ffd166` et `#7c8cff`) pour le même cas « Top Alternatif sans couleur », et `.history-nav-btn` réduit à ~28px de haut alors que `--tap-min` vaut 44px.

**Files:**
- Modify: `Index.html:30-46` (bloc `:root`) et le bloc `body.light` correspondant
- Modify: `Index.html:3626-3637` (`.history-nav-btn`)
- Modify: `Index.html:9010` (badge `✏️ natif`)
- Modify: tous les sites JS utilisant `'#ffd166'` ou `'#7c8cff'` comme repli de couleur Alt
- Modify: `Index.html` — ajouter la classe `.qa-field`

**Interfaces:**
- Consumes: `ALT_FALLBACK_COLOR` (Task 6).
- Produces: variable CSS `--alt-accent`, classe CSS `.qa-field`.

- [ ] **Step 1: Déclarer la variable de couleur Alt**

Dans le bloc `:root`, à la suite de `--clean`, ajouter :

```css
      --alt-accent: #ffd166;
```

Localiser ensuite le bloc `body.light` (celui qui redéfinit `--bg`, `--card`, etc.) et y ajouter la même déclaration si les autres tokens sémantiques y sont redéfinis ; si `--info`/`--clean` n'y figurent pas, ne rien ajouter — `--alt-accent` est un token sémantique, invariant entre les thèmes, comme `--success`.

- [ ] **Step 2: Recenser les hexadécimaux à remplacer**

```bash
grep -n "#ffd166\|#7c8cff\|124,140,255" Index.html
```

Classer chaque occurrence :
- dans une règle CSS → remplacer par `var(--alt-accent)` (repli Alt) ou `var(--info)` (bleu informatif) ;
- dans du JS → remplacer par `ALT_FALLBACK_COLOR` ;
- dans `:root` / `body.light` → laisser (c'est la définition elle-même).

Les replis Alt divergents actuels sont aux lignes 8391, 12918 (`#ffd166`) et 9397, 13652, 14057 (`#7c8cff`) : tous doivent devenir `ALT_FALLBACK_COLOR`, c'est le même cas métier.

- [ ] **Step 3: Corriger le badge natif**

Remplacer, ligne 9010, le style inline du badge :

```
style="font-size:0.7rem;background:rgba(124,140,255,0.15);color:#7c8cff;border:1px solid #7c8cff;border-radius:10px;padding:1px 6px;font-weight:700;vertical-align:middle;margin-left:4px;"
```

par :

```
style="font-size:0.7rem;background:color-mix(in srgb, var(--info) 15%, transparent);color:var(--info);border:1px solid var(--info);border-radius:10px;padding:1px 6px;font-weight:700;vertical-align:middle;margin-left:4px;"
```

`color-mix` est déjà utilisé ailleurs dans le fichier (séparateur `.nav-btn::after`), il n'y a pas de risque de compatibilité nouveau.

- [ ] **Step 4: Restaurer la cible tactile de la navigation Historique**

Dans `.history-nav-btn` (ligne 3627), remplacer :

```css
    flex: 0 0 auto; min-width: 0; padding: 6px 12px;
```

par :

```css
    flex: 0 0 auto; min-width: 0; padding: 6px 12px;
    min-height: var(--tap-min);
```

Et dans la media query ligne 3681, remplacer :

```css
    .history-nav-btn { font-size: 0.75rem; padding: 9px 5px; }
```

par :

```css
    .history-nav-btn { font-size: 0.75rem; padding: 9px 5px; min-height: var(--tap-min); }
```

- [ ] **Step 5: Ajouter la classe des champs de la modale Alt**

À la suite de la règle `.tool-action-info span` (vers la ligne 1065), ajouter :

```css
    .qa-field, .qa-input {
      min-height: var(--tap-min);
      box-sizing: border-box;
    }
```

Puis, dans `openAltNativeQuickAddModal`, ajouter `class="qa-input"` aux trois `<input>` (`qaPtsInput`, `qaDateInput`, `qaDescInput`). La classe `qa-field` est déjà posée sur les hôtes RichSelect en Task 8.

- [ ] **Step 6: Vérifier**

```bash
npm run verify
```

Puis re-vérifier qu'il ne reste aucun repli codé en dur :

```bash
grep -n "'#ffd166'\|'#7c8cff'" Index.html
```

Attendu : aucun résultat.

- [ ] **Step 7: Vérification manuelle dans l'app**

Invoquer `/verify`. Basculer dark ↔ light. Vérifier le badge ✏️ natif dans le gestionnaire Alt sur les deux thèmes, et mesurer que les onglets 📜 Entrées / 🔍 Journal sont confortables au doigt sur mobile.

- [ ] **Step 8: Commit**

```bash
git add Index.html && git commit -m "style: use CSS variables for Alt and info colours, restore 44px tap targets"
```

---

### Task 11: Recâbler l'outil « Scores aberrants »

`scanOutliers()` est entièrement implémenté et respecte déjà la règle avatar, mais ses deux cibles DOM (`detectOutliersBtn`, `outliersResults`) n'existent nulle part et rien ne l'appelle. `context.md` §5 liste pourtant « scores aberrants » parmi les outils de 🔧 Outils. Le voisin `scanDuplicates` fournit le patron exact.

**Files:**
- Modify: `Index.html:4459-4462` (insérer la card dans le sous-onglet Outils)
- Modify: `Index.html:17247` (ajouter l'écouteur à côté de celui de `detectDuplicatesBtn`)

**Interfaces:**
- Consumes: `scanOutliers()` (existant, ligne 16489), `apiDetectOutlierScores()` (existant côté serveur, exposé au harness).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Vérifier si les cards repliables ont besoin d'un enregistrement**

```bash
grep -n "card-collapsible" Index.html | head -20
```

Si l'initialisation des cards repliables passe par une liste d'identifiants en dur, ajouter `toolOutliersCard` à cette liste. Si elle sélectionne toutes les `.card-collapsible` du DOM, il n'y a rien à faire.

- [ ] **Step 2: Ajouter la card manquante**

Dans `Index.html`, à l'emplacement des lignes vides 4460-4462 (juste après la fermeture de `toolDuplicatesCard` et avant `toolMentionsCard`), insérer :

```html
      <div class="card card-collapsible" id="toolOutliersCard">
        <div class="card-collapse-header"><h2>📈 Scores aberrants</h2></div>
        <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 12px;line-height:1.5;">
          Détecte les entrées dont le nombre de points s'écarte fortement de la valeur habituelle du Top — le plus souvent une faute de frappe à la saisie. Une entrée écartée n'est plus proposée.
        </p>
        <button id="detectOutliersBtn" class="primary small">🔍 Scanner l'historique</button>
        <div id="outliersResults" class="detect-results"></div>
      </div>
```

- [ ] **Step 3: Câbler l'écouteur**

Juste après la ligne 17247 :

```js
    document.getElementById('detectDuplicatesBtn').addEventListener('click', scanDuplicates);
```

ajouter :

```js
    document.getElementById('detectOutliersBtn').addEventListener('click', scanOutliers);
```

- [ ] **Step 4: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 124 / fail 0`.

- [ ] **Step 5: Vérification manuelle dans l'app**

Invoquer `/verify`. Paramètres → 🔧 Outils → 📈 Scores aberrants → Scanner.
Attendu : soit une liste d'entrées avec avatar, moyenne du Top et date, soit le message « Aucun score aberrant détecté ». Vérifier que le bouton d'écartement d'une entrée la fait disparaître et qu'elle ne revient pas au scan suivant.

- [ ] **Step 6: Commit**

```bash
git add Index.html && git commit -m "fix(outils): wire the documented outlier-score tool back into the UI"
```

---

### Task 12: Supprimer le code réellement mort

Quatre symboles n'ont aucun appelant et rien ne les documente comme feature. `apiUpdateHistoryDescription` est conservé : il est sans appelant client mais couvert par `tests/audit.test.js` pour sa sémantique snapshot/undo.

**Files:**
- Modify: `Index.html` — supprimer `openAltCategoryLinkModal` (vers 8601) et `confirmGroupRows` (vers 13277)
- Modify: `Code.gs` — supprimer `apiGetMobileBootstrap` (vers 1677)
- Modify: `AutoPoints.gs` — supprimer `apiRunAutoRulesNow` (vers 368)
- Modify: `tests/harness.js:153` — retirer `apiRunAutoRulesNow` de la liste d'exposition

**Interfaces:**
- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Vérifier qu'aucun déclencheur GAS n'appelle `apiRunAutoRulesNow`**

```bash
grep -n "RunAutoRulesNow\|newTrigger\|ScriptApp.newTrigger\|apiSetAutoTrigger" AutoPoints.gs Code.gs
```

Lire le corps de `apiSetAutoTrigger` et identifier le nom de la fonction que le déclencheur temporel installe. **Si ce nom est `apiRunAutoRulesNow`, NE PAS le supprimer** — un déclencheur installé en production planterait. Dans ce cas, laisser la fonction en place et le noter dans le message de commit.

- [ ] **Step 2: Confirmer l'absence d'appelant pour chaque symbole**

```bash
for s in openAltCategoryLinkModal confirmGroupRows apiGetMobileBootstrap; do echo "--- $s"; grep -rn "$s" Index.html Code.gs AutoPoints.gs tests/ | grep -v "function $s"; done
```

Attendu : aucune ligne d'appel (les seules occurrences tolérées sont les listes d'exposition de `tests/harness.js`). Si un appelant apparaît, ne pas supprimer ce symbole.

- [ ] **Step 3: Supprimer les deux fonctions frontend**

Supprimer intégralement `function openAltCategoryLinkModal(...) { ... }` et `function confirmGroupRows(...) { ... }` d'`Index.html`, accolades comprises, en veillant à ne pas laisser de ligne vide orpheline supplémentaire.

- [ ] **Step 4: Supprimer les endpoints serveur**

Supprimer `function apiGetMobileBootstrap(...) { ... }` de `Code.gs` et, sous réserve du résultat de l'étape 1, `function apiRunAutoRulesNow(...) { ... }` d'`AutoPoints.gs`.

Puis retirer `apiRunAutoRulesNow, ` de la chaîne `epilogue` de `tests/harness.js` ligne 153.

- [ ] **Step 5: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 124 / fail 0`. Si un test échoue sur un symbole devenu `undefined`, c'est que le symbole n'était pas mort — le restaurer.

- [ ] **Step 6: Commit**

```bash
git add Index.html Code.gs AutoPoints.gs tests/harness.js && git commit -m "chore: remove unreachable frontend helpers and server endpoints"
```

---

### Task 13: Nettoyeur de commentaires auto-vérifiant

`stripJsComments` ne connaît pas les littéraux d'expression régulière : une regex contenant `//` (par exemple `/https?:\/\//`, dont les deux derniers caractères sont deux barres) fait entrer le scanner en mode commentaire et supprime la fin de la ligne. Le fichier actuel y échappe, mais ce script réécrit tous les `.gs`/`.html` à chaque déploiement des deux cibles. La correction du scanner est utile ; la **vérification** l'est davantage : elle transforme toute erreur future en échec de build au lieu d'une page blanche.

**Files:**
- Modify: `.github/scripts/strip-comments.js` (réécriture complète)
- Create: `tests/strip-comments.test.js`
- Modify: `.github/scripts/deploy-gas.sh:9-15` (commentaire d'en-tête)

**Interfaces:**
- Consumes: rien.
- Produces: `module.exports = { stripJsComments }` — consommé par `tests/strip-comments.test.js`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/strip-comments.test.js` :

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { stripJsComments } = require('../.github/scripts/strip-comments');

test('removes line and block comments', () => {
  assert.strictEqual(stripJsComments('let a = 1; // gone\n').trim(), 'let a = 1;');
  assert.strictEqual(stripJsComments('let /* gone */ a = 1;').replace(/\s+/g, ' ').trim(), 'let a = 1;');
});

test('keeps // inside strings and template literals', () => {
  const src = 'const u = "https://x.test/a"; const t = `see // here`;';
  assert.strictEqual(stripJsComments(src), src);
});

test('keeps a regex literal that ends in two slashes', () => {
  const src = 'const re = /https?:\\/\\//g;\nconst after = 1;\n';
  const out = stripJsComments(src);
  assert.ok(out.includes('const after = 1;'), 'the line after the regex must survive');
  assert.ok(out.includes('/https?:\\/\\//g'), 'the regex itself must survive');
});

test('keeps a regex containing a quote without desynchronising', () => {
  const src = "const re = /['\"]/g;\nconst s = 'ok'; // gone\nconst after = 2;\n";
  const out = stripJsComments(src);
  assert.ok(out.includes("const s = 'ok';"), 'the string after the regex must survive');
  assert.ok(out.includes('const after = 2;'));
  assert.ok(!out.includes('gone'), 'the real comment must still be removed');
});

test('treats a slash after an identifier as division, not a regex', () => {
  const out = stripJsComments('const x = a / b; // gone\nconst y = 3;\n');
  assert.ok(out.includes('const x = a / b;'));
  assert.ok(out.includes('const y = 3;'));
  assert.ok(!out.includes('gone'));
});

test('preserves CRLF line endings on stripped lines', () => {
  const out = stripJsComments('let a = 1; // gone\r\nlet b = 2;\r\n');
  assert.ok(out.includes('\r\n'), 'CR must not be swallowed with the comment');
  assert.ok(!/[^\r]\n/.test(out), 'no line may end up LF-only');
});

test('throws instead of silently truncating on an unterminated block comment', () => {
  assert.throws(() => stripJsComments('let a = 1; /* never closed'), /non ferme|non fermé/);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
node --test tests/strip-comments.test.js
```

Attendu : échec au chargement (`stripJsComments is not a function`) — le module n'exporte encore rien.

- [ ] **Step 3: Réécrire le nettoyeur**

Remplacer intégralement `.github/scripts/strip-comments.js` par :

```js
#!/usr/bin/env node
'use strict';

// Runs inside the CI checkout right before `clasp push`. Google's Apps Script
// pipeline strips comments itself, but did so unsafely on a file this size and
// blanked production (see CHANGELOG v3.5.5): stripping first makes its pass a
// no-op. Every write is re-parsed before it lands, so a bug in the scanner
// fails the build instead of shipping a broken page.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

// A '/' opens a regex literal (rather than being division) when the previous
// significant token is an operator, an opening bracket, or one of these keywords.
const REGEX_PRECEDERS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'
]);
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'yield', 'await'
]);

function opensRegex(emitted) {
  let i = emitted.length - 1;
  while (i >= 0 && /\s/.test(emitted[i])) i--;
  if (i < 0) return true;
  const c = emitted[i];
  if (REGEX_PRECEDERS.has(c)) return true;
  if (!/[A-Za-z0-9_$]/.test(c)) return false;
  let j = i;
  while (j >= 0 && /[A-Za-z0-9_$]/.test(emitted[j])) j--;
  return REGEX_KEYWORDS.has(emitted.slice(j + 1, i + 1));
}

function stripJsComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (c === '/' && c2 === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      // Keep the CR of a CRLF pair: dropping it leaves mixed line endings.
      if (j > i && src[j - 1] === '\r') out += '\r';
      i = j;
      continue;
    }

    if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      if (j >= n) throw new Error('Commentaire /* non fermé');
      // A block comment can be the only separator between two tokens.
      out += ' ';
      i = j + 2;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      if (j >= n) throw new Error('Chaîne non terminée');
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`' && depth === 0) break;
        if (src[j] === '$' && src[j + 1] === '{') depth++;
        else if (src[j] === '}' && depth > 0) depth--;
        j++;
      }
      if (j >= n) throw new Error('Template literal non terminé');
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (c === '/' && opensRegex(out)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '\n') throw new Error('Regex non terminée sur la ligne');
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        j++;
      }
      if (j >= n) throw new Error('Regex non terminée');
      j++;
      while (j < n && /[a-z]/.test(src[j])) j++;
      out += src.slice(i, j);
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

function assertParses(label, code) {
  try {
    new vm.Script(code, { filename: label });
  } catch (e) {
    throw new Error(label + ' ne parse plus après nettoyage : ' + e.message);
  }
}

const SCRIPT_RE = /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi;

function stripGsFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const stripped = stripJsComments(src);
  assertParses(path.basename(file), stripped);
  fs.writeFileSync(file, stripped);
  console.log(path.basename(file) + ': ' + src.length + ' -> ' + stripped.length + ' chars');
}

function stripHtmlFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  let blocks = 0;
  const stripped = src.replace(SCRIPT_RE, (whole, open, body, close) => {
    blocks++;
    const cleaned = stripJsComments(body);
    assertParses(path.basename(file) + '#script' + blocks, cleaned);
    return open + cleaned + close;
  });
  fs.writeFileSync(file, stripped);
  console.log(path.basename(file) + ': ' + src.length + ' -> ' + stripped.length + ' chars (' + blocks + ' bloc(s) script)');
}

function main() {
  if (!process.env.CI && !process.argv.includes('--force')) {
    console.error('strip-comments.js réécrit les fichiers sur place : réservé au CI. Utiliser --force pour forcer en local.');
    process.exit(1);
  }
  const entries = fs.readdirSync(ROOT);
  const gsFiles = entries.filter(f => f.endsWith('.gs')).map(f => path.join(ROOT, f));
  const htmlFiles = entries.filter(f => f.endsWith('.html')).map(f => path.join(ROOT, f));
  if (!gsFiles.length && !htmlFiles.length) {
    console.error('Aucun fichier .gs/.html trouvé dans ' + ROOT);
    process.exit(1);
  }
  gsFiles.forEach(stripGsFile);
  htmlFiles.forEach(stripHtmlFile);
}

if (require.main === module) main();

module.exports = { stripJsComments };
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
node --test tests/strip-comments.test.js
```

Attendu : 7 tests, 7 réussites.

- [ ] **Step 5: Vérifier le comportement réel sur les fichiers du dépôt**

`ROOT` est résolu depuis `__dirname`, donc le script traite toujours le dépôt quel que soit le répertoire courant. On le laisse agir, on vérifie le résultat, puis on restaure.

```bash
CI=1 node .github/scripts/strip-comments.js && node tests/check-html-syntax.js && npm test; git checkout -- Index.html Code.gs AutoPoints.gs; git diff --stat
```

Attendu, dans l'ordre : trois lignes `X -> Y chars` sans exception, la syntaxe du fichier nettoyé reste valide, les 124 tests passent **sur le code nettoyé**, puis `git diff --stat` est vide après restauration.

C'est la vérification la plus importante du plan : elle prouve que ce qui part chez Google est du code qui compile et qui passe les tests.

- [ ] **Step 6: Vérifier que la garde CI fonctionne**

```bash
node .github/scripts/strip-comments.js; echo "exit=$?"
```

Attendu : le message « réservé au CI » puis `exit=1`, sans qu'aucun fichier ne soit modifié (`git diff --stat` vide).

- [ ] **Step 7: Mettre à jour le commentaire de `deploy-gas.sh`**

Remplacer le bloc de commentaire des lignes 9-13 par :

```bash
# Strip JS comments from the .gs/.html files in this CI checkout before pushing:
# Google's own comment-stripping, applied server-side on push, corrupted a working
# file's syntax in production (see CHANGELOG v3.5.5). Stripping them ourselves
# first makes that pass a no-op. The script re-parses every file it rewrites and
# exits non-zero if the result no longer parses, so a scanner bug fails the build
# instead of blanking the site.
```

- [ ] **Step 8: Vérification complète**

```bash
npm run verify && node --test tests/strip-comments.test.js
```

Attendu : tout vert.

- [ ] **Step 9: Commit**

```bash
git add .github/scripts/strip-comments.js .github/scripts/deploy-gas.sh tests/strip-comments.test.js && git commit -m "fix(deploy): make the comment stripper regex-aware and self-verifying"
```

---

### Task 14: Renumérotation du CHANGELOG et entrée v3.6.0

Trois numéros de version désignent chacun deux livraisons différentes : les commits `de161a4`, `63c19f2` et `3561fb0` portent en sujet `(v3.5.1)`, `(v3.5.2)` et `(v3.5.3)` pour des tentatives abandonnées, tandis que le CHANGELOG réutilise ces mêmes numéros pour les correctifs qui les ont remplacées. L'entrée `v3.5.1` va jusqu'à écrire qu'elle remplace les versions listées **au-dessus** d'elle.

**Files:**
- Modify: `CHANGELOG.md:6`, `12`, `18` (en-têtes de version) et le corps des entrées
- Modify: `Code.gs` (commentaire de `doGet` référençant v3.5.0/v3.5.1)
- Modify: `.github/scripts/strip-comments.js` et `.github/scripts/deploy-gas.sh` — déjà traités en Task 13, vérifier la cohérence

**Interfaces:**
- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Renuméroter les trois en-têtes**

Dans `CHANGELOG.md` :
- ligne 6 : `## [v3.5.3] - 2026-08-06` → `## [v3.5.6] - 2026-08-06`
- ligne 12 : `## [v3.5.2] - 2026-08-06` → `## [v3.5.5] - 2026-08-06`
- ligne 18 : `## [v3.5.1] - 2026-08-06` → `## [v3.5.4] - 2026-08-06`

`## [v3.5.0]` reste inchangé.

- [ ] **Step 2: Corriger la phrase auto-référente**

Dans l'entrée devenue `v3.5.4`, remplacer :

```
Les trois tentatives précédentes (3.5.1 à 3.5.3, annulées et remplacées par cette version) corrigeaient des symptômes côté navigateur sans s'attaquer à la vraie cause
```

par :

```
Les trois tentatives précédentes (commits étiquetés v3.5.1 à v3.5.3, abandonnées et remplacées par cette version, sans entrée de changelog propre) corrigeaient des symptômes côté navigateur sans s'attaquer à la vraie cause
```

- [ ] **Step 3: Corriger les renvois croisés**

```bash
grep -rn "v3\.5\.1\|v3\.5\.2\|v3\.5\.3" CHANGELOG.md Code.gs .github/scripts/
```

Dans l'entrée `v3.5.5`, le renvoi « voir CHANGELOG v3.5.1 » devient « voir CHANGELOG v3.5.4 ». Faire de même dans le commentaire de `doGet` (`Code.gs`) et dans tout autre renvoi listé, en laissant intactes les mentions qui désignent réellement les commits abandonnés.

- [ ] **Step 4: Ajouter l'entrée v3.6.0**

Insérer, juste après la ligne `Format basé sur [Keep a Changelog](https://keepachangelog.com).` et avant `## [v3.5.6]` :

La date de l'en-tête doit être **la date réelle du jour de livraison**, pas celle de la rédaction de ce plan. La relever avec `date +%F` avant d'écrire l'entrée.

```markdown
## [v3.6.0] - AAAA-MM-JJ

> Note de traçabilité : les numéros v3.5.1 à v3.5.3 ont été utilisés dans les sujets de trois commits abandonnés pendant l'épisode de l'interface vide. Les correctifs qui les ont remplacés sont documentés ci-dessous sous v3.5.4 à v3.5.6.

### Corrigé
**Humanisé** : En saisie de lot dans les Tops Alternatifs, une ligne mal remplie bloque désormais tout l'envoi au lieu d'être ignorée en silence pendant que les autres partaient quand même.
**Technique** : `Index.html` — la branche Alt de `submitBulk()` collecte puis valide dans une boucle `for...of` ; le `return` dans le `forEach` n'écartait que la ligne fautive.

**Humanisé** : Supprimer une entrée saisie directement dans un Top Alternatif ne risque plus d'effacer une autre entrée sans rapport, et la fenêtre de confirmation dit clairement que la suppression est définitive.
**Technique** : `Code.gs` — `unlinkHistoryRowsFromAltCategory()` ne matche plus que la colonne `refHistoryRowId` ; nouvelle méthode `AltStorageService.deleteNativeAltEntry()` et endpoint `apiDeleteNativeAltEntry()` avec audit dédié. `Index.html` — le handler lit enfin `data-native`.

**Humanisé** : En mode Tops Alternatifs, la couleur d'une ligne de saisie est la bonne dès sa création, et le constructeur reste utilisable même sans aucun Top principal configuré.
**Technique** : `Index.html` — `applyRowCategoryVisuals()` extrait et appelé à l'initialisation comme dans `onChange` ; la garde de `addEntryRow()` teste `cachedAltCategories` en univers Alt.

**Humanisé** : Basculer entre Tops Principaux et Tops Alternatifs dans le constructeur de lot ne détruit plus les Tops choisis ligne par ligne — l'aller-retour rend exactement ce qui avait été saisi.
**Technique** : `Index.html` — chaque ligne mémorise `dataset.mainCategory` et `dataset.altUniverseCategory` ; `setLotUniverse()` reconstruit les presets à partir des deux.

**Humanisé** : Les pastilles de filtre par Top Alternatif de l'onglet Historique filtrent enfin réellement le tableau.
**Technique** : `Index.html` — `selectedHistAltCategories` est transmis en 9ᵉ argument (`filterAltCategory`) à `apiGetHistoryPage`, à l'appel principal comme au préchargement.

**Humanisé** : Après avoir saisi des points Alt, les cartes Records et Tendances du Dashboard se mettent à jour sans recharger la page.
**Technique** : `Index.html` — `saveNativeAltEntries()` appelle `refreshDashboardStats()` en plus de `applyFilters()` quand le Dashboard est en univers Alt.

**Humanisé** : Une date invalide envoyée à la saisie Alt est refusée avec un message clair au lieu d'atterrir telle quelle dans la feuille.
**Technique** : `Code.gs` — `addNativeAltEntries()` valide `new Date(e.date)` avant écriture.

### Ajouté
**Humanisé** : L'outil « Scores aberrants » annoncé dans la documentation existe enfin pour de vrai dans Paramètres → Outils.
**Technique** : `Index.html` — card `#toolOutliersCard` avec `#detectOutliersBtn` et `#outliersResults`, et écouteur vers la fonction `scanOutliers()` qui était déjà implémentée mais orpheline.

**Humanisé** : Une erreur de syntaxe dans la page ne peut plus passer inaperçue jusqu'en production : elle bloque désormais la livraison.
**Technique** : `tests/check-html-syntax.js` (nouveau) et script npm `verify` ; `.github/scripts/strip-comments.js` reconnaît les expressions régulières, préserve les fins de ligne CRLF, refuse de s'exécuter hors CI sans `--force`, et re-parse chaque fichier qu'il réécrit avant de l'enregistrer. Couverture par `tests/strip-comments.test.js`.

### Modifié
**Humanisé** : La fenêtre de saisie rapide Alt affiche maintenant l'avatar de chaque joueur et l'emoji de chaque Top Alternatif, comme partout ailleurs dans l'application.
**Technique** : `Index.html` — `openAltNativeQuickAddModal()` est bâtie sur `buildRichSelect()` au lieu de balises `<select>` nues, et passe par le chemin d'écriture unique `saveNativeAltEntries()`.

**Humanisé** : Les couleurs des Tops Alternatifs suivent une seule référence au lieu de deux valeurs concurrentes selon l'écran, et les onglets de l'Historique redeviennent confortables à toucher au doigt.
**Technique** : `Index.html` — variable CSS `--alt-accent` et constante `ALT_FALLBACK_COLOR`, `var(--info)` pour le badge natif, `min-height: var(--tap-min)` sur `.history-nav-btn` et les champs de la modale Alt.

### Supprimé
**Humanisé** : Retrait de morceaux de code qui n'étaient plus reliés à rien dans l'application.
**Technique** : `Index.html` — `openAltCategoryLinkModal()`, `confirmGroupRows()`. `Code.gs` — `apiGetMobileBootstrap()`. `AutoPoints.gs` — `apiRunAutoRulesNow()`. `tests/harness.js` — listes d'exposition mises à jour.
```

**Si une tâche antérieure a été écartée** (par exemple `apiRunAutoRulesNow` conservé parce qu'un déclencheur l'utilise), retirer l'item correspondant de cette entrée. Une entrée de changelog qui annonce un changement non livré est un mensonge.

- [ ] **Step 5: Vérifier**

```bash
npm run verify && grep -c "Humanisé" CHANGELOG.md && grep -c "Technique" CHANGELOG.md
```

Attendu : les deux compteurs sont égaux — chaque item a bien ses deux voix.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md Code.gs && git commit -m "docs(changelog): renumber the duplicated v3.5.x entries and log v3.6.0"
```

---

### Task 15: Vérification finale et push unique

C'est la seule tâche qui touche au dépôt distant. Un `git push` déclenche le workflow `deploy-gas.yml` qui redéploie **les deux cibles** de `deploy-targets.json` — on n'en veut qu'un pour l'ensemble du chantier.

**Files:**
- Aucun fichier modifié.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: le déploiement des deux instances.

- [ ] **Step 1: Vérification complète**

```bash
npm run verify && node --test tests/strip-comments.test.js
```

Attendu : syntaxe OK, `pass 124 / fail 0` sur la suite principale, 7/7 sur le nettoyeur. **Si quoi que ce soit est rouge, ne pas pousser.**

- [ ] **Step 2: Simuler le déploiement en local**

```bash
CI=1 node .github/scripts/strip-comments.js && node tests/check-html-syntax.js && npm test; git checkout -- Index.html Code.gs AutoPoints.gs; git status --porcelain
```

Attendu : le nettoyage passe, la syntaxe du fichier nettoyé est valide, les tests passent sur le code nettoyé, puis le dépôt est restauré (`git status --porcelain` ne montre que `?? .claude/`).

- [ ] **Step 3: Relire l'ensemble du diff**

```bash
git log --oneline origin/main..HEAD && git diff origin/main...HEAD --stat
```

Vérifier que chaque commit correspond bien à une tâche du plan et qu'aucun fichier inattendu ne s'est glissé dedans.

- [ ] **Step 4: Vérifier le compte GitHub**

```bash
gh auth status
```

Si le compte actif n'est pas `Arcxy2nd` : `gh auth switch --user Arcxy2nd`.

- [ ] **Step 5: Pousser**

```bash
git push origin main
```

- [ ] **Step 6: Vérifier le déploiement sans sonder en boucle**

Attendre une seule fois, puis vérifier :

```bash
gh run list --limit 3
```

**Ne pas répéter cette commande en boucle** (`context.md` §8, anti-polling). Si le workflow est encore en cours, rendre la main et vérifier plus tard.

Attendu : le run `deploy-gas.yml` est en succès et les deux cibles (« Site tops » et « Tops RDS ») ont été redéployées.

- [ ] **Step 7: Vérification fonctionnelle sur l'app déployée**

Invoquer `/verify` sur les deux liens short.io. Contrôler en priorité : l'interface se charge (pas de page blanche), la saisie de lot Alt, la suppression d'une entrée native, les chips Alt de l'Historique, l'outil Scores aberrants.

---

## Notes de couverture

Chaque défaut relevé par la review est traité par exactement une tâche :

| # | Défaut | Tâche |
|---|--------|-------|
| 1 | `return` dans `forEach` de `submitBulk` Alt | Task 5 |
| 2 | Collision d'espaces de nommage à la suppression Alt | Tasks 2, 4 |
| 3 | Visuels d'init de ligne non branchés sur l'univers | Task 6 |
| 4 | Switch d'univers destructeur | Task 7 |
| 5 | Garde `addEntryRow` bloquant le mode Alt | Task 6 |
| 6 | Chips Alt de l'Historique inertes | Task 9 |
| 7 | Nettoyeur de commentaires sans gestion des regex | Task 13 |
| 8 | `scanOutliers` orphelin + 5 symboles morts | Tasks 11, 12 |
| 9 | Avatars absents de la modale Alt | Task 8 |
| 10 | Hexadécimaux en dur, replis divergents | Task 10 |
| 11 | Trois chemins de saisie Alt, `isNative` recalculé | Tasks 3, 4, 5, 8 |
| 12 | Aucun test sur le chemin d'écriture natif | Tasks 2, 3 |
| 13 | `.history-nav-btn` sous la cible tactile | Task 10 |
| 14 | Cards Dashboard périmées après écriture Alt | Task 5 |
| 15 | Numéros de version en double | Task 14 |
