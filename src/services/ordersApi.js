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
  return {
    isMock: true,
    health: async () => ({ ok: true, db: 'mock' }),
    async list({ status, q } = {}) {
      let rows = [...db.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const counts = {};
      for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
      if (status) rows = rows.filter((r) => r.status === status);
      if (q) rows = rows.filter((r) => `${r.doNo} ${r.customer}`.toLowerCase().includes(String(q).toLowerCase()));
      return { orders: rows.map(({ stops, ...h }) => h), total: rows.length, counts };
    },
    async get(id) {
      const o = db.get(id);
      if (!o) throw err(404, 'not_found');
      return structuredClone(o);
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
