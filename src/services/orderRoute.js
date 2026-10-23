// Rute dari titik stop sebuah DO: dipakai pratinjau di form DO, penyimpanan ke menu Rute, dan penautan otomatis ke Monitor.
import { routeFromStops, routeIdOf } from '../core/linkPlan.js';
import { simplifyToMax } from '../core/geometry.js';
import { findRoutes } from './routing.js';

const COLORS = ['#0b5ea8', '#d9480f', '#2b8a3e', '#7b2cbf', '#c2255c', '#0c8599', '#e67700', '#495057'];
const r6 = (v) => Math.round(Number(v) * 1e6) / 1e6;

/** Hanya stop yang punya koordinat. */
export const routableStops = (stops) => (stops || []).filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)) && s.lat !== null && s.lng !== null);

/** Apakah rute tersimpan masih sama dengan titik stop DO (urutan dan koordinat)? */
export function sameStops(route, stops) {
  const cps = route?.checkpoints || [];
  return cps.length === stops.length && cps.every((c, i) => r6(c.lat) === r6(stops[i].lat) && r6(c.lng) === r6(stops[i].lng));
}

/** Hitung jalur antar stop (OSRM/ORS sesuai Pengaturan). */
export async function computePath(settings, stops, route = findRoutes) {
  const [best] = await route(settings, stops.map((s) => [Number(s.lat), Number(s.lng)]));
  if (!best) throw new Error('rute tidak ditemukan');
  return { ...best, path: simplifyToMax(best.path, 2500, 2) };
}

/** Objek rute siap simpan di menu Rute. */
export function buildOrderRoute({ order, stops, calc, settings, widthM, colorIdx = 0 }) {
  return routeFromStops({ id: order.id, doNo: order.doNo, stops }, calc, {
    color: COLORS[colorIdx % COLORS.length], widthM: Number(widthM) || settings.defaults.widthM, radius: settings.defaults.radius, profile: settings.routing.profile,
  });
}

/**
 * Simpan (atau perbarui) rute DO di menu Rute. Memakai id tetap `x-<orderId>`.
 * @returns {Promise<object>} rute tersimpan
 */
export async function saveOrderRoute({ order, stops, calc, settings, widthM, existing, saveRoute, colorIdx }) {
  const r = buildOrderRoute({ order, stops, calc, settings, widthM, colorIdx });
  return saveRoute({ ...r, ...(existing ? { _rid: existing._rid, _chunks: existing._chunks, zoneId: existing.zoneId, createdAt: existing.createdAt || r.createdAt } : {}) });
}
export { routeIdOf };
