// Servidor local de desarrollo. Simula el runtime de Vercel:
// sirve /public como estático y monta cada archivo de /api como función serverless.
// Uso: node dev-server.js  →  http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PUBLIC = path.join(ROOT, "public");
const API = path.join(ROOT, "api");
const PORT = process.env.PORT || 3000;

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };

async function loadHandler(file) {
  const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`); // sin caché entre requests
  return mod.default;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    const fnName = pathname.replace("/api/", "").replace(/\/$/, "");
    const file = path.join(API, fnName + ".js");
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: `No existe api/${fnName}.js` }));
    }
    try {
      const handler = await loadHandler(file);
      const bodyBuf = await readBody(req);
      let body = {};
      if (bodyBuf.length) {
        try { body = JSON.parse(bodyBuf.toString("utf8")); } catch { body = {}; }
      }
      const vReq = { method: req.method, body, headers: req.headers, query: Object.fromEntries(url.searchParams) };
      const vRes = {
        _status: 200,
        _headers: {},
        _sent: false,
        status(code) { this._status = code; return this; },
        setHeader(k, v) { this._headers[k] = v; return this; },
        getHeader(k) { return this._headers[k]; },
        json(obj) {
          this.setHeader("content-type", "application/json");
          res.writeHead(this._status, this._headers);
          res.end(JSON.stringify(obj));
          this._sent = true;
        },
        end(v) {
          if (this._sent) return; // evita doble writeHead si json()/end() ya se llamó
          res.writeHead(this._status, this._headers);
          res.end(v);
          this._sent = true;
        },
      };
      await handler(vReq, vRes);
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Error interno: " + err.message }));
    }
    return;
  }

  // estáticos
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.join(PUBLIC, pathname);
  if (!filePath.startsWith(PUBLIC) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); return res.end("No encontrado");
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => console.log(`Angie corriendo en http://localhost:${PORT}`));
