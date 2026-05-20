/**
 * CONFIGURATION SERVICE
 */
const ConfigService = {
  getSpreadsheetId: function() {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error("Configuration Error: SPREADSHEET_ID is missing in Script Properties.");
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
        throw new Error("Database Structure Error: Ensure 'History', 'Players', and 'Categories' sheets exist.");
      }
      return { spreadsheet: ss, history: historySheet, players: playersSheet, categories: categoriesSheet };
    } catch(e) {
      throw new Error("Connection Error: " + e.message);
    }
  }
};

/**
 * SETTINGS SERVICE (CRUD for Players & Categories)
 */
const SettingsService = {
  getEntities: function(type) {
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data = sheet.getDataRange().getValues();
    return data.flat().filter(String);
  },
  
  addEntity: function(type, name) {
    if (!name) throw new Error("Validation Error: Name cannot be empty.");
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    sheet.appendRow([name]);
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
    if (!deleted) throw new Error(`Data Integrity Error: ${name} not found in ${type}.`);
  },
  
  renameEntity: function(type, oldName, newName) {
    if (!newName) throw new Error("Validation Error: New name cannot be empty.");
    
    // 1. Update in the specific settings sheet
    const sheet = ConfigService.getSheets()[type.toLowerCase()];
    const data = sheet.getDataRange().getValues();
    let updated = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === oldName) {
        sheet.getRange(i + 1, 1).setValue(newName);
        updated = true;
        break;
      }
    }
    if (!updated) throw new Error(`Data Integrity Error: ${oldName} not found.`);

    // 2. Cascade update in History sheet to maintain data integrity
    const historySheet = ConfigService.getSheets().history;
    const historyData = historySheet.getDataRange().getValues();
    const colIndex = type === 'Players' ? 1 : 2; // Column B (1) for Players, Column C (2) for Categories
    
    for (let i = 1; i < historyData.length; i++) {
      if (historyData[i][colIndex] === oldName) {
        historySheet.getRange(i + 1, colIndex + 1).setValue(newName);
      }
    }
  }
};

/**
 * STORAGE SERVICE
 */
const StorageService = {
  appendLog: function(player, category, customTimestamp) {
    if (!player || !category) throw new Error("Invalid Data: Player and Category are required.");
    const targetDate = customTimestamp ? new Date(customTimestamp) : new Date();
    if (isNaN(targetDate.getTime())) throw new Error("Invalid Format: Incorrect date.");
    
    const { history } = ConfigService.getSheets();
    history.appendRow([targetDate, player, category]); 
  },
  
  getAllLogs: function() {
    const { history } = ConfigService.getSheets();
    const data = history.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    data.shift();
    return data.map(row => {
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) throw new Error("Corrupt Data: Invalid date in history.");
      return { timestamp: d, player: row[1], category: row[2] };
    });
  }
};

/**
 * ANALYTICS SERVICE
 */
const AnalyticsService = {
  getAggregatedData: function(filterYear, filterMonth) {
    const logs = StorageService.getAllLogs();
    const players = SettingsService.getEntities('Players');
    const categories = SettingsService.getEntities('Categories');
    
    let filteredLogs = logs;
    if (filterYear && filterYear !== "All") {
      filteredLogs = filteredLogs.filter(log => log.timestamp.getFullYear() === parseInt(filterYear, 10));
    }
    if (filterMonth && filterMonth !== "All") {
      filteredLogs = filteredLogs.filter(log => log.timestamp.getMonth() === parseInt(filterMonth, 10));
    }

    let scores = {};
    players.forEach(p => {
      scores[p] = { total: 0 };
      categories.forEach(c => scores[p][c] = 0);
    });

    filteredLogs.forEach(log => {
      if (scores[log.player] && scores[log.player][log.category] !== undefined) {
         scores[log.player][log.category]++;
         scores[log.player].total++;
      }
    });

    return {
      scores: scores,
      categories: categories,
      insights: this.generateInsights(scores, categories)
    };
  },

  generateInsights: function(scores, categories) {
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
      const w = categoryWinners[cat];
      narrative.push(`In the '${cat}' category, ${w.names.join(" and ")} dominated with ${w.score} offenses.`);
    });

    let ultimateWinner = "";
    let maxTop = 0;
    Object.keys(topOfTops).forEach(p => {
      if(topOfTops[p] > maxTop) { maxTop = topOfTops[p]; ultimateWinner = p; }
    });

    if (ultimateWinner) {
      narrative.push(`\n🏆 ULTIMATE CHAMPION: ${ultimateWinner} is the Top of the Tops with ${maxTop} category victories!`);
    }

    return narrative.length > 0 ? narrative.join("\n") : "No recorded offenses for this period.";
  }
};

/**
 * API ENDPOINTS
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Leaderboard Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function apiAddScore(player, category, customTimestamp) {
  try { StorageService.appendLog(player, category, customTimestamp); return { success: true }; } 
  catch(e) { return { success: false, error: e.message }; }
}

function apiGetData(year, month) {
  try { return { success: true, data: AnalyticsService.getAggregatedData(year, month) }; } 
  catch(e) { return { success: false, error: e.message }; }
}

function apiGetSettings() {
  try { return { success: true, players: SettingsService.getEntities('Players'), categories: SettingsService.getEntities('Categories') }; }
  catch(e) { return { success: false, error: e.message }; }
}

function apiManageEntity(action, type, name, newName = null) {
  try {
    if (action === 'ADD') SettingsService.addEntity(type, name);
    if (action === 'DELETE') SettingsService.deleteEntity(type, name);
    if (action === 'RENAME') SettingsService.renameEntity(type, name, newName);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}