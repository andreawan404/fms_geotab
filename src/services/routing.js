// Routing & geocoding: OpenRouteService (butuh API key) atau OSRM (demo publik / self-host).
import { decodePolyline } from '../core/polyline.js';
import { RouteIndex, pathLength } from '../core/geometry.js';

async function jsonFetch(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!res.ok) throw new Error(body?.error?.message || body?.message || `HTTP ${res.status} ${text.slice(0, 120)}`);
  return body;
}

/** coords: [[lat,lng],...] -> [{ path, distanceM, durationS, legs:[{distanceM,durationS}] }] */
export async function findRoutes(settings, coords, { alternatives = false, profile } = {}) {
  const r = settings.routing;
  if (coords.length < 2) throw new Error('Minimal 2 titik');
  if (r.provider === 'ors') {
    if (!r.orsKey) throw new Error('API key OpenRouteService belum diisi (Pengaturan)');
    const body = { coordinates: coords.map(([la, ln]) => [ln, la]), instructions: false, preference: 'recommended' };
    const useAlt = alternatives && coords.length === 2;
    if (useAlt) body.alternative_routes = { target_count: 3, share_factor: 0.6, weight_factor: 1.6 };
    const url = `https://api.openrouteservice.org/v2/directions/${profile || r.profile || 'driving-car'}`;
    const send = (b) => jsonFetch(url, { method: 'POST', headers: { Authorization: r.orsKey, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    let data;
    try {
      data = await send(body);
    } catch (e) {
      if (!useAlt) throw e;
      delete body.alternative_routes; // alternatif ditolak (mis. jarak > 100 km) -> rute tunggal
      data = await send(body);
    }
    return data.routes.map((rt) => ({
      path: decodePolyline(rt.geometry),
      distanceM: rt.summary.distance,
      durationS: rt.summary.duration,
      legs: (rt.segments || []).map((s) => ({ distanceM: s.distance, durationS: s.duration })),
    }));
  }
  const base = (r.osrmUrl || 'https://router.project-osrm.org').replace(/\/$/, '');
  const c = coords.map(([la, ln]) => `${ln},${la}`).join(';');
  const url = `${base}/route/v1/driving/${c}?overview=full&geometries=polyline&steps=false&alternatives=${alternatives && coords.length === 2 ? 'true' : 'false'}`;
  const data = await jsonFetch(url);
  if (data.code !== 'Ok') throw new Error(data.message || data.code);
  return data.routes.map((rt) => ({
    path: decodePolyline(rt.geometry),
    distanceM: rt.distance,
    durationS: rt.duration,
    legs: (rt.legs || []).map((l) => ({ distanceM: l.distance, durationS: l.duration })),
  }));
}

/** ETA kumulatif tiap checkpoint dari durasi leg (rute rekomendasi). */
export function offsetsFromLegs(legs, n) {
  const out = [0];
  let acc = 0;
  for (let i = 1; i < n; i++) {
    acc += legs[i - 1]?.durationS || 0;
    out.push(Math.round(acc));
  }
  return out;
}

/** ETA kumulatif dari jarak sepanjang path / kecepatan rata-rata (rute manual). */
export function offsetsFromPath(path, checkpoints, avgKmh = 40) {
  if (path.length < 2) return checkpoints.map(() => 0);
  const idx = new RouteIndex(path);
  const v = (avgKmh * 1000) / 3600;
  let fromSeg = 0;
  return checkpoints.map((c) => {
    const n = idx.nearest(c.lat, c.lng, { fromSeg });
    fromSeg = n.t > 0.999 ? Math.min(n.seg + 1, idx.n - 2) : n.seg;
    return Math.round(n.along / v);
  });
}

export function distanceOf(path) {
  return pathLength(path);
}

export async function geocode(settings, text) {
  const r = settings.routing;
  const q = encodeURIComponent(text);
  if (r.provider === 'ors' && r.orsKey) {
    const cc = r.country ? `&boundary.country=${r.country}` : '';
    const data = await jsonFetch(`https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(r.orsKey)}&text=${q}&size=6${cc}`);
    return (data.features || []).map((f) => ({ label: f.properties.label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }));
  }
  const cc = r.country ? `&countrycodes=${r.country.toLowerCase()}` : '';
  const data = await jsonFetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${q}${cc}`);
  return data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
}
