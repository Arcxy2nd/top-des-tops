# Audit Gemini 3.1 Pro — corrections retenues (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les deux seuls défauts réels et non arbitrés de l'audit Gemini 3.1 Pro — le cache serveur qui mesure sa charge en caractères JS au lieu d'octets UTF-8 (donc se désactive ou plante silencieusement dès que les emojis pèsent), et l'absence de garde-fou automatique contre les injections HTML via `innerHTML` dans `Index.html`.

**Architecture :** Deux chantiers indépendants. (1) Backend : introduire une paire d'aides partagées `_cachePutChunked()` / `_cacheGetChunked()` adossées à un `_byteLength()` exact, puis y router **les 14 sites de cache** de `Code.gs` — les 12 qui abandonnaient silencieusement au-delà d'un seuil et les 2 qui découpaient déjà à la main en caractères. Le découpage devient l'unique stratégie : plus aucun payload n'est jamais abandonné. (2) Frontend : un test statique « à cliquet » (`ratchet`) qui inventorie chaque affectation `innerHTML` de `Index.html`, exige que toute donnée interpolée passe par `escapeHtml()`, et fige l'état audité dans une liste d'exceptions justifiées — tout nouveau site non sûr fait échouer `npm run verify`.

**Tech Stack :** Google Apps Script (`Code.gs`), HTML/CSS/JS monofichier (`Index.html`), tests Node 22 (`node --test`) sur harness VM (`tests/harness.js`).

## Global Constraints

- **Aucun build, aucune dépendance npm à l'exécution.** `Code.gs` et `Index.html` restent monolithiques. Toute suggestion de découpage en `src/` + script d'injection est **rejetée** (voir « Hors périmètre »).
- **Pas de `class` ES6.** Objets littéraux, IIFE, ou fonctions top-level — cohérent avec le reste du codebase.
- **Code en anglais** (identifiants, commentaires dans le code). Explications hors code en français.
- **Commentaires** uniquement pour le *pourquoi* non évident, jamais pour décrire ce que le code fait.
- **Aucune constante hardcodée dans la logique** : les valeurs configurables vont dans le bloc `CONFIG` en tête de `Code.gs`.
- **Ligne 1 non garantie** : `History`, `Players`, `Categories` n'ont pas de ligne d'en-tête dans les instances réelles. Jamais de `data.slice(1)`, `getRange(2, …)`, `rowIndex = i + 2`. Passer par `_readDataRows()` / `_firstDataRow()` / `_headerOffsetFromValues()`. *(Aucune tâche de ce plan ne touche à la lecture de feuilles, mais la règle tient si un refactor y mène.)*
- **Interdiction absolue de toucher aux données réelles** (« Site tops », « Tops RDS », leurs Google Sheets). Toute vérification se fait contre le harness local (`npm run verify`) ou `npm run serve:front`.
- **TDD strict** : test rouge d'abord, exécuté et constaté rouge, puis implémentation minimale, puis vert.
- **`CHANGELOG.md` mis à jour à chaque tâche**, format Keep a Changelog, **deux voix obligatoires** (`**Humanisé**` sans jargon + `**Technique**`). Sections valides : `Ajouté` · `Modifié` · `Corrigé` · `Supprimé`.
- **Commit ET push à chaque tâche.** Le push sur `main` déclenche `.github/workflows/deploy-gas.yml` qui déploie les **deux** cibles. Avant chaque push : `gh auth status` et bascule sur `Arcxy2nd` si nécessaire (`gh auth switch --user Arcxy2nd`) — le switch ne tient pas entre deux pushs.
- **Commits, README, releases en anglais.** La conversation et le changelog restent en français.
- **Piège shell (machine locale)** : les heredocs Git Bash mangent un niveau d'antislash — `\\(` devient `\(`. Ne jamais écrire de `new RegExp("…")` ni de littéral regex via heredoc ; passer par l'outil d'édition de fichier.
- **Piège `vm` (tests)** : `assert.deepStrictEqual` et `instanceof` échouent sur des objets/dates/tableaux construits dans un sandbox `vm` différent du contexte Node. Comparer par duck-typing (`Object.prototype.toString.call(x)`) ou via `JSON.stringify`.
- **Les numéros de ligne de ce plan valent au moment de sa rédaction.** Ils se décalent dès la première édition. À chaque tâche, **re-grep pour retrouver les sites** avec la commande fournie — ne jamais éditer à l'aveugle par numéro de ligne.

---

## Hors périmètre — points de l'audit explicitement rejetés ou déjà arbitrés

L'exécutant **ne doit pas** traiter ces points, ni les rouvrir. Ils ont été vérifiés dans le code et écartés :

| Point de l'audit | Verdict | Raison |
|---|---|---|
| Hacher les mots de passe (`SettingsService.verifyIdentity`) | **Arbitré — ne pas toucher** | Le hachage a été livré en v3.20.7 puis **annulé volontairement en v3.20.12** à la demande du propriétaire. Les mots de passe restent en clair dans la feuille `Players` par décision produit. |
| `getEntities()` : retirer `sheet.getLastRow()` de la clé de cache | **Rejeté** | Volontaire et documenté (`Code.gs`, commentaire au-dessus de la construction de `key`) : le compteur de version ne bouge que sur `addEntity()`/`deleteEntity()`, pas sur une édition directe dans le Sheet. Retirer `getLastRow()` réintroduirait un bug d'entité fantôme pendant tout le TTL. Même schéma volontaire pour `BaremeService` et `PhrasesService`. |
| Fuseaux horaires de `_parseLocalDateWithNow` | **Rejeté — mécanisme faux** | La fonction ne dépend que du fuseau du **serveur** GAS et de la chaîne `YYYY-MM-DD` envoyée par le client. Le fuseau du joueur n'entre jamais dans le calcul. Le décalage décrit ne peut pas se produire. |
| `Object.assign({}, current, patch)` dans `AutoPoints.gs` (shallow copy) | **Rejeté — théorique** | `current` est reparsé depuis la feuille à chaque appel de `updateRule()`. `merged.daysOfWeek` n'est que **lu** (`.join(',')`) puis réécrit en primitive dans le Sheet. Aucun chemin de mutation réel. |
| `void el.offsetWidth` (reflow synchrone forcé) | **Rejeté** | 12 occurrences, c'est la technique standard pour relancer une animation CSS. Pas un oubli. |
| « Abus de `backdrop-filter: blur` » | **Rejeté — chiffre faux** | 5 occurrences dans tout le fichier. |
| « Fuite mémoire » des `addEventListener` non détachés | **Rejeté — déjà mitigé** | Les nœuds et leurs écouteurs sont collectés par le GC dès que le DOM est remplacé. Et le seul rendu périodique (`renderChatMessages` via `pollChat`) est **déjà** protégé par une garde `changed` qui empêche tout redessin quand la liste de messages n'a pas bougé. |
| Découper le frontend en `src/` + script Node d'injection | **Rejeté — viole une règle projet** | `context.md` §2 : « Pas de build, pas de framework, aucune dépendance npm à l'exécution ». Le constat de taille est exact (884 Ko, 18 672 lignes) mais la remédiation proposée est interdite. À laisser au backlog `NEXT_SESSION.md` comme question ouverte, sans l'implémenter. |

---

## Structure des fichiers

| Fichier | Responsabilité | Action |
|---|---|---|
| `Code.gs` | Backend GAS. Reçoit 3 nouvelles fonctions top-level (`_byteLength`, `_cachePutChunked`, `_cacheGetChunked`) placées avec les autres aides de cache, puis 14 sites migrés dessus. | Modifier |
| `tests/harness.js` | Harness VM. Doit exporter les 3 nouvelles aides pour qu'elles soient testables. | Modifier (`EXPORTED_GLOBALS`) |
| `tests/cache-bytes.test.js` | Tests unitaires des aides de cache, sur un faux `CacheService` qui applique la vraie limite en **octets**. | Créer |
| `tests/innerhtml-audit.test.js` | Test statique à cliquet sur `Index.html` : inventorie les affectations `innerHTML`, exige `escapeHtml()` sur toute donnée interpolée, fige les exceptions auditées. | Créer |
| `Index.html` | Frontend. Reçoit les corrections d'échappement identifiées par le cliquet. | Modifier |
| `CHANGELOG.md` | Une entrée versionnée par tâche, deux voix. | Modifier |
| `NEXT_SESSION.md` | État courant, dernière session, écarts, backlog. | Modifier |

---

### Task 1 : Aides de cache mesurées en octets

**Files:**
- Modify: `Code.gs` — insérer les 3 fonctions juste **après** `_logCacheSkip()` (bloc « CONFIG / SHARED »), avant la section `─── HEADER ROW DETECTION ───`
- Modify: `tests/harness.js` — constante `EXPORTED_GLOBALS`
- Test: `tests/cache-bytes.test.js` (créer)

**Interfaces:**
- Consumes: `CONFIG.CACHE_MAX_BYTES` (95000), `CONFIG.CACHE_TTL_SECONDS` (600), `_logCacheSkip(key, size)` — tous déjà présents en tête de `Code.gs`.
- Produces, pour les tâches 2 et 3 :
  - `_byteLength(str: string) -> number` — poids UTF-8 exact.
  - `_cachePutChunked(cache: Cache, key: string, serial: string, ttl: number) -> void` — écrit sous `key` si le payload tient en une entrée, sinon en morceaux `key + '_0'` … `key + '_N-1'` plus un marqueur `key + '_chunks'`. Ne lève jamais.
  - `_cacheGetChunked(cache: Cache, key: string) -> string | null` — relit l'une ou l'autre forme, renvoie `null` si absent, incomplet ou corrompu.

---

- [ ] **Step 1 : Écrire le test rouge**

Créer `tests/cache-bytes.test.js` :

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness');

/**
 * Faux CacheService qui applique la vraie contrainte d'Apps Script : la limite
 * porte sur des OCTETS UTF-8, pas sur des caractères JS. Le stub par defaut du
 * harness accepte tout, ce qui laissait passer le bug que ce test verrouille.
 */
function byteLimitedCache(limitBytes) {
  const store = {};
  return {
    store,
    get: k => (k in store ? store[k] : null),
    put(k, v) {
      const bytes = Buffer.byteLength(String(v), 'utf8');
      if (bytes > limitBytes) throw new Error('Argument too large: value (' + bytes + ' bytes)');
      store[k] = String(v);
    }
  };
}

function loadWithCache(cache) {
  return loadGas({ CacheService: { getScriptCache: () => cache } });
}

test('_byteLength compte les octets UTF-8, pas les caracteres JS', () => {
  const gas = loadWithCache(byteLimitedCache(95000));
  assert.strictEqual(gas._byteLength('abc'), 3);
  assert.strictEqual(gas._byteLength('é'), 2);          // 1 caractere, 2 octets
  assert.strictEqual(gas._byteLength('€'), 3);          // 1 caractere, 3 octets
  assert.strictEqual(gas._byteLength('🏆'), 4);         // 2 caracteres JS, 4 octets
  assert.strictEqual(gas._byteLength(''), 0);
  // Le cas qui casse en production : un payload d'emojis sous la limite en
  // caracteres mais au-dessus en octets.
  const trophies = '🏆'.repeat(30000);                  // 60000 caracteres, 120000 octets
  assert.strictEqual(trophies.length, 60000);
  assert.strictEqual(gas._byteLength(trophies), 120000);
});

test('_cachePutChunked ecrit en une entree quand le payload tient', () => {
  const cache = byteLimitedCache(95000);
  const gas = loadWithCache(cache);
  gas._cachePutChunked(cache, 'k', 'petit payload', 600);
  assert.strictEqual(cache.store['k'], 'petit payload');
  assert.strictEqual(cache.store['k_chunks'], undefined);
  assert.strictEqual(gas._cacheGetChunked(cache, 'k'), 'petit payload');
});

test('_cachePutChunked decoupe en octets et se relit a l identique', () => {
  const cache = byteLimitedCache(95000);
  const gas = loadWithCache(cache);
  const payload = JSON.stringify({ rows: Array.from({ length: 12000 }, (_, i) => ({ i, e: '🏆é€' })) });
  assert.ok(gas._byteLength(payload) > 95000, 'le fixture doit depasser la limite en octets');

  gas._cachePutChunked(cache, 'big', payload, 600);

  const chunkCount = parseInt(cache.store['big_chunks'], 10);
  assert.ok(chunkCount >= 2, 'le payload doit avoir ete decoupe');
  for (let i = 0; i < chunkCount; i++) {
    const bytes = Buffer.byteLength(cache.store['big_' + i], 'utf8');
    assert.ok(bytes <= 95000, 'chunk ' + i + ' pese ' + bytes + ' octets');
  }
  assert.strictEqual(gas._cacheGetChunked(cache, 'big'), payload);
  assert.deepStrictEqual(JSON.parse(gas._cacheGetChunked(cache, 'big')), JSON.parse(payload));
});

test('_cachePutChunked ne coupe jamais une paire de substituts', () => {
  const cache = byteLimitedCache(64);
  const gas = loadWithCache(cache);
  const payload = '🏆'.repeat(200);                     // 800 octets, decoupe forcee
  gas._cachePutChunked(cache, 'emo', payload, 600);
  const chunkCount = parseInt(cache.store['emo_chunks'], 10);
  for (let i = 0; i < chunkCount; i++) {
    // Un demi-substitut isole se serait transforme en U+FFFD au reassemblage.
    assert.ok(!/[\uD800-\uDBFF]$/.test(cache.store['emo_' + i]), 'chunk ' + i + ' finit sur un demi-substitut');
    assert.ok(!/^[\uDC00-\uDFFF]/.test(cache.store['emo_' + i]), 'chunk ' + i + ' commence sur un demi-substitut');
  }
  assert.strictEqual(gas._cacheGetChunked(cache, 'emo'), payload);
});

test('_cacheGetChunked renvoie null quand un morceau a expire', () => {
  const cache = byteLimitedCache(64);
  const gas = loadWithCache(cache);
  gas._cachePutChunked(cache, 'partial', '🏆'.repeat(200), 600);
  delete cache.store['partial_1'];
  assert.strictEqual(gas._cacheGetChunked(cache, 'partial'), null);
});

test('_cacheGetChunked renvoie null sur une cle absente', () => {
  const cache = byteLimitedCache(95000);
  const gas = loadWithCache(cache);
  assert.strictEqual(gas._cacheGetChunked(cache, 'jamais-ecrite'), null);
});

test('_cachePutChunked ne propage jamais une erreur du cache', () => {
  const gas = loadWithCache(byteLimitedCache(95000));
  const exploding = { get: () => null, put() { throw new Error('quota exceeded'); } };
  assert.doesNotThrow(() => gas._cachePutChunked(exploding, 'k', 'valeur', 600));
});
```

- [ ] **Step 2 : Exporter les nouvelles aides depuis le harness**

Dans `tests/harness.js`, ajouter les 3 noms à la fin de la constante `EXPORTED_GLOBALS` (elles ne commencent pas par `api`, donc l'auto-détection de `buildEpilogue` ne les trouve pas) :

```js
const EXPORTED_GLOBALS = [
  'CONFIG', 'Logger', 'ConfigService', 'AuditService', 'SettingsService', 'StorageService',
  'NotesService', 'AnalyticsService', 'BaremeService', 'PhrasesService', 'SettingsSheetService',
  'AltSettingsService', 'AltStorageService', 'AutoPointsService', 'ChatService',
  'withLock', 'NAV_PAGES', 'doGet', 'ScriptApp', 'requireAuthor',
  '_byteLength', '_cachePutChunked', '_cacheGetChunked'
];
```

- [ ] **Step 3 : Lancer le test et constater l'échec**

```bash
node --test tests/cache-bytes.test.js
```

Attendu : ÉCHEC. Chaque test échoue avec `TypeError: gas._byteLength is not a function` (et équivalents pour les deux autres), parce que les fonctions n'existent pas encore.

- [ ] **Step 4 : Implémenter les 3 aides**

Dans `Code.gs`, insérer juste **après** la fermeture de `_logCacheSkip()` et **avant** le commentaire `// ─── HEADER ROW DETECTION ───` :

```js
/**
 * Exact UTF-8 weight of a string. CacheService caps an entry by BYTES, while
 * `str.length` counts JS characters: one emoji is 2 characters but 4 bytes, so a
 * character-based guard silently under-measures a payload full of Top emojis and
 * lets an oversized entry reach the service, which then rejects the whole put.
 */
function _byteLength(str) {
  const s = String(str);
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF) { bytes += 4; i++; } // surrogate pair
    else bytes += 3;
  }
  return bytes;
}

/**
 * Writes `serial` under `key`, splitting it across `key_0`…`key_N-1` plus a
 * `key_chunks` marker when it exceeds one entry. Splitting instead of dropping
 * matters because the alternative — the old `if (size <= MAX)` guard — turned the
 * whole cross-request cache off in production while the two-row test fixtures
 * stayed comfortably under the limit and green.
 *
 * The marker is written LAST: a partially written set must never advertise itself
 * as complete to a concurrent reader.
 */
function _cachePutChunked(cache, key, serial, ttl) {
  const max = CONFIG.CACHE_MAX_BYTES;
  const total = _byteLength(serial);
  try {
    if (total <= max) { cache.put(key, serial, ttl); return; }
    const chunks = [];
    let start = 0, bytes = 0;
    for (let i = 0; i < serial.length; i++) {
      const code = serial.charCodeAt(i);
      const isHigh = code >= 0xD800 && code <= 0xDBFF;
      const width = isHigh ? 4 : (code < 0x80 ? 1 : (code < 0x800 ? 2 : 3));
      if (bytes + width > max) { chunks.push(serial.slice(start, i)); start = i; bytes = 0; }
      bytes += width;
      if (isHigh) i++; // the low surrogate always travels with its high half
    }
    chunks.push(serial.slice(start));
    for (let i = 0; i < chunks.length; i++) cache.put(key + '_' + i, chunks[i], ttl);
    cache.put(key + '_chunks', String(chunks.length), ttl);
  } catch (e) {
    _logCacheSkip(key, total);
  }
}

/**
 * Reads back whatever `_cachePutChunked` wrote. Returns null when the entry is
 * absent, or when any single chunk has expired — a chunk set outlived by one of
 * its members would reassemble into truncated JSON, which is worse than a miss.
 */
function _cacheGetChunked(cache, key) {
  const plain = cache.get(key);
  if (plain) return plain;
  const countStr = cache.get(key + '_chunks');
  if (!countStr) return null;
  const count = parseInt(countStr, 10);
  if (!(count > 0)) return null;
  let out = '';
  for (let i = 0; i < count; i++) {
    const chunk = cache.get(key + '_' + i);
    if (chunk === null || chunk === undefined || chunk === '') return null;
    out += chunk;
  }
  return out || null;
}
```

- [ ] **Step 5 : Lancer le test et constater le vert**

```bash
node --test tests/cache-bytes.test.js
```

Attendu : PASS, 7 tests.

- [ ] **Step 6 : Lancer la suite complète (non-régression)**

```bash
npm run verify
```

Attendu : `check:html` OK, puis 283 cas existants + 7 nouveaux, tous verts. Aucun test existant ne doit passer au rouge — cette tâche n'ajoute que du code neuf.

- [ ] **Step 7 : Mettre à jour le CHANGELOG**

Insérer en haut de `CHANGELOG.md`, au-dessus de l'entrée `## [v3.20.12]` :

```markdown
## [v3.20.13] - 2026-08-25

### Ajouté
**Humanisé** : Le serveur sait maintenant mesurer exactement le poids réel de ce qu'il met en mémoire rapide, au lieu de compter les caractères — un emoji de Top pèse quatre fois plus lourd qu'une lettre, et cet écart faisait déborder la mémoire rapide sans prévenir.
**Technique** : Nouvelles aides top-level dans `Code.gs` — `_byteLength()` (poids UTF-8 exact, y compris paires de substituts), `_cachePutChunked()` (écriture en morceaux bornés en octets, marqueur `_chunks` écrit en dernier, ne lève jamais) et `_cacheGetChunked()` (relecture tolérante, `null` sur morceau expiré). Exportées via `EXPORTED_GLOBALS` dans `tests/harness.js` ; couvertes par `tests/cache-bytes.test.js` sur un faux `CacheService` qui applique la limite en octets.
```

- [ ] **Step 8 : Commit et push**

```bash
gh auth status
```

Si le compte actif n'est pas `Arcxy2nd` :

```bash
gh auth switch --user Arcxy2nd
```

Puis :

```bash
git add Code.gs tests/harness.js tests/cache-bytes.test.js CHANGELOG.md && git commit -m "feat(cache): measure cache payloads in UTF-8 bytes with chunked helpers (v3.20.13)" && git push
```

---

### Task 2 : Router les 12 sites de cache simple sur les aides partagées

**Files:**
- Modify: `Code.gs` — 12 paires lecture/écriture (voir tableau ci-dessous)
- Test: `tests/cache-bytes.test.js` (étendre)

**Interfaces:**
- Consumes: `_cachePutChunked(cache, key, serial, ttl)`, `_cacheGetChunked(cache, key)` (Task 1).
- Produces: aucun nouvel appelable. Après cette tâche, plus aucune occurrence de `serial.length <= CONFIG.CACHE_MAX_BYTES` ne subsiste dans `Code.gs`.

**Sites à migrer** — repérés par leur fonction porteuse, pas par numéro de ligne (les lignes se décalent à chaque édition). Retrouver la liste courante avec :

```bash
grep -n "cache.get(key)\|CACHE_MAX_BYTES\|cache.put(key" Code.gs
```

| Fonction porteuse | Variable de clé | Note |
|---|---|---|
| `SettingsService.getEntities` | `key` | |
| `StorageService.getAllLogs` | `key` | appelle déjà `_logCacheSkip` dans son `else` — le `else` disparaît |
| `AnalyticsService.getDataHealth` | `key` | **`cache.put` actuellement sans garde ni `try` : un payload trop gros fait planter toute la requête. C'est le site le plus urgent.** |
| `NotesService` (lecture des notes en cache) | `key` | |
| `ChatService` (lecture des messages en cache) | `key` | |
| `BaremeService.getEntries` | `key` | |
| `PhrasesService` (lecture des phrases en cache) | `key` | |
| `apiDetectDistributedLots` | `key` | le `put` sérialise `lots`, pas l'objet de réponse — conserver ce détail |
| `apiGetPlayerRecords` | `key` | |
| `apiGetTrends` | `key` | |
| `apiGetActiveWeekday` | `key` | |
| `apiGetTopPlayerCategoryPairs` | `key` | |

- [ ] **Step 1 : Écrire le test rouge**

Ajouter à la fin de `tests/cache-bytes.test.js` :

```js
const fs   = require('node:fs');
const path = require('node:path');

test('plus aucun site de Code.gs ne mesure son cache en caracteres', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const charGuards = src.split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(x => /\.length\s*<=\s*(CONFIG\.CACHE_MAX_BYTES|chunkSize)/.test(x.line));
  assert.deepStrictEqual(
    charGuards, [],
    'Sites encore mesures en caracteres :\n' + charGuards.map(x => '  Code.gs:' + x.n + '  ' + x.line).join('\n')
  );
});

test('chaque cache.put direct de Code.gs passe par _cachePutChunked', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  // Les seuls cache.put legitimes restants sont ceux qui vivent DANS
  // _cachePutChunked lui-meme ; tout autre appel direct contourne la mesure en
  // octets et peut rejeter un payload en production sans que les tests le voient.
  const helperStart = src.indexOf('function _cachePutChunked(');
  const helperEnd   = src.indexOf('function _cacheGetChunked(');
  assert.ok(helperStart !== -1 && helperEnd > helperStart, '_cachePutChunked introuvable');
  const outside = src.slice(0, helperStart) + src.slice(helperEnd);
  // Pas de numero de ligne ici : `outside` est un recollage, ses indices ne
  // correspondent plus au fichier. Le texte de la ligne suffit a la retrouver.
  const strays = outside.split('\n')
    .map(line => line.trim())
    .filter(line => /\bcache\.put\(/.test(line));
  assert.deepStrictEqual(
    strays, [],
    'cache.put directs restants :\n' + strays.map(l => '  ' + l).join('\n')
  );
});
```

- [ ] **Step 2 : Lancer le test et constater l'échec**

```bash
node --test tests/cache-bytes.test.js
```

Attendu : ÉCHEC des deux nouveaux tests. Le premier liste les 11 gardes `serial.length <= CONFIG.CACHE_MAX_BYTES` plus les 2 `chunkSize`. Le second liste les `cache.put(` directs restants. **Copier ces deux listes** : elles sont la liste de travail exacte des tâches 2 et 3.

- [ ] **Step 3 : Migrer les 12 sites, un par un, en partant du bas du fichier**

Travailler **du numéro de ligne le plus élevé vers le plus bas** pour que les éditions ne décalent pas les sites restants.

Pour chaque site, deux éditions. **Écriture** — remplacer :

```js
    const serial = JSON.stringify(result);
    if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
```

par :

```js
    _cachePutChunked(cache, key, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
```

**Lecture** — dans la même fonction, plus haut, remplacer :

```js
    const raw   = cache.get(key);
```

par :

```js
    const raw   = _cacheGetChunked(cache, key);
```

Cas particuliers, à traiter tels quels :

1. **`StorageService.getAllLogs`** — le site actuel a une branche `else` qui journalise :

```js
      if (serial.length <= CONFIG.CACHE_MAX_BYTES) cache.put(key, serial, CONFIG.CACHE_TTL_SECONDS);
      else _logCacheSkip(key, serial.length);
```

devient simplement :

```js
      _cachePutChunked(cache, key, serial, CONFIG.CACHE_TTL_SECONDS);
```

Le `_logCacheSkip` n'est pas perdu : `_cachePutChunked` l'appelle lui-même quand le service refuse réellement l'écriture. Ne pas garder le `else`, il serait mort.

2. **`AnalyticsService.getDataHealth`** — l'écriture n'a aujourd'hui **aucune garde ni `try`** :

```js
    const result = this._computeDataHealth();
    cache.put(key, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
    return result;
```

devient :

```js
    const result = this._computeDataHealth();
    _cachePutChunked(cache, key, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
    return result;
```

3. **`apiDetectDistributedLots`** — la valeur sérialisée est `lots`, pas la réponse complète. Conserver :

```js
    _cachePutChunked(cache, key, JSON.stringify(lots), CONFIG.CACHE_TTL_SECONDS);
    return { success: true, lots: lots };
```

4. **`apiGetTrends`, `apiGetActiveWeekday`, `apiGetTopPlayerCategoryPairs`, `apiGetPlayerRecords`** — la variable sérialisée s'appelle `res` et non `result`. Adapter le nom, ne pas le renommer.

- [ ] **Step 4 : Lancer les tests et constater le vert partiel**

```bash
node --test tests/cache-bytes.test.js
```

Attendu : le test `plus aucun site … en caracteres` échoue **encore**, mais sa liste ne contient plus que les **2** lignes `chunkSize` (dans `StorageService.getFullHistoryRowsCached` et `apiGetChangelog`) — c'est le périmètre de la Task 3. Le test `chaque cache.put direct` échoue encore lui aussi, avec les seuls `cache.put` des deux chunkers manuels.

C'est l'état attendu à ce stade. **Ne pas** toucher aux deux chunkers ici.

- [ ] **Step 5 : Lancer la suite complète**

```bash
npm run verify
```

Attendu : tous les tests existants restent verts (`tests/cache.test.js` en particulier, qui exerce le cycle lecture/écriture de `getAllLogs`). Seuls les 2 tests de cliquet de l'étape 1 restent rouges, par construction.

Si un test existant passe au rouge, c'est qu'une paire lecture/écriture a été désappariée — vérifier que **chaque** `_cachePutChunked` a bien son `_cacheGetChunked` dans la même fonction, sur la même variable de clé.

- [ ] **Step 6 : Mettre à jour le CHANGELOG**

Insérer en haut de `CHANGELOG.md` :

```markdown
## [v3.20.14] - 2026-08-25

### Corrigé
**Humanisé** : La mémoire rapide du serveur ne se coupait plus toute seule dès que les données contenaient beaucoup d'emojis. Douze zones de l'application — classements, records, tendances, notes, tchat, barème, phrases, rapport de santé — la réutilisent désormais quelle que soit la taille des données, au lieu de tout relire depuis Google Sheets à chaque affichage.
**Technique** : Les 12 sites de `Code.gs` qui gardaient leur écriture par `serial.length <= CONFIG.CACHE_MAX_BYTES` passent par `_cachePutChunked()`/`_cacheGetChunked()`. Le `else _logCacheSkip(...)` mort de `StorageService.getAllLogs` est supprimé (l'aide journalise elle-même).

**Humanisé** : Le rapport de santé des données ne peut plus faire échouer la page entière quand il devient volumineux.
**Technique** : `AnalyticsService.getDataHealth` écrivait via un `cache.put` nu, sans garde de taille ni `try` — une exception `Argument too large` du service remontait jusqu'à l'appelant. L'écriture passe maintenant par `_cachePutChunked()`, qui ne lève jamais.
```

- [ ] **Step 7 : Commit et push**

```bash
gh auth status
```

Basculer sur `Arcxy2nd` si nécessaire, puis :

```bash
git add Code.gs tests/cache-bytes.test.js CHANGELOG.md && git commit -m "fix(cache): route the 12 single-entry cache sites through the byte-aware helpers (v3.20.14)" && git push
```

---

### Task 3 : Absorber les deux découpeurs manuels

**Files:**
- Modify: `Code.gs` — `StorageService.getFullHistoryRowsCached` et `apiGetChangelog`
- Test: `tests/cache-bytes.test.js` (étendre)

**Interfaces:**
- Consumes: `_cachePutChunked(cache, key, serial, ttl)`, `_cacheGetChunked(cache, key)` (Task 1).
- Produces: aucun nouvel appelable. Après cette tâche, les deux tests de cliquet de la Task 2 passent au vert et il ne reste **aucun** découpage manuel dans `Code.gs`.

**Pourquoi :** ces deux fonctions découpent déjà, mais en tranches de 90 000 **caractères** — jusqu'à 360 000 octets par morceau sur du texte plein d'emojis, donc au-delà de la limite du service. Elles dupliquent en plus, à l'identique, la logique que la Task 1 a factorisée.

---

- [ ] **Step 1 : Écrire le test rouge**

Ajouter à la fin de `tests/cache-bytes.test.js` :

```js
const { makeSheet } = require('./harness');

const HIST_HEADER = ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'];

test('getFullHistoryRowsCached se relit a l identique avec un historique plein d emojis', () => {
  const cache = byteLimitedCache(95000);
  const gas = loadGas({ CacheService: { getScriptCache: () => cache } });

  const rows = [HIST_HEADER];
  for (let i = 0; i < 4000; i++) {
    rows.push([new Date('2026-03-04T12:00:00'), 'Joueur' + (i % 7), 'Jeux 🏆🎲🎯', 5, 'Partie 🏆 numero ' + i, '', '']);
  }
  const history = makeSheet(rows);
  gas.ConfigService.getSheets = () => ({ history });

  const first = gas.StorageService.getFullHistoryRowsCached();
  assert.ok(first.length > 0);

  // Le payload doit avoir ete decoupe : sinon le fixture ne prouve rien.
  assert.ok(Object.keys(cache.store).some(k => k.indexOf('_chunks') !== -1),
    'le fixture doit forcer un decoupage');

  const second = gas.StorageService.getFullHistoryRowsCached();
  assert.strictEqual(second.length, first.length);
  assert.strictEqual(second[0].player, first[0].player);
  assert.strictEqual(second[0].description, first[0].description);
  // Cross-realm : comparer la forme, pas via instanceof.
  assert.strictEqual(Object.prototype.toString.call(second[0].date), '[object Date]');
  assert.strictEqual(second[0].date.getTime(), first[0].date.getTime());
});

test('chaque morceau ecrit par getFullHistoryRowsCached tient dans la limite en octets', () => {
  const cache = byteLimitedCache(95000);
  const gas = loadGas({ CacheService: { getScriptCache: () => cache } });
  const rows = [HIST_HEADER];
  for (let i = 0; i < 4000; i++) {
    rows.push([new Date('2026-03-04T12:00:00'), 'Joueur' + (i % 7), 'Jeux 🏆🎲🎯', 5, 'Partie 🏆 numero ' + i, '', '']);
  }
  gas.ConfigService.getSheets = () => ({ history: makeSheet(rows) });

  // byteLimitedCache leve au-dela de la limite ; si un seul morceau depassait,
  // _cachePutChunked l'avalerait et le cache resterait vide.
  gas.StorageService.getFullHistoryRowsCached();
  const written = Object.keys(cache.store);
  assert.ok(written.length > 0, 'aucune entree ecrite : un morceau a ete refuse par le service');
  written.forEach(k => {
    assert.ok(Buffer.byteLength(cache.store[k], 'utf8') <= 95000, k + ' depasse la limite');
  });
});
```

- [ ] **Step 2 : Lancer le test et constater l'échec**

```bash
node --test tests/cache-bytes.test.js
```

Attendu : ÉCHEC de `chaque morceau ecrit … tient dans la limite en octets` avec `aucune entree ecrite : un morceau a ete refuse par le service` — le découpage en 90 000 caractères produit des morceaux au-delà de 95 000 octets, que le faux service rejette. Les deux tests de cliquet de la Task 2 sont toujours rouges.

- [ ] **Step 3 : Réécrire `StorageService.getFullHistoryRowsCached`**

Remplacer tout le corps actuel (de `const cache = CacheService.getScriptCache();` jusqu'au `return result;` final) par :

```js
  getFullHistoryRowsCached() {
    const cache = CacheService.getScriptCache();
    const key   = 'hist_full_v' + _logsVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try {
        return JSON.parse(raw).map(r => Object.assign({}, r, { date: new Date(r.date) }));
      } catch (e) { /* corrupt entry → fall through to a fresh read */ }
    }
    const result = this._readFullHistoryRows();
    const serial = JSON.stringify(result.map(r => Object.assign({}, r, { date: r.date.toISOString() })));
    _cachePutChunked(cache, key, serial, CONFIG.CACHE_TTL_SECONDS);
    return result;
  },
```

Les blocs `chunkCountStr` / boucle de réassemblage / `chunkSize = 90000` / `try…catch (cacheWriteErr)` disparaissent entièrement : `_cacheGetChunked` et `_cachePutChunked` font tout, en octets.

Le schéma de clés est **inchangé** (`key`, `key + '_chunks'`, `key + '_' + i`), donc les entrées écrites par la v3.20.9 restent lisibles pendant leur TTL.

- [ ] **Step 4 : Réécrire le cache de `apiGetChangelog`**

Dans `apiGetChangelog`, remplacer tout le bloc de lecture :

```js
    if (!forceRefresh) {
      try {
        const cached = cache.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
        const chunkCountStr = cache.get(cacheKey + '_chunks');
        …
      } catch (cacheReadErr) {
        console.warn('Erreur lecture cache changelog:', cacheReadErr);
      }
    }
```

par :

```js
    if (!forceRefresh) {
      try {
        const cached = _cacheGetChunked(cache, cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (cacheReadErr) {
        console.warn('Erreur lecture cache changelog:', cacheReadErr);
      }
    }
```

Et tout le bloc d'écriture :

```js
      try {
        const json = JSON.stringify(result);
        const chunkSize = 90000;
        if (json.length <= chunkSize) {
          cache.put(cacheKey, json, 600); // 10 min
        } else {
          …
        }
      } catch (cacheWriteErr) {
        console.warn('Erreur écriture cache changelog:', cacheWriteErr);
      }
      return result;
```

par :

```js
      _cachePutChunked(cache, cacheKey, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
      return result;
```

Note : le TTL passe du `600` littéral à `CONFIG.CACHE_TTL_SECONDS`, qui vaut exactement 600 — c'est la même durée, mais la constante magique disparaît de la logique (règle « aucune constante hardcodée »). Le `try/catch` disparaît aussi : `_cachePutChunked` ne lève jamais.

- [ ] **Step 5 : Lancer les tests et constater le vert**

```bash
node --test tests/cache-bytes.test.js
```

Attendu : PASS intégral, y compris les deux tests de cliquet de la Task 2 — `charGuards` et `strays` sont maintenant vides.

- [ ] **Step 6 : Lancer la suite complète**

```bash
npm run verify
```

Attendu : tout vert. `tests/storage.test.js` et `tests/cache.test.js` exercent `getFullHistoryRowsCached` et doivent rester verts.

- [ ] **Step 7 : Mettre à jour le CHANGELOG**

```markdown
## [v3.20.15] - 2026-08-25

### Corrigé
**Humanisé** : Le découpage en mémoire rapide de l'historique complet et du changelog se faisait en tranches trop lourdes dès que le texte contenait des emojis, ce qui faisait rejeter la sauvegarde par Google — l'application relisait alors tout à chaque affichage.
**Technique** : `StorageService.getFullHistoryRowsCached` et `apiGetChangelog` abandonnent leur découpage maison en 90 000 caractères (jusqu'à 360 000 octets par morceau) au profit de `_cachePutChunked()`/`_cacheGetChunked()`, bornés en octets. Le schéma de clés (`key`, `key_chunks`, `key_N`) est conservé, donc les entrées écrites par la v3.20.9 restent lisibles pendant leur TTL.

### Supprimé
**Humanisé** : Deux copies de la même mécanique de découpage disparaissent du code.
**Technique** : Suppression de la logique de chunking dupliquée dans les deux fonctions, ainsi que du littéral `600` et du `chunkSize = 90000` codés en dur ; le TTL vient désormais de `CONFIG.CACHE_TTL_SECONDS`.
```

- [ ] **Step 8 : Commit et push**

```bash
gh auth status
```

Basculer sur `Arcxy2nd` si nécessaire, puis :

```bash
git add Code.gs tests/cache-bytes.test.js CHANGELOG.md && git commit -m "refactor(cache): fold the two hand-rolled chunkers into the shared byte-aware helpers (v3.20.15)" && git push
```

---

### Task 4 : Cliquet anti-injection sur `innerHTML`

**Files:**
- Create: `tests/innerhtml-audit.test.js`
- Test: lui-même (test statique — il lit `Index.html` comme du texte, il n'exécute rien)

**Interfaces:**
- Consumes: `Index.html` (lu depuis le disque), la fonction `escapeHtml()` qui y est déjà définie.
- Produces, pour la Task 5 :
  - le fichier `tests/innerhtml-audit.test.js` contenant la constante `AUDITED` — un tableau d'objets `{ snippet: string, reason: string }` où `snippet` est un fragment **littéral et unique** de la ligne d'affectation auditée, et `reason` la justification en une ligne.
  - la sortie d'échec du test, qui **est** la liste de travail de la Task 5.

**Pourquoi un cliquet plutôt qu'une réécriture :** `Index.html` compte 181 affectations `innerHTML`. Les réécrire toutes en API DOM serait un chantier à haut risque de régression pour un bénéfice nul là où le contenu est un littéral statique. Le vrai risque est ailleurs : une **future** ligne qui concatène une donnée serveur sans l'échapper. Le cliquet fige l'état audité et fait échouer `npm run verify` sur toute nouvelle ligne non sûre.

---

- [ ] **Step 1 : Écrire le test rouge**

Créer `tests/innerhtml-audit.test.js` :

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const INDEX = path.join(__dirname, '..', 'Index.html');

/**
 * Liste d'exceptions auditee a la main. Chaque entree fige UNE affectation
 * innerHTML dont on a verifie qu'elle est sure, avec la raison.
 *
 * `snippet` doit apparaitre TEL QUEL et UNE SEULE FOIS dans Index.html : un
 * snippet ambigu ferait taire deux sites d'un coup, dont un non audite.
 *
 * Ajouter une entree ici est un acte d'audit, pas une formalite. Si la raison ne
 * tient pas en une ligne, c'est que le site doit etre corrige, pas allowliste.
 */
const AUDITED = [
  // Rempli par la Task 5.
];

/** Affectations `X.innerHTML =` ou `X.innerHTML +=`, avec leur expression source. */
function collectAssignments(html) {
  const out = [];
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/\.innerHTML\s*\+?=/.test(lines[i])) continue;
    // L'expression peut courir sur plusieurs lignes (concatenations longues) :
    // on agrege jusqu'au point-virgule de fin d'instruction.
    let expr = lines[i];
    let j = i;
    while (!/;\s*(\/\/.*)?$/.test(expr.trim()) && j - i < 200 && j + 1 < lines.length) {
      j++;
      expr += '\n' + lines[j];
    }
    out.push({ line: i + 1, expr });
  }
  return out;
}

/**
 * Une affectation est "sure par construction" si son expression n'interpole
 * aucune donnee : soit une chaine vide/litterale, soit uniquement des litteraux
 * concatenes. Tout le reste demande soit escapeHtml(), soit un audit explicite.
 */
function isLiteralOnly(expr) {
  const rhs = expr.slice(expr.indexOf('=') + 1);
  // Retire les chaines litterales, les commentaires et les espaces.
  const stripped = rhs
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '')
    .replace(/[\s+;]/g, '');
  return stripped === '';
}

/** Interpole-t-elle quelque chose sans jamais passer par un echappeur ? */
function looksUnsafe(expr) {
  if (isLiteralOnly(expr)) return false;
  return !/escapeHtml\s*\(|encodeURIComponent\s*\(/.test(expr);
}

test('chaque snippet audite est present et unique dans Index.html', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  AUDITED.forEach(entry => {
    const count = html.split(entry.snippet).length - 1;
    assert.strictEqual(count, 1,
      'snippet audite present ' + count + ' fois (attendu 1) : ' + JSON.stringify(entry.snippet));
    assert.ok(entry.reason && entry.reason.trim().length >= 10,
      'raison manquante ou trop courte pour : ' + JSON.stringify(entry.snippet));
  });
});

test('aucune affectation innerHTML n interpole de donnee sans echappement', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const audited = AUDITED.map(e => e.snippet);
  const offenders = collectAssignments(html)
    .filter(a => looksUnsafe(a.expr))
    .filter(a => !audited.some(s => a.expr.indexOf(s) !== -1));

  const report = offenders
    .map(a => '  Index.html:' + a.line + '\n' + a.expr.split('\n').map(l => '    ' + l.trim()).join('\n'))
    .join('\n\n');

  assert.strictEqual(offenders.length, 0,
    offenders.length + ' affectation(s) innerHTML interpolent une donnee sans escapeHtml() :\n\n' + report);
});
```

- [ ] **Step 2 : Lancer le test et constater l'échec**

```bash
node --test tests/innerhtml-audit.test.js
```

Attendu : `chaque snippet audite est present et unique` PASSE (la liste est vide). `aucune affectation innerHTML n interpole de donnee sans echappement` ÉCHOUE et imprime N sites, chacun avec son numéro de ligne et son expression complète.

- [ ] **Step 3 : Archiver la liste de travail**

Rediriger la sortie dans le scratchpad, elle sert de plan de bataille à la Task 5 :

```bash
node --test tests/innerhtml-audit.test.js > "$TMPDIR/innerhtml-offenders.txt" 2>&1; wc -l "$TMPDIR/innerhtml-offenders.txt"
```

Si `$TMPDIR` n'est pas défini, utiliser le dossier scratchpad de la session. **Noter le nombre exact de sites signalés** — il faudra le reporter dans le changelog de la Task 5.

- [ ] **Step 4 : Brancher le test sur `npm run verify`**

Vérifier que le glob de `package.json` le ramasse déjà :

```bash
node --test "tests/*.test.js" 2>&1 | tail -5
```

`tests/*.test.js` matche `innerhtml-audit.test.js` : **aucune modification de `package.json` n'est nécessaire**. Ne pas en faire.

- [ ] **Step 5 : Commit et push (test rouge assumé)**

Cette tâche livre volontairement un test rouge — c'est l'inventaire, la Task 5 le referme. Le pousser rouge casserait le déploiement des deux instances (`npm run verify` tourne dans le workflow avant `clasp push`).

**Donc : ne rien pousser ici.** Committer en local uniquement, et enchaîner immédiatement sur la Task 5 qui pousse les deux tâches ensemble.

```bash
git add tests/innerhtml-audit.test.js && git commit -m "test(security): add innerHTML escaping ratchet (red until audit lands)"
```

---

### Task 5 : Trier et corriger les sites `innerHTML` signalés

**Files:**
- Modify: `Index.html` — corrections d'échappement
- Modify: `tests/innerhtml-audit.test.js` — remplissage de `AUDITED`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `tests/innerhtml-audit.test.js` et sa constante `AUDITED` (Task 4) ; `escapeHtml(s)` déjà définie dans `Index.html`, qui échappe `& < > " '`.
- Produces: `npm run verify` intégralement vert, cliquet inclus.

**Règle de tri** — pour chaque site signalé, exactement une des trois issues, jamais autre chose :

| Nature du contenu interpolé | Issue |
|---|---|
| Donnée venue du serveur ou d'une saisie utilisateur (nom de joueur, nom de Top, description, texte de note, message de tchat, texte de phrase, action de barème, saiseur, `meta`/URL d'avatar…) | **CORRIGER** : envelopper dans `escapeHtml(...)`. Pour une URL injectée dans un attribut (`src=`, `href=`), `escapeHtml()` suffit pour l'attribut, mais ajouter aussi un rejet des schémas `javascript:`/`data:` si la valeur vient du Sheet. |
| Nombre, booléen, ou valeur issue d'une liste fermée définie dans le code (nom de pool, type de graphique, clé d'onglet, couleur déjà validée en hexadécimal) | **AUDITER** : ajouter à `AUDITED` avec la raison exacte (ex. `'pool vient de POOLS, liste fermee definie dans Index.html'`). |
| Fragment HTML déjà construit par une fonction qui échappe elle-même en interne (ex. le rendu Markdown, un `build*Html()` dédié) | **AUDITER** : ajouter à `AUDITED` en nommant la fonction qui garantit l'échappement. |

Deux interdits : ne jamais allowlister « parce que la valeur a l'air sûre », et ne jamais remplacer un site par de l'API DOM « pour faire propre » — hors périmètre, risque de régression pour zéro gain de sécurité.

- [ ] **Step 1 : Traiter les sites par lots de 30**

Reprendre la liste archivée à la Task 4, étape 3. Pour chaque lot de 30 sites, dans l'ordre du fichier :

1. Ouvrir le site dans `Index.html` au numéro de ligne indiqué.
2. Identifier chaque valeur interpolée et remonter à sa source (d'où vient la variable ?).
3. Appliquer l'issue selon la table ci-dessus.
4. Relancer `node --test tests/innerhtml-audit.test.js` et vérifier que le compte de sites signalés a bien baissé de 30.

Exemple de **correction** typique — avant :

```js
    row.innerHTML = '<td>' + rec.player + '</td><td>' + rec.description + '</td>';
```

après :

```js
    row.innerHTML = '<td>' + escapeHtml(rec.player) + '</td><td>' + escapeHtml(rec.description) + '</td>';
```

Exemple d'**audit** typique — le site reste inchangé dans `Index.html`, et `AUDITED` reçoit :

```js
  { snippet: "cell.innerHTML = '<b>' + total + '</b>'",
    reason: 'total est un nombre issu de reduce() sur des points deja convertis par parseInt' },
```

- [ ] **Step 2 : Attention particulière — exhaustivité par champ**

Un même champ apparaît à plusieurs endroits de l'app. Avant de déclarer un champ traité, le lister exhaustivement plutôt que se fier aux premiers sites rencontrés. Pour chacun de ces champs, faire le grep et vérifier **chaque** occurrence :

```bash
grep -n "\.player\b" Index.html | grep -i "innerHTML\|'<"
```

À répéter pour : `player`, `category`, `description`, `text` (notes et tchat), `saiseur`, `preset`, `pool`, `action` (barème), `meta` (URL d'avatar joueur), `name`.

Piège documenté à ne pas manquer : `meta` est une **URL d'avatar** pour un joueur mais une **description** pour un Top. Les deux se traitent, mais pas de la même façon — l'un va dans un attribut `src`, l'autre dans du texte. Ne pas appliquer aveuglément le même traitement.

- [ ] **Step 3 : Lancer le test et constater le vert**

```bash
node --test tests/innerhtml-audit.test.js
```

Attendu : PASS des deux tests. Si `chaque snippet audite est present et unique` échoue, c'est qu'un `snippet` de `AUDITED` est trop court et matche plusieurs lignes — le rallonger jusqu'à ce qu'il soit unique.

- [ ] **Step 4 : Vérifier la syntaxe du frontend**

```bash
npm run check:html
```

Attendu : OK. Ce contrôle attrape une parenthèse d'`escapeHtml(` oubliée, l'erreur la plus probable après une passe d'échappement en masse.

- [ ] **Step 5 : Lancer la suite complète**

```bash
npm run verify
```

Attendu : tout vert, y compris `tests/papercuts.test.js`, `tests/guide-audit.test.js`, `tests/frontend-guards.test.js` et `tests/mention-detection.test.js` — ce dernier est le plus exposé, le rendu des mentions `@Joueur` / `#Top` traverse des chemins `innerHTML`.

- [ ] **Step 6 : Vérifier visuellement dans l'app**

Lancer le harness frontend local (**jamais** une instance déployée) :

```bash
npm run serve:front
```

Contrôler que l'échappement n'a pas cassé d'affichage, en thème sombre **et** clair :

- Dashboard : classement, card Commentaires, Records, Tendances
- Historique : tableau paginé, une description contenant `&` ou une apostrophe
- Notes : une note existante
- Tchat : un message avec mention `@Joueur` et `#Top`, et un message avec du Markdown
- Paramètres : listes joueurs / Tops / barème / phrases, avatars affichés

Un `&amp;` ou `&#39;` visible **à l'écran** signale un double échappement : la valeur passait déjà par un chemin échappé, il faut retirer le `escapeHtml()` ajouté et basculer ce site en entrée `AUDITED`.

- [ ] **Step 7 : Mettre à jour le CHANGELOG**

Remplacer `<N>` et `<M>` par les comptes réels.

```markdown
## [v3.20.16] - 2026-08-25

### Ajouté
**Humanisé** : Un contrôle automatique empêche désormais qu'un nom de joueur, un commentaire ou un message de tchat contenant du code puisse s'exécuter dans la page. Toute nouvelle ligne de code qui oublierait cette précaution bloque la livraison.
**Technique** : `tests/innerhtml-audit.test.js` — analyse statique de `Index.html` : toute affectation `innerHTML` qui interpole une valeur sans passer par `escapeHtml()`/`encodeURIComponent()` fait échouer `npm run verify`, sauf entrée explicite et justifiée dans la liste `AUDITED`. Ramassé par le glob `tests/*.test.js` existant, donc actif dans le workflow de déploiement.

### Corrigé
**Humanisé** : <N> endroits de l'interface affichaient des données sans les neutraliser au préalable.
**Technique** : `escapeHtml()` ajouté sur <N> sites d'affectation `innerHTML` de `Index.html` ; <M> sites supplémentaires audités et justifiés dans `AUDITED` (littéraux, valeurs numériques, listes fermées, fragments déjà échappés en amont).
```

- [ ] **Step 8 : Commit et push**

```bash
gh auth status
```

Basculer sur `Arcxy2nd` si nécessaire, puis :

```bash
git add Index.html tests/innerhtml-audit.test.js CHANGELOG.md && git commit -m "fix(security): escape interpolated data in innerHTML sinks and lock it with a ratchet (v3.20.16)" && git push
```

Ce push emporte aussi le commit local de la Task 4. **Vérifier ensuite que le workflow passe**, sans sonder en boucle : attendre, puis un seul appel.

```bash
gh run list --limit 3
```

---

### Task 6 : Clôture

**Files:**
- Modify: `NEXT_SESSION.md`

**Interfaces:**
- Consumes: l'état livré par les tâches 1 à 5.
- Produces: rien de technique — l'état inter-sessions à jour.

---

- [ ] **Step 1 : Vérification finale**

```bash
npm run verify
```

Attendu : tout vert. Relever le nombre total de cas (283 avant ce plan, plus les nouveaux).

- [ ] **Step 2 : Vérifier que l'arbre est propre et poussé**

```bash
git status --short && git log --oneline -6
```

Attendu : aucun fichier modifié non committé, et les 4 commits de version (v3.20.13 → v3.20.16) présents, plus le commit du cliquet.

```bash
git log origin/main..HEAD --oneline
```

Attendu : sortie vide — tout est poussé.

- [ ] **Step 3 : Mettre à jour `NEXT_SESSION.md`**

Réécrire les 4 blocs (structure stricte, ~10 lignes par bloc, pas d'accumulation) :

```markdown
# NEXT_SESSION — top-des-tops

## État courant
- Version livrée : **v3.20.16** (2026-08-25) — cache serveur mesuré en octets UTF-8 de bout en bout, et cliquet anti-injection actif sur `Index.html`.
- Cache : `_byteLength()` / `_cachePutChunked()` / `_cacheGetChunked()` en tête de `Code.gs` sont l'unique voie d'écriture et de lecture du `CacheService`. Aucun `cache.put` direct ne doit réapparaître — deux tests de `tests/cache-bytes.test.js` le vérifient statiquement.
- Sécurité frontend : `tests/innerhtml-audit.test.js` fait échouer `npm run verify` sur toute affectation `innerHTML` interpolant une donnée sans `escapeHtml()`. Les exceptions vivent dans la constante `AUDITED`, chacune avec sa raison.
- Suite de tests : <N> cas verts (`npm run verify`).
- Init recommandé : standard.

## Dernière session
- Vérification de l'audit Gemini 3.1 Pro : 4 points sur 9 retenus, 5 rejetés ou déjà arbitrés (détail dans `docs/superpowers/plans/2026-08-25-audit-gemini-3.1-fixes.md`, section « Hors périmètre »).
- **[v3.20.13]** : aides de cache mesurées en octets UTF-8 (`_byteLength`, `_cachePutChunked`, `_cacheGetChunked`).
- **[v3.20.14]** : 12 sites de cache routés dessus ; `AnalyticsService.getDataHealth` ne peut plus faire planter la requête sur un payload volumineux.
- **[v3.20.15]** : les deux découpeurs manuels (historique complet, changelog) absorbés par les aides partagées ; découpage désormais borné en octets et non plus en caractères.
- **[v3.20.16]** : passe d'échappement sur les affectations `innerHTML` de `Index.html` + cliquet de non-régression.

## Écarts
- Aucun écart sur les tâches 1 à 5.
- Point de l'audit **non traité volontairement** : la taille du frontend (884 Ko, 18 672 lignes). Constat exact, mais la remédiation proposée (découpage en `src/` + script d'injection Node) viole la règle « pas de build » de `context.md` §2. Reste en question ouverte au backlog.

## Rappels actifs + Backlog
- **Action manuelle requise** : le propriétaire du projet GAS doit encore effectuer la re-autorisation OAuth unique dans l'interface Apps Script pour valider le scope Drive (`https://www.googleapis.com/auth/drive`).
- **Question ouverte** : que faire de la taille de `Index.html` sans introduire de build ? (découpage en plusieurs fichiers `.html` inclus côté GAS via `HtmlService.createTemplateFromFile` ?)
- **Piège shell** : les heredocs Git Bash sur cette machine mangent un niveau d'antislash — `\\(` devient `\(`. Ne jamais écrire de regex via heredoc ; passer par l'outil d'édition.
- **Cross-realm dans les tests `vm`** : `assert.deepStrictEqual` / `instanceof` échoue sur des objets construits dans un sandbox `vm` différent — comparer par duck-typing ou `JSON.stringify`.
- **Environnement de prévisualisation** : le pane du navigateur intégré peut rapporter `window.innerWidth === 0` juste après un `preview_start` frais — toujours appeler `resize_window` avant de lire un état dépendant de la largeur.
- Garde-fous en place : `tests/papercuts.test.js`, `tests/guide-audit.test.js`, `tests/dropdown-outside-click.test.js`, `tests/cache-bytes.test.js`, `tests/innerhtml-audit.test.js`.
```

Remplacer `<N>` par le nombre réel relevé à l'étape 1.

- [ ] **Step 4 : Commit et push**

```bash
gh auth status
```

Basculer sur `Arcxy2nd` si nécessaire, puis :

```bash
git add NEXT_SESSION.md && git commit -m "docs: update NEXT_SESSION.md after the Gemini audit fixes" && git push
```

- [ ] **Step 5 : Confirmer le déploiement des deux cibles**

Attendre la fin du workflow, puis **un seul** appel (pas de sondage en boucle) :

```bash
gh run list --workflow=deploy-gas.yml --limit 3
```

Attendu : le dernier run en `completed / success`. Le workflow déploie « Site tops » **et** « Tops RDS » ; un run vert couvre les deux. Si le run est rouge, lire ses logs avant toute autre action — ne jamais laisser une des deux instances non mise à jour.
