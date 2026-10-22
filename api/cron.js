// GET /api/cron?key=CRON_SECRET  (atau header Authorization: Bearer CRON_SECRET, dikirim otomatis oleh Vercel Cron)
// Menjalankan deteksi exception + notifikasi + pembersihan retensi POD. Panggil tiap 5 menit dari pinger eksternal (mis. cron-job.org);
// Vercel Hobby hanya mengizinkan cron harian, jadi vercel.json memuat cadangan harian.
import { timingSafeEqual } from 'node:crypto';
import { route } from './_lib/http.js';
import { ApiError } from './_lib/errors.js';
import { syncExceptions } from './_lib/insightsRepo.js';
import { purgeOldPods } from './_lib/podRepo.js';

const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export default route({
  GET: async ({ db, req, query }) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new ApiError(503, 'cron_not_configured', 'CRON_SECRET belum diisi');
    const given = String(query.key || '') || String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!given || !same(given, secret)) throw new ApiError(401, 'auth_invalid', 'Kunci tidak valid');
    await syncExceptions(db, { force: true });
    await purgeOldPods(db);
    return { ok: true, at: new Date().toISOString() };
  },
}, { auth: false, schema: true });
