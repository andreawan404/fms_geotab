// Server uji lokal: menyajikan dist/ dan menjalankan handler api/ di atas PGlite (tanpa Vercel / Neon). Hanya untuk pengembangan.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { setDb } from '../api/_lib/db.js';
import { setVerifier } from '../api/_lib/auth.js';
import { setMailer } from '../api/_lib/mailer.js';

const pg = new PGlite();
setDb({ query: async (t, p = []) => (await pg.query(t, p)).rows });
setVerifier(async () => {});
process.env.ALLOWED_DATABASES = 'dev';
const mails = [];
setMailer(async (m) => { mails.push(m); return { status: 'sent' }; });
const routes = {
  '/api/portal': (await import('../api/portal.js')).default,
  '/api/orders': (await import('../api/orders/index.js')).default,
  '/api/dispatch': (await import('../api/dispatch.js')).default,
  '/api/pod': (await import('../api/pod.js')).default,
  '/api/master': (await import('../api/master/[kind].js')).default,
  '/api/health': (await import('../api/health.js')).default,
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PORT = Number(process.env.PORT || 5300);
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__mails') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(mails)); }
  const mm = u.pathname.match(/^\/api\/master\/(\w+)$/);
  if (mm) u.searchParams.set('kind', mm[1]);
  const h = routes[mm ? '/api/master' : u.pathname];
  if (h) {
    let body = '';
    for await (const c of req) body += c;
    const r = { method: req.method, query: Object.fromEntries(u.searchParams), headers: req.headers, body: body || undefined };
    const s = { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return this; }, end: (b) => res.end(b) };
    return h(r, s);
  }
  const f = path.join('dist', u.pathname === '/' ? 'index.html' : u.pathname);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', mime[path.extname(f)] || 'application/octet-stream'); return fs.createReadStream(f).pipe(res); }
  res.statusCode = 404; res.end('404');
}).listen(PORT, '127.0.0.1', () => console.log('dev-api on', PORT));
