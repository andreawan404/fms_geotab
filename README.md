# TMS Add-in untuk MyGeotab

Add-in Transport Management System: daftar kendaraan + peta, rute dari checkpoint (rekomendasi peta / rute sendiri),
lebar koridor per rute, alert keluar rute, laporan FMS per rentang waktu, dan penugasan rute harian / terjadwal.
UI dua bahasa (Indonesia / English).

## Fitur

| # | Kebutuhan MVP | Di mana |
|---|---|---|
| 1 | List kendaraan | **Armada** (status moving/idle/offline/keluar rute, filter, cari) |
| 2 | Peta posisi kendaraan | **Armada** (Leaflet, refresh otomatis, jejak hari ini, overlay rute) |
| 3 | Rute dari beberapa checkpoint | **Rute** (klik peta, cari alamat, atau ambil dari Zone Geotab; radius per checkpoint) |
| 4 | Rute rekomendasi atau rute sendiri | **Rute** → "Jalur rute": hitung via OSRM/ORS (+ alternatif), atau gambar sendiri (+ "Tempel ke jalan") |
| 5 | Lebar jalan per rute | **Rute** → slider "Lebar koridor" (buffer polyline, tampil di peta) |
| 6 | Alert keluar rute | **Monitor** (bunyi, notifikasi browser, feed) + opsi Zone/Rule Geotab untuk 24/7 |
| 7 | Report FMS per rentang waktu | **Laporan**: ringkasan armada, trip, exception, kepatuhan rute; ekspor CSV |
| 8 | Assign rute harian / terjadwal | **Penugasan**: kalender mingguan, sekali / berulang, shift malam, kendaraan + driver, deteksi bentrok |

Fitur tambahan MVP yang disepakati: toleransi + debounce alert (anti GPS drift), status checkpoint (tiba, durasi berhenti,
selisih ETA, terlewat), laporan kepatuhan rute, replay rencana vs aktual, status penugasan
(terjadwal / berjalan / selesai / terlewat / menyimpang).

## Versi & riwayat perubahan

Riwayat lengkap ada di [CHANGELOG.md](CHANGELOG.md) dan di add-in (Pengaturan > Riwayat versi). Sumber tunggalnya `src/changelog.js`;
setelah mengubahnya jalankan `npm run changelog`. Setiap rilis menaikkan versi di `package.json` dan `public/config.json`
(`config.json` di `dist` diisi otomatis saat build).

Fitur sejak v1.1: fase tugas (titik awal / selesai / terlambat), engine hour + fuel used + fuel economy (Monitor, Laporan),
benchmark per rute dan per sopir, kolom Idle %, salin / duplikat penugasan. Engine hour dan fuel dibaca dari StatusData Geotab
(ID diagnostik bisa diubah di Pengaturan; gunakan **Cek sensor** untuk melihat kendaraan mana yang punya data).

## Cara kerja alert keluar rute

- **Selama halaman TMS terbuka (Monitor):** add-in mengambil `LogRecord` baru tiap N detik (default 15), menjalankan mesin
  deteksi per penugasan hari ini, lalu menampilkan alert, bunyi, dan notifikasi browser. Deteksi memakai debounce:
  keluar koridor ≥ 30 detik **atau** ≥ 150 m, toleransi GPS 10 m, pulih setelah kembali ≥ 15 detik, masa tenggang awal jadwal 15 menit
  (semua bisa diubah di Pengaturan atau per rute).
- **24/7 tanpa halaman terbuka (native Geotab):** di editor rute klik **Buat Zone Geotab**. Koridor disimpan sebagai Zone
  `TMS • <nama rute>`. Di MyGeotab buat Rule dengan kondisi *Zones → Exiting zone* untuk zone itu, lalu atur notifikasinya.
  Catatan: Rule Geotab tidak tahu jadwal penugasan harian; rule berlaku setiap kendaraan di dalam cakupan rule keluar zone.
- **Fase berikutnya (belum ada):** backend kecil untuk alert 24/7 yang sadar jadwal. Mesin deteksi (`src/core/*`) sengaja
  tanpa dependensi UI sehingga bisa langsung dipakai di Node.

## Instalasi

Prasyarat: Node 18+ dan hosting statis **HTTPS** (Nginx di VPS, S3, GitHub Pages, dsb.).

```bash
npm install
npm test                 # 27 unit test (engine, jadwal, penyimpanan)
node scripts/gen-addin-id.mjs          # opsional: buat addInId milikmu sendiri
ADDIN_ID=<id> HOST_URL=https://host.kamu.com/tms npm run build
```

Hasil di `dist/`: `tms.js`, `addin.html`, `config.json`, `icon.svg`. Upload seluruh isi `dist/` ke
`https://host.kamu.com/tms/` (semua file satu folder).

**Deploy via Vercel (dipakai di repo ini):** `vercel.json` sudah mengatur build (`npm ci` + `npm run build`), folder output
`dist`, dan header CORS. Host: `https://fms-geotab.vercel.app` (root domain, tanpa subfolder), jadi URL add-in adalah
`https://fms-geotab.vercel.app/addin.html`. Setiap push ke `main` men-deploy ulang. Jika domain Vercel berubah, ubah
`HOST_URL` di `vercel.json` dan URL di `public/config.json`.

Pasang di MyGeotab: **Administration → System → System Settings → Add-Ins → New Add-In → tab Configuration**, tempel
isi `config.json` (URL sudah diganti oleh `HOST_URL`), simpan, lalu muat ulang MyGeotab. Menu **TMS Rute** muncul di
bagian Activity. Setelah tempel, buka halaman TMS → **Pengaturan** untuk memilih routing.

`addInId` harus unik per add-in dan **jangan diganti setelah dipakai**, karena semua data (rute, penugasan, setting)
disimpan di AddInData dengan ID itu.

## Mode demo (tanpa database MyGeotab)

```bash
npm run dev     # buka http://localhost:5173
```

Memakai API Geotab tiruan: 6 kendaraan, 1 rute Jakarta–Karawang, 4 penugasan; TRK-002 sengaja keluar rute, TRK-005 telat,
TRK-006 belum berangkat. Data demo di-reset tiap muat ulang (tambahkan `?keep=1` untuk mempertahankan).

## Routing, peta, dan biaya

- **OSRM** (default): server demo publik hanya untuk uji coba. Untuk produksi, jalankan OSRM sendiri dan isi URL di Pengaturan.
- **OpenRouteService**: daftar gratis di openrouteservice.org, isi API key di Pengaturan. Mendukung rute alternatif dan profil
  truk berat (HGV).
- **Tile peta**: tile OSM publik hanya untuk pemakaian ringan; ganti ke penyedia tile berlangganan untuk produksi.
- API key dan setting disimpan di AddInData Geotab dan terbaca oleh user yang punya akses add-in. Pakai key khusus dengan kuota terbatas.

## Struktur

```
src/core/      mesin murni: geometry, polyline, tracking (deviasi/checkpoint), schedule, corridor, csv
src/services/  geotab (API wrapper), store (AddInData), routing (OSRM/ORS/geocode), monitor, mock (demo)
src/pages/     Fleet, Routes, Assignments, Monitor, Reports, Settings
src/components InstanceDetail (replay), mapkit (Leaflet), ui
tests/         engine + store
scripts/       postbuild, gen-addin-id, check-i18n
```

## Batasan yang perlu diketahui

- **Belum diuji pada database MyGeotab sungguhan.** Pengujian dilakukan terhadap API Geotab tiruan dan harness yang meniru
  cara MyGeotab memanggil add-in (`initialize/focus/blur`). Uji dulu di database demo sebelum rollout.
- Alert real-time di halaman Monitor hanya aktif saat halaman terbuka (lihat bagian alert untuk opsi 24/7).
- Jam jadwal mengikuti zona waktu browser pengguna.
- Satu rute dibatasi ±9.500 karakter metadata per record (geometri dipecah otomatis); sekitar 100+ checkpoint akan ditolak
  dengan pesan jelas. Geometri disederhanakan ke ≤ 2.500 titik.
- Laporan memanggil `Trip`, `ExceptionEvent`, dan `LogRecord` per kendaraan; rentang > 31 hari meminta konfirmasi.
- Zone Geotab dari koridor disederhanakan (≤ 400 titik); koridor yang terputus hanya memakai bagian terbesar.


## Backend order (v2.0+)

Fitur Order memakai Vercel Functions (`api/`) dan Postgres. Setup sekali:

1. Vercel project > **Storage > Create Database > Postgres (Neon)** lalu hubungkan ke project ini. Variabel `POSTGRES_URL` (atau `DATABASE_URL`) terisi otomatis.
2. Project > Settings > Environment Variables: `ALLOWED_DATABASES` = nama database MyGeotab (pisahkan koma bila lebih dari satu).
3. **Redeploy**, lalu buka `https://fms-geotab.vercel.app/api/health` untuk memastikan database dan autentikasi `ok`.

Skema database dibuat/dimigrasi otomatis saat API pertama dipanggil. API memverifikasi sesi MyGeotab pengguna (header `Authorization: Geotab ...`).

### Email penawaran (Brevo) - opsional sampai siap

Tambahkan di Vercel > Environment Variables lalu Redeploy: `BREVO_API_KEY` (Secret), `BREVO_SENDER` (default `aan@sumbermas-autorindo.com`, harus sudah diverifikasi sebagai sender di Brevo), `PORTAL_BASE_URL` (default `https://fms-geotab.vercel.app`). Tanpa `BREVO_API_KEY`, penawaran tetap tercatat tetapi email tidak dikirim.

## POD (v2.3)

Bukti serah terima disimpan di Postgres (foto ≤ ~100–400 KB, tanda tangan PNG). Foto & tanda tangan dihapus setelah `POD_RETENTION_DAYS` hari (default 30); metadata + hash tetap. Verifikasi publik: `/portal.html#/v/<kode>`.

## Exception & Kinerja (v2.4)

Exception dideteksi otomatis saat admin membuka menu Exception (tanpa cron, aman untuk Vercel Hobby). Variabel opsional: `EXC_LATE_GRACE_MIN` (15), `EXC_STALE_MIN` (120), `EXC_START_GRACE_MIN` (30). Endpoint: `GET /api/insights` (daftar exception / `?r=report`), `POST /api/insights` (ack / unack / resolve).
