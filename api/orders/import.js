// POST /api/orders/import { orders: [...] } -> hasil per DO. DO dengan nomor sudah ada dilewati; yang tidak valid dilaporkan.
import { route } from '../_lib/http.js';
import { ApiError } from '../_lib/errors.js';
import { createOrder } from '../_lib/ordersRepo.js';

export default route({
  POST: async ({ db, body, user }) => {
    const list = body.orders;
    if (!Array.isArray(list) || !list.length) throw new ApiError(400, 'orders_required', 'orders kosong');
    if (list.length > 50) throw new ApiError(400, 'too_many', 'Maksimal 50 DO per permintaan');
    const results = [];
    for (const o of list) {
      try {
        const r = await createOrder(db, o, user.userName);
        results.push({ doNo: r.order.doNo, ok: true, id: r.order.id });
      } catch (e) {
        if (e instanceof ApiError) results.push({ doNo: String(o?.doNo || ''), ok: false, code: e.code, details: e.details });
        else throw e;
      }
    }
    return { results, created: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  },
});
