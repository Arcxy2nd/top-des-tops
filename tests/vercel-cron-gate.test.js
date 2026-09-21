'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { runAutoPointsIfInstalled } = require('../lib/auto-points-cron');

function fakeRunApi(triggerInstalled, calls) {
  return opts => {
    calls.push(opts.fnName);
    if (opts.fnName === 'apiGetAutoRules') {
      return { value: { success: true, rules: [], triggerInstalled: triggerInstalled } };
    }
    return { value: undefined };
  };
}

test("déclencheur non installé : la tâche planifiée n'exécute pas les points automatiques", () => {
  const calls = [];
  const out = runAutoPointsIfInstalled(fakeRunApi(false, calls), { spreadsheetId: 'S' });
  assert.deepStrictEqual(calls, ['apiGetAutoRules']);
  assert.strictEqual(out.skipped, true);
});

test('déclencheur installé : la tâche planifiée exécute runAutoPoints avec les mêmes options', () => {
  const calls = [];
  const seen = [];
  const runApi = opts => { seen.push(opts); return fakeRunApi(true, calls)(opts); };
  const out = runAutoPointsIfInstalled(runApi, { spreadsheetId: 'S', readOnly: false });
  assert.deepStrictEqual(calls, ['apiGetAutoRules', 'runAutoPoints']);
  assert.strictEqual(out.skipped, false);
  assert.strictEqual(seen[1].spreadsheetId, 'S');
  assert.deepStrictEqual(seen[1].args, []);
});

test("lecture de l'état impossible : on n'exécute pas (un doublon de points coûte plus qu'un jour manqué)", () => {
  const calls = [];
  const runApi = opts => { calls.push(opts.fnName); return { value: { success: false, error: 'boom' } }; };
  const out = runAutoPointsIfInstalled(runApi, { spreadsheetId: 'S' });
  assert.deepStrictEqual(calls, ['apiGetAutoRules']);
  assert.strictEqual(out.skipped, true);
});
