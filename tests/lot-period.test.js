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
  const { computeRowTotalPoints } = loadLotFns(['daysBetweenInclusive', 'lineDates', 'computeMinDayCount', 'pickSpreadDates', 'applyMinPerDaySpread', 'computeRowTotalPoints']);

  const makeRow = (pts, isRange, start, end, fill, subTops) => {
    const map = {
      '.custom-pts-in': { value: String(pts) },
      '.d-start':       { value: start },
      '.d-end':         { value: end },
      '.range-cb':      { checked: !!isRange },
      '.line-fill':     { dataset: { fill: fill || 'distribute' } }
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

  // 5 jours, défaut (distribute) : 10 pts au total répartis
  const rDef = makeRow(10, true, '2026-08-01', '2026-08-05');
  assert.strictEqual(computeRowTotalPoints(rDef), 10);

  // 5 jours, repeat explicite : 10 pts/jour * 5 jours = 50 pts
  const r2 = makeRow(10, true, '2026-08-01', '2026-08-05', 'repeat');
  assert.strictEqual(computeRowTotalPoints(r2), 50);

  // 5 jours, distribute explicite : 10 pts au total répartis
  const r3 = makeRow(10, true, '2026-08-01', '2026-08-05', 'distribute');
  assert.strictEqual(computeRowTotalPoints(r3), 10);

  // 3 jours, distribute : 10 pts -> 4 + 3 + 3 = 10 pts
  const r4 = makeRow(10, true, '2026-08-01', '2026-08-03', 'distribute');
  assert.strictEqual(computeRowTotalPoints(r4), 10);

  // 3 jours, repeat avec subTop (5 pts main + 2 pts subTop = 7 pts/jour * 3 jours = 21 pts)
  const r5 = makeRow(5, true, '2026-08-01', '2026-08-03', 'repeat', [2]);
  assert.strictEqual(computeRowTotalPoints(r5), 21);

  // 5 jours, distribute avec subTop (5 pts main + 3 pts subTop = 8 pts total répartis)
  const r6 = makeRow(5, true, '2026-08-01', '2026-08-05', 'distribute', [3]);
  assert.strictEqual(computeRowTotalPoints(r6), 8);

  // 5 jours, distribute avec subTop sans points explicites (hérite des 5 pts main = 10 pts total)
  const r7 = makeRow(5, true, '2026-08-01', '2026-08-05', 'distribute', [null]);
  assert.strictEqual(computeRowTotalPoints(r7), 10);
});

test('expandRowToDayEntries correctly distributes or repeats sub-tops across dates', () => {
  const { lineDates, expandRowToDayEntries } = loadLotFns(['lineDates', 'expandRowToDayEntries']);

  const dates5 = lineDates('2026-08-01', '2026-08-05'); // 5 dates

  // 5 jours, distribute : 5 pts main + 3 pts subTop -> 5 pts main (1 pt/j) + 3 pts subTop (1 pt sur 3 jours)
  const itemDist = {
    player: 'Alice', category: 'Gaming', points: 5, times: 1, fill: 'distribute',
    description: 'Test distribute', subTops: [{ category: 'Sport', points: 3 }]
  };
  const entriesDist = expandRowToDayEntries(itemDist, dates5);
  assert.strictEqual(entriesDist.length, 5);

  let totalMain = 0;
  let totalSub = 0;
  entriesDist.forEach((d, idx) => {
    totalMain += d.entry.points;
    (d.entry.subTops || []).forEach(st => {
      assert.strictEqual(st.category, 'Sport');
      totalSub += st.points;
      assert.strictEqual(st.points, 1);
    });
    if (idx < 3) {
      assert.strictEqual(d.entry.subTops.length, 1);
    } else {
      assert.strictEqual(d.entry.subTops.length, 0);
    }
  });
  assert.strictEqual(totalMain, 5);
  assert.strictEqual(totalSub, 3);
  assert.strictEqual(totalMain + totalSub, 8);

  // 5 jours, repeat : 5 pts main + 3 pts subTop -> 25 pts main + 15 pts subTop = 40 pts
  const itemRep = {
    player: 'Alice', category: 'Gaming', points: 5, times: 1, fill: 'repeat',
    description: 'Test repeat', subTops: [{ category: 'Sport', points: 3 }]
  };
  const entriesRep = expandRowToDayEntries(itemRep, dates5);
  assert.strictEqual(entriesRep.length, 5);
  let totalRepMain = 0;
  let totalRepSub = 0;
  entriesRep.forEach(d => {
    totalRepMain += d.entry.points;
    (d.entry.subTops || []).forEach(st => { totalRepSub += st.points; });
  });
  assert.strictEqual(totalRepMain, 25);
  assert.strictEqual(totalRepSub, 15);
  assert.strictEqual(totalRepMain + totalRepSub, 40);
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

test('durationShortcuts are retrospective (-3j, -7j, -14j, -1 mois) and calculate start backward from end', () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  // Verify that Index.html has retrospective shortcuts and no forward shortcuts
  assert.doesNotMatch(html, /'\+3 j'/);
  assert.match(html, /'-3 j'/);
  assert.match(html, /'-7 j'/);
  assert.match(html, /'-14 j'/);
  assert.match(html, /'-1 mois'/);

  const { makeEnv } = require('./dom-stub.js');
  const env = makeEnv();
  const doc = env.document;

  const startInput = doc.createElement('input');
  const endInput = doc.createElement('input');
  startInput.value = '2026-09-13';
  endInput.value = '2026-09-13';

  // Load toDateStr & daysBetweenInclusive from Index.html
  const { toDateStr, daysBetweenInclusive } = (() => {
    function extractFunction(source, name) {
      const start = source.indexOf('function ' + name + '(');
      assert.notStrictEqual(start, -1, name + ' introuvable dans Index.html');
      let depth = 0, i = source.indexOf('{', start);
      const open = i;
      for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) break; }
      }
      return source.slice(start, i + 1);
    }
    return {
      toDateStr: new Function('d', extractFunction(html, 'toDateStr') + '; return toDateStr(d);'),
      daysBetweenInclusive: new Function('a', 'b', extractFunction(html, 'daysBetweenInclusive') + '; return daysBetweenInclusive(a, b);')
    };
  })();

  const shortcuts = [['-3 j', 3], ['-7 j', 7], ['-14 j', 14], ['-1 mois', 30]];
  const handlers = {};

  shortcuts.forEach(([label, n]) => {
    handlers[label] = () => {
      const anchor = endInput.value || startInput.value || '2026-09-13';
      endInput.value = anchor;
      const dt = new Date(anchor + 'T12:00:00');
      dt.setDate(dt.getDate() - (n - 1));
      startInput.value = toDateStr(dt);
    };
  });

  // Test -3 j
  handlers['-3 j']();
  assert.strictEqual(endInput.value, '2026-09-13');
  assert.strictEqual(startInput.value, '2026-09-11');
  assert.strictEqual(daysBetweenInclusive(startInput.value, endInput.value), 3);

  // Test -7 j
  handlers['-7 j']();
  assert.strictEqual(endInput.value, '2026-09-13');
  assert.strictEqual(startInput.value, '2026-09-07');
  assert.strictEqual(daysBetweenInclusive(startInput.value, endInput.value), 7);

  // Test -14 j
  handlers['-14 j']();
  assert.strictEqual(endInput.value, '2026-09-13');
  assert.strictEqual(startInput.value, '2026-08-31');
  assert.strictEqual(daysBetweenInclusive(startInput.value, endInput.value), 14);

  // Test -1 mois (30 jours)
  handlers['-1 mois']();
  assert.strictEqual(endInput.value, '2026-09-13');
  assert.strictEqual(startInput.value, '2026-08-15');
  assert.strictEqual(daysBetweenInclusive(startInput.value, endInput.value), 30);
});

test('createFillToggle defaults to distribute and places "Un total à répartir" as first option', () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  // Verify createFillToggle source in Index.html
  assert.match(html, /wrap\.dataset\.fill = defaultMode \|\| 'distribute'/);
  assert.match(html, /\[\s*'distribute',\s*'Un total à répartir'\s*\]/);

  const { makeEnv } = require('./dom-stub.js');
  const env = makeEnv();
  const doc = env.document;

  function createFillToggle(defaultMode) {
    const wrap = doc.createElement('div');
    wrap.className = 'seg-toggle line-fill fill-choice';
    wrap.dataset.fill = defaultMode || 'distribute';
    [
      ['distribute', 'Un total à répartir'],
      ['repeat',     'Le même score chaque jour']
    ].forEach(([val, label]) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn fill-opt' + (val === wrap.dataset.fill ? ' active' : '');
      b.dataset.fill = val;
      b.textContent = label;
      wrap.appendChild(b);
    });
    return wrap;
  }

  const toggle = createFillToggle();
  assert.strictEqual(toggle.dataset.fill, 'distribute');
  assert.strictEqual(toggle.children.length, 2);
  assert.strictEqual(toggle.children[0].dataset.fill, 'distribute');
  assert.strictEqual(toggle.children[0].textContent, 'Un total à répartir');
  assert.ok(toggle.children[0].className.includes('active'));
  assert.strictEqual(toggle.children[1].dataset.fill, 'repeat');
  assert.ok(!toggle.children[1].className.includes('active'));
});

test('computeMinDayCount returns n=null when the constraint is inactive', () => {
  const { computeMinDayCount } = loadLotFns(['computeMinDayCount']);
  // Spread dans un objet littéral du contexte principal avant comparaison :
  // computeMinDayCount() tourne dans le VM realm du harness, dont le
  // Object.prototype diffère de celui du contexte principal — un
  // deepStrictEqual direct échoue sur cette identité de prototype cross-realm
  // même à structure égale. Le spread recrée un objet plain avec le
  // prototype du contexte principal et restaure une vraie égalité structurelle.
  assert.deepStrictEqual({ ...computeMinDayCount(100, 0) }, { n: null, reachable: true });
  assert.deepStrictEqual({ ...computeMinDayCount(100, '') }, { n: null, reachable: true });
  assert.deepStrictEqual({ ...computeMinDayCount(0, 20) }, { n: null, reachable: true });
});

test('computeMinDayCount computes the max day count keeping each day >= minimum', () => {
  const { computeMinDayCount } = loadLotFns(['computeMinDayCount']);
  assert.deepStrictEqual({ ...computeMinDayCount(100, 20) }, { n: 5, reachable: true });
  assert.deepStrictEqual({ ...computeMinDayCount(95, 20) }, { n: 4, reachable: true });
  assert.deepStrictEqual({ ...computeMinDayCount(21, 20) }, { n: 1, reachable: true });
  assert.deepStrictEqual({ ...computeMinDayCount(40, 20) }, { n: 2, reachable: true });
});

test('computeMinDayCount flags the minimum as unreachable when total < minimum', () => {
  const { computeMinDayCount } = loadLotFns(['computeMinDayCount']);
  assert.deepStrictEqual({ ...computeMinDayCount(15, 20) }, { n: 1, reachable: false });
});

test('pickSpreadDates returns the full array unchanged when n covers every day', () => {
  const { pickSpreadDates, lineDates } = loadLotFns(['pickSpreadDates', 'lineDates']);
  const dates = Array.from(lineDates('2026-08-01', '2026-08-05'));
  assert.deepStrictEqual(Array.from(pickSpreadDates(dates, 5)), dates);
  assert.deepStrictEqual(Array.from(pickSpreadDates(dates, 9)), dates);
});

test('pickSpreadDates with n=1 returns the last date (Au, the retrospective pivot), not the first', () => {
  const { pickSpreadDates, lineDates } = loadLotFns(['pickSpreadDates', 'lineDates']);
  const dates = Array.from(lineDates('2026-08-01', '2026-08-05'));
  assert.deepStrictEqual(Array.from(pickSpreadDates(dates, 1)), ['2026-08-05']);
});

test('pickSpreadDates spreads n dates across the full range instead of clustering at the start', () => {
  const { pickSpreadDates, lineDates } = loadLotFns(['pickSpreadDates', 'lineDates']);
  // 90 jours (2026-01-01 -> 2026-03-31), 3 entrées : premier jour, milieu, dernier jour —
  // jamais 3 jours consécutifs au début ou à la fin de la plage.
  const dates = Array.from(lineDates('2026-01-01', '2026-03-31'));
  assert.strictEqual(dates.length, 90);
  const picked = Array.from(pickSpreadDates(dates, 3));
  assert.deepStrictEqual(picked, ['2026-01-01', '2026-02-15', '2026-03-31']);
});

test('applyMinPerDaySpread leaves dates untouched outside distribute mode, on a single day, or with no minimum set', () => {
  const { applyMinPerDaySpread, lineDates } = loadLotFns(['applyMinPerDaySpread', 'computeMinDayCount', 'pickSpreadDates', 'lineDates']);
  const dates = Array.from(lineDates('2026-01-01', '2026-03-31'));
  assert.deepStrictEqual(Array.from(applyMinPerDaySpread(dates, 'repeat', 30, 10)), dates);
  assert.deepStrictEqual(Array.from(applyMinPerDaySpread(['2026-01-01'], 'distribute', 30, 10)), ['2026-01-01']);
  assert.deepStrictEqual(Array.from(applyMinPerDaySpread(dates, 'distribute', 30, 0)), dates);
  assert.deepStrictEqual(Array.from(applyMinPerDaySpread(dates, 'distribute', 30, '')), dates);
});

test('applyMinPerDaySpread reproduces the reported bug fix: 30 pts, min 10, 3-month range spreads 3 entries instead of clamping to 3 consecutive days', () => {
  const { applyMinPerDaySpread, lineDates, daysBetweenInclusive } = loadLotFns(['applyMinPerDaySpread', 'computeMinDayCount', 'pickSpreadDates', 'lineDates', 'daysBetweenInclusive']);
  const dates = Array.from(lineDates('2026-01-01', '2026-03-31'));
  const picked = Array.from(applyMinPerDaySpread(dates, 'distribute', 30, 10));
  assert.strictEqual(picked.length, 3);
  assert.deepStrictEqual(picked, ['2026-01-01', '2026-02-15', '2026-03-31']);
  // Du/Au eux-mêmes ne bougent pas : la plage entière reste sélectionnée, seules
  // les entrées effectivement créées sont réparties dedans.
  assert.strictEqual(daysBetweenInclusive('2026-01-01', '2026-03-31'), 90);
});

test('Minimum per day field exists, is wired to computeMinDayCount/applyMinPerDaySpread, and propagates on row duplication', () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  // Le wrapper et l'input existent avec les bonnes classes
  assert.match(html, /minPerDayWrap\.className\s*=\s*'d-min-per-day-wrap'/);
  assert.match(html, /minPerDayInput\.className\s*=\s*'d-min-per-day'/);

  // Le champ n'est visible qu'en mode distribute : un helper centralise le calcul
  // (évite le désync repéré en revue finale entre bascule manuelle et __applyDate groupé)
  assert.match(html, /function syncMinPerDayVisibility\(\)\s*\{\s*\n\s*minPerDayWrap\.style\.display\s*=\s*fillToggle\.dataset\.fill === 'distribute' \? 'flex' : 'none';\s*\n\s*\}/);
  // Appelé à la construction initiale
  assert.match(html, /\}\);\s*\n\s*syncMinPerDayVisibility\(\);\s*\n\s*minPerDayInput\.addEventListener/);
  // Appelé dans l'onChange du fillToggle
  assert.match(html, /createFillToggle\(\(preset && preset\.fill\) \|\| defFill, \(\) => \{\s*\n\s*syncMinPerDayVisibility\(\);/);
  // Appelé dans __applyDate (bascule groupée "Appliquer à toutes les lignes")
  assert.match(html, /div\.__applyDate = \(start, end, fill\) => \{[\s\S]*?setLineFill\(fillToggle, fill\);\s*\n\s*syncMinPerDayVisibility\(\);/);

  // updateDatePreview() consulte computeMinDayCount() ; Du/Au ne sont plus resserrés
  assert.match(html, /computeMinDayCount\(pts,\s*minPerDayInput\.value\)/);
  assert.doesNotMatch(html, /clampStartForMinDays/);

  // La soumission applique le même minimum/jour que l'aperçu, sur les 3 chemins
  // d'expansion date→points (résumé de ligne, lot principal, Tops Alternatifs)
  assert.match(html, /applyMinPerDaySpread\(rawDates, fill, points, minPerDayEl \? minPerDayEl\.value : ''\)/);
  assert.match(html, /applyMinPerDaySpread\(rawDates, fill, pts, minPerDayEl \? minPerDayEl\.value : ''\)/);
  assert.match(html, /applyMinPerDaySpread\(dates, it\.fill, itTotal, it\.minPerDay\)/);

  // La duplication de ligne propage le minimum comme elle propage fill/dateEnd
  assert.match(html, /minPerDay:\s*minPerDayInput\.value/);
  assert.match(html, /minPerDayInput\.value\s*=\s*\(preset && preset\.minPerDay\)\s*\?\s*String\(preset\.minPerDay\)\s*:\s*''/);
  // ... et jusqu'à la soumission du lot principal (items.push)
  assert.match(html, /minPerDay:\s*minPerDayEl \? minPerDayEl\.value : ''/);

  // CSS de l'avertissement "minimum non atteint"
  assert.match(html, /\.d-fill-preview\.warn\s*\{/);
});
