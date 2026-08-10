'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const { loadGas }     = require('../harness.js');
const { buildSheets } = require('./fixtures.js');

const ROOT      = path.join(__dirname, '..', '..');
const STUB_PATH = path.join(__dirname, 'stub.js');

function buildGas() {
  const gas = loadGas();
  const sheets = buildSheets();
  gas.ConfigService.getSheets = () => sheets;
  return gas;
}

function servePage(res) {
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  const stub = fs.readFileSync(STUB_PATH, 'utf8');
  // The preamble must precede every script on the page: Index.html calls
  // google.script.run from window.onload, but also during parsing.
  const injected = html.replace('<head>', '<head>\n<script>\n' + stub + '\n</script>');
  if (injected === html) throw new Error('Index.html: balise <head> introuvable, injection impossible');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(injected);
}

function handleCall(gas, body, res) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'corps JSON invalide' }));
    return;
  }
  const fn = gas[parsed.fn];
  if (typeof fn !== 'function') {
    // A name missing from the harness is not the same failure as a name missing from Code.gs:
    // stating it explicitly avoids confusing a tooling gap with an application bug.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'non exposée par le harness : ' + parsed.fn }));
    return;
  }
  try {
    const value = fn.apply(null, parsed.args || []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, value: value === undefined ? null : value }));
  } catch (err) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: (err && err.message) || String(err) }));
  }
}

function startServer(port) {
  const gas = buildGas();
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
      servePage(res);
      return;
    }
    if (req.method === 'POST' && req.url === '/call') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => handleCall(gas, body, res));
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise(resolve => {
    server.listen(port || 0, '127.0.0.1', () => {
      resolve({ port: server.address().port, close: () => server.close() });
    });
  });
}

if (require.main === module) {
  startServer(Number(process.env.PORT) || 8137).then(s => {
    console.log('Frontend local : http://127.0.0.1:' + s.port + '/');
  });
}

module.exports = { startServer };
