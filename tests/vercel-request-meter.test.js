'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { meterSyncFetch } = require('../lib/gas-runtime/request-meter');

const ok = { status: 200, body: '{}' };

test('classe lectures, écritures Sheets et requêtes Drive', () => {
  const m = meterSyncFetch(() => ok, { sleep: () => {} });
  m.syncFetch('https://sheets.googleapis.com/v4/spreadsheets/X?fields=a', { method: 'GET' });
  m.syncFetch('https://sheets.googleapis.com/v4/spreadsheets/X:batchUpdate', { method: 'POST' });
  m.syncFetch('https://sheets.googleapis.com/v4/spreadsheets/X/values/A1', { method: 'PUT' });
  m.syncFetch('https://www.googleapis.com/drive/v3/files/X?fields=version', {});
  assert.deepStrictEqual(m.counts(), { sheetsReads: 1, sheetsWrites: 2, drive: 1 });
});

test('429 puis 200 : réessai transparent, compté une fois de plus', () => {
  const replies = [{ status: 429, body: '' }, ok];
  const waits = [];
  const m = meterSyncFetch(() => replies.shift(), { sleep: ms => waits.push(ms) });
  const res = m.syncFetch('https://sheets.googleapis.com/v4/spreadsheets/X', { method: 'GET' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(waits.length, 1);
  assert.strictEqual(m.counts().sheetsReads, 2);
});

test('429 persistant : rend le dernier 429 après 3 réessais', () => {
  const m = meterSyncFetch(() => ({ status: 429, body: '' }), { sleep: () => {} });
  const res = m.syncFetch('https://sheets.googleapis.com/v4/spreadsheets/X', { method: 'GET' });
  assert.strictEqual(res.status, 429);
  assert.strictEqual(m.counts().sheetsReads, 4);
});
