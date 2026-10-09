import { describe, it, expect } from 'vitest';
import { relParts, ongoingItems, recentItems } from '../src/lib/alertView.js';

const NOW = 1_000_000_000_000;
const MIN = 60000;

describe('relParts', () => {
  it('membagi ke satuan', () => {
    expect(relParts(NOW - 20_000, NOW)).toEqual({ unit: 'now', n: 0 });
    expect(relParts(NOW - 5 * MIN, NOW)).toEqual({ unit: 'min', n: 5 });
    expect(relParts(NOW - 125 * MIN, NOW)).toEqual({ unit: 'hour', n: 2 });
    expect(relParts(NOW - 50 * 60 * MIN, NOW)).toEqual({ unit: 'day', n: 2 });
  });
});

describe('ongoingItems / recentItems', () => {
  const inst = (k, deviceId = 'v1') => ({ key: k, deviceId, routeId: 'r1', startMs: NOW - 30 * MIN });
  const results = new Map([
    ['a@1', { inst: inst('a@1'), result: { currentlyDeviating: true, deviations: [{ startMs: NOW - 25 * MIN, ongoing: true, maxDistM: 300 }], current: { distM: 280 }, phase: 'en_route', checkpoints: [{ name: 'A' }] } }],
    ['b@1', { inst: inst('b@1', 'v2'), result: { currentlyDeviating: false, deviations: [], current: null, phase: 'late_start', checkpoints: [{ name: 'Depo' }] } }],
    ['c@1', { inst: inst('c@1', 'v3'), result: { currentlyDeviating: false, deviations: [], phase: 'en_route', checkpoints: [] } }],
  ]);
  it('deviasi yang masih berlangsung dan terlambat tetap tampil, urut tingkat keparahan', () => {
    const o = ongoingItems(results, NOW);
    expect(o.map((x) => [x.kind, x.deviceId])).toEqual([['deviating', 'v1'], ['late', 'v2']]);
    expect(o[0].distM).toBe(280);
    expect(o[1].min).toBe(30);
  });
  it('kejadian terbaru: hanya dalam jendela, terbaru dulu, tanpa duplikat dengan yang berlangsung', () => {
    const o = ongoingItems(results, NOW);
    const feed = [
      { id: 'a@1:deviation_start:' + (NOW - 25 * MIN), type: 'deviation_start', at: NOW - 24 * MIN, instKey: 'a@1', t: NOW - 25 * MIN },
      { id: 'x1', type: 'start_reached', at: NOW - 3 * MIN, instKey: 'z' },
      { id: 'x2', type: 'route_completed', at: NOW - 9 * MIN, instKey: 'z' },
      { id: 'x3', type: 'deviation_end', at: NOW - 11 * MIN, instKey: 'z' },
      { id: 'b@1:late_start:1', type: 'late_start', at: NOW - 2 * MIN, instKey: 'b@1' },
    ];
    const r = recentItems(feed, o, NOW, 10);
    expect(r.map((x) => x.id)).toEqual(['x1', 'x2']);
    expect(recentItems(feed, o, NOW, 30).map((x) => x.id)).toEqual(['x1', 'x2', 'x3']);
  });
});
