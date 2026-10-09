// Perhitungan engine hour / fuel dari pembacaan kumulatif (counter) StatusData Geotab.
// Fungsi murni tanpa dependensi sehingga bisa diuji dan dipakai ulang oleh backend.

/** ID diagnostik bawaan Geotab (bisa diubah di Pengaturan > Sensor). Engine hours dalam detik, fuel dalam liter. */
export const SENSOR_DEFAULTS = {
  engineHours: ['DiagnosticEngineHoursId'],
  fuel: ['DiagnosticDeviceTotalFuelId', 'DiagnosticTotalFuelUsedId'],
};

/** Toleransi jarak waktu antara batas jendela dan pembacaan terdekat agar selisih dianggap akurat. */
export const EXACT_TOLERANCE_MS = 15 * 60000;

const bsearchLast = (series, t) => {
  let lo = 0;
  let hi = series.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
};

/** Nilai counter pada waktu t (interpolasi linear antar pembacaan). series: [{t,v}] terurut naik. */
export function valueAt(series, t) {
  if (!series || !series.length) return null;
  const i = bsearchLast(series, t);
  const a = series[i];
  const b = series[i + 1];
  if (a && b) {
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    return { v: a.v + (b.v - a.v) * f, edgeMs: Math.min(t - a.t, b.t - t) };
  }
  if (a) return { v: a.v, edgeMs: t - a.t };
  return { v: b.v, edgeMs: b.t - t };
}

/** Selisih counter pada jendela [from,to]. null bila data kurang atau counter di-reset (selisih negatif). */
export function deltaOver(series, from, to, tolMs = EXACT_TOLERANCE_MS) {
  if (!series || series.length < 2 || !(to > from)) return null;
  const a = valueAt(series, from);
  const b = valueAt(series, to);
  const d = b.v - a.v;
  if (!(d >= 0)) return null;
  return { delta: d, approx: Math.max(a.edgeMs, b.edgeMs) > tolMs };
}

/** Fuel economy dari jarak (km) dan fuel (liter). null bila terlalu kecil untuk bermakna. */
export function fuelEconomy(distKm, fuelL, { minFuelL = 0.5, minKm = 1 } = {}) {
  if (!(fuelL >= minFuelL) || !(distKm >= minKm)) return null;
  return { kmPerL: distKm / fuelL, lPer100km: (fuelL / distKm) * 100 };
}

/**
 * Ringkasan satu jendela waktu.
 * @returns {{ engineSec:number|null, fuelL:number|null, kmPerL:number|null, lPer100km:number|null, approx:boolean }}
 */
export function summarizeWindow({ hoursSeries, fuelSeries, distKm, from, to }) {
  const h = deltaOver(hoursSeries, from, to);
  const f = deltaOver(fuelSeries, from, to);
  const eco = f ? fuelEconomy(distKm, f.delta) : null;
  return {
    engineSec: h ? h.delta : null,
    fuelL: f ? f.delta : null,
    kmPerL: eco ? eco.kmPerL : null,
    lPer100km: eco ? eco.lPer100km : null,
    approx: !!((h && h.approx) || (f && f.approx)),
  };
}

export function fmtHours(sec, digits = 1) {
  return sec == null || Number.isNaN(sec) ? '-' : `${(sec / 3600).toFixed(digits)} h`;
}
export function fmtLiters(l, digits = 1) {
  return l == null || Number.isNaN(l) ? '-' : `${l.toFixed(digits)} L`;
}
/** unit: 'kmpl' | 'l100' */
export function fmtEconomy(s, unit = 'kmpl') {
  if (!s) return '-';
  return unit === 'l100' ? (s.lPer100km == null ? '-' : `${s.lPer100km.toFixed(1)} L/100km`) : s.kmPerL == null ? '-' : `${s.kmPerL.toFixed(2)} km/L`;
}

/** Awali dengan "~" bila nilai hanya perkiraan. */
export const withApprox = (x, txt) => (x && x.approx && txt !== '-' ? `~${txt}` : txt);
