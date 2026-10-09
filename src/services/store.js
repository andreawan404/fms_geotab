// Penyimpanan data add-in di Geotab AddInData: rute, penugasan, setting, log alert.
// Batas details per record ±10.000 karakter -> geometri rute dipecah ke beberapa record "rg".
import { decodePolyline, encodePolyline, chunkString } from '../core/polyline.js';

const CHUNK = 7000;
const MAX_DETAILS = 9500;

export const DEFAULT_SETTINGS = {
  routing: { provider: 'osrm', orsKey: '', osrmUrl: 'https://router.project-osrm.org', profile: 'driving-car', country: 'ID' },
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  pollSec: 15,
  sensors: { engineHours: ['DiagnosticEngineHoursId'], fuel: ['DiagnosticDeviceTotalFuelId', 'DiagnosticTotalFuelUsedId'] },
  units: { fuelEcon: 'kmpl' }, // 'kmpl' (km/L) atau 'l100' (L/100 km)
  defaults: { widthM: 60, avgSpeedKmh: 40, radius: 100, confirmSec: 30, confirmMeters: 150, gpsMarginM: 10, recoverSec: 15, graceMin: 15 },
};

export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

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
      const alerts = [];
      for (const r of rows) {
        const d = r.details;
        if (!d || !d.t) continue;
        rec.set(r.id, d);
        if (d.t === 'settings') settingsRows.push({ rid: r.id, d });
        else if (d.t === 'route') routeRows.push({ rid: r.id, d });
        else if (d.t === 'rg') (chunks[d.routeId] ||= []).push({ rid: r.id, d });
        else if (d.t === 'asg') assignments.push({ ...d, _rid: r.id });
        else if (d.t === 'alert') alerts.push({ ...d, _rid: r.id });
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
      return { settings, routes, assignments, alerts, settingsRid: settingsRows[0]?.rid || null };
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

    async saveAlert(al) {
      const { _rid, ...rest } = al;
      const rid = await put({ t: 'alert', ...rest }, _rid);
      return { ...al, _rid: rid };
    },
  };
}
