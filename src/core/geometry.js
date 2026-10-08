// Geometri murni (tanpa dependensi) — aman dipakai ulang di backend Node (fase C).
export const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;

export function haversine(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * RAD;
  const dLng = (bLng - aLng) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return d;
}

export function centroid(pts) {
  if (!pts.length) return [0, 0];
  let la = 0;
  let ln = 0;
  for (const p of pts) {
    la += p[0];
    ln += p[1];
  }
  return [la / pts.length, ln / pts.length];
}

export function boundsOf(pts) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const [la, ln] of pts) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
  }
  return [[minLat, minLng], [maxLat, maxLng]];
}

function projector(pts) {
  const refLat = centroid(pts)[0];
  const k = Math.cos(refLat * RAD);
  return (lat, lng) => [lng * RAD * EARTH_R * k, lat * RAD * EARTH_R];
}

/**
 * Indeks polyline rute: jarak titik ke rute (meter), posisi sepanjang rute, dan titik terdekat.
 * Memakai proyeksi equirectangular lokal — akurat < 1% untuk rute regional.
 */
export class RouteIndex {
  constructor(points) {
    this.points = points;
    this.n = points.length;
    const proj = projector(points.length ? points : [[0, 0]]);
    this.proj = proj;
    this.xs = new Float64Array(this.n);
    this.ys = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const [x, y] = proj(points[i][0], points[i][1]);
      this.xs[i] = x;
      this.ys[i] = y;
    }
    this.segLen = new Float64Array(Math.max(0, this.n - 1));
    this.cum = new Float64Array(this.n);
    for (let i = 1; i < this.n; i++) {
      this.segLen[i - 1] = haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
      this.cum[i] = this.cum[i - 1] + this.segLen[i - 1];
    }
    this.length = this.n ? this.cum[this.n - 1] : 0;
  }

  _scan(px, py, from, to) {
    let best = Infinity;
    let bi = -1;
    let bt = 0;
    const { xs, ys } = this;
    for (let i = from; i < to; i++) {
      const ax = xs[i];
      const ay = ys[i];
      const dx = xs[i + 1] - ax;
      const dy = ys[i + 1] - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (ax + t * dx);
      const ey = py - (ay + t * dy);
      const d2 = ex * ex + ey * ey;
      if (d2 < best) {
        best = d2;
        bi = i;
        bt = t;
      }
    }
    return { d2: best, i: bi, t: bt };
  }

  /**
   * @param opts.hint   indeks segmen terakhir (percepat pencarian untuk titik berurutan)
   * @param opts.accept jarak (m) yang dianggap cukup dekat sehingga pencarian window dipercaya
   */
  nearest(lat, lng, opts = {}) {
    if (this.n === 0) return { dist: Infinity, seg: 0, t: 0, along: 0, lat, lng };
    if (this.n === 1) {
      return { dist: haversine(lat, lng, this.points[0][0], this.points[0][1]), seg: 0, t: 0, along: 0, lat: this.points[0][0], lng: this.points[0][1] };
    }
    const { hint = -1, window = 80, accept = 60, fromSeg = null } = opts;
    const [px, py] = this.proj(lat, lng);
    const segs = this.n - 1;
    let r = null;
    if (fromSeg != null) r = this._scan(px, py, Math.min(Math.max(0, fromSeg), segs - 1), segs);
    else if (hint >= 0) {
      r = this._scan(px, py, Math.max(0, hint - window), Math.min(segs, hint + window + 1));
      if (r.i < 0 || Math.sqrt(r.d2) > accept) r = null;
    }
    if (!r) r = this._scan(px, py, 0, segs);
    const a = this.points[r.i];
    const b = this.points[r.i + 1];
    return {
      dist: Math.sqrt(r.d2),
      seg: r.i,
      t: r.t,
      along: this.cum[r.i] + r.t * this.segLen[r.i],
      lat: a[0] + (b[0] - a[0]) * r.t,
      lng: a[1] + (b[1] - a[1]) * r.t,
    };
  }
}

/** Douglas-Peucker iteratif (aman untuk puluhan ribu titik). tolM dalam meter. */
export function simplifyPath(pts, tolM) {
  const n = pts.length;
  if (n <= 2 || !(tolM > 0)) return pts.slice();
  const proj = projector(pts);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) [xs[i], ys[i]] = proj(pts[i][0], pts[i][1]);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const tol2 = tolM * tolM;
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    const ax = xs[s], ay = ys[s];
    const dx = xs[e] - ax, dy = ys[e] - ay;
    const l2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      let t = l2 > 0 ? ((xs[i] - ax) * dx + (ys[i] - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = xs[i] - (ax + t * dx);
      const ey = ys[i] - (ay + t * dy);
      const d2 = ex * ex + ey * ey;
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** Sederhanakan sampai <= maxPts dengan menaikkan toleransi bertahap. */
export function simplifyToMax(pts, maxPts, startTol = 2) {
  let tol = startTol;
  let out = simplifyPath(pts, tol);
  while (out.length > maxPts && tol < 5000) {
    tol *= 1.6;
    out = simplifyPath(pts, tol);
  }
  return out;
}
