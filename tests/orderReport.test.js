import { describe, expect, it } from 'vitest';
import { buildOrderReportHtml, routePlotSvg, stopTimes } from '../src/lib/orderReport.js';

const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
const order = {
  id: 'o1', doNo: 'DO-<1>', customer: 'PT "A" & B', orderDate: '2026-10-01', status: 'done', vendorName: 'Armada', plate: 'B 1 X', driverName: 'Budi', startedAt: '2026-10-01T01:00:00Z', finishedAt: '2026-10-01T06:00:00Z',
  summary: { peakWeight: 1200, peakVolume: 3.5, peakPallets: 2 },
  stops: [
    { type: 'pickup', name: 'Gudang <script>', address: 'Jl. 1', lat: -6.2, lng: 106.8, windowStart: '', windowEnd: '2026-10-01T02:00:00Z', items: [{ description: 'Beras', qty: 10, unit: 'sak', weightKg: 500 }] },
    { type: 'delivery', name: 'Toko', address: 'Jl. 2', lat: -6.9, lng: 107.6, windowStart: '', windowEnd: '2026-10-01T05:00:00Z', items: [] },
  ],
};
const events = [
  { seq: 1, type: 'trip_start', stopSeq: null, at: '2026-10-01T01:00:00Z' },
  { seq: 2, type: 'arrive', stopSeq: 1, at: '2026-10-01T02:30:00Z' },
  { seq: 3, type: 'arrive', stopSeq: 2, at: '2026-10-01T05:30:00Z', outside: true },
];

describe('routePlotSvg', () => {
  it('menggambar garis rute, grid, dan stop bernomor', () => {
    const svg = routePlotSvg({ path: [[-6.2, 106.8], [-6.5, 107.2], [-6.9, 107.6]], points: [{ lat: -6.2, lng: 106.8, type: 'pickup' }, { lat: -6.9, lng: 107.6, type: 'delivery' }] });
    expect(svg).toContain('<polyline');
    expect(svg).toContain('class="mp"');
    expect(svg).toContain('class="md"');
    expect(svg).toMatch(/<text[^>]*class="mt"[^>]*>2<\/text>/);
    expect(svg.match(/class="g"/g).length).toBeGreaterThan(4);
  });
  it('dengan tileUrl menempatkan tile peta di bawah garis rute', () => {
    const svg = routePlotSvg({ path: [[-6.2, 106.8], [-6.9, 107.6]], points: [{ lat: -6.2, lng: 106.8 }, { lat: -6.9, lng: 107.6 }], tileUrl: 'https://t.test/{z}/{x}/{y}.png' });
    const imgs = svg.match(/<image href="https:\/\/t\.test\/\d+\/\d+\/\d+\.png"/g);
    expect(imgs.length).toBeGreaterThan(1);
    expect(svg.indexOf('<image')).toBeLessThan(svg.indexOf('<polyline'));
    expect(svg).toContain('OpenStreetMap');
    expect(svg).not.toContain('class="g"');
  });
  it('kosong tanpa data, dan tidak error untuk satu titik', () => {
    expect(routePlotSvg({ path: [], points: [] })).toBe('');
    expect(routePlotSvg({ points: [{ lat: -6, lng: 106 }] })).toContain('<svg');
  });
  it('titik tetap di dalam kotak', () => {
    const svg = routePlotSvg({ path: [[0, 0], [10, 10]], points: [{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }], w: 700, h: 330 });
    for (const m of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)) { expect(+m[1]).toBeGreaterThan(0); expect(+m[1]).toBeLessThan(700); expect(+m[2]).toBeGreaterThan(0); expect(+m[2]).toBeLessThan(330); }
  });
});

describe('stopTimes', () => {
  it('memetakan event ke stop', () => {
    const r = stopTimes(events, 2);
    expect(r[0].arrive).toBe('2026-10-01T02:30:00Z');
    expect(r[1].outside).toBe(true);
  });
});

describe('buildOrderReportHtml', () => {
  const base = { order, route: { path: [[-6.2, 106.8], [-6.9, 107.6]], checkpoints: [{ lat: -6.2, lng: 106.8, name: 'A', etaOffsetS: 0 }, { lat: -6.9, lng: 107.6, name: 'B', etaOffsetS: 7200 }] }, trip: { events }, base: 'https://x.test', t };
  it('meng-escape data dan memuat semua bagian', () => {
    const html = buildOrderReportHtml({ ...base, cost: { distKm: 100, fuelL: 12, fuelRp: 120000, tollKm: 40, tollRp: 40000, totalRp: 160000, tollSource: 'route', tollClass: 1, kmPerL: 8, fuelPriceRp: 10000 }, fuel: { fuelL: 13.4, distKm: 101, kmPerL: 7.5 } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('PT &quot;A&quot; &amp; B');
    expect(html).toContain('ordrep.sec.cost');
    expect(html).toContain('Rp 160.000');
    expect(html).toContain('13,4 L');
    expect(html).toContain('@page{size:A4');
    expect(html).toContain('ordrep.noIssues');
  });
  it('menandai tiba terlambat dan tanpa biaya/BBM menampilkan keterangan', () => {
    const html = buildOrderReportHtml(base);
    expect(html).toContain('class="sm late"');
    expect(html).toContain('ordrep.c.none');
    expect(html).toContain('ordrep.f.none');
  });
  it('satu halaman POD per bukti, foto dibatasi 4', () => {
    const pod = { kind: 'delivery', stopName: 'Toko', verifyCode: 'ABC123', integrity: 'ok', submittedAt: '2026-10-01T05:40:00Z', receiverName: 'Ani', items: [{ description: 'Beras', sentQty: 10, receivedQty: 9, unit: 'sak', reason: 'rusak' }], photoData: Array.from({ length: 6 }, () => ({ b64: 'AAAA' })), signature: 'BBBB', hash: 'h', amendmentList: [] };
    const html = buildOrderReportHtml({ ...base, pods: [pod, { ...pod, kind: 'pickup' }] });
    expect(html.match(/<section class="page">/g).length).toBe(4);
    expect(html.match(/data:image\/jpeg;base64,AAAA/g).length).toBe(8);
    expect(html).toContain('class="n late"');
  });
});
