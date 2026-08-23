'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const INDEX = path.join(__dirname, '..', 'Index.html');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, name + ' introuvable dans Index.html');
  let depth = 0, i = source.indexOf('{', start);
  const open = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(i > open, name + ' : accolade fermante introuvable');
  return source.slice(start, i + 1);
}

function loadCSVBuilder(chartData, contextLines) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const sandbox = { currentChartData: chartData, buildExportContextLines: () => contextLines, TextEncoder };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'buildCSVBytes') + '\nthis.__build = buildCSVBytes;', sandbox);
  return sandbox.__build;
}

function loadExcelBuilder(chartData, contextLines, ranking) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const XLSX = {
    utils: {
      aoa_to_sheet: aoa => ({ __aoa: aoa }),
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; }
    }
  };
  const sandbox = {
    currentChartData: chartData,
    buildExportContextLines: () => contextLines,
    computeRankingWithGaps: () => ranking,
    XLSX
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'buildExcelWorkbook') + '\nthis.__build = buildExcelWorkbook;', sandbox);
  return sandbox.__build;
}

test('buildCSVBytes returns null when there is no chart data', () => {
  const build = loadCSVBuilder(null, []);
  assert.strictEqual(build(), null);
});

test('buildCSVBytes encodes context lines then the data rows as CSV bytes', () => {
  const chartData = { labels: ['Alice'], datasets: [{ label: 'Sport', data: [10] }] };
  const build = loadCSVBuilder(chartData, [['Période', 'Tout']]);
  const bytes = build();
  assert.ok(bytes instanceof Uint8Array);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /^# Période : Tout/);
  assert.match(text, /Alice,10/);
});

test('buildExcelWorkbook returns null when there is no chart data', () => {
  const build = loadExcelBuilder(null, [], []);
  assert.strictEqual(build(), null);
});

test('buildExcelWorkbook builds the 3 expected sheets', () => {
  const chartData = { labels: ['Alice'], datasets: [{ label: 'Sport', data: [10] }] };
  const ranking = [{ rank: 1, player: 'Alice', total: 10, gapToNext: null }];
  const build = loadExcelBuilder(chartData, [['Période', 'Tout']], ranking);
  const wb = build();
  assert.deepStrictEqual(wb.SheetNames, ['Scores', 'Classement', 'Contexte']);
  // JSON round-trip: the aoa arrays are built inside the vm sandbox (a different
  // realm), so assert.deepStrictEqual's cross-realm Array check rejects them even
  // when structurally identical — compare their serialized form instead.
  assert.strictEqual(JSON.stringify(wb.Sheets['Scores'].__aoa[0]), JSON.stringify(['Joueur', 'Sport']));
  assert.strictEqual(JSON.stringify(wb.Sheets['Scores'].__aoa[1]), JSON.stringify(['Alice', 10]));
  assert.strictEqual(JSON.stringify(wb.Sheets['Classement'].__aoa[1]), JSON.stringify([1, 'Alice', 10, '']));
});
