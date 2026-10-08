// Google Encoded Polyline (presisi 5 ≈ 1 m). Dipakai untuk menyimpan geometri rute secara ringkas
// karena AddInData Geotab punya batas ukuran per record.
function enc(v) {
  v = v < 0 ? ~(v << 1) : v << 1;
  let s = '';
  while (v >= 0x20) {
    s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return s + String.fromCharCode(v + 63);
}

export function encodePolyline(points, precision = 5) {
  const f = 10 ** precision;
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  for (const [lat, lng] of points) {
    const la = Math.round(lat * f);
    const ln = Math.round(lng * f);
    out += enc(la - lastLat) + enc(ln - lastLng);
    lastLat = la;
    lastLng = ln;
  }
  return out;
}

export function decodePolyline(str, precision = 5) {
  const f = 10 ** precision;
  const out = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (let axis = 0; axis < 2; axis++) {
      let b;
      let shift = 0;
      let res = 0;
      do {
        b = str.charCodeAt(i++) - 63;
        res |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (axis === 0) lat += d;
      else lng += d;
    }
    out.push([lat / f, lng / f]);
  }
  return out;
}

export function chunkString(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length ? out : [''];
}
