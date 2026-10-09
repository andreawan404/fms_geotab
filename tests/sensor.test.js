import { describe, it, expect } from 'vitest';
import { valueAt, deltaOver, fuelEconomy, summarizeWindow, fmtEconomy } from '../src/core/sensor.js';

const MIN = 60000;
const mk = (pts) => pts.map(([m, v]) => ({ t: m * MIN, v }));

describe('sensor', () => {
  const s = mk([[0, 100], [10, 110], [20, 130]]);
  it('interpolates inside, clamps outside', () => {
    expect(valueAt(s, 5 * MIN).v).toBeCloseTo(105);
    expect(valueAt(s, 15 * MIN).v).toBeCloseTo(120);
    expect(valueAt(s, 30 * MIN).v).toBe(130);
    expect(valueAt(s, -5 * MIN).v).toBe(100);
    expect(valueAt([], 1)).toBeNull();
  });
  it('delta over window and flags approx when readings are far', () => {
    expect(deltaOver(s, 5 * MIN, 15 * MIN).delta).toBeCloseTo(15);
    expect(deltaOver(s, 5 * MIN, 15 * MIN).approx).toBe(false);
    const far = mk([[0, 0], [120, 12]]);
    expect(deltaOver(far, 50 * MIN, 70 * MIN).approx).toBe(true);
  });
  it('rejects counter reset and too little data', () => {
    expect(deltaOver(mk([[0, 100], [10, 5]]), 0, 10 * MIN)).toBeNull();
    expect(deltaOver(mk([[0, 1]]), 0, MIN)).toBeNull();
    expect(deltaOver(s, 10 * MIN, 10 * MIN)).toBeNull();
  });
  it('fuel economy needs meaningful fuel and distance', () => {
    expect(fuelEconomy(100, 20).kmPerL).toBeCloseTo(5);
    expect(fuelEconomy(100, 20).lPer100km).toBeCloseTo(20);
    expect(fuelEconomy(100, 0.1)).toBeNull();
    expect(fuelEconomy(0.2, 5)).toBeNull();
  });
  it('summarizeWindow combines hours, fuel and economy; missing sensor stays null', () => {
    const hours = mk([[0, 0], [60, 3600]]);
    const fuel = mk([[0, 0], [60, 12]]);
    const r = summarizeWindow({ hoursSeries: hours, fuelSeries: fuel, distKm: 60, from: 0, to: 60 * MIN });
    expect(r.engineSec).toBeCloseTo(3600);
    expect(r.fuelL).toBeCloseTo(12);
    expect(r.kmPerL).toBeCloseTo(5);
    const noFuel = summarizeWindow({ hoursSeries: hours, fuelSeries: [], distKm: 60, from: 0, to: 60 * MIN });
    expect(noFuel.fuelL).toBeNull();
    expect(noFuel.kmPerL).toBeNull();
    expect(fmtEconomy(r, 'l100')).toBe('20.0 L/100km');
    expect(fmtEconomy(null)).toBe('-');
  });
});
