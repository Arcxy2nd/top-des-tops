'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

test('apiGetAutoRules surfaces the trigger permission error instead of masking it', () => {
  const gas = loadGas();
  gas.AutoPointsService.getRules = () => [];
  gas.AutoPointsService.isTriggerInstalled = () => {
    throw new Error('Vous n\'êtes pas autorisé à appeler ScriptApp.getProjectTriggers.');
  };

  const res = gas.apiGetAutoRules();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.triggerInstalled, false);
  assert.match(res.triggerError, /ScriptApp\.getProjectTriggers/);
});

test('apiGetAutoRules reports triggerInstalled=true with no error when authorized', () => {
  const gas = loadGas();
  gas.AutoPointsService.getRules = () => [];
  gas.AutoPointsService.isTriggerInstalled = () => true;

  const res = gas.apiGetAutoRules();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.triggerInstalled, true);
  assert.strictEqual(res.triggerError, '');
});

test('AutoRules CRUD operations work seamlessly with safe date formatting and active toggling', () => {
  const gas = loadGas();
  
  const autoRulesSheet = makeSheet([
    ['Id', 'Player', 'Category', 'Points', 'Description', 'Frequency', 'Interval', 'DaysOfWeek', 'DayOfMonth', 'StartDate', 'NextRun', 'LastRun', 'Active', 'CreatedBy']
  ]);
  const auditSheet = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail']]);

  gas.ConfigService.getSheets = () => ({
    spreadsheet: {
      insertSheet: () => autoRulesSheet,
      getSheetByName: (name) => name === 'AutoRules' ? autoRulesSheet : null
    },
    autoRules: autoRulesSheet,
    auditLog: auditSheet,
    players: makeSheet([['Name'], ['Alice']]),
    categories: makeSheet([['Name'], ['Mario Kart']])
  });
  gas.ConfigService.clearCache = () => {};

  // Seed mock player and category for validation
  gas.SettingsService.getEntities = (type) => {
    if (type === 'Players') return [{ name: 'Alice' }];
    if (type === 'Categories') return [{ name: 'Mario Kart' }];
    return [];
  };
  gas.AutoPointsService.isTriggerInstalled = () => true;

  // Add rule
  const addRes = gas.apiAddAutoRule({
    player: 'Alice',
    category: 'Mario Kart',
    points: 10,
    frequency: 'daily',
    interval: 1,
    description: 'Bonus quotidien',
    startDate: '2026-08-01'
  }, 'Alice');

  assert.strictEqual(addRes.success, true);
  const ruleId = addRes.rule.id;
  assert.ok(ruleId.length > 0);
  assert.strictEqual(addRes.rule.active, true);
  assert.strictEqual(typeof addRes.rule.nextRun, 'string');

  // List rules
  const listRes = gas.apiGetAutoRules();
  assert.strictEqual(listRes.success, true);
  assert.strictEqual(listRes.rules.length, 1);
  assert.strictEqual(listRes.rules[0].id, ruleId);

  // Toggle active status
  const toggleRes = gas.apiUpdateAutoRule(ruleId, { active: false }, 'Alice');
  assert.strictEqual(toggleRes.success, true);
  assert.strictEqual(toggleRes.rule.active, false);

  // Partial update schedule to weekly with daysOfWeek
  const updateRes = gas.apiUpdateAutoRule(ruleId, {
    frequency: 'weekly',
    interval: 2,
    daysOfWeek: [1, 4]
  }, 'Alice');
  assert.strictEqual(updateRes.success, true);
  assert.strictEqual(updateRes.rule.frequency, 'weekly');
  assert.strictEqual(updateRes.rule.interval, 2);
  assert.deepEqual(updateRes.rule.daysOfWeek, [1, 4]);

  // Delete rule
  const delRes = gas.apiDeleteAutoRule(ruleId, 'Alice');
  assert.strictEqual(delRes.success, true);

  const afterDelRes = gas.apiGetAutoRules();
  assert.strictEqual(afterDelRes.rules.length, 0);
});

