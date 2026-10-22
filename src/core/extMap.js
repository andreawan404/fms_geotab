// Pemetaan response JSON API TMS customer -> DO kita. Fungsi murni (dipakai server, pratinjau, dan tes).
import { normalizeOrder } from './orders.js';

export const EXT_STATUS = ['assigned', 'running', 'done', 'cancelled'];

/** Ambil nilai dari path bertitik: "a.b[0].c", "a.b.0.c". Path kosong -> objek itu sendiri. */
export function getPath(obj, path) {
  if (path === '' || path == null) return obj;
  let cur = obj;
  for (const k of String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

const str = (v) => (v == null ? '' : typeof v === 'object' ? '' : String(v).trim());
const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Waktu -> ISO UTC. Angka: detik / milidetik epoch. Teks tanpa zona dianggap zona `tzMin` (menit dari UTC, default WIB +420). */
export function parseTime(v, tzMin = 420) {
  if (v == null || v === '') return '';
  let ms;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) {
    const n = Number(v);
    ms = n > 1e11 ? n : n * 1000;
  } else {
    let s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
    s = s.replace(' ', 'T');
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
      const sign = tzMin >= 0 ? '+' : '-';
      const a = Math.abs(tzMin);
      s += `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
    }
    ms = Date.parse(s);
  }
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

/** Normalisasi plat untuk pencocokan: huruf besar, tanpa spasi / tanda baca. "B 1234 ABC" == "b-1234-abc". */
export const normPlate = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const lookup = (map, raw, dflt) => {
  if (!map) return dflt;
  const k = String(raw ?? '').trim();
  if (k in map) return map[k];
  const lower = Object.keys(map).find((x) => x.toLowerCase() === k.toLowerCase());
  return lower ? map[lower] : dflt;
};

/**
 * Petakan satu objek dari API customer.
 * @returns {{ ok: boolean, order?: object, externalId: string, extStatus: string, status: string, plate: string, problems: string[] }}
 */
export function mapRecord(rec, m, { connectorName = '', now = Date.now() } = {}) {
  const o = m.order || {};
  const tz = Number.isFinite(Number(m.timezoneMin)) ? Number(m.timezoneMin) : 420;
  const problems = [];
  const externalId = str(getPath(rec, o.externalId)) || str(getPath(rec, o.doNo));
  if (!externalId) problems.push('externalId');
  const doNo = str(getPath(rec, o.doNo)) || externalId;
  const rawStatus = str(getPath(rec, o.status));
  const status = lookup(o.statusMap, rawStatus, o.defaultStatus || 'assigned');
  const sm = m.stops || {};
  const rawStops = getPath(rec, sm.path);
  const list = Array.isArray(rawStops) ? rawStops : [];
  if (!list.length) problems.push('stops');
  const stops = list.map((s, i) => {
    const rawType = str(getPath(s, sm.typeField));
    const type = sm.fixedType || lookup(sm.typeMap, rawType, i === 0 ? 'pickup' : 'delivery');
    const im = m.items || {};
    const rawItems = im.path ? getPath(s, im.path) : null;
    const items = (Array.isArray(rawItems) ? rawItems : []).map((it) => ({
      description: str(getPath(it, im.description)) || 'Barang', qty: numOrNull(getPath(it, im.qty)) ?? 1, unit: str(getPath(it, im.unit)) || 'pcs', weightKg: numOrNull(getPath(it, im.weightKg)),
    }));
    return {
      type: type === 'pickup' ? 'pickup' : 'delivery', name: str(getPath(s, sm.name)) || `Stop ${i + 1}`, address: str(getPath(s, sm.address)),
      lat: numOrNull(getPath(s, sm.lat)), lng: numOrNull(getPath(s, sm.lng)), radiusM: numOrNull(getPath(s, sm.radius)) ?? 150,
      windowStart: parseTime(getPath(s, sm.windowStart), tz), windowEnd: parseTime(getPath(s, sm.windowEnd), tz), items: items.length ? items : [{ description: 'Barang', qty: 1, unit: 'pcs' }],
    };
  });
  if (stops.some((s) => s.lat == null || s.lng == null)) problems.push('coords');
  const order = normalizeOrder({
    doNo, customer: str(getPath(rec, o.customer)) || connectorName || 'Eksternal', orderDate: (parseTime(getPath(rec, o.date), tz) || new Date(now).toISOString()).slice(0, 10), priority: 'normal', notes: str(getPath(rec, o.notes)), stops,
  });
  return { ok: !problems.includes('externalId') && !problems.includes('stops'), order, externalId, extStatus: rawStatus, status: EXT_STATUS.includes(status) ? status : 'assigned', plate: str(getPath(rec, o.plate)), problems };
}

/** Tanda tangan isi stop (nama + koordinat + jadwal) untuk mendeteksi perubahan rute dari TMS. */
export const stopsSig = (order) => (order.stops || []).map((s) => [s.type, s.name, s.lat == null ? '' : Number(s.lat).toFixed(5), s.lng == null ? '' : Number(s.lng).toFixed(5), s.windowStart, s.windowEnd].join('~')).join('|');

/** Isi template query: {{since}}, {{today}}, {{from}} (kemarin), {{to}} (7 hari lagi). */
export function fillTemplate(text, { since, now = Date.now() } = {}) {
  const d = (x) => new Date(x).toISOString().slice(0, 10);
  return String(text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => ({ since: since || new Date(now - 864e5).toISOString(), today: d(now), from: d(now - 864e5), to: d(now + 7 * 864e5) }[k] ?? ''));
}
