/**
 * SPREADSHEET STRUCTURE
 * History   : [0] Date | [1] Player   | [2] Category  | [3] Points | [4] Description
 * Players   : [0] Name | [1] Avatar URL | [2] Hex color | [3] Password (never sent to client)
 * Categories: [0] Name | [1] Description | [2] Emoji icon | [3] Hex color
 * Notes     : [0] Date | [1] Player   | [2] Note text
 * Bareme    : [0] Action (text) | [1] Points  (optional sheet, auto-created)
 * Settings  : [0] Key  | [1] Value  (optional sheet, auto-created — app_title, logo_url)
 * AutoRules : automatic point-granting rules (optional sheet, auto-created — see AutoPoints.gs)
 * Chat      : [0] Id | [1] Date | [2] Author | [3] Text | [4] ReplyToId (optional sheet, auto-created)
 */

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const CONFIG = {
  LOCK_TIMEOUT_MS: 10000,
  CACHE_TTL_SECONDS: 600,
  CACHE_MAX_BYTES: 95000, // ≤ CacheService ~100KB limit
  AUTO_TRIGGER_INTERVAL_HOURS: 1
};

// ─── SHARED DATE/ID HELPERS ────────────────────────────────────────────────────
/** Zero-pads a number to 2 digits. */
function _pad2(n) { return String(n).padStart(2, '0'); }

/** Formats a Date as a local 'YYYY-MM-DD' key (no timezone conversion). */
function _dayKey(d) { return d.getFullYear() + '-' + _pad2(d.getMonth() + 1) + '-' + _pad2(d.getDate()); }

/** Parses a 'YYYY-MM-DD' string into a local Date, carrying the current time-of-day (throws-free — check isNaN on the result). */
function _parseLocalDateWithNow(dateStr) {
  const now = new Date();
  const parts = String(dateStr).trim().split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], now.getHours(), now.getMinutes(), now.getSeconds());
}

/** Generates a short, collision-resistant id used to tag/group a batch of rows. */
function _generateGroupId() { return 'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5); }

// ─── NAVIGATION REGISTRY ───────────────────────────────────────────────────────
// Single source of truth for "which tabs exist, in what order, with which icon".
// Consumed by both Index.html (desktop) and Mobile.html via apiGetNavPages() —
// adding/removing/reordering a tab only ever requires editing this array.
// Pas d'entrée "Outils" ici : ce sous-ensemble vit déjà dans Paramètres →
// Outils (stab-tools). Le dupliquer en onglet principal n'ajoutait qu'un
// raccourci redondant qui gonflait la barre de navigation.
const NAV_PAGES = [
  { id: 'tab-dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'tab-inject',    icon: '✍️', label: 'Saisir un Lot' },
  { id: 'tab-notes',     icon: '📝', label: 'Notes', countId: 'notesCount' },
  { id: 'tab-history',   icon: '📜', label: 'Historique', countId: 'historyCount' },
  { id: 'tab-settings',  icon: '⚙️', label: 'Paramètres' },
  { id: 'tab-guide',     icon: '❓', label: 'Guide' },
];

function apiGetNavPages() {
  try {
    return { success: true, pages: NAV_PAGES };
  } catch(e) { return fail(e); }
}

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

// ─── HEADER ROW DETECTION ──────────────────────────────────────────────────────
/**
 * Canonical row-1 labels of every sheet the app reads, keyed exactly like
 * ConfigService.getSheets(). The sheets the app creates itself always carry them,
 * but History / Players / Categories are made by hand in the spreadsheet — the app
 * refuses to start without them and never creates them — so nothing guarantees a
 * header there. Both production spreadsheets in fact hold a real record on row 1.
 *
 * Every reader used to skip row 1 unconditionally, which made the first player, the
 * first top and the first score invisible everywhere at once: absent from the lists,
 * the dashboard and the filters, but also from addEntity's duplicate check — which is
 * how an already-existing player could be created a second time. Row-1-ness must
 * therefore be decided from the row's own content, never assumed.
 */
const SHEET_HEADERS = {
  players:       ['name', 'avatar url', 'hex color', 'password', 'ordre'],
  categories:    ['name', 'description', 'emoji', 'hex color', 'ordre'],
  history:       ['date', 'player', 'category', 'points', 'description', 'groupid', 'saiseur'],
  notes:         ['date', 'joueur', 'note', 'noteid', 'créépar', 'modifiépar', 'modifiéle'],
  bareme:        ['top', 'action', 'points', 'ordre'],
  phrases:       ['preset', 'pool', 'phrase', 'ordre'],
  chat:          ['id', 'date', 'auteur', 'texte', 'réponseà'],
  auditLog:      ['timestamp', 'auteur', 'action', 'entité', 'avant', 'après', 'détail', 'snapshot', 'annuléle'],
  settings:      ['key', 'value'],
  altCategories: ['name', 'description', 'emoji', 'hex color'],
  altHistory:    ['date', 'player', 'category', 'points', 'description', 'refhistoryrowid', 'groupid', 'saiseur'],
  autoRules:     ['id', 'player', 'category', 'points', 'description', 'frequency', 'interval',
                  'daysofweek', 'dayofmonth', 'startdate', 'nextrun', 'lastrun', 'active', 'createdby']
};

const CANONICAL_SHEET_HEADERS = {
  players:       ['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre'],
  categories:    ['Name', 'Description', 'Emoji', 'Hex color', 'Ordre'],
  history:       ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur'],
  notes:         ['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe'],
  bareme:        ['Top', 'Action', 'Points', 'Ordre'],
  phrases:       ['Preset', 'Pool', 'Phrase', 'Ordre'],
  chat:          ['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ'],
  auditLog:      ['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe'],
  settings:      ['Key', 'Value'],
  altCategories: ['Name', 'Description', 'Emoji', 'Hex color'],
  altHistory:    ['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Saiseur'],
  autoRules:     ['ID', 'Joueur', 'Catégorie', 'Points', 'Description', 'Fréquence', 'Intervalle',
                  'JoursSemaine', 'JourMois', 'DateDébut', 'ProchaineExécution', 'DernièreExécution', 'Actif', 'CrééPar']
};

// Sheets whose first column always holds a real date. On those, a row 1 whose first
// cell is not a date cannot be a record — so it is a header even when its wording
// differs from ours (hand-made sheets carry French or renamed labels).
const DATE_FIRST_SHEETS = { history: true, notes: true, altHistory: true, auditLog: true };

function _isDateCell(v) {
  if (v && typeof v.getTime === 'function') return !isNaN(v.getTime());
  if (typeof v === 'number') return false;
  const s = (v === null || v === undefined) ? '' : String(v).trim();
  if (!s) return false;
  return !isNaN(new Date(s).getTime());
}

/** True when `row` is a label row rather than a record. */
function _isHeaderRow(sheetKey, row) {
  const labels = SHEET_HEADERS[sheetKey];
  if (!labels) return true;              // unknown sheet → keep the historical assumption
  if (!row || !row.length) return false;
  const norm = v => (v === null || v === undefined) ? '' : String(v).trim().toLowerCase();
  let matches = 0;
  for (let i = 0; i < labels.length && i < row.length; i++) {
    if (norm(row[i]) === labels[i]) matches++;
  }
  // One match is enough on the first column (a player is never called "Name"), but
  // elsewhere two are required so a top named like a label can't hide the whole row.
  if (matches >= 2 || (matches === 1 && norm(row[0]) === labels[0])) return true;
  if (DATE_FIRST_SHEETS[sheetKey]) return !_isDateCell(row[0]);
  return false;
}

// Memoized per execution: Apps Script builds a fresh global scope for every request,
// so this never outlives the data it describes. Cleared with the sheet cache because
// a sheet created mid-request (Notes, Chat, Bareme…) gains its header right then.
let _headerOffsetMemo = {};
function _clearHeaderOffsetMemo() { _headerOffsetMemo = {}; }

/** 1 when the sheet starts with a header row, 0 when its data starts on row 1. */
function _headerOffset(sheetKey, sheet) {
  if (!sheet) return 1;
  if (_headerOffsetMemo[sheetKey] !== undefined) return _headerOffsetMemo[sheetKey];
  let offset = 1;
  if (sheet.getLastRow() >= 1) {
    const labels = SHEET_HEADERS[sheetKey] || [];
    const width  = Math.max(1, Math.min(labels.length || 1, sheet.getLastColumn() || 1));
    offset = _isHeaderRow(sheetKey, sheet.getRange(1, 1, 1, width).getValues()[0]) ? 1 : 0;
  }
  _headerOffsetMemo[sheetKey] = offset;
  return offset;
}

/** Same decision, without a second read, when the caller already holds every value. */
function _headerOffsetFromValues(sheetKey, values) {
  if (!values || !values.length) return 0;
  const offset = _isHeaderRow(sheetKey, values[0]) ? 1 : 0;
  _headerOffsetMemo[sheetKey] = offset;
  return offset;
}

/**
 * Ensures the given sheet has a proper canonical header row at row 1.
 * If the sheet already has a header, this is a no-op.
 * If the sheet is empty, it appends the header.
 * If the sheet holds data on row 1 (headerless), it shifts all existing rows down
 * by 1 (insertRowBefore(1)) and populates row 1 with the canonical column headers,
 * preserving every single row of existing data without loss.
 */
function _ensureSheetHeaders(sheetKey, sheet, values) {
  if (!sheet) return;
  const headers = CANONICAL_SHEET_HEADERS[sheetKey];
  if (!headers || !headers.length) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    _headerOffsetMemo[sheetKey] = 1;
    return;
  }

  const row1 = (values && values.length) ? values[0] : sheet.getRange(1, 1, 1, Math.max(1, Math.min(headers.length, sheet.getLastColumn() || 1))).getValues()[0];
  if (_isHeaderRow(sheetKey, row1)) {
    _headerOffsetMemo[sheetKey] = 1;
    return;
  }

  // Row 1 is real data -> shift all rows down and write standard headers
  sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  _headerOffsetMemo[sheetKey] = 1;
}

function _ensureAllSheetHeaders() {
  const sheets = ConfigService.getSheets();
  const keys = ['players', 'categories', 'history', 'notes', 'bareme', 'phrases', 'chat', 'auditLog', 'settings', 'altCategories', 'altHistory', 'autoRules'];
  keys.forEach(k => {
    if (sheets[k]) _ensureSheetHeaders(k, sheets[k]);
  });
}

/** 1-based index of the first data row of a sheet. */
function _firstDataRow(sheetKey, sheet) {
  return 1 + _headerOffset(sheetKey, sheet);
}

/**
 * Reads every data row of a sheet in a SINGLE range call: row 1 is fetched with the
 * rest and dropped only if it turns out to be the header. Reading rows 2..n and then
 * probing row 1 separately would double the Sheets round-trips on the hottest paths.
 * Returns { values, startRow }, startRow being the 1-based sheet row of values[0].
 */
function _readDataRows(sheetKey, sheet, numCols) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    _ensureSheetHeaders(sheetKey, sheet);
    _headerOffsetMemo[sheetKey] = 1;
    return { values: [], startRow: 2 };
  }
  const all = sheet.getRange(1, 1, lastRow, numCols).getValues();
  if (!_isHeaderRow(sheetKey, all[0])) {
    _ensureSheetHeaders(sheetKey, sheet, all);
    return { values: all, startRow: 2 };
  }
  _headerOffsetMemo[sheetKey] = 1;
  return { values: all.slice(1), startRow: 2 };
}

// ─── CONFIG SERVICE ────────────────────────────────────────────────────────────
const ConfigService = (() => {
  let _cache = null;
  let _logsCache = null;

  const getSpreadsheetId = () => {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error("Erreur de configuration : SPREADSHEET_ID est manquant.");
    return id;
  };

  const getSheets = () => {
    if (_cache) return _cache;
    try {
      const ss = SpreadsheetApp.openById(getSpreadsheetId());
      const history    = ss.getSheetByName('History');
      const players    = ss.getSheetByName('Players');
      const categories = ss.getSheetByName('Categories');
      if (!history || !players || !categories)
        throw new Error("Onglets 'History', 'Players' ou 'Categories' manquants.");
      // La feuille Notes est optionnelle : null si absente (pas d'erreur bloquante).
      const notes    = ss.getSheetByName('Notes')    || null;
      const bareme   = ss.getSheetByName('Bareme')   || null;
      const phrases  = ss.getSheetByName('Phrases')  || null;
      const auditLog = ss.getSheetByName('AuditLog') || null;
      const settings = ss.getSheetByName('Settings') || null;
      const autoRules = ss.getSheetByName('AutoRules') || null;
      const chat      = ss.getSheetByName('Chat')      || null;
      const altCategories = ss.getSheetByName('AltCategories') || null;
      const altHistory    = ss.getSheetByName('AltHistory')    || null;
      _cache = { spreadsheet: ss, history, players, categories, notes, bareme, phrases, auditLog, settings, autoRules, chat, altCategories, altHistory };
      return _cache;
    } catch(e) {
      throw new Error("Erreur de connexion BDD : " + e.message);
    }
  };

  const clearCache = () => { _cache = null; _logsCache = null; _clearHeaderOffsetMemo(); };
  const getLogsCache = () => _logsCache;
  const setLogsCache = v => { _logsCache = v; };

  return { getSheets, clearCache, getLogsCache, setLogsCache };
})();

// ─── CONCURRENCY GUARD ───────────────────────────────────────────────────────────
/**
 * Runs a mutating operation under a script-wide lock so two simultaneous users
 * cannot corrupt the spreadsheet (concurrent appends, or a deleteRow shifting the
 * row indexes another request is about to use).
 */
function withLock(operation) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  } catch (e) {
    throw new Error("Système occupé (écriture concurrente). Réessayez dans un instant.");
  }
  try {
    const result = operation();
    try { _bumpLogsVersion(); } catch (_) {}  // invalidate cross-request logs cache after any write
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Logs an error to the Apps Script execution log (the logging that was missing
 * across the backend) and returns the standard failure envelope the frontend
 * expects. Centralizes the `{ success: false, error: e.message }` line that was
 * duplicated in every api* endpoint — the returned shape is unchanged.
 */
function requireAuthor(author, password) {
  const name = author ? String(author).trim() : '';
  if (!name) throw new Error("Identité requise pour cette action.");
  let ok;
  try { ok = SettingsService.verifyIdentity(name, password); }
  catch (e) { ok = false; } // unknown/renamed-away player → never authorized
  if (!ok) throw new Error("Mot de passe invalide ou requis pour agir en tant que " + name + " — resélectionne ton identité.");
  return name;
}

function fail(e) {
  const message = (e && e.message) ? e.message : String(e);
  Logger.log('API error: ' + message + (e && e.stack ? '\n' + e.stack : ''));
  return { success: false, error: message };
}

// ─── LOGS CACHE VERSIONING ───────────────────────────────────────────────────────
// getAllLogs is cached across requests via CacheService. Every successful mutation
// bumps this version, which changes the cache key, so a reader can never be served
// stale data after a write.
function _logsVersion() {
  return PropertiesService.getScriptProperties().getProperty('logs_version') || '0';
}
function _bumpLogsVersion() {
  const p = PropertiesService.getScriptProperties();
  const next = (parseInt(p.getProperty('logs_version') || '0', 10) + 1) % 1000000000;
  p.setProperty('logs_version', String(next));
}

function _settingsVersion() {
  return PropertiesService.getScriptProperties().getProperty('settings_version') || '0';
}
function _bumpSettingsVersion() {
  const p = PropertiesService.getScriptProperties();
  const next = (parseInt(p.getProperty('settings_version') || '0', 10) + 1) % 1000000000;
  p.setProperty('settings_version', String(next));
}

function _chatVersion() {
  return PropertiesService.getScriptProperties().getProperty('chat_version') || '0';
}
function _bumpChatVersion() {
  const p = PropertiesService.getScriptProperties();
  const next = (parseInt(p.getProperty('chat_version') || '0', 10) + 1) % 1000000000;
  p.setProperty('chat_version', String(next));
}

function _baremeVersion() {
  return PropertiesService.getScriptProperties().getProperty('bareme_version') || '0';
}
function _bumpBaremeVersion() {
  const p = PropertiesService.getScriptProperties();
  const next = (parseInt(p.getProperty('bareme_version') || '0', 10) + 1) % 1000000000;
  p.setProperty('bareme_version', String(next));
}

function _phrasesVersion() {
  return PropertiesService.getScriptProperties().getProperty('phrases_version') || '0';
}
function _bumpPhrasesVersion() {
  const p = PropertiesService.getScriptProperties();
  const next = (parseInt(p.getProperty('phrases_version') || '0', 10) + 1) % 1000000000;
  p.setProperty('phrases_version', String(next));
}

function _notesVersion() {
  return PropertiesService.getScriptProperties().getProperty('notes_version') || '0';
}
function _bumpNotesVersion() {
  const p = PropertiesService.getScriptProperties();
  const next = (parseInt(p.getProperty('notes_version') || '0', 10) + 1) % 1000000000;
  p.setProperty('notes_version', String(next));
}

// ─── AUDIT SERVICE ─────────────────────────────────────────────────────────────
const AuditService = (() => {
  /** Auto-creates the AuditLog sheet if absent (same lazy pattern as Notes/Bareme). */
  function _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.auditLog) return cache.auditLog;
    const sheet = cache.spreadsheet.insertSheet('AuditLog');
    sheet.appendRow(['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    ConfigService.clearCache();
    return ConfigService.getSheets().auditLog;
  }

  /**
   * Appends one audit row. Never throws — audit failure must not break the caller.
   * Must be called inside a withLock() block (lock is already held by the caller).
   * `snapshot`, when provided, is a plain object describing how to reverse this
   * action (see AuditService.undo) — serialized to JSON in column 8. Omit it for
   * actions that cannot be safely reversed.
   */
  function log(author, action, entity, before, after, detail, snapshot) {
    try {
      const sheet = _getOrCreateSheet();
      sheet.appendRow([
        new Date(),
        author  || '',
        action  || '',
        entity  || '',
        before  || '',
        after   || '',
        detail  || '',
        snapshot ? JSON.stringify(snapshot) : '',
        ''
      ]);
    } catch (_) {}
  }

  // Snapshots go through JSON.stringify/parse (stored as text in the sheet), which
  // turns Date objects into ISO strings — so a cell must compare equal whether it's
  // still a real Date (read straight from the sheet) or that same instant round-tripped
  // through JSON. Detected by the full-timestamp shape JSON gives Dates (has a "T").
  const _ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

  /** Normalizes one sheet cell for comparison: Date (or its JSON-roundtripped ISO
   *  string) → epoch ms, else trimmed string. Duck-types Date (`getTime` function)
   *  instead of `instanceof Date` — in a VM sandbox, Date is a different constructor. */
  function _cellKey(v) {
    if (v && typeof v.getTime === 'function') return String(v.getTime());
    if (typeof v === 'string' && _ISO_TIMESTAMP.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return String(d.getTime());
    }
    return v === null || v === undefined ? '' : v.toString();
  }

  /** Restores real Date objects in a row read back from a JSON snapshot, so undo
   *  writes the same type of value to the sheet as every other write path. */
  function _reviveRow(row) {
    return row.map(v => (typeof v === 'string' && _ISO_TIMESTAMP.test(v)) ? new Date(v) : v);
  }

  function _rowsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (_cellKey(a[i]) !== _cellKey(b[i])) return false;
    return true;
  }

  /** Finds the 1-based row index of the first data row matching `values` exactly. */
  function _findRowIndex(sheetKey, sheet, values) {
    const lastRow  = sheet.getLastRow();
    const startRow = _firstDataRow(sheetKey, sheet);
    if (lastRow < startRow || !values || !values.length) return -1;
    const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, values.length).getValues();
    for (let i = 0; i < data.length; i++) if (_rowsEqual(data[i], values)) return i + startRow;
    return -1;
  }

  /** Resolves the sheet object for a snapshot's `sheet` key ('history'|'players'|...). */
  function _sheetFor(key) {
    const sheet = ConfigService.getSheets()[key];
    if (!sheet) throw new Error("Feuille introuvable pour l'annulation : " + key);
    return sheet;
  }

  /** Locates the row to act on: trust `rowIndex` if its current content still matches
   *  `expected`, else fall back to a full-sheet content search. Throws if neither works. */
  function _locate(sheetKey, sheet, rowIndex, expected) {
    if (rowIndex) {
      const current = sheet.getRange(rowIndex, 1, 1, expected.length).getValues()[0];
      if (_rowsEqual(current, expected)) return rowIndex;
    }
    const found = _findRowIndex(sheetKey, sheet, expected);
    if (found === -1) throw new Error("Impossible d'annuler : les données ont changé depuis cette action.");
    return found;
  }

  /**
   * Reverses one snapshot. Pure data restoration via direct sheet writes (setValues/
   * appendRow/deleteRow) — the same primitives every service already uses — under the
   * caller's withLock. No re-validation: we are restoring a state that was valid before.
   */
  function _applySnapshot(snapshot) {
    const sheet = _sheetFor(snapshot.sheet);
    switch (snapshot.op) {
      case 'insert': {
        const row = _locate(snapshot.sheet, sheet, snapshot.rowIndex, snapshot.after);
        sheet.deleteRow(row);
        return;
      }
      case 'delete': {
        const before = _reviveRow(snapshot.before);
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, before.length).setValues([before]);
        return;
      }
      case 'update': {
        const row = _locate(snapshot.sheet, sheet, snapshot.rowIndex, snapshot.after);
        const before = _reviveRow(snapshot.before);
        sheet.getRange(row, 1, 1, before.length).setValues([before]);
        return;
      }
      case 'insertMany': {
        snapshot.rows.forEach(r => {
          const row = _findRowIndex(snapshot.sheet, sheet, r);
          if (row !== -1) sheet.deleteRow(row);
        });
        return;
      }
      case 'deleteMany': {
        const startRow = sheet.getLastRow() + 1;
        const rows = snapshot.rows.map(_reviveRow);
        const numCols  = rows[0].length;
        sheet.getRange(startRow, 1, rows.length, numCols).setValues(rows);
        return;
      }
      case 'updateMany': {
        snapshot.rows.forEach(r => {
          const row = _locate(snapshot.sheet, sheet, r.rowIndex, r.after);
          const before = _reviveRow(r.before);
          sheet.getRange(row, 1, 1, before.length).setValues([before]);
        });
        return;
      }
      default:
        throw new Error("Type d'annulation inconnu : " + snapshot.op);
    }
  }

  /** Undoes the audit entry at 1-based sheet row `auditRowId`. Marks it as undone and
   *  appends a new "Action annulée" audit row (itself not undoable). */
  function undo(auditRowId, author) {
    const sheet = _getOrCreateSheet();
    const rowIndex = parseInt(auditRowId, 10);
    if (isNaN(rowIndex) || rowIndex < _firstDataRow('auditLog', sheet)) throw new Error("Ligne de journal invalide.");
    const row = sheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
    const action = row[2], entity = row[3], snapshotRaw = row[7], undoneAt = row[8];
    if (undoneAt) throw new Error("Cette action a déjà été annulée.");
    if (!snapshotRaw) throw new Error("Cette entrée du journal ne peut pas être annulée (créée avant l'ajout de cette fonctionnalité, ou action non réversible).");

    let snapshot;
    try { snapshot = JSON.parse(snapshotRaw); }
    catch (e) { throw new Error("Instantané d'annulation corrompu."); }

    _applySnapshot(snapshot);
    sheet.getRange(rowIndex, 9).setValue(new Date());
    log(author, 'Action annulée', entity, '', '', 'Annulation de : ' + action);
    ConfigService.clearCache();
    return { success: true, summary: action };
  }

  return { log, undo };
})();

// ─── BACKUP SERVICE ──────────────────────────────────────────────────────────────
/**
 * Manual "Snapshot" tool (Paramètres → Outils) — copies the whole spreadsheet into
 * a dedicated Drive subfolder next to the source file, as a safety net before a
 * risky manual operation. No retention policy: the user cleans up in Drive if needed.
 */
const BackupService = (() => {
  const FOLDER_NAME = 'Snapshots top-des-tops';

  /** Finds (or creates) the snapshot folder next to `sourceFile` — same parent as
   *  the source spreadsheet, or Drive root if the source has none. */
  function _snapshotFolder(sourceFile) {
    const parents = sourceFile.getParents();
    const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
    const existing = parent.getFoldersByName(FOLDER_NAME);
    if (existing.hasNext()) return existing.next();
    return parent.createFolder(FOLDER_NAME);
  }

  function _timestamp(d) {
    return d.getFullYear() + '-' + _pad2(d.getMonth() + 1) + '-' + _pad2(d.getDate()) +
      ' ' + _pad2(d.getHours()) + 'h' + _pad2(d.getMinutes());
  }

  /** Copies the live spreadsheet into the snapshot folder. Returns { name, url }. */
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

  return { createSnapshot };
})();

// ─── ORDRE (manual reorder) HELPER ──────────────────────────────────────────────
/**
 * Sorts `items` by a numeric Ordre value if every item has one (stable sort,
 * ties broken by original position); otherwise returns `items` unchanged. Never
 * writes anything — callers that need to persist a repaired Ordre do so
 * themselves, inside their own withLock() (see apiRepairOrder).
 */
function _sortByOrdreOrOriginal(items, getOrdre) {
  const parsed = items.map((item, i) => ({ item, i, ordre: Number(getOrdre(item)) }));
  const allValid = parsed.every(x => Number.isFinite(x.ordre) && x.ordre > 0);
  if (!allValid) return items;
  return parsed.sort((a, b) => (a.ordre - b.ordre) || (a.i - b.i)).map(x => x.item);
}

// ─── SETTINGS SERVICE ──────────────────────────────────────────────────────────
const SettingsService = {
  VALID_TYPES:   ['Players', 'Categories'],
  VALID_ACTIONS: ['ADD', 'DELETE', 'RENAME'],

  getEntities(type) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    if (!sheet) return [];
    const cache = CacheService.getScriptCache();
    // Row count is folded into the key so a row added/removed directly in the
    // Sheet — outside addEntity()/deleteEntity(), the only paths that bump
    // _settingsVersion() — invalidates the cache immediately instead of the
    // entity staying invisible (or a deleted one staying visible) for up to
    // CACHE_TTL_SECONDS.
    const key   = 'ent_' + type.toLowerCase() + '_v' + _settingsVersion() + '_r' + sheet.getLastRow();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const data  = sheet.getDataRange().getValues();
    if (!data.length) return [];
    let rowsData = data;
    if (!_isHeaderRow(type.toLowerCase(), data[0])) {
      _ensureSheetHeaders(type.toLowerCase(), sheet, data);
    } else {
      rowsData = data.slice(1);
    }
    let rows = rowsData
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(x => x.r[0]);
    rows = _sortByOrdreOrOriginal(rows, x => x.r[4]);
    const result = rows.map(x => {
      const r = x.r;
      if (type === 'Players') {
        // Players : [0] Name | [1] Avatar URL | [2] Hex color | [3] Password (never sent to client) | [4] Ordre
        return {
          rowIndex: x.rowIndex,
          name:  r[0].toString(),
          meta:  r[1] ? r[1].toString() : "",
          icon:  "",
          color: r[2] ? r[2].toString() : "",
          hasPassword: !!(r[3] && r[3].toString().trim())
        };
      } else {
        // Categories : [0] Name | [1] Description | [2] Emoji icon | [3] Hex color | [4] Ordre
        return {
          rowIndex: x.rowIndex,
          name:  r[0].toString(),
          meta:  r[1] ? r[1].toString() : "",
          icon:  r[2] ? r[2].toString() : "",
          color: r[3] ? r[3].toString() : ""
        };
      }
    });
    const serial = JSON.stringify(result);
    _cachePutChunked(cache, key, serial, CONFIG.CACHE_TTL_SECONDS);
    return result;
  },

  addEntity(type, name, meta, icon) {
    if (!name) throw new Error("Le nom ne peut pas être vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    _ensureSheetHeaders(type.toLowerCase(), sheet);
    const data  = sheet.getDataRange().getValues();
    const off   = _headerOffsetFromValues(type.toLowerCase(), data);
    // A duplicate name isn't just cosmetic here: deleteEntity() removes every
    // row matching a name, so two entities sharing one would both vanish on
    // what looks like a single, unitary deletion.
    if (data.some((row, i) => i >= off && row[0] === name)) {
      throw new Error(`${name} existe déjà.`);
    }
    const nextOrdre = data.slice(off).filter(r => r[0]).length + 1;
    if (type === 'Players') {
      sheet.appendRow([name, meta || "", "", "", nextOrdre]);
    } else {
      sheet.appendRow([name, meta || "", icon || "", "", nextOrdre]);
    }
    _bumpSettingsVersion();
  },

  // rowIndex + expectedName ciblent la ligne physique exacte, comme deleteEntity/
  // renameEntity : deux homonymes ne doivent plus jamais se voir attribuer la
  // couleur l'un de l'autre parce qu'un findIndex par nom retombe toujours sur
  // le premier match.
  setEntityColor(type, rowIndex, expectedName, color) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    _ensureSheetHeaders(type.toLowerCase(), sheet);
    const data  = sheet.getDataRange().getValues();
    const idx = rowIndex - 1;
    if (!data[idx] || data[idx][0] !== expectedName) {
      throw new Error(`Cette ligne a changé entre-temps — recharge la page et réessaie.`);
    }
    const colIndex = type === 'Players' ? 3 : 4;
    sheet.getRange(rowIndex, colIndex).setValue(color || "");
    _bumpSettingsVersion();
  },

  // Cible la ligne physique exacte (rowIndex, 1-based, vu par le client via
  // getEntities) plutôt que "toutes les lignes portant ce nom" : deux entités
  // homonymes ne doivent plus jamais disparaître ensemble parce qu'une seule
  // a été supprimée à l'écran. expectedName protège contre une liste devenue
  // périmée entre le chargement de la page et le clic (une autre modification
  // entre-temps a décalé les lignes) — on refuse plutôt que de risquer de
  // toucher la mauvaise ligne.
  deleteEntity(type, rowIndex, expectedName) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    _ensureSheetHeaders(type.toLowerCase(), sheet);
    const data  = sheet.getDataRange().getValues();
    const row = data[rowIndex - 1];
    if (!row || row[0] !== expectedName) {
      throw new Error(`Cette ligne a changé entre-temps — recharge la page et réessaie.`);
    }
    sheet.deleteRow(rowIndex);
    _bumpSettingsVersion();
  },

  renameEntity(type, rowIndex, oldName, newName, newMeta, newIcon) {
    if (!newName) throw new Error("Nouveau nom vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    _ensureSheetHeaders(type.toLowerCase(), sheet);
    const data  = sheet.getDataRange().getValues();
    const idx = rowIndex - 1;
    if (!data[idx] || data[idx][0] !== oldName) {
      throw new Error(`Cette ligne a changé entre-temps — recharge la page et réessaie.`);
    }
    // Renommer propage en cascade vers History/Notes/Chat/Bareme/Phrases par simple
    // correspondance de texte sur oldName (_renameInColumn, plus bas). Avec un nom
    // dupliqué sur deux lignes, ce renommage fusionnerait silencieusement l'historique
    // des DEUX entités sous un seul nom — perte de données irréversible que rowIndex
    // ne peut pas empêcher ici (History/Notes/Chat n'ont pas de colonne d'identifiant).
    // On refuse plutôt que de tenter une fusion automatique (voir §7, incident joueur
    // perdu) : l'utilisateur doit lever l'ambiguïté à la main dans le Google Sheet.
    if (data.filter((row, i) => i >= _headerOffsetFromValues(type.toLowerCase(), data) && row[0] === oldName).length > 1) {
      const label = type === 'Players' ? 'joueurs' : 'Tops';
      throw new Error(`Plusieurs ${label} partagent le nom "${oldName}" — renomme d'abord l'un des doublons directement dans le Google Sheet pour lever l'ambiguïté avant de pouvoir renommer depuis l'app.`);
    }
    if (newName !== oldName && data.some((row, i) =>
        i >= _headerOffsetFromValues(type.toLowerCase(), data) && i !== idx && row[0] === newName)) {
      throw new Error(`${newName} existe déjà.`);
    }
    if (type === 'Players') {
      const existingColor = data[idx][2] ? data[idx][2].toString() : "";
      sheet.getRange(idx + 1, 1, 1, 3).setValues([[newName, newMeta || "", existingColor]]);
    } else {
      const existingColor = data[idx][3] ? data[idx][3].toString() : "";
      sheet.getRange(idx + 1, 1, 1, 4).setValues([[newName, newMeta || "", newIcon || "", existingColor]]);
    }
    _bumpSettingsVersion();

    const histSheet = ConfigService.getSheets().history;
    const lastRow   = histSheet.getLastRow();
    const histStart = _firstDataRow('history', histSheet);
    if (lastRow >= histStart) {
      const colIndex = type === 'Players' ? 1 : 2;
      const range    = histSheet.getRange(histStart, colIndex + 1, lastRow - histStart + 1, 1);
      const vals     = range.getValues();
      let modified   = false;
      for (let i = 0; i < vals.length; i++) {
        if (vals[i][0] === oldName) { vals[i][0] = newName; modified = true; }
      }
      if (modified) range.setValues(vals);
    }

    this._renameInColumn('autoRules', ConfigService.getSheets().autoRules, type === 'Players' ? 2 : 3, oldName, newName);
    if (type === 'Players') {
      // Notes only ever reference a Player (column 2), never a Top — otherwise
      // renaming a player would silently orphan their notes (invisible in the
      // UI, which only ever groups by currently-known player names).
      this._renameInColumn('notes', ConfigService.getSheets().notes, 2, oldName, newName);
      // Chat messages reference their author by name (column 3, "Auteur") — without
      // this, a renamed player's old messages keep the stale name: unmatched by
      // cachedPlayers (generic avatar/color fallback) and unrecognized by the
      // author === _whoAmI check, silently losing the ability to delete their own
      // past messages.
      this._renameInColumn('chat', ConfigService.getSheets().chat, 3, oldName, newName);
      // Notes/Chat are cached independently of Settings (notes_all_v*/chat_msgs_v*) —
      // without these, a cached reader keeps serving the old name for up to
      // CACHE_TTL_SECONDS after this rename (audit fix 2026-08-26).
      _bumpNotesVersion();
      _bumpChatVersion();
      return;
    }

    this._renameInColumn('bareme', ConfigService.getSheets().bareme, 1, oldName, newName);

    const phrasesSheet = ConfigService.getSheets().phrases;
    if (phrasesSheet) {
      const pLastRow  = phrasesSheet.getLastRow();
      const poolStart = _firstDataRow('phrases', phrasesSheet);
      if (pLastRow >= poolStart) {
        const poolRange = phrasesSheet.getRange(poolStart, 2, pLastRow - poolStart + 1, 1);
        const poolVals  = poolRange.getValues();
        const oldPool   = 'cat:' + oldName;
        const newPool   = 'cat:' + newName;
        let poolModified = false;
        for (let i = 0; i < poolVals.length; i++) {
          if (poolVals[i][0] === oldPool) { poolVals[i][0] = newPool; poolModified = true; }
        }
        if (poolModified) poolRange.setValues(poolVals);
      }
    }
    // Bareme/Phrases are cached independently of Settings (bareme_entries_v*/
    // phrases_all_v*) — without these, a cached reader keeps serving the old
    // category name for up to CACHE_TTL_SECONDS after this rename (audit fix 2026-08-26).
    _bumpBaremeVersion();
    _bumpPhrasesVersion();
  },

  /** Renames every occurrence of oldName to newName in a single 1-based column of sheet (header row skipped when there is one). No-op if sheet is absent. */
  _renameInColumn(sheetKey, sheet, colIndex1Based, oldName, newName) {
    if (!sheet) return;
    const lastRow  = sheet.getLastRow();
    const startRow = _firstDataRow(sheetKey, sheet);
    if (lastRow < startRow) return;
    const range = sheet.getRange(startRow, colIndex1Based, lastRow - startRow + 1, 1);
    const vals  = range.getValues();
    let modified = false;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i][0] === oldName) { vals[i][0] = newName; modified = true; }
    }
    if (modified) range.setValues(vals);
  },

  /** Returns true if the given password matches the player's password (column D of Players). */
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

  // Ciblage par rowIndex (comme BaremeService.reorderEntries), pas par nom : deux
  // homonymes ne doivent plus faire échouer tout réordonnancement (un Set de noms
  // avec un doublon ne peut jamais être une permutation valide). expectedNames
  // protège en plus contre un renommage survenu entre le chargement de la page et
  // le clic — une ligne dont le nom a changé entre-temps est refusée plutôt que
  // silencieusement réordonnée sous une identité que l'utilisateur n'a pas vue.
  reorderEntities(type, orderedRowIndexes, expectedNames) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    _ensureSheetHeaders(type.toLowerCase(), sheet);
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
};

// ─── STORAGE SERVICE ───────────────────────────────────────────────────────────
const StorageService = {

  /**
   * Parses one raw History row into a normalized record with validity flags.
   * Single source of truth for how a History row is read/validated, shared by
   * getAllLogs, getHistoryPage, getDataHealth and apiDetectDistributedLots.
   * `i` is the 0-based index within the data range, `startRow` the 1-based sheet row
   * that index 0 corresponds to (2 with a header row, 1 without — see SHEET_HEADERS).
   */
  _parseHistoryRow(row, i, startRow) {
    const d        = new Date(row[0]);
    const player   = row[1] ? row[1].toString() : '';
    const category = row[2] ? row[2].toString() : '';
    const points   = parseInt(row[3], 10);
    return {
      rowIndex:    i + (startRow === undefined ? 2 : startRow),
      date:        d,
      dateValid:   !isNaN(d.getTime()),
      player,
      category,
      points,
      description: row[4] ? row[4].toString() : '',
      groupId:     row[5] ? row[5].toString() : '',
      saiseur:     row[6] ? row[6].toString() : '',
      hasEntities: !!(player && category),
      pointsValid: !(isNaN(points) || points <= 0)
    };
  },

  /**
   * Writes a whole multi-date plan in a single append.
   * plan : [{ date: 'YYYY-MM-DD', entries: [{ player, category, points, times, description }] }].
   * Each row keeps an empty groupId (column F), matching prior bulk-save behaviour.
   */
  appendBulkPlan(plan) {
    if (!plan || !plan.length) throw new Error("Aucune donnée à injecter.");

    const rows = [];
    const altEntries = [];
    const tagToRealId = {};
    const { history } = ConfigService.getSheets();
    const initialLastRow = history.getLastRow();

    plan.forEach(day => {
      if (!day.date || !day.date.trim()) throw new Error("Date manquante dans le plan.");
      const targetDate = _parseLocalDateWithNow(day.date);
      if (isNaN(targetDate.getTime())) throw new Error("Date fournie incorrecte.");
      (day.entries || []).forEach(e => {
        if (!e.player || !e.category) throw new Error("Joueur ou catégorie manquant(e).");
        const pts = parseInt(e.points, 10);
        const tms = parseInt(e.times,  10);
        if (isNaN(pts) || pts < 1)  throw new Error("Les points doivent être ≥ 1.");
        if (isNaN(tms) || tms < 1)  throw new Error("Le multiplicateur doit être ≥ 1.");

        let realGroupId = '';
        if (e.groupTag) {
          if (!tagToRealId[e.groupTag]) {
            tagToRealId[e.groupTag] = _generateGroupId();
          }
          realGroupId = tagToRealId[e.groupTag];
        } else if (e.subTops && Array.isArray(e.subTops) && e.subTops.length > 0) {
          realGroupId = _generateGroupId();
        }

        const totalPts = pts * tms;
        rows.push([targetDate, e.player, e.category, totalPts, e.description || '', realGroupId, e.saiseur || '']);
        const mainRowIndex = initialLastRow + rows.length;

        // SubTops (Multiple tops on same row)
        if (e.subTops && Array.isArray(e.subTops)) {
          e.subTops.forEach(st => {
            if (!st.category) return;
            const stPts = parseInt(st.points, 10);
            const validStPts = (isNaN(stPts) || stPts < 1) ? totalPts : stPts;
            rows.push([targetDate, e.player, st.category, validStPts, e.description || '', realGroupId, e.saiseur || '']);
          });
        }

        // Alt Tops (Inherited / Referenced)
        const altCats = e.altCategories || (e.altCategory ? [e.altCategory] : []);
        altCats.forEach(ac => {
          if (ac) {
            altEntries.push({
              date: targetDate,
              player: e.player,
              category: typeof ac === 'object' ? ac.name : ac,
              points: typeof ac === 'object' && ac.points ? parseInt(ac.points, 10) : totalPts,
              description: e.description || '',
              refHistoryRowId: mainRowIndex,
              groupId: realGroupId,
              saiseur: e.saiseur || ''
            });
          }
        });
      });
    });

    if (!rows.length) throw new Error("Aucune donnée à injecter.");

    history.getRange(initialLastRow + 1, 1, rows.length, 7).setValues(rows);

    if (altEntries.length && typeof AltStorageService !== 'undefined') {
      AltStorageService.addAltEntries(altEntries);
    }
  },

  /** Reads and parses every valid History row straight from the sheet (no cache). */
  _readLogsFromSheet() {
    const sheet   = ConfigService.getSheets().history;
    const { values, startRow } = _readDataRows('history', sheet, 4);
    return values
      .map((row, i) => {
        const rec = this._parseHistoryRow(row, i, startRow);
        if (!rec.dateValid || !rec.hasEntities || !rec.pointsValid) return null;
        return { timestamp: rec.date, player: rec.player, category: rec.category, points: rec.points };
      })
      .filter(Boolean);
  },

  /**
   * Reads every valid History row with all 7 columns (unlike _readLogsFromSheet,
   * which only keeps 4 fields for the lighter getAllLogs cache). Used by
   * getHistoryPage, which still applies its own filters/pagination on top —
   * only the sheet read itself is shared/cached.
   */
  _readFullHistoryRows() {
    const sheet   = ConfigService.getSheets().history;
    const { values, startRow } = _readDataRows('history', sheet, 7);
    return values
      .map((row, i) => {
        const rec = this._parseHistoryRow(row, i, startRow);
        if (!rec.dateValid || !rec.hasEntities || !rec.pointsValid) return null;
        return {
          date: rec.date, player: rec.player, category: rec.category, points: rec.points,
          description: rec.description, groupId: rec.groupId, saiseur: rec.saiseur,
          rowIndex: rec.rowIndex
        };
      })
      .filter(Boolean);
  },

  /**
   * Cross-request cached wrapper around _readFullHistoryRows, keyed on the same
   * write-version counter _logsVersion() as getAllLogs — invalidated by any
   * mutation (withLock bumps it), so pagination/filter changes never re-read
   * the sheet as long as nothing has been written since the last read.
   */
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

  getAllLogs() {
    const l1 = ConfigService.getLogsCache();      // within-request cache (1 read per call chain)
    if (l1) return l1;

    // Cross-request cache (CacheService), keyed by a version bumped on every write,
    // so the result is refreshed immediately after any mutation — never stale.
    const cache = CacheService.getScriptCache();
    const key   = 'logs_v' + _logsVersion();
    let result  = null;

    const raw = _cacheGetChunked(cache, key);
    if (raw) {
      try {
        result = JSON.parse(raw).map(r => ({
          timestamp: new Date(r.t), player: r.p, category: r.c, points: r.pts
        }));
      } catch (e) { result = null; }  // corrupt entry → fall back to a fresh read
    }

    if (!result) {
      result = this._readLogsFromSheet();
      const serial = JSON.stringify(result.map(l => ({
        t: l.timestamp.getTime(), p: l.player, c: l.category, pts: l.points
      })));
      _cachePutChunked(cache, key, serial, CONFIG.CACHE_TTL_SECONDS);
    }

    ConfigService.setLogsCache(result);
    return result;
  },

  getFilteredLogs(players, categories, startDate, endDate) {
    const all = this.getAllLogs();
    const start = startDate ? new Date(startDate + 'T00:00:00') : null;
    const end   = endDate   ? new Date(endDate   + 'T23:59:59') : null;

    return all.filter(log => {
      if (players    && players.length    && !players.includes(log.player))     return false;
      if (categories && categories.length && !categories.includes(log.category)) return false;
      if (start && log.timestamp < start) return false;
      if (end   && log.timestamp > end)   return false;
      return true;
    });
  },

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

  getHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText, startDate, endDate, sortDir, filterAltCategory) {
    const rows = this.getFullHistoryRowsCached();
    const hasPlayerFilter   = filterPlayers   && filterPlayers.length   > 0;
    const hasCategoryFilter = filterCategories && filterCategories.length > 0;
    const altMap = filterAltCategory ? AltStorageService.getAltHistoryMap() : null;
    // Bornes parsées en heure locale serveur (GAS tourne en UTC) ; le frontend envoie YYYY-MM-DD.
    const start = startDate ? new Date(startDate + 'T00:00:00') : null;
    const end   = endDate   ? new Date(endDate   + 'T23:59:59') : null;

    let allWithIndex = [];
    for (let i = 0; i < rows.length; i++) {
      const rec = rows[i];
      if (hasPlayerFilter   && !filterPlayers.includes(rec.player))     continue;
      if (hasCategoryFilter && !filterCategories.includes(rec.category)) continue;
      if (filterAltCategory && altMap) {
        const altCats = altMap[rec.rowIndex.toString()] || [];
        if (filterAltCategory === '__ANY__' && altCats.length === 0) continue;
        if (filterAltCategory === '__NONE__' && altCats.length > 0) continue;
        if (filterAltCategory !== '__ANY__' && filterAltCategory !== '__NONE__' && !altCats.includes(filterAltCategory)) continue;
      }
      if (start && rec.date < start) continue;
      if (end   && rec.date > end)   continue;
      if (filterText) {
        const ft = filterText.toLowerCase();
        if (!rec.player.toLowerCase().includes(ft) &&
            !rec.category.toLowerCase().includes(ft) &&
            !rec.description.toLowerCase().includes(ft)) continue;
      }
      allWithIndex.push({
        timestamp:   rec.date.toISOString(),
        player:      rec.player,
        category:    rec.category,
        points:      rec.points,
        description: rec.description,
        groupId:     rec.groupId,
        saiseur:     rec.saiseur,
        rowIndex:    rec.rowIndex
      });
    }

    // Les lignes sont en ordre chronologique (feuille). Par défaut on affiche
    // les plus récentes d'abord (desc) ; sortDir === 'asc' garde l'ordre ancien→récent.
    if (sortDir !== 'asc') allWithIndex.reverse();

    // Construire des "éléments visuels" : un groupe = 1 élément, une entrée isolée = 1 élément
    const visualItems = [];
    const groupSeen = {};
    allWithIndex.forEach(function(entry) {
      if (entry.groupId) {
        if (!groupSeen[entry.groupId]) {
          groupSeen[entry.groupId] = { type: 'group', groupId: entry.groupId, entries: [] };
          visualItems.push(groupSeen[entry.groupId]);
        }
        groupSeen[entry.groupId].entries.push(entry);
      } else {
        visualItems.push({ type: 'single', entries: [entry] });
      }
    });

    const totalVisual = visualItems.length;
    const ps        = pageSize || 20;
    const pageStart  = ((page || 1) - 1) * ps;
    const pagedItems = visualItems.slice(pageStart, pageStart + ps);

    // Aplatir pour renvoyer toutes les entrées de la page (groupes complets inclus)
    const paged = [];
    pagedItems.forEach(function(item) {
      item.entries.forEach(function(e) { paged.push(e); });
    });

    return { logs: paged, total: totalVisual, totalEntries: allWithIndex.length };
  },

  updateHistoryDescription(rowIndex, description) {
    const sheet = ConfigService.getSheets().history;
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < _firstDataRow('history', sheet)) throw new Error("Ligne invalide.");
    sheet.getRange(idx, 5).setValue(description || '');
  },

  /**
   * Updates every editable field of a single History row (date, player, category,
   * points, description). Column F (groupId) is left untouched.
   * fields : { date: 'YYYY-MM-DD', player, category, points, description }.
   */
  updateHistoryEntry(rowIndex, fields) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < _firstDataRow('history', ConfigService.getSheets().history)) throw new Error("Ligne invalide.");
    if (!fields)          throw new Error("Données manquantes.");
    if (!fields.player)   throw new Error("Joueur requis.");
    if (!fields.category) throw new Error("Top requis.");
    const pts = parseInt(fields.points, 10);
    if (isNaN(pts) || pts < 1) throw new Error("Les points doivent être ≥ 1.");
    const targetDate = _parseLocalDateWithNow(fields.date || '');
    if (isNaN(targetDate.getTime())) throw new Error("Date fournie incorrecte.");
    const sheet = ConfigService.getSheets().history;
    sheet.getRange(idx, 1, 1, 5)
      .setValues([[targetDate, fields.player, fields.category, pts, fields.description || '']]);
    sheet.getRange(idx, 7).setValue(fields.saiseur || '');
  },

  // ── OUTILS NETTOYAGE ────────────────────────────────────────────────

  /** Retourne des stats de santé du sheet sans modifier quoi que ce soit */
  getDataHealth() {
    const cache = CacheService.getScriptCache();
    const key   = 'health_v' + _logsVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { /* corrupt entry → recompute */ }
    }
    const result = this._computeDataHealth();
    _cachePutChunked(cache, key, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
    return result;
  },

  _computeDataHealth() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();

    const playersList    = SettingsService.getEntities('Players');
    const categoriesList = SettingsService.getEntities('Categories');
    // Deux lignes Joueur/Top partageant un nom cassent toute action qui adresse
    // encore par nom (renommage bloqué, voir SettingsService.renameEntity) — signalé
    // ici pour que l'utilisateur puisse lever l'ambiguïté à la main dans le Sheet.
    const duplicateNames = [];
    const flagDuplicates = (list, label) => {
      const counts = {};
      list.forEach(e => { counts[e.name] = (counts[e.name] || 0) + 1; });
      Object.keys(counts).forEach(name => { if (counts[name] > 1) duplicateNames.push(label + ' « ' + name + ' » (' + counts[name] + ')'); });
    };
    flagDuplicates(playersList, 'Joueur');
    flagDuplicates(categoriesList, 'Top');

    const { values: data, startRow } = _readDataRows('history', sheet, 4);
    if (!data.length) return { zeros: 0, orphans: 0, total: 0, duplicateNames };

    const players    = new Set(playersList.map(p => p.name));
    const categories = new Set(categoriesList.map(c => c.name));

    let zeros = 0, orphans = 0;

    data.forEach((row, idx) => {
      const rec = this._parseHistoryRow(row, idx, startRow);
      if (!rec.dateValid) return;
      if (!rec.pointsValid) zeros++;
      if (rec.player && !players.has(rec.player))         orphans++;
      else if (rec.category && !categories.has(rec.category)) orphans++;
    });

    return {
      total:  data.length,
      zeros,
      orphans,
      duplicateNames
    };
  },

  /**
   * Copies the current History sheet to a single reusable 'History_backup' tab
   * right before a destructive cleanup, so the pre-cleanup state stays recoverable.
   * The previous backup (if any) is replaced.
   */
  _backupHistory() {
    const { spreadsheet, history } = ConfigService.getSheets();
    const BACKUP_NAME = 'History_backup';
    const existing = spreadsheet.getSheetByName(BACKUP_NAME);
    if (existing) spreadsheet.deleteSheet(existing);
    history.copyTo(spreadsheet).setName(BACKUP_NAME);
  },

  /** Supprime les lignes avec points <= 0. Renvoie aussi les lignes complètes
   *  supprimées, pour permettre une annulation depuis le Journal d'audit. */
  fixZeroPoints() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    const startRow = _firstDataRow('history', sheet);
    if (lastRow < startRow) return { deleted: 0, rows: [] };
    this._backupHistory();
    const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 7).getValues();
    const rows = [];
    const deletedRowIndexes = [];
    for (let i = data.length - 1; i >= 0; i--) {
      const pts = parseInt(data[i][3], 10);
      if (isNaN(pts) || pts <= 0) {
        rows.push(data[i]);
        deletedRowIndexes.push(i + startRow);
        sheet.deleteRow(i + startRow);
      }
    }
    AltStorageService.adjustRefsAfterHistoryDelete(deletedRowIndexes);
    return { deleted: rows.length, rows };
  },

  /** Supprime les entrées dont le joueur ou la catégorie n'existe plus. Renvoie
   *  aussi les lignes complètes supprimées, pour permettre une annulation. */
  deleteOrphans() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    const startRow = _firstDataRow('history', sheet);
    if (lastRow < startRow) return { deleted: 0, rows: [] };
    this._backupHistory();
    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));
    const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 7).getValues();
    const rows = [];
    const deletedRowIndexes = [];
    for (let i = data.length - 1; i >= 0; i--) {
      const player = data[i][1] ? data[i][1].toString() : '';
      const cat    = data[i][2] ? data[i][2].toString() : '';
      if (!players.has(player) || !categories.has(cat)) {
        rows.push(data[i]);
        deletedRowIndexes.push(i + startRow);
        sheet.deleteRow(i + startRow);
      }
    }
    AltStorageService.adjustRefsAfterHistoryDelete(deletedRowIndexes);
    return { deleted: rows.length, rows };
  },

  /**
   * Outil de détection et regroupement automatique des entrées similaires non groupées.
   * Regroupe les lignes ayant la même date/horodatage, le même joueur et la même description.
   */
  apiGroupSimilarEntries() {
    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    const startRow = _firstDataRow('history', sheet);
    if (lastRow < startRow) return { groupedCount: 0, groupsCreated: 0 };

    const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 7).getValues();
    const ungrouped = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rec = this._parseHistoryRow(row, i, startRow);
      if (!rec.dateValid || !rec.player || !rec.description) continue;
      if (!rec.groupId || !rec.groupId.trim()) {
        const dateKey = rec.date.toISOString().slice(0, 16);
        const key = `${dateKey}_${rec.player.trim().toLowerCase()}_${rec.description.trim().toLowerCase()}`;
        ungrouped.push({ rowIndex: rec.rowIndex, key });
      }
    }

    const groups = {};
    ungrouped.forEach(item => {
      if (!groups[item.key]) groups[item.key] = [];
      groups[item.key].push(item.rowIndex);
    });

    let groupedCount = 0;
    let groupsCreated = 0;

    Object.keys(groups).forEach(key => {
      const rows = groups[key];
      if (rows.length >= 2) {
        const groupId = _generateGroupId();
        groupsCreated++;
        rows.forEach(rIdx => {
          sheet.getRange(rIdx, 6).setValue(groupId);
          groupedCount++;
        });
      }
    });

    if (groupedCount > 0) {
      ConfigService.clearCache();
    }
    return { groupedCount, groupsCreated };
  }
};

// ─── ALT SETTINGS SERVICE ────────────────────────────────────────────────────────
const AltSettingsService = {

  _sheet() {
    let sheet = ConfigService.getSheets().altCategories;
    if (sheet) return sheet;
    const ss = ConfigService.getSheets().spreadsheet;
    sheet = ss.insertSheet('AltCategories');
    sheet.appendRow(['Name', 'Description', 'Emoji', 'Hex color']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    ConfigService.clearCache();
    return sheet;
  },

  getAltCategories() {
    const sheet = this._sheet();
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (!data || !data.length) return [];
    if (!_isHeaderRow('altCategories', data[0])) {
      _ensureSheetHeaders('altCategories', sheet, data);
    }
    const off = _headerOffsetFromValues('altCategories', data);
    return data
      .filter((r, i) => i >= off && r[0] && r[0].toString() !== 'Name')
      .map(r => ({
        name: r[0] ? r[0].toString() : '',
        description: r[1] ? r[1].toString() : '',
        emoji: r[2] ? r[2].toString() : '🎯',
        color: r[3] ? r[3].toString() : '#7c8cff'
      }));
  },

  saveAltCategories(categories) {
    const sheet = this._sheet();
    sheet.clearContents();
    sheet.appendRow(['Name', 'Description', 'Emoji', 'Hex color']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    if (categories && categories.length) {
      const rows = categories.map(c => [c.name, c.description || '', c.emoji || '🎯', c.color || '#7c8cff']);
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    }
    ConfigService.clearCache();
  }
};

// ─── ALT STORAGE SERVICE ─────────────────────────────────────────────────────────
const AltStorageService = {

  _sheet() {
    let sheet = ConfigService.getSheets().altHistory;
    if (sheet) return sheet;
    const ss = ConfigService.getSheets().spreadsheet;
    sheet = ss.insertSheet('AltHistory');
    sheet.appendRow(['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Saiseur']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    ConfigService.clearCache();
    return sheet;
  },

  _parseAltHistoryRow(row, i, startRow) {
    const d = new Date(row[0]);
    const player = row[1] ? row[1].toString() : '';
    const category = row[2] ? row[2].toString() : '';
    const points = parseInt(row[3], 10);
    return {
      rowIndex: i + (startRow === undefined ? 2 : startRow),
      date: d,
      dateValid: !isNaN(d.getTime()),
      player,
      category,
      points,
      description: row[4] ? row[4].toString() : '',
      refHistoryRowId: row[5] ? row[5].toString() : '',
      groupId: row[6] ? row[6].toString() : '',
      saiseur: row[7] ? row[7].toString() : '',
      hasEntities: !!(player && category),
      pointsValid: !(isNaN(points) || points <= 0),
      // true when this entry was created directly in AltHistory, not derived from History
      isNative: !(row[5] && row[5].toString().trim())
    };
  },

  getAltLogs() {
    const sheet = this._sheet();
    const { values, startRow } = _readDataRows('altHistory', sheet, 8);
    return values
      .map((row, i) => {
        const rec = this._parseAltHistoryRow(row, i, startRow);
        if (!rec.dateValid || !rec.hasEntities || !rec.pointsValid) return null;
        return rec;
      })
      .filter(Boolean);
  },

  getAltHistoryMap() {
    const logs = this.getAltLogs();
    const map = {};
    logs.forEach(l => {
      if (l.refHistoryRowId) {
        const ref = l.refHistoryRowId.toString();
        if (!map[ref]) map[ref] = [];
        if (!map[ref].includes(l.category)) {
          map[ref].push(l.category);
        }
      }
    });
    return map;
  },

  getAltCategoryDetails(altCategory) {
    const logs = this.getAltLogs();
    if (!altCategory) return logs;
    return logs.filter(l => l.category === altCategory);
  },

  /**
   * `AltHistory.RefHistoryRowId` stores an absolute History row number, frozen at
   * link time. Deleting rows from History (sheet.deleteRow) shifts every row below
   * up by one without ever touching that stored number — left uncorrected, badges
   * silently drift onto the wrong entry. Call this right after any History
   * deleteRow(s) with the exact 1-based row indexes that were removed: references
   * to a deleted row are cleared (the link no longer points to anything), every
   * other reference below the deleted rows is shifted down to match.
   */
  adjustRefsAfterHistoryDelete(deletedRowIndexes) {
    const deleted = (deletedRowIndexes || [])
      .map(n => parseInt(n, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
    if (!deleted.length) return;
    const sheet = ConfigService.getSheets().altHistory;
    if (!sheet) return;
    const lastRow  = sheet.getLastRow();
    const startRow = _firstDataRow('altHistory', sheet);
    if (lastRow < startRow) return;
    const range  = sheet.getRange(startRow, 6, lastRow - startRow + 1, 1); // column F: RefHistoryRowId
    const values = range.getValues();
    let changed = false;
    for (let i = 0; i < values.length; i++) {
      const raw = values[i][0];
      if (!raw) continue;
      const ref = parseInt(raw.toString(), 10);
      if (isNaN(ref)) continue;
      if (deleted.indexOf(ref) !== -1) {
        values[i][0] = '';
        changed = true;
      } else {
        const shift = deleted.filter(d => d < ref).length;
        if (shift > 0) {
          values[i][0] = (ref - shift).toString();
          changed = true;
        }
      }
    }
    if (changed) range.setValues(values);
  },

  _buildAltRow(entry) {
    return [
      entry.date instanceof Date ? entry.date : (entry.date ? new Date(entry.date) : new Date()),
      entry.player,
      entry.category,
      parseInt(entry.points, 10) || 0,
      entry.description || '',
      entry.refHistoryRowId ? entry.refHistoryRowId.toString() : '',
      entry.groupId || '',
      entry.saiseur || ''
    ];
  },

  /**
   * Unlike addNativeAltEntries, this is called after the main History rows for
   * the same plan are already written (StorageService.appendBulkPlan) — it
   * cannot throw on a bad entry without reporting the whole submission as
   * failed when the History part actually succeeded. Invalid entries are
   * dropped instead of silently written with 0 points.
   */
  addAltEntries(entries) {
    if (!entries || !entries.length) return;
    const valid = entries.filter(e => {
      const pts = parseInt(e.points, 10);
      return e.player && e.category && !isNaN(pts) && pts >= 1;
    });
    if (!valid.length) return;
    const sheet = this._sheet();
    const rows = valid.map(e => this._buildAltRow(e));
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
    ConfigService.clearCache();
  },

  /**
   * Appends native Alt entries (created directly in AltHistory, not derived from History).
   * refHistoryRowId is intentionally left empty to distinguish them from linked entries.
   */
  addNativeAltEntries(entries) {
    if (!entries || !entries.length) return 0;
    const allPlayers = SettingsService.getEntities('Players').map(p => p.name);
    const allAltCats = AltSettingsService.getAltCategories().map(c => c.name);
    const sheet      = this._sheet();

    // Validate everything before the single setValues(): a throw halfway must
    // leave the sheet untouched, not half-written.
    const rows = entries.map(e => {
      if (!e.player || !allPlayers.includes(e.player)) throw new Error('Joueur invalide : ' + e.player);
      if (!e.altCategory || !allAltCats.includes(e.altCategory)) throw new Error('Top Alternatif invalide : ' + e.altCategory);
      const pts = parseInt(e.points, 10);
      if (isNaN(pts) || pts < 1) throw new Error('Les points doivent être ≥ 1.');
      const targetDate = e.date ? new Date(e.date) : new Date();
      if (isNaN(targetDate.getTime())) throw new Error('Date invalide : ' + e.date);
      return this._buildAltRow({
        date: targetDate,
        player: e.player,
        category: e.altCategory,
        points: pts,
        description: e.description,
        refHistoryRowId: '',   // empty marks the entry as native
        groupId: '',
        saiseur: e.saiseur
      });
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
    ConfigService.clearCache();
    return rows.length;
  },

  /**
   * Deletes one native AltHistory row (empty refHistoryRowId) by its sheet row
   * index. The guard re-checks the row content because the index was captured
   * when the manager modal rendered: another write may have shifted rows since.
   */
  deleteNativeAltEntry(rowIndex, altCategory, guard) {
    const idx = parseInt(rowIndex, 10);
    const sheet = this._sheet();
    if (isNaN(idx) || idx < _firstDataRow('altHistory', sheet)) throw new Error('Ligne invalide.');
    if (idx > sheet.getLastRow()) throw new Error("Cette entrée n'existe plus. Rechargez la liste.");

    const row = sheet.getRange(idx, 1, 1, 8).getValues()[0];
    if (row[5] && row[5].toString().trim()) {
      throw new Error("Cette entrée est liée à l'historique principal : utilisez « Retirer ».");
    }
    if (altCategory && (row[2] ? row[2].toString() : '') !== altCategory) {
      throw new Error("Cette entrée n'appartient pas à ce Top Alternatif.");
    }
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
  },

  linkHistoryRowsToAltCategory(rowIndices, altCategory, saiseur) {
    if (!rowIndices || !rowIndices.length || !altCategory) return 0;
    const fullHistory = StorageService.getFullHistoryRowsCached();
    const rowMap = {};
    fullHistory.forEach(r => { rowMap[r.rowIndex] = r; });

    // Existing ref IDs in this alt category for deduplication
    const existingLogs = this.getAltLogs().filter(l => l.category === altCategory);
    const existingRefs = new Set(existingLogs.map(l => l.refHistoryRowId ? l.refHistoryRowId.toString() : ''));

    const entriesToAdd = [];
    rowIndices.forEach(idx => {
      const histItem = rowMap[idx];
      if (histItem && !existingRefs.has(histItem.rowIndex.toString())) {
        entriesToAdd.push({
          date: histItem.date,
          player: histItem.player,
          category: altCategory,
          points: histItem.points,
          description: histItem.description,
          refHistoryRowId: histItem.rowIndex,
          groupId: histItem.groupId || '',
          saiseur: saiseur || histItem.saiseur || ''
        });
      }
    });

    if (entriesToAdd.length) {
      this.addAltEntries(entriesToAdd);
    }
    return entriesToAdd.length;
  },

  unlinkHistoryRowsFromAltCategory(rowIndices, altCategory, saiseur) {
    if (!rowIndices || !rowIndices.length) return 0;
    const sheet = this._sheet();
    const lastRow  = sheet.getLastRow();
    const startRow = _firstDataRow('altHistory', sheet);
    if (lastRow < startRow) return 0;

    const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 8).getValues();
    const targetRefIds = new Set(rowIndices.map(r => r.toString()));

    const rowsToDelete = [];
    for (let i = values.length - 1; i >= 0; i--) {
      const rowRefId = values[i][5] ? values[i][5].toString() : '';
      const rowAltCat = values[i][2] ? values[i][2].toString() : '';
      const altRowIndex = i + startRow;

      // Match the History row id column only: AltHistory row indexes are a
      // different numbering, and accepting both deletes unrelated native rows.
      const matchesRef = !!rowRefId && targetRefIds.has(rowRefId);
      const matchesCat = !altCategory || rowAltCat === altCategory;
      if (matchesRef && matchesCat) {
        rowsToDelete.push(altRowIndex);
      }
    }

    rowsToDelete.forEach(rIdx => {
      sheet.deleteRow(rIdx);
    });

    if (rowsToDelete.length) {
      ConfigService.clearCache();
    }
    return rowsToDelete.length;
  }
};

// ─── NOTES SERVICE ─────────────────────────────────────────────────────────────
const NotesService = {

  /** Renvoie la feuille Notes, en la CRÉANT automatiquement si elle n'existe pas. */
  _sheet() {
    let sheet = ConfigService.getSheets().notes;
    if (sheet) { this._ensureColumns(sheet); return sheet; }
    const ss = ConfigService.getSheets().spreadsheet;
    sheet = ss.insertSheet('Notes');
    sheet.appendRow(['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    ConfigService.clearCache();
    return sheet;
  },

  /** Migration douce : pose les en-têtes NoteId/CrééPar/ModifiéPar/ModifiéLe si absents
   *  (feuilles créées avant leur introduction, y compris les anciens schémas — leurs
   *  valeurs, jamais renseignées en pratique, sont simplement écrasées). Créé par/
   *  Modifié par sont stockés directement sur la ligne (pas dérivés du Journal) :
   *  simple et fiable, écrits une fois par addNote()/editNote(), lus tels quels. Le
   *  NoteId, lui, ne sert qu'à retrouver l'historique détaillé dans le Journal. */
  _ensureColumns(sheet) {
    // Without a header row, row 1 holds a real note: writing labels over columns
    // D-G would wipe its NoteId/author/edit metadata. Nothing to label then.
    if (!_headerOffset('notes', sheet)) return;
    if (sheet.getRange(1, 4, 1, 1).getValue() === 'NoteId') return;
    sheet.getRange(1, 4, 1, 4).setValues([['NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe']]);
    sheet.getRange(1, 4, 1, 4).setFontWeight('bold');
  },

  /** Toutes les notes (récentes d'abord). Lecture tolérante : pas de feuille → liste vide. */
  getAllNotes() {
    const cache = CacheService.getScriptCache();
    const key   = 'notes_all_v' + _notesVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const sheet = ConfigService.getSheets().notes;
    if (!sheet) return { notes: [] };   // pas encore de feuille (aucune note créée)
    const { values: data, startRow } = _readDataRows('notes', sheet, 7);
    if (!data.length) return { notes: [] };
    const out = [];
    for (let i = 0; i < data.length; i++) {
      const row    = data[i];
      const player = row[1] ? row[1].toString() : '';
      const text   = row[2] ? row[2].toString() : '';
      if (!player && !text) continue;
      const d = new Date(row[0]);
      const editedAt = row[6] ? new Date(row[6]) : null;
      out.push({
        timestamp: isNaN(d.getTime()) ? null : d.toISOString(),
        player,
        text,
        rowIndex: i + startRow,
        noteId: row[3] ? row[3].toString() : '',
        createdBy: row[4] ? row[4].toString() : '',
        lastEditedBy: row[5] ? row[5].toString() : '',
        lastEditedAt: (editedAt && !isNaN(editedAt.getTime())) ? editedAt.toISOString() : null
      });
    }
    out.reverse();
    const result = { notes: out };
    _cachePutChunked(cache, key, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
    return result;
  },

  addNote(player, text, dateStr, author) {
    if (!player) throw new Error("Joueur manquant.");
    if (!text || !text.trim()) throw new Error("La note ne peut pas être vide.");

    const targetDate = (dateStr && dateStr.trim()) ? _parseLocalDateWithNow(dateStr) : new Date();
    if (isNaN(targetDate.getTime())) throw new Error("Date fournie incorrecte.");

    const sheet = this._sheet();
    const noteId = _generateGroupId();
    sheet.appendRow([targetDate, player, text.trim(), noteId, author || '', '', '']);
    _bumpNotesVersion();
    return {
      rowIndex: sheet.getLastRow(), timestamp: targetDate.toISOString(), player, text: text.trim(),
      noteId, createdBy: author || '', lastEditedBy: '', lastEditedAt: null
    };
  },

  deleteNote(rowIndex) {
    const sheet = this._sheet();
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < _firstDataRow('notes', sheet)) throw new Error("Ligne invalide.");
    sheet.deleteRow(idx);
    _bumpNotesVersion();
  },

  /** Renvoie le NoteId de la ligne éditée (le génère à la volée si la note est
   *  antérieure à l'introduction du suivi — elle devient traçable dès cette édition,
   *  sans attendre un rattachement rétroactif). Écrit ModifiéPar/ModifiéLe directement. */
  editNote(rowIndex, newText, editor) {
    const sheet = this._sheet();
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < _firstDataRow('notes', sheet)) throw new Error("Ligne invalide.");
    if (!newText || !newText.trim()) throw new Error("La note ne peut pas être vide.");
    sheet.getRange(idx, 3).setValue(newText.trim());
    let noteId = sheet.getRange(idx, 4).getValue();
    noteId = noteId ? noteId.toString() : '';
    if (!noteId) {
      noteId = _generateGroupId();
      sheet.getRange(idx, 4).setValue(noteId);
    }
    sheet.getRange(idx, 6, 1, 2).setValues([[editor || '', new Date()]]);
    _bumpNotesVersion();
    return noteId;
  },

  /** Lit le NoteId stocké à une ligne donnée (utilisé par les endpoints api* pour
   *  écrire un Détail de journal stable, indépendant du numéro de ligne). */
  noteIdAt(rowIndex) {
    const sheet = this._sheet();
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < _firstDataRow('notes', sheet)) return '';
    const v = sheet.getRange(idx, 4).getValue();
    return v ? v.toString() : '';
  }
};

// ─── CHAT SERVICE ──────────────────────────────────────────────────────────────
const ChatService = {

  // Volume borné : l'app cible un petit groupe de joueurs, pas un historique
  // illimité — au-delà, les plus anciens messages sortent simplement de la vue.
  MAX_MESSAGES: 500,

  /** Renvoie la feuille Chat, en la CRÉANT automatiquement si elle n'existe pas. */
  _sheet() {
    let sheet = ConfigService.getSheets().chat;
    if (sheet) return sheet;
    const ss = ConfigService.getSheets().spreadsheet;
    sheet = ss.insertSheet('Chat');
    sheet.appendRow(['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    ConfigService.clearCache();
    return sheet;
  },

  /** Tous les messages (les plus anciens d'abord). L'aperçu du message cité par une
   *  réponse est résolu ici, côté serveur, pour survivre même si l'original est
   *  supprimé entre-temps (replyToDeleted). */
  getAllMessages() {
    const cache = CacheService.getScriptCache();
    const key   = 'chat_msgs_v' + _chatVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const sheet = ConfigService.getSheets().chat;
    if (!sheet) return { messages: [] };
    const { values: data, startRow } = _readDataRows('chat', sheet, 5);
    if (!data.length) return { messages: [] };
    const byId = {};
    const rows = [];
    for (let i = 0; i < data.length; i++) {
      const row    = data[i];
      const id     = row[0] ? row[0].toString() : '';
      const author = row[2] ? row[2].toString() : '';
      const text   = row[3] ? row[3].toString() : '';
      if (!id || (!author && !text)) continue;
      const d = new Date(row[1]);
      const msg = {
        id,
        timestamp: isNaN(d.getTime()) ? null : d.toISOString(),
        author,
        text,
        replyToId: row[4] ? row[4].toString() : '',
        rowIndex: i + startRow
      };
      byId[id] = msg;
      rows.push(msg);
    }
    rows.forEach(msg => {
      if (!msg.replyToId) return;
      const original = byId[msg.replyToId];
      msg.replyToAuthor  = original ? original.author : '';
      msg.replyToText    = original ? original.text   : '';
      msg.replyToDeleted = !original;
    });
    const result = { messages: rows.slice(-ChatService.MAX_MESSAGES) };
    _cachePutChunked(cache, key, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
    return result;
  },

  postMessage(author, text, replyToId) {
    if (!author) throw new Error("Identité manquante.");
    if (!text || !text.trim()) throw new Error("Le message ne peut pas être vide.");
    const trimmed = text.trim();
    if (trimmed.length > 2000) throw new Error("Message trop long (2000 caractères max).");

    const sheet = this._sheet();
    const id = Utilities.getUuid();
    const now = new Date();
    sheet.appendRow([id, now, author, trimmed, replyToId || '']);
    _bumpChatVersion();
    return { id, rowIndex: sheet.getLastRow(), timestamp: now.toISOString(), author, text: trimmed, replyToId: replyToId || '' };
  },

  /** Supprime un message — uniquement si `author` en est bien l'auteur. */
  deleteMessage(id, author) {
    const sheet = ConfigService.getSheets().chat;
    if (!sheet) throw new Error("Message introuvable.");
    const lastRow  = sheet.getLastRow();
    const startRow = _firstDataRow('chat', sheet);
    if (lastRow < startRow) throw new Error("Message introuvable.");
    const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === id) {
        const rowAuthor = data[i][2] ? data[i][2].toString() : '';
        if (rowAuthor !== author) throw new Error("Tu ne peux supprimer que tes propres messages.");
        sheet.deleteRow(i + startRow);
        _bumpChatVersion();
        return { deletedRow: data[i] };
      }
    }
    throw new Error("Message introuvable.");
  }
};

// ─── ANALYTICS SERVICE ─────────────────────────────────────────────────────────
const AnalyticsService = {

  _aggregate(logs, players, categories) {
    const scores = {};
    players.forEach(p => {
      scores[p] = { total: 0 };
      categories.forEach(c => { scores[p][c] = 0; });
    });
    let orphanCount = 0;
    logs.forEach(log => {
      if (scores[log.player] !== undefined &&
          scores[log.player][log.category] !== undefined) {
        scores[log.player][log.category] += log.points;
        scores[log.player].total         += log.points;
      } else {
        orphanCount++;
      }
    });
    return { scores, orphanCount };
  },

  generateInsights(scores, categories, orphanCount) {
    const narrative      = [];
    const categoryWinners = {};
    const topOfTops      = {};
    Object.keys(scores).forEach(p => { topOfTops[p] = 0; });

    categories.forEach(cat => {
      let maxScore = 0, winners = [];
      Object.keys(scores).forEach(p => {
        const s = scores[p][cat];
        if (s > maxScore)                  { maxScore = s; winners = [p]; }
        else if (s === maxScore && s > 0)  { winners.push(p); }
      });
      if (maxScore > 0) {
        categoryWinners[cat] = { names: winners, score: maxScore };
        winners.forEach(w => topOfTops[w]++);
      }
    });

    Object.keys(categoryWinners).forEach(cat => {
      narrative.push(`• [${cat.toUpperCase()}] : ${categoryWinners[cat].names.join(" & ")} domine avec ${categoryWinners[cat].score} pts.`);
    });

    let ultimateWinners = [], maxTop = 0;
    Object.keys(topOfTops).forEach(p => {
      if (topOfTops[p] > maxTop)                    { maxTop = topOfTops[p]; ultimateWinners = [p]; }
      else if (topOfTops[p] === maxTop && maxTop > 0) { ultimateWinners.push(p); }
    });
    if (ultimateWinners.length) {
      const plural = ultimateWinners.length > 1;
      narrative.push(`\n🏆 VERDICT : ${ultimateWinners.join(" & ")} ${plural ? "sont co-" : "est "}sacré${plural ? "s" : ""} Top 1 des Tops.`);
    }
    if (orphanCount > 0) {
      narrative.push(`\n⚠️ ${orphanCount} entrée(s) non attribuée(s) (joueur/catégorie supprimé(e)).`);
    }
    return narrative.length
      ? narrative.join("\n")
      : "Aucune infraction détectée sur cette période.";
  },

  getFilteredChartData(players, categories, startDate, endDate) {
    const logs = StorageService.getFilteredLogs(
      players    && players.length    ? players    : null,
      categories && categories.length ? categories : null,
      startDate || null,
      endDate   || null
    );

    const allPlayers    = SettingsService.getEntities('Players');
    const allCategories = SettingsService.getEntities('Categories');
    const allPlayerNames    = allPlayers.map(p => p.name);
    const allCategoryNames  = allCategories.map(c => c.name);

    const displayPlayers    = (players    && players.length)    ? players    : allPlayerNames;
    const displayCategories = (categories && categories.length) ? categories : allCategoryNames;

    const { scores } = this._aggregate(logs, displayPlayers, displayCategories);

    const defaultColors = ['#ff4757','#00d4aa','#ffd166','#6c63ff','#ff6b81','#3742fa'];
    const catColorMap = {};
    allCategories.forEach(c => { if (c.color) catColorMap[c.name] = c.color; });
    const datasets = displayCategories.map((cat, i) => ({
      label:           cat,
      data:            displayPlayers.map(p => (scores[p] && scores[p][cat]) || 0),
      backgroundColor: catColorMap[cat] || defaultColors[i % defaultColors.length],
      borderRadius:    4
    }));

    return { labels: displayPlayers, datasets };
  },

  /**
   * Données temporelles pour le graphique courbe.
   * Retourne { labels: ['2024-01', ...], series: { joueur: [cumul, ...] } }
   */
  getTrendData(players, categories, startDate, endDate) {
    const logs = StorageService.getFilteredLogs(
      players    && players.length    ? players    : null,
      categories && categories.length ? categories : null,
      startDate || null,
      endDate   || null
    );

    if (!logs.length) return { labels: [], series: {} };

    const pad = _pad2;
    const dayKey   = _dayKey;
    const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
    const startOfWeek = d => {
      const t = new Date(d); t.setHours(0,0,0,0);
      t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // lundi
      return t;
    };

    // Bornes de la plage : paramètres si fournis, sinon min/max des données.
    const minLog = logs.reduce((m, l) => l.timestamp < m ? l.timestamp : m, logs[0].timestamp);
    const maxLog = logs.reduce((m, l) => l.timestamp > m ? l.timestamp : m, logs[0].timestamp);
    const start = startDate ? new Date(startDate + 'T00:00:00') : new Date(minLog);
    const end   = endDate   ? new Date(endDate   + 'T23:59:59') : new Date(maxLog);
    const diffDays = (end - start) / (1000 * 86400);

    // Granularité adaptée pour avoir assez de points sans en avoir trop.
    const gran = diffDays <= 31 ? 'day' : (diffDays <= 183 ? 'week' : 'month');
    const keyFor = d => gran === 'day' ? dayKey(d) : (gran === 'week' ? dayKey(startOfWeek(d)) : monthKey(d));

    const allPlayers = players && players.length
      ? players
      : SettingsService.getEntities('Players').map(p => p.name);

    // 1) On génère TOUS les créneaux de la plage (même vides) → courbe continue.
    const labels = [];
    if (gran === 'month') {
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cur <= last) { labels.push(monthKey(cur)); cur.setMonth(cur.getMonth() + 1); }
    } else {
      const step = gran === 'week' ? 7 : 1;
      const cur  = gran === 'week' ? startOfWeek(start) : new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = gran === 'week' ? startOfWeek(end)   : new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur <= last) { labels.push(dayKey(cur)); cur.setDate(cur.getDate() + step); }
    }

    // 2) Agrégation des points par créneau + joueur.
    const bucketMap = {}; // { key: { player: points } }
    logs.forEach(log => {
      if (!allPlayers.includes(log.player)) return;
      const k = keyFor(log.timestamp);
      if (!bucketMap[k]) bucketMap[k] = {};
      bucketMap[k][log.player] = (bucketMap[k][log.player] || 0) + log.points;
    });

    // 3) Cumul par joueur sur l'axe complet (les créneaux vides reportent le cumul).
    const series = {};
    allPlayers.forEach(p => {
      let cum = 0;
      series[p] = labels.map(k => {
        cum += (bucketMap[k] && bucketMap[k][p]) || 0;
        return cum;
      });
    });

    return { labels, series, granularity: gran };
  }
};

// ─── API ENDPOINTS ─────────────────────────────────────────────────────────────

/**
 * Device routing: ?view=mobile serves Mobile.html, anything else (?view=desktop,
 * no param at all, or an unrecognized value) serves Index.html.
 *
 * There used to be a third case here: a tiny auto-redirect page shown on a bare
 * /exec visit, which read localStorage and screen width to pick a view, then
 * navigated itself to ?view=<mobile|desktop>. The deployed sandbox iframe silently
 * blocks any script-triggered navigation that isn't the result of a real user
 * click (confirmed: typing ?view=desktop by hand always works; the automatic
 * redirect never did, whether served as a raw string or as its own file) — so
 * that page never got anywhere and the app stayed stuck on "Chargement…".
 * Defaulting straight to desktop matches the project's stated primary usage
 * (PC first); the existing 🖥️/📱 toggle button — a real click, so it isn't
 * blocked — lets a visitor switch to mobile, and that choice is remembered via
 * ?view= on every link/bookmark they use afterwards.
 */
function doGet(e) {
  // createHtmlOutputFromFile (pas de rendu templaté) : Index.html ne contient
  // plus aucun scriptlet <?  ?> à évaluer, et le moteur de template de GAS
  // corrompt silencieusement les très gros fichiers HTML qui en contiennent
  // (constaté en v3.5.0 : ~28 000 caractères tronqués côté serveur, provoquant
  // une SyntaxError au chargement et une interface totalement vide).
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Tops des Tops')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function apiGetSettings() {
  try {
    return {
      success:    true,
      players:    SettingsService.getEntities('Players'),
      categories: SettingsService.getEntities('Categories')
    };
  } catch(e) { return fail(e); }
}

function apiGetAppSettings() {
  try {
    const all = SettingsSheetService.getAll();
    let tooltipStyle = null;
    if (all.tooltip_style) {
      try { tooltipStyle = JSON.parse(all.tooltip_style); } catch (_) {}
    }
    return {
      success:      true,
      appTitle:     all.app_title || 'Tops des Tops',
      logoUrl:      all.logo_url  || '',
      tooltipStyle: tooltipStyle
    };
  } catch(e) { return fail(e); }
}

function apiSaveAppSettings(title, logoUrl, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      SettingsSheetService.setValue('app_title', (title || '').trim());
      SettingsSheetService.setValue('logo_url', (logoUrl || '').trim());
      AuditService.log(author, 'Identité app modifiée', 'Settings', '', (title || '').trim(), '');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiSaveTooltipStyle(prefsJson, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      SettingsSheetService.setValue('tooltip_style', (prefsJson || '').trim());
      AuditService.log(author, 'Style infobulle modifié', 'Settings', '', 'Mise à jour infobulles', '');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

// ─── SETTINGS SHEET SERVICE ────────────────────────────────────────────────────
// Sheet "Settings" : [0] Key | [1] Value  (optional sheet, auto-created)
const SettingsSheetService = {
  _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.settings) return cache.settings;
    const sheet = cache.spreadsheet.insertSheet('Settings');
    sheet.appendRow(['Key', 'Value']);
    sheet.appendRow(['app_title', '']);
    sheet.appendRow(['logo_url', '']);
    ConfigService.clearCache();
    return ConfigService.getSheets().settings;
  },

  /** Read-only: never auto-creates. Returns {} if the sheet doesn't exist yet. */
  getAll() {
    const sheet = ConfigService.getSheets().settings;
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    if (data.length && !_isHeaderRow('settings', data[0])) {
      _ensureSheetHeaders('settings', sheet, data);
    }
    const result = {};
    for (let i = _headerOffsetFromValues('settings', data); i < data.length; i++) {
      if (data[i][0]) result[data[i][0].toString()] = data[i][1] ? data[i][1].toString() : '';
    }
    return result;
  },

  setValue(key, value) {
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    for (let i = _headerOffsetFromValues('settings', data); i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        return;
      }
    }
    sheet.appendRow([key, value]);
  }
};

// ─── BAREME SERVICE ────────────────────────────────────────────────────────────
// Sheet "Bareme" : [0] Top (category name) | [1] Action | [2] Points
const BaremeService = {
  _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.bareme) return cache.bareme;
    const sheet = cache.spreadsheet.insertSheet('Bareme');
    sheet.appendRow(['Top', 'Action', 'Points', 'Ordre']);
    ConfigService.clearCache();
    return ConfigService.getSheets().bareme;
  },

  /** Returns all entries with 1-based sheet row indices (row 1 is data unless it holds the header labels). */
  getEntries() {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) return [];
    const cache = CacheService.getScriptCache();
    // Same row-count-in-key fix as SettingsService.getEntities — a rule added/
    // removed directly in the Bareme sheet doesn't bump _baremeVersion().
    const key   = 'bareme_entries_v' + _baremeVersion() + '_r' + sheet.getLastRow();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const data = sheet.getDataRange().getValues();
    if (!data.length) return [];
    let rowsData = data;
    if (!_isHeaderRow('bareme', data[0])) {
      _ensureSheetHeaders('bareme', sheet, data);
    } else {
      rowsData = data.slice(1);
    }
    let rows = rowsData
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(x => x.r[0] !== "" && x.r[0] !== undefined);
    const groups = {};
    const groupOrder = [];
    rows.forEach(x => {
      const k = x.r[0];
      if (!groups[k]) { groups[k] = []; groupOrder.push(k); }
      groups[k].push(x);
    });
    const ordered = [];
    groupOrder.forEach(k => { ordered.push.apply(ordered, _sortByOrdreOrOriginal(groups[k], x => x.r[3])); });
    rows.length = ordered.length;
    for (let i = 0; i < ordered.length; i++) rows[i] = ordered[i];
    const result = rows.map(x => ({
      rowIndex: x.rowIndex,
      top:      x.r[0].toString(),
      action:   x.r[1] ? x.r[1].toString() : "",
      pts:      x.r[2] !== "" && x.r[2] !== undefined ? Number(x.r[2]) : 0
    }));
    const serial = JSON.stringify(result);
    _cachePutChunked(cache, key, serial, CONFIG.CACHE_TTL_SECONDS);
    return result;
  },

  addEntry(top, action, pts) {
    if (!top   || !top.trim())    throw new Error("Top manquant.");
    if (!action || !action.trim()) throw new Error("Action vide.");
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    const nextOrdre = data.slice(_headerOffsetFromValues('bareme', data)).filter(r => r[0] === top.trim()).length + 1;
    sheet.appendRow([top.trim(), action.trim(), Number(pts) || 0, nextOrdre]);
    _bumpBaremeVersion();
  },

  updateEntry(rowIndex, action, pts) {
    if (!action || !action.trim()) throw new Error("Action vide.");
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    sheet.getRange(rowIndex, 2, 1, 2).setValues([[action.trim(), Number(pts) || 0]]);
    _bumpBaremeVersion();
  },

  deleteEntry(rowIndex) {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    sheet.deleteRow(rowIndex);
    _bumpBaremeVersion();
  },

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
};

// ─── PHRASES SERVICE ───────────────────────────────────────────────────────────
// Sheet "Phrases" : [0] Preset | [1] Pool | [2] Text
const PhrasesService = {
  VALID_POOLS: ['first', 'second', 'third', 'mid', 'last', 'tied', 'solo'],

  _isValidPool(pool) {
    return this.VALID_POOLS.includes(pool) || /^cat:.+/.test(pool);
  },

  _getOrCreateSheet() {
    const cache = ConfigService.getSheets();
    if (cache.phrases) return cache.phrases;
    const sheet = cache.spreadsheet.insertSheet('Phrases');
    sheet.appendRow(['Preset', 'Pool', 'Phrase', 'Ordre']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    ConfigService.clearCache();
    return ConfigService.getSheets().phrases;
  },

  getAll() {
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) return [];
    const cache = CacheService.getScriptCache();
    // Same row-count-in-key fix as SettingsService.getEntities — a phrase added/
    // removed directly in the Phrases sheet doesn't bump _phrasesVersion().
    const key   = 'phrases_all_v' + _phrasesVersion() + '_r' + sheet.getLastRow();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const data = sheet.getDataRange().getValues();
    if (!data.length) return [];
    let rowsData = data;
    if (!_isHeaderRow('phrases', data[0])) {
      _ensureSheetHeaders('phrases', sheet, data);
    } else {
      rowsData = data.slice(1);
    }
    let rows = rowsData
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(x => x.r[0] !== '' && x.r[2] !== '');
    const groups = {};
    const groupOrder = [];
    rows.forEach(x => {
      const k = x.r[0] + '|' + x.r[1];
      if (!groups[k]) { groups[k] = []; groupOrder.push(k); }
      groups[k].push(x);
    });
    const ordered = [];
    groupOrder.forEach(k => { ordered.push.apply(ordered, _sortByOrdreOrOriginal(groups[k], x => x.r[3])); });
    rows.length = ordered.length;
    for (let i = 0; i < ordered.length; i++) rows[i] = ordered[i];
    const result = rows.map(x => ({
      rowIndex: x.rowIndex,
      preset:   x.r[0].toString(),
      pool:     x.r[1].toString(),
      text:     x.r[2].toString()
    }));
    const serial = JSON.stringify(result);
    _cachePutChunked(cache, key, serial, CONFIG.CACHE_TTL_SECONDS);
    return result;
  },

  addPhrase(preset, pool, text) {
    if (!preset || !pool || !text || !text.trim()) throw new Error("Champs manquants.");
    if (!this._isValidPool(pool)) throw new Error("Pool invalide : " + pool);
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    const nextOrdre = data.slice(_headerOffsetFromValues('phrases', data)).filter(r => r[0] === preset.trim() && r[1] === pool).length + 1;
    sheet.appendRow([preset.trim(), pool, text.trim(), nextOrdre]);
    _bumpPhrasesVersion();
  },

  saveBatch(entries) {
    if (!entries || !entries.length) return;
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    const groupCounts = {};
    data.slice(_headerOffsetFromValues('phrases', data)).forEach(r => {
      if (r[0] === '' || r[0] === undefined) return;
      const key = r[0] + '|' + r[1];
      groupCounts[key] = (groupCounts[key] || 0) + 1;
    });
    const rows = entries.map(e => {
      if (!this._isValidPool(e.pool)) throw new Error("Pool invalide : " + e.pool);
      const key = e.preset.trim() + '|' + e.pool;
      groupCounts[key] = (groupCounts[key] || 0) + 1;
      return [e.preset.trim(), e.pool, e.text.trim(), groupCounts[key]];
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    _bumpPhrasesVersion();
  },

  updatePhrase(rowIndex, text) {
    const idx = parseInt(rowIndex, 10);
    if (!text || !text.trim()) throw new Error("La phrase ne peut pas être vide.");
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    if (isNaN(idx) || idx < _firstDataRow('phrases', sheet)) throw new Error("Ligne invalide.");
    sheet.getRange(idx, 3).setValue(text.trim());
    _bumpPhrasesVersion();
  },

  deletePhrase(rowIndex) {
    const idx = parseInt(rowIndex, 10);
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    if (isNaN(idx) || idx < _firstDataRow('phrases', sheet)) throw new Error("Ligne invalide.");
    sheet.deleteRow(idx);
    _bumpPhrasesVersion();
  },

  deletePreset(presetName) {
    if (!presetName) throw new Error("Nom de preset manquant.");
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) return;
    const lastRow  = sheet.getLastRow();
    const startRow = _firstDataRow('phrases', sheet);
    if (lastRow < startRow) return;
    const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 1).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][0].toString() === presetName) sheet.deleteRow(i + startRow);
    }
    _bumpPhrasesVersion();
  },

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
};

function apiGetBareme() {
  try {
    return { success: true, entries: BaremeService.getEntries() };
  } catch(e) { return fail(e); }
}

function apiAddBaremeEntry(top, action, pts, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      BaremeService.addEntry(top, action, pts);
      const after = [top || '', action || '', String(Number(pts) || 0) + ' pts'].join(' | ');
      const sheet = ConfigService.getSheets().bareme;
      AuditService.log(author, 'Règle ajoutée', 'Barème', '', after, '',
        { sheet: 'bareme', op: 'insert', rowIndex: sheet.getLastRow(),
          after: sheet.getRange(sheet.getLastRow(), 1, 1, 3).getValues()[0] });
      ConfigService.clearCache();
      return { success: true, entries: BaremeService.getEntries() };
    });
  } catch(e) { return fail(e); }
}

function apiReorderBareme(topName, orderedRowIndexes, author, password) {
  try {
    requireAuthor(author, password);
    if (!topName) throw new Error("Top manquant.");
    if (!Array.isArray(orderedRowIndexes) || !orderedRowIndexes.length) throw new Error("Liste d'ordre invalide.");
    return withLock(() => {
      BaremeService.reorderEntries(topName, orderedRowIndexes);
      AuditService.log(author, 'Ordre modifié', 'Barème: ' + topName, '', orderedRowIndexes.join(' → '), '', null);
      ConfigService.clearCache();
      return { success: true, entries: BaremeService.getEntries() };
    });
  } catch(e) { return fail(e); }
}

function apiUpdateBaremeEntry(rowIndex, action, pts, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const sheet = ConfigService.getSheets().bareme;
      const before = _baremeRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      BaremeService.updateEntry(rowIndex, action, pts);
      const after = (action || '') + ' | ' + String(Number(pts) || 0) + ' pts';
      const afterRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      AuditService.log(author, 'Règle modifiée', 'Barème', before, after, 'ligne #' + rowIndex,
        { sheet: 'bareme', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      ConfigService.clearCache();
      return { success: true, entries: BaremeService.getEntries() };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteBaremeEntry(rowIndex, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const sheet = ConfigService.getSheets().bareme;
      const before = _baremeRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      BaremeService.deleteEntry(rowIndex);
      AuditService.log(author, 'Règle supprimée', 'Barème', before, '', 'ligne #' + rowIndex,
        { sheet: 'bareme', op: 'delete', before: beforeRow });
      ConfigService.clearCache();
      return { success: true, entries: BaremeService.getEntries() };
    });
  } catch(e) { return fail(e); }
}

function apiSetColor(type, rowIndex, expectedName, color, author, password) {
  try {
    requireAuthor(author, password);
    if (!SettingsService.VALID_TYPES.includes(type)) throw new Error("Type invalide.");
    if (!rowIndex) throw new Error("Ligne non précisée — recharge la page et réessaie.");
    return withLock(() => {
      const sheetKey = type === 'Players' ? 'players' : 'categories';
      const numCols  = type === 'Players' ? 3 : 4;
      const colorCol = type === 'Players' ? 3 : 4;
      const sheet    = ConfigService.getSheets()[sheetKey];
      const data     = sheet.getDataRange().getValues();
      const beforeRow = data[rowIndex - 1] ? data[rowIndex - 1].slice(0, numCols) : null;
      // "before" vient de la ligne déjà lue plutôt que d'une relecture par nom
      // (_entityColorSummary) : avec deux homonymes, ce second lookup risquerait
      // de décrire la couleur de l'autre jumeau dans le journal d'audit.
      const before = beforeRow ? (beforeRow[colorCol - 1] || '') : '';
      SettingsService.setEntityColor(type, rowIndex, expectedName, color);
      const label = type === 'Players' ? 'Joueur' : 'Top';
      const afterRow = beforeRow ? sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0] : null;
      AuditService.log(author, 'Couleur ' + label.toLowerCase(), label + ': ' + expectedName,
        before, color || '', '',
        beforeRow ? { sheet: sheetKey, op: 'update', rowIndex: rowIndex, before: beforeRow, after: afterRow } : null);
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiManageEntity(action, type, newName, newMeta, oldName, newIcon, author, rowIndex, password) {
  try {
    requireAuthor(author, password);
    if (!SettingsService.VALID_TYPES.includes(type))     throw new Error("Type invalide.");
    if (!SettingsService.VALID_ACTIONS.includes(action)) throw new Error("Action invalide.");
    return withLock(() => {
      const label = type === 'Players' ? 'Joueur' : 'Top';
      const sheetKey = type === 'Players' ? 'players' : 'categories';
      const numCols  = type === 'Players' ? 3 : 4;
      const sheet    = ConfigService.getSheets()[sheetKey];

      if (action === 'ADD') {
        SettingsService.addEntity(type, newName, newMeta, newIcon);
        const after = type === 'Players'
          ? (newName || '') + ' (avatar: ' + (newMeta || '') + ')'
          : (newName || '') + ' (' + (newMeta || '') + ', ' + (newIcon || '') + ')';
        const afterRow = sheet.getRange(sheet.getLastRow(), 1, 1, numCols).getValues()[0];
        AuditService.log(author, label + ' ajouté', label + ': ' + (newName || ''), '', after, '',
          { sheet: sheetKey, op: 'insert', rowIndex: sheet.getLastRow(), after: afterRow });
      }
      if (action === 'DELETE') {
        // rowIndex cible la ligne physique exacte vue par le client (SettingsService.getEntities) —
        // sans lui, deux homonymes disparaîtraient ensemble (voir SettingsService.deleteEntity).
        if (!rowIndex) throw new Error("Ligne à supprimer non précisée — recharge la page et réessaie.");
        const before = _entitySummary(type, oldName);
        const data = sheet.getDataRange().getValues();
        const beforeRow = data[rowIndex - 1];
        SettingsService.deleteEntity(type, rowIndex, oldName);
        AuditService.log(author, label + ' supprimé', label + ': ' + (oldName || ''), before, '', '',
          beforeRow ? { sheet: sheetKey, op: 'delete', before: beforeRow.slice(0, numCols) } : null);
      }
      if (action === 'RENAME') {
        if (!rowIndex) throw new Error("Ligne à renommer non précisée — recharge la page et réessaie.");
        const data = sheet.getDataRange().getValues();
        const beforeRow = data[rowIndex - 1];
        SettingsService.renameEntity(type, rowIndex, oldName, newName, newMeta, newIcon);
        const afterData = sheet.getDataRange().getValues();
        const afterRow  = afterData[rowIndex - 1];
        AuditService.log(author, label + ' renommé', label + ': ' + (oldName || ''),
          oldName || '', newName || '', '',
          (beforeRow && afterRow) ? { sheet: sheetKey, op: 'update',
            rowIndex: rowIndex,
            before: beforeRow.slice(0, numCols), after: afterRow.slice(0, numCols) } : null);
      }

      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiReorderEntities(type, orderedRowIndexes, expectedNames, author, password) {
  try {
    requireAuthor(author, password);
    if (!SettingsService.VALID_TYPES.includes(type)) throw new Error("Type invalide.");
    if (!Array.isArray(orderedRowIndexes) || !orderedRowIndexes.length) throw new Error("Liste d'ordre invalide.");
    if (!Array.isArray(expectedNames) || expectedNames.length !== orderedRowIndexes.length) throw new Error("Liste d'ordre invalide.");
    return withLock(() => {
      SettingsService.reorderEntities(type, orderedRowIndexes, expectedNames);
      const label = type === 'Players' ? 'Joueurs' : 'Tops';
      AuditService.log(author, 'Ordre modifié', label, '', expectedNames.join(' → '), '', null);
      ConfigService.clearCache();
      // Renvoyer les deux listes fraîches (comme apiGetSettings) évite au client de
      // rappeler loadEntities() après coup — celle-ci repeint d'abord depuis son
      // cache localStorage (donc l'ancien ordre, pré-réorganisation) avant que la
      // vraie réponse arrive, ce qui produisait un aller-retour visible.
      return {
        success:    true,
        players:    SettingsService.getEntities('Players'),
        categories: SettingsService.getEntities('Categories')
      };
    });
  } catch(e) { return fail(e); }
}

function apiAddBulkPlan(plan, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const startRow = history.getLastRow() + 1;
      StorageService.appendBulkPlan(plan);
      const endRow = history.getLastRow();
      const addedRows = endRow >= startRow ? history.getRange(startRow, 1, endRow - startRow + 1, 7).getValues() : [];
      const totalEntries = plan.reduce(function(s, d) { return s + (d.entries || []).length; }, 0);
      const firstDate    = plan[0] && plan[0].date ? plan[0].date : '';
      AuditService.log(author, 'Saisie de points', 'History', '', totalEntries + ' entrée(s)',
        firstDate ? 'à partir du ' + firstDate : '',
        addedRows.length ? { sheet: 'history', op: 'insertMany', rows: addedRows } : null);
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiGetFilteredData(players, categories, startDate, endDate) {
  try {
    const chartData = AnalyticsService.getFilteredChartData(players, categories, startDate, endDate);
    return { success: true, chartData };
  } catch(e) { return fail(e); }
}

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

function apiGetHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText, startDate, endDate, sortDir, filterAltCategory) {
  try {
    const players    = (filterPlayers    && filterPlayers.length)    ? filterPlayers    : null;
    const categories = (filterCategories && filterCategories.length) ? filterCategories : null;
    const result = StorageService.getHistoryPage(page, pageSize, players, categories, filterText || null, startDate || null, endDate || null, sortDir || null, filterAltCategory || null);
    return { success: true, logs: result.logs, total: result.total, totalEntries: result.totalEntries };
  } catch(e) { return fail(e); }
}

// ─── AUDIT BEFORE-STATE HELPERS ────────────────────────────────────────────────
// Read current state before destructive mutations so the audit log can record
// a human-readable "before". Every function swallows errors — a bad rowIndex
// must never prevent the main operation from completing.

function _historyRowSummary(rowIndex) {
  try {
    const row = ConfigService.getSheets().history.getRange(rowIndex, 1, 1, 5).getValues()[0];
    const d   = new Date(row[0]);
    const pad  = n => String(n).padStart(2, '0');
    const ds   = isNaN(d.getTime()) ? '?'
      : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    return [row[1] || '?', row[2] || '?', (parseInt(row[3], 10) || '?') + ' pts', ds, row[4] || ''].join(' | ');
  } catch (_) { return 'ligne #' + rowIndex; }
}

function _historyDescSummary(rowIndex) {
  try {
    return ConfigService.getSheets().history.getRange(rowIndex, 5).getValue().toString();
  } catch (_) { return ''; }
}

function _noteRowSummary(rowIndex) {
  try {
    const sheet = ConfigService.getSheets().notes;
    if (!sheet) return '';
    const row = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
    return (row[1] || '') + ' : ' + (row[2] || '');
  } catch (_) { return ''; }
}

function _baremeRowSummary(rowIndex) {
  try {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) return '';
    const row = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
    return [row[0] || '', row[1] || '', String(row[2] || 0) + ' pts'].join(' | ');
  } catch (_) { return ''; }
}

function _phraseRowSummary(rowIndex) {
  try {
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) return '';
    const row = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
    return '[' + (row[1] || '') + '] ' + (row[2] || '') + ' (preset: ' + (row[0] || '') + ')';
  } catch (_) { return ''; }
}

function _entitySummary(type, name) {
  try {
    const found = SettingsService.getEntities(type).find(function(e) { return e.name === name; });
    if (!found) return name;
    if (type === 'Players')
      return name + ' (avatar: ' + (found.meta || '') + ', couleur: ' + (found.color || '') + ')';
    return name + ' (' + (found.meta || '') + ', ' + (found.icon || '') + ', ' + (found.color || '') + ')';
  } catch (_) { return name; }
}

function _entityColorSummary(type, name) {
  try {
    const found = SettingsService.getEntities(type).find(function(e) { return e.name === name; });
    return found ? (found.color || '') : '';
  } catch (_) { return ''; }
}

/** Verifies an identity password server-side. Never returns the password itself. */
function apiVerifyIdentity(name, password) {
  try {
    return { success: true, granted: SettingsService.verifyIdentity(name, password) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiDeleteHistoryEntries(rowIndexes, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const sorted = [...rowIndexes].sort((a, b) => b - a);
      const removedRows = sorted.map(ri => history.getRange(ri, 1, 1, 7).getValues()[0]);
      sorted.forEach(ri => history.deleteRow(ri));
      AltStorageService.adjustRefsAfterHistoryDelete(sorted);
      AuditService.log(author, 'Suppression bulk', 'History', '', '', rowIndexes.length + ' entrée(s)',
        { sheet: 'history', op: 'deleteMany', rows: removedRows });
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

// ── Données temporelles (graphique courbe)
function apiGetTrendData(players, categories, startDate, endDate) {
  try {
    const trendData = AnalyticsService.getTrendData(players, categories, startDate, endDate);
    return { success: true, trendData };
  } catch(e) { return fail(e); }
}

// ── Total global par joueur (tous tops inclus, même supprimés) ──────────
function apiGetPlayerTotals(players, startDate, endDate) {
  try {
    const allPlayers     = SettingsService.getEntities('Players').map(p => p.name);
    const displayPlayers = (players && players.length) ? players : allPlayers;

    const logs = StorageService.getFilteredLogs(
      displayPlayers,
      null,              // aucun filtre catégorie → tous les tops comptés
      startDate || null,
      endDate   || null
    );

    const totals = {};
    displayPlayers.forEach(p => { totals[p] = 0; });
    logs.forEach(log => {
      if (Object.prototype.hasOwnProperty.call(totals, log.player)) {
        totals[log.player] += log.points;
      }
    });

    return {
      success:   true,
      chartData: {
        labels:   displayPlayers,
        datasets: [{ label: 'Total global', data: displayPlayers.map(p => totals[p] || 0) }]
      }
    };
  } catch(e) { return fail(e); }
}

function apiGetQuickStats(universe) {
  try {
    const isAlt = (universe === 'alt');
    const allPlayers = SettingsService.getEntities('Players').map(p => p.name);
    const logs = isAlt
      ? AltStorageService.getAltLogs().map(l => ({ timestamp: l.date, player: l.player, category: l.category, points: l.points }))
      : StorageService.getFilteredLogs(allPlayers, null, null, null);

    const totals = {};
    allPlayers.forEach(p => { totals[p] = 0; });
    logs.forEach(log => {
      if (Object.prototype.hasOwnProperty.call(totals, log.player)) {
        totals[log.player] += log.points;
      }
    });

    const ranked = allPlayers
      .map(p => ({ player: p, points: totals[p] || 0 }))
      .sort((a, b) => b.points - a.points);

    const leader = ranked.length ? ranked[0] : null;
    const second = ranked.length > 1 ? ranked[1] : null;
    const gap = (leader && second) ? (leader.points - second.points) : null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthCount = logs.filter(l => l.timestamp >= monthStart).length;

    const sortedByDate = logs.slice().sort((a, b) => b.timestamp - a.timestamp);
    const last = sortedByDate.length ? sortedByDate[0] : null;

    const globalBest = logs.reduce((best, log) => (!best || log.points > best.points) ? log : best, null);

    return {
      success: true,
      stats: {
        leader: leader ? { player: leader.player, points: leader.points } : null,
        gap: gap,
        chaser: second ? { player: second.player, points: second.points } : null,
        monthCount: monthCount,
        lastEvent: last ? {
          player:   last.player,
          category: last.category,
          points:   last.points,
          date:     last.timestamp.toISOString()
        } : null,
        globalBest: globalBest ? {
          player: globalBest.player,
          points: globalBest.points,
          dateStr: _dayKey(globalBest.timestamp)
        } : null
      }
    };
  } catch (e) { return fail(e); }
}

// ── TOPS ALTERNATIFS & REGROUPEMENT AUTOMATIQUE API ───────────

function apiAppendAltNativeBatch(author, entries, password) {
  try {
    requireAuthor(author, password);
    if (!entries || !entries.length) return fail(new Error('Aucune entrée à enregistrer.'));
    return withLock(function() {
      const count = AltStorageService.addNativeAltEntries(entries);
      AuditService.log(author, 'Saisie native Alt', entries.map(e => e.altCategory).join(', '), '', '',
        count + ' entrée(s) saisie(s) directement dans Tops Alternatifs');
      return { success: true, count: count };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteNativeAltEntry(author, altCategory, rowIndex, guard, password) {
  try {
    requireAuthor(author, password);
    return withLock(function() {
      const removed = AltStorageService.deleteNativeAltEntry(rowIndex, altCategory, guard);
      const summary = (removed[1] || '?') + ' — ' + (removed[3] || 0) + ' pt(s)';
      AuditService.log(author, 'Suppression entrée Alt native', altCategory || '—',
        summary, '', 'Entrée native supprimée définitivement',
        { sheet: 'altHistory', op: 'delete', before: removed });
      return { success: true, count: 1 };
    });
  } catch(e) { return fail(e); }
}

function apiGetAltCategories() {
  try {
    return { success: true, altCategories: AltSettingsService.getAltCategories() };
  } catch(e) { return fail(e); }
}

function apiSaveAltCategories(author, list, password) {
  try {
    requireAuthor(author, password);
    return withLock(function() {
      AltSettingsService.saveAltCategories(list);
      AuditService.log(author, 'Mise à jour Tops Alternatifs', 'AltCategories', '', '', 'Mise à jour des catégories alternes');
      return { success: true, altCategories: AltSettingsService.getAltCategories() };
    });
  } catch(e) { return fail(e); }
}

function apiLinkHistoryRowsToAltCategory(author, rowIndices, altCategory, password) {
  try {
    requireAuthor(author, password);
    return withLock(function() {
      const count = AltStorageService.linkHistoryRowsToAltCategory(rowIndices, altCategory, author);
      AuditService.log(author, 'Affectation Top Alternatif', altCategory, '', '', count + ' entrée(s) liée(s) au Top Alternatif ' + altCategory);
      return { success: true, linkedCount: count };
    });
  } catch(e) { return fail(e); }
}

function apiUnlinkHistoryRowsFromAltCategory(author, rowIndices, altCategory, password) {
  try {
    requireAuthor(author, password);
    return withLock(function() {
      const count = AltStorageService.unlinkHistoryRowsFromAltCategory(rowIndices, altCategory, author);
      AuditService.log(author, 'Désaffectation Top Alternatif', altCategory || 'Tous', '', '', count + ' entrée(s) retirée(s) du Top Alternatif ' + (altCategory || 'tous'));
      return { success: true, unlinkedCount: count };
    });
  } catch(e) { return fail(e); }
}

function apiGetAltHistoryMap() {
  try {
    return { success: true, altMap: AltStorageService.getAltHistoryMap() };
  } catch(e) { return fail(e); }
}

function apiGetAltCategoryDetails(altCategory) {
  try {
    const entries = AltStorageService.getAltCategoryDetails(altCategory);
    return { success: true, entries: entries };
  } catch(e) { return fail(e); }
}

function apiGroupSimilarEntries(author, password) {
  try {
    requireAuthor(author, password);
    return withLock(function() {
      const result = StorageService.apiGroupSimilarEntries();
      if (result.groupedCount > 0) {
        AuditService.log(author, 'Regroupement automatique', 'History', '', '', result.groupedCount + ' entrées regroupées dans ' + result.groupsCreated + ' groupe(s)');
      }
      return { success: true, groupedCount: result.groupedCount, groupsCreated: result.groupsCreated };
    });
  } catch(e) { return fail(e); }
}

function apiGetAltAnalyticsData(players, altCategories, startDate, endDate) {
  try {
    const logs = AltStorageService.getAltLogs();
    const allAltCats = AltSettingsService.getAltCategories();
    const allPlayers = SettingsService.getEntities('Players');

    const displayPlayers = (players && players.length) ? players : allPlayers.map(p => p.name);
    const displayAltCats = (altCategories && altCategories.length) ? altCategories : allAltCats.map(c => c.name);

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const filteredLogs = logs.filter(l => {
      if (start && l.date < start) return false;
      if (end && l.date > end) return false;
      if (players && players.length && !players.includes(l.player)) return false;
      if (altCategories && altCategories.length && !altCategories.includes(l.category)) return false;
      return true;
    });

    const { scores } = AnalyticsService._aggregate(filteredLogs, displayPlayers, displayAltCats);
    const catColorMap = {};
    allAltCats.forEach(c => { if (c.color) catColorMap[c.name] = c.color; });

    const datasets = displayAltCats.map((cat, i) => ({
      label: cat,
      data: displayPlayers.map(p => (scores[p] && scores[p][cat]) || 0),
      backgroundColor: catColorMap[cat] || '#7c8cff',
      borderRadius: 4
    }));

    return {
      success: true,
      chartData: { labels: displayPlayers, datasets },
      scores,
      altCategories: allAltCats
    };
  } catch(e) { return fail(e); }
}

// ── Outils de nettoyage ──────────────────────────────────────────────────────

function apiGetDataHealth() {
  try {
    return { success: true, health: StorageService.getDataHealth() };
  } catch(e) { return fail(e); }
}

// ── Journal d'audit (lecture paginée et filtrable) ─────────────────────────────
function apiGetAuditLog(page, pageSize, filterAuthor, filterAction, startDate, endDate, searchText, sortDir) {
  try {
    const sheet = ConfigService.getSheets().auditLog;
    if (!sheet) return { success: true, logs: [], total: 0 };
    const { values: data, startRow } = _readDataRows('auditLog', sheet, 9);
    if (!data.length) return { success: true, logs: [], total: 0 };
    // Date bounds parsed in server local time (GAS runs UTC). Frontend sends YYYY-MM-DD.
    const start = startDate ? new Date(startDate + 'T00:00:00') : null;
    const end   = endDate   ? new Date(endDate   + 'T23:59:59') : null;
    const needle = (searchText || '').trim().toLowerCase();

    const filtered = [];
    for (let i = data.length - 1; i >= 0; i--) {  // reverse → les plus récents d'abord
      const row = data[i];
      const ts  = new Date(row[0]);
      if (isNaN(ts.getTime())) continue;
      if (filterAuthor && row[1] !== filterAuthor) continue;
      if (filterAction && row[2] !== filterAction) continue;
      if (start && ts < start) continue;
      if (end   && ts > end)   continue;
      if (needle) {
        const haystack = (row[3] + ' ' + row[4] + ' ' + row[5] + ' ' + row[6]).toLowerCase();
        if (haystack.indexOf(needle) === -1) continue;
      }
      filtered.push({
        id:        i + startRow,
        timestamp: ts.toISOString(),
        author:    row[1] ? row[1].toString() : '',
        action:    row[2] ? row[2].toString() : '',
        entity:    row[3] ? row[3].toString() : '',
        before:    row[4] ? row[4].toString() : '',
        after:     row[5] ? row[5].toString() : '',
        detail:    row[6] ? row[6].toString() : '',
        undoable:  !!row[7] && !row[8]
      });
    }

    // `filtered` est construit du plus récent au plus ancien (desc, défaut) ;
    // sortDir === 'asc' réordonne du plus ancien au plus récent.
    if (sortDir === 'asc') filtered.reverse();

    const total  = filtered.length;
    const ps     = parseInt(pageSize, 10) || 20;
    const offset = ((parseInt(page, 10) || 1) - 1) * ps;
    return { success: true, logs: filtered.slice(offset, offset + ps), total };
  } catch(e) { return fail(e); }
}

/**
 * Distinct action labels actually present in the audit log, for the Journal's
 * filter dropdown. Replaces a hand-maintained static list in the frontend,
 * which drifted out of sync with the actions really logged by AuditService.
 */
function apiGetAuditActionTypes() {
  try {
    const sheet = ConfigService.getSheets().auditLog;
    if (!sheet) return { success: true, actions: [] };
    const lastRow  = sheet.getLastRow();
    const startRow = _firstDataRow('auditLog', sheet);
    if (lastRow < startRow) return { success: true, actions: [] };
    const col = sheet.getRange(startRow, 3, lastRow - startRow + 1, 1).getValues();
    const set = new Set();
    col.forEach(r => { if (r[0]) set.add(r[0].toString()); });
    return { success: true, actions: [...set].sort((a, b) => a.localeCompare(b, 'fr')) };
  } catch(e) { return fail(e); }
}

function apiUndoAuditEntry(auditRowId, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => AuditService.undo(auditRowId, author));
  } catch (e) { return fail(e); }
}

function apiFixZeroPoints(author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const result = StorageService.fixZeroPoints();
      AuditService.log(author, 'Nettoyage zéros', 'History', '', '',
        result.deleted + ' entrée(s) supprimée(s)',
        result.rows.length ? { sheet: 'history', op: 'deleteMany', rows: result.rows } : null);
      ConfigService.clearCache();
      return { success: true, deleted: result.deleted };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteOrphans(author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const result = StorageService.deleteOrphans();
      AuditService.log(author, 'Nettoyage orphelins', 'History', '', '',
        result.deleted + ' entrée(s) supprimée(s)',
        result.rows.length ? { sheet: 'history', op: 'deleteMany', rows: result.rows } : null);
      ConfigService.clearCache();
      return { success: true, deleted: result.deleted };
    });
  } catch(e) { return fail(e); }
}

function apiCreateSnapshot(author, password) {
  try {
    requireAuthor(author, password);
    const result = BackupService.createSnapshot();
    AuditService.log(author, 'Snapshot créé', 'Backup', '', result.name, '');
    return { success: true, name: result.name, url: result.url };
  } catch (e) { return fail(e); }
}

/**
 * Rattache Créé par (et Modifié par si retrouvable) aux notes antérieures à
 * l'introduction du suivi, en remontant toute la chaîne d'éditions jusqu'à la
 * création — écrit directement dans les colonnes CrééPar/ModifiéPar/ModifiéLe de
 * la ligne (mêmes colonnes que addNote()/editNote()). Jamais de devinette : à
 * chaque maillon, une correspondance ambiguë (texte dupliqué) arrête la remontée
 * à cet endroit précis — ce qui a déjà été retrouvé avant ce point reste acquis.
 *
 * Chaque édition journalise "Avant" = "joueur : texte précédent" et "Après" = "texte
 * nouveau" (sans joueur — format d'avant ce suivi). Partant du texte actuel d'une
 * note : on cherche d'abord une création directe ("joueur : texte" == Après d'un
 * "Note ajoutée"). Sinon, on cherche la dernière édition (Après == texte actuel) →
 * Modifié par obtenu ; son "Avant" donne le texte précédent, qu'on reteste en
 * création puis en édition, et ainsi de suite en remontant, jusqu'à trouver la
 * création (Créé par obtenu) ou jusqu'à ce que la chaîne casse.
 */
function apiBackfillNoteAuthors(author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const notesSheet = ConfigService.getSheets().notes;
      if (!notesSheet) return { success: true, matched: 0, skipped: 0 };
      const lastRow   = notesSheet.getLastRow();
      const noteStart = _firstDataRow('notes', notesSheet);
      if (lastRow < noteStart) return { success: true, matched: 0, skipped: 0 };

      const noteRows = notesSheet.getRange(noteStart, 1, lastRow - noteStart + 1, 7).getValues();
      const candidates = [];
      noteRows.forEach((row, i) => {
        const player    = row[1] ? row[1].toString() : '';
        const text      = row[2] ? row[2].toString() : '';
        const createdBy = row[4] ? row[4].toString() : '';
        if (!createdBy && (player || text)) {
          candidates.push({ rowIndex: i + noteStart, player, text, noteId: row[3] ? row[3].toString() : '' });
        }
      });
      if (!candidates.length) return { success: true, matched: 0, skipped: 0 };

      const auditSheet = ConfigService.getSheets().auditLog;
      if (!auditSheet) return { success: true, matched: 0, skipped: candidates.length };
      const auditLastRow  = auditSheet.getLastRow();
      const auditStartRow = _firstDataRow('auditLog', auditSheet);
      if (auditLastRow < auditStartRow) return { success: true, matched: 0, skipped: candidates.length };
      const auditData = auditSheet.getRange(auditStartRow, 1, auditLastRow - auditStartRow + 1, 7).getValues();

      // Index des entrées "Note ajoutée", clé "joueur : texte" (format de l'époque).
      const byCreation = {};
      // Index des entrées "Note modifiée", clé "texte" seul (Après ne préfixait pas
      // le joueur), avec leur auteur/horodatage et leur "Avant" pour remonter la chaîne.
      const byEdit = {};
      auditData.forEach(row => {
        const rAuthor = row[1] ? row[1].toString() : '', action = row[2],
              entity = row[3] ? row[3].toString() : '',
              before = row[4] ? row[4].toString() : '', after = row[5] ? row[5].toString() : '',
              timestamp = row[0];
        if (action === 'Note ajoutée' && entity.indexOf('Note:') === 0) {
          (byCreation[after] = byCreation[after] || []).push({ author: rAuthor });
        } else if (action === 'Note modifiée' && entity === 'Note') {
          (byEdit[after] = byEdit[after] || []).push({ author: rAuthor, timestamp, before });
        }
      });

      let matched = 0, skipped = 0;
      candidates.forEach(c => {
        const prefix = c.player + ' : ';
        let createdBy = '', lastEditedBy = '', lastEditedAt = null;

        const directCreation = byCreation[prefix + c.text];
        if (directCreation && directCreation.length === 1) {
          createdBy = directCreation[0].author;
        } else {
          let curText = c.text;
          for (let hops = 0; hops < 50; hops++) {
            const editHits = byEdit[curText];
            if (!editHits || editHits.length !== 1) break; // introuvable ou ambigu → la chaîne s'arrête ici
            const hit = editHits[0];
            if (!lastEditedBy) { lastEditedBy = hit.author; lastEditedAt = hit.timestamp; }
            if (hit.before.indexOf(prefix) !== 0) break; // format inattendu → on s'arrête, prudent
            const priorText = hit.before.slice(prefix.length);
            const creationHit = byCreation[prefix + priorText];
            if (creationHit && creationHit.length === 1) { createdBy = creationHit[0].author; break; }
            curText = priorText; // encore une édition plus tôt : on continue de remonter
          }
        }

        if (!createdBy && !lastEditedBy) { skipped++; return; } // rien retrouvé, aucune trace exploitable
        const noteId = c.noteId || _generateGroupId();
        notesSheet.getRange(c.rowIndex, 4, 1, 4).setValues([[noteId, createdBy, lastEditedBy, lastEditedAt || '']]);
        matched++;
      });

      if (matched) {
        AuditService.log(author, 'Notes rattachées', 'Notes', '', '',
          matched + ' note(s) rattachée(s), ' + skipped + ' laissée(s) sans correspondance certaine');
      }
      ConfigService.clearCache();
      return { success: true, matched, skipped };
    });
  } catch(e) { return fail(e); }
}

function apiUpdateHistoryDescription(rowIndex, description, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const before = _historyDescSummary(rowIndex);
      const beforeRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      StorageService.updateHistoryDescription(rowIndex, description);
      const afterRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      AuditService.log(author, 'Description modifiée', 'History', before, description || '', 'ligne #' + rowIndex,
        { sheet: 'history', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiUpdateHistoryEntry(rowIndex, fields, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const before = _historyRowSummary(rowIndex);
      const beforeRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      StorageService.updateHistoryEntry(rowIndex, fields);
      const afterRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      // fields.date arrives as 'YYYY-MM-DD' from the edit form; reformatted to
      // 'DD/MM/YYYY' so it matches _historyRowSummary()'s "before" format instead
      // of showing two different date formats side by side in the audit diff.
      const dateParts = (fields.date || '').split('-');
      const afterDate = dateParts.length === 3 ? dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0] : (fields.date || '');
      const after = [fields.player || '?', fields.category || '?',
        (parseInt(fields.points, 10) || '?') + ' pts', afterDate,
        fields.description || ''].join(' | ');
      AuditService.log(author, 'Modification entrée', 'History', before, after, 'ligne #' + rowIndex,
        { sheet: 'history', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

// ── Notes rapides ──────────────────────────────────────────────────────────────

function apiGetAllNotes() {
  try {
    const result = NotesService.getAllNotes();
    return { success: true, notes: result.notes };
  } catch(e) { return fail(e); }
}

function apiAddNote(player, text, dateStr, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const note = NotesService.addNote(player, text, dateStr, author);
      const sheet = ConfigService.getSheets().notes;
      AuditService.log(author, 'Note ajoutée', 'Note: ' + (player || ''),
        '', (player || '') + ' : ' + (text || '').trim(), 'note:' + note.noteId,
        { sheet: 'notes', op: 'insert', rowIndex: note.rowIndex,
          after: sheet.getRange(note.rowIndex, 1, 1, 7).getValues()[0] });
      return { success: true, note };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteNote(rowIndex, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const sheet = ConfigService.getSheets().notes;
      const before = _noteRowSummary(rowIndex);
      const noteId = NotesService.noteIdAt(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
      NotesService.deleteNote(rowIndex);
      AuditService.log(author, 'Note supprimée', 'Note', before, '', 'note:' + noteId,
        { sheet: 'notes', op: 'delete', before: beforeRow });
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiGetNoteHistory(noteId) {
  try {
    const sheet = ConfigService.getSheets().auditLog;
    if (!sheet || !noteId) return { success: true, entries: [] };
    const lastRow  = sheet.getLastRow();
    const startRow = _firstDataRow('auditLog', sheet);
    if (lastRow < startRow) return { success: true, entries: [] };
    const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 9).getValues();
    const needle = 'note:' + noteId;
    const entries = [];
    data.forEach(row => {
      if (row[3] !== 'Note' || row[2] !== 'Note modifiée' || row[6] !== needle) return;
      entries.push({
        timestamp: new Date(row[0]).toISOString(),
        author: row[1] ? row[1].toString() : '',
        before: row[4] ? row[4].toString() : '',
        after:  row[5] ? row[5].toString() : ''
      });
    });
    entries.reverse(); // plus récent d'abord
    return { success: true, entries };
  } catch(e) { return fail(e); }
}

function apiEditNote(rowIndex, newText, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const sheet = ConfigService.getSheets().notes;
      const before = _noteRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
      const noteId = NotesService.editNote(rowIndex, newText, author); // backfille un NoteId si absent, écrit ModifiéPar/ModifiéLe
      const afterRow = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
      AuditService.log(author, 'Note modifiée', 'Note', before, (newText || '').trim(),
        'note:' + noteId,
        { sheet: 'notes', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      const editedAt = afterRow[6] instanceof Date ? afterRow[6].toISOString() : null;
      return { success: true, noteId, editedAt };
    });
  } catch(e) { return fail(e); }
}

// ── Tchat ───────────────────────────────────────────────────────────────────────

function apiGetChatMessages() {
  try {
    const result = ChatService.getAllMessages();
    return { success: true, messages: result.messages };
  } catch(e) { return fail(e); }
}

function apiPostChatMessage(text, replyToId, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const msg = ChatService.postMessage(author, text, replyToId);
      const sheet = ConfigService.getSheets().chat;
      AuditService.log(author, 'Message tchat envoyé', 'Chat',
        '', msg.text.slice(0, 200), replyToId ? 'en réponse à un message' : '',
        { sheet: 'chat', op: 'insert', rowIndex: msg.rowIndex,
          after: sheet.getRange(msg.rowIndex, 1, 1, 5).getValues()[0] });
      return { success: true, message: msg };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteChatMessage(id, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const result = ChatService.deleteMessage(id, author);
      AuditService.log(author, 'Message tchat supprimé', 'Chat',
        (result.deletedRow[3] || '').toString().slice(0, 200), '', 'id ' + id,
        { sheet: 'chat', op: 'delete', before: result.deletedRow });
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiUpdateBulkEntries(rowIndexes, partialFields, author, password) {
  try {
    requireAuthor(author, password);
    if (!rowIndexes || !rowIndexes.length) throw new Error("Aucune ligne sélectionnée.");
    if (!partialFields || !Object.keys(partialFields).length) return { success: true };
    return withLock(function() {
      var history  = ConfigService.getSheets().history;
      var lastRow  = history.getLastRow();
      var startRow = _firstDataRow('history', history);
      if (lastRow < startRow) return { success: true, skipped: [] };

      var allData  = history.getRange(startRow, 1, lastRow - startRow + 1, 7).getValues();
      var indexSet = new Set(rowIndexes.map(function(ri) { return parseInt(ri, 10); }));
      var skipped  = [];

      var hasDate   = 'date'        in partialFields;
      var hasPlayer = 'player'      in partialFields;
      var hasCat    = 'category'    in partialFields;
      var hasPts    = 'points'      in partialFields;
      var hasDesc   = 'description' in partialFields;
      var hasSais   = 'saiseur'     in partialFields;

      var undoRows = [];
      indexSet.forEach(function(idx) {
        var rowI = idx - startRow;
        if (rowI < 0 || rowI >= allData.length) { skipped.push(idx); return; }
        var row      = allData[rowI];
        var beforeRow = row.slice();
        var player   = hasPlayer ? partialFields.player   : (row[1] ? row[1].toString() : '');
        var category = hasCat    ? partialFields.category : (row[2] ? row[2].toString() : '');
        var pts      = hasPts    ? parseInt(partialFields.points, 10) : parseInt(row[3], 10);
        var desc     = hasDesc   ? (partialFields.description || '') : (row[4] ? row[4].toString() : '');
        var saiseur  = hasSais   ? (partialFields.saiseur  || '') : (row[6] ? row[6].toString() : '');

        if (!player || !category || isNaN(pts) || pts < 1) { skipped.push(idx); return; }

        var targetDate;
        if (hasDate) {
          targetDate = _parseLocalDateWithNow(partialFields.date + '');
          if (isNaN(targetDate.getTime())) { skipped.push(idx); return; }
        } else {
          targetDate = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
        }

        row[0] = targetDate; row[1] = player; row[2] = category; row[3] = pts; row[4] = desc;
        if (hasSais) row[6] = saiseur;
        undoRows.push({ rowIndex: idx, before: beforeRow, after: row.slice() });
      });

      if (undoRows.length) history.getRange(startRow, 1, lastRow - startRow + 1, 7).setValues(allData);

      var changedFields = Object.keys(partialFields).join(', ');
      AuditService.log(author, 'Modification bulk', 'History', '', changedFields,
        (rowIndexes.length - skipped.length) + ' entrée(s) modifiée(s)',
        undoRows.length ? { sheet: 'history', op: 'updateMany', rows: undoRows } : null);
      ConfigService.clearCache();
      return { success: true, skipped: skipped };
    });
  } catch(e) { return fail(e); }
}

function apiDetectDistributedLots() {
  try {
    const cache = CacheService.getScriptCache();
    const key   = 'lots_v' + _logsVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return { success: true, lots: JSON.parse(raw) }; } catch (e) { /* corrupt entry → recompute */ }
    }

    const sheet = ConfigService.getSheets().history;
    const pad = _pad2;
    const { values: data, startRow } = _readDataRows('history', sheet, 7);
    if (!data.length) return { success: true, lots: [] };
    const entries = [];
    for (var i = 0; i < data.length; i++) {
      var rec = StorageService._parseHistoryRow(data[i], i, startRow);
      if (!rec.dateValid) continue;
      if (rec.groupId) continue;                       // already grouped → skip
      if (!rec.hasEntities || !rec.pointsValid) continue;
      entries.push({
        date: rec.date,
        dateStr: rec.date.getFullYear() + '-' + pad(rec.date.getMonth()+1) + '-' + pad(rec.date.getDate()),
        player: rec.player, category: rec.category, points: rec.points,
        description: rec.description, rowIndex: rec.rowIndex
      });
    }

    // Clé = joueur|catégorie|points|description
    var groups = {};
    entries.forEach(function(e) {
      var key = e.player + '|' + e.category + '|' + e.points + '|' + e.description;
      (groups[key] = groups[key] || []).push(e);
    });

    var lots = [];
    Object.keys(groups).forEach(function(key) {
      var group = groups[key];
      if (group.length < 3) return;

      // Un vrai lot réparti = 1 seule entrée par date pour cette clé.
      // Si une date apparaît 2+ fois → ces entrées sont de la saisie manuelle, on les exclut.
      var byDate = {};
      group.forEach(function(e) {
        (byDate[e.dateStr] = byDate[e.dateStr] || []).push(e);
      });
      var eligible = [];
      Object.keys(byDate).forEach(function(ds) {
        if (byDate[ds].length === 1) eligible.push(byDate[ds][0]);
      });

      if (eligible.length < 3) return;

      // Tri chronologique, puis chaînes avec max 7j d'écart
      eligible.sort(function(a, b) { return a.date - b.date; });
      var chain = [eligible[0]];
      for (var j = 1; j < eligible.length; j++) {
        var gap = (eligible[j].date - chain[chain.length - 1].date) / 86400000;
        if (gap <= 7) {
          chain.push(eligible[j]);
        } else {
          if (chain.length >= 3) {
            lots.push({
              player: chain[0].player, category: chain[0].category,
              points: chain[0].points, description: chain[0].description,
              count: chain.length,
              totalPts: chain.reduce(function(s, e) { return s + e.points; }, 0),
              dateFrom: chain[0].dateStr, dateTo: chain[chain.length - 1].dateStr,
              rowIndexes: chain.map(function(e) { return e.rowIndex; })
            });
          }
          chain = [eligible[j]];
        }
      }
      if (chain.length >= 3) {
        lots.push({
          player: chain[0].player, category: chain[0].category,
          points: chain[0].points, description: chain[0].description,
          count: chain.length,
          totalPts: chain.reduce(function(s, e) { return s + e.points; }, 0),
          dateFrom: chain[0].dateStr, dateTo: chain[chain.length - 1].dateStr,
          rowIndexes: chain.map(function(e) { return e.rowIndex; })
        });
      }
    });

    lots.sort(function(a, b) { return b.count - a.count; });
    _cachePutChunked(cache, key, JSON.stringify(lots), CONFIG.CACHE_TTL_SECONDS);
    return { success: true, lots: lots };
  } catch(e) { return fail(e); }
}

function apiDetectLegacyGroups() {
  try {
    const LEGACY_GID_RE = /^G\d{1,6}$/;
    const pad = _pad2;

    const rows = StorageService.getFullHistoryRowsCached();
    const groups = {};
    rows.forEach(function(r) {
      if (!r.groupId || !LEGACY_GID_RE.test(r.groupId)) return;
      (groups[r.groupId] = groups[r.groupId] || []).push(r);
    });

    const result = Object.keys(groups).map(function(gid) {
      const members = groups[gid].slice().sort(function(a, b) { return a.date - b.date; });
      const players    = new Set(members.map(function(m) { return m.player; }));
      const categories = new Set(members.map(function(m) { return m.category; }));
      const spanDays = Math.round((members[members.length - 1].date - members[0].date) / 86400000);

      return {
        groupId: gid,
        distinctPlayers: players.size,
        distinctCategories: categories.size,
        spanDays: spanDays,
        entries: members.map(function(m) {
          return {
            player: m.player, category: m.category, points: m.points,
            description: m.description,
            dateStr: m.date.getFullYear() + '-' + pad(m.date.getMonth() + 1) + '-' + pad(m.date.getDate()),
            rowIndex: m.rowIndex
          };
        })
      };
    });

    // Groupes les plus susceptibles d'être de vraies collisions en premier
    // (plus de joueurs/catégories distincts) ; les groupes à 1 joueur/1 catégorie
    // restent listés en fin de liste pour arbitrage manuel par l'utilisateur.
    result.sort(function(a, b) {
      return (b.distinctPlayers + b.distinctCategories) - (a.distinctPlayers + a.distinctCategories);
    });

    return { success: true, groups: result };
  } catch(e) { return fail(e); }
}

function apiGroupDistributedLots(lotsToGroup, author, password) {
  try {
    requireAuthor(author, password);
    if (!lotsToGroup || !lotsToGroup.length) throw new Error("Aucun lot fourni.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      const lastRow  = sheet.getLastRow();
      const startRow = _firstDataRow('history', sheet);
      if (lastRow < startRow) return { success: true };
      const colRange = sheet.getRange(startRow, 6, lastRow - startRow + 1, 1);
      const values = colRange.getValues();
      lotsToGroup.forEach(function(lot) {
        var rows = lot.rowIndexes;
        if (!rows || rows.length < 2) return;
        var gid = _generateGroupId();
        rows.forEach(function(r) { values[r - startRow][0] = gid; });
      });
      colRange.setValues(values);
      AuditService.log(author, 'Lots auto-groupés', 'History', '', '',
        lotsToGroup.length + ' lot(s)');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiGroupRows(rowIndexes, author, password) {
  try {
    requireAuthor(author, password);
    if (!rowIndexes || rowIndexes.length < 2) throw new Error("Sélectionnez au moins 2 entrées.");
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const lastRow  = history.getLastRow();
      const startRow = _firstDataRow('history', history);
      if (lastRow < startRow) throw new Error("Historique vide.");
      const gid      = _generateGroupId();
      const colRange = history.getRange(startRow, 6, lastRow - startRow + 1, 1);
      const values   = colRange.getValues();
      const indexSet = new Set(rowIndexes.map(ri => parseInt(ri, 10)));
      for (let i = 0; i < values.length; i++) {
        if (indexSet.has(i + startRow)) values[i][0] = gid;
      }
      colRange.setValues(values);
      AuditService.log(author, 'Groupement lot', 'History', '', '',
        rowIndexes.length + ' entrée(s), gid: ' + gid);
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiUngroupLot(groupId, author, password) {
  try {
    requireAuthor(author, password);
    if (!groupId) throw new Error("GroupID manquant.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      const lastRow  = sheet.getLastRow();
      const startRow = _firstDataRow('history', sheet);
      if (lastRow < startRow) return { success: true };
      const colRange = sheet.getRange(startRow, 6, lastRow - startRow + 1, 1);
      const data = colRange.getValues();
      let modified = false;
      for (var i = 0; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString() === groupId) {
          data[i][0] = '';
          modified = true;
        }
      }
      if (modified) colRange.setValues(data);
      AuditService.log(author, 'Dégroupement lot', 'History', '', '', 'gid: ' + groupId);
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiDetectDuplicates() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const dayKey = _dayKey;

    const groups = {};
    rows.forEach(r => {
      const key = r.player + '|' + r.category + '|' + dayKey(r.date) + '|' + r.points + '|' + r.description;
      (groups[key] = groups[key] || []).push(r);
    });

    const duplicates = Object.keys(groups)
      .map(k => groups[k])
      .filter(g => g.length >= 2)
      .map(g => {
        const sorted = g.slice().sort((a, b) => a.rowIndex - b.rowIndex);
        return {
          player: sorted[0].player, category: sorted[0].category, points: sorted[0].points,
          description: sorted[0].description, dateStr: dayKey(sorted[0].date),
          count: sorted.length,
          keepRowIndex: sorted[0].rowIndex,
          extraRowIndexes: sorted.slice(1).map(r => r.rowIndex)
        };
      })
      .sort((a, b) => b.count - a.count);

    return { success: true, duplicates };
  } catch(e) { return fail(e); }
}

function apiGetPlayerRecords(universe) {
  try {
    const isAlt = (universe === 'alt');
    const cache = CacheService.getScriptCache();
    const key   = 'records_' + (isAlt ? 'alt_' : 'main_') + 'v' + _logsVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const rows = isAlt ? AltStorageService.getAltLogs() : StorageService.getFullHistoryRowsCached();
    const byPlayer = {};
    rows.forEach(r => (byPlayer[r.player] = byPlayer[r.player] || []).push(r));

    const dayKey = _dayKey;

    let globalBest = null;
    const records = Object.keys(byPlayer).map(player => {
      const list = byPlayer[player];
      const best = list.reduce((m, r) => r.points > m.points ? r : m, list[0]);
      if (!globalBest || best.points > globalBest.points) {
        globalBest = { player, points: best.points, dateStr: dayKey(best.date) };
      }

      const days = [...new Set(list.map(r => dayKey(r.date)))].sort();
      let longestStreak = days.length ? 1 : 0;
      let currentStreak = 1;
      for (let i = 1; i < days.length; i++) {
        const gap = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
        currentStreak = gap === 1 ? currentStreak + 1 : 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      }

      return { player, bestSingleEntry: best.points, bestEntryDate: dayKey(best.date), longestStreakDays: longestStreak };
    });

    const res = { success: true, records, globalBest };
    _cachePutChunked(cache, key, JSON.stringify(res), CONFIG.CACHE_TTL_SECONDS);
    return res;
  } catch(e) { return fail(e); }
}

function apiGetTrends(universe) {
  try {
    const isAlt = (universe === 'alt');
    const cache = CacheService.getScriptCache();
    const key   = 'trends_' + (isAlt ? 'alt_' : 'main_') + 'v' + _logsVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const rows = isAlt ? AltStorageService.getAltLogs() : StorageService.getFullHistoryRowsCached();
    const now = new Date();
    const cutoff1 = new Date(now.getTime() - 30 * 86400000);
    const cutoff2 = new Date(now.getTime() - 60 * 86400000);

    const recent   = rows.filter(r => r.date >= cutoff1 && r.date <= now);
    const previous = rows.filter(r => r.date >= cutoff2 && r.date < cutoff1);

    function countByCategory(list) {
      const m = {};
      list.forEach(r => { m[r.category] = (m[r.category] || 0) + 1; });
      return m;
    }
    const recentByCat = countByCategory(recent);
    const prevByCat   = countByCategory(previous);
    const categories  = [...new Set([...Object.keys(recentByCat), ...Object.keys(prevByCat)])];
    const categoryTrends = categories.map(cat => {
      const before = prevByCat[cat] || 0;
      const after  = recentByCat[cat] || 0;
      const changePct = before === 0 ? (after > 0 ? 100 : 0) : Math.round(((after - before) / before) * 100);
      return { category: cat, before, after, changePct };
    }).sort((a, b) => b.changePct - a.changePct);

    const byPlayerAll = {};
    rows.forEach(r => (byPlayerAll[r.player] = byPlayerAll[r.player] || []).push(r));
    const playerTrends = Object.keys(byPlayerAll).map(player => {
      const all = byPlayerAll[player];
      const recentEntries = all.filter(r => r.date >= cutoff1 && r.date <= now);
      if (!recentEntries.length) return null;
      const historicalAvg = all.reduce((s, r) => s + r.points, 0) / all.length;
      const recentAvg = recentEntries.reduce((s, r) => s + r.points, 0) / recentEntries.length;
      const changePct = historicalAvg === 0 ? 0 : Math.round(((recentAvg - historicalAvg) / historicalAvg) * 100);
      return { player, historicalAvg: Math.round(historicalAvg), recentAvg: Math.round(recentAvg), changePct };
    }).filter(Boolean).sort((a, b) => b.changePct - a.changePct);

    const res = { success: true, categoryTrends, playerTrends };
    _cachePutChunked(cache, key, JSON.stringify(res), CONFIG.CACHE_TTL_SECONDS);
    return res;
  } catch(e) { return fail(e); }
}

function apiGetActiveWeekday(universe) {
  try {
    const isAlt = (universe === 'alt');
    const cache = CacheService.getScriptCache();
    const key   = 'weekday_' + (isAlt ? 'alt_' : 'main_') + 'v' + _logsVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const rows = isAlt ? AltStorageService.getAltLogs() : StorageService.getFullHistoryRowsCached();
    const counts = [0, 0, 0, 0, 0, 0, 0]; // index = Date.getDay(), 0 = dimanche
    rows.forEach(r => { counts[r.date.getDay()]++; });

    const labels = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const byWeekday = labels.map((label, i) => ({ weekday: label, count: counts[i] }));
    let topIndex = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[topIndex]) topIndex = i;

    const res = { success: true, byWeekday, topWeekday: rows.length ? labels[topIndex] : null };
    _cachePutChunked(cache, key, JSON.stringify(res), CONFIG.CACHE_TTL_SECONDS);
    return res;
  } catch(e) { return fail(e); }
}

function apiGetTopPlayerCategoryPairs(universe) {
  try {
    const isAlt = (universe === 'alt');
    const cache = CacheService.getScriptCache();
    const key   = 'pairs_' + (isAlt ? 'alt_' : 'main_') + 'v' + _logsVersion();
    const raw   = _cacheGetChunked(cache, key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const rows = isAlt ? AltStorageService.getAltLogs() : StorageService.getFullHistoryRowsCached();
    const counts = {};
    rows.forEach(r => {
      const key = r.player + '|' + r.category;
      counts[key] = (counts[key] || 0) + 1;
    });
    const pairs = Object.keys(counts)
      .map(key => {
        const sep = key.indexOf('|');
        return { player: key.slice(0, sep), category: key.slice(sep + 1), count: counts[key] };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const res = { success: true, pairs };
    _cachePutChunked(cache, key, JSON.stringify(res), CONFIG.CACHE_TTL_SECONDS);
    return res;
  } catch(e) { return fail(e); }
}

function apiRemoveFromGroup(rowIndex, author, password) {
  try {
    requireAuthor(author, password);
    if (!rowIndex) throw new Error("Index de ligne manquant.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      sheet.getRange(rowIndex, 6).setValue('');
      AuditService.log(author, 'Retrait du groupe', 'History', '', '', 'ligne #' + rowIndex);
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteGroup(groupId, author, password) {
  try {
    requireAuthor(author, password);
    if (!groupId) throw new Error("GroupID manquant.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      const lastRow  = sheet.getLastRow();
      const startRow = _firstDataRow('history', sheet);
      if (lastRow < startRow) return { success: true };
      const data = sheet.getRange(startRow, 6, lastRow - startRow + 1, 1).getValues();
      const rowsToDelete = [];
      for (let i = 0; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString() === groupId) rowsToDelete.push(i + startRow);
      }
      if (!rowsToDelete.length) throw new Error("Groupe introuvable.");
      const sorted = rowsToDelete.slice().sort((a, b) => b - a);
      const snapshotRows = sorted.map(ri => sheet.getRange(ri, 1, 1, 7).getValues()[0]);
      sorted.forEach(ri => sheet.deleteRow(ri));
      AltStorageService.adjustRefsAfterHistoryDelete(sorted);
      AuditService.log(author, 'Suppression groupe', 'History', groupId, '',
        rowsToDelete.length + ' entrée(s)', { sheet: 'history', op: 'deleteMany', rows: snapshotRows });
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

// ── Détection de mentions manquantes ────────────────────────────────────────────
// Repère les noms de joueurs tapés en texte brut (sans @) dans les descriptions
// d'History et les notes, et propose de les convertir en @Mention cliquable.

function _escapeRegExpMention(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Construit la liste des motifs à rechercher : le nom complet de chaque joueur
 * (toujours), plus un token individuel (prénom/nom si le nom est composé) —
 * mais seulement si ce token n'appartient qu'à un seul joueur, pour ne jamais
 * attribuer une mention au mauvais joueur en cas d'homonymie partielle.
 * Triée par longueur décroissante : les noms complets (plus longs) sont
 * remplacés avant les tokens individuels qu'ils contiennent.
 */
function _buildMentionCandidates(players) {
  const tokenCount = {};
  players.forEach(name => {
    name.trim().split(/\s+/).forEach(tok => {
      const key = tok.toLowerCase();
      tokenCount[key] = (tokenCount[key] || 0) + 1;
    });
  });

  const candidates = [];
  players.forEach(name => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    candidates.push({ pattern: trimmed, player: name });
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      parts.forEach(tok => {
        if (tok.length >= 2 && tokenCount[tok.toLowerCase()] === 1) {
          candidates.push({ pattern: tok, player: name });
        }
      });
    }
  });
  return candidates.sort((a, b) => b.pattern.length - a.pattern.length);
}

/** Remplace, dans `text`, chaque occurrence non déjà mentionnée d'un candidat par
 *  `@NomComplet` (mot entier uniquement, Unicode-aware pour les accents). Renvoie
 *  le texte transformé, ou null si rien n'a été trouvé. */
function _scanTextForUnmentioned(text, candidates) {
  if (!text) return null;
  let result = text;
  candidates.forEach(c => {
    const re = new RegExp('(?<![\\p{L}\\p{N}_@])(' + _escapeRegExpMention(c.pattern) + ')(?![\\p{L}\\p{N}_])', 'giu');
    result = result.replace(re, '@' + c.player);
  });
  return result !== text ? result : null;
}

function apiScanUnmentionedNames() {
  try {
    const players = SettingsService.getEntities('Players').map(p => p.name).filter(Boolean);
    if (!players.length) return { success: true, results: [] };
    const candidates = _buildMentionCandidates(players);
    if (!candidates.length) return { success: true, results: [] };

    const results = [];

    StorageService.getFullHistoryRowsCached().forEach(r => {
      const after = _scanTextForUnmentioned(r.description, candidates);
      if (after) {
        results.push({
          source: 'history', rowIndex: r.rowIndex,
          before: r.description, after,
          context: r.player + ' · ' + r.category
        });
      }
    });

    NotesService.getAllNotes().notes.forEach(n => {
      const after = _scanTextForUnmentioned(n.text, candidates);
      if (after) {
        results.push({
          source: 'notes', rowIndex: n.rowIndex,
          before: n.text, after,
          context: n.player
        });
      }
    });

    return { success: true, results };
  } catch(e) { return fail(e); }
}

function apiApplyMentionFixes(fixes, author, password) {
  try {
    requireAuthor(author, password);
    if (!fixes || !fixes.length) throw new Error("Aucune correction sélectionnée.");
    return withLock(() => {
      const { history, notes } = ConfigService.getSheets();
      let applied = 0;

      const histFixes = fixes.filter(f => f.source === 'history');
      if (histFixes.length) {
        const undoRows = [];
        histFixes.forEach(f => {
          const idx = parseInt(f.rowIndex, 10);
          if (isNaN(idx) || idx < _firstDataRow('history', history)) return;
          const beforeRow = history.getRange(idx, 1, 1, 7).getValues()[0];
          StorageService.updateHistoryDescription(idx, f.after);
          const afterRow = history.getRange(idx, 1, 1, 7).getValues()[0];
          undoRows.push({ rowIndex: idx, before: beforeRow, after: afterRow });
          applied++;
        });
        AuditService.log(author, 'Mentions corrigées', 'History', '', '',
          undoRows.length + ' description(s) d\'entrée',
          undoRows.length ? { sheet: 'history', op: 'updateMany', rows: undoRows } : null);
      }

      const noteFixes = fixes.filter(f => f.source === 'notes');
      if (noteFixes.length) {
        if (!notes) throw new Error("Feuille Notes introuvable.");
        const undoRows = [];
        noteFixes.forEach(f => {
          const idx = parseInt(f.rowIndex, 10);
          if (isNaN(idx) || idx < _firstDataRow('notes', notes)) return;
          const beforeRow = notes.getRange(idx, 1, 1, 7).getValues()[0];
          NotesService.editNote(idx, f.after, author);
          const afterRow = notes.getRange(idx, 1, 1, 7).getValues()[0];
          undoRows.push({ rowIndex: idx, before: beforeRow, after: afterRow });
          applied++;
        });
        AuditService.log(author, 'Mentions corrigées', 'Notes', '', '',
          undoRows.length + ' note(s)',
          undoRows.length ? { sheet: 'notes', op: 'updateMany', rows: undoRows } : null);
      }

      ConfigService.clearCache();
      return { success: true, applied };
    });
  } catch(e) { return fail(e); }
}

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
function apiGetMentionStats(universe) {
  try {
    const isAlt = (universe === 'alt');
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

    const historyRows = isAlt ? AltStorageService.getAltLogs() : StorageService.getFullHistoryRowsCached();
    historyRows.forEach(r => process(r.description, r.saiseur || r.player));
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

// ── Phrases ────────────────────────────────────────────────────────────────────

function apiGetPhrases() {
  try {
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return fail(e); }
}

function apiReorderPhrases(preset, pool, orderedRowIndexes, author, password) {
  try {
    requireAuthor(author, password);
    if (!preset || !pool) throw new Error("Preset ou pool manquant.");
    if (!Array.isArray(orderedRowIndexes) || !orderedRowIndexes.length) throw new Error("Liste d'ordre invalide.");
    return withLock(() => {
      PhrasesService.reorderPhrases(preset, pool, orderedRowIndexes);
      AuditService.log(author, 'Ordre modifié', 'Phrases: ' + preset + '/' + pool, '', orderedRowIndexes.join(' → '), '', null);
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiRepairOrder(author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      _ensureAllSheetHeaders();
      const result = { players: 0, categories: 0, bareme: 0, phrases: 0 };

      ['Players', 'Categories'].forEach(type => {
        const sheet = ConfigService.getSheets()[type.toLowerCase()];
        const data  = sheet.getDataRange().getValues();
        const off   = _headerOffsetFromValues(type.toLowerCase(), data);
        let rows = data.slice(off)
          .map((r, i) => ({ r, sheetRow: i + 1 + off }))
          .filter(x => x.r[0]);
        rows = _sortByOrdreOrOriginal(rows, x => x.r[4]);
        rows.forEach((x, idx) => sheet.getRange(x.sheetRow, 5).setValue(idx + 1));
        // Only label the Ordre column when row 1 really is a header — otherwise this
        // would overwrite the first entity's own Ordre value with the word "Ordre".
        if (off && sheet.getRange(1, 5).getValue() === '') sheet.getRange(1, 5).setValue('Ordre');
        result[type.toLowerCase()] = rows.length;
      });

      const baremeSheet = ConfigService.getSheets().bareme;
      if (baremeSheet) {
        const data = baremeSheet.getDataRange().getValues();
        const off  = _headerOffsetFromValues('bareme', data);
        const rows = data.slice(off)
          .map((r, i) => ({ r, sheetRow: i + 1 + off }))
          .filter(x => x.r[0] !== '' && x.r[0] !== undefined);
        const groups = {};
        rows.forEach(x => { (groups[x.r[0]] = groups[x.r[0]] || []).push(x); });
        Object.keys(groups).forEach(key => {
          const ordered = _sortByOrdreOrOriginal(groups[key], x => x.r[3]);
          ordered.forEach((x, idx) => baremeSheet.getRange(x.sheetRow, 4).setValue(idx + 1));
          result.bareme += ordered.length;
        });
      }

      const phrasesSheet = ConfigService.getSheets().phrases;
      if (phrasesSheet) {
        const data = phrasesSheet.getDataRange().getValues();
        const off  = _headerOffsetFromValues('phrases', data);
        const rows = data.slice(off)
          .map((r, i) => ({ r, sheetRow: i + 1 + off }))
          .filter(x => x.r[0] !== '' && x.r[2] !== '');
        const groups = {};
        rows.forEach(x => {
          const key = x.r[0] + '|' + x.r[1];
          (groups[key] = groups[key] || []).push(x);
        });
        Object.keys(groups).forEach(key => {
          const ordered = _sortByOrdreOrOriginal(groups[key], x => x.r[3]);
          ordered.forEach((x, idx) => phrasesSheet.getRange(x.sheetRow, 4).setValue(idx + 1));
          result.phrases += ordered.length;
        });
      }

      AuditService.log(author, 'Ordre réparé', 'Ordre', '',
        result.players + ' joueur(s), ' + result.categories + ' top(s), ' + result.bareme + ' règle(s), ' + result.phrases + ' phrase(s)',
        '', null);
      _bumpSettingsVersion();
      _bumpBaremeVersion();
      _bumpPhrasesVersion();
      ConfigService.clearCache();
      return Object.assign({ success: true }, result);
    });
  } catch(e) { return fail(e); }
}

function apiAddPhrase(preset, pool, text, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      PhrasesService.addPhrase(preset, pool, text);
      const sheet = ConfigService.getSheets().phrases;
      const after = '[' + (pool || '') + '] ' + (text || '').trim() + ' (preset: ' + (preset || '') + ')';
      AuditService.log(author, 'Phrase ajoutée', 'Phrases: ' + (preset || ''), '', after, '',
        { sheet: 'phrases', op: 'insert', rowIndex: sheet.getLastRow(),
          after: sheet.getRange(sheet.getLastRow(), 1, 1, 3).getValues()[0] });
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiSavePhrasesBatch(entries, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const existingSheet = ConfigService.getSheets().phrases;
      const startRow = existingSheet ? existingSheet.getLastRow() + 1 : null;
      PhrasesService.saveBatch(entries);
      const preset = entries && entries.length ? entries[0].preset : '';
      const finalSheet = ConfigService.getSheets().phrases;
      const addedRows = (startRow && entries && entries.length)
        ? finalSheet.getRange(startRow, 1, entries.length, 3).getValues() : [];
      AuditService.log(author, 'Phrases batch', 'Phrases: ' + (preset || ''), '', '',
        (entries || []).length + ' phrase(s)',
        addedRows.length ? { sheet: 'phrases', op: 'insertMany', rows: addedRows } : null);
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiUpdatePhrase(rowIndex, text, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      const before = _phraseRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      PhrasesService.updatePhrase(rowIndex, text);
      const afterRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      AuditService.log(author, 'Phrase modifiée', 'Phrases', before, (text || '').trim(),
        'ligne #' + rowIndex,
        { sheet: 'phrases', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiDeletePhrase(rowIndex, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      const before = _phraseRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      PhrasesService.deletePhrase(rowIndex);
      AuditService.log(author, 'Phrase supprimée', 'Phrases', before, '', 'ligne #' + rowIndex,
        { sheet: 'phrases', op: 'delete', before: beforeRow });
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiDeletePreset(presetName, author, password) {
  try {
    requireAuthor(author, password);
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      const removedRows = [];
      if (sheet) {
        const lastRow  = sheet.getLastRow();
        const startRow = _firstDataRow('phrases', sheet);
        if (lastRow >= startRow) {
          const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 3).getValues();
          data.forEach(r => { if (r[0].toString() === presetName) removedRows.push(r); });
        }
      }
      PhrasesService.deletePreset(presetName);
      AuditService.log(author, 'Preset supprimé', 'Phrases: ' + (presetName || ''), '', '', '',
        removedRows.length ? { sheet: 'phrases', op: 'deleteMany', rows: removedRows } : null);
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiRenamePreset(oldName, newName, author, password) {
  try {
    requireAuthor(author, password);
    if (!newName || !newName.trim()) throw new Error("Nouveau nom vide.");
    if (oldName === newName.trim()) return { success: true, phrases: PhrasesService.getAll() };
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      if (!sheet) throw new Error("Feuille Phrases introuvable.");
      const lastRow  = sheet.getLastRow();
      const startRow = _firstDataRow('phrases', sheet);
      if (lastRow < startRow) return { success: true, phrases: [] };
      const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 1).getValues();
      const undoRows = [];
      let modified = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i][0].toString() === oldName) {
          undoRows.push({ rowIndex: i + startRow, before: [oldName], after: [newName.trim()] });
          data[i][0] = newName.trim();
          modified = true;
        }
      }
      if (modified) sheet.getRange(startRow, 1, lastRow - startRow + 1, 1).setValues(data);
      AuditService.log(author, 'Preset renommé', 'Phrases', oldName || '', newName.trim(), '',
        undoRows.length ? { sheet: 'phrases', op: 'updateMany', rows: undoRows } : null);
      ConfigService.clearCache();
      return { success: true, phrases: PhrasesService.getAll() };
    });
  } catch(e) { return fail(e); }
}

function apiGetActivePhrasePreset() {
  try {
    const preset = PropertiesService.getScriptProperties().getProperty('active_phrase_preset') || '__default__';
    return { success: true, preset };
  } catch(e) { return fail(e); }
}

function apiSetActivePhrasePreset(name, author, password) {
  try {
    requireAuthor(author, password);
    if (!name || !name.trim()) throw new Error("Nom de preset manquant.");
    return withLock(() => {
      const before = PropertiesService.getScriptProperties().getProperty('active_phrase_preset') || '__default__';
      const after  = name.trim();
      PropertiesService.getScriptProperties().setProperty('active_phrase_preset', after);
      AuditService.log(author, 'Preset actif changé', 'Phrases', before, after, '');
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

// ── Changelog ───────────────────────────────────────────────────────────────────

/**
 * Récupère le contenu de CHANGELOG.md directement depuis le dépôt GitHub.
 * Utilise CacheService pendant 10 minutes pour optimiser le quota et le temps d'accès.
 * Si `forceRefresh` est vrai, le cache est contourné.
 */
function apiGetChangelog(forceRefresh) {
  try {
    const cacheKey = 'github_changelog_v1';
    const cache = CacheService.getScriptCache();
    if (!forceRefresh) {
      try {
        const cached = _cacheGetChunked(cache, cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (cacheReadErr) {
        console.warn('Erreur lecture cache changelog:', cacheReadErr);
      }
    }
    const url = 'https://raw.githubusercontent.com/Arcxy2nd/top-des-tops/main/CHANGELOG.md';
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const content = response.getContentText();
      const result = { success: true, content: content, fetchedAt: new Date().toISOString() };
      _cachePutChunked(cache, cacheKey, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
      return result;
    } else {
      return { success: false, error: 'Impossible de charger le changelog depuis GitHub (Code HTTP ' + response.getResponseCode() + ')' };
    }
  } catch (e) {
    return fail(e);
  }
}
