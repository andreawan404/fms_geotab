// API Geotab tiruan untuk mode dev/demo (npm run dev). Kendaraan bergerak di koridor Jakarta–Karawang,
// satu kendaraan sengaja keluar rute supaya alert dan report bisa dicoba tanpa database MyGeotab.
import { haversine, RouteIndex } from '../core/geometry.js';
import { pad } from '../core/time.js';

const WP = [[-6.2427, 106.876], [-6.248, 106.989], [-6.278, 107.14], [-6.324, 107.268], [-6.35, 107.355]];

export const DEMO_WAYPOINTS = WP;
export function demoPath() {
  const out = [];
  for (let i = 0; i < WP.length - 1; i++) {
    const [a, b] = [WP[i], WP[i + 1]];
    const n = Math.max(2, Math.round(haversine(a[0], a[1], b[0], b[1]) / 250));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(WP[WP.length - 1]);
  return out;
}

const PATH = demoPath();
const IDX = new RouteIndex(PATH);
const L = IDX.length;
const V = 14; // m/s ≈ 50 km/h

export const MOCK_DEVICES = [
  { id: 'b1', name: 'TRK-001', licensePlate: 'B 9001 SMA', delay: 0, mode: 'ok' },
  { id: 'b2', name: 'TRK-002', licensePlate: 'B 9002 SMA', delay: 300, mode: 'deviate' },
  { id: 'b3', name: 'TRK-003', licensePlate: 'B 9003 SMA', delay: null, mode: 'idle' },
  { id: 'b4', name: 'TRK-004', licensePlate: 'D 4004 SMA', delay: null, mode: 'offline' },
  { id: 'b5', name: 'TRK-005', licensePlate: 'B 9005 SMA', delay: 900, mode: 'ok' },
  { id: 'b6', name: 'TRK-006', licensePlate: 'B 9006 SMA', delay: 2400, mode: 'ok' },
];
const DRIVERS = [
  { id: 'u1', name: 'Budi Santoso', isDriver: true },
  { id: 'u2', name: 'Agus Pratama', isDriver: true },
  { id: 'u3', name: 'Rina Wulandari', isDriver: true },
];
const RULES = [{ id: 'r1', name: 'Speeding' }, { id: 'r2', name: 'Harsh Braking' }, { id: 'r3', name: 'Excessive Idling' }, { id: 'r4', name: 'Seatbelt' }];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// Waktu acuan demo: kendaraan "mulai" 25 menit sebelum halaman dibuka, lalu pola yang sama berulang tiap hari.
export const MOCK_BASE = Date.now() - 25 * 60000;
const midnight = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
export const BASE_TOD = MOCK_BASE - midnight(MOCK_BASE);
const dayStart = (ms, h = 8) => midnight(ms) + (h === 0 ? 0 : BASE_TOD);

function posAt(dev, t) {
  if (dev.mode === 'offline') return null;
  if (dev.delay == null) return { lat: PATH[0][0] + 0.002, lng: PATH[0][1] - 0.002, speed: 0, moving: false };
  const tod = (((t - MOCK_BASE) % 864e5) + 864e5) % 864e5;
  const s = (tod - dev.delay * 1000) / 1000;
  // sebelum berangkat, atau 30 menit setelah tiba (kembali ke depo) -> diam di titik awal
  if (s <= 0 || s > L / V + 1800) return { lat: PATH[0][0], lng: PATH[0][1], speed: 0, moving: false };
  const along = Math.min(L, s * V);
  const p = pointAlong(along);
  let lat = p[0];
  if (dev.mode === 'deviate' && along / L > 0.18 && along / L < 0.38) lat += 450 / 111320; // keluar koridor ±450 m
  return { lat, lng: p[1], speed: along >= L ? 0 : V * 3.6, moving: along < L };
}
function pointAlong(d) {
  const { cum } = IDX;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < d) i++;
  const seg = IDX.segLen[i] || 1;
  const t = Math.min(1, Math.max(0, (d - cum[i]) / seg));
  return [PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * t, PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * t];
}

const span = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(Math.floor(sec % 60))}`;
const LS_KEY = 'tms.mock.addindata.v1';
const loadLS = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
};
const saveLS = (rows) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
};

export function createMockApi() {
  let rows = [];
  try {
    if (!/[?&]keep=1/.test(location.search)) localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  rows = loadLS();
  let seq = rows.reduce((m, r) => Math.max(m, Number(String(r.id).slice(1)) || 0), 0);
  const zones = [];

  function handle(method, p) {
    const type = p?.typeName;
    if (method === 'Get') {
      const s = p.search || {};
      const from = s.fromDate ? new Date(s.fromDate).getTime() : Date.now() - 864e5;
      const to = Math.min(s.toDate ? new Date(s.toDate).getTime() : Date.now(), Date.now());
      const devFilter = s.deviceSearch?.id;
      const devs = MOCK_DEVICES.filter((d) => !devFilter || d.id === devFilter);
      switch (type) {
        case 'Device':
          return MOCK_DEVICES.map((d) => ({ id: d.id, name: d.name, licensePlate: d.licensePlate, serialNumber: `G9${d.id}`, groups: [{ id: 'GroupCompanyId' }] }));
        case 'User':
          return DRIVERS;
        case 'Rule':
          return RULES;
        case 'Zone':
          return zones;
        case 'DeviceStatusInfo': {
          const now = Date.now();
          return MOCK_DEVICES.map((d, i) => {
            const pos = posAt(d, now);
            return {
              device: { id: d.id },
              latitude: pos?.lat ?? PATH[0][0],
              longitude: pos?.lng ?? PATH[0][1],
              speed: pos?.speed ?? 0,
              bearing: 90,
              dateTime: new Date(pos ? now : now - 3 * 864e5).toISOString(),
              isDeviceCommunicating: !!pos,
              isDriving: !!pos?.moving,
              driver: { id: pos ? DRIVERS[i % 3].id : 'UnknownDriverId' },
              currentStateDuration: '00:12:00',
            };
          });
        }
        case 'LogRecord': {
          const out = [];
          const step = 20000;
          for (const d of devs) {
            for (let t = Math.ceil(from / step) * step; t <= to && out.length < 50000; t += step) {
              const pos = posAt(d, t);
              if (pos) out.push({ dateTime: new Date(t).toISOString(), latitude: pos.lat, longitude: pos.lng, speed: pos.speed, device: { id: d.id } });
            }
          }
          return out.slice(0, p.resultsLimit || 50000);
        }
        case 'Trip': {
          const out = [];
          for (let day = dayStart(from, 0); day <= to; day += 864e5) {
            for (const d of devs) {
              const r = rng(hash(d.id) + Math.floor(day / 864e5));
              const moving = d.delay != null;
              const start = dayStart(day) + (d.delay || 0) * 1000;
              const dur = moving ? L / V : 900 + r() * 600;
              if (start + dur * 1000 < from || start > to) continue;
              if (d.mode === 'offline' && day < Date.now() - 2 * 864e5) continue;
              out.push({
                device: { id: d.id },
                driver: { id: DRIVERS[hash(d.id) % 3].id },
                start: new Date(start).toISOString(),
                stop: new Date(start + dur * 1000).toISOString(),
                distance: moving ? L / 1000 + r() : 4 + r() * 3,
                drivingDuration: span(dur),
                idlingDuration: span(120 + r() * 900),
                stopDuration: span(600 + r() * 1200),
                maximumSpeed: 62 + r() * 38,
                averageSpeed: 38 + r() * 14,
              });
            }
          }
          return out;
        }
        case 'ExceptionEvent': {
          const out = [];
          for (let day = dayStart(from, 0); day <= to; day += 864e5) {
            for (const d of devs) {
              const r = rng(hash(d.id) * 7 + Math.floor(day / 864e5));
              const n = Math.floor(r() * 5);
              for (let k = 0; k < n; k++) {
                const rule = RULES[Math.floor(r() * RULES.length)];
                const at = dayStart(day) + (d.delay || 0) * 1000 + r() * (L / V) * 1000;
                if (at < from || at > to) continue;
                out.push({
                  rule: { id: rule.id },
                  device: { id: d.id },
                  driver: { id: DRIVERS[hash(d.id) % 3].id },
                  activeFrom: new Date(at).toISOString(),
                  activeTo: new Date(at + 20000 + r() * 90000).toISOString(),
                  duration: span(20 + r() * 90),
                  distance: r() * 2,
                });
              }
            }
          }
          return out;
        }
        case 'AddInData':
          return rows.filter((r) => r.addInId === s.addInId).map((r) => JSON.parse(JSON.stringify(r)));
        default:
          return [];
      }
    }
    if (method === 'Add') {
      if (type === 'AddInData') {
        const id = `L${++seq}`;
        rows.push({ id, ...JSON.parse(JSON.stringify(p.entity)) });
        saveLS(rows);
        return id;
      }
      if (type === 'Zone') {
        const id = `z${zones.length + 1}`;
        zones.push({ id, ...p.entity });
        return id;
      }
    }
    if (method === 'Set') {
      if (type === 'AddInData') {
        const i = rows.findIndex((r) => r.id === p.entity.id);
        if (i < 0) throw new Error('AddInData not found');
        rows[i] = JSON.parse(JSON.stringify(p.entity));
        saveLS(rows);
        return null;
      }
      if (type === 'Zone') {
        const i = zones.findIndex((z) => z.id === p.entity.id);
        if (i >= 0) zones[i] = { ...zones[i], ...p.entity };
        return null;
      }
    }
    if (method === 'Remove') {
      if (type === 'AddInData') {
        rows = rows.filter((r) => r.id !== p.entity.id);
        saveLS(rows);
        return null;
      }
      if (type === 'Zone') {
        const i = zones.findIndex((z) => z.id === p.entity.id);
        if (i >= 0) zones.splice(i, 1);
        return null;
      }
    }
    throw new Error(`Mock API: ${method} ${type} not supported`);
  }

  const wait = (fn) => setTimeout(fn, 40);
  return {
    isMock: true,
    call(method, params, ok, err) {
      wait(() => {
        try {
          ok(handle(method, params));
        } catch (e) {
          (err || console.error)(e);
        }
      });
    },
    multiCall(calls, ok, err) {
      wait(() => {
        try {
          ok(calls.map(([m, p]) => handle(m, p)));
        } catch (e) {
          (err || console.error)(e);
        }
      });
    },
  };
}
