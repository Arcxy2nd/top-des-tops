'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadTenants, resolveTenant, TENANTS_FILE } = require('../lib/tenants');

test('resolveTenant retourne le tenant quand l\'hôte correspond exactement', () => {
  const tenants = { 'test.example.com': { spreadsheetId: 'SHEET_A' } };
  const result = resolveTenant('test.example.com', tenants);
  assert.deepStrictEqual(result, { host: 'test.example.com', spreadsheetId: 'SHEET_A', instanceId: null });
});

test('resolveTenant retire le port du header Host avant de comparer', () => {
  const tenants = { 'test.example.com': { spreadsheetId: 'SHEET_A' } };
  const result = resolveTenant('test.example.com:3000', tenants);
  assert.deepStrictEqual(result, { host: 'test.example.com', spreadsheetId: 'SHEET_A', instanceId: null });
});

test('resolveTenant est insensible à la casse de l\'hôte', () => {
  const tenants = { 'test.example.com': { spreadsheetId: 'SHEET_A' } };
  const result = resolveTenant('TEST.EXAMPLE.COM', tenants);
  assert.deepStrictEqual(result, { host: 'test.example.com', spreadsheetId: 'SHEET_A', instanceId: null });
});

test('resolveTenant retourne null en défaut-refus pour un hôte inconnu', () => {
  const tenants = { 'test.example.com': { spreadsheetId: 'SHEET_A' } };
  assert.strictEqual(resolveTenant('inconnu.example.com', tenants), null);
});

test('resolveTenant retourne null quand hostHeader ou tenants est absent', () => {
  assert.strictEqual(resolveTenant('', { a: { spreadsheetId: 'X' } }), null);
  assert.strictEqual(resolveTenant('test.example.com', null), null);
});

test('resolveTenant retourne null quand l\'entrée n\'a pas de spreadsheetId', () => {
  const tenants = { 'test.example.com': {} };
  assert.strictEqual(resolveTenant('test.example.com', tenants), null);
});

test('loadTenants lit et parse un fichier JSON réel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenants-test-'));
  const file = path.join(dir, 'tenants.json');
  fs.writeFileSync(file, JSON.stringify({ 'a.example.com': { spreadsheetId: 'SHEET_B' } }));
  const tenants = loadTenants(file);
  assert.deepStrictEqual(tenants, { 'a.example.com': { spreadsheetId: 'SHEET_B' } });
});

test('loadTenants sans argument lit le tenants.json réel du projet et le parse sans erreur', () => {
  const tenants = loadTenants();
  assert.strictEqual(typeof tenants, 'object');
  const keys = Object.keys(tenants);
  assert.ok(keys.length >= 1, 'tenants.json doit contenir au moins une entrée');
  assert.ok(tenants[keys[0]].spreadsheetId, 'chaque entrée doit avoir un spreadsheetId');
});

test('TENANTS_FILE pointe vers tenants.json à la racine du projet', () => {
  assert.match(TENANTS_FILE, /tenants\.json$/);
});

const { scriptIdForTenant } = require('../lib/tenants');

test('resolveTenant remonte instanceId quand le tenant en déclare un, null sinon', () => {
  const tenants = {
    'a.example': { spreadsheetId: 'S1', instanceId: 'LEGACY1234' },
    'b.example': { spreadsheetId: 'S2' }
  };
  assert.deepStrictEqual(resolveTenant('a.example', tenants), { host: 'a.example', spreadsheetId: 'S1', instanceId: 'LEGACY1234' });
  assert.deepStrictEqual(resolveTenant('b.example', tenants), { host: 'b.example', spreadsheetId: 'S2', instanceId: null });
});

test('scriptIdForTenant est déterministe et hexadécimal pur (pas de préfixe commun)', () => {
  const id = scriptIdForTenant('SHEET_A');
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.strictEqual(id, scriptIdForTenant('SHEET_A'));
  assert.notStrictEqual(id, scriptIdForTenant('SHEET_B'));
});

// ── Garde-fous de la table réelle (Plan 6) : ils valident tenants.json tel qu'il
// est versionné, avant et après la déclaration des deux instances de production.
test('chaque tenant déclaré porte un spreadsheetId et résout sans ambiguïté', () => {
  const tenants = loadTenants(TENANTS_FILE);
  const hosts = Object.keys(tenants);
  assert.ok(hosts.length > 0);
  hosts.forEach(host => {
    assert.strictEqual(host, host.toLowerCase(), 'hôte non normalisé : ' + host);
    const resolved = resolveTenant(host, tenants);
    assert.ok(resolved && resolved.spreadsheetId, 'tenant sans classeur : ' + host);
  });
});

test('un instanceId déclaré fait exactement 10 caractères (préfixe de stockage hérité)', () => {
  const tenants = loadTenants(TENANTS_FILE);
  Object.keys(tenants).forEach(host => {
    const declared = tenants[host].instanceId;
    if (declared === undefined || declared === null) return;
    assert.strictEqual(String(declared).length, 10, 'instanceId de longueur inattendue pour ' + host + ' : ' + declared);
  });
});

test('deux hôtes ne peuvent pas partager un classeur ET un instanceId différent', () => {
  const tenants = loadTenants(TENANTS_FILE);
  const seen = {};
  Object.keys(tenants).forEach(host => {
    const entry = tenants[host];
    const key = entry.spreadsheetId;
    const id = entry.instanceId || null;
    if (Object.prototype.hasOwnProperty.call(seen, key)) {
      assert.strictEqual(seen[key], id, 'le classeur ' + key + ' est servi avec deux identifiants d\'instance différents — le stockage local des utilisateurs serait cloisonné par hasard');
    }
    seen[key] = id;
  });
});
