# Emoji Charts + Filigrane Modifiable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher l'emoji de chaque catégorie directement dans les éléments visuels des graphiques Chart.js, enrichir les tooltips avec un badge emoji+couleur, et rendre le texte du filigrane d'export modifiable.

**Architecture:** Un plugin Chart.js canvas (`buildEmojiOverlayPlugin`) dessine les emojis sur les barres/arcs quand l'espace le permet. Le tooltip existant (`buildCustomTooltipPlugin`) est enrichi avec un badge emoji+couleur. Les datasets reçoivent un champ `_catName`/`_catNames` non rendu par Chart.js pour le lookup d'icône. La modale d'export gagne un input texte conditionnel pour le filigrane.

**Tech Stack:** Chart.js (plugin canvas API), HTML/CSS/JS natif (GAS monofichier). Pas de test automatisé pour `Index.html` — vérification manuelle après déploiement GAS. Syntaxe vérifiable via `node --check` sur extraction JS.

**Note GAS :** `Index.html` reste monolithique. Toutes les modifications sont dans ce fichier unique.

---

### Task 1 : CSS — Badge emoji dans le tooltip

**Files:**
- Modify: `Index.html` (bloc `<style>`, après la règle `.ctt-dot` vers la ligne 1635)

- [ ] **Step 1 : Localiser le bloc CSS du tooltip custom**

  Dans `Index.html`, chercher `#chartCustomTooltip .ctt-dot`. C'est à la ligne ~1633.

- [ ] **Step 2 : Ajouter la règle `.ctt-emoji-badge` immédiatement après `.ctt-dot`**

  Remplacer :
  ```css
      #chartCustomTooltip .ctt-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      }
  ```
  Par :
  ```css
      #chartCustomTooltip .ctt-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      }
      #chartCustomTooltip .ctt-emoji-badge {
        display: inline-flex; align-items: center; justify-content: center;
        width: 20px; height: 20px; border-radius: 4px; font-size: 13px; flex-shrink: 0;
      }
  ```

- [ ] **Step 3 : Vérifier visuellement**

  Dans `Index.html`, chercher `.ctt-emoji-badge` — doit apparaître exactement une fois dans le `<style>`.

- [ ] **Step 4 : Commit**

  ```bash
  git add Index.html
  git commit -m "style: add ctt-emoji-badge for chart tooltip emoji indicator"
  ```

---

### Task 2 : Nouvelle fonction `buildEmojiOverlayPlugin()`

**Files:**
- Modify: `Index.html` (après la fermeture de `buildCustomTooltipPlugin()`, vers la ligne 4817)

- [ ] **Step 1 : Localiser la fin de `buildCustomTooltipPlugin()`**

  Chercher `}; // fin buildCustomTooltipPlugin` ou chercher le pattern :
  ```js
      }; // fin du return de buildCustomTooltipPlugin
    };
  }
  ```
  La fonction se termine vers la ligne 4816 (accolade fermant `buildCustomTooltipPlugin`).
  Chercher exactement :
  ```
      };
    };
  }

  function renderTrendChart
  ```
  — la nouvelle fonction s'insère entre la fin de `buildCustomTooltipPlugin` et `function renderTrendChart`.

  En pratique, chercher la ligne `function renderTrendChart(trendData) {` (~ligne 5021) et insérer juste avant.

- [ ] **Step 2 : Insérer `buildEmojiOverlayPlugin()`**

  Remplacer :
  ```js
  function renderTrendChart(trendData) {
  ```
  Par :
  ```js
  function buildEmojiOverlayPlugin() {
    return {
      id: 'emojiOverlay',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const type = chart.config.type;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (type === 'bar') {
          const isHorizontal = chart.options.indexAxis === 'y';
          chart.data.datasets.forEach((ds, di) => {
            const icon = ds._catName ? catIcon(ds._catName) : '';
            if (!icon) return;
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;
            meta.data.forEach(bar => {
              if (isHorizontal) {
                const w = Math.abs(bar.x - bar.base);
                if (w < 24) return;
                const fontSize = Math.min(Math.floor(w * 0.35), 16);
                ctx.font = fontSize + 'px sans-serif';
                ctx.fillText(icon, (bar.x + bar.base) / 2, bar.y);
              } else {
                const h = Math.abs(bar.base - bar.y);
                if (h < 20) return;
                const fontSize = Math.min(Math.floor(h * 0.55), 16);
                ctx.font = fontSize + 'px sans-serif';
                ctx.fillText(icon, bar.x, (bar.y + bar.base) / 2);
              }
            });
          });
        }

        if (type === 'doughnut') {
          const ds = chart.data.datasets[0];
          const catNames = ds._catNames || [];
          const meta = chart.getDatasetMeta(0);
          ctx.font = '16px sans-serif';
          meta.data.forEach((arc, i) => {
            const icon = catNames[i] ? catIcon(catNames[i]) : '';
            if (!icon) return;
            const angle = arc.endAngle - arc.startAngle;
            if (angle < 0.35) return;
            const midAngle = (arc.startAngle + arc.endAngle) / 2;
            const r = (arc.innerRadius + arc.outerRadius) / 2;
            ctx.fillText(icon, arc.x + Math.cos(midAngle) * r, arc.y + Math.sin(midAngle) * r);
          });
        }

        ctx.restore();
      }
    };
  }

  function renderTrendChart(trendData) {
  ```

- [ ] **Step 3 : Vérifier**

  Chercher `function buildEmojiOverlayPlugin` dans `Index.html` — doit apparaître exactement une fois.
  Chercher `catIcon(ds._catName)` — doit apparaître dans le nouveau bloc.

- [ ] **Step 4 : Commit**

  ```bash
  git add Index.html
  git commit -m "feat: add buildEmojiOverlayPlugin for in-chart emoji rendering"
  ```

---

### Task 3 : Tooltip enrichi — badge emoji conditionnel

**Files:**
- Modify: `Index.html` (`buildCustomTooltipPlugin()`, vers la ligne 4780)

- [ ] **Step 1 : Localiser le bloc de création du dot dans le tooltip**

  Dans `buildCustomTooltipPlugin()`, chercher :
  ```js
            const dot = document.createElement('span');
            dot.className = 'ctt-dot';
            dot.style.background = color;

            const label = document.createElement('span');
  ```
  C'est vers la ligne 4782.

- [ ] **Step 2 : Remplacer le dot par une logique conditionnelle emoji/dot**

  Remplacer :
  ```js
            const dot = document.createElement('span');
            dot.className = 'ctt-dot';
            dot.style.background = color;

            const label = document.createElement('span');
            label.className = 'ctt-label';
            label.textContent = dsLabel;

            const val = document.createElement('span');
            val.className = 'ctt-val';
            val.textContent = dp.formattedValue + ' pts';

            row.appendChild(dot); row.appendChild(label); row.appendChild(val);
  ```
  Par :
  ```js
            const icon = dp.dataset._catName  ? catIcon(dp.dataset._catName)
                       : dp.dataset._catNames ? catIcon(dp.dataset._catNames[dp.dataIndex])
                       : '';
            let indicator;
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

            const label = document.createElement('span');
            label.className = 'ctt-label';
            label.textContent = dsLabel;

            const val = document.createElement('span');
            val.className = 'ctt-val';
            val.textContent = dp.formattedValue + ' pts';

            row.appendChild(indicator); row.appendChild(label); row.appendChild(val);
  ```

- [ ] **Step 3 : Vérifier**

  Chercher `ctt-emoji-badge` dans le JS de `Index.html` — doit apparaître exactement dans ce bloc ET dans le CSS de la Task 1. Chercher `row.appendChild(dot)` — ne doit plus exister (remplacé par `indicator`).

- [ ] **Step 4 : Commit**

  ```bash
  git add Index.html
  git commit -m "feat: enrich chart tooltip with emoji badge when category has icon"
  ```

---

### Task 4 : Barres empilées/groupées — `_catName` + plugin wiring

**Files:**
- Modify: `Index.html` (section `displayData` et `new Chart(...)` du graphique stacked/grouped, vers les lignes 5001–5017)

- [ ] **Step 1 : Localiser `displayData`**

  Chercher le bloc exactement :
  ```js
    const displayData = {
      labels: sorted.labels,
      datasets: sorted.datasets.map(ds => ({ ...ds, label: catDisplay(ds.label) }))
    };
  ```
  C'est vers la ligne 5001.

- [ ] **Step 2 : Ajouter `_catName` sur chaque dataset**

  Remplacer :
  ```js
    const displayData = {
      labels: sorted.labels,
      datasets: sorted.datasets.map(ds => ({ ...ds, label: catDisplay(ds.label) }))
    };
  ```
  Par :
  ```js
    const displayData = {
      labels: sorted.labels,
      datasets: sorted.datasets.map(ds => ({ ...ds, label: catDisplay(ds.label), _catName: ds.label }))
    };
  ```

- [ ] **Step 3 : Ajouter `buildEmojiOverlayPlugin()` au tableau `plugins` du Chart stacked/grouped**

  Chercher (dans la même fonction, ~ligne 5017) :
  ```js
      plugins: [totalsPlugin, buildCustomTooltipPlugin()]
  ```
  Remplacer par :
  ```js
      plugins: [totalsPlugin, buildEmojiOverlayPlugin(), buildCustomTooltipPlugin()]
  ```

- [ ] **Step 4 : Vérifier**

  Chercher `_catName: ds.label` — doit exister dans `displayData`.
  Chercher `buildEmojiOverlayPlugin()` — doit apparaître au moins dans ce bloc.

- [ ] **Step 5 : Commit**

  ```bash
  git add Index.html
  git commit -m "feat: wire emoji overlay plugin to stacked/grouped bar chart"
  ```

---

### Task 5 : Donut — `_catNames` + plugin wiring

**Files:**
- Modify: `Index.html` (section `type === 'doughnut'` dans `renderChart()`, vers la ligne 4875)

- [ ] **Step 1 : Localiser le `new Chart` du donut**

  Chercher :
  ```js
      currentChart = new Chart(document.getElementById('mainChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: segLabels.map(catDisplay), datasets: [{ data: segValues, backgroundColor: segColors }] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, tooltip: { mode: 'point' } } },
        plugins: [centerPlugin, buildCustomTooltipPlugin()]
      });
  ```

- [ ] **Step 2 : Ajouter `_catNames` sur le dataset et le plugin**

  Remplacer :
  ```js
      currentChart = new Chart(document.getElementById('mainChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: segLabels.map(catDisplay), datasets: [{ data: segValues, backgroundColor: segColors }] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, tooltip: { mode: 'point' } } },
        plugins: [centerPlugin, buildCustomTooltipPlugin()]
      });
  ```
  Par :
  ```js
      currentChart = new Chart(document.getElementById('mainChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: segLabels.map(catDisplay), datasets: [{ data: segValues, backgroundColor: segColors, _catNames: segLabels }] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, tooltip: { mode: 'point' } } },
        plugins: [centerPlugin, buildEmojiOverlayPlugin(), buildCustomTooltipPlugin()]
      });
  ```
  Note : `segLabels` contient les noms bruts de catégories (avant `catDisplay`), c'est bien ce qu'on veut pour `_catNames`.

- [ ] **Step 3 : Vérifier**

  Chercher `_catNames: segLabels` — doit exister exactement une fois.

- [ ] **Step 4 : Commit**

  ```bash
  git add Index.html
  git commit -m "feat: wire emoji overlay plugin to doughnut chart"
  ```

---

### Task 6 : Classement détaillé — `_catName` + plugin wiring

**Files:**
- Modify: `Index.html` (branche `chartOptions.detailed` dans `type === 'ranking'`, vers la ligne 4922)

- [ ] **Step 1 : Localiser le bloc du classement détaillé**

  Chercher :
  ```js
        datasets = data.datasets.map((ds, ci) => ({
          label: catDisplay(ds.label),
          data:  totals.map(t => ds.data[t.index] || 0),
          backgroundColor: categoryColor(ds.label),
          borderRadius: 3
        }));
  ```

- [ ] **Step 2 : Ajouter `_catName`**

  Remplacer :
  ```js
        datasets = data.datasets.map((ds, ci) => ({
          label: catDisplay(ds.label),
          data:  totals.map(t => ds.data[t.index] || 0),
          backgroundColor: categoryColor(ds.label),
          borderRadius: 3
        }));
  ```
  Par :
  ```js
        datasets = data.datasets.map((ds, ci) => ({
          label: catDisplay(ds.label),
          _catName: ds.label,
          data:  totals.map(t => ds.data[t.index] || 0),
          backgroundColor: categoryColor(ds.label),
          borderRadius: 3
        }));
  ```

- [ ] **Step 3 : Ajouter le plugin au `new Chart` du classement**

  Chercher (dans le bloc `type === 'ranking'`, ~ligne 4954) :
  ```js
        plugins: [buildCustomTooltipPlugin()]
  ```
  Remplacer par :
  ```js
        plugins: [buildEmojiOverlayPlugin(), buildCustomTooltipPlugin()]
  ```
  Attention : ce pattern `plugins: [buildCustomTooltipPlugin()]` apparaît aussi dans d'autres graphiques. S'assurer de modifier celui dans le bloc `if (type === 'ranking')`, entre `currentChart = new Chart(...)` du ranking et son `return;`.

- [ ] **Step 4 : Vérifier**

  Chercher `_catName: ds.label` — doit apparaître deux fois au total (Task 4 + Task 6).
  Chercher `buildEmojiOverlayPlugin()` — doit apparaître trois fois (stacked, donut, ranking).

- [ ] **Step 5 : Commit**

  ```bash
  git add Index.html
  git commit -m "feat: wire emoji overlay plugin to ranking detailed chart"
  ```

---

### Task 7 : Filigrane modifiable dans la modale d'export

**Files:**
- Modify: `Index.html` (`openExportModal()` et `buildInfographicCanvas()`)

- [ ] **Step 1 : Ajouter `watermarkText` à `exportOpts`**

  Dans `openExportModal()`, chercher le bloc d'initialisation :
  ```js
    let exportOpts = {
      format:      'png',
      theme:       document.body.classList.contains('light') ? 'light' : 'dark',
      title:       true,
      period:      true,
      stats:       true,
      players:     true,
      avatars:     true,
      scale:       1,
      legend:      true,
      watermark:   true,
      filters:     true,
      footer:      true,
      customTitle: ''
    };
  ```
  Remplacer par :
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

- [ ] **Step 2 : Remplacer la checkbox filigrane par un bloc checkbox + input**

  Chercher :
  ```js
    advGroup.appendChild(checkOpt('Filigrane "Tops des Tops"', 'watermark'));
  ```
  Remplacer par :
  ```js
    const wmWrap = document.createElement('div');
    wmWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const wmCheck = checkOpt('Filigrane', 'watermark');
    const wmInput = document.createElement('input');
    wmInput.type = 'text';
    wmInput.value = exportOpts.watermarkText;
    wmInput.placeholder = 'Tops des Tops';
    wmInput.style.cssText = 'display:' + (exportOpts.watermark ? 'block' : 'none') + ';margin-top:2px;font-size:0.82rem;';
    wmInput.addEventListener('input', () => {
      exportOpts.watermarkText = wmInput.value.trim() || 'Tops des Tops';
      updatePreview();
    });
    wmCheck.querySelector('input[type="checkbox"]').addEventListener('change', function() {
      wmInput.style.display = this.checked ? 'block' : 'none';
    });
    wmWrap.appendChild(wmCheck);
    wmWrap.appendChild(wmInput);
    advGroup.appendChild(wmWrap);
  ```

- [ ] **Step 3 : Remplacer les textes hardcodés dans `buildInfographicCanvas()`**

  **3a.** Chercher (dans `buildInfographicCanvas`, ~ligne 5201) :
  ```js
        ctx.fillText('Tops des Tops', Math.round(18 * S), Math.round(24 * S));
  ```
  Remplacer par :
  ```js
        ctx.fillText(opts.watermarkText || 'Tops des Tops', Math.round(18 * S), Math.round(24 * S));
  ```

  **3b.** Chercher (dans `buildInfographicCanvas`, ~ligne 5409) :
  ```js
      ctx.fillText('TOPS DES TOPS', 0, 0);
  ```
  Remplacer par :
  ```js
      ctx.fillText((opts.watermarkText || 'Tops des Tops').toUpperCase(), 0, 0);
  ```

- [ ] **Step 4 : Vérifier**

  Chercher `'Tops des Tops'` dans `buildInfographicCanvas` — doit apparaître uniquement comme fallback dans les expressions `opts.watermarkText || 'Tops des Tops'` (2 occurrences), plus zéro occurrence hardcodée.
  Chercher `watermarkText` dans `Index.html` — doit apparaître dans `exportOpts`, dans le listener `wmInput`, et dans `buildInfographicCanvas` (×2).

- [ ] **Step 5 : Commit**

  ```bash
  git add Index.html
  git commit -m "feat: make export watermark text editable in infographic modal"
  ```

---

## Vérification manuelle post-déploiement

Après déploiement d'une nouvelle version GAS :

- [ ] **Barres empilées** : ouvrir un graphique avec plusieurs catégories ayant des icônes. Les grandes barres affichent l'emoji centré. Les mini-barres (<20 px) n'affichent rien. Au survol : badge emoji coloré dans le tooltip.
- [ ] **Barres groupées** : même vérification.
- [ ] **Donut** : les arcs larges (>20°) affichent l'emoji au centre de l'arc. Au survol : badge emoji dans le tooltip title.
- [ ] **Classement détaillé** : les segments horizontaux larges (>24 px) affichent l'emoji. Au survol : badge emoji.
- [ ] **Radar** : aucun changement visible (axes déjà OK). Tooltip inchangé.
- [ ] **Courbes** : aucun changement (pas de `_catName`). Tooltip dot classique.
- [ ] **Catégorie sans icône** : tooltip dot classique, aucun emoji sur le canvas.
- [ ] **Export — Filigrane** : cocher filigrane → input texte apparaît. Saisir un texte → aperçu se met à jour. Décocher → input masqué. Texte vide → fallback "Tops des Tops". Télécharger → vérifier en-tête et diagonal dans l'image.
