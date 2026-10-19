import { describe, it, expect } from 'vitest';
import { emptyOrder, normalizeOrder, validateOrder, totals, dispatchBlockers, summary } from '../src/core/orders.js';
import { readXlsx, writeXlsx, parseCsv } from '../src/core/xlsx.js';
import { templateRows, guideRows, rowsToOrders, checkImport } from '../src/core/orderImport.js';

const item = (o = {}) => ({ description: 'Barang', qty: 10, unit: 'box', weightKg: 100, volumeM3: 1, pallets: 1, colli: 10, ...o });
const mk = (stops, head = {}) => normalizeOrder({ doNo: 'DO-1', customer: 'PT A', orderDate: '2026-10-20', priority: 'normal', stops, ...head });
const stop = (type, name, items, o = {}) => ({ type, name, items, lat: -6.2, lng: 106.8, ...o });
const codes = (r) => r.errors.map((e) => e.code);

describe('validasi DO', () => {
  it('DO valid 1 pickup + 2 delivery', () => {
    const o = mk([stop('pickup', 'A', [item({ weightKg: 300, pallets: 3 })]), stop('delivery', 'B', [item({ weightKg: 100, pallets: 1 })]), stop('delivery', 'C', [item({ weightKg: 200, pallets: 2 })])]);
    const r = validateOrder(o);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it('aturan dasar: nomor DO, customer, stop minimum, urutan tipe', () => {
    expect(codes(validateOrder(normalizeOrder({ stops: [] })))).toEqual(expect.arrayContaining(['do_no_required', 'customer_required', 'stops_min']));
    const r = validateOrder(mk([stop('delivery', 'A', [item()]), stop('pickup', 'B', [item()])]));
    expect(codes(r)).toEqual(expect.arrayContaining(['first_pickup', 'last_delivery']));
    expect(codes(validateOrder(mk([stop('pickup', 'A', [item()]), stop('delivery', 'B', [item()])], { doNo: 'DO 1!' })))).toContain('do_no_format');
  });
  it('item, angka, koordinat, jendela waktu, suhu', () => {
    const r = validateOrder(mk([
      stop('pickup', '', [item({ description: '', qty: 0, weightKg: -1 })], { lat: 95, lng: 106 }),
      stop('delivery', 'B', [item({ tempMin: 10, tempMax: 5 })], { windowStart: '2026-10-20T10:00:00Z', windowEnd: '2026-10-20T09:00:00Z', radiusM: 5 }),
    ]));
    expect(codes(r)).toEqual(expect.arrayContaining(['stop_name_required', 'item_desc_required', 'qty_positive', 'num_negative', 'latlng_invalid', 'window_order', 'temp_order', 'radius_invalid']));
  });
  it('tanpa koordinat = peringatan; muatan bongkar melebihi muat = peringatan', () => {
    const o = mk([stop('pickup', 'A', [item({ weightKg: 100 })], { lat: null, lng: null }), stop('delivery', 'B', [item({ weightKg: 500 })])]);
    const r = validateOrder(o);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['no_coords', 'cargo_exceeds']));
    expect(dispatchBlockers(o).map((b) => b.code)).toContain('need_coords');
  });
});

describe('total kapasitas', () => {
  it('beban puncak mengikuti pickup/delivery di sepanjang rute (multi-leg)', () => {
    // A muat 300, B bongkar 100, C muat 200 (total di truk 400), D bongkar 400
    const o = mk([
      stop('pickup', 'A', [item({ weightKg: 300, pallets: 3 })]),
      stop('delivery', 'B', [item({ weightKg: 100, pallets: 1 })]),
      stop('pickup', 'C', [item({ weightKg: 200, pallets: 2 })]),
      stop('delivery', 'D', [item({ weightKg: 400, pallets: 4 })]),
    ]);
    const t = totals(o);
    expect(t.loadedWeight).toBe(500);
    expect(t.peakWeight).toBe(400);
    expect(t.peakPallets).toBe(4);
    expect(t.legs).toBe(3);
    expect(summary(o)).toMatchObject({ origin: 'A', destination: 'D' });
  });
  it('B3, tidak bisa ditumpuk, konflik suhu, dimensi terbesar', () => {
    const o = mk([
      stop('pickup', 'A', [item({ hazardous: true, tempMin: 2, tempMax: 8, lengthCm: 120, heightCm: 90 }), item({ stackable: false, tempMin: 10, tempMax: 15, lengthCm: 80, heightCm: 150 })]),
      stop('delivery', 'B', [item()]),
    ]);
    const t = totals(o);
    expect(t.hazardous).toBe(true);
    expect(t.unstackable).toBe(true);
    expect(t.tempConflict).toBe(true);
    expect(t.maxLengthCm).toBe(120);
    expect(t.maxHeightCm).toBe(150);
  });
  it('DO kosong dari emptyOrder punya 2 stop', () => {
    expect(emptyOrder().stops.map((s) => s.type)).toEqual(['pickup', 'delivery']);
  });
});

describe('xlsx & import', () => {
  it('tulis lalu baca kembali (teks, angka, karakter khusus, sheet bernama)', () => {
    const bytes = writeXlsx([{ name: 'Petunjuk', rows: [['a']] }, { name: 'DO', rows: [['h1', 'h2', 'h3'], ['x & <y> "z"', 12.5, true], [null, 'baris 3', '']], widths: [10, 10, 10] }]);
    const rows = readXlsx(bytes);
    expect(rows[0]).toEqual(['h1', 'h2', 'h3']);
    expect(rows[1][0]).toBe('x & <y> "z"');
    expect(rows[1][1]).toBe(12.5);
    expect(rows[1][2]).toBe(true);
    expect(rows[2][1]).toBe('baris 3');
  });
  it('CSV: kutip, titik koma, baris kosong', () => {
    expect(parseCsv('a;b;c\n"x;1";2;"he said ""hi"""\n')).toEqual([['a', 'b', 'c'], ['x;1', '2', 'he said "hi"']]);
  });
  it('template contoh dapat diimport tanpa error (1 DO, 3 stop, multi item)', () => {
    const rows = readXlsx(writeXlsx([{ name: 'DO', rows: templateRows() }, { name: 'Petunjuk', rows: guideRows() }]));
    const parsed = rowsToOrders(rows);
    expect(parsed.issues).toEqual([]);
    expect(parsed.orders.length).toBe(1);
    const o = parsed.orders[0];
    expect(o.stops.map((s) => s.type)).toEqual(['pickup', 'delivery', 'delivery']);
    expect(o.stops[0].items.length).toBe(2); // baris lanjutan (stop_seq 1) = item kedua stop pertama
    expect(o.stops[0].name).toBe('Gudang Cikarang');
    expect(o.stops[0].windowStart).toBe(new Date(2026, 9, 20, 8, 0).toISOString());
    const chk = checkImport(parsed);
    expect(chk.counts).toEqual({ ok: 1, error: 0, duplicate: 0 });
  });
  it('import menandai header kurang, angka/tanggal salah, tipe salah, dan nomor DO ganda', () => {
    expect(rowsToOrders([['foo', 'bar']]).issues[0].code).toBe('missing_columns');
    const head = ['do_no', 'customer', 'order_date', 'stop_seq', 'stop_type', 'stop_name', 'item_desc', 'qty', 'weight_kg', 'window_start'];
    const rows = [head,
      ['DO-9', 'PT A', '2026-10-20', 1, 'muat', 'A', 'Brg', 5, 'abc', ''],
      ['', '', '', 2, 'bongkar', 'B', 'Brg', 5, 10, '20/10/2026'],
      ['DO-8', 'PT B', '2026-10-20', 1, 'pickup', 'A', 'Brg', 1, 1, ''],
      ['DO-8', '', '', 2, 'delivery', 'B', 'Brg', 1, 1, ''],
    ];
    const parsed = rowsToOrders(rows);
    expect(parsed.issues.map((i) => `${i.row}:${i.code}`)).toEqual(expect.arrayContaining(['2:number_invalid', '3:date_invalid']));
    const chk = checkImport(parsed, new Set(['DO-8']));
    expect(chk.items.find((x) => x.order.doNo === 'DO-9').status).toBe('error');
    expect(chk.items.find((x) => x.order.doNo === 'DO-8').status).toBe('duplicate');
  });
});

import { genDoNo } from '../src/core/orders.js';
describe('genDoNo', () => {
  it('membentuk nomor dari waktu dan nama customer', () => {
    expect(genDoNo('PT Contoh Makmur', new Date(2026, 9, 19, 15, 48, 54))).toBe('DO-20261019-154854-PTCONTOH');
  });
  it('kosong bila customer kosong dan lolos format validasi', () => {
    expect(genDoNo('  ', new Date())).toBe('');
    expect(genDoNo('CV. Sumber Jaya & Co', new Date(2026, 0, 2, 3, 4, 5))).toMatch(/^[A-Za-z0-9][A-Za-z0-9\-_/.]{0,39}$/);
  });
});
