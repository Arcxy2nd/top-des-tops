/**
 * AUTO POINTS — automatic, scheduled point-granting rules.
 *
 * Sheet "AutoRules" (auto-created, same lazy pattern as Notes/Bareme/Phrases):
 * [0] Id | [1] Player | [2] Category | [3] Points | [4] Description
 * [5] Frequency ('daily'|'weekly'|'monthly') | [6] Interval (every N units)
 * [7] DaysOfWeek (csv, 0=Sunday..6=Saturday, weekly only)
 * [8] DayOfMonth (1-31, monthly only) | [9] StartDate (ISO)
 * [10] NextRun (ISO datetime) | [11] LastRun (ISO datetime or empty)
 * [12] Active (TRUE/FALSE) | [13] CreatedBy
 *
 * A time-driven trigger calls runAutoPoints() periodically; it grants points
 * for every rule whose NextRun has passed, then reschedules that rule.
 */

const AutoPointsService = (() => {
  const FREQUENCIES = ['daily', 'weekly', 'monthly'];

  /** Returns the AutoRules sheet, creating it (with header row) on first use. */
  function _sheet() {
    const cache = ConfigService.getSheets();
    if (cache.autoRules) return cache.autoRules;
    const ss = cache.spreadsheet;
    const sheet = ss.insertSheet('AutoRules');
    sheet.appendRow([
      'Id', 'Player', 'Category', 'Points', 'Description',
      'Frequency', 'Interval', 'DaysOfWeek', 'DayOfMonth', 'StartDate',
      'NextRun', 'LastRun', 'Active', 'CreatedBy'
    ]);
    sheet.getRange(1, 1, 1, 14).setFontWeight('bold');
    ConfigService.clearCache();
    return ConfigService.getSheets().autoRules || ss.getSheetByName('AutoRules');
  }

  function _parseRow(row, i) {
    return {
      rowIndex:    i + 2,
      id:          row[0] ? row[0].toString() : '',
      player:      row[1] ? row[1].toString() : '',
      category:    row[2] ? row[2].toString() : '',
      points:      parseInt(row[3], 10) || 0,
      description: row[4] ? row[4].toString() : '',
      frequency:   row[5] ? row[5].toString() : 'daily',
      interval:    parseInt(row[6], 10) || 1,
      daysOfWeek:  row[7] ? row[7].toString().split(',').filter(x => x !== '').map(Number) : [],
      dayOfMonth:  row[8] ? parseInt(row[8], 10) : null,
      startDate:   row[9] ? new Date(row[9]) : null,
      nextRun:     row[10] ? new Date(row[10]) : null,
      lastRun:     row[11] ? new Date(row[11]) : null,
      active:      row[12] === true || row[12] === 'TRUE' || row[12] === 'true',
      createdBy:   row[13] ? row[13].toString() : ''
    };
  }

  function getRules() {
    const sheet = ConfigService.getSheets().autoRules;
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    return data.map(_parseRow).filter(r => r.id);
  }

  function _clampDayOfMonth(year, monthIndex, day) {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return Math.min(day, lastDay);
  }

  /** Monday 00:00 of the week containing `d` (ISO week start), used to count "active" weeks for a weekly interval. */
  function _weekStart(d) {
    const w = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const isoDay = (w.getDay() + 6) % 7; // 0=Monday..6=Sunday
    w.setDate(w.getDate() - isoDay);
    w.setHours(0, 0, 0, 0);
    return w;
  }

  /**
   * Computes the next run datetime strictly after `fromDate`, honoring the
   * rule's frequency/interval and, for weekly/monthly rules, the requested
   * weekday(s) or day-of-month.
   *
   * Weekly rules with an interval > 1 only fire during "active" weeks — the
   * week containing `rule.startDate`, then every Nth week after that — so
   * "every 2 weeks, Mon/Wed" genuinely skips the in-between week instead of
   * firing every week regardless of interval.
   */
  function computeNextRun(rule, fromDate) {
    const base = new Date(fromDate.getTime());
    if (rule.frequency === 'daily') {
      base.setDate(base.getDate() + rule.interval);
      return base;
    }
    if (rule.frequency === 'weekly') {
      const sortedDays = rule.daysOfWeek.length ? rule.daysOfWeek.slice().sort((a, b) => a - b) : [base.getDay()];
      const refWeekStart = _weekStart(rule.startDate ? new Date(rule.startDate) : base);
      const candidate = new Date(base.getTime());
      const maxSteps = 7 * Math.max(rule.interval, 1) * 8; // generous search window, still bounded
      for (let step = 1; step <= maxSteps; step++) {
        candidate.setTime(base.getTime());
        candidate.setDate(base.getDate() + step);
        if (sortedDays.indexOf(candidate.getDay()) === -1) continue;
        const weeksSinceRef = Math.round((_weekStart(candidate) - refWeekStart) / (7 * 86400000));
        if (((weeksSinceRef % rule.interval) + rule.interval) % rule.interval === 0) return candidate;
      }
      base.setDate(base.getDate() + 7 * rule.interval); // fallback, should not normally be reached
      return base;
    }
    // monthly
    const day = rule.dayOfMonth || base.getDate();
    const targetMonth = base.getMonth() + rule.interval;
    const targetYear = base.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const clampedDay = _clampDayOfMonth(targetYear, normalizedMonth, day);
    return new Date(targetYear, normalizedMonth, clampedDay, base.getHours(), base.getMinutes(), base.getSeconds());
  }

  function _validate(rule) {
    if (!rule.player || !rule.player.trim()) throw new Error("Joueur manquant.");
    if (!rule.category || !rule.category.trim()) throw new Error("Top (catégorie) manquant.");
    const knownPlayers = SettingsService.getEntities('Players').map(p => p.name);
    if (knownPlayers.indexOf(rule.player) === -1) throw new Error("Joueur introuvable : " + rule.player);
    const knownCategories = SettingsService.getEntities('Categories').map(c => c.name);
    if (knownCategories.indexOf(rule.category) === -1) throw new Error("Top introuvable : " + rule.category);
    const pts = parseInt(rule.points, 10);
    if (isNaN(pts) || pts < 1) throw new Error("Les points doivent être ≥ 1.");
    if (FREQUENCIES.indexOf(rule.frequency) === -1) throw new Error("Fréquence invalide : " + rule.frequency);
    const interval = parseInt(rule.interval, 10) || 1;
    if (interval < 1) throw new Error("L'intervalle doit être ≥ 1.");
    if (rule.frequency === 'weekly' && (!rule.daysOfWeek || !rule.daysOfWeek.length)) {
      throw new Error("Sélectionnez au moins un jour de la semaine pour une règle hebdomadaire.");
    }
    if (rule.frequency === 'monthly' && rule.dayOfMonth != null) {
      const dom = parseInt(rule.dayOfMonth, 10);
      if (isNaN(dom) || dom < 1 || dom > 31) throw new Error("Jour du mois invalide (1-31).");
    }
    return pts;
  }

  /** Adds a new rule and returns it. Must run inside withLock(). */
  function addRule(rule, author) {
    const pts = _validate(rule);
    const sheet = _sheet();
    const id = 'AR' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const startDate = rule.startDate ? new Date(rule.startDate) : new Date();
    if (isNaN(startDate.getTime())) throw new Error("Date de début invalide.");
    const normalized = {
      frequency:  rule.frequency,
      interval:   parseInt(rule.interval, 10) || 1,
      daysOfWeek: rule.frequency === 'weekly' ? (rule.daysOfWeek || []) : [],
      dayOfMonth: rule.frequency === 'monthly' ? (rule.dayOfMonth || startDate.getDate()) : null,
      startDate:  startDate
    };
    const nextRun = computeNextRun(normalized, new Date(startDate.getTime() - 1));
    sheet.appendRow([
      id, rule.player, rule.category, pts, rule.description || '',
      rule.frequency, normalized.interval, normalized.daysOfWeek.join(','), normalized.dayOfMonth || '',
      startDate.toISOString(), nextRun.toISOString(), '', true, author || ''
    ]);
    ConfigService.clearCache();
    return _parseRow(sheet.getRange(sheet.getLastRow(), 1, 1, 14).getValues()[0], sheet.getLastRow() - 2);
  }

  function _findRowIndex(id) {
    const sheet = ConfigService.getSheets().autoRules;
    if (!sheet) throw new Error("Aucune règle définie.");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) throw new Error("Règle introuvable.");
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] && ids[i][0].toString() === id) return i + 2;
    }
    throw new Error("Règle introuvable : " + id);
  }

  /** Updates mutable fields of a rule (player, category, points, description, schedule, active). */
  function updateRule(id, patch) {
    const sheet = ConfigService.getSheets().autoRules;
    const rowIndex = _findRowIndex(id);
    const current = _parseRow(sheet.getRange(rowIndex, 1, 1, 14).getValues()[0], rowIndex - 2);
    const merged = Object.assign({}, current, patch);
    const pts = _validate(merged);
    const startDate = merged.startDate ? new Date(merged.startDate) : current.startDate;
    const scheduleChanged = ['frequency', 'interval', 'daysOfWeek', 'dayOfMonth', 'startDate']
      .some(k => Object.prototype.hasOwnProperty.call(patch, k));
    const nextRun = scheduleChanged
      ? computeNextRun(merged, new Date(startDate.getTime() - 1))
      : current.nextRun;
    sheet.getRange(rowIndex, 1, 1, 14).setValues([[
      current.id, merged.player, merged.category, pts, merged.description || '',
      merged.frequency, merged.interval,
      merged.frequency === 'weekly' ? (merged.daysOfWeek || []).join(',') : '',
      merged.frequency === 'monthly' ? (merged.dayOfMonth || '') : '',
      startDate.toISOString(),
      nextRun.toISOString(),
      current.lastRun ? current.lastRun.toISOString() : '',
      Object.prototype.hasOwnProperty.call(patch, 'active') ? !!patch.active : current.active,
      current.createdBy
    ]]);
    ConfigService.clearCache();
    return _parseRow(sheet.getRange(rowIndex, 1, 1, 14).getValues()[0], rowIndex - 2);
  }

  function deleteRule(id) {
    const sheet = ConfigService.getSheets().autoRules;
    const rowIndex = _findRowIndex(id);
    sheet.deleteRow(rowIndex);
    ConfigService.clearCache();
  }

  /**
   * Grants points for every active rule whose NextRun has passed, then
   * reschedules it. Rules pointing at a player or category that no longer
   * exists are skipped (and reported) instead of silently creating orphaned
   * History rows. Returns a summary. Must run inside withLock().
   */
  function runDue(author) {
    const rules = getRules();
    const now = new Date();
    const due = rules.filter(r => r.active && r.nextRun && r.nextRun <= now);
    if (!due.length) return { granted: 0, skipped: 0, rules: [] };

    const knownPlayers    = SettingsService.getEntities('Players').map(p => p.name);
    const knownCategories = SettingsService.getEntities('Categories').map(c => c.name);
    const valid   = due.filter(r => knownPlayers.indexOf(r.player) !== -1 && knownCategories.indexOf(r.category) !== -1);
    const invalid = due.filter(r => valid.indexOf(r) === -1);

    if (valid.length) {
      const today = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
      const entries = valid.map(r => ({
        player: r.player, category: r.category, points: r.points, times: 1,
        description: r.description || 'Points automatiques', groupTag: '',
        saiseur: 'Auto (' + (r.createdBy || 'système') + ')'
      }));
      StorageService.appendBulkPlan([{ date: today, entries }]);
    }

    const sheet = ConfigService.getSheets().autoRules;
    due.forEach(r => {
      const nextRun = computeNextRun(r, r.nextRun);
      sheet.getRange(r.rowIndex, 11, 1, 2).setValues([[nextRun.toISOString(), now.toISOString()]]);
    });
    ConfigService.clearCache();

    if (valid.length) {
      AuditService.log(author || 'Auto', 'Points automatiques', 'AutoRules', '', '',
        valid.length + ' règle(s) exécutée(s), ' + valid.map(r => r.player + ' +' + r.points).join(', '));
    }
    if (invalid.length) {
      AuditService.log(author || 'Auto', 'Règle auto ignorée', 'AutoRules', '', '',
        invalid.length + ' règle(s) avec joueur/Top introuvable : ' +
        invalid.map(r => r.player + ' / ' + r.category).join(', '));
    }

    return {
      granted: valid.length,
      skipped: invalid.length,
      rules: valid.map(r => ({ player: r.player, points: r.points }))
    };
  }

  function isTriggerInstalled() {
    return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runAutoPoints');
  }

  function installTrigger() {
    uninstallTrigger();
    ScriptApp.newTrigger('runAutoPoints').timeBased().everyHours(CONFIG.AUTO_TRIGGER_INTERVAL_HOURS).create();
  }

  function uninstallTrigger() {
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'runAutoPoints') ScriptApp.deleteTrigger(t);
    });
  }

  return {
    FREQUENCIES, getRules, addRule, updateRule, deleteRule, runDue,
    isTriggerInstalled, installTrigger, uninstallTrigger
  };
})();

/** Time-driven trigger handler — do not call directly except for manual testing. */
function runAutoPoints() {
  try {
    withLock(() => AutoPointsService.runDue('Auto'));
  } catch (e) {
    Logger.log('runAutoPoints error: ' + (e && e.message ? e.message : String(e)));
  }
}

// ─── API ENDPOINTS ──────────────────────────────────────────────────────────────

function apiGetAutoRules() {
  try {
    const rules = AutoPointsService.getRules();
    let triggerInstalled = false;
    let triggerError = '';
    try {
      triggerInstalled = AutoPointsService.isTriggerInstalled();
    } catch (triggerErr) {
      triggerError = triggerErr && triggerErr.message ? triggerErr.message : String(triggerErr);
    }
    return { success: true, rules, triggerInstalled, triggerError };
  } catch (e) { return fail(e); }
}

function apiAddAutoRule(rule, author) {
  try {
    requireAuthor(author);
    return withLock(() => {
      const created = AutoPointsService.addRule(rule, author);
      AuditService.log(author, 'Création règle auto', 'AutoRules', '', '',
        created.player + ' +' + created.points + ' (' + created.frequency + ')');
      return { success: true, rule: created };
    });
  } catch (e) { return fail(e); }
}

function apiUpdateAutoRule(id, patch, author) {
  try {
    requireAuthor(author);
    return withLock(() => {
      const updated = AutoPointsService.updateRule(id, patch);
      AuditService.log(author, 'Modification règle auto', 'AutoRules', id, '', JSON.stringify(patch));
      return { success: true, rule: updated };
    });
  } catch (e) { return fail(e); }
}

function apiDeleteAutoRule(id, author) {
  try {
    requireAuthor(author);
    return withLock(() => {
      AutoPointsService.deleteRule(id);
      AuditService.log(author, 'Suppression règle auto', 'AutoRules', id, '', '');
      return { success: true };
    });
  } catch (e) { return fail(e); }
}

function apiSetAutoTrigger(enabled, author) {
  try {
    requireAuthor(author);
    return withLock(() => {
      if (enabled) AutoPointsService.installTrigger();
      else AutoPointsService.uninstallTrigger();
      AuditService.log(author, enabled ? 'Activation auto-trigger' : 'Désactivation auto-trigger', 'AutoRules', '', '', '');
      return { success: true, installed: AutoPointsService.isTriggerInstalled() };
    });
  } catch (e) { return fail(e); }
}

function apiRunAutoRulesNow(author) {
  try {
    requireAuthor(author);
    return withLock(() => {
      const result = AutoPointsService.runDue(author);
      return { success: true, result };
    });
  } catch (e) { return fail(e); }
}
