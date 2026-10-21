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
import podH from '../api/pod.js';
import { canon, podHash, purgeOldPods } from '../api/_lib/podRepo.js';

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

async function running(stops = 2) {
  const dl = (n) => ({ type: 'delivery', name: `Toko ${n}`, lat: -6.2, lng: 106.9, windowEnd: '2026-10-20T08:00:00.000Z', items: [item({ qty: 5, description: `Barang ${n}` })] });
  const o = (await call(ordersH, { method: 'POST', body: { doNo: 'DO-P', customer: 'PT A', orderDate: '2026-10-20', stops: [{ type: 'pickup', name: 'G', lat: -6.3, lng: 107.1, items: [item({ qty: 10 * (stops - 1) })] }, ...Array.from({ length: stops - 1 }, (_, i) => dl(i + 1))] } })).body.order;
  const v = (await call(masterH, { method: 'POST', query: { kind: 'vendors' }, body: { name: 'V', email: 'v@v.id' } })).body.item;
  const veh = (await call(masterH, { method: 'POST', query: { kind: 'vehicles' }, body: { vendorId: v.id, plate: 'B 1', maxWeightKg: 5000 } })).body.item;
  const d = (await call(masterH, { method: 'POST', query: { kind: 'drivers' }, body: { vendorId: v.id, name: 'Budi' } })).body.item;
  await call(dispatchH, { method: 'POST', body: { orderId: o.id, action: 'offer', vendorIds: [v.id] } });
  const t = sent[0].html.match(/#\/o\/([\w-]+)/)[1];
  await post({ t, action: 'accept', vehicleId: veh.id, driverId: d.id });
  let seq = 0;
  const step = () => post({ t, action: 'event', seq: ++seq });
  await step(); await step(); await step(); await step(); // start, arrive, loading, depart pickup
  return { o, t, step, seq: () => seq };
}
const podBody = (t, seq, extra = {}) => ({ t, action: 'pod', seq, receiverName: 'Pak Iwan', receiverTitle: 'Kepala gudang', photos: [{ b64: JPG(5), takenAt: '2026-10-20T03:00:00.000Z' }, { b64: JPG(9) }], signature: PNG, lat: -6.2001, lng: 106.9001, accuracy: 10, ...extra });

describe('POD', () => {
  it('hash kanonik stabil terhadap urutan kunci', () => {
    expect(canon({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"x":2,"y":1}]},"b":1}');
    expect(podHash({ a: 1, b: 2 })).toBe(podHash({ b: 2, a: 1 }));
  });

  it('validasi: nama, foto, tanda tangan, format file, selisih qty wajib beralasan', async () => {
    const { t, step } = await running();
    await step(); await step(); // tiba, mulai bongkar -> berikutnya depart (seq 7)
    const bad = async (extra, code) => expect((await post(podBody(t, 7, extra))).body.error.code).toBe(code);
    await bad({ receiverName: ' ' }, 'receiver_required');
    await bad({ photos: [] }, 'photo_required');
    await bad({ photos: Array(5).fill({ b64: JPG(1) }) }, 'photo_max');
    await bad({ photos: [{ b64: PNG }] }, 'pod_invalid');
    await bad({ signature: '' }, 'signature_required');
    await bad({ signature: JPG(2) }, 'pod_invalid');
    await bad({ items: [{ index: 0, receivedQty: 4 }] }, 'diff_reason_required');
    await bad({ items: [{ index: 0, receivedQty: -1 }] }, 'qty_invalid');
    // belum waktunya
    expect((await post(podBody(t, 5))).body.error.code).toBe('out_of_date');
  });

  it('submit POD: DO selesai, event tercatat, integritas ok, terkunci, amandemen, verifikasi publik', async () => {
    const { o, t, step } = await running();
    await step(); await step();
    const r = await post(podBody(t, 7, { items: [{ index: 0, receivedQty: 4, reason: 'Rusak 1 box' }], note: 'Diterima sebagian' }));
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ ok: true, finished: true, outside: false });
    expect((await call(orderH, { query: { id: o.id } })).body.order).toMatchObject({ status: 'done', tripEvents: 7 });
    // klik ganda / POD kedua ditolak
    expect((await post(podBody(t, 7))).code).toBe(409);
    const list = (await call(dispatchH, { query: { orderId: o.id } })).body.pods;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ receiverName: 'Pak Iwan', hasDiff: true, photos: 2, stopSeq: 2 });
    const full = (await call(podH, { query: { id: list[0].id } })).body.pod;
    expect(full.integrity).toBe('ok');
    expect(full.items[0]).toMatchObject({ sentQty: 5, receivedQty: 4, reason: 'Rusak 1 box' });
    expect(full.photoData).toHaveLength(2);
    expect(full.signature.length).toBeGreaterThan(100);
    // tamper: ubah nama penerima langsung di DB -> integritas rusak
    await pg.query(`UPDATE pods SET receiver_name = 'Orang Lain' WHERE id = $1`, [list[0].id]);
    expect((await call(podH, { query: { id: list[0].id } })).body.pod.integrity).toBe('broken');
    await pg.query(`UPDATE pods SET receiver_name = 'Pak Iwan' WHERE id = $1`, [list[0].id]);
    expect((await call(podH, { query: { id: list[0].id } })).body.pod.integrity).toBe('ok');
    // amandemen tidak mengubah POD asli
    expect((await call(dispatchH, { method: 'POST', body: { action: 'pod_amend', podId: list[0].id, note: 'Konfirmasi via telepon' } })).code).toBe(200);
    const after = (await call(podH, { query: { id: list[0].id } })).body.pod;
    expect(after).toMatchObject({ integrity: 'ok', amendments: 1 });
    expect(after.amendmentList[0]).toMatchObject({ by: 'aan@sma.id', note: 'Konfirmasi via telepon' });
    // verifikasi publik hanya data minimum
    const v = await call(portalH, { query: { v: list[0].verifyCode }, auth: false });
    expect(v.body).toMatchObject({ valid: true, doNo: 'DO-P', receiverName: 'Pak Iwan', hasDiff: true });
    expect(v.body).not.toHaveProperty('photoData');
    expect((await call(portalH, { query: { v: 'salah' }, auth: false })).code).toBe(404);
  });

  it('multi-drop: POD per stop, DO baru selesai pada stop terakhir', async () => {
    const { o, t, step } = await running(3);
    await step(); await step(); // stop 2: arrive, service
    expect((await post(podBody(t, 7))).body.finished).toBe(false);
    expect((await call(orderH, { query: { id: o.id } })).body.order.status).toBe('running');
    let seq = 7;
    await post({ t, action: 'event', seq: ++seq });
    await post({ t, action: 'event', seq: ++seq });
    expect((await post(podBody(t, 10))).body.finished).toBe(true);
    expect((await call(orderH, { query: { id: o.id } })).body.order.status).toBe('done');
    expect((await call(dispatchH, { query: { orderId: o.id } })).body.pods.map((p) => p.stopSeq)).toEqual([2, 3]);
  });

  it('retensi: foto & tanda tangan dihapus setelah masa simpan, metadata + hash tetap', async () => {
    const { o, t, step } = await running();
    await step(); await step();
    await post(podBody(t, 7));
    await pg.exec(`UPDATE pods SET submitted_at = now() - interval '31 days'`);
    await purgeOldPods(getDb());
    const list = (await call(dispatchH, { query: { orderId: o.id } })).body.pods;
    expect(list[0]).toMatchObject({ purged: true, photos: 0 });
    const full = (await call(podH, { query: { id: list[0].id } })).body.pod;
    expect(full.integrity).toBe('purged');
    expect(full.hash).toHaveLength(64);
  });
});
