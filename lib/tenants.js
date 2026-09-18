'use strict';

const fs = require('fs');
const path = require('path');

const TENANTS_FILE = path.join(__dirname, '..', 'tenants.json');

/** Lit et parse tenants.json depuis le disque (chemin réel par défaut). */
function loadTenants(filePath) {
  const raw = fs.readFileSync(filePath || TENANTS_FILE, 'utf8');
  return JSON.parse(raw);
}

/** Extrait le nom d'hôte d'un header Host, sans le port éventuel, en minuscules. */
function _normalizeHost(hostHeader) {
  if (!hostHeader) return '';
  return String(hostHeader).split(':')[0].trim().toLowerCase();
}

/**
 * Résout un tenant ({ host, spreadsheetId }) à partir d'un header Host et d'une
 * table de tenants déjà chargée. Défaut-refus : hôte absent, table absente, ou
 * entrée sans spreadsheetId retournent null plutôt qu'une valeur par défaut —
 * même posture que checkSecret_ dans DiscordBridge.gs.
 */
function resolveTenant(hostHeader, tenants) {
  const host = _normalizeHost(hostHeader);
  if (!host || !tenants) return null;
  const entry = tenants[host];
  if (!entry || !entry.spreadsheetId) return null;
  return { host, spreadsheetId: entry.spreadsheetId };
}

module.exports = { loadTenants, resolveTenant, TENANTS_FILE };
