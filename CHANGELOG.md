# Changelog

Dibuat otomatis dari `src/changelog.js` (`npm run changelog`). Jangan diedit manual.

## v3.5.0 - 2026-10-24

- Menu Kinerja DO menjadi dashboard dengan slicer tanggal (7/30/90 hari, bulan ini, bulan lalu, atau rentang kustom). Seluruh angka, grafik, dan tabel mengikuti rentang yang dipilih.
- KPI utama kini dibandingkan dengan periode sebelumnya yang sama panjang. KPI operasional baru: stop terlambat, rata-rata dan terparah keterlambatan, waktu penyelesaian exception, muatan terkirim, efisiensi BBM (km/L), tren tepat waktu per hari, sebaran status DO, dan customer teratas.

## v3.4.1 - 2026-10-23

- Rute manual di form DO untuk dispatcher yang punya rute lain. Kartu "Rute pengiriman" kini punya pilihan Otomatis (rekomendasi peta, bisa pilih rute alternatif) atau Manual (gambar sendiri).
- Mode Manual: klik peta untuk menambah titik jalur, seret titik untuk menggeser, klik kanan untuk menghapus, "Tempel ke jalan" agar mengikuti jalan, plus undo dan "Dari checkpoint". Muncul peringatan bila ujung jalur jauh dari titik awal / akhir DO.
- Rute manual tersimpan di menu Rute sebagai rute buatan sendiri, dibuka kembali saat DO diedit, dan tidak ditimpa saat DO dialokasikan. Estimasi waktu tiap stop dihitung dari jarak dan kecepatan rata-rata di Pengaturan.

## v3.4.0 - 2026-10-23

- Rute kini dibuat langsung di form DO. Lokasi tiap stop cukup memilih Zona MyGeotab (nama, titik tengah, dan radius terisi otomatis), tanpa mengetik alamat atau nama jalan. Koordinat manual tersisa sebagai cadangan.
- Kartu "Rute pengiriman" di form DO: input lebar koridor (20-2000 m) dan peta yang menggambar jalur antar stop, koridor, dan titik secara langsung. Bisa banyak stop (multi-drop).
- Saat DO disimpan, rute otomatis tersimpan di menu Rute (nama = nomor DO, diperbarui bila DO diubah). Setelah DO dialokasikan, Monitor memakai rute ini; jalur yang diedit manual di menu Rute tidak ditimpa selama titik stop tidak berubah.

## v3.3.1 - 2026-10-23

- Alur TMS penuh kini tersambung ke Monitor: DO yang dialokasikan ke vendor (kendaraan yang terhubung ke GPS Geotab di Vendor & Armada) otomatis dibuatkan rute dari titik muat / bongkar dan penugasan di Monitor, tanpa input rute manual di menu Penugasan. Berjalan selama add-in terbuka.
- Bila alokasi dilepas atau DO selesai / dibatalkan, penugasan monitor ditutup otomatis; bila kendaraan diganti, penugasan dipindah ke kendaraan baru. Dialog Dispatch menampilkan status pemantauan DO.

## v3.3.0 - 2026-10-23

- Mode aplikasi dipindah ke menu Pengaturan dan menentukan menu untuk semua pengguna. Saat add-in pertama kali dibuka (mode belum dipilih), muncul layar pemilihan: TMS penuh atau Monitor (integrasi TMS customer).
- TMS penuh menampilkan Order, Bukti, dan Vendor & Armada; menu Integrasi TMS dan Pengiriman disembunyikan. Monitor menampilkan Integrasi TMS dan Pengiriman; menu Order, Bukti, dan Vendor & Armada disembunyikan. Mode bisa diganti kapan saja di Pengaturan tanpa menghapus data.

## v3.2.0 - 2026-10-22

- Laporan Pengiriman (menu baru "Pengiriman") untuk DO dari TMS customer: status TMS dibandingkan dengan bukti kedatangan GPS. DO yang selesai di TMS tetapi GPS tidak lengkap, atau GPS sudah tiba tetapi TMS belum selesai, ditandai agar mudah ditindaklanjuti.
- Ketepatan waktu per stop dari jam GPS terhadap batas waktu di TMS customer (dengan toleransi), beserta berapa menit terlambatnya.
- BBM per DO dari sensor GO device: liter, jarak, km/L, dan liter per ton-km (dari berat barang di DO). Hasil disimpan sehingga ikut masuk ekspor CSV.

## v3.1.0 - 2026-10-22

- Integrasi TMS customer, tahap 2: perkawinan dengan MyGeotab. Selama add-in terbuka, DO aktif dari TMS customer otomatis dicocokkan lewat plat ke kendaraan Geotab, lalu dibuatkan rute (dari titik stop beserta radius) dan penugasan. Mesin monitor yang sama langsung memantau kendaraan keluar rute, terlambat, dan belum berangkat.
- Kedatangan di tiap stop dibaca dari GPS dan dikirim ke server, sehingga laporan ketepatan waktu dan exception memakai waktu GPS, bukan input manual. Rute / penugasan ditutup otomatis saat DO selesai atau dibatalkan di TMS customer.
- Panel "Penautan ke kendaraan Geotab" di menu Integrasi TMS: ringkasan, DO yang belum cocok beserta alasannya (plat kosong, tidak ada di Geotab, ganda, koordinat kurang), dan pemetaan plat ke kendaraan secara manual.

## v3.0.0 - 2026-10-22

- Mode Integrasi TMS customer, tahap 1 (konektor tarik data). Menu "Integrasi TMS": buat konektor ke API TMS milik customer tanpa coding. Atur URL, autentikasi (Bearer / API key / Basic), request, pagination, lalu petakan field JSON mereka ke DO kita (nomor DO, plat, status, stop dengan koordinat dan jadwal, barang).
- Tombol "Uji koneksi & pemetaan" menarik data asli dan menampilkan hasil pemetaan beserta masalahnya (plat kosong, koordinat kosong). DO ditarik otomatis tiap N menit lewat cron atau manual dengan "Sinkron sekarang"; perubahan status dan rute di TMS customer ikut diperbarui.
- Pilihan mode aplikasi: TMS penuh, atau Monitor (menu Order, Vendor & Armada, dan Bukti disembunyikan untuk customer yang memegang TMS sendiri).
- Keamanan: kunci API disimpan terenkripsi (AES-256-GCM, butuh ENCRYPTION_KEY di Vercel) dan tidak pernah dikirim balik ke browser. Hanya https, alamat internal / privat ditolak, tanpa redirect, batas waktu dan ukuran respons.
- Tahap berikutnya: pencocokan plat ke kendaraan Geotab dengan pembuatan rute dan penugasan otomatis, kedatangan stop dari GPS, serta laporan BBM per DO.

## v2.5.0 - 2026-10-22

- Notifikasi exception ke admin lewat email (Brevo) dan WhatsApp (Fonnte atau webhook gateway lain). Atur penerima, tingkat minimum, dan pengingat di menu Exception › Notifikasi, lengkap dengan tombol kirim tes dan log pengiriman.
- Laporan kendala dari vendor diteruskan seketika. Exception tingkat Tinggi yang belum ditangani diingatkan sekali lagi setelah waktu yang diatur (default 60 menit). Kiriman gagal dicoba ulang otomatis.
- Endpoint /api/cron (dilindungi CRON_SECRET) menjalankan deteksi exception, notifikasi, dan pembersihan retensi POD tanpa admin membuka add-in. Panggil tiap 5 menit dari pinger eksternal; vercel.json memuat cadangan harian.

## v2.4.0 - 2026-10-21

- Tahap 5: Exception Management (menu "Exception"). Sistem mendeteksi otomatis: tidak ada vendor yang menerima, belum berangkat, terlambat / tiba terlambat, tidak ada update dari vendor, posisi di luar radius, dan selisih qty POP / POD. Exception hilang sendiri saat kondisinya pulih; admin dapat menandai "ditangani" dengan catatan atau menyelesaikannya manual. Jumlah exception terbuka tampil sebagai badge di menu.
- Portal vendor: tombol "Laporkan kendala" (mogok, kecelakaan, macet, lokasi tutup, gagal kirim, lainnya) langsung masuk ke daftar Exception admin lengkap dengan lokasi.
- Menu baru "Kinerja DO": penyelesaian DO, ketepatan waktu pengiriman, lead time (alokasi, durasi perjalanan, total), DO per hari, kinerja tiap vendor (rasio terima, waktu respons, tepat waktu, selisih qty, exception) dan sebaran exception. Ekspor kinerja vendor ke CSV.
- Batas toleransi dapat diatur lewat variabel Vercel: EXC_LATE_GRACE_MIN (15), EXC_STALE_MIN (120), EXC_START_GRACE_MIN (30).

## v2.3.1 - 2026-10-21

- Menu baru "Bukti": daftar semua POP (Proof of Pickup) dan POD (Proof of Delivery) dari seluruh DO. Filter jenis dan periode, cari berdasarkan DO / customer / lokasi / penerima / vendor / plat, lalu klik baris untuk membuka dokumen.
- POP ditambahkan: saat "Selesai muat", vendor mengisi petugas gudang, qty yang dimuat (alasan wajib bila beda dari DO), foto, dan tanda tangan. Sama seperti POD: terkunci, ber-hash, dan punya QR verifikasi.
- Daftar POP / POD juga tampil di dialog Alokasi tiap DO.

## v2.3.0 - 2026-10-21

- Tahap 4: POD (bukti serah terima) di portal vendor. "Selesai bongkar" kini lewat form: nama penerima, qty diterima per barang (alasan wajib bila beda dari qty kirim), 1-4 foto yang otomatis diberi cap DO, lokasi, waktu (WIB) dan GPS, tanda tangan penerima, serta catatan.
- POD terkunci setelah dikirim: disimpan dengan hash SHA-256 (termasuk foto dan tanda tangan) dan kode verifikasi. Koreksi hanya lewat catatan tambahan (amandemen); data asli tidak pernah berubah. Integritas dicek ulang tiap dokumen dibuka.
- Di add-in: daftar POD per DO di dialog Alokasi, dokumen POD siap cetak / simpan PDF dengan QR verifikasi. Halaman /portal.html#/v/<kode> memverifikasi keaslian POD tanpa login.
- Foto dan tanda tangan dihapus otomatis setelah 30 hari (POD_RETENTION_DAYS); data teks dan hash tetap tersimpan.

## v2.2.0 - 2026-10-21

- Tahap 3: Portal Vendor di /portal.html (tanpa login, cukup tautan dari email penawaran; nyaman di HP). Vendor melihat rute, jadwal, kontak, dan barang tiap stop.
- Vendor dapat menerima DO dengan memilih kendaraan (hanya yang cocok kapasitas) dan driver (atau mengetik driver baru), atau menolak dengan alasan. Siapa menerima duluan menang; vendor lain langsung melihat penawaran ditutup.
- Eksekusi perjalanan: mulai perjalanan, tiba, mulai muat / bongkar, selesai & berangkat untuk tiap stop, berurutan dan tidak bisa dilompati. Lokasi HP dicatat tiap langkah (berguna untuk kendaraan tanpa GPS) dan ditandai bila di luar radius stop. DO otomatis Berjalan lalu Selesai.
- Di add-in: kemajuan perjalanan tampil di daftar Order dan linimasa lengkap (waktu, stop, tautan GPS) di dialog Alokasi. Email penawaran disederhanakan agar lebih kecil kemungkinan masuk tab Promotions.

## v2.1.0 - 2026-10-20

- Tahap 2 (Planning + Dispatch): menu baru "Vendor & Armada" untuk mengelola vendor (email, PIC), kendaraan (plat, jenis, GPS, kapasitas berat / volume / pallet / koli / dimensi bak, suhu, B3), dan driver.
- Alokasi DO dari daftar Order. Sistem membandingkan beban puncak DO dengan kapasitas tiap kendaraan dan menampilkan alasan bila tidak cocok (mis. "berat 2.400 > 900 kg").
- Dua cara: tawarkan ke beberapa vendor sekaligus (siapa yang menerima duluan mendapatkan DO, dijamin atomik; batas respons default 60 menit) atau alokasi langsung ke kendaraan + driver. Penawaran yang ditolak / kedaluwarsa tercatat dan DO ditandai "Tidak ada yang menerima" untuk dialokasikan ulang.
- Email penawaran memakai Brevo. Selama BREVO_API_KEY belum diisi di Vercel, penawaran tetap tercatat tetapi email berstatus belum terkirim. Halaman portal vendor (terima / tolak lewat tautan) menyusul di v2.2.

## v2.0.2 - 2026-10-20

- Perbaikan: kolom pada kartu barang tidak lagi kehilangan fokus setiap mengetik satu karakter; sekarang bisa mengetik langsung secara berkelanjutan.

## v2.0.1 - 2026-10-19

- Nomor DO dibuat otomatis dari waktu + nama customer (mis. DO-20261019-154854-PTCONTOH); cukup isi customer, nomor bisa diubah manual bila perlu.
- Lokasi stop lebih mudah: cari nama tempat/alamat (hasil langsung muncul), pilih Zona MyGeotab (titik, radius, dan bentuk zona terisi otomatis), atau klik / geser pin pada peta. Peta menampilkan titik, radius, dan zona.
- Tabel barang diganti kartu per barang dengan semua field kapasitas tertata rapi, tanpa scroll ke samping; kolom qty lebih lebar.
- Stop Delivery: centang barang dari pickup sehingga isinya otomatis sama persis (ikut berubah bila pickup diubah). Tombol "Ubah" untuk perbedaan di delivery (mis. qty sebagian) dan "Tambah barang lain" untuk barang berbeda.
- Dialog Order tidak lagi menempel di tepi atas dan selalu terlihat penuh di dalam MyGeotab.

## v2.0.0 - 2026-10-19

- Tahap 1 proses pengiriman: menu baru "Order" untuk membuat dan mengelola Delivery Order (DO). Satu DO bisa multi-drop dengan beberapa stop berurutan (pickup / delivery), masing-masing dengan alamat, koordinat, radius, jendela waktu, kontak, dan daftar barang.
- Data muatan selengkap mungkin: qty, satuan, berat, volume, pallet, koli, dimensi, kategori, suhu, B3, dan bisa ditumpuk. Ringkasan muatan menghitung beban puncak sepanjang rute, serta peringatan bila bongkar melebihi muat atau suhu bentrok.
- Import dari Excel / CSV memakai template kami (satu baris = satu item) dengan pratinjau dan validasi per DO sebelum disimpan. Template dan petunjuk kolom bisa diunduh.
- Backend baru di Vercel (Postgres + API) dengan autentikasi sesi MyGeotab dan jejak audit. Perlu menghubungkan Postgres dan mengisi ALLOWED_DATABASES (lihat README); cek status di /api/health.

## v1.12.0 - 2026-10-16

- Riwayat Alert: tombol "Lihat semua alert" membuka halaman riwayat lengkap. Tampilan Timeline (dikelompokkan per hari) dan Per kendaraan, dengan filter periode (hari ini / 7 / 30 / 90 hari), kendaraan, jenis kejadian, status penanganan, dan pencarian. Klik kejadian membuka detail penugasannya. Ekspor CSV tersedia.
- Semua jenis kejadian (keluar rute, kembali, terlambat, di titik awal, checkpoint, selesai) kini tersimpan permanen di AddInData per hari, sehingga tetap bisa dilihat setelah MyGeotab ditutup atau dibuka dari perangkat lain. Retensi default 90 hari (atur di Pengaturan), data lebih lama dihapus otomatis.
- "Tandai ditangani": alert keluar rute / terlambat dapat ditandai sudah ditangani beserta catatan; nama pengguna dan waktunya tercatat, dapat dibatalkan. Tersedia di panel Alert dan di Riwayat.

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
