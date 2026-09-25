'use strict';

// La version d'un fichier Drive change à chaque modification du classeur, qu'elle
// vienne de nous, d'une saisie à la main ou de l'ancien déclencheur Apps Script.
// Elle se lit sur le quota Drive, séparé de celui de Sheets : c'est ce qui
// permet de valider l'instantané en cache sans dépenser une lecture Sheets.
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files/';
let warned = false;

function readDriveVersion({ syncFetch, accessToken, fileId }) {
  const url = DRIVE_FILES + encodeURIComponent(fileId) + '?fields=version&supportsAllDrives=true';
  let res;
  try {
    res = syncFetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + accessToken } });
  } catch (e) {
    res = { status: 0, body: String((e && e.message) || e) };
  }
  if (res && res.status === 200) {
    try {
      const v = JSON.parse(res.body).version;
      return v === undefined || v === null ? null : String(v);
    } catch (e) {
      return null;
    }
  }
  // Un seul avertissement par conteneur : sans Drive, chaque appel retombe
  // simplement sur une lecture complète du classeur.
  if (!warned) {
    warned = true;
    console.warn('[gas-runtime] version Drive illisible (' + (res && res.status) + ') : cache du classeur désactivé. API Drive activée ?');
  }
  return null;
}

module.exports = { readDriveVersion };
