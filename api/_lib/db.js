// Koneksi Postgres (Vercel Storage / Neon). Env: POSTGRES_URL atau DATABASE_URL. Tes memakai setDb() dengan PGlite.
import { neon } from '@neondatabase/serverless';
import { ApiError } from './errors.js';

let override = null;
let cached = null;

/** Hanya untuk tes / dev lokal: db = { query(text, params) -> Promise<rows[]> }. */
export function setDb(db) {
  override = db;
  cached = null;
}

export function dbConfigured() {
  return !!(override || process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

export function getDb() {
  if (override) return override;
  if (cached) return cached;
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new ApiError(503, 'db_not_configured', 'Database belum dikonfigurasi (POSTGRES_URL / DATABASE_URL)');
  const sql = neon(url);
  cached = { query: (text, params = []) => sql.query(text, params) };
  return cached;
}
