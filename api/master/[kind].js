// /api/master/{vendors|vehicles|drivers}  GET (daftar, ?vendorId=&all=1) POST (buat) PUT ?id= (ubah) DELETE ?id=
import { route } from '../_lib/http.js';
import { createMaster, deleteMaster, listMaster, updateMaster } from '../_lib/dispatchRepo.js';

export default route({
  GET: async ({ db, query }) => ({ items: await listMaster(db, query.kind, { vendorId: query.vendorId, all: query.all === '1' }) }),
  POST: ({ db, query, body, user }) => createMaster(db, query.kind, body, user.userName),
  PUT: ({ db, query, body, user }) => updateMaster(db, query.kind, String(query.id || ''), body, user.userName),
  DELETE: ({ db, query, user }) => deleteMaster(db, query.kind, String(query.id || ''), user.userName),
});
