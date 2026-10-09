# Changelog

Dibuat otomatis dari `src/changelog.js` (`npm run changelog`). Jangan diedit manual.

## v1.11.0 - 2026-10-10

- Panel Alert & kejadian di Monitor dirombak: hanya kejadian N menit terakhir (pilihan 5 / 10 / 30, default 10), terbaru di atas, dengan waktu relatif ("3 mnt lalu").
- Bagian "Sedang berlangsung" selalu tampil di atas dan tidak kedaluwarsa: kendaraan yang masih di luar rute atau belum tiba di titik awal tetap terlihat sampai kondisinya selesai.
- Setiap item: titik warna per tingkat keparahan, nama kendaraan tebal, ringkasan singkat; klik membuka detail penugasan. Tombol "Lihat semua alert" menampilkan daftar lengkap (diganti halaman Riwayat di v1.12.0).

## v1.10.0 - 2026-10-10

- Penugasan: kalender baru. Judul rentang tanggal + nomor minggu, header hari dua baris dengan penanda hari ini dan akhir pekan, tombol Hari ini, panah, dan loncat ke tanggal.
- Kolom kendaraan: nama dipotong rapi (tooltip lengkap), nopol hanya tampil bila belum ada di dalam nama sehingga tidak dobel/bertumpuk. Blok penugasan menampilkan jam dan rute dengan tooltip sopir/status.
- Tampilan Bulan baru (klik hari untuk membuka mingguannya), legenda warna rute, kolom kendaraan dan header tetap terlihat saat digulir.

## v1.9.0 - 2026-10-10

- Penugasan: tombol Duplikat di detail penugasan (salin satu penugasan ke tanggal lain) dan Salin hari (salin seluruh penugasan satu hari ke tanggal lain).
- Hasil salinan berupa penugasan sekali; yang bentrok kendaraan/sopir dilewati dan ditampilkan alasannya sebelum disimpan.

## v1.8.0 - 2026-10-09

- Laporan: kolom Idle % (idle / (waktu jalan + idle)) di Ringkasan armada dan Trip, ikut ke CSV.
- Idle % di atas batas (Pengaturan, default 20%) disorot merah untuk menemukan kendaraan/trip yang boros karena mesin menyala saat diam.

## v1.7.0 - 2026-10-09

- Laporan > tab Benchmark: fuel economy per rute dan per sopir, dibandingkan dengan rata-rata armada (selisih %), penanda boros/hemat (>= 15% dan jarak >= 20 km).
- Menampilkan jumlah penugasan, jarak, engine hour, fuel, deviasi, dan kepatuhan per kelompok; ekspor CSV. Sopir mengikuti sopir yang ditugaskan.

## v1.6.0 - 2026-10-09

- Alert baru: kendaraan terlambat ke titik awal (belum tiba N menit setelah jadwal mulai). Batas diatur di Pengaturan (default 10 menit, 0 = nonaktif) dan bisa per rute.
- Alert juga muncul bila kendaraan offline / tidak mengirim posisi, serta saat kendaraan tiba terlambat. Fase Monitor menampilkan "Terlambat ke titik awal"; notifikasi tersimpan seperti alert lain.

## v1.5.0 - 2026-10-09

- Laporan > Ringkasan armada: kolom Engine hour, Fuel used, Fuel economy per kendaraan + KPI total armada (economy hanya dari kendaraan yang punya data fuel).
- Laporan > Trip: kolom Engine hour, Fuel used, Fuel economy per trip.
- Ekspor CSV ikut berisi kolom baru (jam, liter, km/L, L/100km, penanda perkiraan). Data sensor dibaca per kendaraan dengan paging otomatis.

## v1.4.0 - 2026-10-09

- Monitor > detail penugasan: kartu Engine hour, Fuel used, dan Fuel economy untuk seluruh penugasan.
- Daftar deviasi: kolom Engine hour, Fuel used, dan Fuel economy per segmen deviasi (pakai jarak di luar koridor); "~" = perkiraan, "-" = tidak ada sensor / data kurang.
- Detail penugasan kini juga membaca log GPS sejak 30 menit sebelum jadwal sehingga fase "Di titik awal" akurat.

## v1.3.0 - 2026-10-09

- Layer data sensor: engine hour dan fuel dihitung dari selisih counter StatusData Geotab (interpolasi, penanda perkiraan "~", tahan counter reset).
- Pengaturan > Sensor: ID diagnostik bisa diubah, satuan fuel economy (km/L atau L/100 km), dan tombol Cek sensor untuk melihat kendaraan mana yang punya data.

## v1.2.0 - 2026-10-09

- Logo SMA baru (SVG) sebagai icon menu MyGeotab, header add-in, dan halaman host.
- Riwayat versi tampil di Pengaturan > Tentang; CHANGELOG.md dibuat otomatis dari satu sumber.

## v1.1.0 - 2026-10-09

- Fase tugas di Monitor: Menuju titik awal, Di titik awal, Dalam perjalanan, Selesai (dengan jam tiba/selesai).
- Event & notifikasi baru: kendaraan sudah berada di titik awal, dan penugasan selesai (feed, toast, notifikasi browser, tersimpan).
- Kedatangan di titik awal terdeteksi sejak 30 menit sebelum jadwal mulai (deviasi tetap baru dinilai setelah jadwal mulai).

## v1.0.1 - 2026-10-09

- Perbaikan kompatibilitas MyGeotab: halaman add-in kini dokumen HTML lengkap dengan <body> (syarat MyGeotab), bundle disisipkan inline.
- Leaflet add-in tidak lagi menimpa window.L milik MyGeotab; terdaftar di beberapa nama namespace; error inisialisasi tampil di halaman.
- Hosting di Vercel (vercel.json, header CORS/charset, tanpa cache untuk file add-in).

## v1.0.0 - 2026-10-08

- MVP: daftar kendaraan, peta posisi, rute dari beberapa checkpoint (rekomendasi peta atau gambar sendiri), lebar koridor per rute.
- Alert keluar rute (debounce), laporan FMS per rentang waktu, penugasan rute harian/terjadwal (kendaraan + sopir, deteksi bentrok).
- Tambahan: toleransi alert, status checkpoint, laporan kepatuhan rute, replay rencana vs aktual, status penugasan. UI dwibahasa ID/EN.
