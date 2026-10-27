// ETA per titik dan total rute. Fungsi murni.
// Waktu = waktu tempuh murni (tanpa waktu muat / bongkar). Dari durasi leg mesin rute (akurat) atau dari offset kumulatif (perkiraan kecepatan rata-rata).

/**
 * @param {{name?:string, windowEnd?:string}[]} points titik berurutan
 * @param {{legs?:{distanceM:number,durationS:number}[], offsets?:number[], avgKmh?:number}} src
 *   legs  = durasi per leg dari mesin rute; offsets = detik kumulatif per titik (perkiraan)
 * @returns {{rows:{i:number,name:string,legM:number,legS:number,offsetS:number,windowEnd:string}[], totalM:number, totalS:number, approx:boolean}|null}
 */
export function buildEta(points, { legs, offsets, avgKmh = 40 } = {}) {
  const n = points?.length || 0;
  if (n < 2) return null;
  const v = (Math.max(1, Number(avgKmh) || 40) * 1000) / 3600;
  const useLegs = Array.isArray(legs) && legs.length === n - 1 && legs.every((l) => Number(l?.durationS) > 0);
  let legM = [0]; let legS = [0];
  let approx = false;
  if (useLegs) {
    for (let i = 1; i < n; i++) { legM.push(Number(legs[i - 1].distanceM) || 0); legS.push(Number(legs[i - 1].durationS) || 0); }
  } else if (Array.isArray(offsets) && offsets.length === n) {
    approx = true;
    for (let i = 1; i < n; i++) { const s = Math.max(0, (offsets[i] || 0) - (offsets[i - 1] || 0)); legS.push(s); legM.push(s * v); }
  } else return null;
  let acc = 0; let accM = 0;
  const rows = points.map((p, i) => {
    acc += legS[i]; accM += legM[i];
    return { i, name: p.name || `#${i + 1}`, legM: legM[i], legS: legS[i], offsetS: Math.round(acc), cumM: accM, windowEnd: p.windowEnd || '' };
  });
  return { rows, totalM: accM, totalS: Math.round(acc), approx };
}

/** Tambahkan jam tiba (ms) dan penanda melewati jendela waktu. departMs = jam berangkat dari titik pertama. */
export function withClock(eta, departMs) {
  if (!eta) return null;
  const ok = Number.isFinite(departMs);
  return {
    ...eta,
    rows: eta.rows.map((r) => {
      const etaMs = ok ? departMs + r.offsetS * 1000 : null;
      const we = Date.parse(r.windowEnd || '');
      return { ...r, etaMs, late: etaMs != null && Number.isFinite(we) && etaMs > we };
    }),
    arriveMs: ok ? departMs + eta.totalS * 1000 : null,
  };
}
