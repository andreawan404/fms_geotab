import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { setDb } from '../api/_lib/db.js';
import { setVerifier } from '../api/_lib/auth.js';
import connectorsH from '../api/connectors.js';
import orderH from '../api/orders/[id].js';
import ordersH from '../api/orders/index.js';
import cronH from '../api/cron.js';
import { setConnectorFetch, isPrivateIp, assertPublicUrl } from '../api/_lib/safeFetch.js';
import { decrypt, encrypt } from '../api/_lib/crypto.js';
import { getPath, mapRecord, normPlate, parseTime, fillTemplate } from '../src/core/extMap.js';

let pg;
beforeAll(async () => {
  pg = new PGlite();
  setDb({ query: async (text, params = []) => (await pg.query(text, params)).rows });
});
const creds = `Geotab ${Buffer.from(encodeURIComponent(JSON.stringify({ database: 'sma_db', userName: 'aan@sma.id', sessionId: 'good' }))).toString('base64')}`;
async function call(handler, { method = 'GET', query = {}, body } = {}) {
  const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, end(b) { this.body = b ? JSON.parse(b) : null; } };
  await handler({ method, query, body, headers: { authorization: creds } }, res);
  return res;
}
const calls = [];
let payload;
beforeEach(async () => {
  process.env.ALLOWED_DATABASES = 'sma_db';
  process.env.ENCRYPTION_KEY = 'kunci-enkripsi-tes-1234567890';
  process.env.CRON_SECRET = 'rahasia123';
  setVerifier(async () => {});
  calls.length = 0;
  payload = { data: { items: [
    { id: 'T-1', do_number: 'SO-001', customer: { name: 'PT Contoh' }, vehicle: { plate: 'B 1234 ABC' }, status: 'ON_THE_WAY', created_at: '2026-10-22 08:00:00',
      stops: [{ kind: 'LOAD', name: 'Gudang A', lat: '-6.30', lng: '107.10', eta_to: '2026-10-22 10:00:00', goods: [{ name: 'Air', qty: 10, unit: 'box' }] },
        { kind: 'DROP', name: 'Toko B', lat: -6.2, lng: 106.9, eta_to: '2026-10-22T14:00:00+07:00' }] },
    { id: 'T-2', do_number: 'SO-002', customer: { name: 'PT Contoh' }, vehicle: { plate: 'B 9 XY' }, status: 'NEW', stops: [] },
  ] } };
  setConnectorFetch(async (url, init) => { calls.push({ url, ...init }); return payload; });
  if ((await pg.query("SELECT to_regclass('public.orders') AS t")).rows[0].t) await pg.exec('TRUNCATE orders, connectors, app_settings, audit_log CASCADE');
});

const CONFIG = {
  request: { path: '/v1/deliveries', query: { updated_since: '{{since}}', day: '{{today}}' } },
  itemsPath: 'data.items',
  mapping: {
    timezoneMin: 420,
    order: { externalId: 'id', doNo: 'do_number', customer: 'customer.name', date: 'created_at', plate: 'vehicle.plate', status: 'status', statusMap: { ON_THE_WAY: 'running', DELIVERED: 'done', CANCELLED: 'cancelled' }, defaultStatus: 'assigned' },
    stops: { path: 'stops', typeField: 'kind', typeMap: { LOAD: 'pickup', DROP: 'delivery' }, name: 'name', lat: 'lat', lng: 'lng', windowEnd: 'eta_to' },
    items: { path: 'goods', description: 'name', qty: 'qty', unit: 'unit' },
  },
};
const save = (extra = {}) => call(connectorsH, { method: 'POST', body: { action: 'save', name: 'TMS Contoh', baseUrl: 'https://tms.contoh.co.id', authType: 'bearer', secret: 'tok-RAHASIA', config: CONFIG, intervalMin: 10, ...extra } });

describe('pemetaan murni', () => {
  it('getPath, waktu, plat, template', () => {
    expect(getPath({ a: { b: [{ c: 5 }] } }, 'a.b[0].c')).toBe(5);
    expect(getPath({ a: 1 }, 'x.y')).toBeUndefined();
    expect(parseTime('2026-10-22 10:00:00')).toBe('2026-10-22T03:00:00.000Z'); // WIB
    expect(parseTime('2026-10-22T10:00:00Z')).toBe('2026-10-22T10:00:00.000Z');
    expect(parseTime(1761100800)).toBe('2025-10-22T02:40:00.000Z');
    expect(parseTime('')).toBe('');
    expect(normPlate('b-1234 abc')).toBe('B1234ABC');
    expect(fillTemplate('a={{today}}&s={{since}}', { since: 'S', now: Date.parse('2026-10-22T00:00:00Z') })).toBe('a=2026-10-22&s=S');
  });
  it('mapRecord', () => {
    const m = mapRecord(payload.data.items[0], CONFIG.mapping);
    expect(m).toMatchObject({ ok: true, externalId: 'T-1', status: 'running', plate: 'B 1234 ABC', problems: [] });
    expect(m.order.stops.map((s) => s.type)).toEqual(['pickup', 'delivery']);
    expect(m.order.stops[0]).toMatchObject({ lat: -6.3, lng: 107.1, windowEnd: '2026-10-22T03:00:00.000Z' });
    expect(m.order.stops[1].windowEnd).toBe('2026-10-22T07:00:00.000Z');
    expect(mapRecord(payload.data.items[1], CONFIG.mapping)).toMatchObject({ ok: false });
  });
});

describe('keamanan', () => {
  it('enkripsi bolak-balik dan SSRF', async () => {
    expect(decrypt(encrypt('abc'))).toBe('abc');
    expect(() => decrypt('v1.x.y.z')).toThrow();
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    await expect(assertPublicUrl('http://example.com')).rejects.toMatchObject({ code: 'connector_url' });
    await expect(assertPublicUrl('https://127.0.0.1/x')).rejects.toMatchObject({ code: 'connector_private' });
    await expect(assertPublicUrl('https://u:p@example.com')).rejects.toMatchObject({ code: 'connector_url' });
  });
  it('simpan konektor: rahasia terenkripsi dan tidak pernah dikembalikan; butuh ENCRYPTION_KEY', async () => {
    const r = await save();
    expect(r.code).toBe(200);
    const raw = (await pg.query('SELECT secret_enc FROM connectors')).rows[0].secret_enc;
    expect(raw).not.toContain('RAHASIA');
    expect(decrypt(raw)).toBe('tok-RAHASIA');
    const list = (await call(connectorsH)).body;
    expect(JSON.stringify(list)).not.toContain('RAHASIA');
    expect(list.connectors[0]).toMatchObject({ name: 'TMS Contoh', hasSecret: true, authType: 'bearer' });
    expect(list.mode).toBe('full');
    delete process.env.ENCRYPTION_KEY;
    expect((await save({ name: 'Lain' })).code).toBe(503);
    expect((await call(connectorsH, { method: 'POST', body: { action: 'save', name: 'X', baseUrl: 'http://x.co', config: {} } })).code).toBe(422);
  });
});

describe('sinkronisasi', () => {
  it('uji (pratinjau) + jalankan: buat, perbarui, tidak berubah, perubahan rute melepas tautan', async () => {
    const id = (await save()).body.id;
    const t = await call(connectorsH, { method: 'POST', body: { action: 'test', id } });
    expect(t.body.count).toBe(2);
    expect(t.body.mapped[0]).toMatchObject({ doNo: 'SO-001', plate: 'B 1234 ABC', status: 'running' });
    expect(t.body.mapped[1].problems).toContain('stops');
    expect(calls[0].headers.Authorization).toBe('Bearer tok-RAHASIA');
    const u = new URL(calls[0].url);
    expect(u.origin + u.pathname).toBe('https://tms.contoh.co.id/v1/deliveries');
    expect(u.searchParams.get('day')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(u.searchParams.get('updated_since')).toMatch(/^\d{4}-/);

    const r1 = await call(connectorsH, { method: 'POST', body: { action: 'run', id } });
    expect(r1.body).toMatchObject({ ok: true, fetched: 2, created: 1, skipped: 1 });
    const list = (await call(ordersH, { query: {} })).body.orders;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ doNo: 'SO-001', source: 'external', status: 'running', plate: 'B 1234 ABC', customer: 'PT Contoh' });
    const oid = list[0].id;
    const full = (await call(orderH, { query: { id: oid } })).body.order;
    expect(full.stops).toHaveLength(2);
    expect(full.stops[0].items[0]).toMatchObject({ description: 'Air', qty: 10 });

    expect((await call(connectorsH, { method: 'POST', body: { action: 'run', id } })).body).toMatchObject({ created: 0, unchanged: 1 });
    // status berubah di TMS customer
    payload.data.items[0].status = 'DELIVERED';
    expect((await call(connectorsH, { method: 'POST', body: { action: 'run', id } })).body).toMatchObject({ updated: 1 });
    expect((await call(orderH, { query: { id: oid } })).body.order).toMatchObject({ status: 'done' });
    expect((await call(orderH, { query: { id: oid } })).body.order.finishedAt).toBeTruthy();
    // tautan rute dibuat -> lalu stop berubah: tautan dilepas
    payload.data.items[0].status = 'ON_THE_WAY';
    await pg.query(`UPDATE orders SET linked_route_id = 'r1', linked_device_id = 'b1', status = 'running', finished_at = NULL`);
    payload.data.items[0].stops[1].lat = -6.5;
    expect((await call(connectorsH, { method: 'POST', body: { action: 'run', id } })).body).toMatchObject({ updated: 1 });
    const after = (await call(orderH, { query: { id: oid } })).body.order;
    expect(after.linkedRouteId).toBe('');
    expect(after.stops[1].lat).toBe(-6.5);
  });

  it('galat API tercatat di konektor; path daftar salah', async () => {
    const id = (await save()).body.id;
    setConnectorFetch(async () => ({ nothing: true }));
    const r = await call(connectorsH, { method: 'POST', body: { action: 'run', id } });
    expect(r.code).toBe(502);
    expect(r.body.error.code).toBe('connector_items');
    const c = (await call(connectorsH)).body.connectors[0];
    expect(c).toMatchObject({ lastStatus: 'error' });
    expect(c.lastError).toContain('Path daftar');
  });

  it('cron menjalankan konektor yang jatuh tempo saja; nomor DO bentrok diberi akhiran', async () => {
    await save();
    await save({ name: 'Nonaktif', enabled: false });
    const cron = async () => { const res = { setHeader() {}, status(c) { this.code = c; return this; }, end(b) { this.body = JSON.parse(b); } }; await cronH({ method: 'GET', query: { key: 'rahasia123' }, headers: {} }, res); return res.body; };
    const a = await cron();
    expect(a.connectors).toHaveLength(1);
    expect(a.connectors[0]).toMatchObject({ ok: true, created: 1 });
    expect((await cron()).connectors).toHaveLength(0); // belum jatuh tempo
    // DO internal dengan nomor sama dengan DO eksternal baru
    await call(ordersH, { method: 'POST', body: { doNo: 'SO-777', customer: 'X', orderDate: '2026-10-22', stops: [{ type: 'pickup', name: 'A', lat: -6.1, lng: 106.8, items: [{ description: 'a', qty: 1, unit: 'pcs' }] }, { type: 'delivery', name: 'B', lat: -6.2, lng: 106.9, items: [{ description: 'a', qty: 1, unit: 'pcs' }] }] } });
    payload.data.items = [{ ...payload.data.items[0], id: 'T-9', do_number: 'SO-777' }];
    const id2 = (await call(connectorsH)).body.connectors.find((c) => c.name === 'TMS Contoh').id;
    await call(connectorsH, { method: 'POST', body: { action: 'run', id: id2 } });
    const nos = (await call(ordersH, { query: {} })).body.orders.map((o) => o.doNo).sort();
    expect(nos).toEqual(['SO-001', 'SO-777', 'SO-777-T-9']);
  });

  it('mode aplikasi', async () => {
    expect((await call(connectorsH, { query: { r: 'mode' } })).body.mode).toBe('full');
    expect((await call(connectorsH, { method: 'POST', body: { action: 'set_mode', mode: 'monitor' } })).code).toBe(200);
    expect((await call(connectorsH, { query: { r: 'mode' } })).body.mode).toBe('monitor');
    expect((await call(connectorsH, { method: 'POST', body: { action: 'set_mode', mode: 'x' } })).code).toBe(422);
  });
});
