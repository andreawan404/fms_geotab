// Urutan langkah eksekusi perjalanan (dipakai add-in, portal vendor, dan API). Murni.
// Satu truk melewati stop berurutan; tiap stop: tiba -> mulai muat/bongkar -> selesai & berangkat.

/** stops: [{type:'pickup'|'delivery'}] -> [{seq, type, stopIdx, stopType}] ; seq mulai 1. */
export function buildSteps(stops) {
  const steps = [{ seq: 1, type: 'trip_start', stopIdx: -1, stopType: '' }];
  stops.forEach((s, i) => {
    for (const type of ['arrive', 'service_start', 'depart']) steps.push({ seq: steps.length + 1, type, stopIdx: i, stopType: s.type });
  });
  return steps;
}

/** Kunci label: trip_start | arrive_pickup | service_start_delivery | ... */
export const stepKey = (st) => (st.type === 'trip_start' ? 'trip_start' : `${st.type}_${st.stopType}`);

export const totalSteps = (nStops) => 1 + 3 * nStops;

/** Posisi terakhir dari jumlah event: { done, stopIdx, type } atau null bila belum mulai. */
export function lastStep(nStops, count) {
  if (!count) return null;
  const steps = buildSteps(Array.from({ length: nStops }, () => ({ type: 'pickup' })));
  const st = steps[Math.min(count, steps.length) - 1];
  return { stopIdx: st.stopIdx, type: st.type, done: count >= steps.length };
}
