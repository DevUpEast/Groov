// Tiny static server for mockup-dist/ (no dependencies).
// Usage: node scripts/mockup-serve.mjs [port] [dir] [basePath]
//   basePath defaults to "/Groov" so URLs match the GitHub Pages deployment.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS = { port: 8787, dir: path.join(here, '..', 'mockup-dist'), base: '/Groov' };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json' };

export function startServer(opts = {}) {
  const port = Number(typeof opts === 'number' ? opts : (opts.port ?? DEFAULTS.port));
  const dir = path.resolve(opts.dir ?? DEFAULTS.dir);
  const base = opts.base ?? DEFAULTS.base;
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (base && urlPath.startsWith(base)) urlPath = urlPath.slice(base.length) || '/';
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const file = path.join(dir, urlPath);
    if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found: ' + urlPath); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.argv[2] || process.env.PORT || DEFAULTS.port);
  const dir = path.resolve(process.argv[3] || DEFAULTS.dir);
  const base = process.argv[4] ?? DEFAULTS.base;
  startServer({ port, dir, base }).then(() => console.log(`Serving ${dir} at http://localhost:${port}${base}/`));
}
