// Mode dev/demo: berjalan mandiri di browser dengan API Geotab tiruan (npm run dev).
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Root from './Root.jsx';
import { createMockApi, demoPath, DEMO_WAYPOINTS, MOCK_BASE, BASE_TOD } from './services/mock.js';
import { offsetsFromPath } from './services/routing.js';
import { uid } from './services/store.js';
import { pad } from './core/time.js';

const api = createMockApi();

const hhmm = (tod) => `${pad(Math.floor(((tod % 864e5) + 864e5) % 864e5 / 3600000))}:${pad(Math.floor((((tod % 864e5) + 864e5) % 864e5 % 3600000) / 60000))}`;

async function seed({ store }) {
  const path = demoPath();
  const wp = DEMO_WAYPOINTS;
  const names = ['Depo Jakarta Timur', 'Cikarang', 'Karawang Barat', 'Site Karawang'];
  const idxs = [0, 1, 3, 4];
  const cps = idxs.map((i, k) => ({ id: uid('c'), name: names[k], lat: wp[i][0], lng: wp[i][1], radius: 200 }));
  const off = offsetsFromPath(path, cps, 50);
  cps.forEach((c, i) => {
    c.etaOffsetS = off[i];
  });
  const route = await store.saveRoute({
    id: uid('r'),
    name: 'Jakarta – Karawang (demo)',
    color: '#0b5ea8',
    mode: 'recommended',
    profile: 'driving-car',
    widthM: 100,
    params: {},
    checkpoints: cps,
    path,
    manualPath: [],
    distanceM: 55000,
    durationS: off[off.length - 1],
    createdAt: Date.now(),
  });
  const start = hhmm(BASE_TOD - 10 * 60000);
  const end = hhmm(BASE_TOD + 3 * 3600000);
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mk = (deviceId, driverId, note) => ({ id: uid('a'), routeId: route.id, deviceId, driverId, startTime: start, endTime: end, recur: { days: [0, 1, 2, 3, 4, 5, 6], from: today }, active: true, note, createdAt: Date.now() });
  await store.saveAssignment(mk('b1', 'u1', 'Demo: sesuai rute'));
  await store.saveAssignment(mk('b2', 'u2', 'Demo: keluar rute'));
  await store.saveAssignment(mk('b5', 'u3', 'Demo: terlambat'));
  await store.saveAssignment(mk('b6', null, 'Demo: belum berangkat'));
  await store.saveAssignment(mk('b3', 'u1', 'Demo: tidak tiba di titik awal'));
}

createRoot(document.getElementById('tms-root')).render(<Root api={api} addInId="demo-addin" active seed={seed} />);
void MOCK_BASE;
