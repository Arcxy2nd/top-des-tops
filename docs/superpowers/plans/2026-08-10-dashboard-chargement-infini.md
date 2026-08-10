# Dashboard bloqué en chargement infini — reproduction locale et fin de l'échec silencieux

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obtenir enfin l'erreur cliente réelle qui laisse les squelettes du Dashboard tourner à l'infini — en rendant le frontend reproductible hors de Google Apps Script — puis supprimer la classe de panne entière : aucune exception cliente, aucun squelette, aucun démarrage partiel ne peut plus rester muet.

**Architecture :** Trois axes. (1) *Reproductibilité* — un serveur local sert `Index.html` tel quel avec un `google.script.run` de substitution branché sur le vrai `Code.gs` (via le harness VM déjà en place). C'est le seul moyen de lire la console du frontend : dans l'app déployée, le code tourne dans une iframe `googleusercontent.com` inaccessible à tout outil externe. (2) *Aveu obligatoire* — `callServer` cesse d'avaler les exceptions de ses gestionnaires de succès, un chien de garde transforme tout squelette éternel en message lisible, et une bannière globale capte les erreurs non interceptées. (3) *Robustesse du démarrage* — le chargement des données du Dashboard ne dépend plus d'avoir survécu à ~1 800 lignes de branchements d'écouteurs.

**Tech Stack :** Google Apps Script (`.gs`), HTML/CSS/JS monofichier (`Index.html`, servi verbatim par `HtmlService`, aucun scriptlet `<? ?>` — vérifié : 0 occurrence), tests `node:test` sur harness VM local (`tests/harness.js`), serveur local `node:http` sans dépendance, déploiement GitHub Actions + `clasp`.

---

## Contexte du diagnostic (à lire avant la Task 1)

### Symptôme rapporté

Sur le Dashboard, **tout ce qui possède une animation de chargement reste en chargement infini**. Les autres onglets (Historique, Notes, Paramètres) fonctionnent normalement. **Les deux instances** (« Site tops » et « Tops RDS ») sont touchées.

### Ce qui a été établi par la mesure, sur le déploiement en production

Mesures prises sur `…AKfycbyRPtNbNnSbuodM25AORVY2t26a-vDNV78_4WA5cZgTEVi3hHTSbGzXfpsg7nMUsCjA/exec`, le 2026-08-10.

| Vérifié | Résultat |
|---|---|
| Le déploiement v3.7.0 est-il bien parti ? | **Oui** — run GitHub Actions `31353887611`, succès, 03:54Z |
| La page répond-elle ? | **Oui** — HTTP 200, iframe applicative montée en 1280×695, `document.readyState = complete` |
| Le JavaScript de la page démarre-t-il ? | **Oui** — 16 appels `google.script.run` partent au démarrage |
| Ces appels aboutissent-ils ? | **Oui** — les 16 renvoient HTTP 200, **aucune requête en attente** |
| Le serveur renvoie-t-il de vraies données ? | **Oui** — payloads relevés : `chartData` (18 séries × 7 joueurs), `stats` (leader Alik 2742 pts), joueurs, Tops, barème, phrases, tchat, branding, Tops Alternatifs |
| Un nom de fonction serveur appelé par la page manque-t-il côté `.gs` ? | **Non** — 78 appelés, 141 définis, **0 manquant**, y compris après nettoyage des commentaires (code réellement déployé) |
| Le nettoyeur de commentaires casse-t-il le code livré ? | **Non** — `npm run verify` passe sur la sortie nettoyée |
| Le tchat, les Notes, l'Historique fonctionnent-ils ? | **Oui** (rapporté par l'utilisateur) |

### Ce que l'arithmétique des appels dit

Les 16 appels de démarrage se répartissent ainsi : 10 identifiés par leur payload (navigation, tchat, phrases, barème, joueurs+Tops, branding, `chartData`, `stats`, Tops Alternatifs, carte Alt) **+ 5 statistiques du Dashboard + 1**. Les cinq appels de `refreshDashboardStats()` (`apiGetPlayerRecords`, `apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`, `apiGetMentionStats`) sont donc bien **partis et revenus en 200**.

### Conclusion du diagnostic

**Le serveur est innocenté. La panne est côté client, après réception d'une réponse valide.** Un squelette encore visible signifie que le gestionnaire de succès n'a pas atteint la ligne qui l'efface (`container.innerHTML = ''` dans `scanRecords`, `showChartWrapper()` dans `applyFilters`).

Or `callServer` (`Index.html:8483-8498`) n'entoure pas `onSuccess(res)` d'un `try` : **toute exception levée dans un gestionnaire de succès remonte dans le dispatcher de `google.script.run` et disparaît** — pas de toast, pas d'état d'erreur, squelette figé pour toujours. C'est exactement la signature observée. Symétriquement, si l'exception se produit avant la ligne 17475 (`setTimeout(refreshDashboardStats, 150)`, dernière instruction d'une fonction d'initialisation de ~1 800 lignes), les cinq cartes ne se chargent jamais.

**Pourquoi ce plan commence par un harness et non par un correctif :** l'exception ne peut pas être lue à distance. Le code applicatif tourne dans une iframe servie par `n-<hash>-script.googleusercontent.com`, hors origine : ni la console, ni le DOM de l'app ne sont accessibles depuis les outils navigateur, la capture d'écran du volet n'est pas disponible dans cette session, et aucun Chrome n'est connecté. La Task 1 lève cet aveuglement de façon permanente. Les Tasks 2 à 4 font en sorte que la question ne se pose plus jamais : la prochaine panne de ce type s'affichera d'elle-même, dans l'app, chez l'utilisateur.

### Deux défauts résiduels confirmés par lecture du code livré

Indépendants du chargement infini, tous deux dans `renderTrendChart` — la Task 1 de la v3.7.0 n'a pas été exhaustive (`context.md` §7, « Exhaustivité obligatoire ») :

1. **`Index.html:10679`** — `ctx.fillStyle = 'var(--text-muted)'` : c'est **la dernière occurrence** du bug corrigé hier dans `renderChart` (vérifié : seul site restant du fichier où une variable CSS est affectée à un contexte canevas). Sur le type **Courbes** sans donnée, le message « Aucune donnée temporelle pour cette sélection. » est peint en noir pur sur fond sombre — invisible.
2. **`renderTrendChart` n'appelle jamais `showChartState('hidden')`** sur son chemin de succès, contrairement à `renderChart` (`Index.html:10319`). Un panneau « vide » ou « erreur » affiché précédemment reste donc à l'écran par-dessus le graphique quand on passe en Courbes.

---

## Global Constraints

Ces règles viennent de `context.md` et s'appliquent à **chaque** tâche.

- **Code en anglais** — variables, fonctions, commentaires dans le code. Les explications hors code sont en français.
- **Pas de classe ES6** — objets littéraux ou IIFE, cohérent avec le reste du codebase.
- **Commentaires uniquement pour le *pourquoi* non évident** — jamais pour décrire ce que le code fait.
- **Aucune constante hardcodée dans la logique** — les valeurs configurables du frontend vont dans le bloc `CONFIG` créé en Task 3, juste après `let activeLotUniverse` (`Index.html:5151`). Ce bloc n'existe pas encore : la Task 3 le crée.
- **Jamais de couleur hexadécimale directe dans le CSS** — toujours une variable CSS.
- **Cible tactile minimum `44px`** (`--tap-min`) sur tout élément interactif.
- **Avatar obligatoire** dès qu'un nom de joueur apparaît dans l'UI.
- **Identité obligatoire** (`requireIdentity()` client, `requireAuthor()` serveur) avant toute écriture. *Aucune tâche de ce plan n'écrit de données* — aucune n'a donc à toucher à l'identité ni au journal d'audit.
- **Aucun `TODO`/`FIXME`/placeholder/fonction vide.**
- **`CHANGELOG.md` mis à jour** en Task 7, deux voix (**Humanisé** + **Technique**) par item.
- **Un seul `git push` à la toute fin** (Task 7). Chaque push redéploie les deux cibles de `deploy-targets.json`.
- **Compte GitHub `Arcxy2nd`** — vérifier `gh auth status` avant le push.
- **Ne jamais sonder en boucle** `gh run list` (§8, anti-polling).
- **Les numéros de ligne de ce plan datent de l'état du fichier au moment de sa rédaction** (`HEAD` = `ecdc486`). Chaque tâche insérant des lignes dans `Index.html`, les repères des tâches suivantes se décalent : **toujours localiser par le contenu cité**, jamais par le numéro seul.

**Commande de vérification après chaque tâche :** `npm run verify`. Toute tâche qui la laisse rouge n'est pas terminée. Compteur de départ : `pass 135 / fail 0`.

**Attention CRLF — la règle diffère par fichier, vérifié empiriquement le 2026-08-10 (Task 2 de ce plan a produit un commit de 35 000 lignes de bruit avant correction) :**
- **`Index.html`** : l'historique du dépôt stocke ce fichier en **LF** (vérifié via `git show HEAD:Index.html | od -c`), alors que le fichier sur disque est en CRLF. Utiliser un `git add Index.html` **normal, sans override** — `core.autocrlf=true` (actif par défaut dans ce dépôt) convertit correctement CRLF→LF à l'ajout, ce qui reproduit un diff minimal. **Ne jamais passer `-c core.autocrlf=false` pour ce fichier** — cela désactive la conversion et produit un diff de renormalisation de dizaines de milliers de lignes.
- **`CHANGELOG.md`** : l'historique du dépôt stocke ce fichier en **CRLF** (vérifié de la même façon). Pour ce fichier seulement, utiliser `git -c core.autocrlf=false add CHANGELOG.md` afin de préserver le CRLF et éviter la renormalisation inverse.
- **Avant tout commit touchant l'un de ces deux fichiers**, vérifier avec `git diff --cached --stat` que le nombre de lignes changées correspond à peu près à l'ampleur réelle de la modification (quelques dizaines de lignes, pas des milliers) — si ce n'est pas le cas, ne pas commit : `git restore --staged <fichier>`, ajouter avec l'autre convention, et revérifier.

---

## Structure des fichiers

| Fichier | Statut | Responsabilité |
|---|---|---|
| `tests/frontend/serve.js` | **Créé** (Task 1) | Serveur `node:http` : sert `Index.html` avec un préambule injecté, et expose `POST /call` qui exécute le vrai `Code.gs` dans le harness VM |
| `tests/frontend/stub.js` | **Créé** (Task 1) | Préambule injecté dans la page : définit `google.script.run` au-dessus de `fetch('/call')` et relaie toute erreur cliente dans le titre du document |
| `tests/frontend/fixtures.js` | **Créé** (Task 1) | Feuilles de test (joueurs, Tops, History, Notes, Bareme, Phrases, Chat, AltHistory) passées à `ConfigService.getSheets()` |
| `package.json` | Modifié (Task 1) | Script `serve:front` |
| `Index.html` | Modifié (Tasks 2 à 6) | `callServer` blindé, chien de garde des squelettes, bannière d'erreur globale, `renderTrendChart` corrigée, démarrage des données isolé |
| `tests/frontend-guards.test.js` | **Créé** (Tasks 2, 3) | Tests des trois garde-fous, exécutés dans le harness DOM minimal |
| `CHANGELOG.md` | Modifié (Task 7) | Entrée v3.8.0, deux voix par item |

---

### Task 1: Harness frontend local — rendre l'erreur lisible

Le cœur du plan. Sans cette tâche, tout correctif est une supposition. `Index.html` ne contient **aucun scriptlet GAS** (`<?` : 0 occurrence, vérifié) : le fichier peut donc être servi tel quel par n'importe quel serveur statique, à condition de fournir un `google.script.run`.

**Files:**
- Create: `tests/frontend/fixtures.js`
- Create: `tests/frontend/stub.js`
- Create: `tests/frontend/serve.js`
- Modify: `package.json` (bloc `scripts`)

**Interfaces:**
- Consumes: `tests/harness.js` — `loadGas()` retourne l'objet des symboles exportés de `Code.gs` + `AutoPoints.gs` ; `makeSheet(rows)` fabrique une feuille factice.
- Produces:
  - `buildSheets()` → objet de feuilles pour `ConfigService.getSheets()`, consommé par `serve.js`.
  - `startServer(port)` → `Promise<{ port, close() }>`.
  - `GET /` → `Index.html` avec `stub.js` injecté ; `POST /call` → `{ ok, value }` ou `{ ok:false, error }`.

**Répartition du travail — important pour l'implémenteur :** cette tâche construit et vérifie le serveur par des moyens strictement automatisés (`curl`/`node`, Steps 6-7). La lecture des erreurs dans un vrai navigateur (Step 8) n'est **pas** à exécuter par l'implémenteur : elle est marquée `[CONTRÔLEUR]` et reste au contrôleur du plan, qui dispose d'un outil de navigateur interactif. La tâche est DONE dès que le serveur démarre et que `POST /call` fait un aller-retour correct — l'implémenteur ne doit pas essayer d'ouvrir de navigateur.

- [ ] **Step 1: Lire le harness existant avant d'écrire quoi que ce soit**

```bash
node -e "const h=require('./tests/harness.js'); console.log(Object.keys(h)); const g=h.loadGas(); console.log('apiGetPlayerRecords:', typeof g.apiGetPlayerRecords, '| apiGetFilteredData:', typeof g.apiGetFilteredData, '| apiGetTrends:', typeof g.apiGetTrends, '| apiGetActiveWeekday:', typeof g.apiGetActiveWeekday, '| apiGetTopPlayerCategoryPairs:', typeof g.apiGetTopPlayerCategoryPairs, '| apiGetMentionStats:', typeof g.apiGetMentionStats);"
```

Attendu : la liste des exports du harness, puis `function` pour les six fonctions. Si l'une ressort `undefined`, elle manque à la liste `epilogue` de `tests/harness.js:143-165` : l'ajouter à cette liste (une chaîne de noms séparés par des virgules) avant de continuer, et le signaler dans le rapport.

Relever aussi les noms exacts exportés par le harness (`loadGas`, `makeSheet`, et les éventuelles constantes d'en-tête `HEADER_HISTORY`, `HEADER_ALT_HIST`) : les étapes suivantes les utilisent.

- [ ] **Step 2: Écrire les feuilles de test**

Créer `tests/frontend/fixtures.js` :

```js
'use strict';

const { makeSheet } = require('../harness.js');

// Les données reproduisent la forme relevée en production le 2026-08-10 (7 joueurs,
// plusieurs Tops, entrées étalées sur deux mois) : une feuille de deux lignes ne
// déclenche ni la pagination, ni les agrégats, ni les bornes de cache.
const PLAYERS = [
  ['Safir',   'https://example.invalid/a.jpg', '#ff858f', ''],
  ['Ilker',   'https://example.invalid/b.jpg', '#00ffaa', ''],
  ['Antoine', 'https://example.invalid/c.jpg', '#80eaff', ''],
  ['Nicolas', 'https://example.invalid/d.jpg', '#ff9238', ''],
  ['Romain',  'https://example.invalid/e.jpg', '#ff0000', ''],
  ['Alik',    'https://example.invalid/f.jpg', '#fff700', ''],
  ['JJ',      'https://example.invalid/g.jpg', '#c9c9c9', '']
];

const CATEGORIES = [
  ['Mauvais',   'Prend mal ce qu on lui dit', '😭',   '#ff858f'],
  ['Méchant',   'Envoie des piques',          '😈',   '#ff0000'],
  ['Lacheur',   'Abandonne ses amis',         '🚹',   '#ffd166'],
  ['Scatophile','Aime la merde',              '😏💩', '#6b3000']
];

function historyRows() {
  const rows = [];
  const players = PLAYERS.map(p => p[0]);
  const cats = CATEGORIES.map(c => c[0]);
  // 84 entrées sur juin/juillet/août : assez pour peupler records, tendances,
  // jour le plus actif et duos fréquents, qui restent vides sur un jeu trop petit.
  for (let d = 1; d <= 28; d++) {
    for (let k = 0; k < 3; k++) {
      const month = ['06', '07', '08'][k];
      rows.push([
        '2026-' + month + '-' + String(d).padStart(2, '0'),
        players[(d + k) % players.length],
        cats[(d + k * 2) % cats.length],
        1 + ((d * 7 + k) % 25),
        'Entrée de test @' + players[(d + 1) % players.length] + ' #' + cats[k % cats.length],
        ''
      ]);
    }
  }
  return rows;
}

function buildSheets() {
  return {
    players:    makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ...PLAYERS]),
    categories: makeSheet([['Name', 'Description', 'Emoji', 'Hex color'], ...CATEGORIES]),
    history:    makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId'], ...historyRows()]),
    notes:      makeSheet([['Date', 'Player', 'Note text'], ['2026-08-01', 'Alik', 'Note de test']]),
    bareme:     makeSheet([['Action', 'Points'], ['Insulter la mère', 204]]),
    phrases:    makeSheet([['Preset', 'Pool', 'Phrase'], ['__default__', 'first', '👑 {player} règne avec {pts} pts.']]),
    chat:       makeSheet([['Id', 'Date', 'Author', 'Text', 'ReplyToId'], ['1', '2026-08-01', 'Ilker', 'Salut @Safir', '']]),
    altHistory: makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Author'],
                           ['2026-08-01', 'Alik', 'Trou du cul', 7, 'Native', '', '', 'Admin']]),
    altCategories: makeSheet([['Name', 'Description', 'Emoji', 'Hex color'], ['Trou du cul', 'Gros zgeg', '🤠', '#ee6943']])
  };
}

module.exports = { buildSheets, PLAYERS, CATEGORIES };
```

Si `ConfigService.getSheets()` attend d'autres clés que celles listées, les relever avec la commande suivante et compléter `buildSheets()` en conséquence, puis le noter dans le rapport :

```bash
node -e "const s=require('fs').readFileSync('Code.gs','utf8'); const m=s.match(/getSheets[\s\S]{0,1200}/); console.log(m && m[0]);"
```

- [ ] **Step 3: Écrire le préambule injecté dans la page**

Créer `tests/frontend/stub.js` :

```js
// Injecté dans <head> par serve.js. Reproduit la seule API que Index.html
// consomme du côté Google : google.script.run et son couple de gestionnaires.
// Les erreurs sont poussées dans window.__frontErrors ET dans document.title :
// le titre est la seule voie de sortie lisible par un client HTTP sans DevTools.
(function () {
  window.__frontErrors = [];
  window.__frontCalls  = [];

  function record(kind, detail) {
    window.__frontErrors.push(kind + ': ' + detail);
    document.title = 'ERRORS=' + window.__frontErrors.length + ' | ' + window.__frontErrors.join(' || ');
  }

  window.addEventListener('error', e => {
    record('window.error', (e.message || '?') + ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', e => {
    record('unhandledrejection', String((e.reason && e.reason.message) || e.reason));
  });

  function makeRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === 'withSuccessHandler') return h => makeRunner(h, failureHandler);
        if (prop === 'withFailureHandler') return h => makeRunner(successHandler, h);
        return function () {
          const args = Array.prototype.slice.call(arguments);
          window.__frontCalls.push(prop);
          fetch('/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fn: prop, args: args })
          })
            .then(r => r.json())
            .then(payload => {
              if (!payload.ok) {
                if (failureHandler) failureHandler(new Error(payload.error));
                return;
              }
              // Une exception jetée ici par le code de l'app est exactement la panne
              // recherchée : la capturer explicitement, google.script.run l'avale.
              try {
                if (successHandler) successHandler(payload.value);
              } catch (err) {
                record('successHandler(' + prop + ')', (err && err.stack) || String(err));
              }
            })
            .catch(err => record('transport(' + prop + ')', String(err)));
        };
      }
    });
  }

  window.google = { script: { run: makeRunner(null, null), host: { setHeight() {}, editor: { focus() {} } }, url: { getLocation(cb) { cb({ parameter: {} }); } } } };
})();
```

- [ ] **Step 4: Écrire le serveur**

Créer `tests/frontend/serve.js` :

```js
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const { loadGas }     = require('../harness.js');
const { buildSheets } = require('./fixtures.js');

const ROOT      = path.join(__dirname, '..', '..');
const STUB_PATH = path.join(__dirname, 'stub.js');

function buildGas() {
  const gas = loadGas();
  const sheets = buildSheets();
  gas.ConfigService.getSheets = () => sheets;
  return gas;
}

function servePage(res) {
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  const stub = fs.readFileSync(STUB_PATH, 'utf8');
  // Le préambule doit précéder tout script de la page : Index.html appelle
  // google.script.run depuis window.onload, mais aussi au fil du parsing.
  const injected = html.replace('<head>', '<head>\n<script>\n' + stub + '\n</script>');
  if (injected === html) throw new Error('Index.html: balise <head> introuvable, injection impossible');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(injected);
}

function handleCall(gas, body, res) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'corps JSON invalide' }));
    return;
  }
  const fn = gas[parsed.fn];
  if (typeof fn !== 'function') {
    // Un nom absent du harness n'est pas la même panne qu'un nom absent de Code.gs :
    // le dire explicitement évite de confondre trou d'outillage et bug applicatif.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'non exposée par le harness : ' + parsed.fn }));
    return;
  }
  try {
    const value = fn.apply(null, parsed.args || []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, value: value === undefined ? null : value }));
  } catch (err) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: (err && err.message) || String(err) }));
  }
}

function startServer(port) {
  const gas = buildGas();
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
      servePage(res);
      return;
    }
    if (req.method === 'POST' && req.url === '/call') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => handleCall(gas, body, res));
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise(resolve => {
    server.listen(port || 0, '127.0.0.1', () => {
      resolve({ port: server.address().port, close: () => server.close() });
    });
  });
}

if (require.main === module) {
  startServer(Number(process.env.PORT) || 8137).then(s => {
    console.log('Frontend local : http://127.0.0.1:' + s.port + '/');
  });
}

module.exports = { startServer };
```

- [ ] **Step 5: Câbler les scripts npm**

Dans `package.json`, remplacer le bloc `scripts` :

```json
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "check:html": "node tests/check-html-syntax.js",
    "verify": "npm run check:html && npm test"
  }
```

par :

```json
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "check:html": "node tests/check-html-syntax.js",
    "verify": "npm run check:html && npm test",
    "serve:front": "node tests/frontend/serve.js"
  }
```

`serve:front` reste **hors** de `verify` : le harness frontend a besoin d'un navigateur, `verify` doit rester exécutable en CI sans navigateur.

- [ ] **Step 6: Démarrer le serveur et vérifier qu'il sert la page instrumentée**

```bash
npm run serve:front &
sleep 1
curl -s http://127.0.0.1:8137/ | grep -c "window.__frontErrors"
curl -s -X POST http://127.0.0.1:8137/call -H "Content-Type: application/json" -d '{"fn":"apiGetPlayerRecords","args":["main"]}'
kill %1
```

Attendu : le premier `curl` affiche `1` (le préambule `stub.js` est bien injecté avant tout autre script) ; le second renvoie `{"ok":true,"value":{...}}` avec de vraies données issues des feuilles de `fixtures.js` (pas une erreur, pas un corps vide). C'est le critère qui rend la tâche DONE — l'implémenteur s'arrête ici.

- [ ] **Step 7: Commit**

```bash
git add tests/frontend/ package.json && git commit -m "test(frontend): serve Index.html locally against the real backend to expose client-side errors"
```

- [ ] **Step 8 [CONTRÔLEUR — pas l'implémenteur] : Charger la page et relever les erreurs**

Cette étape est réservée au contrôleur du plan (celui qui dispose d'un outil de navigateur interactif), une fois la Task 1 relue et approuvée. Démarrer `npm run serve:front`, ouvrir `http://127.0.0.1:8137/` dans le navigateur intégré (outil `preview_start` puis `read_console_messages` et `read_page`). Contrairement à l'app déployée, la page est ici en origine `127.0.0.1` **sans iframe** : la console et le DOM sont lisibles.

Relever, dans cet ordre :

1. `read_console_messages` avec `onlyErrors: true` → la ou les exceptions, avec fichier et ligne.
2. Le `<title>` du document (`read_page`) → il commence par `ERRORS=<n>` dès qu'une erreur a été captée, et contient les messages concaténés.
3. Dans la console, l'état des squelettes du Dashboard :

```js
JSON.stringify({
  chartSkeleton: getComputedStyle(document.getElementById('chartSkeleton')).display,
  records:  document.getElementById('recordsResults').innerHTML.includes('skeleton'),
  pairs:    document.getElementById('pairsResults').innerHTML.includes('skeleton'),
  mentions: document.getElementById('mentionsResults').innerHTML.includes('skeleton'),
  calls:    window.__frontCalls,
  errors:   window.__frontErrors
})
```

**C'est le livrable qui débloque la Task 6 :** la pile d'appel de l'exception, et la liste des appels serveur réellement partis. Le contrôleur consigne ce relevé mot pour mot avant de dispatcher la Task 2.

- [ ] **Step 9 [CONTRÔLEUR] : Si aucune erreur n'apparaît**

Si les squelettes se remplissent correctement en local, la panne dépend des **données réelles**, pas du code : les feuilles de test ne la déclenchent pas. Alors, et seulement alors :

1. Réduire l'écart avec la production en remplaçant `historyRows()` par un export réel : dans l'app déployée, Paramètres → 🔧 Outils → export, puis convertir en tableau de lignes dans `fixtures.js` (retouche à faire soi-même, ou via une tâche de correction dédiée — pas dans le flux DONE/review standard).
2. Recharger et relever à nouveau.

Consigner laquelle des deux branches s'est appliquée avant de dispatcher la Task 6.

---

### Task 2: `callServer` ne peut plus avaler une exception

Cause structurelle de l'échec silencieux. `callServer` est le point de passage **unique** de tous les appels serveur de l'app (78 noms de fonctions). Blinder ce seul endroit couvre chaque carte, chaque onglet, chaque squelette — corriger carte par carte serait une violation de DRY et laisserait des trous.

**Files:**
- Modify: `Index.html:8483-8498` (`callServer`)
- Test: `tests/frontend-guards.test.js` (créé ici)

**Interfaces:**
- Consumes: `showToast(message, kind)` (existant), `console.error`.
- Produces: comportement de `callServer` — une exception dans `onSuccess` déclenche désormais `showToast(...)` **et** `onError(err)`. Consommé par toutes les cartes du Dashboard, et par le chien de garde de la Task 3.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/frontend-guards.test.js` :

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const INDEX = path.join(__dirname, '..', 'Index.html');

// Extrait une fonction nommée du <script> inline de Index.html, du mot-clé
// `function` jusqu'à son accolade fermante, en comptant les accolades.
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

function loadCallServer() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const toasts = [];
  const errors = [];
  const sandbox = {
    showToast: (msg, kind) => toasts.push({ msg: String(msg), kind: kind }),
    console: { error: (...a) => errors.push(a.map(String).join(' ')), warn() {}, log() {} },
    google: { script: { run: null } }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'callServer') + '\nthis.__callServer = callServer;', sandbox);
  return { callServer: sandbox.__callServer, toasts, errors, sandbox };
}

// Reproduit le contrat de google.script.run : les gestionnaires sont posés par
// chaînage, l'appel de la fonction déclenche la réponse.
function fakeRunner(response) {
  const state = { success: null, failure: null };
  const runner = {
    withSuccessHandler(h) { state.success = h; return runner; },
    withFailureHandler(h) { state.failure = h; return runner; },
    apiAnything() { state.success(response); }
  };
  return runner;
}

test('callServer reports an exception thrown by its success handler', () => {
  const { callServer, toasts, errors, sandbox } = loadCallServer();
  sandbox.google.script.run = fakeRunner({ success: true, value: 1 });

  const seen = [];
  callServer('apiAnything', [], () => { throw new Error('boom in render'); }, 'Chargement test', err => seen.push(err));

  assert.strictEqual(seen.length, 1, "onError doit être appelé quand onSuccess lève");
  assert.match(String(seen[0].message || seen[0]), /boom in render/);
  assert.strictEqual(toasts.length, 1, 'un toast doit signaler la panne');
  assert.match(toasts[0].msg, /Chargement test/);
  assert.strictEqual(toasts[0].kind, 'error');
  assert.ok(errors.some(e => /boom in render/.test(e)), 'la trace doit partir en console.error');
});

test('callServer still passes the payload through on the nominal path', () => {
  const { callServer, toasts, sandbox } = loadCallServer();
  sandbox.google.script.run = fakeRunner({ success: true, value: 42 });

  let got = null;
  callServer('apiAnything', [], res => { got = res; }, 'Chargement test', () => { throw new Error('onError ne doit pas être appelé'); });

  assert.strictEqual(got.value, 42);
  assert.strictEqual(toasts.length, 0, 'aucun toast sur le chemin nominal');
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --test-name-pattern="exception thrown by its success handler"
```

Attendu : échec — l'exception traverse `callServer` et fait échouer le test au lieu d'être signalée.

- [ ] **Step 3: Blinder `callServer`**

Dans `Index.html`, remplacer les lignes 8483-8498 :

```js
  function callServer(fn, params, onSuccess, errorLabel, onError) {
    let runner = google.script.run
      .withSuccessHandler(res => {
        if (res && res.success === false) {
          showToast((errorLabel || 'Erreur') + ' : ' + res.error, 'error');
          if (onError) onError(res.error);
        } else {
          if (onSuccess) onSuccess(res);
        }
      })
      .withFailureHandler(err => {
        showToast((errorLabel || 'Erreur serveur') + ' : ' + (err.message || err), 'error');
        if (onError) onError(err);
      });
    runner[fn](...params);
  }
```

par :

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
        // google.script.run avale toute exception levée ici : sans ce try, un
        // gestionnaire qui casse laisse le squelette tourner à l'infini, sans
        // toast, sans état d'erreur et sans trace — c'était la panne du Dashboard.
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
    runner[fn](...params);
  }
```

- [ ] **Step 4: Lancer les tests**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 137 / fail 0`.

- [ ] **Step 5: Vérifier dans le harness local**

Recharger `http://127.0.0.1:8137/` (relancer `npm run serve:front` si nécessaire). Attendu : l'exception relevée en Task 1 apparaît maintenant sous forme de toast rouge dans la page **et** dans `console.error`, et la carte concernée affiche son texte de repli au lieu d'un squelette.

- [ ] **Step 6: Commit**

```bash
git add Index.html && git add tests/frontend-guards.test.js && git commit -m "fix(client): report exceptions thrown inside callServer success handlers instead of swallowing them"
```

---

### Task 3: Un squelette ne peut plus tourner indéfiniment

Deuxième filet, indépendant du premier. La Task 2 couvre les exceptions ; elle ne couvre pas le cas où **aucune réponse n'arrive** (appel jamais parti, exception synchrone avant l'appel, ou GAS qui ne répond pas). `showSkeleton` est le point de passage unique de toutes les zones de chargement de l'app : y greffer un chien de garde couvre tout.

**Files:**
- Modify: `Index.html:5151` (création du bloc `CONFIG`)
- Modify: `Index.html:7902-7915` (`showSkeleton`)
- Modify: `Index.html` — bloc CSS, à la suite de la règle `.chart-state button { ... }` (vers la ligne 1091)
- Test: `tests/frontend-guards.test.js`

**Interfaces:**
- Consumes: `showSkeleton(container, opts)` (existant, signature inchangée).
- Produces: `CONFIG.SKELETON_TIMEOUT_MS` (nombre, 15000) ; classe CSS `.load-stalled` ; comportement : un conteneur encore en squelette après le délai affiche un message et un bouton de rechargement.

**Attention au nom de la classe :** elle doit s'appeler `load-stalled` et **surtout pas** `skeleton-stalled`. Le chien de garde détecte un squelette par `innerHTML.indexOf('class="skeleton')` ; un nom commençant par `skeleton` se ferait détecter comme un squelette, et le garde se réarmerait sur son propre message.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `tests/frontend-guards.test.js` :

```js
test('showSkeleton replaces a stalled skeleton with a readable message', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const timers = [];
  const container = {
    innerHTML: '',
    // The watchdog reads innerHTML to decide: a container the response has
    // already filled must not be overwritten.
    querySelector: () => null
  };
  const sandbox = {
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    CONFIG: { SKELETON_TIMEOUT_MS: 15000 },
    location: { reload() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'showSkeleton') + '\nthis.__showSkeleton = showSkeleton;', sandbox);

  sandbox.__showSkeleton(container, { rows: 3, height: 40 });
  assert.match(container.innerHTML, /class="skeleton/, 'le squelette doit être posé immédiatement');
  assert.strictEqual(timers.length, 1, 'un chien de garde doit être armé');
  assert.strictEqual(timers[0].ms, 15000, 'le délai doit venir de CONFIG');

  timers[0].fn();
  assert.doesNotMatch(container.innerHTML, /class="skeleton/, 'le squelette doit disparaître');
  assert.match(container.innerHTML, /Chargement interrompu/);
});

test('showSkeleton leaves a container alone once it has been filled', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const timers = [];
  const container = { innerHTML: '', querySelector: () => null };
  const sandbox = {
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    CONFIG: { SKELETON_TIMEOUT_MS: 15000 },
    location: { reload() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'showSkeleton') + '\nthis.__showSkeleton = showSkeleton;', sandbox);

  sandbox.__showSkeleton(container, { rows: 2, height: 30 });
  container.innerHTML = '<div class="sr-list">Contenu réel</div>';
  timers[0].fn();
  assert.strictEqual(container.innerHTML, '<div class="sr-list">Contenu réel</div>');
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --test-name-pattern="stalled skeleton|once it has been filled"
```

Attendu : échec sur `un chien de garde doit être armé` (`showSkeleton` n'arme aucun minuteur aujourd'hui).

- [ ] **Step 3: Créer le bloc `CONFIG` du frontend**

Dans `Index.html`, juste après la ligne 5151 (`let activeLotUniverse = 'main';        // 'main' | 'alt'`), insérer :

```js

  // Tunable frontend values. No constant of this kind may be hardcoded
  // directly in the logic (context.md §8).
  const CONFIG = {
    // An Apps Script round-trip rarely exceeds 5s; past 15s, the zone is
    // considered abandoned rather than merely slow.
    SKELETON_TIMEOUT_MS: 15000
  };
```

- [ ] **Step 4: Ajouter la règle CSS**

Dans `Index.html`, juste après la règle `.chart-state button { ... }` (vers la ligne 1091), insérer :

```css
    .load-stalled {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 0.88rem;
      line-height: 1.5;
    }
    .load-stalled button {
      min-height: var(--tap-min);
      padding: 0 18px;
    }
```

- [ ] **Step 5: Armer le chien de garde dans `showSkeleton`**

Dans `Index.html`, remplacer les lignes 7902-7915 :

```js
  function showSkeleton(container, opts) {
    // The caller picks a tag compatible with the container (e.g. 'li' for <ul>/<ol>, 'div' otherwise).
    if (!container) return;
    opts = opts || {};
    const rows       = opts.rows || 3;
    const height     = opts.height || 44;
    const tag        = opts.tag || 'div';
    const extraClass = opts.extraClass ? (' ' + opts.extraClass) : '';
    let html = '';
    for (let i = 0; i < rows; i++) {
      html += '<' + tag + ' class="skeleton' + extraClass + '" style="height:' + height + 'px;margin-bottom:8px;"></' + tag + '>';
    }
    container.innerHTML = html;
  }
```

par :

```js
  function showSkeleton(container, opts) {
    // The caller picks a tag compatible with the container (e.g. 'li' for <ul>/<ol>, 'div' otherwise).
    if (!container) return;
    opts = opts || {};
    const rows       = opts.rows || 3;
    const height     = opts.height || 44;
    const tag        = opts.tag || 'div';
    const extraClass = opts.extraClass ? (' ' + opts.extraClass) : '';
    let html = '';
    for (let i = 0; i < rows; i++) {
      html += '<' + tag + ' class="skeleton' + extraClass + '" style="height:' + height + 'px;margin-bottom:8px;"></' + tag + '>';
    }
    container.innerHTML = html;

    // A skeleton is never a final state: if it's still there past the delay,
    // the response is never coming (call never sent, broken handler, silent
    // server). Without this guard the user sees an endless animation and the
    // app says nothing — this was the Dashboard outage.
    if (container.__skeletonWatchdog) clearTimeout(container.__skeletonWatchdog);
    container.__skeletonWatchdog = setTimeout(() => {
      container.__skeletonWatchdog = null;
      if (container.innerHTML.indexOf('class="skeleton') === -1) return;
      container.innerHTML =
        '<div class="load-stalled">' +
        '<span>⏱️ Chargement interrompu — cette carte n\'a pas reçu de réponse.</span>' +
        '<button type="button" class="primary small" onclick="location.reload()">↻ Recharger la page</button>' +
        '</div>';
    }, CONFIG.SKELETON_TIMEOUT_MS);
  }
```

- [ ] **Step 6: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 139 / fail 0`.

- [ ] **Step 7: Vérification manuelle dans le harness local**

Dans `tests/frontend/serve.js`, ajouter temporairement, en tête de `handleCall`, `if (parsed.fn === 'apiGetPlayerRecords') return;` pour simuler un appel sans réponse, recharger la page, attendre 15 s. Attendu : la carte Records affiche « ⏱️ Chargement interrompu » avec un bouton de rechargement, sur les deux thèmes. **Retirer ensuite la ligne temporaire** et confirmer qu'elle n'est plus présente :

```bash
grep -n "apiGetPlayerRecords" tests/frontend/serve.js
```

Attendu : aucune sortie.

- [ ] **Step 8: Commit**

```bash
git add Index.html && git add tests/frontend-guards.test.js && git commit -m "fix(client): turn a stalled skeleton into a readable message instead of an endless shimmer"
```

---

### Task 4: Une erreur non interceptée devient visible dans l'app

Troisième filet, pour ce qui échappe aux deux premiers : une exception hors de tout gestionnaire `callServer` (branchement d'écouteur, minuteur, code de démarrage). Aujourd'hui elle ne laisse aucune trace visible — ce qui a rendu la panne actuelle indiagnosticable à distance.

**Files:**
- Modify: `Index.html` — bloc CSS, à la suite de `.load-stalled button { ... }`
- Modify: `Index.html` — juste après la balise `<body ...>` (localisée à l'étape 1), insertion du conteneur de bannière
- Modify: `Index.html` — écouteurs globaux, insérés juste avant `function showSkeleton(`

**Interfaces:**
- Consumes: rien.
- Produces: élément `#globalErrorBanner`, fonction `showGlobalError(message)`. Aucune tâche suivante ne la consomme.

- [ ] **Step 1: Localiser la balise `<body`**

```bash
grep -n "<body" Index.html
```

Noter le numéro de ligne exact : l'étape 3 insère juste après.

- [ ] **Step 2: Ajouter la règle CSS**

Dans `Index.html`, juste après la règle `.load-stalled button { ... }` ajoutée en Task 3, insérer :

```css
    .global-error-banner {
      display: none;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      padding: 10px 14px;
      background: var(--card);
      border-top: 1.5px solid var(--error);
      color: var(--text);
      font-size: 0.82rem;
      line-height: 1.4;
      max-height: 30vh;
      overflow-y: auto;
    }
    .global-error-banner .geb-close {
      float: right;
      min-height: var(--tap-min);
      min-width: var(--tap-min);
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.1rem;
      cursor: pointer;
    }
```

- [ ] **Step 3: Ajouter le markup**

Dans `Index.html`, juste après la balise `<body ...>` repérée à l'étape 1, insérer :

```html
  <div id="globalErrorBanner" class="global-error-banner" role="alert" aria-live="assertive">
    <button type="button" class="geb-close" id="globalErrorClose" title="Masquer">✕</button>
    <strong>⚠️ Erreur technique</strong>
    <div id="globalErrorText"></div>
  </div>
```

- [ ] **Step 4: Brancher les écouteurs globaux**

Dans `Index.html`, juste avant `function showSkeleton(container, opts) {`, insérer :

```js
  // An exception outside any callServer handler (event listener, timer, boot
  // code) left no visible trace: the outage then looked like a frozen screen,
  // impossible to diagnose remotely since the code runs inside an
  // inaccessible Google iframe. The banner makes the message readable in place.
  function showGlobalError(message) {
    const banner = document.getElementById('globalErrorBanner');
    const text   = document.getElementById('globalErrorText');
    if (!banner || !text) return;
    const line = document.createElement('div');
    line.textContent = message;
    text.appendChild(line);
    banner.style.display = 'block';
  }

  window.addEventListener('error', e => {
    showGlobalError((e.message || 'Erreur inconnue') + ' — ' + (e.filename || '?') + ':' + (e.lineno || 0));
  });

  window.addEventListener('unhandledrejection', e => {
    const reason = e.reason;
    showGlobalError('Promesse rejetée : ' + ((reason && reason.message) || String(reason)));
  });
```

Puis, dans `bindButtons()` (localisée par `grep -n "function bindButtons" Index.html`), ajouter à la suite de `bindChartRetry();` :

```js
    const gebClose = document.getElementById('globalErrorClose');
    if (gebClose) gebClose.onclick = () => { document.getElementById('globalErrorBanner').style.display = 'none'; };
```

- [ ] **Step 5: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, `pass 139 / fail 0`.

- [ ] **Step 6: Vérification manuelle dans le harness local**

Recharger `http://127.0.0.1:8137/`, puis dans la console : `setTimeout(() => { throw new Error('test bannière'); }, 0)`.
Attendu : la bannière apparaît en bas avec `test bannière — …`, lisible sur les deux thèmes, et le ✕ la referme. Vérifier aussi qu'au chargement normal **aucune** bannière n'apparaît (sinon : c'est une vraie erreur, la consigner, elle appartient à la Task 6).

- [ ] **Step 7: Commit**

```bash
git add Index.html && git commit -m "feat(client): surface uncaught errors in an in-app banner"
```

---

### Task 5: Terminer le correctif de la v3.7.0 dans `renderTrendChart`

Les deux défauts confirmés par lecture (voir « Contexte du diagnostic »). Indépendants du chargement infini : à livrer même si la Task 1 pointe ailleurs.

**Files:**
- Modify: `Index.html:10676-10684` (branche « aucune donnée » de `renderTrendChart`)
- Modify: `Index.html` — chemin de succès de `renderTrendChart`, juste après cette branche

**Interfaces:**
- Consumes: `showChartState(state, message)` (`Index.html:10272`, livrée en v3.7.0).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Confirmer que c'est bien la dernière occurrence**

```bash
grep -n "fillStyle = 'var(" Index.html
```

Attendu : **une seule ligne**, `10679`. Si plusieurs apparaissent, appliquer la même transformation à chacune et l'indiquer dans le rapport.

- [ ] **Step 2: Remplacer la branche « aucune donnée » et poser l'état nominal**

Dans `Index.html`, remplacer les lignes 10676-10684 :

```js
    if (!trendData || !trendData.labels || !trendData.labels.length) {
      const ctx = document.getElementById('mainChart').getContext('2d');
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fillStyle = 'var(--text-muted)';
      ctx.textAlign = 'center';
      ctx.font = '14px sans-serif';
      ctx.fillText('Aucune donnée temporelle pour cette sélection.', ctx.canvas.width / 2, 40);
      return;
    }
```

par :

```js
    if (!trendData || !trendData.labels || !trendData.labels.length) {
      const ctx = document.getElementById('mainChart').getContext('2d');
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      showChartState('empty', 'Aucune donnée temporelle pour cette sélection. Élargissez la période ou retirez des filtres.');
      return;
    }

    showChartState('hidden');
```

Le `showChartState('hidden')` est indispensable : sans lui, un panneau « vide » ou « erreur » affiché juste avant reste visible et le conteneur du graphique reste masqué, exactement comme dans `renderChart` (`Index.html:10319`).

- [ ] **Step 3: Vérifier**

```bash
npm run verify && grep -c "showChartState('hidden')" Index.html
```

Attendu : syntaxe OK, `pass 139 / fail 0`, et le compte vaut `2` (un dans `renderChart`, un dans `renderTrendChart`).

- [ ] **Step 4: Vérification manuelle dans le harness local**

Sur `http://127.0.0.1:8137/`, onglet Dashboard :
1. Choisir le type **📈 Courbes**, puis une période sans aucune entrée (deux dates futures) → attendu : le panneau 📊 avec un message **lisible**, sur les deux thèmes.
2. Revenir à « tout » → attendu : les courbes s'affichent et le panneau disparaît.
3. Enchaîner Empilé → période vide → Courbes → période pleine → attendu : aucun panneau résiduel par-dessus le graphique.

- [ ] **Step 5: Commit**

```bash
git add Index.html && git commit -m "fix(dashboard): finish the chart-state migration in renderTrendChart"
```

---

### Task 6: Corriger la cause racine et isoler le démarrage des données

Cette tâche a deux moitiés : le correctif précis dicté par le relevé de la Task 1, et un durcissement structurel valable quelle qu'en soit la conclusion.

**Files:**
- Modify: `Index.html` — le ou les sites désignés par le relevé de la Task 1
- Modify: `Index.html:17469-17476` (queue de la fonction d'initialisation)

**Interfaces:**
- Consumes: le relevé écrit produit par la Task 1, Step 8.
- Produces: `bootDataLoad()` — charge identité, entités, branding et statistiques du Dashboard, appelée indépendamment du branchement des écouteurs.

- [ ] **Step 1: Relire le relevé de la Task 1 et écrire l'hypothèse**

Écrire noir sur blanc, dans le rapport de tâche : « la cause racine est *X* à `Index.html:<ligne>`, parce que *Y* ». Une seule hypothèse. Ne pas coder avant de l'avoir écrite.

Les trois branches attendues, avec le correctif de chacune :

| Ce que dit le relevé | Correctif |
|---|---|
| Exception dans un gestionnaire de succès (`successHandler(apiX)` dans `window.__frontErrors`) | Corriger la ligne fautive à sa source, dans le rendu concerné — pas dans `callServer`, qui ne fait désormais que la signaler |
| Aucune trace de `successHandler`, et `window.__frontCalls` ne contient **pas** les cinq noms `apiGetPlayerRecords` / `apiGetTrends` / `apiGetActiveWeekday` / `apiGetTopPlayerCategoryPairs` / `apiGetMentionStats` | Une exception antérieure empêche `Index.html:17475` (`setTimeout(refreshDashboardStats, 150)`) d'être atteint : corriger cette exception, puis appliquer le durcissement des étapes 3 à 5 |
| `window.__frontCalls` contient les cinq noms et aucune erreur n'est signalée, mais les squelettes restent | La panne dépend des données réelles : reprendre la Task 1, Step 9 (feuilles issues d'un export de production) avant de conclure |

- [ ] **Step 2: Écrire le test de non-régression de la cause identifiée**

Ajouter à `tests/frontend-guards.test.js` un test qui échoue sur le code actuel et passe après correctif, sur le modèle des tests de la Task 2 : extraire la fonction fautive avec `extractFunction`, l'exécuter dans un contexte VM avec les dépendances minimales moquées, et affirmer qu'elle ne lève plus sur l'entrée qui la faisait casser. Le nom du test doit citer la fonction concernée.

Si la cause n'est pas isolable en fonction pure (par exemple une exception au branchement d'un écouteur sur un élément absent), remplacer ce test par une assertion statique sur `Index.html` — par exemple, que chaque `document.getElementById('<id>').addEventListener` du bloc d'initialisation cible un `id` réellement présent dans le markup :

```js
test('every init listener targets an id that exists in the markup', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  const missing = [];
  for (const m of html.matchAll(/document\.getElementById\('([^']+)'\)\.addEventListener/g)) {
    if (!ids.has(m[1])) missing.push(m[1]);
  }
  assert.deepStrictEqual(missing, [], 'ids ciblés sans élément correspondant : ' + missing.join(', '));
});
```

Ce test est utile en soi : `document.getElementById('x').addEventListener(...)` sur un `id` absent lève `TypeError` et interrompt tout le reste du démarrage — c'est précisément le mécanisme de la deuxième branche du tableau ci-dessus.

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- --test-name-pattern="<nom du test écrit à l'étape 2>"
```

Attendu : échec, avec le message d'assertion qui nomme la cause.

- [ ] **Step 4: Appliquer le correctif de la cause racine**

Corriger la ligne identifiée. **Un seul changement**, pas d'améliorations opportunistes.

- [ ] **Step 5: Isoler le chargement des données du branchement des écouteurs**

Durcissement à appliquer dans tous les cas. Dans `Index.html`, remplacer les lignes 17469-17476 :

```js
    renderWhoAmI();
    loadEntities();
    loadAppBranding();

    // Differ de 150ms le chargement des statistiques secondaires du Dashboard
    // pour éviter d'inonder Google Apps Script de requêtes parallèles au démarrage
    setTimeout(refreshDashboardStats, 150);
  };
```

par :

```js
    bootDataLoad();
  };

  // Data loading used to be the last instruction of a ~1,800-line init
  // function: any exception in an earlier event-listener wire-up left the
  // Dashboard in an endless skeleton. Each step is isolated so that one
  // breaking doesn't take the others down with it.
  function bootDataLoad() {
    const steps = [
      ['identité',    renderWhoAmI],
      ['entités',     loadEntities],
      ['branding',    loadAppBranding],
      // Delay the Dashboard's secondary stats by 150ms to avoid flooding
      // Google Apps Script with parallel requests at startup.
      ['statistiques', () => setTimeout(refreshDashboardStats, 150)]
    ];
    steps.forEach(([label, step]) => {
      try {
        step();
      } catch (err) {
        console.error('bootDataLoad/' + label, err);
        showGlobalError('Échec du démarrage (' + label + ') : ' + ((err && err.message) || err));
      }
    });
  }
```

- [ ] **Step 6: Vérifier**

```bash
npm run verify
```

Attendu : syntaxe OK, tous les tests au vert, y compris celui de l'étape 2.

- [ ] **Step 7: Vérification manuelle dans le harness local**

Recharger `http://127.0.0.1:8137/` et relever à nouveau l'état des squelettes avec le bloc de la Task 1, Step 8.
Attendu : `errors` vide, `chartSkeleton` masqué, et `records` / `pairs` / `mentions` à `false` — chaque carte porte du contenu réel.

- [ ] **Step 8: Commit**

```bash
git add Index.html && git add tests/frontend-guards.test.js && git commit -m "fix(dashboard): fix the root cause of the endless skeletons and isolate boot data loading"
```

---

### Task 7: Changelog, vérification finale et push unique

Seule tâche qui touche au dépôt distant. Le push déclenche `deploy-gas.yml`, qui exécute les tests sur le code nettoyé puis redéploie **les deux cibles**.

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

Insérer dans `CHANGELOG.md`, juste après la ligne `Format basé sur [Keep a Changelog](https://keepachangelog.com).` et avant `## [v3.7.0]` :

```markdown
## [v3.8.0] - AAAA-MM-JJ

### Corrigé
**Humanisé** : Le Dashboard restait bloqué sur des animations de chargement sans fin (graphique principal et bandeau de stats rapides). La cause a été trouvée par mesure directe — en rejouant les vraies données de production contre le code local — puis corrigée : chaque carte affiche maintenant son contenu normalement.
**Technique** : `Index.html` — `applyRowCategoryVisuals()` appelait `refreshBaremeForTop()`, qui n'existe que dans la fermeture (closure) de `addEntryRow()` et lui est donc inaccessible : `ReferenceError` systématique dès qu'un joueur et un Top réels existent, interrompant `_paintEntitiesUI()` avant `applyFilters()`/`loadQuickStats()`. L'appel est retiré de `applyRowCategoryVisuals()` et déplacé, gardé par `if (!isAltRow)`, aux deux points d'appel réels (dans `addEntryRow()`, où `refreshBaremeForTop` est réellement visible). Le chargement des données passe en outre par `bootDataLoad()`, dont chaque étape (`renderWhoAmI`, `loadEntities`, `loadAppBranding`, `refreshDashboardStats`) est isolée par son propre `try/catch`, au lieu d'être la suite non protégée d'une initialisation de ~1 800 lignes.

**Humanisé** : Quand une carte n'arrive pas à s'afficher, l'application le dit désormais au lieu de laisser une animation tourner indéfiniment.
**Technique** : `Index.html` — `callServer()` entoure `onSuccess` d'un `try/catch` (une exception y était avalée par `google.script.run`, sans toast ni état d'erreur), et `showSkeleton()` arme un chien de garde `CONFIG.SKELETON_TIMEOUT_MS` qui remplace un squelette figé par un message et un bouton de rechargement.

**Humanisé** : Sur le graphique en courbes, le message « aucune donnée » est enfin lisible, et un ancien message ne reste plus affiché par-dessus le graphique.
**Technique** : `Index.html` — `renderTrendChart()` utilise `showChartState('empty', …)` au lieu de peindre du texte dans le canevas avec une variable CSS (dernière occurrence du défaut corrigé en v3.7.0 pour `renderChart()`), et appelle `showChartState('hidden')` sur son chemin de succès.

### Ajouté
**Humanisé** : Une erreur technique s'affiche maintenant dans un bandeau au bas de la page au lieu de rester invisible.
**Technique** : `Index.html` — `#globalErrorBanner`, `showGlobalError(message)` et écouteurs `error` / `unhandledrejection`.

**Humanisé** : L'interface peut désormais être testée sur un ordinateur, hors de Google, ce qui permet de voir les erreurs qui étaient jusqu'ici invisibles à distance.
**Technique** : `tests/frontend/` (`serve.js`, `stub.js`, `fixtures.js`) — serveur `node:http` servant `Index.html` avec un `google.script.run` de substitution branché sur le vrai `Code.gs` via `tests/harness.js` ; script npm `serve:front`. `tests/frontend-guards.test.js` couvre les trois garde-fous.
```

- [ ] **Step 3: Vérifier l'équilibre des deux voix**

```bash
npm run verify && grep -c "Humanisé" CHANGELOG.md && grep -c "Technique" CHANGELOG.md
```

Attendu : les deux compteurs sont égaux.

- [ ] **Step 4: Commit du changelog**

```bash
git -c core.autocrlf=false add CHANGELOG.md && git commit -m "docs(changelog): log v3.8.0"
```

- [ ] **Step 5: Simulation complète du déploiement**

```bash
CI=1 node .github/scripts/strip-comments.js && npm run verify; git checkout -- Index.html Code.gs AutoPoints.gs; git status --porcelain
```

Attendu : les trois lignes `X -> Y chars`, syntaxe OK, tous les tests au vert **sur le code nettoyé**, puis un dépôt restauré.

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

**Ne pas répéter en boucle** (`context.md` §8). Le run doit passer par *Strip comments* → *Verify the stripped code* → *Push and redeploy all targets*.

- [ ] **Step 10: Vérification fonctionnelle sur les deux instances**

Invoquer `/verify` sur les deux liens short.io. Sur le Dashboard de chacune :

- Les quatre cartes du bas (Records, Tendances, Jour le plus actif, Duo le plus fréquent) et la card Commentaires portent du contenu.
- Aucun squelette ne subsiste après quelques secondes.
- Aucun bandeau ⚠️ en bas de page. **S'il en apparaît un, relever son texte** : c'est un diagnostic exact, à traiter dans un plan suivant.

Puis relever la mesure du cache restée en suspens du plan précédent (`2026-08-10-dashboard-incassable.md`, Task 4, Step 7) : éditeur Apps Script → *Exécutions* → exécution la plus récente → chercher des lignes `cache skip`.

---

## Ce que ce plan ne traite pas, et pourquoi

| Point | Statut | Raison |
|---|---|---|
| **Accès anonyme** — `appsscript.json` déclare `ANYONE_ANONYMOUS` et `requireAuthor()` ne vérifie qu'une chaîne non vide : toute écriture est appelable sans authentification par qui connaît l'URL | **Décision utilisateur requise**, reportée du plan précédent | Basculer sur `ANYONE` + `Session.getActiveUser().getEmail()` oblige chaque joueur à un compte Google : changement d'usage pour le groupe, à trancher avant d'écrire le code |
| **Découpage du cache serveur au-delà de 95 Ko** | **Suspendu à la mesure** (Task 7, Step 10) | Le traçage `_logCacheSkip` livré en v3.7.0 n'a pas encore été relevé en production ; corriger avant de mesurer serait de la spéculation |
| **Chien de garde sur `skeletonizeText`** (bandeaux shimmer des Quick Stats) | **Volontairement hors périmètre** | Ces bandeaux recouvrent un texte déjà présent : ils dégradent la lisibilité mais ne masquent aucun contenu. À traiter si le relevé de la Task 1 les met en cause |
| **Renommage de la famille `isAlt`** (deux sens incompatibles) | **Reporté** | Vraie dette de lisibilité, ~10 sites, indépendante de cette panne |
| **Génération automatique de l'`epilogue` du harness** | **Reporté** | Outillage sans impact utilisateur. La Task 1, Step 1 complète la liste à la main si un nom manque |
| **Tests de rendu automatisés dans la CI** (navigateur sans tête) | **Reporté** | La Task 1 livre le harness, pas son automatisation : ajouter un navigateur à `deploy-gas.yml` alourdirait chaque déploiement. À arbitrer une fois le harness utilisé quelques fois |
