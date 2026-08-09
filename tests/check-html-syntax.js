'use strict';

// Index.html is served verbatim by GAS: a syntax error in its inline <script>
// blanks the whole app and no other test in the suite would notice.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'Index.html');
const src = fs.readFileSync(file, 'utf8');
const SCRIPT_RE = /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi;

let found = 0;
let match;
while ((match = SCRIPT_RE.exec(src)) !== null) {
  found++;
  try {
    new vm.Script(match[2], { filename: 'Index.html#script' + found });
  } catch (e) {
    console.error('SyntaxError dans Index.html (bloc script #' + found + ') : ' + e.message);
    process.exit(1);
  }
}

if (!found) {
  console.error('Aucun bloc <script> inline trouve dans Index.html.');
  process.exit(1);
}
console.log('Index.html : ' + found + ' bloc(s) <script> inline, syntaxe OK.');
