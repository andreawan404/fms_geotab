// Label kendaraan untuk UI: nama sebagai baris utama, nopol sebagai baris kedua hanya bila belum ada di dalam nama.
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function vehicleLabel(dev) {
  const name = (dev && dev.name) || '';
  const plate = (dev && dev.plate) || '';
  const showPlate = !!plate && !norm(name).includes(norm(plate));
  return { name, plate: showPlate ? plate : '' };
}
