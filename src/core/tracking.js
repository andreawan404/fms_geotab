// Mesin pelacakan rute: deteksi keluar-koridor (dengan debounce), status checkpoint, kepatuhan.
// Fungsi murni — dipakai oleh UI sekarang dan bisa dipakai backend (fase C) tanpa perubahan.
import { haversine, RouteIndex } from './geometry.js';

export const DEFAULT_PARAMS = {
  gpsMarginM: 10, // toleransi drift GPS di luar setengah lebar koridor
  confirmSec: 30, // keluar koridor selama >= N detik -> dikonfirmasi sebagai deviasi
  confirmMeters: 150, // ATAU bergerak >= N meter di luar koridor
  recoverSec: 15, // kembali ke koridor selama >= N detik -> deviasi ditutup
  graceMin: 15, // setelah jadwal mulai, belum "di rute" selama N menit tidak dianggap deviasi
  preStartMin: 30, // titik awal sudah dideteksi sejak N menit sebelum jadwal mulai (deviasi tetap baru dinilai setelah jadwal mulai)
};

export class RouteRun {
  /**
   * @param route  { path:[[lat,lng]], widthM, checkpoints:[{id,name,lat,lng,radius,etaOffsetS}], params? }
   * @param window { startMs, endMs } jendela jadwal; titik di luar jendela diabaikan
   */
  constructor(route, window = {}, params = {}) {
    this.route = route;
    this.params = { ...DEFAULT_PARAMS, ...(route.params || {}), ...params };
    this.startMs = window.startMs ?? -Infinity;
    this.endMs = window.endMs ?? Infinity;
    this.idx = new RouteIndex(route.path || []);
    this.halfWidth = (route.widthM || 50) / 2;
    // posisi tiap checkpoint sepanjang rute dihitung berurutan, supaya checkpoint akhir yang
    // berlokasi sama dengan awal (rute pulang-pergi) tidak dianggap berada di awal rute
    let fromSeg = 0;
    this.cps = (route.checkpoints || []).map((c) => {
      const near = this.idx.nearest(c.lat, c.lng, { fromSeg });
      fromSeg = near.t > 0.999 ? Math.min(near.seg + 1, Math.max(0, this.idx.n - 2)) : near.seg;
      return {
        id: c.id,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        radius: c.radius || 100,
        etaOffsetS: c.etaOffsetS || 0,
        along: near.along,
        arrivedMs: null,
        departedMs: null,
        dwellSec: 0,
        skipped: false,
      };
    });
    this.next = 0;
    this.curCp = -1;
    this.dev = null;
    this.deviations = [];
    this.last = null;
    this.armed = false;
    this.finished = false;
    this.finishedMs = null;
    this.hint = -1;
    this.pointCount = 0;
    this.totalDistM = 0;
    this.trackedDistM = 0;
    this.outsideDistM = 0;
    this.outsideSec = 0;
    this.maxDistM = 0;
    this.cur = null;
    this.prevOutside = false;
  }

  push(p) {
    const ev = [];
    const preMs = (this.params.preStartMin || 0) * 60000;
    if (p.t < this.startMs - preMs || p.t > this.endMs) return ev;
    const live = p.t >= this.startMs; // sebelum jadwal mulai hanya dicek kedatangan di titik awal
    if (this.last && p.t <= this.last.t) return ev;

    const n = this.idx.nearest(p.lat, p.lng, { hint: this.hint });
    this.hint = n.seg;
    const dist = n.dist;
    const inside = dist <= this.halfWidth + this.params.gpsMarginM;
    const step = this.last ? haversine(this.last.lat, this.last.lng, p.lat, p.lng) : 0;
    const dt = this.last ? (p.t - this.last.t) / 1000 : 0;
    this.pointCount++;
    if (live) this.totalDistM += step;
    this.cur = { t: p.t, lat: p.lat, lng: p.lng, speed: p.speed, distM: dist, inside, along: n.along };

    // 1) arming: deviasi hanya dinilai setelah kendaraan "bergabung" ke rute atau masa tenggang habis
    if (live && !this.armed) {
      const graceMs = this.params.graceMin * 60000;
      if (inside || !Number.isFinite(this.startMs) || p.t - this.startMs >= graceMs) this.armed = true;
    }

    // 2) deviasi
    if (live && this.armed && !this.finished) {
      this.trackedDistM += step;
      if (dist > this.maxDistM) this.maxDistM = dist;
      if (!inside) {
        this.outsideDistM += step;
        this.outsideSec += dt;
        if (!this.dev) {
          this.dev = { startMs: p.t, lat: p.lat, lng: p.lng, maxDistM: dist, travelM: 0, confirmed: false, insideSince: null, lastOutMs: p.t };
        }
        const d = this.dev;
        d.insideSince = null;
        d.lastOutMs = p.t;
        if (this.prevOutside) d.travelM += step; // hanya jarak tempuh saat benar-benar di luar koridor
        if (dist > d.maxDistM) d.maxDistM = dist;
        if (!d.confirmed && (p.t - d.startMs >= this.params.confirmSec * 1000 || d.travelM >= this.params.confirmMeters)) {
          d.confirmed = true;
          ev.push({ type: 'deviation_start', t: d.startMs, detectedAt: p.t, distM: dist, lat: p.lat, lng: p.lng });
        }
      } else if (this.dev) {
        const d = this.dev;
        if (d.insideSince == null) d.insideSince = p.t;
        if (p.t - d.insideSince >= this.params.recoverSec * 1000) ev.push(...this._closeDev());
      }
    }

    this.prevOutside = this.armed && !this.finished && !inside;

    // 3) checkpoint
    if (this.curCp >= 0) {
      const c = this.cps[this.curCp];
      if (haversine(p.lat, p.lng, c.lat, c.lng) <= c.radius) {
        c.departedMs = p.t;
        c.dwellSec = (p.t - c.arrivedMs) / 1000;
      } else this.curCp = -1;
    }
    let matched = -1;
    for (let i = this.next; i < (live ? this.cps.length : Math.min(1, this.cps.length)); i++) {
      const c = this.cps[i];
      if (haversine(p.lat, p.lng, c.lat, c.lng) <= c.radius) {
        // loncat ke checkpoint berikutnya hanya sah jika posisi sepanjang rute memang sudah sampai situ
        if (i === this.next || n.along >= c.along - (c.radius + 50)) {
          matched = i;
          break;
        }
      }
    }
    if (matched >= 0) {
      for (let j = this.next; j < matched; j++) {
        this.cps[j].skipped = true;
        ev.push({ type: 'checkpoint_skipped', index: j, name: this.cps[j].name, t: p.t });
      }
      const c = this.cps[matched];
      c.arrivedMs = p.t;
      c.departedMs = p.t;
      c.dwellSec = 0;
      this.next = matched + 1;
      this.curCp = matched;
      ev.push({ type: matched === 0 ? 'start_reached' : 'checkpoint_arrived', index: matched, name: c.name, t: p.t });
      if (matched === this.cps.length - 1 && !this.finished && (live || this.cps.length === 1)) {
        this.finished = true;
        this.finishedMs = p.t;
        ev.push(...this._closeDev());
        ev.push({ type: 'route_completed', t: p.t });
      }
    }

    this.last = { t: p.t, lat: p.lat, lng: p.lng };
    return ev;
  }

  arrivedOnly() {
    return this.cps.filter((c) => c.arrivedMs != null).length === 1;
  }

  _closeDev() {
    const d = this.dev;
    this.dev = null;
    if (!d || !d.confirmed) return [];
    const rec = { startMs: d.startMs, endMs: d.lastOutMs, maxDistM: d.maxDistM, travelM: d.travelM, lat: d.lat, lng: d.lng };
    this.deviations.push(rec);
    return [{ type: 'deviation_end', ...rec }];
  }

  result(nowMs = Date.now()) {
    const deviations = this.deviations.map((d) => ({ ...d, ongoing: false }));
    if (this.dev?.confirmed) {
      deviations.push({ startMs: this.dev.startMs, endMs: this.dev.lastOutMs, maxDistM: this.dev.maxDistM, travelM: this.dev.travelM, lat: this.dev.lat, lng: this.dev.lng, ongoing: true });
    }
    const arrived = this.cps.filter((c) => c.arrivedMs != null).length;
    let compliancePct = null;
    if (this.trackedDistM > 50) compliancePct = Math.max(0, Math.min(100, 100 * (1 - this.outsideDistM / this.trackedDistM)));
    else if (this.pointCount) compliancePct = deviations.length ? 0 : 100;
    const checkpoints = this.cps.map((c) => {
      const plannedMs = Number.isFinite(this.startMs) ? this.startMs + c.etaOffsetS * 1000 : null;
      return {
        id: c.id,
        name: c.name,
        radius: c.radius,
        arrivedMs: c.arrivedMs,
        departedMs: c.departedMs,
        dwellSec: c.dwellSec,
        skipped: c.skipped,
        plannedMs,
        delayMin: c.arrivedMs != null && plannedMs != null ? (c.arrivedMs - plannedMs) / 60000 : null,
      };
    });
    const c0 = this.cps[0];
    const atStartNow = !!(c0 && c0.arrivedMs != null && this.arrivedOnly() && this.last && haversine(this.last.lat, this.last.lng, c0.lat, c0.lng) <= c0.radius);
    // fase kendaraan: to_start (menuju titik awal) | at_start (berada di titik awal) | en_route | finished
    const phase = this.finished ? 'finished' : !c0 || c0.arrivedMs == null ? 'to_start' : atStartNow ? 'at_start' : 'en_route';
    const res = {
      phase,
      startedMs: c0 ? c0.arrivedMs : null,
      finishedMs: this.finishedMs,
      pointCount: this.pointCount,
      totalDistM: this.totalDistM,
      trackedDistM: this.trackedDistM,
      outsideDistM: this.outsideDistM,
      outsideSec: this.outsideSec,
      maxDistM: this.maxDistM,
      compliancePct,
      deviations,
      checkpoints,
      arrivedCount: arrived,
      totalCheckpoints: this.cps.length,
      armed: this.armed,
      finished: this.finished,
      current: this.cur,
      currentlyDeviating: !!this.dev?.confirmed,
    };
    res.status = deriveStatus({ nowMs, startMs: this.startMs, endMs: this.endMs }, res);
    return res;
  }
}

/** planned | in_progress | completed | missed | deviated */
export function deriveStatus({ nowMs, startMs, endMs }, r) {
  const hasDev = r.deviations.length > 0;
  const all = r.totalCheckpoints > 0 && r.arrivedCount >= r.totalCheckpoints;
  if (Number.isFinite(startMs) && nowMs < startMs) return 'planned';
  if (all) return hasDev ? 'deviated' : 'completed';
  if (Number.isFinite(endMs) && nowMs > endMs) return hasDev ? 'deviated' : 'missed';
  if (hasDev) return 'deviated';
  return r.arrivedCount > 0 || r.armed ? 'in_progress' : 'planned';
}

/** Evaluasi satu instance penugasan terhadap log GPS. logs: [{t,lat,lng,speed}] */
export function evaluateInstance({ route, window, logs, nowMs = Date.now(), params }) {
  const run = new RouteRun(route, window, params);
  const sorted = [...logs].sort((a, b) => a.t - b.t);
  const events = [];
  for (const p of sorted) events.push(...run.push(p));
  return { ...run.result(nowMs), events };
}
