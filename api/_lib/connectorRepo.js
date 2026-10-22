// Konektor TMS customer: tarik DO lewat API mereka (tanpa coding, cukup pemetaan field), simpan sebagai DO "eksternal" untuk dimonitor.
import { evalDelivery } from '../../src/core/deliveryEval.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';
import { decrypt, encrypt, encryptionReady } from './crypto.js';
import { assertPublicUrl, safeJsonFetch } from './safeFetch.js';
import { INS_ITEMS, INS_STOPS, flatten } from './ordersRepo.js';
import { fillTemplate, getPath, mapRecord, stopsSig } from '../../src/core/extMap.js';
import { summary } from '../../src/core/orders.js';

const MAX_RECORDS = 500;
const AUTH = ['none', 'header', 'bearer', 'basic', 'query'];

const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const kv = (v) => Object.fromEntries(Object.entries(obj(v)).slice(0, 20).map(([k, x]) => [clean(k, 60), clean(x, 300)]).filter(([k]) => k));

export function normalizeConfig(c = {}) {
  const r = obj(c.request);
  const p = obj(c.pagination);
  const m = obj(c.mapping);
  const sec = (x) => Object.fromEntries(Object.entries(obj(x)).slice(0, 30).map(([k, v]) => [k, typeof v === 'object' ? kv(v) : clean(v, 200)]));
  return {
    request: { method: r.method === 'POST' ? 'POST' : 'GET', path: clean(r.path, 300), query: kv(r.query), headers: kv(r.headers), body: clean(r.body, 2000) },
    itemsPath: clean(c.itemsPath, 120),
    pagination: { type: ['page', 'cursor'].includes(p.type) ? p.type : 'none', pageParam: clean(p.pageParam, 40) || 'page', sizeParam: clean(p.sizeParam, 40), size: Math.min(Math.max(Number(p.size) || 100, 1), 500), cursorParam: clean(p.cursorParam, 40) || 'cursor', nextPath: clean(p.nextPath, 120), maxPages: Math.min(Math.max(Number(p.maxPages) || 5, 1), 10) },
    mapping: { timezoneMin: Number.isFinite(Number(m.timezoneMin)) ? Number(m.timezoneMin) : 420, order: sec(m.order), stops: sec(m.stops), items: sec(m.items) },
  };
}

const cfgOf = (r) => normalizeConfig(typeof r.config === 'string' ? JSON.parse(r.config) : r.config);
const mapConn = (r) => ({
  id: r.id, name: r.name, enabled: r.enabled, baseUrl: r.base_url, authType: r.auth_type, authName: r.auth_name, hasSecret: !!r.secret_enc, config: cfgOf(r), intervalMin: r.interval_min,
  lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : '', lastStatus: r.last_status || '', lastError: r.last_error || '', lastCount: Number(r.last_count || 0), orders: Number(r.orders || 0),
});

export async function listConnectors(db) {
  const rows = await db.query(`SELECT c.*, (SELECT count(*) FROM orders o WHERE o.ext_connector = c.id)::int AS orders FROM connectors c ORDER BY c.created_at`);
  return { connectors: rows.map(mapConn), encryption: encryptionReady() };
}

export async function saveConnector(db, input, actor) {
  const name = clean(input.name, 80);
  if (name.length < 2) throw new ApiError(422, 'validation', 'Nama konektor wajib diisi', [{ path: 'name', code: 'required' }]);
  const baseUrl = clean(input.baseUrl, 300).replace(/\/+$/, '');
  await assertPublicUrl(baseUrl);
  const authType = AUTH.includes(input.authType) ? input.authType : 'none';
  const secret = String(input.secret || '').trim();
  const enc = secret ? encrypt(secret) : null;
  if (authType !== 'none' && !secret && !input.id) throw new ApiError(422, 'validation', 'Kunci / token API wajib diisi', [{ path: 'secret', code: 'required' }]);
  const cfg = JSON.stringify(normalizeConfig(input.config));
  const interval = Math.min(Math.max(Math.round(Number(input.intervalMin) || 10), 5), 1440);
  if (input.id) {
    const r = await db.query(
      `UPDATE connectors SET name = $2, enabled = $3, base_url = $4, auth_type = $5, auth_name = $6, secret_enc = COALESCE($7, CASE WHEN $5 = 'none' THEN NULL ELSE secret_enc END), config = $8::jsonb, interval_min = $9, updated_at = now(), updated_by = $10
        WHERE id = $1 RETURNING id`, [input.id, name, input.enabled !== false, baseUrl, authType, clean(input.authName, 60), enc, cfg, interval, actor || '']);
    if (!r.length) throw new ApiError(404, 'not_found', 'Konektor tidak ditemukan');
    return { id: input.id };
  }
  const id = randomUUID();
  await db.query(`INSERT INTO connectors (id, name, enabled, base_url, auth_type, auth_name, secret_enc, config, interval_min, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
    [id, name, input.enabled !== false, baseUrl, authType, clean(input.authName, 60), enc, cfg, interval, actor || '']);
  return { id };
}

export async function deleteConnector(db, id) {
  const n = (await db.query(`SELECT count(*)::int AS n FROM orders WHERE ext_connector = $1`, [id]))[0].n;
  if (n > 0) throw new ApiError(409, 'connector_in_use', `Konektor masih punya ${n} DO. Nonaktifkan saja.`);
  const r = await db.query('DELETE FROM connectors WHERE id = $1 RETURNING id', [id]);
  if (!r.length) throw new ApiError(404, 'not_found', 'Konektor tidak ditemukan');
  return { ok: true };
}

/** Siapkan request: URL + header autentikasi. `row` = baris connectors (dengan secret_enc), atau objek sementara untuk uji. */
export function buildRequest(row, cfg, secret, { since, page, cursor } = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(cfg.request.query)) q.set(k, fillTemplate(v, { since }));
  const pg = cfg.pagination;
  if (pg.type === 'page') { q.set(pg.pageParam, String(page || 1)); if (pg.sizeParam) q.set(pg.sizeParam, String(pg.size)); }
  if (pg.type === 'cursor') { if (pg.sizeParam) q.set(pg.sizeParam, String(pg.size)); if (cursor) q.set(pg.cursorParam, String(cursor)); }
  const headers = Object.fromEntries(Object.entries(cfg.request.headers).map(([k, v]) => [k, fillTemplate(v, { since })]));
  if (row.auth_type === 'header') headers[row.auth_name || 'X-API-Key'] = secret;
  else if (row.auth_type === 'bearer') headers.Authorization = `Bearer ${secret}`;
  else if (row.auth_type === 'basic') headers.Authorization = `Basic ${Buffer.from(`${row.auth_name}:${secret}`).toString('base64')}`;
  else if (row.auth_type === 'query') q.set(row.auth_name || 'api_key', secret);
  const path = cfg.request.path ? (cfg.request.path.startsWith('/') ? cfg.request.path : `/${cfg.request.path}`) : '';
  const qs = q.toString();
  const body = cfg.request.method === 'POST' && cfg.request.body ? fillTemplate(cfg.request.body, { since }) : undefined;
  if (body) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  return { url: `${row.base_url}${path}${qs ? `?${qs}` : ''}`, method: cfg.request.method, headers, body };
}

async function pull(row, cfg, secret, { since, firstPageOnly = false } = {}) {
  const out = [];
  let page = 1;
  let cursor = '';
  const max = firstPageOnly ? 1 : cfg.pagination.maxPages;
  for (let i = 0; i < max; i++) {
    const req = buildRequest(row, cfg, secret, { since, page, cursor });
    const data = await safeJsonFetch(req.url, req);
    const items = getPath(data, cfg.itemsPath);
    if (!Array.isArray(items)) throw new ApiError(502, 'connector_items', `Path daftar DO "${cfg.itemsPath || '(akar)'}" tidak menghasilkan array. Cek "Path daftar".`);
    out.push(...items);
    if (out.length >= MAX_RECORDS) break;
    if (cfg.pagination.type === 'page') { if (items.length < (cfg.pagination.sizeParam ? cfg.pagination.size : 1)) break; page++; }
    else if (cfg.pagination.type === 'cursor') { cursor = getPath(data, cfg.pagination.nextPath); if (!cursor) break; }
    else break;
  }
  return out.slice(0, MAX_RECORDS);
}

const rowForTest = (input, existing) => ({
  base_url: clean(input.baseUrl || existing?.base_url, 300).replace(/\/+$/, ''), auth_type: AUTH.includes(input.authType) ? input.authType : existing?.auth_type || 'none', auth_name: clean(input.authName ?? existing?.auth_name, 60),
});

/** Uji konfigurasi tanpa menyimpan: tarik halaman pertama, tampilkan contoh data mentah dan hasil pemetaan. */
export async function testConnector(db, input) {
  let existing = null;
  if (input.id) existing = (await db.query('SELECT * FROM connectors WHERE id = $1', [input.id]))[0];
  const row = rowForTest(input, existing);
  await assertPublicUrl(row.base_url);
  const cfg = normalizeConfig(input.config || (existing && cfgOf(existing)));
  const secret = String(input.secret || '').trim() || (existing?.secret_enc ? decrypt(existing.secret_enc) : '');
  if (row.auth_type !== 'none' && !secret) throw new ApiError(422, 'validation', 'Isi kunci / token API untuk uji', [{ path: 'secret', code: 'required' }]);
  const items = await pull(row, cfg, secret, { firstPageOnly: true });
  const mapped = items.slice(0, 5).map((rec) => {
    const m = mapRecord(rec, cfg.mapping, { connectorName: input.name });
    return { externalId: m.externalId, doNo: m.order.doNo, plate: m.plate, status: m.status, extStatus: m.extStatus, stops: m.order.stops.map((s) => ({ type: s.type, name: s.name, lat: s.lat, lng: s.lng, windowEnd: s.windowEnd })), problems: m.problems };
  });
  return { count: items.length, sample: items[0] === undefined ? null : JSON.stringify(items[0], null, 2).slice(0, 4000), mapped };
}

async function upsertExternal(db, conn, m) {
  const { order } = m;
  const sig = stopsSig(order);
  const ex = (await db.query('SELECT id, ext_sig, status, customer, ext_plate, ext_status FROM orders WHERE ext_connector = $1 AND ext_id = $2', [conn.id, m.externalId]))[0];
  const sum = JSON.stringify(summary(order));
  if (!ex) {
    const id = randomUUID();
    const { stops, items } = flatten(order);
    for (const suffix of ['', `-${m.externalId.slice(0, 6)}`, `-${randomUUID().slice(0, 4)}`]) {
      try {
        await db.query(
          `WITH o AS (INSERT INTO orders (id, do_no, customer, order_date, priority, status, notes, summary, created_by, source, ext_connector, ext_id, ext_plate, ext_status, ext_sig, ext_synced_at, started_at, finished_at)
                      VALUES ($1, $2, $3, $4::date, 'normal', $5, $6, $7::jsonb, 'connector', 'external', $8, $9, $10, $11, $12, now(), CASE WHEN $5 IN ('running', 'done') THEN now() END, CASE WHEN $5 = 'done' THEN now() END) RETURNING id),
           s AS (${INS_STOPS('(SELECT id FROM o)', '$13')})
           ${INS_ITEMS('(SELECT id FROM o)', '$14')}`,
          [id, `${order.doNo}${suffix}`, order.customer, order.orderDate, m.status, order.notes, sum, conn.id, m.externalId, m.plate, m.extStatus, sig, JSON.stringify(stops), JSON.stringify(items)]);
        return 'created';
      } catch (e) {
        if (!(e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message))))) throw e;
      }
    }
    throw new ApiError(409, 'do_no_duplicate', `Nomor DO ${order.doNo} bentrok`);
  }
  const routeChanged = ex.ext_sig !== sig && ex.status !== 'done';
  if (routeChanged) {
    const { stops, items } = flatten(order);
    await db.query(
      `WITH d AS (DELETE FROM stops WHERE order_id = $1),
       u AS (UPDATE orders SET customer = $2, status = $3, summary = $4::jsonb, ext_plate = $5, ext_status = $6, ext_sig = $7, ext_synced_at = now(), linked_route_id = NULL, linked_asg_id = NULL, linked_device_id = NULL, linked_at = NULL, link_closed_at = NULL, version = version + 1, updated_at = now(),
                    started_at = COALESCE(started_at, CASE WHEN $3 IN ('running', 'done') THEN now() END), finished_at = COALESCE(finished_at, CASE WHEN $3 = 'done' THEN now() END) WHERE id = $1 RETURNING id),
       s AS (${INS_STOPS('(SELECT id FROM u)', '$8')} WHERE EXISTS (SELECT 1 FROM u) RETURNING id)
       ${INS_ITEMS('(SELECT id FROM u)', '$9')} WHERE EXISTS (SELECT 1 FROM u)`,
      [ex.id, order.customer, m.status, sum, m.plate, m.extStatus, sig, JSON.stringify(stops), JSON.stringify(items)]);
    return 'updated';
  }
  const changed = ex.status !== m.status || ex.customer !== order.customer || (ex.ext_plate || '') !== m.plate || (ex.ext_status || '') !== m.extStatus;
  await db.query(
    `UPDATE orders SET status = CASE WHEN status = 'done' THEN status ELSE $2 END, customer = $3, ext_plate = $4, ext_status = $5, ext_synced_at = now(), updated_at = CASE WHEN $6::boolean THEN now() ELSE updated_at END,
        started_at = COALESCE(started_at, CASE WHEN $2 IN ('running', 'done') THEN now() END), finished_at = COALESCE(finished_at, CASE WHEN $2 = 'done' THEN now() END) WHERE id = $1`,
    [ex.id, m.status, order.customer, m.plate, m.extStatus, changed]);
  return changed ? 'updated' : 'unchanged';
}

export async function runConnector(db, id, { since: sinceOverride } = {}) {
  const row = (await db.query('SELECT * FROM connectors WHERE id = $1', [id]))[0];
  if (!row) throw new ApiError(404, 'not_found', 'Konektor tidak ditemukan');
  const stats = { fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, noCoords: 0 };
  try {
    const cfg = cfgOf(row);
    const secret = row.secret_enc ? decrypt(row.secret_enc) : '';
    const base = sinceOverride === undefined ? row.last_run_at : sinceOverride;
    const since = base ? new Date(new Date(base).getTime() - 60000).toISOString() : undefined;
    const items = await pull(row, cfg, secret, { since });
    stats.fetched = items.length;
    for (const rec of items) {
      const m = mapRecord(rec, cfg.mapping, { connectorName: row.name });
      if (!m.ok) { stats.skipped++; continue; }
      if (m.problems.includes('coords')) stats.noCoords++;
      stats[await upsertExternal(db, row, m)]++;
    }
    await db.query(`UPDATE connectors SET last_run_at = now(), last_status = 'ok', last_error = NULL, last_count = $2 WHERE id = $1`, [id, stats.fetched]);
    return { ok: true, ...stats };
  } catch (e) {
    await db.query(`UPDATE connectors SET last_run_at = now(), last_status = 'error', last_error = $2 WHERE id = $1`, [id, String(e.message || e).slice(0, 300)]).catch(() => {});
    if (e instanceof ApiError) throw e;
    throw new ApiError(500, 'connector_run', String(e.message || e).slice(0, 200));
  }
}

/** Jalankan konektor yang sudah waktunya (dipanggil cron). Klaim atomik lewat last_run_at agar tidak jalan ganda. */
export async function runDueConnectors(db) {
  const due = await db.query(
    `WITH d AS (SELECT id, last_run_at AS prev FROM connectors WHERE enabled AND (last_run_at IS NULL OR last_run_at <= now() - (interval_min || ' minutes')::interval) FOR UPDATE)
     UPDATE connectors c SET last_run_at = now() FROM d WHERE c.id = d.id RETURNING c.id, d.prev`);
  const out = [];
  for (const d of due) {
    try { out.push({ id: d.id, ...(await runConnector(db, d.id, { since: d.prev || null }))}); } catch (e) { out.push({ id: d.id, ok: false, error: e.message }); }
  }
  return out;
}

export async function getMode(db) {
  const r = await db.query(`SELECT value FROM app_settings WHERE key = 'mode'`);
  const v = r[0] ? String(r[0].value).replace(/"/g, '') : '';
  return v === 'monitor' ? 'monitor' : 'full';
}
export async function setMode(db, mode) {
  if (!['full', 'monitor'].includes(mode)) throw new ApiError(422, 'validation', 'Mode tidak valid', [{ path: 'mode', code: 'invalid' }]);
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('mode', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`, [JSON.stringify(mode)]);
  return { mode };
}

// ---- Perkawinan dengan Geotab: add-in (browser admin) mencocokkan plat -> kendaraan, membuat rute + penugasan, lalu melapor ke sini ----
const normPlate = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function getAliases(db) {
  const r = await db.query(`SELECT value FROM app_settings WHERE key = 'plateAlias'`);
  const v = r[0] ? (typeof r[0].value === 'string' ? JSON.parse(r[0].value) : r[0].value) : {};
  return v && typeof v === 'object' ? v : {};
}

export async function linkInfo(db) {
  const pending = await db.query(
    `SELECT o.id, o.do_no, o.customer, o.status, o.ext_plate,
            (SELECT jsonb_agg(jsonb_build_object('type', s.type, 'name', s.name, 'lat', s.lat, 'lng', s.lng, 'radiusM', s.radius_m, 'windowStart', s.window_start, 'windowEnd', s.window_end) ORDER BY s.seq) FROM stops s WHERE s.order_id = o.id) AS stops
       FROM orders o WHERE o.source = 'external' AND o.status IN ('assigned', 'running') AND o.linked_route_id IS NULL ORDER BY o.created_at DESC LIMIT 50`);
  const toClose = await db.query(
    `SELECT id, linked_asg_id FROM orders WHERE source = 'external' AND linked_asg_id IS NOT NULL AND link_closed_at IS NULL AND status IN ('done', 'cancelled') LIMIT 50`);
  const linked = await db.query(`SELECT count(*)::int AS n FROM orders WHERE source = 'external' AND linked_route_id IS NOT NULL AND link_closed_at IS NULL`);
  return {
    pending: pending.map((r) => ({ id: r.id, doNo: r.do_no, customer: r.customer, status: r.status, plate: r.ext_plate || '', stops: (typeof r.stops === 'string' ? JSON.parse(r.stops) : r.stops) || [] })),
    toClose: toClose.map((r) => ({ orderId: r.id, asgId: r.linked_asg_id })),
    linkedActive: linked[0].n,
    aliases: await getAliases(db),
  };
}

const ID = /^[A-Za-z0-9_.@:-]{1,80}$/;
export async function linkOrder(db, { orderId, routeId, asgId, deviceId }) {
  if (![routeId, asgId, deviceId].every((v) => ID.test(String(v || '')))) throw new ApiError(422, 'validation', 'ID tautan tidak valid', [{ path: 'routeId', code: 'invalid' }]);
  const r = await db.query(
    `UPDATE orders SET linked_route_id = $2, linked_asg_id = $3, linked_device_id = $4, linked_at = now(), link_closed_at = NULL WHERE id = $1 AND source = 'external' RETURNING id`, [orderId, routeId, asgId, deviceId]);
  if (!r.length) throw new ApiError(404, 'not_found', 'DO eksternal tidak ditemukan');
  return { ok: true };
}
export async function linkClosed(db, orderId) {
  await db.query(`UPDATE orders SET link_closed_at = now() WHERE id = $1 AND source = 'external'`, [orderId]);
  return { ok: true };
}
export async function setAlias(db, plate, deviceId) {
  const k = normPlate(plate);
  if (k.length < 3 || k.length > 12) throw new ApiError(422, 'validation', 'Plat tidak valid', [{ path: 'plate', code: 'invalid' }]);
  const cur = await getAliases(db);
  if (deviceId) { if (!ID.test(String(deviceId))) throw new ApiError(422, 'validation', 'Kendaraan tidak valid', [{ path: 'deviceId', code: 'invalid' }]); cur[k] = String(deviceId); } else delete cur[k];
  if (Object.keys(cur).length > 500) throw new ApiError(422, 'validation', 'Terlalu banyak alias plat', [{ path: 'plate', code: 'too_many' }]);
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('plateAlias', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`, [JSON.stringify(cur)]);
  // plat ini perlu dihubungkan ulang
  await db.query(`UPDATE orders SET linked_route_id = NULL, linked_asg_id = NULL, linked_device_id = NULL, linked_at = NULL, link_closed_at = NULL WHERE source = 'external' AND status IN ('assigned', 'running') AND regexp_replace(upper(coalesce(ext_plate, '')), '[^A-Z0-9]', '', 'g') = $1`, [k]);
  return { ok: true };
}

/** Kedatangan di stop hasil deteksi GPS (mesin rute add-in) -> trip_events, sehingga laporan tepat waktu & exception memakai waktu GPS. */
export async function gpsArrivals(db, list) {
  const now = Date.now();
  const rows = (Array.isArray(list) ? list : []).slice(0, 50).map((x) => ({ order_id: String(x.orderId || ''), stop_seq: Math.round(Number(x.stopSeq)), at: Number(x.at) }))
    .filter((x) => /^[0-9a-f-]{36}$/i.test(x.order_id) && x.stop_seq >= 1 && x.stop_seq <= 60 && Number.isFinite(x.at) && x.at < now + 5 * 60000 && x.at > now - 3 * 864e5)
    .map((x) => ({ ...x, at: new Date(x.at).toISOString() }));
  if (!rows.length) return { ok: true, inserted: 0 };
  const r = await db.query(
    `INSERT INTO trip_events (order_id, seq, type, stop_seq, at, note, source)
     SELECT x.order_id, 1000 + x.stop_seq, 'arrive', x.stop_seq, x.at, 'GPS', 'gps' FROM jsonb_to_recordset($1::jsonb) AS x(order_id uuid, stop_seq int, at timestamptz)
      WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = x.order_id AND o.source = 'external') ON CONFLICT DO NOTHING RETURNING seq`, [JSON.stringify(rows)]);
  return { ok: true, inserted: r.length };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Laporan pengiriman gabungan: status TMS customer vs kedatangan GPS (+ BBM bila sudah dihitung). */
export async function deliveryReport(db, { from, to }) {
  if (!DATE.test(String(from)) || !DATE.test(String(to))) throw new ApiError(422, 'validation', 'Rentang tanggal tidak valid', [{ path: 'from', code: 'invalid' }]);
  const grace = Number(process.env.EXC_LATE_GRACE_MIN) || 15;
  const rows = await db.query(
    `SELECT o.id, o.do_no, o.customer, o.order_date::text AS order_date, o.status, o.ext_plate, o.ext_status, o.linked_device_id, o.linked_route_id, o.fuel,
            (SELECT jsonb_agg(jsonb_build_object('seq', s.seq, 'type', s.type, 'name', s.name, 'windowEnd', s.window_end,
                     'arriveAt', (SELECT min(e.at) FROM trip_events e WHERE e.order_id = o.id AND e.type = 'arrive' AND e.stop_seq = s.seq)) ORDER BY s.seq) FROM stops s WHERE s.order_id = o.id) AS stops,
            coalesce((SELECT sum(i.weight_kg) FROM items i JOIN stops s ON s.id = i.stop_id WHERE i.order_id = o.id AND s.type = 'delivery'), 0)::float8 AS kg
       FROM orders o WHERE o.source = 'external' AND o.order_date BETWEEN $1::date AND $2::date ORDER BY o.order_date DESC, o.created_at DESC LIMIT 500`, [from, to]);
  const orders = rows.map((r) => {
    const stops = (typeof r.stops === 'string' ? JSON.parse(r.stops) : r.stops) || [];
    const ev = evalDelivery({ status: r.status, linked: !!r.linked_route_id, stops: stops.map((s) => ({ ...s, arriveAt: s.arriveAt ? new Date(s.arriveAt).toISOString() : null })) }, { graceMin: grace });
    const fuel = typeof r.fuel === 'string' ? JSON.parse(r.fuel) : r.fuel;
    return { id: r.id, doNo: r.do_no, customer: r.customer, date: r.order_date, status: r.status, extStatus: r.ext_status || '', plate: r.ext_plate || '', deviceId: r.linked_device_id || '', kg: r.kg, fuel: fuel || null, ...ev };
  });
  const sum = (f) => orders.reduce((a, o) => a + f(o), 0);
  const fuelOrders = orders.filter((o) => o.fuel?.fuelL > 0);
  const summary = {
    total: orders.length,
    linked: orders.filter((o) => o.verdict !== 'not_linked').length,
    consistent: orders.filter((o) => o.verdict === 'consistent').length,
    mismatch: orders.filter((o) => o.verdict === 'tms_done_no_gps' || o.verdict === 'gps_done_tms_open').length,
    measured: sum((o) => o.measured), onTime: sum((o) => o.onTime),
    fuelL: fuelOrders.reduce((a, o) => a + o.fuel.fuelL, 0), distKm: fuelOrders.reduce((a, o) => a + (o.fuel.distKm || 0), 0),
  };
  return { orders, summary, graceMin: grace };
}

export async function saveFuel(db, orderId, f) {
  const n = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : null; };
  const fuel = { fuelL: n(f?.fuelL, 1e5), distKm: n(f?.distKm, 1e5), kmPerL: n(f?.kmPerL, 1e3), lPerTonKm: n(f?.lPerTonKm, 1e3), approx: !!f?.approx, fromMs: Number(f?.fromMs) || null, toMs: Number(f?.toMs) || null, at: new Date().toISOString() };
  if (fuel.fuelL == null) throw new ApiError(422, 'validation', 'Data BBM tidak valid', [{ path: 'fuelL', code: 'invalid' }]);
  const r = await db.query(`UPDATE orders SET fuel = $2::jsonb WHERE id = $1 AND source = 'external' RETURNING id`, [orderId, JSON.stringify(fuel)]);
  if (!r.length) throw new ApiError(404, 'not_found', 'DO eksternal tidak ditemukan');
  return { ok: true };
}
