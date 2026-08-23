'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const INDEX = path.join(__dirname, '..', 'Index.html');

// Extracts a named function from Index.html's inline <script>, from the
// `function` keyword to its closing brace, by counting braces (same pattern
// as tests/frontend-guards.test.js).
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

function loadQuarterBounds() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(html, 'quarterBounds') + '\nthis.__quarterBounds = quarterBounds;', sandbox);
  return sandbox.__quarterBounds;
}

function loadDateRangePreset() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  const src = extractFunction(html, 'quarterBounds') + '\n' + extractFunction(html, 'dateRangePreset');
  vm.runInContext(src + '\nthis.__dateRangePreset = dateRangePreset;', sandbox);
  return sandbox.__dateRangePreset;
}

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test('quarterBounds returns Q1 (janv-mars) for a January reference date', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 0, 15), 0);
  assert.strictEqual(ymd(from), '2026-01-01');
  assert.strictEqual(ymd(to), '2026-03-31');
});

test('quarterBounds returns Q2 (avr-juin) for an April reference date', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 3, 15), 0);
  assert.strictEqual(ymd(from), '2026-04-01');
  assert.strictEqual(ymd(to), '2026-06-30');
});

test('quarterBounds returns Q4 (oct-déc) for a December reference date', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 11, 15), 0);
  assert.strictEqual(ymd(from), '2026-10-01');
  assert.strictEqual(ymd(to), '2026-12-31');
});

test('quarterBounds with offset -1 crosses back into the previous year from Q1', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 0, 15), -1);
  assert.strictEqual(ymd(from), '2025-10-01');
  assert.strictEqual(ymd(to), '2025-12-31');
});

test('quarterBounds with offset -1 stays within the same year from Q2', () => {
  const quarterBounds = loadQuarterBounds();
  const { from, to } = quarterBounds(new Date(2026, 3, 15), -1);
  assert.strictEqual(ymd(from), '2026-01-01');
  assert.strictEqual(ymd(to), '2026-03-31');
});

test('dateRangePreset("quarter") matches quarterBounds(now, 0).from, capped at today', () => {
  const dateRangePreset = loadDateRangePreset();
  const quarterBounds = loadQuarterBounds();
  const now = new Date();
  const expected = quarterBounds(now, 0);
  const { from, to } = dateRangePreset('quarter');
  assert.strictEqual(ymd(from), ymd(expected.from));
  assert.strictEqual(ymd(to), ymd(now));
});

test('dateRangePreset("prevquarter") matches quarterBounds(now, -1) exactly', () => {
  const dateRangePreset = loadDateRangePreset();
  const quarterBounds = loadQuarterBounds();
  const now = new Date();
  const expected = quarterBounds(now, -1);
  const { from, to } = dateRangePreset('prevquarter');
  assert.strictEqual(ymd(from), ymd(expected.from));
  assert.strictEqual(ymd(to), ymd(expected.to));
});

test('DATE_RANGE_CHIPS declares the two quarter chips', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.match(html, /\{\s*key:\s*'quarter',\s*label:\s*'Trimestre en cours'\s*\}/);
  assert.match(html, /\{\s*key:\s*'prevquarter',\s*label:\s*'Trimestre précédent'\s*\}/);
});

test('rangePresetItems() declares the two quarter entries', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.match(html, /label:\s*'Trimestre en cours',\s*from:/);
  assert.match(html, /label:\s*'Trimestre préc\.',\s*from:/);
});
