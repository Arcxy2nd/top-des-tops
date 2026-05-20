// Code.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Friends Top Leaderboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function addScore(player, category) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('History');
  const timestamp = new Date();
  
  sheet.appendRow([timestamp, player, category]);
  return getDashboardData();
}

function getDashboardData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('History');
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) return { players: [], categories: {}, history: [] };
  
  const headers = data.shift();
  const history = data.slice(-5).reverse(); // Get last 5 entries for the feed
  
  let scores = {};
  
  data.forEach(row => {
    let date = row[0];
    let player = row[1];
    let category = row[2];
    
    if (!scores[player]) {
      scores[player] = { total: 0, categories: {} };
    }
    if (!scores[player].categories[category]) {
      scores[player].categories[category] = 0;
    }
    
    scores[player].categories[category]++;
    scores[player].total++;
  });
  
  return {
    leaderboard: scores,
    recentHistory: history.map(h => ({ date: h[0], player: h[1], category: h[2] }))
  };
}