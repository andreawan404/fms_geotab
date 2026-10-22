// Konektor TMS customer + mode aplikasi (admin, otentikasi Geotab).
// GET  /api/connectors                   -> daftar konektor + status enkripsi + mode
// POST /api/connectors {action:'save'|'delete'|'test'|'run'|'set_mode', ...}
import { route } from './_lib/http.js';
import { ApiError } from './_lib/errors.js';
import { deleteConnector, getMode, gpsArrivals, linkClosed, linkInfo, linkOrder, listConnectors, setAlias, runConnector, saveConnector, setMode, testConnector } from './_lib/connectorRepo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v) => { if (!UUID.test(String(v || ''))) throw new ApiError(400, 'bad_id', 'ID tidak valid'); return String(v); };

export default route({
  GET: async ({ db, query }) => (query.r === 'mode' ? { mode: await getMode(db) } : query.r === 'link' ? linkInfo(db) : { ...(await listConnectors(db)), mode: await getMode(db) }),
  POST: async ({ db, body, user }) => {
    switch (body.action) {
      case 'save': return saveConnector(db, { ...body, id: body.id ? id(body.id) : undefined }, user.userName);
      case 'delete': return deleteConnector(db, id(body.id));
      case 'test': return testConnector(db, { ...body, id: body.id ? id(body.id) : undefined });
      case 'run': return runConnector(db, id(body.id));
      case 'link': return linkOrder(db, { ...body, orderId: id(body.orderId) });
      case 'link_closed': return linkClosed(db, id(body.orderId));
      case 'alias': return setAlias(db, body.plate, body.deviceId);
      case 'gps_arrivals': return gpsArrivals(db, body.arrivals);
      case 'set_mode': return setMode(db, body.mode);
      default: throw new ApiError(400, 'bad_action', 'Aksi tidak dikenal');
    }
  },
});
