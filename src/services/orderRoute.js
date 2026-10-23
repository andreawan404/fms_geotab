// Rute dari titik stop sebuah DO: dipakai pratinjau di form DO, penyimpanan ke menu Rute, dan penautan otomatis ke Monitor.
import { routeFromStops, routeIdOf } from '../core/linkPlan.js';
import { simplifyToMax } from '../core/geometry.js';
import { findRoutes, offsetsFromPath } from './routing.js';
import { haversine, pathLength } from '../core/geometry.js';

const COLORS = ['#0b5ea8', '#d9480f', '#2b8a3e', '#7b2cbf', '#c2255c', '#0c8599', '#e67700', '#495057'];
const r6 = (v) => Math.round(Number(v) * 1e6) / 1e6;

/** Hanya stop yang punya koordinat. */
export const routableStops = (stops) => (stops || []).filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)) && s.lat !== null && s.lng !== null);

/** Apakah rute tersimpan masih sama dengan titik stop DO (urutan dan koordinat)? */
export function sameStops(route, stops) {
  const cps = route?.checkpoints || [];
  return cps.length === stops.length && cps.every((c, i) => r6(c.lat) === r6(stops[i].lat) && r6(c.lng) === r6(stops[i].lng));
}

/** Semua alternatif jalur antar stop (OSRM/ORS sesuai Pengaturan); alternatif hanya tersedia untuk 2 titik. */
export async function computeAlternatives(settings, stops, route = findRoutes) {
  const res = await route(settings, stops.map((s) => [Number(s.lat), Number(s.lng)]), { alternatives: true });
  if (!res?.length) throw new Error('rute tidak ditemukan');
  return res.map((r) => ({ ...r, path: simplifyToMax(r.path, 2500, 2) }));
}
/** Jalur otomatis terbaik. */
export async function computePath(settings, stops, route = findRoutes) {
  return (await computeAlternatives(settings, stops, route))[0];
}
/** Jalur buatan dispatcher: titik-titik jalur digambar / digeser di peta. */
export function manualCalc(manualPath) {
  const path = simplifyToMax(manualPath, 2500, 1);
  return { path, manualPath: simplifyToMax(manualPath, 600, 1), distanceM: Math.round(pathLength(path)), durationS: 0, legs: [] };
}
/** Apakah ujung jalur manual masih dekat titik awal / akhir? (tanda bila stop diganti setelah jalur digambar) */
export function endpointsFar(path, stops, tolM = 500) {
  if (!path?.length || stops.length < 2) return false;
  const far = (p, s) => haversine(p[0], p[1], Number(s.lat), Number(s.lng)) > Math.max(tolM, Number(s.radiusM) || 0);
  return far(path[0], stops[0]) || far(path[path.length - 1], stops[stops.length - 1]);
}

/** Objek rute siap simpan di menu Rute. */
export function buildOrderRoute({ order, stops, calc, settings, widthM, colorIdx = 0 }) {
  const offsets = calc.manualPath?.length > 1
    ? offsetsFromPath(calc.path, stops.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng) })), settings.defaults.avgSpeedKmh)
    : undefined;
  return routeFromStops({ id: order.id, doNo: order.doNo, stops }, calc, {
    offsets, color: COLORS[colorIdx % COLORS.length], widthM: Number(widthM) || settings.defaults.widthM, radius: settings.defaults.radius, profile: settings.routing.profile,
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
