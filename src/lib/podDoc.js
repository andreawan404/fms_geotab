// Dokumen POD siap cetak / simpan PDF (HTML mandiri). Semua teks dari data di-escape.
import qrcode from 'qrcode-generator';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wib = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'medium' }) + ' WIB' : '-');

export function qrDataUrl(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createDataURL(4, 2);
}

/** @param {object} pod hasil GET /api/pod, @param {string} base origin portal, @param {(k:string,v?:object)=>string} t */
export function buildPodHtml(pod, base, t) {
  const pk = pod.kind === 'pickup';
  const url = `${base}/portal.html#/v/${pod.verifyCode}`;
  const integ = { ok: ['#1f7a3d', t('pod.int.ok')], broken: ['#c62828', t('pod.int.broken')], purged: ['#8a6d00', t('pod.int.purged')] }[pod.integrity] || ['#555', pod.integrity];
  const rows = (pod.items || []).map((i) => `<tr><td>${esc(i.description)}</td><td class="n">${esc(i.sentQty)} ${esc(i.unit)}</td><td class="n${i.receivedQty !== i.sentQty ? ' d' : ''}">${esc(i.receivedQty)} ${esc(i.unit)}</td><td>${esc(i.reason || '')}</td></tr>`).join('');
  const photos = (pod.photoData || []).map((p) => `<img src="data:image/jpeg;base64,${p.b64}" alt="">`).join('');
  const sig = pod.signature ? `<img class="sig" src="data:image/png;base64,${pod.signature}" alt="">` : '';
  const am = (pod.amendmentList || []).map((a) => `<li><b>${esc(wib(a.at))}</b> · ${esc(a.by)}: ${esc(a.note)}</li>`).join('');
  const gps = pod.lat != null ? `${Number(pod.lat).toFixed(5)}, ${Number(pod.lng).toFixed(5)} (±${Math.round(pod.accuracyM || 0)} m)${pod.outside ? ` · ${esc(t('pod.outside', { m: Math.round(pod.distM || 0) }))}` : ''}` : '-';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${pk ? 'POP' : 'POD'} ${esc(pod.order.doNo)}</title><style>
body{font:13px Arial,sans-serif;color:#111;margin:18px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:16px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#f1f3f5}.n{text-align:right}.d{color:#c62828;font-weight:700}
.hd{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.kv{display:grid;grid-template-columns:150px 1fr;gap:3px 10px}.kv dt{color:#555}.kv dd{margin:0}
.photos img{width:48%;margin:1%;border:1px solid #ccc}.sig{height:110px;border:1px solid #ccc;background:#fff}.badge{display:inline-block;padding:2px 8px;border-radius:10px;color:#fff;font-weight:700}
.hash{font:11px monospace;word-break:break-all}@media print{body{margin:8mm}}</style></head><body>
<div class="hd"><div><h1>${esc(t(pk ? 'pod.docTitlePop' : 'pod.docTitle'))}</h1><div>${esc(pod.order.doNo)} · ${esc(pod.order.customer || '')}</div><div style="margin-top:6px"><span class="badge" style="background:${integ[0]}">${esc(integ[1])}</span></div></div>
<div style="text-align:center"><img src="${qrDataUrl(url)}" width="110" height="110" alt="QR"><div style="font-size:10px">${esc(t('pod.scan'))}</div></div></div>
<h2>${esc(t('pod.sec.delivery'))}</h2><dl class="kv"><dt>${esc(t('pod.stop'))}</dt><dd>${esc(pod.stopName)}</dd><dt>${esc(t('pod.vendor'))}</dt><dd>${esc(pod.order.vendorName || '-')}</dd><dt>${esc(t('pod.vehicle'))}</dt><dd>${esc(pod.order.plate || '-')} · ${esc(pod.order.driverName || '-')}</dd><dt>${esc(t('pod.submitted'))}</dt><dd>${esc(wib(pod.submittedAt))}</dd><dt>GPS</dt><dd>${gps}</dd></dl>
<h2>${esc(t(pk ? 'pod.sec.sender' : 'pod.sec.receiver'))}</h2><dl class="kv"><dt>${esc(t('pod.name'))}</dt><dd>${esc(pod.receiverName)}</dd><dt>${esc(t('pod.title2'))}</dt><dd>${esc(pod.receiverTitle || '-')}</dd><dt>${esc(t('pod.phone'))}</dt><dd>${esc(pod.receiverPhone || '-')}</dd><dt>${esc(t('pod.note'))}</dt><dd>${esc(pod.note || '-')}</dd></dl>
<h2>${esc(t('pod.sec.items'))}</h2><table><tr><th>${esc(t('pod.item'))}</th><th>${esc(t(pk ? 'pod.ordered' : 'pod.sent'))}</th><th>${esc(t(pk ? 'pod.loaded' : 'pod.received'))}</th><th>${esc(t('pod.reason'))}</th></tr>${rows}</table>
<h2>${esc(t(pk ? 'pod.sec.sigSender' : 'pod.sec.signature'))}</h2>${sig || '<div>-</div>'}
<h2>${esc(t('pod.sec.photos'))}</h2><div class="photos">${photos || `<div>${esc(t('pod.photosPurged'))}</div>`}</div>
${am ? `<h2>${esc(t('pod.sec.amend'))}</h2><ul>${am}</ul>` : ''}
<h2>${esc(t('pod.sec.verify'))}</h2><dl class="kv"><dt>${esc(t('pod.code'))}</dt><dd>${esc(pod.verifyCode)}</dd><dt>SHA-256</dt><dd class="hash">${esc(pod.hash)}</dd><dt>URL</dt><dd>${esc(url)}</dd></dl>
</body></html>`;
}
