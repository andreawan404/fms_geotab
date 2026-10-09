// Sumber tunggal riwayat versi. Dipakai oleh: halaman Pengaturan (Tentang), config.json (versi),
// dan CHANGELOG.md (dibuat otomatis oleh `npm run changelog`). Entri terbaru di paling atas.
export const CHANGELOG = [
  {
    v: '1.8.0',
    date: '2026-10-09',
    id: [
      'Laporan: kolom Idle % (idle / (waktu jalan + idle)) di Ringkasan armada dan Trip, ikut ke CSV.',
      'Idle % di atas batas (Pengaturan, default 20%) disorot merah untuk menemukan kendaraan/trip yang boros karena mesin menyala saat diam.',
    ],
    en: [
      'Reports: Idle % column (idle / (driving time + idle)) in Fleet summary and Trips, included in CSV.',
      'Idle % above the limit (Settings, default 20%) is highlighted red to spot vehicles/trips wasting fuel with the engine on while stationary.',
    ],
  },
  {
    v: '1.7.0',
    date: '2026-10-09',
    id: [
      'Laporan > tab Benchmark: fuel economy per rute dan per sopir, dibandingkan dengan rata-rata armada (selisih %), penanda boros/hemat (>= 15% dan jarak >= 20 km).',
      'Menampilkan jumlah penugasan, jarak, engine hour, fuel, deviasi, dan kepatuhan per kelompok; ekspor CSV. Sopir mengikuti sopir yang ditugaskan.',
    ],
    en: [
      'Reports > Benchmark tab: fuel economy by route and by driver compared with the fleet average (% difference), with high-use / efficient flags (>= 15% and distance >= 20 km).',
      'Shows assignment count, distance, engine hour, fuel, deviations and compliance per group; CSV export. Driver follows the assigned driver.',
    ],
  },
  {
    v: '1.6.0',
    date: '2026-10-09',
    id: [
      'Alert baru: kendaraan terlambat ke titik awal (belum tiba N menit setelah jadwal mulai). Batas diatur di Pengaturan (default 10 menit, 0 = nonaktif) dan bisa per rute.',
      'Alert juga muncul bila kendaraan offline / tidak mengirim posisi, serta saat kendaraan tiba terlambat. Fase Monitor menampilkan "Terlambat ke titik awal"; notifikasi tersimpan seperti alert lain.',
    ],
    en: [
      'New alert: vehicle late to the start point (not arrived N minutes after the scheduled start). Limit set in Settings (default 10 min, 0 = off) and overridable per route.',
      'The alert also fires when a vehicle is offline / not reporting, and when it arrives late. Monitor phase shows "Late to start"; notifications are persisted like other alerts.',
    ],
  },
  {
    v: '1.5.0',
    date: '2026-10-09',
    id: [
      'Laporan > Ringkasan armada: kolom Engine hour, Fuel used, Fuel economy per kendaraan + KPI total armada (economy hanya dari kendaraan yang punya data fuel).',
      'Laporan > Trip: kolom Engine hour, Fuel used, Fuel economy per trip.',
      'Ekspor CSV ikut berisi kolom baru (jam, liter, km/L, L/100km, penanda perkiraan). Data sensor dibaca per kendaraan dengan paging otomatis.',
    ],
    en: [
      'Reports > Fleet summary: Engine hour, Fuel used and Fuel economy columns per vehicle + fleet-wide KPIs (economy only from vehicles with fuel data).',
      'Reports > Trips: Engine hour, Fuel used and Fuel economy columns per trip.',
      'CSV export includes the new columns (hours, litres, km/L, L/100km, estimate flag). Sensor data is read per vehicle with automatic paging.',
    ],
  },
  {
    v: '1.4.0',
    date: '2026-10-09',
    id: [
      'Monitor > detail penugasan: kartu Engine hour, Fuel used, dan Fuel economy untuk seluruh penugasan.',
      'Daftar deviasi: kolom Engine hour, Fuel used, dan Fuel economy per segmen deviasi (pakai jarak di luar koridor); "~" = perkiraan, "-" = tidak ada sensor / data kurang.',
      'Detail penugasan kini juga membaca log GPS sejak 30 menit sebelum jadwal sehingga fase "Di titik awal" akurat.',
    ],
    en: [
      'Monitor > assignment detail: Engine hour, Fuel used and Fuel economy cards for the whole assignment.',
      'Deviation list: Engine hour, Fuel used and Fuel economy columns per deviation segment (uses distance outside the corridor); "~" = estimate, "-" = no sensor / not enough data.',
      'Assignment detail now also reads GPS logs from 30 minutes before the schedule so the "At start point" phase is accurate.',
    ],
  },
  {
    v: '1.3.0',
    date: '2026-10-09',
    id: [
      'Layer data sensor: engine hour dan fuel dihitung dari selisih counter StatusData Geotab (interpolasi, penanda perkiraan "~", tahan counter reset).',
      'Pengaturan > Sensor: ID diagnostik bisa diubah, satuan fuel economy (km/L atau L/100 km), dan tombol Cek sensor untuk melihat kendaraan mana yang punya data.',
    ],
    en: [
      'Sensor data layer: engine hour and fuel computed from StatusData counter differences (interpolated, "~" approximate marker, counter-reset safe).',
      'Settings > Sensors: editable diagnostic IDs, fuel economy unit (km/L or L/100 km), and a Check sensors button showing which vehicles have data.',
    ],
  },
  {
    v: '1.2.0',
    date: '2026-10-09',
    id: ['Logo SMA baru (SVG) sebagai icon menu MyGeotab, header add-in, dan halaman host.', 'Riwayat versi tampil di Pengaturan > Tentang; CHANGELOG.md dibuat otomatis dari satu sumber.'],
    en: ['New SMA logo (SVG) as the MyGeotab menu icon, add-in header and host page.', 'Version history shown in Settings > About; CHANGELOG.md is generated from a single source.'],
  },
  {
    v: '1.1.0',
    date: '2026-10-09',
    id: [
      'Fase tugas di Monitor: Menuju titik awal, Di titik awal, Dalam perjalanan, Selesai (dengan jam tiba/selesai).',
      'Event & notifikasi baru: kendaraan sudah berada di titik awal, dan penugasan selesai (feed, toast, notifikasi browser, tersimpan).',
      'Kedatangan di titik awal terdeteksi sejak 30 menit sebelum jadwal mulai (deviasi tetap baru dinilai setelah jadwal mulai).',
    ],
    en: [
      'Task phase in Monitor: Heading to start, At start point, En route, Finished (with arrival/finish time).',
      'New events & notifications: vehicle reached the start point, and assignment completed (feed, toast, browser notification, persisted).',
      'Arrival at the start point is detected from 30 minutes before the scheduled start (deviation is still only judged after the start).',
    ],
  },
  {
    v: '1.0.1',
    date: '2026-10-09',
    id: [
      'Perbaikan kompatibilitas MyGeotab: halaman add-in kini dokumen HTML lengkap dengan <body> (syarat MyGeotab), bundle disisipkan inline.',
      'Leaflet add-in tidak lagi menimpa window.L milik MyGeotab; terdaftar di beberapa nama namespace; error inisialisasi tampil di halaman.',
      'Hosting di Vercel (vercel.json, header CORS/charset, tanpa cache untuk file add-in).',
    ],
    en: [
      'MyGeotab compatibility fixes: the add-in page is now a full HTML document with <body> (required by MyGeotab); bundle is inlined.',
      'The add-in Leaflet no longer overwrites MyGeotab\'s window.L; registered under several namespace names; init errors are shown on the page.',
      'Vercel hosting (vercel.json, CORS/charset headers, no caching for add-in files).',
    ],
  },
  {
    v: '1.0.0',
    date: '2026-10-08',
    id: [
      'MVP: daftar kendaraan, peta posisi, rute dari beberapa checkpoint (rekomendasi peta atau gambar sendiri), lebar koridor per rute.',
      'Alert keluar rute (debounce), laporan FMS per rentang waktu, penugasan rute harian/terjadwal (kendaraan + sopir, deteksi bentrok).',
      'Tambahan: toleransi alert, status checkpoint, laporan kepatuhan rute, replay rencana vs aktual, status penugasan. UI dwibahasa ID/EN.',
    ],
    en: [
      'MVP: vehicle list, position map, multi-checkpoint routes (map-recommended or hand-drawn), per-route corridor width.',
      'Off-route alerts (debounced), FMS reports by time range, daily/planned route assignment (vehicle + driver, conflict detection).',
      'Extras: alert tolerance, checkpoint status, route compliance report, planned-vs-actual replay, assignment status. Bilingual ID/EN UI.',
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].v;
