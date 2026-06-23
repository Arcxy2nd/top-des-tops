/**
 * SPREADSHEET STRUCTURE
 * History   : [0] Date | [1] Player   | [2] Category  | [3] Points | [4] Description
 * Players   : [0] Name | [1] Avatar URL | [2] Hex color
 * Categories: [0] Name | [1] Description | [2] Emoji icon | [3] Hex color
 * Notes     : [0] Date | [1] Player   | [2] Note text
 * Bareme    : [0] Action (text) | [1] Points  (optional sheet, auto-created)
 */

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
      const notes   = ss.getSheetByName('Notes')   || null;
      const bareme  = ss.getSheetByName('Bareme')  || null;
      const phrases = ss.getSheetByName('Phrases') || null;
      _cache = { spreadsheet: ss, history, players, categories, notes, bareme, phrases };
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

// ─── SETTINGS SERVICE ──────────────────────────────────────────────────────────
const SettingsService = {
  VALID_TYPES:   ['Players', 'Categories'],
  VALID_ACTIONS: ['ADD', 'DELETE', 'RENAME'],

  getEntities(type) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    return data.filter(r => r[0]).map(r => {
      if (type === 'Players') {
        // Players : [0] Name | [1] Avatar URL | [2] Hex color
        return {
          name:  r[0].toString(),
          meta:  r[1] ? r[1].toString() : "",
          icon:  "",
          color: r[2] ? r[2].toString() : ""
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
  }
};

// ─── STORAGE SERVICE ───────────────────────────────────────────────────────────
const StorageService = {

  appendBulkLogs(entries, customDateStr, groupId) {
    if (!entries || !entries.length) throw new Error("Aucune donnée à injecter.");

    let targetDate;
    if (customDateStr && customDateStr.trim()) {
      targetDate = new Date(customDateStr.trim() + 'T12:00:00');
    } else {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      targetDate = new Date(
        `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T12:00:00`
      );
    }
    if (isNaN(targetDate.getTime())) throw new Error("Date fournie incorrecte.");

    const gid = groupId || '';
    const rows = entries.map(e => {
      if (!e.player || !e.category) throw new Error("Joueur ou catégorie manquant(e).");
      const pts = parseInt(e.points, 10);
      const tms = parseInt(e.times,  10);
      if (isNaN(pts) || pts < 1)  throw new Error("Les points doivent être ≥ 1.");
      if (isNaN(tms) || tms < 1)  throw new Error("Le multiplicateur doit être ≥ 1.");
      return [targetDate, e.player, e.category, pts * tms, e.description || '', gid];
    });

    const { history } = ConfigService.getSheets();
    history.getRange(history.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  },

  getAllLogs() {
    const cached = ConfigService.getLogsCache();
    if (cached) return cached;
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) { ConfigService.setLogsCache([]); return []; }
    const result = sheet.getRange(2, 1, lastRow - 1, 4).getValues()
      .map(row => {
        const d      = new Date(row[0]);
        const points = parseInt(row[3], 10);
        if (isNaN(d.getTime()))  return null;
        if (!row[1] || !row[2])  return null;
        if (isNaN(points) || points <= 0) return null;
        return {
          timestamp: d,
          player:    row[1].toString(),
          category:  row[2].toString(),
          points
        };
      })
      .filter(Boolean);
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

  getHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText) {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { logs: [], total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const hasPlayerFilter   = filterPlayers   && filterPlayers.length   > 0;
    const hasCategoryFilter = filterCategories && filterCategories.length > 0;

    let allWithIndex = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) continue;
      const player      = row[1] ? row[1].toString() : '';
      const category    = row[2] ? row[2].toString() : '';
      const points      = parseInt(row[3], 10);
      const description = row[4] ? row[4].toString() : '';
      const groupId     = row[5] ? row[5].toString() : '';
      if (!player || !category)         continue;
      if (isNaN(points) || points <= 0) continue;
      if (hasPlayerFilter   && !filterPlayers.includes(player))     continue;
      if (hasCategoryFilter && !filterCategories.includes(category)) continue;
      if (filterText) {
        const ft = filterText.toLowerCase();
        if (!player.toLowerCase().includes(ft) &&
            !category.toLowerCase().includes(ft) &&
            !description.toLowerCase().includes(ft)) continue;
      }
      allWithIndex.push({
        timestamp: d.toISOString(),
        player,
        category,
        points,
        description,
        groupId,
        rowIndex: i + 2
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

  deleteHistoryEntry(rowIndex) {
    ConfigService.getSheets().history.deleteRow(rowIndex);
  },

  updateHistoryDescription(rowIndex, description) {
    const idx = parseInt(rowIndex, 10);
    if (isNaN(idx) || idx < 2) throw new Error("Ligne invalide.");
    ConfigService.getSheets().history.getRange(idx, 5).setValue(description || '');
  },

  // ── OUTILS NETTOYAGE ────────────────────────────────────────────────

  /** Retourne des stats de santé du sheet sans modifier quoi que ce soit */
  getDataHealth() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { zeros: 0, orphans: 0, total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));

    let zeros = 0, orphans = 0;

    data.forEach(row => {
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) return;
      const pts = parseInt(row[3], 10);
      const player = row[1] ? row[1].toString() : '';
      const cat    = row[2] ? row[2].toString() : '';

      if (isNaN(pts) || pts <= 0) zeros++;
      if (player && !players.has(player))    orphans++;
      else if (cat && !categories.has(cat))  orphans++;
    });

    return {
      total:  data.length,
      zeros,
      orphans
    };
  },

  /** Supprime les lignes avec points <= 0 */
  fixZeroPoints() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { deleted: 0 };
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    let deleted = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const pts = parseInt(data[i][3], 10);
      if (isNaN(pts) || pts <= 0) {
        sheet.deleteRow(i + 2);
        deleted++;
      }
    }
    return { deleted };
  },

  /** Supprime les entrées dont le joueur ou la catégorie n'existe plus */
  deleteOrphans() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { deleted: 0 };
    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    let deleted = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const player = data[i][1] ? data[i][1].toString() : '';
      const cat    = data[i][2] ? data[i][2].toString() : '';
      if (!players.has(player) || !categories.has(cat)) {
        sheet.deleteRow(i + 2);
        deleted++;
      }
    }
    return { deleted };
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

    let targetDate;
    if (dateStr && dateStr.trim()) {
      targetDate = new Date(dateStr.trim() + 'T12:00:00');
    } else {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      targetDate = new Date(`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T12:00:00`);
    }
    if (isNaN(targetDate.getTime())) throw new Error("Date fournie incorrecte.");

    this._sheet().appendRow([targetDate, player, text.trim()]);
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

  getAggregatedData(filterYear, filterMonth) {
    const all = StorageService.getAllLogs();
    let logs  = all;
    if (filterYear  && filterYear  !== "All") logs = logs.filter(l => l.timestamp.getFullYear() === parseInt(filterYear, 10));
    if (filterMonth && filterMonth !== "All") logs = logs.filter(l => l.timestamp.getMonth()    === parseInt(filterMonth, 10));

    const players    = SettingsService.getEntities('Players').map(p => p.name);
    const categories = SettingsService.getEntities('Categories').map(c => c.name);
    const { scores, orphanCount } = this._aggregate(logs, players, categories);

    return {
      scores,
      categories,
      insights: this.generateInsights(scores, categories, orphanCount),
      orphanCount
    };
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

    return { labels, series };
  },

  getAvailableYears() {
    const logs = StorageService.getAllLogs();
    const years = new Set();
    logs.forEach(l => years.add(l.timestamp.getFullYear()));
    const current = new Date().getFullYear();
    years.add(current);
    return Array.from(years).sort((a, b) => b - a);
  }
};

// ─── API ENDPOINTS ─────────────────────────────────────────────────────────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
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
  } catch(e) { return { success: false, error: e.message }; }
}

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
    if (!this.VALID_POOLS.includes(pool)) throw new Error("Pool invalide : " + pool);
    this._getOrCreateSheet().appendRow([preset.trim(), pool, text.trim()]);
  },

  saveBatch(entries) {
    if (!entries || !entries.length) return;
    const rows = entries.map(e => {
      if (!this.VALID_POOLS.includes(e.pool)) throw new Error("Pool invalide : " + e.pool);
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
  } catch(e) { return { success: false, error: e.message }; }
}

function apiAddBaremeEntry(top, action, pts) {
  try {
    BaremeService.addEntry(top, action, pts);
    ConfigService.clearCache();
    return { success: true, entries: BaremeService.getEntries() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiUpdateBaremeEntry(rowIndex, action, pts) {
  try {
    BaremeService.updateEntry(rowIndex, action, pts);
    ConfigService.clearCache();
    return { success: true, entries: BaremeService.getEntries() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteBaremeEntry(rowIndex) {
  try {
    BaremeService.deleteEntry(rowIndex);
    ConfigService.clearCache();
    return { success: true, entries: BaremeService.getEntries() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiSetColor(type, name, color) {
  try {
    if (!SettingsService.VALID_TYPES.includes(type)) throw new Error("Type invalide.");
    SettingsService.setEntityColor(type, name, color);
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiManageEntity(action, type, newName, newMeta, oldName, newIcon) {
  try {
    if (!SettingsService.VALID_TYPES.includes(type))     throw new Error("Type invalide.");
    if (!SettingsService.VALID_ACTIONS.includes(action)) throw new Error("Action invalide.");
    if (action === 'ADD')    SettingsService.addEntity(type, newName, newMeta, newIcon);
    if (action === 'DELETE') SettingsService.deleteEntity(type, oldName);
    if (action === 'RENAME') SettingsService.renameEntity(type, oldName, newName, newMeta, newIcon);
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiAddBulkScores(entries, customDateStr, groupId) {
  try {
    StorageService.appendBulkLogs(entries, customDateStr, groupId || '');
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiGetFilteredData(players, categories, startDate, endDate) {
  try {
    const chartData = AnalyticsService.getFilteredChartData(players, categories, startDate, endDate);
    return { success: true, chartData };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiGetData(year, month) {
  try {
    return { success: true, data: AnalyticsService.getAggregatedData(year, month) };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiGetHistoryPage(page, pageSize, filterPlayers, filterCategories, filterText) {
  try {
    const players    = (filterPlayers    && filterPlayers.length)    ? filterPlayers    : null;
    const categories = (filterCategories && filterCategories.length) ? filterCategories : null;
    const result = StorageService.getHistoryPage(page, pageSize, players, categories, filterText || null);
    return { success: true, logs: result.logs, total: result.total, totalEntries: result.totalEntries };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteHistoryEntry(rowIndex) {
  try {
    StorageService.deleteHistoryEntry(rowIndex);
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteHistoryEntries(rowIndexes) {
  try {
    const { history } = ConfigService.getSheets();
    const sorted = [...rowIndexes].sort((a, b) => b - a);
    sorted.forEach(ri => history.deleteRow(ri));
    ConfigService.clearCache();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiGetAvailableYears() {
  try {
    return { success: true, years: AnalyticsService.getAvailableYears() };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── Données temporelles (graphique courbe)
function apiGetTrendData(players, categories, startDate, endDate) {
  try {
    const trendData = AnalyticsService.getTrendData(players, categories, startDate, endDate);
    return { success: true, trendData };
  } catch(e) { return { success: false, error: e.message }; }
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
  } catch(e) { return { success: false, error: e.message }; }
}

// ── Outils de nettoyage ──────────────────────────────────────────────────────

function apiGetDataHealth() {
  try {
    return { success: true, health: StorageService.getDataHealth() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiFixZeroPoints() {
  try {
    const result = StorageService.fixZeroPoints();
    ConfigService.clearCache();
    return { success: true, deleted: result.deleted };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteOrphans() {
  try {
    const result = StorageService.deleteOrphans();
    ConfigService.clearCache();
    return { success: true, deleted: result.deleted };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiUpdateHistoryDescription(rowIndex, description) {
  try {
    StorageService.updateHistoryDescription(rowIndex, description);
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── Notes rapides ──────────────────────────────────────────────────────────────

function apiGetAllNotes() {
  try {
    const result = NotesService.getAllNotes();
    return { success: true, notes: result.notes };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiAddNote(player, text, dateStr) {
  try {
    NotesService.addNote(player, text, dateStr);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteNote(rowIndex) {
  try {
    NotesService.deleteNote(rowIndex);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiEditNote(rowIndex, newText) {
  try {
    NotesService.editNote(rowIndex, newText);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiUpdateBulkDescription(rowIndexes, description) {
  try {
    if (!rowIndexes || !rowIndexes.length) throw new Error("Aucune ligne sélectionnée.");
    const { history } = ConfigService.getSheets();
    const lastRow = history.getLastRow();
    if (lastRow <= 1) return { success: true };
    const colRange = history.getRange(2, 5, lastRow - 1, 1);
    const values   = colRange.getValues();
    const indexSet = new Set(rowIndexes.map(ri => parseInt(ri, 10)));
    for (let i = 0; i < values.length; i++) {
      if (indexSet.has(i + 2)) values[i][0] = description || '';
    }
    colRange.setValues(values);
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDetectDistributedLots() {
  try {
    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, lots: [] };

    const pad = function(n) { return String(n).padStart(2, '0'); };
    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const entries = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      if (row[5]) continue;
      var d = new Date(row[0]);
      if (isNaN(d.getTime())) continue;
      var player      = row[1] ? row[1].toString() : '';
      var category    = row[2] ? row[2].toString() : '';
      var points      = parseInt(row[3], 10);
      var description = row[4] ? row[4].toString() : '';
      if (!player || !category) continue;
      if (isNaN(points) || points <= 0) continue;
      entries.push({
        date: d,
        dateStr: d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()),
        player: player, category: category, points: points,
        description: description, rowIndex: i + 2
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
    return { success: true, lots: lots };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiGroupDistributedLots(lotsToGroup) {
  try {
    if (!lotsToGroup || !lotsToGroup.length) throw new Error("Aucun lot fourni.");
    const sheet = ConfigService.getSheets().history;

    lotsToGroup.forEach(function(lot) {
      var rows = lot.rowIndexes;
      if (!rows || rows.length < 2) return;
      var gid = 'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      rows.forEach(function(r) {
        sheet.getRange(r, 6).setValue(gid);
      });
    });

    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiGroupRows(rowIndexes) {
  try {
    if (!rowIndexes || rowIndexes.length < 2) throw new Error("Sélectionnez au moins 2 entrées.");
    const { history } = ConfigService.getSheets();
    const lastRow = history.getLastRow();
    if (lastRow <= 1) throw new Error("Historique vide.");
    const gid = 'G' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const colRange = history.getRange(2, 6, lastRow - 1, 1);
    const values   = colRange.getValues();
    const indexSet = new Set(rowIndexes.map(ri => parseInt(ri, 10)));
    for (let i = 0; i < values.length; i++) {
      if (indexSet.has(i + 2)) values[i][0] = gid;
    }
    colRange.setValues(values);
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiUngroupLot(groupId) {
  try {
    if (!groupId) throw new Error("GroupID manquant.");
    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true };
    const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === groupId) {
        sheet.getRange(i + 2, 6).setValue('');
      }
    }
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── Phrases ────────────────────────────────────────────────────────────────────

function apiGetPhrases() {
  try {
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiAddPhrase(preset, pool, text) {
  try {
    PhrasesService.addPhrase(preset, pool, text);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiSavePhrasesBatch(entries) {
  try {
    PhrasesService.saveBatch(entries);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiUpdatePhrase(rowIndex, text) {
  try {
    PhrasesService.updatePhrase(rowIndex, text);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeletePhrase(rowIndex) {
  try {
    PhrasesService.deletePhrase(rowIndex);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeletePreset(presetName) {
  try {
    PhrasesService.deletePreset(presetName);
    ConfigService.clearCache();
    return { success: true, phrases: PhrasesService.getAll() };
  } catch(e) { return { success: false, error: e.message }; }
}