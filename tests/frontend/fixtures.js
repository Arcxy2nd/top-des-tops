'use strict';

const { makeSheet } = require('../harness.js');

// The data reproduces the shape observed in production on 2026-08-10 (7 players,
// several Tops, entries spread over two months): a two-row sheet does not
// trigger pagination, aggregates, or cache limits.
const PLAYERS = [
  ['Safir',   'https://example.invalid/a.jpg', '#ff858f', ''],
  ['Ilker',   'https://example.invalid/b.jpg', '#00ffaa', ''],
  ['Antoine', 'https://example.invalid/c.jpg', '#80eaff', ''],
  ['Nicolas', 'https://example.invalid/d.jpg', '#ff9238', ''],
  ['Romain',  'https://example.invalid/e.jpg', '#ff0000', ''],
  ['Alik',    'https://example.invalid/f.jpg', '#fff700', ''],
  ['JJ',      'https://example.invalid/g.jpg', '#c9c9c9', '']
];

const CATEGORIES = [
  ['Mauvais',   'Prend mal ce qu on lui dit', '😭',   '#ff858f'],
  ['Méchant',   'Envoie des piques',          '😈',   '#ff0000'],
  ['Lacheur',   'Abandonne ses amis',         '🚹',   '#ffd166'],
  ['Scatophile','Aime la merde',              '😏💩', '#6b3000']
];

function historyRows() {
  const rows = [];
  const players = PLAYERS.map(p => p[0]);
  const cats = CATEGORIES.map(c => c[0]);
  // 84 entries across June/July/August: enough to populate records, trends,
  // most active day, and frequent duos, which stay empty on a dataset that's too small.
  for (let d = 1; d <= 28; d++) {
    for (let k = 0; k < 3; k++) {
      const month = ['06', '07', '08'][k];
      rows.push([
        '2026-' + month + '-' + String(d).padStart(2, '0'),
        players[(d + k) % players.length],
        cats[(d + k * 2) % cats.length],
        1 + ((d * 7 + k) % 25),
        'Entrée de test @' + players[(d + 1) % players.length] + ' #' + cats[k % cats.length],
        ''
      ]);
    }
  }
  return rows;
}

function buildSheets() {
  return {
    players:    makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ...PLAYERS]),
    categories: makeSheet([['Name', 'Description', 'Emoji', 'Hex color'], ...CATEGORIES]),
    history:    makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId'], ...historyRows()]),
    notes:      makeSheet([['Date', 'Player', 'Note text'], ['2026-08-01', 'Alik', 'Note de test']]),
    bareme:     makeSheet([['Action', 'Points'], ['Insulter la mère', 204]]),
    phrases:    makeSheet([['Preset', 'Pool', 'Phrase'], ['__default__', 'first', '👑 {player} règne avec {pts} pts.']]),
    chat:       makeSheet([['Id', 'Date', 'Author', 'Text', 'ReplyToId'], ['1', '2026-08-01', 'Ilker', 'Salut @Safir', '']]),
    altHistory: makeSheet([['Date', 'Player', 'Category', 'Points', 'Description', 'RefHistoryRowId', 'GroupId', 'Author'],
                           ['2026-08-01', 'Alik', 'Trou du cul', 7, 'Native', '', '', 'Admin']]),
    altCategories: makeSheet([['Name', 'Description', 'Emoji', 'Hex color'], ['Trou du cul', 'Gros zgeg', '🤠', '#ee6943']])
  };
}

module.exports = { buildSheets, PLAYERS, CATEGORIES };
