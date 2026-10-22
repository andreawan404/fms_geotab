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
import { setWaSender, normPhone } from '../api/_lib/notifyRepo.js';
import cronH from '../api/cron.js';

let pg;
beforeAll(async () => {
  pg = new PGlite();
  setDb({ query: async (text, params = []) => (await pg.query(text, params)).rows });
});
const sent = [];
beforeEach(async () => {
  process.env.ALLOWED_DATABASES = 'sma_db';
  process.env.CRON_SECRET = 'rahasia123';
  sent.length = 0;
  setMailer(async (m) => { sent.push(m); return { status: 'sent' }; });
  setVerifier(async () => {});
  const has = await pg.query("SELECT to_regclass('public.orders') AS t");
  if (has.rows[0].t) await pg.exec('TRUNCATE orders, vendors, audit_log, email_log, notify_log, notify_settings CASCADE');
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

const wa = [];
const hdr = (key) => ({ headers: { authorization: `Bearer ${key}` } });
async function cron(query = {}, auth) {
  const res = { setHeader() {}, status(c) { this.code = c; return this; }, end(b) { this.body = b ? JSON.parse(b) : null; } };
  await cronH({ method: 'GET', query, headers: auth ? { authorization: auth } : {} }, res);
  return res;
}
const saveCfg = (extra = {}) => call(insightsH, { method: 'POST', body: { action: 'notify_save', emailEnabled: true, waEnabled: true, emails: 'admin@sma.id', phones: '0812-3456-7890', minSeverity: 'high', renotifyMin: 60, ...extra } });

describe('Notifikasi exception', () => {
  beforeEach(() => { resetSyncThrottle(); wa.length = 0; setWaSender(async (m) => { wa.push(m); return { status: 'sent' }; }); });

  it('normalisasi nomor + validasi pengaturan', async () => {
    expect(normPhone('0812-3456-7890')).toBe('6281234567890');
    expect(normPhone('+62 812 3456 7890')).toBe('6281234567890');
    expect(normPhone('812345678')).toBe('62812345678');
    const bad = await saveCfg({ emails: 'bukan-email' });
    expect(bad.code).toBe(422);
    const ok = await saveCfg({ emails: 'a@x.id, B@X.id\na@x.id' });
    expect(ok.body.settings).toMatchObject({ emails: ['a@x.id', 'b@x.id'], phones: ['6281234567890'], minSeverity: 'high' });
    const g = (await call(insightsH, { query: { r: 'notify' } })).body;
    expect(g.settings.emails).toHaveLength(2);
    expect(g.providers.wa).toBeDefined();
  });

  it('laporan vendor langsung dikirim ke email + WA; tidak dobel; pengingat sekali', async () => {
    await saveCfg();
    const { t } = await accepted(isoAt(NOW + 5 * H));
    sent.length = 0;
    expect((await post({ t, action: 'issue', kind: 'breakdown', note: 'Ban pecah di tol', lat: -6.2, lng: 106.8 })).code).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'admin@sma.id' });
    expect(sent[0].subject).toContain('1 exception');
    expect(sent[0].html).toContain('Kendaraan mogok');
    expect(wa).toHaveLength(1);
    expect(wa[0].to).toBe('6281234567890');
    expect(wa[0].message).toContain('Ban pecah di tol');
    // sinkron ulang tidak mengirim laporan yang sama lagi (exception sistem baru, mis. belum berangkat, boleh)
    const mentions = (arr, k) => arr.filter((m) => (m.html || m.message || '').includes(k)).length;
    resetSyncThrottle();
    await call(insightsH, { query: { status: 'open' } });
    expect(mentions(sent, 'Ban pecah')).toBe(1);
    expect(mentions(wa, 'Ban pecah')).toBe(1);
    // pengingat: majukan notified_at 2 jam, lalu cron -> satu kali saja
    await pg.query(`UPDATE exceptions SET notified_at = now() - interval '2 hours'`);
    resetSyncThrottle();
    expect((await cron({ key: 'rahasia123' })).code).toBe(200);
    const rem = wa.filter((m) => m.message.includes('Pengingat'));
    expect(rem).toHaveLength(1);
    expect(rem[0].message).toContain('Ban pecah');
    await cron({ key: 'rahasia123' });
    expect(wa.filter((m) => m.message.includes('Pengingat'))).toHaveLength(1);
  });

  it('exception sudah ditangani tidak diingatkan; severity di bawah minimum tidak dikirim', async () => {
    await saveCfg();
    const { t } = await accepted(isoAt(NOW + 5 * H));
    await post({ t, action: 'issue', kind: 'traffic', note: 'Macet parah' }); // low
    expect(wa).toHaveLength(0);
    await saveCfg({ minSeverity: 'low' });
    resetSyncThrottle();
    await cron({ key: 'rahasia123' });
    expect(wa).toHaveLength(1);
    expect(wa[0].message).toContain('Macet');
  });

  it('kegagalan kirim dicoba ulang, dicatat di log; tes kirim', async () => {
    await saveCfg({ emails: '' });
    setWaSender(async () => ({ status: 'failed', error: 'Fonnte 500' }));
    const { t } = await accepted(isoAt(NOW + 5 * H));
    await post({ t, action: 'issue', kind: 'accident', note: 'Tabrakan ringan' });
    let log = (await call(insightsH, { query: { r: 'notify' } })).body.log;
    expect(log[0]).toMatchObject({ channel: 'whatsapp', status: 'failed', error: 'Fonnte 500' });
    wa.length = 0;
    setWaSender(async (m) => { wa.push(m); return { status: 'sent' }; });
    resetSyncThrottle();
    await cron({ key: 'rahasia123' });
    expect(wa).toHaveLength(1); // terkirim pada percobaan ulang
    const test = await call(insightsH, { method: 'POST', body: { action: 'notify_test' } });
    expect(test.body.results.every((r) => r.status === 'sent')).toBe(true);
  });

  it('cron: wajib kunci', async () => {
    delete process.env.CRON_SECRET;
    expect((await cron({ key: 'x' })).code).toBe(503);
    process.env.CRON_SECRET = 'rahasia123';
    expect((await cron({})).code).toBe(401);
    expect((await cron({ key: 'salah' })).code).toBe(401);
    expect((await cron({}, 'Bearer rahasia123')).code).toBe(200);
  });
});
