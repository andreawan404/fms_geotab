// GET/PUT/DELETE /api/orders/:id  (PUT membawa `version` untuk deteksi bentrok edit)
import { route } from '../_lib/http.js';
import { ApiError } from '../_lib/errors.js';
import { deleteOrder, getOrder, updateOrder } from '../_lib/ordersRepo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (q) => {
  const id = String(q.id || '');
  if (!UUID.test(id)) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  return id;
};

export default route({
  GET: async ({ db, query }) => {
    const o = await getOrder(db, idOf(query));
    if (!o) throw new ApiError(404, 'not_found', 'DO tidak ditemukan');
    return { order: o };
  },
  PUT: ({ db, query, body, user }) => {
    const { version, ...order } = body;
    if (!Number.isInteger(version)) throw new ApiError(400, 'version_required', 'version diperlukan');
    return updateOrder(db, idOf(query), order, version, user.userName);
  },
  DELETE: ({ db, query, user }) => deleteOrder(db, idOf(query), user.userName),
});
