// Perkiraan biaya perjalanan: BBM (jarak / km per liter x harga) dan tol (km tol x tarif per km per golongan, atau diisi manual). Fungsi murni.

export const COST_DEFAULTS = { fuelPriceRp: 0, tollBaseRpPerKm: 1000, tollRatio: [1, 1.5, 1.5, 2, 2] };

/** Golongan tol bawaan dari jenis kendaraan (I-V). Dapat diganti per kendaraan. */
const CLASS_OF = { pickup: 1, blindvan: 1, cdd: 1, cde: 1, fuso: 1, reefer: 1, wingbox: 2, tronton: 2, tanker: 2, trailer: 3, container: 3, other: 1 };
export const tollClassOf = (vehicle) => {
  const c = Number(vehicle?.tollClass);
  if (c >= 1 && c <= 5) return c;
  return CLASS_OF[vehicle?.type] || 1;
};

export const tollRatePerKm = (cost, cls) => {
  const c = { ...COST_DEFAULTS, ...(cost || {}) };
  const ratio = Number(c.tollRatio?.[cls - 1]);
  return (Number(c.tollBaseRpPerKm) || 0) * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
};

/**
 * @param {{distanceM:number, tollM?:number|null, kmPerL?:number|null, tollClass?:number, tollOverrideRp?:number|null, cost?:object}} i
 * @returns {{distKm:number, fuelL:number|null, fuelRp:number|null, tollKm:number|null, tollRp:number|null, tollSource:'manual'|'route'|'unknown', totalRp:number|null, missing:string[]}}
 */
export function estimateCost({ distanceM, tollM = null, kmPerL = null, tollClass = 1, tollOverrideRp = null, cost } = {}) {
  const c = { ...COST_DEFAULTS, ...(cost || {}) };
  const distKm = (Number(distanceM) || 0) / 1000;
  const missing = [];
  const fuelL = Number(kmPerL) > 0 ? distKm / Number(kmPerL) : null;
  if (fuelL == null) missing.push('kmPerL');
  const price = Number(c.fuelPriceRp) || 0;
  if (!price) missing.push('fuelPrice');
  const fuelRp = fuelL != null && price ? Math.round(fuelL * price) : null;
  let tollRp = null; let tollSource = 'unknown'; let tollKm = tollM == null ? null : tollM / 1000;
  if (tollOverrideRp != null && tollOverrideRp !== '' && Number.isFinite(Number(tollOverrideRp))) { tollRp = Math.round(Number(tollOverrideRp)); tollSource = 'manual'; }
  else if (tollKm != null) { tollRp = Math.round(tollKm * tollRatePerKm(c, tollClass)); tollSource = 'route'; }
  else missing.push('toll');
  const parts = [fuelRp, tollRp].filter((x) => x != null);
  return { distKm, fuelL, fuelRp, tollKm, tollRp, tollSource, totalRp: parts.length ? parts.reduce((a, b) => a + b, 0) : null, missing };
}

export const fmtRp = (v) => (v == null ? '-' : `Rp ${Math.round(v).toLocaleString('id-ID')}`);
