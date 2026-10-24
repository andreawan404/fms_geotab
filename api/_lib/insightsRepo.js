// Exception management + laporan kinerja DO. Exception sistem dihitung saat admin membuka halaman (tanpa cron),
// disimpan agar bisa ditandai "ditangani" dan hilang otomatis saat kondisinya pulih.
import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';
import { expireOffers } from './dispatchRepo.js';
import { VENDOR_KINDS, detectExceptions } from '../../src/core/exceptions.js';
import { buildSteps } from '../../src/core/trip.js';
import { notifyPending } from './notifyRepo.js';

const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString());
const cfg = () => ({
  graceMin: Number(process.env.EXC_LATE_GRACE_MIN) || 15,
  staleMin: Number(process.env.EXC_STALE_MIN) || 120,
  startGraceMin: Number(process.env.EXC_START_GRACE_MIN) || 30,
});
let lastSync = 0;
export const resetSyncThrottle = () => { lastSync = 0; };

export async function syncExceptions(db, { force = false, nowMs = Date.now() } = {}) {
  if (!force && Date.now() - lastSync < 15000) return;
  lastSync = Date.now();
  await expireOffers(db);
  const orders = await db.query(
    `SELECT o.id, o.do_no, o.status, o.source, o.vendor_id, (SELECT count(*) FROM offers f WHERE f.order_id = o.id)::int AS offers, (SELECT count(*) FROM offers f WHERE f.order_id = o.id AND f.status = 'offered')::int AS open_offers
       FROM orders o WHERE o.status IN ('offered', 'assigned', 'running') OR (o.status = 'draft' AND EXISTS (SELECT 1 FROM offers f WHERE f.order_id = o.id)) OR (o.status = 'done' AND o.finished_at > now() - interval '7 days')
       ORDER BY o.created_at DESC LIMIT 1000`);
  if (!orders.length) { await notifyPending(db); return; }
  const ids = JSON.stringify(orders.map((o) => o.id));
  const IN = `IN (SELECT value::uuid FROM jsonb_array_elements_text($1::jsonb))`;
  const [stops, events, pods] = await Promise.all([
    db.query(`SELECT order_id, seq, type, name, window_start, window_end FROM stops WHERE order_id ${IN} ORDER BY seq`, [ids]),
    db.query(`SELECT order_id, seq, type, stop_seq, at, outside, dist_m FROM trip_events WHERE order_id ${IN} ORDER BY seq`, [ids]),
    db.query(`SELECT order_id, stop_seq, stop_name, receiver_name, kind, has_diff FROM pods WHERE has_diff AND order_id ${IN}`, [ids]),
  ]);
  const group = (rows) => { const m = new Map(); for (const r of rows) (m.get(r.order_id) || m.set(r.order_id, []).get(r.order_id)).push(r); return m; };
  const gs = group(stops); const ge = group(events); const gp = group(pods);
  const input = orders.map((o) => ({
    id: o.id, doNo: o.do_no, status: o.status, source: o.source, offers: o.offers, openOffers: o.open_offers,
    stops: (gs.get(o.id) || []).map((s) => ({ name: s.name, windowStart: iso(s.window_start), windowEnd: iso(s.window_end) })),
    events: (ge.get(o.id) || []).map((e) => ({ seq: e.seq, type: e.type, stopSeq: e.stop_seq, at: iso(e.at), outside: e.outside, distM: e.dist_m })),
    pods: (gp.get(o.id) || []).map((p) => ({ stopSeq: p.stop_seq, stopName: p.stop_name, receiverName: p.receiver_name, kind: p.kind, hasDiff: p.has_diff })),
  }));
  const cands = detectExceptions(input, nowMs, cfg()).map((c) => ({ order_id: c.orderId, key: c.key, kind: c.kind, severity: c.severity, stop_seq: c.stopSeq, meta: c.meta }));
  const cj = JSON.stringify(cands);
  const REC = (n) => `jsonb_to_recordset($${n}::jsonb) AS x(order_id uuid, key text, kind text, severity text, stop_seq int, meta jsonb)`;
  if (cands.length) {
    await db.query(
      `INSERT INTO exceptions (order_id, dedupe_key, kind, severity, source, stop_seq, meta)
       SELECT x.order_id, x.key, x.kind, x.severity, 'system', x.stop_seq, x.meta FROM ${REC(1)}
       ON CONFLICT (order_id, dedupe_key) DO UPDATE SET meta = EXCLUDED.meta, severity = EXCLUDED.severity,
         cleared_at = CASE WHEN exceptions.closed_by IS NOT NULL THEN exceptions.cleared_at ELSE NULL END`, [cj]);
  }
  await db.query(
    `UPDATE exceptions e SET cleared_at = now() WHERE e.source = 'system' AND e.cleared_at IS NULL AND e.order_id ${IN}
       AND NOT EXISTS (SELECT 1 FROM ${REC(2)} WHERE x.order_id = e.order_id AND x.key = e.dedupe_key)`, [ids, cj]);
  await notifyPending(db);
}

const mapEx = (r) => ({
  id: Number(r.id), orderId: r.order_id, doNo: r.do_no, customer: r.customer, vendorName: r.vendor_name || '', plate: r.plate || '', kind: r.kind, severity: r.severity, source: r.source,
  stopSeq: r.stop_seq, meta: typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta, createdAt: iso(r.created_at), clearedAt: iso(r.cleared_at), ackAt: iso(r.ack_at), ackBy: r.ack_by || '', ackNote: r.ack_note || '',
  state: r.cleared_at ? 'cleared' : r.ack_at ? 'handled' : 'open',
});

export async function listExceptions(db, { status = 'open', kind, q, limit = 200, force = false } = {}) {
  await syncExceptions(db, { force });
  const where = [`(e.cleared_at IS NULL OR e.cleared_at > now() - interval '30 days')`];
  const p = [];
  if (status === 'open') where.push('e.cleared_at IS NULL AND e.ack_at IS NULL');
  else if (status === 'handled') where.push('e.cleared_at IS NULL AND e.ack_at IS NOT NULL');
  else if (status === 'cleared') where.push('e.cleared_at IS NOT NULL');
  if (kind) { p.push(String(kind)); where.push(`e.kind = $${p.length}`); }
  if (q) { p.push(`%${String(q).slice(0, 60).replace(/[\\%_]/g, '\\$&')}%`); where.push(`(o.do_no ILIKE $${p.length} OR o.customer ILIKE $${p.length} OR v.name ILIKE $${p.length} OR vh.plate ILIKE $${p.length})`); }
  p.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
  const rows = await db.query(
    `SELECT e.*, o.do_no, o.customer, v.name AS vendor_name, vh.plate FROM exceptions e JOIN orders o ON o.id = e.order_id LEFT JOIN vendors v ON v.id = o.vendor_id LEFT JOIN vehicles vh ON vh.id = o.vehicle_id
      WHERE ${where.join(' AND ')} ORDER BY (e.severity = 'high') DESC, e.created_at DESC LIMIT $${p.length}`, p);
  const c = await db.query(
    `SELECT count(*) FILTER (WHERE cleared_at IS NULL AND ack_at IS NULL AND severity = 'high')::int AS high, count(*) FILTER (WHERE cleared_at IS NULL AND ack_at IS NULL AND severity = 'medium')::int AS medium,
            count(*) FILTER (WHERE cleared_at IS NULL AND ack_at IS NULL AND severity = 'low')::int AS low, count(*) FILTER (WHERE cleared_at IS NULL AND ack_at IS NOT NULL)::int AS handled,
            count(*) FILTER (WHERE cleared_at IS NOT NULL)::int AS cleared FROM exceptions WHERE cleared_at IS NULL OR cleared_at > now() - interval '30 days'`);
  return { exceptions: rows.map(mapEx), counts: { high: c[0].high, medium: c[0].medium, low: c[0].low, open: c[0].high + c[0].medium + c[0].low, handled: c[0].handled, cleared: c[0].cleared } };
}

export async function actException(db, { id, action, note }, actor) {
  const n = String(note || '').trim().slice(0, 300);
  const eid = Number(id);
  if (!Number.isInteger(eid)) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  let r;
  if (action === 'ack') r = await db.query(`UPDATE exceptions SET ack_at = now(), ack_by = $2, ack_note = $3 WHERE id = $1 AND cleared_at IS NULL RETURNING id`, [eid, actor || '', n]);
  else if (action === 'unack') r = await db.query(`UPDATE exceptions SET ack_at = NULL, ack_by = NULL, ack_note = '' WHERE id = $1 AND cleared_at IS NULL RETURNING id`, [eid]);
  else if (action === 'resolve') r = await db.query(`UPDATE exceptions SET cleared_at = now(), closed_by = $2, ack_at = COALESCE(ack_at, now()), ack_by = COALESCE(ack_by, $2), ack_note = CASE WHEN $3 <> '' THEN $3 ELSE ack_note END WHERE id = $1 AND cleared_at IS NULL RETURNING id`, [eid, actor || 'admin', n]);
  else throw new ApiError(400, 'bad_action', 'Aksi tidak dikenal');
  if (!r.length) throw new ApiError(404, 'not_found', 'Exception tidak ditemukan atau sudah selesai');
  return { ok: true };
}

/** Laporan dari vendor di portal (kendala di jalan). stop = stop yang sedang dikerjakan. */
export async function insertVendorIssue(db, { order, kind, note, lat, lng }) {
  if (!VENDOR_KINDS.includes(kind)) throw new ApiError(422, 'issue_kind', 'Jenis kendala tidak valid');
  const text = String(note || '').trim().slice(0, 300);
  if (text.length < 3) throw new ApiError(422, 'issue_note', 'Jelaskan kendala singkat (min. 3 huruf)');
  const cnt = await db.query(`SELECT count(*)::int AS n, (SELECT count(*)::int FROM trip_events WHERE order_id = $1) AS ev FROM exceptions WHERE order_id = $1 AND source = 'vendor'`, [order.id]);
  if (cnt[0].n >= 20) throw new ApiError(429, 'issue_limit', 'Terlalu banyak laporan untuk DO ini');
  const step = buildSteps(order.stops)[cnt[0].ev];
  const stop = step && step.stopIdx >= 0 ? order.stops[step.stopIdx] : null;
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const meta = { doNo: order.doNo, note: text, stop: stop?.name || '', lat: num(lat), lng: num(lng), plate: order.plate || '', driver: order.driverName || '' };
  await db.query(`INSERT INTO exceptions (order_id, dedupe_key, kind, severity, source, stop_seq, meta) SELECT $1, $2, $3, $4, 'vendor', $5, $6::jsonb WHERE EXISTS (SELECT 1 FROM orders WHERE id = $1 AND status IN ('assigned', 'running'))`,
    [order.id, `vendor:${randomUUID()}`, kind, kind === 'traffic' ? 'low' : kind === 'other' ? 'medium' : 'high', step && step.stopIdx >= 0 ? step.stopIdx + 1 : null, JSON.stringify(meta)]);
  await notifyPending(db); // laporan vendor langsung diteruskan ke admin
  return { ok: true };
}

/** Laporan kinerja: KPI, deret harian, kinerja vendor, sebaran exception. Rentang berdasarkan tanggal order. */

const DAY = 864e5;
/** Periode pembanding: rentang sama panjang tepat sebelum `from`. */
export function prevRange(from, to) {
  const n = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const f = (ms) => new Date(ms).toISOString().slice(0, 10);
  return [f(Date.parse(from) - n * DAY), f(Date.parse(from) - DAY)];
}

/** Angka inti satu periode (untuk pembanding periode sebelumnya). */
async function windowStats(db, from, to, grace) {
  const P = [from, to];
  const R = 'o.order_date BETWEEN $1::date AND $2::date';
  const [c, on, exc, lead] = await Promise.all([
    db.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('assigned','running','done'))::int AS dispatched, count(*) FILTER (WHERE status = 'done')::int AS done FROM orders o WHERE ${R}`, P),
    db.query(`SELECT count(*)::int AS measured, count(*) FILTER (WHERE e.at <= s.window_end + ($3 || ' minutes')::interval)::int AS ontime
                FROM orders o JOIN stops s ON s.order_id = o.id AND s.type = 'delivery' AND s.window_end IS NOT NULL JOIN trip_events e ON e.order_id = o.id AND e.type = 'arrive' AND e.stop_seq = s.seq WHERE ${R}`, [...P, grace]),
    db.query(`SELECT count(*)::int AS n FROM exceptions x JOIN orders o ON o.id = x.order_id WHERE ${R}`, P),
    db.query(`SELECT avg(extract(epoch FROM (finished_at - created_at)) / 60)::float8 AS total FROM orders o WHERE ${R}`, P),
  ]);
  const a = c[0], b = on[0];
  return { range: { from, to }, total: a.total, dispatched: a.dispatched, done: a.done, completionRate: a.dispatched ? a.done / a.dispatched : null,
    onTimeRate: b.measured ? b.ontime / b.measured : null, exceptions: exc[0].n, leadTotal: lead[0]?.total ?? null };
}

/** Statistik tambahan operator: keterlambatan, muatan, penanganan exception, BBM, customer teratas. */
async function extraStats(db, from, to, grace) {
  const P = [from, to];
  const R = 'o.order_date BETWEEN $1::date AND $2::date';
  const [late, load, exc, fuel, cust] = await Promise.all([
    db.query(`SELECT count(*) FILTER (WHERE e.at > s.window_end + ($3 || ' minutes')::interval)::int AS late,
                     avg(extract(epoch FROM (e.at - s.window_end)) / 60) FILTER (WHERE e.at > s.window_end + ($3 || ' minutes')::interval)::float8 AS avg_delay,
                     max(extract(epoch FROM (e.at - s.window_end)) / 60)::float8 AS max_delay
                FROM orders o JOIN stops s ON s.order_id = o.id AND s.type = 'delivery' AND s.window_end IS NOT NULL JOIN trip_events e ON e.order_id = o.id AND e.type = 'arrive' AND e.stop_seq = s.seq WHERE ${R}`, [...P, grace]),
    db.query(`SELECT coalesce(sum(i.weight_kg) FILTER (WHERE o.status <> 'cancelled'), 0)::float8 AS kg, coalesce(sum(i.weight_kg) FILTER (WHERE o.status = 'done'), 0)::float8 AS kg_done,
                     coalesce(sum(i.volume_m3) FILTER (WHERE o.status <> 'cancelled'), 0)::float8 AS m3, coalesce(sum(i.volume_m3) FILTER (WHERE o.status = 'done'), 0)::float8 AS m3_done
                FROM orders o JOIN stops s ON s.order_id = o.id AND s.type = 'delivery' JOIN items i ON i.stop_id = s.id WHERE ${R}`, P),
    db.query(`SELECT count(*) FILTER (WHERE x.cleared_at IS NULL)::int AS open, count(*) FILTER (WHERE x.ack_at IS NOT NULL)::int AS handled,
                     avg(extract(epoch FROM (x.cleared_at - x.created_at)) / 60) FILTER (WHERE x.cleared_at IS NOT NULL)::float8 AS resolve_min
                FROM exceptions x JOIN orders o ON o.id = x.order_id WHERE ${R}`, P),
    db.query(`SELECT count(*)::int AS n, coalesce(sum((o.fuel->>'fuelL')::float8), 0)::float8 AS l, coalesce(sum((o.fuel->>'distKm')::float8), 0)::float8 AS km
                FROM orders o WHERE ${R} AND o.fuel IS NOT NULL AND (o.fuel->>'fuelL') IS NOT NULL`, P),
    db.query(`SELECT o.customer, count(*)::int AS orders, count(*) FILTER (WHERE o.status = 'done')::int AS done,
                     (SELECT count(*)::int FROM exceptions x WHERE x.order_id = ANY (array_agg(o.id))) AS exceptions
                FROM orders o WHERE ${R} AND o.status <> 'cancelled' GROUP BY o.customer ORDER BY orders DESC, o.customer LIMIT 5`, P),
  ]);
  const l = late[0], w = load[0], x = exc[0], f = fuel[0];
  return {
    delay: { lateStops: l.late, avgMin: l.avg_delay, maxMin: l.late ? l.max_delay : null },
    load: { kg: w.kg, kgDone: w.kg_done, m3: w.m3, m3Done: w.m3_done },
    handling: { open: x.open, handled: x.handled, resolveMin: x.resolve_min },
    fuel: { orders: f.n, liters: f.l, distKm: f.km, kmPerL: f.l > 0 ? f.km / f.l : null },
    topCustomers: cust.map((r) => ({ customer: r.customer, orders: r.orders, done: r.done, exceptions: r.exceptions || 0 })),
  };
}

export async function buildReport(db, { from, to }) {
  await expireOffers(db);
  await syncExceptions(db, { force: true });
  const grace = String(cfg().graceMin);
  const P = [from, to];
  const R = 'o.order_date BETWEEN $1::date AND $2::date';
  const [status, lead, ontime, offers, vend, daily, dayOn, exc, extra] = await Promise.all([
    db.query(`SELECT status, count(*)::int AS n FROM orders o WHERE ${R} GROUP BY status`, P),
    db.query(`SELECT avg(extract(epoch FROM (assigned_at - created_at)) / 60)::float8 AS to_assign, avg(extract(epoch FROM (started_at - assigned_at)) / 60)::float8 AS to_start,
                     avg(extract(epoch FROM (finished_at - started_at)) / 60)::float8 AS trip, avg(extract(epoch FROM (finished_at - created_at)) / 60)::float8 AS total FROM orders o WHERE ${R}`, P),
    db.query(`SELECT o.vendor_id, count(*)::int AS measured, count(*) FILTER (WHERE e.at <= s.window_end + ($3 || ' minutes')::interval)::int AS ontime
                FROM orders o JOIN stops s ON s.order_id = o.id AND s.type = 'delivery' AND s.window_end IS NOT NULL JOIN trip_events e ON e.order_id = o.id AND e.type = 'arrive' AND e.stop_seq = s.seq
               WHERE ${R} GROUP BY o.vendor_id`, [...P, grace]),
    db.query(`SELECT f.vendor_id, count(*)::int AS sent, count(*) FILTER (WHERE f.status = 'accepted')::int AS accepted, count(*) FILTER (WHERE f.status = 'rejected')::int AS rejected,
                     count(*) FILTER (WHERE f.status = 'expired')::int AS expired, avg(extract(epoch FROM (f.responded_at - f.sent_at)) / 60) FILTER (WHERE f.status IN ('accepted', 'rejected'))::float8 AS resp
                FROM offers f JOIN orders o ON o.id = f.order_id WHERE ${R} GROUP BY f.vendor_id`, P),
    db.query(`SELECT o.vendor_id, count(*)::int AS orders, count(*) FILTER (WHERE o.status = 'done')::int AS done,
                     (SELECT count(*)::int FROM pods p JOIN orders o2 ON o2.id = p.order_id WHERE o2.vendor_id = o.vendor_id AND p.has_diff AND o2.order_date BETWEEN $1::date AND $2::date) AS qty_diff,
                     (SELECT count(*)::int FROM exceptions x JOIN orders o3 ON o3.id = x.order_id WHERE o3.vendor_id = o.vendor_id AND o3.order_date BETWEEN $1::date AND $2::date) AS exceptions
                FROM orders o WHERE ${R} AND o.vendor_id IS NOT NULL GROUP BY o.vendor_id`, P),
    db.query(`SELECT o.order_date::text AS d, count(*)::int AS created, count(*) FILTER (WHERE o.status = 'done')::int AS done FROM orders o WHERE ${R} GROUP BY o.order_date ORDER BY o.order_date`, P),
    db.query(`SELECT o.order_date::text AS d, count(*)::int AS measured, count(*) FILTER (WHERE e.at <= s.window_end + ($3 || ' minutes')::interval)::int AS ontime
                FROM orders o JOIN stops s ON s.order_id = o.id AND s.type = 'delivery' AND s.window_end IS NOT NULL JOIN trip_events e ON e.order_id = o.id AND e.type = 'arrive' AND e.stop_seq = s.seq
               WHERE ${R} GROUP BY o.order_date`, [...P, grace]),
    db.query(`SELECT x.kind, x.severity, count(*)::int AS n FROM exceptions x JOIN orders o ON o.id = x.order_id WHERE ${R} GROUP BY x.kind, x.severity ORDER BY n DESC`, P),
    extraStats(db, from, to, grace),
  ]);
  const names = new Map((await db.query('SELECT id, name FROM vendors')).map((v) => [v.id, v.name]));
  const by = new Map();
  const row = (id) => by.get(id) || by.set(id, { vendorId: id, vendorName: names.get(id) || '-', sent: 0, accepted: 0, rejected: 0, expired: 0, responseMin: null, orders: 0, done: 0, measured: 0, ontime: 0, qtyDiff: 0, exceptions: 0 }).get(id);
  for (const r of offers) Object.assign(row(r.vendor_id), { sent: r.sent, accepted: r.accepted, rejected: r.rejected, expired: r.expired, responseMin: r.resp });
  for (const r of vend) Object.assign(row(r.vendor_id), { orders: r.orders, done: r.done, qtyDiff: r.qty_diff, exceptions: r.exceptions });
  for (const r of ontime) if (r.vendor_id) Object.assign(row(r.vendor_id), { measured: r.measured, ontime: r.ontime });
  const vendors = [...by.values()].map((v) => ({ ...v, acceptRate: v.sent ? v.accepted / v.sent : null, onTimeRate: v.measured ? v.ontime / v.measured : null })).sort((a, b) => b.orders - a.orders);
  const counts = Object.fromEntries(status.map((r) => [r.status, r.n]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const measured = ontime.reduce((a, r) => a + r.measured, 0);
  const onTime = ontime.reduce((a, r) => a + r.ontime, 0);
  const dispatched = (counts.assigned || 0) + (counts.running || 0) + (counts.done || 0);
  const l = lead[0] || {};
  return {
    range: { from, to }, graceMin: Number(grace),
    kpi: { total, counts, dispatched, done: counts.done || 0, completionRate: dispatched ? (counts.done || 0) / dispatched : null, measuredStops: measured, onTimeStops: onTime, onTimeRate: measured ? onTime / measured : null,
      leadMin: { toAssign: l.to_assign, toStart: l.to_start, trip: l.trip, total: l.total }, exceptions: exc.reduce((a, r) => a + r.n, 0) },
    daily: daily.map((r) => { const m = dayOn.find((x) => x.d === r.d); return { date: r.d, created: r.created, done: r.done, measured: m?.measured || 0, ontime: m?.ontime || 0 }; }),
    ...extra,
    prev: await windowStats(db, ...prevRange(from, to), grace),
    vendors,
    exceptionsByKind: exc.map((r) => ({ kind: r.kind, severity: r.severity, n: r.n })),
  };
}
