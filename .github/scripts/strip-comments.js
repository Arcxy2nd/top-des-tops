#!/usr/bin/env node
'use strict';

// Runs only inside the CI checkout, right before `clasp push` — never touches
// the git-tracked source. Google's Apps Script deploy pipeline strips JS
// comments from pushed .gs/.html files itself, but does so unsafely on large
// files (confirmed in production: a comment removal broke a working file's
// syntax, see CHANGELOG v3.5.1 note). Stripping comments ourselves first,
// with a routine verified to only ever touch real comment text (never inside
// strings/template literals), makes Google's own pass a no-op.

const fs = require('fs');

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
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
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
        if (src[j] === '}' && depth > 0) depth--;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function stripGsFile(path) {
  const src = fs.readFileSync(path, 'utf8');
  const stripped = stripJsComments(src);
  fs.writeFileSync(path, stripped);
  console.log(`${path}: ${src.length} -> ${stripped.length} chars`);
}

function stripHtmlFile(path) {
  const src = fs.readFileSync(path, 'utf8');
  const stripped = src.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (whole, open, body, close) => open + stripJsComments(body) + close);
  fs.writeFileSync(path, stripped);
  console.log(`${path}: ${src.length} -> ${stripped.length} chars`);
}

const gsFiles = fs.readdirSync('.').filter(f => f.endsWith('.gs'));
const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));

gsFiles.forEach(stripGsFile);
htmlFiles.forEach(stripHtmlFile);
