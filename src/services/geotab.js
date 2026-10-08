// Pembungkus Geotab SDK (api.call / api.multiCall) berbasis Promise + normalisasi entitas.
import { parseSpan } from '../core/time.js';

const toIso = (ms) => new Date(ms).toISOString();
const ms = (s) => (s ? new Date(s).getTime() : null);

export function errMessage(e) {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.name || e.errors?.[0]?.message || JSON.stringify(e).slice(0, 300);
}

export function createGeotab(api) {
  const call = (method, params) => new Promise((resolve, reject) => api.call(method, params, resolve, reject));
  const multiCall = (calls) => new Promise((resolve, reject) => api.multiCall(calls, resolve, reject));

  async function batchedMulti(calls, size = 20) {
    const out = [];
    for (let i = 0; i < calls.length; i += size) out.push(...(await multiCall(calls.slice(i, i + size))));
    return out;
  }

  const normLog = (r) => ({ t: new Date(r.dateTime).getTime(), lat: r.latitude, lng: r.longitude, speed: r.speed });
  const validLog = (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && !(r.lat === 0 && r.lng === 0);

  return {
    call,
    multiCall,

    async getDevices() {
      const rows = await call('Get', { typeName: 'Device', search: {} });
      const now = Date.now();
      return rows
        .filter((d) => !d.activeTo || new Date(d.activeTo).getTime() > now)
        .map((d) => ({
          id: d.id,
          name: d.name || d.id,
          plate: d.licensePlate || '',
          vin: d.vehicleIdentificationNumber || '',
          serial: d.serialNumber || '',
          groups: (d.groups || []).map((g) => g.id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    },

    async getStatusInfo() {
      const rows = await call('Get', { typeName: 'DeviceStatusInfo', search: {} });
      return rows.map((s) => ({
        deviceId: s.device?.id,
        lat: s.latitude,
        lng: s.longitude,
        speed: s.speed || 0,
        bearing: s.bearing || 0,
        t: ms(s.dateTime),
        communicating: !!s.isDeviceCommunicating,
        driving: !!s.isDriving,
        driverId: s.driver?.id && s.driver.id !== 'UnknownDriverId' ? s.driver.id : null,
        stateSec: parseSpan(s.currentStateDuration),
      }));
    },

    async getDrivers() {
      const rows = await call('Get', { typeName: 'User', search: {} });
      const now = Date.now();
      return rows
        .filter((u) => u.isDriver && (!u.activeTo || new Date(u.activeTo).getTime() > now))
        .map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async getZones() {
      const rows = await call('Get', { typeName: 'Zone', search: {} });
      return rows.map((z) => ({ id: z.id, name: z.name, points: (z.points || []).map((p) => [p.y, p.x]) }));
    },

    async getRules() {
      const rows = await call('Get', { typeName: 'Rule', search: {} });
      return Object.fromEntries(rows.map((r) => [r.id, r.name]));
    },

    async getTrips(fromMs, toMs, deviceIds) {
      const base = { fromDate: toIso(fromMs), toDate: toIso(toMs) };
      const mk = (search) => ['Get', { typeName: 'Trip', search: { ...base, ...search }, resultsLimit: 50000 }];
      const lists = deviceIds?.length ? await batchedMulti(deviceIds.map((id) => mk({ deviceSearch: { id } }))) : [await call(...mk({}))];
      return lists.flat().map((t) => ({
        deviceId: t.device?.id,
        driverId: t.driver?.id && t.driver.id !== 'UnknownDriverId' ? t.driver.id : null,
        startMs: ms(t.start),
        stopMs: ms(t.stop),
        distanceKm: t.distance || 0,
        drivingSec: parseSpan(t.drivingDuration),
        idleSec: parseSpan(t.idlingDuration),
        stopSec: parseSpan(t.stopDuration),
        maxSpeed: t.maximumSpeed || 0,
        avgSpeed: t.averageSpeed || 0,
      }));
    },

    async getExceptions(fromMs, toMs, deviceIds) {
      const base = { fromDate: toIso(fromMs), toDate: toIso(toMs) };
      const mk = (search) => ['Get', { typeName: 'ExceptionEvent', search: { ...base, ...search }, resultsLimit: 50000 }];
      const lists = deviceIds?.length ? await batchedMulti(deviceIds.map((id) => mk({ deviceSearch: { id } }))) : [await call(...mk({}))];
      return lists.flat().map((e) => ({
        deviceId: e.device?.id,
        driverId: e.driver?.id && e.driver.id !== 'UnknownDriverId' ? e.driver.id : null,
        ruleId: e.rule?.id,
        startMs: ms(e.activeFrom),
        endMs: ms(e.activeTo),
        durationSec: parseSpan(e.duration),
        distanceKm: e.distance || 0,
      }));
    },

    /** Log GPS satu kendaraan; otomatis paging bila > 50.000 titik. */
    async getLogs(deviceId, fromMs, toMs) {
      const out = [];
      let from = fromMs;
      for (let guard = 0; guard < 10; guard++) {
        const rows = await call('Get', {
          typeName: 'LogRecord',
          search: { fromDate: toIso(from), toDate: toIso(toMs), deviceSearch: { id: deviceId } },
          resultsLimit: 50000,
        });
        const norm = rows.map(normLog);
        out.push(...norm);
        if (rows.length < 50000) break;
        from = norm[norm.length - 1].t + 1;
      }
      return out.filter(validLog).sort((a, b) => a.t - b.t);
    },

    /** Log GPS banyak permintaan sekaligus: reqs = [{deviceId, fromMs, toMs}] -> array log (sejajar dengan reqs) */
    async getLogsMulti(reqs) {
      if (!reqs.length) return [];
      const res = await batchedMulti(
        reqs.map((r) => ['Get', { typeName: 'LogRecord', search: { fromDate: toIso(r.fromMs), toDate: toIso(r.toMs), deviceSearch: { id: r.deviceId } }, resultsLimit: 50000 }]),
        25,
      );
      return res.map((rows) => rows.map(normLog).filter(validLog).sort((a, b) => a.t - b.t));
    },

    // ---- AddInData ----
    async listAddInData(addInId) {
      return call('Get', { typeName: 'AddInData', search: { addInId }, resultsLimit: 50000 });
    },
    async addAddInData(addInId, details) {
      return call('Add', { typeName: 'AddInData', entity: { addInId, groups: [{ id: 'GroupCompanyId' }], details } });
    },
    async setAddInData(id, addInId, details) {
      return call('Set', { typeName: 'AddInData', entity: { id, addInId, groups: [{ id: 'GroupCompanyId' }], details } });
    },
    async removeAddInData(id) {
      return call('Remove', { typeName: 'AddInData', entity: { id } });
    },

    // ---- Zone (opsi alert B: koridor sebagai Zone Geotab) ----
    async addZone({ name, ring, comment, color = { r: 11, g: 94, b: 168, a: 90 } }) {
      return call('Add', { typeName: 'Zone', entity: zoneEntity({ name, ring, comment, color }) });
    },
    async setZone(id, { name, ring, comment, color = { r: 11, g: 94, b: 168, a: 90 } }) {
      return call('Set', { typeName: 'Zone', entity: { id, ...zoneEntity({ name, ring, comment, color }) } });
    },
    async removeZone(id) {
      return call('Remove', { typeName: 'Zone', entity: { id } });
    },
  };
}

function zoneEntity({ name, ring, comment, color }) {
  return {
    name,
    comment: comment || '',
    displayed: true,
    mustIdentifyStops: false,
    fillColor: color,
    zoneTypes: [{ id: 'ZoneTypeCustomerId' }],
    groups: [{ id: 'GroupCompanyId' }],
    points: ring.map(([lat, lng]) => ({ x: lng, y: lat })),
    fromDate: '1986-01-01T00:00:00.000Z',
    toDate: '2050-01-01T00:00:00.000Z',
  };
}
