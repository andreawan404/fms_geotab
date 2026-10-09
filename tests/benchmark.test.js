import { describe, it, expect } from 'vitest';
import { benchmark } from '../src/core/benchmark.js';

const row = (o) => ({ routeId: 'r1', driverId: 'd1', deviceId: 'v1', distKm: 100, fuelL: 25, engineSec: 7200, deviations: 0, compliance: 100, ...o });

describe('benchmark', () => {
  it('hitung economy per kelompok, selisih dari rata-rata armada, dan penanda', () => {
    const rows = [row({ driverId: 'a', fuelL: 20 }), row({ driverId: 'a', fuelL: 20 }), row({ driverId: 'b', fuelL: 30 }), row({ driverId: 'c', fuelL: 25 })];
    const { fleet, groups } = benchmark(rows, (r) => r.driverId);
    expect(fleet.kmPerL).toBeCloseTo(400 / 95);
    expect(groups.map((g) => g.key)).toEqual(['a', 'c', 'b']); // paling hemat dulu
    const a = groups.find((g) => g.key === 'a');
    expect(a.kmPerL).toBeCloseTo(5);
    expect(a.flag).toBe('high');
    expect(groups.find((g) => g.key === 'b').flag).toBe('low');
    expect(groups.find((g) => g.key === 'c').flag).toBe('');
  });
  it('kelompok tanpa data fuel tetap ada tetapi tanpa angka dan di akhir', () => {
    const { groups } = benchmark([row({ driverId: 'a' }), row({ driverId: 'z', fuelL: null, engineSec: null })], (r) => r.driverId);
    expect(groups[1].key).toBe('z');
    expect(groups[1].kmPerL).toBeNull();
    expect(groups[1].vsPct).toBeNull();
    expect(groups[1].flag).toBe('');
  });
  it('jarak terlalu pendek tidak ditandai; kunci kosong diabaikan', () => {
    const rows = [row({ driverId: 'a', distKm: 5, fuelL: 5 }), row({ driverId: 'b', distKm: 100, fuelL: 10 }), row({ driverId: null })];
    const { groups } = benchmark(rows, (r) => r.driverId);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.key === 'a').flag).toBe('');
  });
  it('tanpa data sama sekali', () => {
    const r = benchmark([], (x) => x.routeId);
    expect(r.fleet).toBeNull();
    expect(r.groups).toEqual([]);
  });
});
