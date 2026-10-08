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
