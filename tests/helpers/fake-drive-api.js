'use strict';

// Faux Drive v3 minimal, réutilisable entre suites : mêmes quatre gestes que
// lib/gas-runtime/drive.js (get, copy, list, create, update), à partir d'une
// carte id -> ressource en mémoire. Sœur de fake-sheets-api.js, mais pour
// Drive plutôt que Sheets.
function makeFakeDrive(files) {
  const calls = [];
  const state = Object.assign({}, files);
  let nextId = 500;
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

module.exports = { makeFakeDrive };
