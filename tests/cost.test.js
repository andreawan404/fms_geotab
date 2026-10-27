import { describe, it, expect } from 'vitest';
import { estimateCost, tollClassOf, tollRatePerKm } from '../src/core/cost.js';
import { osrmTollOfLeg, orsToll } from '../src/services/routing.js';

describe('perkiraan biaya', () => {
  const cost = { fuelPriceRp: 10000, tollBaseRpPerKm: 1000, tollRatio: [1, 1.5, 1.5, 2, 2] };
  it('BBM = jarak / km per liter x harga; tol = km tol x tarif golongan', () => {
    const e = estimateCost({ distanceM: 100000, tollM: 40000, kmPerL: 8, tollClass: 2, cost });
    expect(e.fuelL).toBeCloseTo(12.5);
    expect(e.fuelRp).toBe(125000);
    expect(e.tollRp).toBe(60000);
    expect(e.totalRp).toBe(185000);
    expect(e.missing).toEqual([]);
  });
  it('tol manual menggantikan hitungan, data kurang dilaporkan', () => {
    const e = estimateCost({ distanceM: 50000, tollM: 10000, kmPerL: null, tollOverrideRp: 85000, cost: { ...cost, fuelPriceRp: 0 } });
    expect(e.tollRp).toBe(85000);
    expect(e.tollSource).toBe('manual');
    expect(e.fuelRp).toBeNull();
    expect(e.missing).toEqual(['kmPerL', 'fuelPrice']);
    expect(e.totalRp).toBe(85000);
  });
  it('tol tidak diketahui -> unknown dan tidak dijumlahkan', () => {
    const e = estimateCost({ distanceM: 10000, tollM: null, kmPerL: 10, cost });
    expect(e.tollSource).toBe('unknown');
    expect(e.missing).toContain('toll');
    expect(e.totalRp).toBe(10000);
  });
  it('golongan tol dari jenis kendaraan atau pilihan manual', () => {
    expect(tollClassOf({ type: 'tronton' })).toBe(2);
    expect(tollClassOf({ type: 'tronton', tollClass: 4 })).toBe(4);
    expect(tollClassOf({})).toBe(1);
    expect(tollRatePerKm(cost, 5)).toBe(2000);
  });
});

describe('deteksi tol dari mesin routing', () => {
  it('OSRM: langkah dengan kelas toll dijumlahkan', () => {
    const leg = { steps: [
      { distance: 1000, intersections: [{ classes: ['motorway'] }, { classes: ['toll', 'motorway'] }, { classes: ['toll', 'motorway'] }] },
      { distance: 500, intersections: [{}, {}] },
      { distance: 700, intersections: [{ classes: ['toll'] }] },
    ] };
    expect(osrmTollOfLeg(leg)).toEqual({ tollM: 1700, known: true });
    expect(osrmTollOfLeg({ steps: [{ distance: 10, intersections: [{}] }] })).toEqual({ tollM: 0, known: false });
  });
  it('ORS: segmen tollways dijumlah total dan per leg', () => {
    const path = [[0, 0], [0, 0.01], [0, 0.02], [0, 0.03], [0, 0.04]];
    const r = orsToll(path, [0, 2, 4], [[0, 1, 0], [1, 3, 1], [3, 4, 0]]);
    expect(r.known).toBe(true);
    expect(r.totalM).toBeGreaterThan(2000);
    expect(r.legs[0] + r.legs[1]).toBeCloseTo(r.totalM, -1);
    expect(orsToll(path, [0, 4], undefined).known).toBe(false);
  });
});
