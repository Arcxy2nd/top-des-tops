# Audit Fixes (Gemini findings, verified) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 9 real issues confirmed (by direct code inspection, not by trusting the report) out of a third-party audit of `Code.gs`/`AutoPoints.gs`/`Index.html`/`appsscript.json` — 2 functional crashes, 3 security gaps, 2 performance issues, 1 quota/cache gap, 1 UX papercut. One finding from the audit ("chart wrapper stays visible on load error") was checked and is already fixed in the current code — no task for it.

**Architecture:** Nine independent tasks, ordered smallest/safest first. Each task is self-contained (own files, own tests, own changelog entry, own commit) and independently shippable — stopping after any task leaves the app in a working, deployable state. Tasks 1–7 and 9 are small, isolated diffs. Task 8 (real server-side authorization) is the one structurally large task: it threads a `password` parameter through every mutating `api*` endpoint (49 functions across `Code.gs` and `AutoPoints.gs`) plus 5 small edits in `Index.html`. It is deliberately last so the smaller wins are already banked before the riskiest change.

**Tech Stack:** Google Apps Script (`Code.gs`, `AutoPoints.gs`), vanilla HTML/CSS/JS (`Index.html`), Node `--test` harness against a VM-sandboxed copy of the real GAS source (`tests/harness.js` + `tests/*.test.js`).

## Global Constraints

- Never assume a header row exists on `History`/`Players`/`Categories` — always go through `_readDataRows()`/`_firstDataRow()`/`_headerOffsetFromValues()`. No task below adds a new read of these sheets that violates this.
- No ES6 classes — object literals / IIFEs only, consistent with the existing file.
- DRY: logic repeated ≥3 lines gets factored out (already respected below — e.g. the hashing helper, the CSS-url helper).
- Code (identifiers, comments) in English; everything outside code (this plan's prose, commit messages are English per repo rule, changelog "Humanisé" voice) in French where the repo convention says so.
- No `TODO`/`FIXME`/placeholder — every step below is a complete diff.
- Every task ends with: update `CHANGELOG.md` (Humanisé + Technique voices, both mandatory), commit, push to `main`. A push triggers `.github/workflows/deploy-gas.yml`, which deploys to **both** targets in `deploy-targets.json` ("Site tops" and "Tops RDS") — never leave a task committed-but-unpushed.
- Before pushing: `gh auth status`, switch to `Arcxy2nd` if needed (re-check every single time, the switch does not persist).
- Run `npm run verify` (= `check:html` + full test suite) before every commit in this plan. A task is not done until it passes.
- Never touch the real deployed Sheets. All verification is against `tests/` (Node VM harness) or the frontend preview harness (`npm run serve:front`). Real-data interaction is prohibited (see `context.md` §"INTERDICTION D'INTERAGIR AVEC LES DONNÉES RÉELLES").

---

### Task 1: Fix the Tops Alternatifs crash in `apiGetQuickStats`

**Files:**
- Modify: `Code.gs:2724` (inside `apiGetQuickStats`)
- Test: `tests/quick-stats.test.js`

**Root cause:** `AltStorageService.getAltLogs()` (see `Code.gs:1372-1382`, built on `_parseAltHistoryRow` at `Code.gs:1349-1365`) returns records shaped `{date, player, category, points, ...}`. `apiGetQuickStats`'s alt branch reads `l.timestamp` (`Code.gs:2744`), `a.timestamp`/`b.timestamp` (`Code.gs:2746`), `last.timestamp.toISOString()` (`Code.gs:2762`) and `globalBest.timestamp` (`Code.gs:2767`) — all `undefined` on an alt record, so the function throws as soon as there is at least one alt entry. The non-alt branch (`StorageService.getFilteredLogs`, built on `getAllLogs()`) is unaffected — that one already returns `.timestamp`.

**Interfaces:**
- Consumes: `AltStorageService.getAltLogs()` → `Array<{date: Date, player: string, category: string, points: number, ...}>` (unchanged).
- Produces: `apiGetQuickStats(universe)` keeps its existing return contract (`{success, stats: {leader, gap, chaser, monthCount, lastEvent, globalBest}}`) — no caller-visible change.

- [ ] **Step 1: Write the failing test**

Add to `tests/quick-stats.test.js` (after the existing tests, same file — same header conventions already used there):

```js
test('apiGetQuickStats does not crash on the alt universe and reads dates correctly', () => {
  const gas = loadGas();
  const ALT_HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Saiseur'];
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5, 12, 0, 0);
  const lastMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 5, 12, 0, 0);
  const altHistory = makeSheet([
    ALT_HEADER,
    [thisMonth, 'A', 'AltTop', 9, '', '', '', ''],
    [lastMonth, 'B', 'AltTop', 4, '', '', '', '']
  ]);
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color'], ['A', '', ''], ['B', '', '']]);
  gas.ConfigService.getSheets = () => ({ altHistory, players });

  const res = gas.apiGetQuickStats('alt');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.stats.leader.player, 'A');
  assert.strictEqual(res.stats.monthCount, 1);
  assert.strictEqual(res.stats.lastEvent.player, 'A');
  assert.strictEqual(res.stats.globalBest.player, 'A');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- --test-name-pattern "apiGetQuickStats does not crash on the alt universe"`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'toISOString')` (or similar, `.timestamp` is `undefined`).

- [ ] **Step 3: Fix `apiGetQuickStats`**

In `Code.gs`, replace:

```js
    const logs = isAlt ? AltStorageService.getAltLogs() : StorageService.getFilteredLogs(allPlayers, null, null, null);
```

with:

```js
    const logs = isAlt
      ? AltStorageService.getAltLogs().map(l => ({ timestamp: l.date, player: l.player, category: l.category, points: l.points }))
      : StorageService.getFilteredLogs(allPlayers, null, null, null);
```

Nothing else in the function changes — the rest already reads `.timestamp`, which now exists on both branches.

- [ ] **Step 4: Run the test again**

Run: `npm test -- --test-name-pattern "apiGetQuickStats"`
Expected: PASS (all `apiGetQuickStats` tests, including the new one).

- [ ] **Step 5: Update CHANGELOG.md**

Insert a new entry at the top of the version list in `CHANGELOG.md`, right after the `## [v3.20.2] - 2026-08-24` block header line (i.e. as the new first entry):

```markdown
## [v3.20.3] - 2026-08-25

### Corrigé
**Humanisé** : Le résumé rapide du Dashboard plantait dès qu'il y avait au moins une entrée dans un Top Alternatif — la carte restait bloquée en chargement.
**Technique** : `apiGetQuickStats('alt')` lisait `.timestamp` sur des objets `AltStorageService.getAltLogs()` qui exposent `.date` — `TypeError` garanti. Normalisation au point d'entrée de la fonction (`Code.gs:2724`). Test de régression `tests/quick-stats.test.js`.
```

- [ ] **Step 6: Commit and push**

```bash
git add Code.gs tests/quick-stats.test.js CHANGELOG.md
git commit -m "fix(stats): apiGetQuickStats crashed on the alt universe (date/timestamp mismatch)"
git push
```

---

### Task 2: Fix date loss when linking History rows to an Alt Top

**Files:**
- Modify: `Code.gs:1566`
- Test: `tests/alt-tops.test.js`

**Root cause:** `linkHistoryRowsToAltCategory` (`Code.gs:1551-1580`) builds `rowMap` from `StorageService.getFullHistoryRowsCached()`, whose records are shaped `{date, player, category, points, description, groupId, saiseur, rowIndex}` (see `Code.gs:930-934`). Line 1566 writes `date: histItem.timestamp` — `undefined` on this record shape — so `AltStorageService._buildAltRow` (downstream) falls back to `new Date()`, silently replacing the original entry's date with "now" every time a History row is attached to an Alt Top.

**Interfaces:**
- Consumes: `StorageService.getFullHistoryRowsCached()` → records with `.date` (unchanged).
- Produces: `AltStorageService.linkHistoryRowsToAltCategory(rowIndices, altCategory, saiseur)` return contract unchanged (a count); the fix only changes what gets written into the new AltHistory row.

- [ ] **Step 1: Write the failing test**

Add to `tests/alt-tops.test.js` (reuse the file's existing `HEADER_HIST`/`HEADER_ALT_CAT`/`HEADER_ALT_HIST` constants):

```js
test('linkHistoryRowsToAltCategory preserves the original History entry date', () => {
  const gas = loadGas();
  const originalDate = new Date('2026-03-15T10:00:00');
  const history = makeSheet([
    HEADER_HIST,
    [originalDate, 'Alice', 'Jeux', 5, 'ok', '', '']
  ]);
  const altCategories = makeSheet([HEADER_ALT_CAT, ['AltTop', '', '⭐', '#ff0000']]);
  const altHistory = makeSheet([HEADER_ALT_HIST]);
  gas.ConfigService.getSheets = () => ({ history, altCategories, altHistory });
  gas.ConfigService.clearCache = () => {};

  gas.AltStorageService.linkHistoryRowsToAltCategory([2], 'AltTop', 'Alice');

  const writtenDate = new Date(altHistory._grid[1][0]);
  assert.strictEqual(writtenDate.getTime(), originalDate.getTime(),
    'the Alt entry must carry the original History date, not the linking timestamp');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- --test-name-pattern "linkHistoryRowsToAltCategory preserves"`
Expected: FAIL — `writtenDate` is close to `Date.now()`, not `2026-03-15`.

- [ ] **Step 3: Fix the field**

In `Code.gs`, inside `linkHistoryRowsToAltCategory`, replace:

```js
          date: histItem.timestamp,
```

with:

```js
          date: histItem.date,
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- --test-name-pattern "linkHistoryRowsToAltCategory"`
Expected: PASS.

- [ ] **Step 5: Update CHANGELOG.md** (new entry above v3.20.3)

```markdown
## [v3.20.4] - 2026-08-25

### Corrigé
**Humanisé** : Rattacher une entrée de l'Historique principal à un Top Alternatif remplaçait sa date d'origine par la date du jour du rattachement.
**Technique** : `AltStorageService.linkHistoryRowsToAltCategory` (`Code.gs:1566`) lisait `histItem.timestamp` (inexistant sur les lignes de `getFullHistoryRowsCached()`, qui expose `.date`) — `_buildAltRow` retombait alors sur `new Date()`. Test de régression `tests/alt-tops.test.js`.
```

- [ ] **Step 6: Commit and push**

```bash
git add Code.gs tests/alt-tops.test.js CHANGELOG.md
git commit -m "fix(alt-tops): linking a History row to an Alt Top lost its original date"
git push
```

---

### Task 3: Fix manual Snapshot (missing Drive scope + deprecated Drive API)

**Files:**
- Modify: `appsscript.json`
- Modify: `Code.gs:514-528` (`BackupService.createSnapshot`)
- Modify: `tests/harness.js` (`makeFakeDrive` — add `moveTo` to the fake so the test double matches the real API)
- Test: `tests/backup.test.js` (existing tests must keep passing unchanged)

**Root cause 1:** `appsscript.json` declares an explicit `oauthScopes` list that does **not** include Drive, but `BackupService.createSnapshot()` calls `DriveApp.getFileById(...)`. Once `oauthScopes` is explicit, GAS does not auto-expand it — the call fails at runtime with a permission error.

**Root cause 2:** The same function uses the deprecated multi-parent Drive model (`folder.addFile(copyFile)` then loop `parent.removeFile(copyFile)`) instead of the modern `File.moveTo(destination)`.

**Interfaces:**
- Produces: `BackupService.createSnapshot()` → `{name: string, url: string}` (unchanged contract).

- [ ] **Step 1: Add the Drive scope**

In `appsscript.json`, replace the `oauthScopes` array:

```json
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.external_request"
  ]
```

with:

```json
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/drive"
  ]
```

(`drive.file` is not enough here: `_snapshotFolder` calls `getParents()`/`getFoldersByName()` on the source spreadsheet's existing parent folder, which the script did not itself create — that needs the full `drive` scope.)

- [ ] **Step 2: Add `moveTo` to the fake Drive file in the test harness**

In `tests/harness.js`, inside `makeFakeDrive()`'s `makeSpreadsheet(name, parentFolder)`, the `file` object currently ends with `copy(newName) { return makeSpreadsheet(newName); }`. Add a `moveTo` method right after it:

```js
      copy(newName) { return makeSpreadsheet(newName); },
      moveTo(folder) {
        currentParents.slice().forEach(p => p.removeFile(file));
        folder.addFile(file);
        return file;
      }
```

(Reuses the fake's existing `addFile`/`removeFile` folder methods — same end state as today's addFile+removeFile-loop, so the 4 existing `backup.test.js` assertions keep passing unchanged.)

- [ ] **Step 3: Run the existing Snapshot tests to confirm they still pass on the untouched code**

Run: `npm test -- --test-name-pattern "apiCreateSnapshot"`
Expected: PASS (4/4, `moveTo` isn't called yet — this step just proves the harness change alone is inert).

- [ ] **Step 4: Replace the deprecated Drive calls in `BackupService.createSnapshot`**

In `Code.gs`, replace:

```js
  function createSnapshot() {
    const ss = ConfigService.getSheets().spreadsheet;
    const sourceFile = DriveApp.getFileById(ss.getId());
    const name = ss.getName() + ' — Snapshot ' + _timestamp(new Date());
    const copy = ss.copy(name);
    const copyFile = DriveApp.getFileById(copy.getId());
    const folder = _snapshotFolder(sourceFile);
    folder.addFile(copyFile);
    const copyParents = copyFile.getParents();
    while (copyParents.hasNext()) {
      const p = copyParents.next();
      if (p.getId() !== folder.getId()) p.removeFile(copyFile);
    }
    return { name, url: copy.getUrl() };
  }
```

with:

```js
  function createSnapshot() {
    const ss = ConfigService.getSheets().spreadsheet;
    const sourceFile = DriveApp.getFileById(ss.getId());
    const name = ss.getName() + ' — Snapshot ' + _timestamp(new Date());
    const copy = ss.copy(name);
    const copyFile = DriveApp.getFileById(copy.getId());
    const folder = _snapshotFolder(sourceFile);
    copyFile.moveTo(folder);
    return { name, url: copy.getUrl() };
  }
```

- [ ] **Step 5: Run the Snapshot tests again**

Run: `npm test -- --test-name-pattern "apiCreateSnapshot"`
Expected: PASS (4/4), now actually exercising `moveTo`.

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: PASS, no regressions elsewhere.

- [ ] **Step 7: Update CHANGELOG.md**

```markdown
## [v3.20.5] - 2026-08-25

### Corrigé
**Humanisé** : Le bouton "Créer un instantané" (Paramètres → 🔧 Outils) était cassé en production : la permission nécessaire pour écrire sur Google Drive n'était pas déclarée, et la méthode utilisée pour ranger la copie dans le bon dossier est une méthode Google désormais obsolète.
**Technique** : Ajout du scope `https://www.googleapis.com/auth/drive` dans `appsscript.json` (absent, donc jamais auto-étendu par GAS). `BackupService.createSnapshot` (`Code.gs:514`) remplace le couple déprécié `folder.addFile()`/`parent.removeFile()` (modèle multi-parents) par `copyFile.moveTo(folder)`. `tests/harness.js` : `moveTo` ajouté à la fausse Drive.
```

- [ ] **Step 8: Commit and push**

```bash
git add appsscript.json Code.gs tests/harness.js CHANGELOG.md
git commit -m "fix(backup): Snapshot lacked the Drive scope and used deprecated Drive APIs"
git push
```

- [ ] **Step 9: One-time manual step after this deploy (not automatable via `clasp push`)**

The Apps Script owner account must grant the new Drive scope once: open the project in the Apps Script editor (script.google.com) and run any function once (or trigger "Créer un instantané" from the deployed app) — Google will show a consent screen for the new scope. `clasp push`/the CI workflow pushes code but cannot complete an interactive OAuth consent. Do this for **both** deployment targets' owning account. Note this in `NEXT_SESSION.md` as a pending manual step if it can't be done immediately.

---

### Task 4: Escape avatar URLs (stored XSS + CSS-injection hardening)

**Files:**
- Modify: `Index.html:5622-5626` (add a small CSS-url helper next to `getAvatarUrl`)
- Modify: `Index.html:9291`, `Index.html:9524` (real HTML-attribute injection — must use `escapeHtml`)
- Modify: `Index.html:7477`, `Index.html:15090`, `Index.html:15112`, `Index.html:15361` (CSS `url(...)` construction — not exploitable as script injection since these are `.style.backgroundImage =` property assignments, not innerHTML, but an unescaped `"`/`\`/`)` in a custom avatar URL can still corrupt the CSS value or fail to load; hardened for correctness/consistency)

**Root cause:** `getAvatarUrl(name, meta)` returns `meta.trim()` verbatim when a player has a custom avatar URL configured (`Index.html:5622-5626`). That `meta` value is free text — `apiManageEntity` (`Code.gs:2462`) writes whatever `newMeta` the client sends for a Player, with no URL validation. Two places inject the result directly into an HTML attribute via template literal (`<img src="${getAvatarUrl(...)}">`) with no escaping — a player could set their own avatar URL to something like `x" onerror="…` and get it rendered unescaped into another user's DOM. Four more places build a CSS `background-image: url(...)` value by string concatenation with no escaping.

**Interfaces:**
- Consumes: `getAvatarUrl(name, meta)` (unchanged signature/behavior).
- Produces: new `cssUrl(url)` helper → CSS-safe `url("...")` string.

- [ ] **Step 1: Add the `cssUrl` helper**

In `Index.html`, right after the existing `getAvatarUrl` function (`Index.html:5622-5626`):

```js
  function getAvatarUrl(name, meta) {
    if (meta && meta.trim()) return meta.trim();
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) +
           '&background=2a313d&color=e0e6ed&bold=true&size=64';
  }

  function cssUrl(url) {
    return 'url("' + String(url || '').replace(/["\\]/g, '\\$&') + '")';
  }
```

- [ ] **Step 2: Fix the two real HTML-injection spots**

In `Index.html:9291`, replace:

```js
            <img src="${getAvatarUrl(l.player, playerObj ? playerObj.meta : '')}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">
```

with:

```js
            <img src="${escapeHtml(getAvatarUrl(l.player, playerObj ? playerObj.meta : ''))}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">
```

In `Index.html:9524`, replace:

```js
                <img src="${getAvatarUrl(e.player, pl ? pl.meta : '')}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">
```

with:

```js
                <img src="${escapeHtml(getAvatarUrl(e.player, pl ? pl.meta : ''))}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">
```

- [ ] **Step 3: Harden the four CSS `background-image` spots**

In `Index.html:7477`, replace:

```js
          catBg.style.backgroundImage = 'url(' + getAvatarUrl(item.topPlayer, catPlayer ? catPlayer.meta : '') + ')';
```

with:

```js
          catBg.style.backgroundImage = cssUrl(getAvatarUrl(item.topPlayer, catPlayer ? catPlayer.meta : ''));
```

In `Index.html:15090`, replace:

```js
    flashAvatarBg.style.backgroundImage = 'url(' + getAvatarUrl(_flashPlayer, _initFlashPlayer ? _initFlashPlayer.meta : '') + ')';
```

with:

```js
    flashAvatarBg.style.backgroundImage = cssUrl(getAvatarUrl(_flashPlayer, _initFlashPlayer ? _initFlashPlayer.meta : ''));
```

In `Index.html:15112`, replace:

```js
        flashAvatarBg.style.backgroundImage = 'url(' + getAvatarUrl(p.name, p.meta) + ')';
```

with:

```js
        flashAvatarBg.style.backgroundImage = cssUrl(getAvatarUrl(p.name, p.meta));
```

In `Index.html:15361`, replace:

```js
    noteBg.style.backgroundImage = 'url(' + getAvatarUrl(note.player, notePlayer ? notePlayer.meta : '') + ')';
```

with:

```js
    noteBg.style.backgroundImage = cssUrl(getAvatarUrl(note.player, notePlayer ? notePlayer.meta : ''));
```

- [ ] **Step 4: Manual verification in the frontend preview harness**

There is no automated DOM test harness for `Index.html` (`tests/frontend/serve.js` serves it for manual/browser checks; `tests/check-html-syntax.js` only checks syntax). Run:

Run: `npm run check:html`
Expected: PASS (no syntax break from the edits).

Then start the preview (`preview_start` with `serve:front`), open Historique and the Alt Top detail view, confirm avatars still render normally for existing players. Then, in Paramètres → Joueurs, temporarily set a test player's avatar URL to `x" onerror="alert(1)` (on the **local harness fixture data only**, never on a real deployed Sheet), reload Historique/Alt detail, and confirm no `alert` fires and the broken image just shows as a broken image (proof the escaping works) — then revert the test value.

- [ ] **Step 5: Update CHANGELOG.md**

```markdown
## [v3.20.6] - 2026-08-25

### Corrigé
**Humanisé** : Un joueur pouvait, en réglant son propre avatar sur une adresse bricolée, faire exécuter du code dans le navigateur d'un autre joueur qui consultait l'Historique ou le détail d'un Top Alternatif.
**Technique** : `getAvatarUrl()` retourne du texte libre (`Players.meta`, jamais validé côté serveur) injecté sans échappement dans deux `<img src="${...}">` (`Index.html:9291`, `9524`) — faille XSS stockée, corrigée par `escapeHtml()`. Quatre constructions `style.backgroundImage = 'url(' + ... + ')'` (non exploitables en XSS — ce sont des affectations de propriété CSSOM, pas de l'innerHTML — mais fragiles si l'URL contient `"`/`\`) durcies via un nouveau helper `cssUrl()`.
```

- [ ] **Step 6: Commit and push**

```bash
git add Index.html CHANGELOG.md
git commit -m "fix(security): escape player-controlled avatar URLs (stored XSS)"
git push
```

---

### Task 5: Hash Players passwords server-side (with transparent migration)

**Files:**
- Modify: `Code.gs:248` area (new `_hashPassword` helper) and `Code.gs:755-767` (`SettingsService.verifyIdentity`)
- Modify: `tests/harness.js` (add `Utilities.computeDigest`/`DigestAlgorithm`/`Charset` to the `Utilities` fake)
- Test: `tests/identity.test.js`

**Root cause:** `Players` column D stores passwords in plain text (confirmed: `SettingsService.verifyIdentity`, `Code.gs:754-767`, does a direct string comparison against the raw cell value). There is no in-app UI to set a password — it's typed directly into the Sheet by the project owner — so the only code path that ever reads/writes that cell is `verifyIdentity` itself, which makes a lazy migrate-on-next-successful-check the right (and only necessary) fix: no one-off migration script, no admin tooling, nothing that touches real data outside normal app usage.

**Interfaces:**
- Produces: `_hashPassword(password)` → 64-char lowercase hex SHA-256 digest.
- `SettingsService.verifyIdentity(name, password)` keeps its exact existing signature and return contract (`boolean`, throws on unknown player).

- [ ] **Step 1: Add `Utilities.computeDigest` to the test harness**

In `tests/harness.js`, inside `gasMocks()`, replace:

```js
    Utilities: {
      getUuid: () => crypto.randomUUID()
    },
```

with:

```js
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeDigest: (algorithm, value) => {
        const hash = crypto.createHash('sha256').update(value, 'utf8').digest();
        // Real Apps Script returns a Java byte[] — signed bytes (-128..127), not
        // unsigned 0..255. Mirrored here so a masking bug (`& 0xFF`) in the
        // production hashing code would actually show up under test.
        return Array.from(hash).map(b => (b > 127 ? b - 256 : b));
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' }
    },
```

- [ ] **Step 2: Write the failing test**

Add to `tests/identity.test.js`, after the existing 4 test blocks (before `console.log('identity.test.js OK');`):

```js
// Passwords are hashed at rest, and migrated transparently from legacy plaintext
{
  const ctx = makeContext();
  const players = ctx.ConfigService.getSheets().players;
  assert.strictEqual(players._grid[1][3], 'sesame', 'fixture starts with a legacy plaintext password');

  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'sesame'), true);

  assert.notStrictEqual(players._grid[1][3], 'sesame',
    'the cell must no longer hold the plaintext password after a successful check');
  assert.match(players._grid[1][3], /^[0-9a-f]{64}$/i, 'migrated value must be a SHA-256 hex digest');

  // The migrated hash keeps working on every later check, including a bad one.
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'sesame'), true);
  assert.strictEqual(ctx.SettingsService.verifyIdentity('Alice', 'wrong'), false);
}
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- --test-name-pattern "identity"` (this file uses plain top-level asserts, not `node:test` — run: `node tests/identity.test.js`)
Expected: FAIL on the `assert.notStrictEqual` line — the cell still holds `'sesame'` verbatim.

- [ ] **Step 4: Add the hashing helper**

In `Code.gs`, right after `requireAuthor`/before `fail` (i.e. after `Code.gs:251`):

```js
function _hashPassword(password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}
```

- [ ] **Step 5: Rewrite `verifyIdentity`**

In `Code.gs`, replace:

```js
  verifyIdentity(name, password) {
    const sheet = ConfigService.getSheets().players;
    const data  = sheet.getDataRange().getValues();
    const off   = _headerOffsetFromValues('players', data);
    for (let i = off; i < data.length; i++) {
      if (data[i][0] === name) {
        const stored = data[i][3] ? data[i][3].toString().trim() : "";
        if (!stored) return true; // no password configured → free access
        return stored === (password || "").toString().trim();
      }
    }
    throw new Error(`Joueur "${name}" introuvable.`);
  },
```

with:

```js
  verifyIdentity(name, password) {
    const sheet = ConfigService.getSheets().players;
    const data  = sheet.getDataRange().getValues();
    const off   = _headerOffsetFromValues('players', data);
    for (let i = off; i < data.length; i++) {
      if (data[i][0] === name) {
        const stored = data[i][3] ? data[i][3].toString().trim() : "";
        if (!stored) return true; // no password configured → free access
        const supplied = (password || "").toString().trim();
        if (/^[0-9a-f]{64}$/i.test(stored)) {
          return stored.toLowerCase() === _hashPassword(supplied);
        }
        // Legacy plaintext password: accept on a plain match, then migrate the
        // cell to a hash so the plaintext value is never written back again.
        if (stored === supplied) {
          sheet.getRange(i + 1, 4).setValue(_hashPassword(supplied));
          return true;
        }
        return false;
      }
    }
    throw new Error(`Joueur "${name}" introuvable.`);
  },
```

- [ ] **Step 6: Run the identity tests again**

Run: `node tests/identity.test.js`
Expected: `identity.test.js OK` — the new assertions pass, and (verify by reading, no action needed) every pre-existing assertion in that file still holds: the plaintext-fixture checks (`Alice`/`sesame`, `Chloé`/`'  pad  '`) migrate transparently on first use and keep returning the same booleans afterward; `Bob` (no password) and the rename test are untouched by this change.

- [ ] **Step 7: Run the full suite**

Run: `npm run verify`
Expected: PASS, no regressions (no other test writes a `Players` password column and re-reads it raw).

- [ ] **Step 8: Update CHANGELOG.md**

```markdown
## [v3.20.7] - 2026-08-25

### Corrigé
**Humanisé** : Les mots de passe des joueurs étaient stockés en clair dans le Google Sheet, lisibles par quiconque ouvre le fichier.
**Technique** : `SettingsService.verifyIdentity` (`Code.gs:755`) hache désormais en SHA-256 (`Utilities.computeDigest`). Migration transparente : un mot de passe legacy en clair est accepté une dernière fois puis immédiatement réécrit en hash — aucun script de migration séparé, aucune manipulation manuelle du Sheet réel. `tests/harness.js` : `Utilities.computeDigest` ajouté à la sandbox de test.
```

- [ ] **Step 9: Commit and push**

```bash
git add Code.gs tests/harness.js tests/identity.test.js CHANGELOG.md
git commit -m "fix(security): hash Players passwords at rest, migrate legacy plaintext transparently"
git push
```

---

### Task 6: Batch the manual-reorder writes (Players/Categories, Bareme, Phrases)

**Files:**
- Modify: `Code.gs:775-794` (`SettingsService.reorderEntities`)
- Modify: `Code.gs:2208-2223` (`BaremeService.reorderEntries`)
- Modify: `Code.gs:2346-2361` (`PhrasesService.reorderPhrases`)
- Test: `tests/reorder.test.js` (existing tests must keep passing unchanged — they already assert the externally-visible behavior this task must preserve)

**Root cause:** All three functions persist a drag-and-drop reorder with one `sheet.getRange(row, col).setValue(...)` **per row**, i.e. one Sheets RPC per moved item instead of one for the whole operation.

**Explicitly out of scope (documented, not silently dropped):** `apiRepairOrder` (`Code.gs:4016`) has the same per-row `setValue` pattern across multiple independent groups in two sheets — it's an admin/maintenance tool invoked rarely on demand, not a per-interaction hot path like the three functions above; batching it correctly (per-group, cross-sheet) adds real complexity for a function that isn't the actual UX pain point. Same reasoning for the `sheet.deleteRow()` loops in `fixZeroPoints`/`deleteOrphans`/`deletePreset` — they already iterate bottom-up (the correct/safe pattern for in-place row deletion) and are also rare admin actions, not click-driven reorders.

**Interfaces:**
- All three keep their exact existing signatures and throw/return contracts — only the write strategy changes (N `setValue` calls → 1 `setValues` call each).

- [ ] **Step 1: Confirm current behavior with the existing tests (baseline)**

Run: `npm test -- --test-name-pattern "reorder"`
Expected: PASS (this is the safety net the rewrite must not break — no new test needed, the existing suite already covers full-permutation reorder, duplicate names, stale-client rejection, and group-scoped isolation for Bareme/Phrases).

- [ ] **Step 2: Batch `SettingsService.reorderEntities`**

In `Code.gs`, replace:

```js
  reorderEntities(type, orderedRowIndexes, expectedNames) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    const off   = _headerOffsetFromValues(type.toLowerCase(), data);
    const validRowIndexes = [];
    for (let i = off; i < data.length; i++) if (data[i][0]) validRowIndexes.push(i + 1);
    const wanted = orderedRowIndexes.map(Number);
    const isPermutation = wanted.length === validRowIndexes.length &&
      validRowIndexes.every(r => wanted.includes(r)) &&
      new Set(wanted).size === wanted.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux éléments existants — recharge la page et réessaie.");
    if (wanted.some(r => r < 1 + off)) throw new Error("Ligne invalide.");
    wanted.forEach((rowIndex, i) => {
      if (data[rowIndex - 1][0] !== expectedNames[i]) {
        throw new Error("Cette liste a changé entre-temps — recharge la page et réessaie.");
      }
    });
    wanted.forEach((rowIndex, i) => sheet.getRange(rowIndex, 5).setValue(i + 1));
    _bumpSettingsVersion();
  }
```

with:

```js
  reorderEntities(type, orderedRowIndexes, expectedNames) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    const off   = _headerOffsetFromValues(type.toLowerCase(), data);
    const validRowIndexes = [];
    for (let i = off; i < data.length; i++) if (data[i][0]) validRowIndexes.push(i + 1);
    const wanted = orderedRowIndexes.map(Number);
    const isPermutation = wanted.length === validRowIndexes.length &&
      validRowIndexes.every(r => wanted.includes(r)) &&
      new Set(wanted).size === wanted.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux éléments existants — recharge la page et réessaie.");
    if (wanted.some(r => r < 1 + off)) throw new Error("Ligne invalide.");
    wanted.forEach((rowIndex, i) => {
      if (data[rowIndex - 1][0] !== expectedNames[i]) {
        throw new Error("Cette liste a changé entre-temps — recharge la page et réessaie.");
      }
    });
    const newOrdre = {};
    wanted.forEach((rowIndex, i) => { newOrdre[rowIndex] = i + 1; });
    const firstRow = 1 + off;
    const column = [];
    for (let r = firstRow; r <= data.length; r++) {
      column.push([r in newOrdre ? newOrdre[r] : data[r - 1][4]]);
    }
    sheet.getRange(firstRow, 5, column.length, 1).setValues(column);
    _bumpSettingsVersion();
  }
```

- [ ] **Step 3: Batch `BaremeService.reorderEntries`**

In `Code.gs`, replace:

```js
  reorderEntries(topName, orderedRowIndexes) {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    const data = sheet.getDataRange().getValues();
    const groupRows = [];
    for (let i = _headerOffsetFromValues('bareme', data); i < data.length; i++) {
      if (data[i][0] === topName) groupRows.push(i + 1);
    }
    const wanted = orderedRowIndexes.map(Number);
    const isPermutation = wanted.length === groupRows.length &&
      groupRows.every(r => wanted.includes(r)) &&
      new Set(wanted).size === wanted.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux règles existantes de ce Top.");
    wanted.forEach((rowIndex, i) => sheet.getRange(rowIndex, 4).setValue(i + 1));
    _bumpBaremeVersion();
  }
```

with:

```js
  reorderEntries(topName, orderedRowIndexes) {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    const data = sheet.getDataRange().getValues();
    const off = _headerOffsetFromValues('bareme', data);
    const groupRows = [];
    for (let i = off; i < data.length; i++) {
      if (data[i][0] === topName) groupRows.push(i + 1);
    }
    const wanted = orderedRowIndexes.map(Number);
    const isPermutation = wanted.length === groupRows.length &&
      groupRows.every(r => wanted.includes(r)) &&
      new Set(wanted).size === wanted.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux règles existantes de ce Top.");
    const newOrdre = {};
    wanted.forEach((rowIndex, i) => { newOrdre[rowIndex] = i + 1; });
    const firstRow = 1 + off;
    const column = [];
    for (let r = firstRow; r <= data.length; r++) {
      column.push([r in newOrdre ? newOrdre[r] : data[r - 1][3]]);
    }
    sheet.getRange(firstRow, 4, column.length, 1).setValues(column);
    _bumpBaremeVersion();
  }
```

- [ ] **Step 4: Batch `PhrasesService.reorderPhrases`**

In `Code.gs`, replace:

```js
  reorderPhrases(preset, pool, orderedRowIndexes) {
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    const data = sheet.getDataRange().getValues();
    const groupRows = [];
    for (let i = _headerOffsetFromValues('phrases', data); i < data.length; i++) {
      if (data[i][0] === preset && data[i][1] === pool) groupRows.push(i + 1);
    }
    const wanted = orderedRowIndexes.map(Number);
    const isPermutation = wanted.length === groupRows.length &&
      groupRows.every(r => wanted.includes(r)) &&
      new Set(wanted).size === wanted.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux phrases existantes de ce pool.");
    wanted.forEach((rowIndex, i) => sheet.getRange(rowIndex, 4).setValue(i + 1));
    _bumpPhrasesVersion();
  }
```

with:

```js
  reorderPhrases(preset, pool, orderedRowIndexes) {
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    const data = sheet.getDataRange().getValues();
    const off = _headerOffsetFromValues('phrases', data);
    const groupRows = [];
    for (let i = off; i < data.length; i++) {
      if (data[i][0] === preset && data[i][1] === pool) groupRows.push(i + 1);
    }
    const wanted = orderedRowIndexes.map(Number);
    const isPermutation = wanted.length === groupRows.length &&
      groupRows.every(r => wanted.includes(r)) &&
      new Set(wanted).size === wanted.length;
    if (!isPermutation) throw new Error("La nouvelle liste ne correspond pas aux phrases existantes de ce pool.");
    const newOrdre = {};
    wanted.forEach((rowIndex, i) => { newOrdre[rowIndex] = i + 1; });
    const firstRow = 1 + off;
    const column = [];
    for (let r = firstRow; r <= data.length; r++) {
      column.push([r in newOrdre ? newOrdre[r] : data[r - 1][3]]);
    }
    sheet.getRange(firstRow, 4, column.length, 1).setValues(column);
    _bumpPhrasesVersion();
  }
```

- [ ] **Step 5: Run the reorder tests again**

Run: `npm test -- --test-name-pattern "reorder"`
Expected: PASS, unchanged — including `'reorderEntities never faults on duplicate names'`, `'BaremeService.reorderEntries only touches rows within the given Top group'`, and `'PhrasesService.reorderPhrases only touches rows within the given preset+pool group'` (these three specifically prove the batched rewrite preserves untouched rows/groups correctly).

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 7: Update CHANGELOG.md**

```markdown
## [v3.20.8] - 2026-08-25

### Corrigé
**Humanisé** : Réordonner une longue liste de joueurs, de Tops, de règles de barème ou de phrases (glisser-déposer) pouvait ralentir sensiblement à chaque étape, à cause d'un aller-retour réseau par élément déplacé.
**Technique** : `SettingsService.reorderEntities`, `BaremeService.reorderEntries`, `PhrasesService.reorderPhrases` (`Code.gs`) passent d'un `setValue()` par ligne à un seul `setValues()` sur la colonne Ordre complète. `apiRepairOrder` et les boucles `deleteRow()` (admin, rares) restent inchangés — hors périmètre de ce fix, voir le plan.
```

- [ ] **Step 8: Commit and push**

```bash
git add Code.gs CHANGELOG.md
git commit -m "perf(reorder): batch Ordre column writes into a single setValues call"
git push
```

---

### Task 7: Chunk the full-history cache (mirror the existing changelog pattern)

**Files:**
- Modify: `Code.gs:945-959` (`StorageService.getFullHistoryRowsCached`)
- Test: `tests/cache.test.js`

**Root cause:** `getFullHistoryRowsCached` silently skips caching entirely once the serialized payload exceeds `CONFIG.CACHE_MAX_BYTES` (95 000 bytes) — every page load re-reads the whole History sheet. The exact same problem was already solved for the changelog cache (`apiGetChangelog`, `Code.gs:4235-4283`) by splitting the payload into ~90 000-byte chunks stored under separate cache keys. This task applies the same pattern here.

**Interfaces:**
- `StorageService.getFullHistoryRowsCached()` keeps its exact signature and return shape (`Array<{date: Date, player, category, points, description, groupId, saiseur, rowIndex}>`).

- [ ] **Step 1: Write the failing test**

Add to `tests/cache.test.js` (near the existing `CACHE_MAX_BYTES` test, reusing its `HEADER`/`D()` helpers already in that file):

```js
test('getFullHistoryRowsCached chunks an oversized payload instead of skipping the cache', () => {
  const gas = loadGas();
  const history = makeSheet([HEADER,
    [D('2026-08-01'), 'Alice', 'Jeux', 5, 'ok', ''],
    [D('2026-08-02'), 'Bob',   'Jeux', 3, 'ok', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  gas.CONFIG.CACHE_MAX_BYTES = 1; // force "oversized" without needing a huge fixture
  const before = gas.StorageService.getFullHistoryRowsCached();
  assert.strictEqual(before.length, 2);

  // A second call must be served from the chunked cache, not a fresh sheet read —
  // prove it by breaking the sheet read and confirming the result is still correct.
  gas.ConfigService.getSheets = () => { throw new Error('sheet should not be re-read — cache miss'); };
  const after = gas.StorageService.getFullHistoryRowsCached();
  assert.strictEqual(after.length, 2);
  assert.strictEqual(after[0].player, 'Alice');
  assert.ok(after[0].date instanceof Date);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- --test-name-pattern "getFullHistoryRowsCached chunks"`
Expected: FAIL — the second call throws `sheet should not be re-read`, because today's code skips the cache write entirely above `CACHE_MAX_BYTES` and falls back to a fresh sheet read every time.

- [ ] **Step 3: Chunk the cache write/read**

In `Code.gs`, replace:

```js
  getFullHistoryRowsCached() {
    const cache = CacheService.getScriptCache();
    const key   = 'hist_full_v' + _logsVersion();
    const raw   = cache.get(key);
    if (raw) {
      try {
        return JSON.parse(raw).map(r => Object.assign({}, r, { date: new Date(r.date) }));
      } catch (e) { /* corrupt entry → fall through to a fresh read */ }
    }
    const result = this._readFullHistoryRows();
    const serial = JSON.stringify(result.map(r => Object.assign({}, r, { date: r.date.toISOString() })));
    if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
    else _logCacheSkip(key, serial.length);
    return result;
  },
```

with:

```js
  getFullHistoryRowsCached() {
    const cache = CacheService.getScriptCache();
    const key   = 'hist_full_v' + _logsVersion();
    const raw   = cache.get(key);
    if (raw) {
      try {
        return JSON.parse(raw).map(r => Object.assign({}, r, { date: new Date(r.date) }));
      } catch (e) { /* corrupt entry → fall through to a fresh read */ }
    }
    const chunkCountStr = cache.get(key + '_chunks');
    if (chunkCountStr) {
      try {
        const chunkCount = parseInt(chunkCountStr, 10);
        let fullJson = '';
        let valid = true;
        for (let i = 0; i < chunkCount; i++) {
          const chunk = cache.get(key + '_' + i);
          if (chunk) { fullJson += chunk; } else { valid = false; break; }
        }
        if (valid && fullJson) {
          return JSON.parse(fullJson).map(r => Object.assign({}, r, { date: new Date(r.date) }));
        }
      } catch (e) { /* corrupt chunk set → fall through to a fresh read */ }
    }
    const result = this._readFullHistoryRows();
    const serial = JSON.stringify(result.map(r => Object.assign({}, r, { date: r.date.toISOString() })));
    const chunkSize = 90000;
    try {
      if (serial.length <= chunkSize) {
        cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
      } else {
        const chunkCount = Math.ceil(serial.length / chunkSize);
        cache.put(key + '_chunks', String(chunkCount), CONFIG.CACHE_TTL_SECONDS);
        for (let i = 0; i < chunkCount; i++) {
          cache.put(key + '_' + i, serial.slice(i * chunkSize, (i + 1) * chunkSize), CONFIG.CACHE_TTL_SECONDS);
        }
      }
    } catch (cacheWriteErr) { _logCacheSkip(key, serial.length); }
    return result;
  },
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- --test-name-pattern "getFullHistoryRowsCached"`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: PASS — in particular re-check `tests/cache.test.js`'s existing `'a payload above CACHE_MAX_BYTES is not cached, and the skip is traced'` test: it targets `StorageService.getAllLogs()`, a different function untouched by this task, so it must still pass unchanged.

- [ ] **Step 6: Update CHANGELOG.md**

```markdown
## [v3.20.9] - 2026-08-25

### Corrigé
**Humanisé** : Une fois l'historique assez volumineux, la mise en cache se désactivait silencieusement — chaque changement d'onglet relisait tout le Google Sheet au lieu d'utiliser la copie rapide en mémoire.
**Technique** : `StorageService.getFullHistoryRowsCached` (`Code.gs:945`) découpe désormais le payload en morceaux de 90 000 caractères sur plusieurs clés `CacheService`, même pattern que `apiGetChangelog` (`Code.gs:4235`), au lieu d'abandonner la mise en cache au-delà de `CACHE_MAX_BYTES`.
```

- [ ] **Step 7: Commit and push**

```bash
git add Code.gs tests/cache.test.js CHANGELOG.md
git commit -m "perf(cache): chunk the full-history cache instead of skipping it when oversized"
git push
```

---

### Task 8: Real server-side authorization on every mutating endpoint

**Files:**
- Modify: `Code.gs:248-251` (`requireAuthor`) and 45 `api*` function signatures (table below)
- Modify: `AutoPoints.gs` — 4 `api*` function signatures (table below)
- Modify: `Index.html` — 5 small edits (`_identityPassword` state, `callServer`, `submitIdentityPwd`, the password-less identity-picker branch, `renderWhoAmI`'s stale-identity auto-clear)
- Test: `tests/identity.test.js`, `tests/reorder.test.js`

**Root cause:** `context.md` §7 already mandates that "toute action qui modifie des données... doit passer par la vérification d'identité (`requireIdentity()`) avant exécution" — but `requireIdentity()` (`Index.html:5538-5549`) only checks that a name has been picked (`_whoAmI` is truthy), never a password, and the actual password check (`apiVerifyIdentity`) only ever runs once, at identity-selection time, in the browser — never on the mutating call itself. Server-side, `requireAuthor(author)` (`Code.gs:248-251`) only checks that `author` is a non-empty string. Net effect: any client can call any mutating `api*` function claiming to be any player — e.g. via the browser console, bypassing the UI entirely — password or not. This task makes `requireAuthor` actually verify the password server-side for players who have one configured (players without a password keep today's "free access" behavior unchanged, per the existing documented semantics of `verifyIdentity`).

**Design (kept deliberately simple — no session tokens, no new secret storage):** every mutating `api*` function gains one new **trailing** parameter, `password`. The single centralized `callServer()` wrapper in `Index.html` — already the sole path for every `google.script.run` call — appends a module-level `_identityPassword` variable as an extra trailing argument to every call, so **no individual call site's own argument list needs to change**. `_identityPassword` is set once, in memory only (never persisted to `localStorage` — this task also just fixed a stored-XSS vector in Task 4; caching a reusable plaintext secret in browser storage right after would be inconsistent), whenever the existing password-check modal succeeds. On reload, `_whoAmI` (the name) is restored from `localStorage` as today, but `_identityPassword` is not — the first mutating action for a password-protected identity will then be cleanly rejected server-side with an actionable message, and the user re-selects their identity (2 clicks). Players without a password never notice any of this.

**Interfaces:**
- `requireAuthor(author, password)` → `string` (the trimmed author name) on success, throws `Error` otherwise. **Behavioral change:** now actually verifies `password` via `SettingsService.verifyIdentity` when `author` has one configured; unchanged (always allow) when they don't.
- Every function in the table below gains `password` as its new last parameter, threaded straight into its own `requireAuthor(author, password)` call — no other body logic changes.

- [ ] **Step 1: Rewrite `requireAuthor`**

In `Code.gs`, replace:

```js
function requireAuthor(author) {
  if (!author || !String(author).trim()) throw new Error("Identité requise pour cette action.");
  return String(author).trim();
}
```

with:

```js
function requireAuthor(author, password) {
  const name = author ? String(author).trim() : '';
  if (!name) throw new Error("Identité requise pour cette action.");
  let ok;
  try { ok = SettingsService.verifyIdentity(name, password); }
  catch (e) { ok = false; } // unknown/renamed-away player → never authorized
  if (!ok) throw new Error("Mot de passe invalide ou requis pour agir en tant que " + name + " — resélectionne ton identité.");
  return name;
}
```

- [ ] **Step 2: Append `password` to every mutating function's signature**

45 functions in `Code.gs`, 4 in `AutoPoints.gs` — one parameter added at the very end of each (never next to `author`, so any old positional call that omits it still works with `password === undefined`, which `requireAuthor` treats as "no password supplied"). Apply exactly these signature changes (old → new, matched by current line number — re-`grep -n "^function api"` first if any line numbers have drifted since this plan was written):

| # | File | Line | Old signature tail | New signature tail |
|---|------|------|---------------------|----------------------|
| 1 | Code.gs | 2068 | `(title, logoUrl, author)` | `(title, logoUrl, author, password)` |
| 2 | Code.gs | 2081 | `(prefsJson, author)` | `(prefsJson, author, password)` |
| 3 | Code.gs | 2370 | `(top, action, pts, author)` | `(top, action, pts, author, password)` |
| 4 | Code.gs | 2386 | `(topName, orderedRowIndexes, author)` | `(topName, orderedRowIndexes, author, password)` |
| 5 | Code.gs | 2400 | `(rowIndex, action, pts, author)` | `(rowIndex, action, pts, author, password)` |
| 6 | Code.gs | 2418 | `(rowIndex, author)` | `(rowIndex, author, password)` |
| 7 | Code.gs | 2434 | `(type, rowIndex, expectedName, color, author)` | `(type, rowIndex, expectedName, color, author, password)` |
| 8 | Code.gs | 2462 | `(action, type, newName, newMeta, oldName, newIcon, author, rowIndex)` | `(action, type, newName, newMeta, oldName, newIcon, author, rowIndex, password)` |
| 9 | Code.gs | 2513 | `(type, orderedRowIndexes, expectedNames, author)` | `(type, orderedRowIndexes, expectedNames, author, password)` |
| 10 | Code.gs | 2537 | `(plan, author)` | `(plan, author, password)` |
| 11 | Code.gs | 2664 | `(rowIndexes, author)` | `(rowIndexes, author, password)` |
| 12 | Code.gs | 2776 | `(author, entries)` | `(author, entries, password)` |
| 13 | Code.gs | 2789 | `(author, altCategory, rowIndex, guard)` | `(author, altCategory, rowIndex, guard, password)` |
| 14 | Code.gs | 2809 | `(author, list)` | `(author, list, password)` |
| 15 | Code.gs | 2820 | `(author, rowIndices, altCategory)` | `(author, rowIndices, altCategory, password)` |
| 16 | Code.gs | 2831 | `(author, rowIndices, altCategory)` | `(author, rowIndices, altCategory, password)` |
| 17 | Code.gs | 2855 | `(author)` | `(author, password)` |
| 18 | Code.gs | 2985 | `(auditRowId, author)` | `(auditRowId, author, password)` |
| 19 | Code.gs | 2992 | `(author)` | `(author, password)` |
| 20 | Code.gs | 3006 | `(author)` | `(author, password)` |
| 21 | Code.gs | 3020 | `(author)` | `(author, password)` |
| 22 | Code.gs | 3045 | `(author)` | `(author, password)` |
| 23 | Code.gs | 3130 | `(rowIndex, description, author)` | `(rowIndex, description, author, password)` |
| 24 | Code.gs | 3147 | `(rowIndex, fields, author)` | `(rowIndex, fields, author, password)` |
| 25 | Code.gs | 3181 | `(player, text, dateStr, author)` | `(player, text, dateStr, author, password)` |
| 26 | Code.gs | 3196 | `(rowIndex, author)` | `(rowIndex, author, password)` |
| 27 | Code.gs | 3236 | `(rowIndex, newText, author)` | `(rowIndex, newText, author, password)` |
| 28 | Code.gs | 3263 | `(text, replyToId, author)` | `(text, replyToId, author, password)` |
| 29 | Code.gs | 3278 | `(id, author)` | `(id, author, password)` |
| 30 | Code.gs | 3291 | `(rowIndexes, partialFields, author)` | `(rowIndexes, partialFields, author, password)` |
| 31 | Code.gs | 3489 | `(lotsToGroup, author)` | `(lotsToGroup, author, password)` |
| 32 | Code.gs | 3515 | `(rowIndexes, author)` | `(rowIndexes, author, password)` |
| 33 | Code.gs | 3540 | `(groupId, author)` | `(groupId, author, password)` |
| 34 | Code.gs | 3744 | `(rowIndex, author)` | `(rowIndex, author, password)` |
| 35 | Code.gs | 3758 | `(groupId, author)` | `(groupId, author, password)` |
| 36 | Code.gs | 3873 | `(fixes, author)` | `(fixes, author, password)` |
| 37 | Code.gs | 4002 | `(preset, pool, orderedRowIndexes, author)` | `(preset, pool, orderedRowIndexes, author, password)` |
| 38 | Code.gs | 4016 | `(author)` | `(author, password)` |
| 39 | Code.gs | 4084 | `(preset, pool, text, author)` | `(preset, pool, text, author, password)` |
| 40 | Code.gs | 4100 | `(entries, author)` | `(entries, author, password)` |
| 41 | Code.gs | 4120 | `(rowIndex, text, author)` | `(rowIndex, text, author, password)` |
| 42 | Code.gs | 4138 | `(rowIndex, author)` | `(rowIndex, author, password)` |
| 43 | Code.gs | 4154 | `(presetName, author)` | `(presetName, author, password)` |
| 44 | Code.gs | 4177 | `(oldName, newName, author)` | `(oldName, newName, author, password)` |
| 45 | Code.gs | 4214 | `(name, author)` | `(name, author, password)` |
| 46 | AutoPoints.gs | 321 | `(rule, author)` | `(rule, author, password)` |
| 47 | AutoPoints.gs | 333 | `(id, patch, author)` | `(id, patch, author, password)` |
| 48 | AutoPoints.gs | 344 | `(id, author)` | `(id, author, password)` |
| 49 | AutoPoints.gs | 355 | `(enabled, author)` | `(enabled, author, password)` |

- [ ] **Step 3: Thread `password` into every `requireAuthor` call**

Every one of the 49 functions above calls `requireAuthor(author);` as its first line, and the text of that call is byte-for-byte identical at all 49 sites in both files (confirmed by grep before writing this plan). Do a project-wide literal replace, scoped to `Code.gs` and `AutoPoints.gs` only:

Find: `requireAuthor(author);`
Replace: `requireAuthor(author, password);`

Expected: exactly 49 replacements (45 in `Code.gs`, 4 in `AutoPoints.gs`). Re-`grep -n "requireAuthor(author);" Code.gs AutoPoints.gs` afterward — it must return zero matches (every call site now passes `password`), and `grep -n "requireAuthor(author, password);" Code.gs AutoPoints.gs` must return exactly 49.

- [ ] **Step 4: Wire the client — add `_identityPassword` state**

In `Index.html`, right after the existing `_whoAmI` declaration:

```js
  const WHO_AM_I_KEY = 'tdt_who_am_i';
  let _whoAmI = localStorage.getItem(WHO_AM_I_KEY) || null;
  let _identityPassword = ''; // memory-only — never persisted (see Task 8 rationale)
```

- [ ] **Step 5: Wire the client — `callServer` appends the cached password**

In `Index.html`, in `callServer`, replace the last line of the function:

```js
    runner[fn](...params);
```

with:

```js
    runner[fn](...params, _identityPassword);
```

- [ ] **Step 6: Wire the client — cache the password on a successful check**

In `Index.html`, in `submitIdentityPwd`, replace:

```js
      if (res && res.granted) {
        applyIdentity(player.name);
        closeIdentityPwdModal();
        showToast(`Identité confirmée : ${player.name}`, 'success');
```

with:

```js
      if (res && res.granted) {
        _identityPassword = pwd;
        applyIdentity(player.name);
        closeIdentityPwdModal();
        showToast(`Identité confirmée : ${player.name}`, 'success');
```

- [ ] **Step 7: Wire the client — password-less identity pick**

In `Index.html`, in the identity-dropdown option click handler, replace:

```js
        if (p.hasPassword) {
          wrap.classList.remove('open');
          openIdentityPwdModal(p);
        } else {
          applyIdentity(p.name);
        }
```

with:

```js
        if (p.hasPassword) {
          wrap.classList.remove('open');
          openIdentityPwdModal(p);
        } else {
          _identityPassword = '';
          applyIdentity(p.name);
        }
```

- [ ] **Step 8: Wire the client — clear the cached password when the stale identity auto-clears**

In `Index.html`, in `renderWhoAmI`, replace:

```js
    if (_whoAmI && cachedPlayers.length > 0 && !cachedPlayers.find(p => p.name === _whoAmI)) {
      _whoAmI = null;
      localStorage.removeItem(WHO_AM_I_KEY);
    }
```

with:

```js
    if (_whoAmI && cachedPlayers.length > 0 && !cachedPlayers.find(p => p.name === _whoAmI)) {
      _whoAmI = null;
      _identityPassword = '';
      localStorage.removeItem(WHO_AM_I_KEY);
    }
```

- [ ] **Step 9: Write the `requireAuthor` unit tests**

Add to `tests/identity.test.js`, before `console.log('identity.test.js OK');`:

```js
// requireAuthor: real server-side enforcement, not just a UX nag
{
  const ctx = makeContext();
  assert.strictEqual(ctx.requireAuthor('Bob'), 'Bob'); // no password configured → unchanged behavior
  assert.throws(() => ctx.requireAuthor('Alice'), /Mot de passe/); // password configured, none supplied
  assert.throws(() => ctx.requireAuthor('Alice', 'wrong'), /Mot de passe/);
  assert.strictEqual(ctx.requireAuthor('Alice', 'sesame'), 'Alice');
  assert.throws(() => ctx.requireAuthor(''), /Identité requise/);
  assert.throws(() => ctx.requireAuthor('Nobody', 'x'), /Mot de passe/); // unknown player never authorized
}
```

- [ ] **Step 10: Write one end-to-end test proving the wiring, not just the helper**

Add to `tests/reorder.test.js`, right after the existing `'apiReorderEntities requires an author and logs to AuditLog'` test:

```js
test('apiReorderEntities rejects a password-protected author without the correct password', () => {
  const gas = loadGas();
  const players = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
    ['Alice', '', '', 'sesame', 1],
    ['Bob',   '', '', '', 2]
  ]);
  const auditLog = makeSheet([['Timestamp','Auteur','Action','Entité','Avant','Après','Détail','Snapshot','AnnuléLe']]);
  gas.ConfigService.getSheets = () => ({ players, auditLog });
  gas.ConfigService.clearCache = () => {};

  const noPwd = gas.apiReorderEntities('Players', [3, 2], ['Bob', 'Alice'], 'Alice');
  assert.strictEqual(noPwd.success, false);
  assert.match(noPwd.error, /Mot de passe/);
  assert.strictEqual(auditLog._grid.length, 1, 'nothing logged on a rejected call');

  const wrongPwd = gas.apiReorderEntities('Players', [3, 2], ['Bob', 'Alice'], 'Alice', 'nope');
  assert.strictEqual(wrongPwd.success, false);

  const res = gas.apiReorderEntities('Players', [3, 2], ['Bob', 'Alice'], 'Alice', 'sesame');
  assert.strictEqual(res.success, true);
  assert.strictEqual(auditLog._grid.length, 2);
});
```

- [ ] **Step 11: Run the full suite and fix any collateral fixture**

Run: `npm run verify`

Expected: PASS. If any pre-existing test in another file fails here, it is because that test's own `Players` fixture happens to set a non-empty password (column D) on a name it then also uses as the `author` argument to a mutating call, expecting success without supplying that password — this is the one collateral pattern this task can break. Fix it by adding the correct password as the new trailing argument on that specific call, or by leaving that fixture's password column empty if the password value isn't actually the point of that test. Do not weaken `requireAuthor` to work around it.

- [ ] **Step 12: Manual verification in the frontend preview harness**

Start `serve:front`, select an identity that has a password set in the local fixture data, perform one mutating action (e.g. add a note) — confirm it succeeds. Then, using the browser console, call `google.script.run.apiAddNote('SomeOtherProtectedPlayer', 'x', '', 'SomeOtherProtectedPlayer')` (3 args, no password) directly — confirm it now fails with the new "Mot de passe invalide ou requis" error instead of silently succeeding. Reload the page (identity name persists via `localStorage`, password does not) and confirm the first subsequent mutating action fails cleanly rather than silently doing nothing.

- [ ] **Step 13: Update CHANGELOG.md**

```markdown
## [v3.20.10] - 2026-08-25

### Corrigé
**Humanisé** : "Qui suis-je ?" ne vérifiait un mot de passe qu'au moment de choisir son identité dans l'interface — une fois choisie, n'importe qui pouvait ensuite agir au nom de ce joueur sans jamais reproduire le mot de passe (y compris en contournant l'interface). Chaque action qui modifie des données vérifie maintenant réellement le mot de passe côté serveur, pas seulement côté écran.
**Technique** : `requireAuthor(author, password)` (`Code.gs:248`) vérifie désormais via `SettingsService.verifyIdentity` ; inchangé pour les joueurs sans mot de passe configuré. Les 49 fonctions `api*` qui modifient des données (`Code.gs` ×45, `AutoPoints.gs` ×4) reçoivent un paramètre `password` final. Côté client, `callServer()` (point de passage unique de tous les appels serveur) l'ajoute automatiquement à partir d'un état en mémoire (jamais persisté) rempli à la vérification d'identité — aucun site d'appel individuel n'a changé sa propre liste d'arguments.
```

- [ ] **Step 14: Commit and push**

```bash
git add Code.gs AutoPoints.gs Index.html tests/identity.test.js tests/reorder.test.js CHANGELOG.md
git commit -m "fix(security): enforce identity passwords server-side on every mutating endpoint"
git push
```

---

### Task 9: Silence transient errors on background chat polling

**Files:**
- Modify: `Index.html` — `callServer` (builds on Task 8's version), `pollChat`
- No new automated test (this is a UX/notification-timing behavior — verified manually per the existing project convention of manual/harness verification for `Index.html`)

**Root cause:** `pollChat()` (`Index.html:7821-7844`) runs every 4–20s in the background and, on any transient network/quota hiccup, `callServer`'s `withFailureHandler` unconditionally shows a red error toast — interrupting whatever the user is doing (e.g. typing a message) for a background check they didn't initiate. The initial chat load (`loadChat()`) is unaffected — it already shows its own dedicated inline error box and should keep doing so.

**Interfaces:**
- `callServer(fn, params, onSuccess, errorLabel, onError, silent)` — new optional trailing `silent` boolean (default falsy = today's behavior for every other caller).

- [ ] **Step 1: Add the `silent` option to `callServer`**

In `Index.html`, replace (this is `callServer` as it stands after Task 8's Step 5 — note only the two outer `showToast` calls gain the `!silent` guard; the inner one inside the `try/catch` around `onSuccess` — the one guarding against a broken render handler — stays unconditional, that one is a real app bug surfacing, not a transient network error):

```js
  function callServer(fn, params, onSuccess, errorLabel, onError) {
    let runner = google.script.run
      .withSuccessHandler(res => {
        if (res && res.success === false) {
          showToast((errorLabel || 'Erreur') + ' : ' + res.error, 'error');
          if (onError) onError(res.error);
          return;
        }
        if (!onSuccess) return;
        try {
          onSuccess(res);
        } catch (err) {
          console.error('callServer/' + fn, err);
          showToast((errorLabel || 'Erreur d\'affichage') + ' : ' + ((err && err.message) || err), 'error');
          if (onError) onError(err);
        }
      })
      .withFailureHandler(err => {
        showToast((errorLabel || 'Erreur serveur') + ' : ' + (err.message || err), 'error');
        if (onError) onError(err);
      });
    runner[fn](...params, _identityPassword);
  }
```

with:

```js
  function callServer(fn, params, onSuccess, errorLabel, onError, silent) {
    let runner = google.script.run
      .withSuccessHandler(res => {
        if (res && res.success === false) {
          if (!silent) showToast((errorLabel || 'Erreur') + ' : ' + res.error, 'error');
          if (onError) onError(res.error);
          return;
        }
        if (!onSuccess) return;
        try {
          onSuccess(res);
        } catch (err) {
          console.error('callServer/' + fn, err);
          showToast((errorLabel || 'Erreur d\'affichage') + ' : ' + ((err && err.message) || err), 'error');
          if (onError) onError(err);
        }
      })
      .withFailureHandler(err => {
        if (!silent) showToast((errorLabel || 'Erreur serveur') + ' : ' + (err.message || err), 'error');
        if (onError) onError(err);
      });
    runner[fn](...params, _identityPassword);
  }
```

- [ ] **Step 2: Make `pollChat` silent**

In `Index.html`, in `pollChat`, replace:

```js
    callServer('apiGetChatMessages', [], res => {
      _chatPollInFlight = false;
      const fresh = res.messages || [];
```

with:

```js
    callServer('apiGetChatMessages', [], res => {
      _chatPollInFlight = false;
      const fresh = res.messages || [];
```

(unchanged — the success path is fine as-is), and replace the call's closing arguments:

```js
    }, 'Actualisation du tchat', () => { _chatPollInFlight = false; });
```

with:

```js
    }, 'Actualisation du tchat', () => { _chatPollInFlight = false; }, true);
```

- [ ] **Step 3: Confirm `loadChat` is unaffected**

Read `loadChat()` (`Index.html:7785-7796`) and confirm its `callServer` call is untouched (still 5 args, no `silent`) — it must keep showing its own inline "Impossible de charger le tchat" error box on the initial load.

- [ ] **Step 4: Run the full suite**

Run: `npm run verify`
Expected: PASS (no `.test.js` file exercises `pollChat`/toast timing — this is a client-only UX change).

- [ ] **Step 5: Manual verification in the frontend preview harness**

Start `serve:front`, open the chat panel (polling now at 4s), then simulate a transient failure — easiest via the browser console: temporarily stub `google.script.run.apiGetChatMessages` to reject once — confirm no red toast appears on that one failed poll, and that a normal poll right after (once un-stubbed) recovers silently. Separately, force the *initial* load to fail and confirm the inline "Impossible de charger le tchat" box still appears as before.

- [ ] **Step 6: Update CHANGELOG.md**

```markdown
## [v3.20.11] - 2026-08-25

### Corrigé
**Humanisé** : Un simple hoquet réseau pendant la vérification automatique du tchat en arrière-plan (toutes les 4 à 20 secondes) affichait une notification d'erreur rouge, même en train d'écrire un message.
**Technique** : `callServer()` (`Index.html`) gagne un paramètre `silent` optionnel ; `pollChat()` l'active désormais pour ses deux chemins d'erreur transport (échec serveur, erreur réseau) — le chargement initial du tchat (`loadChat()`) et une erreur d'affichage réelle dans le callback de succès restent visibles comme avant.
```

- [ ] **Step 7: Commit and push**

```bash
git add Index.html CHANGELOG.md
git commit -m "fix(chat): stop surfacing transient background-polling errors as toasts"
git push
```

---

## Self-Review Notes (already applied above)

- **Spec coverage:** all 10 audit claims accounted for — 8 confirmed→fixed (Tasks 1–7, 9), 1 confirmed→fixed as part of the auth task (Task 8, closing the gap `context.md` §7 already mandates), 1 checked and found already-fixed in current code (`loadActiveWeekday` wrapper hiding — no task). The two items judged not worth a task (`AutoPoints.gs` `_parseRow` arithmetic clarity, `copy_to_txt.py` headless mode) are deliberately excluded — noted to the user already, not silently dropped.
- **Placeholder scan:** no `TODO`/vague step remains; Task 8's Step 2 table is dense but every one of the 49 rows is a complete, unambiguous instruction, not a placeholder.
- **Type/name consistency:** `password` is the consistent new parameter name everywhere (never `pwd`/`pass`/`token`); `requireAuthor(author, password)` signature matches across every call site table and the rewritten definition; `cssUrl`/`_hashPassword`/`_identityPassword` are each defined exactly once and referenced with that exact name everywhere they're used.
