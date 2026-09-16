'use strict';

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { startServer } = require("./serve.js");

const BROWSER_PATH = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find(p => fs.existsSync(p));

if (!BROWSER_PATH) {
  console.error("Aucun navigateur trouvé pour la capture.");
  process.exit(1);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function runScenario({ name, scriptFn, outputFile, mobile, reloadFirst = false, width = 1280, height = 800 }) {
  const server = await startServer(0);
  const port = server.port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "top-bench-"));
  const debugPort = 9222 + Math.floor(Math.random() * 500);

  const args = [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tmpDir}`,
    `--window-size=${width},${height}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `http://127.0.0.1:${port}/`
  ];

  const proc = spawn(BROWSER_PATH, args, { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const list = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      const target = list.find(t => t.type === "page");
      if (target && target.webSocketDebuggerUrl) {
        wsUrl = target.webSocketDebuggerUrl;
        break;
      }
    } catch (_) {}
  }

  if (!wsUrl) {
    proc.kill();
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("Impossible de se connecter au navigateur headless CDP.");
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let idCounter = 1;
  const pending = new Map();
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send("Page.enable");
  await send("Runtime.enable");

  // Attendre le chargement initial
  if (reloadFirst) {
    await new Promise(r => setTimeout(r, 1200));
    await send("Page.reload");
    await new Promise(r => setTimeout(r, 1200));
  }
  await new Promise(r => setTimeout(r, 1200));

  if (mobile) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await send("Runtime.evaluate", {
      expression: "document.body.classList.add('mobile-layout'); window.dispatchEvent(new Event('resize'));"
    });
    await new Promise(r => setTimeout(r, 200));
  }

  if (scriptFn) {
    const expr = typeof scriptFn === "string" ? scriptFn : `(${scriptFn.toString()})()`;
    await send("Runtime.evaluate", { expression: expr, awaitPromise: true });
    await new Promise(r => setTimeout(r, 500));
  }

  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, Buffer.from(data, "base64"));
  console.log(`Capture sauvegardée : ${outputFile}`);

  ws.close();
  proc.kill();
  server.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { runScenario };
