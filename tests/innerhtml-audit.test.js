'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const INDEX = path.join(__dirname, '..', 'Index.html');

/**
 * Liste d'exceptions auditee a la main. Chaque entree fige UNE affectation
 * innerHTML dont on a verifie qu'elle est sure, avec la raison.
 *
 * `snippet` doit apparaitre TEL QUEL et UNE SEULE FOIS dans Index.html : un
 * snippet ambigu ferait taire deux sites d'un coup, dont un non audite.
 *
 * Ajouter une entree ici est un acte d'audit, pas une formalite. Si la raison ne
 * tient pas en une ligne, c'est que le site doit etre corrige, pas allowliste.
 */
const AUDITED = [
  // Rempli par la Task 5.
];

/** Affectations `X.innerHTML =` ou `X.innerHTML +=`, avec leur expression source. */
function collectAssignments(html) {
  const out = [];
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/\.innerHTML\s*\+?=/.test(lines[i])) continue;
    // L'expression peut courir sur plusieurs lignes (concatenations longues) :
    // on agrege jusqu'au point-virgule de fin d'instruction.
    let expr = lines[i];
    let j = i;
    while (!/;\s*(\/\/.*)?$/.test(expr.trim()) && j - i < 200 && j + 1 < lines.length) {
      j++;
      expr += '\n' + lines[j];
    }
    out.push({ line: i + 1, expr });
  }
  return out;
}

/**
 * Une affectation est "sure par construction" si son expression n'interpole
 * aucune donnee : soit une chaine vide/litterale, soit uniquement des litteraux
 * concatenes. Tout le reste demande soit escapeHtml(), soit un audit explicite.
 */
function isLiteralOnly(expr) {
  const rhs = expr.slice(expr.indexOf('=') + 1);
  // Retire les chaines litterales, les commentaires et les espaces.
  const stripped = rhs
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '')
    .replace(/[\s+;]/g, '');
  return stripped === '';
}

/** Interpole-t-elle quelque chose sans jamais passer par un echappeur ? */
function looksUnsafe(expr) {
  if (isLiteralOnly(expr)) return false;
  return !/escapeHtml\s*\(|encodeURIComponent\s*\(/.test(expr);
}

test('chaque snippet audite est present et unique dans Index.html', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  AUDITED.forEach(entry => {
    const count = html.split(entry.snippet).length - 1;
    assert.strictEqual(count, 1,
      'snippet audite present ' + count + ' fois (attendu 1) : ' + JSON.stringify(entry.snippet));
    assert.ok(entry.reason && entry.reason.trim().length >= 10,
      'raison manquante ou trop courte pour : ' + JSON.stringify(entry.snippet));
  });
});

test('aucune affectation innerHTML n interpole de donnee sans echappement', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const audited = AUDITED.map(e => e.snippet);
  const offenders = collectAssignments(html)
    .filter(a => looksUnsafe(a.expr))
    .filter(a => !audited.some(s => a.expr.indexOf(s) !== -1));

  const report = offenders
    .map(a => '  Index.html:' + a.line + '\n' + a.expr.split('\n').map(l => '    ' + l.trim()).join('\n'))
    .join('\n\n');

  assert.strictEqual(offenders.length, 0,
    offenders.length + ' affectation(s) innerHTML interpolent une donnee sans escapeHtml() :\n\n' + report);
});
