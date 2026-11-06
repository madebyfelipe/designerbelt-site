// Local static server that mounts the real /api handlers (memory storage), mimicking Vercel's cleanUrls.
// Used by check-checkout.mjs. Not deployed (.vercelignore).
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activate, checkoutConfig, deactivate, licenseForTxn, paddleWebhook } from '../api/_lib/core.mjs';
import { memoryStore } from '../api/_lib/store.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

export function start({ env, port = 4180 }) {
  const ctx = { env, store: memoryStore(), now: () => Date.now() };
  const routes = { 'POST /api/activate': activate, 'POST /api/deactivate': deactivate, 'POST /api/paddle-webhook': paddleWebhook, 'GET /api/license': licenseForTxn, 'GET /api/checkout-config': (r, c) => checkoutConfig(c) };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const response = await handler(new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), ctx);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    let file = join(root, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
    if (url.pathname.includes('..') || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }); res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, () => ok({ server, ctx, url: `http://localhost:${port}` })));
}
