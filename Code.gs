/**
 * CONFIGURATION SERVICE (DRY)
 */
const ConfigService = {
  getSpreadsheetId: function() {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) {
      throw new Error("Configuration Error: SPREADSHEET_ID is missing in Script Properties.");
    }
    return id;
  },
  getSheets: function() {
    const ssId = this.getSpreadsheetId();
    try {
      const ss = SpreadsheetApp.openById(ssId);
      const historySheet = ss.getSheetByName('History');
      if (!historySheet) {
        throw new Error("Structure Error: 'History' sheet is missing.");
      }
      return { spreadsheet: ss, history: historySheet };
    } catch(e) {
      throw new Error("Connection Error: Cannot access spreadsheet. Details: " + e.message);
    }
  }
};

/**
 * STORAGE SERVICE (SOLID)
 */
const StorageService = {
  appendLog: function(player, category, customTimestamp) {
    if (!player || !category) {
      throw new Error("Invalid Data: Player and Category are required.");
    }
    const targetDate = customTimestamp ? new Date(customTimestamp) : new Date();
    if (isNaN(targetDate.getTime())) {
      throw new Error("Invalid Format: The provided date is incorrect.");
    }
    
    const { history } = ConfigService.getSheets();
    history.appendRow([targetDate, player, category]); 
  },
  
  getAllLogs: function() {
    const { history } = ConfigService.getSheets();
    const data = history.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    data.shift(); // Remove headers
    return data.map(row => {
      const d = new Date(row[0]);
      if (isNaN(d.getTime())) {
        throw new Error("Corrupt Data: Invalid date found in history.");
      }
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
    let filteredLogs = logs;

    if (filterYear && filterYear !== "All") {
      filteredLogs = filteredLogs.filter(log => log.timestamp.getFullYear() === parseInt(filterYear, 10));
    }
    if (filterMonth && filterMonth !== "All") {
      filteredLogs = filteredLogs.filter(log => log.timestamp.getMonth() === parseInt(filterMonth, 10));
    }

    let scores = {};
    const categories = ["Mauvais", "Lâcheur", "Râleur", "Mito", "Salty"];
    
    filteredLogs.forEach(log => {
      if (!scores[log.player]) {
        scores[log.player] = { total: 0 };
        categories.forEach(c => scores[log.player][c] = 0);
      }
      if (scores[log.player][log.category] !== undefined) {
         scores[log.player][log.category]++;
         scores[log.player].total++;
      }
    });

    return {
      scores: scores,
      insights: this.generateInsights(scores),
      rawCount: filteredLogs.length
    };
  },

  generateInsights: function(scores) {
    let narrative = [];
    const categories = ["Mauvais", "Lâcheur", "Râleur", "Mito", "Salty"];
    let categoryWinners = {};
    let topOfTops = {};

    Object.keys(scores).forEach(player => topOfTops[player] = 0);

    categories.forEach(cat => {
      let maxScore = 0;
      let winners = [];
      Object.keys(scores).forEach(player => {
        const pScore = scores[player][cat];
        if (pScore > maxScore) { 
          maxScore = pScore; 
          winners = [player]; 
        } else if (pScore === maxScore && pScore > 0) {
          winners.push(player);
        }
      });
      if (maxScore > 0) {
        categoryWinners[cat] = { names: winners, score: maxScore };
        winners.forEach(w => topOfTops[w]++);
      }
    });

    Object.keys(categoryWinners).forEach(cat => {
      const w = categoryWinners[cat];
      const namesStr = w.names.join(" and ");
      narrative.push(`In the '${cat}' category, ${namesStr} dominated with ${w.score} offenses.`);
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
  try {
    StorageService.appendLog(player, category, customTimestamp);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiGetData(year, month) {
  try {
    return { success: true, data: AnalyticsService.getAggregatedData(year, month) };
  } catch(e) {
    return { success: false, error: e.message };
  }
}