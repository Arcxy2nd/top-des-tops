'use strict';

const { createTriggerService, TRIGGER_FLAG_KEY, TRIGGER_HANDLER } = require('../lib/gas-runtime/trigger-flag');
const test = require('node:test');
const assert = require('node:assert');

function fakeStore(initial) {
  const values = Object.assign({}, initial);
  return {
    values,
    getProperty: k => (Object.prototype.hasOwnProperty.call(values, k) ? values[k] : null),
    setProperty(k, v) { values[k] = String(v); return this; },
    deleteProperty(k) { delete values[k]; return this; }
  };
}

test('sans drapeau, aucun déclencheur n\'est installé', () => {
  const svc = createTriggerService(fakeStore({}));
  assert.deepStrictEqual(svc.getProjectTriggers(), []);
});

test('create() pose le drapeau et le déclencheur devient visible', () => {
  const store = fakeStore({});
  const svc = createTriggerService(store);
  svc.newTrigger(TRIGGER_HANDLER).timeBased().everyHours(1).create();
  assert.strictEqual(store.values[TRIGGER_FLAG_KEY], '1');
  const triggers = svc.getProjectTriggers();
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].getHandlerFunction(), TRIGGER_HANDLER);
});

test('deleteTrigger retire le drapeau', () => {
  const store = fakeStore({ [TRIGGER_FLAG_KEY]: '1' });
  const svc = createTriggerService(store);
  svc.deleteTrigger(svc.getProjectTriggers()[0]);
  assert.strictEqual(svc.getProjectTriggers().length, 0);
});

test('un autre handler que runAutoPoints est refusé (erreur explicite, pas un drapeau muet)', () => {
  const svc = createTriggerService(fakeStore({}));
  assert.throws(() => svc.newTrigger('autreFonction').timeBased().everyHours(1).create(), /autreFonction/);
});

test('poser deux fois le déclencheur reste idempotent', () => {
  const store = fakeStore({});
  const svc = createTriggerService(store);
  svc.newTrigger(TRIGGER_HANDLER).timeBased().everyHours(1).create();
  svc.newTrigger(TRIGGER_HANDLER).timeBased().everyHours(1).create();
  assert.strictEqual(svc.getProjectTriggers().length, 1);
});
