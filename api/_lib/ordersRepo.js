// Akses data DO. Tulis = satu pernyataan SQL atomik (CTE + jsonb) agar aman lewat driver HTTP Neon tanpa transaksi interaktif.
import { randomUUID } from 'node:crypto';
import { normalizeOrder, summary, validateOrder } from '../../src/core/orders.js';
import { ApiError } from './errors.js';
import { expireOffers } from './dispatchRepo.js';

const STOP_COLS = `s.id, s.order_id, s.seq, s.type, s.zone_id, s.name, s.address, s.lat::float8 AS lat, s.lng::float8 AS lng, s.radius_m,
  s.window_start, s.window_end, s.contact_name, s.contact_phone, s.instructions`;
const ITEM_COLS = `i.id, i.stop_id, i.ord, i.description, i.sku, i.qty::float8 AS qty, i.unit, i.weight_kg::float8 AS weight_kg,
  i.volume_m3::float8 AS volume_m3, i.pallets::float8 AS pallets, i.colli::float8 AS colli, i.length_cm::float8 AS length_cm,
  i.width_cm::float8 AS width_cm, i.height_cm::float8 AS height_cm, i.category, i.temp_min::float8 AS temp_min,
  i.temp_max::float8 AS temp_max, i.hazardous, i.stackable`;
const ORDER_COLS = `o.corridor_m, o.source, o.ext_plate, o.ext_status, o.ext_synced_at, o.linked_route_id, o.linked_asg_id, o.linked_device_id, o.linked_at, o.id, o.do_no, o.customer, o.order_date::text AS order_date, o.priority, o.status, o.notes, o.summary,
  o.version, o.created_by, o.created_at, o.updated_at, o.vendor_id, o.vehicle_id, o.driver_id, o.assigned_at, o.assigned_via,
  (SELECT name FROM vendors WHERE id = o.vendor_id) AS vendor_name, (SELECT plate FROM vehicles WHERE id = o.vehicle_id) AS plate,
  (SELECT name FROM drivers WHERE id = o.driver_id) AS driver_name,
  (SELECT count(*) FROM offers f WHERE f.order_id = o.id AND f.status = 'offered')::int AS open_offers,
  (SELECT count(*) FROM offers f WHERE f.order_id = o.id)::int AS offer_count,
  o.started_at, o.finished_at, (SELECT count(*) FROM trip_events t WHERE t.order_id = o.id)::int AS trip_events`;

const iso = (v) => (v == null ? '' : v instanceof Date ? v.toISOString() : new Date(v).toISOString());

const mapHead = (r) => ({
  corridorM: r.corridor_m == null ? null : Number(r.corridor_m),
  source: r.source || 'internal', extPlate: r.ext_plate || '', extStatus: r.ext_status || '', extSyncedAt: r.ext_synced_at ? iso(r.ext_synced_at) : '', linkedRouteId: r.linked_route_id || '', linkedAsgId: r.linked_asg_id || '', linkedDeviceId: r.linked_device_id || '', linkedAt: r.linked_at ? iso(r.linked_at) : '',
  id: r.id, doNo: r.do_no, customer: r.customer, orderDate: r.order_date, priority: r.priority, status: r.status, notes: r.notes,
  summary: typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary || {}, version: Number(r.version), createdBy: r.created_by || '',
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  vendorId: r.vendor_id || null, vehicleId: r.vehicle_id || null, driverId: r.driver_id || null, assignedAt: r.assigned_at ? iso(r.assigned_at) : '', assignedVia: r.assigned_via || '',
  vendorName: r.vendor_name || '', plate: r.plate || r.ext_plate || '', driverName: r.driver_name || '', openOffers: Number(r.open_offers || 0), offerCount: Number(r.offer_count || 0),
  startedAt: r.started_at ? iso(r.started_at) : '', finishedAt: r.finished_at ? iso(r.finished_at) : '', tripEvents: Number(r.trip_events || 0),
});
const mapItem = (r) => ({
  description: r.description, sku: r.sku, qty: r.qty, unit: r.unit, weightKg: r.weight_kg, volumeM3: r.volume_m3, pallets: r.pallets, colli: r.colli,
  lengthCm: r.length_cm, widthCm: r.width_cm, heightCm: r.height_cm, category: r.category, tempMin: r.temp_min, tempMax: r.temp_max,
  hazardous: r.hazardous, stackable: r.stackable,
});
const mapStop = (r, items) => ({
  id: r.id, type: r.type, zoneId: r.zone_id || '', name: r.name, address: r.address, lat: r.lat, lng: r.lng, radiusM: r.radius_m, windowStart: r.window_start ? iso(r.window_start) : '',
  windowEnd: r.window_end ? iso(r.window_end) : '', contactName: r.contact_name, contactPhone: r.contact_phone, instructions: r.instructions, items,
});

/** Bentuk jsonb untuk stops & items dari DO ternormalisasi, dengan id baru. */
export function flatten(order) {
  const stops = [];
  const items = [];
  order.stops.forEach((s, i) => {
    const id = randomUUID();
    stops.push({ id, seq: i + 1, type: s.type, zone_id: s.zoneId || '', name: s.name, address: s.address, lat: s.lat, lng: s.lng, radius_m: s.radiusM, window_start: s.windowStart || null, window_end: s.windowEnd || null, contact_name: s.contactName, contact_phone: s.contactPhone, instructions: s.instructions });
    s.items.forEach((it, j) => items.push({ id: randomUUID(), stop_id: id, ord: j, description: it.description, sku: it.sku, qty: it.qty, unit: it.unit, weight_kg: it.weightKg, volume_m3: it.volumeM3, pallets: it.pallets, colli: it.colli, length_cm: it.lengthCm, width_cm: it.widthCm, height_cm: it.heightCm, category: it.category, temp_min: it.tempMin, temp_max: it.tempMax, hazardous: it.hazardous, stackable: it.stackable }));
  });
  return { stops, items };
}

export const INS_STOPS = (oid, src) => `INSERT INTO stops (id, order_id, seq, type, zone_id, name, address, lat, lng, radius_m, window_start, window_end, contact_name, contact_phone, instructions)
  SELECT x.id, ${oid}, x.seq, x.type, x.zone_id, x.name, x.address, x.lat, x.lng, x.radius_m, x.window_start, x.window_end, x.contact_name, x.contact_phone, x.instructions
  FROM jsonb_to_recordset(${src}::jsonb) AS x(id uuid, seq int, type text, zone_id text, name text, address text, lat float8, lng float8, radius_m int, window_start timestamptz, window_end timestamptz, contact_name text, contact_phone text, instructions text)`;
export const INS_ITEMS = (oid, src) => `INSERT INTO items (id, order_id, stop_id, ord, description, sku, qty, unit, weight_kg, volume_m3, pallets, colli, length_cm, width_cm, height_cm, category, temp_min, temp_max, hazardous, stackable)
  SELECT y.id, ${oid}, y.stop_id, y.ord, y.description, y.sku, y.qty, y.unit, y.weight_kg, y.volume_m3, y.pallets, y.colli, y.length_cm, y.width_cm, y.height_cm, y.category, y.temp_min, y.temp_max, y.hazardous, y.stackable
  FROM jsonb_to_recordset(${src}::jsonb) AS y(id uuid, stop_id uuid, ord int, description text, sku text, qty numeric, unit text, weight_kg numeric, volume_m3 numeric, pallets numeric, colli numeric, length_cm numeric, width_cm numeric, height_cm numeric, category text, temp_min numeric, temp_max numeric, hazardous boolean, stackable boolean)`;

/** Normalisasi + validasi; lempar 422 bila ada error. */
export function prepare(input) {
  const order = normalizeOrder(input || {});
  const v = validateOrder(order);
  if (v.errors.length) throw new ApiError(422, 'validation', 'Data DO tidak valid', v.errors);
  return { order, warnings: v.warnings };
}

const dupGuard = (e) => {
  if (e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message)))) throw new ApiError(409, 'do_no_duplicate', 'Nomor DO sudah ada');
  throw e;
};

async function audit(db, actor, action, entityId, data) {
  try {
    await db.query('INSERT INTO audit_log (actor, action, entity, entity_id, data) VALUES ($1, $2, $3, $4, $5::jsonb)', [actor || '', action, 'order', String(entityId), JSON.stringify(data || {})]);
  } catch (e) {
    console.error('[audit]', e.message);
  }
}

export async function createOrder(db, input, actor) {
  const { order, warnings } = prepare(input);
  const id = randomUUID();
  const { stops, items } = flatten(order);
  try {
    await db.query(
      `WITH o AS (INSERT INTO orders (id, do_no, customer, order_date, priority, notes, summary, created_by, corridor_m) VALUES ($1, $2, $3, $4::date, $5, $6, $7::jsonb, $8, $11::int) RETURNING id),
       s AS (${INS_STOPS('(SELECT id FROM o)', '$9')})
       ${INS_ITEMS('(SELECT id FROM o)', '$10')}`,
      [id, order.doNo, order.customer, order.orderDate, order.priority, order.notes, JSON.stringify(summary(order)), actor || '', JSON.stringify(stops), JSON.stringify(items), order.corridorM],
    );
  } catch (e) {
    dupGuard(e);
  }
  await audit(db, actor, 'create', id, { doNo: order.doNo });
  return { order: await getOrder(db, id), warnings };
}

export async function updateOrder(db, id, input, version, actor) {
  const { order, warnings } = prepare(input);
  const { stops, items } = flatten(order);
  let rows;
  try {
    rows = await db.query(
      `WITH u AS (UPDATE orders SET do_no = $2, customer = $3, order_date = $4::date, priority = $5, notes = $6, summary = $7::jsonb, corridor_m = $11::int, version = version + 1, updated_at = now()
                  WHERE id = $1 AND version = $8 AND status = 'draft' RETURNING id),
       d AS (DELETE FROM stops WHERE order_id IN (SELECT id FROM u)),
       s AS (${INS_STOPS('(SELECT id FROM u)', '$9')} WHERE EXISTS (SELECT 1 FROM u) RETURNING id),
       i AS (${INS_ITEMS('(SELECT id FROM u)', '$10')} WHERE EXISTS (SELECT 1 FROM u) RETURNING id)
       SELECT (SELECT count(*) FROM u)::int AS n`,
      [id, order.doNo, order.customer, order.orderDate, order.priority, order.notes, JSON.stringify(summary(order)), version, JSON.stringify(stops), JSON.stringify(items), order.corridorM],
    );
  } catch (e) {
    dupGuard(e);
  }
  if (!rows[0] || Number(rows[0].n) !== 1) {
    const cur = await db.query('SELECT status FROM orders WHERE id = $1', [id]);
    if (!cur.length) throw new ApiError(404, 'not_found', 'DO tidak ditemukan');
    if (cur[0].status !== 'draft') throw new ApiError(409, 'not_draft', 'DO sudah diproses, tidak bisa diubah');
    throw new ApiError(409, 'version_conflict', 'DO diubah oleh pengguna lain, muat ulang');
  }
  await audit(db, actor, 'update', id, { doNo: order.doNo, version: Number(version) + 1 });
  return { order: await getOrder(db, id), warnings };
}

export async function deleteOrder(db, id, actor) {
  const rows = await db.query(`DELETE FROM orders WHERE id = $1 AND status = 'draft' RETURNING id, do_no`, [id]);
  if (!rows.length) {
    const ex = await db.query('SELECT status FROM orders WHERE id = $1', [id]);
    if (!ex.length) throw new ApiError(404, 'not_found', 'DO tidak ditemukan');
    throw new ApiError(409, 'not_draft', 'Hanya DO berstatus draft yang bisa dihapus');
  }
  await audit(db, actor, 'delete', id, { doNo: rows[0].do_no });
  return { ok: true };
}

export async function getOrder(db, id) {
  await expireOffers(db);
  const head = await db.query(`SELECT ${ORDER_COLS} FROM orders o WHERE o.id = $1`, [id]);
  if (!head.length) return null;
  const stops = await db.query(`SELECT ${STOP_COLS} FROM stops s WHERE s.order_id = $1 ORDER BY s.seq`, [id]);
  const items = await db.query(`SELECT ${ITEM_COLS} FROM items i WHERE i.order_id = $1 ORDER BY i.ord`, [id]);
  const by = new Map();
  for (const it of items) (by.get(it.stop_id) || by.set(it.stop_id, []).get(it.stop_id)).push(mapItem(it));
  return { ...mapHead(head[0]), stops: stops.map((s) => mapStop(s, by.get(s.id) || [])) };
}

/** Daftar DO (tanpa detail stop): filter status, q (nomor DO/customer), rentang tanggal order, halaman. */
export async function listOrders(db, { status, source, q, from, to, limit = 50, offset = 0 } = {}) {
  await expireOffers(db);
  const where = [];
  const p = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
  if (status) add('o.status = ?', status);
  if (source === 'internal' || source === 'external') add('o.source = ?', source);
  if (q) {
    p.push(`%${String(q).replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(o.do_no ILIKE $${p.length} OR o.customer ILIKE $${p.length})`);
  }
  if (from) add('o.order_date >= ?::date', from);
  if (to) add('o.order_date <= ?::date', to);
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.query(`SELECT ${ORDER_COLS}, count(*) OVER() AS total FROM orders o ${w} ORDER BY o.order_date DESC, o.created_at DESC LIMIT ${lim} OFFSET ${off}`, p);
  const counts = await db.query(`SELECT status, count(*)::int AS n FROM orders GROUP BY status`);
  return { orders: rows.map(mapHead), total: rows.length ? Number(rows[0].total) : 0, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
}

export async function existingDoNos(db, doNos) {
  if (!doNos.length) return new Set();
  const rows = await db.query('SELECT do_no FROM orders WHERE lower(do_no) = ANY($1::text[])', [doNos.map((d) => d.toLowerCase())]);
  return new Set(rows.map((r) => r.do_no.toLowerCase()));
}
