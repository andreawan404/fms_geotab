// Sumber tunggal riwayat versi. Dipakai oleh: halaman Pengaturan (Tentang), config.json (versi),
// dan CHANGELOG.md (dibuat otomatis oleh `npm run changelog`). Entri terbaru di paling atas.
export const CHANGELOG = [
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
