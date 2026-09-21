'use strict';

// Outil de bascule : compare la réponse d'une fonction de LECTURE servie par
// l'ancien backend Apps Script et par le nouveau backend Vercel, sur le même
// classeur. Aucune fonction mutante n'est appelée — l'outil sert à décider
// d'une bascule, pas à écrire quoi que ce soit.

const VOLATILE_KEYS = ['version', 'checkedAt', 'generatedAt'];

function _describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'tableau(' + value.length + ')';
  return typeof value;
}

function _walk(a, b, volatile, path, out) {
  if (a === b) return;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) {
    out.push(path + ' : type ' + _describe(a) + ' vs ' + _describe(b));
    return;
  }
  if (a === null || typeof a !== 'object') {
    if (a !== b) out.push(path + ' : ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
    return;
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      out.push(path + ' : longueur ' + a.length + ' vs ' + b.length);
      return;
    }
    a.forEach((item, i) => _walk(item, b[i], volatile, path ? path + '.' + i : String(i), out));
    return;
  }
  const keys = Object.keys(a).concat(Object.keys(b).filter(k => !Object.prototype.hasOwnProperty.call(a, k)));
  keys.forEach(key => {
    if (volatile.indexOf(key) !== -1) return;
    const child = path ? path + '.' + key : key;
    const inA = Object.prototype.hasOwnProperty.call(a, key);
    const inB = Object.prototype.hasOwnProperty.call(b, key);
    if (!inA || !inB) {
      out.push(child + ' : présent seulement côté ' + (inA ? 'GAS' : 'Vercel'));
      return;
    }
    _walk(a[key], b[key], volatile, child, out);
  });
}

function compareResponses(gasValue, vercelValue, volatileKeys) {
  const differences = [];
  _walk(gasValue, vercelValue, volatileKeys || VOLATILE_KEYS, '', differences);
  return { equal: differences.length === 0, differences: differences };
}

async function _main(argv) {
  const [gasUrl, vercelUrl, fnName] = argv;
  if (!gasUrl || !vercelUrl || !fnName) {
    console.error('Usage : node scripts/compare-backends.js <url GAS /exec> <url Vercel> <fonction de lecture>');
    process.exit(2);
  }
  if (/^api(Add|Update|Delete|Save|Set|Create|Remove|Run|Merge|Clean|Restore|Undo)/.test(fnName)) {
    console.error('Refus : ' + fnName + ' ressemble à une fonction d\'écriture. Cet outil ne compare que des lectures.');
    process.exit(2);
  }
  const vercel = await fetch(vercelUrl.replace(/\/$/, '') + '/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn: fnName, args: [] })
  }).then(r => r.json());
  console.log('Vercel :', vercel.ok ? 'ok' : 'échec — ' + vercel.error);
  console.log('Comparer à la main avec la réponse de ' + gasUrl + ' (le backend GAS n\'expose pas d\'API JSON équivalente).');
  console.log(JSON.stringify(vercel.value, null, 2).slice(0, 4000));
}

if (require.main === module) _main(process.argv.slice(2));

module.exports = { compareResponses, VOLATILE_KEYS };
