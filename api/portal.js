// Portal vendor (tanpa login, otentikasi = token di tautan email).
// GET /api/portal?t=TOKEN  |  POST /api/portal {t, action: 'accept'|'reject'|'event', ...}
import { route } from './_lib/http.js';
import { ApiError } from './_lib/errors.js';
import { portalAccept, portalEvent, portalIssue, portalPod, portalReject, portalView } from './_lib/tripRepo.js';
import { verifyPublic } from './_lib/podRepo.js';

const tok = (v) => {
  const t = String(v || '');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) throw new ApiError(404, 'not_found', 'Tautan tidak ditemukan');
  return t;
};

export default route({
  GET: ({ db, query }) => (query.v ? verifyPublic(db, String(query.v).slice(0, 40)) : portalView(db, tok(query.t))),
  POST: ({ db, body }) => {
    const t = tok(body.t);
    if (body.action === 'accept') return portalAccept(db, t, body);
    if (body.action === 'reject') return portalReject(db, t, body.reason);
    if (body.action === 'event') return portalEvent(db, t, body);
    if (body.action === 'issue') return portalIssue(db, t, body);
    if (body.action === 'pod') return portalPod(db, t, body);
    throw new ApiError(400, 'bad_action', 'Aksi tidak dikenal');
  },
}, { auth: false, schema: true });
