import { describe, it, expect } from 'vitest';
import { encodePolyline, decodePolyline, chunkString } from '../src/core/polyline.js';
import { haversine, RouteIndex, simplifyPath, pathLength } from '../src/core/geometry.js';
import { RouteRun, evaluateInstance } from '../src/core/tracking.js';
import { expand, findConflicts } from '../src/core/schedule.js';
import { corridorRings } from '../src/core/corridor.js';
import { parseSpan, atTime } from '../src/core/time.js';
import { toCSV } from '../src/core/csv.js';

// Rute lurus di khatulistiwa, arah timur: 107.00 -> 107.10 (±11.1 km)
const PATH = Array.from({ length: 11 }, (_, i) => [0, 107 + i * 0.01]);
const M_PER_DEG = (Math.PI / 180) * 6371008.8;
const north = (m) => m / M_PER_DEG; // meter -> derajat lintang
const route = (extra = {}) => ({
  path: PATH,
  widthM: 60,
  checkpoints: [
    { id: 'a', name: 'A', lat: 0, lng: 107.0, radius: 100, etaOffsetS: 0 },
    { id: 'b', name: 'B', lat: 0, lng: 107.05, radius: 100, etaOffsetS: 600 },
    { id: 'c', name: 'C', lat: 0, lng: 107.1, radius: 100, etaOffsetS: 1200 },
  ],
  ...extra,
});
const T0 = Date.UTC(2026, 9, 7, 0, 0, 0);
const pt = (sec, lng, latM = 0) => ({ t: T0 + sec * 1000, lat: north(latM), lng, speed: 40 });

describe('polyline', () => {
  it('encode/decode roundtrip (presisi 5)', () => {
    const pts = [[-6.2088, 106.8456], [-6.9175, 107.6191], [-7.2575, 112.7521]];
    const back = decodePolyline(encodePolyline(pts));
    back.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(pts[i][0], 5);
      expect(p[1]).toBeCloseTo(pts[i][1], 5);
    });
  });
  it('chunkString membagi dan bisa digabung kembali', () => {
    const s = 'x'.repeat(2500);
    const c = chunkString(s, 1000);
    expect(c.length).toBe(3);
    expect(c.join('')).toBe(s);
  });
});

describe('geometry', () => {
  it('haversine ~111.19 km per derajat lintang', () => {
    expect(haversine(0, 0, 1, 0)).toBeGreaterThan(111000);
    expect(haversine(0, 0, 1, 0)).toBeLessThan(111400);
  });
  it('RouteIndex.nearest: jarak tegak lurus dan posisi along', () => {
    const idx = new RouteIndex(PATH);
    const r = idx.nearest(north(100), 107.05);
    expect(r.dist).toBeGreaterThan(98);
    expect(r.dist).toBeLessThan(102);
    expect(r.along).toBeGreaterThan(5400);
    expect(r.along).toBeLessThan(5700);
    expect(idx.length).toBeCloseTo(pathLength(PATH), 3);
  });
  it('hint window memberi hasil sama dengan full scan', () => {
    const idx = new RouteIndex(PATH);
    const a = idx.nearest(north(20), 107.034);
    const b = idx.nearest(north(20), 107.034, { hint: 3 });
    expect(b.seg).toBe(a.seg);
    expect(b.dist).toBeCloseTo(a.dist, 6);
  });
  it('simplifyPath membuang titik kolinear, mempertahankan ujung dan tikungan', () => {
    const out = simplifyPath(PATH, 5);
    expect(out.length).toBe(2);
    const bend = [[0, 107], [0, 107.01], [0.01, 107.01]];
    expect(simplifyPath(bend, 5).length).toBe(3);
  });
});

describe('corridor', () => {
  it('buffer menghasilkan poligon dengan lebar sesuai', () => {
    const rings = corridorRings(PATH, 200);
    expect(rings.length).toBe(1);
    const lats = rings[0].map((p) => p[0]);
    const halfWidthM = ((Math.max(...lats) - Math.min(...lats)) / 2) * M_PER_DEG;
    expect(halfWidthM).toBeGreaterThan(95);
    expect(halfWidthM).toBeLessThan(105);
  });
});

describe('deviasi + debounce', () => {
  it('di dalam koridor tidak ada deviasi', () => {
    const logs = Array.from({ length: 30 }, (_, i) => pt(i * 10, 107 + i * 0.0033, 5));
    const r = evaluateInstance({ route: route(), window: { startMs: T0, endMs: T0 + 3600e3 }, logs, nowMs: T0 + 400e3 });
    expect(r.deviations.length).toBe(0);
    expect(r.currentlyDeviating).toBe(false);
    expect(r.compliancePct).toBeGreaterThan(99);
  });

  it('keluar 300 m selama 2 menit -> 1 deviasi terkonfirmasi lalu ditutup', () => {
    const logs = [];
    let s = 0;
    for (let i = 0; i < 6; i++, s += 10) logs.push(pt(s, 107.01 + i * 0.0005, 0)); // di rute
    for (let i = 0; i < 12; i++, s += 10) logs.push(pt(s, 107.04 + i * 0.0003, 300)); // 2 menit di luar
    for (let i = 0; i < 6; i++, s += 10) logs.push(pt(s, 107.05 + i * 0.0003, 0)); // kembali
    const r = evaluateInstance({ route: route(), window: { startMs: T0, endMs: T0 + 3600e3 }, logs, nowMs: T0 + s * 1000 });
    expect(r.deviations.length).toBe(1);
    expect(r.deviations[0].maxDistM).toBeGreaterThan(280);
    expect(r.deviations[0].ongoing).toBe(false);
    expect(r.events.map((e) => e.type)).toContain('deviation_start');
    expect(r.events.map((e) => e.type)).toContain('deviation_end');
    expect(r.status).toBe('deviated');
    expect(r.compliancePct).toBeLessThan(100);
  });

  it('blip GPS singkat (10 detik, jarak pendek) diabaikan', () => {
    const logs = [pt(0, 107.01, 0), pt(10, 107.0105, 0), pt(15, 107.011, 120), pt(20, 107.0112, 120), pt(30, 107.012, 0), pt(60, 107.015, 0), pt(90, 107.018, 0)];
    const r = evaluateInstance({ route: route(), window: { startMs: T0, endMs: T0 + 3600e3 }, logs, nowMs: T0 + 100e3 });
    expect(r.deviations.length).toBe(0);
  });

  it('masih di luar saat ini -> deviasi ongoing', () => {
    const logs = [pt(0, 107.01, 0), pt(10, 107.011, 0)];
    for (let i = 0; i < 8; i++) logs.push(pt(20 + i * 10, 107.02, 400));
    const r = evaluateInstance({ route: route(), window: { startMs: T0, endMs: T0 + 3600e3 }, logs, nowMs: T0 + 100e3 });
    expect(r.currentlyDeviating).toBe(true);
    expect(r.deviations.at(-1).ongoing).toBe(true);
    expect(r.status).toBe('deviated');
  });

  it('masa tenggang: kendaraan jauh dari rute di awal jadwal tidak dianggap deviasi', () => {
    const logs = Array.from({ length: 10 }, (_, i) => pt(i * 30, 106.9, 2000)); // 5 menit parkir di depo
    const r = evaluateInstance({ route: route(), window: { startMs: T0, endMs: T0 + 3600e3 }, logs, nowMs: T0 + 300e3 });
    expect(r.deviations.length).toBe(0);
    expect(r.armed).toBe(false);
    expect(r.status).toBe('planned');
  });

  it('setelah checkpoint terakhir tercapai, keluar rute tidak lagi dianggap deviasi', () => {
    const logs = [];
    let s = 0;
    for (let i = 0; i <= 10; i++, s += 60) logs.push(pt(s, 107 + i * 0.01, 0)); // A,B,C
    for (let i = 0; i < 10; i++, s += 10) logs.push(pt(s, 107.12, 500)); // parkir di luar
    const r = evaluateInstance({ route: route(), window: { startMs: T0, endMs: T0 + 3 * 3600e3 }, logs, nowMs: T0 + s * 1000 });
    expect(r.finished).toBe(true);
    expect(r.deviations.length).toBe(0);
    expect(r.status).toBe('completed');
  });
});

describe('checkpoint', () => {
  it('urut, mencatat dwell dan delay vs ETA', () => {
    const logs = [];
    let s = 0;
    for (let i = 0; i <= 5; i++, s += 100) logs.push(pt(s, 107 + i * 0.01, 0)); // sampai B di s=500
    for (let i = 0; i < 6; i++, s += 60) logs.push(pt(s, 107.05, 0)); // berhenti 5 menit di B
    for (let i = 6; i <= 10; i++, s += 100) logs.push(pt(s, 107 + i * 0.01, 0));
    const r = evaluateInstance({ route: route(), window: { startMs: T0, endMs: T0 + 7200e3 }, logs, nowMs: T0 + s * 1000 });
    expect(r.arrivedCount).toBe(3);
    const b = r.checkpoints[1];
    expect(b.dwellSec).toBeGreaterThanOrEqual(300);
    expect(b.delayMin).toBeLessThan(0); // tiba lebih awal dari ETA 600 s
    expect(r.status).toBe('completed');
  });

  it('checkpoint terlewat ditandai skipped saat kendaraan sudah di checkpoint berikutnya', () => {
    const logs = [pt(0, 107.0, 0), pt(50, 107.03, 0), pt(100, 107.07, 0), pt(150, 107.1, 0)]; // loncat dari A ke C (B tidak dilewati radiusnya)
    const r = evaluateInstance({ route: route(), window: { startMs: T0, endMs: T0 + 7200e3 }, logs, nowMs: T0 + 200e3 });
    expect(r.checkpoints[1].skipped).toBe(true);
    expect(r.checkpoints[2].arrivedMs).not.toBeNull();
  });

  it('rute pulang-pergi: berada di depo saat awal tidak langsung menyelesaikan rute', () => {
    const rt = {
      path: [[0, 107], [0, 107.05], [0, 107]],
      widthM: 60,
      checkpoints: [
        { id: 'd0', name: 'Depo', lat: 0, lng: 107, radius: 100 },
        { id: 'x', name: 'X', lat: 0, lng: 107.05, radius: 100 },
        { id: 'd1', name: 'Depo', lat: 0, lng: 107, radius: 100 },
      ],
    };
    const run = new RouteRun(rt, { startMs: T0, endMs: T0 + 7200e3 });
    run.push(pt(0, 107.0, 0));
    run.push(pt(30, 107.0002, 0));
    const mid = run.result(T0 + 60e3);
    expect(mid.arrivedCount).toBe(1);
    expect(mid.finished).toBe(false);
  });
});

describe('schedule', () => {
  const rec = { id: 'r1', routeId: 'R', deviceId: 'b1', startTime: '08:00', endTime: '16:00', recur: { days: [1, 2, 3, 4, 5], from: '2026-10-05' } };
  it('ekspansi berulang Senin-Jumat', () => {
    const inst = expand([rec], '2026-10-05', '2026-10-11');
    expect(inst.map((i) => i.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  });
  it('exceptions & until dihormati', () => {
    const a = { ...rec, exceptions: ['2026-10-07'], recur: { ...rec.recur, until: '2026-10-08' } };
    expect(expand([a], '2026-10-05', '2026-10-31').map((i) => i.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-08']);
  });
  it('shift malam melewati tengah malam', () => {
    const night = { id: 'n', routeId: 'R', deviceId: 'b2', startTime: '22:00', endTime: '06:00', date: '2026-10-07' };
    const [i] = expand([night], '2026-10-07', '2026-10-07');
    expect(i.endMs).toBe(atTime('2026-10-08', '06:00'));
  });
  it('bentrok kendaraan & driver terdeteksi, tidak bentrok jika jam berbeda', () => {
    const cand = { id: 'c', routeId: 'R2', deviceId: 'b1', driverId: 'd9', startTime: '10:00', endTime: '12:00', date: '2026-10-07' };
    const c1 = findConflicts(cand, [rec], '2026-10-07');
    expect(c1.length).toBe(1);
    expect(c1[0].reason).toBe('vehicle');
    const other = { ...rec, id: 'r2', deviceId: 'b3', driverId: 'd9' };
    expect(findConflicts(cand, [other], '2026-10-07')[0].reason).toBe('driver');
    const later = { ...cand, startTime: '17:00', endTime: '19:00' };
    expect(findConflicts(later, [rec], '2026-10-07').length).toBe(0);
  });
});

describe('util', () => {
  it('parseSpan format Geotab', () => {
    expect(parseSpan('00:12:34.5')).toBeCloseTo(754.5);
    expect(parseSpan('1.02:00:00')).toBe(93600);
  });
  it('toCSV meng-escape dan memakai pemisah', () => {
    const csv = toCSV([{ a: 'x;y', b: 'say "hi"' }], [{ label: 'A', key: 'a' }, { label: 'B', key: 'b' }], ';');
    expect(csv).toContain('"x;y";"say ""hi"""');
  });
});
