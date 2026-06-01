/**
 * STRUCTURE DU SPREADSHEET
 * History   : [0] Date | [1] Joueur | [2] Catégorie | [3] Points
 * Players   : [0] Nom  | [1] Avatar URL
 * Categories: [0] Nom  | [1] Description | [2] Icône (emoji)
 * Notes     : [0] Date | [1] Joueur | [2] Note (texte libre)
 */

// ─── CONFIG SERVICE ────────────────────────────────────────────────────────────
const ConfigService = (() => {
  let _cache = null;

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
      const notes = ss.getSheetByName('Notes');
      _cache = { spreadsheet: ss, history, players, categories, notes };
      return _cache;
    } catch(e) {
      throw new Error("Erreur de connexion BDD : " + e.message);
    }
  };

  const clearCache = () => { _cache = null; };

  return { getSheets, clearCache };
})();

// ─── SETTINGS SERVICE ──────────────────────────────────────────────────────────
const SettingsService = {
  VALID_TYPES:   ['Players', 'Categories'],
  VALID_ACTIONS: ['ADD', 'DELETE', 'RENAME'],

  getEntities(type) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    return data.filter(r => r[0]).map(r => ({
      name: r[0].toString(),
      meta: r[1] ? r[1].toString() : "",
      icon: r[2] ? r[2].toString() : ""   // emoji (catégories)
    }));
  },

  addEntity(type, name, meta, icon) {
    if (!name) throw new Error("Le nom ne peut pas être vide.");
    ConfigService.getSheets()[type.toLowerCase()].appendRow([name, meta || "", icon || ""]);
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
    sheet.getRange(idx + 1, 1, 1, 3).setValues([[newName, newMeta || "", newIcon || ""]]);

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

  appendBulkLogs(entries, customDateStr) {
    if (!entries || !entries.length) throw new Error("Aucune donnée à injecter.");

    // 4.1 — On reçoit une chaîne "YYYY-MM-DD" (input type="date")
    // On construit la date à midi pour éviter les bugs de timezone
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

    const rows = entries.map(e => {
      if (!e.player || !e.category) throw new Error("Joueur ou catégorie manquant(e).");
      const pts = parseInt(e.points, 10);
      const tms = parseInt(e.times,  10);
      if (isNaN(pts) || pts < 1)  throw new Error("Les points doivent être ≥ 1.");
      if (isNaN(tms) || tms < 1)  throw new Error("Le multiplicateur doit être ≥ 1.");
      return [targetDate, e.player, e.category, pts * tms];
    });

    const { history } = ConfigService.getSheets();
    history.getRange(history.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  },

  getAllLogs() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    return sheet.getRange(2, 1, lastRow - 1, 4).getValues()
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

  getHistoryPage(page, pageSize, filterPlayer, filterCategory) {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { logs: [], total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    let allWithIndex = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) continue;
      const player   = row[1] ? row[1].toString() : '';
      const category = row[2] ? row[2].toString() : '';
      const points   = parseInt(row[3], 10);
      if (!player || !category)         continue;
      if (isNaN(points) || points <= 0) continue;
      if (filterPlayer   && player   !== filterPlayer)   continue;
      if (filterCategory && category !== filterCategory) continue;
      allWithIndex.push({
        timestamp: d.toISOString(),
        player,
        category,
        points,
        rowIndex: i + 2
      });
    }

    allWithIndex.reverse();

    const total = allWithIndex.length;
    const ps    = pageSize || 20;
    const start = ((page || 1) - 1) * ps;
    const paged = allWithIndex.slice(start, start + ps);
    return { logs: paged, total };
  },

  deleteHistoryEntry(rowIndex) {
    ConfigService.getSheets().history.deleteRow(rowIndex);
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

    const allPlayers    = SettingsService.getEntities('Players').map(p => p.name);
    const allCategories = SettingsService.getEntities('Categories').map(c => c.name);

    const displayPlayers    = (players    && players.length)    ? players    : allPlayers;
    const displayCategories = (categories && categories.length) ? categories : allCategories;

    const { scores } = this._aggregate(logs, displayPlayers, displayCategories);

    const colors = ['#ff4757','#00d4aa','#ffd166','#6c63ff','#ff6b81','#3742fa'];
    const datasets = displayCategories.map((cat, i) => ({
      label:           cat,
      data:            displayPlayers.map(p => (scores[p] && scores[p][cat]) || 0),
      backgroundColor: colors[i % colors.length],
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

function apiAddBulkScores(entries, customDateStr) {
  try {
    StorageService.appendBulkLogs(entries, customDateStr);
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

function apiGetHistoryPage(page, pageSize, filterPlayer, filterCategory) {
  try {
    const result = StorageService.getHistoryPage(page, pageSize, filterPlayer, filterCategory);
    return { success: true, logs: result.logs, total: result.total };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteHistoryEntry(rowIndex) {
  try {
    StorageService.deleteHistoryEntry(rowIndex);
    ConfigService.clearCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
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