#!/usr/bin/env node
/**
 * Zero-dependency static server for playing or testing the digital version
 * locally. The app loads the print files with fetch(), which browsers block on
 * file:// URLs, so it has to be served over http.
 *
 * Usage: node tools/serve.js [port]      then open http://localhost:8080
 *
 * Listens on 127.0.0.1 only, so the project folder is not exposed to your
 * network. Serves files inside the project folder and nothing else.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.zip': 'application/zip',
};

function resolveSafe(urlPath) {
  let rel;
  try { rel = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname); } catch { return null; }
  if (rel.includes('\0')) return null;
  const file = path.resolve(root, '.' + path.posix.normalize('/' + rel.replace(/\\/g, '/')));
  const inside = path.relative(root, file);
  if (inside.startsWith('..') || path.isAbsolute(inside)) return null;
  if (inside.split(path.sep).some(part => part.startsWith('.') && part !== '.nojekyll')) return null;
  return file;
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let file = resolveSafe(req.url);
  if (!file) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Forbidden'); }
  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}).listen(port, '127.0.0.1', () => console.log(`Project Synapse on http://localhost:${port}`));
