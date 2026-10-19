// GET /api/health: status koneksi database, skema, dan konfigurasi otentikasi (tanpa membuka nilai rahasia).
import { route } from './_lib/http.js';
import { dbConfigured, getDb } from './_lib/db.js';
import { ensureSchema, MIGRATIONS } from './_lib/schema.js';
import { allowedDatabases } from './_lib/auth.js';

export default route(
  {
    GET: async () => {
      const out = { ok: true, db: 'not_configured', schemaVersion: null, auth: allowedDatabases().length ? 'configured' : 'missing_ALLOWED_DATABASES', time: new Date().toISOString() };
      if (!dbConfigured()) {
        out.ok = false;
        return out;
      }
      try {
        const db = getDb();
        await db.query('SELECT 1');
        await ensureSchema(db);
        out.db = 'ok';
        out.schemaVersion = MIGRATIONS[MIGRATIONS.length - 1].version;
      } catch (e) {
        out.ok = false;
        out.db = 'error';
        out.dbError = String(e.message || e).slice(0, 200);
      }
      if (out.auth !== 'configured') out.ok = false;
      return out;
    },
  },
  { auth: false },
);
