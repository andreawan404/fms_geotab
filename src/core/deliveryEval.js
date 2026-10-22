// Pembandingan status TMS customer vs bukti GPS untuk satu DO eksternal. Fungsi murni.

/**
 * @param {{status:string, linked:boolean, stops:{seq:number,type:string,name:string,windowEnd:string|null,arriveAt:string|null}[]}} o
 * @returns {{ stops:object[], arrived:number, total:number, measured:number, onTime:number, verdict:string }}
 * verdict: not_linked | in_progress | consistent | tms_done_no_gps | gps_done_tms_open | cancelled
 */
export function evalDelivery(o, { graceMin = 15 } = {}) {
  const stops = o.stops.map((s) => {
    const arr = s.arriveAt ? Date.parse(s.arriveAt) : null;
    const end = s.windowEnd ? Date.parse(s.windowEnd) : null;
    const measurable = s.type === 'delivery' && arr != null && end != null;
    const lateMin = measurable ? Math.max(0, Math.round((arr - end) / 60000)) : null;
    return { ...s, onTime: measurable ? lateMin <= graceMin : null, lateMin };
  });
  const arrived = stops.filter((s) => s.arriveAt).length;
  const measured = stops.filter((s) => s.onTime != null).length;
  const onTime = stops.filter((s) => s.onTime === true).length;
  const allArrived = stops.length > 0 && arrived === stops.length;
  let verdict;
  if (o.status === 'cancelled') verdict = 'cancelled';
  else if (!o.linked) verdict = 'not_linked';
  else if (o.status === 'done') verdict = allArrived ? 'consistent' : 'tms_done_no_gps';
  else verdict = allArrived ? 'gps_done_tms_open' : 'in_progress';
  return { stops, arrived, total: stops.length, measured, onTime, verdict };
}

/** BBM per DO dari jendela, jarak (km), liter, dan berat (kg) terkirim. */
export function fuelMetrics({ fuelL, distKm, kg }) {
  const ok = fuelL > 0 && distKm > 0;
  const tonKm = kg > 0 ? (kg / 1000) * distKm : null;
  return { fuelL: fuelL ?? null, distKm: distKm ?? null, kmPerL: ok ? distKm / fuelL : null, lPerTonKm: ok && tonKm ? fuelL / tonKm : null };
}
