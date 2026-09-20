'use strict';

const { sheetsRequest } = require('./sheets-snapshot');

// DriveApp n'existe pas sur Vercel : BackupService copie le classeur entier
// puis range la copie dans un sous-dossier. Drive v3 couvre exactement ces
// quatre gestes (get, copy, list, create, update), avec le même compte de
// service que Sheets. Conséquence assumée : la copie appartient au compte de
// service, pas au propriétaire humain, qui y accède par son lien.

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files/';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILE_FIELDS = 'id,name,mimeType,parents,webViewLink';

function _iterator(items) {
  let i = 0;
  return {
    hasNext: () => i < items.length,
    next() {
      if (i >= items.length) throw new Error('Aucun élément suivant.');
      return items[i++];
    }
  };
}

function copySpreadsheet({ syncFetch, accessToken, fileId, name }) {
  const url = DRIVE_API + encodeURIComponent(fileId) + '/copy?fields=' + encodeURIComponent(FILE_FIELDS);
  return sheetsRequest({ syncFetch, accessToken, url, method: 'POST', payload: { name: name }, what: 'copie du classeur' });
}

/**
 * `allowedFileIds` porte pour Drive le garde-fou que `SpreadsheetApp.openById`
 * a déjà pour Sheets : le jeton OAuth couvre TOUT le Drive du compte de
 * service, donc sans cette liste un `getFileById` avec un identifiant venu
 * d'ailleurs lirait un fichier d'un autre tenant. L'ensemble démarre avec le
 * seul classeur du tenant ; la copie créée par `ss.copy()` pendant CETTE
 * exécution s'y ajoute (BackupService la relit aussitôt par son identifiant).
 * Les identifiants obtenus depuis l'API elle-même (dossiers parents, résultats
 * de recherche) sont dérivés d'un fichier déjà autorisé : ils passent par
 * `get()` sans repasser par le garde-fou.
 */
function createDriveApp({ syncFetch, accessToken, allowedFileIds }) {
  const allowed = allowedFileIds || new Set();

  function assertAllowed(fileId) {
    if (!allowed.has(String(fileId))) {
      throw new Error('Accès refusé : fichier Drive hors tenant.');
    }
  }

  function get(fileId) {
    const url = DRIVE_API + encodeURIComponent(fileId) + '?fields=' + encodeURIComponent(FILE_FIELDS);
    return sheetsRequest({ syncFetch, accessToken, url, what: 'lecture Drive' });
  }

  function search(query) {
    const url = DRIVE_API.slice(0, -1) + '?q=' + encodeURIComponent(query) + '&fields=' + encodeURIComponent('files(' + FILE_FIELDS + ')');
    const json = sheetsRequest({ syncFetch, accessToken, url, what: 'recherche Drive' });
    return json.files || [];
  }

  function wrap(resource) {
    const api = {
      getId: () => resource.id,
      getName: () => resource.name,
      getUrl: () => resource.webViewLink || ('https://drive.google.com/open?id=' + resource.id),
      getParents: () => _iterator((resource.parents || []).map(id => wrap(get(id)))),
      getFoldersByName: name => _iterator(
        search('mimeType = \'' + FOLDER_MIME + '\' and name = \'' + String(name).replace(/'/g, '\\\'') + '\' and \'' + resource.id + '\' in parents and trashed = false')
          .map(wrap)
      ),
      createFolder(name) {
        const url = DRIVE_API.slice(0, -1) + '?fields=' + encodeURIComponent(FILE_FIELDS);
        return wrap(sheetsRequest({
          syncFetch, accessToken, url, method: 'POST',
          payload: { name: String(name), mimeType: FOLDER_MIME, parents: [resource.id] },
          what: 'création de dossier Drive'
        }));
      },
      moveTo(folder) {
        const previous = (resource.parents || []).join(',');
        const url = DRIVE_API + encodeURIComponent(resource.id)
          + '?addParents=' + encodeURIComponent(folder.getId())
          + '&removeParents=' + encodeURIComponent(previous)
          + '&fields=' + encodeURIComponent(FILE_FIELDS);
        const updated = sheetsRequest({ syncFetch, accessToken, url, method: 'PATCH', payload: {}, what: 'déplacement Drive' });
        resource.parents = updated.parents || [folder.getId()];
        return api;
      }
    };
    return api;
  }

  return {
    getFileById: fileId => { assertAllowed(fileId); return wrap(get(fileId)); },
    // Le compte de service a sa propre racine Drive : elle ne sert que de
    // repli quand le classeur n'a aucun parent accessible.
    getRootFolder: () => wrap(get('root'))
  };
}

module.exports = { createDriveApp, copySpreadsheet, DRIVE_API };
