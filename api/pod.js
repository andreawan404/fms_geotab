// GET /api/pod?id=  (admin) -> POD lengkap (foto, tanda tangan, integritas) untuk dokumen
import { route } from './_lib/http.js';
import { ApiError } from './_lib/errors.js';
import { getPod } from './_lib/podRepo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default route({
  GET: async ({ db, query }) => {
    if (!UUID.test(String(query.id || ''))) throw new ApiError(400, 'bad_id', 'ID tidak valid');
    return { pod: await getPod(db, String(query.id)) };
  },
});
