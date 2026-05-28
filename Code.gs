/**
 * STRUCTURE DU SPREADSHEET
 * History   : [0] Date | [1] Joueur | [2] Catégorie | [3] Points
 * Players   : [0] Nom  | [1] Avatar URL
 * Categories: [0] Nom  | [1] Description IA
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
      _cache = { spreadsheet: ss, history, players, categories };
      return _cache;
    } catch(e) {
      throw new Error("Erreur de connexion BDD : " + e.message);
    }
  };

  const getGeminiKey = () =>
    PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  const clearCache = () => { _cache = null; };

  return { getSheets, getGeminiKey, clearCache };
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
    if (lastRow <= 1) return { zeros: 0, orphans: 0, duplicates: 0, datesWithTime: 0, total: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const players    = new Set(SettingsService.getEntities('Players').map(p => p.name));
    const categories = new Set(SettingsService.getEntities('Categories').map(c => c.name));

    let zeros = 0, orphans = 0, datesWithTime = 0;
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

      // Date avec heure != midi
      if (d.getHours() !== 12 || d.getMinutes() !== 0 || d.getSeconds() !== 0) datesWithTime++;

      // Doublons
      const key = `${d.toDateString()}|${player}|${cat}|${pts}`;
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] === 2) duplicates++; // compte les doublons (occurrences > 1)
    });

    return {
      total:        data.length,
      zeros,
      orphans,
      duplicates,
      datesWithTime
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

  /** Normalise toutes les dates à midi (YYYY-MM-DD T12:00:00) */
  normalizeDates() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { modified: 0 };
    const range = sheet.getRange(2, 1, lastRow - 1, 1);
    const vals  = range.getValues();
    let modified = 0;
    for (let i = 0; i < vals.length; i++) {
      const d = new Date(vals[i][0]);
      if (isNaN(d.getTime())) continue;
      if (d.getHours() !== 12 || d.getMinutes() !== 0 || d.getSeconds() !== 0) {
        const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
        vals[i][0] = noon;
        modified++;
      }
    }
    if (modified > 0) range.setValues(vals);
    return { modified };
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

  /** Supprime les doublons (même date+joueur+catégorie+score), garde la première occurrence */
  deleteDuplicates() {
    const sheet   = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { deleted: 0 };
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    const seen = new Set();
    let deleted = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const d   = new Date(data[i][0]);
      const key = `${isNaN(d.getTime()) ? data[i][0] : d.toDateString()}|${data[i][1]}|${data[i][2]}|${data[i][3]}`;
      if (seen.has(key)) {
        sheet.deleteRow(i + 2);
        deleted++;
      } else {
        seen.add(key);
      }
    }
    return { deleted };
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

  generateAiQuote(year, month) {
    const data = this.getAggregatedData(year, month);
    const key  = ConfigService.getGeminiKey();

    let ultimateWinner = "Quelqu'un", maxScore = 0;
    Object.keys(data.scores).forEach(p => {
      if (data.scores[p].total > maxScore) { maxScore = data.scores[p].total; ultimateWinner = p; }
    });
    const fallbacks = [
      `Même sans IA, tout le monde sait que ${ultimateWinner} a été catastrophique.`,
      `L'IA a planté — les scores de ${ultimateWinner} sont trop honteux à afficher.`,
      `Pas besoin d'algorithme pour voir que ${ultimateWinner} tire le groupe vers le bas.`,
      `Quota dépassé : l'ego de ${ultimateWinner} prend trop de place sur les serveurs.`,
      `L'IA refuse de commenter. Elle a pitié de ${ultimateWinner}.`
    ];
    const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    if (!key) return { quote: fallback, isAi: false };

    try {
      let context = "Contexte :\n";
      SettingsService.getEntities('Categories').forEach(c => {
        context += `- ${c.name} : ${c.meta || 'Sans description'}\n`;
      });
      context += "\nScores :\n";
      Object.keys(data.scores).forEach(p => {
        context += `- ${p} : ${data.scores[p].total} points.\n`;
      });

      const prompt = `Tu es un commentateur sarcastique d'un groupe d'amis. Rédige 3 phrases max, tacle le pire joueur, ironique mais amical, en français.\n\n${context}`;
      const url    = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      const resp   = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() !== 200) return { quote: fallback, isAi: false };
      const json = JSON.parse(resp.getContentText());
      if (!json.candidates || !json.candidates.length) return { quote: fallback, isAi: false };
      return { quote: json.candidates[0].content.parts[0].text, isAi: true };
    } catch(e) {
      return { quote: fallback, isAi: false };
    }
  },

  getAvailableYears() {
    const logs = StorageService.getAllLogs();
    const years = new Set();
    logs.forEach(l => years.add(l.timestamp.getFullYear()));
    const current = new Date().getFullYear();
    years.add(current);
    return Array.from(years).sort((a, b) => b - a);
  },

  buildHtmlReport(year, month) {
    const data     = this.getAggregatedData(year, month);
    const players  = JSON.stringify(Object.keys(data.scores));
    const colors   = ['#ff4757','#00d4aa','#ffd166','#6c63ff','#ff6b81','#3742fa'];
    const datasets = JSON.stringify(data.categories.map((cat, i) => ({
      label: cat,
      data:  Object.keys(data.scores).map(p => data.scores[p][cat] || 0),
      backgroundColor: colors[i % colors.length],
      borderRadius: 4
    })));

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Rapport Casseroles</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>body{font-family:system-ui;background:#0f1117;color:#e8eaf6;padding:40px;}h1{color:#ff4757;}pre{background:#1a1d27;padding:20px;border-radius:8px;white-space:pre-wrap;color:#00d4aa;}.wrap{max-width:800px;margin:30px 0;background:#1a1d27;padding:20px;border-radius:8px;}</style>
</head><body>
<h1>📊 RAPPORT DES CASSEROLES</h1>
<p style="color:#8892b0">Période : ${year === 'All' ? 'Toutes années' : year} / ${month === 'All' ? 'Tous mois' : month}</p>
${data.orphanCount > 0 ? `<p>⚠️ ${data.orphanCount} entrée(s) non attribuée(s).</p>` : ''}
<div class="wrap"><canvas id="c"></canvas></div>
<pre>${data.insights}</pre>
<script>new Chart(document.getElementById('c'),{type:'bar',data:{labels:${players},datasets:${datasets}},options:{responsive:true,scales:{x:{stacked:true},y:{stacked:true}}}});<\/script>
</body></html>`;
  }
};

// ─── API ENDPOINTS ─────────────────────────────────────────────────────────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Gestionnaire de Casseroles')
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

function apiGenerateAiQuote(year, month) {
  try {
    const result = AnalyticsService.generateAiQuote(year, month);
    return { success: true, quote: result.quote, isAi: result.isAi };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDownloadHtmlReport(year, month) {
  try {
    return { success: true, html: AnalyticsService.buildHtmlReport(year, month) };
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

function apiNormalizeDates() {
  try {
    const result = StorageService.normalizeDates();
    ConfigService.clearCache();
    return { success: true, modified: result.modified };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteOrphans() {
  try {
    const result = StorageService.deleteOrphans();
    ConfigService.clearCache();
    return { success: true, deleted: result.deleted };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteDuplicates() {
  try {
    const result = StorageService.deleteDuplicates();
    ConfigService.clearCache();
    return { success: true, deleted: result.deleted };
  } catch(e) { return { success: false, error: e.message }; }
}