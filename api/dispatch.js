// GET /api/dispatch?orderId=  -> penawaran DO + status email
// POST /api/dispatch {orderId, action:'offer'|'assign'|'release', ...}
import { route } from './_lib/http.js';
import { ApiError } from './_lib/errors.js';
import { assignDirect, createOffers, listOffers, logEmail, releaseOrder } from './_lib/dispatchRepo.js';
import { getOrder } from './_lib/ordersRepo.js';
import { dispatchBlockers, normalizeOrder } from '../src/core/orders.js';
import { tripEvents } from './_lib/tripRepo.js';
import { buildSteps } from '../src/core/trip.js';
import { amendPod, listPods } from './_lib/podRepo.js';
import { mailConfig, offerEmail, sendEmail } from './_lib/mailer.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oid = (v) => {
  if (!UUID.test(String(v || ''))) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  return String(v);
};

export default route({
  GET: async ({ db, query }) => {
    const id = oid(query.orderId);
    const offers = await listOffers(db, id);
    const order = await getOrder(db, id);
    const events = await tripEvents(db, id);
    return { offers, pods: await listPods(db, id), trip: { events, steps: order ? buildSteps(order.stops) : [] }, mail: { configured: mailConfig().configured, from: mailConfig().from } };
  },
  POST: async ({ db, body, user }) => {
    if (body.action === 'pod_amend') return amendPod(db, oid(body.podId), body.note, user.userName);
    const orderId = oid(body.orderId);
    const order = await getOrder(db, orderId);
    if (!order) throw new ApiError(404, 'not_found', 'DO tidak ditemukan');
    if (body.action === 'release') return releaseOrder(db, orderId, user.userName);
    const blockers = dispatchBlockers(normalizeOrder(order));
    if (blockers.length) throw new ApiError(422, 'not_ready', 'DO belum lengkap untuk dialokasikan', blockers);
    if (body.action === 'assign') return assignDirect(db, orderId, body, user.userName);
    if (body.action !== 'offer') throw new ApiError(400, 'bad_action', 'Aksi tidak dikenal');
    const r = await createOffers(db, orderId, body, user.userName);
    const emails = [];
    for (const o of r.offers) {
      const addrs = String(o.vendor.email || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (!addrs.length) {
        emails.push({ vendorId: o.vendor.id, vendorName: o.vendor.name, status: 'no_email' });
        continue;
      }
      const mail = offerEmail({ order, vendor: o.vendor, token: o.token, expiresAt: r.expiresAt });
      let status = 'sent';
      let error = '';
      for (const to of addrs) {
        const res = await sendEmail({ to, ...mail });
        await logEmail(db, { orderId, offerId: o.id, to, subject: mail.subject, status: res.status, error: res.error });
        if (res.status !== 'sent') { status = res.status; error = res.error || ''; }
      }
      emails.push({ vendorId: o.vendor.id, vendorName: o.vendor.name, status, error });
    }
    return { ok: true, expiresAt: r.expiresAt, emails, mail: { configured: mailConfig().configured } };
  },
});
