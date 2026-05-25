/**
 * STRUCTURE DU SPREADSHEET
 * History  : [0] Date | [1] Joueur | [2] Catégorie | [3] Points
 * Players  : [0] Nom  | [1] Avatar URL
 * Categories: [0] Nom | [1] Description IA
 */

/**
 * CONFIGURATION SERVICE avec cache intra-exécution
 */
const ConfigService = (() => {
  let _sheetsCache = null;

  const getSpreadsheetId = () => {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error("Erreur de configuration : SPREADSHEET_ID est manquant.");
    return id;
  };

  const getSheets = () => {
    if (_sheetsCache) return _sheetsCache;
    const ssId = getSpreadsheetId();
    try {
      const ss = SpreadsheetApp.openById(ssId);
      const historySheet = ss.getSheetByName('History');
      const playersSheet = ss.getSheetByName('Players');
      const categoriesSheet = ss.getSheetByName('Categories');
      if (!historySheet || !playersSheet || !categoriesSheet) {
        throw new Error("Erreur de structure : Onglets 'History', 'Players' ou 'Categories' manquants.");
      }
      _sheetsCache = {
        spreadsheet: ss,
        history: historySheet,
        players: playersSheet,
        categories: categoriesSheet
      };
      return _sheetsCache;
    } catch(e) {
      throw new Error("Erreur de connexion BDD : " + e.message);
    }
  };

  const getGeminiKey = () => PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  const clearCache = () => { _sheetsCache = null; };

  return { getSheets, getGeminiKey, clearCache };
})();

/**
 * SETTINGS SERVICE
 */
const SettingsService = {
  VALID_TYPES: ['Players', 'Categories'],
  VALID_ACTIONS: ['ADD', 'DELETE', 'RENAME'],

  getEntities: function(type) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data = sheet.getDataRange().getValues();
    if (data.length === 0) return [];
    return data.filter(r => r[0]).map(r => ({
      name: r[0].toString(),
      meta: r[1] ? r[1].toString() : ""
    }));
  },

  addEntity: function(type, name, meta) {
    if (!name) throw new Error("Erreur de validation : Le nom ne peut pas être vide.");
    ConfigService.getSheets()[type.toLowerCase()].appendRow([name, meta || ""]);
  },

  deleteEntity: function(type, name) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data = sheet.getDataRange().getValues();
    let deleted = false;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][0] === name) {
        sheet.deleteRow(i + 1);
        deleted = true;
      }
    }
    if (!deleted) throw new Error(`Erreur d'intégrité : ${name} introuvable.`);
  },

  renameEntity: function(type, oldName, newName, newMeta) {
    if (!newName) throw new Error("Erreur de validation : Nouveau nom vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === oldName) { rowIndex = i; break; }
    }
    if (rowIndex === -1) throw new Error(`Erreur d'intégrité : ${oldName} introuvable.`);

    sheet.getRange(rowIndex + 1, 1, 1, 2).setValues([[newName, newMeta || ""]]);

    const historySheet = ConfigService.getSheets().history;
    const colIndex = type === 'Players' ? 1 : 2;
    const lastRow = historySheet.getLastRow();
    if (lastRow > 1) {
      const range = historySheet.getRange(2, colIndex + 1, lastRow - 1, 1);
      const values = range.getValues();
      let modified = false;
      for (let i = 0; i < values.length; i++) {
        if (values[i][0] === oldName) { values[i][0] = newName; modified = true; }
      }
      if (modified) range.setValues(values);
    }
  }
};

/**
 * STORAGE SERVICE
 */
const StorageService = {
  appendBulkLogs: function(entries, customTimestamp) {
    if (!entries || entries.length === 0) throw new Error("Erreur : Aucune donnée à injecter.");
    const targetDate = customTimestamp ? new Date(customTimestamp) : new Date();
    if (isNaN(targetDate.getTime())) throw new Error("Format invalide : La date fournie est incorrecte.");

    const rowsToAppend = entries.map(entry => {
      if (!entry.player || !entry.category) throw new Error("Données invalides : Joueur ou catégorie manquante.");
      const pts = parseInt(entry.points, 10);
      const tms = parseInt(entry.times, 10);
      if (isNaN(pts) || isNaN(tms) || tms < 1) throw new Error("Erreur de validation des scores.");
      return [targetDate, entry.player, entry.category, pts * tms];
    });

    const { history } = ConfigService.getSheets();
    history.getRange(history.getLastRow() + 1, 1, rowsToAppend.length, 4).setValues(rowsToAppend);
  },

  // ✅ getAllLogs : lecture complète sans filtre (utilisée par apiGetFilteredData)
  getAllLogs: function() {
    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    const logs = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) continue;
      logs.push({
        timestamp: d,
        player: row[1],
        category: row[2],
        points: parseInt(row[3], 10) || 0
      });
    }
    return logs;
  },

  getFilteredLogs: function(filterYear, filterMonth) {
    const allLogs = this.getAllLogs();
    const logs = [];
    for (let i = 0; i < allLogs.length; i++) {
      const log = allLogs[i];
      const year = log.timestamp.getFullYear();
      const month = log.timestamp.getMonth();
      if (filterYear !== "All" && year !== parseInt(filterYear, 10)) continue;
      if (filterMonth !== "All" && month !== parseInt(filterMonth, 10)) continue;
      logs.push(log);
    }
    return logs;
  },

  getHistoryPage: function(page, pageSize, filterPlayer, filterCategory) {
    const sheet = ConfigService.getSheets().history;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { logs: [], total: 0 };
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    let logs = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) continue;
      const player = row[1];
      const category = row[2];
      if (filterPlayer && player !== filterPlayer) continue;
      if (filterCategory && category !== filterCategory) continue;
      logs.push({
        timestamp: d,
        player: player,
        category: category,
        points: parseInt(row[3], 10),
        rowIndex: i + 2
      });
    }
    const total = logs.length;
    const start = (page - 1) * pageSize;
    const paged = logs.slice(start, start + pageSize);
    return { logs: paged, total };
  },

  deleteHistoryEntry: function(rowIndex) {
    const sheet = ConfigService.getSheets().history;
    sheet.deleteRow(rowIndex);
  }
};

/**
 * ANALYTICS & AI SERVICE
 */
const AnalyticsService = {
  getAggregatedData: function(filterYear, filterMonth) {
    const logs = StorageService.getFilteredLogs(filterYear, filterMonth);
    const playersEntities = SettingsService.getEntities('Players');
    const categoriesEntities = SettingsService.getEntities('Categories');

    const players = playersEntities.map(p => p.name);
    const categories = categoriesEntities.map(c => c.name);

    let scores = {};
    players.forEach(p => {
      scores[p] = { total: 0 };
      categories.forEach(c => scores[p][c] = 0);
    });

    let orphanCount = 0;
    logs.forEach(log => {
      if (scores[log.player] !== undefined && scores[log.player][log.category] !== undefined) {
        scores[log.player][log.category] += log.points;
        scores[log.player].total += log.points;
      } else {
        orphanCount++;
      }
    });

    const insights = this.generateInsights(scores, categories, orphanCount);
    return { scores, categories, insights, orphanCount };
  },

  generateInsights: function(scores, categories, orphanCount) {
    let narrative = [];
    let categoryWinners = {};
    let topOfTops = {};
    Object.keys(scores).forEach(player => topOfTops[player] = 0);

    categories.forEach(cat => {
      let maxScore = 0;
      let winners = [];
      Object.keys(scores).forEach(player => {
        const pScore = scores[player][cat];
        if (pScore > maxScore) { maxScore = pScore; winners = [player]; }
        else if (pScore === maxScore && pScore > 0) { winners.push(player); }
      });
      if (maxScore > 0) {
        categoryWinners[cat] = { names: winners, score: maxScore };
        winners.forEach(w => topOfTops[w]++);
      }
    });

    Object.keys(categoryWinners).forEach(cat => {
      narrative.push(`• [${cat.toUpperCase()}] : ${categoryWinners[cat].names.join(" & ")} domine la catégorie avec un pic de ${categoryWinners[cat].score} points.`);
    });

    let ultimateWinners = [];
    let maxTop = 0;
    Object.keys(topOfTops).forEach(p => {
      if (topOfTops[p] > maxTop) { maxTop = topOfTops[p]; ultimateWinners = [p]; }
      else if (topOfTops[p] === maxTop && maxTop > 0) { ultimateWinners.push(p); }
    });

    if (ultimateWinners.length > 0) {
      const winnerText = ultimateWinners.join(" et ");
      narrative.push(`\n🏆 VERDICT GENERAL : ${winnerText} ${ultimateWinners.length > 1 ? "sont co-" : "est "}sacré${ultimateWinners.length > 1 ? "s" : ""} "Top 1 des Tops" sur cette période.`);
    }
    if (orphanCount > 0) {
      narrative.push(`\n⚠️ ${orphanCount} entrée(s) historique(s) non attribuée(s) (joueur ou catégorie supprimé(e)).`);
    }
    return narrative.length > 0 ? narrative.join("\n") : "Aucune anomalie ou infraction détectée sur cette période de suivi.";
  },

  generateAiQuote: function(year, month) {
    const data = this.getAggregatedData(year, month);
    const key = ConfigService.getGeminiKey();
    if (!key) return { quote: this.getFallbackQuote(data), isAi: false };
    try {
      const catEntities = SettingsService.getEntities('Categories');
      let context = "Contexte :\n";
      catEntities.forEach(c => context += `- ${c.name} : ${c.meta || 'Sans description'}\n`);
      context += "\nScores :\n";
      Object.keys(data.scores).forEach(p => { context += `- ${p} : ${data.scores[p].total} points.\n`; });
      const prompt = `Tu es un commentateur sarcastique qui juge un groupe d'amis. Base-toi sur ces scores pour rédiger un paragraphe de 3 phrases max. Tacle le pire joueur, sois ironique mais amical. Parle en français.\n\n${context}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      const payload = { contents: [{ parts: [{ text: prompt }] }] };
      const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
      const response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() !== 200) return { quote: this.getFallbackQuote(data), isAi: false };
      const json = JSON.parse(response.getContentText());
      if (json.error || !json.candidates || json.candidates.length === 0) return { quote: this.getFallbackQuote(data), isAi: false };
      return { quote: json.candidates[0].content.parts[0].text, isAi: true };
    } catch(e) {
      return { quote: this.getFallbackQuote(data), isAi: false };
    }
  },

  getFallbackQuote: function(data) {
    let ultimateWinner = "Quelqu'un";
    let maxScore = 0;
    Object.keys(data.scores).forEach(p => {
      if (data.scores[p].total > maxScore) { maxScore = data.scores[p].total; ultimateWinner = p; }
    });
    const fallbackQuotes = [
      `Même sans l'aide de l'IA, tout le monde sait que ${ultimateWinner} a été particulièrement catastrophique cette fois-ci.`,
      `L'intelligence artificielle de Google a planté tellement les scores de ${ultimateWinner} sont honteux.`,
      `Pas besoin d'algorithmes complexes pour constater que ${ultimateWinner} tire le niveau du groupe vers la base.`,
      `Erreur de quota : L'ego (et le score) de ${ultimateWinner} prennent trop de place sur les serveurs cloud.`,
      `L'IA refuse de commenter. Elle a développé de la compassion pour la nullité de ${ultimateWinner}.`
    ];
    return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
  },

  getAvailableYears: function() {
    const logs = StorageService.getFilteredLogs("All", "All");
    const years = new Set();
    logs.forEach(log => years.add(log.timestamp.getFullYear()));
    return Array.from(years).sort((a,b) => b - a);
  },

  getTrendData: function(filterYear, filterMonth) {
    const logs = StorageService.getFilteredLogs(filterYear, filterMonth);
    const players = SettingsService.getEntities('Players').map(p => p.name);
    const weeklyData = {};
    logs.forEach(log => {
      const date = log.timestamp;
      const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
      const key = weekStart.toISOString().slice(0,10);
      if (!weeklyData[key]) weeklyData[key] = {};
      players.forEach(p => { if (!weeklyData[key][p]) weeklyData[key][p] = 0; });
      if (weeklyData[key][log.player] !== undefined) weeklyData[key][log.player] += log.points;
    });
    const sortedWeeks = Object.keys(weeklyData).sort();
    const datasets = players.map(player => ({
      label: player,
      data: sortedWeeks.map(week => weeklyData[week][player] || 0),
      borderColor: `hsl(${Math.random() * 360}, 70%, 60%)`,
      fill: false
    }));
    return { labels: sortedWeeks, datasets };
  },

  buildHtmlReport: function(year, month) {
    const data = this.getAggregatedData(year, month);
    const players = JSON.stringify(Object.keys(data.scores));
    const colors = ['#ff4757','#00d4aa','#ffd166','#6c63ff','#ff6b81','#3742fa'];
    const datasets = data.categories.map((cat, i) => ({
      label: cat,
      data: Object.keys(data.scores).map(p => data.scores[p][cat] || 0),
      backgroundColor: colors[i % colors.length],
      borderRadius: 4
    }));
    const datasetsJson = JSON.stringify(datasets);
    const orphanNote = data.orphanCount > 0 ? `<p>⚠️ ${data.orphanCount} entrées historiques non attribuées.</p>` : '';
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Rapport Analytique — Casseroles</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>body{font-family:system-ui,sans-serif;background:#0f1117;color:#e8eaf6;padding:40px;}h1{color:#ff4757;}pre{background:#1a1d27;padding:20px;border-radius:8px;white-space:pre-wrap;color:#00d4aa;line-height:1.6;}.chart-wrapper{max-width:800px;margin:30px 0;background:#1a1d27;padding:20px;border-radius:8px;}</style>
</head><body>
<h1>📊 RAPPORT DES CASSEROLES</h1>
<p style="color:#8892b0">Période : ${year === 'All' ? 'Toutes années' : year} / ${month === 'All' ? 'Tous mois' : month}</p>
${orphanNote}
<div class="chart-wrapper"><canvas id="reportChart"></canvas></div>
<pre>${data.insights}</pre>
<script>new Chart(document.getElementById('reportChart').getContext('2d'),{type:'bar',data:{labels:${players},datasets:${datasetsJson}},options:{responsive:true,scales:{x:{stacked:true,grid:{color:'#2a2d3e'},ticks:{color:'#e8eaf6'}},y:{stacked:true,grid:{color:'#2a2d3e'},ticks:{color:'#e8eaf6'}}},plugins:{legend:{labels:{color:'#e8eaf6'}}}}})<\/script>
</body></html>`;
  }
};

/**
 * WEB APP API ENDPOINTS
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Gestionnaire de Casseroles')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function apiAddBulkScores(entries, customTimestamp) {
  try {
    StorageService.appendBulkLogs(entries, customTimestamp);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiGetData(year, month) {
  try {
    const data = AnalyticsService.getAggregatedData(year, month);
    return { success: true, data: data };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiGetSettings() {
  try {
    return {
      success: true,
      players: SettingsService.getEntities('Players'),
      categories: SettingsService.getEntities('Categories')
    };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiManageEntity(action, type, newName, newMeta, oldName) {
  try {
    if (!SettingsService.VALID_TYPES.includes(type)) throw new Error("Type invalide.");
    if (!SettingsService.VALID_ACTIONS.includes(action)) throw new Error("Action invalide.");
    if (action === 'ADD') SettingsService.addEntity(type, newName, newMeta);
    else if (action === 'DELETE') SettingsService.deleteEntity(type, oldName);
    else if (action === 'RENAME') SettingsService.renameEntity(type, oldName, newName, newMeta);
    ConfigService.clearCache();
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiDownloadHtmlReport(year, month) {
  try {
    const html = AnalyticsService.buildHtmlReport(year, month);
    return { success: true, html: html };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiGenerateAiQuote(year, month) {
  try {
    const result = AnalyticsService.generateAiQuote(year, month);
    return { success: true, quote: result.quote, isAi: result.isAi };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiGetAvailableYears() {
  try {
    const years = AnalyticsService.getAvailableYears();
    return { success: true, years: years };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiGetTrendData(year, month) {
  try {
    const trend = AnalyticsService.getTrendData(year, month);
    return { success: true, trend: trend };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiGetHistoryPage(page, pageSize, filterPlayer, filterCategory) {
  try {
    const result = StorageService.getHistoryPage(page, pageSize, filterPlayer, filterCategory);
    return { success: true, logs: result.logs, total: result.total };
  } catch(err) { return { success: false, error: err.message }; }
}

function apiDeleteHistoryEntry(rowIndex) {
  try {
    StorageService.deleteHistoryEntry(rowIndex);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
}

/**
 * ✅ CORRIGÉ : utilise StorageService.getAllLogs() qui existe maintenant
 * Filtrage par joueur(s), catégorie(s) et plage de dates
 */
function apiGetFilteredData(players, categories, startDate, endDate) {
  try {
    const allLogs = StorageService.getAllLogs(); // ✅ fonction existante
    let filtered = allLogs;

    if (players && players.length > 0) {
      filtered = filtered.filter(log => players.includes(log.player));
    }
    if (categories && categories.length > 0) {
      filtered = filtered.filter(log => categories.includes(log.category));
    }
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0,0,0,0);
      filtered = filtered.filter(log => log.timestamp >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23,59,59,999);
      filtered = filtered.filter(log => log.timestamp <= end);
    }

    const allPlayers = SettingsService.getEntities('Players').map(p => p.name);
    const allCategories = SettingsService.getEntities('Categories').map(c => c.name);

    // Respecter la sélection : si filtre actif, n'afficher que ces joueurs/catégories
    const displayPlayers = (players && players.length > 0) ? players : allPlayers;
    const displayCategories = (categories && categories.length > 0) ? categories : allCategories;

    let scores = {};
    displayPlayers.forEach(p => {
      scores[p] = {};
      displayCategories.forEach(c => scores[p][c] = 0);
    });

    filtered.forEach(log => {
      if (scores[log.player] && scores[log.player][log.category] !== undefined) {
        scores[log.player][log.category] += log.points;
      }
    });

    const colors = ['#ff4757','#00d4aa','#ffd166','#6c63ff','#ff6b81','#3742fa','#eccc68','#1e90ff'];
    const chartData = {
      labels: displayPlayers,
      datasets: displayCategories.map((cat, idx) => ({
        label: cat,
        data: displayPlayers.map(p => scores[p][cat] || 0),
        backgroundColor: colors[idx % colors.length]
      }))
    };

    return { success: true, chartData };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Export des données brutes (CSV)
 */
function apiGetExportData(players, categories, startDate, endDate, format) {
  try {
    const allLogs = StorageService.getAllLogs();
    let filtered = allLogs;
    if (players && players.length > 0) filtered = filtered.filter(log => players.includes(log.player));
    if (categories && categories.length > 0) filtered = filtered.filter(log => categories.includes(log.category));
    if (startDate) {
      const start = new Date(startDate); start.setHours(0,0,0,0);
      filtered = filtered.filter(log => log.timestamp >= start);
    }
    if (endDate) {
      const end = new Date(endDate); end.setHours(23,59,59,999);
      filtered = filtered.filter(log => log.timestamp <= end);
    }
    const rows = [["Date", "Joueur", "Catégorie", "Points"]];
    filtered.forEach(log => {
      rows.push([log.timestamp.toISOString(), log.player, log.category, log.points]);
    });
    const csv = rows.map(row => row.join(",")).join("\n");
    return { success: true, csv, filename: `export_${Date.now()}.csv` };
  } catch(e) {
    return { success: false, error: e.message };
  }
}