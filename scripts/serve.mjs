#!/usr/bin/env node
// Local preview server. No dependencies. Mirrors the hosting rules in _redirects:
//   /p/{domain}/  → p/index.html
//   /dir          → 301 /dir/
//   missing       → 404.html
// /api/check is proxied to the worker when WORKER_URL is set (e.g. http://127.0.0.1:8787
// from `npx wrangler dev` in worker/). Otherwise it answers 503.
//
// Usage: node scripts/serve.mjs [--port 8080] [--data path/to/data-dir]
//   --data serves /data/* from another directory, to preview with real collected data
//   before it is committed.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(opt("--port", process.env.PORT || 8080));
const DATA = opt("--data", null);
const WORKER_URL = process.env.WORKER_URL || null;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8"
};
const PRIVATE = /^\/(worker|scripts|research|node_modules|\.git)(\/|$)|^\/(_headers|_redirects|AGENTS\.md|BRAND\.md|SPEC\.md|package\.json)$/;

async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}
async function isDir(p) {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function send(res, status, file, extra = {}) {
  const body = await readFile(file);
  res.writeHead(status, {
    "content-type": TYPES[path.extname(file)] || "application/octet-stream",
    "x-robots-tag": "noindex, nofollow",
    "cache-control": "no-store",
    ...extra
  });
  res.end(body);
}

async function proxy(req, res, url) {
  if (!WORKER_URL) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "worker_not_running", message: "Start the worker with `npx wrangler dev` in worker/ and set WORKER_URL." }));
    return;
  }
  const upstream = await fetch(new URL(url.pathname + url.search, WORKER_URL), { headers: { "cf-connecting-ip": req.socket.remoteAddress || "local" } });
  res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.includes("\0") || pathname.split("/").includes("..")) { res.writeHead(400); res.end(); return; }
    if (pathname.startsWith("/api/")) return await proxy(req, res, url);
    if (PRIVATE.test(pathname)) return await send(res, 404, path.join(ROOT, "404.html"));

    if (/^\/p\/[^/]+\/?$/.test(pathname)) {
      if (!pathname.endsWith("/")) { res.writeHead(301, { location: pathname + "/" + url.search }); res.end(); return; }
      return await send(res, 200, path.join(ROOT, "p", "index.html"));
    }

    const base = DATA && pathname.startsWith("/data/") ? path.resolve(DATA) : ROOT;
    const rel = DATA && pathname.startsWith("/data/") ? pathname.slice("/data/".length) : pathname.slice(1);
    let file = path.join(base, rel);
    if (!file.startsWith(base)) { res.writeHead(400); res.end(); return; }

    if (await isDir(file)) {
      if (!pathname.endsWith("/")) { res.writeHead(301, { location: pathname + "/" + url.search }); res.end(); return; }
      file = path.join(file, "index.html");
    }
    if (await isFile(file)) return await send(res, 200, file);
    return await send(res, 404, path.join(ROOT, "404.html"));
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Server error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT}/${DATA ? ` (data from ${DATA})` : ""}`);
});
