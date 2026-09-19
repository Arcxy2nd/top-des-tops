'use strict';

const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads');

// Code.gs est entièrement synchrone (SpreadsheetApp, UrlFetchApp) alors que
// fetch est asynchrone en Node. Un worker exécute le fetch pendant que le
// thread principal est bloqué sur Atomics.wait, puis la réponse est lue d'un
// seul coup par receiveMessageOnPort : zéro dépendance, même modèle que GAS.
const WORKER_SOURCE = `
const { workerData } = require('worker_threads');
const { port, shared } = workerData;
const flag = new Int32Array(shared);
port.on('message', async ({ id, url, init }) => {
  let reply;
  try {
    const res = await fetch(url, init);
    reply = { id, ok: true, status: res.status, body: await res.text() };
  } catch (e) {
    reply = { id, ok: false, error: String((e && e.message) || e) };
  }
  port.postMessage(reply);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
`;

const DEFAULT_TIMEOUT_MS = 30000;

function createSyncFetch(options) {
  const timeoutMs = (options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  let channel = null;
  let seq = 0;

  function _open() {
    const shared = new SharedArrayBuffer(4);
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { port: port2, shared }, transferList: [port2] });
    // Ni le worker ni le port ne doivent retenir la boucle d'événements :
    // une fonction serverless (ou un test) doit pouvoir se terminer.
    worker.unref();
    port1.unref();
    return { worker, port: port1, flag: new Int32Array(shared) };
  }

  function close() {
    if (!channel) return;
    channel.port.close();
    channel.worker.terminate();
    channel = null;
  }

  function syncFetch(url, init) {
    if (!channel) channel = _open();
    const id = ++seq;
    Atomics.store(channel.flag, 0, 0);
    channel.port.postMessage({ id, url: String(url), init: init || {} });
    if (Atomics.wait(channel.flag, 0, 0, timeoutMs) === 'timed-out') {
      // Worker jeté : une réponse tardive ne doit jamais être lue comme celle
      // de la requête suivante.
      close();
      throw new Error('Délai réseau dépassé (' + timeoutMs + ' ms) : ' + url);
    }
    const received = receiveMessageOnPort(channel.port);
    if (!received || received.message.id !== id) {
      close();
      throw new Error('Réponse réseau incohérente : ' + url);
    }
    const reply = received.message;
    if (!reply.ok) throw new Error('Échec réseau : ' + reply.error);
    return { status: reply.status, body: reply.body };
  }

  return { syncFetch, close };
}

let _shared = null;

/** Instance réutilisée entre invocations "chaudes" d'un même conteneur Vercel. */
function getSharedSyncFetch() {
  if (!_shared) _shared = createSyncFetch();
  return _shared.syncFetch;
}

module.exports = { createSyncFetch, getSharedSyncFetch, DEFAULT_TIMEOUT_MS };
