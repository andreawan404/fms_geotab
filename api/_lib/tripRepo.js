// Portal vendor: lihat penawaran, terima / tolak, dan update perjalanan lewat tautan (token) tanpa login.
import { ApiError } from './errors.js';
import { getOfferByToken, acceptOffer, rejectOffer, createMaster, listMaster } from './dispatchRepo.js';
import { getOrder } from './ordersRepo.js';
import { normalizeOrder, totals } from '../../src/core/orders.js';
import { vehicleFit } from '../../src/core/capacity.js';
import { buildSteps } from '../../src/core/trip.js';
import { haversine } from '../../src/core/geometry.js';
import { insertVendorIssue } from './insightsRepo.js';
import { insertPodWithEvent, preparePod, purgeOldPods, listPods } from './podRepo.js';

const iso = (v) => (v == null ? '' : v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/** Data DO yang boleh dilihat vendor. */
const pubOrder = (o) => ({
  doNo: o.doNo, customer: o.customer, orderDate: o.orderDate, priority: o.priority, notes: o.notes, summary: o.summary, status: o.status,
  stops: o.stops.map((s) => ({ id: s.id, type: s.type, name: s.name, address: s.address, lat: s.lat, lng: s.lng, radiusM: s.radiusM, windowStart: s.windowStart, windowEnd: s.windowEnd, contactName: s.contactName, contactPhone: s.contactPhone, instructions: s.instructions, items: s.items })),
});

const mapEvent = (r) => ({ seq: r.seq, type: r.type, stopSeq: r.stop_seq, at: iso(r.at), lat: r.lat, lng: r.lng, accuracyM: r.accuracy_m, distM: r.dist_m, outside: r.outside, note: r.note, source: r.source });

export async function tripEvents(db, orderId) {
  return (await db.query('SELECT * FROM trip_events WHERE order_id = $1 ORDER BY seq', [orderId])).map(mapEvent);
}

async function ctxByToken(db, token) {
  const offer = await getOfferByToken(db, token);
  if (!offer) throw new ApiError(404, 'not_found', 'Tautan tidak ditemukan');
  const order = await getOrder(db, offer.orderId);
  if (!order) throw new ApiError(404, 'not_found', 'Tautan tidak ditemukan');
  return { offer, order };
}

const tripOpen = (offer, order) => offer.status === 'accepted' && order.vendorId === offer.vendorId && ['assigned', 'running', 'done'].includes(order.status);

export async function portalView(db, token) {
  const { offer, order } = await ctxByToken(db, token);
  const base = { offer: { status: offer.status, expiresAt: offer.expiresAt, vendorName: offer.vendorName, rejectReason: offer.rejectReason }, order: pubOrder(order) };
  if (offer.status === 'offered') {
    const need = totals(normalizeOrder(order));
    const vehicles = (await listMaster(db, 'vehicles', { vendorId: offer.vendorId })).map((v) => ({ id: v.id, plate: v.plate, type: v.type, hasGps: v.hasGps, maxWeightKg: v.maxWeightKg, maxVolumeM3: v.maxVolumeM3, maxPallets: v.maxPallets, fit: vehicleFit(v, need) }));
    const drivers = (await listMaster(db, 'drivers', { vendorId: offer.vendorId })).map((d) => ({ id: d.id, name: d.name, phone: d.phone }));
    return { mode: 'offer', ...base, vehicles, drivers };
  }
  if (tripOpen(offer, order)) {
    const [events, veh, drv] = await Promise.all([
      tripEvents(db, order.id),
      db.query('SELECT plate, type FROM vehicles WHERE id = $1', [order.vehicleId]),
      order.driverId ? db.query('SELECT name, phone FROM drivers WHERE id = $1', [order.driverId]) : [],
    ]);
    const steps = buildSteps(order.stops);
    const pods = await listPods(db, order.id);
    return { mode: 'trip', ...base, vehicle: veh[0] || null, driver: drv[0] || null, steps, events, next: steps[events.length] || null, finished: order.status === 'done', pods: pods.map((p) => ({ kind: p.kind, stopSeq: p.stopSeq, receiverName: p.receiverName, submittedAt: p.submittedAt, hasDiff: p.hasDiff, verifyCode: p.verifyCode })) };
  }
  return { mode: 'closed', ...base, reason: offer.status === 'accepted' ? 'released' : offer.status };
}

export async function portalAccept(db, token, { vehicleId, driverId, newDriver }) {
  const { offer, order } = await ctxByToken(db, token);
  if (offer.status !== 'offered') throw new ApiError(409, 'offer_closed', 'Penawaran sudah ditutup', { status: offer.status });
  const vehicles = await listMaster(db, 'vehicles', { vendorId: offer.vendorId });
  const v = vehicles.find((x) => x.id === vehicleId);
  if (!v) throw new ApiError(422, 'vehicle_invalid', 'Pilih kendaraan Anda');
  const fit = vehicleFit(v, totals(normalizeOrder(order)));
  if (!fit.ok) throw new ApiError(422, 'vehicle_not_fit', 'Kendaraan tidak sesuai kapasitas muatan', fit.reasons);
  let did = driverId || null;
  if (!did && newDriver && String(newDriver.name || '').trim()) {
    did = (await createMaster(db, 'drivers', { vendorId: offer.vendorId, name: newDriver.name, phone: newDriver.phone || '' }, `portal:${offer.vendorName}`)).item.id;
  }
  if (!did) throw new ApiError(422, 'driver_required', 'Pilih atau isi nama driver');
  return acceptOffer(db, token, { vehicleId, driverId: did });
}

export async function portalReject(db, token, reason) {
  const r = String(reason || '').trim();
  if (r.length < 3) throw new ApiError(422, 'reason_required', 'Alasan penolakan wajib diisi');
  return rejectOffer(db, token, r);
}

/** Catat langkah perjalanan berikutnya. Urutan dipaksa server; `seq` mencegah klik ganda / data basi. */
export async function portalEvent(db, token, { seq, lat, lng, accuracy, note }) {
  const { offer, order } = await ctxByToken(db, token);
  if (!tripOpen(offer, order) || order.status === 'done') throw new ApiError(409, 'trip_closed', 'Perjalanan tidak dapat diubah');
  const steps = buildSteps(order.stops);
  const count = Number((await db.query('SELECT count(*)::int AS n FROM trip_events WHERE order_id = $1', [order.id]))[0].n);
  const step = steps[count];
  if (!step) throw new ApiError(409, 'trip_closed', 'Perjalanan sudah selesai');
  if (Number(seq) !== step.seq) throw new ApiError(409, 'out_of_date', 'Status sudah berubah, muat ulang', { next: step.seq });
  if (step.type === 'depart') throw new ApiError(422, 'pod_required', 'Selesai muat / bongkar harus lewat POP / POD');
  const la = Number.isFinite(Number(lat)) && lat !== null && lat !== '' ? Number(lat) : null;
  const ln = Number.isFinite(Number(lng)) && lng !== null && lng !== '' ? Number(lng) : null;
  const acc = Number.isFinite(Number(accuracy)) && accuracy !== null && accuracy !== '' ? Number(accuracy) : null;
  const stop = step.stopIdx >= 0 ? order.stops[step.stopIdx] : null;
  let dist = null;
  let outside = false;
  if (stop && la != null && ln != null && stop.lat != null && stop.lng != null) {
    dist = Math.round(haversine(la, ln, stop.lat, stop.lng));
    outside = dist > Math.max(stop.radiusM || 150, 150) + Math.min(acc || 0, 500);
  }
  const isFirst = step.seq === 1;
  const isLast = step.seq === steps.length;
  const rows = await db.query(
    `WITH e AS (INSERT INTO trip_events (order_id, seq, type, stop_seq, lat, lng, accuracy_m, dist_m, outside, note)
                SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10 WHERE EXISTS (SELECT 1 FROM orders WHERE id = $1 AND status IN ('assigned', 'running') AND vendor_id = $11) RETURNING seq),
     a AS (UPDATE orders SET status = 'running', started_at = now(), version = version + 1, updated_at = now() WHERE id = $1 AND $12::boolean AND EXISTS (SELECT 1 FROM e) RETURNING id),
     b AS (UPDATE orders SET status = 'done', finished_at = now(), version = version + 1, updated_at = now() WHERE id = $1 AND $13::boolean AND EXISTS (SELECT 1 FROM e) RETURNING id)
     SELECT (SELECT count(*) FROM e)::int AS n`,
    [order.id, step.seq, step.type, stop ? step.stopIdx + 1 : null, la, ln, acc, dist, outside, String(note || '').slice(0, 300), offer.vendorId, isFirst, isLast],
  ).catch((e) => {
    if (e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message)))) throw new ApiError(409, 'out_of_date', 'Status sudah berubah, muat ulang');
    throw e;
  });
  if (Number(rows[0].n) !== 1) throw new ApiError(409, 'trip_closed', 'Perjalanan tidak dapat diubah');
  return { ok: true, outside, distM: dist, finished: isLast };
}

/** Kirim POD di langkah "selesai bongkar" sekaligus mencatat event keberangkatan (atomik). */
export async function portalPod(db, token, input) {
  const { offer, order } = await ctxByToken(db, token);
  if (!tripOpen(offer, order) || order.status !== 'running') throw new ApiError(409, 'trip_closed', 'Perjalanan tidak dapat diubah');
  const steps = buildSteps(order.stops);
  const count = Number((await db.query('SELECT count(*)::int AS n FROM trip_events WHERE order_id = $1', [order.id]))[0].n);
  const step = steps[count];
  if (!step) throw new ApiError(409, 'trip_closed', 'Perjalanan sudah selesai');
  if (Number(input.seq) !== step.seq) throw new ApiError(409, 'out_of_date', 'Status sudah berubah, muat ulang', { next: step.seq });
  if (step.type !== 'depart') throw new ApiError(409, 'out_of_date', 'POD belum waktunya, muat ulang', { next: step.seq });
  const stop = order.stops[step.stopIdx];
  const pod = preparePod(stop, step.stopIdx + 1, input);
  const r = await insertPodWithEvent(db, { order, offer, step, steps, pod, stopSeq: step.stopIdx + 1, stopName: stop.name, kind: step.stopType === 'pickup' ? 'pickup' : 'delivery' });
  purgeOldPods(db);
  return r;
}

/** Vendor melaporkan kendala (mogok, macet, toko tutup, gagal kirim, dll.) -> muncul di Exception admin. */
export async function portalIssue(db, token, input) {
  const { offer, order } = await ctxByToken(db, token);
  if (!tripOpen(offer, order) || !['assigned', 'running'].includes(order.status)) throw new ApiError(409, 'trip_closed', 'Perjalanan tidak dapat diubah');
  return insertVendorIssue(db, { order, kind: String(input.kind || ''), note: input.note, lat: input.lat, lng: input.lng });
}
