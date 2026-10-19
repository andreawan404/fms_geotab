// Pembantu tampilan DO: konversi waktu lokal <-> ISO, format angka, label error.
export const STATUS_CLS = { draft: 'gray', offered: 'blue', assigned: 'blue', running: 'amber', done: 'green', cancelled: 'red' };

/** ISO -> nilai <input type="datetime-local"> (waktu lokal). */
export function isoToLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function localToIso(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export const fmtNum = (v, d = 0) => (v == null || Number.isNaN(v) ? '-' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d }));

/** Teks error/peringatan dari { code, ...param } memakai kunci i18n ord.err.<code>. */
export function issueText(t, e) {
  return t(`ord.err.${e.code}`, { n: e.n, m: e.m, metric: e.metric ? t(`ord.metric.${e.metric}`) : '', field: e.field ? t(`ord.f.${e.field}`) : '' });
}
export function apiErrorText(t, e) {
  if (!e) return '';
  if (e.code === 'validation' && Array.isArray(e.details)) return e.details.map((d) => issueText(t, d)).join('; ');
  const k = `ord.api.${e.code}`;
  const msg = t(k);
  return msg === k ? e.message || e.code : msg;
}
