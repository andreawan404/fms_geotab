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

/** Jenis kejadian yang perlu "ditangani" (bisa ditandai). */
export const ACKABLE = new Set(['deviation_start', 'late_start']);

/** Tanggal lokal (YYYY-MM-DD) dari ms. */
export const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Saring riwayat alert.
 * @param f { fromMs, toMs, deviceIds:Set|[], types:Set|[], ack:'all'|'open'|'done', q, acks:Map, text:(ev)=>string, deviceName:(id)=>string }
 */
export function filterAlerts(list, f = {}) {
  const dev = f.deviceIds && (f.deviceIds.size ?? f.deviceIds.length) ? new Set(f.deviceIds) : null;
  const types = f.types && (f.types.size ?? f.types.length) ? new Set(f.types) : null;
  const q = (f.q || '').trim().toLowerCase();
  const acks = f.acks || new Map();
  return list.filter((e) => {
    if (f.fromMs != null && e.at < f.fromMs) return false;
    if (f.toMs != null && e.at > f.toMs) return false;
    if (dev && !dev.has(e.deviceId)) return false;
    if (types && !types.has(e.type)) return false;
    if (f.ack === 'open' && !(ACKABLE.has(e.type) && !acks.has(e.id))) return false;
    if (f.ack === 'done' && !acks.has(e.id)) return false;
    if (q) {
      const hay = `${f.deviceName ? f.deviceName(e.deviceId) : e.deviceId} ${f.text ? f.text(e) : ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** [{day, items}] terbaru di atas (items sudah urut terbaru). */
export function groupByDay(list) {
  const out = [];
  const idx = new Map();
  for (const e of [...list].sort((a, b) => b.at - a.at)) {
    const k = dayKey(e.at);
    if (!idx.has(k)) {
      idx.set(k, { day: k, items: [] });
      out.push(idx.get(k));
    }
    idx.get(k).items.push(e);
  }
  return out;
}

/** [{deviceId, items, counts, open, last}] urut: paling banyak belum ditangani, lalu paling baru. */
export function groupByDevice(list, acks = new Map()) {
  const m = new Map();
  for (const e of [...list].sort((a, b) => b.at - a.at)) {
    if (!m.has(e.deviceId)) m.set(e.deviceId, { deviceId: e.deviceId, items: [], counts: {}, open: 0, last: e.at });
    const g = m.get(e.deviceId);
    g.items.push(e);
    g.counts[e.type] = (g.counts[e.type] || 0) + 1;
    if (ACKABLE.has(e.type) && !acks.has(e.id)) g.open++;
  }
  return [...m.values()].sort((a, b) => b.open - a.open || b.last - a.last);
}

/** Ringkasan KPI: hitungan per jenis, belum ditangani, jumlah kendaraan terdampak. */
export function summarize(list, acks = new Map()) {
  const byType = {};
  let open = 0;
  const devs = new Set();
  for (const e of list) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (ACKABLE.has(e.type) && !acks.has(e.id)) open++;
    if (ACKABLE.has(e.type)) devs.add(e.deviceId);
  }
  return { total: list.length, byType, open, vehicles: devs.size };
}
