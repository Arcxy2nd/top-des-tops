'use strict';

/**
 * Test harness for the Google Apps Script backend.
 *
 * Code.gs cannot be `require`d (it is a monolithic GAS script with no exports, by
 * design — see the GAS exception in the optimisation plan). So we load its source
 * into a sandboxed VM context, inject lightweight stand-ins for the Google services
 * it relies on, and expose its top-level services/functions for assertions.
 *
 * This tests the REAL Code.gs source unchanged — not a copy.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

/** A minimal in-memory stand-in for a Google Sheet. grid[0] is the header row. */
function makeSheet(grid) {
  grid = (grid || []).map(r => r.slice());
  const api = {
    _grid: grid,
    getLastRow() { return grid.length; },
    getLastColumn() { return grid.reduce((m, r) => Math.max(m, r.length), 0); },
    getRange(r, c, numRows, numCols) {
      numRows = numRows == null ? 1 : numRows;
      numCols = numCols == null ? 1 : numCols;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < numRows; i++) {
            const src = grid[r - 1 + i] || [];
            const cells = [];
            for (let j = 0; j < numCols; j++) {
              const v = src[c - 1 + j];
              cells.push(v === undefined ? '' : v);
            }
            out.push(cells);
          }
          return out;
        },
        setValues(vals) {
          for (let i = 0; i < vals.length; i++) {
            const ri = r - 1 + i;
            if (!grid[ri]) grid[ri] = [];
            for (let j = 0; j < vals[i].length; j++) grid[ri][c - 1 + j] = vals[i][j];
          }
          return this;
        },
        setValue(v) {
          const ri = r - 1;
          if (!grid[ri]) grid[ri] = [];
          grid[ri][c - 1] = v;
          return this;
        },
        setFontWeight() { return this; }
      };
    },
    getDataRange() { return api.getRange(1, 1, grid.length, api.getLastColumn()); },
    appendRow(row) { grid.push(row.slice()); },
    deleteRow(idx) { grid.splice(idx - 1, 1); },
    copyTo() { return { setName() {} }; },
    setName() {}
  };
  return api;
}

/** Default stand-ins for the Google services referenced in Code.gs.
 *  PropertiesService and CacheService keep persistent per-sandbox stores so that
 *  the versioned cross-request logs cache can be exercised in tests. */
function gasMocks() {
  const propStore = {};
  const cacheStore = {};
  return {
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = String(v); }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v) => { cacheStore[k] = v; }
      })
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} })
    },
    HtmlService: {
      createHtmlOutputFromFile: name => ({
        _file: name,
        setTitle() { return this; },
        setXFrameOptionsMode() { return this; }
      }),
      createHtmlOutput: html => ({
        _html: html,
        setTitle() { return this; },
        setXFrameOptionsMode() { return this; }
      }),
      createTemplateFromFile: name => {
        const tpl = {
          _file: name,
          evaluate() {
            return {
              _file: tpl._file,
              _appUrl: tpl.appUrl,
              setTitle() { return this; },
              setXFrameOptionsMode() { return this; }
            };
          }
        };
        return tpl;
      },
      XFrameOptionsMode: { ALLOWALL: 1 }
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE_DEPLOYMENT_ID/exec' })
    },
    Logger: { log: () => {} }
  };
}

/** Loads Code.gs into a fresh sandbox and returns its services + tested endpoints. */
function loadGas(extraMocks) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const autoPointsCode = fs.readFileSync(path.join(__dirname, '..', 'AutoPoints.gs'), 'utf8');
  const sandbox = Object.assign(gasMocks(), extraMocks || {});
  vm.createContext(sandbox);
  const epilogue = '\n;this.__exports = { ConfigService, AuditService, SettingsService, StorageService, ' +
    'NotesService, AnalyticsService, BaremeService, PhrasesService, SettingsSheetService, withLock, ' +
    'apiDetectDistributedLots, apiDetectLegacyGroups, apiAddBulkPlan, apiUpdateHistoryEntry, ' +
    'apiGetAuditLog, apiUndoAuditEntry, apiFixZeroPoints, apiDeleteOrphans, apiUpdateBulkEntries, ' +
    'apiDeleteHistoryEntries, apiUpdateHistoryDescription, apiManageEntity, apiSetColor, ' +
    'apiAddBaremeEntry, apiUpdateBaremeEntry, apiDeleteBaremeEntry, ' +
    'apiAddNote, apiDeleteNote, apiEditNote, ' +
    'apiAddPhrase, apiSavePhrasesBatch, apiUpdatePhrase, apiDeletePhrase, apiDeletePreset, apiRenamePreset, ' +
    'apiGetAppSettings, apiSaveAppSettings, apiVerifyIdentity, apiRemoveFromGroup, ' +
    'AutoPointsService, apiGetAutoRules, NAV_PAGES, apiGetNavPages, doGet, ' +
    'apiDetectDuplicates, apiDetectOutlierScores, apiGetInactivePlayers, apiGetPlayerRecords, ' +
    'apiGetTrends, apiGetActiveWeekday, apiGetTopPlayerCategoryPairs, ScriptApp, ' +
    'apiGetQuickStats: (typeof apiGetQuickStats === "undefined" ? undefined : apiGetQuickStats) };';
  vm.runInContext(code + '\n' + autoPointsCode + epilogue, sandbox, { filename: 'Code.gs+AutoPoints.gs' });
  return sandbox.__exports;
}

/** Replaces ConfigService.getSheets and disables the per-request log cache for a test. */
function injectSheets(gas, sheets) {
  gas.ConfigService.getSheets = () => sheets;
  gas.ConfigService.getLogsCache = () => null;
  gas.ConfigService.setLogsCache = () => {};
  gas.ConfigService.clearCache = () => {};
}

module.exports = { loadGas, makeSheet, injectSheets };
