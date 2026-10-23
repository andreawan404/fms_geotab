// Menautkan DO dari TMS customer ke MyGeotab: plat -> kendaraan, stop -> rute (koridor + checkpoint), jadwal -> penugasan.
// Berjalan di browser admin (rute & penugasan disimpan di Geotab AddInData, sama seperti buatan manual).
import { asgIdOf, matchDevice, planWindow, routeIdOf } from '../core/linkPlan.js';
import { computePath, sameStops, saveOrderRoute } from './orderRoute.js';
import { findRoutes } from './routing.js';

const MAX_PER_RUN = 4;
const failures = new Map(); // orderId -> { n, until } supaya DO bermasalah tidak dicoba terus-menerus

/**
 * @returns {{ linked: object[], unmatched: object[], closed: number, errors: string[], pending: number }}
 */
export async function runAutoLink({ api, devices, data, saveRoute, saveAssignment, nowMs = Date.now(), route = findRoutes }) {
  const info = await api.integration.linkInfo();
  const out = { linked: [], unmatched: [], closed: 0, errors: [], pending: info.pending.length, linkedActive: info.linkedActive };
  let routed = 0;
  for (const o of info.pending) {
    const m = o.deviceId ? (devices.find((d) => d.id === o.deviceId) ? { device: devices.find((d) => d.id === o.deviceId) } : { reason: 'no_device' }) : matchDevice(o.plate, devices, info.aliases);
    const stops = o.stops.filter((s) => s.lat != null && s.lng != null);
    if (!m.device) { out.unmatched.push({ orderId: o.id, doNo: o.doNo, plate: o.plate, reason: m.reason }); continue; }
    if (stops.length < 2) { out.unmatched.push({ orderId: o.id, doNo: o.doNo, plate: o.plate, reason: 'no_coords' }); continue; }
    const f = failures.get(o.id);
    if (f && f.until > nowMs) { out.errors.push(`${o.doNo}: ${f.msg}`); continue; }
    if (routed >= MAX_PER_RUN) continue;
    routed++;
    try {
      const order = { id: o.id, doNo: o.doNo, stops };
      // rute dibuat saat DO disimpan (menu Rute); dipakai ulang bila titik stop tidak berubah, jalur manual tidak ditimpa
      const existing = data.routes.find((x) => x.id === routeIdOf(o.id));
      let savedRoute = existing;
      if (!existing || !sameStops(existing, stops)) {
        const calc = await computePath(data.settings, stops, route);
        savedRoute = await saveOrderRoute({ order, stops, calc, settings: data.settings, widthM: o.corridorM, existing, saveRoute, colorIdx: data.routes.length + out.linked.length });
      }
      const w = planWindow(stops, { nowMs, etaS: savedRoute.durationS });
      const asgId = asgIdOf(o.id);
      const exAsg = data.assignments.find((x) => x.id === asgId);
      await saveAssignment({ ...(exAsg || {}), id: asgId, routeId: savedRoute.id, deviceId: m.device.id, driverId: null, date: w.date, startTime: w.startTime, endTime: w.endTime, active: true, note: `DO ${o.doNo} · ${o.customer}`, source: 'integration', orderId: o.id });
      await api.integration.link({ orderId: o.id, routeId: savedRoute.id, asgId, deviceId: m.device.id });
      out.linked.push({ orderId: o.id, doNo: o.doNo, plate: o.plate, deviceName: m.device.name });
      failures.delete(o.id);
    } catch (e) {
      const n = (f?.n || 0) + 1;
      const msg = String(e.message || e).slice(0, 120);
      failures.set(o.id, { n, msg, until: nowMs + Math.min(30, 2 ** n) * 60000 });
      out.errors.push(`${o.doNo}: ${msg}`);
    }
  }
  for (const c of info.toClose) {
    try {
      const a = data.assignments.find((x) => x.id === c.asgId);
      if (a && a.active !== false) await saveAssignment({ ...a, active: false });
      await api.integration.linkClosed(c.orderId);
      out.closed++;
    } catch (e) {
      out.errors.push(String(e.message || e).slice(0, 120));
    }
  }
  return out;
}
