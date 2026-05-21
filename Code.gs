/**
 * CONFIGURATION SERVICE
 */
const ConfigService = {
  getSpreadsheetId: function() {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error("Erreur de configuration : SPREADSHEET_ID est manquant.");
    return id;
  },
  getGeminiKey: function() {
    return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'); // Non-bloquant au démarrage
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
    } catch(e) { throw new Error("Erreur de connexion BDD : " + e.message); }
  }
};

/**
 * SETTINGS SERVICE (Extended with Metadata for Avatars & Descriptions)
 */
const SettingsService = {
  getEntities: function(type) {
    const data = ConfigService.getSheets()[type.toLowerCase()].getDataRange().getValues();
    if (data.length === 0) return [];
    // Index 0: Name, Index 1: Meta (Avatar URL or Description)
    return data.filter(r => r[0]).map(r => ({ name: r[0].toString(), meta: r[1] ? r[1].toString() : "" }));
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
      if (data[i][0] === name) { sheet.deleteRow(i + 1); deleted = true; }
    }
    if (!deleted) throw new Error(`Erreur d'intégrité : ${name} introuvable.`);
  },
  renameEntity: function(type, oldName, newName, newMeta) {
    if (!newName) throw new Error("Erreur de validation : Nouveau nom vide.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data = sheet.getDataRange().getValues();
    let updated = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === oldName) { 
        sheet.getRange(i + 1, 1, 1, 2).setValues([[newName, newMeta || ""]]); 
        updated = true; break; 
      }
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
      if (isNaN(pts) || isNaN(tms) || tms < 1) throw new Error("Erreur de validation des scores.");
      return [targetDate, entry.player, entry.category, pts * tms];
    });

    const { history } = ConfigService.getSheets();
    history.getRange(history.getLastRow() + 1, 1, rowsToAppend.length, 4).setValues(rowsToAppend);
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
 * ANALYTICS & AI SERVICE
 */
const AnalyticsService = {
  getAggregatedData: function(filterYear, filterMonth) {
    const logs = StorageService.getAllLogs();
    const playersEntities = SettingsService.getEntities('Players');
    const categoriesEntities = SettingsService.getEntities('Categories');
    
    const players = playersEntities.map(p => p.name);
    const categories = categoriesEntities.map(c => c.name);

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

  generateAiQuote: function(year, month) {
    const key = ConfigService.getGeminiKey();
    if (!key) throw new Error("Clé GEMINI_API_KEY manquante. Veuillez l'ajouter dans les propriétés du script.");

    const data = this.getAggregatedData(year, month);
    const catEntities = SettingsService.getEntities('Categories');
    
    let context = "Voici le contexte des catégories :\n";
    catEntities.forEach(c => context += `- ${c.name} : ${c.meta || 'Aucune description spécifique'}\n`);
    
    context += "\nVoici les scores cumulés des joueurs sur la période analysée :\n";
    Object.keys(data.scores).forEach(p => {
      context += `- ${p} : ${data.scores[p].total} points d'infraction au total.\n`;
    });

    const prompt = `Tu es un commentateur sarcastique, taquin et plein d'esprit qui juge un groupe d'amis dans une compétition des pires comportements appelée "Les Casseroles".
    En te basant UNIQUEMENT sur les données ci-dessous, rédige un court paragraphe de conclusion (3-4 phrases max). 
    Adresse-toi au groupe, cite les pires éléments, utilise de l'humour noir ou de l'ironie piquante, mais reste dans un esprit amical ("vannes entre potes"). Parle en français.

    ${context}

    Génère uniquement la citation finale, pas d'introduction.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };

    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());

    if (json.error) throw new Error("API Gemini : " + json.error.message);
    if (!json.candidates || json.candidates.length === 0) throw new Error("L'IA n'a retourné aucune réponse.");
    
    return json.candidates[0].content.parts[0].text;
  },

  buildHtmlReport: function(year, month) {
    const data = this.getAggregatedData(year, month);
    return `<!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Rapport Analytique de Suivi</title><script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>:root { --bg: #0f1117; --card: #1a1d27; --border: #2a2d3e; --accent: #ff4757; --text: #e8eaf6; } body { background: var(--bg); color: var(--text); font-family: system-ui; padding: 40px; }</style></head>
    <body><h1>RAPPORT DES CASSEROLES</h1><pre>${data.insights}</pre></body></html>`;
  }
};

/**
 * WEB APP API ENDPOINTS
 */
function doGet() { return HtmlService.createHtmlOutputFromFile('Index').setTitle('Gestionnaire de Casseroles').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); }
function apiAddBulkScores(e, t) { try { StorageService.appendBulkLogs(e, t); return { success: true }; } catch(err) { return { success: false, error: err.message }; } }
function apiGetData(y, m) { try { return { success: true, data: AnalyticsService.getAggregatedData(y, m) }; } catch(err) { return { success: false, error: err.message }; } }
function apiGetSettings() { try { return { success: true, players: SettingsService.getEntities('Players'), categories: SettingsService.getEntities('Categories') }; } catch(err) { return { success: false, error: err.message }; } }
function apiManageEntity(a, t, n, m, on) { try { if(a==='ADD') SettingsService.addEntity(t, n, m); if(a==='DELETE') SettingsService.deleteEntity(t, on); if(a==='RENAME') SettingsService.renameEntity(t, on, n, m); return { success: true }; } catch(err) { return { success: false, error: err.message }; } }
function apiDownloadHtmlReport(y, m) { try { return { success: true, html: AnalyticsService.buildHtmlReport(y, m) }; } catch(err) { return { success: false, error: err.message }; } }
function apiGenerateAiQuote(y, m) { try { return { success: true, quote: AnalyticsService.generateAiQuote(y, m) }; } catch(err) { return { success: false, error: err.message }; } }