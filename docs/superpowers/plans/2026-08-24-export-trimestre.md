# Trimestre — période réutilisable + export en un clic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a calendar-quarter ("trimestre") date preset shared by the Historique/Journal d'audit chips and the Dashboard's period buttons, plus a one-click "🗓️ Ce trimestre" button on the Dashboard that exports a zip pack (CSV + Excel + PNG infographics) for the current quarter.

**Architecture:** One pure helper `quarterBounds(refDate, offset)` becomes the single source of quarter math, consumed by both existing preset systems (`dateRangePreset()`/`DATE_RANGE_CHIPS` and `rangePresetItems()`). `exportAsCSV()`/`exportAsExcel()` are split into pure builder functions (`buildCSVBytes()`/`buildExcelWorkbook()`) so a new `exportSeasonPack()` can reuse them without duplicating logic, alongside the existing per-chart-type PNG loop already used by `exportAllCharts()`.

**Tech Stack:** HTML/CSS/JS (`Index.html`, inline `<script>`), Node `--test` + `vm` sandbox extraction (`tests/*.test.js`, pattern from `tests/frontend-guards.test.js`).

## Global Constraints

- Comportement JS en anglais, texte utilisateur en français (`context.md` §8).
- DRY — pas de duplication de la logique CSV/Excel entre les boutons individuels et le pack trimestriel.
- `npm run verify` vert avant chaque commit.
- `CHANGELOG.md` mis à jour avec les deux voix (Humanisé + Technique) avant de pousser.
- Commit **et** `git push` sur `main` en fin de plan (déploiement double cible).
- Pas de nouvelle feuille Google Sheets, pas de notion de « saison » stockée — calcul pur côté client (`docs/superpowers/specs/2026-08-24-export-trimestre-design.md`, section « Hors périmètre »).

---

### Task 1: `quarterBounds()` shared helper

**Files:**
- Modify: `Index.html:8624` (insert before the `// ── PLAGES RAPIDES DE DATE ──` comment, after `filterDatesByDays`)
- Test: `tests/quarter-bounds.test.js` (new)

**Interfaces:**
- Produces: `quarterBounds(refDate: Date, offset: number)` → `{ from: Date, to: Date }`. `offset=0` = the calendar quarter containing `refDate`; `offset=-1` = the previous quarter. `from` = first day of that quarter, `to` = last day of that quarter (both at local midnight).

- [ ] **Step 1: Write the failing tests**

Create `tests/quarter-bounds.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const INDEX = path.join(__dirname, '..', 'Index.html');

// Extracts a named function from Index.html's inline <script>, from the
// `function` keyword to its closing brace, by counting braces (same pattern
// as tests/frontend-guards.test.js).
function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, name + ' introuvable dans Index.html');
  let depth = 0, i = source.indexOf('{', start);
  const open = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(i > open, name + ' : accolade fermante introuvable');
  return source.slice(start, i + 1);
}

function loadQuarterBounds() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'quarterBounds') + '\nthis.__quarterBounds = quarterBounds;', sandbox);
  return sandbox.__quarterBounds;
}

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test('quarterBounds returns Q1 (janv-mars) for a January reference date', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 0, 15), 0);
  assert.strictEqual(ymd(from), '2026-01-01');
  assert.strictEqual(ymd(to), '2026-03-31');
});

test('quarterBounds returns Q2 (avr-juin) for an April reference date', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 3, 15), 0);
  assert.strictEqual(ymd(from), '2026-04-01');
  assert.strictEqual(ymd(to), '2026-06-30');
});

test('quarterBounds returns Q4 (oct-déc) for a December reference date', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 11, 15), 0);
  assert.strictEqual(ymd(from), '2026-10-01');
  assert.strictEqual(ymd(to), '2026-12-31');
});

test('quarterBounds with offset -1 crosses back into the previous year from Q1', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 0, 15), -1);
  assert.strictEqual(ymd(from), '2025-10-01');
  assert.strictEqual(ymd(to), '2025-12-31');
});

test('quarterBounds with offset -1 stays within the same year from Q2', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 3, 15), -1);
  assert.strictEqual(ymd(from), '2026-01-01');
  assert.strictEqual(ymd(to), '2026-03-31');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/quarter-bounds.test.js`
Expected: FAIL — `quarterBounds introuvable dans Index.html`.

- [ ] **Step 3: Implement `quarterBounds()` in `Index.html`**

Insert before the `// ── PLAGES RAPIDES DE DATE (réutilisable, DRY) ──` comment (currently at line 8625, right after `filterDatesByDays`'s closing `}` at line 8623):

```js

  // Calendar-quarter boundaries (Q1 janv-mars … Q4 oct-déc). offset=0 = trimestre
  // contenant refDate, offset=-1 = trimestre précédent. Seule source de la logique
  // de trimestre — utilisée par les chips Historique/Journal ET les boutons Dashboard.
  function quarterBounds(refDate, offset) {
    const q = Math.floor(refDate.getMonth() / 3) + (offset || 0);
    const year = refDate.getFullYear() + Math.floor(q / 4);
    const qIdx = ((q % 4) + 4) % 4;
    const startMonth = qIdx * 3;
    return { from: new Date(year, startMonth, 1), to: new Date(year, startMonth + 3, 0) };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/quarter-bounds.test.js`
Expected: PASS — 5 tests, 0 failures.

- [ ] **Step 5: Syntax check and commit**

Run: `npm run check:html`
Expected: no syntax errors.

```bash
git add Index.html tests/quarter-bounds.test.js
git commit -m "feat(export): add quarterBounds() shared calendar-quarter helper"
```

---

### Task 2: Wire the quarter preset into Historique/Journal chips and the Dashboard

**Files:**
- Modify: `Index.html:8629-8650` (`dateRangePreset()`, `DATE_RANGE_CHIPS`)
- Modify: `Index.html:8507-8525` (`rangePresetItems()`)
- Test: `tests/quarter-bounds.test.js` (append)

**Interfaces:**
- Consumes: `quarterBounds(refDate, offset)` (Task 1).
- Produces: `dateRangePreset('quarter')` / `dateRangePreset('prevquarter')` → `{ from: Date, to: Date }`. Two new entries in `DATE_RANGE_CHIPS` (consumed by `setupDateRangeControls()`, already generic — no other change needed for Historique/Journal d'audit). Two new entries in `rangePresetItems()` (consumed by `buildRangePresets()`, already generic — no other change needed for the Dashboard).

- [ ] **Step 1: Write the failing tests**

Append to `tests/quarter-bounds.test.js`:

```js
function loadDateRangePreset() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  const src = extractFunction(html, 'quarterBounds') + '\n' + extractFunction(html, 'dateRangePreset');
  vm.runInContext(src + '\nthis.__dateRangePreset = dateRangePreset;', sandbox);
  return sandbox.__dateRangePreset;
}

function loadQuarterBoundsAgain() { return loadQuarterBounds(); }

test('dateRangePreset("quarter") matches quarterBounds(now, 0).from, capped at today', () => {
  const dateRangePreset = loadDateRangePreset();
  const quarterBounds = loadQuarterBoundsAgain();
  const now = new Date();
  const expected = quarterBounds(now, 0);
  const { from, to } = dateRangePreset('quarter');
  assert.strictEqual(ymd(from), ymd(expected.from));
  assert.strictEqual(ymd(to), ymd(now));
});

test('dateRangePreset("prevquarter") matches quarterBounds(now, -1) exactly', () => {
  const dateRangePreset = loadDateRangePreset();
  const quarterBounds = loadQuarterBoundsAgain();
  const now = new Date();
  const expected = quarterBounds(now, -1);
  const { from, to } = dateRangePreset('prevquarter');
  assert.strictEqual(ymd(from), ymd(expected.from));
  assert.strictEqual(ymd(to), ymd(expected.to));
});

test('DATE_RANGE_CHIPS declares the two quarter chips', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.match(html, /\{\s*key:\s*'quarter',\s*label:\s*'Trimestre en cours'\s*\}/);
  assert.match(html, /\{\s*key:\s*'prevquarter',\s*label:\s*'Trimestre précédent'\s*\}/);
});

test('rangePresetItems() declares the two quarter entries', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.match(html, /label:\s*'Trimestre en cours',\s*from:/);
  assert.match(html, /label:\s*'Trimestre préc\.',\s*from:/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/quarter-bounds.test.js`
Expected: FAIL — `dateRangePreset('quarter')` falls through to the `default` case (`{ from: null, to: null }`), and the two source-text assertions fail (chips/entries don't exist yet).

- [ ] **Step 3: Add the two cases to `dateRangePreset()` and the two chips to `DATE_RANGE_CHIPS`**

In `Index.html`, replace:

```js
  function dateRangePreset(key) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    switch (key) {
      case 'today':     return { from: new Date(y, m, d),      to: new Date(y, m, d) };
      case '7d':        return { from: new Date(y, m, d - 6),  to: new Date(y, m, d) };
      case 'month':     return { from: new Date(y, m, 1),      to: new Date(y, m, d) };
      case 'prevmonth': return { from: new Date(y, m - 1, 1),  to: new Date(y, m, 0) };
      case '3m':        return { from: new Date(y, m - 3, d),  to: new Date(y, m, d) };
      case 'year':      return { from: new Date(y, 0, 1),      to: new Date(y, m, d) };
      default:          return { from: null, to: null }; // 'all'
    }
  }
  const DATE_RANGE_CHIPS = [
    { key: 'today',     label: "Aujourd'hui" },
    { key: '7d',        label: '7 jours' },
    { key: 'month',     label: 'Ce mois' },
    { key: 'prevmonth', label: 'Mois dernier' },
    { key: '3m',        label: '3 mois' },
    { key: 'year',      label: 'Cette année' },
    { key: 'all',       label: 'Tout' }
  ];
```

with:

```js
  function dateRangePreset(key) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    switch (key) {
      case 'today':      return { from: new Date(y, m, d),      to: new Date(y, m, d) };
      case '7d':         return { from: new Date(y, m, d - 6),  to: new Date(y, m, d) };
      case 'month':      return { from: new Date(y, m, 1),      to: new Date(y, m, d) };
      case 'prevmonth':  return { from: new Date(y, m - 1, 1),  to: new Date(y, m, 0) };
      case '3m':         return { from: new Date(y, m - 3, d),  to: new Date(y, m, d) };
      case 'quarter':    return { from: quarterBounds(now, 0).from,  to: new Date(y, m, d) };
      case 'prevquarter': { const q = quarterBounds(now, -1); return { from: q.from, to: q.to }; }
      case 'year':       return { from: new Date(y, 0, 1),      to: new Date(y, m, d) };
      default:           return { from: null, to: null }; // 'all'
    }
  }
  const DATE_RANGE_CHIPS = [
    { key: 'today',      label: "Aujourd'hui" },
    { key: '7d',         label: '7 jours' },
    { key: 'month',      label: 'Ce mois' },
    { key: 'prevmonth',  label: 'Mois dernier' },
    { key: '3m',         label: '3 mois' },
    { key: 'quarter',    label: 'Trimestre en cours' },
    { key: 'prevquarter', label: 'Trimestre précédent' },
    { key: 'year',       label: 'Cette année' },
    { key: 'all',        label: 'Tout' }
  ];
```

- [ ] **Step 4: Add the two entries to `rangePresetItems()`**

In `Index.html`, replace:

```js
    return [
      { label: '7 derniers jours',  from: mk(y, m, d - 6),  to: mk(y, m, d) },
      { label: 'Semaine en cours',  from: toDateStr(monday), to: mk(y, m, d) },
      { label: 'Semaine préc.',     from: toDateStr(lastMonday), to: toDateStr(lastSunday) },
      { label: '30 derniers jours', from: mk(y, m, d - 29), to: mk(y, m, d) },
      { label: 'Ce mois',           from: mk(y, m, 1),      to: mk(y, m, d) },
      { label: 'Mois précédent',    from: mk(y, m - 1, 1),  to: mk(y, m, 0) },
      { label: '3 derniers mois',   from: mk(y, m - 3, d),  to: mk(y, m, d) },
      { label: 'Cette année',       from: mk(y, 0, 1),      to: mk(y, m, d) },
      { label: 'Année préc.',       from: mk(y - 1, 0, 1),  to: mk(y - 1, 11, 31) }
    ];
```

with:

```js
    const curQuarter  = quarterBounds(t, 0);
    const prevQuarter = quarterBounds(t, -1);
    return [
      { label: '7 derniers jours',   from: mk(y, m, d - 6),  to: mk(y, m, d) },
      { label: 'Semaine en cours',   from: toDateStr(monday), to: mk(y, m, d) },
      { label: 'Semaine préc.',      from: toDateStr(lastMonday), to: toDateStr(lastSunday) },
      { label: '30 derniers jours',  from: mk(y, m, d - 29), to: mk(y, m, d) },
      { label: 'Ce mois',            from: mk(y, m, 1),      to: mk(y, m, d) },
      { label: 'Mois précédent',     from: mk(y, m - 1, 1),  to: mk(y, m, 0) },
      { label: '3 derniers mois',    from: mk(y, m - 3, d),  to: mk(y, m, d) },
      { label: 'Trimestre en cours', from: toDateStr(curQuarter.from),  to: mk(y, m, d) },
      { label: 'Trimestre préc.',    from: toDateStr(prevQuarter.from), to: toDateStr(prevQuarter.to) },
      { label: 'Cette année',        from: mk(y, 0, 1),      to: mk(y, m, d) },
      { label: 'Année préc.',        from: mk(y - 1, 0, 1),  to: mk(y - 1, 11, 31) }
    ];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/quarter-bounds.test.js`
Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: `check:html` clean, all tests pass (no regression).

- [ ] **Step 7: Manual verification**

Start the local preview (`preview_start`, config `top-des-tops-frontend`). In the browser: disable GSAP (`window.gsap = null`) and `goToTab('tab-history')`, confirm the "Trimestre en cours"/"Trimestre précédent" chips appear in Historique's date-range row and in the Journal d'audit sub-tab's date-range row, clicking one fills the from/to date inputs. `goToTab('tab-dashboard')`, confirm the same two buttons appear in the Dashboard's period-preset row and clicking "Trimestre en cours" narrows the chart data. Restore `window.gsap`.

- [ ] **Step 8: Commit**

```bash
git add Index.html tests/quarter-bounds.test.js
git commit -m "feat(export): add trimester as a reusable date preset (Historique, Journal, Dashboard)"
```

---

### Task 3: Extract pure CSV/Excel builders

**Files:**
- Modify: `Index.html:12355-12440` (`exportAsCSV`, `exportAsExcel`)
- Test: `tests/export-builders.test.js` (new)

**Interfaces:**
- Produces: `buildCSVBytes()` → `Uint8Array | null` (null when `currentChartData` is falsy). `buildExcelWorkbook()` → `XLSX.WorkBook | null` (same null condition).
- Consumes (unchanged, already global in `Index.html`): `currentChartData`, `buildExportContextLines()`, `computeRankingWithGaps()`, `XLSX` (loaded on demand via `EXPORT_LIBS.xlsx` before `exportAsExcel()`/`buildExcelWorkbook()` are called).

- [ ] **Step 1: Write the failing tests**

Create `tests/export-builders.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const INDEX = path.join(__dirname, '..', 'Index.html');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, name + ' introuvable dans Index.html');
  let depth = 0, i = source.indexOf('{', start);
  const open = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(i > open, name + ' : accolade fermante introuvable');
  return source.slice(start, i + 1);
}

function loadCSVBuilder(chartData, contextLines) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const sandbox = { currentChartData: chartData, buildExportContextLines: () => contextLines };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'buildCSVBytes') + '\nthis.__build = buildCSVBytes;', sandbox);
  return sandbox.__build;
}

function loadExcelBuilder(chartData, contextLines, ranking) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const XLSX = {
    utils: {
      aoa_to_sheet: aoa => ({ __aoa: aoa }),
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; }
    }
  };
  const sandbox = {
    currentChartData: chartData,
    buildExportContextLines: () => contextLines,
    computeRankingWithGaps: () => ranking,
    XLSX
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'buildExcelWorkbook') + '\nthis.__build = buildExcelWorkbook;', sandbox);
  return sandbox.__build;
}

test('buildCSVBytes returns null when there is no chart data', () => {
  const build = loadCSVBuilder(null, []);
  assert.strictEqual(build(), null);
});

test('buildCSVBytes encodes context lines then the data rows as CSV bytes', () => {
  const chartData = { labels: ['Alice'], datasets: [{ label: 'Sport', data: [10] }] };
  const build = loadCSVBuilder(chartData, [['Période', 'Tout']]);
  const bytes = build();
  assert.ok(bytes instanceof Uint8Array);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /^# Période : Tout/);
  assert.match(text, /Alice,10/);
});

test('buildExcelWorkbook returns null when there is no chart data', () => {
  const build = loadExcelBuilder(null, [], []);
  assert.strictEqual(build(), null);
});

test('buildExcelWorkbook builds the 3 expected sheets', () => {
  const chartData = { labels: ['Alice'], datasets: [{ label: 'Sport', data: [10] }] };
  const ranking = [{ rank: 1, player: 'Alice', total: 10, gapToNext: null }];
  const build = loadExcelBuilder(chartData, [['Période', 'Tout']], ranking);
  const wb = build();
  assert.deepStrictEqual(wb.SheetNames, ['Scores', 'Classement', 'Contexte']);
  assert.deepStrictEqual(wb.Sheets['Scores'].__aoa[0], ['Joueur', 'Sport']);
  assert.deepStrictEqual(wb.Sheets['Scores'].__aoa[1], ['Alice', 10]);
  assert.deepStrictEqual(wb.Sheets['Classement'].__aoa[1], [1, 'Alice', 10, '']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/export-builders.test.js`
Expected: FAIL — `buildCSVBytes introuvable dans Index.html`.

- [ ] **Step 3: Refactor `exportAsCSV()`/`exportAsExcel()` in `Index.html`**

Replace:

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

with:

```js
  // Pure builder — no download side-effect, so exportAsCSV() and the season pack
  // (Task 4) can both call it without duplicating the CSV shape.
  function buildCSVBytes() {
    if (!currentChartData) return null;
    const { labels, datasets } = currentChartData;
    const contextLines = buildExportContextLines().map(([k, v]) => '# ' + k + ' : ' + v);
    const rows = [['Joueur', ...datasets.map(d => d.label)]];
    labels.forEach((l, i) => rows.push([l, ...datasets.map(d => d.data[i] || 0)]));
    return new TextEncoder().encode(contextLines.concat(rows.map(r => r.join(','))).join('\n'));
  }

  function exportAsCSV() {
    const bytes = buildCSVBytes();
    if (!bytes) { showToast('Aucune donnée', 'error'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], {type:'text/csv;charset=utf-8;'}));
    a.download = 'tops-des-tops.csv'; a.click();
    URL.revokeObjectURL(a.href);
    showToast('Export CSV OK', 'success');
  }
```

Replace:

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

with:

```js
  // Pure builder — no download side-effect, so exportAsExcel() and the season pack
  // (Task 4) can both call it without duplicating the 3-sheet shape. Assumes XLSX
  // is already loaded (both callers load it before calling this).
  function buildExcelWorkbook() {
    if (!currentChartData) return null;
    const { labels, datasets } = currentChartData;
    const sheetData = [['Joueur', ...datasets.map(d => d.label)]];
    labels.forEach((l, i) => sheetData.push([l, ...datasets.map(d => d.data[i] || 0)]));
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    const ranking = computeRankingWithGaps(currentChartData);
    const rankingData = [['Rang', 'Joueur', 'Total', 'Écart avec le suivant']];
    ranking.forEach(r => rankingData.push([r.rank, r.player, r.total, r.gapToNext === null ? '' : r.gapToNext]));
    const wsRanking = XLSX.utils.aoa_to_sheet(rankingData);

    const wsContext = XLSX.utils.aoa_to_sheet(buildExportContextLines());

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scores');
    XLSX.utils.book_append_sheet(wb, wsRanking, 'Classement');
    XLSX.utils.book_append_sheet(wb, wsContext, 'Contexte');
    return wb;
  }

  function exportAsExcel() {
    if (!currentChartData) { showToast('Aucune donnée', 'error'); return; }
    loadScriptOnce(EXPORT_LIBS.xlsx).then(() => {
      const wb = buildExcelWorkbook();
      XLSX.writeFile(wb, 'tops-des-tops_' + Date.now() + '.xlsx');
      showToast('Export Excel OK', 'success');
    }).catch(e => showToast('Erreur Excel : ' + e.message, 'error'));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/export-builders.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: all green, no regression.

- [ ] **Step 6: Manual verification**

Start the local preview, go to the Dashboard, click "📊 CSV" and "📗 Excel" — confirm both still download with the same filenames and content as before (3 sheets in Excel, comment-prefixed CSV).

- [ ] **Step 7: Commit**

```bash
git add Index.html tests/export-builders.test.js
git commit -m "refactor(export): extract buildCSVBytes/buildExcelWorkbook as pure builders"
```

---

### Task 4: `exportSeasonPack()` — one-click quarter export

**Files:**
- Modify: `Index.html:4302-4307` (export-buttons HTML)
- Modify: `Index.html` (add `exportSeasonPack()` near `exportAllCharts()`, ~line 12489)
- Modify: `Index.html:17791-17800` (`bindExportButtons()`)

**Interfaces:**
- Consumes: `quarterBounds()` (Task 1), `buildCSVBytes()`/`buildExcelWorkbook()` (Task 3), and existing globals `applyFilters(onDone)`, `EXPORT_LIBS`, `loadScriptOnce()`, `loadStoredExportOpts()`, `getRelevantPlayerNames()`, `loadAvatarImages()`, `BATCH_EXPORT_CHART_TYPES`, `chartTypeHasData()`, `switchChartType()`, `buildInfographicCanvas()`, `fflate`, `toDateStr()`.
- Produces: `exportSeasonPack()` (no return value — triggers a file download).

- [ ] **Step 1: Add the button to the export-buttons row**

In `Index.html`, replace:

```html
        <div class="export-buttons">
          <button class="export-btn" id="exportInfographicBtn">🎨 Infographie</button>
          <button class="export-btn" id="exportAllBtn">🗂️ Tout exporter</button>
          <button class="export-btn" data-export="csv">📊 CSV</button>
          <button class="export-btn" data-export="xlsx">📗 Excel</button>
        </div>
```

with:

```html
        <div class="export-buttons">
          <button class="export-btn" id="exportInfographicBtn">🎨 Infographie</button>
          <button class="export-btn" id="exportAllBtn">🗂️ Tout exporter</button>
          <button class="export-btn" id="exportSeasonBtn">🗓️ Ce trimestre</button>
          <button class="export-btn" data-export="csv">📊 CSV</button>
          <button class="export-btn" data-export="xlsx">📗 Excel</button>
        </div>
```

- [ ] **Step 2: Write `exportSeasonPack()`**

In `Index.html`, insert right after `exportAllCharts()`'s closing `}` (after the block that ends with `showToast('Export groupé OK', 'success'); }).catch(...)`, before the `// ── SAISIE LOT ──` comment:

```js

  // Filtre temporairement sur le trimestre en cours, construit un seul zip
  // (CSV + Excel + un PNG par type de graphique compatible), puis restaure le
  // filtre de période d'avant clic — ce bouton donne un fichier, il ne change
  // pas ce que le Dashboard affiche.
  function exportSeasonPack() {
    const btn = document.getElementById('exportSeasonBtn');
    const originalLabel = btn.textContent;
    const originalType  = currentChartType;
    const originalStart = document.getElementById('startDate').value;
    const originalEnd   = document.getElementById('endDate').value;
    btn.disabled = true;
    btn.textContent = '⏳ Export en cours…';

    const restoreFilters = () => {
      document.getElementById('startDate').value = originalStart;
      document.getElementById('endDate').value   = originalEnd;
      applyFilters();
    };

    const q = quarterBounds(new Date(), 0);
    document.getElementById('startDate').value = toDateStr(q.from);
    document.getElementById('endDate').value   = toDateStr(new Date());

    applyFilters(() => {
      Promise.all([loadScriptOnce(EXPORT_LIBS.zip), loadScriptOnce(EXPORT_LIBS.xlsx)]).then(async () => {
        const opts = loadStoredExportOpts();
        opts._topMoverResult = null;
        const avatarImages = await loadAvatarImages(getRelevantPlayerNames(), opts.avatars);
        const files = {};

        const csvBytes = buildCSVBytes();
        if (csvBytes) files['trimestre.csv'] = csvBytes;

        const wb = buildExcelWorkbook();
        if (wb) files['trimestre.xlsx'] = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

        for (const type of BATCH_EXPORT_CHART_TYPES) {
          await new Promise(resolve => switchChartType(type, resolve));
          if (!chartTypeHasData(type)) continue;
          const canvas = buildInfographicCanvas(opts, opts.scale, avatarImages);
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          const buf = await blob.arrayBuffer();
          files['trimestre-' + type + '.png'] = new Uint8Array(buf);
        }

        await new Promise(resolve => switchChartType(originalType, resolve));
        restoreFilters();
        btn.disabled = false;
        btn.textContent = originalLabel;

        if (!Object.keys(files).length) {
          showToast('Aucune donnée sur ce trimestre.', 'error');
          return;
        }
        const zipped = fflate.zipSync(files);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
        a.download = 'top-des-tops-trimestre-' + toDateStr(q.from) + '.zip';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('Export du trimestre : OK.', 'success');
      }).catch(e => {
        switchChartType(originalType, () => {});
        restoreFilters();
        btn.disabled = false;
        btn.textContent = originalLabel;
        showToast('Erreur export trimestre : ' + e.message, 'error');
      });
    });
  }
```

- [ ] **Step 3: Wire the button**

In `Index.html`, replace:

```js
  function bindExportButtons() {
    document.getElementById('exportInfographicBtn').addEventListener('click', openExportModal);
    document.getElementById('exportAllBtn').addEventListener('click', exportAllCharts);
```

with:

```js
  function bindExportButtons() {
    document.getElementById('exportInfographicBtn').addEventListener('click', openExportModal);
    document.getElementById('exportAllBtn').addEventListener('click', exportAllCharts);
    document.getElementById('exportSeasonBtn').addEventListener('click', exportSeasonPack);
```

- [ ] **Step 4: Syntax check**

Run: `npm run check:html`
Expected: no syntax errors.

- [ ] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: all green, no regression (this task adds no new automated tests — `exportSeasonPack()` is DOM/async orchestration verified live, same convention as the untested `exportAllCharts()`/`exportAsCSV()`/`exportAsExcel()` it's built from — no existing test file covers those either).

- [ ] **Step 6: Manual verification**

Start the local preview (`preview_start`, config `top-des-tops-frontend`), reload. In the browser:
1. `window._whoAmI = 'Alice'` (or select an identity via the picker) — exports don't require identity, this is only to mirror a realistic session.
2. `goToTab('tab-dashboard')`.
3. Dispatch a real click on `#exportSeasonBtn` (`document.getElementById('exportSeasonBtn').dispatchEvent(new MouseEvent('click', {bubbles:true}))`), confirm the button shows `⏳ Export en cours…`.
4. After it resolves, confirm the button text is restored, a success toast appeared, and the Dashboard's `startDate`/`endDate` inputs are back to their pre-click values (the temporary quarter filter was restored).
5. Confirm no console errors (`read_console_messages`, `onlyErrors: true`).

Note: this harness's `google.script.run` stub round-trips through a real HTTP call per `apiGetFilteredData` — no special mocking needed beyond what already backs `exportAllCharts()`'s existing manual-verification path.

- [ ] **Step 7: Commit**

```bash
git add Index.html
git commit -m "feat(export): add one-click quarter export pack (CSV+Excel+PNG zip)"
```

---

### Task 5: Changelog and push

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the changelog entry**

Add under a new version heading at the top of `CHANGELOG.md` (check the current top entry's version and bump the minor version):

```markdown
### Ajouté
**Humanisé** : Le Dashboard sait maintenant filtrer par trimestre — "Trimestre en cours" et "Trimestre précédent" apparaissent à côté des périodes existantes (Historique, Journal d'audit, Dashboard). Un nouveau bouton "🗓️ Ce trimestre" à côté des exports existants télécharge en un clic un pack complet du trimestre en cours (CSV + Excel + une image par type de graphique), sans changer ce qui est affiché à l'écran.
**Technique** : `Index.html` — nouveau `quarterBounds(refDate, offset)`, seule source de calcul des bornes de trimestre calendaire, consommée par `dateRangePreset()`/`DATE_RANGE_CHIPS` (Historique, Journal d'audit) et `rangePresetItems()` (Dashboard). `exportAsCSV()`/`exportAsExcel()` scindées en builders purs (`buildCSVBytes()`/`buildExcelWorkbook()`) réutilisés par le nouveau `exportSeasonPack()`, qui zip CSV+Excel+PNG (`fflate`, même dépendance que "Tout exporter") et restaure le filtre de période d'avant clic.
```

- [ ] **Step 2: Commit and push**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for the quarterly export pack"
git push
```
