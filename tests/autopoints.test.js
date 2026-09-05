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

  // Verify rich audit log entries from CRUD
  assert.strictEqual(auditSheet._grid.length, 5); // header + add + toggle + update + delete
  const addLog = auditSheet._grid[1];
  assert.strictEqual(addLog[2], 'Création règle auto');
  assert.strictEqual(addLog[3], 'Règle auto: Alice / Mario Kart');
  assert.strictEqual(addLog[5], 'Alice +10 pts (Mario Kart · daily)');

  const toggleLog = auditSheet._grid[2];
  assert.strictEqual(toggleLog[2], 'Modification règle auto');
  assert.strictEqual(toggleLog[3], 'Règle auto: Alice / Mario Kart');
  assert.strictEqual(toggleLog[4], 'Alice +10 pts (Mario Kart, daily)');
  assert.strictEqual(toggleLog[5], 'Alice +10 pts (Mario Kart, daily) [inactif]');
  assert.strictEqual(toggleLog[6], 'Règle désactivée');

  const delLog = auditSheet._grid[4];
  assert.strictEqual(delLog[2], 'Suppression règle auto');
  assert.strictEqual(delLog[3], 'Règle auto: Alice / Mario Kart');
  assert.strictEqual(delLog[5], 'Supprimé');
});

test('apiRunAutoRulesNow manually executes due rules with complete audit trail', () => {
  const gas = loadGas();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const autoRulesSheet = makeSheet([
    ['Id', 'Player', 'Category', 'Points', 'Description', 'Frequency', 'Interval', 'DaysOfWeek', 'DayOfMonth', 'StartDate', 'NextRun', 'LastRun', 'Active', 'CreatedBy'],
    ['rule-1', 'Alice', 'Mario Kart', 5, 'Daily gift', 'daily', 1, '', '', yesterday, yesterday, '', true, 'Admin']
  ]);
  const historySheet = makeSheet([
    ['Date', 'Player', 'Category', 'Points', 'Description', 'GroupId', 'Saiseur']
  ]);
  const auditSheet = makeSheet([
    ['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail']
  ]);
  const playersSheet = makeSheet([
    ['Name', 'Avatar URL', 'Hex color', 'Password'],
    ['Alice', '', '', ''],
    ['Admin', '', '', '']
  ]);
  const categoriesSheet = makeSheet([
    ['Name'],
    ['Mario Kart']
  ]);

  gas.ConfigService.getSheets = () => ({
    spreadsheet: { insertSheet: () => autoRulesSheet, getSheetByName: (name) => name === 'AutoRules' ? autoRulesSheet : null },
    autoRules: autoRulesSheet,
    history: historySheet,
    auditLog: auditSheet,
    players: playersSheet,
    categories: categoriesSheet
  });
  gas.SettingsService.getEntities = (type) => {
    if (type === 'Players') return [{ name: 'Alice' }, { name: 'Admin' }];
    if (type === 'Categories') return [{ name: 'Mario Kart' }];
    return [];
  };

  const res = gas.apiRunAutoRulesNow('Admin');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.granted, 1);
  assert.strictEqual(res.skipped, 0);
  assert.strictEqual(res.result.granted, 1);
  assert.strictEqual(historySheet._grid.length, 2);
  assert.strictEqual(historySheet._grid[1][1], 'Alice');
  assert.strictEqual(historySheet._grid[1][2], 'Mario Kart');
  assert.strictEqual(historySheet._grid[1][3], 5);

  // Check audit log row
  const logRow = auditSheet._grid[auditSheet._grid.length - 1];
  assert.strictEqual(logRow[1], 'Admin');
  assert.strictEqual(logRow[2], 'Exécution manuelle auto');
  assert.strictEqual(logRow[3], 'AutoRules');
  assert.strictEqual(logRow[5], 'Alice +5 (Mario Kart)');
  assert.match(logRow[6], /1 règle\(s\) exécutée\(s\) \(\+5 pts\)/);
});

test('apiRunAutoRulesNow logs manual check even when zero rules are due', () => {
  const gas = loadGas();
  const autoRulesSheet = makeSheet([
    ['Id', 'Player', 'Category', 'Points', 'Description', 'Frequency', 'Interval', 'DaysOfWeek', 'DayOfMonth', 'StartDate', 'NextRun', 'LastRun', 'Active', 'CreatedBy']
  ]);
  const auditSheet = makeSheet([
    ['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail']
  ]);
  gas.ConfigService.getSheets = () => ({
    spreadsheet: { insertSheet: () => autoRulesSheet, getSheetByName: (name) => name === 'AutoRules' ? autoRulesSheet : null },
    autoRules: autoRulesSheet,
    history: makeSheet([]),
    auditLog: auditSheet,
    players: makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ['Admin', '', '', '']]),
    categories: makeSheet([])
  });
  gas.SettingsService.getEntities = () => [{ name: 'Admin' }];

  const res = gas.apiRunAutoRulesNow('Admin');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.granted, 0);
  assert.strictEqual(res.skipped, 0);
  assert.strictEqual(res.result.granted, 0);

  const logRow = auditSheet._grid[auditSheet._grid.length - 1];
  assert.strictEqual(logRow[1], 'Admin');
  assert.strictEqual(logRow[2], 'Exécution manuelle auto');
  assert.strictEqual(logRow[6], 'Aucune règle due à exécuter');
});

test('runAutoPoints logs trigger errors directly to AuditService on failure', () => {
  const gas = loadGas();
  const auditSheet = makeSheet([
    ['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail']
  ]);
  gas.ConfigService.getSheets = () => ({
    spreadsheet: { insertSheet: () => null, getSheetByName: () => null },
    auditLog: auditSheet
  });
  gas.AutoPointsService.runDue = () => { throw new Error('Lock timeout'); };

  gas.runAutoPoints();

  const logRow = auditSheet._grid[auditSheet._grid.length - 1];
  assert.strictEqual(logRow[1], 'Système');
  assert.strictEqual(logRow[2], 'Erreur exécution auto');
  assert.strictEqual(logRow[3], 'AutoRules');
  assert.match(logRow[6], /Lock timeout/);
});


