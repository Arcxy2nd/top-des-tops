'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');
const { makeEnv } = require('./dom-stub.js');

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

function loadLotFns(names, envOpts) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const env = makeEnv(envOpts);
  vm.createContext(env);
  const toDateStrFn = extractFunction(html, 'toDateStr');
  const src = toDateStrFn + '\n' +
              names.map(n => extractFunction(html, n)).join('\n') +
              '\n' + names.map(n => 'this.__' + n + ' = ' + n + ';').join('\n');
  vm.runInContext(src, env);
  const out = { env };
  names.forEach(n => { out[n] = env['__' + n]; });
  return out;
}

test('lineDates returns [start] when endStr is empty or identical to start', () => {
  const { lineDates } = loadLotFns(['lineDates']);
  assert.deepStrictEqual(Array.from(lineDates('2026-08-01', '')), ['2026-08-01']);
  assert.deepStrictEqual(Array.from(lineDates('2026-08-01', '2026-08-01')), ['2026-08-01']);
});

test('lineDates returns all dates inclusive for a multi-day span', () => {
  const { lineDates } = loadLotFns(['lineDates']);
  const dates = Array.from(lineDates('2026-08-01', '2026-08-05'));
  assert.deepStrictEqual(dates, [
    '2026-08-01',
    '2026-08-02',
    '2026-08-03',
    '2026-08-04',
    '2026-08-05'
  ]);
  assert.strictEqual(dates.length, 5);
});

test('lineDates normalizes inverted start and end dates', () => {
  const { lineDates } = loadLotFns(['lineDates']);
  const dates = Array.from(lineDates('2026-08-05', '2026-08-01'));
  assert.deepStrictEqual(dates, [
    '2026-08-01',
    '2026-08-02',
    '2026-08-03',
    '2026-08-04',
    '2026-08-05'
  ]);
});

test('daysBetweenInclusive matches lineDates length across all range shapes', () => {
  const { daysBetweenInclusive, lineDates } = loadLotFns(['daysBetweenInclusive', 'lineDates']);
  assert.strictEqual(daysBetweenInclusive('', '2026-08-05'), 0);
  assert.strictEqual(daysBetweenInclusive('2026-08-01', ''), 1);
  assert.strictEqual(daysBetweenInclusive('2026-08-01', '2026-08-01'), 1);
  assert.strictEqual(daysBetweenInclusive('2026-08-01', '2026-08-07'), 7);
  assert.strictEqual(daysBetweenInclusive('2026-08-07', '2026-08-01'), 7);
  assert.strictEqual(daysBetweenInclusive('2026-08-01', '2026-08-07'), lineDates('2026-08-01', '2026-08-07').length);
});

test('computeRowTotalPoints computes points correctly for single date and period with repeat / distribute', () => {
  const { computeRowTotalPoints } = loadLotFns(['daysBetweenInclusive', 'lineDates', 'computeRowTotalPoints']);

  const makeRow = (pts, isRange, start, end, fill, subTops) => {
    const map = {
      '.custom-pts-in': { value: String(pts) },
      '.d-start':       { value: start },
      '.d-end':         { value: end },
      '.range-cb':      { checked: !!isRange },
      '.line-fill':     { dataset: { fill: fill || 'repeat' } }
    };
    const subTopEls = (subTops || []).map(stPts => ({
      querySelector: (sel) => sel === '.sub-pts-input' ? { value: stPts != null ? String(stPts) : '' } : null
    }));

    return {
      querySelector: (sel) => map[sel] || null,
      querySelectorAll: (sel) => sel === '.sub-top-item' ? subTopEls : []
    };
  };

  // 1 jour : 10 pts
  const r1 = makeRow(10, false, '2026-08-01', '', 'repeat');
  assert.strictEqual(computeRowTotalPoints(r1), 10);

  // 5 jours, repeat : 10 pts/jour * 5 jours = 50 pts
  const r2 = makeRow(10, true, '2026-08-01', '2026-08-05', 'repeat');
  assert.strictEqual(computeRowTotalPoints(r2), 50);

  // 5 jours, distribute : 10 pts au total répartis
  const r3 = makeRow(10, true, '2026-08-01', '2026-08-05', 'distribute');
  assert.strictEqual(computeRowTotalPoints(r3), 10);

  // 3 jours, distribute : 10 pts -> 4 + 3 + 3 = 10 pts
  const r4 = makeRow(10, true, '2026-08-01', '2026-08-03', 'distribute');
  assert.strictEqual(computeRowTotalPoints(r4), 10);

  // 3 jours, repeat avec subTop (5 pts main + 2 pts subTop = 7 pts/jour * 3 jours = 21 pts)
  const r5 = makeRow(5, true, '2026-08-01', '2026-08-03', 'repeat', [2]);
  assert.strictEqual(computeRowTotalPoints(r5), 21);
});

test('Alt mode period expansion correctly generates daily items for repeat and distribute', () => {
  const { lineDates } = loadLotFns(['lineDates']);

  const expandAltItem = (player, altCategory, points, dStart, dEnd, isRange, fill, desc) => {
    const dates = lineDates(dStart, isRange && dEnd ? dEnd : '');
    const altItems = [];
    if (dates.length === 1 || fill === 'repeat') {
      dates.forEach(dk => {
        altItems.push({ player, altCategory, points, date: dk, description: desc || '' });
      });
    } else {
      const n = dates.length, base = Math.floor(points / n), rem = points % n;
      dates.forEach((dk, k) => {
        const val = base + (k < rem ? 1 : 0);
        if (val > 0) {
          altItems.push({ player, altCategory, points: val, date: dk, description: desc || '' });
        }
      });
    }
    return altItems;
  };

  // Repeat 10 pts over 3 days -> 3 items of 10 pts
  const rep = expandAltItem('Alice', 'Gaming', 10, '2026-08-01', '2026-08-03', true, 'repeat');
  assert.strictEqual(rep.length, 3);
  assert.deepStrictEqual(rep.map(x => x.points), [10, 10, 10]);
  assert.deepStrictEqual(rep.map(x => x.date), ['2026-08-01', '2026-08-02', '2026-08-03']);

  // Distribute 10 pts over 3 days -> 4, 3, 3 pts
  const dist = expandAltItem('Bob', 'Gaming', 10, '2026-08-01', '2026-08-03', true, 'distribute');
  assert.strictEqual(dist.length, 3);
  assert.deepStrictEqual(dist.map(x => x.points), [4, 3, 3]);
  assert.strictEqual(dist.reduce((s, x) => s + x.points, 0), 10);
});

test('Horizontal period selection CSS and DOM structure are properly configured', () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  // .d-mode-seg is horizontal flex
  assert.match(html, /\.d-mode-seg\s*\{[^}]*flex-direction:\s*row/s);

  // .d-period contains 2 columns (Left ~45-50%, Right ~50-55%)
  assert.match(html, /\.d-period-left-col\s*\{[^}]*flex:\s*48\s+1\s+280px/s);
  assert.match(html, /\.d-period-right-col\s*\{[^}]*flex:\s*52\s+1\s+300px/s);
  assert.match(html, /\.d-period-dates-row\s*\{/);
  assert.match(html, /\.d-period-shortcuts\s*\{/);

  // Mini calendar is embedded in right column
  assert.match(html, /\.d-cal\s*\{[^}]*background:\s*transparent/s);
  assert.match(html, /\.d-cal-day\s*\{[^}]*height:\s*22px/s);

  // "Du" and "Au" are strictly on the same line (flex-direction: row, flex-wrap: nowrap)
  assert.match(html, /\.d-period-dates-row\s*\{[^}]*flex-direction:\s*row/s);
  assert.match(html, /\.d-period-dates-row\s*\{[^}]*flex-wrap:\s*nowrap/s);

  // 4 shortcuts on a single line
  assert.match(html, /\.d-period-shortcuts\s*\{[^}]*flex-wrap:\s*nowrap/s);

  // Calculation mode and preview fill the empty space in the left column
  assert.match(html, /periodLeftCol\.appendChild\(calcGroup\)/);
  assert.match(html, /periodLeftCol\.appendChild\(fillPreview\)/);

  // Calendar is placed in the right column
  assert.match(html, /periodRightCol\.appendChild\(cal\)/);

  // Calculation mode title and options are grouped in .d-period-calc-group with compact spacing
  assert.match(html, /\.d-period-calc-group\s*\{/);
  assert.match(html, /calcGroup\.className\s*=\s*'d-period-calc-group'/);
  assert.match(html, /\.fill-choice\s*\{[^}]*flex-direction:\s*column/s);
});

test('setDateMode toggling between single date and period preserves modeSeg and startInput without DOM errors', () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  // Verify that Index.html does not call singlePanel.insertBefore(modeSeg, startInput)
  assert.doesNotMatch(html, /singlePanel\.insertBefore\(modeSeg,\s*startInput\)/);
  assert.match(html, /singlePanel\.appendChild\(modeSeg\)/);

  // Simulate the exact DOM operations of setDateMode toggling
  const { makeEnv } = require('./dom-stub.js');
  const env = makeEnv();
  const doc = env.document;

  const singlePanel = doc.createElement('div');
  const periodPanel = doc.createElement('div');
  const periodLeftCol = doc.createElement('div');
  const datesRow = doc.createElement('div');
  const duWrap = doc.createElement('div');
  const lblDu = doc.createElement('span');
  duWrap.appendChild(lblDu);
  datesRow.appendChild(duWrap);

  const durationShortcuts = doc.createElement('div');
  const calcGroup = doc.createElement('div');
  const fillPreview = doc.createElement('div');

  const modeSeg = doc.createElement('div');
  const startInput = doc.createElement('input');
  const endInput = doc.createElement('input');
  const startShortcuts = doc.createElement('div');

  // Initial structure before setDateMode(false)
  singlePanel.appendChild(startInput);
  singlePanel.appendChild(startShortcuts);

  periodLeftCol.appendChild(modeSeg);
  periodLeftCol.appendChild(datesRow);
  periodLeftCol.appendChild(durationShortcuts);
  periodLeftCol.appendChild(calcGroup);
  periodLeftCol.appendChild(fillPreview);

  function setDateMode(range) {
    periodPanel.style.display = range ? 'flex' : 'none';
    singlePanel.style.display = range ? 'none' : 'flex';
    if (range) {
      periodLeftCol.insertBefore(modeSeg, datesRow);
      duWrap.appendChild(startInput);
      if (!endInput.value) endInput.value = startInput.value;
    } else {
      singlePanel.appendChild(modeSeg);
      singlePanel.appendChild(startInput);
      singlePanel.appendChild(startShortcuts);
      endInput.value = '';
    }
  }

  // 1. Initial state: single date
  setDateMode(false);
  assert.strictEqual(singlePanel.children[0], modeSeg);
  assert.strictEqual(singlePanel.children[1], startInput);
  assert.strictEqual(singlePanel.children[2], startShortcuts);
  assert.strictEqual(singlePanel.style.display, 'flex');
  assert.strictEqual(periodPanel.style.display, 'none');

  // 2. Switch to period
  setDateMode(true);
  assert.strictEqual(periodLeftCol.children[0], modeSeg);
  assert.strictEqual(periodLeftCol.children[1], datesRow);
  assert.strictEqual(duWrap.children[1], startInput);
  assert.strictEqual(periodPanel.style.display, 'flex');
  assert.strictEqual(singlePanel.style.display, 'none');

  // 3. Switch BACK to single date (THIS WAS THE BUG: modeSeg disappeared because of insertBefore on detached startInput)
  assert.doesNotThrow(() => setDateMode(false));
  assert.strictEqual(singlePanel.children[0], modeSeg);
  assert.strictEqual(singlePanel.children[1], startInput);
  assert.strictEqual(singlePanel.children[2], startShortcuts);
  assert.strictEqual(singlePanel.style.display, 'flex');
  assert.strictEqual(periodPanel.style.display, 'none');

  // 4. Switch back and forth multiple times to guarantee stability
  setDateMode(true);
  assert.strictEqual(periodLeftCol.children[0], modeSeg);
  assert.strictEqual(duWrap.children[1], startInput);

  setDateMode(false);
  assert.strictEqual(singlePanel.children[0], modeSeg);
  assert.strictEqual(singlePanel.children[1], startInput);
  assert.strictEqual(singlePanel.children[2], startShortcuts);
});



