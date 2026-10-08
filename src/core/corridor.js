// Koridor rute (buffer polyline) — dipakai untuk tampilan peta dan sinkronisasi Zone Geotab.
import buffer from '@turf/buffer';
import { lineString } from '@turf/helpers';
import { simplifyToMax } from './geometry.js';

/** Mengembalikan daftar ring poligon [[lat,lng],...] (biasanya 1 ring). */
export function corridorRings(path, widthM) {
  if (!path || path.length < 2 || !(widthM > 0)) return [];
  const line = lineString(path.map(([la, ln]) => [ln, la]));
  const poly = buffer(line, widthM / 2, { units: 'meters', steps: 6 });
  if (!poly) return [];
  const g = poly.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((rings) => rings[0].map(([ln, la]) => [la, ln]));
}

/** Satu ring untuk Zone Geotab (disederhanakan agar ukuran wajar). */
export function corridorZoneRing(path, widthM, maxPts = 400) {
  const rings = corridorRings(path, widthM);
  if (!rings.length) return { ring: [], parts: 0 };
  const biggest = rings.reduce((a, b) => (b.length > a.length ? b : a));
  const ring = simplifyToMax(biggest, maxPts, 1);
  return { ring, parts: rings.length };
}
