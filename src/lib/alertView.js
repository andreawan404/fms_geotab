// Logika tampilan alert: klasifikasi, kejadian yang sedang berlangsung, dan waktu relatif. Murni agar mudah diuji.

/** Tingkat keparahan per jenis kejadian: err | warn | ok | info | mute */
export const SEVERITY = {
  deviation_start: 'err',
  late_start: 'warn',
  route_completed: 'ok',
  start_reached: 'info',
  checkpoint_arrived: 'mute',
  checkpoint_skipped: 'mute',
  deviation_end: 'mute',
};

/** [{key, unit, n}] -> teks relatif dalam bentuk kunci i18n: 'now' | 'min' | 'hour' | 'day' */
export function relParts(ms, nowMs) {
  const sec = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (sec < 60) return { unit: 'now', n: 0 };
  const min = Math.floor(sec / 60);
  if (min < 60) return { unit: 'min', n: min };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { unit: 'hour', n: hr };
  return { unit: 'day', n: Math.floor(hr / 24) };
}

/**
 * Kejadian yang masih berlangsung dari hasil monitor (tidak ikut kedaluwarsa):
 * - kendaraan sedang di luar koridor (deviasi terkonfirmasi, belum selesai)
 * - kendaraan belum tiba di titik awal melewati batas terlambat
 * @param results Map instKey -> { inst, route, result }
 * @returns [{ kind:'deviating'|'late', instKey, deviceId, routeId, since, distM, cpName, min, key }]
 */
export function ongoingItems(results, nowMs) {
  const out = [];
  for (const [instKey, { inst, result }] of results) {
    if (!result) continue;
    if (result.currentlyDeviating) {
      const dev = [...result.deviations].reverse().find((d) => d.ongoing);
      out.push({ kind: 'deviating', key: `${instKey}:dev`, instKey, deviceId: inst.deviceId, routeId: inst.routeId, since: dev ? dev.startMs : nowMs, distM: result.current?.distM ?? dev?.maxDistM ?? 0, devStartMs: dev?.startMs });
    } else if (result.phase === 'late_start') {
      out.push({ kind: 'late', key: `${instKey}:late`, instKey, deviceId: inst.deviceId, routeId: inst.routeId, since: inst.startMs, cpName: result.checkpoints[0]?.name || '', min: Math.max(0, Math.round((nowMs - inst.startMs) / 60000)) });
    }
  }
  const rank = { deviating: 0, late: 1 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.since - b.since);
}

/**
 * Kejadian terbaru dalam jendela waktu, terbaru di atas. Kejadian yang sudah diwakili baris "sedang berlangsung"
 * (deviasi yang sama / terlambat yang sama) tidak ditampilkan dua kali.
 */
export function recentItems(feed, ongoing, nowMs, windowMin) {
  const skip = new Set();
  for (const o of ongoing) skip.add(o.kind === 'deviating' ? `${o.instKey}:deviation_start:${o.devStartMs}` : `${o.instKey}:late_start`);
  const from = nowMs - windowMin * 60000;
  return feed
    .filter((f) => f.at >= from && !skip.has(f.id) && !(f.type === 'late_start' && ongoing.some((o) => o.kind === 'late' && o.instKey === f.instKey)))
    .sort((a, b) => b.at - a.at);
}
