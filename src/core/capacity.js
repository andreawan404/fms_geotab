// Kecocokan kendaraan dengan muatan DO. Murni (dipakai add-in, API, dan tes).
// Kebutuhan muatan = hasil totals(order): beban/volume/pallet PUNCAK sepanjang rute, dimensi barang terbesar, rentang suhu, B3.

export const VEHICLE_TYPES = ['pickup', 'blindvan', 'cdd', 'cde', 'fuso', 'wingbox', 'tronton', 'trailer', 'container', 'reefer', 'tanker', 'other'];

const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @param v kendaraan { maxWeightKg, maxVolumeM3, maxPallets, maxColli, lengthCm, widthCm, heightCm, tempControlled, tempMinC, tempMaxC, allowsHazardous }
 * @param need totals(order)
 * @returns { ok, reasons:[{code, need, have}], util:{weight, volume, pallets} } - util dalam persen (null bila batas tidak diisi)
 */
export function vehicleFit(v, need) {
  const reasons = [];
  const cap = (code, needV, haveV) => {
    const h = n(haveV);
    if (h != null && needV > h + 1e-9) reasons.push({ code, need: needV, have: h });
  };
  cap('weight', need.peakWeight || 0, v.maxWeightKg);
  cap('volume', need.peakVolume || 0, v.maxVolumeM3);
  cap('pallets', need.peakPallets || 0, v.maxPallets);
  cap('colli', need.peakColli || 0, v.maxColli);
  cap('length', need.maxLengthCm || 0, v.lengthCm);
  cap('width', need.maxWidthCm || 0, v.widthCm);
  cap('height', need.maxHeightCm || 0, v.heightCm);
  if (need.tempMin != null || need.tempMax != null) {
    if (!v.tempControlled) reasons.push({ code: 'temp_control' });
    else {
      const lo = n(v.tempMinC);
      const hi = n(v.tempMaxC);
      if ((need.tempMin != null && lo != null && lo > need.tempMin) || (need.tempMax != null && hi != null && hi < need.tempMax)) reasons.push({ code: 'temp_range' });
    }
  }
  if (need.hazardous && !v.allowsHazardous) reasons.push({ code: 'hazardous' });
  const pct = (a, b) => (n(b) ? Math.round(((a || 0) / Number(b)) * 100) : null);
  return { ok: reasons.length === 0, reasons, util: { weight: pct(need.peakWeight, v.maxWeightKg), volume: pct(need.peakVolume, v.maxVolumeM3), pallets: pct(need.peakPallets, v.maxPallets) } };
}

/** Kendaraan aktif milik vendor yang cocok, urut dari yang paling pas (utilisasi berat tertinggi tapi ≤ 100%). */
export function fittingVehicles(vehicles, need) {
  return vehicles
    .filter((v) => v.active !== false)
    .map((v) => ({ vehicle: v, fit: vehicleFit(v, need) }))
    .filter((x) => x.fit.ok)
    .sort((a, b) => (b.fit.util.weight ?? -1) - (a.fit.util.weight ?? -1));
}
