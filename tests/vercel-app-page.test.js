'use strict';

const { renderAppPage, instanceIdFor, INDEX_FILE, INSTANCE_ID_LENGTH } = require('../lib/app-page');
const { scriptIdForTenant } = require('../lib/tenants');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TENANT = { host: 'tops.example', spreadsheetId: 'SHEET_A', instanceId: null };
const FAKE_INDEX = '<!doctype html><html><head><title>x</title></head><body>app</body></html>';

test('instanceIdFor dérive un identifiant stable du classeur, tronqué comme sous GAS', () => {
  const id = instanceIdFor(TENANT);
  assert.strictEqual(id.length, INSTANCE_ID_LENGTH);
  assert.strictEqual(id, scriptIdForTenant('SHEET_A').slice(0, INSTANCE_ID_LENGTH));
  assert.strictEqual(instanceIdFor(TENANT), id, 'deux appels donnent le même identifiant');
});

test('deux classeurs différents ne partagent pas le même identifiant d\'instance', () => {
  assert.notStrictEqual(instanceIdFor(TENANT), instanceIdFor({ spreadsheetId: 'SHEET_B' }));
});

test('un instanceId déclaré dans tenants.json gagne (continuité des clés de stockage)', () => {
  assert.strictEqual(instanceIdFor({ spreadsheetId: 'SHEET_A', instanceId: '1fiBPQDpb9' }), '1fiBPQDpb9');
});

test('la page rend le fichier tel quel, suivi du script d\'instance', () => {
  const html = renderAppPage({ tenant: TENANT, readIndex: () => FAKE_INDEX });
  assert.ok(html.startsWith(FAKE_INDEX), 'le document original ne doit pas être réécrit');
  const tail = html.slice(FAKE_INDEX.length);
  assert.match(tail, /^<script>window\.__APP_INSTANCE_ID__ = "/);
  assert.ok(tail.indexOf('if (window.syncIdentityFromStorage) window.syncIdentityFromStorage();') !== -1);
  assert.ok(tail.indexOf(instanceIdFor(TENANT)) !== -1);
});

test('l\'identifiant est échappé en JSON (pas d\'injection possible par tenants.json)', () => {
  const html = renderAppPage({ tenant: { spreadsheetId: 'S', instanceId: '</script><script>alert(1)' }, readIndex: () => FAKE_INDEX });
  assert.strictEqual(html.indexOf('<script>alert(1)'), -1);
});

test('INDEX_FILE pointe vers le vrai Index.html du projet', () => {
  assert.strictEqual(INDEX_FILE, path.join(__dirname, '..', 'Index.html'));
  assert.ok(fs.existsSync(INDEX_FILE));
});

test('sans readIndex, la page sert le vrai fichier et reste un document HTML complet', () => {
  const html = renderAppPage({ tenant: TENANT });
  assert.ok(html.length > 100000, 'Index.html fait ~1 Mo');
  assert.ok(html.indexOf('__APP_INSTANCE_ID__') !== -1);
});

test('vercel.json réécrit la racine vers la fonction de page et embarque Index.html', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.ok(conf.rewrites.some(r => r.source === '/' && r.destination === '/api/app'));
  assert.match(conf.functions['api/app.js'].includeFiles, /Index\.html/);
});

test('.vercelignore laisse passer Index.html et plus aucun placeholder public/', () => {
  const ignore = fs.readFileSync(path.join(__dirname, '..', '.vercelignore'), 'utf8');
  assert.ok(ignore.split(/\r?\n/).some(l => l.trim() === '!Index.html'), 'Index.html doit être dans la liste blanche');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', 'index.html')), 'le placeholder court-circuiterait la réécriture de /');
});
