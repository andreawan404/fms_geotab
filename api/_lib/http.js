// Pembungkus handler Vercel: CORS, parsing body, error JSON seragam, otentikasi admin (Geotab).
import { getDb } from './db.js';
import { ensureSchema } from './schema.js';
import { authenticate } from './auth.js';
import { ApiError } from './errors.js';

export { ApiError };

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Cache-Control', 'no-store');
}
function send(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** route({ GET: async ({req, db, user, query, body}) => data, POST: ... }, { auth: true }) -> handler Vercel */
export function route(handlers, { auth = true } = {}) {
  return async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.status(204);
      res.end();
      return;
    }
    try {
      const fn = handlers[req.method];
      if (!fn) throw new ApiError(405, 'method_not_allowed');
      const user = auth ? await authenticate(req) : null;
      const db = getDb();
      if (auth) await ensureSchema(db);
      let body = req.body;
      if (typeof body === 'string' && body) {
        try {
          body = JSON.parse(body);
        } catch {
          throw new ApiError(400, 'bad_json');
        }
      }
      const data = await fn({ req, db, user, query: req.query || {}, body: body || {} });
      send(res, 200, data ?? { ok: true });
    } catch (e) {
      if (e instanceof ApiError) return send(res, e.status, { error: { code: e.code, message: e.message, details: e.details } });
      console.error('[api]', e);
      return send(res, 500, { error: { code: 'internal', message: 'Terjadi kesalahan di server' } });
    }
  };
}
