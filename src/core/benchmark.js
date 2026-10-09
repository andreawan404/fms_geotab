// Benchmark fuel economy per kelompok (rute atau sopir) terhadap rata-rata armada pada rentang yang sama.
import { fuelEconomy } from './sensor.js';

/**
 * @param rows  [{ routeId, driverId, deviceId, distKm, fuelL|null, engineSec|null, deviations, compliance|null }]
 * @param keyOf fungsi kunci kelompok, mis. (r) => r.routeId
 * @param opts  { warnPct: selisih (%) dari rata-rata yang ditandai, minKm: jarak minimum agar ditandai }
 * @returns {{ fleet: object|null, groups: Array }} groups diurutkan dari paling hemat; tanpa data fuel di akhir
 */
export function benchmark(rows, keyOf, { warnPct = 15, minKm = 20 } = {}) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (k == null || k === '') continue;
    if (!map.has(k)) map.set(k, { key: k, runs: 0, distKm: 0, fuelDistKm: 0, fuelL: 0, fuelRuns: 0, engineSec: 0, hourRuns: 0, deviations: 0, compSum: 0, compN: 0 });
    const g = map.get(k);
    g.runs++;
    g.distKm += r.distKm || 0;
    g.deviations += r.deviations || 0;
    if (r.compliance != null) {
      g.compSum += r.compliance;
      g.compN++;
    }
    if (r.fuelL != null) {
      g.fuelL += r.fuelL;
      g.fuelDistKm += r.distKm || 0;
      g.fuelRuns++;
    }
    if (r.engineSec != null) {
      g.engineSec += r.engineSec;
      g.hourRuns++;
    }
  }
  let fuelL = 0;
  let fuelDistKm = 0;
  for (const g of map.values()) {
    fuelL += g.fuelL;
    fuelDistKm += g.fuelDistKm;
  }
  const fleet = fuelEconomy(fuelDistKm, fuelL);
  const groups = [...map.values()].map((g) => {
    const eco = g.fuelRuns ? fuelEconomy(g.fuelDistKm, g.fuelL) : null;
    const vsPct = eco && fleet ? (eco.kmPerL / fleet.kmPerL - 1) * 100 : null;
    let flag = '';
    if (vsPct != null && g.fuelDistKm >= minKm) flag = vsPct <= -warnPct ? 'low' : vsPct >= warnPct ? 'high' : '';
    return {
      key: g.key,
      runs: g.runs,
      distKm: g.distKm,
      fuelL: g.fuelRuns ? g.fuelL : null,
      engineSec: g.hourRuns ? g.engineSec : null,
      kmPerL: eco ? eco.kmPerL : null,
      lPer100km: eco ? eco.lPer100km : null,
      vsPct,
      flag,
      deviations: g.deviations,
      compliance: g.compN ? g.compSum / g.compN : null,
    };
  });
  groups.sort((a, b) => (b.kmPerL ?? -1) - (a.kmPerL ?? -1));
  return { fleet, groups };
}
