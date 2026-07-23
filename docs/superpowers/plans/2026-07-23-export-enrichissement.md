# Enrichissement des exports Dashboard (infographie + CSV/Excel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the Dashboard's 3 existing exports (Infographie / CSV / Excel) in `Index.html` per `docs/superpowers/specs/2026-07-23-export-enrichissement-design.md`, without removing or regressing anything currently working.

**Architecture:** Pure frontend work inside the single `Index.html` file (no `Code.gs` changes — every task reuses the existing `apiGetFilteredData` endpoint or purely client-side data already loaded). Six additive changes: two client-side-only exports (CSV/Excel), two export-modal UX additions (persisted options, clipboard copy), one new stat requiring one extra server round-trip (top mover), and one batch export requiring a small additive refactor of `switchChartType`/`applyFilters` to support a completion callback.

**Tech Stack:** Vanilla JS/HTML/CSS (no framework, no build step), Chart.js (already embedded), SheetJS/xlsx and jsPDF (already loaded on demand via `EXPORT_LIBS`), `fflate` (new, loaded on demand the same way) for the zip export.

## Global Constraints

- **No feature loss** — every change is additive; nothing currently working in Infographie/CSV/Excel may regress (project rule, see `context.md` §8 and memory `top-des-tops-constraints`).
- **`Index.html` stays a single monolithic file** — no splitting into multiple files/modules.
- **No hardcoded colors** — any new UI element reuses the existing CSS variables (`--bg`, `--card`, `--border`, `--text`, `--text-muted`, `--accent`, etc.), never a raw hex in CSS. Canvas drawing code (JS, not CSS) legitimately uses raw hex/rgba strings, matching the existing pattern in `buildInfographicCanvas` — this is the documented exception (memory `top-des-tops-constraints`, "Hex-color cleanup pitfall").
- **Avatar obligatoire partout** — not directly relevant to this plan's new UI (no new player-name display), but if a task incidentally renders a player name, it must carry its avatar.
- **CHANGELOG.md updated for every task** — two voices (Humanisé + Technique) per entry, no exceptions (§8 `context.md`). Add entries under a new `## [Non publié] - 2026-07-23` section, above the existing `## [Non publié] - 2026-07-22` section (reverse-chronological, most recent date on top).
- **No automated frontend test suite exists.** The project's only automated harness (`tests/*.test.js`, Node `node:test` + VM) covers `Code.gs` only (backend). None of these tasks touch `Code.gs`, so no automated test applies. Every task's verification step is a **manual check performed in the browser** against the running Dashboard (local file preview is not viable — the app bootstraps via `google.script.run`, which only resolves against a deployed Apps Script backend). Each task's manual steps describe exactly what to click and what you must see. This replaces the pytest-style "write failing test" steps used in other stacks — do not invent a fake test framework for this file.
- **Commit and push after every task** — pushing triggers the existing auto-deploy GitHub Action (§10 `context.md`); do not ask permission, it is systematic.
- **Verify GitHub identity before pushing**: run `gh auth status`; if the active account isn't `Arcxy2nd`, run `gh auth switch --user Arcxy2nd` first.

---

## File Structure

Single file touched: `Index.html`.

| Zone (current line numbers, verify before editing — earlier tasks shift later line numbers) | Responsibility |
|---|---|
| `~L2784-2787` (export buttons row) | Add the new "🗂️ Tout exporter" button (Task 6) |
| `~L3603-3606` (`EXPORT_LIBS`) | Add the `fflate` CDN URL (Task 6) |
| `~L8228-8243` (`exportOpts` defaults inside `openExportModal`) | Task 3 (persisted defaults), Task 5 (`topMover` key) |
| `~L8224-8370` (`openExportModal`) | Task 3 (load/save to localStorage), Task 4 (clipboard button), Task 5 (top-mover checkbox + async recompute) |
| `~L7952-8202` (`buildInfographicCanvas`) | Task 5 (draw the top-mover pill) |
| `~L8372-8397` (`exportAsCSV` / `exportAsExcel`) | Task 1 (CSV context header), Task 2 (Excel Classement + Contexte sheets) |
| `~L6896-6969` (`applyFilters` / `switchChartType`) | Task 6 (additive `onDone` callback param) |
| new function near `~L8397` (after `exportAsExcel`) | Task 6 (`exportAllCharts`) |
| `~L12705-12711` (`bindExportButtons`) | Task 6 (bind the new button) |
| `CHANGELOG.md` (top of file, under `# Changelog`) | Every task adds its own entry |

No new files. No `Mobile.html` changes — these 3 export buttons don't exist on mobile today and this plan doesn't add them there (confirmed out of scope in the spec).

---

### Task 1: CSV — en-tête de contexte

**Files:**
- Modify: `Index.html:8372-8383` (`exportAsCSV`)
- Modify: `CHANGELOG.md` (new entry)

**Interfaces:**
- Consumes: `currentChartData` (existing global, `{labels, datasets}`), `document.getElementById('startDate'/'endDate').value` (existing filter inputs), `selectedCategoryChips` / `selectedPlayerChips` (existing globals, `Set<string>`).
- Produces: no new symbols consumed elsewhere.

- [ ] **Step 1: Read the current function to confirm exact line numbers**

Open `Index.html` around line 8372 and confirm it still matches:
```js
  function exportAsCSV() {
    if (!currentChartData) { showToast('Aucune donnée', 'error'); return; }
    const { labels, datasets } = currentChartData;
    const rows = [['Joueur', ...datasets.map(d => d.label)]];
    labels.forEach((l, i) => rows.push([l, ...datasets.map(d => d.data[i] || 0)]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
    a.download = 'tops-des-tops.csv'; a.click();
    URL.revokeObjectURL(a.href);
    showToast('Export CSV OK', 'success');
  }
```
If the line numbers drifted (earlier work may have shifted them), locate the function by name (`function exportAsCSV`) instead of by line number.

- [ ] **Step 2: Add a shared context-lines helper (used by both CSV and Excel)**

Add this new function directly above `exportAsCSV` (same indentation level, inside the `<script>` block):

```js
  function buildExportContextLines() {
    const sd = document.getElementById('startDate').value;
    const ed = document.getElementById('endDate').value;
    const periodTxt = sd || ed ? ((sd || '…') + ' → ' + (ed || '…')) : 'Toute la période';
    const activeCats = [...(selectedCategoryChips || [])];
    const activePls  = [...(selectedPlayerChips  || [])];
    return [
      ['Période', periodTxt],
      ['Joueurs filtrés', activePls.length ? activePls.join(', ') : 'Tous'],
      ['Catégories filtrées', activeCats.length ? activeCats.join(', ') : 'Toutes'],
      ["Date d'export", new Date().toLocaleString('fr-FR')]
    ];
  }
```

- [ ] **Step 3: Prefix the CSV output with commented context lines**

Replace the body of `exportAsCSV` with:

```js
  function exportAsCSV() {
    if (!currentChartData) { showToast('Aucune donnée', 'error'); return; }
    const { labels, datasets } = currentChartData;
    const contextLines = buildExportContextLines().map(([k, v]) => '# ' + k + ' : ' + v);
    const rows = [['Joueur', ...datasets.map(d => d.label)]];
    labels.forEach((l, i) => rows.push([l, ...datasets.map(d => d.data[i] || 0)]));
    const csv = contextLines.concat(rows.map(r => r.join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
    a.download = 'tops-des-tops.csv'; a.click();
    URL.revokeObjectURL(a.href);
    showToast('Export CSV OK', 'success');
  }
```

- [ ] **Step 4: Manual verification**

Open the deployed Dashboard (or push first, see Step 6, then open the live app). Set an explicit period and at least one player/category filter, pick any chart type, click "📊 CSV". Open the downloaded file in a text editor:
- Expected: first 4 lines start with `# `, showing Période/Joueurs filtrés/Catégories filtrées/Date d'export with real values matching the active filters.
- Expected: the data table (header row + player rows) is unchanged below those 4 lines, still opens correctly as a CSV in a spreadsheet app (comment lines are either ignored or shown as a single-column row — verify it doesn't shift the data columns).

- [ ] **Step 5: Update CHANGELOG.md**

Add at the top of `CHANGELOG.md`, above `## [Non publié] - 2026-07-22`:

```markdown
## [Non publié] - 2026-07-23

### Ajouté
**Humanisé** : L'export CSV du Dashboard indique maintenant en haut du fichier la période et les filtres actifs au moment de l'export, ainsi que la date d'export — avant, seul le tableau de chiffres était présent.
**Technique** : `Index.html` — nouvelle fonction `buildExportContextLines()` réutilisée par `exportAsCSV()` ; le CSV est préfixé de 4 lignes commentées (`# Clé : Valeur`) avant le tableau de données.
```

- [ ] **Step 6: Commit**

```bash
gh auth status
git add Index.html CHANGELOG.md
git commit -m "feat(export): ajoute le contexte (période/filtres) en en-tête du CSV"
git push
```

---

### Task 2: Excel — onglets Classement et Contexte

**Files:**
- Modify: `Index.html:8385-8397` (`exportAsExcel`)
- Modify: `CHANGELOG.md` (new entry)

**Interfaces:**
- Consumes: `buildExportContextLines()` (from Task 1), `currentChartData` (existing global).
- Produces: no new symbols consumed elsewhere.

- [ ] **Step 1: Confirm current function**

```js
  function exportAsExcel() {
    if (!currentChartData) { showToast('Aucune donnée', 'error'); return; }
    loadScriptOnce(EXPORT_LIBS.xlsx).then(() => {
      const { labels, datasets } = currentChartData;
      const sheetData = [['Joueur', ...datasets.map(d => d.label)]];
      labels.forEach((l, i) => sheetData.push([l, ...datasets.map(d => d.data[i] || 0)]));
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Scores');
      XLSX.writeFile(wb, 'tops-des-tops_' + Date.now() + '.xlsx');
      showToast('Export Excel OK', 'success');
    }).catch(e => showToast('Erreur Excel : ' + e.message, 'error'));
  }
```

- [ ] **Step 2: Add a ranking-computation helper**

Add this function above `exportAsExcel`:

```js
  function computeRankingWithGaps(chartData) {
    const totals = chartData.labels.map((player, i) => ({
      player,
      total: chartData.datasets.reduce((sum, ds) => sum + (Number((ds.data || [])[i]) || 0), 0)
    })).sort((a, b) => b.total - a.total);
    return totals.map((row, i) => ({
      rank: i + 1,
      player: row.player,
      total: row.total,
      gapToNext: i < totals.length - 1 ? row.total - totals[i + 1].total : null
    }));
  }
```

- [ ] **Step 3: Add the two new sheets**

Replace the body of `exportAsExcel` with:

```js
  function exportAsExcel() {
    if (!currentChartData) { showToast('Aucune donnée', 'error'); return; }
    loadScriptOnce(EXPORT_LIBS.xlsx).then(() => {
      const { labels, datasets } = currentChartData;
      const sheetData = [['Joueur', ...datasets.map(d => d.label)]];
      labels.forEach((l, i) => sheetData.push([l, ...datasets.map(d => d.data[i] || 0)]));
      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      const ranking = computeRankingWithGaps(currentChartData);
      const rankingData = [['Rang', 'Joueur', 'Total', 'Écart avec le suivant']];
      ranking.forEach(r => rankingData.push([r.rank, r.player, r.total, r.gapToNext === null ? '' : r.gapToNext]));
      const wsRanking = XLSX.utils.aoa_to_sheet(rankingData);

      const contextData = buildExportContextLines();
      const wsContext = XLSX.utils.aoa_to_sheet(contextData);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Scores');
      XLSX.utils.book_append_sheet(wb, wsRanking, 'Classement');
      XLSX.utils.book_append_sheet(wb, wsContext, 'Contexte');
      XLSX.writeFile(wb, 'tops-des-tops_' + Date.now() + '.xlsx');
      showToast('Export Excel OK', 'success');
    }).catch(e => showToast('Erreur Excel : ' + e.message, 'error'));
  }
```

- [ ] **Step 4: Manual verification**

On the deployed app, set a period + filters, click "📗 Excel". Open the downloaded `.xlsx`:
- Expected: 3 tabs — `Scores` (unchanged from before), `Classement` (rows sorted by total descending, rank 1..N, last row's "Écart avec le suivant" empty), `Contexte` (4 rows matching the active period/filters).
- Expected: totals in `Classement` match the sums visible in the Dashboard's own ranking view for the same filters.

- [ ] **Step 5: Update CHANGELOG.md**

```markdown
### Ajouté
**Humanisé** : L'export Excel du Dashboard contient maintenant 2 onglets en plus du tableau habituel : un classement (rang, total, écart avec le joueur suivant) et le contexte de l'export (période, filtres, date).
**Technique** : `Index.html` — `exportAsExcel()` ajoute les onglets `Classement` (via nouvelle fonction `computeRankingWithGaps()`) et `Contexte` (via `buildExportContextLines()`, partagée avec `exportAsCSV()`).
```

- [ ] **Step 6: Commit**

```bash
git add Index.html CHANGELOG.md
git commit -m "feat(export): ajoute les onglets Classement et Contexte à l'export Excel"
git push
```

---

### Task 3: Infographie — mémoriser les réglages de la modale

**Files:**
- Modify: `Index.html:8224-8244` (top of `openExportModal`)
- Modify: `Index.html:8351` (or nearby — wherever `dlBtn`'s click handler and pill/checkbox handlers live, to persist on every change)
- Modify: `CHANGELOG.md` (new entry)

**Interfaces:**
- Consumes: none new.
- Produces: `loadStoredExportOpts()` and `saveExportOpts(opts)` — used again by Task 6 (`exportAllCharts` reuses `loadStoredExportOpts()`).

- [ ] **Step 1: Add persistence helpers**

Add above `openExportModal` (near the other export helpers, e.g. right after `drawAvatarOnCanvas`):

```js
  const EXPORT_OPTS_STORAGE_KEY = 'exportOpts_v1';

  function defaultExportOpts() {
    return {
      format:        'png',
      theme:         document.body.classList.contains('light') ? 'light' : 'dark',
      title:         true,
      period:        true,
      stats:         true,
      players:       true,
      avatars:       true,
      scale:         1,
      legend:        true,
      watermark:     true,
      watermarkText: 'Tops des Tops',
      filters:       true,
      footer:        true,
      customTitle:   '',
      topMover:      false
    };
  }

  function loadStoredExportOpts() {
    const defaults = defaultExportOpts();
    try {
      const raw = localStorage.getItem(EXPORT_OPTS_STORAGE_KEY);
      if (!raw) return defaults;
      const stored = JSON.parse(raw);
      return Object.assign(defaults, stored);
    } catch (e) {
      return defaults;
    }
  }

  function saveExportOpts(opts) {
    try {
      localStorage.setItem(EXPORT_OPTS_STORAGE_KEY, JSON.stringify(opts));
    } catch (e) { /* localStorage indisponible (mode privé, quota) — réglages non persistés, sans impact fonctionnel */ }
  }
```

Note: `topMover: false` is added here for Task 5 — harmless if Task 5 hasn't run yet (unused key).

- [ ] **Step 2: Use stored options as the modal's starting state**

In `openExportModal`, replace:

```js
    let exportOpts = {
      format:        'png',
      theme:         document.body.classList.contains('light') ? 'light' : 'dark',
      title:         true,
      period:        true,
      stats:         true,
      players:       true,
      avatars:       true,
      scale:         1,
      legend:        true,
      watermark:     true,
      watermarkText: 'Tops des Tops',
      filters:       true,
      footer:        true,
      customTitle:   ''
    };
```

with:

```js
    let exportOpts = loadStoredExportOpts();
```

- [ ] **Step 3: Persist on every change**

Every place inside `openExportModal` that mutates `exportOpts[key]` must also call `saveExportOpts(exportOpts)` right after. Locate these 3 spots and add the call:

In `pillGroup`'s click handler:
```js
        p.addEventListener('click', () => {
          exportOpts[key] = v;
          pills.querySelectorAll('.export-pill').forEach(x => x.classList.remove('active'));
          p.classList.add('active');
          saveExportOpts(exportOpts);
          updatePreview();
        });
```

In `checkOpt`'s change handler:
```js
    chk.addEventListener('change', () => { exportOpts[key] = chk.checked; saveExportOpts(exportOpts); updatePreview(); });
```

In the watermark text input handler:
```js
    wmInput.addEventListener('input', () => {
      exportOpts.watermarkText = wmInput.value.trim() || 'Tops des Tops';
      saveExportOpts(exportOpts);
      updatePreview();
    });
```

The custom-title input (`titleIn`) is deliberately **not** persisted — a leftover custom title from a previous export silently reapplied to the next one would be surprising, not helpful.

- [ ] **Step 4: Manual verification**

On the deployed app: open the export modal, switch resolution to "HD ×2", theme to "☀️ Clair", uncheck "Avatars des joueurs", close the modal (Annuler or backdrop click). Reload the page, reopen the export modal.
- Expected: resolution shows "HD ×2" active, theme "☀️ Clair" active, "Avatars des joueurs" unchecked — matching what was left before reload.
- Expected: the custom-title field is empty again (not persisted, by design).

- [ ] **Step 5: Update CHANGELOG.md**

```markdown
### Modifié
**Humanisé** : La fenêtre d'export d'infographie se souvient maintenant des derniers réglages choisis (thème, résolution, options cochées) au lieu de repartir des valeurs par défaut à chaque ouverture.
**Technique** : `Index.html` — `openExportModal()` initialise `exportOpts` via nouvelle fonction `loadStoredExportOpts()` (localStorage, clé `exportOpts_v1`) au lieu d'un objet littéral fixe ; chaque mutation (`pillGroup`, `checkOpt`, filigrane) appelle `saveExportOpts()`. Le titre personnalisé n'est volontairement pas persisté.
```

- [ ] **Step 6: Commit**

```bash
git add Index.html CHANGELOG.md
git commit -m "feat(export): mémorise les réglages de la modale d'infographie"
git push
```

---

### Task 4: Infographie — copier dans le presse-papier

**Files:**
- Modify: `Index.html:8346-8356` (action buttons row in `openExportModal`)
- Modify: `CHANGELOG.md` (new entry)

**Interfaces:**
- Consumes: `buildInfographicCanvas`, `loadAvatarImages`, `getRelevantPlayerNames` (existing).
- Produces: none consumed elsewhere.

- [ ] **Step 1: Confirm current action-buttons block**

```js
    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary'; cancelBtn.textContent = 'Annuler'; cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => overlay.remove());
    const dlBtn = document.createElement('button');
    dlBtn.className = 'primary'; dlBtn.textContent = '⬇️ Télécharger'; dlBtn.type = 'button';
    dlBtn.addEventListener('click', () => { generateInfographic(exportOpts); overlay.remove(); });
    btnRow.appendChild(cancelBtn); btnRow.appendChild(dlBtn);
    box.appendChild(btnRow);
```

- [ ] **Step 2: Add the "Copier" button, hidden when unsupported or format is PDF**

Replace with:

```js
    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary'; cancelBtn.textContent = 'Annuler'; cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => overlay.remove());
    const copyBtn = document.createElement('button');
    copyBtn.className = 'secondary'; copyBtn.textContent = '📋 Copier'; copyBtn.type = 'button';
    copyBtn.style.display = (window.ClipboardItem && exportOpts.format !== 'pdf') ? 'inline-block' : 'none';
    copyBtn.addEventListener('click', async () => {
      try {
        const avatarImages = await loadAvatarImages(getRelevantPlayerNames(), exportOpts.avatars);
        const canvas = buildInfographicCanvas(exportOpts, exportOpts.scale, avatarImages);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        showToast('Image copiée !', 'success');
      } catch (e) {
        showToast('Copie impossible : ' + e.message, 'error');
      }
    });
    const dlBtn = document.createElement('button');
    dlBtn.className = 'primary'; dlBtn.textContent = '⬇️ Télécharger'; dlBtn.type = 'button';
    dlBtn.addEventListener('click', () => { generateInfographic(exportOpts); overlay.remove(); });
    btnRow.appendChild(cancelBtn); btnRow.appendChild(copyBtn); btnRow.appendChild(dlBtn);
    box.appendChild(btnRow);
```

- [ ] **Step 3: Keep the copy button's visibility in sync with the format pill**

The `format` pill group (`pillGroup('Format', ..., 'format')`) already re-renders on click via `updatePreview()`. Add a visibility update there too — locate the `pillGroup` click handler (already touched in Task 3, step 3) and extend it once more:

```js
        p.addEventListener('click', () => {
          exportOpts[key] = v;
          pills.querySelectorAll('.export-pill').forEach(x => x.classList.remove('active'));
          p.classList.add('active');
          saveExportOpts(exportOpts);
          if (key === 'format') copyBtn.style.display = (window.ClipboardItem && exportOpts.format !== 'pdf') ? 'inline-block' : 'none';
          updatePreview();
        });
```

This closure references `copyBtn`, which is declared later in the function body — since `pillGroup` for "Format" is invoked (`box.appendChild(pillGroup(...))`) before `copyBtn` exists, move the `copyBtn` declaration (and its `style.cssText`/`addEventListener` from Step 2) to **before** the `box.appendChild(pillGroup('Format', ...))` line so the closure captures a real reference, not a temporal-dead-zone error. Declare it early alongside `exportOpts`, then append it to `btnRow` later where Step 2 shows.

- [ ] **Step 4: Manual verification**

On the deployed app, open the export modal. With format "PNG": the "📋 Copier" button is visible; click it, then paste (Ctrl+V) into an image-capable target (e.g. a chat input, or an image editor) — expected: the same image as the preview appears. Switch format to "PDF" — expected: "📋 Copier" disappears. Switch back to "PNG" or "JPEG" — expected: it reappears.

- [ ] **Step 5: Update CHANGELOG.md**

```markdown
### Ajouté
**Humanisé** : Un bouton « Copier » a été ajouté à côté de « Télécharger » dans la fenêtre d'export d'infographie — l'image peut être collée directement ailleurs (chat, éditeur) sans passer par le fichier téléchargé.
**Technique** : `Index.html` — `openExportModal()` : nouveau bouton `copyBtn` utilisant `navigator.clipboard.write()` avec un `ClipboardItem` construit depuis `canvas.toBlob()`. Masqué si `window.ClipboardItem` est indisponible ou si le format sélectionné est `pdf`.
```

- [ ] **Step 6: Commit**

```bash
git add Index.html CHANGELOG.md
git commit -m "feat(export): ajoute la copie presse-papier dans la modale d'infographie"
git push
```

---

### Task 5: Infographie — stat "plus forte progression"

**Files:**
- Modify: `Index.html:8291-8298` (`optsGroup` in `openExportModal`)
- Modify: `Index.html:7952-8202` (`buildInfographicCanvas`)
- Modify: `CHANGELOG.md` (new entry)

**Interfaces:**
- Consumes: `callServer` (existing global helper — signature `callServer(fnName, argsArray, callback, loadingMessage)`, confirm by reading its definition near the top of the `<script>` block before using it), `selectedPlayerChips`/`selectedCategoryChips` (existing globals), `apiGetFilteredData` (existing GAS endpoint, already used by `applyFilters`).
- Produces: `exportOpts._topMoverResult` — an internal field on the modal's local `exportOpts` object (not persisted — see Step 2), read by `buildInfographicCanvas`.

- [ ] **Step 1: Add the checkbox**

In `openExportModal`, inside `optsGroup` (right after `checkOpt('Avatars des joueurs', 'avatars')`):

```js
    optsGroup.appendChild(checkOpt('Plus forte progression', 'topMover'));
```

- [ ] **Step 2: Compute the top mover on demand, without persisting the result**

Add this function above `openExportModal` (near `computeRankingWithGaps` from Task 2, or standalone if Task 2 wasn't done first — it does not depend on it):

```js
  function computePreviousPeriodRange(startStr, endStr) {
    if (!startStr || !endStr) return null;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    const spanMs = end.getTime() - start.getTime();
    if (spanMs < 0) return null;
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - spanMs);
    const fmt = d => d.toISOString().slice(0, 10);
    return { start: fmt(prevStart), end: fmt(prevEnd) };
  }

  function computeTopMover(chartData, callback) {
    const sd = document.getElementById('startDate').value;
    const ed = document.getElementById('endDate').value;
    const prev = computePreviousPeriodRange(sd, ed);
    if (!prev || !chartData || !chartData.labels || !chartData.datasets) { callback(null); return; }
    const selPlayers    = selectedPlayerChips.size   ? [...selectedPlayerChips]   : [];
    const selCategories = selectedCategoryChips.size ? [...selectedCategoryChips] : [];
    callServer('apiGetFilteredData', [selPlayers, selCategories, prev.start, prev.end], res => {
      const prevData = res.chartData;
      if (!prevData || !prevData.labels || !prevData.datasets) { callback(null); return; }
      const totalFor = (data, player) => {
        const idx = data.labels.indexOf(player);
        if (idx === -1) return 0;
        return data.datasets.reduce((sum, ds) => sum + (Number((ds.data || [])[idx]) || 0), 0);
      };
      const movers = chartData.labels.map(player => ({
        name: player,
        delta: totalFor(chartData, player) - totalFor(prevData, player)
      })).sort((a, b) => b.delta - a.delta);
      callback(movers.length ? movers[0] : null);
    }, 'Comparaison période précédente');
  }
```

Then wire it into the preview refresh. Locate `updatePreview` in `openExportModal`:

```js
    async function updatePreview() {
      const avatarImages = await loadAvatarImages(getRelevantPlayerNames(), exportOpts.avatars);
      const canvas = buildInfographicCanvas(exportOpts, 1, avatarImages);
      prevImg.src = canvas.toDataURL('image/png');
    }
    updatePreview();
```

Replace with:

```js
    async function updatePreview() {
      if (exportOpts.topMover) {
        await new Promise(resolve => computeTopMover(currentChartData, mover => {
          exportOpts._topMoverResult = mover;
          resolve();
        }));
      } else {
        exportOpts._topMoverResult = null;
      }
      const avatarImages = await loadAvatarImages(getRelevantPlayerNames(), exportOpts.avatars);
      const canvas = buildInfographicCanvas(exportOpts, 1, avatarImages);
      prevImg.src = canvas.toDataURL('image/png');
    }
    updatePreview();
```

`_topMoverResult` is intentionally excluded from `saveExportOpts()` (Task 3) — it's a computed value, not a user preference; only the `topMover` boolean flag is persisted. No change needed in `saveExportOpts` since it just serializes whatever `exportOpts` holds at call time — but to avoid stale/wrong data leaking into localStorage, update `saveExportOpts` (Task 3's helper) to strip it:

```js
  function saveExportOpts(opts) {
    try {
      const toStore = Object.assign({}, opts);
      delete toStore._topMoverResult;
      localStorage.setItem(EXPORT_OPTS_STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) { /* localStorage indisponible (mode privé, quota) — réglages non persistés, sans impact fonctionnel */ }
  }
```

(If Task 3 wasn't yet implemented when this task runs, apply this version directly instead of the Task-3 version.)

- [ ] **Step 3: Also pass `generateInfographic`'s own `opts` through the same computation**

`generateInfographic(opts)` (the actual download path, not just the preview) is called with the modal's `exportOpts` directly (`dlBtn`'s handler: `generateInfographic(exportOpts)`), so `exportOpts._topMoverResult` is already populated from the last `updatePreview()` call by the time the user clicks download — no extra wiring needed there.

- [ ] **Step 4: Draw the pill in `buildInfographicCanvas`**

In `buildInfographicCanvas`, locate the players-strip block (ends at the `yOff += playersH;` line, right before the "Legend strip" comment). Insert a new block right after it:

```js
    // Top mover pill (biggest change vs. previous equivalent period)
    const topMoverH = (opts.topMover && opts._topMoverResult) ? Math.round(30 * S) : 0;
    if (topMoverH) {
      const mover = opts._topMoverResult;
      const isUp = mover.delta >= 0;
      const color = isUp ? '#2ed573' : '#ff4757';
      ctx.fillStyle = color; ctx.globalAlpha = 0.15;
      roundRect(ctx, Math.round(10 * S), yOff, W - Math.round(20 * S), topMoverH - Math.round(4 * S), Math.round(7 * S));
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = FG;
      ctx.font = 'bold ' + Math.round(12 * S) + 'px sans-serif';
      ctx.textAlign = 'left';
      const arrow = isUp ? '▲' : '▼';
      ctx.fillText(arrow + ' Plus forte progression : ' + mover.name + ' (' + (isUp ? '+' : '') + mover.delta + ' pts)', Math.round(18 * S), yOff + Math.round(19 * S));
      yOff += topMoverH;
    }
```

This block must be declared and reserved **before** the chart image / stats / players height computation reserves space, since `yOff` accounting there also needs `topMoverH`. Update the existing reservation block:

```js
    // Reserve space for stats strip, players strip, legend and footer
    const statsH = (opts.stats && currentChartData && currentChartData.datasets && currentChartData.datasets.length)
      ? Math.round(52 * S) : 0;
    const playersH = (opts.players && currentChartData && currentChartData.labels && currentChartData.labels.length > 1)
      ? Math.round(52 * S) : 0;
    const legendH = (opts.legend && currentChartData && currentChartData.datasets && currentChartData.datasets.length)
      ? Math.round(22 * S) : 0;
    const footH = opts.footer !== false ? Math.round(24 * S) : 0;
```

to also reserve `topMoverH` for the chart-height computation:

```js
    // Reserve space for stats strip, players strip, top-mover pill, legend and footer
    const statsH = (opts.stats && currentChartData && currentChartData.datasets && currentChartData.datasets.length)
      ? Math.round(52 * S) : 0;
    const playersH = (opts.players && currentChartData && currentChartData.labels && currentChartData.labels.length > 1)
      ? Math.round(52 * S) : 0;
    const topMoverH = (opts.topMover && opts._topMoverResult) ? Math.round(30 * S) : 0;
    const legendH = (opts.legend && currentChartData && currentChartData.datasets && currentChartData.datasets.length)
      ? Math.round(22 * S) : 0;
    const footH = opts.footer !== false ? Math.round(24 * S) : 0;
```

and update the chart-height line:

```js
      const chartH = H - yOff - statsH - playersH - legendH - footH - Math.round(8 * S);
```

to:

```js
      const chartH = H - yOff - statsH - playersH - topMoverH - legendH - footH - Math.round(8 * S);
```

Remove the duplicate `const topMoverH = ...` declaration from Step 4's first snippet (it's now declared once, in the reservation block) — the pill-drawing block after the players strip should just read `topMoverH` (already in scope), not redeclare it:

```js
    // Top mover pill (biggest change vs. previous equivalent period)
    if (topMoverH) {
      const mover = opts._topMoverResult;
      const isUp = mover.delta >= 0;
      const color = isUp ? '#2ed573' : '#ff4757';
      ctx.fillStyle = color; ctx.globalAlpha = 0.15;
      roundRect(ctx, Math.round(10 * S), yOff, W - Math.round(20 * S), topMoverH - Math.round(4 * S), Math.round(7 * S));
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = FG;
      ctx.font = 'bold ' + Math.round(12 * S) + 'px sans-serif';
      ctx.textAlign = 'left';
      const arrow = isUp ? '▲' : '▼';
      ctx.fillText(arrow + ' Plus forte progression : ' + mover.name + ' (' + (isUp ? '+' : '') + mover.delta + ' pts)', Math.round(18 * S), yOff + Math.round(19 * S));
      yOff += topMoverH;
    }
```

- [ ] **Step 5: Manual verification**

On the deployed app, set an explicit period covering roughly the last 14 days (both start and end dates filled), open the export modal, check "Plus forte progression".
- Expected: after a short delay (network round-trip), the preview image shows a new pill below the players strip with an arrow, a player name and a `+`/`-` point delta.
- Expected: unchecking "Plus forte progression" removes the pill from the preview immediately (no network call needed for hiding).
- Expected: clearing the start/end date filters (back to "Toute la période") and checking the box again — the pill does **not** appear (no comparable previous period), and no error toast fires.

- [ ] **Step 6: Update CHANGELOG.md**

```markdown
### Ajouté
**Humanisé** : L'infographie exportée peut maintenant afficher, en option, le joueur ayant le plus progressé (ou régressé) par rapport à la période équivalente précédente.
**Technique** : `Index.html` — nouvelle option `topMover` dans `openExportModal()` ; `computeTopMover()` compare les totaux de la période active à ceux d'une période précédente de même durée (`computePreviousPeriodRange()`, un appel `apiGetFilteredData` supplémentaire) ; le résultat (`exportOpts._topMoverResult`, non persisté) est dessiné en pill par `buildInfographicCanvas()`. Omis silencieusement si aucune période explicite n'est active.
```

- [ ] **Step 7: Commit**

```bash
git add Index.html CHANGELOG.md
git commit -m "feat(export): ajoute la stat plus forte progression à l'infographie"
git push
```

---

### Task 6: Infographie — export groupé ("tout exporter")

**Files:**
- Modify: `Index.html:3603-3606` (`EXPORT_LIBS`)
- Modify: `Index.html:2784-2787` (export buttons row, HTML)
- Modify: `Index.html:6896-6969` (`applyFilters`, `switchChartType` — additive `onDone` param)
- Modify: `Index.html` (new function `exportAllCharts`, placed after `exportAsExcel`)
- Modify: `Index.html:12705-12711` (`bindExportButtons`)
- Modify: `CHANGELOG.md` (new entry)

**Interfaces:**
- Consumes: `loadStoredExportOpts()` (Task 3), `buildInfographicCanvas`, `loadAvatarImages`, `getRelevantPlayerNames`, `switchChartType`, `currentChartType`, `currentChartData` (all existing/from earlier tasks).
- Produces: none consumed by later tasks (this is the last task in this plan).

- [ ] **Step 1: Add the zip library URL**

In `EXPORT_LIBS`:

```js
  const EXPORT_LIBS = {
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    xlsx:  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
    zip:   'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js'
  };
```

- [ ] **Step 2: Add the completion callback to `applyFilters` and `switchChartType`**

This is an additive parameter — every existing call site (`applyFilters()`, `switchChartType(type)` with no second argument) keeps working unchanged, since `onDone` defaults to `undefined` and is only invoked when truthy.

Replace `applyFilters()`'s signature and each branch's tail:

```js
  function applyFilters(onDone) {
    const selPlayers    = selectedPlayerChips.size   ? [...selectedPlayerChips]   : [];
    const selCategories = selectedCategoryChips.size ? [...selectedCategoryChips] : [];
    const startDate     = document.getElementById('startDate').value;
    const endDate       = document.getElementById('endDate').value;

    document.getElementById('chartSkeleton').style.display = 'block';
    document.getElementById('chartWrapper').style.display  = 'none';

    if (currentChartType === 'trend') {
      callServer('apiGetTrendData', [selPlayers, selCategories, startDate, endDate], res => {
        currentChartData = res.trendData;
        document.getElementById('chartSkeleton').style.display = 'none';
        document.getElementById('chartWrapper').style.display  = 'block';
        renderTrendChart(res.trendData);
        renderChartControls('trend');
        clearTopStatsStrip();
        if (onDone) onDone();
      }, 'Chargement courbes');
      return;
    }

    // Total global : tous les tops comptés (même supprimés) — pas de filtre catégorie
    if (currentChartType === 'ranking' && !chartOptions.detailed) {
      callServer('apiGetPlayerTotals', [selPlayers, startDate, endDate], res => {
        currentChartData = res.chartData;
        document.getElementById('chartSkeleton').style.display = 'none';
        document.getElementById('chartWrapper').style.display  = 'block';
        renderChart(res.chartData, 'ranking');
        renderChartControls('ranking');
        if (onDone) onDone();
      }, 'Chargement total global');
      return;
    }

    callServer('apiGetFilteredData', [selPlayers, selCategories, startDate, endDate], res => {
      currentChartData = res.chartData;
      document.getElementById('chartSkeleton').style.display = 'none';
      document.getElementById('chartWrapper').style.display  = 'block';
      renderChart(res.chartData, currentChartType);
      renderChartControls(currentChartType);
      if (currentChartType === 'stacked' || currentChartType === 'grouped') {
        renderTopStatsStrip(res.chartData);
      } else if (currentChartType !== 'ranking') {
        clearTopStatsStrip();
      }
      // Phrases card always populated from global totals
      const ranked = computeRankedTotals(res.chartData);
      if (ranked.length) renderPhrasesCard(ranked);
      if (onDone) onDone();
    }, 'Chargement graphique');
  }
```

Replace `switchChartType`:

```js
  function switchChartType(type, onDone) {
    currentChartType = type;
    document.querySelectorAll('.chart-type-btn[data-chart-type]').forEach(b => {
      b.classList.toggle('active', b.dataset.chartType === type);
    });
    const donutWrap = document.getElementById('donutPlayerWrap');
    donutWrap.style.display = type === 'doughnut' ? 'block' : 'none';

    if (type === 'trend' || type === 'ranking') {
      applyFilters(onDone);
      return;
    }
    const isStaleData = !currentChartData || currentChartData.series ||
      (currentChartData.datasets && currentChartData.datasets.length === 1 &&
       (currentChartData.datasets[0].label === 'Total global' || currentChartData.datasets[0].label === 'Total points'));
    if (isStaleData) { applyFilters(onDone); return; }
    renderChart(currentChartData, type);
    renderChartControls(type);
    if (type === 'stacked' || type === 'grouped') {
      renderTopStatsStrip(currentChartData);
    } else {
      clearTopStatsStrip();
    }
    if (onDone) onDone();
  }
```

- [ ] **Step 3: Add the HTML button**

In the export buttons row (`~L2784-2787`):

```html
        <div class="export-buttons">
          <button class="export-btn" id="exportInfographicBtn">🎨 Infographie</button>
          <button class="export-btn" id="exportAllBtn">🗂️ Tout exporter</button>
          <button class="export-btn" data-export="csv">📊 CSV</button>
          <button class="export-btn" data-export="xlsx">📗 Excel</button>
        </div>
```

- [ ] **Step 4: Implement `exportAllCharts`**

Add after `exportAsExcel`:

```js
  const BATCH_EXPORT_CHART_TYPES = ['stacked', 'grouped', 'trend', 'radar'];

  function chartTypeHasData(type) {
    if (type === 'trend') return !!(currentChartData && currentChartData.series && currentChartData.series.length);
    return !!(currentChartData && currentChartData.labels && currentChartData.labels.length);
  }

  function exportAllCharts() {
    const btn = document.getElementById('exportAllBtn');
    const originalType = currentChartType;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Export en cours…';

    loadScriptOnce(EXPORT_LIBS.zip).then(async () => {
      const opts = loadStoredExportOpts();
      opts._topMoverResult = null; // pas de recalcul par graphique pour l'export groupé — trop coûteux en appels réseau
      const avatarImages = await loadAvatarImages(getRelevantPlayerNames(), opts.avatars);
      const files = {};
      for (const type of BATCH_EXPORT_CHART_TYPES) {
        await new Promise(resolve => switchChartType(type, resolve));
        if (!chartTypeHasData(type)) continue;
        const canvas = buildInfographicCanvas(opts, opts.scale, avatarImages);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const buf = await blob.arrayBuffer();
        files['tops-des-tops-' + type + '.png'] = new Uint8Array(buf);
      }
      await new Promise(resolve => switchChartType(originalType, resolve));
      btn.disabled = false;
      btn.textContent = originalLabel;
      if (!Object.keys(files).length) {
        showToast('Aucun graphique exportable.', 'error');
        return;
      }
      const zipped = fflate.zipSync(files);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
      a.download = 'tops-des-tops-export-groupe.zip';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Export groupé OK', 'success');
    }).catch(e => {
      btn.disabled = false;
      btn.textContent = originalLabel;
      switchChartType(originalType, () => {});
      showToast('Erreur export groupé : ' + e.message, 'error');
    });
  }
```

Known, accepted side effect: the visible Dashboard chart briefly cycles through each type during the export (button shows "⏳ Export en cours…" the whole time) before returning to the type the user had selected. This is acceptable because the action is explicitly user-triggered and the button communicates the in-progress state.

- [ ] **Step 5: Bind the button**

In `bindExportButtons`:

```js
  function bindExportButtons() {
    document.getElementById('exportInfographicBtn').addEventListener('click', openExportModal);
    document.getElementById('exportAllBtn').addEventListener('click', exportAllCharts);
    document.querySelectorAll('.export-btn[data-export]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.export;
        if      (t === 'csv')  exportAsCSV();
        else if (t === 'xlsx') exportAsExcel();
      });
    });
  }
```

- [ ] **Step 6: Manual verification**

On the deployed app, with a period + filters set, click "🗂️ Tout exporter". Observe: button becomes disabled and shows "⏳ Export en cours…"; the visible chart cycles through a few types; a zip downloads named `tops-des-tops-export-groupe.zip`. Unzip it and check:
- Expected: contains `tops-des-tops-stacked.png`, `tops-des-tops-grouped.png`, `tops-des-tops-trend.png`, `tops-des-tops-radar.png` (skip any type with no data for the current filters — e.g. if a single player is selected, radar may still have data; verify whichever combination you tested actually produced files).
- Expected: the Dashboard's visible chart type after the operation finishes matches whatever was selected before clicking the button.
- Expected: clicking the button again immediately after (no filter change) still works — no leftover "disabled" state.

- [ ] **Step 7: Update CHANGELOG.md**

```markdown
### Ajouté
**Humanisé** : Un nouveau bouton « Tout exporter » télécharge en un clic un zip contenant l'infographie de chaque type de graphique compatible (Empilé, Groupé, Courbes, Radar), avec les filtres actuellement actifs.
**Technique** : `Index.html` — nouveau bouton `#exportAllBtn` et fonction `exportAllCharts()` : parcourt `BATCH_EXPORT_CHART_TYPES`, appelle `switchChartType(type, onDone)` (paramètre `onDone` ajouté, additif, à `switchChartType`/`applyFilters`) pour attendre chaque rendu, capture chaque graphique via `buildInfographicCanvas`, puis zippe le tout avec `fflate` (chargée à la demande via `EXPORT_LIBS.zip`, même pattern que jsPDF/xlsx). Le graphique visible revient au type d'origine une fois l'export terminé.
```

- [ ] **Step 8: Commit**

```bash
git add Index.html CHANGELOG.md
git commit -m "feat(export): ajoute l'export groupé (zip) de tous les types de graphique"
git push
```

---

## Post-plan check

After all 6 tasks: re-open the export modal once more and click through CSV, Excel, Infographie (all 3 formats) and "Tout exporter" one final time on the deployed app to confirm nothing in the original behavior (pre-existing pills, avatars, watermark, PDF export, filters summary) broke across the 6 tasks. Then invoke `/verify` per `context.md` §9.
