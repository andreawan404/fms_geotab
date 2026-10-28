// Klien API order (Vercel). Mode demo memakai penyimpanan di memori dengan aturan validasi yang sama.
import { normalizeOrder, summary, validateOrder } from '../core/orders.js';

export class OrdersApiError extends Error {
  constructor(code, message, details, status) {
    super(message || code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const hostOf = () => {
  const h = (typeof window !== 'undefined' && window.TMS_CONFIG && window.TMS_CONFIG.hostUrl) || '';
  if (h && !h.startsWith('__')) return h.replace(/\/$/, '');
  return typeof location !== 'undefined' ? location.origin : '';
};

export const portalBase = () => hostOf();

const DEMO_PODS = [
  { id: 'dp1', kind: 'pickup', doNo: 'DO-DEMO-001', customer: 'PT Contoh', stopName: 'Gudang Cikarang', receiverName: 'Iwan (gudang)', receiverTitle: '', receiverPhone: '', note: '', hasDiff: false, outside: false, distM: 20, submittedAt: new Date(Date.now() - 3 * 3600e3).toISOString(), verifyCode: 'demo-pop', hash: 'a'.repeat(64), photos: 2, amendments: 0, purged: false, vendorName: 'CV Trans Mandiri', plate: 'B 9001 SMA' },
  { id: 'dp2', kind: 'delivery', doNo: 'DO-DEMO-001', customer: 'PT Contoh', stopName: 'Toko Bogor', receiverName: 'Pak Andi', receiverTitle: 'Kepala toko', receiverPhone: '', note: '', hasDiff: true, outside: false, distM: 35, submittedAt: new Date(Date.now() - 1 * 3600e3).toISOString(), verifyCode: 'demo-pod', hash: 'b'.repeat(64), photos: 3, amendments: 0, purged: false, vendorName: 'CV Trans Mandiri', plate: 'B 9001 SMA' },
];

const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const demoNotify = { emailEnabled: true, waEnabled: true, emails: [], phones: [], minSeverity: 'high', renotifyMin: 60 };
const demoMode = { v: 'full' };
const demoConn = [];
const DEMO_EXC = [
  { id: 1, orderId: 'd1', doNo: 'DO-DEMO-001', customer: 'PT Contoh', vendorName: 'CV Trans Mandiri', plate: 'B 9001 SMA', kind: 'late', severity: 'high', source: 'system', stopSeq: 2, meta: { stop: 'Toko Bogor', minutes: 75 }, createdAt: ago(1), clearedAt: '', ackAt: '', ackBy: '', ackNote: '', state: 'open' },
  { id: 2, orderId: 'd2', doNo: 'DO-DEMO-002', customer: 'PT Maju', vendorName: 'PT Ekspres Nusa', plate: 'B 9002 SMA', kind: 'breakdown', severity: 'high', source: 'vendor', stopSeq: 1, meta: { note: 'Ban pecah di tol Jakarta-Cikampek KM 40', stop: 'Gudang Cikarang' }, createdAt: ago(0.5), clearedAt: '', ackAt: '', ackBy: '', ackNote: '', state: 'open' },
  { id: 3, orderId: 'd1', doNo: 'DO-DEMO-001', customer: 'PT Contoh', vendorName: 'CV Trans Mandiri', plate: 'B 9001 SMA', kind: 'qty_diff', severity: 'medium', source: 'system', stopSeq: 2, meta: { stop: 'Toko Bogor', receiver: 'Pak Andi', podKind: 'delivery' }, createdAt: ago(3), clearedAt: '', ackAt: '', ackBy: '', ackNote: '', state: 'open' },
  { id: 4, orderId: 'd3', doNo: 'DO-DEMO-003', customer: 'PT Sentosa', vendorName: '', plate: '', kind: 'no_response', severity: 'high', source: 'system', stopSeq: null, meta: {}, createdAt: ago(5), clearedAt: '', ackAt: ago(4), ackBy: 'demo', ackNote: 'sedang telepon vendor lain', state: 'handled' },
];
function demoReport(from, to) {
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1);
  const daily = Array.from({ length: Math.min(days, 92) }, (_, i) => ({ date: new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10), created: 6 + ((i * 7) % 9), done: 4 + ((i * 5) % 8), measured: 5, ontime: 3 + ((i * 3) % 3) }));
  const total = daily.reduce((a, d) => a + d.created, 0);
  const done = daily.reduce((a, d) => a + d.done, 0);
  const vend = (id, name, k) => ({ vendorId: id, vendorName: name, sent: 40 * k, accepted: 30 * k, rejected: 6 * k, expired: 4 * k, responseMin: 14 + k * 3, orders: 30 * k, done: 27 * k, measured: 50 * k, ontime: 44 * k, qtyDiff: 2 * k, exceptions: 5 * k, acceptRate: 0.75, onTimeRate: 0.88 });
  return {
    range: { from, to }, graceMin: 15,
    kpi: { total, counts: { done, running: 3, assigned: 4, offered: 2, draft: 5 }, dispatched: done + 7, done, completionRate: done / (done + 7), measuredStops: 150, onTimeStops: 132, onTimeRate: 0.88, leadMin: { toAssign: 38, toStart: 55, trip: 320, total: 420 }, exceptions: 21 },
    daily, vendors: [vend('v1', 'CV Trans Mandiri', 2), vend('v2', 'PT Ekspres Nusa', 1)],
    delay: { lateStops: 18, avgMin: 47, maxMin: 190 },
    load: { kg: total * 820, kgDone: done * 820, m3: total * 6.4, m3Done: done * 6.4 },
    handling: { open: 4, handled: 9, resolveMin: 96 },
    fuel: { orders: 14, liters: 1260, distKm: 9810, kmPerL: 7.8 },
    topCustomers: [{ customer: 'PT Indomarco', orders: 41, done: 38, exceptions: 5 }, { customer: 'PT Alfa Retailindo', orders: 33, done: 29, exceptions: 7 }, { customer: 'CV Sumber Pangan', orders: 24, done: 22, exceptions: 2 }],
    prev: { range: { from: new Date(Date.parse(from) - days * 864e5).toISOString().slice(0, 10), to: new Date(Date.parse(from) - 864e5).toISOString().slice(0, 10) }, total: Math.round(total * 0.92), dispatched: done + 4, done: Math.round(done * 0.9), completionRate: 0.82, onTimeRate: 0.84, exceptions: 27, leadTotal: 465 },
    exceptionsByKind: [{ kind: 'late_arrival', severity: 'medium', n: 8 }, { kind: 'qty_diff', severity: 'medium', n: 5 }, { kind: 'outside_radius', severity: 'low', n: 4 }, { kind: 'breakdown', severity: 'high', n: 2 }, { kind: 'no_response', severity: 'high', n: 2 }],
  };
}

export function createOrdersApi({ geotab, isMock }) {
  if (isMock) return createMockOrdersApi();
  async function req(method, path, body) {
    const creds = await geotab.getCredentials();
    const headers = { Authorization: `Geotab ${btoa(encodeURIComponent(JSON.stringify(creds)))}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(`${hostOf()}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new OrdersApiError('network', 'Tidak dapat menghubungi server');
    }
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new OrdersApiError(j?.error?.code || `http_${res.status}`, j?.error?.message, j?.error?.details, res.status);
    return j;
  }
  const qs = (p) => {
    const e = Object.entries(p || {}).filter(([, v]) => v != null && v !== '');
    return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  };
  return {
    isMock: false,
    async health() {
      const res = await fetch(`${hostOf()}/api/health`).catch(() => null);
      if (!res) throw new OrdersApiError('network', 'Tidak dapat menghubungi server');
      return res.json();
    },
    list: (params) => req('GET', `/orders${qs(params)}`),
    get: async (id) => (await req('GET', `/orders/${id}`)).order,
    create: (order) => req('POST', '/orders', order),
    update: (id, order, version) => req('PUT', `/orders/${id}`, { ...order, version }),
    remove: (id) => req('DELETE', `/orders/${id}`),
    importOrders: (orders) => req('POST', '/orders/import', { orders }),
    // master vendor / kendaraan / driver
    master: {
      list: async (kind, params) => (await req('GET', `/master/${kind}${qs(params)}`)).items,
      create: async (kind, item) => (await req('POST', `/master/${kind}`, item)).item,
      update: async (kind, id, item) => (await req('PUT', `/master/${kind}?id=${id}`, item)).item,
      remove: (kind, id) => req('DELETE', `/master/${kind}?id=${id}`),
    },
    // penawaran / alokasi
    integration: {
      list: () => req('GET', '/connectors'),
      mode: () => req('GET', '/connectors?r=mode'),
      setMode: (mode) => req('POST', '/connectors', { action: 'set_mode', mode }),
      save: (c) => req('POST', '/connectors', { action: 'save', ...c }),
      remove: (id) => req('POST', '/connectors', { action: 'delete', id }),
      test: (c) => req('POST', '/connectors', { action: 'test', ...c }),
      run: (id) => req('POST', '/connectors', { action: 'run', id }),
      orders: () => req('GET', '/orders?source=external&limit=100'),
      delivery: ({ from, to }) => req('GET', `/connectors?r=delivery&from=${from}&to=${to}`),
      saveFuel: (orderId, f) => req('POST', '/connectors', { action: 'fuel_save', orderId, ...f }),
      linkInfo: () => req('GET', '/connectors?r=link'),
      link: (b) => req('POST', '/connectors', { action: 'link', ...b }),
      linkClosed: (orderId) => req('POST', '/connectors', { action: 'link_closed', orderId }),
      setAlias: (plate, deviceId) => req('POST', '/connectors', { action: 'alias', plate, deviceId }),
      gpsArrivals: (arrivals) => req('POST', '/connectors', { action: 'gps_arrivals', arrivals }),
    },
    insights: {
      exceptions: ({ status = 'open', kind = '', q = '' } = {}) => req('GET', `/insights?status=${status}&kind=${kind}&q=${encodeURIComponent(q)}`),
      act: (action, id, note = '') => req('POST', '/insights', { action, id, note }),
      report: ({ from, to }) => req('GET', `/insights?r=report&from=${from}&to=${to}`),
      notify: () => req('GET', '/insights?r=notify'),
      saveNotify: (cfg) => req('POST', '/insights', { action: 'notify_save', ...cfg }).then((r) => r.settings),
      testNotify: () => req('POST', '/insights', { action: 'notify_test' }),
    },
    pod: { list: ({ kind, q, days } = {}) => req('GET', `/pod?list=1&kind=${kind || ''}&q=${encodeURIComponent(q || '')}&days=${days || 30}`).then((r) => r.pods), get: (id) => req('GET', `/pod?id=${encodeURIComponent(id)}`).then((r) => r.pod) },
    dispatch: {
      get: (orderId) => req('GET', `/dispatch?orderId=${orderId}`),
      offer: (orderId, vendorIds, expiryMin = 60) => req('POST', '/dispatch', { orderId, action: 'offer', vendorIds, expiryMin }),
      assign: (orderId, vendorId, vehicleId, driverId, notify = false) => req('POST', '/dispatch', { orderId, action: 'assign', vendorId, vehicleId, driverId, notify }),
      link: (orderId, notify = false) => req('POST', '/dispatch', { orderId, action: 'link', notify }),
      release: (orderId) => req('POST', '/dispatch', { orderId, action: 'release' }),
      saveCalc: (orderId, calc) => req('POST', '/dispatch', { orderId, action: 'save_calc', ...calc }),
      amendPod: (podId, note) => req('POST', '/dispatch', { action: 'pod_amend', podId, note }),
    },
  };
}

function createMockOrdersApi() {
  const db = new Map();
  let n = 0;
  const now = () => new Date().toISOString();
  const err = (status, code, details) => new OrdersApiError(code, code, details, status);
  const add = (input, by = 'operator@demo') => {
    const o = normalizeOrder(input);
    const v = validateOrder(o);
    if (v.errors.length) throw err(422, 'validation', v.errors);
    if ([...db.values()].some((x) => x.doNo.toLowerCase() === o.doNo.toLowerCase())) throw err(409, 'do_no_duplicate');
    const rec = { ...o, id: `mock-${++n}`, status: 'draft', version: 1, summary: summary(o), createdBy: by, createdAt: now(), updatedAt: now(), stops: o.stops.map((s, i) => ({ ...s, id: `mock-s${n}-${i}` })) };
    db.set(rec.id, rec);
    return { order: rec, warnings: v.warnings };
  };
  const it = (o = {}) => ({ description: 'Air mineral 600ml', qty: 100, unit: 'box', weightKg: 1200, volumeM3: 5, pallets: 2, colli: 100, ...o });
  const day = new Date();
  const at = (h) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0).toISOString();
  const ymdLocal = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  add({ doNo: 'DO-DEMO-001', customer: 'PT Contoh Makmur', orderDate: ymdLocal, priority: 'high', stops: [
    { type: 'pickup', name: 'Gudang Cikarang', lat: -6.3062, lng: 107.1722, windowStart: at(8), windowEnd: at(9), items: [it({ weightKg: 2400, pallets: 4, qty: 200 })] },
    { type: 'delivery', name: 'Toko Bekasi', lat: -6.2383, lng: 106.9756, windowStart: at(10), windowEnd: at(12), items: [it({ weightKg: 1200, pallets: 2 })] },
    { type: 'delivery', name: 'Toko Bogor', lat: -6.5944, lng: 106.7892, windowStart: at(13), windowEnd: at(16), items: [it({ weightKg: 1200, pallets: 2 })] },
  ] });
  add({ doNo: 'DO-DEMO-002', customer: 'CV Sumber Jaya', orderDate: ymdLocal, stops: [
    { type: 'pickup', name: 'Pabrik Karawang', items: [it({ description: 'Sparepart', weightKg: 800, qty: 40 })] },
    { type: 'delivery', name: 'Bengkel Jakarta Timur', items: [it({ description: 'Sparepart', weightKg: 800, qty: 40 })] },
  ] });
  // ---- master & penawaran (demo)
  let mid = 0;
  const M = { vendors: [], vehicles: [], drivers: [] };
  const offers = [];
  const addM = (kind, o) => { const r = { id: `m${++mid}`, active: true, ...o }; M[kind].push(r); return r; };
  const va = addM('vendors', { name: 'PT Angkut Sejahtera', email: 'ops@angkut.example', pic: 'Pak Dedi', phone: '081200000001', geotabGroup: '', notes: '' });
  const vb = addM('vendors', { name: 'CV Trans Mandiri', email: 'dispatch@transmandiri.example', pic: 'Bu Sari', phone: '081200000002', geotabGroup: '', notes: '' });
  const vi = addM('vendors', { name: 'Armada Internal SMA', email: '', pic: 'Dispatcher', phone: '', geotabGroup: '', notes: '', internal: true });
  addM('vehicles', { vendorId: vi.id, plate: 'B 7001 SMA', type: 'cdd', hasGps: true, fuelKmPerL: 9.5, maxWeightKg: 2500, maxVolumeM3: 10, maxPallets: 6, lengthCm: 380, widthCm: 170, heightCm: 170 });
  addM('vehicles', { vendorId: vi.id, plate: 'B 7002 SMA', type: 'fuso', hasGps: true, fuelKmPerL: 6.2, maxWeightKg: 8000, maxVolumeM3: 28, maxPallets: 14, lengthCm: 620, widthCm: 220, heightCm: 220 });
  addM('drivers', { vendorId: vi.id, name: 'Agus Pratama', phone: '081300000010', licenseNo: 'B2-010' });
  addM('vehicles', { vendorId: va.id, plate: 'B 9001 AA', type: 'cdd', hasGps: true, maxWeightKg: 2500, maxVolumeM3: 10, maxPallets: 6, lengthCm: 380, widthCm: 170, heightCm: 170 });
  addM('vehicles', { vendorId: va.id, plate: 'B 9002 AB', type: 'fuso', hasGps: false, maxWeightKg: 8000, maxVolumeM3: 28, maxPallets: 14, lengthCm: 620, widthCm: 220, heightCm: 220 });
  addM('vehicles', { vendorId: vb.id, plate: 'B 8101 CD', type: 'blindvan', hasGps: false, maxWeightKg: 900, maxVolumeM3: 4, maxPallets: 2 });
  addM('drivers', { vendorId: va.id, name: 'Budi Santoso', phone: '081300000001', licenseNo: 'B2-001' });
  addM('drivers', { vendorId: vb.id, name: 'Candra Wijaya', phone: '081300000002', licenseNo: 'B1-002' });
  const need = (id) => { const o = db.get(id); if (!o) throw err(404, 'not_found'); return o; };
  const mkOffers = (o) => offers.filter((f) => f.orderId === o.id);
  const decorate = (o) => {
    const ve = M.vendors.find((x) => x.id === o.vendorId);
    const vh = M.vehicles.find((x) => x.id === o.vehicleId);
    const dr = M.drivers.find((x) => x.id === o.driverId);
    const of = mkOffers(o);
    return { ...o, vendorName: ve?.name || '', plate: vh?.plate || '', driverName: dr?.name || '', openOffers: of.filter((f) => f.status === 'offered' && new Date(f.expiresAt) > new Date()).length, offerCount: of.length };
  };
  return {
    isMock: true,
    master: {
      async list(kind, { vendorId, all } = {}) { return M[kind].filter((x) => (all || x.active) && (!vendorId || x.vendorId === vendorId)).map((x) => ({ ...x })); },
      async create(kind, item) {
        if (!String(item.name || item.plate || '').trim()) throw err(422, 'validation', [{ path: 'name', code: 'required' }]);
        return { ...addM(kind, { ...item }) };
      },
      async update(kind, id, item) { const i = M[kind].findIndex((x) => x.id === id); if (i < 0) throw err(404, 'not_found'); M[kind][i] = { ...M[kind][i], ...item }; return { ...M[kind][i] }; },
      async remove(kind, id) { M[kind] = M[kind].filter((x) => x.id !== id); return { ok: true }; },
    },
    integration: {
      async list() { return { connectors: demoConn.map((c) => ({ ...c })), encryption: true, mode: demoMode.v }; },
      async mode() { return { mode: demoMode.v, modeSet: true }; },
      async setMode(mode) { demoMode.v = mode; return { mode }; },
      async save(c) { const id = c.id || `c${demoConn.length + 1}`; const i = demoConn.findIndex((x) => x.id === id); const row = { id, name: c.name, enabled: c.enabled !== false, baseUrl: c.baseUrl, authType: c.authType, authName: c.authName || '', hasSecret: !!c.secret || (i >= 0 && demoConn[i].hasSecret), config: c.config, intervalMin: c.intervalMin || 10, lastRunAt: '', lastStatus: '', lastError: '', lastCount: 0, orders: 0 }; if (i >= 0) demoConn[i] = { ...demoConn[i], ...row }; else demoConn.push(row); return { id }; },
      async remove(id) { demoConn.splice(demoConn.findIndex((x) => x.id === id), 1); return { ok: true }; },
      async test() { return { count: 2, sample: JSON.stringify({ id: 'T-1', do_number: 'SO-001', vehicle: { plate: 'B 1234 ABC' }, status: 'ON_THE_WAY', stops: [{ name: 'Gudang A', lat: -6.3, lng: 107.1 }] }, null, 2), mapped: [{ externalId: 'T-1', doNo: 'SO-001', plate: 'B 1234 ABC', status: 'running', extStatus: 'ON_THE_WAY', stops: [{ type: 'pickup', name: 'Gudang A', lat: -6.3, lng: 107.1, windowEnd: '' }, { type: 'delivery', name: 'Toko B', lat: -6.2, lng: 106.9, windowEnd: '' }], problems: [] }] }; },
      async run(id) { const c = demoConn.find((x) => x.id === id); if (c) Object.assign(c, { lastRunAt: now(), lastStatus: 'ok', lastCount: 2, orders: 2 }); return { ok: true, fetched: 2, created: 2, updated: 0, unchanged: 0, skipped: 0, noCoords: 0 }; },
      async orders() { return { orders: [] }; },
      async delivery() {
        const iso = (m) => new Date(Date.now() - m * 60000).toISOString();
        const mk = (id, doNo, status, ext, plate, arr, late) => ({ id, doNo, customer: 'PT Contoh', date: new Date().toISOString().slice(0, 10), status, extStatus: ext, plate, deviceId: 'b1', kg: 8000, fuel: null, arrived: arr, total: 2, measured: arr === 2 ? 1 : 0, onTime: arr === 2 && !late ? 1 : 0,
          verdict: status === 'done' ? (arr === 2 ? 'consistent' : 'tms_done_no_gps') : arr === 2 ? 'gps_done_tms_open' : 'in_progress',
          stops: [{ seq: 1, type: 'pickup', name: 'Gudang A', windowEnd: null, arriveAt: arr > 0 ? iso(300) : null, onTime: null, lateMin: null }, { seq: 2, type: 'delivery', name: 'Toko B', windowEnd: iso(200), arriveAt: arr === 2 ? iso(late ? 120 : 230) : null, onTime: arr === 2 ? !late : null, lateMin: late ? 80 : 0 }] });
        const orders = [mk('d1', 'SO-101', 'done', 'DELIVERED', 'B 1234 ABC', 2, false), mk('d2', 'SO-102', 'done', 'DELIVERED', 'B 9 XY', 2, true), mk('d3', 'SO-103', 'done', 'DELIVERED', 'D 77 ZZ', 0, false), mk('d4', 'SO-104', 'running', 'ON_THE_WAY', 'B 1234 ABC', 1, false)];
        orders[0].fuel = { fuelL: 52.4, distKm: 188.2, kmPerL: 3.59, lPerTonKm: 0.0348 };
        return { orders, graceMin: 15, summary: { total: 4, linked: 4, consistent: 2, mismatch: 1, measured: 2, onTime: 1, fuelL: 52.4, distKm: 188.2 } };
      },
      async saveFuel() { return { ok: true }; },
      async linkInfo() { return { pending: [], toClose: [], linkedActive: 0, aliases: {} }; },
      async link() { return { ok: true }; },
      async linkClosed() { return { ok: true }; },
      async setAlias() { return { ok: true }; },
      async gpsArrivals() { return { ok: true, inserted: 0 }; },
    },
    insights: {
      async exceptions({ status = 'open', kind = '' } = {}) {
        const rows = DEMO_EXC.filter((e) => (status === 'all' || e.state === status) && (!kind || e.kind === kind));
        const c = (st, sev) => DEMO_EXC.filter((e) => e.state === st && (!sev || e.severity === sev)).length;
        return { exceptions: rows.map((e) => ({ ...e })), counts: { high: c('open', 'high'), medium: c('open', 'medium'), low: c('open', 'low'), open: c('open'), handled: c('handled'), cleared: c('cleared') } };
      },
      async act(action, id, note) {
        const e = DEMO_EXC.find((x) => x.id === id);
        if (!e) throw err(404, 'not_found');
        if (action === 'ack') Object.assign(e, { state: 'handled', ackAt: now(), ackBy: 'demo', ackNote: note });
        else if (action === 'unack') Object.assign(e, { state: 'open', ackAt: '', ackNote: '' });
        else if (action === 'resolve') Object.assign(e, { state: 'cleared', clearedAt: now() });
        return { ok: true };
      },
      async report({ from, to }) { return demoReport(from, to); },
      async notify() { return { settings: demoNotify, providers: { email: { configured: false, from: 'aan@sumbermas-autorindo.com' }, wa: { provider: null, configured: false } }, log: [] }; },
      async saveNotify(cfg) {
        const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\n,;]+/)).map((x) => String(x).trim()).filter(Boolean);
        Object.assign(demoNotify, { ...cfg, emails: list(cfg.emails), phones: list(cfg.phones) });
        return { ...demoNotify };
      },
      async testNotify() { return { results: [{ channel: 'email', to: 'demo', status: 'skipped', error: 'Mode demo' }] }; },
    },
    pod: {
      async list({ kind } = {}) { return DEMO_PODS.filter((p) => !kind || p.kind === kind); },
      async get(id) {
        const p = DEMO_PODS.find((x) => x.id === id);
        if (!p) throw err(404, 'not_found');
        const it = p.kind === 'pickup' ? [{ description: 'Air mineral 600ml', sku: '', unit: 'box', sentQty: 100, receivedQty: 100, reason: '' }] : [{ description: 'Air mineral 600ml', sku: '', unit: 'box', sentQty: 100, receivedQty: 95, reason: 'Rusak 5 box' }];
        return { ...p, items: it, lat: -6.59, lng: 106.79, accuracyM: 12, capturedAt: p.submittedAt, signature: '', photoData: [], amendmentList: [], integrity: 'ok', order: { id: 'demo', doNo: p.doNo, customer: p.customer, vendorName: p.vendorName, plate: p.plate, driverName: 'Budi' } };
      },
    },
    dispatch: {
      async amendPod() { throw err(404, 'not_found'); },
      async saveCalc(orderId, calc) { const o = need(orderId); if (calc.cost) o.cost = { ...calc.cost, at: now() }; if (calc.fuel) o.fuel = { ...calc.fuel, at: now() }; return { ok: true }; },
      async get(orderId) {
        return { pods: [], trip: { events: [], steps: [] }, offers: offers.filter((f) => f.orderId === orderId).map((f) => ({ ...f, status: f.status === 'offered' && new Date(f.expiresAt) <= new Date() ? 'expired' : f.status, vendorName: M.vendors.find((v) => v.id === f.vendorId)?.name || '' })), mail: { configured: false, from: 'aan@sumbermas-autorindo.com' } };
      },
      async offer(orderId, vendorIds, expiryMin = 60) {
        const o = need(orderId);
        if (!['draft', 'offered'].includes(o.status)) throw err(409, 'order_state');
        offers.forEach((f) => { if (f.orderId === orderId && f.status === 'offered') f.status = 'withdrawn'; });
        const exp = new Date(Date.now() + expiryMin * 60000).toISOString();
        vendorIds.forEach((vid) => offers.push({ id: `of${++mid}`, orderId, vendorId: vid, status: 'offered', sentAt: now(), expiresAt: exp, respondedAt: '', rejectReason: '' }));
        o.status = 'offered';
        o.version += 1;
        return { ok: true, expiresAt: exp, mail: { configured: false }, emails: vendorIds.map((vid) => ({ vendorId: vid, vendorName: M.vendors.find((v) => v.id === vid)?.name, status: M.vendors.find((v) => v.id === vid)?.email ? 'skipped' : 'no_email' })) };
      },
      async assign(orderId, vendorId, vehicleId, driverId, notify) {
        const o = need(orderId);
        if (!['draft', 'offered'].includes(o.status)) throw err(409, 'order_state');
        offers.forEach((f) => { if (f.orderId === orderId && f.status === 'offered') f.status = 'withdrawn'; });
        Object.assign(o, { status: 'assigned', vendorId, vehicleId, driverId: driverId || null, assignedAt: now(), assignedVia: 'admin' });
        const dr = M.drivers.find((x) => x.id === driverId);
        return { ok: true, link: `https://demo.example/portal.html#/o/demo-${orderId}`, sent: notify ? [{ channel: 'whatsapp', to: dr?.name || '-', status: dr?.phone ? 'skipped' : 'no_phone', error: '' }] : [] };
      },
      async link(orderId) {
        const o = need(orderId);
        if (!['assigned', 'running'].includes(o.status)) throw err(409, 'order_state');
        return { ok: true, link: `https://demo.example/portal.html#/o/demo-${orderId}`, sent: [] };
      },
      async release(orderId) {
        const o = need(orderId);
        if (!['offered', 'assigned'].includes(o.status)) throw err(409, 'order_state');
        offers.forEach((f) => { if (f.orderId === orderId && f.status === 'offered') f.status = 'withdrawn'; });
        Object.assign(o, { status: 'draft', vendorId: null, vehicleId: null, driverId: null, assignedAt: '', assignedVia: '' });
        return { ok: true };
      },
    },
    health: async () => ({ ok: true, db: 'mock' }),
    async list({ status, q } = {}) {
      let rows = [...db.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const counts = {};
      for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
      if (status) rows = rows.filter((r) => r.status === status);
      if (q) rows = rows.filter((r) => `${r.doNo} ${r.customer}`.toLowerCase().includes(String(q).toLowerCase()));
      return { orders: rows.map(({ stops, ...h }) => decorate(h)), total: rows.length, counts };
    },
    async get(id) {
      const o = db.get(id);
      if (!o) throw err(404, 'not_found');
      return structuredClone(decorate(o));
    },
    async create(input) {
      return add(input);
    },
    async update(id, input, version) {
      const cur = db.get(id);
      if (!cur) throw err(404, 'not_found');
      if (cur.status !== 'draft') throw err(409, 'not_draft');
      if (cur.version !== version) throw err(409, 'version_conflict');
      const o = normalizeOrder(input);
      const v = validateOrder(o);
      if (v.errors.length) throw err(422, 'validation', v.errors);
      if ([...db.values()].some((x) => x.id !== id && x.doNo.toLowerCase() === o.doNo.toLowerCase())) throw err(409, 'do_no_duplicate');
      const rec = { ...cur, ...o, summary: summary(o), version: cur.version + 1, updatedAt: now(), stops: o.stops.map((s, i) => ({ ...s, id: `mock-s${id}-${i}-${cur.version + 1}` })) };
      db.set(id, rec);
      return { order: rec, warnings: v.warnings };
    },
    async remove(id) {
      const cur = db.get(id);
      if (!cur) throw err(404, 'not_found');
      if (cur.status !== 'draft') throw err(409, 'not_draft');
      db.delete(id);
      return { ok: true };
    },
    async importOrders(orders) {
      const results = orders.map((o) => {
        try {
          return { doNo: o.doNo, ok: true, id: add(o).order.id };
        } catch (e) {
          return { doNo: String(o?.doNo || ''), ok: false, code: e.code, details: e.details };
        }
      });
      return { results, created: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
    },
  };
}
