const test = require('node:test');
const assert = require('node:assert');
const { loadGas, makeSheet } = require('./harness');

const HEADER_NOTES = ['Date', 'Joueur', 'Note', 'NoteId', 'CrééPar', 'ModifiéPar', 'ModifiéLe'];

test('NotesService.getAllNotes parses Sheets serial numbers into valid modern dates and never 1970', () => {
  const gas = loadGas();
  // Sheets serial date 46278 corresponds to 2026-09-13
  const notesSheet = makeSheet([
    HEADER_NOTES,
    [46278, 'Alice', 'Super partie au japon', 'note_1', 'Alice', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ notes: notesSheet, spreadsheet: { insertSheet: () => notesSheet } });

  const result = gas.NotesService.getAllNotes();
  assert.strictEqual(result.notes.length, 1);
  const note = result.notes[0];
  assert.ok(note.timestamp, 'timestamp must be truthy');
  const d = new Date(note.timestamp);
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 8); // September
  assert.strictEqual(d.getDate(), 13);
  assert.notStrictEqual(d.getFullYear(), 1970);
});

test('NotesService.getAllNotes handles 0, null, or corrupt dates by setting timestamp to null', () => {
  const gas = loadGas();
  const notesSheet = makeSheet([
    HEADER_NOTES,
    [0, 'Alice', 'Note sans date', 'note_1', 'Alice', '', ''],
    ['', 'Bob', 'Autre note vide', 'note_2', 'Bob', '', ''],
    [null, 'Charlie', 'Note null', 'note_3', 'Charlie', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ notes: notesSheet, spreadsheet: { insertSheet: () => notesSheet } });

  const result = gas.NotesService.getAllNotes();
  assert.strictEqual(result.notes.length, 3);
  result.notes.forEach(n => {
    assert.strictEqual(n.timestamp, null, 'Corrupt or 0 date must yield null timestamp');
  });
});

test('NotesService.editNote allows updating note date and text', () => {
  const gas = loadGas();
  const notesSheet = makeSheet([
    HEADER_NOTES,
    [46278, 'Alice', 'Ancien texte', 'note_1', 'Alice', '', '']
  ]);
  gas.ConfigService.getSheets = () => ({ notes: notesSheet, spreadsheet: { insertSheet: () => notesSheet } });

  const res = gas.NotesService.editNote(2, 'Nouveau texte', 'Alice', '2026-10-15');
  assert.ok(res.timestamp, 'timestamp must be returned');
  const d = new Date(res.timestamp);
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 9); // October
  assert.strictEqual(d.getDate(), 15);

  const updatedNote = gas.NotesService.getAllNotes().notes[0];
  assert.strictEqual(updatedNote.text, 'Nouveau texte');
  const dUpdated = new Date(updatedNote.timestamp);
  assert.strictEqual(dUpdated.getFullYear(), 2026);
  assert.strictEqual(dUpdated.getMonth(), 9);
  assert.strictEqual(dUpdated.getDate(), 15);
});

test('apiEditNote updates note date and registers in audit log', () => {
  const gas = loadGas();
  const notesSheet = makeSheet([
    HEADER_NOTES,
    [46278, 'Alice', 'Texte original', 'note_1', 'Alice', '', '']
  ]);
  const auditSheet = makeSheet([['Date', 'Auteur', 'Action', 'Entité', 'Avant', 'Après', 'Détail', 'RowIndex', 'Undone']]);
  gas.ConfigService.getSheets = () => ({
    notes: notesSheet,
    auditLog: auditSheet,
    players: makeSheet([['Name'], ['Alice']]),
    spreadsheet: { insertSheet: () => notesSheet }
  });
  gas.SettingsService.getEntities = () => [{ name: 'Alice' }];

  const res = gas.apiEditNote(2, 'Texte modifié', 'Alice', '2026-12-25');
  assert.strictEqual(res.success, true);
  assert.ok(res.timestamp);
  const d = new Date(res.timestamp);
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 11);
  assert.strictEqual(d.getDate(), 25);
});



test('_parseLocalDateWithNow handles multiple formats and rejects invalid dates', () => {
  const gas = loadGas();
  const parse = gas._parseLocalDateWithNow;

  // YYYY-MM-DD
  const dIso = parse('2026-09-13');
  assert.strictEqual(dIso.getFullYear(), 2026);
  assert.strictEqual(dIso.getMonth(), 8);
  assert.strictEqual(dIso.getDate(), 13);

  // DD/MM/YYYY European format
  const dEur = parse('13/09/2026');
  assert.strictEqual(dEur.getFullYear(), 2026);
  assert.strictEqual(dEur.getMonth(), 8);
  assert.strictEqual(dEur.getDate(), 13);

  // Sheets serial date
  const dSerial = parse(46278);
  assert.strictEqual(dSerial.getFullYear(), 2026);
  assert.strictEqual(dSerial.getMonth(), 8);
  assert.strictEqual(dSerial.getDate(), 13);

  // Date instance
  const now = new Date(2026, 8, 13);
  const dInstance = parse(now);
  assert.strictEqual(dInstance.getFullYear(), 2026);
  assert.strictEqual(dInstance.getMonth(), 8);
  assert.strictEqual(dInstance.getDate(), 13);

  // Empty / whitespace -> safe fallback to now
  const dEmpty = parse('');
  assert.ok(!isNaN(dEmpty.getTime()));
  assert.ok(dEmpty.getFullYear() > 2020);

  // Invalid string -> NaN
  const dInvalid = parse('pas-une-date');
  assert.ok(isNaN(dInvalid.getTime()));

  // 1970 date -> NaN
  const d1970 = parse('1970-01-01');
  assert.ok(isNaN(d1970.getTime()));
});
