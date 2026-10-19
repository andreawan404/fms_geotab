// Otentikasi admin: sesi MyGeotab dari add-in diverifikasi ke server Geotab; database harus ada di ALLOWED_DATABASES.
import { ApiError } from './errors.js';

const HOST_RE = /^[a-z0-9-]+\.geotab\.com$/i;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();
let verifier = null;

/** Hanya untuk tes: ganti pemanggilan ke Geotab. verifier(creds) -> Promise<void> (lempar bila tidak sah). */
export function setVerifier(fn) {
  verifier = fn;
  cache.clear();
}

export function allowedDatabases() {
  return (process.env.ALLOWED_DATABASES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function parseCreds(req) {
  const h = String(req.headers?.authorization || req.headers?.Authorization || '');
  const m = /^Geotab\s+(.+)$/i.exec(h);
  if (!m) throw new ApiError(401, 'auth_required', 'Login MyGeotab diperlukan');
  try {
    const c = JSON.parse(decodeURIComponent(Buffer.from(m[1], 'base64').toString('utf8')));
    if (!c.database || !c.userName || !c.sessionId) throw new Error('incomplete');
    return { database: String(c.database), userName: String(c.userName), sessionId: String(c.sessionId), server: c.server ? String(c.server) : '' };
  } catch {
    throw new ApiError(401, 'auth_invalid', 'Kredensial tidak valid');
  }
}

async function verifyWithGeotab(c) {
  const host = (c.server || 'my.geotab.com').replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '');
  if (!HOST_RE.test(host)) throw new ApiError(401, 'auth_invalid', 'Server Geotab tidak dikenali');
  const r = await fetch(`https://${host}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'Get', params: { typeName: 'User', search: { name: c.userName }, resultsLimit: 1, credentials: { database: c.database, userName: c.userName, sessionId: c.sessionId } } }),
  }).catch(() => {
    throw new ApiError(502, 'geotab_unreachable', 'Server Geotab tidak dapat dihubungi');
  });
  const j = await r.json().catch(() => ({}));
  if (j.error || !Array.isArray(j.result)) throw new ApiError(401, 'auth_invalid', 'Sesi MyGeotab tidak valid atau kedaluwarsa');
}

/** -> { userName, database } atau lempar ApiError 401/403/503. */
export async function authenticate(req) {
  if (process.env.AUTH_BYPASS === '1' && !process.env.VERCEL) return { userName: 'dev@local', database: 'dev' };
  const allowed = allowedDatabases();
  if (!allowed.length) throw new ApiError(503, 'auth_not_configured', 'ALLOWED_DATABASES belum diisi di environment Vercel');
  const c = parseCreds(req);
  if (!allowed.includes(c.database.toLowerCase())) throw new ApiError(403, 'database_not_allowed', 'Database tidak diizinkan');
  const key = `${c.database}|${c.userName}|${c.sessionId}`;
  const hit = cache.get(key);
  if (!hit || hit < Date.now()) {
    try {
      await (verifier || verifyWithGeotab)(c);
    } catch (e) {
      throw e instanceof ApiError ? e : new ApiError(401, 'auth_invalid', 'Sesi MyGeotab tidak valid atau kedaluwarsa');
    }
    cache.set(key, Date.now() + CACHE_MS);
    if (cache.size > 500) for (const [k, v] of cache) if (v < Date.now()) cache.delete(k);
  }
  return { userName: c.userName, database: c.database };
}
