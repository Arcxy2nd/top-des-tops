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
        case 'listTops':       return this.listTops_(e);
        case 'listBareme':     return this.listBareme_(e);
        default:               return this.err_("Action inconnue : " + action);
      }
    } catch (err) {
      return this.err_(err && err.message ? err.message : String(err));
    }
  },

  /**
   * `discordId` résout l'auteur (identité/permission — sert de Saiseur). `targetDiscordId`,
   * s'il est fourni, résout la cible (à qui les points/la note sont attribués) — via le même
   * mécanisme (compte Discord mentionné/sélectionné côté Discord, jamais un nom tapé à la
   * main : zéro faute de frappe possible, décision prise en session le 2026-09-13). Omis, la
   * cible est l'auteur lui-même. Player et Saiseur sont deux colonnes distinctes de
   * History/Notes — les confondre aurait empêché quiconque d'agir pour un autre joueur.
   */
  addPoints_(e) {
    const discordId = e.parameter.discordId;
    const targetDiscordId = e.parameter.targetDiscordId;
    const top = e.parameter.top;
    const pointsRaw = e.parameter.points;
    const desc = e.parameter.desc || '';

    const author = this.resolvePlayerByDiscordId(discordId);
    if (!author) return this.err_("Ton compte Discord n'est lié à aucun joueur. Demande à l'admin d'ajouter ton ID Discord dans la colonne 'Discord ID' de la feuille Players.");

    let player = author;
    if (targetDiscordId && String(targetDiscordId).trim()) {
      const matchedPlayer = this.resolvePlayerByDiscordId(targetDiscordId);
      if (!matchedPlayer) return this.err_("Le compte Discord ciblé n'est lié à aucun joueur.");
      player = matchedPlayer;
    }

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
        entries: [{ player, category: matchedTop, points, times: 1, description: desc, saiseur: author }]
      }]);
      const endRow = history.getLastRow();
      const addedRows = endRow >= startRow ? history.getRange(startRow, 1, endRow - startRow + 1, 7).getValues() : [];
      const attribution = (player !== author) ? ' (saisi par ' + author + ')' : '';
      AuditService.log(author, 'Saisie de points', 'History', '', '1 entrée',
        player + ' +' + points + ' pts · ' + matchedTop + (desc ? ' — "' + desc.slice(0, 40) + '"' : '') + attribution + ' (via Discord)',
        addedRows.length ? { sheet: 'history', op: 'insertMany', rows: addedRows } : null);
      return this.ok_('✅ ' + player + ' +' + points + ' pts sur ' + matchedTop + (desc ? ' (' + desc + ')' : ''));
    });
  },

  addNote_(e) {
    const discordId = e.parameter.discordId;
    const targetDiscordId = e.parameter.targetDiscordId;
    const text = e.parameter.text;

    const author = this.resolvePlayerByDiscordId(discordId);
    if (!author) return this.err_("Ton compte Discord n'est lié à aucun joueur. Demande à l'admin d'ajouter ton ID Discord dans la colonne 'Discord ID' de la feuille Players.");

    let player = author;
    if (targetDiscordId && String(targetDiscordId).trim()) {
      const matchedPlayer = this.resolvePlayerByDiscordId(targetDiscordId);
      if (!matchedPlayer) return this.err_("Le compte Discord ciblé n'est lié à aucun joueur.");
      player = matchedPlayer;
    }

    if (!text || !text.trim()) return this.err_("Le paramètre 'texte' est obligatoire.");

    return withLock(() => {
      const note = NotesService.addNote(player, text, '', author);
      const sheet = ConfigService.getSheets().notes;
      AuditService.log(author, 'Note ajoutée', 'Note: ' + player, '', player + ' : ' + text.trim(),
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
    const targetDiscordId = e.parameter.targetDiscordId;
    const player = this.resolvePlayerByDiscordId(targetDiscordId);
    if (!player) return this.err_("Le compte Discord ciblé n'est lié à aucun joueur.");
    const all = NotesService.getAllNotes().notes;
    const matches = all.filter(n => n.player.toLowerCase() === player.toLowerCase());
    if (!matches.length) return this.ok_("Aucune note pour " + player + ".");
    const lines = matches.slice(0, 10).map(n => {
      const d = n.timestamp ? new Date(n.timestamp) : null;
      const dateLabel = d ? _pad2(d.getDate()) + '/' + _pad2(d.getMonth() + 1) + '/' + d.getFullYear() : '?';
      return dateLabel + ' — ' + n.text;
    });
    return this.ok_(lines.join('\n'));
  },

  /**
   * Liste les Tops actuels, pour une source dynamique d'autocomplétion côté BotGhost (à
   * vérifier dans son interface — le contrat exact d'un champ "Autocomplete" n'est pas
   * documenté dans les sources consultées). Fournit le message formaté ET un tableau brut
   * `choices` ({name, value}, comme le format de choix Discord natif), au cas où seul l'un
   * des deux serait exploitable là-bas. `value` reste le nom exact du Top (celui attendu par
   * `top` dans addPoints), `name` ajoute l'emoji pour l'affichage.
   */
  listTops_(e) {
    const categories = SettingsService.getEntities('Categories');
    if (!categories.length) return this.ok_("Aucun Top enregistré pour l'instant.", { choices: [] });
    const choices = categories.map(c => ({ name: (c.icon ? c.icon + ' ' : '') + c.name, value: c.name }));
    const lines = categories.map(c => (c.icon ? c.icon + ' ' : '') + c.name);
    return this.ok_(lines.join('\n'), { choices });
  },

  /**
   * Liste les règles de barème (Action → Points) — de tous les Tops, ou d'un seul via le
   * paramètre optionnel `top`. Même besoin que listTops : côté Discord, deviner/taper le
   * nombre de points à la main revient à ignorer une donnée que le Sheet connaît déjà
   * (§5 context.md — le barème sert justement de raccourci de saisie dans l'app). `value`
   * est le nombre de points lui-même : une autocomplétion Discord native sur l'option
   * `points` peut donc alimenter directement addPoints sans aucun changement de son côté.
   */
  listBareme_(e) {
    const topFilter = e.parameter.top;
    let entries = BaremeService.getEntries();
    if (topFilter && topFilter.trim()) {
      const target = topFilter.trim().toLowerCase();
      entries = entries.filter(en => en.top.toLowerCase() === target);
    }
    if (!entries.length) return this.ok_("Aucune règle de barème pour ce Top.", { choices: [] });
    const choices = entries.map(en => ({ name: en.action + ' (' + (en.pts >= 0 ? '+' : '') + en.pts + ' pts)', value: en.pts }));
    const lines = entries.map(en => en.top + ' · ' + en.action + ' : ' + (en.pts >= 0 ? '+' : '') + en.pts + ' pts');
    return this.ok_(lines.join('\n'), { choices });
  }
};

/**
 * Utilitaire MANUEL, à lancer une seule fois depuis l'éditeur Apps Script (jamais appelé
 * par l'app, jamais exposé via doGet) pour amorcer un Google Sheet neuf sans le moindre
 * onglet — le cas d'une copie de test créée vide, où l'app refuse de démarrer (§3
 * context.md : History/Players/Categories ne sont jamais créées automatiquement sur un
 * vrai Sheet). Strictement additif : ne touche jamais un onglet déjà présent, donc
 * totalement inoffensif si on le lance par erreur sur "Site tops" ou "Tops RDS" (leurs
 * 3 onglets existent déjà, la fonction ne fait alors rien).
 */
function bootstrapDiscordTestSheet() {
  const ss = SpreadsheetApp.openById(ConfigService.getSpreadsheetId());

  let players = ss.getSheetByName('Players');
  if (!players) {
    players = ss.insertSheet('Players');
    players.appendRow(['Name', 'Avatar URL', 'Hex color', 'Password', 'Ordre', 'Discord ID']);
    players.getRange(1, 1, 1, 6).setFontWeight('bold');
    players.appendRow(['TestPlayer1', '', '#ff4757', '', '1', '']);
    players.appendRow(['TestPlayer2', '', '#7c8cff', '', '2', '']);
  }

  let categories = ss.getSheetByName('Categories');
  if (!categories) {
    categories = ss.insertSheet('Categories');
    categories.appendRow(['Name', 'Description', 'Emoji', 'Hex color', 'Ordre']);
    categories.getRange(1, 1, 1, 5).setFontWeight('bold');
    categories.appendRow(['Mario Kart', '', '🏎️', '#ff4757', '1']);
  }

  let history = ss.getSheetByName('History');
  if (!history) {
    history = ss.insertSheet('History');
    history.appendRow(['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']);
    history.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  // Un classeur Google Sheets tout neuf porte un onglet par défaut ("Feuille 1" ou
  // "Sheet1") — supprimé une fois les 3 vrais onglets en place pour ne pas laisser un
  // onglet fantôme vide traîner dans l'app.
  if (ss.getSheets().length > 3) {
    const stray = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
    if (stray) ss.deleteSheet(stray);
  }

  Logger.log('Bootstrap terminé : Players (2 joueurs factices), Categories (1 Top factice) et History sont prêts. Renseigne ta propre colonne Discord ID sur un joueur pour tester le bridge.');
}
