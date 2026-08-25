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
const crypto = require('crypto');

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
        getValue() {
          const v = (grid[r - 1] || [])[c - 1];
          return v === undefined ? '' : v;
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
    clearContents() { grid.length = 0; },
    copyTo() { return { setName() {} }; },
    setName() {}
  };
  return api;
}

/**
 * In-memory fake Drive + Spreadsheet.copy(), for testing BackupService without
 * touching real Google Drive. A "file" here doubles as both the Drive-file view
 * (getParents/getId) and the Spreadsheet view (getUrl/copy) — same object, same id,
 * since BackupService bridges the two via DriveApp.getFileById(spreadsheet.getId()).
 */
function makeFakeDrive() {
  let seq = 0;
  const filesById = {};

  function makeFolder(name) {
    const id = 'folder_' + (++seq);
    const state = { name, folders: [], files: [] };
    const folder = {
      getId: () => id,
      getName: () => state.name,
      createFolder(n) {
        const f = makeFolder(n);
        state.folders.push(f);
        return f;
      },
      getFoldersByName(n) {
        const matches = state.folders.filter(f => f.getName() === n);
        let i = 0;
        return { hasNext: () => i < matches.length, next: () => matches[i++] };
      },
      addFile(file) {
        if (state.files.indexOf(file) === -1) state.files.push(file);
        file._addParent(folder);
        return folder;
      },
      removeFile(file) {
        state.files = state.files.filter(f => f !== file);
        file._removeParent(folder);
        return folder;
      },
      _files: () => state.files.slice()
    };
    return folder;
  }

  const root = makeFolder('My Drive');

  function makeSpreadsheet(name, parentFolder) {
    const parents = parentFolder === undefined ? [root] : (parentFolder === null ? [] : [parentFolder]);
    const id = 'sheet_' + (++seq);
    let currentParents = parents.slice();
    const file = {
      getId: () => id,
      getName: () => name,
      getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
      getParents() {
        const list = currentParents.slice();
        let i = 0;
        return { hasNext: () => i < list.length, next: () => list[i++] };
      },
      _addParent(folder) { if (currentParents.indexOf(folder) === -1) currentParents.push(folder); },
      _removeParent(folder) { currentParents = currentParents.filter(f => f !== folder); },
      copy(newName) { return makeSpreadsheet(newName); },
      moveTo(folder) {
        currentParents.slice().forEach(p => p.removeFile(file));
        folder.addFile(file);
        return file;
      }
    };
    parents.forEach(p => p.addFile(file));
    filesById[id] = file;
    return file;
  }

  const DriveApp = {
    getRootFolder: () => root,
    getFileById: id => filesById[id]
  };

  return { DriveApp, root, makeSpreadsheet };
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
    // Real Apps Script provides Utilities as a built-in global; it is absent from
    // this sandbox by default, which made ChatService.postMessage() (the only
    // caller of Utilities.getUuid) throw "Utilities is not defined" in every test
    // and in the frontend preview harness alike, undetected because no test ever
    // exercised it.
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeDigest: (algorithm, value) => {
        const hash = crypto.createHash('sha256').update(value, 'utf8').digest();
        // Real Apps Script returns a Java byte[] — signed bytes (-128..127), not
        // unsigned 0..255. Mirrored here so a masking bug (`& 0xFF`) in the
        // production hashing code would actually show up under test.
        return Array.from(hash).map(b => (b > 127 ? b - 256 : b));
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' }
    },
    HtmlService: {
      createHtmlOutputFromFile: name => ({
        _file: name,
        _metaTag: null,
        addMetaTag(name, content) { this._metaTag = { name, content }; return this; },
        setTitle() { return this; },
        setXFrameOptionsMode() { return this; }
      }),
      createHtmlOutput: html => ({
        _html: html,
        _metaTag: null,
        addMetaTag(name, content) { this._metaTag = { name, content }; return this; },
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
              _metaTag: null,
              addMetaTag(name, content) { this._metaTag = { name, content }; return this; },
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

// Services and constants tests reach for by name. Every `api*` endpoint is added
// automatically by buildEpilogue, so a new endpoint never has to be listed here.
const EXPORTED_GLOBALS = [
  'CONFIG', 'Logger', 'ConfigService', 'AuditService', 'SettingsService', 'StorageService',
  'NotesService', 'AnalyticsService', 'BaremeService', 'PhrasesService', 'SettingsSheetService',
  'AltSettingsService', 'AltStorageService', 'AutoPointsService', 'ChatService',
  'withLock', 'NAV_PAGES', 'doGet', 'ScriptApp', 'requireAuthor',
  '_byteLength', '_cachePutChunked', '_cacheGetChunked'
];

/**
 * Builds the export epilogue by scanning the sources for `function api*`
 * declarations. A hand-maintained list silently desynchronises from the code:
 * an endpoint absent from it makes the browser harness answer "not exposed",
 * which reads like an application failure during an audit.
 */
function buildEpilogue(source) {
  const endpoints = [...new Set(
    [...source.matchAll(/^function\s+(api[A-Za-z0-9_]*)\s*\(/gm)].map(m => m[1])
  )];
  const entries = EXPORTED_GLOBALS.concat(endpoints)
    .map(name => name + ': (typeof ' + name + ' === "undefined" ? undefined : ' + name + ')')
    .join(', ');
  return '\n;this.__exports = { ' + entries + ' };';
}

/** Loads Code.gs into a fresh sandbox and returns its services + tested endpoints. */
function loadGas(extraMocks) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const autoPointsCode = fs.readFileSync(path.join(__dirname, '..', 'AutoPoints.gs'), 'utf8');
  const sandbox = Object.assign(gasMocks(), extraMocks || {});
  vm.createContext(sandbox);
  const source = code + '\n' + autoPointsCode;
  vm.runInContext(source + buildEpilogue(source), sandbox, { filename: 'Code.gs+AutoPoints.gs' });
  return sandbox.__exports;
}

/** Replaces ConfigService.getSheets and disables the per-request log cache for a test. */
function injectSheets(gas, sheets) {
  gas.ConfigService.getSheets = () => sheets;
  gas.ConfigService.getLogsCache = () => null;
  gas.ConfigService.setLogsCache = () => {};
  gas.ConfigService.clearCache = () => {};
}

module.exports = { loadGas, makeSheet, injectSheets, makeFakeDrive };
