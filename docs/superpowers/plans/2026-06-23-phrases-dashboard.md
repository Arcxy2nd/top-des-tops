# Phrases d'accroche — Section dédiée dans le dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner aux phrases d'accroche leur propre card dans le dashboard (après la card graphique), avec bouton "Nouveau tirage", design soigné par joueur, et configuration dédiée dans les Paramètres.

**Architecture:** Single-file `Index.html`. La card phrases est un nouvel élément DOM distinct de la card graphique — elle reçoit ses données via `renderPhrasesCard(sortedRows)` appelé depuis le callback ranking. `generateRankingPhrases` est mis à jour pour retourner des objets riches `{text, player, total, rank}` plutôt que des strings. Les préférences (activé, nombre, mode) sont stockées dans `localStorage` clé `'tdt_phrase_settings'`.

**Tech Stack:** HTML/CSS/JS vanilla, localStorage.

---

## Fichiers concernés

| Fichier | Section | Lignes approximatives |
|---|---|---|
| `Index.html` | CSS — nouvelles classes phrases | Après ligne ~1074 (`.body.light .ranking-phrase`) |
| `Index.html` | HTML — card phrases dashboard | Après `</div>` qui ferme la card graphique (~ligne 1276) |
| `Index.html` | HTML — card settings phrases | Après `</div>` qui ferme la card Paramètres (~ligne 1352) |
| `Index.html` | HTML — supprimer `#rankingPhrasesStrip` | Ligne ~1275 |
| `Index.html` | JS — `generateRankingPhrases` mis à jour | Ligne ~1674 |
| `Index.html` | JS — nouvelles fonctions phrases | Après `generateRankingPhrases` |
| `Index.html` | JS — call site ranking (applyFilters) | Ligne ~2373 |
| `Index.html` | JS — call site renderChart ranking | Ligne ~2836 |
| `Index.html` | JS — `clearTopStatsStrip` | Ligne ~2597 |
| `Index.html` | JS — `bindButtons` | Fin de la fonction |

---

## Task 1 : CSS — Styles de la card phrases et des items

**Fichier :** `Index.html` — section CSS

- [ ] **Étape 1 : Remplacer les règles existantes du strip par des règles card**

Localiser le bloc existant (~ligne 1062) :
```css
    /* ── PHRASES D'ACCROCHE ── */
    #rankingPhrasesStrip {
      display: flex; flex-direction: column; gap: 6px;
      margin-top: 12px;
    }
    .ranking-phrase {
      background: rgba(0,0,0,0.1); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 14px;
      font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;
      animation: fadeIn 0.3s ease;
      border-left: 3px solid var(--accent);
    }
    body.light .ranking-phrase { background: rgba(0,0,0,0.04); }
```

Remplacer par :
```css
    /* ── CARD PHRASES D'ACCROCHE ── */
    #phrasesCard { display: none; }   /* caché jusqu'à la première donnée ranking */

    .phrases-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .phrases-card-header h2 { margin: 0; }

    .phrases-list {
      display: flex; flex-direction: column; gap: 10px;
    }

    .phrase-item {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 14px;
      background: rgba(0,0,0,0.12); border: 1px solid var(--border);
      border-left: 4px solid var(--phrase-color, var(--accent));
      border-radius: 0 10px 10px 0;
      animation: fadeIn 0.3s ease;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    body.light .phrase-item { background: rgba(0,0,0,0.04); }
    .phrase-item:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.15); }

    .phrase-rank {
      display: flex; flex-direction: column; align-items: center;
      gap: 2px; flex-shrink: 0;
    }
    .phrase-rank-emoji { font-size: 1.4rem; line-height: 1; }
    .phrase-rank-label {
      font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--text-muted); white-space: nowrap;
    }

    .phrase-body { flex: 1; min-width: 0; }
    .phrase-player {
      font-size: 0.72rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.06em; margin-bottom: 3px;
      color: var(--phrase-color, var(--accent));
    }
    .phrase-text {
      font-size: 0.88rem; color: var(--text); line-height: 1.5;
    }

    .phrases-empty {
      text-align: center; padding: 24px 12px;
      color: var(--text-muted); font-size: 0.85rem;
    }
    .phrases-empty .phrases-empty-icon { font-size: 2rem; display: block; margin-bottom: 8px; }

    /* ── SETTINGS PHRASES — card dans Paramètres ── */
    .phrases-settings-toggle {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 16px;
    }
    .phrases-settings-toggle label {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.9rem; cursor: pointer; user-select: none;
    }
    .phrases-count-wrap {
      display: flex; align-items: center; gap: 12px; margin-bottom: 0;
    }
    .phrases-count-wrap label { font-size: 0.85rem; color: var(--text-muted); min-width: 150px; }
    .phrases-count-wrap input[type="range"] { flex: 1; accent-color: var(--accent); }
    .phrases-count-val {
      font-size: 0.9rem; font-weight: 700; min-width: 20px; text-align: center;
    }
```

---

## Task 2 : HTML — Card phrases dans le dashboard + card settings

**Fichier :** `Index.html` — section HTML

- [ ] **Étape 1 : Supprimer `#rankingPhrasesStrip` de l'intérieur de la card graphique**

Localiser (~ligne 1275) :
```html
      <div id="topStatsStrip"></div>
      <div id="rankingPhrasesStrip"></div>
    </div>
```

Remplacer par :
```html
      <div id="topStatsStrip"></div>
    </div>
```

- [ ] **Étape 2 : Ajouter la card phrases après la card graphique**

Localiser la ligne `</div>` qui ferme la card graphique (`<div class="card card-accent">`) — elle est juste après `<div id="topStatsStrip"></div></div>` (~ligne 1276). Ajouter **après** cette fermeture de card :

```html
  <!-- ══ PHRASES D'ACCROCHE ════════════════════════════════════════ -->
  <div class="card" id="phrasesCard">
    <div class="phrases-card-header">
      <h2>🎭 Commentaires</h2>
      <button class="secondary small" id="phrasesRerollBtn" title="Générer de nouveaux commentaires">🎲 Nouveau tirage</button>
    </div>
    <div id="phrasesList" class="phrases-list">
      <div class="phrases-empty">
        <span class="phrases-empty-icon">🏆</span>
        Ouvre le graphique <strong>Classement</strong> pour voir les commentaires.
      </div>
    </div>
  </div>
```

- [ ] **Étape 3 : Ajouter la card de configuration dans l'onglet Paramètres**

Localiser dans `#tab-settings` la ligne qui ferme la card existante (~ligne 1352) :
```html
    </div>
  </div>

  <!-- ══ NOTES
```

Insérer une nouvelle card **entre** la fermeture de `#tab-settings` et `<!-- ══ NOTES` :
```html

    <div class="card" id="phrasesSettingsCard">
      <h2>🎭 Commentaires de classement</h2>
      <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 16px;line-height:1.5;">
        Les commentaires humoristiques apparaissent dans le Dashboard quand le graphique
        <strong>Classement</strong> est actif. Ils analysent les positions de chaque joueur
        avec des phrases paramétriques (aucun texte hardcodé par joueur).
      </p>
      <div class="phrases-settings-toggle">
        <label>
          <input type="checkbox" id="phrasesEnabledChk" checked>
          Activer les commentaires de classement
        </label>
      </div>
      <div class="phrases-count-wrap">
        <label for="phrasesCountSlider">Nombre de commentaires :</label>
        <input type="range" id="phrasesCountSlider" min="1" max="5" value="3" step="1">
        <span class="phrases-count-val" id="phrasesCountVal">3</span>
      </div>
    </div>
```

---

## Task 3 : JS — `localStorage` helpers + state

**Fichier :** `Index.html` — section JS, après les constantes globales (~ligne 1590)

- [ ] **Étape 1 : Ajouter la clé et les helpers de settings**

Localiser le bloc de constantes (`const chartOptions = { ... }` ligne ~1591). Juste **avant** ce bloc, ajouter :

```javascript
  // ── SETTINGS PHRASES D'ACCROCHE ─────────────────────────────────────────
  const PHRASE_SETTINGS_KEY = 'tdt_phrase_settings';

  function getPhraseSettings() {
    try {
      const raw = localStorage.getItem(PHRASE_SETTINGS_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      return { enabled: true, count: 3, ...saved };
    } catch { return { enabled: true, count: 3 }; }
  }

  function savePhraseSettings(patch) {
    try {
      localStorage.setItem(PHRASE_SETTINGS_KEY, JSON.stringify({ ...getPhraseSettings(), ...patch }));
    } catch {}
  }

  // Cache la dernière donnée ranking pour permettre le "Nouveau tirage"
  let lastPhraseSortedRows = null;
```

---

## Task 4 : JS — `generateRankingPhrases` retourne des objets riches

**Fichier :** `Index.html` — JS, fonction `generateRankingPhrases` (~ligne 1674)

La fonction doit retourner `{text, player, total, rank, pool}` plutôt que des strings, pour que `renderPhrasesCard` puisse afficher le nom, la couleur et le badge de rang.

- [ ] **Étape 1 : Remplacer `generateRankingPhrases`**

Localiser la fonction complète (~lignes 1674–1701) :
```javascript
  function generateRankingPhrases(sortedRows) {
    if (!sortedRows || !sortedRows.length) return [];
    const n = sortedRows.length;

    if (n === 1) {
      return [pickPhrase(RANKING_PHRASES.solo, { player: sortedRows[0].player, pts: sortedRows[0].total })];
    }

    const phrases = sortedRows.map((row, i) => {
      const rank = i + 1;
      const vars = { player: row.player, pts: row.total, n: rank };
      const prevSame = i > 0 && sortedRows[i - 1].total === row.total;
      const nextSame = i < n - 1 && sortedRows[i + 1].total === row.total;
      let pool;
      if (prevSame || nextSame) pool = RANKING_PHRASES.tied;
      else if (rank === 1)      pool = RANKING_PHRASES.first;
      else if (rank === 2)      pool = RANKING_PHRASES.second;
      else if (rank === 3 && n >= 4) pool = RANKING_PHRASES.third;
      else if (rank === n)      pool = RANKING_PHRASES.last;
      else                      pool = RANKING_PHRASES.mid;
      return pickPhrase(pool, vars);
    });

    const selected = [phrases[0]];
    if (n >= 3 && phrases[n - 1]) selected.push(phrases[n - 1]);
    if (n >= 5 && phrases[Math.floor(n / 2)]) selected.push(phrases[Math.floor(n / 2)]);
    return selected;
  }
```

Remplacer par :
```javascript
  function generateRankingPhrases(sortedRows, count) {
    if (!sortedRows || !sortedRows.length) return [];
    const n = sortedRows.length;
    const maxCount = count != null ? count : getPhraseSettings().count;

    // Pool names drive the rank badge
    const POOL_META = {
      solo:   { emoji: '🧍', label: 'Solo' },
      first:  { emoji: '👑', label: '1er' },
      second: { emoji: '🥈', label: '2e' },
      third:  { emoji: '🥉', label: '3e' },
      last:   { emoji: '💀', label: 'Dernier' },
      mid:    { emoji: '😐', label: 'Milieu' },
      tied:   { emoji: '⚖️', label: 'Égalité' }
    };

    if (n === 1) {
      const row = sortedRows[0];
      return [{
        text:   pickPhrase(RANKING_PHRASES.solo, { player: row.player, pts: row.total }),
        player: row.player, total: row.total, rank: 1,
        ...POOL_META.solo
      }];
    }

    const all = sortedRows.map((row, i) => {
      const rank = i + 1;
      const prevSame = i > 0 && sortedRows[i - 1].total === row.total;
      const nextSame = i < n - 1 && sortedRows[i + 1].total === row.total;
      let poolKey;
      if (prevSame || nextSame)     poolKey = 'tied';
      else if (rank === 1)          poolKey = 'first';
      else if (rank === 2)          poolKey = 'second';
      else if (rank === 3 && n >= 4) poolKey = 'third';
      else if (rank === n)          poolKey = 'last';
      else                          poolKey = 'mid';
      return {
        text:   pickPhrase(RANKING_PHRASES[poolKey], { player: row.player, pts: row.total, n: rank }),
        player: row.player, total: row.total, rank,
        ...POOL_META[poolKey]
      };
    });

    // Select intelligently: 1st, last, 2nd, middle, 2nd-to-last
    const priority = [0, n - 1, 1, Math.floor(n / 2), n - 2];
    const seen = new Set();
    const selected = [];
    for (const idx of priority) {
      if (selected.length >= maxCount) break;
      if (idx >= 0 && idx < n && !seen.has(idx)) {
        seen.add(idx);
        selected.push(all[idx]);
      }
    }
    return selected;
  }
```

---

## Task 5 : JS — `renderPhrasesCard` et `clearPhrasesCard`

**Fichier :** `Index.html` — JS, après `generateRankingPhrases` (~ligne 1702)

- [ ] **Étape 1 : Ajouter `renderPhrasesCard` et `clearPhrasesCard`**

```javascript
  function clearPhrasesCard() {
    const card = document.getElementById('phrasesCard');
    if (card) card.style.display = 'none';
    lastPhraseSortedRows = null;
  }

  function renderPhrasesCard(sortedRows) {
    lastPhraseSortedRows = sortedRows;
    const settings = getPhraseSettings();
    const card  = document.getElementById('phrasesCard');
    const list  = document.getElementById('phrasesList');
    if (!card || !list) return;

    if (!settings.enabled || !sortedRows || !sortedRows.length) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    list.innerHTML = '';

    const phrases = generateRankingPhrases(sortedRows, settings.count);
    if (!phrases.length) {
      list.innerHTML = '<div class="phrases-empty"><span class="phrases-empty-icon">🤔</span>Pas assez de joueurs pour générer un commentaire.</div>';
      return;
    }

    phrases.forEach(p => {
      const color = (typeof playerColor === 'function' ? playerColor(p.player) : null) || 'var(--accent)';
      const item  = document.createElement('div');
      item.className = 'phrase-item';
      item.style.setProperty('--phrase-color', color);

      const rankDiv = document.createElement('div');
      rankDiv.className = 'phrase-rank';
      rankDiv.innerHTML =
        '<span class="phrase-rank-emoji">' + p.emoji + '</span>' +
        '<span class="phrase-rank-label">' + p.label + '</span>';

      const body = document.createElement('div');
      body.className = 'phrase-body';
      body.innerHTML =
        '<div class="phrase-player">' + escapeHtml(p.player) + '</div>' +
        '<div class="phrase-text">'   + escapeHtml(p.text)   + '</div>';

      item.appendChild(rankDiv);
      item.appendChild(body);
      list.appendChild(item);
    });
  }
```

---

## Task 6 : JS — Brancher les call sites

**Fichier :** `Index.html` — JS

- [ ] **Étape 1 : Mettre à jour le callback ranking non-détaillé dans `applyFilters`**

Localiser (~ligne 2373) le bloc :
```javascript
    if (currentChartType === 'ranking' && !chartOptions.detailed) {
      callServer('apiGetPlayerTotals', [selPlayers, startDate, endDate], res => {
        currentChartData = res.chartData;
        document.getElementById('chartSkeleton').style.display = 'none';
        document.getElementById('chartWrapper').style.display  = 'block';
        renderChart(res.chartData, 'ranking');
        renderChartControls('ranking');
        // Do NOT clearTopStatsStrip here — renderChart already populates #rankingPhrasesStrip
      }, 'Chargement total global');
      return;
    }
```

Remplacer par :
```javascript
    if (currentChartType === 'ranking' && !chartOptions.detailed) {
      callServer('apiGetPlayerTotals', [selPlayers, startDate, endDate], res => {
        currentChartData = res.chartData;
        document.getElementById('chartSkeleton').style.display = 'none';
        document.getElementById('chartWrapper').style.display  = 'block';
        renderChart(res.chartData, 'ranking');
        renderChartControls('ranking');
      }, 'Chargement total global');
      return;
    }
```

- [ ] **Étape 2 : Supprimer l'ancien bloc de phrases dans `renderChart` type ranking**

Localiser (~ligne 2836) :
```javascript
      // Phrases d'accroche — seulement en mode non-détaillé
      const phrasesStrip = document.getElementById('rankingPhrasesStrip');
      if (phrasesStrip) {
        phrasesStrip.innerHTML = '';
        if (!chartOptions.detailed) {
          generateRankingPhrases(totals).forEach(p => {
            const div = document.createElement('div');
            div.className = 'ranking-phrase';
            div.textContent = p;
            phrasesStrip.appendChild(div);
          });
        }
      }
```

Remplacer par :
```javascript
      // Phrases d'accroche — card dédiée
      if (!chartOptions.detailed) {
        renderPhrasesCard(totals);
      } else {
        clearPhrasesCard();
      }
```

- [ ] **Étape 3 : Appeler `clearPhrasesCard` quand on quitte le ranking**

Dans `clearTopStatsStrip` (ligne ~2597), localiser :
```javascript
  function clearTopStatsStrip() {
    const strip = document.getElementById('topStatsStrip');
    if (strip) strip.innerHTML = '';
    const phrases = document.getElementById('rankingPhrasesStrip');
    if (phrases) phrases.innerHTML = '';
  }
```

Remplacer par :
```javascript
  function clearTopStatsStrip() {
    const strip = document.getElementById('topStatsStrip');
    if (strip) strip.innerHTML = '';
    clearPhrasesCard();
  }
```

Note : `clearPhrasesCard` est déclaré en Task 5. `clearTopStatsStrip` est appelé pour tous les types de graphiques sauf stacked/grouped, donc la card phrases disparaît correctement hors ranking.

- [ ] **Étape 4 : Ne pas appeler `clearTopStatsStrip` pour le ranking détaillé dans `applyFilters`**

Dans le callback `callServer('apiGetFilteredData', ...)` (~ligne 2385), localiser :
```javascript
      if (currentChartType === 'stacked' || currentChartType === 'grouped') {
        renderTopStatsStrip(res.chartData);
      } else {
        clearTopStatsStrip();
      }
```

Remplacer par :
```javascript
      if (currentChartType === 'stacked' || currentChartType === 'grouped') {
        renderTopStatsStrip(res.chartData);
        clearPhrasesCard();
      } else if (currentChartType === 'ranking') {
        // detailed mode — renderChart already called clearPhrasesCard
      } else {
        clearTopStatsStrip();
      }
```

---

## Task 7 : JS — Initialiser les settings phrases dans Paramètres

**Fichier :** `Index.html` — JS, dans ou après `bindButtons` (fin de la fonction)

- [ ] **Étape 1 : Ajouter `initPhraseSettings`**

```javascript
  function initPhraseSettings() {
    const s = getPhraseSettings();

    const chk = document.getElementById('phrasesEnabledChk');
    const slider = document.getElementById('phrasesCountSlider');
    const countVal = document.getElementById('phrasesCountVal');

    if (!chk || !slider || !countVal) return;

    chk.checked = s.enabled;
    slider.value = s.count;
    countVal.textContent = s.count;

    const applyAndRefresh = () => {
      savePhraseSettings({ enabled: chk.checked, count: parseInt(slider.value, 10) });
      countVal.textContent = slider.value;
      // Re-render si on a des données
      if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
      else if (!chk.checked) clearPhrasesCard();
    };

    chk.addEventListener('change', applyAndRefresh);
    slider.addEventListener('input', () => {
      countVal.textContent = slider.value;
      savePhraseSettings({ count: parseInt(slider.value, 10) });
      if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
    });
  }
```

- [ ] **Étape 2 : Brancher le bouton "Nouveau tirage"**

Dans `bindButtons()`, trouver la fin de la fonction et ajouter :
```javascript
    const rerollBtn = document.getElementById('phrasesRerollBtn');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', () => {
        if (lastPhraseSortedRows) renderPhrasesCard(lastPhraseSortedRows);
      });
    }
```

- [ ] **Étape 3 : Appeler `initPhraseSettings` au bon endroit**

Dans `bindButtons()` (ou juste après), appeler `initPhraseSettings()`. Chercher l'appel `bindButtons()` (ligne ~4XXX) et ajouter après :
```javascript
  initPhraseSettings();
```

Si `initPhraseSettings` est défini dans la même scope, appeler directement depuis `bindButtons`. Chercher la fin de `bindButtons` et y ajouter `initPhraseSettings();`.

---

## Task 8 : Code review — vérifier les chemins critiques

**Fichier :** `Index.html`

- [ ] **Étape 1 : Vérifier que `clearPhrasesCard` est déclaré avant `clearTopStatsStrip`**

`clearTopStatsStrip` appelle `clearPhrasesCard`. Les deux fonctions sont dans la même scope globale (pas de modules). L'ordre de déclaration n'importe pas pour les `function` declarations (hoisting). Vérifier quand même que les deux sont des `function` (pas `const f = () => {}`). ✓

- [ ] **Étape 2 : Vérifier `escapeHtml` disponible dans `renderPhrasesCard`**

`escapeHtml` est utilisé dans `renderPhrasesCard`. Chercher `function escapeHtml` dans le fichier pour confirmer qu'il est défini globalement. ✓

- [ ] **Étape 3 : Vérifier que la card ne s'affiche pas sur les autres onglets**

La card `#phrasesCard` est dans le `#tab-dashboard`. Quand l'utilisateur navigue vers un autre onglet, le tab-dashboard est masqué par la gestion de tabs existante — la card ne sera donc pas visible hors du dashboard même si `display` n'est pas `none`. ✓

- [ ] **Étape 4 : Vérifier le cas `chartOptions.detailed = true` (classement détaillé)**

En mode ranking détaillé, `applyFilters` passe par `callServer('apiGetFilteredData', ...)` (pas le chemin `apiGetPlayerTotals`). Après `renderChart('ranking')`, la nouvelle ligne dans `renderChart` appelle `clearPhrasesCard()`. Et le nouveau bloc dans `applyFilters` laisse passer sans appeler `clearTopStatsStrip`. Résultat : card cachée en mode détaillé. ✓

- [ ] **Étape 5 : Tester end-to-end**

1. Ouvrir le dashboard → card phrases invisible (no data yet)
2. Cliquer "🏆 Classement" → card phrases apparaît avec commentaires
3. Cliquer "🎲 Nouveau tirage" → nouvelles phrases (différentes)
4. Cliquer "📊 Empilé" → card phrases disparaît
5. Revenir "🏆 Classement" → phrases réapparaissent
6. Aller Paramètres → card "🎭 Commentaires de classement" visible
7. Décocher "Activer" → card phrases cachée dans le dashboard immédiatement
8. Recoche → phrases reviennent
9. Slider sur 5 → 5 commentaires dans le dashboard
10. Mode classement détaillé (via options) → pas de commentaires

---

## Self-Review

### Couverture

| Exigence | Task | Statut |
|---|---|---|
| Card dédiée dans le dashboard | Task 2 | ✅ |
| Design soigné par joueur (couleur, badge rang) | Tasks 1 + 5 | ✅ |
| Bouton "Nouveau tirage" | Tasks 2 + 7 | ✅ |
| Configuration dans Paramètres | Tasks 2 + 3 + 7 | ✅ |
| Toggle activer/désactiver | Tasks 3 + 7 | ✅ |
| Nombre de commentaires configurable (1-5) | Tasks 3 + 4 + 7 | ✅ |
| Disparaît sur les autres types de graphique | Tasks 5 + 6 | ✅ |
| Disparaît sur mode classement détaillé | Task 6 | ✅ |
| Pas de régression sur `clearTopStatsStrip` | Task 6 Étape 3 | ✅ |
| Suppression de l'ancien `#rankingPhrasesStrip` | Task 2 Étape 1 | ✅ |

### Risques

- `renderPhrasesCard` est appelé depuis `renderChart` qui est dans un callback asynchrone. Si l'utilisateur clique très vite entre types, `lastPhraseSortedRows` peut être d'un appel précédent. Impact minimal (visuellement, les anciennes phrases restent une fraction de seconde).
- Le slider `count` va jusqu'à 5 mais si le classement a < 5 joueurs, moins de commentaires seront montrés (comportement correct, géré par la logique `priority` dans `generateRankingPhrases`).
