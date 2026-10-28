// Sumber tunggal riwayat versi. Dipakai oleh: halaman Pengaturan (Tentang), config.json (versi),
// dan CHANGELOG.md (dibuat otomatis oleh `npm run changelog`). Entri terbaru di paling atas.
export const CHANGELOG = [
  {
    v: '3.8.0',
    date: '2026-10-28',
    id: [
      'Laporan DO siap cetak (A4) per DO: tombol "Laporan" di daftar Order (status berjalan/selesai) dan di Bukti Pengiriman. Berisi kop SMA-TRACK, ringkasan DO, muatan per titik dengan jam tiba aktual, plot jalur rute (garis rute + nomor titik di atas kotak koordinat, tanpa peta), ETA, perkiraan biaya (BBM + tol), BBM terpakai aktual, linimasa perjalanan, kendala, kolom tanda tangan, dan satu halaman per POP/POD lengkap dengan foto yang diperkecil agar muat.',
      'BBM terpakai dihitung dari sensor BBM Geotab selama perjalanan (kendaraan harus tertaut ke Geotab); bila tidak tersedia, laporan menampilkan keterangan. Angka biaya dan BBM disimpan sebagai snapshot di DO (tombol "Hitung ulang biaya & BBM" untuk memperbarui).',
      'Database: kolom baru orders.cost (migrasi 14); aksi baru save_calc di /api/dispatch (tanpa menambah fungsi serverless).',
    ],
    en: [
      'Printable A4 report per DO: "Report" button in the Orders list (running/done) and in Delivery Evidence. Includes the SMA-TRACK letterhead, DO summary, cargo per stop with actual arrival times, a route plot (route line + numbered stops on a coordinate grid, no map tiles), ETA, estimated cost (fuel + toll), actual fuel used, trip timeline, issues, signature block, and one page per POP/POD with photos resized to fit.',
      'Fuel used comes from the Geotab fuel sensor during the trip (the vehicle must be linked to Geotab); when unavailable the report says so. Cost and fuel figures are stored as a snapshot on the DO ("Recalculate cost & fuel" refreshes them).',
      'Database: new orders.cost column (migration 14); new save_calc action in /api/dispatch (no extra serverless function).',
    ],
  },
  {
    v: '3.7.0',
    date: '2026-10-27',
    id: [
      'Perkiraan biaya perjalanan (BBM + tol) di editor rute DO, menu Rute, dan dialog Alokasi (saat memilih kendaraan). Pilih kendaraan untuk memakai konsumsi BBM dan golongan tolnya.',
      'Konsumsi BBM (km/L) diambil dari data aktual GPS Geotab 30 hari terakhir kendaraan tersebut; bila tidak ada, dari isian di data kendaraan (kolom baru "Konsumsi BBM (km/L)"), atau diisi manual.',
      'Tol: ruas tol dideteksi dari mesin rute (OSRM dan OpenRouteService), dikalikan tarif per km menurut golongan kendaraan (kolom baru "Golongan tol", otomatis dari jenis kendaraan). Nilai tol dapat ditimpa manual. Harga BBM dan tarif tol diatur di Pengaturan > Perkiraan biaya perjalanan.',
      'Tabel ETA dirapikan agar muat di panel sempit.',
    ],
    en: [
      'Trip cost estimate (fuel + toll) in the DO route editor, the Routes menu and the Allocation dialog (when picking a vehicle). Pick a vehicle to use its fuel economy and toll class.',
      'Fuel economy (km/L) comes from the vehicle\'s actual Geotab GPS data over the last 30 days; otherwise from the new "Fuel economy (km/L)" vehicle field, or manual entry.',
      'Toll: toll sections are detected from the routing engine (OSRM and OpenRouteService) and multiplied by a per-km rate by vehicle class (new "Toll class" vehicle field, automatic from vehicle type). The toll can be overridden manually. Fuel price and toll rates are set in Settings > Trip cost estimate.',
      'The ETA table was tidied to fit narrow panels.',
    ],
  },
  {
    v: '3.6.1',
    date: '2026-10-27',
    id: ['Tabel ETA di editor Rute kini memakai ETA per checkpoint yang tersimpan dari mesin routing (sama dengan angka di daftar rute), bukan perkiraan kecepatan rata-rata. Perkiraan hanya dipakai bila checkpoint diubah atau rute digambar manual.'],
    en: ['The ETA table in the Route editor now uses the per-checkpoint ETA stored from the routing engine (matching the route list) instead of an average-speed estimate. The estimate is only used when checkpoints are edited or the route is drawn manually.'],
  },
  {
    v: '3.6.0',
    date: '2026-10-27',
    id: [
      'Armada internal: vendor dapat ditandai "Armada internal" (kendaraan dan driver milik sendiri). Di dialog Alokasi ada pilihan baru "Armada internal" untuk mengalokasikan DO langsung ke kendaraan dan driver sendiri tanpa penawaran email.',
      'Tautan perjalanan driver kini dibuat otomatis saat alokasi langsung (sebelumnya driver tidak punya tautan portal). Tautan bisa disalin, dibuka lewat WhatsApp, atau dikirim otomatis ke driver (WhatsApp) dan ke email vendor eksternal. Tersedia tombol "Buat tautan baru" bila tautan hilang atau driver diganti.',
      'ETA per titik: editor rute DO dan menu Rute kini menampilkan tabel jarak, waktu tempuh, waktu sejak berangkat, dan jam tiba tiap titik beserta total rute. Titik yang diperkirakan lewat dari jendela waktu diberi penanda. Di menu Rute, isi jam berangkat untuk melihat jam tiba.',
      'Statistik penawaran vendor di Dashboard tidak lagi menghitung alokasi langsung.',
    ],
    en: [
      'Internal fleet: a vendor can be flagged "Internal fleet" (own vehicles and drivers). The Allocation dialog has a new "Internal fleet" option to assign a DO straight to your own vehicle and driver without an email offer.',
      'A driver trip link is now created automatically on direct assignment (previously the driver had no portal link). The link can be copied, opened via WhatsApp, or sent automatically to the driver (WhatsApp) and the external vendor email. A "Create new link" button covers lost links or driver changes.',
      'Per-point ETA: the DO route editor and the Routes menu now show distance, drive time, time since departure and arrival clock for every point, plus the route total. Points predicted to fall outside their time window are flagged. In Routes, enter a departure time to see arrival clocks.',
      'Vendor offer statistics on the Dashboard no longer count direct assignments.',
    ],
  },
  {
    v: '3.5.2',
    date: '2026-10-24',
    id: ['Isi halaman Dashboard kini selebar halaman lain (Armada, Order, dan seterusnya), tidak lagi terpusat dengan batas lebar.'],
    en: ['The Dashboard page content now spans the full width like the other pages (Fleet, Orders and so on) instead of being centred with a width cap.'],
  },
  {
    v: '3.5.1',
    date: '2026-10-24',
    id: [
      'Menu utama dirapikan: "Kinerja DO" menjadi "Dashboard" (paling kiri), "Penugasan" menjadi "Kalender", dan "Bukti" menjadi "Bukti Pengiriman".',
      'Menu "Laporan" kini punya sub-menu: Laporan Armada, Bukti Pengiriman, dan Exception (badge exception terbuka tampil di menu Laporan).',
    ],
    en: [
      'Main menu tidied up: "DO Performance" is now "Dashboard" (first), "Assignments" is now "Calendar", and "Evidence" is now "Delivery Proof".',
      'The "Reports" menu now has a sub-menu: Fleet Reports, Delivery Proof and Exceptions (the open-exception badge shows on Reports).',
    ],
  },
  {
    v: '3.5.0',
    date: '2026-10-24',
    id: [
      'Menu Kinerja DO menjadi dashboard dengan slicer tanggal (7/30/90 hari, bulan ini, bulan lalu, atau rentang kustom). Seluruh angka, grafik, dan tabel mengikuti rentang yang dipilih.',
      'KPI utama kini dibandingkan dengan periode sebelumnya yang sama panjang. KPI operasional baru: stop terlambat, rata-rata dan terparah keterlambatan, waktu penyelesaian exception, muatan terkirim, efisiensi BBM (km/L), tren tepat waktu per hari, sebaran status DO, dan customer teratas.',
    ],
    en: [
      'The DO Performance menu is now a dashboard with a date slicer (7/30/90 days, this month, last month or a custom range). Every figure, chart and table follows the selected range.',
      'Headline KPIs are compared with the previous period of the same length. New operational KPIs: late stops, average and worst delay, exception resolution time, delivered load, fuel efficiency (km/L), daily on-time trend, DO status mix and top customers.',
    ],
  },
  {
    v: '3.4.1',
    date: '2026-10-23',
    id: [
      'Rute manual di form DO untuk dispatcher yang punya rute lain. Kartu "Rute pengiriman" kini punya pilihan Otomatis (rekomendasi peta, bisa pilih rute alternatif) atau Manual (gambar sendiri).',
      'Mode Manual: klik peta untuk menambah titik jalur, seret titik untuk menggeser, klik kanan untuk menghapus, "Tempel ke jalan" agar mengikuti jalan, plus undo dan "Dari checkpoint". Muncul peringatan bila ujung jalur jauh dari titik awal / akhir DO.',
      'Rute manual tersimpan di menu Rute sebagai rute buatan sendiri, dibuka kembali saat DO diedit, dan tidak ditimpa saat DO dialokasikan. Estimasi waktu tiap stop dihitung dari jarak dan kecepatan rata-rata di Pengaturan.',
    ],
    en: [
      'Manual routes in the DO form for dispatchers who have their own route. The "Delivery route" card now offers Automatic (map recommended, with alternative routes to pick) or Manual (draw your own).',
      'Manual mode: click the map to add path points, drag a point to move it, right-click to delete, "Snap to road" to follow the roads, plus undo and "From checkpoints". A warning appears when the path ends are far from the DO start / end points.',
      'A manual route is stored in the Routes menu as a custom route, reopens when the DO is edited, and is not overwritten when the DO is allocated. Stop ETAs are computed from the distance and the average speed in Settings.',
    ],
  },
  {
    v: '3.4.0',
    date: '2026-10-23',
    id: [
      'Rute kini dibuat langsung di form DO. Lokasi tiap stop cukup memilih Zona MyGeotab (nama, titik tengah, dan radius terisi otomatis), tanpa mengetik alamat atau nama jalan. Koordinat manual tersisa sebagai cadangan.',
      'Kartu "Rute pengiriman" di form DO: input lebar koridor (20-2000 m) dan peta yang menggambar jalur antar stop, koridor, dan titik secara langsung. Bisa banyak stop (multi-drop).',
      'Saat DO disimpan, rute otomatis tersimpan di menu Rute (nama = nomor DO, diperbarui bila DO diubah). Setelah DO dialokasikan, Monitor memakai rute ini; jalur yang diedit manual di menu Rute tidak ditimpa selama titik stop tidak berubah.',
    ],
    en: [
      'Routes are now created right in the DO form. Each stop location is just a MyGeotab Zone pick (name, center point and radius fill in automatically), with no typing of addresses or street names. Manual coordinates remain as a fallback.',
      'New "Delivery route" card in the DO form: corridor width input (20-2000 m) and a map that draws the path between stops, the corridor and the points live. Multi-drop is supported.',
      'When the DO is saved, the route is stored in the Routes menu (name = DO number, updated when the DO changes). Once the DO is allocated, Monitor uses this route; a path edited manually in the Routes menu is not overwritten while the stop points are unchanged.',
    ],
  },
  {
    v: '3.3.1',
    date: '2026-10-23',
    id: [
      'Alur TMS penuh kini tersambung ke Monitor: DO yang dialokasikan ke vendor (kendaraan yang terhubung ke GPS Geotab di Vendor & Armada) otomatis dibuatkan rute dari titik muat / bongkar dan penugasan di Monitor, tanpa input rute manual di menu Penugasan. Berjalan selama add-in terbuka.',
      'Bila alokasi dilepas atau DO selesai / dibatalkan, penugasan monitor ditutup otomatis; bila kendaraan diganti, penugasan dipindah ke kendaraan baru. Dialog Dispatch menampilkan status pemantauan DO.',
    ],
    en: [
      'The full TMS flow is now connected to Monitor: a DO allocated to a vendor (with a vehicle linked to Geotab GPS in Vendors & Fleet) automatically gets a route built from its pickup / delivery points and an assignment in Monitor, with no manual route entry in the Assignments menu. Runs while the add-in is open.',
      'When an allocation is released or the DO is done / cancelled, the monitor assignment is closed automatically; when the vehicle changes, the assignment moves to the new vehicle. The Dispatch dialog shows the monitoring status of the DO.',
    ],
  },
  {
    v: '3.3.0',
    date: '2026-10-23',
    id: [
      'Mode aplikasi dipindah ke menu Pengaturan dan menentukan menu untuk semua pengguna. Saat add-in pertama kali dibuka (mode belum dipilih), muncul layar pemilihan: TMS penuh atau Monitor (integrasi TMS customer).',
      'TMS penuh menampilkan Order, Bukti, dan Vendor & Armada; menu Integrasi TMS dan Pengiriman disembunyikan. Monitor menampilkan Integrasi TMS dan Pengiriman; menu Order, Bukti, dan Vendor & Armada disembunyikan. Mode bisa diganti kapan saja di Pengaturan tanpa menghapus data.',
    ],
    en: [
      'Application mode moved to Settings and now decides the menus for all users. The first time the add-in is opened (no mode chosen yet) a selection screen appears: Full TMS or Monitor (customer TMS integration).',
      'Full TMS shows Orders, Evidence and Vendors & Fleet; the TMS Integration and Deliveries menus are hidden. Monitor shows TMS Integration and Deliveries; Orders, Evidence and Vendors & Fleet are hidden. The mode can be changed any time in Settings without deleting data.',
    ],
  },
  {
    v: '3.2.0',
    date: '2026-10-22',
    id: [
      'Laporan Pengiriman (menu baru "Pengiriman") untuk DO dari TMS customer: status TMS dibandingkan dengan bukti kedatangan GPS. DO yang selesai di TMS tetapi GPS tidak lengkap, atau GPS sudah tiba tetapi TMS belum selesai, ditandai agar mudah ditindaklanjuti.',
      'Ketepatan waktu per stop dari jam GPS terhadap batas waktu di TMS customer (dengan toleransi), beserta berapa menit terlambatnya.',
      'BBM per DO dari sensor GO device: liter, jarak, km/L, dan liter per ton-km (dari berat barang di DO). Hasil disimpan sehingga ikut masuk ekspor CSV.',
    ],
    en: [
      'Delivery Report (new "Deliveries" menu) for DOs from the customer TMS: the TMS status is compared with GPS arrival evidence. DOs done in the TMS with incomplete GPS, or GPS-arrived but still open in the TMS, are flagged for follow-up.',
      'Per-stop on-time from GPS time against the customer TMS deadline (with tolerance), including minutes late.',
      'Fuel per DO from the GO device sensor: litres, distance, km/L and litres per ton-km (from the DO goods weight). Results are stored and included in the CSV export.',
    ],
  },
  {
    v: '3.1.0',
    date: '2026-10-22',
    id: [
      'Integrasi TMS customer, tahap 2: perkawinan dengan MyGeotab. Selama add-in terbuka, DO aktif dari TMS customer otomatis dicocokkan lewat plat ke kendaraan Geotab, lalu dibuatkan rute (dari titik stop beserta radius) dan penugasan. Mesin monitor yang sama langsung memantau kendaraan keluar rute, terlambat, dan belum berangkat.',
      'Kedatangan di tiap stop dibaca dari GPS dan dikirim ke server, sehingga laporan ketepatan waktu dan exception memakai waktu GPS, bukan input manual. Rute / penugasan ditutup otomatis saat DO selesai atau dibatalkan di TMS customer.',
      'Panel "Penautan ke kendaraan Geotab" di menu Integrasi TMS: ringkasan, DO yang belum cocok beserta alasannya (plat kosong, tidak ada di Geotab, ganda, koordinat kurang), dan pemetaan plat ke kendaraan secara manual.',
    ],
    en: [
      'Customer TMS integration, stage 2: marrying it to MyGeotab. While the add-in is open, active DOs from the customer TMS are matched by plate to a Geotab vehicle, then a route (from stop points and radius) and an assignment are created. The same monitor engine immediately watches for off-route, late and not-started vehicles.',
      'Arrivals at each stop are read from GPS and sent to the server, so on-time reports and exceptions use GPS time instead of manual input. Routes / assignments are closed automatically when the DO is done or cancelled in the customer TMS.',
      'New "Linking to Geotab vehicles" panel in TMS Integration: summary, unmatched DOs with reasons (empty plate, not in Geotab, duplicate, missing coordinates), and manual plate-to-vehicle mapping.',
    ],
  },
  {
    v: '3.0.0',
    date: '2026-10-22',
    id: [
      'Mode Integrasi TMS customer, tahap 1 (konektor tarik data). Menu "Integrasi TMS": buat konektor ke API TMS milik customer tanpa coding. Atur URL, autentikasi (Bearer / API key / Basic), request, pagination, lalu petakan field JSON mereka ke DO kita (nomor DO, plat, status, stop dengan koordinat dan jadwal, barang).',
      'Tombol "Uji koneksi & pemetaan" menarik data asli dan menampilkan hasil pemetaan beserta masalahnya (plat kosong, koordinat kosong). DO ditarik otomatis tiap N menit lewat cron atau manual dengan "Sinkron sekarang"; perubahan status dan rute di TMS customer ikut diperbarui.',
      'Pilihan mode aplikasi: TMS penuh, atau Monitor (menu Order, Vendor & Armada, dan Bukti disembunyikan untuk customer yang memegang TMS sendiri).',
      'Keamanan: kunci API disimpan terenkripsi (AES-256-GCM, butuh ENCRYPTION_KEY di Vercel) dan tidak pernah dikirim balik ke browser. Hanya https, alamat internal / privat ditolak, tanpa redirect, batas waktu dan ukuran respons.',
      'Tahap berikutnya: pencocokan plat ke kendaraan Geotab dengan pembuatan rute dan penugasan otomatis, kedatangan stop dari GPS, serta laporan BBM per DO.',
    ],
    en: [
      'Customer TMS integration mode, stage 1 (pull connector). New "TMS Integration" menu: create a connector to the customer\'s own TMS API without coding. Set URL, authentication (Bearer / API key / Basic), request and pagination, then map their JSON fields to our DO (DO number, plate, status, stops with coordinates and schedule, goods).',
      'The "Test connection & mapping" button pulls real data and shows the mapped result with any problems (missing plate, missing coordinates). DOs are pulled every N minutes through cron or manually with "Sync now"; status and route changes in the customer TMS are kept up to date.',
      'Application mode: Full TMS, or Monitor (the Orders, Vendors & Fleet and Evidence menus are hidden for customers who run their own TMS).',
      'Security: API keys are stored encrypted (AES-256-GCM, needs ENCRYPTION_KEY in Vercel) and never sent back to the browser. https only, internal / private addresses rejected, no redirects, response time and size limits.',
      'Next stages: matching the plate to a Geotab vehicle with automatic route and assignment creation, stop arrivals from GPS, and fuel reports per DO.',
    ],
  },
  {
    v: '2.5.0',
    date: '2026-10-22',
    id: [
      'Notifikasi exception ke admin lewat email (Brevo) dan WhatsApp (Fonnte atau webhook gateway lain). Atur penerima, tingkat minimum, dan pengingat di menu Exception › Notifikasi, lengkap dengan tombol kirim tes dan log pengiriman.',
      'Laporan kendala dari vendor diteruskan seketika. Exception tingkat Tinggi yang belum ditangani diingatkan sekali lagi setelah waktu yang diatur (default 60 menit). Kiriman gagal dicoba ulang otomatis.',
      'Endpoint /api/cron (dilindungi CRON_SECRET) menjalankan deteksi exception, notifikasi, dan pembersihan retensi POD tanpa admin membuka add-in. Panggil tiap 5 menit dari pinger eksternal; vercel.json memuat cadangan harian.',
    ],
    en: [
      'Exception notifications to admins by email (Brevo) and WhatsApp (Fonnte or another gateway via webhook). Set recipients, minimum level and reminders under Exceptions › Notifications, with a send-test button and delivery log.',
      'Vendor-reported issues are forwarded immediately. Unhandled High-level exceptions are reminded once more after the configured time (default 60 minutes). Failed deliveries are retried automatically.',
      'The /api/cron endpoint (protected by CRON_SECRET) runs exception detection, notifications and POD retention cleanup without an admin opening the add-in. Call it every 5 minutes from an external pinger; vercel.json contains a daily fallback.',
    ],
  },
  {
    v: '2.4.0',
    date: '2026-10-21',
    id: [
      'Tahap 5: Exception Management (menu "Exception"). Sistem mendeteksi otomatis: tidak ada vendor yang menerima, belum berangkat, terlambat / tiba terlambat, tidak ada update dari vendor, posisi di luar radius, dan selisih qty POP / POD. Exception hilang sendiri saat kondisinya pulih; admin dapat menandai "ditangani" dengan catatan atau menyelesaikannya manual. Jumlah exception terbuka tampil sebagai badge di menu.',
      'Portal vendor: tombol "Laporkan kendala" (mogok, kecelakaan, macet, lokasi tutup, gagal kirim, lainnya) langsung masuk ke daftar Exception admin lengkap dengan lokasi.',
      'Menu baru "Kinerja DO": penyelesaian DO, ketepatan waktu pengiriman, lead time (alokasi, durasi perjalanan, total), DO per hari, kinerja tiap vendor (rasio terima, waktu respons, tepat waktu, selisih qty, exception) dan sebaran exception. Ekspor kinerja vendor ke CSV.',
      'Batas toleransi dapat diatur lewat variabel Vercel: EXC_LATE_GRACE_MIN (15), EXC_STALE_MIN (120), EXC_START_GRACE_MIN (30).',
    ],
    en: [
      'Stage 5: Exception Management ("Exceptions" menu). The system automatically detects: no vendor accepted, not started, late / arrived late, no updates from the vendor, position outside the radius, and POP / POD quantity differences. Exceptions clear themselves when the condition recovers; admins can mark them handled with a note or close them manually. The open count shows as a badge on the menu.',
      'Vendor portal: a "Report an issue" button (breakdown, accident, traffic, location closed, failed delivery, other) goes straight into the admin Exceptions list with the location.',
      'New "DO Performance" menu: DO completion, on-time delivery, lead times (allocation, trip duration, total), DOs per day, per-vendor performance (accept rate, response time, on-time, quantity differences, exceptions) and an exception breakdown. Export vendor performance to CSV.',
      'Tolerances can be set with Vercel variables: EXC_LATE_GRACE_MIN (15), EXC_STALE_MIN (120), EXC_START_GRACE_MIN (30).',
    ],
  },
  {
    v: '2.3.1',
    date: '2026-10-21',
    id: [
      'Menu baru "Bukti": daftar semua POP (Proof of Pickup) dan POD (Proof of Delivery) dari seluruh DO. Filter jenis dan periode, cari berdasarkan DO / customer / lokasi / penerima / vendor / plat, lalu klik baris untuk membuka dokumen.',
      'POP ditambahkan: saat "Selesai muat", vendor mengisi petugas gudang, qty yang dimuat (alasan wajib bila beda dari DO), foto, dan tanda tangan. Sama seperti POD: terkunci, ber-hash, dan punya QR verifikasi.',
      'Daftar POP / POD juga tampil di dialog Alokasi tiap DO.',
    ],
    en: [
      'New "Evidence" menu: a list of all POP (Proof of Pickup) and POD (Proof of Delivery) across every DO. Filter by type and period, search by DO / customer / location / receiver / vendor / plate, then click a row to open the document.',
      'POP added: on "Done loading" the vendor fills in the warehouse officer, quantity loaded (reason required if different from the DO), photos and signature. Like POD: locked, hashed, with a verification QR.',
      'The POP / POD list also appears in each DO\'s Allocation dialog.',
    ],
  },
  {
    v: '2.3.0',
    date: '2026-10-21',
    id: [
      'Tahap 4: POD (bukti serah terima) di portal vendor. "Selesai bongkar" kini lewat form: nama penerima, qty diterima per barang (alasan wajib bila beda dari qty kirim), 1-4 foto yang otomatis diberi cap DO, lokasi, waktu (WIB) dan GPS, tanda tangan penerima, serta catatan.',
      'POD terkunci setelah dikirim: disimpan dengan hash SHA-256 (termasuk foto dan tanda tangan) dan kode verifikasi. Koreksi hanya lewat catatan tambahan (amandemen); data asli tidak pernah berubah. Integritas dicek ulang tiap dokumen dibuka.',
      'Di add-in: daftar POD per DO di dialog Alokasi, dokumen POD siap cetak / simpan PDF dengan QR verifikasi. Halaman /portal.html#/v/<kode> memverifikasi keaslian POD tanpa login.',
      'Foto dan tanda tangan dihapus otomatis setelah 30 hari (POD_RETENTION_DAYS); data teks dan hash tetap tersimpan.',
    ],
    en: [
      'Stage 4: POD (proof of delivery) in the vendor portal. "Done unloading" now goes through a form: receiver name, received qty per item (reason required when different from sent), 1-4 photos automatically stamped with DO, location, time (WIB) and GPS, receiver signature, and a note.',
      'POD is locked after submit: stored with a SHA-256 hash (covering photos and signature) and a verification code. Corrections are only possible as additional notes (amendments); the original data never changes. Integrity is re-checked every time a document is opened.',
      'In the add-in: POD list per DO in the Allocation dialog, a print-ready / save-as-PDF POD document with a verification QR. The page /portal.html#/v/<code> verifies POD authenticity without login.',
      'Photos and signatures are purged automatically after 30 days (POD_RETENTION_DAYS); text data and the hash are kept.',
    ],
  },
  {
    v: '2.2.0',
    date: '2026-10-21',
    id: [
      'Tahap 3: Portal Vendor di /portal.html (tanpa login, cukup tautan dari email penawaran; nyaman di HP). Vendor melihat rute, jadwal, kontak, dan barang tiap stop.',
      'Vendor dapat menerima DO dengan memilih kendaraan (hanya yang cocok kapasitas) dan driver (atau mengetik driver baru), atau menolak dengan alasan. Siapa menerima duluan menang; vendor lain langsung melihat penawaran ditutup.',
      'Eksekusi perjalanan: mulai perjalanan, tiba, mulai muat / bongkar, selesai & berangkat untuk tiap stop, berurutan dan tidak bisa dilompati. Lokasi HP dicatat tiap langkah (berguna untuk kendaraan tanpa GPS) dan ditandai bila di luar radius stop. DO otomatis Berjalan lalu Selesai.',
      'Di add-in: kemajuan perjalanan tampil di daftar Order dan linimasa lengkap (waktu, stop, tautan GPS) di dialog Alokasi. Email penawaran disederhanakan agar lebih kecil kemungkinan masuk tab Promotions.',
    ],
    en: [
      'Stage 3: Vendor Portal at /portal.html (no login, just the link from the offer email; phone friendly). Vendors see the route, schedule, contacts and goods per stop.',
      'Vendors can accept a DO by choosing a vehicle (only those that fit) and a driver (or typing a new one), or reject with a reason. First to accept wins; other vendors immediately see the offer closed.',
      'Trip execution: start trip, arrive, start loading / unloading, done & depart for every stop, in strict order. Phone location is recorded at each step (useful for vehicles without GPS) and flagged when outside the stop radius. The DO automatically becomes In progress, then Completed.',
      'In the add-in: trip progress shows in the Orders list and a full timeline (time, stop, GPS link) in the Allocation dialog. The offer email is simplified to be less likely to land in the Promotions tab.',
    ],
  },
  {
    v: '2.1.0',
    date: '2026-10-20',
    id: [
      'Tahap 2 (Planning + Dispatch): menu baru "Vendor & Armada" untuk mengelola vendor (email, PIC), kendaraan (plat, jenis, GPS, kapasitas berat / volume / pallet / koli / dimensi bak, suhu, B3), dan driver.',
      'Alokasi DO dari daftar Order. Sistem membandingkan beban puncak DO dengan kapasitas tiap kendaraan dan menampilkan alasan bila tidak cocok (mis. "berat 2.400 > 900 kg").',
      'Dua cara: tawarkan ke beberapa vendor sekaligus (siapa yang menerima duluan mendapatkan DO, dijamin atomik; batas respons default 60 menit) atau alokasi langsung ke kendaraan + driver. Penawaran yang ditolak / kedaluwarsa tercatat dan DO ditandai "Tidak ada yang menerima" untuk dialokasikan ulang.',
      'Email penawaran memakai Brevo. Selama BREVO_API_KEY belum diisi di Vercel, penawaran tetap tercatat tetapi email berstatus belum terkirim. Halaman portal vendor (terima / tolak lewat tautan) menyusul di v2.2.',
    ],
    en: [
      'Stage 2 (Planning + Dispatch): new "Vendors & Fleet" menu to manage vendors (email, PIC), vehicles (plate, type, GPS, weight / volume / pallet / colli / body-dimension capacity, temperature, hazardous) and drivers.',
      'Allocate a DO from the Orders list. The system compares the DO peak load with each vehicle capacity and shows why it does not fit (e.g. "weight 2,400 > 900 kg").',
      'Two ways: offer to several vendors at once (first to accept gets the DO, guaranteed atomic; default response deadline 60 minutes) or allocate directly to a vehicle + driver. Rejected / expired offers are recorded and the DO is flagged "Nobody accepted" for reallocation.',
      'Offer emails use Brevo. Until BREVO_API_KEY is set in Vercel, offers are still recorded but emails show as not sent. The vendor portal page (accept / reject via link) follows in v2.2.',
    ],
  },
  {
    v: '2.0.2',
    date: '2026-10-20',
    id: ['Perbaikan: kolom pada kartu barang tidak lagi kehilangan fokus setiap mengetik satu karakter; sekarang bisa mengetik langsung secara berkelanjutan.'],
    en: ['Fix: fields in the item card no longer lose focus after every keystroke; typing now flows continuously.'],
  },
  {
    v: '2.0.1',
    date: '2026-10-19',
    id: [
      'Nomor DO dibuat otomatis dari waktu + nama customer (mis. DO-20261019-154854-PTCONTOH); cukup isi customer, nomor bisa diubah manual bila perlu.',
      'Lokasi stop lebih mudah: cari nama tempat/alamat (hasil langsung muncul), pilih Zona MyGeotab (titik, radius, dan bentuk zona terisi otomatis), atau klik / geser pin pada peta. Peta menampilkan titik, radius, dan zona.',
      'Tabel barang diganti kartu per barang dengan semua field kapasitas tertata rapi, tanpa scroll ke samping; kolom qty lebih lebar.',
      'Stop Delivery: centang barang dari pickup sehingga isinya otomatis sama persis (ikut berubah bila pickup diubah). Tombol "Ubah" untuk perbedaan di delivery (mis. qty sebagian) dan "Tambah barang lain" untuk barang berbeda.',
      'Dialog Order tidak lagi menempel di tepi atas dan selalu terlihat penuh di dalam MyGeotab.',
    ],
    en: [
      'DO number is generated automatically from time + customer name (e.g. DO-20261019-154854-PTCONTOH); just enter the customer, the number can still be edited manually.',
      'Easier stop locations: search a place/address (results appear as you type), pick a MyGeotab Zone (point, radius and zone shape filled automatically), or click / drag the pin on the map. The map shows the point, radius and zone.',
      'The goods table is replaced by one card per item with all capacity fields neatly laid out, no sideways scrolling; wider qty field.',
      'Delivery stops: tick goods from the pickup so they are automatically identical (and follow pickup edits). "Edit" handles differences at delivery (e.g. partial qty) and "Add other item" handles different goods.',
      'The Order dialog no longer sticks to the top edge and is always fully visible inside MyGeotab.',
    ],
  },
  {
    v: '2.0.0',
    date: '2026-10-19',
    id: [
      'Tahap 1 proses pengiriman: menu baru "Order" untuk membuat dan mengelola Delivery Order (DO). Satu DO bisa multi-drop dengan beberapa stop berurutan (pickup / delivery), masing-masing dengan alamat, koordinat, radius, jendela waktu, kontak, dan daftar barang.',
      'Data muatan selengkap mungkin: qty, satuan, berat, volume, pallet, koli, dimensi, kategori, suhu, B3, dan bisa ditumpuk. Ringkasan muatan menghitung beban puncak sepanjang rute, serta peringatan bila bongkar melebihi muat atau suhu bentrok.',
      'Import dari Excel / CSV memakai template kami (satu baris = satu item) dengan pratinjau dan validasi per DO sebelum disimpan. Template dan petunjuk kolom bisa diunduh.',
      'Backend baru di Vercel (Postgres + API) dengan autentikasi sesi MyGeotab dan jejak audit. Perlu menghubungkan Postgres dan mengisi ALLOWED_DATABASES (lihat README); cek status di /api/health.',
    ],
    en: [
      'Stage 1 of the delivery process: new "Orders" menu to create and manage Delivery Orders (DO). One DO can be multi-drop with several sequential pickup / delivery stops, each with address, coordinates, radius, time window, contact and a list of goods.',
      'As complete cargo data as possible: qty, unit, weight, volume, pallets, colli, dimensions, category, temperature, hazardous and stackable. The load summary computes peak load along the route and warns when unloading exceeds loading or temperatures conflict.',
      'Import from Excel / CSV using our template (one row = one item) with preview and per-DO validation before saving. Template and column guide can be downloaded.',
      'New backend on Vercel (Postgres + API) with MyGeotab session authentication and audit trail. Requires connecting Postgres and setting ALLOWED_DATABASES (see README); check status at /api/health.',
    ],
  },
  {
    v: '1.12.0',
    date: '2026-10-16',
    id: [
      'Riwayat Alert: tombol "Lihat semua alert" membuka halaman riwayat lengkap. Tampilan Timeline (dikelompokkan per hari) dan Per kendaraan, dengan filter periode (hari ini / 7 / 30 / 90 hari), kendaraan, jenis kejadian, status penanganan, dan pencarian. Klik kejadian membuka detail penugasannya. Ekspor CSV tersedia.',
      'Semua jenis kejadian (keluar rute, kembali, terlambat, di titik awal, checkpoint, selesai) kini tersimpan permanen di AddInData per hari, sehingga tetap bisa dilihat setelah MyGeotab ditutup atau dibuka dari perangkat lain. Retensi default 90 hari (atur di Pengaturan), data lebih lama dihapus otomatis.',
      '"Tandai ditangani": alert keluar rute / terlambat dapat ditandai sudah ditangani beserta catatan; nama pengguna dan waktunya tercatat, dapat dibatalkan. Tersedia di panel Alert dan di Riwayat.',
    ],
    en: [
      'Alert history: "View all alerts" opens a full history page. Timeline (grouped by day) and By-vehicle views, with filters for period (today / 7 / 30 / 90 days), vehicle, event type, handling status and search. Clicking an event opens its assignment detail. CSV export included.',
      'All event types (off route, back on route, late, at start, checkpoints, completed) are now stored permanently in AddInData per day, so they remain visible after MyGeotab is closed or opened from another device. Default retention 90 days (set in Settings); older data is deleted automatically.',
      '"Mark handled": off-route / late alerts can be marked handled with a note; the user name and time are recorded and can be undone. Available in the Alert panel and in History.',
    ],
  },
  {
    v: '1.11.0',
    date: '2026-10-10',
    id: [
      'Panel Alert & kejadian di Monitor dirombak: hanya kejadian N menit terakhir (pilihan 5 / 10 / 30, default 10), terbaru di atas, dengan waktu relatif ("3 mnt lalu").',
      'Bagian "Sedang berlangsung" selalu tampil di atas dan tidak kedaluwarsa: kendaraan yang masih di luar rute atau belum tiba di titik awal tetap terlihat sampai kondisinya selesai.',
      'Setiap item: titik warna per tingkat keparahan, nama kendaraan tebal, ringkasan singkat; klik membuka detail penugasan. Tombol "Lihat semua alert" menampilkan daftar lengkap (diganti halaman Riwayat di v1.12.0).',
    ],
    en: [
      'Alerts & events panel in Monitor redesigned: only events from the last N minutes (5 / 10 / 30, default 10), newest first, with relative time ("3 min ago").',
      'An "Ongoing" section always stays on top and does not expire: vehicles still off route or not yet at the start point remain visible until resolved.',
      'Each item: severity dot, bold vehicle name, short summary; click opens the assignment detail. "View all alerts" shows the full list (replaced by the History page in v1.12.0).',
    ],
  },
  {
    v: '1.10.0',
    date: '2026-10-10',
    id: [
      'Penugasan: kalender baru. Judul rentang tanggal + nomor minggu, header hari dua baris dengan penanda hari ini dan akhir pekan, tombol Hari ini, panah, dan loncat ke tanggal.',
      'Kolom kendaraan: nama dipotong rapi (tooltip lengkap), nopol hanya tampil bila belum ada di dalam nama sehingga tidak dobel/bertumpuk. Blok penugasan menampilkan jam dan rute dengan tooltip sopir/status.',
      'Tampilan Bulan baru (klik hari untuk membuka mingguannya), legenda warna rute, kolom kendaraan dan header tetap terlihat saat digulir.',
    ],
    en: [
      'Assignments: new calendar. Date-range title + week number, two-line day headers with today and weekend highlighting, Today button, arrows and jump-to-date.',
      'Vehicle column: name is truncated neatly (full tooltip); the plate shows only when it is not already in the name, so nothing is duplicated or overlapping. Blocks show time and route with a driver/status tooltip.',
      'New Month view (click a day to open its week), route colour legend, vehicle column and header stay visible when scrolling.',
    ],
  },
  {
    v: '1.9.0',
    date: '2026-10-10',
    id: [
      'Penugasan: tombol Duplikat di detail penugasan (salin satu penugasan ke tanggal lain) dan Salin hari (salin seluruh penugasan satu hari ke tanggal lain).',
      'Hasil salinan berupa penugasan sekali; yang bentrok kendaraan/sopir dilewati dan ditampilkan alasannya sebelum disimpan.',
    ],
    en: [
      'Assignments: Duplicate button in the assignment detail (copy one assignment to another date) and Copy day (copy all assignments of a day to another date).',
      'Copies are one-time assignments; vehicle/driver conflicts are skipped and the reason is shown before saving.',
    ],
  },
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
