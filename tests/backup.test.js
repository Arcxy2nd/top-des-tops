'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet, injectSheets, makeFakeDrive } = require('./harness.js');

function makeAuditSheet() {
  return makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
}

function baseSheets(overrides) {
  return Object.assign({
    history: makeSheet([]), players: makeSheet([]), categories: makeSheet([]),
    notes: null, bareme: null, phrases: null, auditLog: makeAuditSheet()
  }, overrides);
}

test('apiCreateSnapshot creates the Snapshots folder next to the source and moves the copy there', () => {
  const drive = makeFakeDrive();
  const parentFolder = drive.root.createFolder('Mon Dossier');
  const source = drive.makeSpreadsheet('Site tops', parentFolder);
  const gas = loadGas({ DriveApp: drive.DriveApp });
  injectSheets(gas, baseSheets({ spreadsheet: source }));

  const res = gas.apiCreateSnapshot('Alice');

  assert.strictEqual(res.success, true);
  assert.match(res.name, /^Site tops — Snapshot \d{4}-\d{2}-\d{2} \d{2}h\d{2}$/);
  assert.match(res.url, /^https:\/\/docs\.google\.com\/spreadsheets\/d\//);

  const folders = parentFolder.getFoldersByName('Snapshots top-des-tops');
  assert.ok(folders.hasNext(), 'the Snapshots folder was created next to the source');
  const folder = folders.next();
  assert.strictEqual(folder._files().length, 1, 'the copy lives in the Snapshots folder');
  assert.strictEqual(drive.root._files().indexOf(folder._files()[0]), -1,
    'the copy was removed from its default parent (root) after the move');
});

test('apiCreateSnapshot reuses the existing Snapshots folder on a second call', () => {
  const drive = makeFakeDrive();
  const parentFolder = drive.root.createFolder('Mon Dossier');
  const source = drive.makeSpreadsheet('Site tops', parentFolder);
  const gas = loadGas({ DriveApp: drive.DriveApp });
  injectSheets(gas, baseSheets({ spreadsheet: source }));

  gas.apiCreateSnapshot('Alice');
  gas.apiCreateSnapshot('Alice');

  let count = 0;
  const folders = parentFolder.getFoldersByName('Snapshots top-des-tops');
  while (folders.hasNext()) { folders.next(); count++; }
  assert.strictEqual(count, 1, 'no duplicate Snapshots folder created');
});

test('apiCreateSnapshot falls back to Drive root when the source file has no parent', () => {
  const drive = makeFakeDrive();
  const source = drive.makeSpreadsheet('Orphan Sheet', null);
  const gas = loadGas({ DriveApp: drive.DriveApp });
  injectSheets(gas, baseSheets({ spreadsheet: source }));

  const res = gas.apiCreateSnapshot('Alice');

  assert.strictEqual(res.success, true);
  const folders = drive.root.getFoldersByName('Snapshots top-des-tops');
  assert.ok(folders.hasNext(), 'the Snapshots folder was created at Drive root');
});

test('apiCreateSnapshot logs a Journal d\'audit entry', () => {
  const drive = makeFakeDrive();
  const source = drive.makeSpreadsheet('Site tops');
  const gas = loadGas({ DriveApp: drive.DriveApp });
  const audit = makeAuditSheet();
  injectSheets(gas, baseSheets({ spreadsheet: source, auditLog: audit }));

  const res = gas.apiCreateSnapshot('Alice');

  const row = audit._grid[1];
  assert.strictEqual(row[1], 'Alice');
  assert.strictEqual(row[2], 'Snapshot créé');
  assert.strictEqual(row[5], res.name);
});

test('apiCreateSnapshot fails without an author', () => {
  const drive = makeFakeDrive();
  const source = drive.makeSpreadsheet('Site tops');
  const gas = loadGas({ DriveApp: drive.DriveApp });
  injectSheets(gas, baseSheets({ spreadsheet: source }));

  const res = gas.apiCreateSnapshot('');

  assert.strictEqual(res.success, false);
  assert.match(res.error, /Identité requise/);
});
