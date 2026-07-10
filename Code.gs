/**
 * SPREADSHEET STRUCTURE
 * History   : [0] Date | [1] Player   | [2] Category  | [3] Points | [4] Description
 * Players   : [0] Name | [1] Avatar URL | [2] Hex color | [3] Password (never sent to client)
 * Categories: [0] Name | [1] Description | [2] Emoji icon | [3] Hex color
 * Notes     : [0] Date | [1] Player   | [2] Note text
 * Bareme    : [0] Action (text) | [1] Points  (optional sheet, auto-created)
 * Settings  : [0] Key  | [1] Value  (optional sheet, auto-created — app_title, logo_url)
 * AutoRules : automatic point-granting rules (optional sheet, auto-created — see AutoPoints.gs)
 */

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
  { id: 'tab-settings',  icon: '⚙️', label: 'Paramètres' },
  { id: 'tab-notes',     icon: '📝', label: 'Notes', countId: 'notesCount' },
  { id: 'tab-history',   icon: '📜', label: 'Historique', countId: 'historyCount' },
  { id: 'tab-guide',     icon: '❓', label: 'Guide' },
];

function apiGetNavPages() {
  try {
    return { success: true, pages: NAV_PAGES };
  } catch(e) { return fail(e); }
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
      _cache = { spreadsheet: ss, history, players, categories, notes, bareme, phrases, auditLog, settings, autoRules };
      return _cache;
    } catch(e) {
      throw new Error("Erreur de connexion BDD : " + e.message);
    }
  };

  const clearCache = () => { _cache = null; _logsCache = null; };
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
    lock.waitLock(10000);
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

  /** Finds the 1-based row index of the first row (from row 2) matching `values` exactly. */
  function _findRowIndex(sheet, values) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2 || !values || !values.length) return -1;
    const data = sheet.getRange(2, 1, lastRow - 1, values.length).getValues();
    for (let i = 0; i < data.length; i++) if (_rowsEqual(data[i], values)) return i + 2;
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
  function _locate(sheet, rowIndex, expected) {
    if (rowIndex) {
      const current = sheet.getRange(rowIndex, 1, 1, expected.length).getValues()[0];
      if (_rowsEqual(current, expected)) return rowIndex;
    }
    const found = _findRowIndex(sheet, expected);
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
        const row = _locate(sheet, snapshot.rowIndex, snapshot.after);
        sheet.deleteRow(row);
        return;
      }
      case 'delete': {
        const before = _reviveRow(snapshot.before);
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, before.length).setValues([before]);
        return;
      }
      case 'update': {
        const row = _locate(sheet, snapshot.rowIndex, snapshot.after);
        const before = _reviveRow(snapshot.before);
        sheet.getRange(row, 1, 1, before.length).setValues([before]);
        return;
      }
      case 'insertMany': {
        snapshot.rows.forEach(r => {
          const row = _findRowIndex(sheet, r);
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
          const row = _locate(sheet, r.rowIndex, r.after);
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
    if (isNaN(rowIndex) || rowIndex < 2) throw new Error("Ligne de journal invalide.");
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

// ─── SETTINGS SERVICE ──────────────────────────────────────────────────────────
const SettingsService = {
  VALID_TYPES:   ['Players', 'Categories'],
  VALID_ACTIONS: ['ADD', 'DELETE', 'RENAME'],

  getEntities(type) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    return data.filter(r => r[0]).map(r => {
      if (type === 'Players') {
        // Players : [0] Name | [1] Avatar URL | [2] Hex color | [3] Password (never sent to client)
        return {
          name:  r[0].toString(),
          meta:  r[1] ? r[1].toString() : "",
          icon:  "",
          color: r[2] ? r[2].toString() : "",
          hasPassword: !!(r[3] && r[3].toString().trim())
        };
      } else {
        // Categories : [0] Name | [1] Description | [2] Emoji icon | [3] Hex color
        return {
          name:  r[0].toString(),
          meta:  r[1] ? r[1].toString() : "",
          icon:  r[2] ? r[2].toString() : "",
          color: r[3] ? r[3].toString() : ""
        };
      }
    });
  },

  addEntity(type, name, meta, icon) {
    if (!name) throw new Error("Le nom ne peut pas être vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    if (type === 'Players') {
      sheet.appendRow([name, meta || "", ""]);
    } else {
      sheet.appendRow([name, meta || "", icon || "", ""]);
    }
  },

  setEntityColor(type, name, color) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    let idx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === name) { idx = i; break; }
    }
    if (idx === -1) throw new Error(`${name} introuvable.`);
    const colIndex = type === 'Players' ? 3 : 4;
    sheet.getRange(idx + 1, colIndex).setValue(color || "");
  },

  deleteEntity(type, name) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    let deleted = false;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][0] === name) { sheet.deleteRow(i + 1); deleted = true; }
    }
    if (!deleted) throw new Error(`${name} introuvable.`);
  },

  renameEntity(type, oldName, newName, newMeta, newIcon) {
    if (!newName) throw new Error("Nouveau nom vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    let idx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === oldName) { idx = i; break; }
    }
    if (idx === -1) throw new Error(`${oldName} introuvable.`);
    if (type === 'Players') {
      const existingColor = data[idx][2] ? data[idx][2].toString() : "";
      sheet.getRange(idx + 1, 1, 1, 3).setValues([[newName, newMeta || "", existingColor]]);
    } else {
      const existingColor = data[idx][3] ? data[idx][3].toString() : "";
      sheet.getRange(idx + 1, 1, 1, 4).setValues([[newName, newMeta || "", newIcon || "", existingColor]]);
    }

    const histSheet = ConfigService.getSheets().history;
    const lastRow   = histSheet.getLastRow();
    if (lastRow > 1) {
      const colIndex = type === 'Players' ? 1 : 2;
      const range    = histSheet.getRange(2, colIndex + 1, lastRow - 1, 1);
      const vals     = range.getValues();
      let modified   = false;
      for (let i = 0; i < vals.length; i++) {
        if (vals[i][0] === oldName) { vals[i][0] = newName; modified = true; }
      }
      if (modified) range.setValues(vals);
    }
  },

  /** Returns true if the given password matches the player's password (column D of Players). */
  verifyIdentity(name, password) {
    const sheet = ConfigService.getSheets().players;
    const data  = sheet.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === name) {
        const stored = data[i][3] ? data[i][3].toString().trim() : "";
        if (!stored) return true; // no password configured → free access
        return stored === (password || "").toString().trim();
      }
    }
    throw new Error(`Joueur "${name}" introuvable.`);
  }
};

// ─── STORAGE SERVICE ───────────────────────────────────────────────────────────
const StorageService = {

  /**
   * Parses one raw History row into a normalized record with validity flags.
   * Single source of truth for how a History row is read/validated, shared by
   * getAllLogs, getHistoryPage, getDataHealth and apiDetectDistributedLots.
   * `i` is the 0-based index within the data range (header excluded).
   */
  _parseHistoryRow(row, i) {
    const d        = new Date(row[0]);
    const player   = row[1] ? row[1].toString() : '';
    const category = row[2] ? row[2].toString() : '';
    const points   = parseInt(row[3], 10);
    return {
      rowIndex:    i + 2,
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
    const tagToRealId = {};
    const _now = new Date();
    plan.forEach(day => {
      if (!day.date || !day.date.trim()) throw new Error("Date manquante dans le plan.");
      const _parts = day.date.trim().split('-').map(Number);
      const targetDate = new Date(_parts[0], _parts[1] - 1, _parts[2], _now.getHours(), _now.getMinutes(), _now.getSeconds());
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
            tagToRealId[e.groupTag] = 'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          }
          realGroupId = tagToRealId[e.groupTag];
        }
        rows.push([targetDate, e.player, e.category, pts * tms, e.description || '', realGroupId, e.saiseur || '']);
      });
    });
    if (!rows.length) throw new Error("Aucune donnée à injecter.");

    const { history } = ConfigService.getSheets();
    history.getRange(history.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  },

  /** Reads and parses every valid History row straight from the sheet (no cache). */
  _readLogsFromSheet() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    return sheet.getRange(2, 1, lastRow - 1, 4).getValues()
      .map((row, i) => {
        const rec = this._parseHistoryRow(row, i);
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
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    return sheet.getRange(2, 1, lastRow - 1, 7).getValues()
      .map((row, i) => {
        const rec = this._parseHistoryRow(row, i);
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
    const raw   = cache.get(key);
    if (raw) {
      try {
        return JSON.parse(raw).map(r => Object.assign({}, r, { date: new Date(r.date) }));
      } catch (e) { /* corrupt entry → fall through to a fresh read */ }
    }
    const result = this._readFullHistoryRows();
    const serial = JSON.stringify(result.map(r => Object.assign({}, r, { date: r.date.toISOString() })));
    if (serial.length <= 95000) cache.put(key, serial, 600);
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

    const raw = cache.get(key);
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
      if (serial.length <= 95000) cache.put(key, serial, 600);  // ≤ CacheService ~100KB limit; 10-min TTL
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

  getHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText) {
    const rows = this.getFullHistoryRowsCached();
    const hasPlayerFilter   = filterPlayers   && filterPlayers.length   > 0;
    const hasCategoryFilter = filterCategories && filterCategories.length > 0;

    let allWithIndex = [];
    for (let i = 0; i < rows.length; i++) {
      const rec = rows[i];
      if (hasPlayerFilter   && !filterPlayers.includes(rec.player))     continue;
      if (hasCategoryFilter && !filterCategories.includes(rec.category)) continue;
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

    allWithIndex.reverse();

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
    const ps    = pageSize || 20;
    const start = ((page || 1) - 1) * ps;
    const pagedItems = visualItems.slice(start, start + ps);

    // Aplatir pour renvoyer toutes les entrées de la page (groupes complets inclus)
    const paged = [];
    pagedItems.forEach(function(item) {
      item.entries.forEach(function(e) { paged.push(e); });
    });

    return { logs: paged, total: totalVisual, totalEntries: allWithIndex.length };
  },

  updateHistoryDescription(rowIndex, description) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    ConfigService.getSheets().history.getRange(idx, 5).setValue(description || '');
  },

  /**
   * Updates every editable field of a single History row (date, player, category,
   * points, description). Column F (groupId) is left untouched.
   * fields : { date: 'YYYY-MM-DD', player, category, points, description }.
   */
  updateHistoryEntry(rowIndex, fields) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    if (!fields)          throw new Error("Données manquantes.");
    if (!fields.player)   throw new Error("Joueur requis.");
    if (!fields.category) throw new Error("Top requis.");
    const pts = parseInt(fields.points, 10);
    if (isNaN(pts) || pts < 1) throw new Error("Les points doivent être ≥ 1.");
    const _now = new Date();
    const _dp = (fields.date || '').trim().split('-').map(Number);
    const targetDate = new Date(_dp[0], _dp[1] - 1, _dp[2], _now.getHours(), _now.getMinutes(), _now.getSeconds());
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
    const raw   = cache.get(key);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { /* corrupt entry → recompute */ }
    }
    const result = this._computeDataHealth();
    cache.put(key, JSON.stringify(result), 600);
    return result;
  },

  _computeDataHealth() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { zeros: 0, orphans: 0, total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));

    let zeros = 0, orphans = 0;

    data.forEach((row, idx) => {
      const rec = this._parseHistoryRow(row, idx);
      if (!rec.dateValid) return;
      if (!rec.pointsValid) zeros++;
      if (rec.player && !players.has(rec.player))         orphans++;
      else if (rec.category && !categories.has(rec.category)) orphans++;
    });

    return {
      total:  data.length,
      zeros,
      orphans
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
    if (lastRow <= 1) return { deleted: 0, rows: [] };
    this._backupHistory();
    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    const rows = [];
    for (let i = data.length - 1; i >= 0; i--) {
      const pts = parseInt(data[i][3], 10);
      if (isNaN(pts) || pts <= 0) {
        rows.push(data[i]);
        sheet.deleteRow(i + 2);
      }
    }
    return { deleted: rows.length, rows };
  },

  /** Supprime les entrées dont le joueur ou la catégorie n'existe plus. Renvoie
   *  aussi les lignes complètes supprimées, pour permettre une annulation. */
  deleteOrphans() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { deleted: 0, rows: [] };
    this._backupHistory();
    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));
    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    const rows = [];
    for (let i = data.length - 1; i >= 0; i--) {
      const player = data[i][1] ? data[i][1].toString() : '';
      const cat    = data[i][2] ? data[i][2].toString() : '';
      if (!players.has(player) || !categories.has(cat)) {
        rows.push(data[i]);
        sheet.deleteRow(i + 2);
      }
    }
    return { deleted: rows.length, rows };
  }
};

// ─── NOTES SERVICE ─────────────────────────────────────────────────────────────
const NotesService = {

  /** Renvoie la feuille Notes, en la CRÉANT automatiquement si elle n'existe pas. */
  _sheet() {
    let sheet = ConfigService.getSheets().notes;
    if (sheet) return sheet;
    const ss = ConfigService.getSheets().spreadsheet;
    sheet = ss.insertSheet('Notes');
    sheet.appendRow(['Date', 'Joueur', 'Note']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    ConfigService.clearCache();
    return sheet;
  },

  /** Toutes les notes (récentes d'abord). Lecture tolérante : pas de feuille → liste vide. */
  getAllNotes() {
    const sheet = ConfigService.getSheets().notes;
    if (!sheet) return { notes: [] };   // pas encore de feuille (aucune note créée)
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { notes: [] };

    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const out = [];
    for (let i = 0; i < data.length; i++) {
      const row    = data[i];
      const player = row[1] ? row[1].toString() : '';
      const text   = row[2] ? row[2].toString() : '';
      if (!player && !text) continue;
      const d = new Date(row[0]);
      out.push({
        timestamp: isNaN(d.getTime()) ? null : d.toISOString(),
        player,
        text,
        rowIndex: i + 2
      });
    }
    out.reverse();
    return { notes: out };
  },

  addNote(player, text, dateStr) {
    if (!player) throw new Error("Joueur manquant.");
    if (!text || !text.trim()) throw new Error("La note ne peut pas être vide.");

    const _now = new Date();
    let targetDate;
    if (dateStr && dateStr.trim()) {
      const _parts = dateStr.trim().split('-').map(Number);
      targetDate = new Date(_parts[0], _parts[1] - 1, _parts[2], _now.getHours(), _now.getMinutes(), _now.getSeconds());
    } else {
      targetDate = _now;
    }
    if (isNaN(targetDate.getTime())) throw new Error("Date fournie incorrecte.");

    const sheet = this._sheet();
    sheet.appendRow([targetDate, player, text.trim()]);
    return { rowIndex: sheet.getLastRow(), timestamp: targetDate.toISOString(), player, text: text.trim() };
  },

  deleteNote(rowIndex) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    this._sheet().deleteRow(idx);
  },

  editNote(rowIndex, newText) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    if (!newText || !newText.trim()) throw new Error("La note ne peut pas être vide.");
    this._sheet().getRange(idx, 3).setValue(newText.trim());
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

    const pad = n => String(n).padStart(2, '0');
    const dayKey   = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
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
  const view = e && e.parameter ? e.parameter.view : null;
  const file = view === 'mobile' ? 'Mobile' : 'Index';

  // Rendu templaté (pas createHtmlOutputFromFile) pour injecter l'adresse
  // publique exacte du déploiement courant : une URL relative écrite depuis le
  // client se résout contre l'origine du bac à sable Google (une adresse
  // interne du type n-xxxx-script.googleusercontent.com), jamais contre
  // l'adresse réelle du site — d'où les liens cassés observés en pratique.
  const template = HtmlService.createTemplateFromFile(file);
  // Ne doit jamais faire échouer le chargement de la page : si l'autorisation
  // du script venait à manquer pour une raison quelconque, le pire résultat
  // acceptable est un bouton de bascule inerte, pas un site qui ne charge plus.
  try { template.appUrl = ScriptApp.getService().getUrl(); }
  catch (e) { template.appUrl = ''; }
  return template.evaluate()
    .setTitle('Tops des Tops')
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
    return {
      success:  true,
      appTitle: all.app_title || 'Tops des Tops',
      logoUrl:  all.logo_url  || ''
    };
  } catch(e) { return fail(e); }
}

function apiSaveAppSettings(title, logoUrl, author) {
  try {
    return withLock(() => {
      SettingsSheetService.setValue('app_title', (title || '').trim());
      SettingsSheetService.setValue('logo_url', (logoUrl || '').trim());
      AuditService.log(author, 'Identité app modifiée', 'Settings', '', (title || '').trim(), '');
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
    const result = {};
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) result[data[i][0].toString()] = data[i][1] ? data[i][1].toString() : '';
    }
    return result;
  },

  setValue(key, value) {
    const sheet = this._getOrCreateSheet();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
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
    sheet.appendRow(['Top', 'Action', 'Points']);
    ConfigService.clearCache();
    return ConfigService.getSheets().bareme;
  },

  /** Returns all entries with 1-based row indices (row 1 = header). */
  getEntries() {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.slice(1)
      .filter(r => r[0] !== "" && r[0] !== undefined)
      .map((r, i) => ({
        rowIndex: i + 2,
        top:      r[0].toString(),
        action:   r[1] ? r[1].toString() : "",
        pts:      r[2] !== "" && r[2] !== undefined ? Number(r[2]) : 0
      }));
  },

  addEntry(top, action, pts) {
    if (!top   || !top.trim())    throw new Error("Top manquant.");
    if (!action || !action.trim()) throw new Error("Action vide.");
    this._getOrCreateSheet().appendRow([top.trim(), action.trim(), Number(pts) || 0]);
  },

  updateEntry(rowIndex, action, pts) {
    if (!action || !action.trim()) throw new Error("Action vide.");
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    sheet.getRange(rowIndex, 2, 1, 2).setValues([[action.trim(), Number(pts) || 0]]);
  },

  deleteEntry(rowIndex) {
    const sheet = ConfigService.getSheets().bareme;
    if (!sheet) throw new Error("Feuille Bareme introuvable.");
    sheet.deleteRow(rowIndex);
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
    sheet.appendRow(['Preset', 'Pool', 'Phrase']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    ConfigService.clearCache();
    return ConfigService.getSheets().phrases;
  },

  getAll() {
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.slice(1)
      .filter(r => r[0] !== '' && r[2] !== '')
      .map((r, i) => ({
        rowIndex: i + 2,
        preset:   r[0].toString(),
        pool:     r[1].toString(),
        text:     r[2].toString()
      }));
  },

  addPhrase(preset, pool, text) {
    if (!preset || !pool || !text || !text.trim()) throw new Error("Champs manquants.");
    if (!this._isValidPool(pool)) throw new Error("Pool invalide : " + pool);
    this._getOrCreateSheet().appendRow([preset.trim(), pool, text.trim()]);
  },

  saveBatch(entries) {
    if (!entries || !entries.length) return;
    const rows = entries.map(e => {
      if (!this._isValidPool(e.pool)) throw new Error("Pool invalide : " + e.pool);
      return [e.preset.trim(), e.pool, e.text.trim()];
    });
    const sheet = this._getOrCreateSheet();
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  },

  updatePhrase(rowIndex, text) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    if (!text || !text.trim()) throw new Error("La phrase ne peut pas être vide.");
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    sheet.getRange(idx, 3).setValue(text.trim());
  },

  deletePhrase(rowIndex) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) throw new Error("Feuille Phrases introuvable.");
    sheet.deleteRow(idx);
  },

  deletePreset(presetName) {
    if (!presetName) throw new Error("Nom de preset manquant.");
    const sheet = ConfigService.getSheets().phrases;
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][0].toString() === presetName) sheet.deleteRow(i + 2);
    }
  }
};

function apiGetBareme() {
  try {
    return { success: true, entries: BaremeService.getEntries() };
  } catch(e) { return fail(e); }
}

function apiAddBaremeEntry(top, action, pts, author) {
  try {
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

function apiUpdateBaremeEntry(rowIndex, action, pts, author) {
  try {
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

function apiDeleteBaremeEntry(rowIndex, author) {
  try {
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

function apiSetColor(type, name, color, author) {
  try {
    if (!SettingsService.VALID_TYPES.includes(type)) throw new Error("Type invalide.");
    return withLock(() => {
      const sheetKey = type === 'Players' ? 'players' : 'categories';
      const numCols  = type === 'Players' ? 3 : 4;
      const sheet    = ConfigService.getSheets()[sheetKey];
      const data     = sheet.getDataRange().getValues();
      const rowIdx0  = data.findIndex(r => r[0] === name);
      const rowIdx1  = rowIdx0 + 1;
      const beforeRow = rowIdx0 >= 0 ? data[rowIdx0].slice(0, numCols) : null;
      const before = _entityColorSummary(type, name);
      SettingsService.setEntityColor(type, name, color);
      const label = type === 'Players' ? 'Joueur' : 'Top';
      const afterRow = beforeRow ? sheet.getRange(rowIdx1, 1, 1, numCols).getValues()[0] : null;
      AuditService.log(author, 'Couleur ' + label.toLowerCase(), label + ': ' + name,
        before, color || '', '',
        beforeRow ? { sheet: sheetKey, op: 'update', rowIndex: rowIdx1, before: beforeRow, after: afterRow } : null);
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiManageEntity(action, type, newName, newMeta, oldName, newIcon, author) {
  try {
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
        const before = _entitySummary(type, oldName);
        const data = sheet.getDataRange().getValues();
        const beforeRow = data.find(r => r[0] === oldName);
        SettingsService.deleteEntity(type, oldName);
        AuditService.log(author, label + ' supprimé', label + ': ' + (oldName || ''), before, '', '',
          beforeRow ? { sheet: sheetKey, op: 'delete', before: beforeRow.slice(0, numCols) } : null);
      }
      if (action === 'RENAME') {
        const data = sheet.getDataRange().getValues();
        const beforeRow = data.find(r => r[0] === oldName);
        SettingsService.renameEntity(type, oldName, newName, newMeta, newIcon);
        const afterData = sheet.getDataRange().getValues();
        const afterIdx  = afterData.findIndex(r => r[0] === newName);
        const afterRow  = afterIdx >= 0 ? afterData[afterIdx] : null;
        AuditService.log(author, label + ' renommé', label + ': ' + (oldName || ''),
          oldName || '', newName || '', '',
          (beforeRow && afterRow) ? { sheet: sheetKey, op: 'update',
            rowIndex: afterIdx + 1,
            before: beforeRow.slice(0, numCols), after: afterRow.slice(0, numCols) } : null);
      }

      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiAddBulkPlan(plan, author) {
  try {
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

function apiGetHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText) {
  try {
    const players    = (filterPlayers    && filterPlayers.length)    ? filterPlayers    : null;
    const categories = (filterCategories && filterCategories.length) ? filterCategories : null;
    const result = StorageService.getHistoryPage(page, pageSize, players, categories, filterText || null);
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

function apiDeleteHistoryEntries(rowIndexes, author) {
  try {
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const sorted = [...rowIndexes].sort((a, b) => b - a);
      const removedRows = sorted.map(ri => history.getRange(ri, 1, 1, 7).getValues()[0]);
      sorted.forEach(ri => history.deleteRow(ri));
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

function apiGetQuickStats() {
  try {
    const allPlayers = SettingsService.getEntities('Players').map(p => p.name);
    const logs = StorageService.getFilteredLogs(allPlayers, null, null, null);

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
        } : null
      }
    };
  } catch (e) { return fail(e); }
}

// ── Outils de nettoyage ──────────────────────────────────────────────────────

function apiGetDataHealth() {
  try {
    return { success: true, health: StorageService.getDataHealth() };
  } catch(e) { return fail(e); }
}

// ── Journal d'audit (lecture paginée et filtrable) ─────────────────────────────
function apiGetAuditLog(page, pageSize, filterAuthor, filterAction, startDate, endDate, searchText) {
  try {
    const sheet = ConfigService.getSheets().auditLog;
    if (!sheet) return { success: true, logs: [], total: 0 };
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, logs: [], total: 0 };

    const data  = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
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
        id:        i + 2,
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
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, actions: [] };
    const col = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    const set = new Set();
    col.forEach(r => { if (r[0]) set.add(r[0].toString()); });
    return { success: true, actions: [...set].sort((a, b) => a.localeCompare(b, 'fr')) };
  } catch(e) { return fail(e); }
}

function apiUndoAuditEntry(auditRowId, author) {
  try {
    return withLock(() => AuditService.undo(auditRowId, author));
  } catch (e) { return fail(e); }
}

function apiFixZeroPoints(author) {
  try {
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

function apiDeleteOrphans(author) {
  try {
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

function apiUpdateHistoryDescription(rowIndex, description, author) {
  try {
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

function apiUpdateHistoryEntry(rowIndex, fields, author) {
  try {
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const before = _historyRowSummary(rowIndex);
      const beforeRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      StorageService.updateHistoryEntry(rowIndex, fields);
      const afterRow = history.getRange(rowIndex, 1, 1, 7).getValues()[0];
      const after = [fields.player || '?', fields.category || '?',
        (parseInt(fields.points, 10) || '?') + ' pts', fields.date || '',
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

function apiAddNote(player, text, dateStr, author) {
  try {
    return withLock(() => {
      const note = NotesService.addNote(player, text, dateStr);
      const sheet = ConfigService.getSheets().notes;
      AuditService.log(author, 'Note ajoutée', 'Note: ' + (player || ''),
        '', (player || '') + ' : ' + (text || '').trim(), '',
        { sheet: 'notes', op: 'insert', rowIndex: note.rowIndex,
          after: sheet.getRange(note.rowIndex, 1, 1, 3).getValues()[0] });
      return { success: true, note };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteNote(rowIndex, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().notes;
      const before = _noteRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      NotesService.deleteNote(rowIndex);
      AuditService.log(author, 'Note supprimée', 'Note', before, '', 'ligne #' + rowIndex,
        { sheet: 'notes', op: 'delete', before: beforeRow });
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiEditNote(rowIndex, newText, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().notes;
      const before = _noteRowSummary(rowIndex);
      const beforeRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      NotesService.editNote(rowIndex, newText);
      const afterRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      AuditService.log(author, 'Note modifiée', 'Note', before, (newText || '').trim(),
        'ligne #' + rowIndex,
        { sheet: 'notes', op: 'update', rowIndex, before: beforeRow, after: afterRow });
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiUpdateBulkEntries(rowIndexes, partialFields, author) {
  try {
    if (!rowIndexes || !rowIndexes.length) throw new Error("Aucune ligne sélectionnée.");
    if (!partialFields || !Object.keys(partialFields).length) return { success: true };
    return withLock(function() {
      var history  = ConfigService.getSheets().history;
      var lastRow  = history.getLastRow();
      if (lastRow <= 1) return { success: true, skipped: [] };

      var allData  = history.getRange(2, 1, lastRow - 1, 7).getValues();
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
        var rowI = idx - 2;
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
          var _now = new Date();
          var _dp = (partialFields.date + '').split('-').map(Number);
          targetDate = new Date(_dp[0], _dp[1] - 1, _dp[2], _now.getHours(), _now.getMinutes(), _now.getSeconds());
          if (isNaN(targetDate.getTime())) { skipped.push(idx); return; }
        } else {
          targetDate = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
        }

        history.getRange(idx, 1, 1, 5).setValues([[targetDate, player, category, pts, desc]]);
        if (hasSais) history.getRange(idx, 7).setValue(saiseur);
        undoRows.push({ rowIndex: idx, before: beforeRow, after: history.getRange(idx, 1, 1, 7).getValues()[0] });
      });

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
    const raw   = cache.get(key);
    if (raw) {
      try { return { success: true, lots: JSON.parse(raw) }; } catch (e) { /* corrupt entry → recompute */ }
    }

    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, lots: [] };

    const pad = function(n) { return String(n).padStart(2, '0'); };
    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    const entries = [];
    for (var i = 0; i < data.length; i++) {
      var rec = StorageService._parseHistoryRow(data[i], i);
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
    const serial = JSON.stringify(lots);
    if (serial.length <= 95000) cache.put(key, serial, 600);
    return { success: true, lots: lots };
  } catch(e) { return fail(e); }
}

function apiDetectLegacyGroups() {
  try {
    const LEGACY_GID_RE = /^G\d{1,6}$/;
    const pad = function(n) { return String(n).padStart(2, '0'); };

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

function apiGroupDistributedLots(lotsToGroup, author) {
  try {
    if (!lotsToGroup || !lotsToGroup.length) throw new Error("Aucun lot fourni.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      lotsToGroup.forEach(function(lot) {
        var rows = lot.rowIndexes;
        if (!rows || rows.length < 2) return;
        var gid = 'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        rows.forEach(function(r) { sheet.getRange(r, 6).setValue(gid); });
      });
      AuditService.log(author, 'Lots auto-groupés', 'History', '', '',
        lotsToGroup.length + ' lot(s)');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiGroupRows(rowIndexes, author) {
  try {
    if (!rowIndexes || rowIndexes.length < 2) throw new Error("Sélectionnez au moins 2 entrées.");
    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const lastRow = history.getLastRow();
      if (lastRow <= 1) throw new Error("Historique vide.");
      const gid      = 'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const colRange = history.getRange(2, 6, lastRow - 1, 1);
      const values   = colRange.getValues();
      const indexSet = new Set(rowIndexes.map(ri => parseInt(ri, 10)));
      for (let i = 0; i < values.length; i++) {
        if (indexSet.has(i + 2)) values[i][0] = gid;
      }
      colRange.setValues(values);
      AuditService.log(author, 'Groupement lot', 'History', '', '',
        rowIndexes.length + ' entrée(s), gid: ' + gid);
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiUngroupLot(groupId, author) {
  try {
    if (!groupId) throw new Error("GroupID manquant.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return { success: true };
      const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
      for (var i = 0; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString() === groupId) {
          sheet.getRange(i + 2, 6).setValue('');
        }
      }
      AuditService.log(author, 'Dégroupement lot', 'History', groupId, '', '');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiDetectDuplicates() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const pad = n => String(n).padStart(2, '0');
    const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

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

function apiDetectOutlierScores() {
  try {
    const rows = StorageService.getFullHistoryRowsCached().filter(r => !r.groupId);
    const byCategory = {};
    rows.forEach(r => (byCategory[r.category] = byCategory[r.category] || []).push(r));

    const pad = n => String(n).padStart(2, '0');
    const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

    // Médiane + MAD (écart absolu médian) plutôt que moyenne + écart-type : ces
    // dernières se font fausser par l'aberration elle-même sur un petit échantillon
    // (une seule entrée à 500 pts tire déjà la moyenne et l'écart-type vers le haut,
    // masquant sa propre anomalie). La médiane/MAD reste stable face à ce cas.
    function median(values) {
      const sorted = values.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    const outliers = [];
    Object.keys(byCategory).forEach(cat => {
      const list = byCategory[cat];
      if (list.length < 5) return;
      const points = list.map(r => r.points);
      const med = median(points);
      const mad = median(points.map(p => Math.abs(p - med))) || 1; // évite un seuil nul si MAD = 0
      const threshold = med + 5 * mad;
      list.forEach(r => {
        if (r.points > threshold) {
          outliers.push({
            rowIndex: r.rowIndex, player: r.player, category: r.category, points: r.points,
            categoryAverage: Math.round(med), dateStr: dayKey(r.date)
          });
        }
      });
    });

    outliers.sort((a, b) => b.points - a.points);
    return { success: true, outliers };
  } catch(e) { return fail(e); }
}

function apiGetInactivePlayers() {
  try {
    const players = SettingsService.getEntities('Players');
    const rows = StorageService.getFullHistoryRowsCached();
    const lastByPlayer = {};
    rows.forEach(r => {
      if (!lastByPlayer[r.player] || r.date > lastByPlayer[r.player]) lastByPlayer[r.player] = r.date;
    });

    const now = new Date();
    const inactive = [];
    const neverActive = [];
    players.forEach(p => {
      const last = lastByPlayer[p.name];
      if (!last) { neverActive.push(p.name); return; }
      inactive.push({ player: p.name, daysSinceLastEntry: Math.floor((now - last) / 86400000) });
    });
    inactive.sort((a, b) => b.daysSinceLastEntry - a.daysSinceLastEntry);

    return { success: true, inactive, neverActive };
  } catch(e) { return fail(e); }
}

function apiGetPlayerRecords() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const byPlayer = {};
    rows.forEach(r => (byPlayer[r.player] = byPlayer[r.player] || []).push(r));

    const pad = n => String(n).padStart(2, '0');
    const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

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

    return { success: true, records, globalBest };
  } catch(e) { return fail(e); }
}

function apiGetTrends() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
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

    return { success: true, categoryTrends, playerTrends };
  } catch(e) { return fail(e); }
}

function apiGetActiveWeekday() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
    const counts = [0, 0, 0, 0, 0, 0, 0]; // index = Date.getDay(), 0 = dimanche
    rows.forEach(r => { counts[r.date.getDay()]++; });

    const labels = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const byWeekday = labels.map((label, i) => ({ weekday: label, count: counts[i] }));
    let topIndex = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[topIndex]) topIndex = i;

    return { success: true, byWeekday, topWeekday: rows.length ? labels[topIndex] : null };
  } catch(e) { return fail(e); }
}

function apiGetTopPlayerCategoryPairs() {
  try {
    const rows = StorageService.getFullHistoryRowsCached();
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

    return { success: true, pairs };
  } catch(e) { return fail(e); }
}

function apiRemoveFromGroup(rowIndex, author) {
  try {
    if (!rowIndex) throw new Error("Index de ligne manquant.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      sheet.getRange(rowIndex, 6).setValue('');
      AuditService.log(author, 'Retrait du groupe', 'History', String(rowIndex), '', '');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

function apiDeleteGroup(groupId, author) {
  try {
    if (!groupId) throw new Error("GroupID manquant.");
    return withLock(() => {
      const sheet = ConfigService.getSheets().history;
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return { success: true };
      const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
      const rowsToDelete = [];
      for (let i = 0; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString() === groupId) rowsToDelete.push(i + 2);
      }
      if (!rowsToDelete.length) throw new Error("Groupe introuvable.");
      rowsToDelete.sort((a, b) => b - a).forEach(ri => sheet.deleteRow(ri));
      AuditService.log(author, 'Suppression groupe', 'History', groupId, '',
        rowsToDelete.length + ' entrée(s)');
      ConfigService.clearCache();
      return { success: true };
    });
  } catch(e) { return fail(e); }
}

// ── Phrases ────────────────────────────────────────────────────────────────────

function apiGetPhrases() {
  try {
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return fail(e); }
}

function apiAddPhrase(preset, pool, text, author) {
  try {
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

function apiSavePhrasesBatch(entries, author) {
  try {
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

function apiUpdatePhrase(rowIndex, text, author) {
  try {
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

function apiDeletePhrase(rowIndex, author) {
  try {
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

function apiDeletePreset(presetName, author) {
  try {
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      const removedRows = [];
      if (sheet) {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
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

function apiRenamePreset(oldName, newName, author) {
  try {
    if (!newName || !newName.trim()) throw new Error("Nouveau nom vide.");
    if (oldName === newName.trim()) return { success: true, phrases: PhrasesService.getAll() };
    return withLock(() => {
      const sheet = ConfigService.getSheets().phrases;
      if (!sheet) throw new Error("Feuille Phrases introuvable.");
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return { success: true, phrases: [] };
      const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const undoRows = [];
      let modified = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i][0].toString() === oldName) {
          undoRows.push({ rowIndex: i + 2, before: [oldName], after: [newName.trim()] });
          data[i][0] = newName.trim();
          modified = true;
        }
      }
      if (modified) sheet.getRange(2, 1, lastRow - 1, 1).setValues(data);
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

function apiSetActivePhrasePreset(name) {
  try {
    if (!name || !name.trim()) throw new Error("Nom de preset manquant.");
    PropertiesService.getScriptProperties().setProperty('active_phrase_preset', name.trim());
    return { success: true };
  } catch(e) { return fail(e); }
}