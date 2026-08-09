#!/usr/bin/env node
'use strict';

// Runs inside the CI checkout right before `clasp push`. Google's Apps Script
// pipeline strips comments itself, but did so unsafely on a file this size and
// blanked production (see CHANGELOG v3.5.5): stripping first makes its pass a
// no-op. Every write is re-parsed before it lands, so a bug in the scanner
// fails the build instead of shipping a broken page.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

// A '/' opens a regex literal (rather than being division) when the previous
// significant token is an operator, an opening bracket, or one of these keywords.
const REGEX_PRECEDERS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'
]);
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'yield', 'await'
]);

function opensRegex(emitted) {
  let i = emitted.length - 1;
  while (i >= 0 && /\s/.test(emitted[i])) i--;
  if (i < 0) return true;
  const c = emitted[i];
  if (REGEX_PRECEDERS.has(c)) {
    // A '/' right after '++' or '--' is division on the postfix/prefix
    // result, not a regex opener -- REGEX_PRECEDERS only sees the last '+'
    // or '-' and doesn't know it's the second half of the doubled operator.
    if ((c === '+' || c === '-') && emitted[i - 1] === c) return false;
    return true;
  }
  if (!/[A-Za-z0-9_$]/.test(c)) return false;
  let j = i;
  while (j >= 0 && /[A-Za-z0-9_$]/.test(emitted[j])) j--;
  return REGEX_KEYWORDS.has(emitted.slice(j + 1, i + 1));
}

function stripJsComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (c === '/' && c2 === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      // Keep the CR of a CRLF pair: dropping it leaves mixed line endings.
      if (j > i && src[j - 1] === '\r') out += '\r';
      i = j;
      continue;
    }

    if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      if (j >= n) throw new Error('Commentaire /* non fermé');
      // A block comment can be the only separator between two tokens.
      out += ' ';
      i = j + 2;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      if (j >= n) throw new Error('Chaîne non terminée');
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`' && depth === 0) break;
        if (src[j] === '$' && src[j + 1] === '{') depth++;
        else if (src[j] === '}' && depth > 0) depth--;
        j++;
      }
      if (j >= n) throw new Error('Template literal non terminé');
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (c === '/' && opensRegex(out)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '\n') throw new Error('Regex non terminée sur la ligne');
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        j++;
      }
      if (j >= n) throw new Error('Regex non terminée');
      j++;
      while (j < n && /[a-z]/.test(src[j])) j++;
      out += src.slice(i, j);
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

function assertParses(label, code) {
  try {
    new vm.Script(code, { filename: label });
  } catch (e) {
    throw new Error(label + ' ne parse plus après nettoyage : ' + e.message);
  }
}

const SCRIPT_RE = /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi;

function stripGsFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const stripped = stripJsComments(src);
  assertParses(path.basename(file), stripped);
  fs.writeFileSync(file, stripped);
  console.log(path.basename(file) + ': ' + src.length + ' -> ' + stripped.length + ' chars');
}

function stripHtmlFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  let blocks = 0;
  const stripped = src.replace(SCRIPT_RE, (whole, open, body, close) => {
    blocks++;
    const cleaned = stripJsComments(body);
    assertParses(path.basename(file) + '#script' + blocks, cleaned);
    return open + cleaned + close;
  });
  fs.writeFileSync(file, stripped);
  console.log(path.basename(file) + ': ' + src.length + ' -> ' + stripped.length + ' chars (' + blocks + ' bloc(s) script)');
}

function main() {
  if (!process.env.CI && !process.argv.includes('--force')) {
    console.error('strip-comments.js réécrit les fichiers sur place : réservé au CI. Utiliser --force pour forcer en local.');
    process.exit(1);
  }
  const entries = fs.readdirSync(ROOT);
  const gsFiles = entries.filter(f => f.endsWith('.gs')).map(f => path.join(ROOT, f));
  const htmlFiles = entries.filter(f => f.endsWith('.html')).map(f => path.join(ROOT, f));
  if (!gsFiles.length && !htmlFiles.length) {
    console.error('Aucun fichier .gs/.html trouvé dans ' + ROOT);
    process.exit(1);
  }
  gsFiles.forEach(stripGsFile);
  htmlFiles.forEach(stripHtmlFile);
}

if (require.main === module) main();

module.exports = { stripJsComments };
