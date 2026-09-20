'use strict';

const { createDriveApp, copySpreadsheet, DRIVE_API } = require('../lib/gas-runtime/drive');
const test = require('node:test');
const assert = require('node:assert');

/** Faux Drive v3 : une carte id -> ressource, et le journal des requêtes. */
function makeDrive(files) {
  const calls = [];
  const state = Object.assign({}, files);
  let nextId = 100;
  function syncFetch(url, init) {
    const method = (init && init.method) || 'GET';
    calls.push({ url, method, body: init && init.body });
    if (/\/files\/[^/?]+\/copy/.test(url)) {
      const id = 'copy-' + (nextId++);
      const body = JSON.parse(init.body);
      state[id] = { id, name: body.name, parents: [] };
      return { status: 200, body: JSON.stringify(state[id]) };
    }
    if (method === 'GET' && /\/files\?/.test(url)) {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') || '');
      const name = (/name = '([^']*)'/.exec(q) || [])[1];
      const found = Object.values(state).filter(f => f.name === name && f.mimeType === 'application/vnd.google-apps.folder');
      return { status: 200, body: JSON.stringify({ files: found }) };
    }
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      const id = 'new-' + (nextId++);
      state[id] = { id, name: body.name, mimeType: body.mimeType, parents: body.parents || [] };
      return { status: 200, body: JSON.stringify(state[id]) };
    }
    if (method === 'PATCH') {
      const id = /\/files\/([^/?]+)/.exec(url)[1];
      const addParents = new URL(url).searchParams.get('addParents');
      state[id].parents = [addParents];
      return { status: 200, body: JSON.stringify(state[id]) };
    }
    const id = /\/files\/([^/?]+)/.exec(url)[1];
    if (!state[id]) return { status: 404, body: '{"error":{"message":"File not found"}}' };
    return { status: 200, body: JSON.stringify(state[id]) };
  }
  return { syncFetch, calls, state };
}

const SOURCE = { 'sheet-1': { id: 'sheet-1', name: 'Tops', parents: ['dossier-1'] }, 'dossier-1': { id: 'dossier-1', name: 'Jeux', mimeType: 'application/vnd.google-apps.folder', parents: [] } };

test('getFileById rend un fichier avec nom, identifiant et URL', () => {
  const drive = makeDrive(SOURCE);
  const file = createDriveApp({ syncFetch: drive.syncFetch, accessToken: 'tok' }).getFileById('sheet-1');
  assert.strictEqual(file.getId(), 'sheet-1');
  assert.strictEqual(file.getName(), 'Tops');
  assert.match(file.getUrl(), /sheet-1/);
});

test('getParents rend un itérateur à la manière de GAS', () => {
  const drive = makeDrive(SOURCE);
  const it = createDriveApp({ syncFetch: drive.syncFetch, accessToken: 'tok' }).getFileById('sheet-1').getParents();
  assert.strictEqual(it.hasNext(), true);
  assert.strictEqual(it.next().getId(), 'dossier-1');
  assert.strictEqual(it.hasNext(), false);
});

test('getFoldersByName ne rend que des dossiers du bon nom', () => {
  const drive = makeDrive(Object.assign({}, SOURCE, { 'dossier-2': { id: 'dossier-2', name: 'Snapshots top-des-tops', mimeType: 'application/vnd.google-apps.folder', parents: ['dossier-1'] } }));
  const parent = createDriveApp({ syncFetch: drive.syncFetch, accessToken: 'tok' }).getFileById('dossier-1');
  const it = parent.getFoldersByName('Snapshots top-des-tops');
  assert.strictEqual(it.hasNext(), true);
  assert.strictEqual(it.next().getName(), 'Snapshots top-des-tops');
});

test('createFolder crée un dossier enfant du bon parent', () => {
  const drive = makeDrive(SOURCE);
  const parent = createDriveApp({ syncFetch: drive.syncFetch, accessToken: 'tok' }).getFileById('dossier-1');
  const folder = parent.createFolder('Snapshots top-des-tops');
  assert.strictEqual(folder.getName(), 'Snapshots top-des-tops');
  const created = drive.calls.find(c => c.method === 'POST' && !/copy/.test(c.url));
  const body = JSON.parse(created.body);
  assert.strictEqual(body.mimeType, 'application/vnd.google-apps.folder');
  assert.deepStrictEqual(body.parents, ['dossier-1']);
});

test('moveTo déplace le fichier en retirant l\'ancien parent', () => {
  const drive = makeDrive(SOURCE);
  const app = createDriveApp({ syncFetch: drive.syncFetch, accessToken: 'tok' });
  app.getFileById('sheet-1').moveTo(app.getFileById('dossier-1'));
  const patch = drive.calls.find(c => c.method === 'PATCH');
  assert.ok(patch, 'un PATCH Drive doit être émis');
  assert.strictEqual(new URL(patch.url).searchParams.get('addParents'), 'dossier-1');
  assert.ok(new URL(patch.url).searchParams.has('removeParents'));
});

test('copySpreadsheet duplique le classeur sous le nom demandé', () => {
  const drive = makeDrive(SOURCE);
  const copy = copySpreadsheet({ syncFetch: drive.syncFetch, accessToken: 'tok', fileId: 'sheet-1', name: 'Tops — Snapshot' });
  assert.strictEqual(copy.name, 'Tops — Snapshot');
  assert.ok(drive.calls.some(c => /\/copy\?/.test(c.url) && c.method === 'POST'));
});

test('une erreur Drive ne laisse pas fuiter le corps de la réponse amont', () => {
  const drive = makeDrive({});
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(
      () => createDriveApp({ syncFetch: drive.syncFetch, accessToken: 'tok' }).getFileById('absent'),
      err => /404/.test(err.message) && !/File not found/.test(err.message)
    );
  } finally {
    console.error = originalError;
  }
});

test('DRIVE_API cible bien la v3', () => {
  assert.strictEqual(DRIVE_API, 'https://www.googleapis.com/drive/v3/files/');
});
