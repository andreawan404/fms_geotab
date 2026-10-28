// GET /api/dispatch?orderId=  -> penawaran DO + status email
// POST /api/dispatch {orderId, action:'offer'|'assign'|'release', ...}
import { route } from './_lib/http.js';
import { ApiError } from './_lib/errors.js';
import { assignDirect, createOffers, listOffers, logEmail, releaseOrder, reissueLink, saveCalc } from './_lib/dispatchRepo.js';
import { getOrder } from './_lib/ordersRepo.js';
import { dispatchBlockers, normalizeOrder } from '../src/core/orders.js';
import { tripEvents } from './_lib/tripRepo.js';
import { buildSteps } from '../src/core/trip.js';
import { amendPod, listPods } from './_lib/podRepo.js';
import { mailConfig, offerEmail, portalBase, sendEmail } from './_lib/mailer.js';
import { normPhone, sendWhatsApp } from './_lib/notifyRepo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Tautan perjalanan untuk driver + (opsional) kirim lewat WhatsApp ke driver dan email ke vendor eksternal. */
async function tripLink(db, order, token, notify) {
  const link = `${portalBase()}/portal.html#/o/${token}`;
  const out = { link, sent: [] };
  if (!notify) return out;
  const [info] = await db.query(
    `SELECT v.name AS vendor_name, v.email, v.internal, d.name AS driver_name, d.phone FROM orders o JOIN vendors v ON v.id = o.vendor_id LEFT JOIN drivers d ON d.id = o.driver_id WHERE o.id = $1`, [order.id]);
  if (!info) return out;
  if (info.phone) {
    const r = await sendWhatsApp(normPhone(info.phone), `Halo ${info.driver_name || 'driver'}, ada tugas pengiriman DO ${order.doNo} (${order.customer}).\nBuka untuk menjalankan perjalanan dan mengisi POP / POD:\n${link}`);
    out.sent.push({ channel: 'whatsapp', to: info.driver_name || info.phone, status: r.status, error: r.error || '' });
  } else out.sent.push({ channel: 'whatsapp', to: info.driver_name || '-', status: 'no_phone', error: '' });
  const addrs = info.internal ? [] : String(info.email || '').split(',').map((x) => x.trim()).filter(Boolean);
  for (const to of addrs) {
    const subject = `Tugas DO ${order.doNo} - ${order.customer}`;
    const res = await sendEmail({ to, subject, text: `DO ${order.doNo} (${order.customer}) sudah dialokasikan ke ${info.vendor_name}.\nTautan perjalanan driver: ${link}`, html: `<p>DO <b>${order.doNo}</b> (${order.customer}) sudah dialokasikan ke ${info.vendor_name}.</p><p>Tautan perjalanan driver: <a href="${link}">${link}</a></p>` });
    out.sent.push({ channel: 'email', to, status: res.status, error: res.error || '' });
  }
  return out;
}

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
    if (body.action === 'save_calc') return saveCalc(db, orderId, body);
    if (body.action === 'link') {
      const r = await reissueLink(db, orderId, user.userName);
      return { ok: true, ...(await tripLink(db, order, r.token, !!body.notify)) };
    }
    const blockers = dispatchBlockers(normalizeOrder(order));
    if (blockers.length) throw new ApiError(422, 'not_ready', 'DO belum lengkap untuk dialokasikan', blockers);
    if (body.action === 'assign') {
      const r = await assignDirect(db, orderId, body, user.userName);
      return { ok: true, ...(await tripLink(db, order, r.token, !!body.notify)) };
    }
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
