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
import { setWaSender } from '../api/_lib/notifyRepo.js';
import { acceptOffer, rejectOffer, getOfferByToken } from '../api/_lib/dispatchRepo.js';
import { getDb } from '../api/_lib/db.js';
import { totals, normalizeOrder } from '../src/core/orders.js';
import { vehicleFit, fittingVehicles } from '../src/core/capacity.js';

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
async function call(handler, { method = 'GET', query = {}, body } = {}) {
  const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, end(b) { this.body = b ? JSON.parse(b) : null; } };
  await handler({ method, query, body, headers: { authorization: creds } }, res);
  return res;
}
const item = (o = {}) => ({ description: 'Air', qty: 10, unit: 'box', weightKg: 1000, volumeM3: 4, pallets: 2, colli: 10, ...o });
const mkOrder = (o = {}) => ({
  doNo: 'DO-1', customer: 'PT A', orderDate: '2026-10-20',
  stops: [
    { type: 'pickup', name: 'Gudang', lat: -6.3, lng: 107.1, items: [item()] },
    { type: 'delivery', name: 'Toko', lat: -6.2, lng: 106.9, windowEnd: '2026-10-20T08:00:00.000Z', items: [item()] },
  ], ...o,
});
async function setup() {
  const o = (await call(ordersH, { method: 'POST', body: mkOrder() })).body.order;
  const v = async (name, email = `${name.replace(/ /g, '').toLowerCase()}@v.id`) => (await call(masterH, { method: 'POST', query: { kind: 'vendors' }, body: { name, email, pic: 'Pak ' + name } })).body.item;
  const v1 = await v('Vendor A');
  const v2 = await v('Vendor B');
  const veh = async (vendorId, plate, extra = {}) => (await call(masterH, { method: 'POST', query: { kind: 'vehicles' }, body: { vendorId, plate, type: 'cdd', maxWeightKg: 2500, maxVolumeM3: 10, maxPallets: 6, ...extra } })).body.item;
  const a1 = await veh(v1.id, 'B 1 AA');
  const b1 = await veh(v2.id, 'B 2 BB');
  const dr = async (vendorId, name) => (await call(masterH, { method: 'POST', query: { kind: 'drivers' }, body: { vendorId, name } })).body.item;
  return { o, v1, v2, a1, b1, d1: await dr(v1.id, 'Budi'), d2: await dr(v2.id, 'Candra') };
}

describe('kapasitas', () => {
  const need = (stops) => totals(normalizeOrder({ stops }));
  it('mencocokkan berat/volume/pallet puncak, suhu, B3', () => {
    const n = need([{ type: 'pickup', items: [item({ weightKg: 3000 })] }, { type: 'delivery', items: [item({ weightKg: 3000 })] }]);
    expect(vehicleFit({ maxWeightKg: 2500 }, n).reasons[0]).toMatchObject({ code: 'weight', need: 3000, have: 2500 });
    expect(vehicleFit({ maxWeightKg: 5000 }, n).ok).toBe(true);
    const cold = need([{ type: 'pickup', items: [item({ tempMin: 2, tempMax: 8 })] }, { type: 'delivery', items: [item()] }]);
    expect(vehicleFit({}, cold).reasons.map((r) => r.code)).toContain('temp_control');
    expect(vehicleFit({ tempControlled: true, tempMinC: 0, tempMaxC: 10 }, cold).ok).toBe(true);
    expect(vehicleFit({ tempControlled: true, tempMinC: 5, tempMaxC: 10 }, cold).reasons[0].code).toBe('temp_range');
    const b3 = need([{ type: 'pickup', items: [item({ hazardous: true })] }, { type: 'delivery', items: [item()] }]);
    expect(vehicleFit({}, b3).reasons[0].code).toBe('hazardous');
  });
  it('beban puncak (multi-drop) yang dipakai, bukan total muat', () => {
    const n = need([{ type: 'pickup', items: [item({ weightKg: 2000 })] }, { type: 'delivery', items: [item({ weightKg: 2000 })] }, { type: 'pickup', items: [item({ weightKg: 2000 })] }, { type: 'delivery', items: [item({ weightKg: 2000 })] }]);
    expect(n.loadedWeight).toBe(4000);
    expect(vehicleFit({ maxWeightKg: 2500 }, n).ok).toBe(true);
  });
  it('fittingVehicles urut paling pas dan melewati nonaktif', () => {
    const n = need([{ type: 'pickup', items: [item({ weightKg: 900 })] }, { type: 'delivery', items: [item({ weightKg: 900 })] }]);
    const r = fittingVehicles([{ plate: 'big', maxWeightKg: 8000 }, { plate: 'fit', maxWeightKg: 1000 }, { plate: 'off', maxWeightKg: 1000, active: false }, { plate: 'small', maxWeightKg: 500 }], n);
    expect(r.map((x) => x.vehicle.plate)).toEqual(['fit', 'big']);
  });
});

describe('master data', () => {
  it('CRUD, validasi, duplikat, nonaktif bila sudah dipakai', async () => {
    const bad = await call(masterH, { method: 'POST', query: { kind: 'vendors' }, body: { name: '', email: 'x' } });
    expect(bad.code).toBe(422);
    expect(bad.body.error.details.map((d) => d.path).sort()).toEqual(['email', 'name']);
    const { v1, a1, o } = await setup();
    expect((await call(masterH, { method: 'POST', query: { kind: 'vendors' }, body: { name: 'vendor a' } })).code).toBe(409);
    expect((await call(masterH, { method: 'POST', query: { kind: 'vehicles' }, body: { vendorId: v1.id, plate: 'b1aa' } })).code).toBe(409);
    expect((await call(masterH, { method: 'PUT', query: { kind: 'vehicles', id: a1.id }, body: { maxWeightKg: '3000,5' } })).body.item.maxWeightKg).toBe(3000.5);
    expect((await call(masterH, { method: 'GET', query: { kind: 'vehicles', vendorId: v1.id } })).body.items).toHaveLength(1);
    const asg = await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'assign', vendorId: v1.id, vehicleId: a1.id } });
    expect(asg.code).toBe(200);
    const del = await call(masterH, { method: 'DELETE', query: { kind: 'vehicles', id: a1.id } });
    expect(del.body.deactivated).toBe(true);
    expect((await call(masterH, { method: 'GET', query: { kind: 'vehicles' } })).body.items).toHaveLength(1);
  });
});

describe('penawaran & alokasi', () => {
  it('broadcast: email terkirim, DO jadi offered', async () => {
    const { o, v1, v2 } = await setup();
    const r = await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v1.id, v2.id], expiryMin: 60 } });
    expect(r.code).toBe(200);
    expect(r.body.emails.map((e) => e.status)).toEqual(['sent', 'sent']);
    expect(sent).toHaveLength(2);
    expect(sent[0].html).toMatch(/portal\.html#\/o\/[\w-]{20,}/);
    const got = (await call(orderH, { query: { id: o.id } })).body.order;
    expect(got.status).toBe('offered');
    expect(got.openOffers).toBe(2);
    const ed = await call(orderH, { method: 'PUT', query: { id: o.id }, body: { ...mkOrder(), version: got.version } });
    expect(ed.body.error.code).toBe('not_draft');
  });

  it('tanpa API key email berstatus skipped dan vendor tanpa email dilaporkan', async () => {
    const { o, v1 } = await setup();
    await call(masterH, { method: 'PUT', query: { kind: 'vendors', id: v1.id }, body: { email: '' } });
    setMailer(async () => ({ status: 'skipped', error: 'BREVO_API_KEY belum diisi' }));
    const r = await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v1.id] } });
    expect(r.body.emails[0].status).toBe('no_email');
  });

  it('yang menerima lebih dulu menang, termasuk saat bersamaan', async () => {
    const { o, v1, v2, a1, b1, d1, d2 } = await setup();
    await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v1.id, v2.id] } });
    const tok = (html) => html.match(/#\/o\/([\w-]+)/)[1];
    const [tA, tB] = [tok(sent[0].html), tok(sent[1].html)];
    const db = getDb();
    const res = await Promise.allSettled([
      acceptOffer(db, tA, { vehicleId: a1.id, driverId: d1.id }),
      acceptOffer(db, tB, { vehicleId: b1.id, driverId: d2.id }),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.find((r) => r.status === 'rejected').reason.code).toBe('offer_closed');
    const got = (await call(orderH, { query: { id: o.id } })).body.order;
    expect(got.status).toBe('assigned');
    expect(got.assignedVia).toBe('vendor');
    const st = (await call(dispatchH, { query: { orderId: o.id } })).body.offers.map((x) => x.status).sort();
    expect(st).toEqual(['accepted', 'withdrawn']);
  });

  it('menolak dicatat dengan alasan, DO tetap terbuka untuk vendor lain; kendaraan vendor lain ditolak', async () => {
    const { o, v1, v2, a1, b1, d2 } = await setup();
    await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v1.id, v2.id] } });
    const tok = (html) => html.match(/#\/o\/([\w-]+)/)[1];
    const db = getDb();
    await rejectOffer(db, tok(sent[0].html), 'Armada penuh');
    await expect(acceptOffer(db, tok(sent[1].html), { vehicleId: a1.id })).rejects.toMatchObject({ code: 'vehicle_invalid' });
    const o1 = await getOfferByToken(db, tok(sent[0].html));
    expect(o1).toMatchObject({ status: 'rejected', rejectReason: 'Armada penuh' });
    await expect(rejectOffer(db, tok(sent[0].html), 'lagi')).rejects.toMatchObject({ code: 'offer_closed' });
    await acceptOffer(db, tok(sent[1].html), { vehicleId: b1.id, driverId: d2.id });
    expect((await call(orderH, { query: { id: o.id } })).body.order.vendorName).toBe('Vendor B');
  });

  it('penawaran kedaluwarsa tidak bisa diterima; DO tetap offered tanpa penawaran terbuka', async () => {
    const { o, v1, a1 } = await setup();
    await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v1.id], expiryMin: 60 } });
    await pg.exec(`UPDATE offers SET expires_at = now() - interval '1 minute'`);
    const t = sent[0].html.match(/#\/o\/([\w-]+)/)[1];
    await expect(acceptOffer(getDb(), t, { vehicleId: a1.id })).rejects.toMatchObject({ code: 'offer_closed', details: { status: 'expired' } });
    const got = (await call(orderH, { query: { id: o.id } })).body.order;
    expect(got).toMatchObject({ status: 'offered', openOffers: 0, offerCount: 1 });
  });

  it('alokasi langsung, lepas alokasi, lalu tawarkan ulang', async () => {
    const { o, v1, v2, a1 } = await setup();
    expect((await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'assign', vendorId: v2.id, vehicleId: a1.id } })).body.error.code).toBe('vehicle_invalid');
    expect((await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'assign', vendorId: v1.id, vehicleId: a1.id } })).code).toBe(200);
    expect((await call(orderH, { query: { id: o.id } })).body.order).toMatchObject({ status: 'assigned', plate: 'B 1 AA', assignedVia: 'admin' });
    expect((await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v1.id] } })).body.error.code).toBe('order_state');
    expect((await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'release' } })).code).toBe(200);
    expect((await call(orderH, { query: { id: o.id } })).body.order).toMatchObject({ status: 'draft', vendorId: null });
    expect((await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v1.id] } })).code).toBe(200);
  });

  it('DO belum lengkap (tanpa koordinat) tidak boleh dialokasikan', async () => {
    const { v1 } = await setup();
    const o2 = (await call(ordersH, { method: 'POST', body: mkOrder({ doNo: 'DO-2', stops: [{ type: 'pickup', name: 'G', items: [item()] }, { type: 'delivery', name: 'T', items: [item()] }] }) })).body.order;
    const r = await call(dispatchH, { method: 'POST', body: { orderId: o2.id, action: 'offer', vendorIds: [v1.id] } });
    expect(r.body.error.code).toBe('not_ready');
  });
});

describe('armada internal & tautan driver', () => {
  it('vendor internal tersimpan, alokasi langsung membuat tautan portal yang bisa dibuka driver', async () => {
    const o = (await call(ordersH, { method: 'POST', body: mkOrder() })).body.order;
    const vi = (await call(masterH, { method: 'POST', query: { kind: 'vendors' }, body: { name: 'Armada Internal', internal: true } })).body.item;
    expect(vi.internal).toBe(true);
    const veh = (await call(masterH, { method: 'POST', query: { kind: 'vehicles' }, body: { vendorId: vi.id, plate: 'B 7 SMA', type: 'cdd', maxWeightKg: 2500, maxVolumeM3: 10, maxPallets: 6 } })).body.item;
    const drv = (await call(masterH, { method: 'POST', query: { kind: 'drivers' }, body: { vendorId: vi.id, name: 'Agus', phone: '0813000010' } })).body.item;
    const wa = [];
    setWaSender(async (m) => { wa.push(m); return { status: 'sent' }; });
    const r = await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'assign', vendorId: vi.id, vehicleId: veh.id, driverId: drv.id, notify: true } });
    setWaSender(null);
    expect(r.code).toBe(200);
    expect(r.body.link).toMatch(/portal\.html#\/o\//);
    expect(r.body.sent[0]).toMatchObject({ channel: 'whatsapp', status: 'sent' });
    expect(wa[0].to).toBe('62813000010');
    expect(wa[0].message).toContain(r.body.link);
    expect(sent.length).toBe(0); // vendor internal: tidak ada email
    const tok = r.body.link.split('/o/')[1];
    const v = await call(portalH, { query: { t: tok } });
    expect(v.body.mode).toBe('trip');
    expect(v.body.vehicle.plate).toBe('B 7 SMA');
    // tautan baru menutup tautan lama
    const r2 = await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'link' } });
    expect(r2.body.link).not.toBe(r.body.link);
    expect((await call(portalH, { query: { t: tok } })).body.mode).toBe('closed');
    expect((await call(portalH, { query: { t: r2.body.link.split('/o/')[1] } })).body.mode).toBe('trip');
    // release menutup tautan
    await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'release' } });
    expect((await call(portalH, { query: { t: r2.body.link.split('/o/')[1] } })).body.mode).toBe('closed');
  });
  it('vendor eksternal: alokasi langsung mengirim tautan lewat email dan tanpa nomor HP driver dilaporkan', async () => {
    const { o, v1, a1, d1 } = await setup();
    const r = await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'assign', vendorId: v1.id, vehicleId: a1.id, driverId: d1.id, notify: true } });
    expect(r.body.sent.find((x) => x.channel === 'email').status).toBe('sent');
    expect(r.body.sent.find((x) => x.channel === 'whatsapp').status).toBe('no_phone');
    expect(sent.length).toBe(1);
  });
  it('tautan baru ditolak bila DO belum dialokasikan', async () => {
    const o = (await call(ordersH, { method: 'POST', body: mkOrder() })).body.order;
    const r = await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'link' } });
    expect(r.code).toBe(409);
  });
  it('snapshot biaya & BBM tersimpan di DO dan dibersihkan', async () => {
    const o = (await call(ordersH, { method: 'POST', body: mkOrder() })).body.order;
    const r = await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'save_calc', cost: { distKm: 120.456, fuelL: 14, fuelRp: 140000, tollRp: 50000, totalRp: 190000, tollSource: 'route', evil: 'x' }, fuel: { fuelL: 15.2, distKm: 121, kmPerL: 7.9, source: 'sensor' } } });
    expect(r.code).toBe(200);
    const g = (await call(orderH, { query: { id: o.id } })).body.order;
    expect(g.cost).toMatchObject({ distKm: 120.46, totalRp: 190000, tollSource: 'route' });
    expect(g.cost.evil).toBeUndefined();
    expect(g.fuel).toMatchObject({ fuelL: 15.2, source: 'sensor' });
  });
  it('save_calc menolak data kosong atau BBM tidak valid', async () => {
    const o = (await call(ordersH, { method: 'POST', body: mkOrder() })).body.order;
    expect((await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'save_calc' } })).code).toBe(422);
    expect((await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'save_calc', fuel: { fuelL: -3 } } })).code).toBe(422);
  });
});
