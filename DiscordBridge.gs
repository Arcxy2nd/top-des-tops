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

  addPoints_(e) {
    const discordId = e.parameter.discordId;
    const top = e.parameter.top;
    const pointsRaw = e.parameter.points;
    const desc = e.parameter.desc || '';

    const player = this.resolvePlayerByDiscordId(discordId);
    if (!player) return this.err_("Ton compte Discord n'est lié à aucun joueur. Demande à l'admin d'ajouter ton ID Discord dans la colonne 'Discord ID' de la feuille Players.");

    if (!top || !top.trim()) return this.err_("Le paramètre 'top' est obligatoire.");
    const categories = SettingsService.getEntities('Categories').map(c => c.name);
    const matchedTop = categories.find(c => c.toLowerCase() === top.trim().toLowerCase());
    if (!matchedTop) return this.err_("Top inconnu : '" + top + "'. Vérifie l'orthographe exacte.");

    const points = parseInt(pointsRaw, 10);
    if (isNaN(points) || points < 1) return this.err_("Les points doivent être un entier ≥ 1.");

    return withLock(() => {
      const { history } = ConfigService.getSheets();
      const startRow = history.getLastRow() + 1;
      const todayStr = _dayKey(new Date());
      StorageService.appendBulkPlan([{
        date: todayStr,
        entries: [{ player, category: matchedTop, points, times: 1, description: desc }]
      }]);
      const endRow = history.getLastRow();
      const addedRows = endRow >= startRow ? history.getRange(startRow, 1, endRow - startRow + 1, 7).getValues() : [];
      AuditService.log(player, 'Saisie de points', 'History', '', '1 entrée',
        player + ' +' + points + ' pts · ' + matchedTop + (desc ? ' — "' + desc.slice(0, 40) + '"' : '') + ' (via Discord)',
        addedRows.length ? { sheet: 'history', op: 'insertMany', rows: addedRows } : null);
      return this.ok_('✅ ' + player + ' +' + points + ' pts sur ' + matchedTop + (desc ? ' (' + desc + ')' : ''));
    });
  },

  addNote_(e) {
    const discordId = e.parameter.discordId;
    const text = e.parameter.text;
    const player = this.resolvePlayerByDiscordId(discordId);
    if (!player) return this.err_("Ton compte Discord n'est lié à aucun joueur. Demande à l'admin d'ajouter ton ID Discord dans la colonne 'Discord ID' de la feuille Players.");
    if (!text || !text.trim()) return this.err_("Le paramètre 'texte' est obligatoire.");

    return withLock(() => {
      const note = NotesService.addNote(player, text, '', player);
      const sheet = ConfigService.getSheets().notes;
      AuditService.log(player, 'Note ajoutée', 'Note: ' + player, '', player + ' : ' + text.trim(),
        'note:' + note.noteId + ' (via Discord)',
        { sheet: 'notes', op: 'insert', rowIndex: note.rowIndex, after: sheet.getRange(note.rowIndex, 1, 1, 7).getValues()[0] });
      return this.ok_('✅ Note ajoutée pour ' + player);
    });
  },

  getLeaderboard_(e) {
    const totals = apiGetPlayerTotals(null, null, null);
    if (!totals.success) return this.err_(totals.error || "Impossible de lire le classement.");
    const labels = totals.chartData.labels || [];
    const data = (totals.chartData.datasets[0] || {}).data || [];
    const ranking = labels.map((name, i) => ({ name, points: data[i] || 0 }))
      .sort((a, b) => b.points - a.points);
    if (!ranking.length) return this.ok_("Aucun joueur enregistré pour l'instant.");
    const medals = ['🥇', '🥈', '🥉'];
    const lines = ranking.map((r, i) => (medals[i] || (i + 1) + '.') + ' ' + r.name + ' — ' + r.points + ' pts');
    return this.ok_(lines.join('\n'));
  },

  getNotes_(e) {
    const playerParam = e.parameter.player;
    if (!playerParam || !playerParam.trim()) return this.err_("Le paramètre 'joueur' est obligatoire.");
    const all = NotesService.getAllNotes().notes;
    const matches = all.filter(n => n.player.toLowerCase() === playerParam.trim().toLowerCase());
    if (!matches.length) return this.ok_("Aucune note pour " + playerParam + ".");
    const lines = matches.slice(0, 10).map(n => {
      const d = n.timestamp ? new Date(n.timestamp) : null;
      const dateLabel = d ? _pad2(d.getDate()) + '/' + _pad2(d.getMonth() + 1) + '/' + d.getFullYear() : '?';
      return dateLabel + ' — ' + n.text;
    });
    return this.ok_(lines.join('\n'));
  }
};
