// Deteksi exception (kejadian menyimpang) dari data DO + event perjalanan + POD. Fungsi murni, dipakai server & tes.
export const SYSTEM_KINDS = ['no_response', 'not_started', 'late', 'late_arrival', 'stale', 'outside_radius', 'qty_diff'];
export const VENDOR_KINDS = ['breakdown', 'accident', 'traffic', 'customer_closed', 'failed_delivery', 'other'];
export const ALL_KINDS = [...SYSTEM_KINDS, ...VENDOR_KINDS];
export const SEVERITY_OF = { no_response: 'high', not_started: 'high', late: 'medium', late_arrival: 'medium', stale: 'medium', outside_radius: 'low', qty_diff: 'medium', breakdown: 'high', accident: 'high', traffic: 'low', customer_closed: 'high', failed_delivery: 'high', other: 'medium' };
export const DEFAULTS = { graceMin: 15, staleMin: 120, startGraceMin: 30 };

const ms = (v) => (v ? new Date(v).getTime() : NaN);
const min = (a, b) => Math.round((a - b) / 60000);

/** @returns {{orderId, key, kind, severity, stopSeq, meta}[]} */
export function detectExceptions(orders, nowMs = Date.now(), cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const out = [];
  const add = (o, key, kind, stopSeq, meta, severity) => out.push({ orderId: o.id, key, kind, severity: severity || SEVERITY_OF[kind], stopSeq: stopSeq ?? null, meta: { doNo: o.doNo, ...meta } });
  for (const o of orders) {
    const stops = o.stops || [];
    const events = o.events || [];
    const arrive = new Map(events.filter((e) => e.type === 'arrive').map((e) => [e.stopSeq, e]));
    if (['draft', 'offered'].includes(o.status) && o.offers > 0 && o.openOffers === 0) add(o, 'no_response', 'no_response', null, {});
    if (o.status === 'assigned' && stops[0]) {
      const ref = ms(stops[0].windowStart) || ms(stops[0].windowEnd);
      if (ref && nowMs > ref + c.startGraceMin * 60000) add(o, 'not_started', 'not_started', null, { minutes: min(nowMs, ref), stop: stops[0].name });
    }
    if (['assigned', 'running'].includes(o.status) || o.status === 'done') {
      stops.forEach((s, i) => {
        const seq = i + 1;
        const we = ms(s.windowEnd);
        if (!we) return;
        const a = arrive.get(seq);
        if (a) {
          const late = min(ms(a.at), we);
          if (late > c.graceMin) add(o, `late_arrival:${seq}`, 'late_arrival', seq, { minutes: late, stop: s.name }, late > 60 ? 'high' : 'medium');
        } else if (o.status === 'running' && nowMs > we + c.graceMin * 60000) {
          const late = min(nowMs, we);
          add(o, `late:${seq}`, 'late', seq, { minutes: late, stop: s.name }, late > 60 ? 'high' : 'medium');
        }
      });
    }
    if (o.status === 'running' && events.length && o.source !== 'external') {
      const last = Math.max(...events.map((e) => ms(e.at)));
      if (nowMs - last > c.staleMin * 60000) add(o, 'stale', 'stale', null, { minutes: min(nowMs, last) });
    }
    for (const e of events) if (e.outside) add(o, `outside:${e.seq}`, 'outside_radius', e.stopSeq, { stop: stops[(e.stopSeq || 1) - 1]?.name || '', distM: e.distM, step: e.type });
    for (const p of o.pods || []) if (p.hasDiff) add(o, `qty:${p.stopSeq}`, 'qty_diff', p.stopSeq, { stop: p.stopName, receiver: p.receiverName, podKind: p.kind });
  }
  return out;
}
