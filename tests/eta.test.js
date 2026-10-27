import { describe, it, expect } from 'vitest';
import { buildEta, withClock } from '../src/core/eta.js';

const pts = [{ name: 'Gudang', windowEnd: '' }, { name: 'Toko A', windowEnd: '2026-10-27T10:00' }, { name: 'Toko B', windowEnd: '2026-10-27T13:00' }];

describe('ETA rute', () => {
  it('memakai durasi leg mesin rute dan menjumlahkan kumulatif', () => {
    const e = buildEta(pts, { legs: [{ distanceM: 10000, durationS: 1200 }, { distanceM: 5000, durationS: 600 }] });
    expect(e.approx).toBe(false);
    expect(e.rows.map((r) => r.offsetS)).toEqual([0, 1200, 1800]);
    expect(e.totalM).toBe(15000);
    expect(e.totalS).toBe(1800);
  });
  it('fallback ke offset kumulatif dan menandai perkiraan', () => {
    const e = buildEta(pts, { offsets: [0, 900, 2700], avgKmh: 36 });
    expect(e.approx).toBe(true);
    expect(e.rows[1].legM).toBeCloseTo(9000);
    expect(e.rows[2].legS).toBe(1800);
  });
  it('tanpa data -> null', () => {
    expect(buildEta(pts, {})).toBeNull();
    expect(buildEta([pts[0]], { legs: [] })).toBeNull();
    expect(buildEta(pts, { legs: [{ distanceM: 1, durationS: 0 }, { distanceM: 1, durationS: 5 }] })).toBeNull();
  });
  it('jam tiba dan penanda melewati jendela', () => {
    const e = withClock(buildEta(pts, { legs: [{ distanceM: 1, durationS: 3600 }, { distanceM: 1, durationS: 3600 }] }), Date.parse('2026-10-27T09:30'));
    expect(e.rows[1].etaMs).toBe(Date.parse('2026-10-27T10:30'));
    expect(e.rows[1].late).toBe(true);
    expect(e.rows[2].late).toBe(false);
    expect(e.arriveMs).toBe(Date.parse('2026-10-27T11:30'));
  });
  it('tanpa jam berangkat tidak ada jam tiba', () => {
    const e = withClock(buildEta(pts, { legs: [{ distanceM: 1, durationS: 60 }, { distanceM: 1, durationS: 60 }] }), NaN);
    expect(e.rows[1].etaMs).toBeNull();
    expect(e.rows[1].late).toBe(false);
  });
});

describe('ETA tersimpan', () => {
  it('offset tersimpan dari mesin routing tidak ditandai perkiraan', () => {
    const e = buildEta(pts, { offsets: [0, 600, 1500], exact: true });
    expect(e.approx).toBe(false);
    expect(e.totalS).toBe(1500);
  });
});
