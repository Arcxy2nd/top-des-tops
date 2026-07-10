# Dashboard — Interactivité du graphique principal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir le graphique principal du Dashboard (6 types) avec un tooltip riche (avatar + comparaison), une légende isolable, et un drill-down clic/tap vers un modal listant les entrées History concernées (édition description + suppression rapide), sur desktop (Index.html) et mobile (Mobile.html).

**Architecture:** Module d'interaction partagé par type de graphique — un jeu de fonctions JS (tooltip riche, légende isolable, modal de drill-down) réutilisé par les 6 branches de `renderChart()`/`renderTrendChart()` sur desktop, et son pendant dupliqué dans Mobile.html (fichiers séparés, pas de module partagé possible — convention déjà en place dans le projet). Le drill-down s'appuie sur un nouvel endpoint serveur `apiGetFilteredLogs` qui réutilise `StorageService.getFullHistoryRowsCached()`.

**Tech Stack:** Google Apps Script (Code.gs), HTML/CSS/JS vanilla (Index.html, Mobile.html), Chart.js, tests Node (`node --test`, harness VM sur Code.gs).

## Global Constraints

- Comportement préservé ailleurs — projet en "behavior-preserving only" : ne pas toucher aux fonctions existantes au-delà de ce que ce plan demande explicitement.
- Toute variable de couleur en CSS via les variables `--*` existantes, jamais de hex en dur (§6 context.md).
- Avatar obligatoire partout où un nom de joueur apparaît (§7 context.md).
- Toute évolution d'Index.html doit avoir son équivalent dans Mobile.html (§7 context.md) — sauf accord explicite contraire, absent ici : donc parité complète attendue.
- Pas de classe ES6, style objets littéraux/IIFE cohérent avec le reste du code (§8 context.md).
- Commit + push après chaque tâche (le push déclenche le déploiement auto).
- Tests backend via `npm test` (Node VM harness sur Code.gs) ; pas de harness frontend — vérification via `/verify` manuel dans l'app.

---

### Task 1 : Backend — endpoint `apiGetFilteredLogs` + granularité de tendance

**Files:**
- Modify: `Code.gs:557-569` (voisinage — nouvelle méthode ajoutée après `getFilteredLogs`)
- Modify: `Code.gs:927-994` (`AnalyticsService.getTrendData` — ajout du champ `granularity`)
- Modify: `Code.gs` (nouvelle fonction `apiGetFilteredLogs`, ajoutée après `apiGetFilteredData`, ligne ~1381)
- Modify: `tests/harness.js:127-156` (ajouter `apiGetFilteredLogs` à la liste d'exports)
- Create: `tests/dashboard-drilldown.test.js`

**Interfaces:**
- Produces: `StorageService.getFilteredFullLogs(players, categories, startDate, endDate)` → tableau d'objets `{ date, player, category, points, description, groupId, saiseur, rowIndex }` (mêmes champs que `getFullHistoryRowsCached()`, filtrés).
- Produces: `apiGetFilteredLogs(players, categories, startDate, endDate)` → `{ success: true, logs: [{ timestamp, player, category, points, description, rowIndex }] }` ou `{ success:false, error }`.
- Produces: `AnalyticsService.getTrendData(...)` retourne désormais `{ labels, series, granularity }` avec `granularity` ∈ `'day' | 'week' | 'month'`.

- [ ] **Step 1 : Ajouter `getFilteredFullLogs` dans `StorageService`, juste après `getFilteredLogs` (Code.gs:569)**

```javascript
  getFilteredFullLogs(players, categories, startDate, endDate) {
    const rows  = this.getFullHistoryRowsCached();
    const start = startDate ? new Date(startDate + 'T00:00:00') : null;
    const end   = endDate   ? new Date(endDate   + 'T23:59:59') : null;

    return rows.filter(rec => {
      if (players    && players.length    && !players.includes(rec.player))     return false;
      if (categories && categories.length && !categories.includes(rec.category)) return false;
      if (start && rec.date < start) return false;
      if (end   && rec.date > end)   return false;
      return true;
    });
  },
```

- [ ] **Step 2 : Ajouter le champ `granularity` au retour de `getTrendData` (Code.gs:993)**

Remplacer :
```javascript
    return { labels, series };
  }
};
```
par :
```javascript
    return { labels, series, granularity: gran };
  }
};
```

- [ ] **Step 3 : Ajouter l'endpoint `apiGetFilteredLogs`, juste après `apiGetFilteredData` (Code.gs, après ligne ~1380)**

```javascript
function apiGetFilteredLogs(players, categories, startDate, endDate) {
  try {
    const logs = StorageService.getFilteredFullLogs(players, categories, startDate, endDate);
    return {
      success: true,
      logs: logs.map(rec => ({
        timestamp:   rec.date.toISOString(),
        player:      rec.player,
        category:    rec.category,
        points:      rec.points,
        description: rec.description,
        rowIndex:    rec.rowIndex
      }))
    };
  } catch (e) { return fail(e); }
}
```

- [ ] **Step 4 : Exposer `apiGetFilteredLogs` dans le harness de test**

Dans `tests/harness.js`, dans la liste `epilogue` (~ligne 140-146), ajouter `'apiGetFilteredLogs, '` juste avant `'apiGetQuickStats: ...'`.

- [ ] **Step 5 : Écrire les tests dans `tests/dashboard-drilldown.test.js`**

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];
const D = s => new Date(s + 'T12:00:00');

test('apiGetFilteredLogs returns raw entries with rowIndex and description, filtered by player/category/date range', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'A', 'Jeux',  5, 'desc A1', '', 'A'],
    [D('2026-01-15'), 'A', 'Défis', 3, 'desc A2', '', 'A'],
    [D('2026-01-20'), 'B', 'Jeux',  4, 'desc B1', '', 'B'],
    [D('2026-02-01'), 'A', 'Jeux',  9, 'desc A3', '', 'A']  // hors plage testée
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetFilteredLogs(['A'], ['Jeux'], '2026-01-01', '2026-01-31');

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.logs.length, 1);
  assert.strictEqual(res.logs[0].player, 'A');
  assert.strictEqual(res.logs[0].category, 'Jeux');
  assert.strictEqual(res.logs[0].points, 5);
  assert.strictEqual(res.logs[0].description, 'desc A1');
  assert.strictEqual(res.logs[0].rowIndex, 2);
  assert.match(res.logs[0].timestamp, /^2026-01-10/);
});

test('apiGetFilteredLogs with no filters returns every valid entry', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'A', 'Jeux', 5, '', '', ''],
    [D('2026-01-11'), 'B', 'Défis', 2, '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });

  const res = gas.apiGetFilteredLogs(null, null, null, null);
  assert.strictEqual(res.logs.length, 2);
});

test('getTrendData reports day granularity for a short range', () => {
  const { AnalyticsService } = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'A', 'Jeux', 5, '', '', '']
  ]);
  // getTrendData lit StorageService.getFilteredLogs -> getAllLogs -> ConfigService.getSheets()
  const gas = loadGas();
  gas.ConfigService.getSheets = () => ({ history });
  const data = gas.AnalyticsService.getTrendData(['A'], null, '2026-01-01', '2026-01-15');
  assert.strictEqual(data.granularity, 'day');
  assert.match(data.labels[0], /^\d{4}-\d{2}-\d{2}$/);
});

test('getTrendData reports month granularity for a long range', () => {
  const gas = loadGas();
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'A', 'Jeux', 5, '', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });
  const data = gas.AnalyticsService.getTrendData(['A'], null, '2026-01-01', '2026-12-31');
  assert.strictEqual(data.granularity, 'month');
  assert.match(data.labels[0], /^\d{4}-\d{2}$/);
});
```

- [ ] **Step 6 : Lancer les tests**

Run: `npm test`
Expected: tous les tests passent, y compris les 4 nouveaux dans `dashboard-drilldown.test.js`.

- [ ] **Step 7 : Commit**

```bash
git add Code.gs tests/harness.js tests/dashboard-drilldown.test.js
git commit -m "feat: endpoint apiGetFilteredLogs + granularité de tendance pour le drill-down Dashboard"
git push
```

---

### Task 2 : Index.html — Tooltip riche (avatar + comparaison)

**Files:**
- Modify: `Index.html:1776-1809` (CSS `#chartCustomTooltip`)
- Modify: `Index.html:5556-5632` (`buildCustomTooltipPlugin`)
- Modify: `Index.html:5688-5952` (appels à `buildCustomTooltipPlugin()` dans les 6 branches de rendu)

**Interfaces:**
- Consumes: `cachedPlayers` (Index.html:2900, array `{name, color, meta}`), `playerColor(name)` (Index.html:4088), `getAvatarUrl(name, meta)` (Index.html:3025).
- Produces: `buildCustomTooltipPlugin(opts)` où `opts = { titleIsPlayer?: bool, rowsArePlayers?: bool, rankedTotals?: [{player, total}] }`. Signature élargie, rétro-compatible (`buildCustomTooltipPlugin()` sans argument garde le comportement actuel).

- [ ] **Step 1 : Étendre la CSS du tooltip pour l'avatar (Index.html, juste après la règle `.ctt-dot` ~ligne 1802)**

```css
    #chartCustomTooltip .ctt-avatar {
      width: 18px; height: 18px; border-radius: 50%;
      object-fit: cover; flex-shrink: 0;
    }
    #chartCustomTooltip .ctt-title-row {
      display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
    }
    #chartCustomTooltip .ctt-compare {
      margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border);
      font-size: 0.72rem; color: var(--text-muted);
    }
```

- [ ] **Step 2 : Ajouter un helper de comparaison, juste avant `buildCustomTooltipPlugin` (Index.html:5556)**

```javascript
  // Écart avec le rang immédiatement supérieur/inférieur, pour le tooltip riche.
  function comparisonText(rankedTotals, player) {
    if (!rankedTotals || rankedTotals.length < 2) return null;
    const i = rankedTotals.findIndex(r => r.player === player);
    if (i < 0) return null;
    if (i > 0) {
      const gap = rankedTotals[i - 1].total - rankedTotals[i].total;
      if (gap > 0) return '+' + gap + ' pts derrière ' + rankedTotals[i - 1].player;
    }
    if (i < rankedTotals.length - 1) {
      const gap = rankedTotals[i].total - rankedTotals[i + 1].total;
      if (gap > 0) return '+' + gap + ' pts devant ' + rankedTotals[i + 1].player;
    }
    return null;
  }

```

- [ ] **Step 3 : Réécrire `buildCustomTooltipPlugin` pour accepter `opts` et injecter avatar/comparaison (remplace Index.html:5556-5632)**

```javascript
  function buildCustomTooltipPlugin(opts) {
    opts = opts || {};
    const el = document.getElementById('chartCustomTooltip');
    if (!el) return {};

    return {
      id: 'customTooltip',
      afterInit(chart) {
        chart.options.plugins.tooltip.enabled = false;
        chart.options.plugins.tooltip.external = (ctx) => {
          const { chart: ch, tooltip } = ctx;
          if (tooltip.opacity === 0) { el.classList.remove('visible'); return; }

          el.innerHTML = '';

          if (tooltip.title && tooltip.title.length) {
            const titleText = tooltip.title[0];
            const titleWrap = document.createElement('div');
            titleWrap.className = 'ctt-title-row';
            if (opts.titleIsPlayer) {
              const p = cachedPlayers.find(pl => pl.name === titleText);
              const img = document.createElement('img');
              img.className = 'ctt-avatar';
              img.src = getAvatarUrl(titleText, p ? p.meta : '');
              img.onerror = () => img.remove();
              titleWrap.appendChild(img);
            }
            const titleEl = document.createElement('span');
            titleEl.className = 'ctt-title';
            titleEl.textContent = titleText;
            if (opts.titleIsPlayer) titleEl.style.color = playerColor(titleText);
            titleWrap.appendChild(titleEl);
            el.appendChild(titleWrap);
          }

          tooltip.dataPoints.forEach(dp => {
            const dsLabel = dp.dataset.label || '';
            const color = Array.isArray(dp.dataset.backgroundColor)
              ? dp.dataset.backgroundColor[dp.dataIndex]
              : (dp.dataset.borderColor || dp.dataset.backgroundColor || 'var(--accent)');

            const row = document.createElement('div');
            row.className = 'ctt-row';

            const isPlayerRow = opts.rowsArePlayers && cachedPlayers.some(pl => pl.name === dsLabel);
            let indicator;
            if (isPlayerRow) {
              const p = cachedPlayers.find(pl => pl.name === dsLabel);
              indicator = document.createElement('img');
              indicator.className = 'ctt-avatar';
              indicator.src = getAvatarUrl(dsLabel, p ? p.meta : '');
              indicator.onerror = () => indicator.remove();
            } else {
              const icon = dp.dataset._catName  ? catIcon(dp.dataset._catName)
                         : dp.dataset._catNames ? catIcon(dp.dataset._catNames[dp.dataIndex])
                         : '';
              if (icon) {
                indicator = document.createElement('span');
                indicator.className = 'ctt-emoji-badge';
                indicator.style.background = color;
                indicator.textContent = icon;
              } else {
                indicator = document.createElement('span');
                indicator.className = 'ctt-dot';
                indicator.style.background = color;
              }
            }

            const label = document.createElement('span');
            label.className = 'ctt-label';
            label.textContent = dsLabel;

            const val = document.createElement('span');
            val.className = 'ctt-val';
            val.textContent = dp.formattedValue + ' pts';

            row.appendChild(indicator); row.appendChild(label); row.appendChild(val);
            el.appendChild(row);
          });

          if (opts.titleIsPlayer && opts.rankedTotals) {
            const cmp = comparisonText(opts.rankedTotals, tooltip.title[0]);
            if (cmp) {
              const cmpEl = document.createElement('div');
              cmpEl.className = 'ctt-compare';
              cmpEl.textContent = cmp;
              el.appendChild(cmpEl);
            }
          }

          const wrapper = document.getElementById('chartWrapper');
          const wRect   = wrapper ? wrapper.getBoundingClientRect() : ch.canvas.getBoundingClientRect();
          const cRect   = ch.canvas.getBoundingClientRect();

          let x = cRect.left - wRect.left + tooltip.caretX + 14;
          let y = cRect.top  - wRect.top  + tooltip.caretY - 10;

          const elW = el.offsetWidth || 180;
          const elH = el.offsetHeight || 80;
          if (x + elW > wRect.width - 8) x = cRect.left - wRect.left + tooltip.caretX - elW - 14;
          if (y + elH > wRect.height - 8) y = wRect.height - elH - 8;
          if (y < 0) y = 4;

          el.style.left = x + 'px';
          el.style.top  = y + 'px';
          el.classList.add('visible');
        };
      }
    };
  }
```

- [ ] **Step 4 : Brancher `opts` sur les 6 branches de rendu**

Dans `renderChart()` :
- Doughnut (Index.html:5692) : laisser `buildCustomTooltipPlugin()` sans argument (un seul joueur déjà sélectionné, comparaison sans objet).
- Radar (Index.html:5719) : remplacer par `buildCustomTooltipPlugin({ rowsArePlayers: true })`.
- Ranking (Index.html:5770), juste avant l'appel, calculer les totaux classés déjà disponibles (`totals` existe dans ce bloc, Index.html:5732) :
  ```javascript
  const rankedTotals = totals.map(t => ({ player: t.player, total: t.total }));
  ```
  puis remplacer `buildCustomTooltipPlugin()` par `buildCustomTooltipPlugin({ titleIsPlayer: true, rankedTotals })`.
- Stacked/Grouped (Index.html:5833), juste avant l'appel, calculer :
  ```javascript
  const rankedTotals = sorted.labels
    .map((p, i) => ({ player: p, total: sorted.datasets.reduce((s, ds) => s + (ds.data[i] || 0), 0) }))
    .sort((a, b) => b.total - a.total);
  ```
  puis remplacer `buildCustomTooltipPlugin()` par `buildCustomTooltipPlugin({ titleIsPlayer: true, rankedTotals })`.

Dans `renderTrendChart()` (Index.html:5952) : remplacer `buildCustomTooltipPlugin()` par `buildCustomTooltipPlugin({ rowsArePlayers: true })`.

- [ ] **Step 5 : Vérification manuelle**

Démarrer l'app (`/verify` ou dev server GAS), ouvrir le Dashboard, survoler chaque type de graphique : vérifier l'avatar affiché, la couleur du nom, et la ligne de comparaison sur empilé/groupé/classement.

- [ ] **Step 6 : Commit**

```bash
git add Index.html
git commit -m "feat: tooltip riche (avatar + comparaison) sur le graphique principal du Dashboard"
git push
```

---

### Task 3 : Index.html — Légende isolable

**Files:**
- Modify: `Index.html:5648-5654` (`baseOpts`)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `isolatableLegendOnClick(e, legendItem, legend)` — fonction réutilisée comme `legend.onClick` pour tous les types multi-séries.

- [ ] **Step 1 : Ajouter le handler de légende isolable, juste avant `renderChart` (Index.html:5634)**

```javascript
  // Légende isolable : clic isole la série cliquée (masque les autres), reclic restaure tout.
  function isolatableLegendOnClick(e, legendItem, legend) {
    const chart = legend.chart;
    const metas = chart.data.datasets.map((_, i) => chart.getDatasetMeta(i));
    const onlyThisVisible = metas.every((m, i) => i === legendItem.datasetIndex ? !m.hidden : !!m.hidden);

    if (onlyThisVisible) {
      metas.forEach(m => { m.hidden = false; });
    } else {
      metas.forEach((m, i) => { m.hidden = i !== legendItem.datasetIndex; });
    }
    chart.update();
  }

```

- [ ] **Step 2 : Brancher sur `baseOpts` (Index.html:5651)**

Remplacer :
```javascript
        legend: { labels: { color: c.text, font: { size: 12 } } },
```
par :
```javascript
        legend: { labels: { color: c.text, font: { size: 12 } }, onClick: isolatableLegendOnClick },
```

- [ ] **Step 3 : Brancher aussi sur la légende du Radar, Trend, et Doughnut**

Radar utilise déjà `baseOpts` étalé (Index.html:5710) → héritage automatique, rien à faire.
Trend (Index.html:5948), remplacer :
```javascript
          legend: { labels: { color: c.text, font: { size: 12 } } },
```
par :
```javascript
          legend: { labels: { color: c.text, font: { size: 12 } }, onClick: isolatableLegendOnClick },
```
Doughnut (Index.html:5691) hérite de `baseOpts.plugins` via le spread `{...baseOpts.plugins, tooltip: ...}` → héritage automatique.

Ranking reste exclu (spec §2 : pas de légende isolable sur le Classement) — ne pas toucher Index.html:5763.

- [ ] **Step 4 : Vérification manuelle**

Sur un graphique empilé/groupé/radar/trend/donut avec ≥3 séries : cliquer un item de légende → seule cette série reste visible ; recliquer dessus → tout revient.

- [ ] **Step 5 : Commit**

```bash
git add Index.html
git commit -m "feat: légende isolable sur le graphique principal du Dashboard"
git push
```

---

### Task 4 : Index.html — Modal de drill-down + clic sur le graphique

**Files:**
- Modify: `Index.html` (nouvelle fonction `openChartDrilldown`, ajoutée à côté de `openLotRecapModal`, ~ligne 4817)
- Modify: `Index.html:5688-5952` (ajout de `onClick` sur les 6 instances Chart.js)

**Interfaces:**
- Consumes: `apiGetFilteredLogs` (Task 1), `#modalBackdrop`/`#modalBox` (Index.html:2882-2883), `closeModal()` (Index.html:4808), `openConfirmModal(msg, onConfirm)` (Index.html:4849), `callServer()`.
- Produces: `openChartDrilldown(context)` où `context = { players: string[]|null, categories: string[]|null, startDate: string|null, endDate: string|null, title: string }`.

- [ ] **Step 1 : Ajouter `openChartDrilldown`, juste avant `openConfirmModal` (Index.html:4849)**

```javascript
  function drilldownRowHtml(log) {
    const p = cachedPlayers.find(pl => pl.name === log.player);
    const avatar = getAvatarUrl(log.player, p ? p.meta : '');
    const d = new Date(log.timestamp);
    const ds = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    return '<div class="drilldown-row" data-row="' + log.rowIndex + '">' +
      '<img class="drilldown-avatar" src="' + escapeHtml(avatar) + '" alt="">' +
      '<div class="drilldown-main">' +
        '<div class="drilldown-meta">' + escapeHtml(log.player) + ' · ' + escapeHtml(log.category) + ' · ' + ds + ' · <strong>' + log.points + ' pts</strong></div>' +
        '<input type="text" class="drilldown-desc" value="' + escapeHtml(log.description || '') + '" placeholder="Description…" data-row="' + log.rowIndex + '">' +
      '</div>' +
      '<button class="danger small drilldown-del" data-row="' + log.rowIndex + '" title="Supprimer">🗑️</button>' +
    '</div>';
  }

  function openChartDrilldown(context) {
    const box = document.getElementById('modalBox');
    box.classList.add('wide');
    box.innerHTML = '<h3>' + escapeHtml(context.title) + '</h3><div id="drilldownList" class="drilldown-list"><p class="text-muted">Chargement…</p></div>' +
      '<div class="modal-actions"><button id="drilldownClose" class="secondary">Fermer</button></div>';
    document.getElementById('drilldownClose').onclick = closeModal;
    document.getElementById('modalBackdrop').style.display = 'flex';

    callServer('apiGetFilteredLogs', [context.players, context.categories, context.startDate, context.endDate], res => {
      const list = document.getElementById('drilldownList');
      if (!list) return; // modal fermé avant la réponse
      const logs = (res.logs || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      if (!logs.length) {
        list.innerHTML = '<p class="text-muted">Aucune entrée trouvée.</p>';
        return;
      }
      list.innerHTML = logs.map(drilldownRowHtml).join('');

      list.querySelectorAll('.drilldown-desc').forEach(input => {
        input.addEventListener('change', () => {
          callServer('apiUpdateHistoryDescription', [input.dataset.row, input.value], () => {
            showToast('Description mise à jour.', 'success');
          }, 'Mise à jour');
        });
      });

      list.querySelectorAll('.drilldown-del').forEach(btn => {
        btn.addEventListener('click', () => {
          openConfirmModal('Supprimer cette entrée ?', () => {
            callServer('apiDeleteHistoryEntries', [[btn.dataset.row], _whoAmI || ''], () => {
              showToast('Entrée supprimée.', 'success', {
                undo: () => callServer('apiUndoAuditEntry', [btn.dataset.row, 'delete'], () => openChartDrilldown(context))
              });
              openChartDrilldown(context);
            }, 'Suppression');
          });
        });
      });
    }, 'Chargement du détail');
  }

```

> Note d'implémentation : vérifier avant d'écrire ce step le format exact du 3ᵉ argument de `showToast` avec undo (Index.html, chercher `showToast(` avec option `undo`) — reprendre exactement le même format que celui déjà utilisé par la suppression dans l'onglet Historique existant (Index.html ~ligne 7804-7847) plutôt que d'inventer un format. Si le format diffère de celui montré ci-dessus, l'adapter en conséquence — le comportement (toast + undo qui rappelle `apiUndoAuditEntry`) doit rester identique à celui de l'Historique.

- [ ] **Step 2 : Ajouter le CSS des lignes de drilldown, dans la section modal existante (chercher `.lot-recap-row` dans Index.html et ajouter juste après son bloc)**

```css
    .drilldown-list { max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
    .drilldown-row { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
    .drilldown-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .drilldown-main { flex: 1; min-width: 0; }
    .drilldown-meta { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 4px; }
    .drilldown-desc { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--text); font-size: 0.85rem; }
```

- [ ] **Step 3 : Brancher le clic sur chaque type de graphique dans `renderChart()`/`renderTrendChart()`**

Pour chaque instance `new Chart(...)`, ajouter `onClick` dans `options` et calculer le `context` à partir de l'élément cliqué. Utiliser `onClick(evt, elements)` fourni par Chart.js (le tableau `elements` est vide si le clic ne touche aucun élément — dans ce cas ne rien faire).

**Stacked/grouped** (Index.html, dans l'objet `options` du bloc bar ~5825-5832), ajouter :
```javascript
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const el = elements[0];
          const player = displayData.labels[el.index];
          const category = sorted.datasets[el.datasetIndex].label;
          openChartDrilldown({
            players: [player], categories: [category],
            startDate: document.getElementById('startDate').value || null,
            endDate: document.getElementById('endDate').value || null,
            title: player + ' · ' + catDisplay(category)
          });
        },
```

**Radar** (options du bloc radar ~5709-5718), ajouter :
```javascript
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const el = elements[0];
          const player = radarDatasets[el.datasetIndex].label;
          const category = data.datasets[el.index].label;
          openChartDrilldown({
            players: [player], categories: [category],
            startDate: document.getElementById('startDate').value || null,
            endDate: document.getElementById('endDate').value || null,
            title: player + ' · ' + catDisplay(category)
          });
        },
```

**Doughnut** (options du bloc doughnut ~5691), remplacer :
```javascript
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, tooltip: { mode: 'point' } } },
```
par :
```javascript
        options: {
          ...baseOpts,
          plugins: { ...baseOpts.plugins, tooltip: { mode: 'point' } },
          onClick: (evt, elements) => {
            if (!elements.length) return;
            const category = segLabels[elements[0].index];
            openChartDrilldown({
              players: [player], categories: [category],
              startDate: document.getElementById('startDate').value || null,
              endDate: document.getElementById('endDate').value || null,
              title: player + ' · ' + catDisplay(category)
            });
          }
        },
```

**Ranking** (options du bloc ranking ~5756-5769), ajouter dans `options` :
```javascript
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const el = elements[0];
          const row = totals[el.index];
          const ctxCategories = chartOptions.detailed ? [data.datasets[el.datasetIndex].label] : null;
          openChartDrilldown({
            players: [row.player], categories: ctxCategories,
            startDate: document.getElementById('startDate').value || null,
            endDate: document.getElementById('endDate').value || null,
            title: row.player + (ctxCategories ? ' · ' + catDisplay(ctxCategories[0]) : '')
          });
        },
```

**Trend** (options du bloc trend ~5940-5951), ajouter :
```javascript
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const el = elements[0];
          const player = players[el.datasetIndex];
          const label = trendData.labels[el.index];
          const gran = trendData.granularity;
          let startDate = label, endDate = label;
          if (gran === 'week') {
            const d = new Date(label + 'T00:00:00'); d.setDate(d.getDate() + 6);
            endDate = d.toISOString().slice(0, 10);
          } else if (gran === 'month') {
            startDate = label + '-01';
            const d = new Date(label + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0);
            endDate = d.toISOString().slice(0, 10);
          }
          openChartDrilldown({
            players: [player], categories: selectedCategoryChips.size ? Array.from(selectedCategoryChips) : null,
            startDate, endDate,
            title: player + ' · ' + label
          });
        },
```

- [ ] **Step 4 : Vérification manuelle**

Cliquer sur un segment de chaque type de graphique → le modal s'ouvre avec la liste des entrées correspondantes, avatar visible, édition de description fonctionnelle, suppression avec confirmation fonctionnelle, et l'action apparaît dans le Journal d'audit (onglet Historique → 🔍 Journal d'audit) avec un bouton Annuler qui fonctionne.

- [ ] **Step 5 : Commit**

```bash
git add Index.html
git commit -m "feat: drill-down clic sur le graphique principal du Dashboard (modal + édition/suppression rapide)"
git push
```

---

### Task 5 : Mobile.html — Tooltip riche + légende isolable

**Files:**
- Modify: `Mobile.html` (structure HTML autour de `#mMainChart`, ~ligne 596)
- Modify: `Mobile.html` (CSS, ajouter près des styles existants de card)
- Modify: `Mobile.html:759-833` (`renderBarChart`, `renderTrendChart`, `renderRadarChart`, `renderDonutChart`)

**Interfaces:**
- Consumes: `cachedPlayers`, `playerColor(name)`, `avatarImgHtml` ou équivalent déjà utilisé en Mobile.html (vérifier le nom exact avant d'écrire ce step — utilisé ligne 1266 dans `historyCardHtml`).
- Produces: `buildMobileTooltipPlugin(opts)` (même signature que `buildCustomTooltipPlugin` côté desktop), `isolatableLegendOnClick` (dupliqué, Mobile.html est un fichier séparé).

- [ ] **Step 1 : Ajouter le wrapper et l'élément tooltip autour du canvas (Mobile.html, remplacer la ligne `'<canvas id="mMainChart" height="260"></canvas>' +` ~ligne 596)**

```javascript
        '<div class="m-chart-wrapper" id="mChartWrapper" style="position:relative;">' +
          '<canvas id="mMainChart" height="260"></canvas>' +
          '<div id="mChartCustomTooltip" role="tooltip"></div>' +
        '</div>' +
```

- [ ] **Step 2 : Ajouter la CSS du tooltip mobile (à côté des styles existants, section `<style>` de Mobile.html)**

```css
    #mChartCustomTooltip {
      position: absolute; pointer-events: none; opacity: 0; transition: opacity 0.1s;
      background: var(--card); border: 1px solid var(--border); border-radius: 8px;
      padding: 8px 10px; font-size: 0.78rem; z-index: 20; min-width: 140px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    #mChartCustomTooltip.visible { opacity: 1; }
    #mChartCustomTooltip .ctt-title-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-weight: 700; }
    #mChartCustomTooltip .ctt-avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; }
    #mChartCustomTooltip .ctt-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
    #mChartCustomTooltip .ctt-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    #mChartCustomTooltip .ctt-label { flex: 1; color: var(--text-muted); }
    #mChartCustomTooltip .ctt-val { font-weight: 700; }
    #mChartCustomTooltip .ctt-compare { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border); font-size: 0.7rem; color: var(--text-muted); }
```

- [ ] **Step 3 : Ajouter `buildMobileTooltipPlugin` et `isolatableLegendOnClick`, juste avant `destroyChart()` (Mobile.html:759)**

```javascript
  function mComparisonText(rankedTotals, player) {
    if (!rankedTotals || rankedTotals.length < 2) return null;
    const i = rankedTotals.findIndex(r => r.player === player);
    if (i < 0) return null;
    if (i > 0) {
      const gap = rankedTotals[i - 1].total - rankedTotals[i].total;
      if (gap > 0) return '+' + gap + ' pts derrière ' + rankedTotals[i - 1].player;
    }
    if (i < rankedTotals.length - 1) {
      const gap = rankedTotals[i].total - rankedTotals[i + 1].total;
      if (gap > 0) return '+' + gap + ' pts devant ' + rankedTotals[i + 1].player;
    }
    return null;
  }

  function isolatableLegendOnClick(e, legendItem, legend) {
    const chart = legend.chart;
    const metas = chart.data.datasets.map((_, i) => chart.getDatasetMeta(i));
    const onlyThisVisible = metas.every((m, i) => i === legendItem.datasetIndex ? !m.hidden : !!m.hidden);
    if (onlyThisVisible) { metas.forEach(m => { m.hidden = false; }); }
    else { metas.forEach((m, i) => { m.hidden = i !== legendItem.datasetIndex; }); }
    chart.update();
  }

  function buildMobileTooltipPlugin(opts) {
    opts = opts || {};
    const el = document.getElementById('mChartCustomTooltip');
    if (!el) return {};
    return {
      id: 'mCustomTooltip',
      afterInit(chart) {
        chart.options.plugins.tooltip.enabled = false;
        chart.options.plugins.tooltip.external = (ctx) => {
          const { chart: ch, tooltip } = ctx;
          if (tooltip.opacity === 0) { el.classList.remove('visible'); return; }
          el.innerHTML = '';

          if (tooltip.title && tooltip.title.length) {
            const titleText = tooltip.title[0];
            const wrap = document.createElement('div');
            wrap.className = 'ctt-title-row';
            if (opts.titleIsPlayer) {
              const p = cachedPlayers.find(pl => pl.name === titleText);
              const img = document.createElement('img');
              img.className = 'ctt-avatar';
              img.src = getAvatarUrl(titleText, p ? p.meta : '');
              img.onerror = () => img.remove();
              wrap.appendChild(img);
            }
            const t = document.createElement('span');
            t.textContent = titleText;
            if (opts.titleIsPlayer) t.style.color = playerColor(titleText);
            wrap.appendChild(t);
            el.appendChild(wrap);
          }

          tooltip.dataPoints.forEach(dp => {
            const dsLabel = dp.dataset.label || '';
            const color = Array.isArray(dp.dataset.backgroundColor)
              ? dp.dataset.backgroundColor[dp.dataIndex]
              : (dp.dataset.borderColor || dp.dataset.backgroundColor || 'var(--accent)');
            const row = document.createElement('div');
            row.className = 'ctt-row';
            const isPlayerRow = opts.rowsArePlayers && cachedPlayers.some(pl => pl.name === dsLabel);
            let indicator;
            if (isPlayerRow) {
              const p = cachedPlayers.find(pl => pl.name === dsLabel);
              indicator = document.createElement('img');
              indicator.className = 'ctt-avatar';
              indicator.src = getAvatarUrl(dsLabel, p ? p.meta : '');
              indicator.onerror = () => indicator.remove();
            } else {
              indicator = document.createElement('span');
              indicator.className = 'ctt-dot';
              indicator.style.background = color;
            }
            const label = document.createElement('span');
            label.className = 'ctt-label';
            label.textContent = dsLabel;
            const val = document.createElement('span');
            val.className = 'ctt-val';
            val.textContent = dp.formattedValue + ' pts';
            row.appendChild(indicator); row.appendChild(label); row.appendChild(val);
            el.appendChild(row);
          });

          if (opts.titleIsPlayer && opts.rankedTotals) {
            const cmp = mComparisonText(opts.rankedTotals, tooltip.title[0]);
            if (cmp) {
              const cmpEl = document.createElement('div');
              cmpEl.className = 'ctt-compare';
              cmpEl.textContent = cmp;
              el.appendChild(cmpEl);
            }
          }

          const wrapper = document.getElementById('mChartWrapper');
          const wRect = wrapper.getBoundingClientRect();
          const cRect = ch.canvas.getBoundingClientRect();
          let x = cRect.left - wRect.left + tooltip.caretX + 10;
          let y = cRect.top - wRect.top + tooltip.caretY - 10;
          const elW = el.offsetWidth || 160;
          const elH = el.offsetHeight || 70;
          if (x + elW > wRect.width - 6) x = wRect.width - elW - 6;
          if (x < 0) x = 4;
          if (y + elH > wRect.height - 6) y = wRect.height - elH - 6;
          if (y < 0) y = 4;
          el.style.left = x + 'px';
          el.style.top = y + 'px';
          el.classList.add('visible');
        };
      }
    };
  }

```

> Note d'implémentation : vérifier avant d'écrire ce step le nom exact du helper d'avatar utilisé en Mobile.html (`getAvatarUrl` est défini dans Index.html — chercher s'il existe une fonction identique ou différemment nommée dans Mobile.html, ex. via `grep -n "function getAvatarUrl" Mobile.html`) et l'utiliser tel quel plutôt que d'assumer le même nom.

- [ ] **Step 4 : Brancher `buildMobileTooltipPlugin` et la légende isolable sur les 4 fonctions de rendu (Mobile.html:767-833)**

`renderBarChart` : ajouter `plugins: { legend: { labels: { color: chartTextColor() }, onClick: isolatableLegendOnClick } }` (reste identique sinon), et ajouter au niveau racine de la config Chart.js `plugins: [buildMobileTooltipPlugin({ titleIsPlayer: true })]` — nécessite de connaître les totaux classés : avant l'appel `new Chart`, calculer :
```javascript
    const rankedTotals = chartData.labels
      .map((p, i) => ({ player: p, total: chartData.datasets.reduce((s, ds) => s + (ds.data[i] || 0), 0) }))
      .sort((a, b) => b.total - a.total);
```
puis utiliser `buildMobileTooltipPlugin({ titleIsPlayer: true, rankedTotals })`.

`renderTrendChart` : `plugins: [buildMobileTooltipPlugin({ rowsArePlayers: true })]`, légende avec `onClick: isolatableLegendOnClick`.

`renderRadarChart` : `plugins: [buildMobileTooltipPlugin({ rowsArePlayers: true })]`, légende avec `onClick: isolatableLegendOnClick`.

`renderDonutChart` : `plugins: [buildMobileTooltipPlugin()]` (pas de comparaison, cohérent avec le donut desktop), légende avec `onClick: isolatableLegendOnClick`.

Dans chaque cas, ajouter `plugins.tooltip.mode`/`intersect` cohérents avec l'existant desktop si absent (`mode:'index', intersect:false` pour bar/trend/radar ; par défaut pour donut) — reprendre les réglages déjà en place sur `mDashboardChart` sans les casser.

- [ ] **Step 5 : Vérification manuelle**

Ouvrir l'app en vue mobile (`?view=mobile` ou largeur d'écran réduite), Dashboard, tester le tap sur chaque type de graphique → tooltip riche affiché avec avatar. Tester le tap sur la légende → isolement/restauration.

- [ ] **Step 6 : Commit**

```bash
git add Mobile.html
git commit -m "feat: tooltip riche + légende isolable sur le graphique Dashboard mobile"
git push
```

---

### Task 6 : Mobile.html — Drill-down (tap-tap) réutilisant `historyCardHtml`

**Files:**
- Modify: `Mobile.html` (nouvelle fonction `openChartDrilldownMobile`, ajoutée à côté de `openConfirmModal`, ~ligne 349)
- Modify: `Mobile.html:759-833` (ajout du double-tap sur chaque graphique)

**Interfaces:**
- Consumes: `historyCardHtml(log)` (Mobile.html:1260), `openModal`/`closeModal` (Mobile.html:331-338), `apiGetFilteredLogs` (Task 1), `openHistoryEditModal` (déjà utilisé ligne ~1297 — vérifier son nom exact avant utilisation), `apiDeleteHistoryEntries`.
- Produces: `openChartDrilldownMobile(context)` (même forme de `context` que côté desktop), `registerChartTapDrilldown(chart, contextBuilder)` — utilitaire générique gérant le "1er tap = tooltip (déjà géré par Chart.js), 2e tap sur le même élément dans les 600ms = ouvre le modal".

- [ ] **Step 1 : Ajouter `openChartDrilldownMobile`, juste après `openConfirmModal` (Mobile.html:349)**

```javascript
  let mDrilldownLoaded = [];

  function bindDrilldownActions(context) {
    document.querySelectorAll('#mDrilldownList [data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        openConfirmModal('Supprimer cette entrée ?', () => {
          buzz();
          callServer('apiDeleteHistoryEntries', [[btn.dataset.del], _whoAmI || ''], () => {
            showToast('Entrée supprimée.', 'success');
            openChartDrilldownMobile(context);
          }, 'Suppression entrée');
        });
      });
    });
    document.querySelectorAll('#mDrilldownList [data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireIdentity()) return;
        const log = mDrilldownLoaded.find(l => String(l.rowIndex) === String(btn.dataset.edit));
        openHistoryEditModal(log, () => openChartDrilldownMobile(context));
      });
    });
  }

  function openChartDrilldownMobile(context) {
    openModal(
      '<h2>' + escapeHtml(context.title) + '</h2>' +
      '<div id="mDrilldownList"><p class="m-empty">Chargement…</p></div>' +
      '<div class="m-row" style="justify-content:flex-end; margin-top:12px;"><button class="small" id="mDrilldownClose">Fermer</button></div>'
    );
    document.getElementById('mDrilldownClose').addEventListener('click', closeModal);

    callServer('apiGetFilteredLogs', [context.players, context.categories, context.startDate, context.endDate], res => {
      const list = document.getElementById('mDrilldownList');
      if (!list) return;
      mDrilldownLoaded = (res.logs || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      list.innerHTML = mDrilldownLoaded.length
        ? mDrilldownLoaded.map(historyCardHtml).join('')
        : '<p class="m-empty">Aucune entrée trouvée.</p>';
      bindDrilldownActions(context);
    }, 'Chargement du détail');
  }

  // 1er tap = tooltip natif (déjà géré par Chart.js), 2e tap sur le même élément
  // dans les 600ms suivant le 1er = ouvre le drill-down.
  function registerChartTapDrilldown(chart, contextBuilder) {
    let lastTapKey = null, lastTapTime = 0;
    chart.options.onClick = (evt, elements) => {
      if (!elements.length) return;
      const el = elements[0];
      const key = el.datasetIndex + '-' + el.index;
      const now = Date.now();
      if (lastTapKey === key && (now - lastTapTime) < 600) {
        lastTapKey = null;
        const context = contextBuilder(el);
        if (context) openChartDrilldownMobile(context);
      } else {
        lastTapKey = key;
        lastTapTime = now;
      }
    };
  }

```

> Note d'implémentation : vérifier avant d'écrire ce step la signature exacte d'`openHistoryEditModal` (accepte-t-elle un callback de succès, ou recharge-t-elle toujours `loadHistoryTab()` en dur ?). Si elle ne prend pas de callback, l'appeler telle quelle et, à la fermeture de son propre modal, rouvrir manuellement le drill-down via `openChartDrilldownMobile(context)` câblé sur son bouton de sauvegarde plutôt que d'inventer un paramètre qui n'existe pas.

- [ ] **Step 2 : Câbler `registerChartTapDrilldown` sur chaque graphique (Mobile.html:767-833)**

Après chaque `mDashboardChart = new Chart(ctx, {...});`, ajouter l'appel correspondant :

`renderBarChart` (après la création, avant la fermeture de fonction) :
```javascript
    registerChartTapDrilldown(mDashboardChart, el => {
      const player = chartData.labels[el.index];
      const category = type === 'bar' && stacked === undefined ? null : (chartData.datasets[el.datasetIndex] || {}).label;
      return { players: [player], categories: category ? [category] : null,
        startDate: periodBounds(mFilterPeriod).start, endDate: periodBounds(mFilterPeriod).end,
        title: player + (category ? ' · ' + category : '') };
    });
```

`renderTrendChart` :
```javascript
    registerChartTapDrilldown(mDashboardChart, el => {
      const player = Object.keys(trendData.series)[el.datasetIndex];
      const label = trendData.labels[el.index];
      const gran = trendData.granularity;
      let startDate = label, endDate = label;
      if (gran === 'week') { const d = new Date(label + 'T00:00:00'); d.setDate(d.getDate() + 6); endDate = d.toISOString().slice(0, 10); }
      else if (gran === 'month') { startDate = label + '-01'; const d = new Date(label + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); endDate = d.toISOString().slice(0, 10); }
      return { players: [player], categories: null, startDate, endDate, title: player + ' · ' + label };
    });
```

`renderRadarChart` :
```javascript
    registerChartTapDrilldown(mDashboardChart, el => {
      const player = chartData.datasets[el.datasetIndex].label;
      const category = chartData.labels[el.index];
      return { players: [player], categories: [category],
        startDate: periodBounds(mFilterPeriod).start, endDate: periodBounds(mFilterPeriod).end,
        title: player + ' · ' + category };
    });
```

`renderDonutChart` :
```javascript
    registerChartTapDrilldown(mDashboardChart, el => {
      const category = chartData.labels[el.index];
      return { players: null, categories: [category],
        startDate: periodBounds(mFilterPeriod).start, endDate: periodBounds(mFilterPeriod).end,
        title: category };
    });
```

> Note d'implémentation : vérifier avant d'écrire ce step la signature exacte de `periodBounds(mFilterPeriod)` (Mobile.html ~ligne 741) — confirmer qu'elle retourne bien `{ start, end }` avec ces noms de clés (déjà utilisée ligne 741 sous cette forme) avant de la réutiliser dans ces callbacks.

- [ ] **Step 3 : Vérification manuelle**

Sur mobile, taper une fois sur un point → tooltip riche. Taper une 2e fois dans la foulée sur le même point → modal drill-down avec les cartes `historyCardHtml`, édition et suppression fonctionnelles.

- [ ] **Step 4 : Commit**

```bash
git add Mobile.html
git commit -m "feat: drill-down tap-tap sur le graphique Dashboard mobile"
git push
```

---

### Task 7 : Changelog + vérification finale

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1 : Ajouter l'entrée changelog**

```markdown
## [Unreleased]

### Ajouté
**Humanisé** : Sur le graphique principal du Dashboard, survoler une barre/point affiche maintenant l'avatar du joueur et son écart avec les autres. Cliquer (ou taper deux fois sur mobile) dessus ouvre la liste des scores concernés, avec possibilité de corriger la description ou de supprimer une entrée directement depuis le graphique. Cliquer sur un nom dans la légende isole sa courbe/barre pour mieux la comparer aux autres.
**Technique** : Nouvel endpoint `apiGetFilteredLogs` (Code.gs) réutilisant `StorageService.getFullHistoryRowsCached()` ; `AnalyticsService.getTrendData` expose désormais `granularity`. `buildCustomTooltipPlugin`/`buildMobileTooltipPlugin` acceptent des `opts` (avatar + comparaison de rang). Nouveau handler `isolatableLegendOnClick` branché sur les légendes Chart.js des 6 types de graphique. Nouveaux modals `openChartDrilldown` (Index.html) / `openChartDrilldownMobile` (Mobile.html) réutilisant `apiUpdateHistoryDescription`/`apiDeleteHistoryEntries` — les actions faites depuis le drill-down héritent automatiquement du Journal d'audit et de l'undo déjà en place.
```

- [ ] **Step 2 : Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog interactivité graphique Dashboard"
git push
```

- [ ] **Step 3 : `/verify` complet**

Rejouer manuellement le scénario bout en bout sur l'app déployée ou en dev : les 6 types de graphique, desktop + mobile, tooltip/légende/drill-down/édition/suppression/undo.

- [ ] **Step 4 : `/code-review`**

Revue du diff cumulé des 7 tâches avant de considérer le chantier terminé.
