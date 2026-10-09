const id = {
  loading: 'Memuat…', save: 'Simpan', cancel: 'Batal', close: 'Tutup', delete: 'Hapus', edit: 'Ubah', duplicate: 'Duplikat', back: 'Kembali', search: 'Cari', refresh: 'Muat ulang',
  saved: 'Tersimpan', cancelled: 'Dibatalkan', optional: 'opsional', undo: 'Urungkan', noDriver: 'Tanpa driver',
  'err.store': 'Gagal memuat data TMS (AddInData)', 'err.devices': 'Gagal memuat kendaraan',

  'nav.fleet': 'Armada', 'nav.routes': 'Rute', 'nav.assignments': 'Penugasan', 'nav.monitor': 'Monitor', 'nav.reports': 'Laporan', 'nav.settings': 'Pengaturan',

  'state.all': 'Semua', 'state.moving': 'Bergerak', 'state.idle': 'Diam', 'state.offline': 'Offline', 'state.deviating': 'Keluar rute',
  'status.planned': 'Terjadwal', 'status.in_progress': 'Berjalan', 'status.completed': 'Selesai', 'status.missed': 'Terlewat', 'status.deviated': 'Menyimpang',

  'fleet.title': 'Kendaraan', 'fleet.search': 'Cari nama / plat…', 'fleet.empty': 'Tidak ada kendaraan', 'fleet.track': 'Jejak hari ini', 'fleet.noTrack': 'Belum ada jejak GPS hari ini',

  'routes.title': 'Rute', 'routes.new': 'Rute baru', 'routes.edit': 'Ubah rute', 'routes.empty': 'Belum ada rute. Klik "Rute baru" untuk membuat rute dari beberapa checkpoint.',
  'routes.cp': 'checkpoint', 'routes.width': 'Lebar koridor', 'routes.assignments': 'penugasan', 'routes.name': 'Nama rute', 'routes.color': 'Warna',
  'routes.confirmDelete': 'Hapus rute "{name}"? {n} penugasan terkait juga akan dihapus.',
  'routes.checkpoints': 'Checkpoint (urutan perhentian)', 'routes.radius': 'Radius checkpoint (m)',
  'routes.cpHelp': 'Tambahkan minimal 2 checkpoint: klik peta, cari alamat, atau pilih Zone Geotab.',
  'routes.clickMap': '＋ Klik peta untuk menambah', 'routes.clickMapOn': '● Klik peta… (klik lagi untuk berhenti)',
  'routes.reverse': 'Balik urutan', 'routes.roundTrip': 'Pulang-pergi', 'routes.searchAddr': 'Cari alamat / tempat…', 'routes.noHits': 'Alamat tidak ditemukan',
  'routes.fromZone': 'Ambil dari Zone Geotab…', 'routes.pickZone': 'Pilih zone…',
  'routes.pathMode': 'Jalur rute', 'routes.mode.recommended': 'Rekomendasi peta', 'routes.mode.manual': 'Rute sendiri',
  'routes.profile': 'Jenis kendaraan', 'routes.profile.car': 'Mobil / pickup', 'routes.profile.hgv': 'Truk berat (HGV)',
  'routes.compute': 'Hitung rute', 'routes.recompute': 'Hitung ulang rute', 'routes.need2cp': 'Minimal 2 checkpoint', 'routes.needPath': 'Jalur rute belum ada', 'routes.needName': 'Nama rute wajib diisi',
  'routes.stale': 'Checkpoint berubah sejak rute dihitung. Hitung ulang rute.', 'routes.staleConfirm': 'Checkpoint berubah sejak rute dihitung. Simpan dengan jalur lama?',
  'routes.altsFound': '{n} alternatif rute ditemukan. Klik jalur abu-abu atau pilih dari daftar.', 'routes.pickAlt': 'Pilih alternatif rute:', 'routes.alt': 'Alternatif',
  'routes.manualHelp': 'Klik peta untuk menambah titik jalur. Seret titik untuk menggeser, klik kanan untuk menghapus. "Tempel ke jalan" mengikuti jaringan jalan.',
  'routes.draw': '✎ Gambar jalur', 'routes.drawOn': '● Menggambar… (klik lagi untuk berhenti)', 'routes.snap': 'Tempel ke jalan', 'routes.snapped': 'Jalur ditempel ke jalan',
  'routes.tooManyVertices': 'Maksimal 50 titik untuk "Tempel ke jalan". Kurangi titik dulu.', 'routes.fromCp': 'Dari checkpoint', 'routes.clearPath': 'Kosongkan', 'routes.vertices': 'titik jalur',
  'routes.widthHelp': 'Kendaraan dianggap keluar rute bila lebih dari {half} m dari garis tengah (+ toleransi GPS).',
  'routes.alertParams': 'Parameter alert (opsional, menimpa default)', 'routes.alertParamsHelp': 'Kosongkan untuk memakai default dari Pengaturan.',
  'routes.zoneCreate': 'Buat Zone Geotab', 'routes.zoneUpdate': 'Perbarui Zone Geotab', 'routes.zoneHelp': 'Menyimpan koridor sebagai Zone Geotab untuk Rule "keluar zone" (alert 24/7 native Geotab)',
  'routes.zoneSynced': 'Zone Geotab disimpan ({n} titik).', 'routes.zoneParts': 'Koridor terputus; hanya bagian terbesar yang dipakai.',

  'param.widthM': 'Lebar koridor default (m)', 'param.widthM.hint': 'Total lebar; setengahnya di kiri-kanan garis tengah',
  'param.radius': 'Radius checkpoint (m)', 'param.radius.hint': 'Jarak dianggap "tiba"',
  'param.avgSpeedKmh': 'Kecepatan rata-rata (km/j)', 'param.avgSpeedKmh.hint': 'Untuk ETA rute manual',
  'param.confirmSec': 'Konfirmasi keluar rute (detik)', 'param.confirmSec.hint': 'Di luar koridor ≥ N detik',
  'param.confirmMeters': 'Konfirmasi keluar rute (meter)', 'param.confirmMeters.hint': 'ATAU menempuh ≥ N m di luar koridor',
  'param.gpsMarginM': 'Toleransi GPS (m)', 'param.gpsMarginM.hint': 'Ditambahkan ke setengah lebar koridor',
  'param.recoverSec': 'Pemulihan (detik)', 'param.recoverSec.hint': 'Kembali di koridor ≥ N detik → alert ditutup',
  'param.graceMin': 'Masa tenggang awal (menit)', 'param.graceMin.hint': 'Setelah jadwal mulai, belum di rute tidak dihitung deviasi',

  'asg.title': 'Penugasan rute', 'asg.new': 'Penugasan baru', 'asg.edit': 'Ubah penugasan', 'asg.needRoute': 'Buat rute dulu sebelum membuat penugasan.',
  'asg.thisWeek': 'Minggu ini', 'asg.onlyScheduled': 'Hanya yang terjadwal', 'asg.vehicle': 'Kendaraan', 'asg.driver': 'Driver', 'asg.route': 'Rute', 'asg.date': 'Tanggal',
  'asg.empty': 'Tidak ada penugasan di minggu ini. Klik sel kalender untuk membuat.',
  'asg.kind.once': 'Satu kali', 'asg.kind.recur': 'Berulang', 'asg.days': 'Hari', 'asg.from': 'Mulai tanggal', 'asg.until': 'Sampai tanggal',
  'asg.startTime': 'Jam mulai', 'asg.endTime': 'Jam selesai', 'asg.overnight': 'Selesai hari berikutnya (shift malam)', 'asg.note': 'Catatan', 'asg.active': 'Aktif',
  'asg.errRoute': 'Pilih rute', 'asg.errVehicle': 'Pilih kendaraan', 'asg.errDate': 'Isi tanggal', 'asg.errRecur': 'Pilih hari dan rentang tanggal yang valid',
  'asg.conflicts': 'Jadwal bentrok:', 'asg.conflict.vehicle': 'Kendaraan sudah dijadwalkan', 'asg.conflict.driver': 'Driver sudah dijadwalkan',
  'asg.deleteThis': 'Hapus hari ini saja', 'asg.deleteSeries': 'Hapus seluruh seri',
  'asg.confirmDeleteOne': 'Hapus penugasan tanggal {date}?', 'asg.confirmDeleteAll': 'Hapus penugasan ini (seluruh seri)?',

  'mon.title': 'Monitor hari ini', 'mon.sound': 'Bunyi alert', 'mon.enableNotif': 'Aktifkan notifikasi browser', 'mon.status': 'Status', 'mon.window': 'Jadwal',
  'mon.offRoute': 'Jarak ke rute', 'mon.lastPos': 'Posisi terakhir', 'mon.next': 'Berikutnya', 'mon.feed': 'Alert & kejadian', 'mon.noAlerts': 'Belum ada kejadian', 'mon.empty': 'Tidak ada penugasan untuk filter ini',
  'mon.openOnly': 'Alert real-time aktif selama halaman TMS terbuka. Untuk alert 24/7, simpan koridor sebagai Zone Geotab (di editor rute) lalu buat Rule "keluar zone".',

  'alert.deviation_start': '{device} keluar dari rute {route} ({dist} m dari jalur)', 'alert.deviation_end': '{device} kembali ke rute {route}',
  'alert.checkpoint_arrived': '{device} tiba di {cp} ({route})', 'alert.checkpoint_skipped': '{device} melewati {cp} tanpa berhenti ({route})', 'alert.route_completed': '{device} menyelesaikan rute {route}', 'alert.start_reached': '{device} sudah berada di titik awal {cp} ({route})',
  'phase.to_start': 'Menuju titik awal', 'phase.at_start': 'Di titik awal', 'phase.en_route': 'Dalam perjalanan', 'phase.finished': 'Selesai', 'mon.phase': 'Posisi tugas',

  'detail.compliance': 'Kepatuhan rute', 'detail.deviations': 'Deviasi', 'detail.outKm': 'Jarak di luar rute', 'detail.checkpoints': 'Checkpoint', 'detail.distance': 'Jarak tempuh', 'detail.maxOff': 'Simpangan maks',
  'detail.planned': 'Rencana', 'detail.arrived': 'Tiba', 'detail.delay': 'Selisih', 'detail.dwell': 'Berhenti', 'detail.skipped': 'Terlewat', 'detail.deviationList': 'Daftar deviasi',
  'detail.start': 'Mulai', 'detail.end': 'Selesai', 'detail.ongoing': 'Berlangsung', 'detail.replay': 'Replay',

  'rep.range': 'Rentang waktu', 'rep.today': 'Hari ini', 'rep.yesterday': 'Kemarin', 'rep.last7': '7 hari', 'rep.last30': '30 hari', 'rep.vehicles': 'Kendaraan', 'rep.allVehicles': 'Semua kendaraan', 'rep.selected': 'dipilih',
  'rep.generate': 'Buat laporan', 'rep.hint': 'Pilih rentang waktu lalu klik "Buat laporan".', 'rep.badRange': 'Tanggal awal harus sebelum tanggal akhir', 'rep.bigRange': 'Rentang {n} hari akan lama diproses. Lanjutkan?',
  'rep.loading': 'Mengambil trip & exception…', 'rep.evaluating': 'Mengevaluasi kepatuhan rute', 'rep.empty': 'Tidak ada data pada rentang ini', 'rep.noRuns': 'Tidak ada penugasan pada rentang ini', 'rep.truncated': 'Menampilkan {n} baris pertama. Ekspor CSV untuk data lengkap.',
  'rep.kpi.distance': 'Total jarak', 'rep.kpi.trips': 'Trip', 'rep.kpi.driving': 'Waktu jalan', 'rep.kpi.idle': 'Idle', 'rep.kpi.exceptions': 'Exception', 'rep.kpi.runs': 'Rute selesai', 'rep.kpi.runsSub': 'dari penugasan', 'rep.kpi.compliance': 'Kepatuhan rute', 'rep.kpi.deviations': 'Total deviasi',
  'rep.tab.summary': 'Ringkasan armada', 'rep.tab.trips': 'Trip', 'rep.tab.exceptions': 'Exception', 'rep.tab.compliance': 'Kepatuhan rute',
  'rep.col.km': 'km', 'rep.col.maxSpeed': 'Kec. maks', 'rep.col.runs': 'Penugasan', 'rep.col.outKm': 'km di luar rute', 'rep.col.stop': 'Berhenti', 'rep.col.excDur': 'Durasi exception', 'rep.col.lastDelay': 'Selisih akhir', 'rep.cpName': 'Checkpoint',

  'set.title': 'Pengaturan', 'set.changelog': 'Riwayat versi', 'set.routing': 'Peta & routing', 'set.provider': 'Penyedia routing', 'set.country': 'Negara (ISO)', 'set.countryHint': 'Membatasi pencarian alamat, mis. ID',
  'set.orsHint': 'Daftar gratis di openrouteservice.org. Mendukung rute alternatif dan profil truk.', 'set.osrmHint': 'Server demo publik hanya untuk uji coba. Gunakan server OSRM sendiri untuk produksi.',
  'set.tiles': 'URL tile peta', 'set.tilesHint': 'Tile OSM publik untuk penggunaan ringan. Ganti dengan penyedia tile berlangganan untuk produksi.', 'set.test': 'Tes routing', 'set.testOk': 'Routing OK ({km} km)',
  'set.keyWarn': 'Pengaturan (termasuk API key) disimpan di AddInData database Geotab dan dapat dibaca pengguna yang punya akses add-in. Gunakan key khusus dengan kuota terbatas.',
  'set.defaults': 'Default rute & alert', 'set.poll': 'Interval polling (detik)', 'set.pollHint': 'Minimal 5',
  'set.about': 'Tentang', 'set.aboutBody': 'TMS add-in untuk MyGeotab: armada, rute checkpoint, koridor, penugasan harian, alert keluar rute, dan laporan.', 'set.demoMode': 'mode demo (data tiruan)',
  'set.ruleGuide': 'Alert 24/7: di rute yang disimpan, klik "Buat Zone Geotab", lalu di MyGeotab buat Rule dengan kondisi "Zones → Keluar dari zone" dan pilih zone "TMS • nama rute".',
};

const en = {
  loading: 'Loading…', save: 'Save', cancel: 'Cancel', close: 'Close', delete: 'Delete', edit: 'Edit', duplicate: 'Duplicate', back: 'Back', search: 'Search', refresh: 'Refresh',
  saved: 'Saved', cancelled: 'Cancelled', optional: 'optional', undo: 'Undo', noDriver: 'No driver',
  'err.store': 'Failed to load TMS data (AddInData)', 'err.devices': 'Failed to load vehicles',

  'nav.fleet': 'Fleet', 'nav.routes': 'Routes', 'nav.assignments': 'Assignments', 'nav.monitor': 'Monitor', 'nav.reports': 'Reports', 'nav.settings': 'Settings',

  'state.all': 'All', 'state.moving': 'Moving', 'state.idle': 'Idle', 'state.offline': 'Offline', 'state.deviating': 'Off route',
  'status.planned': 'Planned', 'status.in_progress': 'In progress', 'status.completed': 'Completed', 'status.missed': 'Missed', 'status.deviated': 'Deviated',

  'fleet.title': 'Vehicles', 'fleet.search': 'Search name / plate…', 'fleet.empty': 'No vehicles', 'fleet.track': "Today's track", 'fleet.noTrack': 'No GPS track today yet',

  'routes.title': 'Routes', 'routes.new': 'New route', 'routes.edit': 'Edit route', 'routes.empty': 'No routes yet. Click "New route" to build one from checkpoints.',
  'routes.cp': 'checkpoints', 'routes.width': 'Corridor width', 'routes.assignments': 'assignments', 'routes.name': 'Route name', 'routes.color': 'Color',
  'routes.confirmDelete': 'Delete route "{name}"? {n} linked assignments will be deleted too.',
  'routes.checkpoints': 'Checkpoints (stop order)', 'routes.radius': 'Checkpoint radius (m)',
  'routes.cpHelp': 'Add at least 2 checkpoints: click the map, search an address, or pick a Geotab Zone.',
  'routes.clickMap': '＋ Click map to add', 'routes.clickMapOn': '● Click the map… (click again to stop)',
  'routes.reverse': 'Reverse', 'routes.roundTrip': 'Round trip', 'routes.searchAddr': 'Search address / place…', 'routes.noHits': 'Address not found',
  'routes.fromZone': 'Pick from Geotab Zones…', 'routes.pickZone': 'Pick a zone…',
  'routes.pathMode': 'Route path', 'routes.mode.recommended': 'Map-recommended', 'routes.mode.manual': 'Custom route',
  'routes.profile': 'Vehicle type', 'routes.profile.car': 'Car / pickup', 'routes.profile.hgv': 'Heavy truck (HGV)',
  'routes.compute': 'Compute route', 'routes.recompute': 'Recompute route', 'routes.need2cp': 'At least 2 checkpoints required', 'routes.needPath': 'Route path is empty', 'routes.needName': 'Route name is required',
  'routes.stale': 'Checkpoints changed since the route was computed. Recompute the route.', 'routes.staleConfirm': 'Checkpoints changed since the route was computed. Save with the old path?',
  'routes.altsFound': '{n} route alternatives found. Click a gray path or pick from the list.', 'routes.pickAlt': 'Choose an alternative:', 'routes.alt': 'Alternative',
  'routes.manualHelp': 'Click the map to add path points. Drag points to move, right-click to delete. "Snap to road" follows the road network.',
  'routes.draw': '✎ Draw path', 'routes.drawOn': '● Drawing… (click again to stop)', 'routes.snap': 'Snap to road', 'routes.snapped': 'Path snapped to road',
  'routes.tooManyVertices': 'At most 50 points for "Snap to road". Remove some points first.', 'routes.fromCp': 'From checkpoints', 'routes.clearPath': 'Clear', 'routes.vertices': 'path points',
  'routes.widthHelp': 'A vehicle is off-route when more than {half} m from the centerline (+ GPS margin).',
  'routes.alertParams': 'Alert parameters (optional, override defaults)', 'routes.alertParamsHelp': 'Leave empty to use the defaults from Settings.',
  'routes.zoneCreate': 'Create Geotab Zone', 'routes.zoneUpdate': 'Update Geotab Zone', 'routes.zoneHelp': 'Saves the corridor as a Geotab Zone for an "exiting zone" Rule (native 24/7 Geotab alerts)',
  'routes.zoneSynced': 'Geotab Zone saved ({n} points).', 'routes.zoneParts': 'Corridor is disjoint; only the largest part is used.',

  'param.widthM': 'Default corridor width (m)', 'param.widthM.hint': 'Total width; half on each side of the centerline',
  'param.radius': 'Checkpoint radius (m)', 'param.radius.hint': 'Distance counted as "arrived"',
  'param.avgSpeedKmh': 'Average speed (km/h)', 'param.avgSpeedKmh.hint': 'For custom-route ETA',
  'param.confirmSec': 'Confirm off-route (seconds)', 'param.confirmSec.hint': 'Outside corridor ≥ N seconds',
  'param.confirmMeters': 'Confirm off-route (meters)', 'param.confirmMeters.hint': 'OR traveled ≥ N m outside corridor',
  'param.gpsMarginM': 'GPS margin (m)', 'param.gpsMarginM.hint': 'Added to half the corridor width',
  'param.recoverSec': 'Recovery (seconds)', 'param.recoverSec.hint': 'Back inside ≥ N seconds → alert closed',
  'param.graceMin': 'Start grace (minutes)', 'param.graceMin.hint': 'After schedule start, not yet on route is not a deviation',

  'asg.title': 'Route assignments', 'asg.new': 'New assignment', 'asg.edit': 'Edit assignment', 'asg.needRoute': 'Create a route before creating assignments.',
  'asg.thisWeek': 'This week', 'asg.onlyScheduled': 'Scheduled only', 'asg.vehicle': 'Vehicle', 'asg.driver': 'Driver', 'asg.route': 'Route', 'asg.date': 'Date',
  'asg.empty': 'No assignments this week. Click a calendar cell to create one.',
  'asg.kind.once': 'One time', 'asg.kind.recur': 'Recurring', 'asg.days': 'Days', 'asg.from': 'Start date', 'asg.until': 'End date',
  'asg.startTime': 'Start time', 'asg.endTime': 'End time', 'asg.overnight': 'Ends next day (night shift)', 'asg.note': 'Note', 'asg.active': 'Active',
  'asg.errRoute': 'Select a route', 'asg.errVehicle': 'Select a vehicle', 'asg.errDate': 'Enter a date', 'asg.errRecur': 'Select valid days and date range',
  'asg.conflicts': 'Schedule conflicts:', 'asg.conflict.vehicle': 'Vehicle already scheduled', 'asg.conflict.driver': 'Driver already scheduled',
  'asg.deleteThis': 'Delete this day only', 'asg.deleteSeries': 'Delete whole series',
  'asg.confirmDeleteOne': 'Delete the assignment on {date}?', 'asg.confirmDeleteAll': 'Delete this assignment (whole series)?',

  'mon.title': "Today's monitor", 'mon.sound': 'Alert sound', 'mon.enableNotif': 'Enable browser notifications', 'mon.status': 'Status', 'mon.window': 'Schedule',
  'mon.offRoute': 'Distance to route', 'mon.lastPos': 'Last position', 'mon.next': 'Next', 'mon.feed': 'Alerts & events', 'mon.noAlerts': 'No events yet', 'mon.empty': 'No assignments for this filter',
  'mon.openOnly': 'Real-time alerts run while the TMS page is open. For 24/7 alerts, save the corridor as a Geotab Zone (in the route editor) and create an "exiting zone" Rule.',

  'alert.deviation_start': '{device} left route {route} ({dist} m off path)', 'alert.deviation_end': '{device} is back on route {route}',
  'alert.checkpoint_arrived': '{device} arrived at {cp} ({route})', 'alert.checkpoint_skipped': '{device} passed {cp} without stopping ({route})', 'alert.route_completed': '{device} completed route {route}', 'alert.start_reached': '{device} is at the start point {cp} ({route})',
  'phase.to_start': 'Heading to start', 'phase.at_start': 'At start point', 'phase.en_route': 'En route', 'phase.finished': 'Finished', 'mon.phase': 'Task phase',

  'detail.compliance': 'Route compliance', 'detail.deviations': 'Deviations', 'detail.outKm': 'Distance off route', 'detail.checkpoints': 'Checkpoints', 'detail.distance': 'Distance', 'detail.maxOff': 'Max offset',
  'detail.planned': 'Planned', 'detail.arrived': 'Arrived', 'detail.delay': 'Delta', 'detail.dwell': 'Dwell', 'detail.skipped': 'Skipped', 'detail.deviationList': 'Deviations',
  'detail.start': 'Start', 'detail.end': 'End', 'detail.ongoing': 'Ongoing', 'detail.replay': 'Replay',

  'rep.range': 'Date range', 'rep.today': 'Today', 'rep.yesterday': 'Yesterday', 'rep.last7': '7 days', 'rep.last30': '30 days', 'rep.vehicles': 'Vehicles', 'rep.allVehicles': 'All vehicles', 'rep.selected': 'selected',
  'rep.generate': 'Generate report', 'rep.hint': 'Pick a date range and click "Generate report".', 'rep.badRange': 'Start date must be before end date', 'rep.bigRange': 'A {n}-day range will take a while. Continue?',
  'rep.loading': 'Fetching trips & exceptions…', 'rep.evaluating': 'Evaluating route compliance', 'rep.empty': 'No data in this range', 'rep.noRuns': 'No assignments in this range', 'rep.truncated': 'Showing the first {n} rows. Export CSV for the full data.',
  'rep.kpi.distance': 'Total distance', 'rep.kpi.trips': 'Trips', 'rep.kpi.driving': 'Driving time', 'rep.kpi.idle': 'Idle', 'rep.kpi.exceptions': 'Exceptions', 'rep.kpi.runs': 'Routes completed', 'rep.kpi.runsSub': 'of assignments', 'rep.kpi.compliance': 'Route compliance', 'rep.kpi.deviations': 'Total deviations',
  'rep.tab.summary': 'Fleet summary', 'rep.tab.trips': 'Trips', 'rep.tab.exceptions': 'Exceptions', 'rep.tab.compliance': 'Route compliance',
  'rep.col.km': 'km', 'rep.col.maxSpeed': 'Max speed', 'rep.col.runs': 'Assignments', 'rep.col.outKm': 'km off route', 'rep.col.stop': 'Stopped', 'rep.col.excDur': 'Exception duration', 'rep.col.lastDelay': 'Final delta', 'rep.cpName': 'Checkpoint',

  'set.title': 'Settings', 'set.changelog': 'Version history', 'set.routing': 'Map & routing', 'set.provider': 'Routing provider', 'set.country': 'Country (ISO)', 'set.countryHint': 'Restricts address search, e.g. ID',
  'set.orsHint': 'Free signup at openrouteservice.org. Supports route alternatives and truck profiles.', 'set.osrmHint': 'The public demo server is for testing only. Use your own OSRM server in production.',
  'set.tiles': 'Map tile URL', 'set.tilesHint': 'Public OSM tiles for light use. Switch to a subscription tile provider in production.', 'set.test': 'Test routing', 'set.testOk': 'Routing OK ({km} km)',
  'set.keyWarn': 'Settings (including API keys) are stored in Geotab AddInData and readable by users with add-in access. Use a dedicated key with a limited quota.',
  'set.defaults': 'Route & alert defaults', 'set.poll': 'Polling interval (seconds)', 'set.pollHint': 'Minimum 5',
  'set.about': 'About', 'set.aboutBody': 'TMS add-in for MyGeotab: fleet, checkpoint routes, corridors, daily assignments, off-route alerts and reports.', 'set.demoMode': 'demo mode (mock data)',
  'set.ruleGuide': '24/7 alerts: on a saved route click "Create Geotab Zone", then in MyGeotab create a Rule with the "Zones → Exiting zone" condition and pick the zone "TMS • route name".',
};

export const dict = { id, en };

export function makeT(lang) {
  const d = dict[lang] || dict.id;
  return (key, vars) => {
    let s = d[key] ?? dict.en[key] ?? key;
    if (vars) for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, String(vars[k]));
    return s;
  };
}
export const LANGS = ['id', 'en'];
