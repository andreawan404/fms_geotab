import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { setDb } from '../api/_lib/db.js';
import { setVerifier } from '../api/_lib/auth.js';
import health from '../api/health.js';
import ordersH from '../api/orders/index.js';
import orderH from '../api/orders/[id].js';
import importH from '../api/orders/import.js';

let pg;
beforeAll(async () => {
  pg = new PGlite();
  setDb({ query: async (text, params = []) => (await pg.query(text, params)).rows });
});
beforeEach(async () => {
  process.env.ALLOWED_DATABASES = 'sma_db';
  setVerifier(async (c) => {
    if (c.sessionId !== 'good') throw new Error('bad session');
  });
  const has = await pg.query("SELECT to_regclass('public.orders') AS t");
  if (has.rows[0].t) await pg.exec('TRUNCATE orders CASCADE; TRUNCATE audit_log');
});

const creds = (o = {}) => `Geotab ${Buffer.from(encodeURIComponent(JSON.stringify({ database: 'sma_db', userName: 'aan@sma.id', sessionId: 'good', ...o }))).toString('base64')}`;
async function call(handler, { method = 'GET', query = {}, body, auth = creds() } = {}) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, end(b) { this.body = b ? JSON.parse(b) : null; } };
  await handler({ method, query, body, headers: auth ? { authorization: auth } : {} }, res);
  return res;
}
const item = (o = {}) => ({ description: 'Air mineral', qty: 10, unit: 'box', weightKg: 100, volumeM3: 1, pallets: 1, colli: 10, ...o });
const mkOrder = (o = {}) => ({
  doNo: 'DO-001', customer: 'PT A', orderDate: '2026-10-20', priority: 'normal',
  stops: [
    { type: 'pickup', name: 'Gudang', lat: -6.3, lng: 107.1, items: [item({ weightKg: 300, pallets: 3 })], windowStart: '2026-10-20T01:00:00.000Z', windowEnd: '2026-10-20T02:00:00.000Z' },
    { type: 'delivery', name: 'Toko 1', lat: -6.2, lng: 106.9, items: [item({ weightKg: 100, pallets: 1 })] },
    { type: 'delivery', name: 'Toko 2', lat: -6.5, lng: 106.8, items: [item({ weightKg: 200, pallets: 2 }), item({ description: 'Mie', weightKg: 0, pallets: 0 })] },
  ],
  ...o,
});

describe('API order', () => {
  it('health: tanpa otentikasi, menjalankan migrasi', async () => {
    const r = await call(health, { auth: null });
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ ok: true, db: 'ok', schemaVersion: 7, auth: 'configured' });
  });

  it('otentikasi: tanpa header 401, sesi salah 401, database lain 403, belum dikonfigurasi 503', async () => {
    expect((await call(ordersH, { auth: null })).code).toBe(401);
    expect((await call(ordersH, { auth: creds({ sessionId: 'bad' }) })).body.error.code).toBe('auth_invalid');
    expect((await call(ordersH, { auth: creds({ database: 'lain' }) })).code).toBe(403);
    process.env.ALLOWED_DATABASES = '';
    expect((await call(ordersH)).code).toBe(503);
    expect((await call(ordersH, { method: 'OPTIONS', auth: null })).code).toBe(204);
  });

  it('buat, baca, daftar DO multi-leg dengan total kapasitas', async () => {
    const c = await call(ordersH, { method: 'POST', body: mkOrder() });
    expect(c.code).toBe(200);
    const o = c.body.order;
    expect(o).toMatchObject({ doNo: 'DO-001', status: 'draft', version: 1, createdBy: 'aan@sma.id', orderDate: '2026-10-20' });
    expect(o.stops.map((s) => s.name)).toEqual(['Gudang', 'Toko 1', 'Toko 2']);
    expect(o.stops[2].items.map((i) => i.description)).toEqual(['Air mineral', 'Mie']);
    expect(o.stops[0].windowStart).toBe('2026-10-20T01:00:00.000Z');
    expect(o.stops[0].lat).toBeCloseTo(-6.3);
    expect(o.summary).toMatchObject({ origin: 'Gudang', destination: 'Toko 2', legs: 2, loadedWeight: 300, peakWeight: 300, peakPallets: 3 });

    const g = await call(orderH, { query: { id: o.id } });
    expect(g.body.order.stops.length).toBe(3);
    const l = await call(ordersH, { query: { q: 'pt a' } });
    expect(l.body).toMatchObject({ total: 1, counts: { draft: 1 } });
    expect(l.body.orders[0].summary.destination).toBe('Toko 2');
    expect((await call(ordersH, { query: { q: 'zzz' } })).body.total).toBe(0);
    expect((await call(ordersH, { query: { status: 'done' } })).body.total).toBe(0);
    expect((await call(ordersH, { query: { from: '2026-10-21' } })).body.total).toBe(0);
  });

  it('validasi 422 dan nomor DO ganda 409 (tak peka huruf besar/kecil)', async () => {
    const bad = await call(ordersH, { method: 'POST', body: mkOrder({ customer: '' }) });
    expect(bad.code).toBe(422);
    expect(bad.body.error.details.map((d) => d.code)).toContain('customer_required');
    await call(ordersH, { method: 'POST', body: mkOrder() });
    const dup = await call(ordersH, { method: 'POST', body: mkOrder({ doNo: 'do-001' }) });
    expect(dup.code).toBe(409);
    expect(dup.body.error.code).toBe('do_no_duplicate');
  });

  it('ubah DO: stop diganti, versi naik, bentrok versi 409, tidak boleh bila bukan draft', async () => {
    const o = (await call(ordersH, { method: 'POST', body: mkOrder() })).body.order;
    const upd = mkOrder({ customer: 'PT B', stops: mkOrder().stops.slice(0, 2).map((s, i) => (i === 1 ? { ...s, items: [item({ weightKg: 300, pallets: 3 })] } : s)) });
    const u = await call(orderH, { method: 'PUT', query: { id: o.id }, body: { ...upd, version: 1 } });
    expect(u.code).toBe(200);
    expect(u.body.order).toMatchObject({ customer: 'PT B', version: 2 });
    expect(u.body.order.stops.length).toBe(2);
    const stale = await call(orderH, { method: 'PUT', query: { id: o.id }, body: { ...upd, version: 1 } });
    expect(stale.code).toBe(409);
    expect(stale.body.error.code).toBe('version_conflict');
    expect((await pg.query('SELECT count(*)::int AS n FROM stops')).rows[0].n).toBe(2);
    await pg.query("UPDATE orders SET status = 'offered' WHERE id = $1", [o.id]);
    const locked = await call(orderH, { method: 'PUT', query: { id: o.id }, body: { ...upd, version: 2 } });
    expect(locked.body.error.code).toBe('not_draft');
    expect((await call(orderH, { method: 'DELETE', query: { id: o.id } })).body.error.code).toBe('not_draft');
  });

  it('hapus draft membersihkan stop dan item; id tidak valid 400; tidak ada 404', async () => {
    const o = (await call(ordersH, { method: 'POST', body: mkOrder() })).body.order;
    expect((await call(orderH, { method: 'DELETE', query: { id: o.id } })).code).toBe(200);
    expect((await pg.query('SELECT (SELECT count(*) FROM stops)::int AS s, (SELECT count(*) FROM items)::int AS i')).rows[0]).toEqual({ s: 0, i: 0 });
    expect((await call(orderH, { query: { id: o.id } })).code).toBe(404);
    expect((await call(orderH, { query: { id: 'x' } })).code).toBe(400);
    expect((await pg.query("SELECT action FROM audit_log ORDER BY id")).rows.map((r) => r.action)).toEqual(['create', 'delete']);
  });

  it('import massal: sebagian sukses, duplikat dan tidak valid dilaporkan per DO', async () => {
    await call(ordersH, { method: 'POST', body: mkOrder() });
    const r = await call(importH, { method: 'POST', body: { orders: [mkOrder({ doNo: 'DO-001' }), mkOrder({ doNo: 'DO-002' }), mkOrder({ doNo: 'DO-003', customer: '' })] } });
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ created: 1, failed: 2 });
    expect(r.body.results.map((x) => x.code || 'ok')).toEqual(['do_no_duplicate', 'ok', 'validation']);
    expect((await call(importH, { method: 'POST', body: { orders: [] } })).code).toBe(400);
  });
});
