// GET /api/insights?r=exceptions&status=open|handled|cleared|all&kind=&q=   -> daftar exception + hitungan
// GET /api/insights?r=report&from=YYYY-MM-DD&to=YYYY-MM-DD                  -> laporan kinerja
// GET /api/insights?r=notify -> pengaturan notifikasi + status provider + log
// POST /api/insights {action:'notify_save'|'notify_test', ...}
// POST /api/insights {action:'ack'|'unack'|'resolve', id, note}
import { route } from './_lib/http.js';
import { ApiError } from './_lib/errors.js';
import { actException, buildReport, listExceptions } from './_lib/insightsRepo.js';
import { getSettings, providers, recentLog, saveSettings, sendTest } from './_lib/notifyRepo.js';

const D = /^\d{4}-\d{2}-\d{2}$/;
export default route({
  GET: async ({ db, query }) => {
    if (query.r === 'notify') return { settings: await getSettings(db), providers: providers(), log: await recentLog(db) };
    if (query.r === 'report') {
      const to = D.test(String(query.to || '')) ? String(query.to) : new Date().toISOString().slice(0, 10);
      const from = D.test(String(query.from || '')) ? String(query.from) : new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
      if (Date.parse(to) - Date.parse(from) > 92 * 864e5 || Date.parse(from) > Date.parse(to)) throw new ApiError(422, 'range_invalid', 'Rentang tanggal maksimal 92 hari');
      return buildReport(db, { from, to });
    }
    return listExceptions(db, { status: ['open', 'handled', 'cleared', 'all'].includes(query.status) ? query.status : 'open', kind: query.kind, q: query.q });
  },
  POST: async ({ db, body, user }) => {
    if (body.action === 'notify_save') return { settings: await saveSettings(db, body, user.userName) };
    if (body.action === 'notify_test') return sendTest(db);
    return actException(db, body, user.userName);
  },
});
