// Placeholder backend. Bot games run entirely in the browser, so for now this
// only answers a health check, which lets us prove the homeserver + Cloudflare
// tunnel + CORS path works end to end before any real multiplayer code exists.
// No dependencies on purpose: the homeserver has Node 18 and nothing else.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8003);
const ORIGINS = new Set(
  (process.env.CORS_ORIGINS ?? 'https://304.leweixu.com,http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
);

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: '304-api' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '0.0.0.0', () => console.log(`304-api listening on :${PORT}`));
