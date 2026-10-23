# Panduan Demo TMS Add-in MyGeotab (v3.3)

Dua skenario, bisa dibawakan berurutan (±30 menit) atau dipilih salah satu:

- **A. TMS penuh** (±15 mnt): kita yang mengatur DO sampai POD. Untuk customer yang belum punya TMS.
- **B. Monitor / integrasi TMS customer** (±15 mnt): customer punya TMS sendiri, kita menarik DO lewat API, lalu memantau posisi, ketepatan waktu, dan BBM.

**Mode aplikasi:** pertama kali add-in dibuka muncul layar pemilihan mode. Pilih **TMS penuh** untuk Skenario A, lalu ganti ke **Monitor** di Pengaturan > Mode aplikasi untuk Skenario B (menu menyesuaikan, data tidak hilang).

---

## 1. Persiapan (H-1, ±1 jam)

### 1.1 Wajib sekali saja
| # | Tugas | Cek |
|---|-------|-----|
| 1 | Vercel > Settings > Environment Variables (semua **Sensitive**): `BREVO_API_KEY`, `FONNTE_TOKEN` (atau `WA_WEBHOOK_URL`), `CRON_SECRET`, `ENCRYPTION_KEY` (min. 16 karakter acak), `ALLOWED_DATABASES`. **Rotasi dulu API key Brevo yang pernah terekspos.** Redeploy setelah isi. | `https://<host>/api/health` menampilkan `schemaVersion: 10` dan `db: ok` |
| 2 | cron-job.org: GET tiap 5 menit ke `https://<host>/api/cron?key=<CRON_SECRET>` | Riwayat eksekusi cron-job.org status 200 |
| 3 | Email: SPF dan DKIM untuk `sumbermas-autorindo.com` di Brevo supaya DO tidak masuk spam | Kirim tes dari Exception > 🔔 Notifikasi > Kirim tes |
| 4 | Pasang add-in di database MyGeotab demo, buka sekali sebagai admin | Menu muncul, ikon versi 3.2.0 di Pengaturan > Tentang |
| 5 | Exception > tombol 🔔 Notifikasi: isi email dan nomor WA admin | Tes terkirim |

### 1.2 Data untuk Skenario A
1. **Vendor & Armada**: buat 2 vendor (mis. "Vendor Demo A", "Vendor Demo B"), masing-masing 1 kendaraan (plat sama dengan kendaraan di MyGeotab) dan 1 sopir, isi kapasitas.
2. **Order**: siapkan 1 DO multi-drop siap diketik (contoh di bagian 2.A) dan 1 file Excel DO untuk demo impor.
3. Buka email penerima vendor di HP, siap membuka tautan portal.

### 1.3 Data untuk Skenario B (TMS customer palsu)
Add-in menarik data dari URL https, jadi API customer disimulasikan dengan file statis yang ikut deploy Vercel.

1. Siapkan **4 kendaraan MyGeotab** dan catat platnya. Disarankan 2 kendaraan yang benar-benar bergerak saat demo (atau punya riwayat GPS hari ini) dan 2 lainnya diam.
2. Di laptop:
   ```bash
   cd fms_geotab
   npm run demo:tms -- --plates "B 1111 AA,B 2222 BB,B 3333 CC,B 4444 DD"
   git add public/demo/tms-orders.json && git commit -m "data demo" && git push origin main
   ```
   Urutan plat: **DO jalan**, **DO telat**, **DO terjadwal**, **DO selesai**. Waktu dibuat relatif terhadap saat skrip dijalankan, jadi **jalankan ulang di hari H pagi hari** (Vercel deploy ±1 menit).
3. Cek `https://<host>/demo/tms-orders.json` terbuka di browser.
4. Buat konektor (Integrasi TMS > Konektor baru), nilai yang diubah dari bawaan:
   - Nama: `TMS Demo`; URL dasar: `https://<host>`; Autentikasi: **Tanpa autentikasi**
   - Path endpoint: `/demo/tms-orders.json`; Query: kosongkan
   - Path daftar DO: `data`
   - Pemetaan barang > **Path daftar barang di stop: `items`** (nama `name`, qty `qty`, satuan `unit`, berat `weight`)
   - Pemetaan lain biarkan bawaan (sudah cocok dengan file demo)
5. Klik **Uji koneksi & pemetaan**: harus muncul 4 data tanpa masalah. Simpan. **Jangan klik Sinkron dulu** (itu bagian dari demo).

### 1.4 Cadangan
- Rekam layar satu putaran penuh Skenario A dan B (jaga-jaga internet).
- Mode demo bawaan tanpa MyGeotab: jalankan `npm run dev` lalu buka http://localhost:5173 (Geotab tiruan, data contoh, reset tiap muat ulang). Tidak mendemokan GPS asli, tapi semua halaman terisi.

---

## 2. Alur Demo

### Skenario A — TMS penuh (±15 menit)

| Menit | Layar | Lakukan | Ucapkan |
|-------|-------|---------|---------|
| 0-1 | Armada | Tunjukkan peta dan daftar kendaraan | "Semua kendaraan dari MyGeotab, posisi langsung. Sekarang kita tambah lapisan pengiriman." |
| 1-4 | Order | **Buat DO**: DO-DEMO-A1, customer bebas, 1 pickup dan 2 delivery. Tiap stop cukup pilih **Zona MyGeotab** (pastikan zonanya sudah ada di MyGeotab), isi barang dan jendela waktu, atur **lebar koridor**, lihat rute tergambar di peta. Simpan, lalu tunjukkan rutenya sudah masuk menu **Rute**. Tunjukkan juga **Impor Excel**. | "DO multi-drop dengan kapasitas lengkap. Bisa diketik atau impor dari template kita." |
| 4-6 | Order > DO tadi > Dispatch | Tawarkan ke 2 vendor | "DO dikirim ke beberapa vendor sekaligus lewat email. Siapa yang menerima duluan, dia yang dapat." |
| 6-9 | HP: email vendor (setelah vendor menerima, rute dan penugasan di Monitor dibuat otomatis, ±2 menit, add-in harus terbuka; kendaraan vendor harus punya GPS Geotab di Vendor & Armada) | Buka tautan, **Terima**, pilih kendaraan dan sopir. Lalu **Mulai**, **Tiba pickup**, **POP** (foto, tanda tangan), **Berangkat**, **Tiba delivery**, **POD** (foto, tanda tangan, nama penerima, qty) | "Vendor tanpa login, cukup tautan. Tiap langkah punya jam dan koordinat GPS. Tidak bisa berangkat sebelum POP." |
| 9-10 | Bukti | Buka POP dan POD, **Unduh dokumen**, scan QR verifikasi | "Dokumen bukti siap audit, dengan QR yang bisa diverifikasi siapa saja." |
| 10-12 | Exception | Di HP vendor, **Laporkan kendala** (mis. ban pecah). Tunjukkan masuk ke Exception dan email/WA admin | "Kendala dilaporkan vendor, admin langsung dapat notifikasi, dan tiap exception punya status ditangani." |
| 12-14 | Kinerja DO | Tunjukkan KPI, kinerja per vendor, ekspor CSV | "Selesai tepat waktu, lead time, kinerja vendor, dalam satu layar." |
| 14-15 | Monitor | Tunjukkan rute dan penugasan aktif | "Rute dan geofence dibuat dari titik stop, alert keluar rute sama dengan fitur monitoring kita." |

### Skenario B — Integrasi TMS customer (±15 menit)

1. **Pembuka (1 mnt)** — Pengaturan atau Integrasi TMS. Jelaskan: "Customer ini sudah punya TMS sendiri. Kita tidak mengubah proses mereka, hanya menarik DO lewat API lalu memantau lewat Geotab."
2. **Mode (1 mnt)** — Pengaturan > Mode aplikasi > pilih **Monitor** (menu Integrasi TMS dan Pengiriman baru muncul setelah ini). Menu Order, Vendor & Armada, dan Bukti hilang. "Tampilan jadi ringkas untuk customer yang memegang TMS sendiri."
3. **Konektor (2 mnt)** — Tunjukkan konektor `TMS Demo`: URL, autentikasi, pemetaan field. Klik **Uji koneksi & pemetaan** dan tunjukkan 4 DO terpetakan. "Tanpa coding. Cukup petakan field JSON customer ke format kita. Kunci API disimpan terenkripsi."
4. **Sinkron (1 mnt)** — Klik **Sinkron sekarang**: "4 DO baru". Tabel "DO dari TMS customer" terisi. Katakan: "Selanjutnya otomatis tiap N menit lewat cron."
5. **Penautan ke Geotab (3 mnt)** — Panel **Penautan ke kendaraan Geotab**: klik **Tautkan sekarang**. Plat dicocokkan ke kendaraan Geotab, rute dan penugasan dibuat otomatis. Jika ada plat yang tidak cocok, tunjukkan daftar alasannya dan pilih kendaraan manual (pemetaan plat). "Bila plat di TMS dan di Geotab beda penulisan, cukup dipetakan sekali."
6. **Monitor (2 mnt)** — Buka **Monitor**: kendaraan DO jalan terlihat di rutenya. Tunjukkan DO yang telat dan alert "terlambat / belum berangkat".
7. **Exception (1 mnt)** — Exception: terlambat, belum berangkat, di luar radius dari DO customer, tanpa input manual. Tunjukkan notifikasi email/WA.
8. **Pengiriman (3 mnt)** — Menu **Pengiriman**:
   - Kolom Pencocokan: "DO-DEMO-004 selesai di TMS tapi GPS tidak lengkap" (sengaja, jika kendaraan keempat diam). "Ini bukti GPS membandingkan klaim di TMS."
   - Ketepatan waktu per stop dari jam GPS.
   - **Hitung BBM semua** pada kendaraan yang bergerak: liter, km/L, liter per ton-km. Ekspor CSV.
9. **Kinerja DO (1 mnt)** — Kinerja DO untuk ringkasan, lalu penutup.

**Kalimat penutup**: "Customer tetap memakai TMS mereka. Yang kita tambahkan: bukti GPS atas klaim pengiriman, kepatuhan rute, ketepatan waktu, dan BBM per DO, semua dari GO device yang sudah terpasang."

---

## 3. Catatan Penting Saat Demo

- **Penautan hanya jalan selama add-in terbuka.** Biarkan tab MyGeotab terbuka sepanjang demo; panel penautan dijalankan otomatis tiap 2 menit atau lewat tombol.
- **Data demo statis.** Status DO di file demo tidak berubah sendiri. Untuk menunjukkan "DO selesai otomatis menutup penugasan", edit `status` jadi `DELIVERED` di file, push, tunggu deploy, lalu klik Sinkron sekarang dan Tautkan sekarang.
- **Kedatangan GPS** hanya terbaca bila kendaraan benar-benar masuk radius stop (default 150 m) saat jendela penugasan aktif. Untuk demo, atur koordinat stop di `scripts/demo-tms.mjs` ke lokasi kendaraan Anda (kantor/parkiran) supaya terdeteksi live.
- **BBM** butuh kendaraan dengan sensor BBM/engine di GO device dan minimal ±5 menit perjalanan antara kedatangan pertama dan terakhir. Siapkan satu kendaraan yang sudah punya riwayat bensin/solar.
- Vercel **Hobby** cukup untuk demo ini; upgrade ke Pro sebelum dipakai customer sungguhan.

## 4. Pertanyaan yang Sering Muncul

| Pertanyaan | Jawaban |
|------------|---------|
| Apakah TMS customer harus diubah? | Tidak. Cukup menyediakan akses baca ke API (token). |
| Bagaimana kalau API mereka berbeda format? | Pemetaan field fleksibel; satu contoh JSON dari mereka cukup untuk mengonfigurasinya. |
| Keamanan kunci API? | Disimpan terenkripsi AES-256-GCM, tidak pernah dikirim balik ke browser; hanya https, alamat internal diblokir. |
| BBM dari mana? | Sensor GO device (selisih counter BBM sepanjang perjalanan), bukan input manual. |
| Bagaimana kalau kendaraan vendor tanpa GPS? | Di mode TMS penuh, vendor tetap bisa update lewat portal; di mode integrasi, DO tanpa kendaraan Geotab ditandai "belum tertaut". |
| Kapan data ditarik? | Tiap N menit (minimal 5) lewat cron, atau manual. |
| Yang belum ada? | Pengiriman gagal baru berupa laporan, belum ada penggantian vendor di tengah jalan, halaman pelacakan untuk end customer, dan invoice. |
