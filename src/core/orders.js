// Model & aturan DO (Delivery Order): normalisasi, validasi, total kapasitas. Murni (dipakai add-in, API, dan tes).
import { ymd } from './time.js';

export const ORDER_STATUS = ['draft', 'offered', 'assigned', 'running', 'done', 'cancelled'];
export const PRIORITIES = ['normal', 'high', 'urgent'];
export const STOP_TYPES = ['pickup', 'delivery'];
export const UNITS = ['pcs', 'box', 'koli', 'pallet', 'drum', 'roll', 'set', 'kg', 'ltr'];
export const CATEGORIES = ['general', 'fragile', 'food', 'chemical', 'electronic', 'construction', 'automotive', 'other'];

/** Angka dari input bebas: '' -> null, '1,5' -> 1.5, sampah -> NaN. */
export function num(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  return Number(/^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s);
}
const str = (v) => (v == null ? '' : String(v).trim());
const bool = (v, dflt) => {
  if (v === true || v === false) return v;
  const s = str(v).toLowerCase();
  if (!s) return dflt;
  if (['1', 'true', 'ya', 'y', 'yes', 'x'].includes(s)) return true;
  if (['0', 'false', 'tidak', 'n', 'no'].includes(s)) return false;
  return dflt;
};

export const emptyItem = () => ({ description: '', sku: '', qty: 1, unit: 'pcs', weightKg: null, volumeM3: null, pallets: null, colli: null, lengthCm: null, widthCm: null, heightCm: null, category: 'general', tempMin: null, tempMax: null, hazardous: false, stackable: true });
export const emptyStop = (type = 'pickup') => ({ type, name: '', address: '', lat: null, lng: null, radiusM: 150, windowStart: '', windowEnd: '', contactName: '', contactPhone: '', instructions: '', items: [emptyItem()] });
export const emptyOrder = () => ({ doNo: '', customer: '', orderDate: ymd(new Date()), priority: 'normal', notes: '', stops: [emptyStop('pickup'), emptyStop('delivery')] });

function normItem(it = {}) {
  const e = emptyItem();
  return {
    description: str(it.description), sku: str(it.sku), qty: num(it.qty), unit: str(it.unit) || e.unit,
    weightKg: num(it.weightKg), volumeM3: num(it.volumeM3), pallets: num(it.pallets), colli: num(it.colli),
    lengthCm: num(it.lengthCm), widthCm: num(it.widthCm), heightCm: num(it.heightCm),
    category: str(it.category) || e.category, tempMin: num(it.tempMin), tempMax: num(it.tempMax),
    hazardous: bool(it.hazardous, false), stackable: bool(it.stackable, true),
  };
}

export function normalizeOrder(o = {}) {
  return {
    doNo: str(o.doNo), customer: str(o.customer), orderDate: str(o.orderDate), priority: str(o.priority) || 'normal', notes: str(o.notes),
    stops: (o.stops || []).map((s) => ({
      type: str(s.type), name: str(s.name), address: str(s.address), lat: num(s.lat), lng: num(s.lng), radiusM: num(s.radiusM) ?? 150,
      windowStart: str(s.windowStart), windowEnd: str(s.windowEnd), contactName: str(s.contactName), contactPhone: str(s.contactPhone),
      instructions: str(s.instructions), items: (s.items || []).map(normItem),
    })),
  };
}

const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const bad = (n) => n != null && !Number.isFinite(n);

/**
 * Validasi DO (sudah dinormalisasi). Mengembalikan { errors, warnings }, tiap entri { path, code, ...param }.
 * errors = menghalangi simpan; warnings = boleh disimpan tapi perlu perhatian.
 */
export function validateOrder(o) {
  const errors = [];
  const warnings = [];
  const E = (path, code, extra = {}) => errors.push({ path, code, ...extra });
  const W = (path, code, extra = {}) => warnings.push({ path, code, ...extra });

  if (!o.doNo) E('doNo', 'do_no_required');
  else if (!/^[A-Za-z0-9][A-Za-z0-9\-_/.]{0,39}$/.test(o.doNo)) E('doNo', 'do_no_format');
  if (!o.customer) E('customer', 'customer_required');
  if (o.orderDate && !validYmd(o.orderDate)) E('orderDate', 'date_invalid');
  if (!o.orderDate) E('orderDate', 'date_invalid');
  if (!PRIORITIES.includes(o.priority)) E('priority', 'priority_invalid');

  const stops = o.stops || [];
  if (stops.length < 2) E('stops', 'stops_min');
  else {
    if (stops[0].type !== 'pickup') E('stops.0.type', 'first_pickup');
    if (stops[stops.length - 1].type !== 'delivery') E(`stops.${stops.length - 1}.type`, 'last_delivery');
  }
  if (stops.length > 30) E('stops', 'stops_max');

  stops.forEach((s, i) => {
    const p = `stops.${i}`;
    const n = i + 1;
    if (!STOP_TYPES.includes(s.type)) E(`${p}.type`, 'stop_type_invalid', { n });
    if (!s.name) E(`${p}.name`, 'stop_name_required', { n });
    if (bad(s.lat) || bad(s.lng) || (s.lat != null && (s.lat < -90 || s.lat > 90)) || (s.lng != null && (s.lng < -180 || s.lng > 180))) E(`${p}.lat`, 'latlng_invalid', { n });
    else if ((s.lat == null) !== (s.lng == null)) E(`${p}.lat`, 'latlng_pair', { n });
    else if (s.lat == null) W(`${p}.lat`, 'no_coords', { n });
    if (bad(s.radiusM) || s.radiusM < 10 || s.radiusM > 5000) E(`${p}.radiusM`, 'radius_invalid', { n });
    const ws = s.windowStart ? Date.parse(s.windowStart) : null;
    const we = s.windowEnd ? Date.parse(s.windowEnd) : null;
    if ((s.windowStart && Number.isNaN(ws)) || (s.windowEnd && Number.isNaN(we))) E(`${p}.windowStart`, 'window_invalid', { n });
    else if (ws != null && we != null && we < ws) E(`${p}.windowEnd`, 'window_order', { n });
    if (!s.items.length) E(`${p}.items`, 'item_required', { n });
    s.items.forEach((it, j) => {
      const q = `${p}.items.${j}`;
      const m = j + 1;
      if (!it.description) E(`${q}.description`, 'item_desc_required', { n, m });
      if (it.qty == null || bad(it.qty) || it.qty <= 0) E(`${q}.qty`, 'qty_positive', { n, m });
      for (const f of ['weightKg', 'volumeM3', 'pallets', 'colli', 'lengthCm', 'widthCm', 'heightCm']) {
        if (bad(it[f]) || (it[f] != null && it[f] < 0)) E(`${q}.${f}`, 'num_negative', { n, m, field: f });
      }
      if (bad(it.tempMin) || bad(it.tempMax)) E(`${q}.tempMin`, 'temp_invalid', { n, m });
      else if (it.tempMin != null && it.tempMax != null && it.tempMin > it.tempMax) E(`${q}.tempMin`, 'temp_order', { n, m });
    });
  });

  if (!errors.length) {
    const t = totals(o);
    if (t.unloadedWeight > t.loadedWeight * 1.005 + 0.001) W('stops', 'cargo_exceeds', { metric: 'weight' });
    if (t.unloadedPallets > t.loadedPallets + 0.001) W('stops', 'cargo_exceeds', { metric: 'pallets' });
    if (t.tempConflict) W('stops', 'temp_conflict');
    if (t.loadedWeight === 0) W('stops', 'no_weight');
  }
  return { errors, warnings };
}

const sum = (items, f) => items.reduce((a, it) => a + (it[f] || 0), 0);

/**
 * Total muatan dan beban puncak sepanjang rute. Berat/volume/pallet/koli pada item = total untuk baris itu
 * (bukan per unit). Beban puncak = muatan terbanyak yang ada di truk setelah suatu stop (pickup menambah, delivery mengurangi).
 */
export function totals(order) {
  const stops = order.stops || [];
  const r = { stops: stops.length, legs: Math.max(0, stops.length - 1), loadedQty: 0, loadedWeight: 0, loadedVolume: 0, loadedPallets: 0, loadedColli: 0, unloadedWeight: 0, unloadedPallets: 0, peakWeight: 0, peakVolume: 0, peakPallets: 0, peakColli: 0, hazardous: false, unstackable: false, tempMin: null, tempMax: null, tempConflict: false, maxLengthCm: 0, maxWidthCm: 0, maxHeightCm: 0 };
  let w = 0, v = 0, p = 0, c = 0;
  for (const s of stops) {
    const items = s.items || [];
    const sg = (f) => sum(items, f);
    const dir = s.type === 'delivery' ? -1 : 1;
    if (s.type === 'delivery') {
      r.unloadedWeight += sg('weightKg');
      r.unloadedPallets += sg('pallets');
    } else {
      r.loadedQty += sg('qty');
      r.loadedWeight += sg('weightKg');
      r.loadedVolume += sg('volumeM3');
      r.loadedPallets += sg('pallets');
      r.loadedColli += sg('colli');
    }
    w += dir * sg('weightKg'); v += dir * sg('volumeM3'); p += dir * sg('pallets'); c += dir * sg('colli');
    r.peakWeight = Math.max(r.peakWeight, w);
    r.peakVolume = Math.max(r.peakVolume, v);
    r.peakPallets = Math.max(r.peakPallets, p);
    r.peakColli = Math.max(r.peakColli, c);
    for (const it of items) {
      if (it.hazardous) r.hazardous = true;
      if (it.stackable === false) r.unstackable = true;
      if (it.tempMin != null) r.tempMin = r.tempMin == null ? it.tempMin : Math.max(r.tempMin, it.tempMin);
      if (it.tempMax != null) r.tempMax = r.tempMax == null ? it.tempMax : Math.min(r.tempMax, it.tempMax);
      r.maxLengthCm = Math.max(r.maxLengthCm, it.lengthCm || 0);
      r.maxWidthCm = Math.max(r.maxWidthCm, it.widthCm || 0);
      r.maxHeightCm = Math.max(r.maxHeightCm, it.heightCm || 0);
    }
  }
  r.tempConflict = r.tempMin != null && r.tempMax != null && r.tempMin > r.tempMax;
  for (const k of ['loadedWeight', 'loadedVolume', 'peakWeight', 'peakVolume', 'unloadedWeight']) r[k] = Math.round(r[k] * 1000) / 1000;
  return r;
}

/** Ringkasan untuk daftar DO (disimpan di kolom summary). */
export function summary(order) {
  const t = totals(order);
  const s = order.stops || [];
  return { ...t, origin: s[0]?.name || '', destination: s[s.length - 1]?.name || '' };
}

/** Syarat sebelum DO boleh ditawarkan ke vendor (dipakai tahap dispatch). */
export function dispatchBlockers(order) {
  const out = [];
  (order.stops || []).forEach((s, i) => {
    const n = i + 1;
    if (s.lat == null || s.lng == null) out.push({ code: 'need_coords', n });
    if (s.type === 'delivery' && !s.windowEnd) out.push({ code: 'need_window', n });
  });
  if (totals(order).loadedWeight <= 0) out.push({ code: 'need_weight' });
  return out;
}

/** Pasangan leg berurutan [{ from, to, fromIdx, toIdx }]. */
export function legs(order) {
  const s = order.stops || [];
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push({ fromIdx: i, toIdx: i + 1, from: s[i], to: s[i + 1] });
  return out;
}

/** Nomor DO otomatis: DO-YYYYMMDD-HHmmss-KODECUSTOMER (kode = huruf/angka awal nama customer, maks 8). */
export function genDoNo(customer, now = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  const code = String(customer || '').normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  return code ? `DO-${stamp}-${code}` : '';
}
