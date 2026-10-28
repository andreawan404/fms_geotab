// Master vendor / kendaraan / driver, penawaran (offer) DO ke vendor, dan alokasi.
// Operasi yang menentukan pemenang (terima penawaran, alokasi langsung) = SATU pernyataan SQL yang memakai UPDATE pada baris order
// sebagai gerbang, sehingga bila dua vendor menerima bersamaan hanya satu yang berhasil (yang lain menunggu lock lalu gagal).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';
import { VEHICLE_TYPES } from '../../src/core/capacity.js';

// ---------- master data ----------
const KINDS = {
  vendors: {
    table: 'vendors', order: 'lower(name)',
    fields: [['name', 'name', 'text', true], ['email', 'email', 'text'], ['phone', 'phone', 'text'], ['pic', 'pic', 'text'], ['geotab_group', 'geotabGroup', 'text'], ['notes', 'notes', 'text'], ['internal', 'internal', 'bool'], ['active', 'active', 'bool']],
  },
  vehicles: {
    table: 'vehicles', order: 'lower(plate)', parent: true,
    fields: [['vendor_id', 'vendorId', 'uuid', true], ['plate', 'plate', 'text', true], ['type', 'type', 'text'], ['geotab_device_id', 'geotabDeviceId', 'text'], ['has_gps', 'hasGps', 'bool'],
      ['max_weight_kg', 'maxWeightKg', 'num'], ['max_volume_m3', 'maxVolumeM3', 'num'], ['max_pallets', 'maxPallets', 'num'], ['max_colli', 'maxColli', 'num'],
      ['length_cm', 'lengthCm', 'num'], ['width_cm', 'widthCm', 'num'], ['height_cm', 'heightCm', 'num'], ['temp_controlled', 'tempControlled', 'bool'],
      ['temp_min_c', 'tempMinC', 'num'], ['temp_max_c', 'tempMaxC', 'num'], ['allows_hazardous', 'allowsHazardous', 'bool'], ['fuel_km_per_l', 'fuelKmPerL', 'num'], ['toll_class', 'tollClass', 'num'], ['notes', 'notes', 'text'], ['active', 'active', 'bool']],
  },
  drivers: {
    table: 'drivers', order: 'lower(name)', parent: true,
    fields: [['vendor_id', 'vendorId', 'uuid', true], ['name', 'name', 'text', true], ['phone', 'phone', 'text'], ['license_no', 'licenseNo', 'text'], ['notes', 'notes', 'text'], ['active', 'active', 'bool']],
  },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAILS = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+(\s*,\s*[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$/;
const kindOf = (k) => KINDS[k] || (() => { throw new ApiError(404, 'unknown_kind', 'Jenis data tidak dikenal'); })();
const camel = (cfg) => cfg.fields.map(([c, k]) => `${c} AS "${k}"`).join(', ');
const numCols = (cfg) => cfg.fields.filter((f) => f[2] === 'num').map((f) => f[0]);
const selectSql = (cfg) => `SELECT id, ${cfg.fields.map(([c, k, t]) => (t === 'num' ? `${c}::float8 AS "${k}"` : `${c} AS "${k}"`)).join(', ')} FROM ${cfg.table}`;

function clean(kind, input, partial = false) {
  const cfg = kindOf(kind);
  const out = {};
  const errors = [];
  for (const [col, key, type, req] of cfg.fields) {
    let v = input[key];
    if (v === undefined) {
      if (partial) continue;
      v = type === 'bool' ? (key === 'active' ? true : false) : type === 'num' ? null : '';
    }
    if (type === 'text') v = v == null ? '' : String(v).trim();
    else if (type === 'bool') v = v === true || v === 'true' || v === 1;
    else if (type === 'num') {
      if (v === '' || v == null) v = null;
      else {
        v = Number(String(v).replace(',', '.'));
        if (!Number.isFinite(v) || (!/temp/i.test(key) && v < 0)) { errors.push({ path: key, code: 'num_invalid' }); continue; }
      }
    } else if (type === 'uuid') {
      v = String(v || '');
      if (!UUID.test(v)) { errors.push({ path: key, code: 'required' }); continue; }
    }
    if (kind === 'vehicles' && col === 'type' && !v) v = 'other';
    if (req && (v === '' || v == null)) errors.push({ path: key, code: 'required' });
    out[col] = v;
  }
  if (kind === 'vendors' && out.email && !EMAILS.test(out.email)) errors.push({ path: 'email', code: 'email_invalid' });
  if (kind === 'vehicles' && out.type !== undefined && !VEHICLE_TYPES.includes(out.type)) errors.push({ path: 'type', code: 'type_invalid' });
  if (errors.length) throw new ApiError(422, 'validation', 'Data tidak valid', errors);
  return out;
}

const dupGuard = (kind, e) => {
  if (e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message)))) throw new ApiError(409, `${kind}_duplicate`, 'Data sudah ada');
  if (e && (e.code === '23503' || /foreign key/i.test(String(e.message)))) throw new ApiError(422, 'validation', 'Induk tidak ditemukan', [{ path: 'vendorId', code: 'required' }]);
  throw e;
};

async function audit(db, actor, action, entity, id, data) {
  try {
    await db.query('INSERT INTO audit_log (actor, action, entity, entity_id, data) VALUES ($1, $2, $3, $4, $5::jsonb)', [actor || '', action, entity, String(id), JSON.stringify(data || {})]);
  } catch (e) {
    console.error('[audit]', e.message);
  }
}

export async function listMaster(db, kind, { vendorId, all } = {}) {
  const cfg = kindOf(kind);
  const w = [];
  const p = [];
  if (vendorId && cfg.parent) { p.push(vendorId); w.push(`vendor_id = $${p.length}`); }
  if (!all) w.push('active = true');
  return db.query(`${selectSql(cfg)} ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY ${cfg.order}`, p);
}

export async function createMaster(db, kind, input, actor) {
  const cfg = kindOf(kind);
  const v = clean(kind, input);
  const cols = Object.keys(v);
  try {
    const rows = await db.query(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((c) => v[c]));
    await audit(db, actor, 'create', kind, rows[0].id, v);
    return { item: (await db.query(`${selectSql(cfg)} WHERE id = $1`, [rows[0].id]))[0] };
  } catch (e) {
    return dupGuard(kind, e);
  }
}

export async function updateMaster(db, kind, id, input, actor) {
  const cfg = kindOf(kind);
  if (!UUID.test(id)) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  const v = clean(kind, input, true);
  const cols = Object.keys(v);
  if (!cols.length) throw new ApiError(400, 'empty', 'Tidak ada perubahan');
  try {
    const rows = await db.query(`UPDATE ${cfg.table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING id`, [id, ...cols.map((c) => v[c])]);
    if (!rows.length) throw new ApiError(404, 'not_found', 'Data tidak ditemukan');
    await audit(db, actor, 'update', kind, id, v);
    return { item: (await db.query(`${selectSql(cfg)} WHERE id = $1`, [id]))[0] };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    return dupGuard(kind, e);
  }
}

/** Hapus; bila sudah dipakai DO / penawaran, cukup dinonaktifkan agar riwayat tetap utuh. */
export async function deleteMaster(db, kind, id, actor) {
  const cfg = kindOf(kind);
  if (!UUID.test(id)) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  const col = { vendors: 'vendor_id', vehicles: 'vehicle_id', drivers: 'driver_id' }[kind];
  const used = await db.query(`SELECT (SELECT count(*) FROM orders WHERE ${col} = $1) + (SELECT count(*) FROM offers WHERE ${kind === 'vendors' ? 'vendor_id' : kind === 'vehicles' ? 'vehicle_id' : 'driver_id'} = $1) AS n`, [id]);
  if (Number(used[0].n) > 0) {
    const r = await db.query(`UPDATE ${cfg.table} SET active = false WHERE id = $1 RETURNING id`, [id]);
    if (!r.length) throw new ApiError(404, 'not_found', 'Data tidak ditemukan');
    await audit(db, actor, 'deactivate', kind, id, {});
    return { ok: true, deactivated: true };
  }
  const r = await db.query(`DELETE FROM ${cfg.table} WHERE id = $1 RETURNING id`, [id]);
  if (!r.length) throw new ApiError(404, 'not_found', 'Data tidak ditemukan');
  await audit(db, actor, 'delete', kind, id, {});
  return { ok: true };
}

// ---------- penawaran & alokasi ----------
const hash = (t) => createHash('sha256').update(t).digest('hex');
const iso = (v) => (v == null ? '' : v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/** Penawaran yang melewati batas waktu -> 'expired'. Dipanggil lazy saat daftar/baca DO. */
export async function expireOffers(db) {
  try {
    await db.query(`UPDATE offers SET status = 'expired', responded_at = now() WHERE status = 'offered' AND expires_at <= now()`);
  } catch (e) {
    if (!/relation .* does not exist/i.test(String(e.message))) console.error('[expire]', e.message);
  }
}

const mapOffer = (r) => ({
  id: r.id, orderId: r.order_id, vendorId: r.vendor_id, vendorName: r.vendor_name || '', status: r.status, sentAt: iso(r.sent_at), expiresAt: iso(r.expires_at),
  respondedAt: r.responded_at ? iso(r.responded_at) : '', rejectReason: r.reject_reason || '', vehicleId: r.vehicle_id || null, driverId: r.driver_id || null,
  plate: r.plate || '', driverName: r.driver_name || '',
});

export async function listOffers(db, orderId) {
  await expireOffers(db);
  const rows = await db.query(
    `SELECT f.*, v.name AS vendor_name, vh.plate, d.name AS driver_name FROM offers f JOIN vendors v ON v.id = f.vendor_id
     LEFT JOIN vehicles vh ON vh.id = f.vehicle_id LEFT JOIN drivers d ON d.id = f.driver_id WHERE f.order_id = $1 ORDER BY f.sent_at DESC, v.name`, [orderId]);
  return rows.map(mapOffer);
}

/** Tawarkan DO ke beberapa vendor sekaligus. Mengembalikan penawaran + token mentah (hanya sekali, untuk email). */
export async function createOffers(db, orderId, { vendorIds, expiryMin = 60 }, actor) {
  const ids = [...new Set((vendorIds || []).filter((x) => UUID.test(String(x))))];
  if (!ids.length) throw new ApiError(422, 'validation', 'Pilih minimal satu vendor', [{ path: 'vendorIds', code: 'required' }]);
  const mins = Math.min(1440, Math.max(5, Number(expiryMin) || 60));
  const vendors = await db.query('SELECT id, name, email, pic FROM vendors WHERE id = ANY($1::uuid[]) AND active = true', [ids]);
  if (vendors.length !== ids.length) throw new ApiError(422, 'vendor_invalid', 'Ada vendor yang tidak aktif / tidak ditemukan');
  const offers = vendors.map((v) => {
    const token = randomBytes(24).toString('base64url');
    return { id: randomUUID(), vendor_id: v.id, token_hash: hash(token), token, vendor: v };
  });
  // gerbang: hanya DO draft / offered yang boleh ditawarkan; semua penawaran lama yang masih terbuka ditarik
  const rows = await db.query(
    `WITH g AS (UPDATE orders SET status = 'offered', version = version + 1, updated_at = now() WHERE id = $1 AND status IN ('draft', 'offered') RETURNING id),
     w AS (UPDATE offers SET status = 'withdrawn', responded_at = now() WHERE order_id IN (SELECT id FROM g) AND status = 'offered' RETURNING id),
     i AS (INSERT INTO offers (id, order_id, vendor_id, token_hash, expires_at, created_by)
           SELECT x.id, (SELECT id FROM g), x.vendor_id, x.token_hash, now() + ($3 || ' minutes')::interval, $4
           FROM jsonb_to_recordset($2::jsonb) AS x(id uuid, vendor_id uuid, token_hash text) WHERE EXISTS (SELECT 1 FROM g) RETURNING id, expires_at)
     SELECT (SELECT count(*) FROM g)::int AS n, (SELECT min(expires_at) FROM i) AS expires_at`,
    [orderId, JSON.stringify(offers.map(({ id, vendor_id, token_hash }) => ({ id, vendor_id, token_hash }))), String(mins), actor || ''],
  );
  if (!rows[0] || Number(rows[0].n) !== 1) await orderStateError(db, orderId, 'offer');
  await audit(db, actor, 'offer', 'order', orderId, { vendors: vendors.map((v) => v.name), expiryMin: mins });
  return { expiresAt: iso(rows[0].expires_at), offers: offers.map((o) => ({ id: o.id, token: o.token, vendor: o.vendor })) };
}

async function orderStateError(db, orderId, what) {
  const cur = await db.query('SELECT status FROM orders WHERE id = $1', [orderId]);
  if (!cur.length) throw new ApiError(404, 'not_found', 'DO tidak ditemukan');
  throw new ApiError(409, 'order_state', `DO berstatus ${cur[0].status}, tidak bisa ${what}`);
}

async function checkAssets(db, vendorId, vehicleId, driverId) {
  const v = await db.query('SELECT id FROM vendors WHERE id = $1 AND active = true', [vendorId]);
  if (!v.length) throw new ApiError(422, 'vendor_invalid', 'Vendor tidak aktif / tidak ditemukan');
  if (vehicleId) {
    const r = await db.query('SELECT id FROM vehicles WHERE id = $1 AND vendor_id = $2 AND active = true', [vehicleId, vendorId]);
    if (!r.length) throw new ApiError(422, 'vehicle_invalid', 'Kendaraan bukan milik vendor ini / tidak aktif');
  }
  if (driverId) {
    const r = await db.query('SELECT id FROM drivers WHERE id = $1 AND vendor_id = $2 AND active = true', [driverId, vendorId]);
    if (!r.length) throw new ApiError(422, 'driver_invalid', 'Driver bukan milik vendor ini / tidak aktif');
  }
}

/** Alokasi langsung oleh admin (tanpa penawaran). Membuat tautan portal (penawaran berstatus 'accepted') agar driver bisa menjalankan perjalanan dan mengisi POP / POD. */
export async function assignDirect(db, orderId, { vendorId, vehicleId, driverId }, actor) {
  if (!UUID.test(String(vendorId || ''))) throw new ApiError(422, 'validation', 'Vendor wajib dipilih', [{ path: 'vendorId', code: 'required' }]);
  if (!UUID.test(String(vehicleId || ''))) throw new ApiError(422, 'validation', 'Kendaraan wajib dipilih', [{ path: 'vehicleId', code: 'required' }]);
  await checkAssets(db, vendorId, vehicleId, driverId || null);
  const token = randomBytes(24).toString('base64url');
  const rows = await db.query(
    `WITH g AS (UPDATE orders SET status = 'assigned', vendor_id = $2, vehicle_id = $3, driver_id = $4, assigned_at = now(), assigned_via = 'admin', version = version + 1, updated_at = now()
                WHERE id = $1 AND status IN ('draft', 'offered') RETURNING id),
     w AS (UPDATE offers SET status = 'withdrawn', responded_at = now() WHERE order_id IN (SELECT id FROM g) AND status = 'offered' RETURNING id),
     i AS (INSERT INTO offers (id, order_id, vendor_id, token_hash, status, expires_at, responded_at, vehicle_id, driver_id, created_by)
           SELECT $5::uuid, g.id, $2, $6, 'accepted', now(), now(), $3, $4, $7 FROM g RETURNING id)
     SELECT count(*)::int AS n FROM g`, [orderId, vendorId, vehicleId, driverId || null, randomUUID(), hash(token), actor || '']);
  if (Number(rows[0].n) !== 1) await orderStateError(db, orderId, 'dialokasikan');
  await audit(db, actor, 'assign', 'order', orderId, { vendorId, vehicleId, driverId });
  return { ok: true, token };
}

/** Buat ulang tautan portal untuk DO yang sudah dialokasikan / berjalan (token lama ditutup). Dipakai bila tautan hilang atau ganti driver. */
export async function reissueLink(db, orderId, actor) {
  const token = randomBytes(24).toString('base64url');
  const rows = await db.query(
    `WITH o AS (SELECT id, vendor_id, vehicle_id, driver_id FROM orders WHERE id = $1 AND status IN ('assigned', 'running') AND vendor_id IS NOT NULL),
     w AS (UPDATE offers SET status = 'withdrawn' WHERE order_id IN (SELECT id FROM o) AND status = 'accepted' RETURNING id),
     i AS (INSERT INTO offers (id, order_id, vendor_id, token_hash, status, expires_at, responded_at, vehicle_id, driver_id, created_by)
           SELECT $2::uuid, o.id, o.vendor_id, $3, 'accepted', now(), now(), o.vehicle_id, o.driver_id, $4 FROM o RETURNING id)
     SELECT (SELECT count(*) FROM o)::int AS n`, [orderId, randomUUID(), hash(token), actor || '']);
  if (Number(rows[0].n) !== 1) await orderStateError(db, orderId, 'dibuatkan tautan');
  await audit(db, actor, 'link', 'order', orderId, {});
  return { ok: true, token };
}

/** Lepas alokasi / tarik penawaran: DO kembali draft agar bisa diubah dan ditawarkan ulang. */
export async function releaseOrder(db, orderId, actor) {
  const rows = await db.query(
    `WITH g AS (UPDATE orders SET status = 'draft', vendor_id = NULL, vehicle_id = NULL, driver_id = NULL, assigned_at = NULL, assigned_via = NULL, version = version + 1, updated_at = now()
                WHERE id = $1 AND status IN ('offered', 'assigned') RETURNING id),
     w AS (UPDATE offers SET status = 'withdrawn', responded_at = now() WHERE order_id IN (SELECT id FROM g) AND status IN ('offered', 'accepted') RETURNING id)
     SELECT count(*)::int AS n FROM g`, [orderId]);
  if (Number(rows[0].n) !== 1) await orderStateError(db, orderId, 'dilepas');
  await audit(db, actor, 'release', 'order', orderId, {});
  return { ok: true };
}

/** Penawaran lewat token (untuk portal vendor, v2.2). */
export async function getOfferByToken(db, token) {
  await expireOffers(db);
  const rows = await db.query('SELECT f.*, v.name AS vendor_name FROM offers f JOIN vendors v ON v.id = f.vendor_id WHERE f.token_hash = $1', [hash(String(token || ''))]);
  return rows.length ? mapOffer(rows[0]) : null;
}

/** Vendor menerima: yang pertama menang. Satu pernyataan atomik. */
export async function acceptOffer(db, token, { vehicleId, driverId }) {
  const th = hash(String(token || ''));
  const off = await db.query('SELECT id, vendor_id, order_id FROM offers WHERE token_hash = $1', [th]);
  if (!off.length) throw new ApiError(404, 'offer_not_found', 'Penawaran tidak ditemukan');
  await checkAssets(db, off[0].vendor_id, vehicleId, driverId || null);
  const rows = await db.query(
    `WITH g AS (UPDATE orders SET status = 'assigned', vendor_id = $2, vehicle_id = $3, driver_id = $4, assigned_at = now(), assigned_via = 'vendor', version = version + 1, updated_at = now()
                WHERE id = $5 AND status = 'offered'
                  AND EXISTS (SELECT 1 FROM offers WHERE token_hash = $1 AND status = 'offered' AND expires_at > now()) RETURNING id),
     a AS (UPDATE offers SET status = 'accepted', responded_at = now(), vehicle_id = $3, driver_id = $4 WHERE token_hash = $1 AND EXISTS (SELECT 1 FROM g) RETURNING id),
     w AS (UPDATE offers SET status = 'withdrawn', responded_at = now() WHERE order_id IN (SELECT id FROM g) AND status = 'offered' AND token_hash <> $1 RETURNING id)
     SELECT (SELECT count(*) FROM g)::int AS n`, [th, off[0].vendor_id, vehicleId, driverId || null, off[0].order_id]);
  if (Number(rows[0].n) === 1) return { ok: true, result: 'accepted' };
  await expireOffers(db);
  const cur = await db.query('SELECT status FROM offers WHERE token_hash = $1', [th]);
  throw new ApiError(409, 'offer_closed', 'Penawaran sudah ditutup', { status: cur[0]?.status });
}

export async function rejectOffer(db, token, reason) {
  const rows = await db.query(
    `UPDATE offers SET status = 'rejected', responded_at = now(), reject_reason = $2 WHERE token_hash = $1 AND status = 'offered' AND expires_at > now() RETURNING id`,
    [hash(String(token || '')), String(reason || '').trim().slice(0, 300)]);
  if (!rows.length) throw new ApiError(409, 'offer_closed', 'Penawaran sudah ditutup');
  return { ok: true, result: 'rejected' };
}

export async function logEmail(db, { orderId, offerId, to, subject, status, error }) {
  try {
    await db.query('INSERT INTO email_log (order_id, offer_id, to_addr, subject, status, error) VALUES ($1, $2, $3, $4, $5, $6)', [orderId, offerId, to, subject, status, error || null]);
  } catch (e) {
    console.error('[email_log]', e.message);
  }
}

/** Simpan snapshot angka perkiraan biaya & BBM aktual untuk laporan DO (nilai dibersihkan; hanya angka/teks pendek). */
export async function saveCalc(db, orderId, { cost, fuel } = {}) {
  const n = (v, max = 1e12) => { const x = Number(v); return v != null && v !== '' && Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : null; };
  const c = cost && typeof cost === 'object' ? {
    distKm: n(cost.distKm, 1e5), fuelL: n(cost.fuelL, 1e5), fuelRp: n(cost.fuelRp), tollKm: n(cost.tollKm, 1e5), tollRp: n(cost.tollRp), totalRp: n(cost.totalRp),
    tollSource: ['manual', 'route', 'unknown'].includes(cost.tollSource) ? cost.tollSource : 'unknown', kmPerL: n(cost.kmPerL, 1e3), fuelPriceRp: n(cost.fuelPriceRp),
    tollClass: n(cost.tollClass, 5), durS: n(cost.durS, 1e7), at: new Date().toISOString(),
  } : null;
  const f = fuel && typeof fuel === 'object' ? {
    fuelL: n(fuel.fuelL, 1e5), distKm: n(fuel.distKm, 1e5), kmPerL: n(fuel.kmPerL, 1e3), approx: !!fuel.approx, fromMs: Number(fuel.fromMs) || null, toMs: Number(fuel.toMs) || null,
    source: ['sensor', 'estimate'].includes(fuel.source) ? fuel.source : 'sensor', at: new Date().toISOString(),
  } : null;
  if (!c && !f) throw new ApiError(422, 'validation', 'Tidak ada data untuk disimpan', [{ path: 'cost', code: 'required' }]);
  if (f && f.fuelL == null) throw new ApiError(422, 'validation', 'Data BBM tidak valid', [{ path: 'fuel.fuelL', code: 'invalid' }]);
  const r = await db.query(
    `UPDATE orders SET cost = COALESCE($2::jsonb, cost), fuel = CASE WHEN source = 'external' THEN fuel ELSE COALESCE($3::jsonb, fuel) END WHERE id = $1 RETURNING id`,
    [orderId, c ? JSON.stringify(c) : null, f ? JSON.stringify(f) : null]);
  if (!r.length) throw new ApiError(404, 'not_found', 'DO tidak ditemukan');
  return { ok: true };
}
