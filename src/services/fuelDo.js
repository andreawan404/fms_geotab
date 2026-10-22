// BBM per DO: jendela perjalanan dari kedatangan GPS pertama sampai terakhir (atau sekarang bila belum selesai).
import { pathLength } from '../core/geometry.js';
import { fuelMetrics } from '../core/deliveryEval.js';

export function tripWindow(o, nowMs = Date.now()) {
  const ts = o.stops.map((s) => (s.arriveAt ? Date.parse(s.arriveAt) : null)).filter((x) => x != null);
  if (!ts.length) return null;
  const from = Math.min(...ts);
  const to = o.arrived === o.total ? Math.max(...ts) : nowMs;
  return to - from >= 5 * 60000 ? { from, to } : null;
}

/** @returns {Promise<{ok:true, fuel:object}|{ok:false, reason:'no_window'|'no_device'|'no_sensor'|'no_dist'}>} */
export async function computeOrderFuel({ geotab, sensorWindows, order, nowMs }) {
  if (!order.deviceId) return { ok: false, reason: 'no_device' };
  const w = tripWindow(order, nowMs);
  if (!w) return { ok: false, reason: 'no_window' };
  const logs = await geotab.getLogs(order.deviceId, w.from, w.to);
  const distKm = pathLength(logs.map((l) => [l.lat, l.lng])) / 1000;
  if (!(distKm >= 1)) return { ok: false, reason: 'no_dist' };
  const sw = await sensorWindows(order.deviceId, [{ from: w.from, to: w.to, distKm }]);
  const it = sw.items[0];
  if (!sw.hasFuel || it.fuelL == null) return { ok: false, reason: 'no_sensor' };
  return { ok: true, fuel: { ...fuelMetrics({ fuelL: it.fuelL, distKm, kg: order.kg }), approx: !!it.approx, fromMs: w.from, toMs: w.to } };
}
