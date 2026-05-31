/**
 * STRUCTURE DU SPREADSHEET
 * History   : [0] Date | [1] Joueur | [2] Catégorie | [3] Points
 * Players   : [0] Nom  | [1] Avatar URL
 * Categories: [0] Nom  | [1] Description
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
      meta: r[1] ? r[1].toString() : ""
    }));
  },

  addEntity(type, name, meta) {
    if (!name) throw new Error("Le nom ne peut pas être vide.");
    ConfigService.getSheets()[type.toLowerCase()].appendRow([name, meta || ""]);
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

  renameEntity(type, oldName, newName, newMeta) {
    if (!newName) throw new Error("Nouveau nom vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data  = sheet.getDataRange().getValues();
    let idx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === oldName) { idx = i; break; }
    }
    if (idx === -1) throw new Error(`${oldName} introuvable.`);
    sheet.getRange(idx + 1, 1, 1, 2).setValues([[newName, newMeta || ""]]);

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
    if (lastRow <= 1) return { zeros: 0, orphans: 0, duplicates: 0, total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));

    let zeros = 0, orphans = 0;
    const seen = {};
    let duplicates = 0;

    data.forEach(row => {
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) return;
      const pts = parseInt(row[3], 10);
      const player = row[1] ? row[1].toString() : '';
      const cat    = row[2] ? row[2].toString() : '';

      if (isNaN(pts) || pts <= 0) zeros++;
      if (player && !players.has(player))    orphans++;
      else if (cat && !categories.has(cat))  orphans++;

      // Doublons
      const key = `${d.toDateString()}|${player}|${cat}|${pts}`;
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] === 2) duplicates++; // compte les doublons (occurrences > 1)
    });

    return {
      total:        data.length,
      zeros,
      orphans,
      duplicates
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
  },

  /**
   * Liste les groupes de doublons SANS rien supprimer.
   * Retourne : [{ key, count, rows: [{date, player, category, points, rowIndex}] }]
   * Seuls les groupes de 2 occurrences ou plus sont retournés.
   */
  listDuplicates() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const groups = {}; // key -> { key, rows: [...] }
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const d   = new Date(row[0]);
      if (isNaN(d.getTime())) continue;
      const player   = row[1] ? row[1].toString() : '';
      const category = row[2] ? row[2].toString() : '';
      const points   = parseInt(row[3], 10);
      if (!player || !category || isNaN(points)) continue;
      const key = `${d.toDateString()}|${player}|${category}|${points}`;
      if (!groups[key]) groups[key] = { key, rows: [] };
      groups[key].rows.push({
        date:     d.toISOString(),
        player,
        category,
        points,
        rowIndex: i + 2
      });
    }

    return Object.keys(groups)
      .map(k => groups[k])
      .filter(g => g.rows.length >= 2)
      .map(g => ({ key: g.key, count: g.rows.length, rows: g.rows }));
  },

  /**
   * Supprime les doublons (même date+joueur+catégorie+score), garde la première occurrence.
   * @param {number[]} [excludedRowIndexes] rowIndex à PRÉSERVER (groupes ignorés par l'utilisateur).
   */
  deleteDuplicates(excludedRowIndexes) {
    const excluded = new Set((excludedRowIndexes || []).map(Number));
    const groups   = this.listDuplicates();

    // Pour chaque groupe : on garde la 1re occurrence, les suivantes sont candidates à la suppression.
    let toDelete = [];
    groups.forEach(g => {
      g.rows.slice(1).forEach(r => {
        if (!excluded.has(r.rowIndex)) toDelete.push(r.rowIndex);
      });
    });

    // Suppression du bas vers le haut pour conserver des index valides.
    const sheet = ConfigService.getSheets().history;
    toDelete.sort((a, b) => b - a);
    toDelete.forEach(idx => sheet.deleteRow(idx));
    return { deleted: toDelete.length };
  }
};

// ─── NOTES SERVICE ─────────────────────────────────────────────────────────────
const NotesService = {

  _sheet() {
    const notes = ConfigService.getSheets().notes;
    if (!notes) throw new Error("La feuille 'Notes' n'existe pas. Initialisez-la depuis l'onglet Outils.");
    return notes;
  },

  /** Crée la feuille Notes avec ses en-têtes si elle n'existe pas. */
  initSheet() {
    const ss = ConfigService.getSheets().spreadsheet;
    let sheet = ss.getSheetByName('Notes');
    if (!sheet) {
      sheet = ss.insertSheet('Notes');
      sheet.appendRow(['Date', 'Joueur', 'Note']);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    }
    ConfigService.clearCache();
    return { created: true };
  },

  getNotesPage(page, pageSize, filterPlayer) {
    // Lecture tolérante : si la feuille n'existe pas, on ne bloque pas l'app.
    const sheet = ConfigService.getSheets().notes;
    if (!sheet) return { notes: [], total: 0, needsInit: true };
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { notes: [], total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    let all = [];
    for (let i = 0; i < data.length; i++) {
      const row    = data[i];
      const player = row[1] ? row[1].toString() : '';
      const text   = row[2] ? row[2].toString() : '';
      if (!player && !text) continue;
      if (filterPlayer && player !== filterPlayer) continue;
      const d = new Date(row[0]);
      all.push({
        timestamp: isNaN(d.getTime()) ? null : d.toISOString(),
        player,
        text,
        rowIndex: i + 2
      });
    }

    all.reverse(); // plus récentes d'abord

    const total = all.length;
    const ps    = pageSize || 20;
    const start = ((page || 1) - 1) * ps;
    return { notes: all.slice(start, start + ps), total };
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

    // Déterminer le granularité : si la période > 90 jours → mois, sinon semaines
    const start = startDate ? new Date(startDate + 'T00:00:00') : logs.reduce((m, l) => l.timestamp < m ? l.timestamp : m, logs[0].timestamp);
    const end   = endDate   ? new Date(endDate   + 'T23:59:59') : new Date();
    const diffDays = (end - start) / (1000 * 86400);
    const byMonth  = diffDays > 90;

    const allPlayers = players && players.length
      ? players
      : SettingsService.getEntities('Players').map(p => p.name);

    // Bucket key
    const bucket = d => byMonth
      ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      : (() => {
          // ISO week start (lundi)
          const tmp = new Date(d);
          tmp.setHours(0,0,0,0);
          tmp.setDate(tmp.getDate() - ((tmp.getDay() + 6) % 7));
          return tmp.toISOString().slice(0,10);
        })();

    // Agréger par bucket + joueur
    const bucketMap = {}; // { bucketKey: { player: points } }
    logs.forEach(log => {
      if (!allPlayers.includes(log.player)) return;
      const k = bucket(log.timestamp);
      if (!bucketMap[k]) bucketMap[k] = {};
      bucketMap[k][log.player] = (bucketMap[k][log.player] || 0) + log.points;
    });

    const labels = Object.keys(bucketMap).sort();

    // Cumul par joueur
    const series = {};
    allPlayers.forEach(p => {
      let cum = 0;
      series[p] = labels.map(k => {
        cum += (bucketMap[k][p] || 0);
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

function apiManageEntity(action, type, newName, newMeta, oldName) {
  try {
    if (!SettingsService.VALID_TYPES.includes(type))     throw new Error("Type invalide.");
    if (!SettingsService.VALID_ACTIONS.includes(action)) throw new Error("Action invalide.");
    if (action === 'ADD')    SettingsService.addEntity(type, newName, newMeta);
    if (action === 'DELETE') SettingsService.deleteEntity(type, oldName);
    if (action === 'RENAME') SettingsService.renameEntity(type, oldName, newName, newMeta);
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

function apiListDuplicates() {
  try {
    return { success: true, groups: StorageService.listDuplicates() };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteDuplicates(excludedRowIndexes) {
  try {
    const result = StorageService.deleteDuplicates(excludedRowIndexes);
    ConfigService.clearCache();
    return { success: true, deleted: result.deleted };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── Notes rapides ──────────────────────────────────────────────────────────────

function apiInitNotesSheet() {
  try {
    NotesService.initSheet();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiGetNotesPage(page, pageSize, filterPlayer) {
  try {
    const result = NotesService.getNotesPage(page, pageSize, filterPlayer);
    return { success: true, notes: result.notes, total: result.total, needsInit: !!result.needsInit };
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