import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { setDb } from '../api/_lib/db.js';
import { setVerifier } from '../api/_lib/auth.js';
import { setMailer } from '../api/_lib/mailer.js';
import ordersH from '../api/orders/index.js';
import orderH from '../api/orders/[id].js';
import masterH from '../api/master/[kind].js';
import dispatchH from '../api/dispatch.js';
import portalH from '../api/portal.js';
import { buildSteps, lastStep } from '../src/core/trip.js';

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
const portal = (t) => call(portalH, { query: { t }, auth: false });
const post = (body) => call(portalH, { method: 'POST', body, auth: false });
const item = (o = {}) => ({ description: 'Air', qty: 10, unit: 'box', weightKg: 1000, volumeM3: 4, pallets: 2, colli: 10, ...o });
const order = () => ({
  doNo: 'DO-1', customer: 'PT A', orderDate: '2026-10-20',
  stops: [
    { type: 'pickup', name: 'Gudang', lat: -6.3, lng: 107.1, radiusM: 150, items: [item({ weightKg: 2000 })] },
    { type: 'delivery', name: 'Toko', lat: -6.2, lng: 106.9, windowEnd: '2026-10-20T08:00:00.000Z', items: [item({ weightKg: 2000 })] },
  ],
});
const tokenOf = (i) => sent[i].html.match(/#\/o\/([\w-]+)/)[1];

async function setup() {
  const o = (await call(ordersH, { method: 'POST', body: order() })).body.order;
  const mk = async (kind, body) => (await call(masterH, { method: 'POST', query: { kind }, body })).body.item;
  const v1 = await mk('vendors', { name: 'Vendor A', email: 'a@v.id' });
  const v2 = await mk('vendors', { name: 'Vendor B', email: 'b@v.id' });
  const big = await mk('vehicles', { vendorId: v1.id, plate: 'B 1 AA', maxWeightKg: 5000 });
  const small = await mk('vehicles', { vendorId: v1.id, plate: 'B 2 AA', maxWeightKg: 1000 });
  const other = await mk('vehicles', { vendorId: v2.id, plate: 'B 3 BB', maxWeightKg: 5000 });
  const d1 = await mk('drivers', { vendorId: v1.id, name: 'Budi', phone: '0812' });
  await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v1.id, v2.id] } });
  return { o, v1, v2, big, small, other, d1, tA: tokenOf(0), tB: tokenOf(1) };
}

describe('trip steps', () => {
  it('urutan langkah multi-stop', () => {
    const s = buildSteps([{ type: 'pickup' }, { type: 'delivery' }, { type: 'delivery' }]);
    expect(s).toHaveLength(10);
    expect(s.map((x) => x.type).slice(0, 4)).toEqual(['trip_start', 'arrive', 'service_start', 'depart']);
    expect(s[9]).toMatchObject({ seq: 10, type: 'depart', stopIdx: 2, stopType: 'delivery' });
    expect(lastStep(3, 0)).toBeNull();
    expect(lastStep(3, 5)).toMatchObject({ stopIdx: 1, type: 'arrive', done: false });
    expect(lastStep(3, 10).done).toBe(true);
  });
});

describe('portal vendor', () => {
  it('token tidak valid -> 404; mode offer menampilkan kendaraan beserta kecocokan', async () => {
    expect((await portal('x'.repeat(30))).code).toBe(404);
    expect((await portal('abc')).code).toBe(404);
    const { tA } = await setup();
    const r = await portal(tA);
    expect(r.code).toBe(200);
    expect(r.body.mode).toBe('offer');
    expect(r.body.order.stops).toHaveLength(2);
    expect(r.body.order.stops[0]).not.toHaveProperty('orderId');
    expect(r.body.vehicles.map((v) => [v.plate, v.fit.ok])).toEqual([['B 1 AA', true], ['B 2 AA', false]]);
    expect(r.body.vehicles[1].fit.reasons[0].code).toBe('weight');
    expect(r.body.drivers).toHaveLength(1);
  });

  it('terima: kendaraan tidak cocok / milik vendor lain ditolak; driver baru dibuat; vendor lain tertutup', async () => {
    const { tA, tB, big, small, other, o } = await setup();
    expect((await post({ t: tA, action: 'accept', vehicleId: small.id, newDriver: { name: 'X' } })).body.error.code).toBe('vehicle_not_fit');
    expect((await post({ t: tA, action: 'accept', vehicleId: other.id, newDriver: { name: 'X' } })).body.error.code).toBe('vehicle_invalid');
    expect((await post({ t: tA, action: 'accept', vehicleId: big.id })).body.error.code).toBe('driver_required');
    const ok = await post({ t: tA, action: 'accept', vehicleId: big.id, newDriver: { name: 'Sopir Baru', phone: '0813' } });
    expect(ok.code).toBe(200);
    const got = (await call(orderH, { query: { id: o.id } })).body.order;
    expect(got).toMatchObject({ status: 'assigned', vendorName: 'Vendor A', driverName: 'Sopir Baru', assignedVia: 'vendor' });
    const closedB = await portal(tB);
    expect(closedB.body).toMatchObject({ mode: 'closed', reason: 'withdrawn' });
    expect((await post({ t: tB, action: 'accept', vehicleId: other.id, newDriver: { name: 'Y' } })).body.error.code).toBe('offer_closed');
    expect((await portal(tA)).body.mode).toBe('trip');
  });

  it('tolak butuh alasan dan tercatat', async () => {
    const { tA, o } = await setup();
    expect((await post({ t: tA, action: 'reject', reason: ' ' })).body.error.code).toBe('reason_required');
    expect((await post({ t: tA, action: 'reject', reason: 'Armada penuh' })).code).toBe(200);
    expect((await portal(tA)).body).toMatchObject({ mode: 'closed', reason: 'rejected', offer: { rejectReason: 'Armada penuh' } });
    const offers = (await call(dispatchH, { query: { orderId: o.id } })).body.offers;
    expect(offers.find((x) => x.vendorName === 'Vendor A').status).toBe('rejected');
  });

  it('eksekusi perjalanan berurutan sampai DO selesai, dengan jarak GPS', async () => {
    const { tA, big, d1, o } = await setup();
    await post({ t: tA, action: 'accept', vehicleId: big.id, driverId: d1.id });
    let v = (await portal(tA)).body;
    expect(v.next).toMatchObject({ seq: 1, type: 'trip_start' });
    // lompat urutan / klik ganda ditolak
    expect((await post({ t: tA, action: 'event', seq: 3 })).body.error.code).toBe('out_of_date');
    expect((await post({ t: tA, action: 'event', seq: 1 })).code).toBe(200);
    expect((await post({ t: tA, action: 'event', seq: 1 })).body.error.code).toBe('out_of_date');
    expect((await call(orderH, { query: { id: o.id } })).body.order.status).toBe('running');
    // tiba di gudang: dekat -> tidak di luar radius; jauh -> ditandai
    const near = await post({ t: tA, action: 'event', seq: 2, lat: -6.3001, lng: 107.1001, accuracy: 10 });
    expect(near.body.outside).toBe(false);
    expect(near.body.distM).toBeLessThan(30);
    await post({ t: tA, action: 'event', seq: 3 });
    await post({ t: tA, action: 'event', seq: 4 });
    const far = await post({ t: tA, action: 'event', seq: 5, lat: -6.5, lng: 106.5, accuracy: 20 });
    expect(far.body.outside).toBe(true);
    await post({ t: tA, action: 'event', seq: 6 });
    const last = await post({ t: tA, action: 'event', seq: 7 });
    expect(last.body.finished).toBe(true);
    const done = (await call(orderH, { query: { id: o.id } })).body.order;
    expect(done).toMatchObject({ status: 'done', tripEvents: 7 });
    expect(done.finishedAt).toBeTruthy();
    expect((await post({ t: tA, action: 'event', seq: 8 })).body.error.code).toBe('trip_closed');
    const pv = (await portal(tA)).body;
    expect(pv).toMatchObject({ mode: 'trip', finished: true });
    expect(pv.events).toHaveLength(7);
    const admin = (await call(dispatchH, { query: { orderId: o.id } })).body;
    expect(admin.trip.events).toHaveLength(7);
  });

  it('vendor lain tidak bisa memakai tautannya untuk perjalanan; lepas alokasi menutup tautan penerima', async () => {
    const { tA, tB, big, d1, o } = await setup();
    await post({ t: tA, action: 'accept', vehicleId: big.id, driverId: d1.id });
    expect((await post({ t: tB, action: 'event', seq: 1 })).body.error.code).toBe('trip_closed');
    await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'release' } });
    expect((await portal(tA)).body).toMatchObject({ mode: 'closed', reason: 'withdrawn' });
    expect((await post({ t: tA, action: 'event', seq: 1 })).body.error.code).toBe('trip_closed');
  });
});
