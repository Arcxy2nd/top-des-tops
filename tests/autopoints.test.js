'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness');

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
