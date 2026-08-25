'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { loadGas, makeSheet, injectSheets } = require('./harness.js');

// ChatService had zero test coverage before this passe — every apiPostChatMessage
// call was also silently broken in this harness (Utilities.getUuid undefined),
// which is why it was never caught. See tests/harness.js for the Utilities mock.

function makeContext(chatRows) {
  const gas = loadGas();
  const chat = makeSheet(chatRows || [['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ']]);
  const auditLog = makeSheet([['Timestamp', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'Snapshot', 'AnnuléLe']]);
  const players = makeSheet([['Name', 'Avatar URL', 'Hex color', 'Password'], ['Alice', '', '', ''], ['Bob', '', '', '']]);
  injectSheets(gas, { chat, auditLog, players });
  return { gas, chat, auditLog, players };
}

test('apiPostChatMessage rejects a missing author before touching the sheet', () => {
  const { gas, chat } = makeContext();
  const res = gas.apiPostChatMessage('Salut', '', '');
  assert.strictEqual(res.success, false);
  assert.match(res.error, /[Ii]dentité/);
  assert.strictEqual(chat.getLastRow(), 1, 'aucune ligne ne doit avoir été ajoutée');
});

test('apiPostChatMessage appends the message, returns it, and logs the action', () => {
  const { gas, chat, auditLog } = makeContext();
  const res = gas.apiPostChatMessage('Salut tout le monde', '', 'Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message.author, 'Alice');
  assert.strictEqual(res.message.text, 'Salut tout le monde');
  assert.ok(res.message.id, 'un id doit être généré');
  assert.strictEqual(chat.getLastRow(), 2);
  assert.strictEqual(chat._grid[1][2], 'Alice');
  assert.strictEqual(auditLog.getLastRow(), 2, 'l\'envoi doit être journalisé');
});

test('ChatService.postMessage rejects an empty message', () => {
  const { gas } = makeContext();
  assert.throws(() => gas.ChatService.postMessage('Alice', '   ', ''), /vide/);
});

test('ChatService.postMessage rejects a message over 2000 characters', () => {
  const { gas } = makeContext();
  assert.throws(() => gas.ChatService.postMessage('Alice', 'x'.repeat(2001), ''), /2000/);
});

test('apiDeleteChatMessage refuses to delete another author\'s message, leaving it intact', () => {
  const { gas, chat } = makeContext([
    ['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ'],
    ['m1', new Date('2026-01-01'), 'Alice', 'Message d\'Alice', '']
  ]);
  const res = gas.apiDeleteChatMessage('m1', 'Bob');
  assert.strictEqual(res.success, false);
  assert.match(res.error, /propres messages/);
  assert.strictEqual(chat.getLastRow(), 2, 'le message d\'Alice doit survivre intact');
  assert.strictEqual(chat._grid[1][2], 'Alice');
});

test('apiDeleteChatMessage deletes the author\'s own message and logs it', () => {
  const { gas, chat, auditLog } = makeContext([
    ['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ'],
    ['m1', new Date('2026-01-01'), 'Alice', 'Message d\'Alice', '']
  ]);
  const res = gas.apiDeleteChatMessage('m1', 'Alice');
  assert.strictEqual(res.success, true);
  assert.strictEqual(chat.getLastRow(), 1);
  assert.strictEqual(auditLog.getLastRow(), 2, 'la suppression doit être journalisée');
});

// Régression : la résolution replyToAuthor/replyToText/replyToDeleted doit se
// faire sur l'ensemble des messages AVANT la troncature aux MAX_MESSAGES plus
// récents — sinon un message cité plus vieux que la fenêtre affichée
// apparaîtrait à tort comme "supprimé" (voir C12, passe 6 Tchat).
test('ChatService.getAllMessages resolves a reply even when the original falls outside MAX_MESSAGES', () => {
  const rows = [['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ']];
  rows.push(['old', new Date('2026-01-01'), 'Alice', 'Message ancien', '']);
  for (let i = 0; i < ChatServiceMaxMessages(); i++) {
    rows.push(['filler' + i, new Date('2026-01-02'), 'Bob', 'filler ' + i, '']);
  }
  rows.push(['recent', new Date('2026-01-03'), 'Alice', 'Réponse au message ancien', 'old']);
  const { gas } = makeContext(rows);

  const result = gas.ChatService.getAllMessages();
  const recent = result.messages.find(m => m.id === 'recent');
  assert.ok(recent, 'le message récent doit être présent');
  assert.strictEqual(recent.replyToAuthor, 'Alice');
  assert.strictEqual(recent.replyToText, 'Message ancien');
  assert.strictEqual(recent.replyToDeleted, false, 'le message cité existe toujours, même hors fenêtre affichée');
  assert.ok(!result.messages.some(m => m.id === 'old'), 'le message ancien doit bien être tronqué de la liste affichée');
});

test('ChatService.getAllMessages marks replyToDeleted when the original message no longer exists', () => {
  const { gas } = makeContext([
    ['Id', 'Date', 'Auteur', 'Texte', 'RéponseÀ'],
    ['recent', new Date('2026-01-01'), 'Alice', 'Réponse à un message supprimé', 'gone']
  ]);
  const result = gas.ChatService.getAllMessages();
  assert.strictEqual(result.messages[0].replyToDeleted, true);
});

function ChatServiceMaxMessages() {
  // Garde le test synchronisé avec la constante réelle sans la dupliquer en dur :
  // relit MAX_MESSAGES depuis un contexte fraîchement chargé.
  const { loadGas: load } = require('./harness.js');
  return load().ChatService.MAX_MESSAGES;
}
