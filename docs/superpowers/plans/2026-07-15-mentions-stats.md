# Widget "Mentions" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une card "💬 Mentions" au Dashboard (PC + mobile) qui affiche trois mini-classements calculés à partir des `@Nom` déjà présents dans les descriptions d'History et les notes.

**Architecture:** Une nouvelle fonction backend en lecture seule (`apiGetMentionStats`) scanne History + Notes, compte les mentions par cible/auteur/paire, et renvoie un objet unique consommé par une nouvelle card sur Index.html (pattern `.tool-action`) et un nouvel accordéon sur Mobile.html (pattern `mStatAccordionHtml`/`statRow`), suivant exactement le pattern des cards sœurs existantes (Records/Tendances/Jour actif/Duo).

**Tech Stack:** Google Apps Script (`Code.gs`), HTML/CSS/JS monofichier (`Index.html`, `Mobile.html`), harness de test Node VM (`tests/harness.js`, `node:test`).

## Global Constraints

- Aucune écriture de données : pas de `requireIdentity()` ni `AuditService.log()` (lecture seule, cf. spec §Périmètre).
- Pas de filtres croisés appliqués — comme les 4 cards sœurs existantes qui appellent leur API sans paramètre (cf. spec §Périmètre).
- Variables CSS et classes existantes uniquement — aucune nouvelle couleur hex, aucune nouvelle classe CSS (cf. spec §Style, context.md §6).
- Parité mobile obligatoire : toute nouvelle card côté Index.html a son équivalent dans Mobile.html (context.md §7).
- Avatar obligatoire partout où un nom de joueur apparaît (context.md §7).
- Pas de classe ES6, objets littéraux/IIFE uniquement (context.md §8).
- Code en anglais (variables/fonctions/commentaires), explications hors-code en français (context.md §8).
- `CHANGELOG.md` mis à jour (deux voix) avant de considérer la livraison terminée (context.md §8).
- Commit + push après chaque tâche validée, sans demander confirmation (context.md §8, demande explicite de l'utilisateur).

---

### Task 1: Backend — `apiGetMentionStats()` + test harness

**Files:**
- Modify: `Code.gs` (ajout après `apiApplyMentionFixes`, ~ligne 2432, dans la section "Détection de mentions manquantes")
- Test: `tests/mention-detection.test.js` (ajout de tests à la suite des tests existants)

**Interfaces:**
- Consumes: `SettingsService.getEntities('Players')`, `StorageService.getFullHistoryRowsCached()` (chaque élément a `.description`, `.player`, `.saiseur`), `NotesService.getAllNotes().notes` (chaque élément a `.text`, `.player`), `_escapeRegExpMention(s)` (déjà défini ligne 2299).
- Produces: `_countMentionsInText(text, playersSortedByLengthDesc)` → objet `{ [nomJoueur]: count }`. `apiGetMentionStats()` → `{ success: true, mostMentioned: [{player, count}], mostMentioning: [{player, count}], topDuo: {playerA, playerB, count} | null }` (listes triées décroissant, tronquées à 5) ou `{ success: false, error }` via `fail(e)`.

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `tests/mention-detection.test.js` :

```javascript
test('apiGetMentionStats counts mentions by target, by author (saiseur fallback to player), and top duo', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', ''], ['Marie', '', ''], ['Léa', '', '']]);
  const history = makeSheet([
    HEADER,
    // Jean (saisi par Marie) mentionne Léa deux fois → cible Léa+2, auteur Marie+2, paire Marie-Léa+2
    [D('2026-01-10'), 'Jean', 'Jeux', 5, '@Léa a bien joué, merci @Léa', '', 'Marie'],
    // Marie (pas de saiseur renseigné → repli sur player) mentionne Jean une fois
    [D('2026-01-11'), 'Marie', 'Jeux', 3, 'GG @Jean', '', '']
  ]);
  const notes = makeSheet([
    ['Date', 'Joueur', 'Note'],
    [D('2026-01-12'), 'Léa', '@Jean était en retard']
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes });

  const res = gas.apiGetMentionStats();
  assert.strictEqual(res.success, true);

  const leaMentioned = res.mostMentioned.find(m => m.player === 'Léa');
  assert.strictEqual(leaMentioned.count, 2);
  const jeanMentioned = res.mostMentioned.find(m => m.player === 'Jean');
  assert.strictEqual(jeanMentioned.count, 2); // 1 (Marie, History) + 1 (Léa, Notes)

  // Marie est l'auteur des deux lignes History (saiseur explicite sur la 1ère,
  // repli sur player sur la 2ᵉ) : 2 mentions de Léa + 1 mention de Jean = 3.
  const marieMentioning = res.mostMentioning.find(m => m.player === 'Marie');
  assert.strictEqual(marieMentioning.count, 3);
  // Jean n'est jamais auteur (ni saiseur ni player-sans-saiseur d'aucune ligne) → absent.
  assert.strictEqual(res.mostMentioning.find(m => m.player === 'Jean'), undefined);

  assert.ok(res.topDuo);
  assert.strictEqual(res.topDuo.count, 2);
  assert.deepStrictEqual([res.topDuo.playerA, res.topDuo.playerB].sort(), ['Léa', 'Marie']);
});

test('apiGetMentionStats returns empty lists and null duo when there are no mentions', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', '']]);
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'Jean', 'Jeux', 5, 'Rien à signaler', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null });

  const res = gas.apiGetMentionStats();
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(res.mostMentioned, []);
  assert.deepStrictEqual(res.mostMentioning, []);
  assert.strictEqual(res.topDuo, null);
});

test('apiGetMentionStats never counts a self-mention as a duo', () => {
  const gas = loadGas();
  const players = makeSheet([['Jean', '', '']]);
  const history = makeSheet([
    HEADER,
    [D('2026-01-10'), 'Jean', 'Jeux', 5, '@Jean parle de lui-même', '', 'Jean']
  ]);
  gas.ConfigService.getSheets = () => ({ history, players, notes: null });

  const res = gas.apiGetMentionStats();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.mostMentioned[0].count, 1);
  assert.strictEqual(res.mostMentioning[0].count, 1);
  assert.strictEqual(res.topDuo, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/mention-detection.test.js`
Expected: FAIL — `gas.apiGetMentionStats is not a function`

- [ ] **Step 3: Write the implementation**

Ajouter dans `Code.gs`, juste après la fonction `apiApplyMentionFixes` (fin de la section "Détection de mentions manquantes") :

```javascript
/** Compte, pour un texte donné, les occurrences de `@NomComplet` pour chaque joueur
 *  de `playersSortedByLengthDesc` (triés du nom le plus long au plus court). Chaque
 *  occurrence trouvée est retirée du texte de travail avant de tester les noms plus
 *  courts, pour qu'un nom contenu dans un autre (ex. "Marie" dans "Marie Curie") ne
 *  soit jamais compté à tort. */
function _countMentionsInText(text, playersSortedByLengthDesc) {
  const counts = {};
  if (!text) return counts;
  let working = text;
  playersSortedByLengthDesc.forEach(name => {
    const re = new RegExp('@' + _escapeRegExpMention(name) + '(?![\\p{L}\\p{N}_])', 'giu');
    const matches = working.match(re);
    if (matches) {
      counts[name] = matches.length;
      working = working.replace(re, '');
    }
  });
  return counts;
}

/** Statistiques de mentions @Nom pour le Dashboard : joueurs les plus mentionnés,
 *  joueurs qui mentionnent le plus (auteur = saisisseur réel de l'entrée, avec repli
 *  sur le joueur concerné pour les lignes sans saisisseur tracé, ou pour les notes),
 *  et la paire de joueurs qui se mentionnent mutuellement le plus. */
function apiGetMentionStats() {
  try {
    const players = SettingsService.getEntities('Players').map(p => p.name).filter(Boolean);
    if (!players.length) return { success: true, mostMentioned: [], mostMentioning: [], topDuo: null };
    const sorted = players.slice().sort((a, b) => b.length - a.length);

    const mentionedTotals = {};
    const mentioningTotals = {};
    const pairTotals = {};

    function process(text, authorPlayer) {
      if (!text || !authorPlayer) return;
      const counts = _countMentionsInText(text, sorted);
      Object.keys(counts).forEach(target => {
        const n = counts[target];
        mentionedTotals[target] = (mentionedTotals[target] || 0) + n;
        mentioningTotals[authorPlayer] = (mentioningTotals[authorPlayer] || 0) + n;
        if (target !== authorPlayer) {
          const key = [authorPlayer, target].sort().join('|');
          pairTotals[key] = (pairTotals[key] || 0) + n;
        }
      });
    }

    StorageService.getFullHistoryRowsCached().forEach(r => process(r.description, r.saiseur || r.player));
    NotesService.getAllNotes().notes.forEach(n => process(n.text, n.player));

    const toSortedArray = obj => Object.keys(obj)
      .map(k => ({ player: k, count: obj[k] }))
      .sort((a, b) => b.count - a.count);

    const mostMentioned = toSortedArray(mentionedTotals).slice(0, 5);
    const mostMentioning = toSortedArray(mentioningTotals).slice(0, 5);

    let topDuo = null;
    Object.keys(pairTotals).forEach(key => {
      if (!topDuo || pairTotals[key] > topDuo.count) {
        const parts = key.split('|');
        topDuo = { playerA: parts[0], playerB: parts[1], count: pairTotals[key] };
      }
    });

    return { success: true, mostMentioned, mostMentioning, topDuo };
  } catch (e) { return fail(e); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/mention-detection.test.js`
Expected: PASS (toutes les assertions, y compris les 3 nouveaux tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `node --test tests/`
Expected: PASS — tous les fichiers `tests/*.test.js`

- [ ] **Step 6: Commit and push**

```bash
git add Code.gs tests/mention-detection.test.js
git commit -m "feat: ajoute apiGetMentionStats (statistiques de mentions @Nom)"
git push
```

---

### Task 2: Frontend PC — card "💬 Mentions" (Index.html)

**Files:**
- Modify: `Index.html` — HTML de la card (Dashboard, après `#pairsCard`, section repérée ligne ~2391 dans l'exploration), fonction JS (section "DUO LE PLUS FRÉQUENT", après `scanTopPairs()`, ~ligne 10901), appel d'initialisation (~ligne 11149, à la suite de `scanTopPairs();`)

**Interfaces:**
- Consumes: `apiGetMentionStats()` (Task 1) via `callServer('apiGetMentionStats', [], callback, loadingLabel)` ; `cachedPlayers` (tableau `{name, meta, ...}`) ; `getAvatarUrl(name, meta)` ; `showSkeleton(container, opts)`.
- Produces: card DOM `#mentionsCard` / `#mentionsResults`, fonction `loadMentionStats()` appelée au chargement du Dashboard.

- [ ] **Step 1: Add the card markup**

Dans `Index.html`, localiser le bloc :
```html
    <!-- ══ DUO LE PLUS FRÉQUENT ══ -->
    <div class="card card-collapsible" id="pairsCard">
      <div class="card-collapse-header"><h2>🔁 Duo le plus fréquent</h2></div>
      <div id="pairsResults"></div>
    </div>

  </div>
```
Remplacer par :
```html
    <!-- ══ DUO LE PLUS FRÉQUENT ══ -->
    <div class="card card-collapsible" id="pairsCard">
      <div class="card-collapse-header"><h2>🔁 Duo le plus fréquent</h2></div>
      <div id="pairsResults"></div>
    </div>

    <!-- ══ MENTIONS ══ -->
    <div class="card card-collapsible" id="mentionsCard">
      <div class="card-collapse-header"><h2>💬 Mentions</h2></div>
      <div id="mentionsResults"></div>
    </div>

  </div>
```

- [ ] **Step 2: Add the `loadMentionStats()` function**

Localiser la fin de la fonction `scanTopPairs()` (juste avant `function initPhraseSettings()`) et insérer, juste après la fermeture de `scanTopPairs()` :

```javascript
  // ── MENTIONS ─────────────────────────────────────────────────────────
  function mentionAvatarRow(name, count, suffix) {
    const row = document.createElement('div');
    row.className = 'tool-action';
    const p = cachedPlayers.find(pl => pl.name === name);
    const info = document.createElement('div');
    info.className = 'tool-action-info';
    const strong = document.createElement('strong');
    const avatar = document.createElement('img');
    avatar.className = 'qs-avatar';
    avatar.src = getAvatarUrl(name, p ? p.meta : '');
    avatar.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;';
    strong.appendChild(avatar);
    strong.appendChild(document.createTextNode(name));
    const span = document.createElement('span');
    span.textContent = count + ' ' + suffix;
    info.appendChild(strong); info.appendChild(span);
    row.appendChild(info);
    return row;
  }

  function mentionSectionTitle(text, marginTop) {
    const h = document.createElement('h3');
    h.textContent = text;
    h.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin:' + marginTop + 'px 0 6px;';
    return h;
  }

  function loadMentionStats() {
    const container = document.getElementById('mentionsResults');
    showSkeleton(container, { rows: 3, height: 30 });
    callServer('apiGetMentionStats', [], res => {
      container.innerHTML = '';
      if (res.mostMentioned.length) {
        container.appendChild(mentionSectionTitle('📣 Les plus mentionnés', 0));
        res.mostMentioned.forEach(m => container.appendChild(mentionAvatarRow(m.player, m.count, 'mention(s)')));
      }
      if (res.mostMentioning.length) {
        container.appendChild(mentionSectionTitle('✍️ Ceux qui mentionnent le plus', 14));
        res.mostMentioning.forEach(m => container.appendChild(mentionAvatarRow(m.player, m.count, 'mention(s) écrite(s)')));
      }
      if (res.topDuo) {
        container.appendChild(mentionSectionTitle('🔗 Duo le plus complice', 14));
        const row = document.createElement('div');
        row.className = 'tool-action';
        const pa = cachedPlayers.find(pl => pl.name === res.topDuo.playerA);
        const pb = cachedPlayers.find(pl => pl.name === res.topDuo.playerB);
        const info = document.createElement('div');
        info.className = 'tool-action-info';
        const strong = document.createElement('strong');
        const avA = document.createElement('img');
        avA.className = 'qs-avatar';
        avA.src = getAvatarUrl(res.topDuo.playerA, pa ? pa.meta : '');
        avA.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:4px;';
        const avB = document.createElement('img');
        avB.className = 'qs-avatar';
        avB.src = getAvatarUrl(res.topDuo.playerB, pb ? pb.meta : '');
        avB.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin:0 6px 0 2px;';
        strong.appendChild(avA);
        strong.appendChild(document.createTextNode(res.topDuo.playerA + ' & '));
        strong.appendChild(avB);
        strong.appendChild(document.createTextNode(res.topDuo.playerB));
        const span = document.createElement('span');
        span.textContent = res.topDuo.count + ' mention(s) croisée(s)';
        info.appendChild(strong); info.appendChild(span);
        row.appendChild(info);
        container.appendChild(row);
      }
      if (!res.mostMentioned.length && !res.mostMentioning.length && !res.topDuo) {
        container.innerHTML = '<p style="color:var(--text-muted);margin:10px 0;">Aucune mention trouvée.</p>';
      }
    }, 'Chargement mentions');
  }

```

- [ ] **Step 3: Call `loadMentionStats()` on Dashboard init**

Localiser :
```javascript
    scanRecords();
    loadTrends();
    loadActiveWeekday();
    scanTopPairs();
```
Remplacer par :
```javascript
    scanRecords();
    loadTrends();
    loadActiveWeekday();
    scanTopPairs();
    loadMentionStats();
```

- [ ] **Step 4: Manual verification in browser**

Démarrer le harness/preview de l'app (ou l'app déployée), ouvrir l'onglet Dashboard, faire défiler jusqu'en bas :
- Vérifier que la card "💬 Mentions" apparaît après "🔁 Duo le plus fréquent".
- Vérifier l'affichage en thème dark ET light (bouton de bascule de thème).
- Vérifier les avatars à côté de chaque nom.
- Si aucune mention n'existe dans les données de test, vérifier le message "Aucune mention trouvée."

- [ ] **Step 5: Commit and push**

```bash
git add Index.html
git commit -m "feat: ajoute la card Mentions au Dashboard (PC)"
git push
```

---

### Task 3: Frontend mobile — accordéon "💬 Mentions" (Mobile.html)

**Files:**
- Modify: `Mobile.html` — markup de l'accordéon (bloc `tab.innerHTML` du Dashboard, après `mStatAccordionHtml('mPairsAcc', ...)`, ligne ~764), binding (`bindStatAccordion('mPairsAcc', loadPairsStat);`, ligne ~772), fonction `loadMentionStats()` (après `loadPairsStat()`, ligne ~863)

**Interfaces:**
- Consumes: `apiGetMentionStats()` (Task 1) ; `mStatAccordionHtml(id, title, bodyId)` ; `bindStatAccordion(id, loader)` ; `statRow(avatarHtml, title, subtitle)` ; `avatarImgHtml(name, meta, cls)` ; `escapeHtml(s)` ; `cachedPlayers`.
- Produces: accordéon `#mMentionsAcc` / `#mMentionsBody`, fonction `loadMentionStats()` (mobile — même nom que la version PC, fichiers distincts donc pas de collision).

- [ ] **Step 1: Add the accordion markup**

Dans `Mobile.html`, localiser :
```javascript
      mStatAccordionHtml('mRecordsAcc', '🏅 Records', 'mRecordsBody') +
      mStatAccordionHtml('mTrendsAcc', '📈 Tendances', 'mTrendsBody') +
      mStatAccordionHtml('mWeekdayAcc', '📅 Jour le plus actif', 'mWeekdayBody') +
      mStatAccordionHtml('mPairsAcc', '🔁 Duo le plus fréquent', 'mPairsBody');
```
Remplacer par :
```javascript
      mStatAccordionHtml('mRecordsAcc', '🏅 Records', 'mRecordsBody') +
      mStatAccordionHtml('mTrendsAcc', '📈 Tendances', 'mTrendsBody') +
      mStatAccordionHtml('mWeekdayAcc', '📅 Jour le plus actif', 'mWeekdayBody') +
      mStatAccordionHtml('mPairsAcc', '🔁 Duo le plus fréquent', 'mPairsBody') +
      mStatAccordionHtml('mMentionsAcc', '💬 Mentions', 'mMentionsBody');
```

- [ ] **Step 2: Bind the accordion loader**

Localiser :
```javascript
    bindStatAccordion('mRecordsAcc', loadRecordsStat);
    bindStatAccordion('mTrendsAcc', loadTrendsStat);
    bindStatAccordion('mWeekdayAcc', loadWeekdayStat);
    bindStatAccordion('mPairsAcc', loadPairsStat);
```
Remplacer par :
```javascript
    bindStatAccordion('mRecordsAcc', loadRecordsStat);
    bindStatAccordion('mTrendsAcc', loadTrendsStat);
    bindStatAccordion('mWeekdayAcc', loadWeekdayStat);
    bindStatAccordion('mPairsAcc', loadPairsStat);
    bindStatAccordion('mMentionsAcc', loadMentionStats);
```

- [ ] **Step 3: Add the `loadMentionStats()` function**

Localiser la fin de `loadPairsStat()` :
```javascript
  function loadPairsStat() {
    callServer('apiGetTopPlayerCategoryPairs', [], res => {
      const body = document.getElementById('mPairsBody');
      const html = (res.pairs || []).map(pair => {
        const p = cachedPlayers.find(pl => pl.name === pair.player);
        const cat = cachedCategories.find(c => c.name === pair.category);
        return statRow(avatarImgHtml(pair.player, p ? p.meta : '', 'm-avatar sm'), escapeHtml(pair.player),
          (cat ? cat.icon + ' ' : '') + escapeHtml(pair.category) + ' — ' + pair.count + ' fois');
      }).join('');
      body.outerHTML = '<div id="mPairsBody">' + (html || '<p class="m-empty">Aucune donnée.</p>') + '</div>';
    }, 'Chargement duos fréquents');
  }
```
Ajouter juste après :
```javascript

  function loadMentionStats() {
    callServer('apiGetMentionStats', [], res => {
      const body = document.getElementById('mMentionsBody');
      let html = '';
      if ((res.mostMentioned || []).length) {
        html += '<p style="font-weight:700; margin:0 0 8px;">📣 Les plus mentionnés</p>';
        html += res.mostMentioned.map(m => {
          const p = cachedPlayers.find(pl => pl.name === m.player);
          return statRow(avatarImgHtml(m.player, p ? p.meta : '', 'm-avatar sm'), escapeHtml(m.player), m.count + ' mention(s)');
        }).join('');
      }
      if ((res.mostMentioning || []).length) {
        html += '<p style="font-weight:700; margin:14px 0 8px;">✍️ Ceux qui mentionnent le plus</p>';
        html += res.mostMentioning.map(m => {
          const p = cachedPlayers.find(pl => pl.name === m.player);
          return statRow(avatarImgHtml(m.player, p ? p.meta : '', 'm-avatar sm'), escapeHtml(m.player), m.count + ' mention(s) écrite(s)');
        }).join('');
      }
      if (res.topDuo) {
        html += '<p style="font-weight:700; margin:14px 0 8px;">🔗 Duo le plus complice</p>';
        const pa = cachedPlayers.find(pl => pl.name === res.topDuo.playerA);
        const pb = cachedPlayers.find(pl => pl.name === res.topDuo.playerB);
        html += statRow(
          avatarImgHtml(res.topDuo.playerA, pa ? pa.meta : '', 'm-avatar sm') + avatarImgHtml(res.topDuo.playerB, pb ? pb.meta : '', 'm-avatar sm'),
          escapeHtml(res.topDuo.playerA) + ' & ' + escapeHtml(res.topDuo.playerB),
          res.topDuo.count + ' mention(s) croisée(s)'
        );
      }
      body.outerHTML = '<div id="mMentionsBody">' + (html || '<p class="m-empty">Aucune mention trouvée.</p>') + '</div>';
    }, 'Chargement mentions');
  }
```

- [ ] **Step 4: Manual verification in browser (mobile viewport)**

Redimensionner la fenêtre en viewport mobile (ou ouvrir `Mobile.html` directement), ouvrir le Dashboard, déplier l'accordéon "💬 Mentions" :
- Vérifier le chargement (paresseux — seulement au premier déplié, comme les autres accordéons).
- Vérifier les avatars et le texte des trois sections.
- Vérifier dark et light.

- [ ] **Step 5: Commit and push**

```bash
git add Mobile.html
git commit -m "feat: ajoute l'accordéon Mentions au Dashboard mobile"
git push
```

---

### Task 4: Changelog et vérification finale

**Files:**
- Modify: `CHANGELOG.md` (section `## [Non publié] - 2026-07-15`, sous-section `### Ajouté`)

**Interfaces:**
- Consumes: rien (documentation).
- Produces: rien (fin de plan).

- [ ] **Step 1: Add the changelog entry**

Dans `CHANGELOG.md`, sous `## [Non publié] - 2026-07-15` → `### Ajouté`, ajouter un nouvel item à la suite de celui déjà présent sur les mentions manquantes :

```markdown
**Humanisé** : Le Dashboard affiche maintenant une carte « 💬 Mentions » : qui est le plus mentionné, qui mentionne le plus, et le duo qui se cite le plus mutuellement — calculé automatiquement à partir des `@Nom` déjà présents dans les descriptions et les notes. Disponible sur PC et mobile.
**Technique** : Nouvelle fonction `apiGetMentionStats()` (Code.gs), qui réutilise `_escapeRegExpMention` et scanne `StorageService.getFullHistoryRowsCached()` (auteur = `saiseur` avec repli sur `player`) et `NotesService.getAllNotes()` via la nouvelle fonction `_countMentionsInText()`. Frontend : nouvelle card `#mentionsCard`/`loadMentionStats()` dans Index.html (pattern `.tool-action`, à la suite de la card Duo), nouvel accordéon `mMentionsAcc`/`loadMentionStats()` dans Mobile.html (pattern `mStatAccordionHtml`/`statRow`).
```

- [ ] **Step 2: Commit and push**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog du widget Mentions"
git push
```

- [ ] **Step 3: Final full verification**

Run: `node --test tests/`
Expected: PASS — l'intégralité de la suite, sans régression.

Ouvrir l'app (PC et mobile) une dernière fois, Dashboard, confirmer visuellement la présence et le bon fonctionnement de la card/l'accordéon Mentions dans les deux thèmes.
