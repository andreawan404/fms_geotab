import { describe, it, expect } from 'vitest';
import { createStore } from '../src/services/store.js';

// AddInData Geotab palsu (in-memory)
function fakeGeotab() {
  const rows = new Map();
  let n = 0;
  return {
    rows,
    listAddInData: async (addInId) => [...rows.values()].filter((r) => r.addInId === addInId).map((r) => JSON.parse(JSON.stringify(r))),
    addAddInData: async (addInId, details) => {
      const id = `b${++n}`;
      rows.set(id, { id, addInId, details: JSON.parse(JSON.stringify(details)) });
      return id;
    },
    setAddInData: async (id, addInId, details) => rows.set(id, { id, addInId, details: JSON.parse(JSON.stringify(details)) }),
    removeAddInData: async (id) => rows.delete(id),
  };
}

const bigPath = (n) => Array.from({ length: n }, (_, i) => [-6.2 + i * 0.0007 + Math.sin(i) * 0.0003, 106.8 + i * 0.0009 + Math.cos(i) * 0.0003]);
const mkRoute = (id, n) => ({ id, name: `R ${id}`, color: '#0b5ea8', mode: 'recommended', widthM: 80, checkpoints: [{ id: 'c1', name: 'A', lat: -6.2, lng: 106.8, radius: 100 }], path: bigPath(n), manualPath: [], distanceM: 1000, durationS: 600 });

describe('store (AddInData)', () => {
  it('rute besar dipecah ke beberapa record dan utuh saat dibaca kembali', async () => {
    const g = fakeGeotab();
    const store = createStore(g, 'addin1');
    const saved = await store.saveRoute(mkRoute('r1', 2500));
    expect(saved._chunks.length).toBeGreaterThan(1);
    for (const r of g.rows.values()) expect(JSON.stringify(r.details).length).toBeLessThan(9500);
    const { routes } = await store.load();
    expect(routes.length).toBe(1);
    expect(routes[0].path.length).toBe(2500);
    expect(routes[0].path[1234][0]).toBeCloseTo(bigPath(2500)[1234][0], 5);
  });

  it('menyimpan ulang dengan path lebih pendek menghapus chunk berlebih', async () => {
    const g = fakeGeotab();
    const store = createStore(g, 'addin1');
    let r = await store.saveRoute(mkRoute('r1', 2500));
    const before = g.rows.size;
    r = await store.saveRoute({ ...r, path: bigPath(100) });
    expect(g.rows.size).toBeLessThan(before);
    const { routes } = await store.load();
    expect(routes[0].path.length).toBe(100);
  });

  it('hapus rute membersihkan semua record; data add-in lain tidak tercampur', async () => {
    const g = fakeGeotab();
    const a = createStore(g, 'addin1');
    const other = createStore(g, 'addin2');
    const r = await a.saveRoute(mkRoute('r1', 800));
    await other.saveRoute(mkRoute('rX', 50));
    await a.deleteRoute(r);
    expect((await a.load()).routes.length).toBe(0);
    expect((await other.load()).routes.length).toBe(1);
  });

  it('penugasan, setting, dan alert tersimpan; setting digabung dengan default', async () => {
    const g = fakeGeotab();
    const store = createStore(g, 'addin1');
    const asg = await store.saveAssignment({ id: 'a1', routeId: 'r1', deviceId: 'b1', startTime: '08:00', endTime: '17:00', recur: { days: [1], from: '2026-10-05' } });
    await store.appendAlerts([{ id: 'a1@2026-10-05:deviation_start:1', type: 'deviation_start', t: 1, at: 1, deviceId: 'b1', routeId: 'r1', instKey: 'a1@2026-10-05', distM: 120 }]);
    await store.saveSettings({ pollSec: 30, routing: { provider: 'ors' } }, undefined);
    const d = await store.load();
    expect(d.assignments.length).toBe(1);
    expect(d.assignments[0]._rid).toBe(asg._rid);
    expect(d.alerts.length).toBe(1);
    expect(d.settings.pollSec).toBe(30);
    expect(d.settings.routing.provider).toBe('ors');
    expect(d.settings.routing.osrmUrl).toContain('osrm'); // default tetap ada
    expect(d.settings.defaults.widthM).toBeGreaterThan(0);
  });

  it('menolak record yang melebihi batas ukuran', async () => {
    const store = createStore(fakeGeotab(), 'addin1');
    const r = mkRoute('r1', 5);
    r.checkpoints = Array.from({ length: 120 }, (_, i) => ({ id: `c${i}`, name: 'Checkpoint dengan nama yang cukup panjang '.repeat(2) + i, lat: -6.2, lng: 106.8, radius: 100, etaOffsetS: 100 }));
    await expect(store.saveRoute(r)).rejects.toThrow(/terlalu besar/);
  });

  it('log alert: semua jenis tersimpan per hari, terpecah bila besar, utuh saat dibaca & tidak ganda', async () => {
    const g = fakeGeotab();
    const store = createStore(g, 'addin1');
    const day = new Date(2026, 9, 5, 9, 0).getTime();
    const evs = Array.from({ length: 160 }, (_, i) => ({ id: `a1@2026-10-05:checkpoint_arrived:${day + i}`, type: i % 2 ? 'deviation_start' : 'checkpoint_arrived', t: day + i, at: day + i * 1000, deviceId: 'b1', routeId: 'r1', instKey: 'a1@2026-10-05', cpName: 'Checkpoint panjang ' + i, distM: 100 + i, lat: -6.2, lng: 106.8 }));
    await store.appendAlerts(evs.slice(0, 80));
    await store.appendAlerts(evs.slice(80));
    for (const r of g.rows.values()) expect(JSON.stringify(r.details).length).toBeLessThan(9500);
    expect(g.rows.size).toBeGreaterThan(1);
    const d = await store.load();
    expect(d.alerts.length).toBe(160);
    expect(d.alerts[0].at).toBeGreaterThan(d.alerts[159].at); // terbaru dulu
    expect(d.alerts.find((a) => a.id === evs[3].id).cpName).toBe('Checkpoint panjang 3');
    // sesi lain menulis event yang sama -> tidak ganda
    const other = createStore(g, 'addin1');
    await other.appendAlerts([evs[0]]);
    expect((await store.load()).alerts.length).toBe(160);
  });

  it('ack: simpan, baca, hapus', async () => {
    const g = fakeGeotab();
    const store = createStore(g, 'addin1');
    const a = await store.saveAck({ id: 'x', by: 'budi', at: 5, note: 'sudah ditelepon' });
    let d = await store.load();
    expect(d.acks.get('x').by).toBe('budi');
    expect(d.acks.get('x').note).toBe('sudah ditelepon');
    await store.deleteAck(a);
    d = await store.load();
    expect(d.acks.size).toBe(0);
  });

  it('cleanup: hanya menghapus rekaman lebih lama dari retensi', async () => {
    const g = fakeGeotab();
    const store = createStore(g, 'addin1');
    const now = Date.now();
    await store.appendAlerts([{ id: 'old', type: 'deviation_start', t: now - 100 * 864e5, at: now - 100 * 864e5, deviceId: 'b1', instKey: 'k@d' }]);
    await store.appendAlerts([{ id: 'new', type: 'deviation_start', t: now, at: now, deviceId: 'b1', instKey: 'k@d' }]);
    const d = await store.load();
    expect(await store.cleanup(d.oldRids, 90)).toBe(1);
    expect((await store.load()).alerts.map((a) => a.id)).toEqual(['new']);
  });
});
