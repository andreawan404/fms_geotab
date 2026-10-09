// Monitor penugasan hari ini: mengambil log GPS inkremental, menjalankan RouteRun per instance,
// dan menghasilkan event (alert) baru. Berjalan selama add-in terbuka (opsi A); logika yang sama
// bisa dipindah ke backend untuk alert 24/7 (fase C).
import { RouteRun, DEFAULT_PARAMS } from '../core/tracking.js';
import { instancesBetween } from '../core/schedule.js';
import { engineRoute, routeVersion } from '../lib/engineRoute.js';

export class Monitor {
  constructor() {
    this.runs = new Map();
  }

  reset() {
    this.runs.clear();
  }

  /** @returns {{ results: Map, events: Array }} */
  async tick({ geotab, assignments, routes, settings, nowMs }) {
    const d0 = new Date(nowMs);
    d0.setHours(0, 0, 0, 0);
    const insts = instancesBetween(assignments, d0.getTime(), d0.getTime() + 864e5);
    const routeMap = new Map(routes.map((r) => [r.id, r]));
    const reqs = [];
    const targets = [];
    const results = new Map();

    for (const inst of insts) {
      const route = routeMap.get(inst.routeId);
      if (!route || !route.path || route.path.length < 2) continue;
      const ver = routeVersion(route);
      const preMs = (route.params?.preStartMin ?? DEFAULT_PARAMS.preStartMin) * 60000;
      let st = this.runs.get(inst.key);
      if (!st || st.ver !== ver) {
        st = { run: new RouteRun(engineRoute(route, settings), { startMs: inst.startMs, endMs: inst.endMs }), lastT: inst.startMs - preMs - 1, done: false, ver };
        this.runs.set(inst.key, st);
      }
      if (!st.done && nowMs >= inst.startMs - preMs) {
        reqs.push({ deviceId: inst.deviceId, fromMs: st.lastT + 1, toMs: Math.min(nowMs, inst.endMs) });
        targets.push([inst, st]);
      }
    }

    const logs = await geotab.getLogsMulti(reqs);
    const events = [];
    targets.forEach(([inst, st], i) => {
      for (const p of logs[i]) {
        for (const e of st.run.push(p)) events.push({ ...e, instKey: inst.key, deviceId: inst.deviceId, routeId: inst.routeId, driverId: inst.driverId });
        if (p.t > st.lastT) st.lastT = p.t;
      }
      if (nowMs >= inst.endMs + 5 * 60000) st.done = true;
    });

    for (const inst of insts) {
      const st = this.runs.get(inst.key);
      const route = routeMap.get(inst.routeId);
      if (st && route) results.set(inst.key, { inst, route, result: st.run.result(nowMs) });
    }
    return { results, events };
  }
}
