// Zero-dependency local dev server: static files + the same /api/compare handler Vercel runs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { POST } from './api/compare.js';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 3000);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const PUBLIC = new Set(['/index.html', '/lib/scenarios.js']);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/compare' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, {
      method: 'POST',
      headers: req.headers,
      body: Buffer.concat(chunks),
    });
    const response = await POST(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
    return;
  }

  const path = url.pathname === '/' ? '/index.html' : normalize(url.pathname);
  if (!PUBLIC.has(path)) {
    res.writeHead(404).end('not found');
    return;
  }
  const body = await readFile(join(ROOT, path));
  res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(body);
}).listen(PORT, () => console.log(`jev-vs-llm on http://localhost:${PORT}`));
