import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { setDb, getDb } from '../api/_lib/db.js';
import { setVerifier } from '../api/_lib/auth.js';
import { setMailer } from '../api/_lib/mailer.js';
import ordersH from '../api/orders/index.js';
import orderH from '../api/orders/[id].js';
import masterH from '../api/master/[kind].js';
import dispatchH from '../api/dispatch.js';
import portalH from '../api/portal.js';
import insightsH from '../api/insights.js';
import { detectExceptions } from '../src/core/exceptions.js';
import { resetSyncThrottle } from '../api/_lib/insightsRepo.js';

let pg;
beforeAll(async () => {
  pg = new PGlite();
  setDb({ query: async (text, params = []) => (await pg.query(text, params)).rows });
});
const sent = [];
beforeEach(async () => {
  process.env.ALLOWED_DATABASES = 'sma_db';
  sent.length = 0;
  setMailer(async (m) => { sent.push(m); return { status: 'sent' }; });
  setVerifier(async () => {});
  const has = await pg.query("SELECT to_regclass('public.orders') AS t");
  if (has.rows[0].t) await pg.exec('TRUNCATE orders, vendors, audit_log, email_log CASCADE');
});
const creds = `Geotab ${Buffer.from(encodeURIComponent(JSON.stringify({ database: 'sma_db', userName: 'aan@sma.id', sessionId: 'good' }))).toString('base64')}`;
async function call(handler, { method = 'GET', query = {}, body, auth = true } = {}) {
  const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, end(b) { this.body = b ? JSON.parse(b) : null; } };
  await handler({ method, query, body, headers: auth ? { authorization: creds } : {} }, res);
  return res;
}
const img = (b, n = 3) => Buffer.concat([Buffer.from(b), Buffer.alloc(300, n)]).toString('base64');
const JPG = (n) => img([0xff, 0xd8, 0xff, 0xe0], n);
const PNG = img([0x89, 0x50, 0x4e, 0x47]);
const post = (body) => call(portalH, { method: 'POST', body, auth: false });
const item = (o = {}) => ({ description: 'Air', qty: 10, unit: 'box', weightKg: 100, volumeM3: 1, pallets: 1, ...o });
const H = 3600e3;
const NOW = Date.now();
const isoAt = (ms) => new Date(ms).toISOString();

describe('detectExceptions (murni)', () => {
  const stops = [{ name: 'G', windowStart: isoAt(NOW - 5 * H), windowEnd: isoAt(NOW - 4 * H) }, { name: 'Toko', windowStart: isoAt(NOW - 3 * H), windowEnd: isoAt(NOW - 2 * H) }];
  it('belum berangkat, terlambat, stale, di luar radius, selisih qty, tanpa vendor', () => {
    const base = { id: 'o1', doNo: 'DO-1', stops, events: [], pods: [], offers: 0, openOffers: 0 };
    expect(detectExceptions([{ ...base, status: 'assigned' }], NOW).map((e) => e.kind)).toEqual(['not_started']);
    const run = { ...base, status: 'running', events: [{ seq: 1, type: 'trip_start', stopSeq: null, at: isoAt(NOW - 5 * H) }, { seq: 2, type: 'arrive', stopSeq: 1, at: isoAt(NOW - 4.5 * H), outside: true, distM: 900 }] };
    const k = detectExceptions([run], NOW).map((e) => e.kind).sort();
    expect(k).toEqual(['late', 'outside_radius', 'stale']);
    const late = detectExceptions([{ ...base, status: 'done', events: [{ seq: 2, type: 'arrive', stopSeq: 1, at: isoAt(NOW - 3.5 * H) }, { seq: 6, type: 'arrive', stopSeq: 2, at: isoAt(NOW - 1 * H) }], pods: [{ stopSeq: 2, stopName: 'Toko', hasDiff: true, kind: 'delivery', receiverName: 'A' }] }], NOW);
    expect(late.map((e) => `${e.kind}:${e.stopSeq}`).sort()).toEqual(['late_arrival:1', 'late_arrival:2', 'qty_diff:2']);
    expect(late.find((e) => e.key === 'late_arrival:2')).toMatchObject({ severity: 'medium', meta: { minutes: 60 } });
    expect(detectExceptions([{ ...base, status: 'offered', offers: 2, openOffers: 0 }], NOW).map((e) => e.kind)).toEqual(['no_response']);
    expect(detectExceptions([{ ...base, status: 'offered', offers: 2, openOffers: 1 }], NOW)).toEqual([]);
  });
  it('tepat waktu dalam toleransi tidak menjadi exception', () => {
    const o = { id: 'o', doNo: 'X', status: 'done', stops: [{ name: 'T', windowEnd: isoAt(NOW - 2 * H) }], events: [{ seq: 2, type: 'arrive', stopSeq: 1, at: isoAt(NOW - 2 * H + 10 * 60000) }], pods: [] };
    expect(detectExceptions([o], NOW)).toEqual([]);
  });
});

async function accepted(windowEnd) {
  const o = (await call(ordersH, { method: 'POST', body: { doNo: `DO-${Math.random().toString(36).slice(2, 6)}`, customer: 'PT A', orderDate: new Date().toISOString().slice(0, 10), stops: [
    { type: 'pickup', name: 'Gudang', lat: -6.3, lng: 107.1, windowStart: isoAt(NOW - 6 * H), windowEnd: isoAt(NOW - 5 * H), items: [item()] },
    { type: 'delivery', name: 'Toko', lat: -6.2, lng: 106.9, windowEnd, items: [item()] }] } })).body.order;
  const v = (await call(masterH, { method: 'POST', query: { kind: 'vendors' }, body: { name: 'VV', email: 'v@v.id' } })).body.item;
  const veh = (await call(masterH, { method: 'POST', query: { kind: 'vehicles' }, body: { vendorId: v.id, plate: 'B 1', maxWeightKg: 5000 } })).body.item;
  const d = (await call(masterH, { method: 'POST', query: { kind: 'drivers' }, body: { vendorId: v.id, name: 'Budi' } })).body.item;
  await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v.id] } });
  const t = sent[0].html.match(/#\/o\/([\w-]+)/)[1];
  await post({ t, action: 'accept', vehicleId: veh.id, driverId: d.id });
  return { o, t, v };
}
const list = (q = {}) => call(insightsH, { query: { force: '1', ...q } }).then((r) => r.body);

describe('API exceptions', () => {
  beforeEach(() => resetSyncThrottle());
  it('sinkron otomatis, hilang saat pulih, ack / resolve, laporan vendor', async () => {
    const { o, t } = await accepted(isoAt(NOW - 3 * H));
    let r = await list();
    expect(r.exceptions.map((e) => e.kind)).toEqual(['not_started']);
    expect(r.exceptions[0]).toMatchObject({ doNo: o.doNo, severity: 'high', state: 'open', vendorName: 'VV' });
    expect(r.counts).toMatchObject({ high: 1, open: 1 });
    // vendor mulai & tiba di gudang
    await post({ t, action: 'event', seq: 1 });
    resetSyncThrottle();
    r = await list();
    expect(r.exceptions.map((e) => `${e.kind}:${e.stopSeq}`).sort()).toEqual(['late:1', 'late:2']);
    const late = r.exceptions[0];
    // ack
    expect((await call(insightsH, { method: 'POST', body: { action: 'ack', id: late.id, note: 'sudah telepon' } })).code).toBe(200);
    resetSyncThrottle();
    expect((await list({ status: 'handled' })).exceptions[0]).toMatchObject({ id: late.id, ackNote: 'sudah telepon', ackBy: 'aan@sma.id', state: 'handled' });
    expect((await list({ status: 'open' })).exceptions.map((e) => e.id)).not.toContain(late.id);
    // laporan vendor
    expect((await post({ t, action: 'issue', kind: 'bogus', note: 'x y z' })).body.error.code).toBe('issue_kind');
    expect((await post({ t, action: 'issue', kind: 'breakdown', note: '  ' })).body.error.code).toBe('issue_note');
    expect((await post({ t, action: 'issue', kind: 'breakdown', note: 'Ban pecah di tol', lat: -6.2, lng: 106.8 })).code).toBe(200);
    resetSyncThrottle();
    r = await list();
    const vi = r.exceptions.find((e) => e.source === 'vendor');
    expect(vi).toMatchObject({ kind: 'breakdown', severity: 'high', meta: { note: 'Ban pecah di tol', plate: 'B 1' } });
    // resolve manual -> tidak muncul lagi walau sinkron ulang
    await call(insightsH, { method: 'POST', body: { action: 'resolve', id: vi.id, note: 'diganti unit' } });
    resetSyncThrottle();
    expect((await list({ status: 'cleared' })).exceptions.map((e) => e.id)).toContain(vi.id);
    expect((await call(insightsH, { method: 'POST', body: { action: 'ack', id: vi.id } })).code).toBe(404);
    // vendor lain tanpa tautan valid
    expect((await post({ t: 'x'.repeat(30), action: 'issue', kind: 'other', note: 'abc' })).code).toBe(404);
  });

  it('laporan kinerja: status, on-time, lead time, vendor', async () => {
    const a = await accepted(isoAt(NOW + 5 * H)); // belum lewat
    await post({ t: a.t, action: 'event', seq: 1 });
    await post({ t: a.t, action: 'event', seq: 2 });
    await post({ t: a.t, action: 'event', seq: 3 });
    await post({ t: a.t, action: 'pod', seq: 4, receiverName: 'Iwan', photos: [{ b64: JPG(5) }], signature: PNG });
    await post({ t: a.t, action: 'event', seq: 5 }); // tiba di toko tepat waktu
    const today = new Date().toISOString().slice(0, 10);
    const rep = (await call(insightsH, { query: { r: 'report', from: today, to: today } })).body;
    expect(rep.kpi).toMatchObject({ total: 1, dispatched: 1, done: 0, measuredStops: 1, onTimeStops: 1 });
    expect(rep.kpi.onTimeRate).toBe(1); // on-time dihitung untuk stop pengiriman
    expect(rep.vendors[0]).toMatchObject({ vendorName: 'VV', sent: 1, accepted: 1, orders: 1, acceptRate: 1 });
    expect(rep.daily).toEqual([{ date: today, created: 1, done: 0 }]);
    expect(rep.exceptionsByKind.map((x) => x.kind)).toContain('late_arrival');
    expect((await call(insightsH, { query: { r: 'report', from: '2025-01-01', to: today } })).code).toBe(422);
  });
});
