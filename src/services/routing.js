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

/** OSRM: jarak ruas tol dari kelas persimpangan ('toll') tiap langkah; known = ada informasi kelas jalan sama sekali. */
export function osrmTollOfLeg(leg) {
  let tollM = 0;
  let known = false;
  for (const st of leg.steps || []) {
    const ix = st.intersections || [];
    if (ix.some((i) => Array.isArray(i.classes) && i.classes.length)) known = true;
    const n = ix.filter((i) => (i.classes || []).includes('toll')).length;
    if (ix.length && n * 2 >= ix.length) tollM += st.distance || 0;
  }
  return { tollM: Math.round(tollM), known };
}

/** ORS: values = [[idxMulai, idxAkhir, 1|0]] terhadap titik geometri; way_points = indeks titik awal/akhir tiap leg. */
export function orsToll(path, wayPoints, values) {
  const legCount = Math.max(0, (wayPoints?.length || 0) - 1);
  const legs = new Array(legCount).fill(0);
  if (!Array.isArray(values)) return { totalM: 0, legs, known: false };
  const seg = (a, b) => { let d = 0; for (let i = a; i < b && i + 1 < path.length; i++) d += haversineM(path[i], path[i + 1]); return d; };
  let total = 0;
  for (const [from, to, val] of values) {
    if (!val) continue;
    total += seg(from, to);
    for (let k = 0; k < legCount; k++) {
      const a = Math.max(from, wayPoints[k]);
      const b = Math.min(to, wayPoints[k + 1]);
      if (b > a) legs[k] += seg(a, b);
    }
  }
  return { totalM: Math.round(total), legs: legs.map(Math.round), known: true };
}
const haversineM = ([la1, ln1], [la2, ln2]) => {
  const R = 6371000; const rad = Math.PI / 180;
  const dLa = (la2 - la1) * rad; const dLn = (ln2 - ln1) * rad;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/** coords: [[lat,lng],...] -> [{ path, distanceM, durationS, legs:[{distanceM,durationS,tollM}], tollM, tollKnown }] */
export async function findRoutes(settings, coords, { alternatives = false, profile } = {}) {
  const r = settings.routing;
  if (coords.length < 2) throw new Error('Minimal 2 titik');
  if (r.provider === 'ors') {
    if (!r.orsKey) throw new Error('API key OpenRouteService belum diisi (Pengaturan)');
    const body = { coordinates: coords.map(([la, ln]) => [ln, la]), instructions: false, preference: 'recommended', extra_info: ['tollways'] };
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
    return data.routes.map((rt) => {
      const path = decodePolyline(rt.geometry);
      const toll = orsToll(path, rt.way_points, rt.extras?.tollways?.values);
      return {
        path,
        distanceM: rt.summary.distance,
        durationS: rt.summary.duration,
        legs: (rt.segments || []).map((s, i) => ({ distanceM: s.distance, durationS: s.duration, tollM: toll.legs[i] })),
        tollM: toll.totalM,
        tollKnown: toll.known,
      };
    });
  }
  const base = (r.osrmUrl || 'https://router.project-osrm.org').replace(/\/$/, '');
  const c = coords.map(([la, ln]) => `${ln},${la}`).join(';');
  const url = `${base}/route/v1/driving/${c}?overview=full&geometries=polyline&steps=true&alternatives=${alternatives && coords.length === 2 ? 'true' : 'false'}`;
  const data = await jsonFetch(url);
  if (data.code !== 'Ok') throw new Error(data.message || data.code);
  return data.routes.map((rt) => {
    const legs = (rt.legs || []).map((l) => ({ distanceM: l.distance, durationS: l.duration, ...osrmTollOfLeg(l) }));
    return {
      path: decodePolyline(rt.geometry),
      distanceM: rt.distance,
      durationS: rt.duration,
      legs: legs.map(({ known: _k, ...x }) => x),
      tollM: legs.reduce((a, l) => a + (l.tollM || 0), 0),
      tollKnown: legs.some((l) => l.known),
    };
  });
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

/** Alamat dari koordinat (best effort, hanya Nominatim). Mengembalikan string atau ''. */
export async function reverseGeocode(settings, lat, lng) {
  try {
    const r = settings.routing || {};
    if (r.provider === 'ors' && r.orsKey) {
      const d = await jsonFetch(`https://api.openrouteservice.org/geocode/reverse?api_key=${encodeURIComponent(r.orsKey)}&point.lon=${lng}&point.lat=${lat}&size=1`);
      return d.features?.[0]?.properties?.label || '';
    }
    const d = await jsonFetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
    return d.display_name || '';
  } catch {
    return '';
  }
}
