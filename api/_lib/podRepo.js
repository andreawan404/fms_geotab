// POP (Proof of Pickup) & POD (Proof of Delivery): bukti serah terima yang terkunci setelah dikirim, dengan hash integritas dan kode verifikasi publik.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';
import { getOrder } from './ordersRepo.js';
import { haversine } from '../../src/core/geometry.js';
import { buildSteps } from '../../src/core/trip.js';

export const RETENTION_DAYS = () => Math.max(1, Number(process.env.POD_RETENTION_DAYS) || 30);
export const LIMITS = { photos: 4, photoBytes: 450 * 1024, sigBytes: 150 * 1024 };

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const iso = (v) => (v == null ? '' : v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/** JSON kanonik (kunci terurut) agar hash stabil. */
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export const podHash = (p) => sha(canon(p));

/** Isi yang di-hash: semua data penting + hash tiap foto dan tanda tangan. */
function hashPayload({ order, stopSeq, stopName, vendorId, receiver, note, items, gps, submittedAt, sigSha, photoShas, kind }) {
  return { ...(kind === 'pickup' ? { kind } : {}), v: 1, doNo: order.doNo, orderId: order.id, stopSeq, stopName, vendorId, receiver, note, items, gps, submittedAt, sigSha, photoShas };
}

function decodeImage(b64, kind, max) {
  const s = String(b64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(s) || s.length < 100) throw new ApiError(422, 'pod_invalid', `${kind} tidak valid`);
  const buf = Buffer.from(s, 'base64');
  if (buf.length > max) throw new ApiError(422, 'pod_too_big', `${kind} terlalu besar`);
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if ((kind === 'foto' && !isJpg) || (kind === 'tanda tangan' && !isPng)) throw new ApiError(422, 'pod_invalid', `Format ${kind} tidak valid`);
  return { buf, b64: buf.toString('base64') };
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Susun & validasi POD dari input portal. stop = stop pengiriman (dengan items). */
export function preparePod(stop, stopSeq, input) {
  const receiverName = String(input.receiverName || '').trim();
  if (receiverName.length < 2) throw new ApiError(422, 'receiver_required', 'Nama penerima wajib diisi');
  const photosIn = Array.isArray(input.photos) ? input.photos : [];
  if (photosIn.length < 1) throw new ApiError(422, 'photo_required', 'Minimal 1 foto bukti');
  if (photosIn.length > LIMITS.photos) throw new ApiError(422, 'photo_max', `Maksimal ${LIMITS.photos} foto`);
  const photos = photosIn.map((p, i) => {
    const d = decodeImage(p.b64, 'foto', LIMITS.photoBytes);
    return { ord: i, b64: d.b64, sha: sha(d.buf), bytes: d.buf.length, takenAt: p.takenAt && !Number.isNaN(Date.parse(p.takenAt)) ? new Date(p.takenAt).toISOString() : null };
  });
  if (!input.signature) throw new ApiError(422, 'signature_required', 'Tanda tangan penerima wajib');
  const sig = decodeImage(input.signature, 'tanda tangan', LIMITS.sigBytes);
  const recvIn = Array.isArray(input.items) ? input.items : [];
  let hasDiff = false;
  const items = stop.items.map((it, i) => {
    const r = recvIn.find((x) => Number(x.index) === i) || {};
    const received = num(r.receivedQty) ?? it.qty;
    if (received < 0) throw new ApiError(422, 'qty_invalid', 'Qty diterima tidak valid');
    const diff = Math.abs(received - it.qty) > 1e-9;
    const reason = String(r.reason || '').trim().slice(0, 200);
    if (diff && reason.length < 2) throw new ApiError(422, 'diff_reason_required', `Alasan selisih untuk "${it.description}" wajib diisi`);
    if (diff) hasDiff = true;
    return { description: it.description, sku: it.sku || '', unit: it.unit, sentQty: it.qty, receivedQty: received, reason: diff ? reason : '' };
  });
  const lat = num(input.lat);
  const lng = num(input.lng);
  const acc = num(input.accuracy);
  let dist = null;
  let outside = false;
  if (lat != null && lng != null && stop.lat != null && stop.lng != null) {
    dist = Math.round(haversine(lat, lng, stop.lat, stop.lng));
    outside = dist > Math.max(stop.radiusM || 150, 150) + Math.min(acc || 0, 500);
  }
  return {
    receiver: { name: receiverName.slice(0, 100), title: String(input.receiverTitle || '').trim().slice(0, 100), phone: String(input.receiverPhone || '').trim().slice(0, 40) },
    note: String(input.note || '').trim().slice(0, 500), items, hasDiff, photos, sig, gps: { lat, lng, accuracy: acc }, dist, outside,
    capturedAt: input.capturedAt && !Number.isNaN(Date.parse(input.capturedAt)) ? new Date(input.capturedAt).toISOString() : null,
  };
}

/** SQL atomik: POD + foto + event "selesai bongkar" (+ DO selesai bila stop terakhir). Gagal salah satu = batal semuanya. */
export async function insertPodWithEvent(db, { order, offer, step, steps, pod, stopSeq, stopName, kind = 'delivery' }) {
  const podId = randomUUID();
  const submittedAt = new Date().toISOString();
  const verifyCode = randomBytes(12).toString('base64url');
  const sigSha = sha(pod.sig.buf);
  const payload = hashPayload({ order, stopSeq, stopName, vendorId: offer.vendorId, receiver: pod.receiver, note: pod.note, items: pod.items, gps: pod.gps, submittedAt, sigSha, photoShas: pod.photos.map((p) => p.sha), kind });
  const hash = podHash(payload);
  const isLast = kind === 'delivery' && step.seq === steps.length;
  const rows = await db.query(
    `WITH p AS (INSERT INTO pods (id, order_id, stop_seq, stop_name, vendor_id, receiver_name, receiver_title, receiver_phone, note, items, has_diff, signature, lat, lng, accuracy_m, dist_m, outside, captured_at, submitted_at, verify_code, sig_sha, hash, kind)
                SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, decode($12, 'base64'), $13, $14, $15, $16, $17, $18::timestamptz, $19::timestamptz, $20, $21, $22, $26::text
                WHERE EXISTS (SELECT 1 FROM orders WHERE id = $2 AND status = 'running' AND vendor_id = $5) RETURNING id),
     ph AS (INSERT INTO pod_photos (pod_id, ord, data, sha256, bytes, taken_at)
            SELECT (SELECT id FROM p), x.ord, decode(x.b64, 'base64'), x.sha, x.bytes, x.taken_at
            FROM jsonb_to_recordset($23::jsonb) AS x(ord int, b64 text, sha text, bytes int, taken_at timestamptz) WHERE EXISTS (SELECT 1 FROM p) RETURNING id),
     e AS (INSERT INTO trip_events (order_id, seq, type, stop_seq, lat, lng, accuracy_m, dist_m, outside, note)
           SELECT $2, $24, 'depart', $3, $13, $14, $15, $16, $17, CASE WHEN $26::text = 'pickup' THEN 'POP' ELSE 'POD' END WHERE EXISTS (SELECT 1 FROM p) RETURNING seq),
     b AS (UPDATE orders SET status = 'done', finished_at = now(), version = version + 1, updated_at = now() WHERE id = $2 AND $25::boolean AND EXISTS (SELECT 1 FROM e) RETURNING id)
     SELECT (SELECT count(*) FROM p)::int AS n, (SELECT count(*) FROM ph)::int AS np`,
    [podId, order.id, stopSeq, stopName, offer.vendorId, pod.receiver.name, pod.receiver.title, pod.receiver.phone, pod.note, JSON.stringify(pod.items), pod.hasDiff, pod.sig.b64,
      pod.gps.lat, pod.gps.lng, pod.gps.accuracy, pod.dist, pod.outside, pod.capturedAt, submittedAt, verifyCode, sigSha, hash,
      JSON.stringify(pod.photos.map((p) => ({ ord: p.ord, b64: p.b64, sha: p.sha, bytes: p.bytes, taken_at: p.takenAt }))), step.seq, isLast, kind],
  ).catch((e) => {
    if (e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message)))) throw new ApiError(409, 'out_of_date', 'Status sudah berubah, muat ulang');
    throw e;
  });
  if (Number(rows[0].n) !== 1) throw new ApiError(409, 'trip_closed', 'Perjalanan tidak dapat diubah');
  return { ok: true, podId, verifyCode, hash, outside: pod.outside, distM: pod.dist, finished: isLast };
}

const mapMeta = (r) => ({
  id: r.id, kind: r.kind || 'delivery', orderId: r.order_id, stopSeq: r.stop_seq, stopName: r.stop_name, receiverName: r.receiver_name, receiverTitle: r.receiver_title, receiverPhone: r.receiver_phone,
  note: r.note, hasDiff: r.has_diff, outside: r.outside, distM: r.dist_m, submittedAt: iso(r.submitted_at), verifyCode: r.verify_code, hash: r.hash,
  photos: Number(r.photos ?? 0), amendments: Number(r.amendments ?? 0), purged: !!r.purged_at,
});

export async function listPods(db, orderId) {
  const rows = await db.query(
    `SELECT p.*, (SELECT count(*) FROM pod_photos f WHERE f.pod_id = p.id)::int AS photos, (SELECT count(*) FROM pod_amendments a WHERE a.pod_id = p.id)::int AS amendments
     FROM pods p WHERE p.order_id = $1 ORDER BY p.stop_seq`, [orderId]);
  return rows.map(mapMeta);
}

/** POD lengkap untuk dokumen: foto & tanda tangan (base64), amandemen, dan hasil cek integritas. */
export async function getPod(db, id) {
  const rows = await db.query('SELECT p.*, encode(p.signature, \'base64\') AS sig_b64 FROM pods p WHERE p.id = $1', [id]);
  if (!rows.length) throw new ApiError(404, 'not_found', 'POD tidak ditemukan');
  const p = rows[0];
  const photos = await db.query(`SELECT ord, encode(data, 'base64') AS b64, sha256, bytes, taken_at FROM pod_photos WHERE pod_id = $1 ORDER BY ord`, [id]);
  const am = await db.query('SELECT at, by_user, note FROM pod_amendments WHERE pod_id = $1 ORDER BY id', [id]);
  const order = await getOrder(db, p.order_id);
  let integrity = 'purged';
  if (!p.purged_at) {
    const calc = photos.map((x) => sha(Buffer.from(x.b64, 'base64')));
    const sigOk = !p.signature || sha(Buffer.from(p.sig_b64, 'base64')) === p.sig_sha;
    const payload = hashPayload({
      order, stopSeq: p.stop_seq, stopName: p.stop_name, vendorId: p.vendor_id, receiver: { name: p.receiver_name, title: p.receiver_title, phone: p.receiver_phone }, note: p.note,
      items: typeof p.items === 'string' ? JSON.parse(p.items) : p.items, gps: { lat: p.lat, lng: p.lng, accuracy: p.accuracy_m }, submittedAt: iso(p.submitted_at), sigSha: p.sig_sha, photoShas: calc, kind: p.kind,
    });
    integrity = sigOk && podHash(payload) === p.hash && calc.every((h, i) => h === photos[i].sha256) ? 'ok' : 'broken';
  }
  return {
    ...mapMeta({ ...p, photos: photos.length, amendments: am.length }),
    items: typeof p.items === 'string' ? JSON.parse(p.items) : p.items, lat: p.lat, lng: p.lng, accuracyM: p.accuracy_m, capturedAt: p.captured_at ? iso(p.captured_at) : '',
    signature: p.sig_b64 || '', photoData: photos.map((x) => ({ ord: x.ord, b64: x.b64, sha: x.sha256, bytes: x.bytes, takenAt: x.taken_at ? iso(x.taken_at) : '' })),
    amendmentList: am.map((a) => ({ at: iso(a.at), by: a.by_user, note: a.note })), integrity,
    order: { id: order.id, doNo: order.doNo, customer: order.customer, vendorName: order.vendorName, plate: order.plate, driverName: order.driverName },
  };
}

/** Amandemen: catatan tambahan oleh admin. POD asli tidak pernah diubah. */
export async function amendPod(db, podId, note, actor) {
  const n = String(note || '').trim();
  if (n.length < 3) throw new ApiError(422, 'validation', 'Catatan wajib diisi', [{ path: 'note', code: 'required' }]);
  const r = await db.query('INSERT INTO pod_amendments (pod_id, by_user, note) SELECT id, $2, $3 FROM pods WHERE id = $1 RETURNING id', [podId, actor || '', n.slice(0, 500)]);
  if (!r.length) throw new ApiError(404, 'not_found', 'POD tidak ditemukan');
  return { ok: true };
}

/** Verifikasi publik lewat kode QR: hanya data minimum. */
export async function verifyPublic(db, code) {
  const rows = await db.query(
    `SELECT p.kind, p.stop_name, p.receiver_name, p.submitted_at, p.hash, p.has_diff, p.purged_at, o.do_no FROM pods p JOIN orders o ON o.id = p.order_id WHERE p.verify_code = $1`, [String(code || '')]);
  if (!rows.length) throw new ApiError(404, 'not_found', 'Kode tidak ditemukan');
  const r = rows[0];
  return { valid: true, kind: r.kind || 'delivery', doNo: r.do_no, stopName: r.stop_name, receiverName: r.receiver_name, submittedAt: iso(r.submitted_at), hashShort: r.hash.slice(0, 16), hasDiff: r.has_diff, purged: !!r.purged_at };
}

/** Hapus foto & tanda tangan yang melewati retensi (data POD + hash tetap ada). Murah, dipanggil lazy. */
export async function purgeOldPods(db) {
  try {
    await db.query(
      `WITH old AS (SELECT id FROM pods WHERE purged_at IS NULL AND submitted_at < now() - ($1 || ' days')::interval),
       d AS (DELETE FROM pod_photos WHERE pod_id IN (SELECT id FROM old) RETURNING 1)
       UPDATE pods SET purged_at = now(), signature = NULL WHERE id IN (SELECT id FROM old)`, [String(RETENTION_DAYS())]);
  } catch (e) {
    if (!/does not exist/i.test(String(e.message))) console.error('[purge]', e.message);
  }
}

/** Daftar semua POP/POD untuk halaman "Bukti": filter jenis, periode (hari), pencarian DO / customer / lokasi / penerima / vendor. */
export async function listAllPods(db, { kind, q, days = 30, limit = 100 } = {}) {
  const k = kind === 'pickup' || kind === 'delivery' ? kind : null;
  const d = Math.min(Math.max(Number(days) || 30, 1), 3650);
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const term = String(q || '').trim().slice(0, 60);
  const rows = await db.query(
    `SELECT p.*, o.do_no, o.customer, v.name AS vendor_name, vh.plate,
            (SELECT count(*) FROM pod_photos f WHERE f.pod_id = p.id)::int AS photos, (SELECT count(*) FROM pod_amendments a WHERE a.pod_id = p.id)::int AS amendments
       FROM pods p JOIN orders o ON o.id = p.order_id LEFT JOIN vendors v ON v.id = p.vendor_id LEFT JOIN vehicles vh ON vh.id = o.vehicle_id
      WHERE p.submitted_at > now() - ($1 || ' days')::interval AND ($2::text IS NULL OR p.kind = $2::text)
        AND ($3 = '' OR o.do_no ILIKE '%' || $3 || '%' OR o.customer ILIKE '%' || $3 || '%' OR p.stop_name ILIKE '%' || $3 || '%' OR p.receiver_name ILIKE '%' || $3 || '%' OR v.name ILIKE '%' || $3 || '%' OR vh.plate ILIKE '%' || $3 || '%')
      ORDER BY p.submitted_at DESC LIMIT $4`, [String(d), k, term.replace(/[%_\\]/g, ' '), lim]);
  return rows.map((r) => ({ ...mapMeta(r), doNo: r.do_no, customer: r.customer, vendorName: r.vendor_name || '', plate: r.plate || '' }));
}
