// Penyimpanan data add-in di Geotab AddInData: rute, penugasan, setting, log alert.
// Batas details per record ±10.000 karakter -> geometri rute dipecah ke beberapa record "rg".
import { decodePolyline, encodePolyline, chunkString } from '../core/polyline.js';
import { ymd } from '../core/time.js';

const CHUNK = 7000;
const MAX_DETAILS = 9500;

export const DEFAULT_SETTINGS = {
  routing: { provider: 'osrm', orsKey: '', osrmUrl: 'https://router.project-osrm.org', profile: 'driving-car', country: 'ID' },
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  pollSec: 15,
  alertRetentionDays: 90, // riwayat alert lebih lama dari ini dibersihkan otomatis
  idleWarnPct: 20, // Idle % >= batas ini disorot merah di Laporan
  sensors: { engineHours: ['DiagnosticEngineHoursId'], fuel: ['DiagnosticDeviceTotalFuelId', 'DiagnosticTotalFuelUsedId'] },
  cost: { fuelPriceRp: 0, tollBaseRpPerKm: 1000, tollRatio: [1, 1.5, 1.5, 2, 2] }, // perkiraan biaya: harga BBM (Rp/L), tarif tol dasar golongan I (Rp/km) dan rasio golongan I-V
  units: { fuelEcon: 'kmpl' }, // 'kmpl' (km/L) atau 'l100' (L/100 km)
  defaults: { widthM: 60, avgSpeedKmh: 40, radius: 100, confirmSec: 30, confirmMeters: 150, gpsMarginM: 10, recoverSec: 15, graceMin: 15, lateStartMin: 10 },
};

export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---- log alert: satu rekaman per (hari, sesi, bagian) berisi banyak kejadian ringkas ----
const ALOG_LIMIT = 7500; // karakter JSON per rekaman (batas AddInData ±10.000)
export const compactEvent = (e) => ({ i: e.id, y: e.type, a: e.at, t: e.t, d: e.deviceId, r: e.routeId, k: e.instKey, c: e.cpName, m: e.min, x: e.distM == null ? undefined : Math.round(e.distM), la: e.lat, lo: e.lng });
export const expandEvent = (c) => ({ id: c.i, type: c.y, at: c.a, t: c.t, deviceId: c.d, routeId: c.r, instKey: c.k, cpName: c.c, min: c.m, distM: c.x, lat: c.la, lng: c.lo, persisted: true });

const clone = (o) => JSON.parse(JSON.stringify(o));
function merge(base, over) {
  const out = clone(base);
  for (const k of Object.keys(over || {})) {
    out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && out[k] ? merge(out[k], over[k]) : over[k];
  }
  return out;
}

export function createStore(geotab, addInId) {
  const rec = new Map(); // geotab record id -> details
  const session = uid('s'); // pembeda log milik sesi ini
  const cur = new Map(); // hari -> { rid, part, ev } rekaman log yang sedang diisi sesi ini
  let chain = Promise.resolve();

  async function put(details, existingId) {
    const size = JSON.stringify(details).length;
    if (size > MAX_DETAILS) throw new Error(`Record terlalu besar (${size} karakter). Kurangi jumlah checkpoint / panjang nama.`);
    if (existingId) {
      await geotab.setAddInData(existingId, addInId, details);
      rec.set(existingId, details);
      return existingId;
    }
    const id = await geotab.addAddInData(addInId, details);
    rec.set(id, details);
    return id;
  }
  async function del(id) {
    if (!id) return;
    await geotab.removeAddInData(id);
    rec.delete(id);
  }

  return {
    async load() {
      const rows = await geotab.listAddInData(addInId);
      rec.clear();
      const settingsRows = [];
      const routeRows = [];
      const chunks = {};
      const assignments = [];
      const alertLog = new Map(); // id -> kejadian (gabungan rekaman alog + alert lama)
      const acks = new Map();
      const oldRids = []; // untuk pembersihan retensi: [{rid, ts}]
      for (const r of rows) {
        const d = r.details;
        if (!d || !d.t) continue;
        rec.set(r.id, d);
        if (d.t === 'settings') settingsRows.push({ rid: r.id, d });
        else if (d.t === 'route') routeRows.push({ rid: r.id, d });
        else if (d.t === 'rg') (chunks[d.routeId] ||= []).push({ rid: r.id, d });
        else if (d.t === 'asg') assignments.push({ ...d, _rid: r.id });
        else if (d.t === 'alert') {
          // format lama (satu rekaman per alert keluar-rute)
          const ev = { id: d.key, type: d.type || 'deviation_start', cpName: d.cpName, min: d.min, t: d.startMs, at: d.ts, deviceId: d.deviceId, routeId: d.routeId, instKey: d.instKey, distM: d.distM, lat: d.lat, lng: d.lng, persisted: true };
          if (!alertLog.has(ev.id)) alertLog.set(ev.id, ev);
          oldRids.push({ rid: r.id, ts: d.ts || 0 });
        } else if (d.t === 'alog') {
          let maxAt = 0;
          for (const c of d.ev || []) {
            const ev = expandEvent(c);
            if (!alertLog.has(ev.id)) alertLog.set(ev.id, ev);
            if (ev.at > maxAt) maxAt = ev.at;
          }
          oldRids.push({ rid: r.id, ts: maxAt });
        } else if (d.t === 'ack') {
          acks.set(d.id, { id: d.id, by: d.by, at: d.at, note: d.note || '', _rid: r.id });
          oldRids.push({ rid: r.id, ts: d.at || 0 });
        }
      }
      const settings = merge(DEFAULT_SETTINGS, settingsRows[0]?.d.v || {});
      const routes = routeRows.map(({ rid, d }) => {
        const list = (chunks[d.id] || []).sort((a, b) => a.d.i - b.d.i);
        const path = decodePolyline(list.map((c) => c.d.s).join(''));
        const { t, ...route } = d;
        return {
          ...route,
          path,
          manualPath: d.manual ? decodePolyline(d.manual) : [],
          _rid: rid,
          _chunks: list.map((c) => c.rid),
        };
      });
      const alerts = [...alertLog.values()].sort((a, b) => b.at - a.at);
      return { settings, routes, assignments, alerts, acks, oldRids, settingsRid: settingsRows[0]?.rid || null };
    },

    async saveSettings(settings, rid) {
      return put({ t: 'settings', v: settings }, rid);
    },

    async saveRoute(route) {
      const geom = encodePolyline(route.path || []);
      const parts = chunkString(geom, CHUNK);
      const chunkIds = [...(route._chunks || [])];
      for (let i = 0; i < parts.length; i++) {
        const d = { t: 'rg', routeId: route.id, i, s: parts[i] };
        chunkIds[i] = await put(d, chunkIds[i]);
      }
      for (let i = chunkIds.length - 1; i >= parts.length; i--) {
        await del(chunkIds[i]);
        chunkIds.pop();
      }
      const { path, manualPath, _rid, _chunks, ...meta } = route;
      const details = { t: 'route', ...meta, manual: manualPath?.length ? encodePolyline(manualPath) : '', updatedAt: Date.now() };
      const rid = await put(details, _rid);
      return { ...route, _rid: rid, _chunks: chunkIds };
    },

    async deleteRoute(route) {
      for (const c of route._chunks || []) await del(c);
      await del(route._rid);
    },

    async saveAssignment(a) {
      const { _rid, ...rest } = a;
      const rid = await put({ t: 'asg', ...rest }, _rid);
      return { ...a, _rid: rid };
    },
    async deleteAssignment(a) {
      await del(a._rid);
    },

    /** Menyimpan kejadian baru ke log harian milik sesi ini (serial, tidak saling menimpa antar sesi/pengguna). */
    appendAlerts(events) {
      chain = chain.then(async () => {
        const touched = new Set();
        for (const e of events) {
          const day = ymd(new Date(e.at));
          let c = cur.get(day);
          if (!c) c = { rid: null, part: 0, ev: [] };
          const next = [...c.ev, compactEvent(e)];
          if (JSON.stringify({ t: 'alog', day, s: session, p: c.part, ev: next }).length > ALOG_LIMIT && c.ev.length) {
            // bagian ini penuh -> tulis dulu, lalu mulai bagian baru
            await put({ t: 'alog', day, s: session, p: c.part, ev: c.ev }, c.rid);
            c = { rid: null, part: c.part + 1, ev: [compactEvent(e)] };
          } else c.ev = next;
          cur.set(day, c);
          touched.add(day);
        }
        for (const day of touched) {
          const c = cur.get(day);
          c.rid = await put({ t: 'alog', day, s: session, p: c.part, ev: c.ev }, c.rid);
        }
      });
      chain = chain.catch(() => {}); // satu kegagalan tidak boleh memutus antrean berikutnya
      return chain;
    },

    /** Tandai alert ditangani (atau perbarui catatannya). */
    async saveAck({ id, by, at, note, _rid }) {
      const rid = await put({ t: 'ack', id, by, at, note: note || '' }, _rid);
      return { id, by, at, note: note || '', _rid: rid };
    },
    async deleteAck(ack) {
      await del(ack._rid);
    },

    /** Hapus rekaman riwayat lebih lama dari batas retensi (maks. `limit` per panggilan). */
    async cleanup(oldRids, retentionDays, limit = 150) {
      const cutoff = Date.now() - retentionDays * 864e5;
      const victims = oldRids.filter((r) => r.ts && r.ts < cutoff).slice(0, limit);
      for (const v of victims) await del(v.rid).catch(() => {});
      return victims.length;
    },
  };
}
