// Perencanaan penautan DO eksternal -> kendaraan Geotab + rute + penugasan. Fungsi murni.
import { normPlate } from './extMap.js';

export const routeIdOf = (orderId) => `x-${orderId}`;
export const asgIdOf = (orderId) => `xa-${orderId}`;
/** Kunci instance penugasan: `${asgId}@${yyyy-mm-dd}` -> orderId (atau null bila bukan penugasan hasil integrasi). */
export const orderIdOfInstKey = (key) => {
  const m = /^xa-(.+?)@\d{4}-\d{2}-\d{2}$/.exec(String(key || ''));
  return m ? m[1] : null;
};

/** @returns {{ device?: object, reason?: 'no_plate'|'no_device'|'ambiguous' }} */
export function matchDevice(plate, devices, aliases = {}) {
  const k = normPlate(plate);
  if (!k) return { reason: 'no_plate' };
  const alias = aliases[k];
  if (alias) {
    const d = devices.find((x) => x.id === alias);
    if (d) return { device: d };
  }
  const hits = devices.filter((d) => normPlate(d.plate) === k || normPlate(d.name) === k);
  if (hits.length === 1) return { device: hits[0] };
  return { reason: hits.length ? 'ambiguous' : 'no_device' };
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ymdLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Jendela pemantauan dari jadwal stop. Selalu mencakup waktu sekarang selama DO aktif; maksimal 23 jam 59 menit. */
export function planWindow(stops, { nowMs, etaS = 0 }) {
  const ws = Date.parse(stops[0]?.windowStart || '');
  const lastEnd = Date.parse([...stops].reverse().find((s) => s.windowEnd)?.windowEnd || '');
  let start = Number.isFinite(ws) ? ws : nowMs - 30 * 60000;
  start = Math.min(Math.max(start, nowMs - 18 * 3600000), nowMs);
  let end = Number.isFinite(lastEnd) ? lastEnd + 60 * 60000 : start + Math.max(etaS * 1.5 * 1000, 4 * 3600000);
  end = Math.max(end, nowMs + 2 * 3600000, start + 30 * 60000);
  end = Math.min(end, start + (24 * 60 - 1) * 60000);
  // DO yang melewati tengah malam tetap satu penugasan: engine menambah satu hari bila jam akhir <= jam mulai
  return { date: ymdLocal(start), startTime: hhmm(start), endTime: hhmm(end), startMs: start, endMs: end };
}

export function routeFromStops(order, { path, legs, distanceM, durationS, manualPath, tollM, tollKnown }, { color, widthM, radius, profile, offsets: given }) {
  const cps = order.stops.map((s, i) => ({ id: `${order.id}-${i + 1}`, name: s.name || `Stop ${i + 1}`, lat: +Number(s.lat).toFixed(6), lng: +Number(s.lng).toFixed(6), radius: Number(s.radiusM) || radius }));
  let acc = 0;
  const legOffsets = cps.map((_, i) => { if (i > 0) acc += legs?.[i - 1]?.durationS || 0; return Math.round(acc); });
  const offsets = given || legOffsets;
  const manual = Array.isArray(manualPath) && manualPath.length > 1;
  return {
    id: routeIdOf(order.id), name: `${order.doNo}`, color, mode: manual ? 'manual' : 'recommended', profile, widthM, params: {}, checkpoints: cps.map((c, i) => ({ ...c, etaOffsetS: offsets[i] })),
    path, manualPath: manual ? manualPath : [], distanceM: Math.round(distanceM || 0), tollM: tollKnown ? Math.round(tollM || 0) : null, durationS: Math.round(offsets[offsets.length - 1] || durationS || 0), createdAt: Date.now(), updatedAt: Date.now(), source: 'order', orderId: order.id,
  };
}
