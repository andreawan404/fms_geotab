import { centroid, haversine } from '../core/geometry.js';

let cache = null;
let pending = null;
/** Daftar Zona Geotab, dimuat sekali per sesi. */
export function loadZones(geotab) {
  if (cache) return Promise.resolve(cache);
  if (!pending) pending = geotab.getZones().then((z) => { cache = z; return z; }).finally(() => { pending = null; });
  return pending;
}
export const peekZones = () => cache;

/** Titik stop dari sebuah zona: pusat poligon dan radius yang melingkupinya. */
export function zoneToStop(z) {
  const [la, ln] = centroid(z.points);
  const r = Math.max(...z.points.map((p) => haversine(la, ln, p[0], p[1])));
  return { zoneId: z.id, name: z.name, lat: +la.toFixed(6), lng: +ln.toFixed(6), radiusM: Math.round(Math.min(5000, Math.max(50, r))) };
}
