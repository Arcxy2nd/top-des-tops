# Dashboard incassable & corrections post-revue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le Dashboard incapable d'échouer en silence — tout état non-nominal devient un message lisible avec une action de reprise — puis refermer les brèches trouvées par la revue à deux axes et le council (tests non exécutés en CI, suppression Alt non annulable, cache de pagination faux, dépendance CDN non figée, thème clair cassé).

**Architecture :** Trois axes. (1) *Visibilité* — le graphique ne peut plus rendre une zone vide indistinguable ; un panneau DOM unique (`#chartState`) porte les trois états chargement / vide / erreur, avec bouton Réessayer. C'est ce qui rend la panne actuelle auto-diagnostiquable. (2) *Barrières* — la CI exécute enfin les tests sur le code réellement livré, et Chart.js est figé. (3) *Sûreté des données* — la seule suppression irréversible de l'app devient annulable, et la clé de cache de l'Historique cesse de mentir.

**Tech Stack :** Google Apps Script (`.gs`), HTML/CSS/JS monofichier (`Index.html`, servi verbatim par `HtmlService`), tests `node:test` sur harness VM local (`tests/harness.js`), déploiement GitHub Actions + `clasp`.

## Contexte du diagnostic (à lire avant la Task 1)

La panne signalée — « zone du graphique vide, le reste de la page fonctionne » — **n'a pas pu être reproduite**. Ce qui a été établi par la mesure, sur le code réellement déployé :

| Vérifié | Résultat |
|---|---|
| Le code livré (après nettoyage des commentaires) dessine-t-il le graphique ? | **Oui** — instance Chart créée, type `bar`, jeux de données et étiquettes corrects |
| Le nettoyeur de commentaires corrompt-il le rendu ? | **Non** |
| Chart.js a-t-il changé de version majeure ? | **Non** — 4.5.1, pas de v5 publiée |
| Le serveur répond-il ? | **Oui** — vraies données (7 joueurs, 18 Tops) |
| Le chantier v3.6.0 a-t-il touché le code du graphique ? | **Non** — lignes 10237-10700 hors diff ; les modifications alentour sont des substitutions de constantes à valeur identique |
| L'univers ou le type de graphique sont-ils mémorisés entre sessions ? | **Non** — toujours `main` / `stacked` au chargement |

**Cause du symptôme, elle, confirmée par la mesure** : `Index.html:10242` fait `ctx.fillStyle = 'var(--text-muted)'`. Un canevas ne résout pas les variables CSS : l'affectation est **silencieusement ignorée**, `fillStyle` reste `#000000`. Le message « Aucune donnée pour cette sélection. » est bien peint (1245 pixels mesurés) mais en **noir pur sur un fond `rgb(20,25,34)`** — invisible. La couleur voulue était `#94a3b8`.

Et sur échec serveur, les quatre branches de `applyFilters` appellent `showChartWrapper()` puis **ne rendent rien** : pas de message, pas de reprise. Le toast d'erreur disparaît en quelques secondes.

**Conséquence pour ce plan :** trois causes distinctes (aucune donnée / erreur serveur / Chart.js absent) produisent aujourd'hui le même écran vide, ce qui rend le diagnostic impossible — pour l'utilisateur comme à distance. La Task 1 les sépare visuellement. Une fois livrée, l'app dira elle-même ce qui ne va pas, et la cause réelle de la panne actuelle sera lisible à l'écran.

## Global Constraints

Ces règles viennent de `context.md` et s'appliquent à **chaque** tâche.

- **Code en anglais** — variables, fonctions, commentaires dans le code. Les explications hors code sont en français.
- **Pas de classe ES6** — objets littéraux ou IIFE, cohérent avec le reste du codebase.
- **Commentaires uniquement pour le *pourquoi* non évident** — jamais pour décrire ce que le code fait.
- **Aucune constante hardcodée dans la logique** — les valeurs configurables vont dans le bloc `CONFIG` en tête du script (`Index.html`, juste après `let activeLotUniverse`).
- **Jamais de couleur hexadécimale directe dans le CSS** — toujours une variable CSS.
- **Cible tactile minimum `44px`** (`--tap-min`) sur tout élément interactif.
- **Avatar obligatoire** dès qu'un nom de joueur apparaît dans l'UI.
- **Identité obligatoire** (`requireIdentity()` client, `requireAuthor()` serveur) avant toute écriture.
- **Journalisation obligatoire** (`AuditService.log()`) pour toute écriture.
- **Aucun `TODO`/`FIXME`/placeholder/fonction vide.**
- **`CHANGELOG.md` mis à jour** en Task 8, deux voix (**Humanisé** + **Technique**) par item.
- **Un seul `git push` à la toute fin** (Task 8). Chaque push redéploie les deux cibles de `deploy-targets.json`.
- **Compte GitHub `Arcxy2nd`** — vérifier `gh auth status` avant le push.

**Commande de vérification après chaque tâche :** `npm run verify`. Toute tâche qui la laisse rouge n'est pas terminée.

**Attention CRLF :** `CHANGELOG.md` et `Index.html` sont en CRLF et le dépôt a `core.autocrlf=true`. Pour tout `git add` sur ces fichiers, utiliser `git -c core.autocrlf=false add <fichier>` afin d'éviter un diff de renormalisation de plusieurs milliers de lignes.

---

### Task 1: Panneau d'état du graphique — supprimer l'échec silencieux

Le cœur du plan. Aujourd'hui « aucune donnée », « erreur serveur » et « Chart.js absent » produisent le même écran vide. Cette tâche introduit un panneau DOM unique qui rend chaque cas lisible et propose une reprise.

**Files:**
- Modify: `Index.html` — bloc CSS (à la suite de la règle `.qa-field, .qa-input`, vers la ligne 1067)
- Modify: `Index.html:4176-4181` (markup de la card graphique)
- Modify: `Index.html` — `showChartState` inséré juste avant `function renderChart(`
- Modify: `Index.html:10239-10247` (branche « aucune donnée » de `renderChart`)
- Modify: `Index.html` — les 4 gestionnaires d'erreur de `applyFilters`

**Interfaces:**
- Consumes: `getComputedStyle`, `applyFilters` (existant).
- Produces:
  - `showChartState(state, message)` — `state` vaut `'hidden' | 'loading' | 'empty' | 'error'`. Consommé par les Tasks 2 et 6.
  - élément `#chartState` et classe CSS `.chart-state`.

- [ ] **Step 1: Ajouter la règle CSS du panneau**

Dans `Index.html`, juste après la règle `.qa-field, .qa-input { ... }` (vers la ligne 1067), insérer :

```css
    .chart-state {
      display: none;
      min-height: 420px;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
      padding: 24px;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .chart-state .chart-state-emoji { font-size: 2rem; line-height: 1; }
    .chart-state .chart-state-msg   { max-width: 46ch; }
    .chart-state button {
      min-height: var(--tap-min);
      padding: 0 18px;
    }
```

- [ ] **Step 2: Ajouter le markup du panneau**

Dans `Index.html`, remplacer le bloc des lignes 4176-4181 :

```html
        <div id="chartSkeleton" class="skeleton" style="height:420px; border-radius:8px;"></div>
        <div class="chart-wrapper" id="chartWrapper" style="display:none;">
          <canvas id="mainChart"></canvas>
          <div id="chartCustomTooltip" role="tooltip"></div>
        </div>
```

par :

```html
        <div id="chartSkeleton" class="skeleton" style="height:420px; border-radius:8px;"></div>
        <div id="chartState" class="chart-state" role="status" aria-live="polite">
          <div class="chart-state-emoji" id="chartStateEmoji">📊</div>
          <div class="chart-state-msg" id="chartStateMsg"></div>
          <button id="chartStateRetry" class="primary small" style="display:none;">↻ Réessayer</button>
        </div>
        <div class="chart-wrapper" id="chartWrapper" style="display:none;">
          <canvas id="mainChart"></canvas>
          <div id="chartCustomTooltip" role="tooltip"></div>
        </div>
```

- [ ] **Step 3: Ajouter la fonction d'état**

Juste avant `function renderChart(data, type) {`, insérer :

```js
  /**
   * Single visible state for the chart area. A canvas cannot resolve CSS
   * variables, so anything drawn into it with a var() colour is painted black
   * and vanishes on the dark card: every non-nominal state must be DOM, never
   * canvas text.
   */
  function showChartState(state, message) {
    const panel = document.getElementById('chartState');
    const emoji = document.getElementById('chartStateEmoji');
    const msg   = document.getElementById('chartStateMsg');
    const retry = document.getElementById('chartStateRetry');
    const wrap  = document.getElementById('chartWrapper');
    const skel  = document.getElementById('chartSkeleton');
    if (!panel) return;

    if (state === 'hidden') {
      panel.style.display = 'none';
      if (wrap) wrap.style.display = 'block';
      if (skel) skel.style.display = 'none';
      return;
    }

    if (skel) skel.style.display = 'none';
    if (wrap) wrap.style.display = 'none';
    panel.style.display = 'flex';
    emoji.textContent = state === 'error' ? '⚠️' : (state === 'loading' ? '⏳' : '📊');
    msg.textContent   = message || '';
    retry.style.display = state === 'error' ? '' : 'none';
  }
```

- [ ] **Step 4: Câbler le bouton Réessayer**

Toujours juste après `showChartState`, insérer :

```js
  function bindChartRetry() {
    const retry = document.getElementById('chartStateRetry');
    if (!retry) return;
    retry.onclick = () => {
      showChartState('loading', 'Rechargement en cours…');
      applyFilters();
    };
  }
```

Puis, dans `bindButtons()`, ajouter l'appel `bindChartRetry();` à la suite des autres liaisons. Localiser `bindButtons` avec :

```bash
grep -n "function bindButtons" Index.html
```

- [ ] **Step 5: Remplacer la branche « aucune donnée » de `renderChart`**

Remplacer le bloc des lignes 10239-10247 :

```js
    if (!data || !data.labels || !data.labels.length) {
      const ctx = document.getElementById('mainChart').getContext('2d');
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fillStyle = 'var(--text-muted)';
      ctx.textAlign = 'center';
      ctx.font = '14px sans-serif';
      ctx.fillText('Aucune donnée pour cette sélection.', ctx.canvas.width / 2, 40);
      return;
    }
```

par :

```js
    if (!data || !data.labels || !data.labels.length) {
      const ctx = document.getElementById('mainChart').getContext('2d');
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      showChartState('empty', 'Aucune donnée pour cette sélection. Élargissez la période ou retirez des filtres.');
      return;
    }

    showChartState('hidden');
```

- [ ] **Step 6: Faire parler les quatre gestionnaires d'erreur**

Dans `applyFilters`, quatre gestionnaires d'erreur appellent `showChartWrapper()` puis ne rendent rien. Les libellés sont, dans l'ordre d'apparition : `'Chargement Dashboard Alternatif'`, `'Chargement courbes'`, `'Chargement total global'`, `'Chargement graphique'`.

Remplacer les quatre blocs suivants :

```js
      }, 'Chargement Dashboard Alternatif', err => {
        showChartWrapper();
        if (onDone) onDone();
      });
```

```js
      }, 'Chargement courbes', err => {
        showChartWrapper();
        if (onDone) onDone();
      });
```

```js
      }, 'Chargement total global', err => {
        showChartWrapper();
        if (onDone) onDone();
      });
```

```js
    }, 'Chargement graphique', err => {
      showChartWrapper();
      if (onDone) onDone();
    });
```

par, respectivement (en conservant l'indentation d'origine de chacun — les trois premiers sont indentés de 6 espaces, le dernier de 4) :

```js
      }, 'Chargement Dashboard Alternatif', err => {
        showChartState('error', "Le graphique n'a pas pu être chargé : " + (err && err.message ? err.message : err));
        if (onDone) onDone();
      });
```

```js
      }, 'Chargement courbes', err => {
        showChartState('error', "Le graphique n'a pas pu être chargé : " + (err && err.message ? err.message : err));
        if (onDone) onDone();
      });
```

```js
      }, 'Chargement total global', err => {
        showChartState('error', "Le graphique n'a pas pu être chargé : " + (err && err.message ? err.message : err));
        if (onDone) onDone();
      });
```

```js
    }, 'Chargement graphique', err => {
      showChartState('error', "Le graphique n'a pas pu être chargé : " + (err && err.message ? err.message : err));
      if (onDone) onDone();
    });
```

Contrôler ensuite :

```bash
grep -c "showChartWrapper();" Index.html && grep -n -B1 "showChartWrapper();" Index.html | grep -c "err =>"
```

Attendu : **8 puis 4 avant** modification, **4 puis 0 après**. Autrement dit, les quatre appels situés dans un bloc `err => {` disparaissent ; les quatre appels des chemins de **succès** restent intacts.

- [ ] **Step 7: Vérifier**

```bash
npm run verify
```

Attendu : `Index.html : 1 bloc(s) <script> inline, syntaxe OK.` puis `pass 132 / fail 0`.

- [ ] **Step 8: Vérification manuelle dans l'app**

Invoquer `/verify`. Sur le Dashboard :
1. Filtrer sur une période sans aucune entrée (ex. deux dates futures) → attendu : le panneau 📊 avec « Aucune donnée pour cette sélection. » **lisible**, en clair sur les deux thèmes.
2. Revenir à « tout » → attendu : le graphique s'affiche, le panneau disparaît.

C'est la vérification qui compte : si l'écran vide actuel devient un message, la cause de la panne est identifiée par la même occasion — noter ce que dit le message.

- [ ] **Step 9: Commit**

```bash
git -c core.autocrlf=false add Index.html && git commit -m "fix(dashboard): replace the invisible canvas message with a readable chart state panel"
```

---

### Task 2: Figer Chart.js et survivre à son absence

`Index.html:12` charge Chart.js **sans version** : jsDelivr résout vers le dernier majeur, donc une v5 casserait le Dashboard des deux instances sans un seul commit. Et si le CDN est injoignable, `renderChart` lève `Chart is not defined` et la zone reste vide — le cas que la Task 1 vient justement d'outiller.

`context.md` §2 affirme par ailleurs « Chart.js (embarqué) » et « pas de dépendances npm », ce qui est faux : c'est un CDN externe. Un document de référence faux induit en erreur toute session future.

**Files:**
- Modify: `Index.html:12` (balise Chart.js)
- Modify: `Index.html` — garde en tête de `renderChart`
- Modify: `context.md` §2

**Interfaces:**
- Consumes: `showChartState` (Task 1).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Figer la version**

Dans `Index.html`, remplacer la ligne 12 :

```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

par :

```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1"></script>
```

La version installée aujourd'hui est bien 4.5.1 : on fige l'existant, aucun changement de comportement attendu.

- [ ] **Step 2: Garder `renderChart` contre l'absence de Chart.js**

Dans `renderChart`, insérer en toute première instruction (avant `if (currentChart)`) :

```js
    if (typeof Chart === 'undefined') {
      showChartState('error', 'La librairie de graphiques n’a pas pu être chargée. Vérifiez votre connexion, puis réessayez.');
      return;
    }
```

Appliquer la même garde en tête de `renderTrendChart`. La localiser avec :

```bash
grep -n "function renderTrendChart" Index.html
```

- [ ] **Step 3: Corriger le document de référence**

Dans `context.md` §2, remplacer la ligne du tableau :

```
| Graphiques  | Chart.js (embarqué)       |
```

par :

```
| Graphiques  | Chart.js 4.5.1 (CDN jsDelivr, version figée) |
```

Puis remplacer la phrase :

```
Pas de build, pas de framework, pas de dépendances npm. Le HTML est servi directement par GAS via `HtmlService`.
```

par :

```
Pas de build, pas de framework, aucune dépendance npm à l'exécution. Deux librairies sont chargées depuis un CDN dans `<head>` (Chart.js, GSAP) et trois à la demande au premier export (jsPDF, SheetJS, fflate) — toutes épinglées à une version précise : une version flottante casserait les deux instances sans qu'aucun commit ne soit poussé. Le HTML est servi directement par GAS via `HtmlService`.
```

- [ ] **Step 4: Vérifier qu'aucune autre dépendance ne flotte**

```bash
grep -n "cdn\.\|cdnjs\." Index.html
```

Attendu : chaque URL porte un numéro de version (`chart.js@4.5.1`, `gsap/3.12.5`, `xlsx-0.20.2`, `fflate@0.8.2`, jsPDF). Si l'une flotte encore, la figer à la version actuellement servie et le signaler dans le rapport.

- [ ] **Step 5: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 132 / fail 0`.

- [ ] **Step 6: Commit**

```bash
git -c core.autocrlf=false add Index.html context.md && git commit -m "fix(deps): pin Chart.js to 4.5.1 and fail loudly when a chart library is missing"
```

---

### Task 3: Exécuter les tests en CI, sur le code réellement livré

`.github/workflows/deploy-gas.yml` fait checkout → setup-node → install clasp → `deploy-gas.sh`. **Aucun test n'y tourne.** Les 132 tests et le garde-fou syntaxique de la v3.6.0 ne s'exécutent que si le développeur les tape à la main. Le scénario « site blanc » est bien fermé — mais par `assertParses()` à l'intérieur du nettoyeur, pas par la porte prévue pour ça. Ce qui reste sans filet, c'est une régression **de logique**.

Les tests doivent tourner **après** le nettoyage des commentaires, sur le code qui part réellement chez Google : cela transforme « la sortie parse » en « la sortie se comporte correctement ».

**Files:**
- Modify: `.github/workflows/deploy-gas.yml`
- Modify: `.github/scripts/deploy-gas.sh` (déplacement de l'appel au nettoyeur)

**Interfaces:**
- Consumes: scripts npm `verify` / `test` (existants).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Relever la version de Node**

Dans `.github/workflows/deploy-gas.yml`, remplacer :

```yaml
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
```

par :

```yaml
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
```

`package.json` utilise `node --test "tests/*.test.js"` avec un glob littéral : sa prise en charge n'existe qu'à partir de Node 22. Sous Node 20 l'étape ne trouverait **aucun test** et passerait au vert sans rien vérifier — un faux filet est pire que pas de filet.

- [ ] **Step 2: Sortir le nettoyage du script de déploiement**

Dans `.github/scripts/deploy-gas.sh`, supprimer la ligne :

```bash
node .github/scripts/strip-comments.js || exit 1
```

(et le bloc de commentaire qui la précède immédiatement, qui décrit le nettoyage). Le nettoyage devient une étape du workflow pour que les tests puissent s'insérer entre lui et le déploiement.

- [ ] **Step 3: Ajouter les deux étapes au workflow**

Dans `.github/workflows/deploy-gas.yml`, entre l'étape `Restore clasp credentials` et l'étape `Push and redeploy all targets`, insérer :

```yaml
      - name: Strip comments from the deployable files
        env:
          CI: true
        run: node .github/scripts/strip-comments.js

      - name: Verify the stripped code
        run: npm run verify
```

`npm run verify` enchaîne le contrôle syntaxique d'`Index.html` puis les 132 tests. Aucune installation de dépendance n'est nécessaire : la suite n'utilise que les modules internes de Node.

Une étape qui échoue arrête le workflow — c'est le comportement par défaut de GitHub Actions, et c'est précisément ce qui manquait.

- [ ] **Step 4: Vérifier la syntaxe du workflow**

```bash
node -e "const s=require('fs').readFileSync('.github/workflows/deploy-gas.yml','utf8'); const i=s.indexOf('Strip comments'), j=s.indexOf('Verify the stripped code'), k=s.indexOf('Push and redeploy'); console.log('ordre correct:', i>0 && j>i && k>j);"
```

Attendu : `ordre correct: true`.

- [ ] **Step 5: Simuler la séquence CI en local**

```bash
CI=1 node .github/scripts/strip-comments.js && npm run verify; git checkout -- Index.html Code.gs AutoPoints.gs; git status --porcelain
```

Attendu : les trois lignes `X -> Y chars`, puis syntaxe OK et `pass 132 / fail 0` **sur le code nettoyé**, puis un dépôt restauré (seuls `?? .claude/` et les plans non suivis apparaissent).

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy-gas.yml .github/scripts/deploy-gas.sh && git commit -m "ci: run the test suite against the stripped code before deploying"
```

---

### Task 4: Rendre visible si le cache serveur est actif

Les 12 sites de mise en cache de `Code.gs` ont tous la forme `if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(...)` — **sans `else`, sans trace**. Au-delà du seuil, le cache est silencieusement inactif et chaque appel relit la feuille entière. `tests/cache.test.js` affirme « lit la feuille une fois » sur des feuilles de deux ou trois lignes, soit exactement le régime où le garde passe : la suite est verte et le comportement en production peut être l'inverse.

Cette tâche ne corrige rien — elle **mesure**. Le correctif (découpage en morceaux, comme `apiGetChangelog` le fait déjà) ne se justifie que si la mesure le montre.

**Files:**
- Modify: `Code.gs:689` et `Code.gs:717`
- Test: `tests/cache.test.js`

**Interfaces:**
- Consumes: `CONFIG.CACHE_MAX_BYTES` (existant).
- Produces: `_logCacheSkip(key, size)` — méthode privée du module, consommée nulle part ailleurs.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `tests/cache.test.js` :

```js
test('a payload above CACHE_MAX_BYTES is not cached, and the skip is traced', () => {
  const gas = loadGas();
  const skips = [];
  gas.Logger = { log: m => skips.push(String(m)) };

  // Two rows are far below the ceiling: the cache must be used and stay silent.
  const history = makeSheet([HEADER_HISTORY,
    ['2026-08-01', 'Alice', 'Jeux', 5, 'ok', ''],
    ['2026-08-02', 'Bob',   'Jeux', 3, 'ok', '']
  ]);
  gas.ConfigService.getSheets = () => ({ history });
  gas.StorageService.getAllLogs();
  assert.strictEqual(skips.length, 0, 'a small payload must not log a skip');

  // Force the ceiling down so the same payload is now oversized.
  gas.CONFIG.CACHE_MAX_BYTES = 1;
  gas.ConfigService.clearCache();
  gas.StorageService.getAllLogs();
  assert.ok(skips.length >= 1, 'an oversized payload must log a skip');
  assert.match(skips[0], /cache skip/);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- --test-name-pattern="above CACHE_MAX_BYTES"
```

Attendu : échec sur `an oversized payload must log a skip` (aucune trace n'est émise aujourd'hui).

- [ ] **Step 3: Ajouter l'aide de traçage**

Dans `Code.gs`, juste avant `const ConfigService = (() => {` (vers la ligne 61), insérer :

```js
/**
 * A payload above CACHE_MAX_BYTES is dropped by every cache.put guard. Silent
 * dropping means the whole cross-request cache can be inactive in production
 * while the tests — which run on two-row fixtures — stay green.
 */
function _logCacheSkip(key, size) {
  if (typeof Logger !== 'undefined' && Logger.log) {
    Logger.log('cache skip ' + key + ' ' + size + ' > ' + CONFIG.CACHE_MAX_BYTES);
  }
}
```

- [ ] **Step 4: Tracer les deux caches les plus chauds**

Dans `Code.gs`, remplacer la ligne 689 :

```js
    if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
```

par :

```js
    if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
    else _logCacheSkip(key, serial.length);
```

Puis appliquer exactement la même transformation à la ligne 717 (le cache de `getAllLogs`). **Ne pas** modifier les dix autres sites : ces deux-là portent l'historique complet, ce sont eux qui franchissent le seuil en premier ; instrumenter le reste serait du bruit.

- [ ] **Step 5: Lancer les tests**

```bash
npm run verify
```

Attendu : `pass 133 / fail 0`.

- [ ] **Step 6: Commit**

```bash
git add Code.gs tests/cache.test.js && git commit -m "chore(cache): trace when a payload exceeds the cache ceiling instead of dropping it silently"
```

- [ ] **Step 7: Relever la mesure après déploiement**

**À faire après le push de la Task 8**, pas maintenant. Ouvrir l'onglet Historique de l'app déployée, puis dans l'éditeur Apps Script : *Exécutions* → ouvrir l'exécution la plus récente → lire le journal.

- Aucune ligne `cache skip` → le cache fonctionne, aucune suite à donner.
- Une ou plusieurs lignes `cache skip` → le cache est inactif ; le correctif (découpage en morceaux sur le modèle de `apiGetChangelog`, `Code.gs:3721`) mérite alors son propre plan. Noter la taille relevée.

---

### Task 5: Rendre la suppression Alt annulable

`apiDeleteNativeAltEntry` est la seule suppression du codebase sans instantané d'annulation — et c'est la seule qui détruit une ligne **sans copie ailleurs** (les entrées natives n'existent que dans `AltHistory`). Comparer `apiDeleteNote` (`Code.gs:2709`), qui passe `{ sheet: 'notes', op: 'delete', before: beforeRow }`. Ici, la phrase française atterrit dans l'emplacement positionnel `before` de `log(author, action, entity, before, after, detail, snapshot)` et aucun instantané n'est fourni.

Le garde anti-obsolescence ne revérifie par ailleurs que `player` et `points` : dans une app de scores, « Alice / 1 pt » est la forme *normale* des données, donc le garde laisse passer précisément la confusion qu'il devait empêcher. La date lève l'ambiguïté et est déjà rendue côté client.

**Files:**
- Modify: `Code.gs` — `AltStorageService.deleteNativeAltEntry`
- Modify: `Code.gs` — `apiDeleteNativeAltEntry`
- Modify: `Index.html` — bouton et handler de suppression native (vers la ligne 9022 et 9049)
- Test: `tests/alt-points-management.test.js`

**Interfaces:**
- Consumes: `AuditService.log(author, action, entity, before, after, detail, snapshot)`, `_applySnapshot` case `'delete'` (`Code.gs:309`), `_sheetFor('altHistory')` — vérifié : `AltStorageService._sheet()` lit bien `ConfigService.getSheets().altHistory`.
- Produces: `deleteNativeAltEntry(rowIndex, altCategory, guard) -> Array(8)` — retourne désormais la **ligne supprimée** au lieu de `1`. Le guard accepte une clé `date` optionnelle.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `tests/alt-points-management.test.js` :

```js
test('deleteNativeAltEntry returns the removed row so the deletion can be undone', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 7, 'Native', '', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  const removed = gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Alice', points: 7 });
  assert.ok(Array.isArray(removed), 'the removed row must be returned');
  assert.strictEqual(removed.length, 8);
  assert.strictEqual(removed[1], 'Alice');
  assert.strictEqual(removed[3], 7);
  assert.strictEqual(gas.AltStorageService.getAltLogs().length, 0);
});

test('deleteNativeAltEntry refuses when the guard date no longer matches', () => {
  const gas = loadGas();
  const altHistory = makeSheet([
    HEADER_ALT_HIST,
    ['2026-08-01', 'Alice', 'Alt 1', 1, 'Premier', '', '', 'Admin'],
    ['2026-08-02', 'Alice', 'Alt 1', 1, 'Second',  '', '', 'Admin']
  ]);
  gas.ConfigService.getSheets = () => ({ altHistory });

  // Same player, same points: only the date tells the two rows apart.
  assert.throws(
    () => gas.AltStorageService.deleteNativeAltEntry(2, 'Alt 1', { player: 'Alice', points: 1, date: '2026-08-02' }),
    /rechargez la liste/
  );
  assert.strictEqual(gas.AltStorageService.getAltLogs().length, 2);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --test-name-pattern="removed row|guard date"
```

Attendu : deux échecs — le premier sur `the removed row must be returned` (la méthode retourne `1`), le second parce qu'aucune exception n'est levée (la date n'est pas contrôlée).

- [ ] **Step 3: Retourner la ligne et contrôler la date**

Dans `Code.gs`, dans `deleteNativeAltEntry`, remplacer le bloc du garde :

```js
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
```

par :

```js
    if (guard) {
      const stale = "L'entrée a changé depuis l'affichage, rechargez la liste.";
      if (guard.player && (row[1] ? row[1].toString() : '') !== guard.player) throw new Error(stale);
      if (guard.points != null && parseInt(row[3], 10) !== parseInt(guard.points, 10)) throw new Error(stale);
      // Player + points alone do not identify a row: "Alice / 1 pt" repeats by
      // design in a scores app, so a shifted index would pass the guard.
      if (guard.date) {
        const rowDate = row[0] instanceof Date ? _dayKey(row[0]) : String(row[0] || '').slice(0, 10);
        if (rowDate !== String(guard.date).slice(0, 10)) throw new Error(stale);
      }
    }

    sheet.deleteRow(idx);
    ConfigService.clearCache();
    return row;
```

Vérifier au préalable que l'aide `_dayKey` est bien disponible dans cette portée :

```bash
grep -n "_dayKey" Code.gs | head -3
```

Si `_dayKey` n'existe pas ou n'est pas atteignable, remplacer son usage par `Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd')` et le noter dans le rapport.

- [ ] **Step 4: Enregistrer l'instantané d'annulation**

Dans `Code.gs`, remplacer le corps de `apiDeleteNativeAltEntry` :

```js
      const count = AltStorageService.deleteNativeAltEntry(rowIndex, altCategory, guard);
      AuditService.log(author, 'Suppression entrée Alt native', altCategory || '—',
        'Entrée native supprimée définitivement (ligne ' + rowIndex + ')');
      return { success: true, count: count };
```

par :

```js
      const removed = AltStorageService.deleteNativeAltEntry(rowIndex, altCategory, guard);
      const summary = (removed[1] || '?') + ' — ' + (removed[3] || 0) + ' pt(s)';
      AuditService.log(author, 'Suppression entrée Alt native', altCategory || '—',
        summary, '', 'Entrée native supprimée définitivement',
        { sheet: 'altHistory', op: 'delete', before: removed });
      return { success: true, count: 1 };
```

Les arguments sont désormais alignés sur la signature `log(author, action, entity, before, after, detail, snapshot)` : le résumé va dans `before`, la phrase dans `detail`, et l'instantané permet l'annulation.

- [ ] **Step 5: Envoyer la date depuis le client**

Dans `Index.html`, dans `openAltCategoryManagerModal`, ajouter l'attribut de date au bouton de suppression. Remplacer :

```js
                  data-points="${e.points}">${isNative ? '🗑️ Supprimer' : '❌ Retirer'}</button>
```

par :

```js
                  data-points="${e.points}"
                  data-date="${escapeHtml(e.date ? String(e.date).slice(0, 10) : '')}">${isNative ? '🗑️ Supprimer' : '❌ Retirer'}</button>
```

Puis, dans le handler, remplacer :

```js
                ? [_whoAmI, altCategoryName, refId, { player: btn.dataset.player, points: parseInt(btn.dataset.points, 10) }]
```

par :

```js
                ? [_whoAmI, altCategoryName, refId, { player: btn.dataset.player, points: parseInt(btn.dataset.points, 10), date: btn.dataset.date }]
```

Avant d'écrire, confirmer que les entrées portent bien un champ `date` exploitable :

```bash
grep -n "_parseAltHistoryRow" Code.gs | head -3
```

Lire la fonction et vérifier le nom du champ de date (`date` ou `timestamp`). Utiliser le nom réel dans `e.date` ci-dessus et le noter dans le rapport si différent.

- [ ] **Step 6: Vérifier**

```bash
npm run verify
```

Attendu : `pass 135 / fail 0`.

- [ ] **Step 7: Vérification manuelle dans l'app**

Invoquer `/verify`. Paramètres → ⭐ Tops Alternatifs → gestionnaire d'un Top → supprimer une entrée native (badge ✏️).
Attendu : la suppression réussit, puis l'onglet 📜 Historique → 🔍 Journal d'audit montre l'action **avec un bouton d'annulation actif**, et l'annulation restaure bien la ligne dans le Top Alternatif.

- [ ] **Step 8: Commit**

```bash
git -c core.autocrlf=false add Code.gs Index.html tests/alt-points-management.test.js && git commit -m "fix(alt): make native Alt deletion undoable and disambiguate the staleness guard by date"
```

---

### Task 6: Corriger la clé du cache de pagination de l'Historique

`histPrefetchKey` (`Index.html:5148`) n'inclut pas le filtre Alt. Vider le cache à chaque changement de pastille ne suffit pas : **un préchargement déjà parti ne peut pas être annulé**. Sa réponse revient après le vidage et s'écrit sous la même clé ; pire, le garde `if (histPrefetchCache.has(key)) return;` (`Index.html:14036`) empêche alors le préchargement correct de partir. Résultat : « page suivante » affiche les lignes de l'ancien filtre. Sur Apps Script un aller-retour dure de plusieurs centaines de millisecondes à quelques secondes — la fenêtre est largement atteignable.

Deux corrections complémentaires : la clé devient complète, et un compteur de génération invalide les réponses en vol.

**Files:**
- Modify: `Index.html:5143-5151` (clé, cache, vidage)
- Modify: `Index.html` — les deux appels à `histPrefetchKey` et le handler de succès du préchargement

**Interfaces:**
- Consumes: `selectedHistAltCategories` (existant).
- Produces: `histPrefetchKey(page, players, cats, text, dateFrom, dateTo, altFilter)` — **7ᵉ paramètre ajouté** ; `_histPrefetchGeneration` — compteur incrémenté à chaque vidage.

- [ ] **Step 1: Compléter la clé et ajouter le compteur de génération**

Dans `Index.html`, remplacer le bloc des lignes 5143-5151 :

```js
  // Préchargement client de la page suivante de l'Historique : clé = "page|joueurs|catégories|texte".
  // Vidée à chaque changement de filtre/texte (les points d'entrée qui rechargent déjà
  // la page 1 après une mutation la vident aussi, via clearHistPrefetchCache()).
  const histPrefetchCache = new Map();
  let _histSortDir = 'desc'; // 'desc' = plus récents d'abord (défaut) | 'asc' = plus anciens d'abord
  function histPrefetchKey(page, players, cats, text, dateFrom, dateTo) {
    return page + '|' + players.join(',') + '|' + cats.join(',') + '|' + (text || '') + '|' + (dateFrom || '') + '|' + (dateTo || '') + '|' + _histSortDir;
  }
  function clearHistPrefetchCache() { histPrefetchCache.clear(); }
```

par :

```js
  // Préchargement client de la page suivante de l'Historique. La clé porte TOUS
  // les critères envoyés au serveur : une clé incomplète fait rendre la page
  // suivante d'un filtre sous un autre.
  const histPrefetchCache = new Map();
  let _histSortDir = 'desc'; // 'desc' = plus récents d'abord (défaut) | 'asc' = plus anciens d'abord
  // Vider la Map ne rappelle pas une requête déjà partie : sa réponse écrirait
  // dans le cache fraîchement vidé. La génération permet de la jeter à l'arrivée.
  let _histPrefetchGeneration = 0;
  function histPrefetchKey(page, players, cats, text, dateFrom, dateTo, altFilter) {
    return page + '|' + players.join(',') + '|' + cats.join(',') + '|' + (text || '') + '|' + (dateFrom || '') + '|' + (dateTo || '') + '|' + _histSortDir + '|' + (altFilter || '');
  }
  function clearHistPrefetchCache() { histPrefetchCache.clear(); _histPrefetchGeneration++; }
```

- [ ] **Step 2: Passer le filtre aux deux calculs de clé**

Dans `_doLoadHistoryPage`, la déclaration `const altFilter = ...` précède déjà le calcul de la clé (livré en v3.6.0). Remplacer l'appel :

```js
    const key = histPrefetchKey(page, filterPlayers, filterCats, textFilter.trim(), dateFrom, dateTo);
```

par :

```js
    const key = histPrefetchKey(page, filterPlayers, filterCats, textFilter.trim(), dateFrom, dateTo, altFilter);
```

Puis, dans `_prefetchNextHistoryPage`, remplacer :

```js
    const key = histPrefetchKey(nextPage, filterPlayers, filterCats, textFilter.trim(), dateFrom, dateTo);
```

par :

```js
    const key = histPrefetchKey(nextPage, filterPlayers, filterCats, textFilter.trim(), dateFrom, dateTo, altFilter);
```

- [ ] **Step 3: Jeter les réponses en vol devenues obsolètes**

Dans `_prefetchNextHistoryPage`, remplacer :

```js
    if (histPrefetchCache.has(key)) return;
    callServer('apiGetHistoryPage', [nextPage, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null, dateFrom || null, dateTo || null, _histSortDir, altFilter],
      res => { histPrefetchCache.set(key, res); },
```

par :

```js
    if (histPrefetchCache.has(key)) return;
    const generation = _histPrefetchGeneration;
    callServer('apiGetHistoryPage', [nextPage, PAGE_SIZE, filterPlayers, filterCats, textFilter.trim() || null, dateFrom || null, dateTo || null, _histSortDir, altFilter],
      res => { if (generation === _histPrefetchGeneration) histPrefetchCache.set(key, res); },
```

- [ ] **Step 4: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 135 / fail 0`.

- [ ] **Step 5: Vérification manuelle dans l'app**

Invoquer `/verify`. Onglet 📜 Historique, sur un jeu de données comptant au moins deux pages :
1. Cliquer une pastille Alt A, attendre l'affichage, puis **immédiatement** cliquer une pastille Alt B.
2. Cliquer « page suivante ».
Attendu : les lignes affichées correspondent à B, jamais à A.

- [ ] **Step 6: Commit**

```bash
git -c core.autocrlf=false add Index.html && git commit -m "fix(history): key the prefetch cache on the Alt filter and drop in-flight stale responses"
```

---

### Task 7: Réparer le thème clair des Tops Alternatifs

Trois défauts convergents relevés par les deux axes de revue et deux membres du council :

1. `--bg-card` est **utilisé sans être défini** (`Index.html:12456`, occurrence unique dans tout le fichier) : le repli sombre `#1e2533` gagne toujours, donc le menu déroulant des Tops Alternatifs reste sombre en thème clair. `--card-solid` existe déjà et est thématisée.
2. `--alt-accent` n'a pas été ajoutée au bloc `body.light`, alors que `--info` et `--clean` y sont bien redéfinies (`Index.html:65-66`) : la condition posée par le plan v3.6.0 était donc remplie. En thème clair, les pastilles Alt peignent `#ffd166` (jaune pâle) sur une carte quasi blanche.
3. Onze littéraux `rgba(255, 209, 102, …)` — la forme translucide de la même couleur — subsistent à côté de la variable. Changer `--alt-accent` décalerait le texte mais pas les fonds ni les lueurs.

**Files:**
- Modify: `Index.html:37` (bloc `:root`) et le bloc `body.light`
- Modify: `Index.html:2398-2432` (`.row-alt-pill`, `.row-alt-select`)
- Modify: `Index.html:12456` (`--bg-card`)

**Interfaces:**
- Consumes: `--alt-accent` (existante), `--card-solid` (existante).
- Produces: variable CSS `--alt-accent-rgb`.

- [ ] **Step 1: Confirmer les variables existantes**

```bash
grep -n -- "--card-solid\|--alt-accent" Index.html | head -10
```

Attendu : `--card-solid` définie dans `:root` **et** dans `body.light` ; `--alt-accent` définie uniquement dans `:root`. Si `--card-solid` n'existe pas sous ce nom, relever le nom réel de la variable de fond de carte opaque et l'utiliser à l'étape 4, en le notant dans le rapport.

- [ ] **Step 2: Ajouter la forme décomposée de la couleur**

Dans le bloc `:root`, juste après `--alt-accent: #ffd166;`, insérer :

```css
      --alt-accent-rgb: 255, 209, 102;
```

Les composantes séparées permettent d'écrire les variantes translucides en `rgba(var(--alt-accent-rgb), 0.08)` — impossible avec la seule forme hexadécimale, et sans préprocesseur ici.

- [ ] **Step 3: Décliner la couleur en thème clair**

Dans le bloc `body.light`, à la suite de la redéfinition de `--clean`, insérer :

```css
      --alt-accent: #b8860b;
      --alt-accent-rgb: 184, 134, 11;
```

`#b8860b` est un doré foncé : lisible sur fond clair, il conserve l'identité jaune des Tops Alternatifs là où `#ffd166` disparaissait.

- [ ] **Step 4: Corriger la variable inexistante**

Dans `Index.html:12456`, dans le `cssText` de `altMenu`, remplacer :

```
background:var(--bg-card, #1e2533);
```

par :

```
background:var(--card-solid);
```

- [ ] **Step 5: Remplacer les littéraux translucides**

```bash
grep -n "rgba(255, *209, *102" Index.html
```

Pour **chaque** occurrence, remplacer `rgba(255, 209, 102, X)` par `rgba(var(--alt-accent-rgb), X)` en conservant la valeur d'opacité `X` telle quelle.

Attention : une occurrence appartient à `.toast-undo-btn` (le bouton d'annulation des notifications), sans rapport avec les Tops Alternatifs — **la laisser inchangée**. L'identifier en lisant le sélecteur de la règle qui la contient avant de modifier quoi que ce soit, et indiquer dans le rapport combien d'occurrences ont été converties et laquelle a été écartée.

- [ ] **Step 6: Vérifier**

```bash
npm run verify && grep -c "rgba(255, *209, *102" Index.html
```

Attendu : syntaxe OK, `pass 135 / fail 0`, et le compte restant vaut `1` (la seule occurrence de `.toast-undo-btn`).

- [ ] **Step 7: Vérification manuelle dans l'app**

Invoquer `/verify`. Basculer en thème clair, puis :
1. Onglet ✍️ Saisir un Lot → ouvrir le sélecteur « Top Alternatif » d'une ligne → attendu : le menu déroulant a un fond **clair**, son texte est lisible.
2. Les pastilles Alt d'une ligne → attendu : doré foncé lisible, pas de jaune pâle sur blanc.
3. Rebasculer en thème sombre → attendu : rendu identique à avant ce plan.

- [ ] **Step 8: Commit**

```bash
git -c core.autocrlf=false add Index.html && git commit -m "fix(theme): give Alt Tops a readable light-theme colour and drop the undefined --bg-card"
```

---

### Task 8: Changelog, vérification finale et push unique

Seule tâche qui touche au dépôt distant. Le push déclenche `deploy-gas.yml`, qui redéploie **les deux cibles** — et qui, depuis la Task 3, exécute d'abord les tests sur le code nettoyé.

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: le déploiement des deux instances.

- [ ] **Step 1: Relever la date réelle**

```bash
date +%F
```

Utiliser cette valeur — pas la date de rédaction de ce plan — dans l'en-tête ci-dessous.

- [ ] **Step 2: Ajouter l'entrée**

Insérer dans `CHANGELOG.md`, juste après la ligne `Format basé sur [Keep a Changelog](https://keepachangelog.com).` et avant `## [v3.6.0]` :

```markdown
## [v3.7.0] - AAAA-MM-JJ

### Corrigé
**Humanisé** : Quand le graphique du Dashboard ne peut rien afficher, il le dit maintenant clairement — « aucune donnée pour cette sélection » ou un message d'erreur avec un bouton Réessayer — au lieu de laisser une zone vide sans explication.
**Technique** : `Index.html` — panneau `#chartState` et fonction `showChartState(state, message)` ; la branche « aucune donnée » de `renderChart()` n'écrit plus dans le canevas (`ctx.fillStyle = 'var(--text-muted)'` était silencieusement ignoré par le canevas, le texte était peint en noir sur fond sombre) et les quatre gestionnaires d'erreur de `applyFilters()` affichent l'état d'erreur au lieu d'un conteneur vide.

**Humanisé** : Les couleurs des Tops Alternatifs sont enfin lisibles en thème clair, et leur menu déroulant n'apparaît plus en sombre au milieu d'une page claire.
**Technique** : `Index.html` — `--alt-accent` et `--alt-accent-rgb` déclinées dans `body.light`, les onze `rgba(255, 209, 102, …)` remplacés par `rgba(var(--alt-accent-rgb), …)`, et `var(--bg-card, #1e2533)` — dont la variable n'était définie nulle part — remplacé par `var(--card-solid)`.

**Humanisé** : En changeant rapidement de filtre par Top Alternatif dans l'Historique, la page suivante ne peut plus afficher les lignes du filtre précédent.
**Technique** : `Index.html` — `histPrefetchKey()` prend le filtre Alt en 7ᵉ paramètre, et un compteur de génération jette les réponses de préchargement déjà parties au moment d'un changement de filtre.

**Humanisé** : Supprimer une entrée saisie directement dans un Top Alternatif est désormais annulable depuis le journal d'audit, et ne peut plus effacer une autre entrée du même joueur au même score.
**Technique** : `Code.gs` — `deleteNativeAltEntry()` retourne la ligne supprimée, `apiDeleteNativeAltEntry()` enregistre un instantané `{ sheet: 'altHistory', op: 'delete', before }` et aligne ses arguments sur la signature d'`AuditService.log()` ; le garde anti-obsolescence contrôle aussi la date.

### Ajouté
**Humanisé** : Une erreur de logique ne peut plus atteindre le site : les tests s'exécutent automatiquement à chaque livraison, sur le code exact qui part chez Google.
**Technique** : `.github/workflows/deploy-gas.yml` — le nettoyage des commentaires devient une étape du workflow, suivie de `npm run verify` avant le déploiement ; Node passe de 20 à 22 (le glob littéral de `node --test` n'est pris en charge qu'à partir de la 22, sous la 20 l'étape n'aurait trouvé aucun test).

**Humanisé** : L'application signale désormais dans son journal technique quand son cache interne est trop plein pour fonctionner, au lieu de l'abandonner sans rien dire.
**Technique** : `Code.gs` — `_logCacheSkip()` tracé sur les deux caches de l'historique complet lorsqu'une charge dépasse `CONFIG.CACHE_MAX_BYTES`.

### Modifié
**Humanisé** : La librairie de graphiques est figée à une version précise : une mise à jour majeure ne peut plus casser le Dashboard des deux sites sans prévenir.
**Technique** : `Index.html` — `chart.js` épinglé à `4.5.1` ; `renderChart()` et `renderTrendChart()` affichent une erreur lisible si la librairie n'a pas pu être chargée. `context.md` §2 corrigé : le projet a bien des dépendances CDN externes, contrairement à ce qu'il affirmait.
```

- [ ] **Step 3: Vérifier l'équilibre des deux voix**

```bash
npm run verify && grep -c "Humanisé" CHANGELOG.md && grep -c "Technique" CHANGELOG.md
```

Attendu : les deux compteurs sont égaux.

- [ ] **Step 4: Commit du changelog**

```bash
git -c core.autocrlf=false add CHANGELOG.md && git commit -m "docs(changelog): log v3.7.0"
```

- [ ] **Step 5: Simulation complète du déploiement**

```bash
CI=1 node .github/scripts/strip-comments.js && npm run verify; git checkout -- Index.html Code.gs AutoPoints.gs; git status --porcelain
```

Attendu : nettoyage sans exception, syntaxe OK, `pass 135 / fail 0` sur le code nettoyé, puis dépôt restauré.

- [ ] **Step 6: Relire le diff complet**

```bash
git log --oneline origin/main..HEAD && git diff origin/main...HEAD --stat
```

Vérifier que chaque commit correspond à une tâche et qu'aucun fichier inattendu ne s'est glissé dedans.

- [ ] **Step 7: Vérifier le compte GitHub**

```bash
gh auth status
```

Si le compte actif n'est pas `Arcxy2nd` : `gh auth switch --user Arcxy2nd`.

- [ ] **Step 8: Pousser**

```bash
git push origin main
```

- [ ] **Step 9: Vérifier le déploiement sans sonder en boucle**

Attendre une seule fois, puis :

```bash
gh run list --limit 3
```

**Ne pas répéter en boucle** (`context.md` §8, anti-polling). Le run doit passer par les étapes *Strip comments* → *Verify the stripped code* → *Push and redeploy all targets*. Si *Verify* échoue, le déploiement est bloqué : c'est le comportement voulu, corriger avant de repousser.

- [ ] **Step 10: Vérification fonctionnelle et relevé de la panne**

Invoquer `/verify` sur les deux liens short.io. Contrôler en priorité le Dashboard :

- Si le graphique s'affiche → la panne est levée.
- Si un message apparaît → **le noter** : c'est le diagnostic que ce plan cherchait à obtenir. « Aucune donnée » pointe vers les filtres ou les données ; un message d'erreur donne la cause serveur exacte.

Puis relever la mesure du cache (Task 4, Step 7).

---

## Ce que ce plan ne traite pas, et pourquoi

Décisions explicites, à ne pas confondre avec des oublis :

| Point relevé | Statut | Raison |
|---|---|---|
| **Accès anonyme** — `appsscript.json` déclare `ANYONE_ANONYMOUS` et `requireAuthor()` ne vérifie qu'une chaîne non vide, donc toute action d'écriture est appelable sans authentification par qui connaît l'URL (publiée en clair dans les journaux d'Actions du dépôt public) | **Décision utilisateur requise** | Basculer sur `ANYONE` + `Session.getActiveUser().getEmail()` oblige chaque joueur à un compte Google : c'est un changement d'usage pour le groupe, pas un détail technique. Défaut antérieur à la v3.6.0. À trancher avant d'écrire le code. |
| **Découpage du cache au-delà de 95 Ko** | **Suspendu à la mesure** | La Task 4 dit s'il y a un problème. Corriger avant de mesurer serait de la spéculation ; si la feuille est petite, l'action correcte est de ne rien faire. |
| **Renommage de la famille `isAlt`** (deux sens incompatibles : univers de saisie natif vs. Top Alternatif lié) | **Reporté** | Vraie dette de lisibilité, mais ~10 sites dans un fichier de 820 Ko sans test frontend. À faire une fois la Task 3 livrée, quand la CI protège réellement. |
| **Génération automatique de l'`epilogue` du harness** (76 symboles listés à la main sur 127) | **Reporté** | Amélioration d'outillage, aucun impact utilisateur, indépendante de tout le reste. |
| **Fusion des 5 appels de `refreshDashboardStats`** et mémo intra-requête sur `getAltLogs` | **Reporté** | Optimisation de latence perçue ; à arbitrer avec la mesure de la Task 4, qui peut rendre le sujet sans objet. |
| **Regex `SCRIPT_RE` dupliquée** entre `strip-comments.js` et `check-html-syntax.js` | **Volontairement laissé** | Trois lignes dans deux rôles de cycle de vie distincts ; un module partagé entre `.github/scripts/` et `tests/` coûterait plus que la duplication n'économise. |
