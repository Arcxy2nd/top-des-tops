'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createSyncFetch } = require('../lib/gas-runtime/sync-fetch');

test('syncFetch renvoie statut et corps de manière synchrone', () => {
  const { syncFetch, close } = createSyncFetch();
  try {
    const res = syncFetch('data:text/plain,bonjour');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body, 'bonjour');
  } finally {
    close();
  }
});

test('syncFetch lève une erreur explicite sur une URL invalide', () => {
  const { syncFetch, close } = createSyncFetch();
  try {
    assert.throws(() => syncFetch('pas-une-url'), /Échec réseau/);
  } finally {
    close();
  }
});

test('syncFetch expire sur un serveur muet, puis la requête suivante fonctionne', async () => {
  // Le serveur tourne sur le thread principal, bloqué pendant l'attente :
  // il accepte la connexion (noyau) mais ne peut jamais répondre.
  const server = http.createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { syncFetch, close } = createSyncFetch({ timeoutMs: 300 });
  try {
    assert.throws(() => syncFetch('http://127.0.0.1:' + server.address().port + '/'), /Délai réseau dépassé/);
    assert.strictEqual(syncFetch('data:text/plain,ok').body, 'ok', 'le worker doit être recréé après un délai');
  } finally {
    close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
