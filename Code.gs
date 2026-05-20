/**
 * CONFIGURATION SERVICE
 */
const ConfigService = {
  getSpreadsheetId: function() {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error("Erreur de configuration : SPREADSHEET_ID est manquant dans les Propriétés du Script.");
    return id;
  },
  getSheets: function() {
    const ssId = this.getSpreadsheetId();
    try {
      const ss = SpreadsheetApp.openById(ssId);
      const historySheet = ss.getSheetByName('History');
      const playersSheet = ss.getSheetByName('Players');
      const categoriesSheet = ss.getSheetByName('Categories');
      if (!historySheet || !playersSheet || !categoriesSheet) {
        throw new Error("Erreur de structure : Onglets 'History', 'Players' ou 'Categories' manquants.");
      }
      return { spreadsheet: ss, history: historySheet, players: playersSheet, categories: categoriesSheet };
    } catch(e) { throw new Error("Erreur de connexion base de données : " + e.message); }
  }
};

/**
 * SETTINGS SERVICE
 */
const SettingsService = {
  getEntities: function(type) {
    const data = ConfigService.getSheets()[type.toLowerCase()].getDataRange().getValues();
    return data.flat().filter(String);
  },
  addEntity: function(type, name) {
    if (!name) throw new Error("Erreur de validation : Le nom ne peut pas être vide.");
    ConfigService.getSheets()[type.toLowerCase()].appendRow([name]);
  },
  deleteEntity: function(type, name) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data = sheet.getDataRange().getValues();
    let deleted = false;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][0] === name) { sheet.deleteRow(i + 1); deleted = true; }
    }
    if (!deleted) throw new Error(`Erreur d'intégrité : ${name} introuvable.`);
  },
  renameEntity: function(type, oldName, newName) {
    if (!newName) throw new Error("Erreur de validation : Nouveau nom vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data = sheet.getDataRange().getValues();
    let updated = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === oldName) { sheet.getRange(i + 1, 1).setValue(newName); updated = true; break; }
    }
    if (!updated) throw new Error(`Erreur d'intégrité : ${oldName} introuvable.`);
    const historySheet = ConfigService.getSheets().history;
    const historyData = historySheet.getDataRange().getValues();
    const colIndex = type === 'Players' ? 1 : 2;
    for (let i = 1; i < historyData.length; i++) {
      if (historyData[i][colIndex] === oldName) historySheet.getRange(i + 1, colIndex + 1).setValue(newName);
    }
  }
};

/**
 * STORAGE SERVICE (Bulk Processing)
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
      if (isNaN(pts) || isNaN(tms) || tms < 1) throw new Error("Erreur de validation des scores (valeurs non numériques).");
      return [targetDate, entry.player, entry.category, pts * tms];
    });

    const { history } = ConfigService.getSheets();
    const startRow = history.getLastRow() + 1;
    history.getRange(startRow, 1, rowsToAppend.length, 4).setValues(rowsToAppend);
  },
  getAllLogs: function() {
    const data = ConfigService.getSheets().history.getDataRange().getValues();
    if (data.length <= 1) return [];
    data.shift();
    return data.map(row => {
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) throw new Error("Données d'historique corrompues.");
      return { timestamp: d, player: row[1], category: row[2], points: parseInt(row[3], 10) || 1 };
    });
  }
};

/**
 * ANALYTICS & EXPORT SERVICE
 */
const AnalyticsService = {
  getAggregatedData: function(filterYear, filterMonth) {
    const logs = StorageService.getAllLogs();
    const players = SettingsService.getEntities('Players');
    const categories = SettingsService.getEntities('Categories');
    
    let filteredLogs = logs;
    if (filterYear && filterYear !== "All") filteredLogs = filteredLogs.filter(log => log.timestamp.getFullYear() === parseInt(filterYear, 10));
    if (filterMonth && filterMonth !== "All") filteredLogs = filteredLogs.filter(log => log.timestamp.getMonth() === parseInt(filterMonth, 10));

    let scores = {};
    players.forEach(p => { scores[p] = { total: 0 }; categories.forEach(c => scores[p][c] = 0); });
    filteredLogs.forEach(log => {
      if (scores[log.player] && scores[log.player][log.category] !== undefined) {
         scores[log.player][log.category] += log.points;
         scores[log.player].total += log.points;
      }
    });
    return { scores: scores, categories: categories, insights: this.generateInsights(scores, categories) };
  },

  generateInsights: function(scores, categories) {
    let narrative = []; let categoryWinners = {}; let topOfTops = {};
    Object.keys(scores).forEach(player => topOfTops[player] = 0);

    categories.forEach(cat => {
      let maxScore = 0; let winners = [];
      Object.keys(scores).forEach(player => {
        const pScore = scores[player][cat];
        if (pScore > maxScore) { maxScore = pScore; winners = [player]; } 
        else if (pScore === maxScore && pScore > 0) { winners.push(player); }
      });
      if (maxScore > 0) { categoryWinners[cat] = { names: winners, score: maxScore }; winners.forEach(w => topOfTops[w]++); }
    });

    Object.keys(categoryWinners).forEach(cat => {
      narrative.push(`• [${cat.toUpperCase()}] : ${categoryWinners[cat].names.join(" & ")} domine la catégorie avec un pic de ${categoryWinners[cat].score} points.`);
    });

    let ultimateWinner = ""; let maxTop = 0;
    Object.keys(topOfTops).forEach(p => { if(topOfTops[p] > maxTop) { maxTop = topOfTops[p]; ultimateWinner = p; } });
    if (ultimateWinner) {
      narrative.push(`\n🏆 VERDICT GENERAL : ${ultimateWinner} affiche un comportement critique global. Il est sacré "Top 1 des Tops" sur cette période.`);
    }
    return narrative.length > 0 ? narrative.join("\n") : "Aucune anomalie ou infraction détectée sur cette période de suivi.";
  },

  buildHtmlReport: function(year, month) {
    const data = this.getAggregatedData(year, month);
    const periodStr = `Période : ${month !== "All" ? "Mois " + month : "Année"} ${year !== "All" ? year : "Globale"}`;
    return `<!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Rapport Analytique de Suivi</title><script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>:root { --bg: #0f1117; --card: #1a1d27; --border: #2a2d3e; --accent: #ff4757; --text: #e8eaf6; --muted: #8892b0; }
    body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; padding: 40px 24px; margin: 0; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
    h1 { color: #fff; margin: 0 0 10px 0; font-size: 2rem; } .period { color: var(--accent); font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 40px; }
    .card { background: var(--card); border: 1px solid var(--border); padding: 25px; border-radius: 8px; }
    h2 { margin-top: 0; font-size: 1.2rem; color: #fff; border-left: 4px solid var(--accent); padding-left: 10px; }
    .report-box { background: #0b0c10; padding: 20px; border-radius: 6px; font-family: monospace; white-space: pre-wrap; line-height: 1.6; color: #00d4aa; border: 1px solid var(--border); }
    </style></head><body>
      <div class="header"><h1>RAPPORT ANALYTIQUE DES CASSEROLES</h1><div class="period">${periodStr}</div></div>
      <div class="grid"><div class="card"><h2>Synthèse Narrative du Moteur d'Analyse</h2><div class="report-box">${data.insights.replace(/\n/g, '<br>')}</div></div>
      <div class="card"><h2>Visualisation de la Matrice des Scores</h2><div style="height:350px; position:relative;"><canvas id="repChart"></canvas></div></div></div>
      <script>
        new Chart(document.getElementById('repChart').getContext('2d'), { type: 'bar', data: {
          labels: ${JSON.stringify(Object.keys(data.scores))},
          datasets: ${JSON.stringify(data.categories.map((cat, i) => {
            const colors = ['#ff4757', '#3742fa', '#2ed573', '#ffa502', '#eccc68'];
            return { label: cat, data: Object.keys(data.scores).map(p => data.scores[p][cat] || 0), backgroundColor: colors[i % colors.length] };
          }))}
        }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } } });
      </script></body></html>`;
  }
};

/**
 * WEB APP API ENDPOINTS
 */
function doGet() { return HtmlService.createHtmlOutputFromFile('Index').setTitle('Gestionnaire de Casseroles').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); }
function apiAddBulkScores(e, t) { try { StorageService.appendBulkLogs(e, t); return { success: true }; } catch(err) { return { success: false, error: err.message }; } }
function apiGetData(y, m) { try { return { success: true, data: AnalyticsService.getAggregatedData(y, m) }; } catch(err) { return { success: false, error: err.message }; } }
function apiGetSettings() { try { return { success: true, players: SettingsService.getEntities('Players'), categories: SettingsService.getEntities('Categories') }; } catch(err) { return { success: false, error: err.message }; } }
function apiManageEntity(a, t, n, nn) { try { if (a==='ADD') SettingsService.addEntity(t, n); if (a==='DELETE') SettingsService.deleteEntity(t, nn); if (a==='RENAME') SettingsService.renameEntity(t, n, nn); return { success: true }; } catch(err) { return { success: false, error: err.message }; } }
function apiDownloadHtmlReport(y, m) { try { return { success: true, html: AnalyticsService.buildHtmlReport(y, m) }; } catch(err) { return { success: false, error: err.message }; } }