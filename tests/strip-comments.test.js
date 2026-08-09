'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { stripJsComments } = require('../.github/scripts/strip-comments');

test('removes line and block comments', () => {
  assert.strictEqual(stripJsComments('let a = 1; // gone\n').trim(), 'let a = 1;');
  assert.strictEqual(stripJsComments('let /* gone */ a = 1;').replace(/\s+/g, ' ').trim(), 'let a = 1;');
});

test('keeps // inside strings and template literals', () => {
  const src = 'const u = "https://x.test/a"; const t = `see // here`;';
  assert.strictEqual(stripJsComments(src), src);
});

test('keeps a regex literal that ends in two slashes', () => {
  const src = 'const re = /https?:\\/\\//g;\nconst after = 1;\n';
  const out = stripJsComments(src);
  assert.ok(out.includes('const after = 1;'), 'the line after the regex must survive');
  assert.ok(out.includes('/https?:\\/\\//g'), 'the regex itself must survive');
});

test('keeps a regex containing a quote without desynchronising', () => {
  const src = "const re = /['\"]/g;\nconst s = 'ok'; // gone\nconst after = 2;\n";
  const out = stripJsComments(src);
  assert.ok(out.includes("const s = 'ok';"), 'the string after the regex must survive');
  assert.ok(out.includes('const after = 2;'));
  assert.ok(!out.includes('gone'), 'the real comment must still be removed');
});

test('treats a slash after an identifier as division, not a regex', () => {
  const out = stripJsComments('const x = a / b; // gone\nconst y = 3;\n');
  assert.ok(out.includes('const x = a / b;'));
  assert.ok(out.includes('const y = 3;'));
  assert.ok(!out.includes('gone'));
});

test('preserves CRLF line endings on stripped lines', () => {
  const out = stripJsComments('let a = 1; // gone\r\nlet b = 2;\r\n');
  assert.ok(out.includes('\r\n'), 'CR must not be swallowed with the comment');
  assert.ok(!/[^\r]\n/.test(out), 'no line may end up LF-only');
});

test('throws instead of silently truncating on an unterminated block comment', () => {
  assert.throws(() => stripJsComments('let a = 1; /* never closed'), /non ferme|non fermé/);
});

test('treats division after ++ or -- as division, not a regex', () => {
  const out = stripJsComments('let r = a++ / b; // gone\nlet s = c-- / d;\n');
  assert.ok(out.includes('let r = a++ / b;'));
  assert.ok(out.includes('let s = c-- / d;'));
  assert.ok(!out.includes('gone'));
});
