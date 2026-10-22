// GET /api/orders (daftar + filter), POST /api/orders (buat DO)
import { route } from '../_lib/http.js';
import { createOrder, listOrders } from '../_lib/ordersRepo.js';

export default route({
  GET: ({ db, query }) => listOrders(db, { status: query.status, source: query.source, q: query.q, from: query.from, to: query.to, limit: query.limit, offset: query.offset }),
  POST: ({ db, body, user }) => createOrder(db, body, user.userName),
});
