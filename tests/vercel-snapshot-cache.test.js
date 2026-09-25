'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { runApi } = require('../lib/gas-runtime/runtime');
const snapshotCache = require('../lib/gas-runtime/snapshot-cache');
const { buildSheets } = require('./frontend/fixtures.js');
const { makeFakeSheetsApi, fixtureGrids } = require('./helpers/fake-sheets-api');

// Cache du classeur dans l'instance chaude (plan 2026-09-25, phase 3) :
// faux Sheets + faux Drive minimal qui ne sert que la version du fichier.
const SCRIPT_ID = 'MOCK_SCRIPT_ID_12345';
const SHEET_ID = 'SHEET_CACHE';

function makeWorldWithDrive(options) {
  const sheets = makeFakeSheetsApi(fixtureGrids(buildSheets()));
  const drive = { version: 1, disabled: Boolean(options && options.driveDisabled), calls: 0 };
  function syncFetch(url, init) {
    if (String(url).indexOf('googleapis.com/drive/v3/files/') !== -1) {
      drive.calls++;
      if (drive.disabled) return { status: 403, body: '{"error":{"code":403}}' };
      return { status: 200, body: JSON.stringify({ version: String(drive.version) }) };
    }
    const res = sheets.syncFetch(url, init);
    if (/:batchUpdate$/.test(url)) drive.version++; // toute écriture Sheets change la version du fichier
    return res;
  }
  return { sheets, drive, syncFetch };
}

function call(world, fnName, args, now) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return runApi({ fnName, args: args || [], spreadsheetId: SHEET_ID, accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: world.syncFetch, now });
  } finally {
    console.warn = warn;
  }
}

test.beforeEach(() => snapshotCache.clear());

test('deux lectures sans changement : la 2e coûte 0 lecture Sheets et 1 requête Drive', () => {
  const world = makeWorldWithDrive();
  const first = call(world, 'apiGetAllNotes');
  assert.strictEqual(first.meter.sheetsReads, 1);
  const second = call(world, 'apiGetAllNotes');
  assert.strictEqual(second.meter.sheetsReads, 0);
  assert.strictEqual(second.meter.drive, 1);
  assert.deepStrictEqual(second.value, first.value);
});

test('écriture puis lecture dans la même instance : 0 lecture, la note est visible', () => {
  const world = makeWorldWithDrive();
  call(world, 'apiGetAllNotes');
  const w = call(world, 'apiAddNote', ['Safir', 'Note en cache', '', 'Safir', '']);
  assert.strictEqual(w.value.success, true);
  const r = call(world, 'apiGetAllNotes');
  assert.strictEqual(r.meter.sheetsReads, 0);
  assert.ok(r.value.notes.some(n => n.text === 'Note en cache' && n.player === 'Safir'));
});

test('la date d\'une note écrite puis relue depuis le cache est un Date du bon jour', () => {
  const world = makeWorldWithDrive();
  call(world, 'apiGetAllNotes');
  call(world, 'apiAddNote', ['Safir', 'Note datée', '', 'Safir', '']);
  const cached = call(world, 'apiGetAllNotes');
  assert.strictEqual(cached.meter.sheetsReads, 0);
  // Référence : la même lecture sur le classeur (cache vidé).
  snapshotCache.clear();
  const fresh = call(world, 'apiGetAllNotes');
  assert.strictEqual(fresh.meter.sheetsReads, 1);
  const pick = out => out.value.notes.find(n => n.text === 'Note datée');
  assert.ok(pick(cached).timestamp, 'date présente');
  assert.strictEqual(pick(cached).timestamp, pick(fresh).timestamp);
  assert.ok(!Number.isNaN(new Date(pick(cached).timestamp).getTime()));
});

test('modification manuelle (version Drive changée) : relue en 1 lecture et visible', () => {
  const world = makeWorldWithDrive();
  call(world, 'apiGetAllNotes');
  world.sheets.grids.Notes.push(['2026-08-02', 'Alik', 'Saisie à la main']);
  world.drive.version++;
  const r = call(world, 'apiGetAllNotes');
  assert.strictEqual(r.meter.sheetsReads, 1);
  assert.ok(r.value.notes.some(n => n.text === 'Saisie à la main'));
});

test('Drive en 403 : chaque appel retombe à 1 lecture, sans erreur, au plus un avertissement', () => {
  const world = makeWorldWithDrive({ driveDisabled: true });
  const warns = [];
  const warn = console.warn;
  console.warn = msg => { if (/version Drive/.test(String(msg))) warns.push(msg); };
  try {
    for (let i = 0; i < 2; i++) {
      const out = runApi({ fnName: 'apiGetAllNotes', args: [], spreadsheetId: SHEET_ID, accessToken: 'tok', scriptId: SCRIPT_ID, syncFetch: world.syncFetch });
      assert.strictEqual(out.meter.sheetsReads, 1);
      assert.strictEqual(out.value.success, true);
    }
  } finally {
    console.warn = warn;
  }
  // Drapeau par conteneur : un test précédent du même processus a pu l'épuiser.
  assert.ok(warns.length <= 1, warns.length + ' avertissements');
});

test('écriture avec instantané en cache : ≤ 3 lectures (verrou seul) et ≤ 3 écritures', () => {
  const world = makeWorldWithDrive();
  call(world, 'apiGetAllNotes');
  const w = call(world, 'apiAddNote', ['Safir', 'Note budget', '', 'Safir', '']);
  assert.strictEqual(w.value.success, true);
  assert.ok(w.meter.sheetsReads <= 3, w.meter.sheetsReads + ' lectures');
  assert.ok(w.meter.sheetsWrites <= 3, w.meter.sheetsWrites + ' écritures');
});

test('instantané plus vieux que MAX_AGE_MS : relu même si la version n\'a pas bougé', () => {
  const world = makeWorldWithDrive();
  let t = 1000000;
  const now = () => t;
  call(world, 'apiGetAllNotes', [], now);
  t += snapshotCache.MAX_AGE_MS - 1;
  assert.strictEqual(call(world, 'apiGetAllNotes', [], now).meter.sheetsReads, 0);
  t += 2;
  assert.strictEqual(call(world, 'apiGetAllNotes', [], now).meter.sheetsReads, 1);
});

test('deux fonctions de lecture différentes partagent l\'instantané sans se polluer', () => {
  const world = makeWorldWithDrive();
  const a = call(world, 'apiGetAllNotes');
  const b = call(world, 'apiGetBootstrapData');
  const c = call(world, 'apiGetAllNotes');
  assert.strictEqual(b.meter.sheetsReads, 0);
  assert.deepStrictEqual(c.value, a.value);
});
