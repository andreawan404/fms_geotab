// Template & import Excel/CSV untuk DO. Satu baris = satu item; baris dengan do_no + stop_seq sama membentuk satu stop.
import { normalizeOrder, num, validateOrder, summary } from './orders.js';
import { ymd } from './time.js';

/** Kolom template (urutan = urutan kolom di file). alias = nama header lain yang diterima (huruf kecil, tanpa simbol). */
export const COLUMNS = [
  { key: 'doNo', header: 'do_no', req: true, alias: ['dono', 'donumber', 'nodo', 'nomordo', 'orderno'], ex: ['DO-2026-0001', '', '', ''] },
  { key: 'customer', header: 'customer', req: true, alias: ['pelanggan', 'konsumen'], ex: ['PT Contoh Makmur', '', '', ''] },
  { key: 'orderDate', header: 'order_date', req: true, alias: ['tanggalorder', 'tglorder', 'tanggal'], ex: ['2026-10-20', '', '', ''] },
  { key: 'priority', header: 'priority', alias: ['prioritas'], ex: ['normal', '', '', ''] },
  { key: 'notes', header: 'notes', alias: ['catatan'], ex: ['Hubungi PIC 1 jam sebelum tiba', '', '', ''] },
  { key: 'stopSeq', header: 'stop_seq', req: true, alias: ['seq', 'urutan', 'stop', 'nostop'], ex: [1, 1, 2, 3] },
  { key: 'stopType', header: 'stop_type', req: true, alias: ['type', 'tipe', 'jenisstop'], ex: ['pickup', '', 'delivery', 'delivery'] },
  { key: 'stopName', header: 'stop_name', req: true, alias: ['namalokasi', 'lokasi', 'name'], ex: ['Gudang Cikarang', '', 'Toko Bekasi', 'Toko Bogor'] },
  { key: 'address', header: 'address', alias: ['alamat'], ex: ['Jl. Industri No. 1, Cikarang', '', 'Jl. Raya Bekasi No. 20', 'Jl. Pajajaran No. 5, Bogor'] },
  { key: 'lat', header: 'lat', alias: ['latitude'], ex: [-6.3062, '', -6.2383, -6.5944] },
  { key: 'lng', header: 'lng', alias: ['lon', 'long', 'longitude'], ex: [107.1722, '', 106.9756, 106.7892] },
  { key: 'radiusM', header: 'radius_m', alias: ['radius'], ex: [150, '', 150, 200] },
  { key: 'windowStart', header: 'window_start', alias: ['mulai', 'windowfrom'], ex: ['2026-10-20 08:00', '', '2026-10-20 10:00', '2026-10-20 13:00'] },
  { key: 'windowEnd', header: 'window_end', alias: ['selesai', 'windowto'], ex: ['2026-10-20 09:00', '', '2026-10-20 12:00', '2026-10-20 16:00'] },
  { key: 'contactName', header: 'contact_name', alias: ['kontak', 'namakontak', 'pic'], ex: ['Budi', '', 'Sari', 'Andi'] },
  { key: 'contactPhone', header: 'contact_phone', alias: ['telepon', 'telp', 'hp', 'phone'], ex: ['0812-0000-0001', '', '0812-0000-0002', '0812-0000-0003'] },
  { key: 'instructions', header: 'instructions', alias: ['instruksi', 'catatanlokasi'], ex: ['Masuk lewat gerbang B', '', '', 'Bongkar di dock 2'] },
  { key: 'description', header: 'item_desc', req: true, alias: ['item', 'barang', 'deskripsi', 'description', 'namabarang'], ex: ['Air mineral 600ml', 'Mie instan', 'Air mineral 600ml', 'Mie instan'] },
  { key: 'sku', header: 'sku', alias: ['kodebarang'], ex: ['AM-600', 'MI-01', 'AM-600', 'MI-01'] },
  { key: 'qty', header: 'qty', req: true, alias: ['jumlah', 'quantity'], ex: [200, 100, 200, 100] },
  { key: 'unit', header: 'unit', alias: ['satuan', 'uom'], ex: ['box', 'box', 'box', 'box'] },
  { key: 'weightKg', header: 'weight_kg', alias: ['berat', 'beratkg', 'weight'], ex: [2400, 800, 2400, 800] },
  { key: 'volumeM3', header: 'volume_m3', alias: ['volume', 'vol'], ex: [9, 4, 9, 4] },
  { key: 'pallets', header: 'pallets', alias: ['pallet', 'palet'], ex: [4, 2, 4, 2] },
  { key: 'colli', header: 'colli', alias: ['koli'], ex: [200, 100, 200, 100] },
  { key: 'lengthCm', header: 'length_cm', alias: ['panjang', 'panjangcm', 'length'], ex: [120, 100, 120, 100] },
  { key: 'widthCm', header: 'width_cm', alias: ['lebar', 'lebarcm', 'width'], ex: [100, 80, 100, 80] },
  { key: 'heightCm', header: 'height_cm', alias: ['tinggi', 'tinggicm', 'height'], ex: [110, 90, 110, 90] },
  { key: 'category', header: 'category', alias: ['kategori'], ex: ['food', 'food', 'food', 'food'] },
  { key: 'tempMin', header: 'temp_min', alias: ['suhumin'], ex: ['', '', '', ''] },
  { key: 'tempMax', header: 'temp_max', alias: ['suhumax'], ex: ['', '', '', ''] },
  { key: 'hazardous', header: 'hazardous', alias: ['berbahaya', 'b3', 'dg'], ex: ['tidak', 'tidak', 'tidak', 'tidak'] },
  { key: 'stackable', header: 'stackable', alias: ['bisaditumpuk', 'tumpuk'], ex: ['ya', 'ya', 'ya', 'ya'] },
];

const HINTS = {
  do_no: 'Nomor DO unik. Boleh dikosongkan pada baris lanjutan (mengikuti baris di atasnya).',
  stop_seq: 'Urutan stop dalam DO: 1, 2, 3, ... Baris dengan do_no dan stop_seq sama = satu stop dengan beberapa item.',
  stop_type: 'pickup (muat) atau delivery (bongkar). Stop pertama harus pickup, stop terakhir delivery.',
  lat: 'Koordinat desimal (mis. -6.2383). Boleh kosong saat draft, wajib sebelum ditawarkan ke vendor.',
  window_start: 'Format YYYY-MM-DD HH:mm (waktu lokal) atau sel tanggal Excel.',
  weight_kg: 'Berat TOTAL baris item (bukan per unit), dalam kg.',
  volume_m3: 'Volume TOTAL baris item (m3).',
  hazardous: 'ya / tidak',
  stackable: 'ya / tidak (default ya)',
  qty: 'Jumlah unit, lebih dari 0.',
};

const keyOf = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_MAP = new Map();
for (const c of COLUMNS) for (const a of [keyOf(c.header), keyOf(c.key), ...c.alias]) HEADER_MAP.set(a, c.key);

/** Isi sheet template: baris judul + contoh 1 DO (1 pickup, 2 delivery). */
export function templateRows() {
  const head = COLUMNS.map((c) => c.header);
  const rows = [0, 1, 2, 3].map((i) => COLUMNS.map((c) => c.ex[i]));
  return [head, ...rows];
}
/** Sheet petunjuk: kolom, wajib/opsional, penjelasan. */
export function guideRows() {
  return [['kolom', 'wajib', 'keterangan'], ...COLUMNS.map((c) => [c.header, c.req ? 'ya' : 'tidak', HINTS[c.header] || ''])];
}

const TYPE_MAP = { pickup: 'pickup', muat: 'pickup', ambil: 'pickup', load: 'pickup', p: 'pickup', delivery: 'delivery', bongkar: 'delivery', kirim: 'delivery', unload: 'delivery', d: 'delivery' };

function toDate(v) {
  if (v == null || v === '') return { ok: true, date: null };
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? { ok: false } : { ok: true, date: v };
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (!m) {
    const d = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
    if (d) m = [d[0], d[3], d[2], d[1], d[4], d[5]];
  }
  if (!m) return { ok: false };
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
  return date.getMonth() !== Number(m[2]) - 1 ? { ok: false } : { ok: true, date };
}
const dateOnly = (d) => ymd(d);
const hasTime = (v) => v instanceof Date || /[ T]\d{1,2}:\d{2}/.test(String(v));

/**
 * Baris tabel (baris pertama = header) -> DO. Mengembalikan { orders, issues, columns }.
 * issues: [{ row, field, code, value }] (row = nomor baris di file, mulai 1). orders[i]._rows = nomor baris asal.
 */
export function rowsToOrders(rows) {
  const issues = [];
  const head = (rows[0] || []).map((h) => HEADER_MAP.get(keyOf(h)) || null);
  const missing = COLUMNS.filter((c) => c.req && !head.includes(c.key)).map((c) => c.header);
  if (missing.length) return { orders: [], issues: [{ row: 1, field: missing.join(', '), code: 'missing_columns' }], columns: head };
  const byDo = new Map();
  let lastDo = '', lastSeq = '';
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r] || [];
    if (!raw.some((v) => v != null && String(v).trim() !== '')) continue;
    const rec = {};
    head.forEach((k, i) => { if (k) rec[k] = raw[i]; });
    const rowNo = r + 1;
    let doNo = String(rec.doNo ?? '').trim() || lastDo;
    if (!doNo) { issues.push({ row: rowNo, field: 'do_no', code: 'do_no_missing' }); continue; }
    if (doNo !== lastDo) lastSeq = '';
    const seqRaw = rec.stopSeq == null || String(rec.stopSeq).trim() === '' ? lastSeq : rec.stopSeq;
    const seq = num(seqRaw);
    if (seq == null || !Number.isInteger(seq) || seq < 1) { issues.push({ row: rowNo, field: 'stop_seq', code: 'seq_invalid', value: seqRaw }); continue; }
    lastDo = doNo; lastSeq = seq;
    if (!byDo.has(doNo)) byDo.set(doNo, { head: {}, stops: new Map(), rows: [] });
    const o = byDo.get(doNo);
    o.rows.push(rowNo);
    for (const k of ['customer', 'priority', 'notes']) if (o.head[k] == null && rec[k] != null && String(rec[k]).trim() !== '') o.head[k] = rec[k];
    if (o.head.orderDate == null && rec.orderDate != null && String(rec.orderDate).trim() !== '') {
      const d = toDate(rec.orderDate);
      if (!d.ok) issues.push({ row: rowNo, field: 'order_date', code: 'date_invalid', value: rec.orderDate });
      else o.head.orderDate = dateOnly(d.date);
    }
    if (!o.stops.has(seq)) o.stops.set(seq, { seq, items: [], rows: [] });
    const st = o.stops.get(seq);
    st.rows.push(rowNo);
    for (const k of ['stopName', 'address', 'contactName', 'contactPhone', 'instructions']) {
      const t = { stopName: 'name' }[k] || k;
      if (st[t] == null && rec[k] != null && String(rec[k]).trim() !== '') st[t] = String(rec[k]).trim();
    }
    if (st.type == null && rec.stopType != null && String(rec.stopType).trim() !== '') {
      const t = TYPE_MAP[String(rec.stopType).trim().toLowerCase()];
      if (!t) issues.push({ row: rowNo, field: 'stop_type', code: 'type_invalid', value: rec.stopType });
      else st.type = t;
    }
    for (const [k, f] of [['lat', 'lat'], ['lng', 'lng'], ['radiusM', 'radius_m']]) {
      if (st[k] == null && rec[k] != null && String(rec[k]).trim() !== '') {
        const n = num(rec[k]);
        if (Number.isNaN(n)) issues.push({ row: rowNo, field: f, code: 'number_invalid', value: rec[k] });
        else st[k] = n;
      }
    }
    for (const [k, f] of [['windowStart', 'window_start'], ['windowEnd', 'window_end']]) {
      if (st[k] == null && rec[k] != null && String(rec[k]).trim() !== '') {
        const d = toDate(rec[k]);
        if (!d.ok || !hasTime(rec[k])) issues.push({ row: rowNo, field: f, code: 'date_invalid', value: rec[k] instanceof Date ? 'date' : rec[k] });
        else st[k] = d.date.toISOString();
      }
    }
    const item = {};
    for (const k of ['description', 'sku', 'unit', 'category', 'hazardous', 'stackable']) if (rec[k] != null && String(rec[k]).trim() !== '') item[k] = rec[k];
    for (const [k, f] of [['qty', 'qty'], ['weightKg', 'weight_kg'], ['volumeM3', 'volume_m3'], ['pallets', 'pallets'], ['colli', 'colli'], ['lengthCm', 'length_cm'], ['widthCm', 'width_cm'], ['heightCm', 'height_cm'], ['tempMin', 'temp_min'], ['tempMax', 'temp_max']]) {
      if (rec[k] != null && String(rec[k]).trim() !== '') {
        const n = num(rec[k]);
        if (Number.isNaN(n)) issues.push({ row: rowNo, field: f, code: 'number_invalid', value: rec[k] });
        else item[k] = n;
      }
    }
    if (item.description || item.qty != null) st.items.push(item);
  }
  const orders = [];
  for (const [doNo, o] of byDo) {
    const stops = [...o.stops.values()].sort((a, b) => a.seq - b.seq).map((s) => ({ ...s, type: s.type || '', name: s.name || '' }));
    orders.push({ ...normalizeOrder({ doNo, ...o.head, stops }), _rows: o.rows });
  }
  return { orders, issues, columns: head };
}

/** Validasi hasil import: tiap DO diberi errors/warnings; DO yang sudah ada (existing: Set nomor DO) ditandai duplicate. */
export function checkImport(parsed, existing = new Set()) {
  const seen = new Set();
  const out = parsed.orders.map((o) => {
    const v = validateOrder(o);
    const rowIssues = parsed.issues.filter((i) => o._rows.includes(i.row));
    const dup = existing.has(o.doNo) || seen.has(o.doNo);
    seen.add(o.doNo);
    const status = rowIssues.length || v.errors.length ? 'error' : dup ? 'duplicate' : 'ok';
    return { order: o, errors: v.errors, warnings: v.warnings, rowIssues, duplicate: dup, status, summary: summary(o) };
  });
  const global = parsed.issues.filter((i) => !parsed.orders.some((o) => o._rows.includes(i.row)));
  return { items: out, global, counts: { ok: out.filter((x) => x.status === 'ok').length, error: out.filter((x) => x.status === 'error').length, duplicate: out.filter((x) => x.status === 'duplicate').length } };
}
