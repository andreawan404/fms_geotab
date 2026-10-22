// Membuat "API TMS customer" palsu untuk demo: public/demo/tms-orders.json (file statis, ikut deploy Vercel).
// Pakai:  npm run demo:tms -- --plates "B 9001 SMA,B 9002 SMA,B 9003 SMA,B 9004 SMA"
// Plat harus sama dengan plat kendaraan di MyGeotab yang dipakai demo (urutan: DO jalan, DO telat, DO terjadwal, DO selesai).
// Waktu dibuat relatif terhadap SEKARANG, jadi jalankan ulang + commit + push sebelum demo (deploy ulang Vercel ~1 menit).
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const plates = String(arg('plates', 'B 9001 SMA,B 9002 SMA,B 9003 SMA,B 9004 SMA')).split(',').map((s) => s.trim());
const now = Date.now();
const iso = (min) => { const d = new Date(now + min * 60000 + 7 * 3600000); return `${d.toISOString().slice(0, 19)}+07:00`; };
const P = (name, address, lat, lng, from, to, items) => ({ type: 'PICKUP', name, address, lat, lng, eta_from: iso(from), eta_to: iso(to), items });
const D = (name, address, lat, lng, from, to, items) => ({ type: 'DELIVERY', name, address, lat, lng, eta_from: iso(from), eta_to: iso(to), items });
const goods = (name, qty, unit, weight) => [{ name, qty, unit, weight }];

const data = [
  { id: 'TMS-DEMO-1', do_number: 'DO-DEMO-001', customer_name: 'PT Maju Pangan', created_at: iso(-120), vehicle_plate: plates[0], status: 'ON_THE_WAY',
    stops: [P('Gudang Cikarang', 'Jl. Industri Cikarang, Bekasi', -6.3069, 107.1722, -90, -60, []), D('DC Bandung Timur', 'Jl. A.H. Nasution, Bandung', -6.9147, 107.6598, 60, 150, goods('Minuman kemasan', 400, 'box', 8000))] },
  { id: 'TMS-DEMO-2', do_number: 'DO-DEMO-002', customer_name: 'PT Maju Pangan', created_at: iso(-300), vehicle_plate: plates[1], status: 'ON_THE_WAY',
    stops: [P('Gudang Tangerang', 'Jl. Gatot Subroto, Tangerang', -6.1781, 106.6319, -240, -210, []), D('Toko Grosir Bekasi', 'Jl. Ahmad Yani, Bekasi', -6.2383, 106.9756, -60, 0, goods('Mie instan', 250, 'karton', 5000))] },
  { id: 'TMS-DEMO-3', do_number: 'DO-DEMO-003', customer_name: 'CV Sinar Logam', created_at: iso(-30), vehicle_plate: plates[2], status: 'NEW',
    stops: [P('Pabrik Pulogadung', 'Kawasan Industri Pulogadung, Jakarta', -6.1862, 106.9087, 30, 60, []), D('Proyek Karawang', 'Jl. Interchange Karawang Barat', -6.3158, 107.3092, 180, 270, goods('Besi beton', 120, 'batang', 12000))] },
  { id: 'TMS-DEMO-4', do_number: 'DO-DEMO-004', customer_name: 'PT Maju Pangan', created_at: iso(-600), vehicle_plate: plates[3], status: 'DELIVERED',
    stops: [P('Gudang Cibitung', 'Jl. Raya Cibitung, Bekasi', -6.2650, 107.0830, -540, -510, []), D('Minimarket Depok', 'Jl. Margonda Raya, Depok', -6.3910, 106.8230, -300, -240, goods('Snack', 300, 'box', 3000))] },
];
mkdirSync('public/demo', { recursive: true });
writeFileSync('public/demo/tms-orders.json', JSON.stringify({ data }, null, 2));
console.log(`public/demo/tms-orders.json dibuat (${data.length} DO, plat: ${plates.join(' | ')})`);
