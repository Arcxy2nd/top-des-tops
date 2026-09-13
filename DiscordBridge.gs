// ─── DISCORD BRIDGE (BotGhost) ──────────────────────────────────────────────
// Pont HTTP GET entre les commandes Discord (BotGhost, bloc "Send an API
// Request") et l'app. doGet(e) délègue ici quand e.parameter.bgAction est
// présent. Toujours en GET : les Web Apps GAS ne suivent pas fiablement la
// redirection 302 en écriture (POST), et n'exposent de toute façon aucun
// en-tête HTTP personnalisé à doGet/doPost — le secret voyage donc en
// paramètre d'URL, jamais en header.
//
// Identité : un joueur lié à un compte Discord (colonne "Discord ID" dans
// Players, remplie à la main dans le Sheet, jamais ajoutée à
// CANONICAL_SHEET_HEADERS pour ne rien changer au parsing Players existant)
// est authentifié par cet ID seul, sans mot de passe — décision prise en
// session de brainstorming (2026-09-13) : le compte Discord lié est déjà la
// preuve d'identité, requireAuthor()/le mot de passe joueur ne s'appliquent
// pas à ce canal.
const DiscordBridgeService = {

  json_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  },

  ok_(message, extra) {
    return this.json_(Object.assign({ ok: true, message }, extra || {}));
  },

  err_(message) {
    return this.json_({ ok: false, message });
  },

  _discordIdColumnIndex(headerRow) {
    for (let i = 0; i < headerRow.length; i++) {
      if (String(headerRow[i]).trim().toLowerCase() === 'discord id') return i;
    }
    return -1;
  },

  /** Résout un discordId vers un nom de joueur exact, ou null si non lié / colonne absente. */
  resolvePlayerByDiscordId(discordId) {
    const id = String(discordId || '').trim();
    if (!id) return null;
    const sheet = ConfigService.getSheets().players;
    if (!sheet) return null;
    const width = sheet.getLastColumn();
    const headerRow = sheet.getRange(1, 1, 1, width).getValues()[0];
    const colIdx = this._discordIdColumnIndex(headerRow);
    if (colIdx === -1) return null;
    const { values } = _readDataRows('players', sheet, width);
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row[colIdx] && String(row[colIdx]).trim() === id) {
        return row[0] ? String(row[0]).trim() : null;
      }
    }
    return null;
  },

  checkSecret_(e) {
    const expected = PropertiesService.getScriptProperties().getProperty('DISCORD_BRIDGE_SECRET');
    const provided = (e && e.parameter) ? e.parameter.secret : '';
    return !!(expected && provided && expected === provided);
  },

  handleRequest(e) {
    try {
      if (!this.checkSecret_(e)) return this.err_("Non autorisé.");
      const action = e.parameter.bgAction;
      switch (action) {
        case 'addPoints':      return this.addPoints_(e);
        case 'getLeaderboard': return this.getLeaderboard_(e);
        case 'addNote':        return this.addNote_(e);
        case 'getNotes':       return this.getNotes_(e);
        default:               return this.err_("Action inconnue : " + action);
      }
    } catch (err) {
      return this.err_(err && err.message ? err.message : String(err));
    }
  },
};
