// Laporan DO siap cetak A4 (HTML mandiri): muatan, rute (plot SVG tanpa peta), biaya, BBM, linimasa, kendala, POP/POD.
// Fungsi murni: semua data masuk lewat argumen, semua teks dari data di-escape.
import { qrDataUrl } from './podDoc.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wib = (iso, withDate = true) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', ...(withDate ? { day: '2-digit', month: 'short', year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\./g, ':');
};
const num = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? '-' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d }));
const rp = (v) => (v == null ? '-' : `Rp ${Math.round(v).toLocaleString('id-ID')}`);
const dur = (sec) => { const m = Math.max(0, Math.round((sec || 0) / 60)); const h = Math.floor(m / 60); return h ? `${h}j ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };

const niceStep = (km) => { const raw = km / 6; const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

const mercU = (lng) => (lng + 180) / 360;
const mercV = (lat) => { const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; };

/**
 * Plot jalur rute di atas peta (tile OSM, proyeksi Web Mercator). Tanpa tileUrl (atau tile gagal dimuat) yang tampil kotak koordinat.
 * @param {{path?:[number,number][], points:{lat:number,lng:number,type?:string}[], w?:number, h?:number, tileUrl?:string}} i
 * @returns {string} elemen <svg>
 */
export function routePlotSvg({ path, points, w = 700, h = 330, tileUrl = '' }) {
  const pts = (points || []).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  const line = (path || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const all = [...line.map((p) => ({ lat: p[0], lng: p[1] })), ...pts.map((p) => ({ lat: +p.lat, lng: +p.lng }))];
  if (!all.length) return '';
  const us = all.map((p) => mercU(p.lng)); const vs = all.map((p) => mercV(p.lat));
  let u0 = Math.min(...us); let u1 = Math.max(...us); let v0 = Math.min(...vs); let v1 = Math.max(...vs);
  const minSpan = 0.3 / 40075; // kira-kira 300 m, agar satu titik tidak membagi nol
  if (u1 - u0 < minSpan) { u0 -= minSpan / 2; u1 += minSpan / 2; }
  if (v1 - v0 < minSpan) { v0 -= minSpan / 2; v1 += minSpan / 2; }
  const pad = 22;
  const W = Math.min((w - 2 * pad) / (u1 - u0), (h - 2 * pad) / (v1 - v0)); // lebar dunia dalam px
  const ox = (w - (u1 - u0) * W) / 2 - u0 * W; const oy = (h - (v1 - v0) * W) / 2 - v0 * W;
  const X = (lng) => mercU(lng) * W + ox; const Y = (lat) => mercV(lat) * W + oy;
  const body = [];
  if (tileUrl) {
    const z = Math.max(1, Math.min(18, Math.ceil(Math.log2(Math.max(W, 256) / 256))));
    const n = 2 ** z; const ts = W / n;
    const tx0 = Math.max(0, Math.floor((0 - ox) / ts)); const tx1 = Math.min(n - 1, Math.floor((w - ox) / ts));
    const ty0 = Math.max(0, Math.floor((0 - oy) / ts)); const ty1 = Math.min(n - 1, Math.floor((h - oy) / ts));
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
      const url = tileUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{s}', 'a');
      body.push(`<image href="${esc(url)}" x="${(x * ts + ox).toFixed(1)}" y="${(y * ts + oy).toFixed(1)}" width="${(ts + 0.6).toFixed(1)}" height="${(ts + 0.6).toFixed(1)}"/>`);
    }
  } else {
    // kotak koordinat: garis grid tiap jarak "bulat" (km) dari pojok kiri-bawah area
    const kmPerU = 40075 * Math.cos((all[0].lat * Math.PI) / 180);
    const wKm = (u1 - u0) * kmPerU; const hKm = (v1 - v0) * kmPerU;
    const step = niceStep(Math.max(wKm, hKm));
    const gx = (u1 - u0 < 0) ? 0 : (w - (u1 - u0) * W) / 2; const gy = (h - (v1 - v0) * W) / 2;
    for (let k = 0; k * step <= wKm + 1e-9; k++) { const x = gx + k * step * (W / kmPerU); body.push(`<line x1="${x.toFixed(1)}" y1="${gy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(h - gy).toFixed(1)}" class="g"/><text x="${x.toFixed(1)}" y="${(h - gy + 10).toFixed(1)}" class="gt" text-anchor="middle">${num(k * step, step < 1 ? 1 : 0)}</text>`); }
    for (let k = 0; k * step <= hKm + 1e-9; k++) { const y = h - gy - k * step * (W / kmPerU); body.push(`<line x1="${gx.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(w - gx).toFixed(1)}" y2="${y.toFixed(1)}" class="g"/><text x="${(gx - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="gt" text-anchor="end">${num(k * step, step < 1 ? 1 : 0)}</text>`); }
    body.push(`<text x="${w - 4}" y="${h - 3}" class="gt" text-anchor="end">km</text>`);
  }
  const stride = Math.max(1, Math.ceil(line.length / 700));
  const sampled = line.filter((_, i) => i % stride === 0 || i === line.length - 1);
  const poly = sampled.length > 1 ? sampled.map((p) => `${X(p[1]).toFixed(1)},${Y(p[0]).toFixed(1)}`).join(' ') : '';
  const dots = pts.map((p, i) => {
    const x = X(+p.lng).toFixed(1); const y = Y(+p.lat).toFixed(1);
    return `<g><circle cx="${x}" cy="${y}" r="10" class="${p.type === 'pickup' ? 'mp' : 'md'}"/><text x="${x}" y="${(+y + 3.8).toFixed(1)}" class="mt" text-anchor="middle">${i + 1}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" class="plot"><style>.g{stroke:#d5d9de;stroke-width:.6}.gt{font:9px Arial;fill:#6b7280}.rt{fill:none;stroke:#1d4ed8;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.rh{fill:none;stroke:#fff;stroke-width:6;stroke-linejoin:round;stroke-linecap:round;opacity:.9}.mp{fill:#1d4ed8;stroke:#fff;stroke-width:2}.md{fill:#15803d;stroke:#fff;stroke-width:2}.mt{font:bold 11px Arial;fill:#fff}.at{font:8px Arial;fill:#333}</style>`
    + `<defs><clipPath id="c"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath></defs><rect x="0" y="0" width="${w}" height="${h}" fill="#eef1f4"/><g clip-path="url(#c)">${body.join('')}`
    + `${poly ? `<polyline points="${poly}" class="rh"/><polyline points="${poly}" class="rt"/>` : ''}${dots}</g>`
    + `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#9aa3ad"/>${tileUrl ? `<rect x="${w - 118}" y="${h - 13}" width="118" height="13" fill="#fff" opacity=".8"/><text x="${w - 4}" y="${h - 3}" class="at" text-anchor="end">© OpenStreetMap contributors</text>` : ''}</svg>`;
}

/** Ringkas titik tiba/mulai/selesai per stop dari event perjalanan (stopSeq 1-based). */
export function stopTimes(events, n) {
  const out = Array.from({ length: n }, () => ({ arrive: '', service: '', depart: '', outside: false }));
  for (const e of events || []) {
    const i = Number(e.stopSeq) - 1;
    if (!(i >= 0 && i < n)) continue;
    if (e.type === 'arrive') { out[i].arrive = e.at; out[i].outside = !!e.outside; }
    else if (e.type === 'service_start') out[i].service = e.at;
    else if (e.type === 'depart') out[i].depart = e.at;
  }
  return out;
}

const CSS = `@page{size:A4;margin:11mm 12mm}*{box-sizing:border-box}body{font:11px/1.35 Arial,Helvetica,sans-serif;color:#111;margin:0}
.page{page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}
.lh{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1d4ed8;padding-bottom:6px;margin-bottom:8px}.lh img{height:34px;display:block}.lh .co{font-weight:700;font-size:14px}.lh .sub{color:#555;font-size:10px}
h1{font-size:17px;margin:0}h2{font-size:12px;margin:10px 0 4px;padding-bottom:2px;border-bottom:1px solid #bbb}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #c4c9cf;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eef1f4;font-size:10px}tr{page-break-inside:avoid}
.n{text-align:right;white-space:nowrap}.kv{display:grid;grid-template-columns:105px 1fr 105px 1fr;gap:2px 8px}.kv dt{color:#555}.kv dd{margin:0}
.b{display:inline-block;padding:1px 7px;border-radius:9px;color:#fff;font-weight:700;font-size:10px}.muted{color:#666}.sm{font-size:10px}.late{color:#b91c1c;font-weight:700}
.tot td{font-weight:700;background:#f6f8fa}.plot{display:block;border:0;max-height:88mm}
.sev-high{color:#b91c1c;font-weight:700}.sev-medium{color:#b45309;font-weight:700}.sev-low{color:#555}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px}.sig div{text-align:center}.sig span{display:block;height:46px;border-bottom:1px solid #333;margin-bottom:3px}
.ph{display:grid;grid-template-columns:1fr 1fr;gap:6px}.ph img{width:100%;height:58mm;object-fit:contain;border:1px solid #cfd4d9;background:#f4f5f7;page-break-inside:avoid}
.sg{height:22mm;border:1px solid #cfd4d9;background:#fff}.hash{font:9px monospace;word-break:break-all}.foot{margin-top:6px;color:#777;font-size:9px}
`;

/**
 * @param {{order:object, route?:object, trip?:{events:object[]}, exceptions?:object[], pods?:object[], cost?:object, fuel?:object, eta?:object, base:string, logoUrl?:string, t:(k:string,v?:object)=>string, excText?:(e:object)=>string, genAt?:string, genBy?:string}} d
 */
export function buildOrderReportHtml(d) {
  const { order, route, trip, exceptions = [], pods = [], cost, fuel, base, t, logoUrl = '', excText = () => '' } = d;
  const stops = order.stops || [];
  const times = stopTimes(trip?.events, stops.length);
  const s = order.summary || {};
  const head = `<div class="lh"><div style="display:flex;align-items:center;gap:10px">${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ''}<div><div class="co">SMA-TRACK</div><div class="sub">${esc(t('ordrep.tagline'))}</div></div></div>`
    + `<div style="text-align:right"><h1>${esc(t('ordrep.title'))}</h1><div><b>${esc(order.doNo)}</b> · ${esc(order.customer || '')}</div></div></div>`;
  const kvs = [
    [t('ordrep.date'), order.orderDate || '-'], [t('ordrep.status'), t(`ord.status.${order.status}`)],
    [t('ordrep.vendor'), order.vendorName || '-'], [t('ordrep.vehicle'), `${order.plate || '-'}${order.driverName ? ` · ${order.driverName}` : ''}`],
    [t('ordrep.started'), wib(order.startedAt)], [t('ordrep.finished'), wib(order.finishedAt)],
  ];
  const info = `<dl class="kv">${kvs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

  const stopRows = stops.map((st, i) => {
    const tm = times[i];
    const items = (st.items || []).map((it) => `${esc(it.description)} <span class="muted">(${esc(num(it.qty, 2))} ${esc(it.unit || '')}${it.weightKg ? `, ${esc(num(it.weightKg, 1))} kg` : ''})</span>`).join('<br>') || '-';
    const lateArr = tm.arrive && st.windowEnd && Date.parse(tm.arrive) > Date.parse(st.windowEnd);
    return `<tr><td class="n">${i + 1}</td><td>${esc(t(st.type === 'pickup' ? 'ordrep.pickup' : 'ordrep.delivery'))}</td><td><b>${esc(st.name)}</b><br><span class="muted sm">${esc(st.address || '')}</span></td>`
      + `<td class="sm">${esc(wib(st.windowStart))}<br>${esc(wib(st.windowEnd))}</td><td class="sm${lateArr ? ' late' : ''}">${esc(wib(tm.arrive))}${tm.outside ? `<br>${esc(t('ordrep.outside'))}` : ''}<br>${esc(wib(tm.depart))}</td><td class="sm">${items}</td></tr>`;
  }).join('');
  const cargo = `<table><tr><th>#</th><th>${esc(t('ordrep.type'))}</th><th>${esc(t('ordrep.stop'))}</th><th>${esc(t('ordrep.window'))}</th><th>${esc(t('ordrep.actual'))}</th><th>${esc(t('ordrep.cargo'))}</th></tr>${stopRows}</table>`
    + `<div class="sm" style="margin-top:3px">${esc(t('ordrep.peak'))}: <b>${esc(num(s.peakWeight, 1))} kg</b> · <b>${esc(num(s.peakVolume, 2))} m³</b> · <b>${esc(num(s.peakPallets, 1))}</b> ${esc(t('ordrep.pallets'))}</div>`;

  const pts = route?.checkpoints?.length ? route.checkpoints.map((c, i) => ({ lat: c.lat, lng: c.lng, type: stops[i]?.type })) : stops.map((x) => ({ lat: x.lat, lng: x.lng, type: x.type }));
  const plot = routePlotSvg({ path: route?.path, points: pts, tileUrl: d.tileUrl || '' });
  const eta = d.eta;
  const etaTable = eta ? `<table style="margin-top:4px"><tr><th>#</th><th>${esc(t('ordrep.stop'))}</th><th class="n">${esc(t('ordrep.leg'))}</th><th class="n">${esc(t('ordrep.legTime'))}</th><th class="n">${esc(t('ordrep.cum'))}</th></tr>`
    + eta.rows.map((r) => `<tr><td class="n">${r.i + 1}</td><td>${esc(r.name)}</td><td class="n">${r.i === 0 ? '-' : `${esc(num(r.legM / 1000, 1))} km`}</td><td class="n">${r.i === 0 ? '-' : esc(dur(r.legS))}</td><td class="n">${r.i === 0 ? '-' : `+${esc(dur(r.offsetS))}`}</td></tr>`).join('')
    + `<tr class="tot"><td></td><td>${esc(t('ordrep.total'))}</td><td class="n">${esc(num(eta.totalM / 1000, 1))} km</td><td class="n" colspan="2">${esc(dur(eta.totalS))}${eta.approx ? ` · ${esc(t('ordrep.approx'))}` : ''}</td></tr></table>` : '';

  // biaya + BBM
  const estFuelL = cost?.fuelL; const act = fuel;
  const costRows = cost ? `<tr><td>${esc(t('ordrep.c.fuel'))}</td><td class="muted sm">${esc(num(estFuelL, 1))} L${cost.kmPerL ? ` @ ${esc(num(cost.kmPerL, 1))} km/L` : ''}${cost.fuelPriceRp ? ` × ${esc(rp(cost.fuelPriceRp))}` : ''}</td><td class="n">${esc(rp(cost.fuelRp))}</td></tr>`
    + `<tr><td>${esc(t('ordrep.c.toll'))}</td><td class="muted sm">${cost.tollSource === 'manual' ? esc(t('ordrep.c.manual')) : cost.tollKm != null ? `${esc(num(cost.tollKm, 1))} km, ${esc(t('ordrep.c.class', { n: cost.tollClass || 1 }))}` : esc(t('ordrep.c.tollUnknown'))}</td><td class="n">${esc(rp(cost.tollRp))}</td></tr>`
    + `<tr class="tot"><td>${esc(t('ordrep.total'))}</td><td class="muted sm">${esc(num(cost.distKm, 1))} km</td><td class="n">${esc(rp(cost.totalRp))}</td></tr>` : '';
  const costBlock = cost ? `<table>${costRows}</table><div class="sm muted" style="margin-top:3px">${esc(t('ordrep.c.note'))}${cost.at ? ` ${esc(wib(cost.at))}` : ''}</div>` : `<div class="muted">${esc(t('ordrep.c.none'))}</div>`;
  const fuelBlock = act && act.fuelL != null
    ? `<table><tr><th>${esc(t('ordrep.f.used'))}</th><th>${esc(t('ordrep.f.dist'))}</th><th>${esc(t('ordrep.f.eco'))}</th><th>${esc(t('ordrep.f.diff'))}</th></tr><tr><td class="n"><b>${esc(num(act.fuelL, 1))} L</b></td><td class="n">${esc(num(act.distKm, 1))} km</td><td class="n">${esc(num(act.kmPerL, 2))} km/L</td><td class="n">${estFuelL != null ? `${esc(num(act.fuelL - estFuelL, 1))} L` : '-'}</td></tr></table>`
      + `<div class="sm muted" style="margin-top:3px">${esc(t('ordrep.f.window'))}: ${esc(wib(act.fromMs ? new Date(act.fromMs).toISOString() : ''))} – ${esc(wib(act.toMs ? new Date(act.toMs).toISOString() : ''))}${act.approx ? ` · ${esc(t('ordrep.approx'))}` : ''}</div>`
    : `<div class="muted">${esc(t('ordrep.f.none'))}</div>`;

  const evRows = (trip?.events || []).map((e) => {
    const st = e.type === 'trip_start' ? '' : (stops[Number(e.stopSeq) - 1]?.type || '');
    const key = e.type === 'trip_start' ? 'trip_start' : `${e.type}_${st || 'delivery'}`;
    const nm = e.stopSeq ? stops[Number(e.stopSeq) - 1]?.name || '' : '';
    return `<tr><td class="sm">${esc(wib(e.at))}</td><td>${esc(t(`trip.step.${key}`))}${nm ? ` · ${esc(nm)}` : ''}</td><td class="sm muted">${e.outside ? esc(t('ordrep.outside')) : ''}${e.note ? ` ${esc(e.note)}` : ''}</td></tr>`;
  }).join('');
  const timeline = evRows ? `<table><tr><th>${esc(t('ordrep.time'))}</th><th>${esc(t('ordrep.event'))}</th><th>${esc(t('ordrep.note'))}</th></tr>${evRows}</table>` : `<div class="muted">${esc(t('ordrep.noEvents'))}</div>`;
  const exRows = exceptions.map((e) => `<tr><td class="sm">${esc(wib(e.createdAt))}</td><td class="sev-${esc(e.severity)}">${esc(t(`exc.kind.${e.kind}`))}</td><td class="sm">${esc(excText(e))}</td><td class="sm">${esc(t(`exc.state.${e.state}`))}${e.ackNote ? `: ${esc(e.ackNote)}` : ''}</td></tr>`).join('');
  const exTable = exRows ? `<table><tr><th>${esc(t('ordrep.time'))}</th><th>${esc(t('ordrep.issue'))}</th><th>${esc(t('ordrep.detail'))}</th><th>${esc(t('ordrep.handled'))}</th></tr>${exRows}</table>` : `<div class="muted">${esc(t('ordrep.noIssues'))}</div>`;

  const sign = `<div class="sig"><div><span></span>${esc(t('ordrep.madeBy'))}${d.genBy ? `<br><b>${esc(d.genBy)}</b>` : ''}</div><div><span></span>${esc(t('ordrep.approvedBy'))}</div></div><div class="foot">${esc(t('ordrep.printed'))}: ${esc(wib(d.genAt || new Date().toISOString()))} WIB · ${esc(order.doNo)}</div>`;

  const p1 = `<section class="page">${head}${info}<h2>${esc(t('ordrep.sec.cargo'))}</h2>${cargo}<h2>${esc(t('ordrep.sec.route'))}</h2>${plot}${etaTable}</section>`;
  const p2 = `<section class="page">${head}<h2>${esc(t('ordrep.sec.cost'))}</h2>${costBlock}<h2>${esc(t('ordrep.sec.fuel'))}</h2>${fuelBlock}<h2>${esc(t('ordrep.sec.timeline'))}</h2>${timeline}<h2>${esc(t('ordrep.sec.issues'))}</h2>${exTable}${sign}</section>`;
  const podPages = pods.map((p) => {
    const pk = p.kind === 'pickup';
    const url = `${base}/portal.html#/v/${p.verifyCode}`;
    const integ = { ok: ['#1f7a3d', t('pod.int.ok')], broken: ['#c62828', t('pod.int.broken')], purged: ['#8a6d00', t('pod.int.purged')] }[p.integrity] || ['#555', p.integrity];
    const rows = (p.items || []).map((i) => `<tr><td>${esc(i.description)}</td><td class="n">${esc(i.sentQty)} ${esc(i.unit)}</td><td class="n${i.receivedQty !== i.sentQty ? ' late' : ''}">${esc(i.receivedQty)} ${esc(i.unit)}</td><td class="sm">${esc(i.reason || '')}</td></tr>`).join('');
    const photos = (p.photoData || []).slice(0, 4).map((x) => `<img src="data:image/jpeg;base64,${x.b64}" alt="">`).join('');
    const sig = p.signature ? `<img class="sg" src="data:image/png;base64,${p.signature}" alt="">` : '-';
    const am = (p.amendmentList || []).map((a) => `<li>${esc(wib(a.at))} · ${esc(a.by)}: ${esc(a.note)}</li>`).join('');
    return `<section class="page">${head}<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><h2 style="border:0;margin:0;font-size:14px">${esc(t(pk ? 'pod.docTitlePop' : 'pod.docTitle'))} · ${esc(p.stopName)}</h2>`
      + `<span class="b" style="background:${integ[0]}">${esc(integ[1])}</span> <span class="sm muted">${esc(wib(p.submittedAt))} WIB</span></div><div style="text-align:center"><img src="${qrDataUrl(url)}" width="62" height="62" alt="QR"><div style="font-size:8px">${esc(p.verifyCode)}</div></div></div>`
      + `<dl class="kv" style="margin-top:6px"><dt>${esc(t(pk ? 'pod.sec.sender' : 'pod.sec.receiver'))}</dt><dd>${esc(p.receiverName)}${p.receiverTitle ? ` (${esc(p.receiverTitle)})` : ''}</dd><dt>${esc(t('pod.phone'))}</dt><dd>${esc(p.receiverPhone || '-')}</dd><dt>${esc(t('pod.note'))}</dt><dd style="grid-column:2/5">${esc(p.note || '-')}</dd></dl>`
      + `<table style="margin-top:6px"><tr><th>${esc(t('pod.item'))}</th><th>${esc(t(pk ? 'pod.ordered' : 'pod.sent'))}</th><th>${esc(t(pk ? 'pod.loaded' : 'pod.received'))}</th><th>${esc(t('pod.reason'))}</th></tr>${rows}</table>`
      + `<div style="margin-top:6px"><b class="sm">${esc(t(pk ? 'pod.sec.sigSender' : 'pod.sec.signature'))}</b><br>${sig}</div>`
      + `<h2>${esc(t('pod.sec.photos'))}</h2><div class="ph">${photos || `<div class="muted">${esc(t('pod.photosPurged'))}</div>`}</div>${am ? `<h2>${esc(t('pod.sec.amend'))}</h2><ul class="sm">${am}</ul>` : ''}<div class="hash" style="margin-top:6px">SHA-256 ${esc(p.hash)}</div></section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('ordrep.title'))} ${esc(order.doNo)}</title><style>${CSS}</style></head><body>${p1}${p2}${podPages}</body></html>`;
}
